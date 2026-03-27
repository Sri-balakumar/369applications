from odoo import models, fields, api
from odoo.exceptions import UserError, ValidationError
import requests
import logging
import re
import base64

_logger = logging.getLogger(__name__)

HTTP_TIMEOUT = 30
PHONE_E164_RE = re.compile(r"^\+?\d{8,15}$")

def _strip_non_digits(s):
    return re.sub(r"[^\d+]", "", s or "")

class WaQrConfig(models.Model):
    _name = "wa.qr.config"
    _description = "WhatsApp QR Configuration"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(default="WhatsApp Connection", readonly=True, tracking=True)
    service_url = fields.Char(
        string="Service URL",
        required=True,
        default="http://localhost:4001",
        tracking=True,
        help="Base URL of your Node.js WA service",
    )
    secret_key = fields.Char(
        string="Webhook Secret",
        required=True,
        default="change-me",
        tracking=True,
        help="Must match ODOO_WEBHOOK_SECRET in your Node service",
    )

    ready = fields.Boolean(string="Ready", readonly=True, tracking=True)
    has_qr = fields.Boolean(string="Has QR", readonly=True, tracking=True)

    to_number = fields.Char(string="To (E.164)", help="e.g. +919876543210")
    message_text = fields.Text(string="Message")
    last_send_result = fields.Text(string="Last Send Result", readonly=True)

    qr_image = fields.Binary(string="QR Code", readonly=True)
    
    # Override phone number (optional)
    admin_override_phone = fields.Char(
        string="Admin Phone Override",
        help="Leave empty to use Administrator's phone. Set to override with a different number."
    )

    # ======================================================================
    # Get Admin Phone Number
    # ======================================================================
    def get_admin_phone(self):
        """
        Get the administrator's phone number for notifications.
        Priority:
        1. Use admin_override_phone if set
        2. Use Administrator user's phone/mobile
        3. Raise error if not found
        """
        self.ensure_one()
        
        # If override is set, use it
        if self.admin_override_phone:
            _logger.info(f"Using override admin phone: {self.admin_override_phone}")
            return self.admin_override_phone
        
        # Find administrator user
        admin_user = self.env.ref('base.user_admin', raise_if_not_found=False)
        
        if not admin_user:
            # Fallback: search for admin
            admin_user = self.env['res.users'].sudo().search([
                ('login', '=', 'admin')
            ], limit=1)
        
        if not admin_user:
            raise UserError(
                "Administrator user not found. Please either:\n"
                "1. Set 'Admin Phone Override' in WhatsApp Configuration, or\n"
                "2. Ensure admin user exists in the system."
            )
        
        # Try different field names for phone
        phone = None
        partner = admin_user.partner_id
        
        # Try common phone field names in order
        phone_fields = ['mobile', 'phone', 'mobile_phone', 'x_mobile', 'x_phone']
        
        for field_name in phone_fields:
            if hasattr(partner, field_name):
                phone = getattr(partner, field_name, None)
                if phone:
                    _logger.info(f"Found admin phone in field '{field_name}': {phone}")
                    break
        
        if not phone:
            raise UserError(
                "Administrator phone number not found!\n\n"
                "Please either:\n"
                "1. Set phone in Administrator profile (Settings → Users → Administrator → Contact Info)\n"
                "2. Or set 'Admin Phone Override' in WhatsApp Configuration\n\n"
                f"Available fields tried: {', '.join(phone_fields)}"
            )
        
        # Format phone
        phone = phone.strip()
        if not phone.startswith('+'):
            _logger.warning(f"Phone {phone} doesn't start with +. Consider E.164 format.")
        
        _logger.info(f"Using Administrator's phone: {phone}")
        return phone

    # ======================================================================
    # Core Methods
    # ======================================================================

    def _service(self, path):
        self.ensure_one()
        if not self.service_url:
            raise UserError("Service URL is not set.")
        return f"{self.service_url.rstrip('/')}{path}"

    def _sanitize_and_check_phone(self, phone_raw):
        phone = _strip_non_digits(phone_raw)
        if phone and phone[0] != "+" and len(phone) >= 8:
            phone = "+" + phone
        if not phone or not PHONE_E164_RE.match(phone):
            raise ValidationError("Please enter valid E.164 phone format (e.g. +919876543210).")
        return phone

    def send_via_service(
        self, phone_e164, text,
        attachment_data=None, attachment_name=None,
        poll=None,
        timeout=HTTP_TIMEOUT
    ):
        """
        🔥 FIXED: Send WhatsApp message via Node server.
        Supports:
        - Text messages
        - PDF attachment
        - Interactive Buttons (for business accounts)
        - Polls (for all accounts)
        """
        self.ensure_one()

        _logger.info("=" * 60)
        _logger.info("📤 SEND_VIA_SERVICE CALLED")
        _logger.info("=" * 60)
        _logger.info(f"   To: {phone_e164}")
        _logger.info(f"   Text: {text[:50] if isinstance(text, str) else 'N/A'}...")
        _logger.info(f"   Has Poll: {poll is not None}")
        _logger.info(f"   Ready: {self.ready}")

        if not self.ready:
            return {"ok": False, "error": "WhatsApp service is not ready"}

        phone = self._sanitize_and_check_phone(phone_e164)

        # Build payload
        payload = {"to": phone}

        # ======================================================
        # 🔥 FIXED: POLL SUPPORT
        # ======================================================
        if poll:
            _logger.info("📊 Adding poll to payload")
            _logger.info(f"📊 Poll data: {poll}")
            payload["poll"] = poll
        
        # ======================================================
        # BUTTON SUPPORT (Business accounts only)
        # ======================================================
        elif isinstance(text, dict) and text.get("buttons"):
            _logger.info("🔘 Adding interactive buttons to payload")
            payload["text"] = text.get("text", "")
            payload["buttons"] = text.get("buttons")
        
        # ======================================================
        # PLAIN TEXT
        # ======================================================
        else:
            payload["text"] = text if isinstance(text, str) else text.get("text", "") if isinstance(text, dict) else ""

        # ======================================================
        # PDF ATTACHMENT
        # ======================================================
        if attachment_data:
            _logger.info("📄 Adding PDF attachment to payload")
            if isinstance(attachment_data, bytes):
                attachment_data = base64.b64encode(attachment_data).decode("utf-8")

            payload["attachment_data"] = attachment_data
            payload["attachment_name"] = attachment_name or "document.pdf"

        # SEND TO NODE.JS
        try:
            url_send = self._service("/send")
            _logger.info(f"📤 Sending to: {url_send}")
            _logger.info(f"📤 Payload keys: {list(payload.keys())}")
            
            response = requests.post(url_send, json=payload, timeout=timeout)

            try:
                data = response.json()
                _logger.info(f"📨 Response: {data}")
            except Exception:
                return {"ok": False, "error": "Invalid JSON from service"}

            return data

        except Exception as e:
            _logger.error(f"❌ WhatsApp Send Error: {e}")
            return {"ok": False, "error": str(e)}


    # ======================================================================
    # ACTIONS
    # ======================================================================

    def action_refresh_status(self):
        """Refresh status and fetch QR."""
        for rec in self:
            try:
                _logger.info("🔄 Refreshing WhatsApp status...")
                response = requests.get(rec._service("/status"), timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    rec.ready = data.get('ready', False)
                    rec.has_qr = data.get('has_qr', False)
                    
                    _logger.info(f"✅ Status: Ready={rec.ready}, Has QR={rec.has_qr}")
                    
                    # Fetch QR if available
                    if rec.has_qr:
                        try:
                            qr_response = requests.get(rec._service("/qr.png"), timeout=10)
                            if qr_response.status_code == 200:
                                rec.qr_image = base64.b64encode(qr_response.content)
                                _logger.info("✅ QR code fetched successfully")
                        except Exception as qr_error:
                            _logger.error(f"❌ QR fetch error: {qr_error}")
                    
                    # Show admin phone in status
                    try:
                        admin_phone = rec.get_admin_phone()
                        phone_status = f"\n📱 Admin notifications: {admin_phone}"
                    except UserError as e:
                        phone_status = f"\n⚠️ Admin phone issue: {str(e)}"
                    
                    status_msg = f"✅ Status updated: Ready={rec.ready}, Has QR={rec.has_qr}{phone_status}"
                    rec.message_post(body=status_msg)
                else:
                    rec.ready = False
                    rec.has_qr = False
                    error_msg = f"❌ Status check failed: HTTP {response.status_code}"
                    _logger.error(error_msg)
                    rec.message_post(body=error_msg)

            except requests.exceptions.ConnectionError:
                rec.ready = False
                rec.has_qr = False
                error_msg = "❌ Cannot connect to WhatsApp service"
                _logger.error(error_msg)
                rec.message_post(body=error_msg)
            except Exception as e:
                rec.ready = False
                rec.has_qr = False
                error_msg = f"❌ Status error: {e}"
                _logger.error(error_msg)
                rec.message_post(body=error_msg)

        return True

    def action_view_qr(self):
        """View QR in Odoo form"""
        self.ensure_one()
        # Refresh status to get latest QR code
        self.action_refresh_status()
        # Stay on the same form view
        return {
            'type': 'ir.actions.act_window',
            'res_model': self._name,
            'view_mode': 'form',
            'res_id': self.id,
            'target': 'current',
        }

    def action_send_message(self):
        """Manual test send."""
        for rec in self:
            if not rec.to_number or not rec.message_text:
                raise UserError("Please fill 'To' and 'Message' fields.")

            if not rec.ready:
                raise UserError("WhatsApp service is not ready. Please check status first.")

            try:
                _logger.info("🧪 Manual send test...")
                send_res = rec.send_via_service(rec.to_number, rec.message_text)
                if send_res.get("ok"):
                    rec.last_send_result = "✅ Message sent successfully."
                    rec.message_post(body="✅ Test message sent successfully")
                    _logger.info("✅ Manual test passed")
                else:
                    error_msg = f"❌ Failed: {send_res.get('error')}"
                    rec.last_send_result = error_msg
                    rec.message_post(body=error_msg)
                    _logger.error(f"❌ Manual test failed: {error_msg}")
            except Exception as e:
                error_msg = f"❌ Exception: {e}"
                rec.last_send_result = error_msg
                _logger.error(error_msg)
                raise UserError(f"Send failed: {e}")

        return True

    def action_test_poll_send(self):
        """🔥 FIXED: Test poll sending functionality"""
        for rec in self:
            if not rec.to_number:
                raise UserError("Please fill 'To' field.")
            
            if not rec.ready:
                raise UserError("WhatsApp service is not ready. Please check status first.")

            try:
                _logger.info("🧪 Testing poll send...")
                
                # Create test poll
                test_poll = {
                    "name": "Test Credit Approval",
                    "options": [
                        "✅ APPROVE_TEST123",
                        "❌ REJECT_TEST123"
                    ],
                    "selectableCount": 1
                }
                
                # 🔥 FIX: Pass poll as separate parameter
                send_res = rec.send_via_service(
                    phone_e164=rec.to_number,
                    text="",  # Empty text
                    poll=test_poll  # Poll as separate parameter
                )
                
                if send_res.get("ok"):
                    rec.last_send_result = "✅ Test poll sent successfully!"
                    rec.message_post(body="✅ Test poll sent successfully")
                    _logger.info("✅ Poll test passed")
                else:
                    error_msg = send_res.get("error", "Unknown error")
                    rec.last_send_result = f"❌ Test failed: {error_msg}"
                    rec.message_post(body=f"❌ Test poll failed: {error_msg}")
                    _logger.error(f"❌ Poll test failed: {error_msg}")
                    
            except Exception as e:
                error_msg = f"❌ Test error: {str(e)}"
                rec.last_send_result = error_msg
                rec.message_post(body=error_msg)
                _logger.error(error_msg)

    def action_test_pdf_send(self):
        """Test PDF sending functionality"""
        for rec in self:
            if not rec.to_number:
                raise UserError("Please fill 'To' field.")
            
            if not rec.ready:
                raise UserError("WhatsApp service is not ready. Please check status first.")

            try:
                _logger.info("🧪 Testing PDF send...")
                pdf_content = rec._create_test_pdf()
                pdf_base64 = base64.b64encode(pdf_content).decode("utf-8")
                
                _logger.info(f"✅ Test PDF created: {len(pdf_content)} bytes, {len(pdf_base64)} base64 chars")
                
                test_message = "🧪 TEST: PDF Document\n\nThis is a test PDF file."
                
                send_res = rec.send_via_service(
                    rec.to_number,
                    test_message,
                    attachment_data=pdf_base64,
                    attachment_name="Test_Document.pdf"
                )
                
                if send_res.get("ok"):
                    rec.last_send_result = "✅ Test PDF sent successfully!"
                    rec.message_post(body="✅ Test PDF sent successfully")
                    _logger.info("✅ PDF test passed")
                else:
                    error_msg = send_res.get("error", "Unknown error")
                    rec.last_send_result = f"❌ Test failed: {error_msg}"
                    rec.message_post(body=f"❌ Test PDF failed: {error_msg}")
                    _logger.error(f"❌ PDF test failed: {error_msg}")
                    
            except Exception as e:
                error_msg = f"❌ Test error: {str(e)}"
                rec.last_send_result = error_msg
                rec.message_post(body=error_msg)
                _logger.error(error_msg)

    def _create_test_pdf(self):
        """Create a simple test PDF"""
        try:
            # Simple PDF content
            pdf_content = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (Test PDF from Odoo) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000239 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n295\n%%EOF"
            return pdf_content
        except Exception as e:
            _logger.error(f"Error creating test PDF: {e}")
            return b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\nxref\ntrailer\n<<>>\nstartxref\n%%EOF"

    def action_check_health(self):
        """Check service health"""
        for rec in self:
            try:
                _logger.info("❤️ Checking service health...")
                response = requests.get(rec._service("/health"), timeout=10)
                if response.status_code == 200:
                    health_data = response.json()
                    health_msg = f"✅ Service Health: {health_data}"
                    rec.message_post(body=health_msg)
                    _logger.info(health_msg)
                else:
                    error_msg = f"❌ Health check failed: HTTP {response.status_code}"
                    rec.message_post(body=error_msg)
                    _logger.error(error_msg)
            except Exception as e:
                error_msg = f"❌ Health check error: {e}"
                rec.message_post(body=error_msg)
                _logger.error(error_msg)