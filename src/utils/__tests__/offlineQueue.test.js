// Comprehensive tests for the offline queue utility — covers every exported
// function across happy paths, edge cases, and error conditions.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue,
  getAll,
  getPendingCount,
  removeById,
  markFailed,
  updateValues,
  resetRetryCounts,
  clear,
} from '../offlineQueue';

const STORAGE_KEY = '@offline_queue_v1';

describe('offlineQueue', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('enqueue', () => {
    test('adds an item with auto-generated id and metadata', async () => {
      const id = await enqueue({ model: 'sale.order', operation: 'create', values: { name: 'OFF1' } });
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');

      const items = await getAll();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe(id);
      expect(items[0].model).toBe('sale.order');
      expect(items[0].operation).toBe('create');
      expect(items[0].values.name).toBe('OFF1');
      expect(items[0].retryCount).toBe(0);
      expect(items[0].lastError).toBeNull();
      expect(items[0].createdAt).toBeTruthy();
    });

    test('appends to existing items rather than overwriting', async () => {
      await enqueue({ model: 'sale.order', operation: 'create', values: { name: 'A' } });
      await enqueue({ model: 'sale.order', operation: 'create', values: { name: 'B' } });
      const items = await getAll();
      expect(items.length).toBe(2);
      expect(items.map(i => i.values.name)).toEqual(['A', 'B']);
    });

    test('throws when model is missing', async () => {
      await expect(enqueue({ operation: 'create', values: {} })).rejects.toThrow(/model and operation/);
    });

    test('throws when operation is missing', async () => {
      await expect(enqueue({ model: 'sale.order', values: {} })).rejects.toThrow(/model and operation/);
    });

    test('defaults values to empty object when omitted', async () => {
      const id = await enqueue({ model: 'sale.order', operation: 'create' });
      const items = await getAll();
      expect(items.find(i => i.id === id).values).toEqual({});
    });
  });

  describe('getAll', () => {
    test('returns empty array when storage is empty', async () => {
      const items = await getAll();
      expect(items).toEqual([]);
    });

    test('returns empty array when storage has malformed JSON', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, 'not-json');
      const items = await getAll();
      expect(items).toEqual([]);
    });

    test('returns empty array when stored value is not an array', async () => {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'array' }));
      const items = await getAll();
      expect(items).toEqual([]);
    });
  });

  describe('getPendingCount', () => {
    test('returns 0 when queue is empty', async () => {
      expect(await getPendingCount()).toBe(0);
    });

    test('returns correct count after multiple enqueues', async () => {
      await enqueue({ model: 'a', operation: 'create' });
      await enqueue({ model: 'b', operation: 'create' });
      await enqueue({ model: 'c', operation: 'create' });
      expect(await getPendingCount()).toBe(3);
    });
  });

  describe('removeById', () => {
    test('removes the item matching the id', async () => {
      const id1 = await enqueue({ model: 'a', operation: 'create' });
      const id2 = await enqueue({ model: 'b', operation: 'create' });
      await removeById(id1);
      const items = await getAll();
      expect(items.length).toBe(1);
      expect(items[0].id).toBe(id2);
    });

    test('is a no-op when id does not exist', async () => {
      await enqueue({ model: 'a', operation: 'create' });
      await removeById('nonexistent-id');
      expect(await getPendingCount()).toBe(1);
    });
  });

  describe('markFailed', () => {
    test('increments retryCount and stores lastError', async () => {
      const id = await enqueue({ model: 'a', operation: 'create' });
      await markFailed(id, 'Timeout');
      const items = await getAll();
      const target = items.find(i => i.id === id);
      expect(target.retryCount).toBe(1);
      expect(target.lastError).toBe('Timeout');
    });

    test('uses "unknown" when error message omitted', async () => {
      const id = await enqueue({ model: 'a', operation: 'create' });
      await markFailed(id);
      const items = await getAll();
      expect(items.find(i => i.id === id).lastError).toBe('unknown');
    });

    test('increments retryCount on multiple failures', async () => {
      const id = await enqueue({ model: 'a', operation: 'create' });
      await markFailed(id, 'err1');
      await markFailed(id, 'err2');
      await markFailed(id, 'err3');
      const items = await getAll();
      expect(items.find(i => i.id === id).retryCount).toBe(3);
      expect(items.find(i => i.id === id).lastError).toBe('err3');
    });
  });

  describe('updateValues', () => {
    test('merges new values into existing item', async () => {
      const id = await enqueue({ model: 'a', operation: 'create', values: { name: 'A', amount: 100 } });
      await updateValues(id, { amount: 200, note: 'updated' });
      const items = await getAll();
      const target = items.find(i => i.id === id);
      expect(target.values).toEqual({ name: 'A', amount: 200, note: 'updated' });
    });

    test('handles missing values gracefully', async () => {
      const id = await enqueue({ model: 'a', operation: 'create' });
      await updateValues(id, { x: 1 });
      const items = await getAll();
      expect(items.find(i => i.id === id).values).toEqual({ x: 1 });
    });
  });

  describe('resetRetryCounts', () => {
    test('zeroes out retryCount and lastError on every item', async () => {
      const id1 = await enqueue({ model: 'a', operation: 'create' });
      const id2 = await enqueue({ model: 'b', operation: 'create' });
      await markFailed(id1, 'err');
      await markFailed(id2, 'err');
      const count = await resetRetryCounts();
      expect(count).toBe(2);
      const items = await getAll();
      expect(items.every(i => i.retryCount === 0)).toBe(true);
      expect(items.every(i => i.lastError === null)).toBe(true);
    });

    test('returns 0 when queue is empty', async () => {
      const count = await resetRetryCounts();
      expect(count).toBe(0);
    });
  });

  describe('clear', () => {
    test('removes all items', async () => {
      await enqueue({ model: 'a', operation: 'create' });
      await enqueue({ model: 'b', operation: 'create' });
      await clear();
      expect(await getPendingCount()).toBe(0);
    });

    test('is safe to call on empty queue', async () => {
      await expect(clear()).resolves.not.toThrow();
    });
  });
});
