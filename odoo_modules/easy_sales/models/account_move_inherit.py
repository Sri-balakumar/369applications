from odoo import models, fields, api


class AccountMoveSourceModule(models.Model):
    _inherit = 'account.move'

    source_module = fields.Char(
        string='Source Module',
        index=True,
        copy=False,
        help='Technical field to identify which module created this invoice/bill',
    )

    # Stub required by a DB-stored view that checks for draft invoices with
    # duplicate reference numbers. Computes sibling draft moves sharing the
    # same name/journal so the view expression evaluates correctly.
    is_draft_duplicated_ref_ids = fields.Many2many(
        'account.move',
        relation='account_move_draft_dup_ref_rel',
        column1='move_id', column2='dup_id',
        string='Duplicate Draft References',
        compute='_compute_is_draft_duplicated_ref_ids',
        store=False,
    )

    @api.depends('name', 'state', 'move_type', 'journal_id')
    def _compute_is_draft_duplicated_ref_ids(self):
        for move in self:
            if not move.name or move.name == '/' or move.state != 'draft':
                move.is_draft_duplicated_ref_ids = self.env['account.move']
                continue
            move.is_draft_duplicated_ref_ids = self.env['account.move'].search([
                ('name', '=', move.name),
                ('move_type', '=', move.move_type),
                ('journal_id', '=', move.journal_id.id),
                ('state', '=', 'draft'),
                ('id', '!=', move.id),
            ])
