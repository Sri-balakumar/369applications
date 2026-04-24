from odoo import http, fields
from odoo.http import request
import json
import logging
import pytz

_logger = logging.getLogger(__name__)


def convert_to_user_tz(datetime_obj, user=None):
    """Convert UTC datetime to user's timezone"""
    if not datetime_obj:
        return ''
    if user is None:
        user = request.env.user
    user_tz = user.tz or 'Asia/Kolkata'
    try:
        if datetime_obj.tzinfo is None:
            utc_dt = pytz.UTC.localize(datetime_obj)
        else:
            utc_dt = datetime_obj
        local_tz = pytz.timezone(user_tz)
        local_dt = utc_dt.astimezone(local_tz)
        return local_dt.strftime('%Y-%m-%d %H:%M:%S')
    except Exception as e:
        _logger.error(f"Timezone conversion error: {e}")
        return str(datetime_obj)


class WfhAPI(http.Controller):
    """
    REST API for WFH Requests — used by both Odoo web frontend and React Native mobile app.

    FLOW:
    1. Employee → POST /wfh/request/create   (submit WFH request)
    2. Manager  → POST /wfh/request/approve   (approve request)
    3. Manager  → POST /wfh/request/reject    (reject request)
    4. Employee → POST /wfh/checkin            (check-in on WFH day — fingerprint only, no geo-fence)
    5. Employee → POST /wfh/checkout           (check-out on WFH day)
    """

    # =============================================
    # 1. CREATE WFH REQUEST (Employee)
    # =============================================
    @http.route('/wfh/request/create', type='json', auth='user', methods=['POST'], csrf=False)
    def create_wfh_request(self, **params):
        """Employee submits a new WFH request"""
        try:
            request_date = params.get('request_date')
            reason = params.get('reason', '').strip()

            if not request_date:
                return {'status': False, 'message': 'WFH date is required'}
            if not reason:
                return {'status': False, 'message': 'Reason is required'}

            wfh = request.env['hr.wfh.request'].create({
                'employee_user_id': request.env.user.id,
                'request_date': request_date,
                'reason': reason,
                'state': 'pending',  # Auto-submit (skip draft for mobile)
            })

            _logger.info(f"WFH Request created: {request.env.user.name} for {request_date}")

            return {
                'status': True,
                'message': 'WFH request submitted for approval',
                'request_id': wfh.id,
                'state': wfh.state,
            }
        except Exception as e:
            _logger.error(f"Error creating WFH request: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 2. MY WFH REQUESTS (Employee)
    # =============================================
    @http.route('/wfh/request/my_requests', type='json', auth='user', methods=['POST'], csrf=False)
    def get_my_wfh_requests(self, **params):
        """Get current user's WFH requests"""
        try:
            state_filter = params.get('state')
            result = request.env['hr.wfh.request'].get_my_wfh_requests(
                user_id=request.env.user.id,
                state_filter=state_filter,
            )
            return {
                'status': True,
                'requests': result,
                'current_user_id': request.env.user.id,
                'current_user_name': request.env.user.name,
            }
        except Exception as e:
            _logger.error(f"Error fetching WFH requests: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 3. CHECK TODAY'S WFH STATUS (Employee / Mobile)
    # =============================================
    @http.route('/wfh/today_status', type='json', auth='user', methods=['POST'], csrf=False)
    def get_today_wfh_status(self, **params):
        """
        Check if the employee has an approved WFH for today.
        Mobile app calls this to decide whether to show WFH check-in button.
        """
        try:
            today = fields.Date.today()
            user_id = request.env.user.id

            wfh_today = request.env['hr.wfh.request'].sudo().search([
                ('employee_user_id', '=', user_id),
                ('request_date', '=', today),
                ('state', 'in', ['approved', 'checked_in', 'checked_out']),
            ], limit=1)

            if not wfh_today:
                return {
                    'status': True,
                    'has_wfh_today': False,
                    'message': 'No approved WFH request for today',
                }

            return {
                'status': True,
                'has_wfh_today': True,
                'wfh_request': {
                    'id': wfh_today.id,
                    'state': wfh_today.state,
                    'can_checkin': wfh_today.can_checkin,
                    'can_checkout': wfh_today.can_checkout,
                    'checkin_time': convert_to_user_tz(wfh_today.checkin_time),
                    'checkout_time': convert_to_user_tz(wfh_today.checkout_time),
                    'worked_hours_display': wfh_today.worked_hours_display,
                },
            }
        except Exception as e:
            _logger.error(f"Error checking today's WFH status: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 4. CHECK-IN (Employee / Mobile App)
    # =============================================
    @http.route('/wfh/checkin', type='json', auth='user', methods=['POST'], csrf=False)
    def wfh_checkin(self, **params):
        """
        Employee checks in for WFH.
        Called from mobile app after fingerprint verification.
        No geo-fencing required.
        """
        try:
            request_id = params.get('request_id')

            if not request_id:
                # Auto-find today's approved request
                today = fields.Date.today()
                wfh = request.env['hr.wfh.request'].sudo().search([
                    ('employee_user_id', '=', request.env.user.id),
                    ('request_date', '=', today),
                    ('state', '=', 'approved'),
                ], limit=1)

                if not wfh:
                    return {
                        'status': False,
                        'message': 'No approved WFH request found for today. '
                                   'Please submit a WFH request and get manager approval first.',
                    }
            else:
                wfh = request.env['hr.wfh.request'].sudo().browse(int(request_id))
                if not wfh.exists():
                    return {'status': False, 'message': 'WFH request not found'}

            # Perform check-in
            wfh.action_checkin()

            return {
                'status': True,
                'message': f'WFH Check-in successful at {convert_to_user_tz(wfh.checkin_time)}',
                'request_id': wfh.id,
                'checkin_time': convert_to_user_tz(wfh.checkin_time),
                'attendance_id': wfh.attendance_id.id,
                'state': wfh.state,
            }
        except Exception as e:
            _logger.error(f"WFH Check-in error: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 5. CHECK-OUT (Employee / Mobile App)
    # =============================================
    @http.route('/wfh/checkout', type='json', auth='user', methods=['POST'], csrf=False)
    def wfh_checkout(self, **params):
        """
        Employee checks out for WFH.
        Called from mobile app after fingerprint verification.
        """
        try:
            request_id = params.get('request_id')

            if not request_id:
                # Auto-find today's checked-in request
                today = fields.Date.today()
                wfh = request.env['hr.wfh.request'].sudo().search([
                    ('employee_user_id', '=', request.env.user.id),
                    ('request_date', '=', today),
                    ('state', '=', 'checked_in'),
                ], limit=1)

                if not wfh:
                    return {
                        'status': False,
                        'message': 'No active WFH check-in found for today.',
                    }
            else:
                wfh = request.env['hr.wfh.request'].sudo().browse(int(request_id))
                if not wfh.exists():
                    return {'status': False, 'message': 'WFH request not found'}

            # Perform check-out
            wfh.action_checkout()

            return {
                'status': True,
                'message': f'WFH Check-out successful. Worked: {wfh.worked_hours_display}',
                'request_id': wfh.id,
                'checkout_time': convert_to_user_tz(wfh.checkout_time),
                'worked_hours': wfh.worked_hours,
                'worked_hours_display': wfh.worked_hours_display,
                'state': wfh.state,
            }
        except Exception as e:
            _logger.error(f"WFH Check-out error: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 6. APPROVE REQUEST (Manager/Admin)
    # =============================================
    @http.route('/wfh/request/approve', type='json', auth='user', methods=['POST'], csrf=False)
    def approve_wfh_request(self, **params):
        """Manager approves a WFH request"""
        try:
            request_id = params.get('request_id')

            if not request_id:
                return {'status': False, 'message': 'request_id is required'}

            # Check if user is manager/admin
            current_user = request.env.user
            is_manager = (
                current_user.has_group('hr_wfh_request.group_wfh_manager') or
                current_user.has_group('base.group_system')
            )

            if not is_manager:
                return {
                    'status': False,
                    'message': 'Only managers/admins can approve WFH requests.',
                }

            wfh = request.env['hr.wfh.request'].sudo().browse(int(request_id))
            if not wfh.exists():
                return {'status': False, 'message': 'WFH request not found'}

            wfh.action_approve()

            return {
                'status': True,
                'message': f'WFH request approved for {wfh.employee_user_id.name} on {wfh.request_date}',
                'request_id': wfh.id,
                'state': wfh.state,
            }
        except Exception as e:
            _logger.error(f"WFH Approval error: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 7. REJECT REQUEST (Manager/Admin)
    # =============================================
    @http.route('/wfh/request/reject', type='json', auth='user', methods=['POST'], csrf=False)
    def reject_wfh_request(self, **params):
        """Manager rejects a WFH request"""
        try:
            request_id = params.get('request_id')
            reason = params.get('reason', '').strip()

            if not request_id:
                return {'status': False, 'message': 'request_id is required'}
            if not reason:
                return {'status': False, 'message': 'Rejection reason is required'}

            # Check if user is manager/admin
            current_user = request.env.user
            is_manager = (
                current_user.has_group('hr_wfh_request.group_wfh_manager') or
                current_user.has_group('base.group_system')
            )

            if not is_manager:
                return {
                    'status': False,
                    'message': 'Only managers/admins can reject WFH requests.',
                }

            wfh = request.env['hr.wfh.request'].sudo().browse(int(request_id))
            if not wfh.exists():
                return {'status': False, 'message': 'WFH request not found'}

            wfh.action_reject(reason)

            return {
                'status': True,
                'message': f'WFH request rejected for {wfh.employee_user_id.name}',
                'request_id': wfh.id,
                'state': wfh.state,
            }
        except Exception as e:
            _logger.error(f"WFH Rejection error: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 8. PENDING REQUESTS (Manager Dashboard)
    # =============================================
    @http.route('/wfh/request/pending', type='json', auth='user', methods=['POST'], csrf=False)
    def get_pending_requests(self, **params):
        """Get all pending WFH requests for manager approval"""
        try:
            current_user = request.env.user
            is_manager = (
                current_user.has_group('hr_wfh_request.group_wfh_manager') or
                current_user.has_group('base.group_system')
            )

            if not is_manager:
                return {
                    'status': False,
                    'message': 'Only managers/admins can view pending requests.',
                }

            result = request.env['hr.wfh.request'].get_pending_requests_for_approval()

            return {
                'status': True,
                'requests': result,
                'count': len(result),
            }
        except Exception as e:
            _logger.error(f"Error fetching pending WFH requests: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 9. TODAY'S WFH DASHBOARD (Manager)
    # =============================================
    @http.route('/wfh/today_dashboard', type='json', auth='user', methods=['POST'], csrf=False)
    def get_today_wfh_dashboard(self, **params):
        """Get all employees working from home today"""
        try:
            result = request.env['hr.wfh.request'].get_todays_wfh_employees()
            return {
                'status': True,
                'wfh_employees': result,
                'count': len(result),
                'date': str(fields.Date.today()),
            }
        except Exception as e:
            _logger.error(f"Error fetching WFH dashboard: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 10. ALL REQUESTS (Manager — with filters)
    # =============================================
    @http.route('/wfh/request/list', type='json', auth='user', methods=['POST'], csrf=False)
    def get_all_wfh_requests(self, **params):
        """Get all WFH requests with optional filters (for manager view)"""
        try:
            domain = []

            # Filter by state
            state = params.get('state')
            if state:
                domain.append(('state', '=', state))

            # Filter by employee
            employee_id = params.get('employee_id')
            if employee_id:
                domain.append(('employee_user_id', '=', int(employee_id)))

            # Filter by date range
            from_date = params.get('from_date')
            to_date = params.get('to_date')
            if from_date:
                domain.append(('request_date', '>=', from_date))
            if to_date:
                domain.append(('request_date', '<=', to_date))

            wfh_requests = request.env['hr.wfh.request'].sudo().search(
                domain, order='request_date desc', limit=100
            )

            result = []
            for wfh in wfh_requests:
                result.append({
                    'id': wfh.id,
                    'employee_name': wfh.employee_user_id.name,
                    'employee_id': wfh.employee_user_id.id,
                    'request_date': str(wfh.request_date),
                    'reason': wfh.reason,
                    'state': wfh.state,
                    'approved_by': wfh.approved_by.name if wfh.approved_by else '',
                    'approval_date': convert_to_user_tz(wfh.approval_date),
                    'rejection_reason': wfh.rejection_reason or '',
                    'checkin_time': convert_to_user_tz(wfh.checkin_time),
                    'checkout_time': convert_to_user_tz(wfh.checkout_time),
                    'worked_hours_display': wfh.worked_hours_display,
                })

            return {
                'status': True,
                'requests': result,
                'count': len(result),
            }
        except Exception as e:
            _logger.error(f"Error fetching WFH requests: {str(e)}")
            return {'status': False, 'message': str(e)}

    # =============================================
    # 11. CANCEL REQUEST (Employee)
    # =============================================
    @http.route('/wfh/request/cancel', type='json', auth='user', methods=['POST'], csrf=False)
    def cancel_wfh_request(self, **params):
        """Employee cancels their WFH request"""
        try:
            request_id = params.get('request_id')

            if not request_id:
                return {'status': False, 'message': 'request_id is required'}

            wfh = request.env['hr.wfh.request'].sudo().browse(int(request_id))
            if not wfh.exists():
                return {'status': False, 'message': 'WFH request not found'}

            # Only the employee or admin can cancel
            if wfh.employee_user_id.id != request.env.user.id:
                if not request.env.user.has_group('base.group_system'):
                    return {'status': False, 'message': 'You can only cancel your own requests.'}

            wfh.action_cancel()

            return {
                'status': True,
                'message': 'WFH request cancelled',
                'request_id': wfh.id,
                'state': wfh.state,
            }
        except Exception as e:
            _logger.error(f"Error cancelling WFH request: {str(e)}")
            return {'status': False, 'message': str(e)}
