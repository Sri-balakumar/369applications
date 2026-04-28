// Tests for belowCostCheck utilities — verifies the price-vs-cost guard
// catches under-priced lines and formats the audit log line correctly.

jest.mock('@api/services/generalApi', () => ({
  fetchProductCostsOdoo: jest.fn(),
}));

import { fetchProductCostsOdoo } from '@api/services/generalApi';
import { checkBelowCostLines, generateBelowCostDetailsText } from '../belowCostCheck';

describe('checkBelowCostLines', () => {
  beforeEach(() => {
    fetchProductCostsOdoo.mockReset();
  });

  test('flags a line whose unit price is below the product cost', async () => {
    fetchProductCostsOdoo.mockResolvedValue({ 1: 100 });
    const result = await checkBelowCostLines([
      { product_id: 1, product_name: 'Widget', price_unit: 80, qty: 2 },
    ]);
    expect(result.hasBelowCost).toBe(true);
    expect(result.belowCostLines.length).toBe(1);
    expect(result.belowCostLines[0].productId).toBe(1);
    expect(result.belowCostLines[0].costPrice).toBe(100);
    expect(result.belowCostLines[0].unitPrice).toBe(80);
    expect(result.belowCostLines[0].marginPercent).toBeCloseTo(-20, 1);
    expect(result.belowCostLines[0].qty).toBe(2);
  });

  test('passes when unit price equals cost', async () => {
    fetchProductCostsOdoo.mockResolvedValue({ 1: 100 });
    const result = await checkBelowCostLines([
      { product_id: 1, product_name: 'A', price_unit: 100, qty: 1 },
    ]);
    expect(result.hasBelowCost).toBe(false);
    expect(result.belowCostLines).toEqual([]);
  });

  test('passes when unit price is above cost', async () => {
    fetchProductCostsOdoo.mockResolvedValue({ 1: 100 });
    const result = await checkBelowCostLines([
      { product_id: 1, product_name: 'A', price_unit: 150, qty: 1 },
    ]);
    expect(result.hasBelowCost).toBe(false);
  });

  test('skips products with no cost set (cost <= 0)', async () => {
    fetchProductCostsOdoo.mockResolvedValue({ 1: 0 });
    const result = await checkBelowCostLines([
      { product_id: 1, product_name: 'A', price_unit: -10, qty: 1 },
    ]);
    expect(result.hasBelowCost).toBe(false);
  });

  test('skips lines without a product_id', async () => {
    fetchProductCostsOdoo.mockResolvedValue({});
    const result = await checkBelowCostLines([
      { product_name: 'no-id', price_unit: 1, qty: 1 },
    ]);
    expect(result.hasBelowCost).toBe(false);
    expect(fetchProductCostsOdoo).not.toHaveBeenCalled();
  });

  test('returns no-flag when lines list is empty', async () => {
    const result = await checkBelowCostLines([]);
    expect(result.hasBelowCost).toBe(false);
    expect(result.belowCostLines).toEqual([]);
    expect(fetchProductCostsOdoo).not.toHaveBeenCalled();
  });

  test('handles mix of above-cost and below-cost lines', async () => {
    fetchProductCostsOdoo.mockResolvedValue({ 1: 100, 2: 50 });
    const result = await checkBelowCostLines([
      { product_id: 1, product_name: 'OK', price_unit: 120, qty: 1 },
      { product_id: 2, product_name: 'UNDER', price_unit: 30, qty: 5 },
    ]);
    expect(result.belowCostLines.length).toBe(1);
    expect(result.belowCostLines[0].productId).toBe(2);
    expect(result.belowCostLines[0].qty).toBe(5);
  });
});

describe('generateBelowCostDetailsText', () => {
  test('produces a single-line audit string per below-cost line', () => {
    const text = generateBelowCostDetailsText([
      { productName: 'Widget', unitPrice: 80, costPrice: 100, minPrice: 100, marginPercent: -20, qty: 2 },
    ]);
    expect(text).toContain('Widget');
    expect(text).toContain('80.000');
    expect(text).toContain('100.000');
    expect(text).toContain('-20.00%');
    expect(text).toContain('Qty: 2');
  });

  test('joins multiple lines with newlines', () => {
    const text = generateBelowCostDetailsText([
      { productName: 'A', unitPrice: 1, costPrice: 2, minPrice: 2, marginPercent: -50, qty: 1 },
      { productName: 'B', unitPrice: 3, costPrice: 4, minPrice: 4, marginPercent: -25, qty: 1 },
    ]);
    expect(text.split('\n').length).toBe(2);
    expect(text).toMatch(/A.*\n.*B/);
  });

  test('returns empty string for empty list', () => {
    expect(generateBelowCostDetailsText([])).toBe('');
  });
});
