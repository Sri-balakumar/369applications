"""Convert USER_MANUAL.md to PDF using fpdf2."""
import re
import os
from fpdf import FPDF


def safe(text):
    """Make text safe for latin-1 encoding."""
    return text.encode('latin-1', 'replace').decode('latin-1')


class ManualPDF(FPDF):
    def header(self):
        if self.page_no() > 1:
            self.set_font('Helvetica', 'I', 8)
            self.set_text_color(128, 128, 128)
            self.cell(0, 8, 'Vehicle Maintenance Module - User Manual', align='C')
            self.ln(10)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.set_text_color(128, 128, 128)
        self.cell(0, 10, f'Page {self.page_no()}/{{nb}}', align='C')

    def chapter_title(self, text, level=1):
        sizes = {1: 20, 2: 16, 3: 13, 4: 11}
        size = sizes.get(level, 11)
        self.set_font('Helvetica', 'B', size)
        self.set_text_color(30, 60, 120)
        self.ln(4 if level > 2 else 6)
        self.multi_cell(0, size * 0.6, safe(text))
        if level <= 2:
            self.set_draw_color(30, 60, 120)
            self.line(self.l_margin, self.get_y() + 1, self.w - self.r_margin, self.get_y() + 1)
            self.ln(4)
        else:
            self.ln(2)

    def body_text(self, text):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(0, 6, safe(text))
        self.ln(2)

    def bullet_item(self, text, indent=0):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        x = self.l_margin + 5 + indent * 8
        self.set_x(x)
        bullet = '-' if indent > 0 else '*'
        self.multi_cell(self.w - self.r_margin - x, 6, safe(f'  {bullet}  {text}'))
        self.ln(1)

    def numbered_item(self, num, text, indent=0):
        self.set_font('Helvetica', '', 10)
        self.set_text_color(40, 40, 40)
        x = self.l_margin + 5 + indent * 8
        self.set_x(x)
        self.multi_cell(self.w - self.r_margin - x, 6, safe(f'  {num}. {text}'))
        self.ln(1)

    def blockquote(self, text):
        self.set_font('Helvetica', 'I', 9)
        self.set_text_color(100, 100, 100)
        self.set_fill_color(240, 240, 240)
        x = self.l_margin + 5
        self.set_x(x)
        self.multi_cell(self.w - self.r_margin - x, 6, safe(text), fill=True)
        self.ln(3)

    def code_block(self, text):
        self.set_font('Courier', '', 8)
        self.set_text_color(40, 40, 40)
        self.set_fill_color(245, 245, 245)
        for line in text.split('\n'):
            self.set_x(self.l_margin + 5)
            self.cell(self.w - self.r_margin - self.l_margin - 5, 5, '  ' + safe(line), fill=True, new_x="LMARGIN", new_y="NEXT")
        self.ln(3)

    def add_table(self, headers, rows):
        self.set_font('Helvetica', 'B', 8)
        self.set_fill_color(30, 60, 120)
        self.set_text_color(255, 255, 255)

        num_cols = len(headers)
        available = self.w - self.l_margin - self.r_margin
        col_w = available / num_cols

        for h in headers:
            self.cell(col_w, 7, safe(h.strip()), border=1, fill=True, align='C')
        self.ln()

        self.set_font('Helvetica', '', 7)
        self.set_text_color(40, 40, 40)
        fill = False
        for row in rows:
            if self.get_y() > self.h - 25:
                self.add_page()
            if fill:
                self.set_fill_color(245, 245, 250)
            else:
                self.set_fill_color(255, 255, 255)
            max_h = 7
            for i, cell in enumerate(row):
                lines = self.multi_cell(col_w, 7, safe(cell.strip()), border=0, split_only=True)
                h = len(lines) * 7
                if h > max_h:
                    max_h = h

            y_start = self.get_y()
            for i, cell in enumerate(row):
                self.set_xy(self.l_margin + i * col_w, y_start)
                self.multi_cell(col_w, 7, safe(cell.strip()), border=1, fill=fill)
            self.set_y(y_start + max_h)
            fill = not fill
        self.ln(3)


def clean(text):
    """Remove markdown bold/italic markers."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*', r'\1', text)
    text = re.sub(r'`(.+?)`', r'\1', text)
    return text.strip()


def parse_and_render(md_path, pdf_path):
    with open(md_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    pdf = ManualPDF()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title page
    pdf.ln(40)
    pdf.set_font('Helvetica', 'B', 28)
    pdf.set_text_color(30, 60, 120)
    pdf.cell(0, 15, 'Vehicle Maintenance Module', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.ln(5)
    pdf.set_font('Helvetica', '', 18)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 12, 'User Manual', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.ln(10)
    pdf.set_draw_color(30, 60, 120)
    pdf.line(60, pdf.get_y(), pdf.w - 60, pdf.get_y())
    pdf.ln(10)
    pdf.set_font('Helvetica', '', 11)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 8, 'Module: Vehicle Maintenance (vehicle_maintenance)', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, 'Odoo Version: 19.0', align='C', new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, 'Document Version: 1.0', align='C', new_x="LMARGIN", new_y="NEXT")

    pdf.add_page()

    i = 0
    in_code = False
    code_buf = []
    in_table = False
    table_headers = []
    table_rows = []

    while i < len(lines):
        line = lines[i]
        raw = line.rstrip('\n')

        # Code blocks
        if raw.strip().startswith('```'):
            if in_code:
                pdf.code_block('\n'.join(code_buf))
                code_buf = []
                in_code = False
            else:
                if in_table:
                    pdf.add_table(table_headers, table_rows)
                    in_table = False
                    table_headers = []
                    table_rows = []
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(raw)
            i += 1
            continue

        # Table rows
        if '|' in raw and raw.strip().startswith('|'):
            cells = [c.strip() for c in raw.strip().strip('|').split('|')]
            # Check if separator row
            if all(re.match(r'^[-:]+$', c) for c in cells):
                i += 1
                continue
            if not in_table:
                in_table = True
                table_headers = [clean(c) for c in cells]
            else:
                table_rows.append([clean(c) for c in cells])
            i += 1
            continue
        else:
            if in_table:
                pdf.add_table(table_headers, table_rows)
                in_table = False
                table_headers = []
                table_rows = []

        stripped = raw.strip()

        # Skip horizontal rules
        if stripped == '---' or stripped == '***':
            i += 1
            continue

        # Empty line
        if stripped == '':
            i += 1
            continue

        # Headers
        if stripped.startswith('#'):
            m = re.match(r'^(#{1,4})\s+(.*)', stripped)
            if m:
                level = len(m.group(1))
                text = clean(m.group(2))
                if level == 1 and 'User Manual' in text:
                    i += 1
                    continue
                pdf.chapter_title(text, level)
            i += 1
            continue

        # Blockquote
        if stripped.startswith('>'):
            text = clean(stripped.lstrip('> '))
            pdf.blockquote(text)
            i += 1
            continue

        # Numbered list
        m = re.match(r'^(\s*)(\d+)\.\s+(.*)', raw)
        if m:
            indent = len(m.group(1)) // 2
            text = clean(m.group(3))
            pdf.numbered_item(m.group(2), text, indent)
            i += 1
            continue

        # Bullet list
        m = re.match(r'^(\s*)[-*]\s+(.*)', raw)
        if m:
            indent = len(m.group(1)) // 2
            text = clean(m.group(2))
            pdf.bullet_item(text, indent)
            i += 1
            continue

        # Regular text
        pdf.body_text(clean(stripped))
        i += 1

    # Flush
    if in_table:
        pdf.add_table(table_headers, table_rows)
    if in_code:
        pdf.code_block('\n'.join(code_buf))

    pdf.output(pdf_path)
    print(f'PDF generated: {pdf_path}')


if __name__ == '__main__':
    import os
    base = os.path.dirname(os.path.abspath(__file__))
    md = os.path.join(base, 'USER_MANUAL.md')
    out = os.path.join(base, 'Vehicle_Maintenance_User_Manual.pdf')
    parse_and_render(md, out)
