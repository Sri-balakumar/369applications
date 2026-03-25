# -*- coding: utf-8 -*-
import io
import base64
from datetime import date, timedelta
from odoo import models, fields, api, _
from odoo.exceptions import UserError

try:
    import xlsxwriter
except ImportError:
    xlsxwriter = None


class GPReportWizard(models.TransientModel):
    _name = 'gp.report.wizard'
    _description = 'Gross Profit Report Wizard'

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
        ('custom', 'Custom Period'),
    ], string='Period', default='today', required=True)

    date_from = fields.Date(
        string='Date From', required=True,
        default=fields.Date.today,
    )
    date_to = fields.Date(
        string='Date To', required=True,
        default=fields.Date.today,
    )
    report_type = fields.Selection([
        ('product', 'Product-wise'),
        ('salesperson', 'Salesperson-wise'),
        ('customer', 'Customer-wise'),
        ('category', 'Category-wise'),
        ('company', 'Company-wise'),
        ('detailed', 'Detailed (All Invoice Lines)'),
    ], string='Report Type', default='product', required=True)

    # --- Company & Branch ---
    company_scope = fields.Selection([
        ('all', 'All Selected Companies'),
        ('selected', 'Selected Companies'),
    ], string='Company Scope', default='all', required=True)

    company_ids = fields.Many2many(
        'res.company', string='Companies',
        default=lambda self: self.env.companies,
    )
    branch_ids = fields.Many2many(
        'res.company', 'gp_wizard_branch_rel', 'wizard_id', 'branch_id',
        string='Branches',
        help='Filter by specific branches (child companies). Leave empty for all branches.',
    )
    has_child_companies = fields.Boolean(
        compute='_compute_has_child_companies',
    )

    # --- GP Margin Filter ---
    gp_margin_filter = fields.Selection([
        ('none', 'No Filter'),
        ('below', 'Below'),
        ('above', 'Above'),
        ('between', 'Between'),
        ('equal', 'Equal to'),
    ], string='GP Margin Filter', default='none',
       help='Filter report results by GP Margin percentage.')
    gp_margin_value = fields.Float(string='GP %', help='GP Margin percentage threshold.')
    gp_margin_value_to = fields.Float(string='GP % To', help='Upper bound for between filter.')

    # --- Other Filters ---
    product_ids = fields.Many2many('product.product', string='Products')
    product_categ_ids = fields.Many2many('product.category', string='Product Categories')
    salesperson_ids = fields.Many2many('res.users', string='Salespersons')
    partner_ids = fields.Many2many('res.partner', string='Customers')

    line_ids = fields.One2many('gross.profit.report.line', 'wizard_id', string='Report Lines')

    total_sales = fields.Monetary(string='Total Sales', compute='_compute_totals', currency_field='company_currency_id')
    total_cogs = fields.Monetary(string='Total COGS', compute='_compute_totals', currency_field='company_currency_id')
    total_gp = fields.Monetary(string='Total Gross Profit', compute='_compute_totals', currency_field='company_currency_id')
    total_gp_margin = fields.Float(string='Overall GP Margin (%)', compute='_compute_totals')
    company_currency_id = fields.Many2one(
        'res.currency', default=lambda self: self.env.company.currency_id,
    )

    @api.depends('company_ids')
    def _compute_has_child_companies(self):
        for wiz in self:
            if wiz.company_ids:
                children = self.env['res.company'].search([
                    ('parent_id', 'in', wiz.company_ids.ids),
                ])
                wiz.has_child_companies = bool(children)
            else:
                all_children = self.env['res.company'].search([
                    ('parent_id', '!=', False),
                ])
                wiz.has_child_companies = bool(all_children)

    @api.onchange('company_scope')
    def _onchange_company_scope(self):
        if self.company_scope == 'all':
            self.company_ids = self.env.companies
            self.branch_ids = False
        elif self.company_scope == 'selected':
            if not self.company_ids:
                self.company_ids = self.env.companies

    @api.onchange('company_ids')
    def _onchange_company_ids(self):
        self.branch_ids = False

    @api.onchange('period')
    def _onchange_period(self):
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
            last_prev = first_this - timedelta(days=1)
            self.date_from = last_prev.replace(day=1)
            self.date_to = last_prev
        elif self.period == 'this_quarter':
            q_month = ((today.month - 1) // 3) * 3 + 1
            self.date_from = today.replace(month=q_month, day=1)
            self.date_to = today
        elif self.period == 'last_quarter':
            q_month = ((today.month - 1) // 3) * 3 + 1
            first_this_q = today.replace(month=q_month, day=1)
            last_prev_q = first_this_q - timedelta(days=1)
            lq_month = ((last_prev_q.month - 1) // 3) * 3 + 1
            self.date_from = last_prev_q.replace(month=lq_month, day=1)
            self.date_to = last_prev_q
        elif self.period == 'this_year':
            self.date_from = today.replace(month=1, day=1)
            self.date_to = today
        elif self.period == 'last_year':
            self.date_from = today.replace(year=today.year - 1, month=1, day=1)
            self.date_to = today.replace(year=today.year - 1, month=12, day=31)

    @api.depends('line_ids.sale_amount', 'line_ids.cost_amount', 'line_ids.gross_profit')
    def _compute_totals(self):
        for wiz in self:
            wiz.total_sales = sum(wiz.line_ids.mapped('sale_amount'))
            wiz.total_cogs = sum(wiz.line_ids.mapped('cost_amount'))
            wiz.total_gp = sum(wiz.line_ids.mapped('gross_profit'))
            wiz.total_gp_margin = (
                (wiz.total_gp / wiz.total_sales * 100) if wiz.total_sales else 0.0
            )

    def _get_effective_company_ids(self):
        """Get list of company IDs based on scope + branch selection."""
        if self.company_scope == 'all':
            # Use companies from the user's company switcher
            company_ids = self.env.companies.ids
        else:
            company_ids = self.company_ids.ids if self.company_ids else self.env.companies.ids

        if self.branch_ids:
            return self.branch_ids.ids

        if company_ids:
            children = self.env['res.company'].search([
                ('parent_id', 'in', company_ids),
            ])
            return list(set(company_ids + children.ids))

        return self.env.companies.ids

    def _get_domain(self):
        domain = [
            ('move_id.move_type', 'in', ['out_invoice', 'out_refund']),
            ('move_id.state', '=', 'posted'),
            ('display_type', '=', 'product'),
            ('product_id', '!=', False),
            ('move_id.invoice_date', '>=', self.date_from),
            ('move_id.invoice_date', '<=', self.date_to),
        ]
        if self.product_ids:
            domain.append(('product_id', 'in', self.product_ids.ids))
        if self.product_categ_ids:
            domain.append(('product_id.categ_id', 'in', self.product_categ_ids.ids))
        if self.salesperson_ids:
            domain.append(('move_id.invoice_user_id', 'in', self.salesperson_ids.ids))
        if self.partner_ids:
            domain.append(('move_id.partner_id', 'in', self.partner_ids.ids))

        effective_ids = self._get_effective_company_ids()
        if effective_ids:
            domain.append(('move_id.company_id', 'in', effective_ids))

        return domain

    def _get_product_cost(self, product, company=None):
        if company:
            return product.with_company(company).standard_price or 0.0
        return product.standard_price or 0.0

    def _get_sold_goods_cost(self, aml, company):
        """Get actual cost of sold goods from stock valuation layers.

        Traces invoice line → sale order line → stock moves → valuation layers
        to retrieve the real cost at which goods left the warehouse.
        Services return 0 (no goods cost). Falls back to standard_price
        when no stock valuation data is available.
        """
        product = aml.product_id

        # Services have no cost of goods sold
        if product.type == 'service':
            return 0.0

        # Try to get actual cost from stock move valuations
        sale_lines = aml.sale_line_ids
        if sale_lines:
            total_cost = 0.0
            total_qty = 0.0
            for sl in sale_lines:
                done_moves = sl.move_ids.filtered(
                    lambda m: m.state == 'done'
                    and m.location_dest_id.usage == 'customer'
                )
                for move in done_moves:
                    total_cost += abs(move.value)
                    total_qty += move.quantity
            if total_qty:
                return total_cost / total_qty

        # Fallback to standard price for products without valuation data
        return self._get_product_cost(product, company)

    def _filter_by_gp_margin(self, lines_data):
        """Filter report lines based on GP margin percentage criteria."""
        filtered = []
        val = self.gp_margin_value
        val_to = self.gp_margin_value_to
        for line in lines_data:
            margin = line.get('gp_margin', 0.0)
            if self.gp_margin_filter == 'below' and margin < val:
                filtered.append(line)
            elif self.gp_margin_filter == 'above' and margin > val:
                filtered.append(line)
            elif self.gp_margin_filter == 'between' and val <= margin <= val_to:
                filtered.append(line)
            elif self.gp_margin_filter == 'equal' and abs(margin - val) < 0.01:
                filtered.append(line)
        return filtered

    def action_generate_report(self):
        self.ensure_one()
        if self.date_from > self.date_to:
            raise UserError(_('Date From cannot be after Date To.'))

        self.line_ids.unlink()
        domain = self._get_domain()

        effective_company_ids = self._get_effective_company_ids()
        allowed_companies = self.env['res.company'].browse(effective_company_ids)
        MoveLines = self.env['account.move.line'].with_context(
            allowed_company_ids=allowed_companies.ids,
        )

        move_lines = MoveLines.sudo().search(domain)

        if not move_lines:
            raise UserError(_('No posted invoice data found for the selected criteria.'))

        currency = self.company_currency_id

        if self.report_type == 'detailed':
            lines_data = self._build_detailed(move_lines, currency)
        else:
            lines_data = self._build_grouped(move_lines, currency)

        # Apply GP margin filter before creating lines
        if self.gp_margin_filter and self.gp_margin_filter != 'none':
            lines_data = self._filter_by_gp_margin(lines_data)

        if not lines_data:
            raise UserError(_('No data found matching the GP Margin filter criteria.'))

        self.env['gross.profit.report.line'].create(lines_data)

        return {
            'name': _('Gross Profit Report - %s') % dict(
                self._fields['report_type'].selection).get(self.report_type),
            'type': 'ir.actions.act_window',
            'res_model': 'gross.profit.report.line',
            'view_mode': 'list',
            'domain': [('wizard_id', '=', self.id)],
            'target': 'current',
        }

    def _build_detailed(self, move_lines, currency):
        lines = []
        for aml in move_lines:
            move = aml.move_id
            sign = 1 if move.move_type == 'out_invoice' else -1
            qty = aml.quantity * sign
            sale = aml.price_subtotal * sign
            cost_price = self._get_sold_goods_cost(aml, move.company_id)
            cogs = abs(aml.quantity) * cost_price * sign
            gp = sale - cogs
            margin = (gp / sale * 100) if sale else 0.0

            lines.append({
                'wizard_id': self.id,
                'product_id': aml.product_id.id,
                'product_tmpl_id': aml.product_id.product_tmpl_id.id,
                'product_categ_id': aml.product_id.categ_id.id,
                'salesperson_id': move.invoice_user_id.id or False,
                'partner_id': move.partner_id.id or False,
                'company_id': move.company_id.id,
                'invoice_id': move.id,
                'invoice_date': move.invoice_date,
                'currency_id': currency.id,
                'quantity': qty,
                'sale_amount': sale,
                'cost_amount': cogs,
                'gross_profit': gp,
                'gp_margin': round(margin, 2),
                'unit_sale_price': (sale / abs(qty)) if qty else 0.0,
                'unit_cost_price': cost_price,
            })
        return lines

    def _build_grouped(self, move_lines, currency):
        grouped = {}
        for aml in move_lines:
            move = aml.move_id
            sign = 1 if move.move_type == 'out_invoice' else -1

            key = self._get_group_key(aml, move)
            qty = aml.quantity * sign
            sale = aml.price_subtotal * sign
            cost_price = self._get_sold_goods_cost(aml, move.company_id)
            cogs = abs(aml.quantity) * cost_price * sign

            if key not in grouped:
                grouped[key] = {
                    'product_id': aml.product_id.id if self.report_type == 'product' else False,
                    'product_tmpl_id': aml.product_id.product_tmpl_id.id if self.report_type == 'product' else False,
                    'product_categ_id': aml.product_id.categ_id.id if self.report_type in ('product', 'category') else False,
                    'salesperson_id': (move.invoice_user_id.id or False) if self.report_type == 'salesperson' else False,
                    'partner_id': (move.partner_id.id or False) if self.report_type == 'customer' else False,
                    'company_id': move.company_id.id,
                    'currency_id': currency.id,
                    'quantity': 0, 'sale_amount': 0, 'cost_amount': 0,
                }

            grouped[key]['quantity'] += qty
            grouped[key]['sale_amount'] += sale
            grouped[key]['cost_amount'] += cogs

        lines = []
        for data in grouped.values():
            gp = data['sale_amount'] - data['cost_amount']
            margin = (gp / data['sale_amount'] * 100) if data['sale_amount'] else 0.0
            unit_sale = (data['sale_amount'] / data['quantity']) if data['quantity'] else 0.0
            unit_cost = (data['cost_amount'] / data['quantity']) if data['quantity'] else 0.0
            lines.append({
                'wizard_id': self.id,
                'product_id': data.get('product_id', False),
                'product_tmpl_id': data.get('product_tmpl_id', False),
                'product_categ_id': data.get('product_categ_id', False),
                'salesperson_id': data.get('salesperson_id', False),
                'partner_id': data.get('partner_id', False),
                'company_id': data.get('company_id', False),
                'currency_id': data.get('currency_id', False),
                'quantity': data['quantity'],
                'sale_amount': data['sale_amount'],
                'cost_amount': data['cost_amount'],
                'gross_profit': gp,
                'gp_margin': round(margin, 2),
                'unit_sale_price': unit_sale,
                'unit_cost_price': unit_cost,
            })
        return lines

    def _get_group_key(self, aml, move):
        multi = self._is_multi_company()
        company_id = move.company_id.id if multi else 0
        if self.report_type == 'product':
            return (aml.product_id.id, company_id)
        elif self.report_type == 'salesperson':
            return (move.invoice_user_id.id or 0, company_id)
        elif self.report_type == 'customer':
            return (move.partner_id.id or 0, company_id)
        elif self.report_type == 'category':
            return (aml.product_id.categ_id.id, company_id)
        elif self.report_type == 'company':
            return move.company_id.id
        return (aml.product_id.id, company_id)

    def _is_multi_company(self):
        """Check if the report spans multiple companies."""
        if self.company_scope == 'all':
            return True
        effective_ids = self._get_effective_company_ids()
        return len(effective_ids) > 1

    def _get_company_label(self):
        if self.company_scope == 'all':
            return 'All Selected Companies'
        elif self.company_ids:
            label = ', '.join(self.company_ids.mapped('name'))
            if self.branch_ids:
                label += ' | Branches: ' + ', '.join(self.branch_ids.mapped('name'))
            return label
        return self.env.company.name

    def action_print_pdf(self):
        self.action_generate_report()
        return self.env.ref(
            'gross_profit_report.action_report_gross_profit'
        ).report_action(self)

    def action_export_excel(self):
        self.ensure_one()
        if not xlsxwriter:
            raise UserError(_('xlsxwriter library is required for Excel export. Install it with: pip install xlsxwriter'))

        if self.date_from > self.date_to:
            raise UserError(_('Date From cannot be after Date To.'))

        if not self.line_ids:
            self.action_generate_report()

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})

        title_fmt = workbook.add_format({
            'bold': True, 'font_size': 16, 'align': 'center',
            'font_color': '#1a237e', 'bottom': 2,
        })
        header_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'align': 'center',
            'bg_color': '#1a237e', 'font_color': '#ffffff', 'border': 1,
        })
        cell_fmt = workbook.add_format({'font_size': 10, 'border': 1})
        money_fmt = workbook.add_format({'font_size': 10, 'border': 1, 'num_format': '#,##0.00'})
        pct_fmt = workbook.add_format({'font_size': 10, 'border': 1, 'num_format': '0.00"%"'})
        green_fmt = workbook.add_format({'font_size': 10, 'border': 1, 'num_format': '#,##0.00', 'font_color': '#2e7d32'})
        red_fmt = workbook.add_format({'font_size': 10, 'border': 1, 'num_format': '#,##0.00', 'font_color': '#c62828'})
        total_fmt = workbook.add_format({
            'bold': True, 'font_size': 11, 'border': 2,
            'bg_color': '#e8eaf6', 'font_color': '#1a237e',
        })
        total_money = workbook.add_format({
            'bold': True, 'font_size': 11, 'border': 2,
            'bg_color': '#e8eaf6', 'font_color': '#1a237e', 'num_format': '#,##0.00',
        })

        type_label = dict(self._fields['report_type'].selection).get(self.report_type, '')
        company_label = self._get_company_label()

        sheet = workbook.add_worksheet('Gross Profit')
        sheet.set_column('A:A', 5)
        sheet.set_column('B:B', 35)
        sheet.set_column('C:C', 20)
        sheet.set_column('D:D', 12)
        sheet.set_column('E:H', 18)

        sheet.merge_range('A1:H1', 'Gross Profit Report - %s' % type_label, title_fmt)
        sheet.merge_range('A2:H2',
            'Period: %s to %s | %s' % (
                self.date_from.strftime('%d/%m/%Y'),
                self.date_to.strftime('%d/%m/%Y'),
                company_label,
            ),
            workbook.add_format({'align': 'center', 'italic': True})
        )

        headers = ['#', 'Name', 'Category', 'Qty', 'Sales Revenue', 'COGS', 'Gross Profit', 'GP %']
        for col, h in enumerate(headers):
            sheet.write(3, col, h, header_fmt)

        row = 4
        for idx, line in enumerate(self.line_ids, 1):
            name = self._get_line_name(line)
            cat = line.product_categ_id.complete_name if line.product_categ_id else ''
            gp_f = green_fmt if line.gross_profit >= 0 else red_fmt

            sheet.write(row, 0, idx, cell_fmt)
            sheet.write(row, 1, name, cell_fmt)
            sheet.write(row, 2, cat, cell_fmt)
            sheet.write(row, 3, line.quantity, cell_fmt)
            sheet.write(row, 4, line.sale_amount, money_fmt)
            sheet.write(row, 5, line.cost_amount, money_fmt)
            sheet.write(row, 6, line.gross_profit, gp_f)
            sheet.write(row, 7, line.gp_margin, pct_fmt)
            row += 1

        sheet.write(row, 1, 'TOTAL', total_fmt)
        sheet.write(row, 2, '', total_fmt)
        sheet.write(row, 3, sum(self.line_ids.mapped('quantity')), total_fmt)
        sheet.write(row, 4, self.total_sales, total_money)
        sheet.write(row, 5, self.total_cogs, total_money)
        sheet.write(row, 6, self.total_gp, total_money)
        sheet.write(row, 7, self.total_gp_margin, total_fmt)

        workbook.close()
        output.seek(0)

        filename = 'GP_Report_%s_%s_%s.xlsx' % (self.report_type, self.date_from, self.date_to)
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(output.read()),
            'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })
        return {
            'type': 'ir.actions.act_url',
            'url': '/web/content/%s?download=true' % attachment.id,
            'target': 'self',
        }

    def _get_line_name(self, line):
        if self.report_type in ('product', 'detailed'):
            return line.product_id.display_name or 'N/A'
        elif self.report_type == 'salesperson':
            return line.salesperson_id.name or 'No Salesperson'
        elif self.report_type == 'customer':
            return line.partner_id.name or 'No Customer'
        elif self.report_type == 'category':
            return line.product_categ_id.complete_name or 'Uncategorized'
        elif self.report_type == 'company':
            return line.company_id.name or 'N/A'
        return 'N/A'
