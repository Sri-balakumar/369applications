import logging
import os

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class OfflineSyncModelLine(models.Model):
    _name = 'offline.sync.model.line'
    _description = 'Offline Sync Model Line'
    _rec_name = 'model_name'

    config_id = fields.Many2one(
        'offline.sync.config', string='Configuration',
        required=True, ondelete='cascade',
    )
    model_id = fields.Many2one(
        'ir.model', string='Model', required=True, ondelete='cascade',
        domain="[('transient', '=', False)]",
    )
    model_name = fields.Char(
        related='model_id.model', store=True, string='Technical Name',
    )

    # ── Toggle ────────────────────────────────────────────────
    mode = fields.Selection([
        ('online', 'Online'),
        ('local', 'Local'),
    ], string='Mode', default='online', required=True)

    # ── Counts ────────────────────────────────────────────────
    local_record_count = fields.Integer(
        'Local Records', compute='_compute_local_record_count',
    )
    online_record_count = fields.Integer(
        'Online Records', compute='_compute_online_record_count',
    )

    # ── Sync info ─────────────────────────────────────────────
    last_sync_date = fields.Datetime('Last Sync')
    last_cross_check_date = fields.Datetime('Last Cross-Check')
    cross_check_status = fields.Selection([
        ('pending', 'Pending'),
        ('match', 'Match'),
        ('mismatch', 'Mismatch'),
    ], string='Cross-Check', default='pending')
    cross_check_detail = fields.Text('Cross-Check Detail')

    # ─────────────────────────────────────────────────────────
    #  COMPUTED COUNTS
    # ─────────────────────────────────────────────────────────
    @api.depends('model_name')
    def _compute_local_record_count(self):
        for rec in self:
            rec.local_record_count = 0
            if not rec.model_name or not rec.config_id:
                continue
            # flush=False: plain SQL savepoint only, does NOT call cr.clear()
            # cr.clear() wipes the ORM cache including our default assignment above
            try:
                with self.env.cr.savepoint(flush=False):
                    rec.local_record_count = self.env['offline.sync.queue'].search_count([
                        ('model_name', '=', rec.model_name),
                        ('state', '=', 'pending'),
                    ])
            except Exception:
                pass

    @api.depends('model_name')
    def _compute_online_record_count(self):
        for rec in self:
            rec.online_record_count = 0
            if not rec.model_name or rec.model_name not in self.env:
                continue
            try:
                with self.env.cr.savepoint(flush=False):
                    rec.online_record_count = self.env[rec.model_name].sudo().search_count([])
            except Exception:
                pass

    # ─────────────────────────────────────────────────────────
    #  BUTTON ACTIONS
    # ─────────────────────────────────────────────────────────
    def action_toggle_mode(self):
        """Toggle between local and online mode."""
        for rec in self:
            rec.mode = 'online' if rec.mode == 'local' else 'local'

    def action_sync_to_online(self):
        """Sync all local records for this model to Odoo."""
        self.ensure_one()
        self.env['offline.sync.engine'].sync_model_to_online(self)

    def action_delete_local(self):
        """Delete all local data (files + synced queue entries) for this model."""
        self.ensure_one()
        self.env['offline.sync.engine'].delete_local_data(self)

    def action_cross_check(self):
        """Run cross-check for this model."""
        self.ensure_one()
        self.env['offline.sync.engine'].cross_check_model(self)
