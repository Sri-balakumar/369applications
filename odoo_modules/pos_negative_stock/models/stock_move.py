from odoo import models, api, fields


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    # Default all new products to storable so stock is always tracked
    type = fields.Selection(default='product')


class SaleOrderLine(models.Model):
    _inherit = 'sale.order.line'

    def _action_launch_stock_rule(self, previous_product_uom_qty=False):
        """Force consumable products to storable before stock rules run.

        This ensures pickings are created for ALL products, not just storable ones.
        Without this, consumable/service products skip stock moves entirely
        and their qty_available stays at 0 forever.
        """
        for line in self:
            if line.product_id and line.product_id.type in ('consu', 'service'):
                line.product_id.sudo().write({'type': 'product'})
        return super()._action_launch_stock_rule(previous_product_uom_qty)


class StockMove(models.Model):
    _inherit = 'stock.move'

    def _action_assign(self, force_qty=False):
        """Override to force-assign moves even when stock is insufficient.

        This allows POS sales to proceed with zero or negative stock,
        creating negative quants in the source location.
        """
        res = super()._action_assign(force_qty=force_qty)

        # For any moves still in 'confirmed' or 'waiting' state
        # (meaning they couldn't be fully reserved), force-assign them
        moves_to_force = self.filtered(
            lambda m: m.state in ('confirmed', 'waiting', 'partially_available')
            and m.picking_id
            and m.picking_id.picking_type_id.code == 'outgoing'
        )
        for move in moves_to_force:
            # Set the quantity to the demanded quantity to force the move
            for move_line in move.move_line_ids:
                move_line.quantity = move_line.quantity_product_uom
            if not move.move_line_ids:
                # Create a move line manually since _generate_move_line doesn't exist in Odoo 19
                self.env['stock.move.line'].create({
                    'move_id': move.id,
                    'product_id': move.product_id.id,
                    'product_uom_id': move.product_uom.id,
                    'location_id': move.location_id.id,
                    'location_dest_id': move.location_dest_id.id,
                    'picking_id': move.picking_id.id,
                    'quantity': move.product_uom_qty,
                })
            move.state = 'assigned'

        return res


class StockPicking(models.Model):
    _inherit = 'stock.picking'

    def action_assign(self):
        """Override to ensure pickings are always fully assigned."""
        res = super().action_assign()

        # Force-assign any remaining unassigned pickings for outgoing operations
        for picking in self:
            if (picking.state not in ('done', 'cancel')
                    and picking.picking_type_id.code == 'outgoing'):
                for move in picking.move_ids.filtered(
                    lambda m: m.state not in ('done', 'cancel', 'assigned')
                ):
                    for move_line in move.move_line_ids:
                        move_line.quantity = move_line.quantity_product_uom
                    if not move.move_line_ids:
                        self.env['stock.move.line'].create({
                            'move_id': move.id,
                            'product_id': move.product_id.id,
                            'product_uom_id': move.product_uom.id,
                            'location_id': move.location_id.id,
                            'location_dest_id': move.location_dest_id.id,
                            'picking_id': picking.id,
                            'quantity': move.product_uom_qty,
                        })
                    move.state = 'assigned'

        return res

    def _action_done(self):
        """Override to skip the insufficient quantity check on validation."""
        # Force all moves to assigned state before validation
        for picking in self:
            if picking.picking_type_id.code == 'outgoing':
                for move in picking.move_ids.filtered(
                    lambda m: m.state not in ('done', 'cancel')
                ):
                    move.quantity = move.product_uom_qty
                    move.picked = True
                    if move.state != 'assigned':
                        move.state = 'assigned'

        return super()._action_done()
