from odoo import models, fields, api
from datetime import timedelta
import pytz
from .time_utils import minutes_to_hm


class HrAttendance(models.Model):
    _inherit = 'hr.attendance'

    # --- Late tracking fields ---
    is_first_checkin_of_day = fields.Boolean(
        string='First Check-in of Day',
        compute='_compute_is_first_checkin_of_day',
        store=True,
    )
    is_second_checkin_of_day = fields.Boolean(
        string='Second Check-in of Day',
        compute='_compute_is_first_checkin_of_day',
        store=True,
        help='True for the first check-in of session 2 in a split shift.',
    )
    checkin_session = fields.Selection([
        ('1', 'Session 1'),
        ('2', 'Session 2'),
    ], string='Session', compute='_compute_is_first_checkin_of_day', store=True)

    is_late = fields.Boolean(
        string='Is Late',
        compute='_compute_late_info',
        store=True,
    )
    late_minutes = fields.Integer(
        string='Late (Minutes)',
        compute='_compute_late_info',
        store=True,
    )
    late_minutes_display = fields.Char(
        string='Late Time',
        compute='_compute_late_minutes_display',
        store=True,
    )
    expected_start_time = fields.Float(
        string='Expected Start Time',
        compute='_compute_late_info',
        store=True,
    )
    is_half_day = fields.Boolean(
        string='Half Day',
        compute='_compute_late_info',
        store=True,
    )
    late_reason = fields.Text(
        string='Late Reason',
    )
    is_waived = fields.Boolean(
        string='Waiver Approved',
        default=False,
    )
    waiver_reason = fields.Text(
        string='Waiver Reason',
        readonly=True,
    )
    late_sequence = fields.Integer(
        string='Late # in Month',
        compute='_compute_late_sequence',
        store=True,
        group_operator='max',
        help='Sequential count of late TIMES in the month (not days).',
    )
    deduction_amount = fields.Float(
        string='Deduction Amount',
        compute='_compute_deduction_amount',
        store=True,
    )
    daily_total_hours = fields.Float(
        string='Daily Total Hours',
        compute='_compute_daily_total_hours',
    )

    # --- Computed fields ---

    @api.depends('late_minutes')
    def _compute_late_minutes_display(self):
        for rec in self:
            rec.late_minutes_display = minutes_to_hm(rec.late_minutes)

    @api.depends('check_in', 'employee_id')
    def _compute_is_first_checkin_of_day(self):
        Config = self.env['hr.attendance.late.config']
        for rec in self:
            rec.is_first_checkin_of_day = False
            rec.is_second_checkin_of_day = False
            rec.checkin_session = False

            if not rec.check_in or not rec.employee_id:
                continue

            tz = pytz.timezone(rec.employee_id.tz or 'UTC')
            local_dt = pytz.utc.localize(rec.check_in).astimezone(tz)
            day_start = local_dt.replace(hour=0, minute=0, second=0, microsecond=0)
            utc_start = day_start.astimezone(pytz.utc).replace(tzinfo=None)

            config_data = Config.get_config_for_employee(rec.employee_id.id)
            shift_type = config_data.get('shift_type', 'single')

            # Find all check-ins for this employee on this day (before current)
            earlier = self.search([
                ('employee_id', '=', rec.employee_id.id),
                ('check_in', '>=', utc_start),
                ('check_in', '<', rec.check_in),
                ('id', '!=', rec.id),
            ], order='check_in asc')

            if not earlier:
                # This is the first check-in of the day
                rec.is_first_checkin_of_day = True
                rec.checkin_session = '1'
            elif shift_type == 'split' and len(earlier) >= 1:
                # For split shift: check if this is the first check-in of session 2.
                # Boundary = min(session 1 end, session 2 start). Using min lets
                # us handle configs where session 2 starts before session 1 ends
                # (overlapping or reversed configs) without silently dropping
                # every session-2 check-in.
                session1_end = config_data.get('office_end_hour', 14.0)
                session2_start = config_data.get('office_start_hour_2', 14.0)
                boundary = min(session1_end, session2_start)
                local_hour = local_dt.hour + local_dt.minute / 60.0

                # If check-in is at or after the boundary, it belongs to session 2
                if local_hour >= boundary:
                    # Check if no earlier check-in was already in session 2 territory
                    has_session2 = False
                    for e in earlier:
                        e_local = pytz.utc.localize(e.check_in).astimezone(tz)
                        e_hour = e_local.hour + e_local.minute / 60.0
                        if e_hour >= boundary:
                            has_session2 = True
                            break

                    if not has_session2:
                        rec.is_second_checkin_of_day = True
                        rec.checkin_session = '2'

    @api.depends('check_in', 'employee_id', 'is_first_checkin_of_day', 'is_second_checkin_of_day', 'checkin_session')
    def _compute_late_info(self):
        Config = self.env['hr.attendance.late.config']
        for rec in self:
            rec.is_late = False
            rec.late_minutes = 0
            rec.expected_start_time = 0.0
            rec.is_half_day = False

            if not rec.check_in or not rec.employee_id:
                continue

            # Only check first check-in of session 1 or first check-in of session 2
            if not rec.is_first_checkin_of_day and not rec.is_second_checkin_of_day:
                continue

            config_data = Config.get_config_for_employee(rec.employee_id.id)
            threshold = config_data.get('late_threshold_minutes', 15)

            tz = pytz.timezone(rec.employee_id.tz or 'UTC')
            local_dt = pytz.utc.localize(rec.check_in).astimezone(tz)
            check_date = local_dt.date()

            # Determine which session start time to use
            if rec.is_second_checkin_of_day and rec.checkin_session == '2':
                office_start = config_data.get('office_start_hour_2', 14.0)
            else:
                office_start = config_data.get('office_start_hour', 8.0)

            # Check half-day Friday (only applies to session 1 or single shift)
            is_half_day_fri = Config.is_half_day_friday(check_date, rec.employee_id.id)
            rec.is_half_day = is_half_day_fri

            if is_half_day_fri and rec.is_first_checkin_of_day:
                office_start = config_data.get('half_day_start_hour', 17.0)

            rec.expected_start_time = office_start

            office_hour = int(office_start)
            office_minute = int((office_start - office_hour) * 60)
            office_start_dt = local_dt.replace(
                hour=office_hour, minute=office_minute, second=0, microsecond=0
            )

            allowed_dt = office_start_dt + timedelta(minutes=threshold)

            if local_dt > allowed_dt:
                diff = local_dt - office_start_dt
                rec.late_minutes = int(diff.total_seconds() / 60)
                rec.is_late = True

    @api.depends('is_late', 'late_minutes', 'employee_id', 'date', 'check_in')
    def _compute_late_sequence(self):
        """Count late TIMES (not days) in the month for this employee."""
        for rec in self:
            rec.late_sequence = 0
            if not rec.is_late or not rec.date:
                continue

            month_start = rec.date.replace(day=1)
            # Find all late records for this employee in the month
            late_records = self.search([
                ('employee_id', '=', rec.employee_id.id),
                ('is_late', '=', True),
                ('date', '>=', month_start),
                ('date', '<=', rec.date),
                '|',
                ('is_first_checkin_of_day', '=', True),
                ('is_second_checkin_of_day', '=', True),
            ], order='check_in asc')

            # Each late record = 1 time (not grouped by day)
            seq = 0
            for att in late_records:
                seq += 1
                if att.id == rec.id:
                    rec.late_sequence = seq
                    break

    @api.depends('is_late', 'late_minutes', 'late_sequence', 'employee_id', 'is_waived')
    def _compute_deduction_amount(self):
        Slab = self.env['hr.late.deduction.slab']
        Config = self.env['hr.attendance.late.config']
        for rec in self:
            rec.deduction_amount = 0.0
            if not rec.is_late or rec.late_sequence == 0:
                continue

            if rec.is_waived:
                continue

            config_data = Config.get_config_for_employee(rec.employee_id.id)
            grace_times = config_data.get('grace_late_times',
                                          config_data.get('grace_late_days', 5))

            if rec.late_sequence <= grace_times:
                continue

            deduction_mode = config_data.get('deduction_mode', 'fixed')

            if deduction_mode == 'hourly':
                # Hourly wage-based deduction
                config_id = config_data.get('id')
                if config_id:
                    config_rec = Config.browse(config_id)
                    rec.deduction_amount = config_rec.get_hourly_deduction(
                        rec.employee_id.id, rec.late_minutes, late_date=rec.date
                    )
            else:
                # Fixed slab-based deduction
                rec.deduction_amount = Slab.get_deduction_for_minutes(
                    rec.late_minutes,
                    company_id=rec.employee_id.company_id.id,
                )

    @api.depends('employee_id', 'date')
    def _compute_daily_total_hours(self):
        for rec in self:
            if not rec.employee_id or not rec.date:
                rec.daily_total_hours = 0.0
                continue

            day_records = self.search([
                ('employee_id', '=', rec.employee_id.id),
                ('date', '=', rec.date),
                ('check_out', '!=', False),
            ])
            total = sum(
                (r.check_out - r.check_in).total_seconds() / 3600.0
                for r in day_records
                if r.check_in and r.check_out
            )
            rec.daily_total_hours = round(total, 2)

    # --- API methods ---

    @api.model
    def get_late_attendance_report(self, employee_id=None, department_id=None,
                                   date_from=None, date_to=None):
        domain = [('is_late', '=', True),
                  '|', ('is_first_checkin_of_day', '=', True),
                  ('is_second_checkin_of_day', '=', True)]
        if employee_id:
            domain.append(('employee_id', '=', employee_id))
        if department_id:
            domain.append(('department_id', '=', department_id))
        if date_from:
            domain.append(('date', '>=', date_from))
        if date_to:
            domain.append(('date', '<=', date_to))

        records = self.search(domain, order='date desc')
        return [{
            'id': r.id,
            'employee_id': r.employee_id.id,
            'employee_name': r.employee_id.name,
            'department': r.employee_id.department_id.name or '',
            'attendance_date': str(r.date),
            'check_in': str(r.check_in),
            'expected_start_time': r.expected_start_time,
            'late_minutes': r.late_minutes,
            'late_minutes_display': r.late_minutes_display,
            'is_half_day': r.is_half_day,
            'checkin_session': r.checkin_session,
            'late_reason': r.late_reason or '',
            'late_sequence': r.late_sequence,
            'deduction_amount': r.deduction_amount,
            'is_waived': r.is_waived,
            'waiver_reason': r.waiver_reason or '',
            'daily_total_hours': r.daily_total_hours,
        } for r in records]
