// Smoke test — proves that Jest is wired up and can execute synchronous
// and asynchronous tests in this project. If this file fails, the Jest
// install or config is broken.

describe('Jest sanity', () => {
  test('1 + 1 = 2', () => {
    expect(1 + 1).toBe(2);
  });

  test('async test works', async () => {
    const result = await Promise.resolve('hello');
    expect(result).toBe('hello');
  });

  test('object equality with toEqual', () => {
    expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] });
  });
});
