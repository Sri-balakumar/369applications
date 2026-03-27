from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class EasySalesPaymentMethod(models.Model):
    _name = 'easy.sales.payment.method'
    _description = 'Easy Sales Payment Method'
    _order = 'sequence, id'

    name = fields.Char(string='Payment Method', required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company
    )

    # ── Customer Account: credit sale, no payment, stays as receivable ──
    is_customer_account = fields.Boolean(
        string='Customer Account (Credit Sale)',
        default=False,
        help='If enabled, no payment will be created. The invoice will remain '
             'unpaid and the amount stays in the customer\'s receivable account.\n'
             'Use this for credit sales where the customer pays later.'
    )

    journal_id = fields.Many2one(
        'account.journal',
        string='Payment Journal',
        domain="[('type', 'in', ['cash', 'bank']), ('company_id', '=', company_id)]",
        help='Select the journal where the payment will be recorded.\n'
             'Cash Journal → Cash Book | Bank Journal → Bank Book\n'
             'Not required for Customer Account (credit sale).'
    )

    # Computed from journal
    journal_type = fields.Selection(
        related='journal_id.type',
        string='Journal Type',
        readonly=True,
        store=True,
    )

    destination_account_id = fields.Many2one(
        'account.account',
        string='Destination Account',
        domain="[('account_type', 'in', ['asset_receivable', 'liability_payable'])]",
        help='Optional: Override the receivable account for this payment method.\n'
             'If left empty, the customer\'s default receivable account is used.\n'
             'This is automatically handled by Odoo in most cases.'
    )

    is_default = fields.Boolean(
        string='Default Payment Method',
        default=False,
        help='If checked, this payment method will be pre-selected in Easy Sales'
    )

    color = fields.Integer(string='Color Index')
    notes = fields.Text(string='Notes')

    @api.constrains('journal_id', 'is_customer_account')
    def _check_journal_id(self):
        """Ensure journal is set for non-customer-account methods"""
        for rec in self:
            if not rec.is_customer_account and not rec.journal_id:
                raise ValidationError(
                    _('Please set a Payment Journal for payment method "%s".\n'
                      'Only "Customer Account" methods can work without a journal.',
                      rec.name)
                )

    @api.onchange('is_customer_account')
    def _onchange_is_customer_account(self):
        """Clear journal when switching to customer account mode"""
        if self.is_customer_account:
            self.journal_id = False
            self.destination_account_id = False

    @api.onchange('journal_id')
    def _onchange_journal_id(self):
        """Auto-select default receivable account when journal is picked"""
        if self.journal_id and not self.destination_account_id:
            receivable = self.env['account.account'].search([
                ('account_type', '=', 'asset_receivable'),
            ], limit=1)
            if receivable:
                self.destination_account_id = receivable.id

    def get_destination_account(self, partner=None):
        """Get the destination account for payment registration."""
        self.ensure_one()
        if self.destination_account_id:
            return self.destination_account_id
        if partner and partner.property_account_receivable_id:
            return partner.property_account_receivable_id
        return self.env['account.account'].search([
            ('account_type', '=', 'asset_receivable'),
        ], limit=1)

    @api.model
    def get_default_payment_method(self, company_id=None):
        """Get the default payment method for a company.
        Only returns a method if one is explicitly marked as default.
        """
        company_id = company_id or self.env.company.id
        return self.search([
            ('company_id', '=', company_id),
            ('is_default', '=', True),
            ('active', '=', True)
        ], limit=1)

    def write(self, vals):
        """Ensure only one default payment method per company"""
        if vals.get('is_default'):
            for record in self:
                self.search([
                    ('company_id', '=', record.company_id.id),
                    ('is_default', '=', True),
                    ('id', 'not in', self.ids)
                ]).write({'is_default': False})
        return super().write(vals)

    @api.model_create_multi
    def create(self, vals_list):
        """Ensure only one default payment method per company"""
        for vals in vals_list:
            if vals.get('is_default'):
                company_id = vals.get('company_id', self.env.company.id)
                self.search([
                    ('company_id', '=', company_id),
                    ('is_default', '=', True)
                ]).write({'is_default': False})
        return super().create(vals_list)
