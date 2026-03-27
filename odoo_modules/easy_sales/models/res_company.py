from odoo import models, api


class ResCompany(models.Model):
    _inherit = 'res.company'

    @api.model_create_multi
    def create(self, vals_list):
        companies = super().create(vals_list)
        for company in companies:
            self._easy_sales_setup_company(company)
        return companies

    def _easy_sales_setup_company(self, company):
        """Auto-create easy.sales sequence for a company.
        Payment methods are created later by account.journal.create()
        once the chart of accounts (and journals) are installed.
        """
        self._easy_sales_create_sequence(company)

    def _easy_sales_create_sequence(self, company):
        """Create the easy.sales IR sequence for the given company if not already present."""
        existing = self.env['ir.sequence'].sudo().search([
            ('code', '=', 'easy.sales'),
            ('company_id', '=', company.id),
        ], limit=1)
        if not existing:
            self.env['ir.sequence'].sudo().create({
                'name': f'Easy Sales ({company.name})',
                'code': 'easy.sales',
                'prefix': 'ES/%(year)s/',
                'padding': 5,
                'company_id': company.id,
            })

    def _easy_sales_create_payment_methods(self, company):
        """Create default payment methods for the given company if none exist yet."""
        PaymentMethod = self.env['easy.sales.payment.method'].sudo()
        if PaymentMethod.search_count([('company_id', '=', company.id)]):
            return  # Already configured

        cash_journal = self.env['account.journal'].search([
            ('type', '=', 'cash'),
            ('company_id', '=', company.id),
        ], limit=1)
        bank_journal = self.env['account.journal'].search([
            ('type', '=', 'bank'),
            ('company_id', '=', company.id),
        ], limit=1)

        if cash_journal:
            PaymentMethod.create({
                'name': 'Cash',
                'sequence': 1,
                'journal_id': cash_journal.id,
                'is_default': True,
                'company_id': company.id,
            })
        if bank_journal:
            PaymentMethod.create({
                'name': 'Bank Transfer',
                'sequence': 2,
                'journal_id': bank_journal.id,
                'is_default': False,
                'company_id': company.id,
            })
            PaymentMethod.create({
                'name': 'Card',
                'sequence': 3,
                'journal_id': bank_journal.id,
                'is_default': False,
                'company_id': company.id,
            })
        PaymentMethod.create({
            'name': 'Credit',
            'sequence': 10,
            'is_customer_account': True,
            'is_default': False,
            'company_id': company.id,
        })
