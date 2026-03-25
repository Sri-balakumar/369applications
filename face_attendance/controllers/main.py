import json
import logging

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)


class FaceAttendanceController(http.Controller):

    @http.route('/face_attendance/employees', type='json', auth='user', methods=['POST'])
    def get_employees_with_faces(self, **kwargs):
        """Return all employees that have face encodings registered.
        Used by camera script to load known faces on startup.
        """
        employees = request.env['hr.employee'].sudo().search([
            ('face_encoding', '!=', False),
        ])
        result = []
        for emp in employees:
            result.append({
                'id': emp.id,
                'name': emp.name,
                'encoding': emp.face_encoding,
            })
        _logger.info('Returning %d employees with face encodings.', len(result))
        return result

    @http.route('/face_attendance/log', type='json', auth='user', methods=['POST'])
    def log_detection(self, **kwargs):
        """Camera script calls this when a face is detected at the door.
        Simply logs who was seen - no check-in/out logic.
        """
        employee_id = kwargs.get('employee_id')
        confidence = kwargs.get('confidence', 0.0)
        snapshot_base64 = kwargs.get('snapshot_base64')
        camera_name = kwargs.get('camera_name', 'Main Door')

        if not employee_id:
            return {'success': False, 'error': 'employee_id is required'}

        try:
            result = request.env['face.attendance.log'].sudo().create_from_camera(
                employee_id=employee_id,
                confidence=confidence,
                snapshot_base64=snapshot_base64,
                camera_name=camera_name,
            )
            _logger.info(
                'Door detection logged: %s (%s%%)',
                result.get('employee_name'),
                confidence,
            )
            return {'success': True, **result}
        except Exception as e:
            _logger.error('Error logging door detection: %s', str(e))
            return {'success': False, 'error': str(e)}

    @http.route('/face_attendance/register', type='json', auth='user', methods=['POST'])
    def register_face(self, **kwargs):
        """Register face encoding for an employee.
        Camera script computes the encoding and sends it here.
        """
        employee_id = kwargs.get('employee_id')
        encoding = kwargs.get('encoding')
        face_image_base64 = kwargs.get('face_image_base64')

        if not employee_id or not encoding:
            return {'success': False, 'error': 'employee_id and encoding are required'}

        try:
            employee = request.env['hr.employee'].sudo().browse(employee_id)
            if not employee.exists():
                return {'success': False, 'error': 'Employee not found'}

            vals = {'face_encoding': encoding}
            if face_image_base64:
                vals['face_image'] = face_image_base64

            employee.write(vals)
            _logger.info('Face registered for employee: %s', employee.name)
            return {'success': True, 'employee_name': employee.name}
        except Exception as e:
            _logger.error('Error registering face: %s', str(e))
            return {'success': False, 'error': str(e)}
