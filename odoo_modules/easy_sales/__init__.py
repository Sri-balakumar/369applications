from . import models


def _create_default_payment_methods(env):
    """Create sequence + default payment methods after module installation."""
    company = env.company
    PaymentMethod = env['easy.sales.payment.method']

    # Create sequence for this company if not already present
    if not env['ir.sequence'].sudo().search([
        ('code', '=', 'easy.sales'),
        ('company_id', '=', company.id),
    ], limit=1):
        env['ir.sequence'].sudo().create({
            'name': f'Easy Sales ({company.name})',
            'code': 'easy.sales',
            'prefix': 'ES/%(year)s/',
            'padding': 5,
            'company_id': company.id,
        })

    # Skip if payment methods already exist for this company
    if PaymentMethod.search_count([('company_id', '=', company.id)]):
        return

    cash_journal = env['account.journal'].search([
        ('type', '=', 'cash'),
        ('company_id', '=', company.id),
    ], limit=1)

    bank_journal = env['account.journal'].search([
        ('type', '=', 'bank'),
        ('company_id', '=', company.id),
    ], limit=1)

    if cash_journal:
        PaymentMethod.create({
            'name': 'Cash',
            'sequence': 1,
            'journal_id': cash_journal.id,
            'is_default': True,
            'company_id': company.id,
        })

    if bank_journal:
        PaymentMethod.create({
            'name': 'Bank Transfer',
            'sequence': 2,
            'journal_id': bank_journal.id,
            'is_default': False,
            'company_id': company.id,
        })
        PaymentMethod.create({
            'name': 'Card',
            'sequence': 3,
            'journal_id': bank_journal.id,
            'is_default': False,
            'company_id': company.id,
        })

    # Customer Account (credit sale) method
    PaymentMethod.create({
        'name': 'Credit',
        'sequence': 10,
        'is_customer_account': True,
        'is_default': False,
        'company_id': company.id,
    })
