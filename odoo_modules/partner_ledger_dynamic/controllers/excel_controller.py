from odoo import http
from odoo.http import request, content_disposition


class PLDynamicExcel(http.Controller):

    @http.route('/pl_dynamic/excel/<int:report_id>', type='http', auth='user')
    def download_excel(self, report_id, **kwargs):
        report = request.env['pl.dynamic.report'].browse(report_id)
        if not report.exists():
            return request.not_found()
        data = report.generate_excel_content()
        fname = 'Partner_Ledger_%s.xlsx' % (report.company_id.name or 'Report')
        return request.make_response(
            data,
            headers=[
                ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                ('Content-Disposition', content_disposition(fname)),
            ],
        )
