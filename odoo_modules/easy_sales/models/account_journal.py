from odoo import models, api


class AccountJournal(models.Model):
    _inherit = 'account.journal'

    @api.model_create_multi
    def create(self, vals_list):
        journals = super().create(vals_list)
        # When the first cash journal is created for a company, set up Easy Sales
        # payment methods. This fires after chart-of-accounts installation,
        # which is when journals actually exist.
        for journal in journals:
            if journal.type == 'cash':
                company = journal.company_id
                has_methods = self.env['easy.sales.payment.method'].sudo().search_count([
                    ('company_id', '=', company.id),
                ])
                if not has_methods:
                    self.env['res.company'].sudo()._easy_sales_create_payment_methods(company)
        return journals
