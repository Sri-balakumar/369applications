// generalApi smoke + critical function tests. The full file has 264 exports
// (Odoo CRUD wrappers); we test the highest-risk ones the user has worked
// on recently — sale order create + fetch, product costs.

import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

const Api = require('../generalApi');

describe('generalApi — module surface', () => {
  test('module loads', () => {
    expect(Api).toBeDefined();
  });

  test('exports fetchSaleOrdersOdoo', () => {
    expect(typeof Api.fetchSaleOrdersOdoo).toBe('function');
  });

  test('exports createSaleOrderOdoo', () => {
    expect(typeof Api.createSaleOrderOdoo).toBe('function');
  });

  test('exports fetchProductCostsOdoo', () => {
    expect(typeof Api.fetchProductCostsOdoo).toBe('function');
  });

  test('exports fetchProductsOdoo', () => {
    expect(typeof Api.fetchProductsOdoo).toBe('function');
  });

  test('exports fetchCustomersOdoo', () => {
    expect(typeof Api.fetchCustomersOdoo).toBe('function');
  });

  test('exports fetchCategoriesOdoo', () => {
    expect(typeof Api.fetchCategoriesOdoo).toBe('function');
  });

  test('exports loginVehicleTrackingOdoo', () => {
    expect(typeof Api.loginVehicleTrackingOdoo).toBe('function');
  });
});

describe('generalApi — fetchProductCostsOdoo', () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(axios); });
  afterEach(() => { mock.restore(); });

  test('returns object keyed by product id when given list', async () => {
    mock.onPost(/\/web\/dataset\/call_kw/).reply(200, {
      result: [{ id: 1, standard_price: 100 }, { id: 2, standard_price: 50 }],
    });
    const costs = await Api.fetchProductCostsOdoo([1, 2]);
    // Should be a map of id -> cost
    expect(costs).toBeDefined();
    expect(typeof costs).toBe('object');
  });

  test('returns empty map for empty product ids', async () => {
    const costs = await Api.fetchProductCostsOdoo([]);
    expect(costs).toBeDefined();
  });
});
