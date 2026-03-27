from odoo import models, fields, api, _
import logging

_logger = logging.getLogger(__name__)


class CreditFacility(models.Model):
    _name = 'credit.facility'
    _description = 'Credit Facility Application'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _rec_name = 'display_name'
    _order = 'submission_date desc, id desc'

    # Sequence name
    name = fields.Char(
        string='Reference',
        readonly=True,
        copy=False,
        default='New',
    )

    display_name = fields.Char(
        compute='_compute_display_name',
        store=True,
    )

    @api.depends('name', 'partner_id.name')
    def _compute_display_name(self):
        for rec in self:
            if rec.name and rec.name != 'New':
                rec.display_name = '%s - %s' % (rec.name, rec.partner_id.name or '')
            else:
                rec.display_name = rec.partner_id.name or 'New'

    # Basic Information
    active = fields.Boolean(string='Active', default=True)
    
    partner_id = fields.Many2one(
        'res.partner', string='Customer', required=True,
        ondelete='cascade', tracking=True,
    )
    
    use_credit_facility = fields.Selection([
        ('yes', 'Yes'), ('no', 'No')
    ], string='Use Credit Facility', tracking=True)
    
    currency_id = fields.Many2one(
        'res.currency', string='Currency',
        default=lambda self: self.env.company.currency_id,
    )
    
    state = fields.Selection([
        ('draft', 'Draft'),
        ('submitted', 'Submitted'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected')
    ], string='Status', default='draft', tracking=True)
    
    submission_date = fields.Datetime(
        string='Submission Date', default=fields.Datetime.now, tracking=True,
    )

    # ==================== COMPANY INFORMATION ====================
    company_name = fields.Char(string='Company Name', tracking=True)
    company_address = fields.Text(string='Company Address')
    fax = fields.Char(string='Fax')
    phone_number = fields.Char(string='Phone Number', tracking=True)
    trade_license_no = fields.Char(string='Trade License No', tracking=True)
    po_box = fields.Char(string='PO Box')
    email = fields.Char(string='Email', tracking=True)
    license_issue_date = fields.Date(string='License Issue Date')
    license_expiry_date = fields.Date(string='License Expiry Date')
    credit_issue_date = fields.Date(string='Credit Issue Date')
    credit_expiry_date = fields.Date(string='Credit Expiry Date')
    credit_limit = fields.Monetary(
        string='Credit Limit', currency_field='currency_id', tracking=True,
    )

    # ==================== BRANCH DETAILS ====================
    branch_mobile_no = fields.Char(string='Branch Mobile No')
    branch_tele = fields.Char(string='Branch Telephone')
    branch_fax = fields.Char(string='Branch Fax')

    # ==================== BUSINESS INFORMATION ====================
    local_sponsor = fields.Char(string='Local Sponsor')
    occupation = fields.Char(string='Occupation')

    # ==================== PROPRIETORS ====================
    proprietor_name_1 = fields.Char(string='Proprietor 1 Name')
    proprietor_nationality_1 = fields.Char(string='Proprietor 1 Nationality')
    proprietor_holding_1 = fields.Float(string='Proprietor 1 Holding %')
    proprietor_name_2 = fields.Char(string='Proprietor 2 Name')
    proprietor_nationality_2 = fields.Char(string='Proprietor 2 Nationality')
    proprietor_holding_2 = fields.Float(string='Proprietor 2 Holding %')
    proprietor_name_3 = fields.Char(string='Proprietor 3 Name')
    proprietor_nationality_3 = fields.Char(string='Proprietor 3 Nationality')
    proprietor_holding_3 = fields.Float(string='Proprietor 3 Holding %')

    # ==================== SIGNATORIES ====================
    signatory_name_1 = fields.Char(string='Signatory 1 Name')
    signatory_nationality_1 = fields.Char(string='Signatory 1 Nationality')
    signatory_signature_1 = fields.Binary(string='Signatory 1 Signature')
    signatory_name_2 = fields.Char(string='Signatory 2 Name')
    signatory_nationality_2 = fields.Char(string='Signatory 2 Nationality')
    signatory_signature_2 = fields.Binary(string='Signatory 2 Signature')
    signatory_name_3 = fields.Char(string='Signatory 3 Name')
    signatory_nationality_3 = fields.Char(string='Signatory 3 Nationality')
    signatory_signature_3 = fields.Binary(string='Signatory 3 Signature')

    # ==================== PURCHASING CONTACTS ====================
    purchasing_name_1 = fields.Char(string='Purchasing Contact 1 Name')
    purchasing_title_1 = fields.Char(string='Purchasing Contact 1 Title')
    purchasing_tele_1 = fields.Char(string='Purchasing Contact 1 Telephone')
    purchasing_fax_1 = fields.Char(string='Purchasing Contact 1 Fax')
    purchasing_email_1 = fields.Char(string='Purchasing Contact 1 Email')
    purchasing_signature_1 = fields.Binary(string='Purchasing Contact 1 Signature')
    purchasing_name_2 = fields.Char(string='Purchasing Contact 2 Name')
    purchasing_title_2 = fields.Char(string='Purchasing Contact 2 Title')
    purchasing_tele_2 = fields.Char(string='Purchasing Contact 2 Telephone')
    purchasing_fax_2 = fields.Char(string='Purchasing Contact 2 Fax')
    purchasing_email_2 = fields.Char(string='Purchasing Contact 2 Email')
    purchasing_signature_2 = fields.Binary(string='Purchasing Contact 2 Signature')

    # ==================== ACCOUNTS CONTACT ====================
    accounts_name = fields.Char(string='Accounts Contact Name')
    accounts_tele = fields.Char(string='Accounts Telephone')
    accounts_fax = fields.Char(string='Accounts Fax')
    accounts_email = fields.Char(string='Accounts Email')
    accounts_signature = fields.Binary(string='Accounts Signature')
    date_business_started = fields.Date(string='Date Business Started')
    any_other_business = fields.Selection([
        ('yes', 'Yes'), ('no', 'No')
    ], string='Any Other Business')
    business_description = fields.Text(string='Business Description')

    # ==================== SALES VOLUME ====================
    sales_volume = fields.Monetary(string='Yearly Sales Volume', currency_field='currency_id')
    sales_days = fields.Integer(string='Sales Days')

    # ==================== BANK DETAILS ====================
    bank_name_1 = fields.Char(string='Bank 1 Name')
    bank_account_1 = fields.Char(string='Bank 1 Account')
    bank_branch_1 = fields.Char(string='Bank 1 Branch')
    bank_country_1 = fields.Char(string='Bank 1 Country')
    bank_tele_1 = fields.Char(string='Bank 1 Telephone')
    bank_fax_1 = fields.Char(string='Bank 1 Fax')
    bank_name_2 = fields.Char(string='Bank 2 Name')
    bank_account_2 = fields.Char(string='Bank 2 Account')
    bank_branch_2 = fields.Char(string='Bank 2 Branch')
    bank_country_2 = fields.Char(string='Bank 2 Country')
    bank_tele_2 = fields.Char(string='Bank 2 Telephone')
    bank_fax_2 = fields.Char(string='Bank 2 Fax')

    # ==================== DOCUMENT UPLOADS ====================
    trade_license_file = fields.Binary(string='Trade License File')
    tax_registration_file = fields.Binary(string='Tax Registration File')
    nationality_id_file = fields.Binary(string='Nationality ID File')
    passport_copy_file = fields.Binary(string='Passport Copy File')
    credit_application_file = fields.Binary(string='Credit Application File')

    # ==================== APPROVAL FIELDS ====================
    approved_by = fields.Many2one('res.users', string='Approved/Rejected By', readonly=True)
    approval_date = fields.Datetime(string='Approval/Rejection Date', readonly=True)
    rejection_reason = fields.Text(string='Rejection Reason', tracking=True)
    email_approval_token = fields.Char(string='Email Approval Token', copy=False)

    # ==================== SEQUENCE ON CREATE ====================

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code('credit.facility') or 'New'
        
        records = super().create(vals_list)
        return records

    # ==================== SUBMIT ACTION ====================

    def action_submit(self):
        """Submit the credit facility application for manager review."""
        self.ensure_one()
        import uuid
        self.write({
            'state': 'submitted',
            'submission_date': fields.Datetime.now(),
            'email_approval_token': str(uuid.uuid4()),
        })
        self._send_submission_email_to_managers()
        self._send_submission_whatsapp_to_admin()
        self.message_post(body='Application submitted for review by %s' % self.env.user.name)
        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Submitted',
                'message': 'Credit facility application submitted. Managers have been notified via Email and WhatsApp.',
                'type': 'success',
                'sticky': False,
            }
        }

    # ==================== EMAIL ON SUBMISSION ====================

    def _send_submission_email_to_managers(self):
        """Send email notification when a credit facility is submitted.
        Sends to the Odoo user whose phone matches the connected WhatsApp session (QR-scanned phone)."""
        self.ensure_one()

        email_list = ''

        # Priority 1: Find Odoo user whose phone matches the connected WA session
        try:
            session = self.env['whatsapp.session'].sudo().search([
                ('status', '=', 'connected'),
                ('phone_number', '!=', False),
            ], limit=1)
            if session and session.phone_number:
                phone_last10 = session.phone_number[-10:]
                user = self.env['res.users'].sudo().search([
                    '|',
                    ('mobile', 'ilike', phone_last10),
                    ('phone', 'ilike', phone_last10),
                ], limit=1)
                if user and user.email:
                    email_list = user.email
        except Exception as e:
            _logger.warning("Could not get email from WA session: %s", e)

        if not email_list:
            # Fallback: Sales Managers group
            manager_group = self.env.ref('sales_team.group_sale_manager', raise_if_not_found=False)
            if manager_group:
                managers = self.env['res.users'].search([
                    ('group_ids', 'in', manager_group.id),
                    ('email', '!=', False),
                ])
                if managers:
                    email_list = ','.join(managers.mapped('email'))

        if not email_list:
            # Fallback: admin user
            admin = self.env.ref('base.user_admin', raise_if_not_found=False)
            if admin and admin.email:
                email_list = admin.email
        
        if not email_list:
            _logger.warning("No manager emails found for credit facility notification")
            return
        
        _logger.info("Sending credit facility email to: %s", email_list)

        template = self.env.ref(
            'credit_management_system.mail_template_credit_facility_submitted',
            raise_if_not_found=False
        )
        if template:
            # Force the email_to on template before sending
            template = template.with_context(manager_emails=email_list)
            try:
                template.send_mail(self.id, force_send=True, email_values={'email_to': email_list})
                _logger.info("Credit facility submission email sent for %s to %s",
                             self.partner_id.name, email_list)
            except Exception as e:
                _logger.exception("Failed to send credit facility email: %s", e)
        else:
            # Fallback: send via mail.mail directly if template not found
            _logger.warning("Email template not found, sending via mail.mail")
            try:
                currency = self.currency_id.symbol or '$'
                body = (
                    '<p>Dear Manager,</p>'
                    '<p>A new credit facility application has been submitted:</p>'
                    '<ul>'
                    '<li><b>Reference:</b> %s</li>'
                    '<li><b>Customer:</b> %s</li>'
                    '<li><b>Company:</b> %s</li>'
                    '<li><b>Requested Credit Limit:</b> %s %s</li>'
                    '<li><b>Trade License:</b> %s</li>'
                    '</ul>'
                    '<p>Please review and approve/reject from Odoo.</p>'
                ) % (
                    self.name or 'New',
                    self.partner_id.name,
                    self.company_name or 'N/A',
                    currency, '{:,.2f}'.format(self.credit_limit or 0),
                    self.trade_license_no or 'N/A',
                )
                mail = self.env['mail.mail'].sudo().create({
                    'subject': 'New Credit Facility Application: %s - %s' % (self.name or 'New', self.partner_id.name),
                    'body_html': body,
                    'email_to': email_list,
                    'email_from': self.env.company.email or 'noreply@example.com',
                })
                mail.send()
                _logger.info("Fallback email sent for credit facility %s", self.name)
            except Exception as e:
                _logger.exception("Fallback email also failed: %s", e)

    # ==================== WHATSAPP ON SUBMISSION ====================

    def _send_submission_whatsapp_to_admin(self):
        """Send WhatsApp notification to admin when a credit facility is submitted."""
        self.ensure_one()
        try:
            wa_integration = self.env['whatsapp.integration'].search([('is_active', '=', True)], limit=1)
            if wa_integration:
                result = wa_integration.send_credit_facility_approval_request(self)
                if result and result.get('ok'):
                    _logger.info("WhatsApp sent for credit facility %s", self.name)
                else:
                    _logger.warning("WhatsApp failed for credit facility %s: %s", self.name, result)
        except Exception as e:
            _logger.exception("WhatsApp error for credit facility %s: %s", self.name, e)

    # ==================== ACTIONS ====================

    def action_approve(self):
        """Approve the credit facility application and set credit limit on partner."""
        self.ensure_one()
        self.write({
            'state': 'approved',
            'approved_by': self.env.user.id,
            'approval_date': fields.Datetime.now(),
        })

        partner_vals = {
            'custom_credit_limit': self.credit_limit,
        }
        if self.credit_issue_date:
            partner_vals['credit_issue_date'] = self.credit_issue_date
        if self.credit_expiry_date:
            partner_vals['credit_expiry_date'] = self.credit_expiry_date
        if self.license_issue_date:
            partner_vals['license_issue_date'] = self.license_issue_date
        if self.license_expiry_date:
            partner_vals['license_expiry_date'] = self.license_expiry_date
        if self.trade_license_no:
            partner_vals['trade_license_no'] = self.trade_license_no

        # Release from hold if it was due to expiry
        if self.partner_id.is_credit_hold and self.partner_id.credit_hold_reason and 'expired' in (self.partner_id.credit_hold_reason or '').lower():
            partner_vals['is_credit_hold'] = False
            partner_vals['credit_hold_reason'] = False
            partner_vals['credit_hold_date'] = False

        self.partner_id.write(partner_vals)

        self.message_post(
            body='<strong>Application APPROVED</strong><br/>'
                 'Approved by: %s<br/>'
                 'Credit Limit: %s %s<br/>'
                 'Customer credit limit has been updated.' % (
                     self.env.user.name,
                     self.currency_id.symbol,
                     '{:,.2f}'.format(self.credit_limit),
                 ),
            subject='Credit Facility Approved',
        )

        # Send approval notification email
        self._send_approval_result_email('approved')

        # Send WhatsApp notification
        try:
            wa_integration = self.env['whatsapp.integration'].search([('is_active', '=', True)], limit=1)
            if wa_integration:
                wa_integration.send_credit_facility_approved_wa(self)
        except Exception as e:
            _logger.exception("WhatsApp error on facility approval: %s", e)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Approved',
                'message': 'Credit facility approved. Credit limit of %s %s set for %s.' % (
                    self.currency_id.symbol,
                    '{:,.2f}'.format(self.credit_limit),
                    self.partner_id.name,
                ),
                'type': 'success',
                'sticky': False,
            }
        }

    def action_reject(self):
        """Reject the credit facility application."""
        self.ensure_one()
        self.write({
            'state': 'rejected',
            'approved_by': self.env.user.id,
            'approval_date': fields.Datetime.now(),
        })

        self.partner_id.write({'custom_credit_limit': 0.0})

        self.message_post(
            body='<strong>Application REJECTED</strong><br/>'
                 'Rejected by: %s<br/>'
                 'Reason: %s<br/>'
                 'Customer credit limit has been set to 0.' % (
                     self.env.user.name,
                     self.rejection_reason or 'No reason provided',
                 ),
            subject='Credit Facility Rejected',
        )

        # Send rejection notification email
        self._send_approval_result_email('rejected')

        # Send WhatsApp notification
        try:
            wa_integration = self.env['whatsapp.integration'].search([('is_active', '=', True)], limit=1)
            if wa_integration:
                wa_integration.send_credit_facility_rejected_wa(self)
        except Exception as e:
            _logger.exception("WhatsApp error on facility rejection: %s", e)

        return {
            'type': 'ir.actions.client',
            'tag': 'display_notification',
            'params': {
                'title': 'Rejected',
                'message': 'Credit facility rejected for %s.' % self.partner_id.name,
                'type': 'warning',
                'sticky': False,
            }
        }

    def _format_local_dt(self, dt):
        """Convert UTC datetime to company timezone for email display."""
        if not dt:
            return 'N/A'
        import pytz
        tz_name = self.env.company.partner_id.tz or self.env.user.tz or 'UTC'
        tz = pytz.timezone(tz_name)
        local_dt = dt.replace(tzinfo=pytz.UTC).astimezone(tz)
        return local_dt.strftime('%Y-%m-%d %H:%M')

    def _get_admin_email(self):
        """Get admin email for notifications (same QR session phone priority as sale_order)."""
        try:
            session = self.env['whatsapp.session'].sudo().search([
                ('status', '=', 'connected'),
                ('phone_number', '!=', False),
            ], limit=1)
            if session and session.phone_number:
                phone_last10 = session.phone_number[-10:]
                user = self.env['res.users'].sudo().search([
                    '|',
                    ('mobile', 'ilike', phone_last10),
                    ('phone', 'ilike', phone_last10),
                ], limit=1)
                if user and user.email:
                    return user.email
        except Exception as e:
            _logger.warning("Could not get admin email from WA session: %s", e)

        admin = self.env.ref('base.user_admin', raise_if_not_found=False)
        if admin and admin.email:
            return admin.email
        return None

    def _send_approval_result_email(self, result):
        """Send email notification on approval/rejection of credit facility.

        Two emails are sent:
        1. To the customer (partner) via mail template.
        2. A confirmation to the admin (QR phone user) so they know the action went through.
        """
        self.ensure_one()

        # 1. Send to customer via template
        if result == 'approved':
            template = self.env.ref('credit_management_system.mail_template_credit_facility_approved', raise_if_not_found=False)
        else:
            template = self.env.ref('credit_management_system.mail_template_credit_facility_rejected', raise_if_not_found=False)

        if template:
            try:
                template.send_mail(self.id, force_send=True)
            except Exception as e:
                _logger.exception("Failed to send credit facility result email to customer: %s", e)

        # 2. Send confirmation to admin
        admin_email = self._get_admin_email()
        if admin_email:
            try:
                self._send_admin_confirmation_email(result, admin_email)
            except Exception as e:
                _logger.exception("Failed to send admin confirmation email: %s", e)

    def _send_admin_confirmation_email(self, result, admin_email):
        """Send a brief confirmation email to the admin after they approve/reject a credit facility."""
        self.ensure_one()

        currency = self.currency_id.symbol or ''
        amount = '{:,.2f}'.format(self.credit_limit or 0)

        if result == 'approved':
            subject = f'Credit Facility Approved: {self.name} - {self.partner_id.name}'
            header_color = '#4CAF50'
            header_text = 'Credit Facility Approved'
            body_line = (
                f'You have <strong style="color:#4CAF50;">APPROVED</strong> the credit facility application '
                f'<strong>{self.name}</strong> for <strong>{self.partner_id.name}</strong>.'
            )
            detail_color = '#e8f5e9'
            border_color = '#4CAF50'
            extra_row = (
                f'<tr><td style="font-weight:bold;color:#666;width:160px;">Credit Limit Set:</td>'
                f'<td style="color:#333;font-weight:bold;font-size:16px;">{currency} {amount}</td></tr>'
            )
        else:
            subject = f'Credit Facility Rejected: {self.name} - {self.partner_id.name}'
            header_color = '#f44336'
            header_text = 'Credit Facility Rejected'
            body_line = (
                f'You have <strong style="color:#f44336;">REJECTED</strong> the credit facility application '
                f'<strong>{self.name}</strong> for <strong>{self.partner_id.name}</strong>.'
            )
            detail_color = '#ffebee'
            border_color = '#f44336'
            extra_row = (
                f'<tr><td style="font-weight:bold;color:#666;width:160px;">Reason:</td>'
                f'<td style="color:#c62828;">{self.rejection_reason or "No reason provided"}</td></tr>'
            )

        approved_by = self.approved_by.name if self.approved_by else 'Administrator'
        approval_date = self.approval_date.strftime('%Y-%m-%d %H:%M') if self.approval_date else 'N/A'
        company_name = self.partner_id.company_id.name or 'Your Company'

        body_html = f"""
<div style="margin:0;padding:0;font-family:Arial,sans-serif;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f4;padding:20px;">
    <tr><td align="center">
      <table border="0" cellpadding="0" cellspacing="0" width="580" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
        <tr><td style="background:{header_color};padding:25px;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:22px;">{header_text}</h1>
        </td></tr>
        <tr><td style="padding:25px;">
          <p style="font-size:15px;color:#333;">{body_line}</p>
          <table border="0" cellpadding="8" cellspacing="0" width="100%"
                 style="background-color:{detail_color};border-radius:8px;margin:15px 0;border-left:4px solid {border_color};">
            <tr><td style="padding:12px;">
              <table border="0" cellpadding="5" cellspacing="0" width="100%">
                <tr><td style="font-weight:bold;color:#666;width:160px;">Application:</td>
                    <td style="color:#333;font-weight:bold;">{self.name}</td></tr>
                <tr><td style="font-weight:bold;color:#666;">Customer:</td>
                    <td style="color:#333;">{self.partner_id.name}</td></tr>
                <tr><td style="font-weight:bold;color:#666;">Company:</td>
                    <td style="color:#333;">{self.company_name or 'N/A'}</td></tr>
                {extra_row}
                <tr><td style="font-weight:bold;color:#666;">Action By:</td>
                    <td style="color:#333;">{approved_by}</td></tr>
                <tr><td style="font-weight:bold;color:#666;">Date:</td>
                    <td style="color:#333;">{approval_date}</td></tr>
              </table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="background-color:#f5f5f5;padding:15px;text-align:center;border-radius:0 0 8px 8px;">
          <p style="margin:0;color:#666;font-size:12px;">Automated message from {company_name} Credit Management System</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>"""

        mail = self.env['mail.mail'].sudo().create({
            'subject': subject,
            'body_html': body_html,
            'email_to': admin_email,
            'email_from': self.env.company.email or 'noreply@example.com',
            'auto_delete': False,
        })
        mail.send(raise_exception=False)
        _logger.info("Admin confirmation email sent to %s for facility %s (%s)", admin_email, self.name, result)

    def action_reset_to_draft(self):
        """Reset application back to draft."""
        self.ensure_one()
        self.write({
            'state': 'draft',
            'approved_by': False,
            'approval_date': False,
            'rejection_reason': False,
        })
        self.message_post(body='Application reset to Draft by %s' % self.env.user.name)
