from odoo import models, fields, api
from datetime import datetime, timedelta


class FaceAttendanceLog(models.Model):
    _name = 'face.attendance.log'
    _description = 'Door Detection Log'
    _order = 'detection_time desc'

    employee_id = fields.Many2one(
        'hr.employee',
        string='Employee',
        required=True,
        ondelete='cascade',
    )
    detection_time = fields.Datetime(
        string='Detected At',
        default=fields.Datetime.now,
        required=True,
    )
    confidence = fields.Float(
        string='Confidence (%)',
        help='Face recognition confidence percentage.',
    )
    snapshot = fields.Binary(
        string='Snapshot',
        help='Captured face image at detection time.',
    )
    camera_name = fields.Char(
        string='Camera',
        default='Main Door',
    )
    employee_name = fields.Char(
        related='employee_id.name',
        string='Employee Name',
        store=True,
    )
    has_app_checkout = fields.Boolean(
        string='Has App Checkout',
        compute='_compute_has_app_checkout',
        store=False,
        help='Whether the employee had a proper app checkout around this detection time.',
    )

    @api.depends('employee_id', 'detection_time')
    def _compute_has_app_checkout(self):
        """Check if employee has a proper hr.attendance checkout around this detection time."""
        Attendance = self.env['hr.attendance']
        for rec in self:
            if not rec.detection_time:
                rec.has_app_checkout = False
                continue
            # Check if there's an hr.attendance record with check_out within 30 min of detection
            time_before = rec.detection_time - timedelta(minutes=30)
            time_after = rec.detection_time + timedelta(minutes=30)
            checkout = Attendance.search([
                ('employee_id', '=', rec.employee_id.id),
                ('check_out', '>=', time_before),
                ('check_out', '<=', time_after),
            ], limit=1)
            rec.has_app_checkout = bool(checkout)

    @api.model
    def create_from_camera(self, employee_id, confidence=0.0, snapshot_base64=None, camera_name='Main Door'):
        """Called by camera script when a face is detected at the door."""
        vals = {
            'employee_id': employee_id,
            'confidence': confidence,
            'camera_name': camera_name,
        }
        if snapshot_base64:
            vals['snapshot'] = snapshot_base64

        log = self.create(vals)
        return {
            'id': log.id,
            'employee_name': log.employee_id.name,
        }


class DoorMismatchReport(models.TransientModel):
    _name = 'face.door.mismatch.report'
    _description = 'Door Mismatch Report'

    date_from = fields.Date(string='From Date', required=True, default=fields.Date.today)
    date_to = fields.Date(string='To Date', required=True, default=fields.Date.today)
    employee_ids = fields.Many2many('hr.employee', string='Employees (leave empty for all)')

    def action_generate_report(self):
        """Find employees detected at door but without proper app checkout."""
        self.ensure_one()

        # Clear old report lines
        self.env['face.door.mismatch.line'].sudo().search([]).unlink()

        date_from = datetime.combine(self.date_from, datetime.min.time())
        date_to = datetime.combine(self.date_to, datetime.max.time())

        # Get all door detections in the date range
        domain = [
            ('detection_time', '>=', date_from),
            ('detection_time', '<=', date_to),
        ]
        if self.employee_ids:
            domain.append(('employee_id', 'in', self.employee_ids.ids))

        detections = self.env['face.attendance.log'].search(domain)

        Attendance = self.env['hr.attendance']
        mismatch_lines = []

        for det in detections:
            # Check if employee had a proper app checkout within 30 min window
            time_before = det.detection_time - timedelta(minutes=30)
            time_after = det.detection_time + timedelta(minutes=30)

            # Check for any attendance check_out near this time
            checkout = Attendance.search([
                ('employee_id', '=', det.employee_id.id),
                ('check_out', '>=', time_before),
                ('check_out', '<=', time_after),
            ], limit=1)

            # Check for any attendance check_in near this time
            checkin = Attendance.search([
                ('employee_id', '=', det.employee_id.id),
                ('check_in', '>=', time_before),
                ('check_in', '<=', time_after),
            ], limit=1)

            if not checkout and not checkin:
                # Mismatch! Detected at door but no app check-in or check-out
                mismatch_lines.append({
                    'employee_id': det.employee_id.id,
                    'detection_time': det.detection_time,
                    'confidence': det.confidence,
                    'camera_name': det.camera_name,
                    'snapshot': det.snapshot,
                    'remark': 'Detected at door without app check-in/check-out',
                })

        # Create mismatch lines
        for vals in mismatch_lines:
            self.env['face.door.mismatch.line'].create(vals)

        # Open the mismatch report
        return {
            'name': f'Door Mismatches ({self.date_from} to {self.date_to})',
            'type': 'ir.actions.act_window',
            'res_model': 'face.door.mismatch.line',
            'view_mode': 'tree,form',
            'target': 'current',
            'context': {'create': False},
        }


class DoorMismatchLine(models.TransientModel):
    _name = 'face.door.mismatch.line'
    _description = 'Door Mismatch Report Line'
    _order = 'detection_time desc'

    employee_id = fields.Many2one('hr.employee', string='Employee', readonly=True)
    employee_name = fields.Char(related='employee_id.name', string='Employee Name', store=True)
    detection_time = fields.Datetime(string='Detected At Door', readonly=True)
    confidence = fields.Float(string='Confidence (%)', readonly=True)
    camera_name = fields.Char(string='Camera', readonly=True)
    snapshot = fields.Binary(string='Snapshot', readonly=True)
    remark = fields.Char(string='Remark', readonly=True)
