import uuid

from odoo import models, fields, api


class OfflineSyncQueue(models.Model):
    _name = 'offline.sync.queue'
    _description = 'Offline Sync Queue Entry'
    _order = 'queued_at asc'

    name = fields.Char(
        'Reference', required=True, copy=False, readonly=True, default='New',
    )
    unique_id = fields.Char(
        'Unique ID', required=True, index=True, copy=False,
        default=lambda self: str(uuid.uuid4()),
    )
    line_id = fields.Many2one(
        'offline.sync.model.line', string='Model Line', ondelete='set null',
    )
    model_id = fields.Many2one(
        'ir.model', string='Target Model', required=True, ondelete='cascade',
    )
    model_name = fields.Char(
        related='model_id.model', store=True, string='Model Technical Name',
    )
    record_data = fields.Text('Record Data (JSON)', required=True)

    # Operation type — 'create' is the original behaviour (build a new record
    # from `record_data`). 'method' replays a method call on an existing
    # record; in that case `record_data` is JSON of the form
    # `{"record_id": <int>, "method": "<name>", "args": [...], "kwargs": {...}}`.
    # Existing rows default to 'create' so no migration is needed.
    operation = fields.Selection([
        ('create', 'Create'),
        ('method', 'Method Call'),
    ], string='Operation', default='create', required=True, index=True)

    state = fields.Selection([
        ('pending', 'Pending'),
        ('synced', 'Synced'),
        ('failed', 'Failed'),
    ], string='Status', default='pending', index=True)

    synced_record_id = fields.Integer('Created Record ID')
    error_message = fields.Text('Last Error')
    file_path = fields.Char('Source File Path')

    queued_at = fields.Datetime('Queued At', default=fields.Datetime.now)
    synced_at = fields.Datetime('Synced At')

    company_id = fields.Many2one(
        'res.company', default=lambda self: self.env.company,
    )

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'offline.sync.queue'
                ) or 'SYNC-%s' % fields.Datetime.now()
        return super().create(vals_list)

    def action_retry(self):
        """Reset failed records back to pending for re-sync."""
        for rec in self.filtered(lambda r: r.state == 'failed'):
            rec.write({'state': 'pending', 'error_message': False})
