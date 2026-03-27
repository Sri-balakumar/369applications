# -*- coding: utf-8 -*-

from . import models
from . import wizards
from . import controllers

import logging

_logger = logging.getLogger(__name__)


def pre_init_hook(env):
    """
    Pre-installation hook: clean up stale easy.sales view artifacts left by
    a previous version of credit_management_system that referenced payment_type.

    Two cases handled:
    1. The BASE easy_sales form view was replaced/corrupted to include
       payment_type — restore its arch from the easy_sales module XML file
       so that the xmlid easy_sales.easy_sales_form_view stays intact.
    2. Any INHERITED views still referencing payment_type — delete them.
    """
    import os
    from lxml import etree
    import odoo.modules.module as odoo_module

    # ── Case 1: corrupted or missing base view ───────────────────────────────
    # The previous broken install may have deleted easy_sales.easy_sales_form_view
    # entirely (both the ir.ui.view record and its ir.model.data entry).
    # If so, recreate it from the easy_sales module XML file.
    # If it exists but is corrupted (has payment_type), restore just the arch.
    try:
        addon_path = odoo_module.get_module_path('easy_sales')
        views_file = os.path.join(addon_path, 'views', 'easy_sales_views.xml')
        tree = etree.parse(views_file)
        arch_fields = tree.xpath(
            '//record[@id="easy_sales_form_view"]/field[@name="arch"]'
        )

        if arch_fields:
            form_node = arch_fields[0][0]   # <form> element
            clean_arch = etree.tostring(form_node, encoding='unicode')

            base_xid = env['ir.model.data'].search([
                ('module', '=', 'easy_sales'),
                ('name', '=', 'easy_sales_form_view'),
                ('model', '=', 'ir.ui.view'),
            ], limit=1)

            if base_xid:
                # Record exists — check if arch is corrupted
                base_view = env['ir.ui.view'].browse(base_xid.res_id)
                if base_view.exists() and 'payment_type' in (base_view.arch_db or ''):
                    _logger.warning(
                        "pre_init_hook: easy_sales.easy_sales_form_view is "
                        "corrupted (contains payment_type). Restoring arch."
                    )
                    base_view.with_context(no_cow=True).write({'arch_db': clean_arch})
                    _logger.info(
                        "pre_init_hook: restored easy_sales.easy_sales_form_view arch"
                    )
            else:
                # The view record (and xmlid) was deleted by a previous failed install.
                # Recreate it so our inherit_id ref can resolve.
                _logger.warning(
                    "pre_init_hook: easy_sales.easy_sales_form_view is missing "
                    "from the database. Recreating it from module file."
                )
                new_view = env['ir.ui.view'].create({
                    'name': 'easy.sales.form',
                    'model': 'easy.sales',
                    'type': 'form',
                    'arch_db': clean_arch,
                })
                env['ir.model.data'].create({
                    'module': 'easy_sales',
                    'name': 'easy_sales_form_view',
                    'model': 'ir.ui.view',
                    'res_id': new_view.id,
                    'noupdate': False,
                })
                _logger.info(
                    "pre_init_hook: recreated easy_sales.easy_sales_form_view (id=%d)",
                    new_view.id
                )
        else:
            _logger.error(
                "pre_init_hook: easy_sales_form_view record not found in %s",
                views_file
            )
    except Exception as exc:
        _logger.error(
            "pre_init_hook: failed to check/restore base view: %s", exc,
            exc_info=True
        )

    # ── Case 2: stale inherited views ─────────────────────────────────────────
    stale = env['ir.ui.view'].search([
        ('model', '=', 'easy.sales'),
        ('arch_db', 'ilike', 'payment_type'),
        ('inherit_id', '!=', False),
    ])
    if stale:
        _logger.info(
            "pre_init_hook: removing %d stale inherited easy.sales view(s): %s",
            len(stale), stale.mapped('name')
        )
        stale.unlink()


def post_init_hook(env):
    """
    Post-installation hook to configure default settings.
    Odoo 19 signature: post_init_hook(env)
    """
    _logger.info("=" * 80)
    _logger.info("Credit Management System - Post Installation")
    _logger.info("=" * 80)
    
    try:
        # Get Sale Order Administrator group
        admin_group = env.ref('credit_management_system.group_sale_order_administrator', raise_if_not_found=False)
        
        if not admin_group:
            _logger.error("❌ Sale Order Administrator group not found!")
            return
        
        _logger.info(f"✅ Found Sale Order Administrator group (ID: {admin_group.id})")
        
        # Add Administrator user
        admin_user = env.ref('base.user_admin', raise_if_not_found=False)
        if admin_user:
            if admin_user.id not in admin_group.users.ids:
                admin_group.write({'users': [(4, admin_user.id)]})
                _logger.info(f"✅ Added {admin_user.name} to Sale Order Administrator group")
        
        # Add all Sales Managers
        sales_manager_group = env.ref('sales_team.group_sale_manager', raise_if_not_found=False)
        if sales_manager_group:
            for user in sales_manager_group.users:
                if user.id not in admin_group.users.ids:
                    admin_group.write({'users': [(4, user.id)]})
                    _logger.info(f"✅ Added Sales Manager {user.name}")
        
        _logger.info("=" * 80)
        _logger.info("✅ Installation completed!")
        _logger.info("=" * 80)
        
    except Exception as e:
        _logger.error(f"❌ Post-installation hook error: {str(e)}", exc_info=True)
