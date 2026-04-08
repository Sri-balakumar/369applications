import json
import logging
import os
import uuid as uuid_lib
from urllib.request import urlopen
from urllib.error import URLError

from odoo import models, api, fields
from odoo.exceptions import UserError

_logger = logging.getLogger(__name__)


class OfflineSyncEngine(models.AbstractModel):
    _name = 'offline.sync.engine'
    _description = 'Offline Sync Engine'

    # ─────────────────────────────────────────────────────────
    #  STORE OFFLINE
    # ─────────────────────────────────────────────────────────
    @api.model
    def store_offline(self, model_name, values, company_id=None,
                      auto_enable=False, operation='create'):
        """
        Store an offline write as a JSON file and a queue entry.

        Called by other modules when the model is in 'local' mode.

        Operations:
          - 'create' (default): `values` is the dict of fields for a new record.
          - 'method': `values` should be `{record_id, method, args, kwargs}`.
            On replay, the engine browses the record and calls the method.

        If auto_enable=True, automatically enables the model for offline sync.
        Returns the unique_id of the queued entry.
        """
        config = self.env['offline.sync.config'].get_config(company_id)
        if not config.is_model_enabled(model_name):
            if auto_enable:
                self._auto_enable_model(config, model_name)
            else:
                raise UserError(
                    'Model %s is not enabled for offline sync (local mode).' % model_name
                )

        unique_id = str(uuid_lib.uuid4())
        payload = {
            'unique_id': unique_id,
            'model': model_name,
            'operation': operation,
            'values': values,
            'queued_at': fields.Datetime.now().isoformat(),
            'company_id': company_id or self.env.company.id,
        }

        # Write JSON file
        data_dir = config.get_model_data_dir(model_name)
        file_path = os.path.join(data_dir, '%s.json' % unique_id)
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(payload, f, indent=2, default=str)

        # Find the model line. Defensive `[:1]` because duplicate lines may
        # exist for the same model_name (the auto-add and enable-all actions
        # historically allowed dupes). Without [:1] we'd hit
        # "Expected singleton" when calling line.id below.
        line = config.line_ids.filtered(
            lambda l: l.model_name == model_name
        )[:1]
        ir_model = self.env['ir.model'].search(
            [('model', '=', model_name)], limit=1,
        )

        # Create queue entry
        self.env['offline.sync.queue'].create({
            'unique_id': unique_id,
            'line_id': line.id if line else False,
            'model_id': ir_model.id,
            'record_data': json.dumps(values, default=str),
            'operation': operation,
            'state': 'pending',
            'file_path': file_path,
        })

        _logger.info(
            'Offline Sync: stored record for %s (uid=%s)', model_name, unique_id,
        )
        return unique_id

    @api.model
    def _replay_method_call(self, model_obj, model_name, raw_values):
        """Replay a method call queued by the mobile app.

        Expects raw_values to be:
            {"record_id": <int>, "method": "<name>",
             "args": [...], "kwargs": {...}}

        Returns the record id (unchanged — method calls don't create new
        records, they mutate existing ones).
        """
        if not isinstance(raw_values, dict):
            raise UserError(
                "Method-call payload must be a JSON object, got %s"
                % type(raw_values).__name__
            )

        record_id = raw_values.get('record_id')
        method = raw_values.get('method')
        args = raw_values.get('args') or []
        kwargs = raw_values.get('kwargs') or {}

        if not isinstance(record_id, int) or record_id <= 0:
            raise UserError(
                "Method-call payload must include a positive 'record_id'; "
                "got %r" % (record_id,)
            )
        if not method or not isinstance(method, str):
            raise UserError(
                "Method-call payload must include a 'method' name; got %r"
                % (method,)
            )
        # Hard guardrail: only public action_* / button_* methods can be
        # replayed. This stops a hostile or buggy mobile build from invoking
        # arbitrary internals like _unlink, _read, write, etc.
        if not (method.startswith('action_') or method.startswith('button_')):
            raise UserError(
                "Method-call replay only allows action_*/button_* methods; "
                "got '%s'" % method
            )

        record = model_obj.browse(record_id).exists()
        if not record:
            raise UserError(
                "%s record id=%s not found (was it deleted?)"
                % (model_name, record_id)
            )

        getattr(record, method)(*args, **kwargs)
        return record_id

    @api.model
    def _validate_no_sentinels(self, model_name, values):
        """Refuse to create a record whose payload still contains the
        OFFLINE_QUEUED_ID sentinel (-1) in any many2one slot. This usually
        means the entry was queued before the dependency-rewrite logic was
        deployed and its parent record never got remapped to a real id.
        Raising here gives the user a clear, actionable error in the queue
        UI instead of a Postgres FK violation that aborts the transaction.
        """
        if not isinstance(values, dict):
            return
        sentinels = []
        for k, v in values.items():
            if v == -1:
                sentinels.append(k)
        if sentinels:
            raise UserError(
                "Cannot sync %s: the following field(s) still hold the "
                "offline placeholder id -1 because the parent record was "
                "queued under a previous version of the mobile app and "
                "never got remapped: %s. Delete this queue entry and "
                "recreate it from the mobile app." % (
                    model_name, ', '.join(sentinels),
                )
            )

    @api.model
    def _auto_enable_model(self, config, model_name):
        """Auto-create a model line in LOCAL mode for the given model."""
        ir_model = self.env['ir.model'].search(
            [('model', '=', model_name)], limit=1,
        )
        if not ir_model:
            raise UserError('Model %s not found.' % model_name)

        existing = config.line_ids.filtered(lambda l: l.model_name == model_name)
        if existing:
            existing.write({'mode': 'local'})
        else:
            self.env['offline.sync.model.line'].create({
                'config_id': config.id,
                'model_id': ir_model.id,
                'mode': 'local',
            })
        _logger.info('Offline Sync: auto-enabled model %s for offline sync', model_name)

    # ─────────────────────────────────────────────────────────
    #  SYNC MODEL TO ONLINE
    # ─────────────────────────────────────────────────────────
    def sync_model_to_online(self, model_line):
        """
        Sync all pending local records for the given model line into Odoo.
        """
        pending = self.env['offline.sync.queue'].search([
            ('model_name', '=', model_line.model_name),
            ('state', '=', 'pending'),
        ], order='queued_at asc')

        if not pending:
            _logger.info('Offline Sync: no pending records for %s', model_line.model_name)
            return

        synced_count = 0
        failed_count = 0

        for entry in pending:
            # Per-entry savepoint isolates a SQL failure (e.g. FK violation on
            # a stale partner_id=-1 placeholder) so it does NOT poison the
            # whole transaction. Without this, one bad entry would abort the
            # entire flush, leaving even good entries rolled back AND blocking
            # the queue.write({'state': 'failed', ...}) call below from ever
            # persisting.
            try:
                with self.env.cr.savepoint():
                    raw_values = json.loads(entry.record_data)
                    model_obj = self.env[entry.model_name].sudo()

                    # Reject sentinel placeholder ids early with a clear error
                    # rather than letting Postgres surface a cryptic FK
                    # violation. This catches stale entries from before the
                    # mobile app's dependency-rewrite logic was deployed.
                    self._validate_no_sentinels(entry.model_name, raw_values)

                    # Dispatch on operation type. 'create' is the original
                    # path; 'method' replays a method call against an existing
                    # record so the engine can support things like
                    # rental.order.action_done that were pressed offline.
                    if entry.operation == 'method':
                        synced_record_id = self._replay_method_call(
                            model_obj, entry.model_name, raw_values,
                        )
                    else:
                        # 'create' (default for legacy entries with no operation)
                        values = self._preprocess_values(entry.model_name, raw_values)
                        new_record = model_obj.create(values)
                        self._post_create_hook(
                            entry.model_name, new_record, raw_values, entry,
                        )
                        synced_record_id = new_record.id

                entry.write({
                    'state': 'synced',
                    'synced_record_id': synced_record_id,
                    'synced_at': fields.Datetime.now(),
                    'error_message': False,
                })
                synced_count += 1

            except Exception as e:
                # The savepoint rolled back any partial writes from this
                # iteration, so it's safe to write the failure state.
                try:
                    entry.write({
                        'state': 'failed',
                        'error_message': str(e),
                    })
                except Exception as werr:
                    _logger.error(
                        'Offline Sync: could not even mark %s as failed: %s',
                        entry.name, werr,
                    )
                failed_count += 1
                _logger.error(
                    'Offline Sync: failed to sync %s: %s', entry.name, e,
                )

        model_line.write({'last_sync_date': fields.Datetime.now()})

        _logger.info(
            'Offline Sync: %s — %d synced, %d failed',
            model_line.model_name, synced_count, failed_count,
        )

    # ─────────────────────────────────────────────────────────
    #  DELETE LOCAL DATA
    # ─────────────────────────────────────────────────────────
    def delete_local_data(self, model_line):
        """
        Delete all local JSON files and synced queue entries for the model.
        Keeps failed entries for review.
        """
        config = model_line.config_id

        # Delete JSON files from the data folder
        data_dir = config.get_model_data_dir(model_line.model_name)
        deleted_files = 0
        if os.path.isdir(data_dir):
            for fname in os.listdir(data_dir):
                fpath = os.path.join(data_dir, fname)
                if fname.endswith('.json') and os.path.isfile(fpath):
                    try:
                        os.remove(fpath)
                        deleted_files += 1
                    except OSError as e:
                        _logger.warning('Could not delete %s: %s', fpath, e)

            # Remove empty folder
            try:
                if not os.listdir(data_dir):
                    os.rmdir(data_dir)
            except OSError:
                pass

        # Remove synced queue entries (keep failed for review)
        synced_entries = self.env['offline.sync.queue'].search([
            ('model_name', '=', model_line.model_name),
            ('state', '=', 'synced'),
        ])
        synced_entries.unlink()

        _logger.info(
            'Offline Sync: deleted %d files and %d synced queue entries for %s',
            deleted_files, len(synced_entries), model_line.model_name,
        )

    # ─────────────────────────────────────────────────────────
    #  CROSS-CHECK
    # ─────────────────────────────────────────────────────────
    def cross_check_model(self, model_line):
        """
        Compare local (pending) records vs synced records in Odoo.
        For synced entries, verify the target record still exists.
        """
        pending_count = self.env['offline.sync.queue'].search_count([
            ('model_name', '=', model_line.model_name),
            ('state', '=', 'pending'),
        ])
        synced_entries = self.env['offline.sync.queue'].search([
            ('model_name', '=', model_line.model_name),
            ('state', '=', 'synced'),
        ])
        failed_count = self.env['offline.sync.queue'].search_count([
            ('model_name', '=', model_line.model_name),
            ('state', '=', 'failed'),
        ])

        # Verify synced records still exist in Odoo
        missing_online = 0
        if synced_entries and model_line.model_name in self.env:
            model_obj = self.env[model_line.model_name].sudo()
            for entry in synced_entries:
                if entry.synced_record_id:
                    exists = model_obj.search_count([
                        ('id', '=', entry.synced_record_id),
                    ])
                    if not exists:
                        missing_online += 1

        # Also check for orphan JSON files not in queue
        config = model_line.config_id
        data_dir = config.get_model_data_dir(model_line.model_name)
        file_count = 0
        if os.path.isdir(data_dir):
            file_count = len([
                f for f in os.listdir(data_dir) if f.endswith('.json')
            ])

        orphan_files = max(0, file_count - pending_count)

        # Determine status
        issues = []
        if pending_count > 0:
            issues.append('%d records pending sync' % pending_count)
        if failed_count > 0:
            issues.append('%d records failed' % failed_count)
        if missing_online > 0:
            issues.append('%d synced records missing from Odoo' % missing_online)
        if orphan_files > 0:
            issues.append('%d orphan JSON files without queue entry' % orphan_files)

        if issues:
            status = 'mismatch'
            detail = 'Issues found:\n- ' + '\n- '.join(issues)
        else:
            status = 'match'
            detail = (
                'All clear. %d synced records verified in Odoo. '
                'No pending or failed entries.' % len(synced_entries)
            )

        model_line.write({
            'last_cross_check_date': fields.Datetime.now(),
            'cross_check_status': status,
            'cross_check_detail': detail,
        })

        _logger.info(
            'Offline Sync: cross-check %s — %s', model_line.model_name, status,
        )

    # ─────────────────────────────────────────────────────────
    #  CRON: HOURLY CROSS-CHECK
    # ─────────────────────────────────────────────────────────
    @api.model
    def _cron_cross_check(self):
        """Hourly cron: run cross-check on all configured model lines."""
        configs = self.env['offline.sync.config'].search([])
        for config in configs:
            for line in config.line_ids:
                try:
                    self.cross_check_model(line)
                except Exception as e:
                    _logger.error(
                        'Offline Sync: cron cross-check failed for %s: %s',
                        line.model_name, e,
                    )

    # ─────────────────────────────────────────────────────────
    #  CRON: 15-MINUTE AUTO-SYNC
    # ─────────────────────────────────────────────────────────
    @api.model
    def _cron_auto_sync(self):
        """15-minute cron: sync all pending records for all local-mode model lines."""
        configs = self.env['offline.sync.config'].search([])
        for config in configs:
            for line in config.line_ids.filtered(lambda l: l.mode == 'local'):
                try:
                    self.sync_model_to_online(line)
                except Exception as e:
                    _logger.error(
                        'Offline Sync: cron auto-sync failed for %s: %s',
                        line.model_name, e,
                    )

    # ─────────────────────────────────────────────────────────
    #  POST-CREATE HOOK
    # ─────────────────────────────────────────────────────────
    def _post_create_hook(self, model_name, record, raw_values, queue_entry):
        """
        Hook called after a record is created during sync.
        Override or extend for model-specific post-processing.
        """
        # Auto-post invoice if requested
        if model_name == 'account.move' and raw_values.get('auto_post_on_sync'):
            try:
                record.action_post()
            except Exception as e:
                _logger.warning(
                    'Offline Sync: auto-post failed for %s (id=%s): %s',
                    model_name, record.id, e,
                )

        # Update linked offline.invoice if it exists
        if model_name == 'account.move' and 'offline.invoice' in self.env:
            offline_inv = self.env['offline.invoice'].search([
                ('queue_unique_id', '=', queue_entry.unique_id),
            ], limit=1)
            if offline_inv:
                offline_inv.write({
                    'state': 'synced',
                    'synced_move_id': record.id,
                    'sync_error': False,
                })

    # ─────────────────────────────────────────────────────────
    #  VALUE PREPROCESSING
    # ─────────────────────────────────────────────────────────
    def _resolve_smart_lookup(self, comodel_name, lookup_dict):
        """
        Resolve a smart lookup dict to a record ID.
        Tries each key as a field search in order until one matches.

        Example: {"default_code": "PROD01", "barcode": "123", "name": "Product A"}
        """
        Model = self.env[comodel_name]
        for field_name, field_value in lookup_dict.items():
            if not field_value:
                continue
            rec = Model.search([(field_name, '=', field_value)], limit=1)
            if rec:
                return rec.id
        return False

    def _preprocess_values(self, model_name, values):
        """
        Convert relational field references from JSON-friendly format:
        - Many2one: int ID, {"xmlid": "..."}, or {"search": [domain]}
        - One2many: list of dicts → [(0, 0, vals), ...]
        - Many2many: list of ints → [(6, 0, [ids])]
        """
        model_obj = self.env[model_name]
        model_fields = model_obj.fields_get()
        processed = {}

        for field_name, value in values.items():
            if field_name not in model_fields:
                continue

            field_info = model_fields[field_name]
            ftype = field_info.get('type')

            if ftype == 'many2one' and isinstance(value, dict):
                if 'xmlid' in value:
                    processed[field_name] = self.env.ref(value['xmlid']).id
                elif 'search' in value:
                    rec = self.env[field_info['relation']].search(
                        value['search'], limit=1,
                    )
                    processed[field_name] = rec.id if rec else False
                elif 'lookup' in value:
                    processed[field_name] = self._resolve_smart_lookup(
                        field_info['relation'], value['lookup'],
                    )
                else:
                    processed[field_name] = value
            elif ftype == 'one2many' and isinstance(value, list):
                comodel = field_info['relation']
                # Accept BOTH a list of plain dicts (legacy JSON-friendly form
                # — wrap each as a (0, 0, vals) create command) AND a list of
                # pre-formed Odoo command tuples like [0, 0, {...}] coming from
                # the mobile app's addOrder() helper. Pre-formed tuples are
                # passed through after recursively preprocessing the inner dict.
                new_list = []
                for item in value:
                    if isinstance(item, dict):
                        new_list.append(
                            (0, 0, self._preprocess_values(comodel, item))
                        )
                    elif isinstance(item, (list, tuple)) and len(item) == 3:
                        op, rid, vals = item[0], item[1], item[2]
                        if isinstance(vals, dict):
                            vals = self._preprocess_values(comodel, vals)
                        new_list.append((op, rid, vals))
                    else:
                        # Unknown shape — pass through and let Odoo's create()
                        # surface a useful error if it's invalid.
                        new_list.append(item)
                processed[field_name] = new_list
            elif ftype == 'many2many' and isinstance(value, list):
                comodel = field_info['relation']
                # Same dual-format support: a list of int ids / lookup dicts
                # gets collected into a single (6, 0, [ids]) replace command,
                # but if the caller has already produced full Odoo command
                # tuples like [6, 0, [...]] or [4, id], we pass them through
                # untouched.
                if value and all(
                    isinstance(item, (list, tuple)) and len(item) >= 2
                    for item in value
                ):
                    processed[field_name] = [tuple(item) for item in value]
                else:
                    ids = []
                    for item in value:
                        if isinstance(item, int):
                            ids.append(item)
                        elif isinstance(item, dict):
                            if 'xmlid' in item:
                                ids.append(self.env.ref(item['xmlid']).id)
                            elif 'search' in item:
                                rec = self.env[comodel].search(
                                    item['search'], limit=1,
                                )
                                if rec:
                                    ids.append(rec.id)
                    processed[field_name] = [(6, 0, ids)]
            else:
                processed[field_name] = value

        return processed
