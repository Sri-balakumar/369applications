{
    'name': 'POS Negative Stock',
    'version': '19.0.1.0.0',
    'category': 'Point of Sale',
    'summary': 'Allow POS sales when product stock is zero or negative',
    'description': """
        This module allows the Point of Sale to complete sales even when
        the product stock is zero. The inventory will reflect negative
        quantities after the sale.

        Designed for Pharmacy Management where sales must not be blocked
        due to insufficient stock.
    """,
    'depends': ['point_of_sale', 'stock', 'sale_stock'],
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}
