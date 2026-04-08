import json
import logging

from odoo import http, fields
from odoo.http import request

_logger = logging.getLogger(__name__)


class OfflineSyncController(http.Controller):

    @http.route('/offline_sync/api/submit', type='jsonrpc', auth='user', methods=['POST'])
    def submit_record(self, model_name=None, values=None, operation='create', **kwargs):
        """
        Submit a record for offline local storage.
        External apps call this to buffer data when offline.

        Operations:
          - 'create' (default): `values` is the dict of fields for a new record.
          - 'method': `values` is `{record_id, method, args, kwargs}` and the
            engine will replay the method call on the existing record when
            sync_model_to_online runs.
        """
        try:
            if not model_name or not values:
                return {'status': 'error', 'message': 'model_name and values are required.'}

            if operation not in ('create', 'method'):
                return {
                    'status': 'error',
                    'message': "operation must be 'create' or 'method'; got '%s'" % operation,
                }

            engine = request.env['offline.sync.engine']

            unique_id = engine.store_offline(
                model_name, values, auto_enable=True, operation=operation,
            )
            return {
                'status': 'ok',
                'unique_id': unique_id,
                'message': 'Record queued for sync.',
            }
        except Exception as e:
            _logger.error('Offline Sync API submit error: %s', e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/status', type='jsonrpc', auth='user', methods=['POST'])
    def check_status(self, unique_id=None, **kwargs):
        """Check sync status of a queued record by unique_id."""
        try:
            if not unique_id:
                return {'status': 'error', 'message': 'unique_id is required.'}

            entry = request.env['offline.sync.queue'].search([
                ('unique_id', '=', unique_id),
            ], limit=1)

            if not entry:
                return {'status': 'error', 'message': 'Record not found.'}

            return {
                'status': 'ok',
                'sync_state': entry.state,
                'synced_record_id': entry.synced_record_id,
                'error_message': entry.error_message or '',
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/submit_invoice', type='jsonrpc', auth='user', methods=['POST'])
    def submit_invoice(self, invoice_data=None, **kwargs):
        """
        Convenience endpoint for invoice submission with simplified JSON.

        Accepts a flat-ish structure and maps it to account.move values:
          - partner     -> partner_id  (wrapped in lookup)
          - journal     -> journal_id  (wrapped in lookup)
          - payment_term -> payment_term_id
          - fiscal_position -> fiscal_position_id
          - lines       -> invoice_line_ids (with per-line key renames)
        """
        try:
            if not invoice_data:
                return {'status': 'error', 'message': 'invoice_data is required.'}

            # --- Transform shorthand keys to engine format ---
            values = {}

            # Direct pass-through fields
            for key in ('move_type', 'invoice_date', 'date', 'ref',
                        'narration', 'currency_id', 'auto_post_on_sync'):
                if key in invoice_data:
                    values[key] = invoice_data[key]

            # Default move_type to customer invoice
            values.setdefault('move_type', 'out_invoice')

            # Many2one shorthand → lookup wrapper
            m2o_map = {
                'partner': 'partner_id',
                'journal': 'journal_id',
                'payment_term': 'invoice_payment_term_id',
                'fiscal_position': 'fiscal_position_id',
                'currency': 'currency_id',
            }
            for short_key, field_name in m2o_map.items():
                val = invoice_data.get(short_key)
                if val is None:
                    continue
                if isinstance(val, dict):
                    # Could be lookup, xmlid, or search — pass through
                    if not any(k in val for k in ('lookup', 'xmlid', 'search')):
                        val = {'lookup': val}
                    values[field_name] = val
                elif isinstance(val, int):
                    values[field_name] = val

            # Invoice lines
            lines = invoice_data.get('lines', [])
            if lines:
                invoice_lines = []
                for line in lines:
                    line_vals = {}
                    # Product shorthand
                    product = line.get('product')
                    if product is not None:
                        if isinstance(product, dict):
                            if not any(k in product for k in ('lookup', 'xmlid', 'search')):
                                product = {'lookup': product}
                            line_vals['product_id'] = product
                        elif isinstance(product, int):
                            line_vals['product_id'] = product

                    # Tax shorthand
                    taxes = line.get('taxes')
                    if taxes is not None:
                        tax_items = []
                        for tax in taxes:
                            if isinstance(tax, int):
                                tax_items.append(tax)
                            elif isinstance(tax, dict):
                                if 'name' in tax:
                                    tax_items.append({
                                        'search': [['name', '=', tax['name']]],
                                    })
                                else:
                                    tax_items.append(tax)
                        line_vals['tax_ids'] = tax_items

                    # Account shorthand
                    account = line.get('account')
                    if account is not None:
                        if isinstance(account, dict):
                            if not any(k in account for k in ('lookup', 'xmlid', 'search')):
                                account = {'lookup': account}
                            line_vals['account_id'] = account
                        elif isinstance(account, int):
                            line_vals['account_id'] = account

                    # Direct pass-through line fields
                    for key in ('quantity', 'price_unit', 'discount', 'name',
                                'product_id', 'tax_ids', 'account_id'):
                        if key in line and key not in line_vals:
                            line_vals[key] = line[key]

                    invoice_lines.append(line_vals)
                values['invoice_line_ids'] = invoice_lines

            engine = request.env['offline.sync.engine']
            config = request.env['offline.sync.config'].get_config()

            if not config.is_model_enabled('account.move'):
                return {
                    'status': 'error',
                    'message': 'account.move is not enabled for offline sync (local mode).',
                }

            unique_id = engine.store_offline('account.move', values)
            return {
                'status': 'ok',
                'unique_id': unique_id,
                'message': 'Invoice queued for sync.',
            }
        except Exception as e:
            _logger.error('Offline Sync API submit_invoice error: %s', e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/stats', type='jsonrpc', auth='user', methods=['POST'])
    def sync_stats(self, **kwargs):
        """Dashboard statistics: counts by state."""
        try:
            Queue = request.env['offline.sync.queue'].sudo()
            return {
                'status': 'ok',
                'pending': Queue.search_count([('state', '=', 'pending')]),
                'synced': Queue.search_count([('state', '=', 'synced')]),
                'failed': Queue.search_count([('state', '=', 'failed')]),
                'total': Queue.search_count([]),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/sync', type='jsonrpc', auth='user', methods=['POST'])
    def trigger_sync(self, model_name=None, **kwargs):
        """
        Trigger immediate sync of pending records.
        Called by mobile app on network reconnection.

        Params:
          model_name (optional): sync only this model; omit to sync all local-mode lines.

        Returns:
          {status, results: {model_name: {synced, failed, remaining}}}
        """
        try:
            engine = request.env['offline.sync.engine']
            Queue = request.env['offline.sync.queue'].sudo()
            configs = request.env['offline.sync.config'].search([])

            lines_to_sync = request.env['offline.sync.model.line'].sudo().browse([])
            for config in configs:
                local_lines = config.line_ids.filtered(lambda l: l.mode == 'local')
                if model_name:
                    local_lines = local_lines.filtered(
                        lambda l: l.model_name == model_name
                    )
                lines_to_sync |= local_lines

            if not lines_to_sync:
                msg = (
                    'No local-mode line found for model: %s' % model_name
                    if model_name else 'No local-mode model lines configured.'
                )
                return {'status': 'error', 'message': msg}

            results = {}
            start_time = fields.Datetime.now()

            for line in lines_to_sync:
                pre_pending = Queue.search_count([
                    ('model_name', '=', line.model_name),
                    ('state', '=', 'pending'),
                ])
                try:
                    engine.sync_model_to_online(line)
                except Exception as e:
                    _logger.error(
                        'Offline Sync API /sync error for %s: %s', line.model_name, e,
                    )

                synced_count = Queue.search_count([
                    ('model_name', '=', line.model_name),
                    ('state', '=', 'synced'),
                    ('synced_at', '>=', start_time),
                ])
                remaining = Queue.search_count([
                    ('model_name', '=', line.model_name),
                    ('state', '=', 'pending'),
                ])
                results[line.model_name] = {
                    'synced': synced_count,
                    'failed': max(0, pre_pending - synced_count - remaining),
                    'remaining': remaining,
                }

            return {'status': 'ok', 'results': results}

        except Exception as e:
            _logger.error('Offline Sync API /sync error: %s', e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/auto_queue_and_sync', type='jsonrpc', auth='user', methods=['POST'])
    def auto_queue_and_sync(self, **kwargs):
        """
        Auto-queue all draft offline records and sync them.
        Called automatically when network reconnects.
        """
        try:
            results = {'queued': {}, 'sync': {}}

            # Auto-queue draft offline.contact records
            try:
                OfflineContact = request.env['offline.contact']
                drafts = OfflineContact.search([('state', '=', 'draft')])
                if drafts:
                    for rec in drafts:
                        try:
                            rec.action_queue_for_sync()
                        except Exception as e:
                            _logger.error('Auto-queue offline.contact %s failed: %s', rec.name, e)
                    results['queued']['offline.contact'] = len(drafts)
            except Exception:
                pass  # Module not installed

            # Auto-queue draft offline.invoice records
            try:
                OfflineInvoice = request.env['offline.invoice']
                drafts = OfflineInvoice.search([('state', '=', 'draft')])
                if drafts:
                    for rec in drafts:
                        try:
                            rec.action_queue_for_sync()
                        except Exception as e:
                            _logger.error('Auto-queue offline.invoice %s failed: %s', rec.name, e)
                    results['queued']['offline.invoice'] = len(drafts)
            except Exception:
                pass  # Module not installed

            # Now sync all pending queue entries
            engine = request.env['offline.sync.engine']
            Queue = request.env['offline.sync.queue'].sudo()
            configs = request.env['offline.sync.config'].search([])

            lines_to_sync = request.env['offline.sync.model.line'].sudo().browse([])
            for config in configs:
                local_lines = config.line_ids.filtered(lambda l: l.mode == 'local')
                lines_to_sync |= local_lines

            start_time = fields.Datetime.now()
            for line in lines_to_sync:
                try:
                    engine.sync_model_to_online(line)
                except Exception as e:
                    _logger.error('Auto-sync error for %s: %s', line.model_name, e)

                synced_count = Queue.search_count([
                    ('model_name', '=', line.model_name),
                    ('state', '=', 'synced'),
                    ('synced_at', '>=', start_time),
                ])
                remaining = Queue.search_count([
                    ('model_name', '=', line.model_name),
                    ('state', '=', 'pending'),
                ])
                if synced_count or remaining:
                    results['sync'][line.model_name] = {
                        'synced': synced_count,
                        'remaining': remaining,
                    }

            # Update offline record states after sync
            try:
                request.env['offline.contact'].search([
                    ('state', '=', 'queued'),
                ]).action_check_sync_status()
            except Exception:
                pass
            try:
                request.env['offline.invoice'].search([
                    ('state', '=', 'queued'),
                ]).action_check_sync_status()
            except Exception:
                pass

            return {'status': 'ok', 'results': results}

        except Exception as e:
            _logger.error('Auto queue and sync error: %s', e)
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/ping', type='jsonrpc', auth='user', methods=['POST'])
    def ping(self, **kwargs):
        """Lightweight heartbeat. Returns ok if server is reachable."""
        return {'status': 'ok', 'ts': fields.Datetime.now().isoformat()}

    @http.route('/offline_sync/api/enabled_models', type='jsonrpc', auth='user', methods=['POST'])
    def enabled_models(self, **kwargs):
        """Return list of model names that are in LOCAL mode."""
        try:
            config = request.env['offline.sync.config'].get_config()
            local_lines = config.line_ids.filtered(lambda l: l.mode == 'local')
            return {
                'status': 'ok',
                'models': local_lines.mapped('model_name'),
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}

    @http.route('/offline_sync/api/pending', type='jsonrpc', auth='user', methods=['POST'])
    def pending_counts(self, model_name=None, **kwargs):
        """
        Return pending queue counts. Mobile polls this before calling /sync.

        Params:
          model_name (optional): filter to one model.

        Returns:
          {status, total_pending, by_model: {model_name: count}}
        """
        try:
            Queue = request.env['offline.sync.queue'].sudo()
            domain = [('state', '=', 'pending')]
            if model_name:
                domain.append(('model_name', '=', model_name))

            pending_entries = Queue.search(domain)
            by_model = {}
            for entry in pending_entries:
                by_model[entry.model_name] = by_model.get(entry.model_name, 0) + 1

            return {
                'status': 'ok',
                'total_pending': len(pending_entries),
                'by_model': by_model,
            }
        except Exception as e:
            return {'status': 'error', 'message': str(e)}
