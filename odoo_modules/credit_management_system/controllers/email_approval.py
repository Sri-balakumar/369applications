from odoo import http
from odoo.http import request
from odoo.modules.registry import Registry
import logging
import odoo

_logger = logging.getLogger(__name__)


class EmailApprovalController(http.Controller):

    # ==================== SALE ORDER APPROVAL ====================

    @http.route('/credit/email/approve', type='http', auth='none', csrf=False, methods=['GET'])
    def email_approve(self, order_id=None, token=None, **kwargs):
        """Handle email approval link click"""
        return self._process_email_action(order_id, token, 'approve')

    @http.route('/credit/email/reject', type='http', auth='none', csrf=False, methods=['GET'])
    def email_reject(self, order_id=None, token=None, **kwargs):
        """Handle email rejection link click"""
        return self._process_email_action(order_id, token, 'reject')

    # ==================== EASY SALES APPROVAL ====================

    @http.route('/easy-sale/email/approve', type='http', auth='none', csrf=False, methods=['GET'])
    def easy_sale_email_approve(self, sale_id=None, token=None, **kwargs):
        """Handle easy sale email approval link click"""
        return self._process_easy_sale_email_action(sale_id, token, 'approve')

    @http.route('/easy-sale/email/reject', type='http', auth='none', csrf=False, methods=['GET'])
    def easy_sale_email_reject(self, sale_id=None, token=None, **kwargs):
        """Handle easy sale email rejection link click"""
        return self._process_easy_sale_email_action(sale_id, token, 'reject')

    def _process_easy_sale_email_action(self, sale_id, token, action):
        """Process easy sale credit email approval/rejection"""
        try:
            if not sale_id or not token:
                return self._render_result_page(
                    success=False,
                    title="Invalid Request",
                    message="Missing sale ID or token.",
                    color="#f44336"
                )

            db_name = request.httprequest.args.get('db') or request.session.db
            if not db_name:
                db_name = odoo.tools.config.get('db_name')

            if not db_name:
                return self._render_result_page(
                    success=False,
                    title="Database Error",
                    message="Could not determine database.",
                    color="#f44336"
                )

            registry = Registry(db_name)
            with registry.cursor() as cr:
                env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})

                sale = env['easy.sales'].sudo().browse(int(sale_id))

                if not sale.exists():
                    return self._render_result_page(
                        success=False,
                        title="Sale Not Found",
                        message=f"Easy Sale ID {sale_id} not found.",
                        color="#f44336"
                    )

                if sale.email_approval_token != token:
                    return self._render_result_page(
                        success=False,
                        title="Invalid Token",
                        message="The approval link is invalid or has expired.",
                        color="#f44336"
                    )

                if sale.credit_approval_status == 'approved':
                    return self._render_result_page(
                        success=True,
                        title="Already Approved",
                        message=f"Sale {sale.name} was already approved.",
                        color="#ff9800",
                        order_name=sale.name,
                        customer=sale.partner_id.name,
                        amount=sale.amount_total,
                        currency=sale.currency_id.symbol if hasattr(sale, 'currency_id') else ''
                    )

                if sale.credit_approval_status == 'rejected':
                    return self._render_result_page(
                        success=True,
                        title="Already Rejected",
                        message=f"Sale {sale.name} was already rejected.",
                        color="#ff9800",
                        order_name=sale.name,
                        customer=sale.partner_id.name,
                        amount=sale.amount_total,
                        currency=sale.currency_id.symbol if hasattr(sale, 'currency_id') else ''
                    )

                if action == 'approve':
                    sale.action_approve_easy_sale_credit()
                    cr.commit()
                    return self._render_result_page(
                        success=True,
                        title="Sale Approved",
                        message=f"Easy Sale {sale.name} has been approved and confirmed.",
                        color="#4CAF50",
                        order_name=sale.name,
                        customer=sale.partner_id.name,
                        amount=sale.amount_total,
                        currency=sale.currency_id.symbol if hasattr(sale, 'currency_id') else ''
                    )

                elif action == 'reject':
                    sale.action_reject_easy_sale_credit()
                    cr.commit()
                    return self._render_result_page(
                        success=True,
                        title="Sale Rejected",
                        message=f"Easy Sale {sale.name} has been rejected.",
                        color="#f44336",
                        order_name=sale.name,
                        customer=sale.partner_id.name,
                        amount=sale.amount_total,
                        currency=sale.currency_id.symbol if hasattr(sale, 'currency_id') else ''
                    )

        except Exception as e:
            _logger.exception(f"Easy sale email approval error: {e}")
            return self._render_result_page(
                success=False,
                title="Error",
                message=f"An error occurred: {str(e)}",
                color="#f44336"
            )

    # ==================== CREDIT FACILITY APPROVAL ====================

    @http.route('/credit-facility/email/approve', type='http', auth='none', csrf=False, methods=['GET'])
    def cf_email_approve(self, facility_id=None, token=None, **kwargs):
        """Handle credit facility email approval link click"""
        return self._process_cf_email_action(facility_id, token, 'approve')

    @http.route('/credit-facility/email/reject', type='http', auth='none', csrf=False, methods=['GET'])
    def cf_email_reject(self, facility_id=None, token=None, **kwargs):
        """Handle credit facility email rejection link click"""
        return self._process_cf_email_action(facility_id, token, 'reject')

    def _process_cf_email_action(self, facility_id, token, action):
        """Process credit facility email approval/rejection"""
        try:
            if not facility_id or not token:
                return self._render_result_page(
                    success=False,
                    title="Invalid Request",
                    message="Missing facility ID or token.",
                    color="#f44336"
                )

            db_name = request.httprequest.args.get('db') or request.session.db
            if not db_name:
                db_name = odoo.tools.config.get('db_name')

            if not db_name:
                return self._render_result_page(
                    success=False,
                    title="Database Error",
                    message="Could not determine database.",
                    color="#f44336"
                )

            registry = Registry(db_name)
            with registry.cursor() as cr:
                env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})

                facility = env['credit.facility'].sudo().browse(int(facility_id))

                if not facility.exists():
                    return self._render_result_page(
                        success=False,
                        title="Application Not Found",
                        message=f"Credit Facility ID {facility_id} not found.",
                        color="#f44336"
                    )

                if facility.email_approval_token != token:
                    return self._render_result_page(
                        success=False,
                        title="Invalid Token",
                        message="The approval link is invalid or has expired.",
                        color="#f44336"
                    )

                if facility.state == 'approved':
                    return self._render_cf_result_page(
                        title="Already Approved",
                        message=f"Application {facility.name} was already approved.",
                        color="#ff9800",
                        facility=facility
                    )

                if facility.state == 'rejected':
                    return self._render_cf_result_page(
                        title="Already Rejected",
                        message=f"Application {facility.name} was already rejected.",
                        color="#ff9800",
                        facility=facility
                    )

                if facility.state != 'submitted':
                    return self._render_result_page(
                        success=False,
                        title="Cannot Process",
                        message=f"Application {facility.name} is in '{facility.state}' state and cannot be processed.",
                        color="#ff9800"
                    )

                if action == 'approve':
                    facility.action_approve()
                    cr.commit()
                    return self._render_cf_result_page(
                        title="Application Approved ✓",
                        message=f"Credit facility {facility.name} has been approved. Credit limit of {facility.currency_id.symbol} {facility.credit_limit:,.2f} has been set for {facility.partner_id.name}.",
                        color="#4CAF50",
                        facility=facility
                    )

                elif action == 'reject':
                    facility.action_reject()
                    cr.commit()
                    return self._render_cf_result_page(
                        title="Application Rejected",
                        message=f"Credit facility {facility.name} has been rejected.",
                        color="#f44336",
                        facility=facility
                    )

        except Exception as e:
            _logger.exception(f"Credit facility email approval error: {e}")
            return self._render_result_page(
                success=False,
                title="Error",
                message=f"An error occurred: {str(e)}",
                color="#f44336"
            )

    def _render_cf_result_page(self, title, message, color, facility):
        """Render result page for credit facility actions"""
        currency = facility.currency_id.symbol or '$'
        amount_str = f"{currency} {facility.credit_limit:,.2f}" if facility.credit_limit else "N/A"

        if 'Approved' in title and 'Already' not in title:
            icon_svg = '<svg width="70" height="70" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#4CAF50"/><path d="M9 12l2 2 4-4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        elif 'Rejected' in title and 'Already' not in title:
            icon_svg = '<svg width="70" height="70" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#f44336"/><path d="M15 9l-6 6M9 9l6 6" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>'
        else:
            icon_svg = '<svg width="70" height="70" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ff9800"/><path d="M12 8v4M12 16h.01" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>'

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title>{title}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        html, body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100%;
            padding: 20px;
        }}
        .wrapper {{
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 20px 0;
        }}
        .container {{
            background: white;
            padding: 30px 25px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 480px;
            width: 100%;
            text-align: center;
        }}
        .icon {{ margin-bottom: 16px; }}
        h1 {{ color: {color}; margin: 0 0 12px 0; font-size: 22px; line-height: 1.3; }}
        p {{ color: #555; font-size: 15px; line-height: 1.6; margin: 0; }}
        .details {{
            background: #f8f8f8;
            padding: 16px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }}
        .details table {{ width: 100%; border-collapse: collapse; }}
        .details td {{ padding: 7px 6px; font-size: 14px; vertical-align: top; }}
        .details td:first-child {{ font-weight: bold; color: #666; width: 130px; }}
        .done-btn {{
            display: block;
            margin-top: 20px;
            padding: 14px 20px;
            background: {color};
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            border: none;
            cursor: pointer;
            width: 100%;
            -webkit-appearance: none;
            touch-action: manipulation;
        }}
        .hint {{ margin-top: 12px; font-size: 12px; color: #999; }}
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="icon">{icon_svg}</div>
            <h1>{title}</h1>
            <p>{message}</p>
            <div class="details">
                <table>
                    <tr><td>Application:</td><td><strong>{facility.name}</strong></td></tr>
                    <tr><td>Customer:</td><td>{facility.partner_id.name}</td></tr>
                    <tr><td>Company:</td><td>{facility.company_name or 'N/A'}</td></tr>
                    <tr><td>Credit Limit:</td><td><strong>{amount_str}</strong></td></tr>
                    <tr><td>Trade License:</td><td>{facility.trade_license_no or 'N/A'}</td></tr>
                    <tr><td>Status:</td><td><strong style="color:{color};">{facility.state.upper()}</strong></td></tr>
                </table>
            </div>
            <button class="done-btn" onclick="window.close();">Done</button>
            <p class="hint">Tap Done to return to your email.</p>
        </div>
    </div>
</body>
</html>"""
        return request.make_response(html, headers=[
            ('Content-Type', 'text/html; charset=utf-8'),
        ])

    def _process_email_action(self, order_id, token, action):
        """Process email approval/rejection"""
        try:
            if not order_id or not token:
                return self._render_result_page(
                    success=False,
                    title="Invalid Request",
                    message="Missing order ID or token.",
                    color="#f44336"
                )
            
            # Get database name
            db_name = request.httprequest.args.get('db') or request.session.db
            if not db_name:
                db_name = odoo.tools.config.get('db_name')
            
            if not db_name:
                return self._render_result_page(
                    success=False,
                    title="Database Error",
                    message="Could not determine database.",
                    color="#f44336"
                )
            
            registry = Registry(db_name)
            with registry.cursor() as cr:
                env = odoo.api.Environment(cr, odoo.SUPERUSER_ID, {})
                
                # Find order
                order = env['sale.order'].sudo().browse(int(order_id))
                
                if not order.exists():
                    return self._render_result_page(
                        success=False,
                        title="Order Not Found",
                        message=f"Order ID {order_id} not found.",
                        color="#f44336"
                    )
                
                # Validate token
                if order.email_approval_token != token:
                    return self._render_result_page(
                        success=False,
                        title="Invalid Token",
                        message="The approval link is invalid or has expired.",
                        color="#f44336"
                    )
                
                # Check if already processed
                if order.credit_approval_status == 'approved':
                    return self._render_result_page(
                        success=True,
                        title="Already Approved",
                        message=f"Order {order.name} was already approved.",
                        color="#ff9800",
                        order_name=order.name,
                        customer=order.partner_id.name,
                        amount=order.amount_total,
                        currency=order.currency_id.symbol
                    )
                
                if order.credit_approval_status == 'rejected':
                    return self._render_result_page(
                        success=True,
                        title="Already Rejected",
                        message=f"Order {order.name} was already rejected.",
                        color="#ff9800",
                        order_name=order.name,
                        customer=order.partner_id.name,
                        amount=order.amount_total,
                        currency=order.currency_id.symbol
                    )
                
                # Process action
                if action == 'approve':
                    order.action_approve_credit_override()
                    cr.commit()
                    
                    return self._render_result_page(
                        success=True,
                        title="Order Approved",
                        message=f"Order {order.name} has been approved and confirmed.",
                        color="#4CAF50",
                        order_name=order.name,
                        customer=order.partner_id.name,
                        amount=order.amount_total,
                        currency=order.currency_id.symbol
                    )
                    
                elif action == 'reject':
                    order.action_reject_credit_override()
                    cr.commit()
                    
                    return self._render_result_page(
                        success=True,
                        title="Order Rejected",
                        message=f"Order {order.name} has been rejected.",
                        color="#f44336",
                        order_name=order.name,
                        customer=order.partner_id.name,
                        amount=order.amount_total,
                        currency=order.currency_id.symbol
                    )
                
        except Exception as e:
            _logger.exception(f"Email approval error: {e}")
            return self._render_result_page(
                success=False,
                title="Error",
                message=f"An error occurred: {str(e)}",
                color="#f44336"
            )

    def _render_result_page(self, success, title, message, color, order_name=None, customer=None, amount=None, currency="₹"):
        """Render a nice HTML result page"""

        order_details = ""
        if order_name:
            amount_str = f"{currency} {amount:,.2f}" if amount else "N/A"
            order_details = f"""
            <div class="details">
                <table>
                    <tr><td>Order:</td><td><strong>{order_name}</strong></td></tr>
                    <tr><td>Customer:</td><td>{customer or 'N/A'}</td></tr>
                    <tr><td>Amount:</td><td>{amount_str}</td></tr>
                </table>
            </div>"""

        if 'Approved' in title and success:
            icon_svg = '<svg width="70" height="70" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#4CAF50"/><path d="M9 12l2 2 4-4" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
        elif 'Rejected' in title or not success:
            icon_svg = '<svg width="70" height="70" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#f44336"/><path d="M15 9l-6 6M9 9l6 6" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>'
        else:
            icon_svg = '<svg width="70" height="70" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#ff9800"/><path d="M12 8v4M12 16h.01" stroke="white" stroke-width="2.5" stroke-linecap="round"/></svg>'

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <meta name="mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <title>{title}</title>
    <style>
        * {{ box-sizing: border-box; margin: 0; padding: 0; }}
        html, body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100%;
            padding: 20px;
        }}
        .wrapper {{
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding: 20px 0;
        }}
        .container {{
            background: white;
            padding: 30px 25px;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 480px;
            width: 100%;
            text-align: center;
        }}
        .icon {{ margin-bottom: 16px; }}
        h1 {{ color: {color}; margin: 0 0 12px 0; font-size: 22px; line-height: 1.3; }}
        p {{ color: #555; font-size: 15px; line-height: 1.6; margin: 0; }}
        .details {{
            background: #f8f8f8;
            padding: 16px;
            border-radius: 8px;
            margin: 20px 0;
            text-align: left;
        }}
        .details table {{ width: 100%; border-collapse: collapse; }}
        .details td {{ padding: 7px 6px; font-size: 14px; vertical-align: top; }}
        .details td:first-child {{ font-weight: bold; color: #666; width: 110px; }}
        .done-btn {{
            display: block;
            margin-top: 20px;
            padding: 14px 20px;
            background: {color};
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: bold;
            font-size: 16px;
            border: none;
            cursor: pointer;
            width: 100%;
            -webkit-appearance: none;
            touch-action: manipulation;
        }}
        .hint {{ margin-top: 12px; font-size: 12px; color: #999; }}
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="container">
            <div class="icon">{icon_svg}</div>
            <h1>{title}</h1>
            <p>{message}</p>
            {order_details}
            <button class="done-btn" onclick="window.close();">Done</button>
            <p class="hint">Tap Done to return to your email.</p>
        </div>
    </div>
</body>
</html>"""

        return request.make_response(html, headers=[
            ('Content-Type', 'text/html; charset=utf-8'),
        ])