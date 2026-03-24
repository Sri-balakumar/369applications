from odoo import models, fields, api
from markupsafe import Markup


class CustomerVisit(models.Model):
    _name = 'customer.visit'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _description = 'Customer Visit'
    _order = 'date_time desc, id desc'

    name = fields.Char(string='Reference', readonly=True, copy=False, default='New')
    employee_id = fields.Many2one('hr.employee', string='Visited By', index=True, tracking=True)
    partner_id = fields.Many2one('res.partner', string='Customer', required=True, index=True, tracking=True)
    date_time = fields.Datetime(string='Date and Time', default=fields.Datetime.now, tracking=True)
    purpose_id = fields.Many2one('visit.purpose', string='Visit Purpose', tracking=True)
    visit_duration = fields.Selection([
        ('0_15', '0 to 15 minutes'),
        ('15_30', '15 to 30 minutes'),
        ('30_60', '30 to 60 minutes'),
        ('60_plus', 'More than 60 minutes'),
    ], string='Visit Duration')
    remarks = fields.Text(string='Remarks')
    latitude = fields.Float(string='Latitude', digits=(16, 8))
    longitude = fields.Float(string='Longitude', digits=(16, 8))
    location_name = fields.Char(string='Location')
    visit_plan_id = fields.Many2one('visit.plan', string='Visit Plan', ondelete='set null')
    image_ids = fields.One2many('customer.visit.image', 'visit_id', string='Images')
    voice_note = fields.Binary(string='Voice Note', attachment=True)
    voice_note_filename = fields.Char(string='Voice Note Filename')
    voice_note_player = fields.Html(string='Play Voice Note', compute='_compute_voice_note_player', sanitize=False)
    state = fields.Selection([
        ('draft', 'Draft'),
        ('done', 'Done'),
    ], string='Status', default='draft', tracking=True)
    company_id = fields.Many2one('res.company', string='Company', default=lambda self: self.env.company)

    @api.depends('voice_note', 'voice_note_filename')
    def _compute_voice_note_player(self):
        for record in self:
            if record.voice_note:
                base_url = self.env['ir.config_parameter'].sudo().get_param('web.base.url')
                audio_url = f'{base_url}/web/content?model=customer.visit&id={record.id}&field=voice_note&filename={record.voice_note_filename or "voice_note.m4a"}'
                record.voice_note_player = Markup(
                    '<audio controls style="width:100%%;"><source src="%s" type="audio/mp4">Your browser does not support audio.</audio>'
                ) % audio_url
            else:
                record.voice_note_player = Markup('<span style="color: #999;">No voice note</span>')

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code('customer.visit') or 'New'
        return super().create(vals_list)

    def action_done(self):
        self.filtered(lambda r: r.state == 'draft').write({'state': 'done'})

    def action_reset_to_draft(self):
        self.filtered(lambda r: r.state == 'done').write({'state': 'draft'})


class CustomerVisitImage(models.Model):
    _name = 'customer.visit.image'
    _description = 'Customer Visit Image'

    visit_id = fields.Many2one('customer.visit', string='Visit', required=True, ondelete='cascade')
    image = fields.Binary(string='Image', required=True, attachment=True)
    image_filename = fields.Char(string='Filename')
