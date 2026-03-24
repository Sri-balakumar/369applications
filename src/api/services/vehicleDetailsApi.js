// Fetch details for a single vehicle from Odoo (vehicle.vehicle model)
import ODOO_BASE_URL, { DEFAULT_ODOO_DB } from '@api/config/odooConfig';
import axios from 'axios';

export const fetchVehicleDetailsOdoo = async ({ vehicle_id, username = 'admin', password = 'admin', db = DEFAULT_ODOO_DB } = {}) => {
  if (!vehicle_id) return null;
  const baseUrl = (ODOO_BASE_URL || '').replace(/\/$/, '');
  try {
    // Authenticate to Odoo (reuse loginVehicleTrackingOdoo if needed)
    // For now, assume session is valid or not needed
    const response = await axios.post(
      `${baseUrl}/jsonrpc`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          service: 'object',
          method: 'execute_kw',
          args: [
            db,
            1, // uid (admin)
            password,
            'vehicle.vehicle', // model name
            'read',
            [[parseInt(vehicle_id)]], // ids array
            { fields: ['id', 'name', 'tank_capacity'] },
          ],
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
    if (response.data && response.data.result && Array.isArray(response.data.result) && response.data.result.length > 0) {
      return response.data.result[0];
    }
    return null;
  } catch (error) {
    console.error('Error fetching vehicle details from Odoo:', error);
    return null;
  }
};
