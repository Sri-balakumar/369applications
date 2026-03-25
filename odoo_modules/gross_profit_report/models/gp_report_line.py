# -*- coding: utf-8 -*-
from odoo import models, fields


class GrossProfitReportLine(models.TransientModel):
    _name = 'gross.profit.report.line'
    _description = 'Gross Profit Report Line'
    _order = 'gross_profit desc'

    wizard_id = fields.Many2one('gp.report.wizard', string='Wizard', ondelete='cascade')

    product_id = fields.Many2one('product.product', string='Product', readonly=True)
    product_tmpl_id = fields.Many2one('product.template', string='Product Template', readonly=True)
    product_categ_id = fields.Many2one('product.category', string='Product Category', readonly=True)
    salesperson_id = fields.Many2one('res.users', string='Salesperson', readonly=True)
    partner_id = fields.Many2one('res.partner', string='Customer', readonly=True)
    company_id = fields.Many2one('res.company', string='Company', readonly=True)
    invoice_id = fields.Many2one('account.move', string='Invoice', readonly=True)
    invoice_date = fields.Date(string='Invoice Date', readonly=True)
    currency_id = fields.Many2one('res.currency', string='Currency', readonly=True)

    quantity = fields.Float(string='Quantity Sold', readonly=True)
    sale_amount = fields.Monetary(string='Sales Revenue', readonly=True, currency_field='currency_id')
    cost_amount = fields.Monetary(string='Cost of Goods Sold', readonly=True, currency_field='currency_id')
    gross_profit = fields.Monetary(string='Gross Profit', readonly=True, currency_field='currency_id')
    gp_margin = fields.Float(string='GP Margin (%)', readonly=True)
    unit_sale_price = fields.Float(string='Avg. Sale Price', readonly=True)
    unit_cost_price = fields.Float(string='Avg. Cost Price', readonly=True)
