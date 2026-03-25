from odoo import models, fields, api, _
from odoo.exceptions import ValidationError


class EstimateSalePaymentMethod(models.Model):
    _name = 'estimate.sale.payment.method'
    _description = 'Estimate Sale Payment Method'
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
        domain="[('type', 'in', ['cash', 'bank', 'credit']), ('company_id', '=', company_id)]",
        help='Select the journal where the payment will be recorded.\n'
             'Cash Journal > Cash Book | Bank Journal > Bank Book\n'
             'Not required for Customer Account (credit sale).'
    )

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
    )

    is_default = fields.Boolean(
        string='Default Payment Method',
        default=False,
    )

    color = fields.Integer(string='Color Index')
    notes = fields.Text(string='Notes')

    @api.constrains('journal_id', 'is_customer_account')
    def _check_journal_id(self):
        for rec in self:
            if not rec.is_customer_account and not rec.journal_id:
                raise ValidationError(
                    _('Please set a Payment Journal for payment method "%s".\n'
                      'Only "Customer Account" methods can work without a journal.',
                      rec.name)
                )

    @api.constrains('name', 'company_id')
    def _check_unique_name(self):
        for record in self:
            duplicate = self.search([
                ('company_id', '=', record.company_id.id),
                ('id', '!=', record.id),
                ('active', '=', True),
            ]).filtered(lambda r: r.name and record.name and r.name.strip().lower() == record.name.strip().lower())
            if duplicate:
                raise ValidationError(_(
                    'A payment method named "%s" already exists for this company.'
                ) % record.name)

    @api.constrains('is_customer_account', 'company_id')
    def _check_unique_credit(self):
        for record in self:
            if record.is_customer_account:
                duplicate = self.search([
                    ('company_id', '=', record.company_id.id),
                    ('is_customer_account', '=', True),
                    ('id', '!=', record.id),
                    ('active', '=', True),
                ])
                if duplicate:
                    raise ValidationError(_(
                        'A credit payment method already exists for this company: "%s".\n'
                        'Only one credit (Customer Account) payment method is allowed per company.'
                    ) % duplicate[0].name)

    @api.constrains('journal_id', 'company_id')
    def _check_unique_journal(self):
        """Prevent multiple payment methods using the same journal per company."""
        for record in self:
            if record.journal_id:
                duplicate = self.search([
                    ('company_id', '=', record.company_id.id),
                    ('journal_id', '=', record.journal_id.id),
                    ('id', '!=', record.id),
                    ('active', '=', True),
                ])
                if duplicate:
                    raise ValidationError(_(
                        'The journal "%s" is already used by payment method "%s".\n'
                        'Each payment method must use a different journal.'
                    ) % (record.journal_id.name, duplicate[0].name))

    @api.onchange('is_customer_account')
    def _onchange_is_customer_account(self):
        if self.is_customer_account:
            self.journal_id = False
            self.destination_account_id = False
            if not self.name or self.name.strip().lower() in ('cash', 'bank transfer', 'bank', 'card', ''):
                self.name = 'Credit'
        else:
            if self.name and self.name.strip().lower() == 'credit':
                self.name = ''

    @api.onchange('journal_id')
    def _onchange_journal_id(self):
        if self.journal_id and not self.destination_account_id:
            receivable = self.env['account.account'].search([
                ('account_type', '=', 'asset_receivable'),
            ], limit=1)
            if receivable:
                self.destination_account_id = receivable.id

    def get_destination_account(self, partner=None):
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
        company_id = company_id or self.env.company.id
        return self.search([
            ('company_id', '=', company_id),
            ('is_default', '=', True),
            ('active', '=', True)
        ], limit=1)

    def write(self, vals):
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
        for vals in vals_list:
            if vals.get('is_customer_account') and not vals.get('name'):
                vals['name'] = 'Credit'
            if vals.get('is_default'):
                company_id = vals.get('company_id', self.env.company.id)
                self.search([
                    ('company_id', '=', company_id),
                    ('is_default', '=', True)
                ]).write({'is_default': False})
        return super().create(vals_list)
