from odoo import models, api


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
                # Create a move line if none exist
                move._generate_move_line(quantity=move.product_uom_qty)
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
                        move._generate_move_line(quantity=move.product_uom_qty)
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
