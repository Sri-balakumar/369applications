// src/services/AttendanceService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Location from 'expo-location';
import ODOO_BASE_URL from '@api/config/odooConfig';

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

// Get current device location
const getCurrentLocation = async () => {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { success: false, error: 'Location permission denied' };
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    return {
      success: true,
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    };
  } catch (error) {
    console.error('[Attendance] Error getting location:', error);
    return { success: false, error: 'Failed to get current location' };
  }
};

// Get workplace location from Odoo (company or employee work location)
export const getWorkplaceLocation = async (userId) => {
  console.log('[Attendance] Getting workplace location for user:', userId);

  try {
    const headers = await getOdooAuthHeaders();

    // First try to get employee's work location
    const employeeResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [[['user_id', '=', userId]]],
          kwargs: {
            fields: ['id', 'name', 'work_location_id', 'company_id'],
            limit: 1,
          },
        },
      },
      { headers }
    );

    const employee = employeeResponse.data?.result?.[0];
    if (!employee) {
      return { success: false, error: 'No employee record found' };
    }

    // Try to get work location coordinates
    if (employee.work_location_id) {
      const workLocationResponse = await axios.post(
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
          `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
          return {
            success: true,
            latitude: partner.partner_latitude,
            longitude: partner.partner_longitude,
            locationName: workLocation.name || partner.name,
          };
        }
      }
    }

    // Fallback: Try to get company address coordinates
    if (employee.company_id) {
      const companyResponse = await axios.post(
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
          `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
          return {
            success: true,
            latitude: partner.partner_latitude,
            longitude: partner.partner_longitude,
            locationName: company.name,
          };
        }
      }
    }

    return {
      success: false,
      error: 'No workplace coordinates configured. Please contact admin.',
    };
  } catch (error) {
    console.error('[Attendance] Error getting workplace location:', error?.message);
    return { success: false, error: 'Failed to get workplace location' };
  }
};

// Verify if user is within workplace location
export const verifyAttendanceLocation = async (userId) => {
  console.log('[Attendance] Verifying attendance location for user:', userId);

  try {
    // Get current location
    const currentLocation = await getCurrentLocation();
    if (!currentLocation.success) {
      return {
        success: false,
        error: currentLocation.error,
        withinRange: false,
      };
    }

    // Get workplace location
    const workplaceLocation = await getWorkplaceLocation(userId);
    if (!workplaceLocation.success) {
      return {
        success: false,
        error: workplaceLocation.error,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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

    // Fetch all employees that have registered devices
    const empResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
      {
        jsonrpc: '2.0',
        method: 'call',
        params: {
          model: 'hr.employee',
          method: 'search_read',
          args: [[['device_ids', '!=', false]]],
          kwargs: {
            fields: ['id', 'name', 'user_id', 'device_ids'],
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      return {
        success: true,
        employee: {
          id: employee.id,
          name: employee.name,
          userId: employee.user_id?.[0] || null,
        },
      };
    }

    return { success: false, error: 'Employee not found' };
  } catch (error) {
    console.error('[Attendance] Device ID lookup error:', error?.message);
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

  try {
    const headers = await getOdooAuthHeaders();

    // First try searching by 'pin' field
    let response = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      return {
        success: true,
        employee: {
          id: employee.id,
          name: employee.name,
          userId: employee.user_id?.[0] || null,
        }
      };
    }

    console.log('[Attendance] No employee found with Badge ID:', badgeId);
    return {
      success: false,
      error: 'No employee found with this Badge ID'
    };
  } catch (error) {
    console.error('[Attendance] Badge ID lookup error:', error?.message);
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
export const checkInByEmployeeId = async (employeeId, employeeName) => {
  console.log('[Attendance] === CHECK-IN BY EMPLOYEE ID ===');
  console.log('[Attendance] Employee ID:', employeeId);

  try {
    const headers = await getOdooAuthHeaders();
    const now = new Date();
    const checkInTime = formatDateForOdoo(now);
    console.log('[Attendance] Check-in time:', checkInTime);

    // First check for any open attendance (no check_out) for this employee
    // Odoo has a constraint preventing overlapping attendance records
    const openCheckResponse = await axios.post(
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
        return {
          id: openRecord.id,
          employeeId: openRecord.employee_id?.[0],
          employeeName: openRecord.employee_id?.[1] || employeeName,
          checkIn: odooUtcToLocalDisplay(openRecord.check_in),
          checkOut: null,
        };
      }
      // All records are closed — user can check-in again
      console.log('[Attendance] All attendance records closed, ready for new check-in');
      return null;
    }

    console.log('[Attendance] No attendance found for today');
    return null;
  } catch (error) {
    console.error('[Attendance] Error getting today attendance:', error?.message);
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
      `${ODOO_BASE_URL}/web/dataset/call_kw`,
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
};
