from odoo import models, fields, api, _
from odoo.exceptions import UserError
import uuid
import logging

_logger = logging.getLogger(__name__)


class EasySalesCredit(models.Model):
    _inherit = 'easy.sales'

    # =========================================================
    # CREDIT MANAGEMENT FIELDS
    # =========================================================

    credit_approval_status = fields.Selection([
        ('pending', 'Pending Approval'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ], string='Credit Approval Status', tracking=True, copy=False)

    email_approval_token = fields.Char(
        string='Email Approval Token',
        index=True,
        copy=False,
    )

    credit_approved_by = fields.Many2one(
        'res.users',
        string='Credit Approved By',
        readonly=True,
        copy=False,
    )

    credit_approval_date = fields.Datetime(
        string='Credit Approval Date',
        readonly=True,
        copy=False,
    )

    # =========================================================
    # RELATED CREDIT INFO FIELDS (for display in form/list)
    # =========================================================

    customer_credit_limit = fields.Monetary(
        string='Customer Credit Limit',
        related='partner_id.custom_credit_limit',
        readonly=True,
        currency_field='currency_id',
    )

    customer_total_due = fields.Monetary(
        string='Customer Total Due',
        related='partner_id.total_due',
        readonly=True,
        currency_field='currency_id',
    )

    customer_available_credit = fields.Monetary(
        string='Customer Available Credit',
        related='partner_id.available_credit',
        readonly=True,
        currency_field='currency_id',
    )

    customer_risk_score = fields.Float(
        string='Customer Risk Score',
        compute='_compute_customer_risk_score',
        readonly=True,
        digits=(5, 2),
    )

    @api.depends('partner_id', 'partner_id.custom_credit_limit', 'partner_id.total_due')
    def _compute_customer_risk_score(self):
        for record in self:
            credit_limit = record.partner_id.custom_credit_limit or 0
            total_due = record.partner_id.total_due or 0
            if credit_limit > 0 and total_due > 0:
                record.customer_risk_score = min((total_due / credit_limit) * 100, 100.0)
            else:
                record.customer_risk_score = 0.0

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

    credit_limit_exceeded = fields.Boolean(
        string='Credit Limit Exceeded',
        compute='_compute_credit_limit_exceeded',
        store=False,
    )

    @api.depends('partner_id', 'partner_id.custom_credit_limit', 'partner_id.total_due', 'amount_total', 'state')
    def _compute_credit_limit_exceeded(self):
        for record in self:
            if record.partner_id and record.partner_id.custom_credit_limit > 0:
                # partner.total_due already includes this draft easy.sale (see res_partner._compute_total_due).
                # Compare total_due directly — no need to add amount_total (would double-count).
                record.credit_limit_exceeded = (
                    (record.partner_id.total_due or 0) > record.partner_id.custom_credit_limit
                )
            else:
                record.credit_limit_exceeded = False

    @api.onchange('partner_id', 'line_ids')
    def _onchange_check_credit_limit(self):
        """Show warning when credit limit will be exceeded or customer is on hold."""
        if self.partner_id:
            if self.partner_id.is_credit_hold and not self.partner_id.one_time_release:
                return {
                    'warning': {
                        'title': _('CUSTOMER ON CREDIT HOLD'),
                        'message': _(
                            'Customer "%s" is currently BLOCKED from making new purchases!\n\n'
                            'Reason: %s'
                        ) % (
                            self.partner_id.name,
                            self.partner_id.credit_hold_reason or 'Automatic hold',
                        )
                    }
                }
            if self.partner_id.custom_credit_limit > 0 and self.amount_total:
                total_due = self.partner_id.total_due or 0
                credit_limit = self.partner_id.custom_credit_limit
                # For a saved draft (has DB id), partner.total_due already includes
                # this easy.sale in pending_easy_amount — adjust for any line changes.
                # For a new unsaved record, partner.total_due doesn't include it yet.
                if self._origin.id:
                    # Saved: total_due already counts original amount; swap in new amount
                    future_due = total_due - (self._origin.amount_total or 0) + (self.amount_total or 0)
                else:
                    # New unsaved record: add sale amount to get future total
                    future_due = total_due + (self.amount_total or 0)
                if future_due > credit_limit:
                    exceeded_amount = future_due - credit_limit
                    return {
                        'warning': {
                            'title': _('Credit Limit Will Be Exceeded'),
                            'message': _(
                                'This order will exceed the customer\'s credit limit!\n\n'
                                'Customer: %s\n'
                                'Credit Limit: %s\n'
                                'Current Due: %s\n'
                                'This Order: %s\n'
                                'Will Exceed By: %s\n\n'
                                'Approval will be required to confirm this order.'
                            ) % (
                                self.partner_id.name,
                                '{:,.2f}'.format(credit_limit),
                                '{:,.2f}'.format(total_due),
                                '{:,.2f}'.format(self.amount_total or 0),
                                '{:,.2f}'.format(exceeded_amount),
                            )
                        }
                    }

    # =========================================================
    # TOKEN GENERATION
    # =========================================================

    def generate_email_token(self):
        """Generate or reuse email approval token for easy.sales."""
        self.ensure_one()
        if not self.email_approval_token:
            token = f"ES{self.id}_{uuid.uuid4().hex[:12].upper()}"
            self.email_approval_token = token
            _logger.info(f"Generated email token for easy sale {self.name}: {token}")
        return self.email_approval_token

    # =========================================================
    # ADMIN EMAIL HELPER
    # =========================================================

    def _get_admin_email(self):
        """Get admin email for credit approval notifications."""
        # Priority 1: Odoo user whose phone matches connected WA session
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

        return None

    def _get_creator_email(self):
        """Get email of the person who created this easy sale record."""
        if self.create_uid and self.create_uid.email:
            return self.create_uid.email
        if self.env.user and self.env.user.email:
            return self.env.user.email
        return None

    # =========================================================
    # EMAIL NOTIFICATION METHODS
    # =========================================================

    def _send_easy_sale_credit_approval_email(self):
        """Send credit approval request email with APPROVE/REJECT buttons to admin."""
        self.ensure_one()
        admin_email = self._get_admin_email()
        if not admin_email:
            _logger.warning(f"No admin email for easy sale credit approval: {self.name}")
            return False

        try:
            template = self.env.ref(
                'credit_management_system.mail_template_easy_sale_credit_approval_request',
                raise_if_not_found=False,
            )
            if template:
                template.send_mail(
                    self.id,
                    force_send=True,
                    email_values={'email_to': admin_email},
                )
                _logger.info(f"Easy sale credit approval email sent for {self.name} to {admin_email}")
                self.message_post(body=f"📧 Credit approval email with Approve/Reject buttons sent to {admin_email}")
                return True
            else:
                _logger.warning("mail_template_easy_sale_credit_approval_request not found")
                return False
        except Exception as e:
            _logger.exception(f"Failed to send easy sale credit approval email: {e}")
            return False

    def _send_easy_sale_credit_approved_email(self):
        """Send 'approved' notification to sale creator."""
        self.ensure_one()
        creator_email = self._get_creator_email()
        if not creator_email:
            return False
        try:
            template = self.env.ref(
                'credit_management_system.mail_template_easy_sale_credit_approved',
                raise_if_not_found=False,
            )
            if template:
                template.send_mail(
                    self.id,
                    force_send=True,
                    email_values={'email_to': creator_email},
                )
                return True
        except Exception as e:
            _logger.exception(f"Failed to send easy sale credit approved email: {e}")
        return False

    def _send_easy_sale_credit_rejected_email(self):
        """Send 'rejected' notification to sale creator."""
        self.ensure_one()
        creator_email = self._get_creator_email()
        if not creator_email:
            return False
        try:
            template = self.env.ref(
                'credit_management_system.mail_template_easy_sale_credit_rejected',
                raise_if_not_found=False,
            )
            if template:
                template.send_mail(
                    self.id,
                    force_send=True,
                    email_values={'email_to': creator_email},
                )
                return True
        except Exception as e:
            _logger.exception(f"Failed to send easy sale credit rejected email: {e}")
        return False

    # =========================================================
    # CREDIT CHECK OVERRIDE
    # =========================================================

    def _check_credit_limits(self):
        """Skip credit check if already approved or if called from our approval flow."""
        if self.credit_approval_status == 'approved':
            return  # Already approved — skip
        if self.env.context.get('skip_credit_check'):
            return  # Called from our approval flow — skip
        return super()._check_credit_limits()

    # =========================================================
    # MAIN CONFIRM OVERRIDE
    # =========================================================

    def action_confirm(self):
        """
        Override to intercept credit limit exceeded cases and route them
        through the WhatsApp/Email approval workflow instead of hard-blocking.
        """
        # Fast-path: when called from the approval flow, skip all credit checks
        # and go straight to the base easy.sales confirmation.
        if self.env.context.get('skip_credit_check'):
            return super(EasySalesCredit, self).action_confirm()

        for record in self:
            partner = record.partner_id
            if not partner:
                continue

            # Hard block: credit hold (no approval workflow, same as before)
            if getattr(partner, 'is_credit_hold', False) and not getattr(partner, 'one_time_release', False):
                raise UserError(_(
                    'CUSTOMER ON CREDIT HOLD\n\n'
                    'Customer "%s" is blocked from new purchases.\n'
                    'Reason: %s\n\n'
                    'Contact your administrator to release the credit hold.'
                ) % (
                    partner.name,
                    getattr(partner, 'credit_hold_reason', None) or _('No reason specified'),
                ))

            # Credit limit check — trigger approval workflow instead of blocking.
            # partner.total_due already includes this draft easy.sale (see res_partner._compute_total_due).
            # Compare total_due directly — do NOT add amount_total (would double-count).
            credit_limit = getattr(partner, 'custom_credit_limit', 0) or 0
            if credit_limit > 0 and record.credit_approval_status != 'approved':
                total_due = getattr(partner, 'total_due', 0) or 0
                if total_due > credit_limit:
                    _logger.info(
                        f"Easy sale {record.name}: credit limit exceeded "
                        f"(total_due={total_due}, limit={credit_limit}). Triggering approval."
                    )
                    record.credit_approval_status = 'pending'
                    record.generate_email_token()

                    # Send WhatsApp
                    try:
                        wa_integration = self.env['whatsapp.integration'].search(
                            [('is_active', '=', True)], limit=1
                        )
                        if wa_integration:
                            result = wa_integration.send_easy_sale_credit_approval_request(record)
                            if result and result.get('ok'):
                                record.message_post(body="📱 WhatsApp approval request sent to admin")
                    except Exception as e:
                        _logger.exception(f"WhatsApp error for easy sale {record.name}: {e}")

                    # Send Email
                    try:
                        record._send_easy_sale_credit_approval_email()
                    except Exception as e:
                        _logger.exception(f"Email error for easy sale {record.name}: {e}")

                    return record.action_request_credit_approval()

        # Credit check passed (or already approved) — proceed with normal confirmation.
        # Pass skip_credit_check=True so the underlying sale.order credit check is also skipped.
        return super(EasySalesCredit, self.with_context(skip_credit_check=True)).action_confirm()

    def action_request_credit_approval(self):
        """Open the credit approval wizard (same pattern as the sales module)."""
        self.ensure_one()
        partner = self.partner_id
        total_due = getattr(partner, 'total_due', 0) or 0
        credit_limit = getattr(partner, 'custom_credit_limit', 0) or 0

        return {
            'name': _('Credit Limit Approval Required'),
            'type': 'ir.actions.act_window',
            'res_model': 'easy.sales.credit.approval.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_sale_id': self.id,
                'default_partner_id': partner.id,
                'default_sale_amount': self.amount_total,
                'default_current_credit_limit': credit_limit,
                'default_current_due': total_due,
                'default_exceeds_by': max(0, total_due - credit_limit),
                'default_risk_score': getattr(partner, 'risk_score', 0) or 0,
                'default_risk_level': getattr(partner, 'risk_level', 'low') or 'low',
            },
        }

    # =========================================================
    # CREDIT APPROVAL ACTIONS
    # =========================================================

    def action_approve_easy_sale_credit(self):
        """Approve credit and complete the easy sale confirmation (SO + delivery + invoice + payment)."""
        self.ensure_one()

        _logger.info(f"=== APPROVING EASY SALE CREDIT: {self.name} ===")

        self.write({
            'credit_approval_status': 'approved',
            'credit_approved_by': self.env.user.id,
            'credit_approval_date': fields.Datetime.now(),
        })

        # Send WhatsApp notification
        try:
            wa_integration = self.env['whatsapp.integration'].search(
                [('is_active', '=', True)], limit=1
            )
            if wa_integration:
                wa_integration.send_easy_sale_credit_approved_notification(self)
        except Exception as e:
            _logger.warning(f"WhatsApp notification failed: {e}")

        # Send Email notification
        try:
            self._send_easy_sale_credit_approved_email()
        except Exception as e:
            _logger.warning(f"Email notification failed: {e}")

        self.message_post(body=f"✅ Credit approved by {self.env.user.name}")

        # Run the full easy sale confirmation flow.
        # Wrapped in a savepoint so that if action_confirm() fails internally,
        # the approval status write above is still committed to the DB.
        try:
            with self.env.cr.savepoint():
                return self.with_context(skip_credit_check=True).action_confirm()
        except Exception as e:
            _logger.exception(f"action_confirm failed after credit approval for {self.name}: {e}")
            self.message_post(
                body=f"⚠️ Auto-confirmation failed: {e}. "
                     f"Credit is APPROVED — please click Confirm Sale manually."
            )

    def action_reject_easy_sale_credit(self):
        """Reject credit approval — sale stays in draft."""
        self.ensure_one()

        _logger.info(f"=== REJECTING EASY SALE CREDIT: {self.name} ===")

        self.write({
            'credit_approval_status': 'rejected',
            'credit_approved_by': self.env.user.id,
            'credit_approval_date': fields.Datetime.now(),
        })

        # Send WhatsApp notification
        try:
            wa_integration = self.env['whatsapp.integration'].search(
                [('is_active', '=', True)], limit=1
            )
            if wa_integration:
                wa_integration.send_easy_sale_credit_rejected_notification(self)
        except Exception as e:
            _logger.warning(f"WhatsApp notification failed: {e}")

        # Send Email notification
        try:
            self._send_easy_sale_credit_rejected_email()
        except Exception as e:
            _logger.warning(f"Email notification failed: {e}")

        self.message_post(body=f"❌ Credit approval rejected by {self.env.user.name}")

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('Credit Rejected'),
                'message': _(
                    'Credit approval for %s has been rejected. Sale remains in draft.'
                ) % self.name,
                'type': 'warning',
                'sticky': False,
            }
        }
