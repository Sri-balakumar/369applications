from datetime import date, timedelta
import calendar

from odoo import models, fields, api, _


class AccountReportPartnerLedgerInherit(models.TransientModel):
    _inherit = 'account.report.partner.ledger'

    result_selection = fields.Selection(default='customer_supplier')
    with_currency = fields.Boolean(string='With Currency', default=True)
    reconciled = fields.Boolean(string='Include Reconciled', default=True)

    period = fields.Selection([
        ('today', 'Today'),
        ('yesterday', 'Yesterday'),
        ('this_week', 'This Week'),
        ('last_week', 'Last Week'),
        ('this_month', 'This Month'),
        ('last_month', 'Last Month'),
        ('this_quarter', 'This Quarter'),
        ('last_quarter', 'Last Quarter'),
        ('this_year', 'This Year'),
        ('last_year', 'Last Year'),
        ('custom', 'Custom'),
    ], string='Period')

    company_scope = fields.Selection([
        ('all_companies', 'All Companies'),
        ('selected_companies', 'Selected Companies'),
    ], string='Company Scope', default='selected_companies')

    company_ids = fields.Many2many(
        'res.company', 'account_report_pl_wizard_company_rel',
        'wizard_id', 'company_id',
        string='Companies',
        default=lambda self: self.env.company,
    )

    @api.onchange('period')
    def _onchange_period(self):
        if not self.period or self.period == 'custom':
            self.date_from = False
            self.date_to = False
            return
        today = date.today()
        if self.period == 'today':
            self.date_from = today
            self.date_to = today
        elif self.period == 'yesterday':
            yesterday = today - timedelta(days=1)
            self.date_from = yesterday
            self.date_to = yesterday
        elif self.period == 'this_week':
            self.date_from = today - timedelta(days=today.weekday())
            self.date_to = today
        elif self.period == 'last_week':
            start = today - timedelta(days=today.weekday() + 7)
            self.date_from = start
            self.date_to = start + timedelta(days=6)
        elif self.period == 'this_month':
            self.date_from = today.replace(day=1)
            self.date_to = today
        elif self.period == 'last_month':
            first_this = today.replace(day=1)
            last_month_end = first_this - timedelta(days=1)
            self.date_from = last_month_end.replace(day=1)
            self.date_to = last_month_end
        elif self.period == 'this_quarter':
            q = (today.month - 1) // 3
            self.date_from = date(today.year, q * 3 + 1, 1)
            self.date_to = today
        elif self.period == 'last_quarter':
            q = (today.month - 1) // 3
            if q == 0:
                self.date_from = date(today.year - 1, 10, 1)
                self.date_to = date(today.year - 1, 12, 31)
            else:
                lq_start = (q - 1) * 3 + 1
                lq_end = q * 3
                self.date_from = date(today.year, lq_start, 1)
                self.date_to = date(today.year, lq_end,
                                    calendar.monthrange(today.year, lq_end)[1])
        elif self.period == 'this_year':
            self.date_from = date(today.year, 1, 1)
            self.date_to = today
        elif self.period == 'last_year':
            self.date_from = date(today.year - 1, 1, 1)
            self.date_to = date(today.year - 1, 12, 31)

    def action_generate_report(self):
        """Read all wizard values and generate an on-screen dynamic report."""
        self.ensure_one()

        partner_type_map = {
            'customer': 'receivable',
            'supplier': 'payable',
            'customer_supplier': 'both',
        }
        result_selection = 'receivable'
        if hasattr(self, 'result_selection'):
            result_selection = partner_type_map.get(self.result_selection, 'receivable')

        target_move = 'posted'
        if hasattr(self, 'target_move'):
            target_move = self.target_move or 'posted'

        date_from = False
        date_to = False
        if hasattr(self, 'date_from'):
            date_from = self.date_from
        if hasattr(self, 'date_to'):
            date_to = self.date_to

        with_currency = False
        if hasattr(self, 'amount_currency'):
            with_currency = self.amount_currency

        reconciled = False
        if hasattr(self, 'reconciled'):
            reconciled = self.reconciled

        journal_ids = []
        if hasattr(self, 'journal_ids') and self.journal_ids:
            journal_ids = self.sudo().journal_ids.ids

        partner_ids = []
        if hasattr(self, 'partner_ids') and self.partner_ids:
            partner_ids = self.sudo().partner_ids.ids

        # Company scope — use sudo() to bypass res.company record rules
        # so all selected companies are included, not just the session-active one
        company_scope = self.company_scope or 'selected_companies'
        if company_scope == 'all_companies':
            all_company_ids = self.env['res.company'].sudo().search([]).ids
            company_ids_list = []  # no domain filter — fetch all
            display_company_id = self.env.company.id
        else:
            all_selected_companies = self.sudo().company_ids or self.env.company
            all_company_ids = all_selected_companies.ids
            company_ids_list = all_company_ids
            display_company_id = all_selected_companies[0].id if all_selected_companies else self.env.company.id

        # Create on-screen report
        Report = self.env['pl.dynamic.report']
        report = Report.create({
            'name': _('Partner Ledger Report'),
            'company_id': display_company_id,
            'company_scope': company_scope,
            'company_ids': [(6, 0, all_company_ids)],
            'partner_type': result_selection,
            'target_move': target_move,
            'date_from': date_from,
            'date_to': date_to,
            'with_currency': with_currency,
            'reconciled': reconciled,
            'report_currency': self.env.company.currency_id.name or '',
            'grand_debit': 0, 'grand_credit': 0, 'grand_balance': 0,
            '_w_partner_type': result_selection,
            '_w_target_move': target_move,
            '_w_date_from': date_from,
            '_w_date_to': date_to,
            '_w_with_currency': with_currency,
            '_w_reconciled': reconciled,
            '_w_journal_ids': [(6, 0, journal_ids)],
            '_w_partner_ids': [(6, 0, partner_ids)],
            '_w_company_scope': company_scope,
            '_w_company_ids': [(6, 0, all_company_ids)],
        })

        self._populate_dynamic_report(report, result_selection, target_move,
                                      date_from, date_to, with_currency,
                                      reconciled, journal_ids, partner_ids,
                                      company_ids_list, company_scope)

        return {
            'name': _('Partner Ledger Report'),
            'type': 'ir.actions.act_window',
            'res_model': 'pl.dynamic.report',
            'res_id': report.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def _populate_dynamic_report(self, report, partner_type, target_move,
                                  date_from, date_to, with_currency,
                                  reconciled, journal_ids, partner_ids,
                                  company_ids_list, company_scope='selected_companies'):
        """Fetch move lines and populate the report model."""
        acct_types = []
        if partner_type in ('receivable', 'both'):
            acct_types.append('asset_receivable')
        if partner_type in ('payable', 'both'):
            acct_types.append('liability_payable')

        # Company filter
        if company_scope == 'all_companies':
            company_domain = []
        else:
            ids = company_ids_list or [self.env.company.id]
            company_domain = [('company_id', 'in', ids)]

        base = [('account_id.account_type', 'in', acct_types)] + company_domain
        if target_move == 'posted':
            base.append(('move_id.state', '=', 'posted'))
        if journal_ids and company_scope == 'selected_companies' and len(company_ids_list) <= 1:
            base.append(('journal_id', 'in', journal_ids))
        if partner_ids:
            base.append(('partner_id', 'in', partner_ids))
        if not reconciled:
            base.append(('full_reconcile_id', '=', False))

        period = list(base)
        if date_from:
            period.append(('date', '>=', date_from))
        if date_to:
            period.append(('date', '<=', date_to))

        opening = list(base)
        if date_from:
            opening.append(('date', '<', date_from))

        ML = self.env['account.move.line'].sudo()
        PG = self.env['pl.dynamic.report.partner'].sudo()
        LN = self.env['pl.dynamic.report.line'].sudo()

        ob = {}
        if date_from:
            for ml in ML.search(opening):
                pid = ml.partner_id.id or 0
                if pid not in ob:
                    ob[pid] = {'d': 0, 'c': 0, 'b': 0, 'p': ml.partner_id}
                ob[pid]['d'] += ml.debit
                ob[pid]['c'] += ml.credit
                ob[pid]['b'] += (ml.debit - ml.credit)

        plines = {}
        for ml in ML.search(period, order='partner_id, date, id'):
            pid = ml.partner_id.id or 0
            if pid not in plines:
                plines[pid] = {'p': ml.partner_id, 'ls': []}
            plines[pid]['ls'].append(ml)

        all_pids = set(ob.keys()) | set(plines.keys())
        gd = gc = gb = 0.0

        for pid in sorted(all_pids, key=lambda x: (
            plines.get(x, ob.get(x, {})).get('p', self.env['res.partner']).name or 'zzz'
        )):
            o = ob.get(pid, {'d': 0, 'c': 0, 'b': 0})
            pl = plines.get(pid, {'p': o.get('p', self.env['res.partner']), 'ls': []})
            partner = pl.get('p') or o.get('p') or self.env['res.partner']

            pg = PG.create({
                'report_id': report.id,
                'partner_id': partner.id if partner else False,
                'partner_name': partner.name if partner else _('Unknown'),
                'opening_debit': o['d'],
                'opening_credit': o['c'],
                'opening_balance': o['b'],
            })

            td = tc = tb = 0.0
            run = o.get('b', 0.0)

            for ml in pl['ls']:
                bal = ml.debit - ml.credit
                run += bal
                td += ml.debit
                tc += ml.credit
                tb += bal
                LN.create({
                    'report_id': report.id,
                    'partner_group_id': pg.id,
                    'partner_id': partner.id if partner else False,
                    'company_id': ml.company_id.id if ml.company_id else False,
                    'date': ml.date,
                    'journal_code': ml.journal_id.code or '',
                    'reference': ml.move_id.name or '',
                    'label': ml.name or '',
                    'due_date': ml.date_maturity,
                    'matching': ml.matching_number or '',
                    'debit': ml.debit,
                    'credit': ml.credit,
                    'balance': bal,
                    'running_balance': run,
                    'move_line_id': ml.id,
                })

            pg.write({
                'total_debit': td, 'total_credit': tc,
                'total_balance': tb,
                'closing_balance': o.get('b', 0.0) + tb,
            })
            gd += o['d'] + td
            gc += o['c'] + tc
            gb += o.get('b', 0.0) + tb

        report.write({'grand_debit': gd, 'grand_credit': gc, 'grand_balance': gb})
