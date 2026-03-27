from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class ResPartner(models.Model):
    _inherit = 'res.partner'

    custom_credit_limit = fields.Monetary(
        string='Credit Limit',
        currency_field='currency_id',
        help='Maximum credit amount allowed for this customer',
        default=0.0,
        tracking=True,
    )

    total_due = fields.Monetary(
        string='Total Due',
        compute='_compute_total_due',
        currency_field='currency_id',
        store=False,
        help='Total amount due from customer (unpaid invoices + draft/sent sale orders)',
    )

    available_credit = fields.Monetary(
        string='Available Credit',
        compute='_compute_available_credit',
        currency_field='currency_id',
        store=False,
        help='Remaining credit available for customer',
    )

    risk_score = fields.Float(
        string='Risk Score',
        compute='_compute_risk_score',
        store=True,
        help='Risk percentage based on overdue amount vs credit limit (0-100)',
        digits=(5, 2),
    )

    risk_level = fields.Selection([
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ], string='Risk Level', compute='_compute_risk_score', store=True)

    is_credit_hold = fields.Boolean(
        string='Credit Hold',
        default=False,
        tracking=True,
        help='If True, customer is blocked from making new purchases due to high risk',
    )

    credit_hold_reason = fields.Text(
        string='Hold Reason',
        readonly=True,
        help='Reason why customer was put on credit hold',
    )

    credit_hold_date = fields.Datetime(
        string='Hold Date',
        readonly=True,
        help='Date when customer was put on credit hold',
    )

    # =========================================================
    # ONE-TIME RELEASE FEATURE
    # =========================================================

    one_time_release = fields.Boolean(
        string='One-Time Release',
        default=False,
        help='If True, customer is temporarily released for ONE order only.',
    )

    one_time_release_by = fields.Many2one(
        'res.users',
        string='Released By',
        readonly=True,
    )

    one_time_release_date = fields.Datetime(
        string='Release Date',
        readonly=True,
    )

    # =========================================================
    # RISK SCORE HISTORY
    # =========================================================

    risk_history_ids = fields.One2many(
        'risk.score.history',
        'partner_id',
        string='Risk Score History',
    )

    risk_history_count = fields.Integer(
        string='Risk History Count',
        compute='_compute_risk_history_count',
    )

    # =========================================================
    # 90% CREDIT WARNING
    # =========================================================

    credit_warning_90_sent = fields.Boolean(
        string='90% Warning Sent',
        default=False,
        help='Flag to track if 90% credit limit warning has been logged',
    )

    # =========================================================
    # OTHER FIELDS
    # =========================================================

    credit_facility_asked = fields.Boolean(
        string='Credit Facility Asked',
        default=False,
    )

    credit_facility_ids = fields.One2many(
        'credit.facility',
        'partner_id',
        string='Credit Facility Applications',
    )
    
    credit_facility_count = fields.Integer(
        string='Credit Facility Count',
        compute='_compute_credit_facility_count',
    )

    trade_license_no = fields.Char(string='Trade License Number', tracking=True)
    license_issue_date = fields.Date(string='License Issue Date', tracking=True)
    license_expiry_date = fields.Date(string='License Expiry Date', tracking=True)
    credit_issue_date = fields.Date(string='Credit Issue Date', tracking=True)
    credit_expiry_date = fields.Date(string='Credit Expiry Date', tracking=True)

    is_credit_expired = fields.Boolean(
        string='Credit Expired',
        compute='_compute_is_credit_expired',
        store=False,
    )

    is_license_expired = fields.Boolean(
        string='License Expired',
        compute='_compute_is_license_expired',
        store=False,
    )

    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        default=lambda self: self.env.company.currency_id,
    )

    # =========================================================
    # EXPIRY COMPUTATIONS
    # =========================================================

    @api.depends('credit_expiry_date')
    def _compute_is_credit_expired(self):
        today = fields.Date.today()
        for partner in self:
            if partner.credit_expiry_date:
                partner.is_credit_expired = partner.credit_expiry_date < today
            else:
                partner.is_credit_expired = False

    @api.depends('license_expiry_date')
    def _compute_is_license_expired(self):
        today = fields.Date.today()
        for partner in self:
            if partner.license_expiry_date:
                partner.is_license_expired = partner.license_expiry_date < today
            else:
                partner.is_license_expired = False

    @api.model
    def _cron_check_credit_expiry(self):
        """Cron: Check for expired credit facilities and trade licenses."""
        today = fields.Date.today()

        expired_credit = self.search([
            ('credit_expiry_date', '<', today),
            ('credit_expiry_date', '!=', False),
            ('custom_credit_limit', '>', 0),
            ('is_credit_hold', '=', False),
        ])
        for partner in expired_credit:
            partner.write({
                'is_credit_hold': True,
                'credit_hold_reason': _(
                    'Credit facility expired on %s.\n'
                    'Customer must renew their credit application.'
                ) % partner.credit_expiry_date.strftime('%Y-%m-%d'),
                'credit_hold_date': fields.Datetime.now(),
            })
            partner.message_post(
                body=_('<strong>CREDIT FACILITY EXPIRED</strong><br/>'
                       'Credit expiry date: %s<br/>Customer put on credit hold.') 
                    % partner.credit_expiry_date.strftime('%Y-%m-%d'),
                subject=_('Credit Facility Expired'),
            )
            _logger.info("Credit expired for %s, put on hold", partner.name)

        expired_license = self.search([
            ('license_expiry_date', '<', today),
            ('license_expiry_date', '!=', False),
            ('custom_credit_limit', '>', 0),
            ('is_credit_hold', '=', False),
        ])
        for partner in expired_license:
            partner.write({
                'is_credit_hold': True,
                'credit_hold_reason': _(
                    'Trade license expired on %s.\n'
                    'Customer must provide a renewed trade license.'
                ) % partner.license_expiry_date.strftime('%Y-%m-%d'),
                'credit_hold_date': fields.Datetime.now(),
            })
            partner.message_post(
                body=_('<strong>TRADE LICENSE EXPIRED</strong><br/>'
                       'License expiry date: %s<br/>Customer put on credit hold.')
                    % partner.license_expiry_date.strftime('%Y-%m-%d'),
                subject=_('Trade License Expired'),
            )
            _logger.info("License expired for %s, put on hold", partner.name)

        # Warn for expiring within 30 days
        warning_date = fields.Date.add(today, days=30)
        for partner in self.search([
            ('credit_expiry_date', '>=', today),
            ('credit_expiry_date', '<=', warning_date),
            ('custom_credit_limit', '>', 0),
        ]):
            days_left = (partner.credit_expiry_date - today).days
            _logger.info("Credit expiring in %d days for %s", days_left, partner.name)

        for partner in self.search([
            ('license_expiry_date', '>=', today),
            ('license_expiry_date', '<=', warning_date),
            ('custom_credit_limit', '>', 0),
        ]):
            days_left = (partner.license_expiry_date - today).days
            _logger.info("License expiring in %d days for %s", days_left, partner.name)

    # =========================================================
    # DAILY CRON: 90% CREDIT WARNING
    # =========================================================

    @api.model
    def _cron_daily_credit_limit_check(self):
        """
        Daily cron: Reviews all customer credit limits.
        Logs warning when usage hits 90% of credit limit.
        Resets warning flag when usage drops below 90%.
        """
        partners = self.search([('custom_credit_limit', '>', 0)])
        
        for partner in partners:
            if partner.custom_credit_limit > 0:
                usage_percent = (partner.total_due / partner.custom_credit_limit) * 100
                
                if usage_percent >= 90 and not partner.credit_warning_90_sent:
                    partner.credit_warning_90_sent = True
                    partner.message_post(
                        body=_(
                            '<strong>CREDIT LIMIT WARNING - 90%% REACHED</strong><br/><br/>'
                            'Credit usage has reached <strong>%.1f%%</strong> of the limit.<br/>'
                            'Credit Limit: %s<br/>'
                            'Current Due: %s<br/>'
                            'Available Credit: %s<br/><br/>'
                            '<em>Please monitor this customer closely.</em>'
                        ) % (
                            usage_percent,
                            '{:,.2f}'.format(partner.custom_credit_limit),
                            '{:,.2f}'.format(partner.total_due),
                            '{:,.2f}'.format(partner.available_credit),
                        ),
                        subject=_('Credit Limit 90%% Warning - %s') % partner.name,
                    )
                    _logger.warning(
                        "Credit limit 90%% warning for %s: usage %.1f%%",
                        partner.name, usage_percent
                    )
                
                elif usage_percent < 90 and partner.credit_warning_90_sent:
                    partner.credit_warning_90_sent = False

    # =========================================================
    # CORE COMPUTATIONS
    # =========================================================

    @api.depends('credit', 'sale_order_ids.amount_total', 'sale_order_ids.state', 'sale_order_ids.invoice_status')
    def _compute_total_due(self):
        for partner in self:
            unpaid_invoices = partner.credit
            uninvoiced_orders = self.env['sale.order'].search([
                ('partner_id', '=', partner.id),
                ('state', 'in', ['sale', 'done']),
                ('invoice_status', '!=', 'invoiced'),
            ])
            uninvoiced_amount = sum(uninvoiced_orders.mapped('amount_total'))
            # Include pending easy.sales (draft, not yet confirmed/invoiced) in credit calculation.
            # Use a savepoint so any SQL-level failure is isolated and does NOT abort
            # the outer transaction (plain try/except is not enough for DB-level errors).
            pending_easy_amount = 0.0
            if 'easy.sales' in self.env:
                try:
                    with self.env.cr.savepoint():
                        pending_easy_sales = self.env['easy.sales'].search([
                            ('partner_id', '=', partner.id),
                            ('state', '=', 'draft'),
                        ])
                        pending_easy_amount = sum(pending_easy_sales.mapped('amount_total'))
                except Exception:
                    pending_easy_amount = 0.0
            partner.total_due = unpaid_invoices + uninvoiced_amount + pending_easy_amount

    @api.depends('custom_credit_limit', 'total_due')
    def _compute_available_credit(self):
        for partner in self:
            if partner.custom_credit_limit:
                partner.available_credit = partner.custom_credit_limit - partner.total_due
            else:
                partner.available_credit = 0.0

    @api.depends('custom_credit_limit', 'total_due')
    def _compute_risk_score(self):
        """
        Compute risk score and level. 
        Also: logs risk history on level change, sets dynamic payment terms.
        """
        for partner in self:
            old_risk_score = partner.risk_score or 0.0
            old_risk_level = partner.risk_level or 'low'
            
            if partner.custom_credit_limit > 0 and partner.total_due > 0:
                risk_percentage = (partner.total_due / partner.custom_credit_limit) * 100
                new_score = min(round(risk_percentage, 2), 100.0)
                partner.risk_score = new_score
                
                if new_score <= 30:
                    partner.risk_level = 'low'
                elif new_score <= 70:
                    partner.risk_level = 'medium'
                else:
                    partner.risk_level = 'high'
                    if not partner.is_credit_hold and not partner.one_time_release:
                        partner._trigger_automatic_credit_hold()
            else:
                partner.risk_score = 0.0
                partner.risk_level = 'low'

            # ---- RISK SCORE HISTORY (log on level change) ----
            new_risk_level = partner.risk_level
            new_risk_score = partner.risk_score
            
            if old_risk_level != new_risk_level and partner.id and isinstance(partner.id, int):
                try:
                    self.env['risk.score.history'].sudo().create({
                        'partner_id': partner.id,
                        'old_risk_score': old_risk_score,
                        'new_risk_score': new_risk_score,
                        'old_risk_level': old_risk_level,
                        'new_risk_level': new_risk_level,
                        'reason': 'Risk score updated',
                    })
                except Exception:
                    _logger.warning("Could not create risk history for %s", partner.name)

            # ---- DYNAMIC PAYMENT TERMS (Immediate if high risk) ----
            if new_risk_level == 'high' and partner.id and isinstance(partner.id, int):
                try:
                    immediate_term = self.env.ref(
                        'account.account_payment_term_immediate',
                        raise_if_not_found=False
                    )
                    if immediate_term and partner.property_payment_term_id != immediate_term:
                        partner.property_payment_term_id = immediate_term
                        _logger.info(
                            "Payment term set to Immediate for high-risk customer %s",
                            partner.name
                        )
                except Exception:
                    _logger.warning("Could not set payment term for %s", partner.name)

    def _compute_risk_history_count(self):
        for partner in self:
            partner.risk_history_count = self.env['risk.score.history'].search_count([
                ('partner_id', '=', partner.id),
            ])

    @api.depends('credit_facility_ids')
    def _compute_credit_facility_count(self):
        for partner in self:
            partner.credit_facility_count = len(partner.credit_facility_ids)

    def _trigger_automatic_credit_hold(self):
        self.ensure_one()
        self.write({
            'is_credit_hold': True,
            'credit_hold_reason': _(
                'Automatic hold triggered due to HIGH RISK status.\n\n'
                'Risk Score: %.2f%%\n'
                'Credit Limit: %s\n'
                'Current Due: %s\n'
                'Excess Amount: %s'
            ) % (
                self.risk_score,
                '{:,.2f}'.format(self.custom_credit_limit),
                '{:,.2f}'.format(self.total_due),
                '{:,.2f}'.format(self.total_due - self.custom_credit_limit),
            ),
            'credit_hold_date': fields.Datetime.now(),
            'one_time_release': False,
            'one_time_release_by': False,
            'one_time_release_date': False,
        })
        self._send_credit_hold_notification()
        self.message_post(
            body=_(
                '<strong>Customer Automatically Put On CREDIT HOLD</strong><br/><br/>'
                '<strong>Reason:</strong> Risk score reached HIGH level (%.2f%%)<br/>'
                '<strong>Credit Limit:</strong> %s<br/>'
                '<strong>Current Due:</strong> %s<br/>'
                '<strong>Blocked from:</strong> Creating new sales orders<br/><br/>'
                '<em>Customer must be manually released from hold by authorized personnel.</em>'
            ) % (
                self.risk_score,
                '{:,.2f}'.format(self.custom_credit_limit),
                '{:,.2f}'.format(self.total_due),
            ),
            subject=_('Automatic Credit Hold Activated')
        )

    def _send_credit_hold_notification(self):
        self.ensure_one()
        template = self.env.ref(
            'odonity_credit_management.email_template_credit_hold_notification',
            raise_if_not_found=False
        )
        if template:
            template.send_mail(self.id, force_send=True)

    def action_release_credit_hold(self):
        self.ensure_one()
        if not self.is_credit_hold:
            raise UserError(_('Customer %s is not on credit hold.') % self.name)
        
        self.write({
            'is_credit_hold': False,
            'credit_hold_reason': False,
            'credit_hold_date': False,
            'one_time_release': True,
            'one_time_release_by': self.env.user.id,
            'one_time_release_date': fields.Datetime.now(),
        })
        release_date = fields.Datetime.now().strftime('%Y-%m-%d')
        self.message_post(
            body=_(
                '<strong>ONE-TIME Credit Hold Release</strong><br/><br/>'
                '<strong>Released by:</strong> %s<br/>'
                '<strong>Release Date:</strong> %s<br/><br/>'
                '<strong>Note:</strong> Customer can confirm ONE order only. '
                'After the order is confirmed, customer will automatically be put back on credit hold.'
            ) % (self.env.user.name, release_date),
            subject=_('One-Time Credit Hold Release')
        )
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': _('One-Time Release Granted'),
                'message': _('Customer %s has been released for ONE order only.') % self.name,
                'type': 'success',
                'sticky': False,
            }
        }

    def action_reapply_credit_hold(self):
        self.ensure_one()
        self.write({
            'is_credit_hold': True,
            'credit_hold_reason': _(
                'Credit hold automatically re-applied after one-time release.\n\n'
                'Previous release by: %s\n'
                'Previous release date: %s\n'
                'Re-applied date: %s'
            ) % (
                self.one_time_release_by.name if self.one_time_release_by else 'Unknown',
                self.one_time_release_date.strftime('%Y-%m-%d') if self.one_time_release_date else 'Unknown',
                fields.Datetime.now().strftime('%Y-%m-%d'),
            ),
            'credit_hold_date': fields.Datetime.now(),
            'one_time_release': False,
            'one_time_release_by': False,
            'one_time_release_date': False,
        })
        self.message_post(
            body=_(
                '<strong>Credit Hold Automatically Re-Applied</strong><br/><br/>'
                '<strong>Reason:</strong> One-time release order has been confirmed.<br/>'
                '<strong>Date:</strong> %s'
            ) % fields.Datetime.now().strftime('%Y-%m-%d'),
            subject=_('Credit Hold Re-Applied')
        )

    def increase_credit_limit(self, new_amount):
        self.ensure_one()
        if new_amount > self.custom_credit_limit:
            self.custom_credit_limit = new_amount
            return True
        return False

    @api.model
    def get_credit_exceeded_partners(self, risk_filter=None):
        all_partners = self.search([('custom_credit_limit', '>', 0)])
        exceeded_partners = all_partners.filtered(
            lambda p: p.total_due > p.custom_credit_limit
        )
        if risk_filter:
            exceeded_partners = exceeded_partners.filtered(
                lambda p: p.risk_level == risk_filter
            )
        return exceeded_partners.sorted(
            key=lambda p: (p.risk_score, p.total_due), reverse=True
        )
    
    def action_view_exceeded_quotations(self):
        self.ensure_one()
        return {
            'name': _('Quotations for %s') % self.name,
            'type': 'ir.actions.act_window',
            'res_model': 'sale.order',
            'view_mode': 'list,form',
            'domain': [('partner_id', '=', self.id), ('state', 'in', ['draft', 'sent'])],
            'context': {'default_partner_id': self.id}
        }

    def action_view_risk_history(self):
        """View risk score history for this partner."""
        self.ensure_one()
        return {
            'name': _('Risk History - %s') % self.name,
            'type': 'ir.actions.act_window',
            'res_model': 'risk.score.history',
            'view_mode': 'list',
            'domain': [('partner_id', '=', self.id)],
            'context': {'default_partner_id': self.id},
        }

    # ==================== CREDIT FACILITY WIZARD METHODS ====================
    
    def action_setup_credit_facility(self):
        self.ensure_one()
        return {
            'name': _('Credit Facility Setup'),
            'type': 'ir.actions.act_window',
            'res_model': 'credit.facility.wizard',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_partner_id': self.id,
                'default_use_credit_facility': 'yes' if self.custom_credit_limit > 0 else 'no',
                'default_credit_limit': self.custom_credit_limit or 0.0,
                'default_company_name': self.name or '',
                'default_company_address': self.street or '',
                'default_phone_number': self.phone or '',
                'default_email': self.email or '',
                'default_trade_license_no': self.trade_license_no or '',
                'default_license_issue_date': self.license_issue_date,
                'default_license_expiry_date': self.license_expiry_date,
            }
        }

    def action_view_credit_facilities(self):
        self.ensure_one()
        return {
            'name': _('Credit Facility Applications'),
            'type': 'ir.actions.act_window',
            'res_model': 'credit.facility',
            'view_mode': 'list,form',
            'domain': [('partner_id', '=', self.id)],
            'context': {'default_partner_id': self.id}
        }
