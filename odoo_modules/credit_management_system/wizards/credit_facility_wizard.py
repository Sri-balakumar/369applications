from odoo import models, fields, api, _
from odoo.exceptions import UserError, ValidationError
import re
import base64
from io import BytesIO

try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    REPORTLAB_AVAILABLE = True
except ImportError:
    REPORTLAB_AVAILABLE = False


class CreditFacilityWizard(models.TransientModel):
    _name = 'credit.facility.wizard'
    _description = 'Credit Facility Setup Wizard'

    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        required=True,
        readonly=True,
    )

    use_credit_facility = fields.Selection([
        ('yes', 'Yes, I want to use credit facility'),
        ('no', 'No, I will pay in cash/advance'),
    ], string='Do you want to use our credit facility?', 
       required=True,
       default='yes')

    show_application_form = fields.Boolean(
        string='Show Application Form',
        compute='_compute_show_application_form',
        store=False,
    )

    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        default=lambda self: self.env.company.currency_id,
    )

    # ==================== COMPANY DETAILS ====================
    company_name = fields.Char(string='Company Name')
    company_address = fields.Text(string='Address')
    fax = fields.Char(string='Fax')
    phone_number = fields.Char(string='Phone Number')
    trade_license_no = fields.Char(string='Trade License No')
    po_box = fields.Char(string='PO Box')
    email = fields.Char(string='Email ID')
    license_expiry_date = fields.Date(string='License Expiry Date')
    license_issue_date = fields.Date(string='License Issue Date')
    credit_issue_date = fields.Date(string='Credit Issue Date')
    credit_expiry_date = fields.Date(string='Credit Expiry Date')
    credit_limit = fields.Monetary(
        string='Credit Limit Set',
        currency_field='currency_id',
    )

    # ==================== BRANCH DETAILS ====================
    branch_mobile_no = fields.Char(string='Branch Mobile No')
    branch_tele = fields.Char(string='Branch Tele')
    branch_fax = fields.Char(string='Branch Fax')

    # ==================== BUSINESS & CREDIT INFORMATION ====================
    local_sponsor = fields.Char(string='Local Sponsor')
    occupation = fields.Char(string='Occupation')

    # Dynamic row visibility flags
    show_proprietor_row_2 = fields.Boolean(string='Show Proprietor Row 2', default=True)
    show_proprietor_row_3 = fields.Boolean(string='Show Proprietor Row 3', default=True)
    show_signatory_row_2 = fields.Boolean(string='Show Signatory Row 2', default=True)
    show_signatory_row_3 = fields.Boolean(string='Show Signatory Row 3', default=True)
    show_purchasing_row_2 = fields.Boolean(string='Show Purchasing Row 2', default=True)
    show_bank_row_2 = fields.Boolean(string='Show Bank Row 2', default=True)

    # Proprietors/Stakeholders/Shareholders (3 rows)
    proprietor_name_1 = fields.Char(string='Proprietor/Stakeholder Name 1')
    proprietor_nationality_1 = fields.Char(string='Nationality 1')
    proprietor_holding_1 = fields.Float(string='Holding % 1')

    proprietor_name_2 = fields.Char(string='Proprietor/Stakeholder Name 2')
    proprietor_nationality_2 = fields.Char(string='Nationality 2')
    proprietor_holding_2 = fields.Float(string='Holding % 2')

    proprietor_name_3 = fields.Char(string='Proprietor/Stakeholder Name 3')
    proprietor_nationality_3 = fields.Char(string='Nationality 3')
    proprietor_holding_3 = fields.Float(string='Holding % 3')

    # Authorized Signatories (3 rows) - With signature file upload
    signatory_name_1 = fields.Char(string='Authorized Person 1')
    signatory_nationality_1 = fields.Char(string='Signatory Nationality 1')
    signatory_signature_1 = fields.Binary(string='Signature 1')
    signatory_signature_1_filename = fields.Char(string='Signature 1 Filename')

    signatory_name_2 = fields.Char(string='Authorized Person 2')
    signatory_nationality_2 = fields.Char(string='Signatory Nationality 2')
    signatory_signature_2 = fields.Binary(string='Signature 2')
    signatory_signature_2_filename = fields.Char(string='Signature 2 Filename')

    signatory_name_3 = fields.Char(string='Authorized Person 3')
    signatory_nationality_3 = fields.Char(string='Signatory Nationality 3')
    signatory_signature_3 = fields.Binary(string='Signature 3')
    signatory_signature_3_filename = fields.Char(string='Signature 3 Filename')

    # ==================== PURCHASING CONTACT (2 rows) ====================
    purchasing_name_1 = fields.Char(string='Purchasing Contact Name 1')
    purchasing_title_1 = fields.Char(string='Title 1')
    purchasing_tele_1 = fields.Char(string='Tele 1')
    purchasing_fax_1 = fields.Char(string='Fax 1')
    purchasing_email_1 = fields.Char(string='Email 1')
    purchasing_signature_1 = fields.Binary(string='Purchasing Signature 1')
    purchasing_signature_1_filename = fields.Char(string='Purchasing Signature 1 Filename')

    purchasing_name_2 = fields.Char(string='Purchasing Contact Name 2')
    purchasing_title_2 = fields.Char(string='Title 2')
    purchasing_tele_2 = fields.Char(string='Tele 2')
    purchasing_fax_2 = fields.Char(string='Fax 2')
    purchasing_email_2 = fields.Char(string='Email 2')
    purchasing_signature_2 = fields.Binary(string='Purchasing Signature 2')
    purchasing_signature_2_filename = fields.Char(string='Purchasing Signature 2 Filename')

    # ==================== ACCOUNTS CONTACT ====================
    accounts_name = fields.Char(string='Accounts Contact Name')
    accounts_tele = fields.Char(string='Accounts Tele')
    accounts_fax = fields.Char(string='Accounts Fax')
    accounts_email = fields.Char(string='Accounts Email')
    date_business_started = fields.Date(string='Date of Business Started')
    any_other_business = fields.Selection([
        ('yes', 'Yes'),
        ('no', 'No')
    ], string='Any Other Business')
    business_description = fields.Text(string='Business Description')
    accounts_signature = fields.Binary(string='Accounts Signature')
    accounts_signature_filename = fields.Char(string='Accounts Signature Filename')

    # ==================== PRESENT YEARLY SALES VOLUME ====================
    sales_volume = fields.Monetary(
        string='Sales Volume',
        currency_field='currency_id',
    )
    sales_days = fields.Integer(string='Days')

    # ==================== BANK DETAILS (2 rows) ====================
    bank_name_1 = fields.Char(string='Bank 1')
    bank_account_1 = fields.Char(string='Account Number 1')
    bank_branch_1 = fields.Char(string='Branch 1')
    bank_country_1 = fields.Char(string='Country 1')
    bank_tele_1 = fields.Char(string='Bank Tele 1')
    bank_fax_1 = fields.Char(string='Bank Fax 1')

    bank_name_2 = fields.Char(string='Bank 2')
    bank_account_2 = fields.Char(string='Account Number 2')
    bank_branch_2 = fields.Char(string='Branch 2')
    bank_country_2 = fields.Char(string='Country 2')
    bank_tele_2 = fields.Char(string='Bank Tele 2')
    bank_fax_2 = fields.Char(string='Bank Fax 2')

    # ==================== DOCUMENT UPLOADS ====================
    trade_license_file = fields.Binary(string='Trade License')
    trade_license_filename = fields.Char(string='Trade License Filename')
    
    tax_registration_file = fields.Binary(string='Tax Registration')
    tax_registration_filename = fields.Char(string='Tax Registration Filename')
    
    nationality_id_file = fields.Binary(string='Nationality ID')
    nationality_id_filename = fields.Char(string='Nationality ID Filename')
    
    passport_copy_file = fields.Binary(string='Passport Copy')
    passport_copy_filename = fields.Char(string='Passport Copy Filename')
    
    credit_application_file = fields.Binary(string='Credit Application')
    credit_application_filename = fields.Char(string='Credit Application Filename')

    @api.depends('use_credit_facility')
    def _compute_show_application_form(self):
        """Show application form only when YES is selected."""
        for wizard in self:
            wizard.show_application_form = wizard.use_credit_facility == 'yes'

    @api.onchange('use_credit_facility')
    def _onchange_use_credit_facility(self):
        """Clear form fields when switching to NO."""
        if self.use_credit_facility == 'no':
            # Clear all form fields
            self.company_name = False
            self.company_address = False
            self.phone_number = False
            self.trade_license_no = False
            self.email = False
            self.license_issue_date = False
            self.license_expiry_date = False
            self.credit_limit = 0.0
            # Reset visibility flags
            self.show_proprietor_row_2 = False
            self.show_proprietor_row_3 = False
            self.show_signatory_row_2 = False
            self.show_signatory_row_3 = False
            self.show_purchasing_row_2 = False
            self.show_bank_row_2 = False

    def action_add_proprietor_row(self):
        """Add next proprietor row."""
        if not self.show_proprietor_row_2:
            self.show_proprietor_row_2 = True
        elif not self.show_proprietor_row_3:
            self.show_proprietor_row_3 = True
        return True

    def action_add_signatory_row(self):
        """Add next signatory row."""
        if not self.show_signatory_row_2:
            self.show_signatory_row_2 = True
        elif not self.show_signatory_row_3:
            self.show_signatory_row_3 = True
        return True

    def action_add_purchasing_row(self):
        """Add purchasing contact row 2."""
        self.show_purchasing_row_2 = True
        return True

    def action_add_bank_row(self):
        """Add bank details row 2."""
        self.show_bank_row_2 = True
        return True

    @api.constrains('license_issue_date', 'license_expiry_date')
    def _check_license_dates(self):
        """Validate license dates."""
        for wizard in self:
            if wizard.license_issue_date and wizard.license_expiry_date:
                if wizard.license_expiry_date <= wizard.license_issue_date:
                    raise ValidationError(_(
                        'License Expiry Date must be after Issue Date.'
                    ))

    @api.constrains('credit_issue_date', 'credit_expiry_date')
    def _check_credit_dates(self):
        """Validate credit dates."""
        for wizard in self:
            if wizard.credit_issue_date and wizard.credit_expiry_date:
                if wizard.credit_expiry_date <= wizard.credit_issue_date:
                    raise ValidationError(_(
                        'Credit Expiry Date must be after Credit Issue Date.'
                    ))

    @api.constrains('email', 'purchasing_email_1', 'purchasing_email_2', 'accounts_email')
    def _check_email_format(self):
        """Validate email format."""
        for wizard in self:
            emails = [wizard.email, wizard.purchasing_email_1, wizard.purchasing_email_2, wizard.accounts_email]
            for email in emails:
                if email and not re.match(r'^[\w\.-]+@[\w\.-]+\.\w+$', email):
                    raise ValidationError(_(
                        'Please enter a valid email address: %s'
                    ) % email)

    @api.constrains('credit_limit')
    def _check_credit_limit(self):
        """Validate credit limit."""
        for wizard in self:
            if wizard.use_credit_facility == 'yes' and wizard.credit_limit <= 0:
                raise ValidationError(_(
                    'Credit limit must be greater than 0 when requesting credit facility.'
                ))

    def action_confirm(self):
        """Confirm credit facility setup."""
        self.ensure_one()

        if self.use_credit_facility == 'yes':
            # Validate required fields
            missing_fields = []
            if not self.company_name:
                missing_fields.append('Company Name')
            if not self.company_address:
                missing_fields.append('Company Address')
            if not self.phone_number:
                missing_fields.append('Phone Number')
            if not self.trade_license_no:
                missing_fields.append('Trade License Number')
            if not self.email:
                missing_fields.append('Email Address')
            if not self.credit_limit or self.credit_limit <= 0:
                missing_fields.append('Credit Limit')

            if missing_fields:
                raise UserError(_(
                    'Please fill in all required fields:\n\n• %s'
                ) % '\n• '.join(missing_fields))

            # Update partner with form data (but NOT credit limit - that's set on approval)
            self.partner_id.write({
                'name': self.company_name,
                'street': self.company_address,
                'phone': self.phone_number,
                'email': self.email,
                'credit_facility_asked': True,
                'trade_license_no': self.trade_license_no,
                'license_issue_date': self.license_issue_date,
                'license_expiry_date': self.license_expiry_date,
            })
            # CREATE PERMANENT CREDIT FACILITY RECORD
            self.env['credit.facility'].create({
                'partner_id': self.partner_id.id,
                'use_credit_facility': self.use_credit_facility,
                'currency_id': self.currency_id.id,
                'company_name': self.company_name,
                'company_address': self.company_address,
                'fax': self.fax,
                'phone_number': self.phone_number,
                'trade_license_no': self.trade_license_no,
                'po_box': self.po_box,
                'email': self.email,
                'license_issue_date': self.license_issue_date,
                'license_expiry_date': self.license_expiry_date,
                'credit_issue_date': self.credit_issue_date,
                'credit_expiry_date': self.credit_expiry_date,
                'credit_limit': self.credit_limit,
                'branch_mobile_no': self.branch_mobile_no,
                'branch_tele': self.branch_tele,
                'branch_fax': self.branch_fax,
                'local_sponsor': self.local_sponsor,
                'occupation': self.occupation,
                'proprietor_name_1': self.proprietor_name_1,
                'proprietor_nationality_1': self.proprietor_nationality_1,
                'proprietor_holding_1': self.proprietor_holding_1,
                'proprietor_name_2': self.proprietor_name_2,
                'proprietor_nationality_2': self.proprietor_nationality_2,
                'proprietor_holding_2': self.proprietor_holding_2,
                'proprietor_name_3': self.proprietor_name_3,
                'proprietor_nationality_3': self.proprietor_nationality_3,
                'proprietor_holding_3': self.proprietor_holding_3,
                'signatory_name_1': self.signatory_name_1,
                'signatory_nationality_1': self.signatory_nationality_1,
                'signatory_signature_1': self.signatory_signature_1,
                'signatory_name_2': self.signatory_name_2,
                'signatory_nationality_2': self.signatory_nationality_2,
                'signatory_signature_2': self.signatory_signature_2,
                'signatory_name_3': self.signatory_name_3,
                'signatory_nationality_3': self.signatory_nationality_3,
                'signatory_signature_3': self.signatory_signature_3,
                'purchasing_name_1': self.purchasing_name_1,
                'purchasing_title_1': self.purchasing_title_1,
                'purchasing_tele_1': self.purchasing_tele_1,
                'purchasing_fax_1': self.purchasing_fax_1,
                'purchasing_email_1': self.purchasing_email_1,
                'purchasing_signature_1': self.purchasing_signature_1,
                'purchasing_name_2': self.purchasing_name_2,
                'purchasing_title_2': self.purchasing_title_2,
                'purchasing_tele_2': self.purchasing_tele_2,
                'purchasing_fax_2': self.purchasing_fax_2,
                'purchasing_email_2': self.purchasing_email_2,
                'purchasing_signature_2': self.purchasing_signature_2,
                'accounts_name': self.accounts_name,
                'accounts_tele': self.accounts_tele,
                'accounts_fax': self.accounts_fax,
                'accounts_email': self.accounts_email,
                'accounts_signature': self.accounts_signature,
                'date_business_started': self.date_business_started,
                'any_other_business': self.any_other_business,
                'business_description': self.business_description,
                'sales_volume': self.sales_volume,
                'sales_days': self.sales_days,
                'bank_name_1': self.bank_name_1,
                'bank_account_1': self.bank_account_1,
                'bank_branch_1': self.bank_branch_1,
                'bank_country_1': self.bank_country_1,
                'bank_tele_1': self.bank_tele_1,
                'bank_fax_1': self.bank_fax_1,
                'bank_name_2': self.bank_name_2,
                'bank_account_2': self.bank_account_2,
                'bank_branch_2': self.bank_branch_2,
                'bank_country_2': self.bank_country_2,
                'bank_tele_2': self.bank_tele_2,
                'bank_fax_2': self.bank_fax_2,
                'trade_license_file': self.trade_license_file,
                'tax_registration_file': self.tax_registration_file,
                'nationality_id_file': self.nationality_id_file,
                'passport_copy_file': self.passport_copy_file,
                'credit_application_file': self.credit_application_file,
                'state': 'submitted',
            })
            # Post comprehensive message
            message_body = self._prepare_credit_facility_message()
            self.partner_id.message_post(
                body=message_body,
                subject=_('✅ Credit Facility Application')
            )

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Application Submitted!'),
                    'message': _('Credit facility application submitted for review. Requested credit limit: %s %s. A manager must approve before the credit limit is active.') % (
                        self.currency_id.symbol,
                        '{:,.2f}'.format(self.credit_limit)
                    ),
                    'type': 'info',
                    'sticky': False,
                }
            }

        else:
            # Customer does NOT want credit facility
            self.partner_id.write({
                'custom_credit_limit': 0.0,
                'credit_facility_asked': True,
            })

            self.partner_id.message_post(
                body=_(
                    'ℹ️ <strong>Credit Facility Declined</strong><br/><br/>'
                    'Customer opted to not use credit facility.<br/>'
                    '<strong>Payment Method:</strong> Cash/Advance Payment Only<br/>'
                    '<strong>Recorded by:</strong> %s<br/>'
                    '<strong>Date:</strong> %s'
                ) % (
                    self.env.user.name,
                    fields.Datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                ),
                subject=_('ℹ️ Credit Facility Declined')
            )

            return {
                'type': 'ir.actions.client',
                'tag': 'display_notification',
                'params': {
                    'title': _('Confirmed'),
                    'message': _('Customer will use cash/advance payment only.'),
                    'type': 'info',
                    'sticky': False,
                }
            }

    def action_download_application(self):
        """Download credit facility application as PDF with complete details."""
        self.ensure_one()
        
        if not REPORTLAB_AVAILABLE:
            raise UserError(_('ReportLab library is not installed. Please contact your administrator.'))
        
        # Generate PDF
        pdf_buffer = BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=A4,
                               rightMargin=30, leftMargin=30,
                               topMargin=30, bottomMargin=30)
        
        story = []
        styles = getSampleStyleSheet()
        
        # Custom styles
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=20,
            textColor=colors.HexColor('#1976d2'),
            spaceAfter=20,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=13,
            textColor=colors.HexColor('#007bff'),
            spaceAfter=10,
            spaceBefore=12,
            fontName='Helvetica-Bold'
        )
        
        subheading_style = ParagraphStyle(
            'SubHeading',
            parent=styles['Normal'],
            fontSize=11,
            textColor=colors.HexColor('#333333'),
            spaceAfter=8,
            fontName='Helvetica-Bold'
        )
        
        normal_style = styles['Normal']
        
        # Title
        story.append(Paragraph("💳 CREDIT FACILITY APPLICATION", title_style))
        story.append(Spacer(1, 0.2*inch))
        
        # ==================== COMPANY INFORMATION ====================
        story.append(Paragraph("📋 COMPANY INFORMATION", heading_style))
        company_data = [
            ['Company Name:', self.company_name or 'N/A'],
            ['Address:', self.company_address or 'N/A'],
            ['Fax:', self.fax or 'N/A'],
            ['Phone Number:', self.phone_number or 'N/A'],
            ['Trade License No:', self.trade_license_no or 'N/A'],
            ['PO Box:', self.po_box or 'N/A'],
            ['Email ID:', self.email or 'N/A'],
            ['License Issue Date:', str(self.license_issue_date) if self.license_issue_date else 'N/A'],
            ['License Expiry Date:', str(self.license_expiry_date) if self.license_expiry_date else 'N/A'],
            ['Credit Issue Date:', str(self.credit_issue_date) if self.credit_issue_date else 'N/A'],
            ['Credit Expiry Date:', str(self.credit_expiry_date) if self.credit_expiry_date else 'N/A'],
            ['Credit Limit Set:', f'{self.currency_id.symbol} {self.credit_limit:,.2f}' if self.credit_limit else 'N/A'],
        ]
        company_table = Table(company_data, colWidths=[2.2*inch, 4.3*inch])
        company_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(company_table)
        story.append(Spacer(1, 0.15*inch))
        
        # ==================== BRANCH DETAILS ====================
        if self.branch_mobile_no or self.branch_tele or self.branch_fax:
            story.append(Paragraph("🏢 BRANCH DETAILS", heading_style))
            branch_data = [
                ['Mobile No:', self.branch_mobile_no or 'N/A'],
                ['Telephone:', self.branch_tele or 'N/A'],
                ['Fax:', self.branch_fax or 'N/A'],
            ]
            branch_table = Table(branch_data, colWidths=[2.2*inch, 4.3*inch])
            branch_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            story.append(branch_table)
            story.append(Spacer(1, 0.15*inch))
        
        # ==================== BUSINESS & CREDIT INFORMATION ====================
        story.append(Paragraph("💼 BUSINESS & CREDIT INFORMATION", heading_style))
        business_data = [
            ['Local Sponsor:', self.local_sponsor or 'N/A'],
            ['Occupation:', self.occupation or 'N/A'],
        ]
        business_table = Table(business_data, colWidths=[2.2*inch, 4.3*inch])
        business_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(business_table)
        story.append(Spacer(1, 0.1*inch))
        
        # Proprietors/Stakeholders/Shareholders
        if self.proprietor_name_1 or self.proprietor_name_2 or self.proprietor_name_3:
            story.append(Paragraph("Proprietors/Stakeholders/Shareholders:", subheading_style))
            proprietor_data = [['Name', 'Nationality', 'Holding %']]
            if self.proprietor_name_1:
                proprietor_data.append([
                    self.proprietor_name_1 or 'N/A',
                    self.proprietor_nationality_1 or 'N/A',
                    f'{self.proprietor_holding_1 or 0}%'
                ])
            if self.proprietor_name_2:
                proprietor_data.append([
                    self.proprietor_name_2 or 'N/A',
                    self.proprietor_nationality_2 or 'N/A',
                    f'{self.proprietor_holding_2 or 0}%'
                ])
            if self.proprietor_name_3:
                proprietor_data.append([
                    self.proprietor_name_3 or 'N/A',
                    self.proprietor_nationality_3 or 'N/A',
                    f'{self.proprietor_holding_3 or 0}%'
                ])
            
            proprietor_table = Table(proprietor_data, colWidths=[2.5*inch, 2.2*inch, 1.8*inch])
            proprietor_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1976d2')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
            ]))
            story.append(proprietor_table)
            story.append(Spacer(1, 0.15*inch))
        
        # Authorized Signatories
        if self.signatory_name_1 or self.signatory_name_2 or self.signatory_name_3:
            story.append(Paragraph("Authorized Signatories to Sign Cheques:", subheading_style))
            signatory_data = [['Name', 'Nationality', 'Signature']]
            if self.signatory_name_1:
                signatory_data.append([
                    self.signatory_name_1 or 'N/A',
                    self.signatory_nationality_1 or 'N/A',
                    '✓ Uploaded' if self.signatory_signature_1 else 'Not Uploaded'
                ])
            if self.signatory_name_2:
                signatory_data.append([
                    self.signatory_name_2 or 'N/A',
                    self.signatory_nationality_2 or 'N/A',
                    '✓ Uploaded' if self.signatory_signature_2 else 'Not Uploaded'
                ])
            if self.signatory_name_3:
                signatory_data.append([
                    self.signatory_name_3 or 'N/A',
                    self.signatory_nationality_3 or 'N/A',
                    '✓ Uploaded' if self.signatory_signature_3 else 'Not Uploaded'
                ])
            
            signatory_table = Table(signatory_data, colWidths=[2.5*inch, 2.2*inch, 1.8*inch])
            signatory_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f57c00')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
            ]))
            story.append(signatory_table)
            story.append(Spacer(1, 0.15*inch))
        
        # ==================== PAGE BREAK ====================
        story.append(PageBreak())
        
        # ==================== PURCHASING CONTACT ====================
        if self.purchasing_name_1 or self.purchasing_name_2:
            story.append(Paragraph("🛒 PURCHASING CONTACT", heading_style))
            purchasing_data = [['Name', 'Title', 'Telephone', 'Fax', 'Email', 'Signature']]
            if self.purchasing_name_1:
                purchasing_data.append([
                    self.purchasing_name_1 or 'N/A',
                    self.purchasing_title_1 or 'N/A',
                    self.purchasing_tele_1 or 'N/A',
                    self.purchasing_fax_1 or 'N/A',
                    self.purchasing_email_1 or 'N/A',
                    '✓' if self.purchasing_signature_1 else '✗'
                ])
            if self.purchasing_name_2:
                purchasing_data.append([
                    self.purchasing_name_2 or 'N/A',
                    self.purchasing_title_2 or 'N/A',
                    self.purchasing_tele_2 or 'N/A',
                    self.purchasing_fax_2 or 'N/A',
                    self.purchasing_email_2 or 'N/A',
                    '✓' if self.purchasing_signature_2 else '✗'
                ])
            
            purchasing_table = Table(purchasing_data, colWidths=[1.3*inch, 1*inch, 1*inch, 0.8*inch, 1.5*inch, 0.6*inch])
            purchasing_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#388e3c')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
            ]))
            story.append(purchasing_table)
            story.append(Spacer(1, 0.15*inch))
        
        # ==================== ACCOUNTS CONTACT ====================
        if self.accounts_name:
            story.append(Paragraph("💰 ACCOUNTS CONTACT", heading_style))
            accounts_data = [
                ['Name:', self.accounts_name or 'N/A'],
                ['Telephone:', self.accounts_tele or 'N/A'],
                ['Fax:', self.accounts_fax or 'N/A'],
                ['Email:', self.accounts_email or 'N/A'],
                ['Date Business Started:', str(self.date_business_started) if self.date_business_started else 'N/A'],
                ['Any Other Business:', self.any_other_business.upper() if self.any_other_business else 'N/A'],
                ['Business Description:', self.business_description or 'N/A'],
                ['Signature:', '✓ Uploaded' if self.accounts_signature else 'Not Uploaded'],
            ]
            accounts_table = Table(accounts_data, colWidths=[2.2*inch, 4.3*inch])
            accounts_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            story.append(accounts_table)
            story.append(Spacer(1, 0.15*inch))
        
        # ==================== PRESENT YEARLY SALES VOLUME ====================
        if self.sales_volume or self.sales_days:
            story.append(Paragraph("📊 PRESENT YEARLY SALES VOLUME", heading_style))
            sales_data = [
                ['Sales Volume:', f'{self.currency_id.symbol} {self.sales_volume:,.2f}' if self.sales_volume else 'N/A'],
                ['Days:', str(self.sales_days) if self.sales_days else 'N/A'],
            ]
            sales_table = Table(sales_data, colWidths=[2.2*inch, 4.3*inch])
            sales_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ]))
            story.append(sales_table)
            story.append(Spacer(1, 0.15*inch))
        
        # ==================== BANK DETAILS ====================
        if self.bank_name_1 or self.bank_name_2:
            story.append(Paragraph("🏦 BANK DETAILS", heading_style))
            bank_data = [['Bank', 'Account Number', 'Branch', 'Country', 'Telephone', 'Fax']]
            if self.bank_name_1:
                bank_data.append([
                    self.bank_name_1 or 'N/A',
                    self.bank_account_1 or 'N/A',
                    self.bank_branch_1 or 'N/A',
                    self.bank_country_1 or 'N/A',
                    self.bank_tele_1 or 'N/A',
                    self.bank_fax_1 or 'N/A'
                ])
            if self.bank_name_2:
                bank_data.append([
                    self.bank_name_2 or 'N/A',
                    self.bank_account_2 or 'N/A',
                    self.bank_branch_2 or 'N/A',
                    self.bank_country_2 or 'N/A',
                    self.bank_tele_2 or 'N/A',
                    self.bank_fax_2 or 'N/A'
                ])
            
            bank_table = Table(bank_data, colWidths=[1.3*inch, 1.3*inch, 1*inch, 1*inch, 1*inch, 0.9*inch])
            bank_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#c2185b')),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f5f5f5')]),
            ]))
            story.append(bank_table)
            story.append(Spacer(1, 0.15*inch))
        
        # ==================== UPLOADED DOCUMENTS ====================
        story.append(Paragraph("📎 UPLOADED DOCUMENTS", heading_style))
        doc_data = [
            ['Trade License:', '✅ Uploaded' if self.trade_license_file else '❌ Not Uploaded'],
            ['Tax Registration:', '✅ Uploaded' if self.tax_registration_file else '❌ Not Uploaded'],
            ['Nationality ID:', '✅ Uploaded' if self.nationality_id_file else '❌ Not Uploaded'],
            ['Passport Copy:', '✅ Uploaded' if self.passport_copy_file else '❌ Not Uploaded'],
            ['Credit Application:', '✅ Uploaded' if self.credit_application_file else '❌ Not Uploaded'],
        ]
        doc_table = Table(doc_data, colWidths=[2.2*inch, 4.3*inch])
        doc_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, -1), colors.HexColor('#e3f2fd')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(doc_table)
        story.append(Spacer(1, 0.25*inch))
        
        # ==================== FOOTER ====================
        footer_data = [
            ['Submitted by:', self.env.user.name],
            ['Submission Date:', fields.Datetime.now().strftime('%Y-%m-%d %H:%M:%S')],
            ['Customer:', self.partner_id.name],
        ]
        footer_table = Table(footer_data, colWidths=[2.2*inch, 4.3*inch])
        footer_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f0f0f0')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.black),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        story.append(footer_table)
        
        # Build PDF
        doc.build(story)
        pdf_data = pdf_buffer.getvalue()
        pdf_buffer.close()
        
        # Create attachment
        filename = f"Credit_Facility_Application_{self.partner_id.name.replace(' ', '_')}_{fields.Date.today()}.pdf"
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(pdf_data),
            'res_model': 'credit.facility.wizard',
            'res_id': self.id,
            'mimetype': 'application/pdf'
        })
        
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'new',
        }

    def _prepare_credit_facility_message(self):
        """Prepare comprehensive credit facility application message."""
        message = '<div style="font-family: Arial, sans-serif;">'
        message += '<h3 style="color: #28a745;">✅ Credit Facility Application Submitted</h3>'
        
        # Company Details
        message += '<h4 style="margin-top: 20px; color: #007bff;">📋 Company Information</h4>'
        message += '<table style="width: 100%; border-collapse: collapse;">'
        message += self._add_row('Company Name', self.company_name)
        message += self._add_row('Address', self.company_address)
        message += self._add_row('Fax', self.fax)
        message += self._add_row('Phone Number', self.phone_number)
        message += self._add_row('Trade License No', self.trade_license_no)
        message += self._add_row('PO Box', self.po_box)
        message += self._add_row('Email', self.email)
        message += self._add_row('License Issue Date', self.license_issue_date)
        message += self._add_row('License Expiry Date', self.license_expiry_date)
        message += self._add_row('Credit Issue Date', self.credit_issue_date)
        message += self._add_row('Credit Expiry Date', self.credit_expiry_date)
        message += self._add_row('Credit Limit', f'{self.currency_id.symbol} {self.credit_limit:,.2f}', True)
        message += '</table>'

        # Document Uploads
        message += '<h4 style="margin-top: 20px; color: #007bff;">📎 Uploaded Documents</h4>'
        message += '<table style="width: 100%; border-collapse: collapse;">'
        message += self._add_row('Trade License', '✅ Uploaded' if self.trade_license_file else '❌ Not Uploaded')
        message += self._add_row('Tax Registration', '✅ Uploaded' if self.tax_registration_file else '❌ Not Uploaded')
        message += self._add_row('Nationality ID', '✅ Uploaded' if self.nationality_id_file else '❌ Not Uploaded')
        message += self._add_row('Passport Copy', '✅ Uploaded' if self.passport_copy_file else '❌ Not Uploaded')
        message += self._add_row('Credit Application', '✅ Uploaded' if self.credit_application_file else '❌ Not Uploaded')
        message += '</table>'

        # Footer
        message += f'<p style="margin-top: 20px;"><strong>Submitted by:</strong> {self.env.user.name}</p>'
        message += f'<p><strong>Submission Date:</strong> {fields.Datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>'
        message += '</div>'

        return message

    def _add_row(self, label, value, bold=False):
        """Helper to add table row."""
        if not value:
            return ''
        style = 'font-weight: bold;' if bold else ''
        return f'<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>{label}:</strong></td>' \
               f'<td style="padding: 8px; border-bottom: 1px solid #eee; {style}">{value}</td></tr>'

    def action_cancel(self):
        """Cancel wizard without making changes."""
        return {'type': 'ir.actions.act_window_close'}