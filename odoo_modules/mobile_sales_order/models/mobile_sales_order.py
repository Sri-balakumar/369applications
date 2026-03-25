from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from datetime import date
import logging

_logger = logging.getLogger(__name__)


class MobileSalesOrder(models.Model):
    _name = 'mobile.sales.order'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Mobile Sales Order'
    _order = 'date desc, id desc'

    name = fields.Char(
        string='Reference',
        required=True,
        copy=False,
        readonly=True,
        default=lambda self: _('New'),
    )
    date = fields.Date(
        string='Order Date',
        required=True,
        default=fields.Date.context_today,
    )

    # Customer
    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        required=True,
    )

    # Warehouse
    warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Warehouse',
        default=lambda self: self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)], limit=1
        ),
    )

    # Payment Method
    payment_method_id = fields.Many2one(
        'mobile.sales.payment.method',
        string='Payment Method',
    )

    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company,
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        related='company_id.currency_id',
        store=True,
        readonly=True,
    )

    # Reference & Notes
    reference = fields.Char(string='Customer Reference')
    notes = fields.Text(string='Notes')

    # Order lines
    line_ids = fields.One2many(
        'mobile.sales.order.line',
        'order_id',
        string='Order Lines',
    )

    # Linked documents
    sale_order_id = fields.Many2one(
        'sale.order',
        string='Sale Order',
        readonly=True,
        copy=False,
    )
    invoice_id = fields.Many2one(
        'account.move',
        string='Invoice',
        readonly=True,
        copy=False,
    )
    picking_id = fields.Many2one(
        'stock.picking',
        string='Delivery',
        readonly=True,
        copy=False,
    )

    # State
    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled'),
    ], string='Status', default='draft', readonly=True, copy=False)

    # Computed amounts
    amount_untaxed = fields.Float(
        string='Untaxed Amount',
        compute='_compute_amounts',
        store=True,
    )
    amount_tax = fields.Float(
        string='Taxes',
        compute='_compute_amounts',
        store=True,
    )
    amount_total = fields.Float(
        string='Total',
        compute='_compute_amounts',
        store=True,
    )

    @api.depends('line_ids.subtotal')
    def _compute_amounts(self):
        for order in self:
            amount_untaxed = sum(order.line_ids.mapped('subtotal'))
            order.amount_untaxed = amount_untaxed
            order.amount_tax = 0.0
            order.amount_total = amount_untaxed

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('mobile.sales.order') or _('New')
        return super().create(vals_list)

    # -------------------------------------------------------------------------
    # Actions
    # -------------------------------------------------------------------------

    def action_confirm(self):
        """
        One-click confirm:
        1. Create Sale Order in Odoo
        2. Confirm the Sale Order
        3. Validate the Delivery (auto-deliver)
        4. Create and Post Invoice
        """
        self.ensure_one()
        if self.state != 'draft':
            raise UserError(_('Only draft orders can be confirmed.'))
        if not self.line_ids:
            raise UserError(_('Please add at least one product line.'))

        # Step 1: Create Sale Order
        so_vals = self._prepare_sale_order_vals()
        sale_order = self.env['sale.order'].create(so_vals)
        self.sale_order_id = sale_order.id
        _logger.info('Mobile Sales Order %s: Created SO %s', self.name, sale_order.name)

        # Step 2: Confirm Sale Order
        sale_order.action_confirm()
        _logger.info('Mobile Sales Order %s: Confirmed SO %s', self.name, sale_order.name)

        # Step 3: Validate Delivery (auto-deliver all quantities)
        for picking in sale_order.picking_ids.filtered(lambda p: p.state not in ('done', 'cancel')):
            try:
                for move in picking.move_ids:
                    move.quantity = move.product_uom_qty
                picking.button_validate()
                self.picking_id = picking.id
                _logger.info('Mobile Sales Order %s: Validated picking %s', self.name, picking.name)
            except Exception as e:
                _logger.warning('Mobile Sales Order %s: Could not validate picking: %s', self.name, str(e))

        # Step 4: Create Invoice
        try:
            invoices = sale_order._create_invoices()
            if invoices:
                invoice = invoices[0] if isinstance(invoices, models.Model) else invoices
                invoice.action_post()
                self.invoice_id = invoice.id
                _logger.info('Mobile Sales Order %s: Created and posted invoice %s', self.name, invoice.name)
        except Exception as e:
            _logger.warning('Mobile Sales Order %s: Could not create invoice: %s', self.name, str(e))

        self.state = 'done'
        return True

    def action_cancel(self):
        self.ensure_one()
        if self.state == 'done':
            raise UserError(_('Cannot cancel a completed order.'))
        self.state = 'cancelled'
        return True

    def action_draft(self):
        self.ensure_one()
        if self.state != 'cancelled':
            raise UserError(_('Only cancelled orders can be set to draft.'))
        self.state = 'draft'
        return True

    # -------------------------------------------------------------------------
    # Helpers
    # -------------------------------------------------------------------------

    def _prepare_sale_order_vals(self):
        """Prepare values for sale.order creation."""
        self.ensure_one()
        order_lines = []
        for line in self.line_ids:
            order_lines.append((0, 0, {
                'product_id': line.product_id.id,
                'product_uom_qty': line.quantity,
                'price_unit': line.price_unit,
            }))

        vals = {
            'partner_id': self.partner_id.id,
            'order_line': order_lines,
            'client_order_ref': self.reference or self.name,
            'note': self.notes or '',
            'source_module': 'mobile_sales',
        }
        if self.warehouse_id:
            vals['warehouse_id'] = self.warehouse_id.id
        return vals

    # -------------------------------------------------------------------------
    # Mobile App API Methods
    # -------------------------------------------------------------------------

    @api.model
    def create_from_mobile(self, partner_id, warehouse_id=None, payment_method_id=None,
                           reference=None, notes=None, order_lines=None):
        """
        Create a mobile sales order from the mobile app.
        Called via JSON-RPC.

        :param partner_id: Customer ID
        :param warehouse_id: Warehouse ID (optional)
        :param payment_method_id: Payment method ID (optional)
        :param reference: Customer reference (optional)
        :param notes: Notes (optional)
        :param order_lines: List of dicts with product_id, qty, price_unit
        :return: dict with order id and name
        """
        if not order_lines:
            raise UserError(_('Please add at least one product line.'))

        line_vals = []
        for line in order_lines:
            line_vals.append((0, 0, {
                'product_id': line.get('product_id'),
                'quantity': line.get('qty', line.get('quantity', 1)),
                'price_unit': line.get('price_unit', 0),
            }))

        vals = {
            'partner_id': partner_id,
            'line_ids': line_vals,
            'reference': reference or '',
            'notes': notes or '',
        }
        if warehouse_id:
            vals['warehouse_id'] = warehouse_id
        if payment_method_id:
            vals['payment_method_id'] = payment_method_id

        order = self.create(vals)
        return {'id': order.id, 'name': order.name}

    @api.model
    def create_and_confirm_from_mobile(self, partner_id, warehouse_id=None,
                                        payment_method_id=None, reference=None,
                                        notes=None, order_lines=None):
        """
        Create and immediately confirm a mobile sales order.
        Creates SO → Confirms → Delivers → Invoices in one call.

        :return: dict with order id, name, sale_order_id, invoice_id
        """
        result = self.create_from_mobile(
            partner_id=partner_id,
            warehouse_id=warehouse_id,
            payment_method_id=payment_method_id,
            reference=reference,
            notes=notes,
            order_lines=order_lines,
        )
        order = self.browse(result['id'])
        order.action_confirm()

        return {
            'id': order.id,
            'name': order.name,
            'sale_order_id': order.sale_order_id.id if order.sale_order_id else False,
            'sale_order_name': order.sale_order_id.name if order.sale_order_id else '',
            'invoice_id': order.invoice_id.id if order.invoice_id else False,
            'invoice_name': order.invoice_id.name if order.invoice_id else '',
            'picking_name': order.picking_id.name if order.picking_id else '',
            'state': order.state,
        }


class MobileSalesOrderLine(models.Model):
    _name = 'mobile.sales.order.line'
    _description = 'Mobile Sales Order Line'
    _order = 'sequence, id'

    order_id = fields.Many2one(
        'mobile.sales.order',
        string='Order',
        required=True,
        ondelete='cascade',
    )
    sequence = fields.Integer(string='Sequence', default=10)

    product_id = fields.Many2one(
        'product.product',
        string='Product',
        required=True,
    )
    description = fields.Char(
        string='Description',
        compute='_compute_description',
        store=True,
    )
    quantity = fields.Float(
        string='Quantity',
        required=True,
        default=1.0,
    )
    price_unit = fields.Float(
        string='Unit Price',
        required=True,
        default=0.0,
    )
    uom_id = fields.Many2one(
        'uom.uom',
        string='Unit of Measure',
        related='product_id.uom_id',
        store=True,
        readonly=True,
    )
    subtotal = fields.Float(
        string='Subtotal',
        compute='_compute_subtotal',
        store=True,
    )

    @api.depends('product_id')
    def _compute_description(self):
        for line in self:
            line.description = line.product_id.display_name if line.product_id else ''

    @api.depends('quantity', 'price_unit')
    def _compute_subtotal(self):
        for line in self:
            line.subtotal = line.quantity * line.price_unit


class MobileSalesPaymentMethod(models.Model):
    _name = 'mobile.sales.payment.method'
    _description = 'Mobile Sales Payment Method'
    _order = 'sequence, id'

    name = fields.Char(string='Name', required=True)
    sequence = fields.Integer(string='Sequence', default=10)
    active = fields.Boolean(string='Active', default=True)
    is_default = fields.Boolean(string='Is Default', default=False)
    is_customer_account = fields.Boolean(string='Customer Account', default=False)
    journal_type = fields.Selection([
        ('cash', 'Cash'),
        ('bank', 'Bank'),
    ], string='Journal Type', default='cash')
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
