from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
import logging
import uuid
from datetime import datetime

_logger = logging.getLogger(__name__)


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    # =========================================================
    # CREDIT MANAGEMENT FIELDS
    # =========================================================

    credit_limit_exceeded = fields.Boolean(
        string='Credit Limit Exceeded',
        compute='_compute_credit_limit_exceeded',
        store=False,
    )

    credit_approval_status = fields.Selection([
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ], string='Credit Approval Status', tracking=True)

    credit_approved_by = fields.Many2one(
        'res.users',
        string='Approved By',
        readonly=True,
    )

    credit_approval_date = fields.Datetime(
        string='Approval Date',
        readonly=True,
    )

    customer_credit_limit = fields.Monetary(
        string='Customer Credit Limit',
        related='partner_id.custom_credit_limit',
        readonly=True,
    )

    customer_total_due = fields.Monetary(
        string='Customer Total Due',
        related='partner_id.total_due',
        readonly=True,
    )

    customer_available_credit = fields.Monetary(
        string='Customer Available Credit',
        related='partner_id.available_credit',
        readonly=True,
    )

    customer_risk_score = fields.Float(
        string='Customer Risk Score',
        related='partner_id.risk_score',
        readonly=True,
        digits=(5, 2),
    )

    customer_risk_level = fields.Selection([
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ], string='Customer Risk Level', related='partner_id.risk_level', readonly=True)

    customer_on_credit_hold = fields.Boolean(
        string='Customer On Hold',
        related='partner_id.is_credit_hold',
        readonly=True,
    )

    # =========================================================
    # WHATSAPP FIELDS
    # =========================================================

    whatsapp_approval_token = fields.Char(string='WhatsApp Approval Token', index=True)
    whatsapp_approval_sent = fields.Boolean(string='WhatsApp Approval Sent', default=False)
    whatsapp_message_id = fields.Char(string='WA Message ID', index=True)

    # =========================================================
    # EMAIL FIELDS
    # =========================================================

    email_approval_token = fields.Char(string='Email Approval Token', index=True)
    email_notification_sent = fields.Boolean(string='Email Notification Sent', default=False)

    # =========================================================
    # TOKEN GENERATION
    # =========================================================

    def generate_whatsapp_token(self):
        """Generate or reuse WhatsApp approval token."""
        self.ensure_one()
        if not self.whatsapp_approval_token:
            token = f"SO{self.id}_{uuid.uuid4().hex[:8].upper()}"
            self.whatsapp_approval_token = token
            _logger.info(f"Generated new WhatsApp token for {self.name}: {token}")
        return self.whatsapp_approval_token

    def generate_email_token(self):
        """Generate or reuse Email approval token."""
        self.ensure_one()
        if not self.email_approval_token:
            token = f"EMAIL{self.id}_{uuid.uuid4().hex[:12].upper()}"
            self.email_approval_token = token
            _logger.info(f"Generated new Email token for {self.name}: {token}")
        return self.email_approval_token

    # =========================================================
    # ADMIN EMAIL HELPER
    # =========================================================

    def _get_admin_email(self):
        """Get email for credit approval notifications.
        Finds the Odoo user whose phone matches the connected WhatsApp session (QR-scanned phone)."""

        # Priority 1: Find Odoo user whose phone matches the connected WA session
        try:
            session = self.env['whatsapp.session'].sudo().search([
                ('status', '=', 'connected'),
                ('phone_number', '!=', False),
            ], limit=1)
            if session and session.phone_number:
                phone_last10 = session.phone_number[-10:]
                user = self.env['res.users'].sudo().search([
                    '|',
                    ('mobile', 'ilike', phone_last10),
                    ('phone', 'ilike', phone_last10),
                ], limit=1)
                if user and user.email:
                    return user.email
        except Exception as e:
            _logger.warning(f"Could not get email from WA session: {e}")

        # Priority 2: Manually configured admin email
        admin_email = self.env['ir.config_parameter'].sudo().get_param('credit_management.admin_email')
        if admin_email:
            return admin_email

        # Priority 3: Administrator user
        admin_user = self.env.ref('base.user_admin', raise_if_not_found=False)
        if admin_user and admin_user.email:
            return admin_user.email

        if self.env.user and self.env.user.email:
            return self.env.user.email

        return None

    # =========================================================
    # EMAIL NOTIFICATION METHODS
    # =========================================================

    def _format_local_dt(self, dt):
        """Convert UTC datetime to company timezone for email display."""
        if not dt:
            return 'N/A'
        import pytz
        tz_name = self.env.company.partner_id.tz or self.env.user.tz or 'UTC'
        tz = pytz.timezone(tz_name)
        local_dt = dt.replace(tzinfo=pytz.UTC).astimezone(tz)
        return local_dt.strftime('%Y-%m-%d %H:%M')

    def _get_base_url(self):
        """Get the base URL for email approval links."""
        base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
        if not base_url:
            base_url = 'http://localhost:8069'
        return base_url.rstrip('/')

    def _send_credit_approval_request_email(self):
        """Send credit approval notification email using the mail template (renders proper HTML buttons)."""
        self.ensure_one()

        admin_email = self._get_admin_email()
        if not admin_email:
            _logger.warning(f"No admin email configured for credit approval: {self.name}")
            return False

        self.sudo().write({'email_notification_sent': True})

        try:
            template = self.env.ref(
                'credit_management_system.mail_template_credit_approval_request',
                raise_if_not_found=False,
            )
            if template:
                template.send_mail(
                    self.id,
                    force_send=True,
                    email_values={'email_to': admin_email},
                )
                _logger.info(f"Credit approval email sent for {self.name} to {admin_email}")
                self.message_post(body=f"📧 Credit approval email with Approve/Reject buttons sent to {admin_email}")
                return True
            else:
                _logger.warning("mail_template_credit_approval_request not found")
                return False
        except Exception as e:
            _logger.exception(f"Failed to send credit approval email: {e}")
            return False

    def _get_salesperson_email(self):
        """Get the salesperson's email for approval result notifications."""
        self.ensure_one()
        # Primary: order's assigned salesperson
        if self.user_id and self.user_id.email:
            return self.user_id.email
        # Fallback: current user
        if self.env.user and self.env.user.email:
            return self.env.user.email
        # Last resort: admin
        return self._get_admin_email()

    def _send_credit_approved_email(self):
        """Send 'order approved' notification to the salesperson."""
        self.ensure_one()

        salesperson_email = self._get_salesperson_email()
        if not salesperson_email:
            return False

        try:
            template = self.env.ref(
                'credit_management_system.mail_template_credit_approved',
                raise_if_not_found=False,
            )
            if template:
                template.send_mail(
                    self.id,
                    force_send=True,
                    email_values={'email_to': salesperson_email},
                )
                _logger.info(f"Credit approved email sent for {self.name} to salesperson {salesperson_email}")
                return True
            return False
        except Exception as e:
            _logger.exception(f"Failed to send credit approved email: {e}")
            return False

    def _send_credit_rejected_email(self):
        """Send 'order rejected' notification to the salesperson."""
        self.ensure_one()

        salesperson_email = self._get_salesperson_email()
        if not salesperson_email:
            return False

        try:
            template = self.env.ref(
                'credit_management_system.mail_template_credit_rejected',
                raise_if_not_found=False,
            )
            if template:
                template.send_mail(
                    self.id,
                    force_send=True,
                    email_values={'email_to': salesperson_email},
                )
                _logger.info(f"Credit rejected email sent for {self.name} to salesperson {salesperson_email}")
                return True
            return False
        except Exception as e:
            _logger.exception(f"Failed to send credit rejected email: {e}")
            return False

    # =========================================================
    # CREDIT COMPUTE & VALIDATION
    # =========================================================

    @api.depends('partner_id', 'partner_id.custom_credit_limit', 'partner_id.total_due', 'amount_total', 'state')
    def _compute_credit_limit_exceeded(self):
        """
        Credit limit exceeded check for APPROVAL WORKFLOW.
        
        This checks if confirming the current order would exceed the credit limit.
        Formula: (current total_due + this order amount) > credit_limit
        
        For DISPLAY purposes (showing already exceeded), the view uses partner_id.total_due > partner_id.custom_credit_limit
        """
        for order in self:
            if order.partner_id and order.partner_id.custom_credit_limit > 0:
                # For draft/sent orders: check if this order WILL exceed the limit
                if order.state in ('draft', 'sent'):
                    future_due = (order.partner_id.total_due or 0) + (order.amount_total or 0)
                    order.credit_limit_exceeded = future_due > order.partner_id.custom_credit_limit
                    _logger.info(f"Credit check for {order.name}: total_due={order.partner_id.total_due}, order_amount={order.amount_total}, future_due={future_due}, limit={order.partner_id.custom_credit_limit}, exceeded={order.credit_limit_exceeded}")
                else:
                    # For confirmed orders: check current state
                    order.credit_limit_exceeded = order.partner_id.total_due > order.partner_id.custom_credit_limit
            else:
                order.credit_limit_exceeded = False

    @api.constrains('state')
    def _check_credit_hold_on_confirm(self):
        for order in self:
            # Skip check if customer has one-time release
            if order.partner_id.one_time_release:
                continue
            if order.state in ['sale', 'done'] and order.partner_id.is_credit_hold:
                raise ValidationError(_(
                    'CUSTOMER ON CREDIT HOLD\n\n'
                    'Customer "%s" is currently on credit hold.\n'
                    'Reason: %s\n'
                ) % (
                    order.partner_id.name,
                    order.partner_id.credit_hold_reason or 'No reason specified',
                ))

    # =========================================================
    # MAIN CONFIRM LOGIC
    # =========================================================

    def action_confirm(self):
        """Override confirm to enforce credit policies & send approval requests."""
        # Allow easy.sales (or any caller) to bypass this credit check when the
        # credit has already been approved at the easy.sales level.
        if self.env.context.get('skip_credit_check'):
            return super(SaleOrder, self).action_confirm()

        # Fallback: skip credit check if this SO was created by an already-approved easy.sale.
        # Base easy.sales sets record.sale_order_id = so.id BEFORE calling so.action_confirm(),
        # so we can find the approved easy.sale even at the point action_confirm() runs.
        if 'easy.sales' in self.env:
            approved_easy_sale = self.env['easy.sales'].sudo().search([
                ('sale_order_id', 'in', self.ids),
                ('credit_approval_status', '=', 'approved'),
            ], limit=1)
            if approved_easy_sale:
                return super(SaleOrder, self).action_confirm()

        for order in self:
            _logger.info(f"=== ACTION_CONFIRM called for {order.name} ===")
            _logger.info(f"  Partner: {order.partner_id.name}")
            _logger.info(f"  Credit Limit: {order.partner_id.custom_credit_limit}")
            _logger.info(f"  Total Due: {order.partner_id.total_due}")
            _logger.info(f"  Order Amount: {order.amount_total}")
            _logger.info(f"  Credit Approval Status: {order.credit_approval_status}")
            _logger.info(f"  Is Credit Hold: {order.partner_id.is_credit_hold}")
            _logger.info(f"  One Time Release: {order.partner_id.one_time_release}")
            
            # Check if customer is on credit hold (but allow if one-time release is active)
            if order.partner_id.is_credit_hold and not order.partner_id.one_time_release:
                raise UserError(_(
                    'CUSTOMER ON CREDIT HOLD\n\n'
                    'Customer "%s" is blocked.\n'
                    'Reason: %s'
                ) % (
                    order.partner_id.name,
                    order.partner_id.credit_hold_reason or 'Automatic hold due to high risk',
                ))

            # Check if credit limit will be exceeded by this order
            if order.partner_id.custom_credit_limit > 0:
                future_due = (order.partner_id.total_due or 0) + (order.amount_total or 0)
                will_exceed = future_due > order.partner_id.custom_credit_limit
                
                _logger.info(f"  Future Due: {future_due}")
                _logger.info(f"  Will Exceed: {will_exceed}")
                
                if will_exceed and order.credit_approval_status != 'approved':
                    _logger.info(f"  => Credit limit will be exceeded, triggering approval workflow")
                    
                    order.credit_approval_status = 'pending'
                    wa_token = order.generate_whatsapp_token()
                    order.generate_email_token()

                    # Send WhatsApp
                    try:
                        wa_integration = self.env['whatsapp.integration'].search([('is_active', '=', True)], limit=1)
                        if wa_integration:
                            result = wa_integration.send_credit_approval_request_with_buttons(order)
                            if result and result.get('ok'):
                                order.message_post(body="📱 WhatsApp approval request sent")
                                _logger.info(f"WhatsApp sent for {order.name}")
                            else:
                                _logger.warning(f"WhatsApp failed for {order.name}: {result}")
                    except Exception as e:
                        _logger.exception(f"WhatsApp error for {order.name}: {e}")

                    # Send Email
                    try:
                        order._send_credit_approval_request_email()
                    except Exception as e:
                        _logger.exception(f"Email error for {order.name}: {e}")

                    # Return the approval wizard
                    return order.action_request_credit_approval()
                else:
                    _logger.info(f"  => No approval needed (will_exceed={will_exceed}, approval_status={order.credit_approval_status})")
            else:
                _logger.info(f"  => No credit limit set, skipping credit check")

        return super(SaleOrder, self).action_confirm()

    # =========================================================
    # WIZARD OPENERS
    # =========================================================

    def action_request_credit_approval(self):
        """Open credit approval wizard."""
        self.ensure_one()
        
        future_due = (self.partner_id.total_due or 0) + (self.amount_total or 0)
        
        return {
            'name': _('Credit Limit Approval Required'),
            'type': 'ir.actions.act_window',
            'res_model': 'sale.order.credit.approval.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_order_id': self.id,
                'default_partner_id': self.partner_id.id,
                'default_order_amount': self.amount_total,
                'default_current_credit_limit': self.partner_id.custom_credit_limit,
                'default_current_due': self.partner_id.total_due,
                'default_future_total': future_due,
                'default_risk_score': self.partner_id.risk_score,
                'default_risk_level': self.partner_id.risk_level,
            }
        }

    # =========================================================
    # CREDIT APPROVAL ACTIONS
    # =========================================================

    def action_approve_credit_override(self):
        """Approve credit and confirm order."""
        self.ensure_one()
        
        _logger.info(f"=== APPROVING ORDER {self.name} ===")

        self.write({
            'credit_approval_status': 'approved',
            'credit_approved_by': self.env.user.id,
            'credit_approval_date': fields.Datetime.now(),
        })

        # Send WhatsApp notification
        try:
            wa_integration = self.env['whatsapp.integration'].search([('is_active', '=', True)], limit=1)
            if wa_integration:
                wa_integration.send_credit_approved_notification(self)
        except Exception as e:
            _logger.warning(f"WhatsApp notification failed: {e}")

        # Send Email notification
        try:
            self._send_credit_approved_email()
        except Exception as e:
            _logger.warning(f"Email notification failed: {e}")

        # Confirm the order
        result = super(SaleOrder, self).action_confirm()

        # Check if customer had one-time release - if yes, re-apply credit hold
        if self.partner_id.one_time_release:
            self.partner_id.action_reapply_credit_hold()
            self.message_post(body="🔒 Customer automatically put back on Credit Hold after one-time release order.")

        self.message_post(body=f"✅ Order approved by {self.env.user.name}")
        
        return result

    def action_reject_credit_override(self):
        """Reject credit approval."""
        self.ensure_one()
        
        _logger.info(f"=== REJECTING ORDER {self.name} ===")

        self.write({
            'credit_approval_status': 'rejected',
            'credit_approved_by': self.env.user.id,
            'credit_approval_date': fields.Datetime.now(),
        })

        # Send WhatsApp notification
        try:
            wa_integration = self.env['whatsapp.integration'].search([('is_active', '=', True)], limit=1)
            if wa_integration:
                wa_integration.send_credit_rejected_notification(self)
        except Exception as e:
            _logger.warning(f"WhatsApp notification failed: {e}")

        # Send Email notification
        try:
            self._send_credit_rejected_email()
        except Exception as e:
            _logger.warning(f"Email notification failed: {e}")

        self.message_post(body=f"❌ Order rejected by {self.env.user.name}")

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Order Rejected'),
                'message': _('Order %s rejected due to credit limit.') % self.name,
                'type': 'warning',
                'sticky': False,
            }
        }

    # =========================================================
    # ONCHANGE WARNING
    # =========================================================

    @api.onchange('partner_id', 'order_line')
    def _onchange_check_credit_limit(self):
        """Show warning when credit limit will be exceeded or customer on hold."""
        if self.partner_id:
            # Show credit hold warning only if NOT one-time release
            if self.partner_id.is_credit_hold and not self.partner_id.one_time_release:
                return {
                    'warning': {
                        'title': _('⛔ CUSTOMER ON CREDIT HOLD'),
                        'message': _(
                            'Customer "%s" is currently BLOCKED from making new purchases!\n\n'
                            'Reason: %s'
                        ) % (
                            self.partner_id.name,
                            self.partner_id.credit_hold_reason or 'Automatic hold',
                        )
                    }
                }

            # Show credit limit will be exceeded warning
            if self.partner_id.custom_credit_limit > 0 and self.amount_total:
                future_due = (self.partner_id.total_due or 0) + (self.amount_total or 0)
                if future_due > self.partner_id.custom_credit_limit:
                    exceeded_amount = future_due - self.partner_id.custom_credit_limit
                    return {
                        'warning': {
                            'title': _('⚠️ Credit Limit Will Be Exceeded'),
                            'message': _(
                                'This order will exceed customer\'s credit limit!\n\n'
                                'Customer: %s\n'
                                'Credit Limit: %s %s\n'
                                'Current Due: %s %s\n'
                                'This Order: %s %s\n'
                                'Future Total: %s %s\n'
                                'Will Exceed By: %s %s\n\n'
                                'Approval will be required to confirm this order.'
                            ) % (
                                self.partner_id.name,
                                self.currency_id.symbol, '{:,.2f}'.format(self.partner_id.custom_credit_limit),
                                self.currency_id.symbol, '{:,.2f}'.format(self.partner_id.total_due or 0),
                                self.currency_id.symbol, '{:,.2f}'.format(self.amount_total or 0),
                                self.currency_id.symbol, '{:,.2f}'.format(future_due),
                                self.currency_id.symbol, '{:,.2f}'.format(exceeded_amount),
                            )
                        }
                    }

    def action_open_credit_dashboard(self):
        """Open credit exceeded dashboard."""
        return {
            'type': 'ir.actions.act_window',
            'name': 'Credit Management',
            'res_model': 'sale.order',
            'view_mode': 'tree,form',
            'domain': [('credit_limit_exceeded', '=', True)],
        }