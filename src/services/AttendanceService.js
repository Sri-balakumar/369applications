// src/services/AttendanceService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Location from 'expo-location';
import ODOO_BASE_URL from '@api/config/odooConfig';
import offlineQueue from '@utils/offlineQueue';
import { isOnline } from '@utils/networkStatus';

// =============================================================================
// Tiny attendance cache (for offline-tolerant reads).
//
// On every successful network read of an employee / workplace, we mirror the
// result into AsyncStorage. When the network call fails (or the device is
// offline), we fall back to whatever was last cached so the user can still
// punch attendance.
//
// Cache keys:
//   @attCache:dev:<deviceId>     -> employee object
//   @attCache:pin:<badgeId>      -> employee object
//   @attCache:wp:<userId>        -> workplace location object
// =============================================================================
const _cacheKey = (kind, id) => `@attCache:${kind}:${id}`;

const cachePut = async (kind, id, value) => {
  try {
    await AsyncStorage.setItem(_cacheKey(kind, id), JSON.stringify(value));
  } catch (e) {
    console.warn('[AttCache] put failed:', e?.message);
  }
};

const cacheGet = async (kind, id) => {
  try {
    const raw = await AsyncStorage.getItem(_cacheKey(kind, id));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn('[AttCache] get failed:', e?.message);
    return null;
  }
};

// "Network-like" error detector — same as in checkInByEmployeeId. Inlined as
// a closure here so it stays defined regardless of where this file is loaded.
const _isNetworkLikeErr = (error) => {
  if (!error) return false;
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') return true;
  if (error.message && /Network Error|timeout/i.test(error.message)) return true;
  if (!error.response) return true;
  return false;
};

// Distance threshold in meters for attendance location verification
const ATTENDANCE_LOCATION_THRESHOLD = 100; // 100 meters

// Get Odoo auth headers
const getOdooAuthHeaders = async () => {
  const cookie = await AsyncStorage.getItem('odoo_cookie');
  return {
    'Content-Type': 'application/json',
    ...(cookie ? { Cookie: cookie } : {}),
  };
};

// Format date for Odoo (YYYY-MM-DD HH:MM:SS) - Odoo expects UTC
const formatDateForOdoo = (date) => {
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// Convert Odoo UTC datetime string to local time display (HH:MM AM/PM)
const odooUtcToLocalDisplay = (utcString) => {
  if (!utcString) return null;
  // Odoo returns "YYYY-MM-DD HH:MM:SS" in UTC — append Z to parse as UTC
  const d = new Date(utcString.replace(' ', 'T') + 'Z');
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

// Get today's date string (YYYY-MM-DD)
const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// Haversine formula to calculate distance in meters between two coordinates
const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Get current device location with multiple fallback strategies for speed + reliability
const getCurrentLocation = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, error: 'Location permission denied. Please enable location in Settings.' };
    }

    // Strategy: try to get a fast location first (last known), then refine with GPS.
    // This prevents the "location unavailable" error on cold GPS starts.

    // Attempt 1: Last known location (instant, no GPS needed)
    try {
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (lastKnown && lastKnown.coords) {
        const ageMs = Date.now() - lastKnown.timestamp;
        // Accept if less than 5 minutes old
        if (ageMs < 5 * 60 * 1000) {
          console.log('[Attendance] Using last known location (age:', Math.round(ageMs / 1000), 's)');
          return {
            success: true,
            latitude: lastKnown.coords.latitude,
            longitude: lastKnown.coords.longitude,
          };
        }
      }
    } catch (_) {}

    // Attempt 2: Balanced accuracy with 10s timeout (faster than High on most devices)
    try {
      const balanced = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
      ]);
      if (balanced?.coords) {
        console.log('[Attendance] Got location via Balanced accuracy');
        return {
          success: true,
          latitude: balanced.coords.latitude,
          longitude: balanced.coords.longitude,
        };
      }
    } catch (_) {}

    // Attempt 3: High accuracy with 15s timeout (full GPS, slowest but most precise)
    try {
      const high = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
      if (high?.coords) {
        console.log('[Attendance] Got location via High accuracy');
        return {
          success: true,
          latitude: high.coords.latitude,
          longitude: high.coords.longitude,
        };
      }
    } catch (_) {}

    // Attempt 4: Low accuracy as last resort (cell tower / Wi-Fi only)
    try {
      const low = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Low,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      if (low?.coords) {
        console.log('[Attendance] Got location via Low accuracy (fallback)');
        return {
          success: true,
          latitude: low.coords.latitude,
          longitude: low.coords.longitude,
        };
      }
    } catch (_) {}

    return { success: false, error: 'Could not get location. Please turn on GPS and try again.' };
  } catch (error) {
    console.error('[Attendance] Error getting location:', error);
    return { success: false, error: 'Location failed: ' + (error?.message || 'Unknown error. Turn on GPS.') };
  }
};

// Get workplace location from Odoo (company or employee work location)
export const getWorkplaceLocation = async (userId, employeeId) => {
  console.log('[Attendance] Getting workplace location for user:', userId, 'employee:', employeeId);

  // Helper that caches every successful workplace fetch keyed by user id or employee id.
  const cacheId = userId || employeeId || 'unknown';
  const _ok = (val) => { cachePut('wp', cacheId, val); return val; };

  try {
    const headers = await getOdooAuthHeaders();

    // First try to get employee by user_id, then fall back to employee id
    let domain = userId ? [['user_id', '=', userId]] : [['id', '=', employeeId]];
    const employeeResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [domain],
          kwargs: {
            fields: ['id', 'name', 'work_location_id', 'company_id'],
            limit: 1,
          },
        },
      },
      { headers }
    );

    let employee = employeeResponse.data?.result?.[0];
    // If user_id search found nothing, retry by employee id
    if (!employee && employeeId && userId) {
      console.log('[Attendance] No employee found by user_id, trying employee id:', employeeId);
      const retryResponse = await axios.post(
        `${ODOO_BASE_URL()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.employee',
            method: 'search_read',
            args: [[['id', '=', employeeId]]],
            kwargs: {
              fields: ['id', 'name', 'work_location_id', 'company_id'],
              limit: 1,
            },
          },
        },
        { headers }
      );
      employee = retryResponse.data?.result?.[0];
    }
    if (!employee) {
      return { success: false, error: 'No employee record found' };
    }

    // Try to get work location coordinates
    if (employee.work_location_id) {
      const workLocationResponse = await axios.post(
        `${ODOO_BASE_URL()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.work.location',
            method: 'search_read',
            args: [[['id', '=', employee.work_location_id[0]]]],
            kwargs: {
              fields: ['id', 'name', 'address_id'],
              limit: 1,
            },
          },
        },
        { headers }
      );

      const workLocation = workLocationResponse.data?.result?.[0];
      if (workLocation?.address_id) {
        // Get partner address with coordinates
        const partnerResponse = await axios.post(
          `${ODOO_BASE_URL()}/web/dataset/call_kw`,
          {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              model: 'res.partner',
              method: 'search_read',
              args: [[['id', '=', workLocation.address_id[0]]]],
              kwargs: {
                fields: ['id', 'name', 'partner_latitude', 'partner_longitude'],
                limit: 1,
              },
            },
          },
          { headers }
        );

        const partner = partnerResponse.data?.result?.[0];
        if (partner?.partner_latitude && partner?.partner_longitude) {
          return _ok({
            success: true,
            latitude: partner.partner_latitude,
            longitude: partner.partner_longitude,
            locationName: workLocation.name || partner.name,
          });
        }
      }
    }

    // Fallback: Try to get company address coordinates
    if (employee.company_id) {
      const companyResponse = await axios.post(
        `${ODOO_BASE_URL()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'res.company',
            method: 'search_read',
            args: [[['id', '=', employee.company_id[0]]]],
            kwargs: {
              fields: ['id', 'name', 'partner_id'],
              limit: 1,
            },
          },
        },
        { headers }
      );

      const company = companyResponse.data?.result?.[0];
      if (company?.partner_id) {
        const partnerResponse = await axios.post(
          `${ODOO_BASE_URL()}/web/dataset/call_kw`,
          {
            jsonrpc: '2.0',
            method: 'call',
            params: {
              model: 'res.partner',
              method: 'search_read',
              args: [[['id', '=', company.partner_id[0]]]],
              kwargs: {
                fields: ['id', 'name', 'partner_latitude', 'partner_longitude'],
                limit: 1,
              },
            },
          },
          { headers }
        );

        const partner = partnerResponse.data?.result?.[0];
        if (partner?.partner_latitude && partner?.partner_longitude) {
          return _ok({
            success: true,
            latitude: partner.partner_latitude,
            longitude: partner.partner_longitude,
            locationName: company.name,
          });
        }
      }
    }

    return {
      success: false,
      error: 'No workplace coordinates configured. Please contact admin.',
    };
  } catch (error) {
    console.error('[Attendance] Error getting workplace location:', error?.message);
    // Offline / unreachable → use the last cached workplace for this user.
    if (_isNetworkLikeErr(error)) {
      const cached = await cacheGet('wp', userId);
      if (cached) {
        console.log('[Attendance] Using cached workplace for user:', userId);
        return { ...cached, fromCache: true };
      }
    }
    return { success: false, error: 'Failed to get workplace location' };
  }
};

// Verify if user is within workplace location
export const verifyAttendanceLocation = async (userId, employeeId) => {
  console.log('[Attendance] Verifying attendance location for user:', userId, 'employee:', employeeId);

  try {
    // Get current location
    const currentLocation = await getCurrentLocation();
    console.log('[Attendance] GPS result:', JSON.stringify(currentLocation));
    if (!currentLocation.success) {
      return {
        success: false,
        error: currentLocation.error || 'Failed to get GPS location',
        withinRange: false,
      };
    }

    // Get workplace location
    const workplaceLocation = await getWorkplaceLocation(userId, employeeId);
    console.log('[Attendance] Workplace result:', JSON.stringify(workplaceLocation));
    if (!workplaceLocation.success) {
      return {
        success: false,
        error: workplaceLocation.error || 'No workplace coordinates configured. Ask admin to set latitude/longitude in Odoo.',
        withinRange: false,
      };
    }

    // Calculate distance
    const distance = getDistanceMeters(
      currentLocation.latitude,
      currentLocation.longitude,
      workplaceLocation.latitude,
      workplaceLocation.longitude
    );

    const withinRange = distance <= ATTENDANCE_LOCATION_THRESHOLD;

    console.log('[Attendance] Distance from workplace:', Math.round(distance), 'meters');
    console.log('[Attendance] Within range:', withinRange);

    return {
      success: true,
      withinRange,
      distance: Math.round(distance),
      threshold: ATTENDANCE_LOCATION_THRESHOLD,
      workplaceName: workplaceLocation.locationName,
      currentLocation: {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      },
      workplaceLocation: {
        latitude: workplaceLocation.latitude,
        longitude: workplaceLocation.longitude,
      },
    };
  } catch (error) {
    console.error('[Attendance] Location verification error:', error?.message);
    return {
      success: false,
      error: error?.message || 'Location verification failed',
      withinRange: false,
    };
  }
};

// Get employee ID from user ID
export const getEmployeeIdFromUserId = async (userId) => {
  console.log('[Attendance] Getting employee ID for user:', userId);

  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [[['user_id', '=', userId]]],
          kwargs: {
            fields: ['id', 'name', 'pin'],
            limit: 1,
          },
        },
      },
      { headers }
    );

    const employees = response.data?.result || [];
    if (employees.length > 0) {
      console.log('[Attendance] Found employee:', employees[0]);
      return employees[0];
    }

    console.log('[Attendance] No employee found for user:', userId);
    return null;
  } catch (error) {
    console.error('[Attendance] Error getting employee:', error?.message);
    return null;
  }
};

// Debug: List all employees with their badge/pin fields
export const debugListAllEmployees = async () => {
  console.log('[Attendance] === DEBUG: Listing all employees ===');
  console.log('[Attendance] Using Odoo URL:', ODOO_BASE_URL);

  try {
    const headers = await getOdooAuthHeaders();
    console.log('[Attendance] Auth headers:', JSON.stringify(headers, null, 2));

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [[]],
          kwargs: {
            fields: ['id', 'name', 'pin', 'barcode', 'identification_id'],
            limit: 20,
          },
        },
      },
      { headers }
    );

    console.log('[Attendance] Full response:', JSON.stringify(response.data, null, 2));

    const employees = response.data?.result || [];
    console.log('[Attendance] Total employees found:', employees.length);
    employees.forEach((emp, idx) => {
      console.log(`[Attendance] Employee ${idx + 1}:`, JSON.stringify(emp, null, 2));
    });

    // Check if there's an error in the response
    if (response.data?.error) {
      console.error('[Attendance] Odoo Error:', JSON.stringify(response.data.error, null, 2));
    }

    return employees;
  } catch (error) {
    console.error('[Attendance] Debug list error:', error?.message);
    if (error.response) {
      console.error('[Attendance] Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return [];
  }
};

// Find employee by device ID (custom field x_device_id on hr.employee)
export const getEmployeeByDeviceId = async (deviceId) => {
  console.log('[Attendance] Finding employee by device ID:', deviceId);

  try {
    const headers = await getOdooAuthHeaders();

    // Fetch all employees that have registered devices.
    // Also fetch pin + barcode so we can prime the offline PIN cache below.
    const empResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [[['device_ids', '!=', false]]],
          kwargs: {
            fields: ['id', 'name', 'user_id', 'device_ids', 'pin', 'barcode'],
          },
        },
      },
      { headers }
    );

    const employees = empResponse.data?.result || [];
    console.log('[Attendance] Employees with devices:', employees.length);

    if (employees.length === 0) {
      return { success: false, error: 'No employees with registered devices found' };
    }

    // Collect all device IDs to fetch in one call
    const allDeviceIds = employees.flatMap((e) => e.device_ids || []);
    if (allDeviceIds.length === 0) {
      return { success: false, error: 'No device records found' };
    }

    // Fetch device records to find matching device_id
    const deviceResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'employee.device',
          method: 'read',
          args: [allDeviceIds],
          kwargs: {
            fields: ['id', 'device_id', 'employee_id'],
          },
        },
      },
      { headers }
    );

    const devices = deviceResponse.data?.result || [];
    console.log('[Attendance] Device records fetched:', devices.length);

    const matchedDevice = devices.find((d) => d.device_id === deviceId);

    if (!matchedDevice) {
      console.log('[Attendance] No device record matches:', deviceId);
      return { success: false, error: 'No employee registered for this device' };
    }

    const employeeId = matchedDevice.employee_id?.[0];
    const employee = employees.find((e) => e.id === employeeId);

    if (employee) {
      console.log('[Attendance] Found employee by device ID:', employee.name);
      const result = {
        success: true,
        employee: {
          id: employee.id,
          name: employee.name,
          userId: employee.user_id?.[0] || null,
        },
      };
      // Cache for offline use
      await cachePut('dev', deviceId, result);
      // Also prime the PIN cache for this employee so offline PIN entry works
      // even if the user hasn't typed their PIN online yet on this build.
      // We mirror the same employee object under both `pin` and `barcode` keys.
      if (employee.pin) {
        await cachePut('pin', String(employee.pin).trim(), result);
      }
      if (employee.barcode) {
        await cachePut('pin', String(employee.barcode).trim(), result);
      }
      // Last-resort fallback: a fixed key holding the most recent employee
      // resolved by device id. verifyEmployeePin reads this when offline AND
      // there is no specific PIN cache entry, so any non-empty PIN works.
      try {
        await AsyncStorage.setItem('@attCache:lastEmployee', JSON.stringify(result));
      } catch (_) { /* ignore */ }
      return result;
    }

    return { success: false, error: 'Employee not found' };
  } catch (error) {
    console.error('[Attendance] Device ID lookup error:', error?.message);
    // Network-style failure → fall back to whatever we cached last time
    if (_isNetworkLikeErr(error)) {
      const cached = await cacheGet('dev', deviceId);
      if (cached) {
        console.log('[Attendance] Using cached employee for device:', deviceId);
        return { ...cached, fromCache: true };
      }
    }
    return {
      success: false,
      error: error?.message || 'Failed to find employee by device',
    };
  }
};

// Find employee by Badge ID (checks both 'pin' and 'barcode' fields)
export const verifyEmployeePin = async (userId, enteredBadgeId) => {
  const badgeId = enteredBadgeId?.trim();
  console.log('[Attendance] Finding employee by Badge ID:', badgeId);

  // Up-front offline check — skip the doomed axios calls and go straight to
  // cache. This is the same pattern as checkInByEmployeeId.
  try {
    const online = await isOnline();
    if (!online) {
      console.log('[Attendance] Device offline, trying PIN cache directly');
      const cached = await cacheGet('pin', badgeId);
      if (cached) {
        console.log('[Attendance] Offline: PIN cache hit for badge:', badgeId);
        return { ...cached, fromCache: true };
      }
      // No PIN-specific cache → try lastEmployee fallback
      try {
        const raw = await AsyncStorage.getItem('@attCache:lastEmployee');
        if (raw) {
          const last = JSON.parse(raw);
          if (last?.success && last?.employee) {
            console.log('[Attendance] Offline: using lastEmployee fallback:', last.employee.name);
            return { ...last, fromCache: true, fallback: true };
          }
        }
      } catch (_) { /* ignore */ }
      return {
        success: false,
        error: 'Cannot verify offline. Open User Attendance once with internet first.',
      };
    }
  } catch (_) {
    // isOnline() itself failed — fall through to live attempt
  }

  try {
    const headers = await getOdooAuthHeaders();

    // First try searching by 'pin' field
    let response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [[['pin', '=', badgeId]]],
          kwargs: {
            fields: ['id', 'name', 'user_id', 'pin', 'barcode'],
            limit: 1,
          },
        },
      },
      { headers }
    );

    let employees = response.data?.result || [];

    // If not found by 'pin', try 'barcode' field (Odoo 19 uses this as Badge ID)
    if (employees.length === 0) {
      console.log('[Attendance] Not found by pin field, trying barcode (Badge ID) field...');
      response = await axios.post(
        `${ODOO_BASE_URL()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.employee',
            method: 'search_read',
            args: [[['barcode', '=', badgeId]]],
            kwargs: {
              fields: ['id', 'name', 'user_id', 'pin', 'barcode'],
              limit: 1,
            },
          },
        },
        { headers }
      );
      employees = response.data?.result || [];
    }

    if (employees.length > 0) {
      const employee = employees[0];
      console.log('[Attendance] Found employee:', employee.name);
      console.log('[Attendance] Employee details:', JSON.stringify(employee, null, 2));
      const result = {
        success: true,
        employee: {
          id: employee.id,
          name: employee.name,
          userId: employee.user_id?.[0] || null,
        }
      };
      // Cache by the badge id the user just typed so the same PIN works offline next time
      await cachePut('pin', badgeId, result);
      return result;
    }

    console.log('[Attendance] No employee found with Badge ID:', badgeId);
    return {
      success: false,
      error: 'No employee found with this Badge ID'
    };
  } catch (error) {
    console.error('[Attendance] Badge ID lookup error:', error?.message, 'code:', error?.code, 'hasResponse:', !!error?.response);
    const isNetErr = _isNetworkLikeErr(error);
    console.log('[Attendance] isNetworkLikeErr=', isNetErr);

    if (isNetErr) {
      // Offline / unreachable → check the cache for this PIN.
      const cached = await cacheGet('pin', badgeId);
      console.log('[Attendance] PIN cache hit=', !!cached, 'for badge=', badgeId);
      if (cached) {
        console.log('[Attendance] Using cached employee for badge:', badgeId);
        return { ...cached, fromCache: true };
      }
      // Last-resort fallback: if the device has been recognized at least once
      // online, the lastEmployee key holds whoever it resolved to. Accept any
      // non-empty PIN against that.
      try {
        const raw = await AsyncStorage.getItem('@attCache:lastEmployee');
        console.log('[Attendance] lastEmployee raw=', raw ? 'exists' : 'null');
        if (raw) {
          const last = JSON.parse(raw);
          if (last?.success && last?.employee) {
            console.log('[Attendance] Falling back to lastEmployee for offline PIN:', last.employee.name);
            return { ...last, fromCache: true, fallback: true };
          }
        }
      } catch (cacheErr) {
        console.error('[Attendance] lastEmployee read error:', cacheErr?.message);
      }
      return {
        success: false,
        error: 'Cannot verify offline. Open User Attendance once with internet first.',
      };
    }
    return {
      success: false,
      error: error?.message || 'Failed to find employee'
    };
  }
};

// Check-in to Odoo by user ID (looks up employee)
export const checkInToOdoo = async (userId) => {
  console.log('[Attendance] === CHECK-IN TO ODOO ===');
  console.log('[Attendance] User ID:', userId);

  try {
    const headers = await getOdooAuthHeaders();

    // Get employee ID
    const employee = await getEmployeeIdFromUserId(userId);
    if (!employee) {
      console.error('[Attendance] Cannot check-in: No employee found for user');
      return { success: false, error: 'No employee record found for this user' };
    }

    const checkInTime = formatDateForOdoo(new Date());
    console.log('[Attendance] Check-in time:', checkInTime);

    // First check for any open attendance (no check_out) for this employee
    // Odoo has a constraint preventing overlapping attendance records
    const openCheckResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'search_read',
          args: [[
            ['employee_id', '=', employee.id],
            ['check_out', '=', false],
          ]],
          kwargs: {
            fields: ['id', 'check_in'],
            order: 'check_in desc',
            limit: 1,
          },
        },
      },
      { headers }
    );

    const openRecords = openCheckResponse.data?.result || [];
    if (openRecords.length > 0) {
      // Auto-close the previous open attendance before creating a new one
      const openRecord = openRecords[0];
      console.log('[Attendance] Found open attendance ID:', openRecord.id, '- auto-closing it');

      await axios.post(
        `${ODOO_BASE_URL()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.attendance',
            method: 'write',
            args: [[openRecord.id], {
              check_out: checkInTime,
            }],
            kwargs: {},
          },
        },
        { headers }
      );
      console.log('[Attendance] Auto-closed previous attendance');
    }

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'create',
          args: [{
            employee_id: employee.id,
            check_in: checkInTime,
          }],
          kwargs: {},
        },
      },
      { headers }
    );

    console.log('[Attendance] Check-in response:', JSON.stringify(response.data, null, 2));

    if (response.data?.error) {
      const errMsg = response.data.error.data?.message || 'Failed to create attendance record';
      console.error('[Attendance] Odoo error:', errMsg);
      return { success: false, error: errMsg };
    }

    if (response.data?.result) {
      return {
        success: true,
        attendanceId: response.data.result,
        checkInTime: checkInTime,
        employeeName: employee.name,
      };
    }

    return { success: false, error: 'Failed to create attendance record' };
  } catch (error) {
    console.error('[Attendance] Check-in error:', error?.message);
    if (error.response) {
      console.error('[Attendance] Error response:', JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error: error?.message || 'Check-in failed' };
  }
};

// Check-in to Odoo by employee ID directly (when employee already known from PIN)
// Helper: detect "no connectivity / server unreachable" type errors so we can
// fall back to the local offline queue. Anything else (4xx/5xx with a real
// response body) is a real Odoo error and should not be queued.
const isNetworkLikeError = (error) => {
  if (!error) return false;
  if (error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND') return true;
  if (error.message && /Network Error|timeout/i.test(error.message)) return true;
  if (!error.response) return true; // axios with no response usually means transport failure
  return false;
};

// Helper: enqueue an offline check-in and return the success-shaped object
// the UserAttendanceScreen expects. Used both when isOnline() reports false
// up-front AND when an axios call fails with a network-like error mid-flight.
const queueOfflineCheckIn = async ({ employeeId, employeeName, checkInTime }) => {
  try {
    const localId = await offlineQueue.enqueue({
      model: 'hr.attendance',
      operation: 'create',
      values: {
        employee_id: employeeId,
        check_in: checkInTime,
      },
    });
    console.log('[Attendance] Check-in queued offline, localId:', localId);
    return {
      success: true,
      offline: true,
      localId,
      attendanceId: null,
      checkInTime: odooUtcToLocalDisplay(checkInTime),
      checkInTimeUtc: checkInTime,
      employeeName,
    };
  } catch (e) {
    console.error('[Attendance] Failed to enqueue offline check-in:', e?.message);
    return { success: false, error: 'Could not save offline: ' + (e?.message || 'unknown') };
  }
};

export const checkInByEmployeeId = async (employeeId, employeeName) => {
  console.log('[Attendance] === CHECK-IN BY EMPLOYEE ID ===');
  console.log('[Attendance] Employee ID:', employeeId);

  const now = new Date();
  const checkInTime = formatDateForOdoo(now);
  console.log('[Attendance] Check-in time:', checkInTime);

  // Up-front offline check — if the device knows it has no network, skip the
  // doomed axios calls entirely and queue immediately. Saves a 30s timeout.
  try {
    const online = await isOnline();
    if (!online) {
      console.log('[Attendance] Device is offline, queueing check-in locally');
      return await queueOfflineCheckIn({ employeeId, employeeName, checkInTime });
    }
  } catch (_) {
    // If isOnline() itself errors, fall through to the live attempt — the
    // catch block below will queue if the actual call fails.
  }

  try {
    const headers = await getOdooAuthHeaders();

    // First check for any open attendance (no check_out) for this employee
    // Odoo has a constraint preventing overlapping attendance records
    const openCheckResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'search_read',
          args: [[
            ['employee_id', '=', employeeId],
            ['check_out', '=', false],
          ]],
          kwargs: {
            fields: ['id', 'check_in', 'check_out'],
            order: 'check_in desc',
            limit: 1,
          },
        },
      },
      { headers }
    );

    const openRecords = openCheckResponse.data?.result || [];
    if (openRecords.length > 0) {
      // Auto-close the previous open attendance before creating a new one
      const openRecord = openRecords[0];
      console.log('[Attendance] Found open attendance ID:', openRecord.id, '- auto-closing it');

      await axios.post(
        `${ODOO_BASE_URL()}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'hr.attendance',
            method: 'write',
            args: [[openRecord.id], {
              check_out: checkInTime,
            }],
            kwargs: {},
          },
        },
        { headers }
      );
      console.log('[Attendance] Auto-closed previous attendance');
    }

    // Now create the new check-in
    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'create',
          args: [{
            employee_id: employeeId,
            check_in: checkInTime,
          }],
          kwargs: {},
        },
      },
      { headers }
    );

    console.log('[Attendance] Check-in response:', JSON.stringify(response.data, null, 2));

    if (response.data?.error) {
      const errMsg = response.data.error.data?.message || 'Failed to create attendance record';
      console.error('[Attendance] Odoo error:', errMsg);
      return { success: false, error: errMsg };
    }

    if (response.data?.result) {
      return {
        success: true,
        attendanceId: response.data.result,
        checkInTime: odooUtcToLocalDisplay(checkInTime),
        employeeName: employeeName,
      };
    }

    return { success: false, error: 'Failed to create attendance record' };
  } catch (error) {
    console.error('[Attendance] Check-in error:', error?.message);
    if (error.response) {
      console.error('[Attendance] Error response:', JSON.stringify(error.response.data, null, 2));
    }
    // If this looks like a connectivity / unreachable-server failure, queue it
    // locally instead of bubbling the error up to the UI as a hard failure.
    if (isNetworkLikeError(error)) {
      console.log('[Attendance] Network-like error, falling back to offline queue');
      return await queueOfflineCheckIn({ employeeId, employeeName, checkInTime });
    }
    return { success: false, error: error?.message || 'Check-in failed' };
  }
};

// Check-out to Odoo
export const checkOutToOdoo = async (attendanceId) => {
  console.log('[Attendance] === CHECK-OUT TO ODOO ===');
  console.log('[Attendance] Attendance ID:', attendanceId);

  try {
    const headers = await getOdooAuthHeaders();
    const checkOutTime = formatDateForOdoo(new Date());
    console.log('[Attendance] Check-out time:', checkOutTime);

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'write',
          args: [[attendanceId], {
            check_out: checkOutTime,
          }],
          kwargs: {},
        },
      },
      { headers }
    );

    console.log('[Attendance] Check-out response:', JSON.stringify(response.data, null, 2));

    if (response.data?.result) {
      return {
        success: true,
        checkOutTime: odooUtcToLocalDisplay(checkOutTime),
      };
    }

    return { success: false, error: 'Failed to update attendance record' };
  } catch (error) {
    console.error('[Attendance] Check-out error:', error?.message);
    return { success: false, error: error?.message || 'Check-out failed' };
  }
};

// Get today's attendance for user
export const getTodayAttendance = async (userId) => {
  console.log('[Attendance] Getting today attendance for user:', userId);

  try {
    const headers = await getOdooAuthHeaders();

    // Get employee ID first
    const employee = await getEmployeeIdFromUserId(userId);
    if (!employee) {
      return null;
    }

    const today = getTodayDateString();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'search_read',
          args: [[
            ['employee_id', '=', employee.id],
            ['check_in', '>=', `${today} 00:00:00`],
            ['check_in', '<=', `${today} 23:59:59`],
          ]],
          kwargs: {
            fields: ['id', 'employee_id', 'check_in', 'check_out'],
            order: 'check_in desc',
            limit: 1,
          },
        },
      },
      { headers }
    );

    const records = response.data?.result || [];
    if (records.length > 0) {
      console.log('[Attendance] Found today attendance:', records[0]);
      return {
        id: records[0].id,
        employeeId: records[0].employee_id?.[0],
        employeeName: records[0].employee_id?.[1] || employee.name,
        checkIn: odooUtcToLocalDisplay(records[0].check_in),
        checkOut: odooUtcToLocalDisplay(records[0].check_out),
      };
    }

    console.log('[Attendance] No attendance found for today');
    return null;
  } catch (error) {
    console.error('[Attendance] Error getting today attendance:', error?.message);
    return null;
  }
};

// Get today's attendance by employee ID directly
export const getTodayAttendanceByEmployeeId = async (employeeId, employeeName) => {
  console.log('[Attendance] Getting today attendance for employee:', employeeId);

  try {
    const headers = await getOdooAuthHeaders();
    const today = getTodayDateString();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'search_read',
          args: [[
            ['employee_id', '=', employeeId],
            ['check_in', '>=', `${today} 00:00:00`],
            ['check_in', '<=', `${today} 23:59:59`],
          ]],
          kwargs: {
            fields: ['id', 'employee_id', 'check_in', 'check_out'],
            order: 'check_in desc',
            limit: 1,
          },
        },
      },
      { headers }
    );

    const records = response.data?.result || [];
    if (records.length > 0) {
      // Find the last OPEN attendance (no check_out) — supports multiple check-in/out per day
      const openRecord = records.find(r => !r.check_out);
      if (openRecord) {
        console.log('[Attendance] Found open attendance:', openRecord.id);
        const built = {
          id: openRecord.id,
          employeeId: openRecord.employee_id?.[0],
          employeeName: openRecord.employee_id?.[1] || employeeName,
          checkIn: odooUtcToLocalDisplay(openRecord.check_in),
          checkOut: null,
        };
        await cachePut('todayAtt', employeeId, built);
        return built;
      }
      // All records are closed — user can check-in again
      console.log('[Attendance] All attendance records closed, ready for new check-in');
      await cachePut('todayAtt', employeeId, null);
      return null;
    }

    console.log('[Attendance] No attendance found for today');
    await cachePut('todayAtt', employeeId, null);
    return null;
  } catch (error) {
    console.error('[Attendance] Error getting today attendance:', error?.message);
    if (_isNetworkLikeErr(error)) {
      const cached = await cacheGet('todayAtt', employeeId);
      if (cached !== null && cached !== undefined) {
        console.log('[Attendance] Using cached today attendance');
        return cached;
      }
    }
    return null;
  }
};

// Upload attendance photo to Odoo as attachment
export const uploadAttendancePhoto = async (attendanceId, base64Image, type = 'check_in') => {
  console.log('[Attendance] Uploading photo for attendance:', attendanceId, 'type:', type);

  try {
    const headers = await getOdooAuthHeaders();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `attendance_${type}_${attendanceId}_${timestamp}.jpg`;

    // Create attachment in Odoo
    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'ir.attachment',
          method: 'create',
          args: [{
            name: fileName,
            type: 'binary',
            datas: base64Image,
            res_model: 'hr.attendance',
            res_id: attendanceId,
            mimetype: 'image/jpeg',
          }],
          kwargs: {},
        },
      },
      { headers }
    );

    console.log('[Attendance] Photo upload response:', JSON.stringify(response.data, null, 2));

    if (response.data?.result) {
      return {
        success: true,
        attachmentId: response.data.result,
      };
    }

    return { success: false, error: 'Failed to upload photo' };
  } catch (error) {
    console.error('[Attendance] Photo upload error:', error?.message);
    return { success: false, error: error?.message || 'Failed to upload photo' };
  }
};

// =============================================
// WFH (Work From Home) FUNCTIONS
// =============================================

// Submit a WFH request (create + submit for approval)
export const submitWfhRequest = async (userId, requestDate, reason) => {
  console.log('[WFH] Submitting WFH request:', { userId, requestDate, reason });

  try {
    const headers = await getOdooAuthHeaders();

    // Step 1: Create the WFH request
    const createResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.wfh.request',
          method: 'create',
          args: [{
            employee_user_id: userId,
            request_date: requestDate,
            reason: reason,
          }],
          kwargs: {},
        },
      },
      { headers }
    );

    if (createResponse.data?.error) {
      const errMsg = createResponse.data.error.data?.message || 'Failed to create WFH request';
      console.error('[WFH] Create error:', errMsg);
      return { success: false, error: errMsg };
    }

    const requestId = createResponse.data?.result;
    if (!requestId) {
      return { success: false, error: 'Failed to create WFH request' };
    }

    console.log('[WFH] Created request ID:', requestId);

    // Step 2: Submit for approval (action_submit)
    const submitResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.wfh.request',
          method: 'action_submit',
          args: [[requestId]],
          kwargs: {},
        },
      },
      { headers }
    );

    if (submitResponse.data?.error) {
      const errMsg = submitResponse.data.error.data?.message || 'Failed to submit WFH request';
      console.error('[WFH] Submit error:', errMsg);
      return { success: false, error: errMsg };
    }

    console.log('[WFH] Request submitted for approval');
    return { success: true, requestId };
  } catch (error) {
    console.error('[WFH] Submit WFH request error:', error?.message);
    return { success: false, error: error?.message || 'Failed to submit WFH request' };
  }
};

// Get today's approved/checked-in/checked-out WFH request for a user
export const getTodayApprovedWfh = async (userId) => {
  console.log('[WFH] Checking today WFH for user:', userId);

  try {
    const headers = await getOdooAuthHeaders();
    const today = getTodayDateString();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.wfh.request',
          method: 'search_read',
          args: [[
            ['employee_user_id', '=', userId],
            ['request_date', '=', today],
            ['state', 'in', ['approved', 'checked_in', 'checked_out']],
          ]],
          kwargs: {
            fields: ['id', 'request_date', 'reason', 'state'],
            limit: 1,
          },
        },
      },
      { headers }
    );

    console.log('[WFH] getTodayApprovedWfh response:', JSON.stringify(response.data));

    if (response.data?.error) {
      console.log('[WFH] Search error:', response.data.error.data?.message);
      return null;
    }

    const records = response.data?.result || [];
    if (records.length > 0) {
      const req = records[0];
      console.log('[WFH] Found today WFH request:', JSON.stringify(req));
      return {
        id: req.id,
        requestDate: req.request_date,
        reason: req.reason,
        state: req.state,
        checkIn: null,
        checkOut: null,
      };
    }

    console.log('[WFH] No approved WFH request for today');
    return null;
  } catch (error) {
    console.error('[WFH] Get today WFH error:', error?.message);
    return null;
  }
};

// WFH Check-in (calls action_checkin on the Odoo model)
export const wfhCheckIn = async (requestId) => {
  console.log('[WFH] Check-in for request:', requestId);

  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.wfh.request',
          method: 'action_checkin',
          args: [[requestId]],
          kwargs: {},
        },
      },
      { headers }
    );

    if (response.data?.error) {
      const errMsg = response.data.error.data?.message || 'WFH check-in failed';
      console.error('[WFH] Check-in error:', errMsg);
      return { success: false, error: errMsg };
    }

    const now = new Date();
    console.log('[WFH] Check-in successful');
    return {
      success: true,
      checkInTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  } catch (error) {
    console.error('[WFH] Check-in error:', error?.message);
    return { success: false, error: error?.message || 'WFH check-in failed' };
  }
};

// WFH Check-out (calls action_checkout on the Odoo model)
export const wfhCheckOut = async (requestId) => {
  console.log('[WFH] Check-out for request:', requestId);

  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.wfh.request',
          method: 'action_checkout',
          args: [[requestId]],
          kwargs: {},
        },
      },
      { headers }
    );

    if (response.data?.error) {
      const errMsg = response.data.error.data?.message || 'WFH check-out failed';
      console.error('[WFH] Check-out error:', errMsg);
      return { success: false, error: errMsg };
    }

    const now = new Date();
    console.log('[WFH] Check-out successful');
    return {
      success: true,
      checkOutTime: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  } catch (error) {
    console.error('[WFH] Check-out error:', error?.message);
    return { success: false, error: error?.message || 'WFH check-out failed' };
  }
};

// Get all WFH requests for a user (for history display)
export const getMyWfhRequests = async (userId) => {
  console.log('[WFH] Fetching WFH requests for user:', userId);

  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.wfh.request',
          method: 'search_read',
          args: [[['employee_user_id', '=', userId]]],
          kwargs: {
            fields: ['id', 'request_date', 'reason', 'state'],
            order: 'request_date desc',
            limit: 20,
          },
        },
      },
      { headers }
    );

    if (response.data?.error) {
      return [];
    }

    const records = response.data?.result || [];
    return records.map((r) => ({
      id: r.id,
      requestDate: r.request_date,
      reason: r.reason,
      state: r.state,
    }));
  } catch (error) {
    console.error('[WFH] Get requests error:', error?.message);
    return [];
  }
};

// =============================================
// LATE TRACKING FUNCTIONS
// =============================================

// Get late tracking configuration for an employee
export const getLateConfig = async (employeeId) => {
  console.log('[Attendance] Getting late config for employee:', employeeId);
  try {
    const headers = await getOdooAuthHeaders();
    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance.late.config',
          method: 'get_config_for_employee',
          args: [employeeId],
          kwargs: {},
        },
      },
      { headers }
    );

    const result = response.data?.result;
    if (result) {
      console.log('[Attendance] Late config:', JSON.stringify(result));
      return {
        success: true,
        officeStartHour: result.office_start_hour || 8.0,
        lateThresholdMinutes: result.late_threshold_minutes || 15,
        graceLateDays: result.grace_late_days || 5,
      };
    }
    return { success: true, officeStartHour: 8.0, lateThresholdMinutes: 15, graceLateDays: 5 };
  } catch (error) {
    console.error('[Attendance] Get late config error:', error?.message);
    return { success: false, error: error?.message };
  }
};

// Submit late reason for an attendance record
export const submitLateReason = async (attendanceId, reason) => {
  console.log('[Attendance] Submitting late reason for attendance:', attendanceId);
  try {
    const headers = await getOdooAuthHeaders();
    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'write',
          args: [[attendanceId], { late_reason: reason }],
          kwargs: {},
        },
      },
      { headers }
    );

    if (response.data?.error) {
      return { success: false, error: response.data.error.data?.message || 'Failed to submit late reason' };
    }
    console.log('[Attendance] Late reason submitted successfully');
    return { success: true };
  } catch (error) {
    console.error('[Attendance] Submit late reason error:', error?.message);
    return { success: false, error: error?.message };
  }
};

// Get today's attendance with late tracking info
export const getTodayAttendanceWithLateInfo = async (employeeId) => {
  console.log('[Attendance] Getting today attendance with late info for employee:', employeeId);
  try {
    const headers = await getOdooAuthHeaders();
    const today = getTodayDateString();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'search_read',
          args: [[
            ['employee_id', '=', employeeId],
            ['check_in', '>=', `${today} 00:00:00`],
            ['check_in', '<=', `${today} 23:59:59`],
          ]],
          kwargs: {
            fields: [
              'id', 'check_in', 'check_out',
              'is_late', 'late_minutes', 'late_minutes_display', 'expected_start_time',
              'late_reason', 'deduction_amount', 'late_sequence',
              'daily_total_hours', 'is_first_checkin_of_day',
            ],
            order: 'check_in asc',
          },
        },
      },
      { headers }
    );

    const records = response.data?.result || [];
    return {
      success: true,
      records: records.map(r => ({
        id: r.id,
        checkIn: r.check_in ? odooUtcToLocalDisplay(r.check_in) : null,
        checkOut: r.check_out ? odooUtcToLocalDisplay(r.check_out) : null,
        isLate: r.is_late,
        lateMinutes: r.late_minutes,
        lateMinutesDisplay: r.late_minutes_display || '',
        expectedStartTime: r.expected_start_time,
        lateReason: r.late_reason || '',
        deductionAmount: r.deduction_amount,
        lateSequence: r.late_sequence,
        dailyTotalHours: r.daily_total_hours,
        isFirstCheckinOfDay: r.is_first_checkin_of_day,
      })),
    };
  } catch (error) {
    console.error('[Attendance] Get late info error:', error?.message);
    return { success: false, error: error?.message, records: [] };
  }
};

// =============================================
// LEAVE REQUEST FUNCTIONS
// =============================================

// Submit a leave request
export const submitLeaveRequest = async (userId, leaveType, fromDate, toDate, reason, employeeId, isHalfDay = false) => {
  console.log('[Leave] Submitting leave request for user:', userId, 'employee:', employeeId, 'halfDay:', isHalfDay);
  try {
    const headers = await getOdooAuthHeaders();

    // Build create values
    const createVals = {
      leave_type: leaveType,
      from_date: fromDate,
      to_date: isHalfDay ? false : (toDate || false),
      is_half_day: isHalfDay,
      reason: reason,
    };
    // Set employee - hr_employee_id is the primary field now
    if (employeeId) {
      createVals.hr_employee_id = employeeId;
    }

    // Create leave request
    const createResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.leave.request',
          method: 'create',
          args: [createVals],
          kwargs: {},
        },
      },
      { headers }
    );

    if (createResponse.data?.error) {
      const errMsg = createResponse.data.error.data?.message || 'Failed to create leave request';
      return { success: false, error: errMsg };
    }

    const requestId = createResponse.data?.result;
    if (!requestId) {
      return { success: false, error: 'Failed to create leave request' };
    }

    // Auto-submit for approval
    await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.leave.request',
          method: 'action_submit',
          args: [[requestId]],
          kwargs: {},
        },
      },
      { headers }
    );

    console.log('[Leave] Request submitted successfully, ID:', requestId);
    return { success: true, requestId };
  } catch (error) {
    console.error('[Leave] Submit error:', error?.message);
    return { success: false, error: error?.message };
  }
};

// Get my leave requests (by hr_employee_id for device-based lookup)
export const getMyLeaveRequests = async (userId, employeeId) => {
  console.log('[Leave] Getting leave requests for employee:', employeeId, 'user:', userId);
  try {
    const headers = await getOdooAuthHeaders();

    // Filter by hr_employee_id if available, otherwise by user_id
    const domain = employeeId
      ? [['hr_employee_id', '=', employeeId]]
      : [['employee_user_id', '=', userId]];

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.leave.request',
          method: 'search_read',
          args: [domain],
          kwargs: {
            fields: [
              'id', 'leave_type', 'from_date', 'to_date',
              'number_of_days', 'reason', 'state',
              'approved_by', 'approval_date', 'rejection_reason',
            ],
            order: 'from_date desc',
            limit: 30,
          },
        },
      },
      { headers }
    );

    const records = response.data?.result || [];
    return records.map(r => ({
      id: r.id,
      leaveType: r.leave_type,
      fromDate: r.from_date || '',
      toDate: r.to_date || '',
      numberOfDays: r.number_of_days,
      reason: r.reason || '',
      state: r.state,
      approvedBy: r.approved_by ? r.approved_by[1] : '',
      approvalDate: r.approval_date || '',
      rejectionReason: r.rejection_reason || '',
    }));
  } catch (error) {
    console.error('[Leave] Get requests error:', error?.message);
    return [];
  }
};

// Cancel a leave request
export const cancelLeaveRequest = async (requestId) => {
  console.log('[Leave] Cancelling leave request:', requestId);
  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.leave.request',
          method: 'action_cancel',
          args: [[requestId]],
          kwargs: {},
        },
      },
      { headers }
    );

    if (response.data?.error) {
      return { success: false, error: response.data.error.data?.message || 'Failed to cancel' };
    }
    return { success: true };
  } catch (error) {
    console.error('[Leave] Cancel error:', error?.message);
    return { success: false, error: error?.message };
  }
};

// =============================================
// LATE WAIVER REQUEST FUNCTIONS
// =============================================

// Get all late attendance records (last 30 days) eligible for waiver
export const getEligibleLateAttendances = async (employeeId) => {
  console.log('[Waiver] Getting eligible late attendances for employee:', employeeId);
  try {
    const headers = await getOdooAuthHeaders();
    // Last 30 days
    const today = new Date();
    const past = new Date();
    past.setDate(past.getDate() - 30);
    const fromStr = past.toISOString().slice(0, 10);
    const toStr = today.toISOString().slice(0, 10);

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.attendance',
          method: 'search_read',
          args: [[
            ['employee_id', '=', employeeId],
            ['is_late', '=', true],
            ['is_first_checkin_of_day', '=', true],
            ['date', '>=', fromStr],
            ['date', '<=', toStr],
          ]],
          kwargs: {
            fields: [
              'id', 'date', 'check_in', 'late_minutes', 'late_minutes_display',
              'deduction_amount', 'late_reason', 'is_waived',
            ],
            order: 'date desc',
            limit: 60,
          },
        },
      },
      { headers }
    );

    const records = response.data?.result || [];
    return records.map(r => ({
      id: r.id,
      date: r.date || '',
      checkInTime: r.check_in ? odooUtcToLocalDisplay(r.check_in) : '',
      lateMinutes: r.late_minutes || 0,
      lateMinutesDisplay: r.late_minutes_display || '',
      deductionAmount: r.deduction_amount || 0,
      lateReason: r.late_reason || '',
      isWaived: !!r.is_waived,
    }));
  } catch (error) {
    console.error('[Waiver] Get eligible late error:', error?.message);
    return [];
  }
};

// Submit a new waiver request (creates draft + auto-submits)
export const submitWaiverRequest = async (employeeId, attendanceId, reason) => {
  console.log('[Waiver] Submitting waiver request for attendance:', attendanceId);
  try {
    const headers = await getOdooAuthHeaders();

    const createResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.late.waiver.request',
          method: 'create',
          args: [{
            employee_id: employeeId,
            attendance_id: attendanceId,
            reason: reason,
          }],
          kwargs: {},
        },
      },
      { headers }
    );

    if (createResponse.data?.error) {
      const errMsg = createResponse.data.error.data?.message || 'Failed to create waiver request';
      return { success: false, error: errMsg };
    }

    const requestId = createResponse.data?.result;
    if (!requestId) {
      return { success: false, error: 'Failed to create waiver request' };
    }

    // Auto-submit (draft -> pending)
    const submitResponse = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.late.waiver.request',
          method: 'action_submit',
          args: [[requestId]],
          kwargs: {},
        },
      },
      { headers }
    );

    if (submitResponse.data?.error) {
      const errMsg = submitResponse.data.error.data?.message || 'Failed to submit waiver request';
      return { success: false, error: errMsg };
    }

    console.log('[Waiver] Waiver request submitted, ID:', requestId);
    return { success: true, requestId };
  } catch (error) {
    console.error('[Waiver] Submit error:', error?.message);
    return { success: false, error: error?.message };
  }
};

// Get my waiver requests
export const getMyWaiverRequests = async (employeeId) => {
  console.log('[Waiver] Getting waiver requests for employee:', employeeId);
  try {
    const headers = await getOdooAuthHeaders();

    const response = await axios.post(
      `${ODOO_BASE_URL()}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.late.waiver.request',
          method: 'search_read',
          args: [[['employee_id', '=', employeeId]]],
          kwargs: {
            fields: [
              'id', 'late_date', 'late_minutes', 'late_minutes_display',
              'original_deduction', 'original_late_reason', 'reason',
              'state', 'approved_by', 'approval_date', 'rejection_reason',
              'attendance_id',
            ],
            order: 'create_date desc',
            limit: 30,
          },
        },
      },
      { headers }
    );

    const records = response.data?.result || [];
    return records.map(r => ({
      id: r.id,
      lateDate: r.late_date || '',
      lateMinutes: r.late_minutes || 0,
      lateMinutesDisplay: r.late_minutes_display || '',
      originalDeduction: r.original_deduction || 0,
      originalLateReason: r.original_late_reason || '',
      reason: r.reason || '',
      state: r.state,
      approvedBy: r.approved_by ? r.approved_by[1] : '',
      approvalDate: r.approval_date || '',
      rejectionReason: r.rejection_reason || '',
      attendanceId: r.attendance_id ? r.attendance_id[0] : null,
    }));
  } catch (error) {
    console.error('[Waiver] Get requests error:', error?.message);
    return [];
  }
};

export default {
  checkInToOdoo,
  checkInByEmployeeId,
  checkOutToOdoo,
  getTodayAttendance,
  getTodayAttendanceByEmployeeId,
  getEmployeeIdFromUserId,
  getEmployeeByDeviceId,
  verifyEmployeePin,
  verifyAttendanceLocation,
  getWorkplaceLocation,
  debugListAllEmployees,
  uploadAttendancePhoto,
  submitWfhRequest,
  getTodayApprovedWfh,
  wfhCheckIn,
  wfhCheckOut,
  getMyWfhRequests,
  getLateConfig,
  submitLateReason,
  getTodayAttendanceWithLateInfo,
  submitLeaveRequest,
  getMyLeaveRequests,
  cancelLeaveRequest,
  getEligibleLateAttendances,
  submitWaiverRequest,
  getMyWaiverRequests,
};
