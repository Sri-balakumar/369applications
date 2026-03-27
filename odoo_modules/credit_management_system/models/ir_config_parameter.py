import socket
import re
import logging
from odoo import models, api

_logger = logging.getLogger(__name__)


class IrConfigParameter(models.Model):
    _inherit = 'ir.config_parameter'

    def set_param(self, key, value):
        """
        Prevent web.base.url from being overwritten with localhost/127.0.0.1
        once a real network IP has been set.
        If the current value is also localhost, try to auto-detect the real IP.
        """
        if key == 'web.base.url' and value:
            url_str = str(value)
            if 'localhost' in url_str or '127.0.0.1' in url_str:
                current = self.get_param(key, '')
                if current and 'localhost' not in current and '127.0.0.1' not in current:
                    # We already have a real IP — keep it
                    _logger.debug(
                        "Prevented web.base.url reset to localhost (keeping: %s)", current
                    )
                    return current
                # Current is also localhost or empty — try auto-detect
                real_url = self._detect_real_base_url(url_str)
                if real_url and real_url != url_str:
                    _logger.info("Auto-corrected web.base.url from %s to %s", url_str, real_url)
                    return super().set_param(key, real_url)

        return super().set_param(key, value)

    @api.model
    def _detect_real_base_url(self, current_url):
        """
        Detect the machine's LAN IP address to replace localhost in web.base.url.
        Uses a UDP trick: connect to 8.8.8.8 (no data sent) to find the
        outgoing interface IP.
        """
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(1)
            s.connect(('8.8.8.8', 80))
            real_ip = s.getsockname()[0]
            s.close()
            if real_ip and not real_ip.startswith('127.'):
                port_match = re.search(r':(\d+)', current_url)
                port = port_match.group(1) if port_match else '8069'
                return f'http://{real_ip}:{port}'
        except Exception as e:
            _logger.debug("Could not auto-detect real IP: %s", e)
        return current_url
