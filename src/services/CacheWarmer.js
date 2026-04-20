// src/services/CacheWarmer.js
//
// Background cache warmer. Orchestrates the existing fetchXxxOdoo functions
// so their AsyncStorage caches are populated without the user having to
// visit each screen manually. Runs once on login and again on every
// offline → online transition.
//
// Design notes:
//  - Every fetcher already writes its result to AsyncStorage on success; this
//    file just calls them. No new caching logic.
//  - Uses Promise.allSettled so one failing fetcher doesn't abort the rest.
//  - Throttled to one run per MIN_INTERVAL_MS unless force=true.
//  - Subscribes to the same networkStatus hook OfflineSyncService uses.

import AsyncStorage from '@react-native-async-storage/async-storage';
import networkStatus, { isOnline } from '@utils/networkStatus';
import {
  fetchCategoriesOdoo,
  fetchProductsOdoo,
  fetchWarehousesOdoo,
  fetchCustomersOdoo,
  fetchEasySalesOdoo,
  fetchEasyPurchasesOdoo,
  fetchSaleOrdersOdoo,
  fetchPurchaseOrdersOdoo,
  fetchAppBannersOdoo,
  fetchUomsOdoo,
  fetchPurchaseTaxesOdoo,
  fetchTaxesOdoo,
  fetchVendorBillsOdoo,
  fetchCompanyNameOdoo,
  fetchProductEnquiriesOdoo,
  fetchEasySalesPaymentMethodsOdoo,
  fetchEasyPurchasePaymentMethodsOdoo,
  fetchEstimateSalesOdoo,
  fetchEstimatePurchasesOdoo,
  fetchAccountPaymentsOdoo,
  fetchPaymentJournalsOdoo,
  fetchCompaniesOdoo,
} from '@api/services/generalApi';
import { getWorkplaceLocation } from '@services/AttendanceService';

let _running = false;
let _lastRunAt = 0;
const MIN_INTERVAL_MS = 60_000;

const _runFetcher = async (label, fn) => {
  try {
    await fn();
    console.log('[CacheWarmer] ✓', label);
  } catch (e) {
    console.log('[CacheWarmer] ✗', label, '—', e?.message);
  }
};

export const warmAll = async ({ userId, companyId, force = false } = {}) => {
  if (_running) return;
  if (!force && Date.now() - _lastRunAt < MIN_INTERVAL_MS) return;
  if (!(await isOnline())) return;

  _running = true;
  const started = Date.now();
  console.log('[CacheWarmer] Warming all caches…');

  await Promise.allSettled([
    _runFetcher('categories',         () => fetchCategoriesOdoo()),
    _runFetcher('products',           () => fetchProductsOdoo()),
    _runFetcher('warehouses',         () => fetchWarehousesOdoo()),
    _runFetcher('customers',          () => fetchCustomersOdoo({ companyId })),
    _runFetcher('easySales',          () => fetchEasySalesOdoo()),
    _runFetcher('easyPurchases',      () => fetchEasyPurchasesOdoo()),
    _runFetcher('saleOrders',         () => fetchSaleOrdersOdoo()),
    _runFetcher('purchaseOrders',     () => fetchPurchaseOrdersOdoo()),
    _runFetcher('banners',            () => fetchAppBannersOdoo()),
    _runFetcher('uoms',               () => fetchUomsOdoo()),
    _runFetcher('salesTaxes',         () => fetchTaxesOdoo()),
    _runFetcher('purchaseTaxes',      () => fetchPurchaseTaxesOdoo()),
    _runFetcher('salesPayMethods',    () => fetchEasySalesPaymentMethodsOdoo()),
    _runFetcher('purchasePayMethods', () => fetchEasyPurchasePaymentMethodsOdoo()),
    _runFetcher('vendorBills',        () => fetchVendorBillsOdoo()),
    _runFetcher('companyName',        () => fetchCompanyNameOdoo()),
    _runFetcher('priceEnquiries',     () => fetchProductEnquiriesOdoo()),
    _runFetcher('estimateSales',      () => fetchEstimateSalesOdoo()),
    _runFetcher('estimatePurchases',  () => fetchEstimatePurchasesOdoo()),
    _runFetcher('customerPayments',   () => fetchAccountPaymentsOdoo({ paymentType: 'inbound' })),
    _runFetcher('vendorPayments',     () => fetchAccountPaymentsOdoo({ paymentType: 'outbound' })),
    _runFetcher('paymentJournals',    () => fetchPaymentJournalsOdoo()),
    _runFetcher('companies',          () => fetchCompaniesOdoo()),
    userId
      ? _runFetcher('workplace', () => getWorkplaceLocation(userId))
      : Promise.resolve(),
  ]);

  _running = false;
  _lastRunAt = Date.now();
  console.log('[CacheWarmer] Done in', Date.now() - started, 'ms');
};

const _warmForCurrentUser = async () => {
  try {
    const raw = await AsyncStorage.getItem('userData');
    if (!raw) return;
    const user = JSON.parse(raw);
    warmAll({ userId: user?.uid, companyId: user?.company_id });
  } catch (_) {}
};

let _started = false;
export const start = () => {
  if (_started) return;
  _started = true;
  networkStatus.subscribe((online) => {
    if (!online) return;
    // Small delay so we don't race with OfflineSyncService's flush debounce.
    setTimeout(() => _warmForCurrentUser(), 1500);
  });
  // Also warm on boot if we're already online + logged in.
  setTimeout(() => _warmForCurrentUser(), 500);
};

export const stop = () => {
  _started = false;
};

export default { warmAll, start, stop };
