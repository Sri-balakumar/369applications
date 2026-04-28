// LocationTrackingService tests — focuses on Odoo write-through and
// query helpers; the actual GPS tracking lifecycle is hard to unit-test
// because it depends on expo-task-manager + expo-location native APIs.

import MockAdapter from 'axios-mock-adapter';
import axios from 'axios';

jest.mock('../../api/services/generalApi', () => ({
  getOdooAuthHeaders: jest.fn(() =>
    Promise.resolve({ Cookie: 'session_id=test' })
  ),
  ODOO_BASE_URL: jest.fn(() => 'http://localhost:8069'),
  getOdooBaseUrl: jest.fn(() => 'http://localhost:8069'),
}));

const Service = require('../LocationTrackingService');

describe('LocationTrackingService — module surface', () => {
  test('exports saveUserLocationToOdoo', () => {
    expect(typeof Service.saveUserLocationToOdoo).toBe('function');
  });

  test('exports fetchUserLocationFromOdoo', () => {
    expect(typeof Service.fetchUserLocationFromOdoo).toBe('function');
  });

  test('exports fetchAllUsersLocationsFromOdoo', () => {
    expect(typeof Service.fetchAllUsersLocationsFromOdoo).toBe('function');
  });

  test('exports getCurrentLocationWithAddress', () => {
    expect(typeof Service.getCurrentLocationWithAddress).toBe('function');
  });

  test('exports start/stop/isTrackingActive helpers', () => {
    expect(typeof Service.startLocationTracking).toBe('function');
    expect(typeof Service.stopLocationTracking).toBe('function');
    expect(typeof Service.isTrackingActive).toBe('function');
  });
});

describe('LocationTrackingService — Odoo helpers', () => {
  let mock;
  beforeEach(() => { mock = new MockAdapter(axios); });
  afterEach(() => { mock.restore(); });

  test('fetchUserLocationFromOdoo returns null on error', async () => {
    mock.onPost(/\/web\/dataset\/call_kw/).networkError();
    const result = await Service.fetchUserLocationFromOdoo('user-1');
    expect(result === null || result === undefined || result?.success === false).toBe(true);
  });

  test('fetchAllUsersLocationsFromOdoo returns array (possibly empty) on error', async () => {
    mock.onPost(/\/web\/dataset\/call_kw/).networkError();
    const result = await Service.fetchAllUsersLocationsFromOdoo();
    expect(Array.isArray(result) || result === null).toBe(true);
  });
});
