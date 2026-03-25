from odoo import models, fields, api


class TransactionAuditing(models.Model):
    _name = 'transaction.auditing'
    _description = 'Transaction Auditing'
    _order = 'create_date desc'
    _rec_name = 'sequence_no'

    sequence_no = fields.Char(
        string='Sequence No',
        readonly=True,
        default='New',
        copy=False,
    )
    date = fields.Date(
        string='Date',
        default=fields.Date.context_today,
        required=True,
    )

    # --- Amounts ---
    amount = fields.Float(string='Amount', digits=(12, 2))
    un_taxed_amount = fields.Float(string='Untaxed Amount', digits=(12, 2))
    advance_paid_amount = fields.Float(string='Advance Paid Amount', digits=(12, 2))
    service_amount = fields.Float(string='Service Amount', digits=(12, 2))
    service_product_amount = fields.Float(string='Service Product Amount', digits=(12, 2))
    service_product_cost = fields.Float(string='Service Product Cost', digits=(12, 2))

    # --- Customer / Supplier ---
    customer_id = fields.Char(string='Customer ID')
    customer_name = fields.Char(string='Customer Name')
    supplier_id = fields.Char(string='Supplier ID')
    supplier_name = fields.Char(string='Supplier Name')

    # --- Invoice / Document ---
    invoice_id = fields.Char(string='Invoice ID')
    inv_sequence_no = fields.Char(string='Invoice Sequence No')
    register_payment_id = fields.Char(string='Register Payment ID')
    register_payment_sequence_no = fields.Char(string='Register Payment Sequence No')

    # --- Collection / Business Type ---
    collection_type_id = fields.Char(string='Collection Type ID')
    collection_type_name = fields.Char(string='Collection Type')
    bussiness_type_id = fields.Char(string='Business Type ID')

    # --- Cheque Details ---
    chq_no = fields.Char(string='Cheque No')
    chq_date = fields.Char(string='Cheque Date')
    chq_type = fields.Char(string='Cheque Type')
    cheque_transaction_type = fields.Char(string='Cheque Transaction Type')

    # --- Chart of Accounts ---
    chart_of_accounts_id = fields.Char(string='Chart of Accounts ID')
    chart_of_accounts_name = fields.Char(string='Chart of Accounts')

    # --- Online Transaction ---
    online_transaction_type = fields.Char(string='Online Transaction Type')
    online_status = fields.Char(string='Online Status')

    # --- Ledger ---
    ledger_id = fields.Char(string='Ledger ID')
    ledger_name = fields.Char(string='Ledger Name')
    ledger_type = fields.Char(string='Ledger Type')
    ledger_display_name = fields.Char(string='Ledger Display Name')

    # --- Employee Ledger ---
    employee_ledger_id = fields.Char(string='Employee Ledger ID')
    employee_ledger_name = fields.Char(string='Employee Ledger Name')
    employee_ledger_display_name = fields.Char(string='Employee Ledger Display Name')

    # --- Warehouse ---
    warehouse_id = fields.Char(string='Warehouse ID')
    warehouse_name = fields.Char(string='Warehouse')
    scanned_warehouse_id = fields.Char(string='Scanned Warehouse ID')
    to_warehouse_id = fields.Char(string='To Warehouse ID')
    to_warehouse_name = fields.Char(string='To Warehouse')

    # --- Sales Person ---
    sales_person_id = fields.Char(string='Sales Person ID')
    sales_person_name = fields.Char(string='Sales Person')

    # --- Company ---
    company_id_ref = fields.Char(string='Company ID Ref')
    company_name = fields.Char(string='Company Name')

    # --- Signatures ---
    customer_vendor_signature = fields.Binary(string='Customer/Vendor Signature')
    cashier_signature = fields.Binary(string='Cashier Signature')

    # --- Remarks ---
    remarks = fields.Text(string='Remarks')

    # --- Attachments ---
    attachment_ids = fields.One2many(
        'transaction.auditing.attachment',
        'auditing_id',
        string='Attachments',
    )

    # --- Other ---
    is_estimation = fields.Boolean(string='Is Estimation', default=False)

    @api.model
    def create(self, vals_list):
        if isinstance(vals_list, dict):
            vals_list = [vals_list]
        for vals in vals_list:
            if vals.get('sequence_no', 'New') == 'New':
                vals['sequence_no'] = self.env['ir.sequence'].next_by_code(
                    'transaction.auditing'
                ) or 'New'
        return super().create(vals_list)


class TransactionAuditingAttachment(models.Model):
    _name = 'transaction.auditing.attachment'
    _description = 'Transaction Auditing Attachment'

    auditing_id = fields.Many2one(
        'transaction.auditing',
        string='Auditing',
        ondelete='cascade',
    )
    image_url = fields.Char(string='Image URL')
    attachment = fields.Binary(string='Attachment', attachment=True)
    filename = fields.Char(string='Filename')
