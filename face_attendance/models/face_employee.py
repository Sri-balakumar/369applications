import base64
import json
import logging

from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class HrEmployee(models.Model):
    _inherit = 'hr.employee'

    face_image = fields.Binary(
        string='Face Photo',
        help='Upload a clear front-facing photo of the employee for face recognition.',
    )
    face_encoding = fields.Text(
        string='Face Encoding',
        help='Auto-generated face encoding data (JSON). Do not edit manually.',
    )
    face_registered = fields.Boolean(
        string='Face Registered',
        compute='_compute_face_registered',
        store=True,
    )

    @api.depends('face_encoding')
    def _compute_face_registered(self):
        for rec in self:
            rec.face_registered = bool(rec.face_encoding)

    def action_compute_face_encoding(self):
        """Compute face encoding from the uploaded face image.
        This is called from the camera script via API, not from the Odoo UI,
        because face_recognition library is not installed on the Odoo server.
        """
        for rec in self:
            if not rec.face_image:
                rec.face_encoding = False
                continue
            # Encoding is computed by the camera script and sent via API
            _logger.info('Face encoding for employee %s should be computed by camera script.', rec.name)
