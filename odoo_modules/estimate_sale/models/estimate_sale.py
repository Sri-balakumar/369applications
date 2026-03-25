from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from datetime import date


class EstimateSale(models.Model):
    _name = 'estimate.sale'
    _description = 'Estimate Sale Entry (Without Tax)'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'date desc, id desc'

    name = fields.Char(
        string='Reference',
        required=True,
        copy=False,
        readonly=True,
        default=lambda self: _('New')
    )
    date = fields.Date(
        string='Date',
        required=True,
        default=fields.Date.context_today,
        tracking=True
    )
    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        required=True,
        tracking=True
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        required=True,
        default=lambda self: self.env.company
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        required=True,
        default=lambda self: self.env.company.currency_id
    )
    line_ids = fields.One2many(
        'estimate.sale.line',
        'sales_id',
        string='Sales Lines',
        copy=True
    )
    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled')
    ], string='Status', default='draft', tracking=True)

    amount_total = fields.Monetary(
        string='Total',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )

    # Payment Fields
    payment_line_ids = fields.One2many(
        'estimate.sale.payment.line',
        'sales_id',
        string='Payments',
        copy=True
    )
    amount_paid = fields.Monetary(
        string='Amount Paid',
        compute='_compute_payment_amounts',
        store=True,
        currency_field='currency_id'
    )
    amount_due = fields.Monetary(
        string='Amount Due',
        compute='_compute_payment_amounts',
        store=True,
        currency_field='currency_id'
    )
    is_paid = fields.Boolean(
        string='Is Paid',
        compute='_compute_payment_amounts',
        store=True
    )
    payment_state = fields.Selection([
        ('not_paid', 'Not Paid'),
        ('partial', 'Partially Paid'),
        ('paid', 'Paid'),
        ('over_paid', 'Over Paid'),
        ('invoiced', 'Fully Invoiced'),
    ], string='Payment Status', compute='_compute_payment_amounts', store=True)

    sale_order_id = fields.Many2one(
        'sale.order',
        string='Sale Order',
        readonly=True,
        copy=False
    )
    picking_id = fields.Many2one(
        'stock.picking',
        string='Delivery',
        readonly=True,
        copy=False
    )
    invoice_id = fields.Many2one(
        'account.move',
        string='Customer Invoice',
        readonly=True,
        copy=False
    )
    payment_ids = fields.Many2many(
        'account.payment',
        'estimate_sale_payment_rel',
        'estimate_sale_id',
        'payment_id',
        string='Registered Payments',
        readonly=True,
        copy=False
    )

    reference = fields.Char(string='Customer Reference')
    notes = fields.Text(string='Notes')

    auto_validate_invoice = fields.Boolean(
        string='Auto-Post Invoice',
        default=True,
    )
    auto_register_payment = fields.Boolean(
        string='Auto-Register Payment',
        default=True,
    )
    warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Warehouse',
        required=True,
        default=lambda self: self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)], limit=1
        )
    )

    pricelist_id = fields.Many2one(
        'product.pricelist',
        string='Pricelist',
        compute='_compute_pricelist_id',
        store=True,
        readonly=False,
        precompute=True,
    )

    quick_payment_method_id = fields.Many2one(
        'estimate.sale.payment.method',
        string='Payment method',
        required=True,
        domain="[('company_id', '=', company_id)]",
        default=lambda self: self.env['estimate.sale.payment.method'].get_default_payment_method(),
    )
    payment_term_id = fields.Many2one(
        'account.payment.term',
        string='Payment Terms',
        readonly=False,
        help='Payment terms for credit sales. Only applicable when payment method is Credit.',
    )
    is_credit_sale = fields.Boolean(
        compute='_compute_is_credit_sale',
        store=False,
    )

    @api.depends('partner_id')
    def _compute_pricelist_id(self):
        for record in self:
            if record.partner_id and record.partner_id.property_product_pricelist:
                record.pricelist_id = record.partner_id.property_product_pricelist
            else:
                record.pricelist_id = self.env['product.pricelist'].search(
                    [('company_id', 'in', [record.company_id.id, False])], limit=1
                )

    @api.depends('quick_payment_method_id')
    def _compute_is_credit_sale(self):
        for record in self:
            record.is_credit_sale = (
                record.quick_payment_method_id
                and record.quick_payment_method_id.is_customer_account
            )

    @api.onchange('quick_payment_method_id')
    def _onchange_quick_payment_method_id(self):
        if self.quick_payment_method_id:
            self.payment_line_ids = [(5, 0, 0)]
            if self.amount_total > 0:
                self.payment_line_ids = [(0, 0, {
                    'payment_method_id': self.quick_payment_method_id.id,
                    'amount': self.amount_total,
                })]
        else:
            self.payment_line_ids = [(5, 0, 0)]

    @api.onchange('amount_total')
    def _onchange_amount_total_update_payment(self):
        if self.quick_payment_method_id and self.payment_line_ids:
            for line in self.payment_line_ids:
                if line.payment_method_id == self.quick_payment_method_id:
                    line.amount = self.amount_total
                    break

    @api.depends('line_ids.subtotal')
    def _compute_amounts(self):
        for record in self:
            record.amount_total = sum(record.line_ids.mapped('subtotal'))

    @api.depends('payment_line_ids.amount', 'payment_line_ids.payment_method_id', 'amount_total', 'state')
    def _compute_payment_amounts(self):
        for record in self:
            paid = sum(record.payment_line_ids.mapped('amount'))
            record.amount_paid = paid
            record.amount_due = record.amount_total - paid

            is_credit_sale = any(
                line.payment_method_id.is_customer_account
                for line in record.payment_line_ids
                if line.payment_method_id
            )

            if is_credit_sale:
                record.payment_state = 'invoiced'
                record.is_paid = False
            elif paid <= 0:
                record.payment_state = 'not_paid'
                record.is_paid = False
            elif paid < record.amount_total:
                record.payment_state = 'partial'
                record.is_paid = False
            elif paid == record.amount_total:
                record.payment_state = 'paid'
                record.is_paid = True
            else:
                record.payment_state = 'over_paid'
                record.is_paid = True

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('estimate.sale') or _('New')
        return super().create(vals_list)

    def action_add_payment(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Add Payment'),
            'res_model': 'estimate.sale.payment.line',
            'view_mode': 'form',
            'target': 'new',
            'context': {
                'default_sales_id': self.id,
                'default_amount': self.amount_due,
            }
        }

    def action_set_full_payment(self):
        self.ensure_one()
        if self.state != 'draft':
            raise UserError(_('Cannot modify payments on a confirmed sale.'))

        default_method = self.env['estimate.sale.payment.method'].get_default_payment_method(
            self.company_id.id
        )
        if not default_method:
            raise UserError(_('Please configure at least one payment method.'))

        self.payment_line_ids.unlink()
        self.env['estimate.sale.payment.line'].create({
            'sales_id': self.id,
            'payment_method_id': default_method.id,
            'amount': self.amount_total,
        })
        return True

    def action_confirm(self):
        for record in self:
            if not record.partner_id:
                raise UserError(_('Please select a Customer before confirming the sale.'))

            if not record.quick_payment_method_id:
                raise UserError(_('Please select a Payment Method before confirming the sale.'))

            if not record.line_ids.filtered(lambda l: not l.display_type):
                raise UserError(_('Please add at least one product line.'))

            if record.auto_register_payment and not record.payment_line_ids:
                payment_method = record.quick_payment_method_id
                if not payment_method:
                    payment_method = self.env['estimate.sale.payment.method'].get_default_payment_method(
                        record.company_id.id
                    )
                if not payment_method:
                    raise UserError(
                        _('Please select a Payment Method or configure a default one.')
                    )
                self.env['estimate.sale.payment.line'].create({
                    'sales_id': record.id,
                    'payment_method_id': payment_method.id,
                    'amount': record.amount_total,
                })

            record_company = record.with_company(record.company_id)

            # Clean up orphaned inter-warehouse transit rules/routes
            record_company._cleanup_orphaned_transit_rules()

            so = record_company._create_sale_order()
            record.sale_order_id = so.id

            so.action_confirm()

            picking = so.picking_ids.filtered(lambda p: p.state not in ('done', 'cancel'))
            if picking:
                picking = picking[0]
                record.picking_id = picking.id
                record_company._validate_picking(picking)

            invoice = record_company._create_customer_invoice(so)
            if invoice:
                record.invoice_id = invoice.id

                if record.auto_validate_invoice:
                    invoice.action_post()

                    if record.auto_register_payment and record.payment_line_ids:
                        record_company._register_payments(invoice)

            record.state = 'done'

        return True

    def _cleanup_orphaned_transit_rules(self):
        """Remove inter-warehouse transit rules/routes that reference non-existent warehouses."""
        try:
            existing_wh_ids = self.env['stock.warehouse'].search([]).ids
            # Find and remove orphaned stock rules referencing deleted warehouses
            orphaned_rules = self.env['stock.rule'].search([
                ('route_id.name', 'ilike', 'transit'),
            ])
            for rule in orphaned_rules:
                wh_id = rule.warehouse_id.id if rule.warehouse_id else False
                if wh_id and wh_id not in existing_wh_ids:
                    rule.route_id.active = False
                    rule.active = False

            # Also deactivate any resupply routes for deleted warehouses
            transit_routes = self.env['stock.route'].search([
                ('name', 'ilike', 'transit'),
            ])
            for route in transit_routes:
                # Check if any rule on this route references a valid warehouse
                has_valid_wh = any(
                    r.warehouse_id.id in existing_wh_ids
                    for r in route.rule_ids if r.warehouse_id
                )
                if not has_valid_wh and route.rule_ids:
                    route.active = False
        except Exception:
            pass  # Don't block confirm if cleanup fails

    def _create_sale_order(self):
        self.ensure_one()

        so_lines = []
        for line in self.line_ids:
            if line.display_type:
                continue
            so_lines.append((0, 0, {
                'product_id': line.product_id.id,
                'name': line.description or line.product_id.display_name,
                'product_uom_qty': line.quantity,
                'product_uom_id': line.uom_id.id if line.uom_id else line.product_id.uom_id.id,
                'price_unit': line.price_unit,
                'tax_ids': [(5, 0, 0)],  # NO TAX - clear all taxes
            }))

        so_vals = {
            'partner_id': self.partner_id.id,
            'date_order': self.date,
            'company_id': self.company_id.id,
            'currency_id': self.currency_id.id,
            'client_order_ref': self.reference,
            'pricelist_id': self.pricelist_id.id,
            'warehouse_id': self.warehouse_id.id,
            'order_line': so_lines,
            'origin': self.name,
        }

        if self.payment_term_id:
            so_vals['payment_term_id'] = self.payment_term_id.id

        so = self.env['sale.order'].with_company(self.company_id).create(so_vals)

        if self.notes:
            so.message_post(body=self.notes, message_type='comment')

        return so

    def _validate_picking(self, picking):
        self.ensure_one()
        picking = picking.with_company(self.company_id)
        for move in picking.move_ids:
            move.quantity = move.product_uom_qty

        picking = picking.with_context(
            skip_backorder=True,
            skip_immediate=True,
            skip_sms=True,
            cancel_backorder=True,
        )
        result = picking.button_validate()

        if isinstance(result, dict) and result.get('res_model'):
            wizard_model = result.get('res_model')
            wizard_context = result.get('context', {})
            try:
                wizard = self.env[wizard_model].with_context(**wizard_context).create({
                    'pick_ids': [(4, picking.id)],
                })
                wizard.process()
            except Exception:
                pass

    def _create_customer_invoice(self, so):
        self.ensure_one()
        invoiceable_lines = so.order_line.filtered(lambda l: l.qty_to_invoice > 0)
        if not invoiceable_lines:
            return False

        invoice = so.with_company(self.company_id)._create_invoices()
        if invoice:
            invoice.write({
                'invoice_date': self.date,
                'ref': self.reference or self.name,
                'source_module': 'estimate_sale',
            })
        return invoice

    def _register_payments(self, invoice):
        self.ensure_one()

        created_payments = self.env['account.payment']

        for payment_line in self.payment_line_ids:
            if payment_line.amount <= 0:
                continue

            if payment_line.payment_method_id.is_customer_account:
                continue

            journal = payment_line.payment_method_id.journal_id

            payment_method_line = journal.inbound_payment_method_line_ids[:1]
            if not payment_method_line:
                raise UserError(
                    _('Journal "%s" has no inbound payment methods configured.\n'
                      'Go to Accounting → Configuration → Journals → %s → '
                      'Incoming Payments tab and add a payment method.',
                      journal.name, journal.name)
                )

            original_outstanding_account = payment_method_line.payment_account_id
            journal_default_account = journal.default_account_id
            need_restore = False

            if journal_default_account and original_outstanding_account != journal_default_account:
                payment_method_line.sudo().write({
                    'payment_account_id': journal_default_account.id,
                })
                need_restore = True

            try:
                PaymentRegister = self.env['account.payment.register'].with_company(
                    self.company_id
                ).with_context(
                    active_model='account.move',
                    active_ids=invoice.ids,
                )

                wizard = PaymentRegister.create({
                    'journal_id': journal.id,
                    'payment_method_line_id': payment_method_line.id,
                    'amount': payment_line.amount,
                    'payment_date': self.date,
                })

                result = wizard.action_create_payments()

                payment = False
                if isinstance(result, dict):
                    if result.get('res_id'):
                        payment = self.env['account.payment'].browse(result['res_id'])
                    elif result.get('domain'):
                        payment = self.env['account.payment'].search(
                            result['domain'], limit=1, order='id desc'
                        )
                    elif result.get('res_model') == 'account.payment':
                        payment = self.env['account.payment'].search([
                            ('partner_id', '=', self.partner_id.id),
                            ('journal_id', '=', journal.id),
                            ('amount', '=', payment_line.amount),
                        ], limit=1, order='id desc')

                if payment:
                    created_payments |= payment

            except Exception as e:
                raise UserError(
                    _('Error registering payment for method "%(method)s": %(error)s\n\n'
                      'Please check:\n'
                      '• Payment Journal "%(journal)s" is correctly configured\n'
                      '• The journal has inbound payment methods\n'
                      '• The customer has a receivable account set',
                      method=payment_line.payment_method_id.name,
                      error=str(e),
                      journal=journal.name)
                )
            finally:
                if need_restore:
                    payment_method_line.sudo().write({
                        'payment_account_id': original_outstanding_account.id if original_outstanding_account else False,
                    })

        if created_payments:
            self.payment_ids = [(6, 0, created_payments.ids)]

        return created_payments

    def action_cancel(self):
        for record in self:
            if record.state == 'done':
                raise UserError(_('Cannot cancel a completed sale. Please reverse the related documents.'))
            record.state = 'cancelled'
        return True

    def action_draft(self):
        for record in self:
            if record.state == 'cancelled':
                record.state = 'draft'
        return True

    def action_view_sale_order(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Sale Order'),
            'res_model': 'sale.order',
            'res_id': self.sale_order_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_delivery(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Delivery'),
            'res_model': 'stock.picking',
            'res_id': self.picking_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_invoice(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Customer Invoice'),
            'res_model': 'account.move',
            'res_id': self.invoice_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_payments(self):
        self.ensure_one()
        if len(self.payment_ids) == 1:
            return {
                'type': 'ir.actions.act_window',
                'name': _('Payment'),
                'res_model': 'account.payment',
                'res_id': self.payment_ids.id,
                'view_mode': 'form',
                'target': 'current',
            }
        return {
            'type': 'ir.actions.act_window',
            'name': _('Payments'),
            'res_model': 'account.payment',
            'view_mode': 'list,form',
            'domain': [('id', 'in', self.payment_ids.ids)],
            'target': 'current',
        }


class EstimateSaleLine(models.Model):
    _name = 'estimate.sale.line'
    _description = 'Estimate Sale Line (Without Tax)'
    _order = 'sequence, id'

    sequence = fields.Integer(default=10)
    display_type = fields.Selection(
        selection=[
            ('line_section', 'Section'),
            ('line_note', 'Note'),
        ],
        default=False,
    )
    name = fields.Text(string='Description')
    sales_id = fields.Many2one(
        'estimate.sale',
        string='Sales',
        required=True,
        ondelete='cascade'
    )
    product_id = fields.Many2one(
        'product.product',
        string='Product',
        domain=[('sale_ok', '=', True)]
    )
    description = fields.Char(string='Description')
    quantity = fields.Float(
        string='Quantity',
        required=True,
        default=1.0
    )
    uom_id = fields.Many2one(
        'uom.uom',
        string='Unit',
        required=True,
        compute='_compute_uom_id',
        store=True,
        readonly=False,
        precompute=True
    )
    price_unit = fields.Float(
        string='Unit Price',
        required=True,
        digits='Product Price'
    )
    # NO tax_ids field - fully tax free
    currency_id = fields.Many2one(
        related='sales_id.currency_id',
        string='Currency'
    )
    subtotal = fields.Monetary(
        string='Subtotal',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    # NO tax_amount field
    # total = subtotal (no tax)

    @api.depends('product_id')
    def _compute_uom_id(self):
        for line in self:
            if line.product_id and not line.uom_id:
                line.uom_id = line.product_id.uom_id
            elif not line.product_id:
                line.uom_id = False

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('product_id') and not vals.get('uom_id'):
                product = self.env['product.product'].browse(vals['product_id'])
                vals['uom_id'] = product.uom_id.id
        return super().create(vals_list)

    @api.depends('quantity', 'price_unit')
    def _compute_amounts(self):
        for line in self:
            line.subtotal = line.quantity * line.price_unit

    @api.onchange('product_id')
    def _onchange_product_id(self):
        if self.product_id:
            self.description = self.product_id.display_name
            self.uom_id = self.product_id.uom_id

            if self.sales_id.pricelist_id:
                self.price_unit = self.sales_id.pricelist_id._get_product_price(
                    self.product_id, self.quantity or 1.0
                )
            else:
                self.price_unit = self.product_id.lst_price
            # NO tax assignment - fully tax free

    @api.onchange('uom_id')
    def _onchange_uom_id(self):
        if self.product_id and self.uom_id:
            if self.product_id.uom_id != self.uom_id:
                self.price_unit = self.product_id.uom_id._compute_price(
                    self.product_id.lst_price,
                    self.uom_id
                )

    @api.onchange('quantity')
    def _onchange_quantity(self):
        if self.product_id and self.sales_id.pricelist_id:
            self.price_unit = self.sales_id.pricelist_id._get_product_price(
                self.product_id, self.quantity or 1.0
            )


class EstimateSalePaymentLine(models.Model):
    _name = 'estimate.sale.payment.line'
    _description = 'Estimate Sale Payment Line'
    _order = 'id'

    sales_id = fields.Many2one(
        'estimate.sale',
        string='Sales',
        required=True,
        ondelete='cascade'
    )
    payment_method_id = fields.Many2one(
        'estimate.sale.payment.method',
        string='Payment Method',
        required=True,
        domain="[('company_id', '=', parent.company_id)]"
    )
    amount = fields.Monetary(
        string='Amount',
        required=True,
        currency_field='currency_id'
    )
    currency_id = fields.Many2one(
        related='sales_id.currency_id',
        string='Currency'
    )
    company_id = fields.Many2one(
        related='sales_id.company_id',
        string='Company'
    )

    journal_type = fields.Selection(
        related='payment_method_id.journal_type',
        string='Type',
        readonly=True
    )

    note = fields.Char(string='Reference/Note')

    @api.onchange('payment_method_id')
    def _onchange_payment_method_id(self):
        if self.payment_method_id and not self.amount:
            self.amount = self.sales_id.amount_due
