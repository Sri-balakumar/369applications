import io
from odoo import models, fields, api, _
from odoo.exceptions import UserError

try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None


class PLDynamicReport(models.Model):
    _name = 'pl.dynamic.report'
    _description = 'Partner Ledger Dynamic Report'
    _order = 'id desc'

    name = fields.Char(string='Report', default='Partner Ledger Report', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    company_scope = fields.Selection([
        ('all_companies', 'All Companies'),
        ('selected_companies', 'Selected Companies'),
    ], string='Company Scope', readonly=True)
    company_ids = fields.Many2many(
        'res.company', 'pl_dynamic_report_company_rel',
        'report_id', 'company_id', string='Companies', readonly=True,
    )
    partner_type = fields.Selection([
        ('receivable', 'Receivable Accounts'),
        ('payable', 'Payable Accounts'),
        ('both', 'Receivable and Payable'),
    ], string="Partner's", readonly=True)
    target_move = fields.Selection([
        ('posted', 'All Posted Entries'),
        ('all', 'All Entries'),
    ], string='Target Moves', readonly=True)
    date_from = fields.Date(string='Start Date', readonly=True)
    date_to = fields.Date(string='End Date', readonly=True)
    report_currency = fields.Char(string='Report Currency', readonly=True)
    with_currency = fields.Boolean(string='With Currency', readonly=True)
    reconciled = fields.Boolean(string='Include Reconciled', readonly=True)

    partner_ids = fields.One2many('pl.dynamic.report.partner', 'report_id', string='Partners', readonly=True)
    line_ids = fields.One2many('pl.dynamic.report.line', 'report_id', string='Entries', readonly=True)

    grand_debit = fields.Float(string='Total Debit', readonly=True, digits=(16, 3))
    grand_credit = fields.Float(string='Total Credit', readonly=True, digits=(16, 3))
    grand_balance = fields.Float(string='Total Balance', readonly=True, digits=(16, 3))

    # Stored wizard params for refresh
    _w_partner_type = fields.Selection([('receivable', 'R'), ('payable', 'P'), ('both', 'B')])
    _w_target_move = fields.Selection([('posted', 'P'), ('all', 'A')])
    _w_date_from = fields.Date()
    _w_date_to = fields.Date()
    _w_with_currency = fields.Boolean()
    _w_reconciled = fields.Boolean()
    _w_journal_ids = fields.Many2many('account.journal', 'pl_dyn_report_journal_rel', 'report_id', 'journal_id')
    _w_partner_ids = fields.Many2many('res.partner', 'pl_dyn_report_partner_rel', 'report_id', 'partner_id')
    _w_company_scope = fields.Selection([('all_companies', 'A'), ('selected_companies', 'S')])
    _w_company_ids = fields.Many2many('res.company', 'pl_dyn_report_company_rel', 'report_id', 'company_id')

    def action_refresh(self):
        self.ensure_one()
        wiz = self.env['account.report.partner.ledger'].create({})
        # Clear old data
        self.partner_ids.unlink()
        self.line_ids.unlink()
        # Re-populate
        company_scope = self._w_company_scope or 'selected_companies'
        company_ids_list = (self._w_company_ids.ids
                            if company_scope == 'selected_companies'
                            else [])
        wiz._populate_dynamic_report(
            self,
            self._w_partner_type, self._w_target_move,
            self._w_date_from, self._w_date_to,
            self._w_with_currency, self._w_reconciled,
            self._w_journal_ids.ids, self._w_partner_ids.ids,
            company_ids_list, company_scope,
        )
        return {
            'type': 'ir.actions.act_window',
            'res_model': 'pl.dynamic.report',
            'res_id': self.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_pdf_report(self):
        self.ensure_one()
        return self.env.ref(
            'partner_ledger_dynamic.action_report_pl_dynamic_pdf'
        ).report_action(self)

    def action_excel_export(self):
        self.ensure_one()
        if not xlsxwriter:
            raise UserError(_('xlsxwriter required. Install: pip install xlsxwriter'))
        return {
            'type': 'ir.actions.act_url',
            'url': '/pl_dynamic/excel/%d' % self.id,
            'target': 'new',
        }

    def generate_excel_content(self):
        self.ensure_one()
        output = io.BytesIO()
        wb = xlsxwriter.Workbook(output, {'in_memory': True})
        ws = wb.add_worksheet('Partner Ledger')

        title = wb.add_format({'bold': True, 'font_size': 14, 'align': 'center', 'bg_color': '#495057', 'font_color': 'white'})
        hdr = wb.add_format({'bold': True, 'bg_color': '#e9ecef', 'border': 1, 'font_size': 10})
        pfmt = wb.add_format({'bold': True, 'bg_color': '#495057', 'font_color': 'white', 'font_size': 11})
        cfmt = wb.add_format({'border': 1, 'font_size': 10})
        nfmt = wb.add_format({'num_format': '#,##0.000', 'border': 1, 'font_size': 10})
        bfmt = wb.add_format({'num_format': '#,##0.000', 'bold': True, 'border': 1, 'bg_color': '#d1ecf1', 'font_size': 10})
        tfmt = wb.add_format({'num_format': '#,##0.000', 'bold': True, 'border': 1, 'bg_color': '#343a40', 'font_color': 'white'})
        tl = wb.add_format({'bold': True, 'border': 1, 'bg_color': '#343a40', 'font_color': 'white'})

        for i, w in enumerate([12, 8, 22, 28, 12, 10, 15, 15, 15]):
            ws.set_column(i, i, w)

        ws.merge_range(0, 0, 0, 8, 'Partner Ledger Report', title)
        ws.write(1, 0, 'Company: %s' % self.company_id.name)
        ws.write(1, 5, 'Currency: %s' % (self.report_currency or ''))
        ws.write(2, 0, 'Period: %s to %s' % (self.date_from or '—', self.date_to or '—'))
        row = 4
        cols = ['Date', 'Journal', 'Reference', 'Label', 'Due Date', 'Match', 'Debit', 'Credit', 'Balance']

        for pg in self.partner_ids:
            ws.merge_range(row, 0, row, 8, pg.partner_name or 'Unknown', pfmt)
            row += 1
            for c, h in enumerate(cols):
                ws.write(row, c, h, hdr)
            row += 1
            if pg.opening_balance:
                ws.merge_range(row, 0, row, 5, 'Opening Balance', hdr)
                ws.write(row, 6, pg.opening_debit, bfmt)
                ws.write(row, 7, pg.opening_credit, bfmt)
                ws.write(row, 8, pg.opening_balance, bfmt)
                row += 1
            for ln in pg.line_ids:
                ws.write(row, 0, str(ln.date) if ln.date else '', cfmt)
                ws.write(row, 1, ln.journal_code or '', cfmt)
                ws.write(row, 2, ln.reference or '', cfmt)
                ws.write(row, 3, ln.label or '', cfmt)
                ws.write(row, 4, str(ln.due_date) if ln.due_date else '', cfmt)
                ws.write(row, 5, ln.matching or '', cfmt)
                ws.write(row, 6, ln.debit, nfmt)
                ws.write(row, 7, ln.credit, nfmt)
                ws.write(row, 8, ln.running_balance, nfmt)
                row += 1
            ws.merge_range(row, 0, row, 5, 'Partner Total', hdr)
            ws.write(row, 6, pg.total_debit, bfmt)
            ws.write(row, 7, pg.total_credit, bfmt)
            ws.write(row, 8, pg.closing_balance, bfmt)
            row += 2

        ws.merge_range(row, 0, row, 5, 'GRAND TOTAL', tl)
        ws.write(row, 6, self.grand_debit, tfmt)
        ws.write(row, 7, self.grand_credit, tfmt)
        ws.write(row, 8, self.grand_balance, tfmt)
        wb.close()
        output.seek(0)
        return output.read()


class PLDynamicReportPartner(models.Model):
    _name = 'pl.dynamic.report.partner'
    _description = 'PL Dynamic Report - Partner'
    _order = 'partner_name, id'

    report_id = fields.Many2one('pl.dynamic.report', ondelete='cascade', required=True, index=True)
    partner_id = fields.Many2one('res.partner', readonly=True)
    partner_name = fields.Char(string='Partner', readonly=True)
    opening_debit = fields.Float(string='Opening Dr', readonly=True, digits=(16, 3))
    opening_credit = fields.Float(string='Opening Cr', readonly=True, digits=(16, 3))
    opening_balance = fields.Float(string='Opening', readonly=True, digits=(16, 3))
    total_debit = fields.Float(string='Debit', readonly=True, digits=(16, 3))
    total_credit = fields.Float(string='Credit', readonly=True, digits=(16, 3))
    total_balance = fields.Float(string='Period Bal', readonly=True, digits=(16, 3))
    closing_balance = fields.Float(string='Balance', readonly=True, digits=(16, 3))
    line_ids = fields.One2many('pl.dynamic.report.line', 'partner_group_id', string='Entries', readonly=True)


class PLDynamicReportLine(models.Model):
    _name = 'pl.dynamic.report.line'
    _description = 'PL Dynamic Report - Line'
    _order = 'partner_name, date, id'

    report_id = fields.Many2one('pl.dynamic.report', ondelete='cascade', required=True, index=True)
    partner_group_id = fields.Many2one('pl.dynamic.report.partner', ondelete='cascade', index=True)
    partner_id = fields.Many2one('res.partner', readonly=True)
    partner_name = fields.Char(string='Partner', related='partner_group_id.partner_name', store=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    date = fields.Date(string='Date', readonly=True)
    journal_code = fields.Char(string='Journal', readonly=True)
    reference = fields.Char(string='Reference', readonly=True)
    label = fields.Char(string='Label', readonly=True)
    due_date = fields.Date(string='Due Date', readonly=True)
    matching = fields.Char(string='Matching', readonly=True)
    debit = fields.Float(string='Debit', readonly=True, digits=(16, 3))
    credit = fields.Float(string='Credit', readonly=True, digits=(16, 3))
    balance = fields.Float(string='Balance', readonly=True, digits=(16, 3))
    running_balance = fields.Float(string='Running Bal', readonly=True, digits=(16, 3))
    move_line_id = fields.Many2one('account.move.line', string='Journal Item', readonly=True)
