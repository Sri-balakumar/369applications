from odoo import models, fields, api


class ProductEnquiry(models.Model):
    _name = 'product.enquiry'
    _description = 'Product Enquiry'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'create_date desc'
    _rec_name = 'name'

    name = fields.Char(
        string='Sequence',
        readonly=True,
        default='New',
        copy=False,
    )
    image = fields.Binary(string='Image', attachment=True)
    date = fields.Date(
        string='Date',
        default=fields.Date.context_today,
        required=True,
    )
    type = fields.Selection(
        selection=[
            ('product_enquiry', 'Product Enquiry'),
            ('service_enquiry', 'Service Enquiry'),
            ('general', 'General'),
        ],
        string='Type',
        default='product_enquiry',
    )
    product_name = fields.Char(string='Product Name')
    details = fields.Text(string='Details')
    customer_name = fields.Char(string='Customer Name')
    customer_no = fields.Char(string='Customer No')
    customer_details = fields.Text(string='Customer Details')
    sale_price = fields.Float(string='Sale Price', digits=(12, 2))
    branch_id = fields.Many2one('res.company', string='Branch')
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    action_taken = fields.Selection(
        selection=[
            ('pending', 'Pending'),
            ('in_progress', 'In Progress'),
            ('completed', 'Completed'),
            ('cancelled', 'Cancelled'),
        ],
        string='Action Taken',
        default='pending',
    )
    module_type = fields.Char(
        string='Module Type',
        default='Product Enquiry',
        readonly=True,
    )
    validated = fields.Boolean(string='Validate', default=False)
    validated_by = fields.Many2one('res.users', string='Validated By')
    validation_date = fields.Date(string='Validation Date')
    image_url = fields.Char(string='Image Url')
    signature = fields.Binary(string='Signature')
    remark = fields.Text(string='Remarks')

    attachment_ids = fields.One2many(
        'product.enquiry.attachment',
        'enquiry_id',
        string='Attachments',
    )

    @api.model
    def create(self, vals_list):
        if isinstance(vals_list, dict):
            vals_list = [vals_list]
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code(
                    'product.enquiry'
                ) or 'New'
        return super().create(vals_list)

    def action_validate(self):
        self.write({
            'validated': True,
            'validated_by': self.env.uid,
            'validation_date': fields.Date.context_today(self),
        })


class ProductEnquiryAttachment(models.Model):
    _name = 'product.enquiry.attachment'
    _description = 'Product Enquiry Attachment'

    enquiry_id = fields.Many2one(
        'product.enquiry',
        string='Enquiry',
        ondelete='cascade',
    )
    image_url = fields.Char(string='Image Url')
    attachment = fields.Binary(string='Attachment', attachment=True)
    filename = fields.Char(string='Filename')
