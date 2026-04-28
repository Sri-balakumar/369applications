// OfflineSyncService tests — verify the public API (start/stop/flush/forceFlush
// /waitForFlush) is exported and behaves predictably. Internal sync handlers
// are not directly exported, so the surface here is small but valuable.

jest.mock('../../api/services/generalApi', () => ({
  getOdooBaseUrl: jest.fn(() => 'http://localhost:8069'),
  ODOO_BASE_URL: jest.fn(() => 'http://localhost:8069'),
  getOdooAuthHeaders: jest.fn(() =>
    Promise.resolve({ Cookie: 'session_id=test' })
  ),
}));

const Service = require('../OfflineSyncService');

describe('OfflineSyncService — module surface', () => {
  test('module loads without throwing', () => {
    expect(Service).toBeDefined();
  });

  test('exports start function', () => {
    expect(typeof Service.start).toBe('function');
  });

  test('exports stop function', () => {
    expect(typeof Service.stop).toBe('function');
  });

  test('exports flush function', () => {
    expect(typeof Service.flush).toBe('function');
  });

  test('exports forceFlush function', () => {
    expect(typeof Service.forceFlush).toBe('function');
  });

  test('exports waitForFlush function', () => {
    expect(typeof Service.waitForFlush).toBe('function');
  });

  test('default export contains start/stop/flush', () => {
    expect(Service.default).toBeDefined();
    expect(typeof Service.default.start).toBe('function');
    expect(typeof Service.default.stop).toBe('function');
    expect(typeof Service.default.flush).toBe('function');
  });
});

describe('OfflineSyncService — behavior', () => {
  afterEach(() => {
    try { Service.stop(); } catch { /* idempotent */ }
  });

  test('start is idempotent (calling twice does not throw)', () => {
    expect(() => {
      Service.start();
      Service.start();
    }).not.toThrow();
  });

  test('stop is safe to call without prior start', () => {
    expect(() => Service.stop()).not.toThrow();
  });

  test('waitForFlush resolves (returns undefined) when queue is empty', async () => {
    // Empty queue + no in-flight flush → resolves immediately with undefined.
    const result = await Service.waitForFlush(200);
    expect(result).toBeUndefined();
  });
});
