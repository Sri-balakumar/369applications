from odoo import models, fields, api


class RiskScoreHistory(models.Model):
    _name = 'risk.score.history'
    _description = 'Risk Score History'
    _order = 'change_date desc, id desc'
    _rec_name = 'partner_id'

    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        required=True,
        ondelete='cascade',
        index=True,
    )

    old_risk_score = fields.Float(
        string='Old Risk Score',
        digits=(5, 2),
    )

    new_risk_score = fields.Float(
        string='New Risk Score',
        digits=(5, 2),
    )

    old_risk_level = fields.Selection([
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ], string='Old Risk Level')

    new_risk_level = fields.Selection([
        ('low', 'Low Risk'),
        ('medium', 'Medium Risk'),
        ('high', 'High Risk'),
    ], string='New Risk Level')

    change_date = fields.Datetime(
        string='Change Date',
        default=fields.Datetime.now,
        readonly=True,
    )

    reason = fields.Char(
        string='Reason for Change',
        default='Risk score updated',
    )
