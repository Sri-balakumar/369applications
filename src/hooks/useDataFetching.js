import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useLoader from './useLoader';

/**
 * @param {Function} fetchDataCallback
 * @param {Object} [options]
 * @param {string} [options.cacheKey] When set, the last successful fetch is
 *   persisted to AsyncStorage under this key and re-read on mount. Callers
 *   see cached rows instantly while the real fetch is still in flight —
 *   gives a "snappy" feel for list screens.
 */
const useDataFetching = (fetchDataCallback, options = {}) => {
  if (typeof fetchDataCallback !== 'function') {
    console.error('useDataFetching: fetchDataCallback is not a function or is undefined', fetchDataCallback);
    // Provide safe no-op implementations so callers don't repeatedly crash.
    const noop = async () => [];
    fetchDataCallback = noop;
  }
  const cacheKey = options?.cacheKey;
  const [data, setData] = useState([]);
  const [loading, startLoading, stopLoading] = useLoader(false);
  const [allDataLoaded, setAllDataLoaded] = useState(false);
  // offset is the item offset (number of items to skip)
  const [offset, setOffset] = useState(0);

  // On mount, hydrate from cache so the UI is not empty while the real fetch runs.
  useEffect(() => {
    if (!cacheKey) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (cancelled || !raw) return;
        const cached = JSON.parse(raw);
        if (Array.isArray(cached) && cached.length > 0) {
          setData((prev) => (prev.length === 0 ? cached : prev));
        }
      } catch (_) {}
    })();
    return () => { cancelled = true; };
  }, [cacheKey]);

  const fetchData = useCallback(async (newFilters = {}) => {
    startLoading();
    try {
      const limit = newFilters.limit ?? 50;
      // fresh fetch: start at item offset 0
      const params = { offset: 0, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      setData(list);
      setAllDataLoaded(list.length < limit);
      setOffset(0);
      // Persist the base list (no search filter) for next mount.
      if (cacheKey && !newFilters.searchText) {
        try { await AsyncStorage.setItem(cacheKey, JSON.stringify(list)); } catch (_) {}
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      stopLoading();
    }
  }, [fetchDataCallback, startLoading, stopLoading, cacheKey]);

  const fetchMoreData = async (newFilters = {}) => {
    if (loading || allDataLoaded) return;
    startLoading();
    try {
      const limit = newFilters.limit ?? 50;
      const nextOffset = offset + limit;
      const params = { offset: nextOffset, limit, ...newFilters };
      const fetchedData = await fetchDataCallback(params);
      const list = fetchedData || [];
      if (list.length === 0) {
        setAllDataLoaded(true);
      } else {
        setData((prevData) => [...prevData, ...list]);
        setOffset(nextOffset);
        if (list.length < limit) setAllDataLoaded(true);
      }
    } catch (error) {
      console.error('Error fetching more data:', error);
    } finally {
      stopLoading();
    }
  };

  return { data, loading, fetchData, fetchMoreData };
};

export default useDataFetching;


