// src/api/services/companyApi.js
//
// Fetch and switch branches/companies for the logged-in Odoo user.

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getOdooBaseUrl } from '@api/config/odooConfig';

const TIMEOUT_MS = 15000;

const getAuthHeaders = async () => {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const cookie = await AsyncStorage.getItem('odoo_cookie');
    if (cookie) headers.Cookie = cookie;
  } catch (_) {}
  return headers;
};

const rpc = async (model, method, args, kwargs = {}) => {
  const baseUrl = (getOdooBaseUrl() || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('Odoo URL not configured');
  const headers = await getAuthHeaders();
  const response = await axios.post(
    `${baseUrl}/web/dataset/call_kw`,
    { jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } },
    { headers, timeout: TIMEOUT_MS },
  );
  if (response.data?.error) {
    throw new Error(response.data.error?.data?.message || response.data.error?.message || 'Odoo error');
  }
  return response.data?.result;
};

/**
 * Fetch the current user's company_id and all allowed companies.
 * @param {number} uid - The Odoo user id (from login response)
 * @returns {{ current_company_id, current_company_name, allowed_companies: [{id, name, phone, email}] }}
 */
export const fetchUserCompanies = async (uid) => {
  // Step 1: get company_id and company_ids from res.users
  const users = await rpc('res.users', 'search_read', [
    [['id', '=', uid]],
  ], { fields: ['company_id', 'company_ids'], limit: 1 });

  if (!users || users.length === 0) throw new Error('User not found');
  const user = users[0];

  const currentCompanyId = Array.isArray(user.company_id) ? user.company_id[0] : user.company_id;
  const currentCompanyName = Array.isArray(user.company_id) ? user.company_id[1] : '';
  const companyIds = user.company_ids || [];

  if (companyIds.length === 0) {
    return {
      current_company_id: currentCompanyId,
      current_company_name: currentCompanyName,
      allowed_companies: currentCompanyId
        ? [{ id: currentCompanyId, name: currentCompanyName, phone: '', email: '' }]
        : [],
    };
  }

  // Step 2: fetch company details
  const companies = await rpc('res.company', 'search_read', [
    [['id', 'in', companyIds]],
  ], { fields: ['id', 'name', 'phone', 'email'] });

  return {
    current_company_id: currentCompanyId,
    current_company_name: currentCompanyName,
    allowed_companies: (companies || []).map((c) => ({
      id: c.id,
      name: c.name || '',
      phone: c.phone || '',
      email: c.email || '',
    })),
  };
};

/**
 * Switch the user's active company on the Odoo server.
 * After this call, all subsequent RPC queries return data for the new company.
 * @param {number} uid - The Odoo user id
 * @param {number} companyId - The target company id
 */
export const switchCompany = async (uid, companyId) => {
  await rpc('res.users', 'write', [[uid], { company_id: companyId }]);
};
