from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
from datetime import date


class QuickSalesReturn(models.Model):
    """
    Quick Sales Return - POS-style interface for processing customer returns.

    This model provides a single-screen interface to:
    1. Select a posted Customer Invoice
    2. Choose products and quantities to return
    3. Automatically create Credit Note and Return Picking
    """
    _name = 'quick.sales.return'
    _description = 'Quick Sales Return'
    _order = 'date desc, id desc'

    name = fields.Char(
        string='Reference',
        required=True,
        copy=False,
        readonly=True,
        default=lambda self: _('New')
    )
    date = fields.Date(
        string='Return Date',
        required=True,
        default=fields.Date.context_today,
    )

    # Source document
    source_invoice_id = fields.Many2one(
        'account.move',
        string='Customer Invoice',
        required=True,
        domain=[
            ('move_type', '=', 'out_invoice'),
            ('state', '=', 'posted'),
            ('source_module', 'in', ['easy_sale', 'estimate_sale']),
        ],
        help='Select the original Customer Invoice to return products from'
    )

    is_estimate = fields.Boolean(
        string='Is Estimate',
        compute='_compute_is_estimate',
        store=False,
    )

    # Auto-filled from invoice
    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        compute='_compute_from_invoice',
        store=True,
        readonly=True,
    )
    invoice_date = fields.Date(
        string='Invoice Date',
        compute='_compute_from_invoice',
        store=True,
        readonly=True,
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
        compute='_compute_from_invoice',
        store=True,
        readonly=True,
    )

    # Return lines
    line_ids = fields.One2many(
        'quick.sales.return.line',
        'return_id',
        string='Return Lines',
        copy=True
    )

    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done'),
        ('cancelled', 'Cancelled')
    ], string='Status', default='draft')

    # Computed totals
    amount_untaxed = fields.Monetary(
        string='Untaxed Amount',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    amount_tax = fields.Monetary(
        string='Taxes',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    amount_total = fields.Monetary(
        string='Total',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )

    # Created documents
    credit_note_id = fields.Many2one(
        'account.move',
        string='Credit Note',
        readonly=True,
        copy=False
    )
    return_picking_id = fields.Many2one(
        'stock.picking',
        string='Return Picking',
        readonly=True,
        copy=False
    )

    # Settings
    auto_post_credit_note = fields.Boolean(
        string='Auto-Post Credit Note',
        default=True,
        help='Automatically post the customer credit note upon confirmation'
    )
    auto_validate_picking = fields.Boolean(
        string='Auto-Validate Return',
        default=True,
        help='Automatically validate the return stock picking'
    )
    warehouse_id = fields.Many2one(
        'stock.warehouse',
        string='Warehouse',
        required=True,
        default=lambda self: self.env['stock.warehouse'].search(
            [('company_id', '=', self.env.company.id)], limit=1
        )
    )

    notes = fields.Text(string='Notes')

    # ── Computed Fields ──────────────────────────────────────────────────

    @api.depends('source_invoice_id')
    def _compute_is_estimate(self):
        for record in self:
            record.is_estimate = (
                record.source_invoice_id
                and record.source_invoice_id.source_module == 'estimate_sale'
            )

    @api.depends('source_invoice_id')
    def _compute_from_invoice(self):
        """Compute fields from the selected customer invoice"""
        for record in self:
            if record.source_invoice_id:
                record.partner_id = record.source_invoice_id.partner_id
                record.invoice_date = record.source_invoice_id.invoice_date
                record.currency_id = record.source_invoice_id.currency_id
            else:
                record.partner_id = False
                record.invoice_date = False
                record.currency_id = self.env.company.currency_id

    @api.depends('line_ids.subtotal', 'line_ids.tax_amount')
    def _compute_amounts(self):
        """Compute total amounts from return lines"""
        for record in self:
            record.amount_untaxed = sum(record.line_ids.mapped('subtotal'))
            record.amount_tax = sum(record.line_ids.mapped('tax_amount'))
            record.amount_total = record.amount_untaxed + record.amount_tax

    # ── CRUD ─────────────────────────────────────────────────────────────

    @api.model_create_multi
    def create(self, vals_list):
        """Override create to generate sequence"""
        for vals in vals_list:
            if vals.get('name', _('New')) == _('New'):
                vals['name'] = self.env['ir.sequence'].next_by_code('quick.sales.return') or _('New')
        return super().create(vals_list)

    # ── Onchange ─────────────────────────────────────────────────────────

    @api.onchange('source_invoice_id')
    def _onchange_source_invoice_id(self):
        """Load invoice lines when customer invoice is selected"""
        if self.source_invoice_id:
            self.line_ids = [(5, 0, 0)]

            lines_to_create = []
            for inv_line in self.source_invoice_id.invoice_line_ids:
                # Skip non-product lines (sections, notes, etc.)
                if inv_line.display_type in ('line_section', 'line_note'):
                    continue

                # Skip lines without products
                if not inv_line.product_id:
                    continue

                # Calculate already returned quantity for this product
                already_returned = self._get_already_returned_qty_onchange(inv_line)
                returnable_qty = inv_line.quantity - already_returned

                if returnable_qty <= 0:
                    continue  # Skip fully returned products

                # Get UoM
                uom_id = False
                if hasattr(inv_line, 'product_uom_id') and inv_line.product_uom_id:
                    uom_id = inv_line.product_uom_id.id
                elif hasattr(inv_line, 'uom_id') and inv_line.uom_id:
                    uom_id = inv_line.uom_id.id
                elif inv_line.product_id:
                    uom_id = inv_line.product_id.uom_id.id

                lines_to_create.append((0, 0, {
                    'source_invoice_line_id': inv_line.id,
                    'product_id': inv_line.product_id.id,
                    'description': inv_line.name or inv_line.product_id.display_name,
                    'sold_qty': inv_line.quantity,
                    'already_returned_qty': already_returned,
                    'returnable_qty': returnable_qty,
                    'return_qty': 0.0,
                    'uom_id': uom_id,
                    'price_unit': inv_line.price_unit,
                    'tax_ids': [(6, 0, inv_line.tax_ids.ids)] if inv_line.tax_ids else [],
                    'discount': inv_line.discount if hasattr(inv_line, 'discount') else 0.0,
                }))

            self.line_ids = lines_to_create
        else:
            self.line_ids = [(5, 0, 0)]

    def _get_already_returned_qty_onchange(self, invoice_line):
        """
        Calculate already returned quantity for an invoice line (onchange version).
        Looks at all posted credit notes linked to the original invoice.
        """
        already_returned = 0.0

        # Find all credit notes linked to this invoice
        credit_notes = self.env['account.move'].search([
            ('move_type', '=', 'out_refund'),
            ('state', '=', 'posted'),
            ('reversed_entry_id', '=', invoice_line.move_id.id),
        ])

        for cn in credit_notes:
            for cn_line in cn.invoice_line_ids:
                if (cn_line.product_id == invoice_line.product_id and
                        cn_line.price_unit == invoice_line.price_unit):
                    already_returned += cn_line.quantity

        return already_returned

    # ── Button Actions ───────────────────────────────────────────────────

    def _load_invoice_lines(self):
        """Load all product lines from the source invoice"""
        self.ensure_one()
        self.line_ids = [(5, 0, 0)]

        lines_to_create = []
        for inv_line in self.source_invoice_id.invoice_line_ids:
            if inv_line.display_type in ('line_section', 'line_note'):
                continue
            if not inv_line.product_id:
                continue

            already_returned = self._get_already_returned_qty(inv_line)
            returnable_qty = inv_line.quantity - already_returned

            if returnable_qty <= 0:
                continue

            uom_id = False
            if hasattr(inv_line, 'product_uom_id') and inv_line.product_uom_id:
                uom_id = inv_line.product_uom_id.id
            elif hasattr(inv_line, 'uom_id') and inv_line.uom_id:
                uom_id = inv_line.uom_id.id
            elif inv_line.product_id:
                uom_id = inv_line.product_id.uom_id.id

            lines_to_create.append((0, 0, {
                'source_invoice_line_id': inv_line.id,
                'product_id': inv_line.product_id.id,
                'description': inv_line.name or inv_line.product_id.display_name,
                'sold_qty': inv_line.quantity,
                'already_returned_qty': already_returned,
                'returnable_qty': returnable_qty,
                'return_qty': 0.0,
                'uom_id': uom_id,
                'price_unit': inv_line.price_unit,
                'tax_ids': [(6, 0, inv_line.tax_ids.ids)] if inv_line.tax_ids else [],
                'discount': inv_line.discount if hasattr(inv_line, 'discount') else 0.0,
            }))

        self.line_ids = lines_to_create

    def _get_already_returned_qty(self, invoice_line):
        """
        Calculate already returned quantity for an invoice line.
        Looks at all posted credit notes linked to the original invoice.
        """
        already_returned = 0.0

        credit_notes = self.env['account.move'].search([
            ('move_type', '=', 'out_refund'),
            ('state', '=', 'posted'),
            ('reversed_entry_id', '=', invoice_line.move_id.id),
        ])

        for cn in credit_notes:
            for cn_line in cn.invoice_line_ids:
                if (cn_line.product_id == invoice_line.product_id and
                        cn_line.price_unit == invoice_line.price_unit):
                    already_returned += cn_line.quantity

        return already_returned

    def action_load_lines(self):
        """Button action to reload lines from invoice"""
        self.ensure_one()
        if not self.source_invoice_id:
            raise UserError(_('Please select a Customer Invoice first.'))
        self._load_invoice_lines()
        return True

    def action_return_full(self):
        """Set all lines to return full returnable quantity"""
        self.ensure_one()
        for line in self.line_ids:
            line.return_qty = line.returnable_qty
        return True

    # ── Confirm Flow ─────────────────────────────────────────────────────

    def action_confirm(self):
        """
        Main confirmation action - creates Credit Note and Return Picking atomically.
        """
        for record in self:
            # Safety check: if lines have no product data (onchange persistence issue),
            # auto-reload them from the invoice before proceeding
            if record.source_invoice_id and record.line_ids:
                bad_lines = record.line_ids.filtered(lambda l: not l.product_id)
                if bad_lines:
                    # Capture return quantities by position index (order preserved)
                    return_qtys_by_index = []
                    for line in record.line_ids:
                        return_qtys_by_index.append(line.return_qty)

                    # Reload lines from invoice (server-side, creates real DB records)
                    record._load_invoice_lines()

                    # Restore return quantities by position
                    reloaded_lines = record.line_ids.sorted('sequence')
                    for idx, line in enumerate(reloaded_lines):
                        if idx < len(return_qtys_by_index) and return_qtys_by_index[idx] > 0:
                            line.return_qty = min(return_qtys_by_index[idx], line.returnable_qty)

            record._validate_return()
            record_company = record.with_company(record.company_id)

            # 1. Create Credit Note
            credit_note = record_company._create_credit_note()
            record.credit_note_id = credit_note.id

            # 2. Create Return Picking (customer returns stock to us)
            return_picking = record_company._create_return_picking()
            record.return_picking_id = return_picking.id

            # 3. Auto-post credit note if configured
            if record.auto_post_credit_note:
                credit_note.action_post()

                # Auto-reconcile credit note with original invoice
                try:
                    receivable_lines = (credit_note + record.source_invoice_id).line_ids.filtered(
                        lambda l: l.account_id.account_type == 'asset_receivable'
                        and not l.reconciled
                    )
                    if receivable_lines:
                        receivable_lines.reconcile()
                except Exception:
                    pass  # Don't block if reconciliation fails

            # 4. Auto-validate picking if configured
            if record.auto_validate_picking and return_picking:
                record_company._validate_return_picking(return_picking)

            record.state = 'done'

        return True

    def _validate_return(self):
        """Validate the return before processing"""
        self.ensure_one()

        lines_to_return = self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0)
        if not lines_to_return:
            raise UserError(_('Please enter at least one return quantity.'))

        for line in lines_to_return:
            if line.return_qty > line.returnable_qty:
                raise ValidationError(_(
                    'Return quantity for "%s" (%.2f) exceeds returnable quantity (%.2f).\n'
                    'Sold: %.2f, Already Returned: %.2f'
                ) % (
                    line.product_id.display_name,
                    line.return_qty,
                    line.returnable_qty,
                    line.sold_qty,
                    line.already_returned_qty
                ))
            if line.return_qty < 0:
                raise ValidationError(_(
                    'Return quantity for "%s" cannot be negative.'
                ) % line.product_id.display_name)

    # ── Credit Note Creation ─────────────────────────────────────────────

    def _create_credit_note(self):
        """
        Create a Customer Credit Note linked to the original invoice.
        Uses standard Odoo account.move with move_type='out_refund'
        """
        self.ensure_one()

        invoice_lines = []
        for line in self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0):
            invoice_lines.append((0, 0, {
                'product_id': line.product_id.id,
                'name': line.description or line.product_id.display_name,
                'quantity': line.return_qty,
                'product_uom_id': line.uom_id.id if line.uom_id else line.product_id.uom_id.id,
                'price_unit': line.price_unit,
                'tax_ids': [(6, 0, line.tax_ids.ids)] if line.tax_ids else [],
                'discount': line.discount or 0.0,
            }))

        credit_note_vals = {
            'move_type': 'out_refund',
            'partner_id': self.partner_id.id,
            'invoice_date': self.date,
            'date': self.date,
            'currency_id': self.currency_id.id,
            'company_id': self.company_id.id,
            'reversed_entry_id': self.source_invoice_id.id,
            'ref': _('Return: %s - %s') % (self.source_invoice_id.name or '', self.name),
            'invoice_origin': self.source_invoice_id.name,
            'invoice_line_ids': invoice_lines,
            'narration': self.notes,
        }

        credit_note = self.env['account.move'].with_company(self.company_id).create(credit_note_vals)

        # Post message on original invoice
        self.source_invoice_id.message_post(
            body=_('Sales Return "%s" created Credit Note: <a href="#">%s</a>') % (
                self.name, credit_note.name or 'Draft'
            )
        )

        return credit_note

    # ── Return Picking Creation ──────────────────────────────────────────

    def _create_return_picking(self):
        """
        Create a return stock picking from the original delivery(s).
        For sales returns, goods come BACK from customer TO warehouse.
        """
        self.ensure_one()

        # Get the original delivery(s) related to the invoice
        original_pickings = self._get_original_pickings()

        if not original_pickings:
            return self._create_direct_return_picking()

        return self._create_return_from_picking(original_pickings[0])

    def _get_original_pickings(self):
        """
        Find the original outgoing stock picking(s) related to the invoice.
        """
        self.ensure_one()

        pickings = self.env['stock.picking']

        # Method 1: Through sale order link via invoice_origin
        if self.source_invoice_id.invoice_origin:
            sale_orders = self.env['sale.order'].search([
                ('name', 'in', self.source_invoice_id.invoice_origin.split(', ')),
                ('company_id', '=', self.company_id.id),
            ])
            if sale_orders:
                pickings = sale_orders.mapped('picking_ids').filtered(
                    lambda p: p.state == 'done' and p.picking_type_id.code == 'outgoing'
                )

        # Method 2: Through sale.order linked directly
        if not pickings and hasattr(self.source_invoice_id, 'line_ids'):
            sale_line_ids = self.source_invoice_id.line_ids.mapped('sale_line_ids')
            if sale_line_ids:
                sale_orders = sale_line_ids.mapped('order_id')
                if sale_orders:
                    pickings = sale_orders.mapped('picking_ids').filtered(
                        lambda p: p.state == 'done' and p.picking_type_id.code == 'outgoing'
                    )

        return pickings

    def _create_return_from_picking(self, original_picking):
        """
        Create a return picking based on the original delivery.
        Goods move from Customer Location back to Stock Location.
        """
        self.ensure_one()

        # Get the return picking type
        return_picking_type = original_picking.picking_type_id.return_picking_type_id
        if not return_picking_type:
            # Fallback to incoming type (receipt)
            return_picking_type = self.warehouse_id.in_type_id

        # Create the return picking
        return_picking_vals = {
            'picking_type_id': return_picking_type.id,
            'partner_id': self.partner_id.id,
            'location_id': original_picking.location_dest_id.id,  # Customer location
            'location_dest_id': original_picking.location_id.id,  # Back to stock
            'origin': _('%s (Return from %s)') % (self.name, original_picking.name),
            'company_id': self.company_id.id,
            'move_ids': [],
        }

        move_vals = []
        for line in self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0):
            # Find the original move for this product
            original_move = original_picking.move_ids.filtered(
                lambda m: m.product_id == line.product_id and m.state == 'done'
            )

            uom_id = line.uom_id.id if line.uom_id else line.product_id.uom_id.id

            if original_move:
                original_move = original_move[0]
                move_vals.append((0, 0, {
                    'product_id': line.product_id.id,
                    'description_picking': line.product_id.display_name,
                    'product_uom_qty': line.return_qty,
                    'product_uom': uom_id,
                    'location_id': original_picking.location_dest_id.id,
                    'location_dest_id': original_picking.location_id.id,
                    'origin_returned_move_id': original_move.id,
                    'procure_method': 'make_to_stock',
                }))
            else:
                move_vals.append((0, 0, {
                    'product_id': line.product_id.id,
                    'description_picking': line.product_id.display_name,
                    'product_uom_qty': line.return_qty,
                    'product_uom': uom_id,
                    'location_id': original_picking.location_dest_id.id,
                    'location_dest_id': original_picking.location_id.id,
                    'procure_method': 'make_to_stock',
                }))

        return_picking_vals['move_ids'] = move_vals

        return_picking = self.env['stock.picking'].with_company(self.company_id).create(return_picking_vals)
        return_picking.action_confirm()

        return return_picking

    def _create_direct_return_picking(self):
        """
        Create a return picking directly without linking to original delivery.
        Used when original delivery cannot be found.
        Goods come IN from customer location to stock.
        """
        self.ensure_one()

        # Use the warehouse's incoming type for returns
        picking_type = self.warehouse_id.in_type_id

        # Customer location
        customer_location = self.env.ref('stock.stock_location_customers')

        # Stock location
        stock_location = self.warehouse_id.lot_stock_id

        return_picking_vals = {
            'picking_type_id': picking_type.id,
            'partner_id': self.partner_id.id,
            'location_id': customer_location.id,
            'location_dest_id': stock_location.id,
            'origin': _('%s (Return from %s)') % (self.name, self.source_invoice_id.name),
            'company_id': self.company_id.id,
            'move_ids': [],
        }

        move_vals = []
        for line in self.line_ids.filtered(lambda l: l.product_id and l.return_qty > 0):
            uom_id = line.uom_id.id if line.uom_id else line.product_id.uom_id.id
            move_vals.append((0, 0, {
                'product_id': line.product_id.id,
                'description_picking': line.product_id.display_name,
                'product_uom_qty': line.return_qty,
                'product_uom': uom_id,
                'location_id': customer_location.id,
                'location_dest_id': stock_location.id,
                'procure_method': 'make_to_stock',
            }))

        return_picking_vals['move_ids'] = move_vals

        return_picking = self.env['stock.picking'].with_company(self.company_id).create(return_picking_vals)
        return_picking.action_confirm()

        return return_picking

    def _validate_return_picking(self, picking):
        """Auto-validate the return stock picking"""
        self.ensure_one()
        picking = picking.with_company(self.company_id)

        # Set quantities done
        for move in picking.move_ids:
            move.quantity = move.product_uom_qty

        # Validate with skip_backorder context
        picking = picking.with_context(
            skip_backorder=True,
            skip_immediate=True,
            skip_sms=True,
            cancel_backorder=True,
        )
        result = picking.button_validate()

        # Handle wizard if returned
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

    # ── State Actions ────────────────────────────────────────────────────

    def action_cancel(self):
        """Cancel the return"""
        for record in self:
            if record.state == 'done':
                raise UserError(_(
                    'Cannot cancel a completed return. '
                    'Please reverse the Credit Note and Return Picking manually.'
                ))
            record.state = 'cancelled'
        return True

    def action_draft(self):
        """Reset to draft"""
        for record in self:
            if record.state == 'cancelled':
                record.state = 'draft'
        return True

    # ── Smart Button Actions ─────────────────────────────────────────────

    def action_view_credit_note(self):
        """View the created credit note"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Customer Credit Note'),
            'res_model': 'account.move',
            'res_id': self.credit_note_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_return_picking(self):
        """View the return stock picking"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Return Picking'),
            'res_model': 'stock.picking',
            'res_id': self.return_picking_id.id,
            'view_mode': 'form',
            'target': 'current',
        }

    def action_view_source_invoice(self):
        """View the source customer invoice"""
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': _('Customer Invoice'),
            'res_model': 'account.move',
            'res_id': self.source_invoice_id.id,
            'view_mode': 'form',
            'target': 'current',
        }


class QuickSalesReturnLine(models.Model):
    """
    Quick Sales Return Line - Individual product line in a return.
    """
    _name = 'quick.sales.return.line'
    _description = 'Quick Sales Return Line'
    _order = 'sequence, id'

    sequence = fields.Integer(default=10)
    return_id = fields.Many2one(
        'quick.sales.return',
        string='Return',
        required=True,
        ondelete='cascade'
    )
    source_invoice_line_id = fields.Many2one(
        'account.move.line',
        string='Source Invoice Line',
        readonly=True,
        help='The original invoice line this return relates to'
    )

    # Product info
    product_id = fields.Many2one(
        'product.product',
        string='Product',
        readonly=True,
    )
    description = fields.Char(string='Description', readonly=True)

    # Quantities
    sold_qty = fields.Float(
        string='Sold Qty',
        readonly=True,
        digits='Product Unit of Measure',
        help='Original quantity sold'
    )
    already_returned_qty = fields.Float(
        string='Already Returned',
        readonly=True,
        digits='Product Unit of Measure',
        help='Quantity already returned in previous returns'
    )
    returnable_qty = fields.Float(
        string='Returnable Qty',
        readonly=True,
        digits='Product Unit of Measure',
        help='Maximum quantity that can be returned'
    )
    return_qty = fields.Float(
        string='Return Qty',
        required=True,
        default=0.0,
        digits='Product Unit of Measure',
        help='Quantity to return (enter the quantity you want to return)'
    )

    uom_id = fields.Many2one(
        'uom.uom',
        string='Unit',
        readonly=True,
    )

    # Pricing
    price_unit = fields.Float(
        string='Unit Price',
        readonly=True,
        digits='Product Price'
    )
    discount = fields.Float(
        string='Discount (%)',
        readonly=True,
        digits='Discount',
        default=0.0
    )
    tax_ids = fields.Many2many(
        'account.tax',
        'quick_sales_return_line_tax_rel',
        'line_id',
        'tax_id',
        string='Taxes',
        readonly=True,
    )

    # Currency
    currency_id = fields.Many2one(
        related='return_id.currency_id',
        string='Currency'
    )

    # Computed amounts
    subtotal = fields.Monetary(
        string='Subtotal',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    tax_amount = fields.Monetary(
        string='Tax Amount',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )
    total = fields.Monetary(
        string='Total',
        compute='_compute_amounts',
        store=True,
        currency_field='currency_id'
    )

    # Lot/Serial tracking (optional)
    lot_id = fields.Many2one(
        'stock.lot',
        string='Lot/Serial',
        domain="[('product_id', '=', product_id)]",
        help='Select the lot/serial number to return (if tracked)'
    )
    tracking = fields.Selection(
        related='product_id.tracking',
        string='Tracking',
        readonly=True
    )

    @api.depends('return_qty', 'price_unit', 'discount', 'tax_ids')
    def _compute_amounts(self):
        """Compute line amounts based on return quantity"""
        for line in self:
            price_after_discount = line.price_unit * (1 - (line.discount or 0.0) / 100.0)
            line.subtotal = line.return_qty * price_after_discount

            if line.tax_ids and line.return_qty:
                taxes = line.tax_ids.compute_all(
                    price_after_discount,
                    line.currency_id,
                    line.return_qty,
                    product=line.product_id,
                    partner=line.return_id.partner_id
                )
                line.tax_amount = taxes['total_included'] - taxes['total_excluded']
                line.total = taxes['total_included']
            else:
                line.tax_amount = 0.0
                line.total = line.subtotal

    @api.constrains('return_qty', 'returnable_qty')
    def _check_return_qty(self):
        """Ensure return quantity doesn't exceed returnable quantity"""
        for line in self:
            if not line.product_id:
                continue
            if line.return_qty < 0:
                raise ValidationError(_(
                    'Return quantity for "%s" cannot be negative.'
                ) % line.product_id.display_name)
            if line.returnable_qty > 0 and line.return_qty > line.returnable_qty:
                raise ValidationError(_(
                    'Return quantity for "%s" (%.2f) exceeds returnable quantity (%.2f).'
                ) % (line.product_id.display_name, line.return_qty, line.returnable_qty))

    @api.onchange('return_qty')
    def _onchange_return_qty(self):
        """Validate return quantity on change"""
        if self.return_qty < 0:
            return {'warning': {
                'title': _('Invalid Quantity'),
                'message': _('Return quantity cannot be negative.')
            }}
        if self.returnable_qty and self.return_qty > self.returnable_qty:
            self.return_qty = self.returnable_qty
            return {'warning': {
                'title': _('Quantity Adjusted'),
                'message': _('Return quantity has been set to maximum returnable quantity (%.2f).') % self.returnable_qty
            }}
