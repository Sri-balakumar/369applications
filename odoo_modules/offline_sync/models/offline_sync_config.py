import logging
import os

from odoo import models, fields, api, tools

_logger = logging.getLogger(__name__)


class OfflineSyncConfig(models.Model):
    _name = 'offline.sync.config'
    _description = 'Offline Sync Configuration'
    _rec_name = 'company_id'

    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company, ondelete='cascade',
    )

    # ── Module filter (UI helper) ─────────────────────────────
    module_ids = fields.Many2many(
        'ir.module.module', 'offline_sync_config_module_rel',
        'config_id', 'module_id',
        string='Filter by Installed Modules',
        domain="[('state', '=', 'installed')]",
        help='Select installed apps to narrow the model list below.',
    )

    # ── Per-model config lines ────────────────────────────────
    line_ids = fields.One2many(
        'offline.sync.model.line', 'config_id',
        string='Model Configuration',
    )

    # ── Storage ───────────────────────────────────────────────
    storage_path = fields.Char(
        'Local Storage Path',
        help='Absolute path for offline data folders. '
             'Leave empty to use the default: <odoo_data_dir>/offline_sync/',
    )
    effective_storage_path = fields.Char(
        compute='_compute_effective_storage_path',
        string='Effective Storage Path',
    )

    # ── Cross-check ───────────────────────────────────────────
    cross_check_interval_hours = fields.Integer(
        'Cross-Check Interval (hours)', default=1,
    )

    # ─────────────────────────────────────────────────────────
    #  AUTO-POPULATE MODELS ON MODULE SELECTION
    # ─────────────────────────────────────────────────────────
    def action_auto_add_models(self):
        """Auto-add relevant models from the selected modules."""
        self.ensure_one()
        _logger.info('=== AUTO-ADD MODELS START ===')
        # Cleanup any existing duplicates first so the freshness check below
        # ('model.model in existing_model_names') sees a single source of truth.
        self._dedupe_model_lines_silent()
        if not self.module_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'No Modules',
                    'message': 'Please select modules first and save.',
                    'type': 'warning',
                    'sticky': False,
                },
            }

        module_names = self.module_ids.mapped('name')
        existing_model_names = set(self.line_ids.mapped('model_name'))

        # Filter prefixes for system/internal models
        skip_prefixes = (
            'ir.', 'mail.', 'bus.', 'base.', 'res.config',
            'report.', 'digest.', 'fetchmail.', 'publisher_warranty.',
            'base_import.', 'web_', '_unknown', 'iap.',
        )

        # Find models that belong to selected modules via ir.model.data
        model_data = self.env['ir.model.data'].sudo().search_read(
            [('module', 'in', module_names), ('model', '=', 'ir.model')],
            ['res_id'],
        )
        candidate_ids = list({r['res_id'] for r in model_data})

        if not candidate_ids:
            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': 'No Models Found',
                    'message': 'No models found for the selected modules.',
                    'type': 'warning',
                    'sticky': False,
                },
            }

        # Search valid ir.model records
        ir_models = self.env['ir.model'].sudo().search([
            ('id', 'in', candidate_ids),
            ('transient', '=', False),
        ])

        to_create = []
        for model in ir_models:
            if model.model in existing_model_names:
                continue
            if any(model.model.startswith(p) for p in skip_prefixes):
                continue
            to_create.append({
                'config_id': self.id,
                'model_id': model.id,
                'mode': 'online',
            })

        _logger.info('=== AUTO-ADD: %d models to create ===', len(to_create))

        created_count = 0
        failed_count = 0

        for vals in to_create:
            try:
                with self.env.cr.savepoint():
                    self.env['offline.sync.model.line'].create(vals)
                    created_count += 1
                    _logger.info('  model_id=%s created', vals['model_id'])
            except Exception as e:
                failed_count += 1
                _logger.warning('Failed to create model line for %s: %s', vals['model_id'], e)

        _logger.info('=== AUTO-ADD MODELS DONE (created=%d, failed=%d) ===', created_count, failed_count)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Models Added',
                'message': '%d model(s) added from selected modules.' % created_count,
                'type': 'success',
                'sticky': False,
            },
        }

    # ─────────────────────────────────────────────────────────
    #  AUTO-CLEANUP MODEL LINES WHEN A MODULE IS REMOVED
    # ─────────────────────────────────────────────────────────
    def write(self, vals):
        """Detect modules being removed from `module_ids` and delete the
        related model lines so the configuration stays consistent with the
        selected modules."""
        if 'module_ids' in vals:
            for rec in self:
                old_module_ids = set(rec.module_ids.ids)
                # Apply the change first so the new state is persisted
                super(OfflineSyncConfig, rec).write({'module_ids': vals['module_ids']})
                new_module_ids = set(rec.module_ids.ids)
                removed_module_ids = old_module_ids - new_module_ids
                if removed_module_ids:
                    rec._cleanup_model_lines_for_modules(removed_module_ids)
            # Drop module_ids from vals before passing the rest to super
            remaining = {k: v for k, v in vals.items() if k != 'module_ids'}
            if remaining:
                return super().write(remaining)
            return True
        return super().write(vals)

    def _cleanup_model_lines_for_modules(self, module_ids):
        """Remove offline.sync.model.line entries whose model belongs to any
        of the given modules. Only matches against installed modules — modules
        that no longer exist on the system are skipped."""
        self.ensure_one()
        if not module_ids:
            return

        modules = self.env['ir.module.module'].sudo().browse(list(module_ids)).exists()
        if not modules:
            return
        module_names = modules.mapped('name')

        # Find the ir.model records that belong to these modules
        model_data = self.env['ir.model.data'].sudo().search_read(
            [('module', 'in', module_names), ('model', '=', 'ir.model')],
            ['res_id'],
        )
        ir_model_ids = list({r['res_id'] for r in model_data})
        if not ir_model_ids:
            return

        ir_models = self.env['ir.model'].sudo().browse(ir_model_ids).exists()
        model_names_to_remove = set(ir_models.mapped('model'))

        lines_to_remove = self.line_ids.filtered(
            lambda l: l.model_name in model_names_to_remove
        )
        if lines_to_remove:
            count = len(lines_to_remove)
            line_names = lines_to_remove.mapped('model_name')
            lines_to_remove.unlink()
            _logger.info(
                'Offline Sync: removed %d model line(s) after unselecting modules %s: %s',
                count, module_names, line_names,
            )

    # ─────────────────────────────────────────────────────────
    #  DEDUPLICATE MODEL LINES
    # ─────────────────────────────────────────────────────────
    def _dedupe_model_lines_silent(self):
        """Internal: remove duplicate offline.sync.model.line rows for this
        config. Used by enable-all/auto-add before they run, so the dedup
        check ('model.model in existing_model_names') sees a single source
        of truth. Returns the number of lines removed.

        For each model_name that appears more than once, keep the row with
        the most informative state (prefer LOCAL > online, then lowest id).
        """
        self.ensure_one()
        seen = {}
        to_unlink_ids = []
        for line in self.line_ids:
            key = line.model_name
            if not key:
                continue
            if key not in seen:
                seen[key] = line
                continue
            existing = seen[key]
            # Prefer the line that's already in 'local' mode; otherwise keep
            # whichever has a lower id (oldest wins, for stability).
            if existing.mode == 'local' and line.mode != 'local':
                to_unlink_ids.append(line.id)
            elif line.mode == 'local' and existing.mode != 'local':
                to_unlink_ids.append(existing.id)
                seen[key] = line
            else:
                if line.id < existing.id:
                    to_unlink_ids.append(existing.id)
                    seen[key] = line
                else:
                    to_unlink_ids.append(line.id)

        if to_unlink_ids:
            self.env['offline.sync.model.line'].browse(to_unlink_ids).unlink()
            _logger.info(
                'Offline Sync: deduped %d duplicate model line(s) on config %s',
                len(to_unlink_ids), self.id,
            )
        return len(to_unlink_ids)

    def action_dedupe_model_lines(self):
        """Manual button: dedupe model lines and report the result via toast."""
        self.ensure_one()
        removed = self._dedupe_model_lines_silent()
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Deduplication Done',
                'message': '%d duplicate line(s) removed.' % removed,
                'type': 'success' if removed else 'info',
                'sticky': False,
            },
        }

    # ─────────────────────────────────────────────────────────
    #  ONE-CLICK: ENABLE OFFLINE FOR EVERY INSTALLED MODULE
    # ─────────────────────────────────────────────────────────
    def action_enable_all_installed_modules(self):
        """One-click setup: select every installed module, auto-add their
        models, and flip every line to LOCAL mode.

        This is the "make every app offline-capable" button — the user wanted
        a single action that doesn't require hand-picking modules.
        """
        self.ensure_one()
        _logger.info('=== ENABLE OFFLINE FOR ALL INSTALLED MODULES START ===')

        # Dedupe first so the existing_model_names check below works correctly.
        self._dedupe_model_lines_silent()

        # 1. Select every installed module
        installed = self.env['ir.module.module'].sudo().search([
            ('state', '=', 'installed'),
        ])
        self.module_ids = [(6, 0, installed.ids)]

        # 2. Reuse the existing auto-add logic to populate model lines
        skip_prefixes = (
            'ir.', 'mail.', 'bus.', 'base.', 'res.config',
            'report.', 'digest.', 'fetchmail.', 'publisher_warranty.',
            'base_import.', 'web_', '_unknown', 'iap.',
        )
        existing_model_names = set(self.line_ids.mapped('model_name'))
        module_names = installed.mapped('name')

        model_data = self.env['ir.model.data'].sudo().search_read(
            [('module', 'in', module_names), ('model', '=', 'ir.model')],
            ['res_id'],
        )
        candidate_ids = list({r['res_id'] for r in model_data})

        ir_models = self.env['ir.model'].sudo().search([
            ('id', 'in', candidate_ids),
            ('transient', '=', False),
        ])

        added_count = 0
        toggled_count = 0
        skipped_count = 0
        for model in ir_models:
            if any(model.model.startswith(p) for p in skip_prefixes):
                skipped_count += 1
                continue
            if model.model in existing_model_names:
                # Already a line — flip it to local
                line = self.line_ids.filtered(lambda l: l.model_name == model.model)
                if line and line[0].mode != 'local':
                    line[0].mode = 'local'
                    toggled_count += 1
                continue
            try:
                with self.env.cr.savepoint():
                    self.env['offline.sync.model.line'].create({
                        'config_id': self.id,
                        'model_id': model.id,
                        'mode': 'local',
                    })
                    added_count += 1
            except Exception as e:
                _logger.warning(
                    'Enable-all: failed to add model line for %s: %s',
                    model.model, e,
                )

        _logger.info(
            '=== ENABLE OFFLINE FOR ALL DONE (added=%d, switched=%d, skipped=%d) ===',
            added_count, toggled_count, skipped_count,
        )

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Offline Sync Enabled',
                'message': (
                    '%d new model(s) added, %d existing line(s) switched to LOCAL. '
                    'All installed modules are now offline-capable.'
                ) % (added_count, toggled_count),
                'type': 'success',
                'sticky': False,
            },
        }

    # ─────────────────────────────────────────────────────────
    #  COMPUTED
    # ─────────────────────────────────────────────────────────
    @api.depends('storage_path')
    def _compute_effective_storage_path(self):
        for rec in self:
            if rec.storage_path:
                rec.effective_storage_path = rec.storage_path
            else:
                rec.effective_storage_path = os.path.join(
                    tools.config.get('data_dir', '/tmp'), 'offline_sync',
                )

    # ─────────────────────────────────────────────────────────
    #  SINGLETON
    # ─────────────────────────────────────────────────────────
    @api.model
    def get_config(self, company_id=None):
        """Get or create config singleton for current company."""
        company_id = company_id or self.env.company.id
        config = self.search([('company_id', '=', company_id)], limit=1)
        if not config:
            config = self.create({'company_id': company_id})
        return config

    # ─────────────────────────────────────────────────────────
    #  STORAGE HELPERS
    # ─────────────────────────────────────────────────────────
    def get_storage_dir(self):
        """Return the resolved storage directory, creating it if needed."""
        self.ensure_one()
        path = self.effective_storage_path
        os.makedirs(path, exist_ok=True)
        return path

    def get_model_data_dir(self, model_name):
        """Return data_<model_name>/ subfolder, creating it if needed."""
        self.ensure_one()
        folder_name = 'data_' + model_name.replace('.', '_')
        path = os.path.join(self.get_storage_dir(), folder_name)
        os.makedirs(path, exist_ok=True)
        return path

    def is_model_enabled(self, model_name):
        """Check whether a model is configured for offline sync in local mode."""
        self.ensure_one()
        return bool(self.line_ids.filtered(
            lambda l: l.model_name == model_name and l.mode == 'local'
        ))

    # ─────────────────────────────────────────────────────────
    #  GLOBAL ACTIONS (buttons on config form)
    # ─────────────────────────────────────────────────────────
    def action_sync_all(self):
        """Sync all local data to online for every configured model."""
        self.ensure_one()
        engine = self.env['offline.sync.engine']
        for line in self.line_ids.filtered(lambda l: l.mode == 'local'):
            engine.sync_model_to_online(line)

    def action_delete_all_local(self):
        """Delete all local data for every configured model."""
        self.ensure_one()
        engine = self.env['offline.sync.engine']
        for line in self.line_ids:
            engine.delete_local_data(line)

    def action_cross_check_all(self):
        """Run cross-check on all configured models."""
        self.ensure_one()
        engine = self.env['offline.sync.engine']
        for line in self.line_ids:
            engine.cross_check_model(line)
