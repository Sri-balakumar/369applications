from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging
import re

_logger = logging.getLogger(__name__)


class WhatsAppIntegration(models.Model):
    _name = 'whatsapp.integration'
    _description = 'WhatsApp Integration for Credit Management'

    name = fields.Char(string='Name', default='WhatsApp Credit Approval', required=True)
    is_active = fields.Boolean(string="Active", default=True)
    admin_phone = fields.Char(
        string="Admin Phone (Approval Recipient)",
        help="Phone number to receive credit approval requests. Include country code, no + sign. Example: 919944080209"
    )

    # ======================================================================
    # Get Admin Phone & Session
    # ======================================================================
    def _get_wa_session(self):
        """Get connected WhatsApp Neonize session."""
        session = self.env['whatsapp.session'].sudo().search([
            ('status', '=', 'connected')
        ], limit=1)
        if not session:
            raise UserError(_("No connected WhatsApp session found!\n\nPlease go to WhatsApp → Sessions and connect first."))
        return session

    def _get_admin_phone(self):
        """Get phone number for approval notifications.
        Uses the manually configured Admin Phone (Approval Recipient) field first."""
        self.ensure_one()

        # Priority 1: Manually configured admin phone on this record
        if self.admin_phone:
            return self._clean_phone(self.admin_phone)

        # Priority 2: Owner numbers from whatsapp.config
        config = self.env['whatsapp.config'].sudo().search([], limit=1)
        if config and config.owner_number_ids:
            first_owner = config.owner_number_ids[0]
            if first_owner.phone:
                return self._clean_phone(first_owner.phone)

        # Priority 3: Administrator user's phone
        admin_user = self.env.ref('base.user_admin', raise_if_not_found=False)
        if not admin_user:
            admin_user = self.env['res.users'].sudo().search([('login', '=', 'admin')], limit=1)

        if admin_user and admin_user.partner_id:
            for field_name in ['mobile', 'phone']:
                phone = getattr(admin_user.partner_id, field_name, None)
                if phone:
                    return self._clean_phone(phone)

        raise UserError(_(
            "Notification phone number not found!\n\n"
            "Please set the Admin Phone in:\n"
            "Sales → WhatsApp Integration → Admin Phone (Approval Recipient)\n\n"
            "Or set it in:\n"
            "WhatsApp → Configuration → Owner Numbers"
        ))

    @staticmethod
    def _clean_phone(phone):
        """Clean phone number - remove +, spaces, dashes."""
        if not phone:
            return ''
        for ch in ('+', ' ', '-', '(', ')'):
            phone = phone.replace(ch, '')
        return phone

    # ======================================================================
    # Send Methods
    # ======================================================================
    def send_credit_approval_request_with_buttons(self, order):
        """Send approval request via WhatsApp Neonize."""
        return self.send_credit_approval_request_with_poll(order)

    def send_credit_approval_request_with_poll(self, order):
        """Send approval request with reply instructions."""
        self.ensure_one()
        if not self.is_active:
            return {"ok": False, "error": "Integration not active"}

        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            _logger.error(f"Cannot send WhatsApp: {str(e)}")
            order.message_post(body=f"⚠️ WhatsApp failed: {str(e)}")
            return {"ok": False, "error": str(e)}

        exceed_amount = order.partner_id.total_due + order.amount_total - order.partner_id.custom_credit_limit
        order_date = order.date_order.strftime('%Y-%m-%d') if order.date_order else 'N/A'
        currency = order.currency_id.symbol or '$'

        approval_msg = f"""⚠️ *CREDIT APPROVAL REQUIRED*

📋 *Order: {order.name}*
👤 Customer: {order.partner_id.name}
💰 Amount: *{currency} {order.amount_total:,.2f}*
📅 Date: {order_date}

💳 *Credit Status:*
· Current Due: {currency} {order.partner_id.total_due:,.2f}
· Credit Limit: {currency} {order.partner_id.custom_credit_limit:,.2f}
· *Exceeds by: {currency} {exceed_amount:,.2f}*

━━━━━━━━━━━━━━━━━━━━
📱 *HOW TO REPLY:*

· *1-{order.name}* to APPROVE ✅
· *2-{order.name}* to REJECT ❌

━━━━━━━━━━━━━━━━━━━━"""

        _logger.info(f"Sending credit approval to: {admin_phone}")

        try:
            session.send_message(admin_phone, approval_msg)

            order.whatsapp_approval_sent = True
            order.message_post(
                body=f"✅ WhatsApp sent to: {admin_phone}<br/>"
                     f"📋 Order: {order.name}<br/>"
                     f"📱 Reply: 1-{order.name} (approve) / 2-{order.name} (reject)"
            )
            _logger.info(f"Approval request sent for {order.name}")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp send error: {e}")
            order.message_post(body=f"❌ WhatsApp error: {str(e)}")
            return {"ok": False, "error": str(e)}

    def send_credit_approved_notification(self, order):
        """Send approval notification via WhatsApp Neonize."""
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            _logger.error(f"Cannot send: {str(e)}")
            return {"ok": False, "error": str(e)}

        currency = order.currency_id.symbol or '$'
        approval_date = order.credit_approval_date.strftime('%Y-%m-%d') if order.credit_approval_date else 'N/A'

        msg = f"""✅ *ORDER APPROVED*

Order *{order.name}* approved!

📋 *Details:*
· Customer: {order.partner_id.name}
· Amount: {currency} {order.amount_total:,.2f}
· Approved by: Administrator
· Date: {approval_date}

✅ Order confirmed."""

        try:
            session.send_message(admin_phone, msg)
            order.message_post(body="✅ Approval confirmation sent via WhatsApp")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"Error: {e}")
            return {"ok": False, "error": str(e)}

    def send_credit_rejected_notification(self, order):
        """Send rejection notification via WhatsApp Neonize."""
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            _logger.error(f"Cannot send: {str(e)}")
            return {"ok": False, "error": str(e)}

        currency = order.currency_id.symbol or '$'
        rejection_date = order.credit_approval_date.strftime('%Y-%m-%d') if order.credit_approval_date else 'N/A'

        msg = f"""❌ *ORDER REJECTED*

Order *{order.name}* rejected!

📋 *Details:*
· Customer: {order.partner_id.name}
· Amount: {currency} {order.amount_total:,.2f}
· Rejected by: Administrator
· Date: {rejection_date}

❌ Order remains as quotation."""

        try:
            session.send_message(admin_phone, msg)
            order.message_post(body="✅ Rejection confirmation sent via WhatsApp")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"Error: {e}")
            return {"ok": False, "error": str(e)}

    # ======================================================================
    # CRON: Poll incoming WhatsApp messages for credit approval replies
    # ======================================================================
    @api.model
    def _cron_process_credit_replies(self):
        """
        Cron job that checks whatsapp.message for incoming 1-ORDER / 2-ORDER patterns.
        Runs every 30 seconds. No changes to whatsapp_neonize module needed.
        """
        # Find unprocessed incoming messages matching approval pattern
        messages = self.env['whatsapp.message'].sudo().search([
            ('direction', '=', 'incoming'),
            ('status', '=', 'received'),
            ('is_credit_processed', '=', False),
        ], order='create_date asc', limit=50)

        pattern = re.compile(r'^([12])-([A-Za-z0-9]+)$')

        # Pattern for credit facility: 3-CF00001 (approve) / 4-CF00001 (reject)
        cf_pattern = re.compile(r'^([34])-([A-Za-z0-9-]+)$')

        # Pattern for easy.sales: 5-{id} (approve) / 6-{id} (reject)
        es_pattern = re.compile(r'^([56])-([0-9]+)$')

        for msg in messages:
            body = (msg.message or '').strip()
            
            # ---- Check Credit Facility pattern first (3-CF / 4-CF) ----
            cf_match = cf_pattern.match(body)
            if cf_match:
                cf_action_code = cf_match.group(1)
                cf_ref = cf_match.group(2).upper()
                cf_action = "APPROVE" if cf_action_code == "3" else "REJECT"
                phone = msg.phone

                _logger.info("Credit facility reply detected: %s for %s from %s", cf_action, cf_ref, phone)

                try:
                    facility = self.env['credit.facility'].sudo().search([
                        ('name', '=ilike', cf_ref)
                    ], limit=1)

                    if not facility:
                        _logger.error("Credit facility not found: %s", cf_ref)
                        self._reply_to_phone(phone, f"Application not found: {cf_ref}")
                        msg.is_credit_processed = True
                        continue

                    if facility.state == 'approved':
                        self._reply_to_phone(phone, f"Application *{cf_ref}* was already approved.")
                        msg.is_credit_processed = True
                        continue

                    if facility.state == 'rejected':
                        self._reply_to_phone(phone, f"Application *{cf_ref}* was already rejected.")
                        msg.is_credit_processed = True
                        continue

                    currency = facility.currency_id.symbol or '$'

                    if cf_action == "APPROVE":
                        _logger.info("Approving credit facility: %s", cf_ref)
                        facility.sudo().action_approve()
                        msg.is_credit_processed = True
                        self.env.cr.commit()  # Commit NOW so UI updates immediately
                        self._reply_to_phone(
                            phone,
                            f"✅ *CREDIT FACILITY APPROVED*\n\n"
                            f"*{facility.name}*\n"
                            f"Customer: {facility.partner_id.name}\n"
                            f"Credit Limit: {currency} {facility.credit_limit:,.2f}\n\n"
                            f"Customer can now purchase on credit."
                        )
                    else:
                        _logger.info("Rejecting credit facility: %s", cf_ref)
                        facility.sudo().write({'rejection_reason': 'Rejected via WhatsApp'})
                        facility.sudo().action_reject()
                        msg.is_credit_processed = True
                        self.env.cr.commit()  # Commit NOW so UI updates immediately
                        self._reply_to_phone(
                            phone,
                            f"❌ *CREDIT FACILITY REJECTED*\n\n"
                            f"*{facility.name}*\n"
                            f"Customer: {facility.partner_id.name}\n"
                            f"Requested: {currency} {facility.credit_limit:,.2f}"
                        )

                except Exception as e:
                    _logger.error("Credit facility processing error for %s: %s", cf_ref, e, exc_info=True)
                    msg.is_credit_processed = True
                continue

            # ---- Check Easy Sales pattern (5-{id} / 6-{id}) ----
            es_match = es_pattern.match(body)
            if es_match:
                es_action_code = es_match.group(1)
                es_sale_id = int(es_match.group(2))
                es_action = "APPROVE" if es_action_code == "5" else "REJECT"
                phone = msg.phone

                _logger.info("Easy sale reply detected: %s for ID %s from %s", es_action, es_sale_id, phone)

                try:
                    sale = self.env['easy.sales'].sudo().browse(es_sale_id)

                    if not sale.exists():
                        _logger.error("Easy sale not found: ID %s", es_sale_id)
                        self._reply_to_phone(phone, f"❌ Easy sale not found: ID {es_sale_id}")
                        msg.is_credit_processed = True
                        continue

                    if sale.credit_approval_status == 'approved':
                        self._reply_to_phone(phone, f"ℹ️ Easy sale *{sale.name}* was already approved.")
                        msg.is_credit_processed = True
                        continue

                    if sale.credit_approval_status == 'rejected':
                        self._reply_to_phone(phone, f"ℹ️ Easy sale *{sale.name}* was already rejected.")
                        msg.is_credit_processed = True
                        continue

                    currency = sale.currency_id.symbol or '$'

                    if es_action == "APPROVE":
                        _logger.info("Approving easy sale ID: %s (%s)", es_sale_id, sale.name)
                        sale.sudo().action_approve_easy_sale_credit()
                        msg.is_credit_processed = True
                        self.env.cr.commit()  # Commit NOW so UI updates immediately
                        self._reply_to_phone(
                            phone,
                            f"✅ *EASY SALE APPROVED*\n\n"
                            f"Easy Sale *{sale.name}* approved!\n"
                            f"Customer: {sale.partner_id.name}\n"
                            f"Amount: {currency} {sale.amount_total:,.2f}\n\n"
                            f"Sale confirmed and processed."
                        )
                    else:
                        _logger.info("Rejecting easy sale ID: %s (%s)", es_sale_id, sale.name)
                        sale.sudo().action_reject_easy_sale_credit()
                        msg.is_credit_processed = True
                        self.env.cr.commit()  # Commit NOW so UI updates immediately
                        self._reply_to_phone(
                            phone,
                            f"❌ *EASY SALE REJECTED*\n\n"
                            f"Easy Sale *{sale.name}* rejected.\n"
                            f"Customer: {sale.partner_id.name}\n"
                            f"Amount: {currency} {sale.amount_total:,.2f}"
                        )

                except Exception as e:
                    _logger.error("Easy sale processing error for ID %s: %s", es_sale_id, e, exc_info=True)
                    msg.is_credit_processed = True
                continue

            # ---- Check Sale Order pattern (1-ORDER / 2-ORDER) ----
            match = pattern.match(body)

            if not match:
                # Not a credit reply — mark as processed to skip next time
                msg.is_credit_processed = True
                continue

            action_code = match.group(1)
            order_name = match.group(2).upper()
            action = "APPROVE" if action_code == "1" else "REJECT"
            phone = msg.phone

            _logger.info("📱 Credit reply detected: %s for %s from %s", action, order_name, phone)

            try:
                order = self.env['sale.order'].sudo().search([
                    ('name', '=ilike', order_name)
                ], limit=1)

                if not order:
                    _logger.error("❌ Order not found: %s", order_name)
                    self._reply_to_phone(phone, f"❌ Order not found: {order_name}")
                    msg.is_credit_processed = True
                    continue

                if order.credit_approval_status == 'approved':
                    self._reply_to_phone(phone, f"ℹ️ Order *{order_name}* was already approved.")
                    msg.is_credit_processed = True
                    continue

                if order.credit_approval_status == 'rejected':
                    self._reply_to_phone(phone, f"ℹ️ Order *{order_name}* was already rejected.")
                    msg.is_credit_processed = True
                    continue

                # Process
                currency = order.currency_id.symbol or '$'

                if action == "APPROVE":
                    _logger.info("✅ Approving order: %s", order_name)
                    order.sudo().action_approve_credit_override()
                    msg.is_credit_processed = True
                    self.env.cr.commit()  # Commit NOW so UI updates immediately
                    self._reply_to_phone(
                        phone,
                        f"✅ *ORDER APPROVED*\n\n"
                        f"Order *{order.name}* approved!\n"
                        f"Customer: {order.partner_id.name}\n"
                        f"Amount: {currency} {order.amount_total:,.2f}"
                    )
                else:
                    _logger.info("❌ Rejecting order: %s", order_name)
                    order.sudo().action_reject_credit_override()
                    msg.is_credit_processed = True
                    self.env.cr.commit()  # Commit NOW so UI updates immediately
                    self._reply_to_phone(
                        phone,
                        f"❌ *ORDER REJECTED*\n\n"
                        f"Order *{order.name}* rejected.\n"
                        f"Customer: {order.partner_id.name}\n"
                        f"Amount: {currency} {order.amount_total:,.2f}"
                    )

            except Exception as e:
                _logger.error("Credit processing error for %s: %s", order_name, e, exc_info=True)
                msg.is_credit_processed = True

    def _reply_to_phone(self, phone, message):
        """Send a reply message to a phone number."""
        try:
            session = self.env['whatsapp.session'].sudo().search([
                ('status', '=', 'connected')
            ], limit=1)
            if session:
                session.send_message(phone, message)
        except Exception as e:
            _logger.error("Reply failed to %s: %s", phone, e)

    # ======================================================================
    # EASY SALES - WhatsApp Approval
    # ======================================================================

    def send_easy_sale_credit_approval_request(self, sale):
        """Send WhatsApp approval request for an easy.sales record."""
        self.ensure_one()
        if not self.is_active:
            return {"ok": False, "error": "Integration not active"}

        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            _logger.error(f"Cannot send WhatsApp for easy sale: {str(e)}")
            sale.message_post(body=f"⚠️ WhatsApp failed: {str(e)}")
            return {"ok": False, "error": str(e)}

        partner = sale.partner_id
        # total_due already includes this draft easy.sale, so exceeds_by = total_due - credit_limit
        exceed_amount = max(0, (
            getattr(partner, 'total_due', 0)
            - getattr(partner, 'custom_credit_limit', 0)
        ))
        currency = sale.currency_id.symbol or '$'
        sale_date = sale.date.strftime('%Y-%m-%d') if sale.date else 'N/A'

        msg = f"""⚠️ *CREDIT APPROVAL REQUIRED*

📋 *Easy Sale: {sale.name}*
👤 Customer: {partner.name}
💰 Amount: *{currency} {sale.amount_total:,.2f}*
📅 Date: {sale_date}

💳 *Credit Status:*
· Current Due: {currency} {getattr(partner, 'total_due', 0):,.2f}
· Credit Limit: {currency} {getattr(partner, 'custom_credit_limit', 0):,.2f}
· *Exceeds by: {currency} {exceed_amount:,.2f}*

━━━━━━━━━━━━━━━━━━━━
📱 *HOW TO REPLY:*

· *5-{sale.id}* to APPROVE ✅
· *6-{sale.id}* to REJECT ❌

━━━━━━━━━━━━━━━━━━━━"""

        try:
            session.send_message(admin_phone, msg)
            sale.message_post(
                body=f"✅ WhatsApp sent to: {admin_phone}<br/>"
                     f"📋 Easy Sale: {sale.name}<br/>"
                     f"📱 Reply: 5-{sale.id} (approve) / 6-{sale.id} (reject)"
            )
            _logger.info(f"Easy sale approval WhatsApp sent for {sale.name} to {admin_phone}")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp send error for easy sale: {e}")
            sale.message_post(body=f"❌ WhatsApp error: {str(e)}")
            return {"ok": False, "error": str(e)}

    def send_easy_sale_credit_approved_notification(self, sale):
        """Send WhatsApp notification when easy sale credit is approved."""
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            return {"ok": False, "error": str(e)}

        currency = sale.currency_id.symbol or '$'
        approval_date = sale.credit_approval_date.strftime('%Y-%m-%d') if sale.credit_approval_date else 'N/A'

        msg = f"""✅ *EASY SALE APPROVED*

Easy Sale *{sale.name}* approved!

📋 *Details:*
· Customer: {sale.partner_id.name}
· Amount: {currency} {sale.amount_total:,.2f}
· Approved by: {sale.credit_approved_by.name or 'Administrator'}
· Date: {approval_date}

✅ Sale confirmed and processed."""

        try:
            session.send_message(admin_phone, msg)
            sale.message_post(body="✅ Approval confirmation sent via WhatsApp")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp error: {e}")
            return {"ok": False, "error": str(e)}

    def send_easy_sale_credit_rejected_notification(self, sale):
        """Send WhatsApp notification when easy sale credit is rejected."""
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            return {"ok": False, "error": str(e)}

        currency = sale.currency_id.symbol or '$'
        rejection_date = sale.credit_approval_date.strftime('%Y-%m-%d') if sale.credit_approval_date else 'N/A'

        msg = f"""❌ *EASY SALE REJECTED*

Easy Sale *{sale.name}* rejected!

📋 *Details:*
· Customer: {sale.partner_id.name}
· Amount: {currency} {sale.amount_total:,.2f}
· Rejected by: {sale.credit_approved_by.name or 'Administrator'}
· Date: {rejection_date}

❌ Sale remains in draft."""

        try:
            session.send_message(admin_phone, msg)
            sale.message_post(body="✅ Rejection notification sent via WhatsApp")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp error: {e}")
            return {"ok": False, "error": str(e)}

    # ======================================================================
    # CREDIT FACILITY - WhatsApp Approval
    # ======================================================================

    def send_credit_facility_approval_request(self, facility):
        """Send WhatsApp message to admin for credit facility application approval."""
        self.ensure_one()
        if not self.is_active:
            return {"ok": False, "error": "Integration not active"}

        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            _logger.error(f"Cannot send WhatsApp for credit facility: {str(e)}")
            facility.message_post(body=f"WhatsApp failed: {str(e)}")
            return {"ok": False, "error": str(e)}

        currency = facility.currency_id.symbol or '$'
        submit_date = facility.submission_date.strftime('%Y-%m-%d') if facility.submission_date else 'N/A'

        msg = f"""📋 *NEW CREDIT FACILITY APPLICATION*

📄 *Reference: {facility.name}*
👤 Customer: {facility.partner_id.name}
🏢 Company: {facility.company_name or 'N/A'}
💰 Requested Limit: *{currency} {facility.credit_limit:,.2f}*
📅 Submitted: {submit_date}

📑 *Details:*
· Trade License: {facility.trade_license_no or 'N/A'}
· License Expiry: {facility.license_expiry_date or 'N/A'}
· Phone: {facility.phone_number or 'N/A'}
· Email: {facility.email or 'N/A'}

━━━━━━━━━━━━━━━━━━━━
📱 *HOW TO REPLY:*

· *3-{facility.name}* to APPROVE ✅
· *4-{facility.name}* to REJECT ❌

━━━━━━━━━━━━━━━━━━━━"""

        try:
            session.send_message(admin_phone, msg)
            facility.message_post(
                body=f"WhatsApp approval request sent to: {admin_phone}<br/>"
                     f"Reply: 3-{facility.name} (approve) / 4-{facility.name} (reject)"
            )
            _logger.info(f"Credit facility WhatsApp sent for {facility.name} to {admin_phone}")
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp send error for credit facility: {e}")
            facility.message_post(body=f"WhatsApp error: {str(e)}")
            return {"ok": False, "error": str(e)}

    def send_credit_facility_approved_wa(self, facility):
        """Send WhatsApp notification when credit facility is approved."""
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            return {"ok": False, "error": str(e)}

        currency = facility.currency_id.symbol or '$'
        msg = f"""✅ *CREDIT FACILITY APPROVED*

📄 *{facility.name}*
👤 Customer: {facility.partner_id.name}
💰 Credit Limit: *{currency} {facility.credit_limit:,.2f}*
✅ Approved by: {facility.approved_by.name or 'Manager'}

Customer can now purchase on credit."""

        try:
            session.send_message(admin_phone, msg)
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp error: {e}")
            return {"ok": False, "error": str(e)}

    def send_credit_facility_rejected_wa(self, facility):
        """Send WhatsApp notification when credit facility is rejected."""
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            return {"ok": False, "error": str(e)}

        currency = facility.currency_id.symbol or '$'
        msg = f"""❌ *CREDIT FACILITY REJECTED*

📄 *{facility.name}*
👤 Customer: {facility.partner_id.name}
💰 Requested: {currency} {facility.credit_limit:,.2f}
❌ Rejected by: {facility.approved_by.name or 'Manager'}
📝 Reason: {facility.rejection_reason or 'No reason provided'}"""

        try:
            session.send_message(admin_phone, msg)
            return {"ok": True}
        except Exception as e:
            _logger.exception(f"WhatsApp error: {e}")
            return {"ok": False, "error": str(e)}

    # ======================================================================
    # UI Actions
    # ======================================================================
    def test_connection(self):
        """Test WhatsApp connection and send a real test message to admin phone."""
        self.ensure_one()
        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except Exception as e:
            raise UserError(_("Test failed: %s") % str(e))

        # Send an actual test message to confirm delivery
        test_msg = (
            "✅ *WhatsApp Test Message*\n\n"
            "This is a test from your Odoo Credit Management System.\n"
            "If you receive this, WhatsApp notifications are working correctly.\n\n"
            f"📞 Sent to: {admin_phone}\n"
            f"📱 Session: {session.name}"
        )
        try:
            session.send_message(admin_phone, test_msg)
            msg_status = f"Test message sent to *{admin_phone}* — check WhatsApp now."
        except Exception as e:
            msg_status = f"Connected but send failed: {e}"

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Connection Test'),
                'message': f'Session: {session.name} | Admin Phone: {admin_phone}\n{msg_status}',
                'type': 'success',
                'sticky': True,
            }
        }

    def action_test_approval_link(self):
        """Test sending approval message."""
        self.ensure_one()
        if not self.is_active:
            raise UserError(_("Integration not active"))

        try:
            session = self._get_wa_session()
            admin_phone = self._get_admin_phone()
        except UserError as e:
            raise UserError(_("Cannot send: %s") % str(e))

        test_msg = f"""🧪 *TEST: Credit Approval*

*Order: TEST001*
Test approval request.

━━━━━━━━━━━━━━━━━━━━
· Reply *1-TEST001* to APPROVE ✅
· Reply *2-TEST001* to REJECT ❌
━━━━━━━━━━━━━━━━━━━━

⚠️ TEST001 doesn't exist - testing only."""

        try:
            session.send_message(admin_phone, test_msg)
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Test Sent'),
                    'message': f'Test sent to {admin_phone}',
                    'type': 'success',
                    'sticky': True,
                }
            }
        except Exception as e:
            raise UserError(_("Test failed: %s") % str(e))
