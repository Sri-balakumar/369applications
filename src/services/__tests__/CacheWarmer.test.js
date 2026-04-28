// CacheWarmer tests — verifies the public API loads and is callable.
// Internal cache logic (warmAll) depends on many services so we don't
// drive it end-to-end; we just confirm the module shape is healthy.

jest.mock('../../api/services/generalApi', () => ({
  getOdooAuthHeaders: jest.fn(() =>
    Promise.resolve({ Cookie: 'session_id=test' })
  ),
  ODOO_BASE_URL: jest.fn(() => 'http://localhost:8069'),
  getOdooBaseUrl: jest.fn(() => 'http://localhost:8069'),
}));

const CacheWarmer = require('../CacheWarmer');

describe('CacheWarmer — module surface', () => {
  test('module loads', () => {
    expect(CacheWarmer).toBeDefined();
  });

  test('exports warmAll', () => {
    expect(typeof CacheWarmer.warmAll).toBe('function');
  });

  test('exports start / stop', () => {
    expect(typeof CacheWarmer.start).toBe('function');
    expect(typeof CacheWarmer.stop).toBe('function');
  });

  test('default export contains warmAll, start, stop', () => {
    expect(CacheWarmer.default).toBeDefined();
    expect(typeof CacheWarmer.default.warmAll).toBe('function');
    expect(typeof CacheWarmer.default.start).toBe('function');
    expect(typeof CacheWarmer.default.stop).toBe('function');
  });
});

describe('CacheWarmer — behavior', () => {
  afterEach(() => {
    try { CacheWarmer.stop(); } catch { /* idempotent */ }
  });

  test('start does not throw', () => {
    expect(() => CacheWarmer.start()).not.toThrow();
  });

  test('stop is safe to call without start', () => {
    expect(() => CacheWarmer.stop()).not.toThrow();
  });
});
