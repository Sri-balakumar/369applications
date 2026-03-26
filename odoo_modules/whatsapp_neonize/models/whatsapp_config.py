import logging
from odoo import models, fields, api

_logger = logging.getLogger(__name__)


class WhatsAppOwnerNumber(models.Model):
    _name = 'whatsapp.owner.number'
    _description = 'WhatsApp Owner Notification Number'
    _order = 'sequence, id'

    sequence = fields.Integer(default=10)
    name = fields.Char('Label', required=True, help='e.g. Owner, Manager, Accountant')
    phone = fields.Char(
        'Phone Number', required=True,
        help='Phone number with country code, no + sign. e.g. 919944080209',
    )
    active = fields.Boolean(default=True)
    config_id = fields.Many2one(
        'whatsapp.config', string='Configuration',
        ondelete='cascade',
    )
    company_id = fields.Many2one(
        'res.company', string='Company',
        default=lambda self: self.env.company,
    )


class WhatsAppConfig(models.Model):
    _name = 'whatsapp.config'
    _description = 'WhatsApp Configuration'
    _rec_name = 'company_id'

    company_id = fields.Many2one(
        'res.company', string='Company', required=True,
        default=lambda self: self.env.company,
        ondelete='cascade',
    )

    # --- POS Settings ---
    pos_notify_enabled = fields.Boolean(
        'Enable POS WhatsApp Notifications', default=False,
    )
    pos_notify_owners = fields.Boolean(
        'Send POS Orders to Owners', default=True,
        help='Send order summary to owner numbers when POS order is completed.',
    )
    pos_notify_customer = fields.Boolean(
        'Send POS Receipt to Customer', default=False,
        help='Send order summary to the customer selected in POS order.',
    )
    pos_session_id = fields.Many2one(
        'whatsapp.session', string='WhatsApp Session for POS',
        help='Which WhatsApp session to use for POS notifications. '
             'Leave empty to use the first connected session.',
    )
    pos_message_template = fields.Text(
        'POS Message Template',
        default="""🧾 *POS Order: {order_name}*
📅 Date: {date}
🏪 POS: {pos_name}

{order_lines}

💰 *Subtotal:* {amount_untaxed}
📊 *Tax:* {amount_tax}
✅ *Total:* {amount_total}
💳 *Paid:* {amount_paid}

{customer_info}

Thank you for your purchase! 🙏""",
        help='Template for POS order messages. Available placeholders: '
             '{order_name}, {date}, {pos_name}, {order_lines}, '
             '{amount_untaxed}, {amount_tax}, {amount_total}, '
             '{amount_paid}, {customer_name}, {customer_info}',
    )

    owner_number_ids = fields.One2many(
        'whatsapp.owner.number', 'config_id', string='Owner Numbers',
    )

    @api.model
    def get_config(self, company_id=None):
        """Get or create config for current company."""
        company_id = company_id or self.env.company.id
        config = self.search([('company_id', '=', company_id)], limit=1)
        if not config:
            config = self.create({'company_id': company_id})
        return config

    def format_pos_message(self, order):
        """Format POS order into WhatsApp message."""
        self.ensure_one()
        template = self.pos_message_template or self._fields['pos_message_template'].default

        # Build order lines
        lines = []
        for line in order.lines:
            qty_str = f"{line.qty:g}"
            line_total = line.price_subtotal_incl
            line_text = f"  • {line.full_product_name or line.product_id.name}"
            line_text += f"  ×{qty_str}"
            if line.discount:
                line_text += f"  (-{line.discount:g}%)"
            line_text += f"  = {line_total:,.2f}"
            lines.append(line_text)

        order_lines = "\n".join(lines) if lines else "  (no items)"

        # Customer info
        customer_name = order.partner_id.name if order.partner_id else 'Walk-in Customer'
        customer_info = ""
        if order.partner_id:
            customer_info = f"👤 Customer: {order.partner_id.name}"
            if order.partner_id.phone:
                customer_info += f"\n📱 Phone: {order.partner_id.phone}"

        # Get POS config name
        pos_name = 'N/A'
        if order.session_id and order.session_id.config_id:
            pos_name = order.session_id.config_id.name

        # Format amounts
        amount_untaxed = order.amount_total - order.amount_tax
        date_str = order.date_order.strftime('%d/%m/%Y %I:%M %p') if order.date_order else ''

        return template.format(
            order_name=order.name or '',
            date=date_str,
            pos_name=pos_name,
            order_lines=order_lines,
            amount_untaxed=f"{amount_untaxed:,.2f}",
            amount_tax=f"{order.amount_tax:,.2f}",
            amount_total=f"{order.amount_total:,.2f}",
            amount_paid=f"{order.amount_paid:,.2f}",
            customer_name=customer_name,
            customer_info=customer_info,
        )
