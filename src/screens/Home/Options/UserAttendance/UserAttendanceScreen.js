import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Dimensions, Modal, Alert, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { checkInByEmployeeId, checkOutToOdoo, getTodayAttendanceByEmployeeId, getEmployeeByDeviceId, verifyEmployeePin, verifyAttendanceLocation, uploadAttendancePhoto, submitWfhRequest, getTodayApprovedWfh, wfhCheckIn, wfhCheckOut, getMyWfhRequests, getLateConfig, submitLateReason, getTodayAttendanceWithLateInfo, submitLeaveRequest, getMyLeaveRequests, cancelLeaveRequest, getEligibleLateAttendances, submitWaiverRequest, getMyWaiverRequests, getWorkplaceLocation } from '@services/AttendanceService';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { Camera } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import networkStatus from '@utils/networkStatus';

const { width, height } = Dimensions.get('window');
const isSmall = width < 360;
// Cap effective width so the UI doesn't blow up on tablets / large screens.
// Phones <= 430px scale linearly; anything wider (tablets) uses the same base
// scale as a 430px phone, so fonts, icons and paddings stay phone-sized.
const BASE_WIDTH = 390;
const MAX_SCALE_WIDTH = 430;
const effectiveWidth = Math.min(width, MAX_SCALE_WIDTH);
const scale = (size) => Math.round((effectiveWidth / BASE_WIDTH) * size);
// Content column width — phones use full width, tablets get a centered column.
const CONTENT_MAX_WIDTH = MAX_SCALE_WIDTH;

const UserAttendanceScreen = ({ navigation }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [verifiedEmployee, setVerifiedEmployee] = useState(null);
  const [locationStatus, setLocationStatus] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [pinInput, setPinInput] = useState('');
  const [verificationMethod, setVerificationMethod] = useState(null); // 'fingerprint' | 'pin'
  const currentUser = useAuthStore(state => state.user);

  // Mode selection: null = choosing, 'office' = office attendance, 'wfh' = work from home
  const [attendanceMode, setAttendanceMode] = useState(null);

  // WFH state
  const [wfhReason, setWfhReason] = useState('');
  const [todayWfhRequest, setTodayWfhRequest] = useState(null);
  const [wfhRequests, setWfhRequests] = useState([]);

  // Leave request state
  const [leaveType, setLeaveType] = useState('casual');
  const [leaveFromDate, setLeaveFromDate] = useState(new Date());
  const [leaveToDate, setLeaveToDate] = useState(null);
  const [leaveReason, setLeaveReason] = useState('');
  const [showLeaveFromPicker, setShowLeaveFromPicker] = useState(false);
  const [showLeaveToPicker, setShowLeaveToPicker] = useState(false);
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveTab, setLeaveTab] = useState('form'); // 'form' | 'history'

  // Late reason state
  const [showLateReasonModal, setShowLateReasonModal] = useState(false);
  const [lateReasonText, setLateReasonText] = useState('');
  const [pendingLateAttendanceId, setPendingLateAttendanceId] = useState(null);
  const [lateInfo, setLateInfo] = useState(null); // { isLate, lateMinutes, lateSequence }

  // Waiver request state
  const [waiverTab, setWaiverTab] = useState('form'); // 'form' | 'history'
  const [eligibleLateAttendances, setEligibleLateAttendances] = useState([]);
  const [selectedWaiverAttendanceId, setSelectedWaiverAttendanceId] = useState(null);
  const [waiverReason, setWaiverReason] = useState('');
  const [waiverRequests, setWaiverRequests] = useState([]);

  // Camera state
  const [cameraPermission, requestCameraPermission] = Camera.useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraType, setCameraType] = useState('check_in');
  const [countdown, setCountdown] = useState(3);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef(null);

  // Track device connectivity so we can show an OFFLINE banner and disable
  // network-only features. Subscribes via the same poll-based helper used by
  // OfflineSyncService — fires when state flips between online/offline.
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let mounted = true;
    networkStatus.isOnline().then((online) => {
      if (mounted) setOffline(!online);
    });
    const unsubscribe = networkStatus.subscribe((online) => {
      if (mounted) setOffline(!online);
    });
    return () => { mounted = false; unsubscribe && unsubscribe(); };
  }, []);

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Get device ID on mount
  useEffect(() => {
    const fetchDeviceId = async () => {
      try {
        let id;
        if (Platform.OS === 'android') {
          id = Application.getAndroidId();
        } else {
          id = await Application.getIosIdForVendorAsync();
        }
        console.log('[Attendance] Device ID:', id);
        setDeviceId(id);
      } catch (error) {
        console.error('[Attendance] Failed to get device ID:', error);
      }
    };
    fetchDeviceId();
  }, []);

  // Auto-refresh WFH status every 5 seconds when waiting for approval
  useEffect(() => {
    let interval;
    const uid = verifiedEmployee?.userId || currentUser?.uid;
    // Skip the 5-second poll entirely when offline — no point hammering a
    // network we know is unreachable, and it pollutes logs.
    if (!offline && attendanceMode === 'wfh' && isVerified && !todayWfhRequest && uid) {
      interval = setInterval(async () => {
        console.log('[WFH] Auto-refreshing for user:', uid);
        try {
          const wfhReq = await getTodayApprovedWfh(uid);
          if (wfhReq) {
            setTodayWfhRequest(wfhReq);
            showToastMessage('WFH request approved!');
          }
          const reqs = await getMyWfhRequests(uid);
          if (reqs && reqs.length > 0) {
            setWfhRequests(reqs);
          }
        } catch (error) {
          console.error('[WFH] Auto-refresh error:', error);
        }
      }, 5000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [attendanceMode, isVerified, todayWfhRequest, verifiedEmployee, offline]);

  // Camera countdown and auto-capture
  useEffect(() => {
    let timer;
    if (showCamera && countdown > 0) {
      timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
    } else if (showCamera && countdown === 0 && !isCapturing) {
      capturePhoto();
    }
    return () => clearTimeout(timer);
  }, [showCamera, countdown, isCapturing]);

  const openCamera = async (type) => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        showToastMessage('Camera permission is required');
        return false;
      }
    }
    setCameraType(type);
    setCountdown(3);
    setIsCapturing(false);
    setShowCamera(true);
    return true;
  };

  const closeCamera = () => {
    setShowCamera(false);
    setCountdown(3);
    setIsCapturing(false);
  };

  const capturePhoto = async () => {
    if (isCapturing || !cameraRef.current) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        base64: true,
      });

      console.log('[Attendance] Photo captured, size:', photo.base64?.length);
      closeCamera();

      // Proceed with check-in or check-out
      if (cameraType === 'check_in') {
        if (attendanceMode === 'wfh') {
          await processWfhCheckIn(photo.base64);
        } else {
          await processCheckIn(photo.base64);
        }
      } else {
        if (attendanceMode === 'wfh') {
          await processWfhCheckOut(photo.base64);
        } else {
          await processCheckOut(photo.base64);
        }
      }
    } catch (error) {
      console.error('Photo capture error:', error);
      showToastMessage('Failed to capture photo');
      closeCamera();
      setLoading(false);
    }
  };

  const loadTodayAttendanceForEmployee = async (employeeId, employeeName) => {
    try {
      const attendance = await getTodayAttendanceByEmployeeId(employeeId, employeeName);
      setTodayAttendance(attendance);
    } catch (error) {
      console.error('Failed to load attendance:', error);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const formatTimeOnly = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // =============================================
  // FINGERPRINT SCAN
  // =============================================
  const handleFingerprintScan = async () => {
    if (!deviceId) {
      showToastMessage('Device ID not available. Please restart the app.');
      return;
    }

    setLoading(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        showToastMessage('Biometric hardware not available on this device');
        setLoading(false);
        return;
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        showToastMessage('No fingerprint enrolled. Please set up in device settings.');
        setLoading(false);
        return;
      }

      const authResult = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Scan fingerprint for attendance',
        fallbackLabel: 'Use device PIN',
        disableDeviceFallback: false,
      });

      if (!authResult.success) {
        showToastMessage('Authentication failed');
        setLoading(false);
        return;
      }

      console.log('[Attendance] Fingerprint authenticated, looking up device ID:', deviceId);
      const result = await getEmployeeByDeviceId(deviceId);

      if (result.success) {
        setIsVerified(true);
        setVerifiedEmployee(result.employee);
        setVerificationMethod('fingerprint');
        showToastMessage(`Welcome, ${result.employee.name}!`);

        // Fire-and-forget: prime the workplace cache for offline use.
        if (attendanceMode === 'office') {
          const uidForWp = result.employee.userId || currentUser?.uid;
          if (uidForWp) {
            getWorkplaceLocation(uidForWp).catch(() => {});
          }
          await loadTodayAttendanceForEmployee(result.employee.id, result.employee.name);
        } else if (attendanceMode === 'wfh') {
          // Check if there's an approved WFH request for today
          const userId = result.employee.userId || currentUser?.uid;
          if (userId) {
            const wfhReq = await getTodayApprovedWfh(userId);
            setTodayWfhRequest(wfhReq);
            // Also load WFH request history
            const requests = await getMyWfhRequests(userId);
            setWfhRequests(requests);  
          }
        }
      } else {
        showToastMessage(result.error || 'No employee found for this device');
      }
    } catch (error) {
      console.error('Fingerprint auth error:', error);
      showToastMessage('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // =============================================
  // PIN VERIFICATION
  // =============================================
  const handlePinVerify = async () => {
    if (!pinInput.trim()) {
      showToastMessage('Please enter your PIN');
      return;
    }

    setLoading(true);
    try {
      const userId = currentUser?.uid;
      const result = await verifyEmployeePin(userId, pinInput.trim());

      if (result.success) {
        setIsVerified(true);
        setVerifiedEmployee(result.employee);
        setVerificationMethod('pin');
        setPinInput('');
        showToastMessage(`Welcome, ${result.employee.name}!`);

        // Fire-and-forget: prime the workplace cache so offline check-in
        // works without requiring a prior full online check-in. Errors are
        // ignored — if it fails (offline), we'll just rely on whatever
        // workplace was cached the last time it succeeded.
        if (attendanceMode === 'office') {
          const uidForWp = result.employee.userId || currentUser?.uid;
          if (uidForWp) {
            getWorkplaceLocation(uidForWp).catch(() => {});
          }
          await loadTodayAttendanceForEmployee(result.employee.id, result.employee.name);
        } else if (attendanceMode === 'wfh') {
          const uid = result.employee.userId || currentUser?.uid;
          if (uid) {
            const wfhReq = await getTodayApprovedWfh(uid);
            setTodayWfhRequest(wfhReq);
            const requests = await getMyWfhRequests(uid);
            setWfhRequests(requests);
          }
        }
      } else {
        showToastMessage(result.error || 'Invalid PIN');
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      showToastMessage('PIN verification failed');
    } finally {
      setLoading(false);
    }
  };

  // =============================================
  // OFFICE CHECK-IN / CHECK-OUT
  // =============================================
  const handleCheckIn = async () => {
    if (!verifiedEmployee?.id) {
      showToastMessage('Please scan fingerprint first');
      return;
    }

    Alert.alert(
      'Confirm Check In',
      `Are you sure you want to check in at ${formatTimeOnly(new Date())}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            const cameraOpened = await openCamera('check_in');
            if (!cameraOpened) {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const processCheckIn = async (photoBase64) => {
    try {
      const locationResult = await verifyAttendanceLocation(verifiedEmployee.userId || currentUser?.uid, verifiedEmployee.id);

      if (!locationResult.success) {
        Alert.alert('Location Error', locationResult.error || 'Location verification failed');
        setLocationStatus({ verified: false, error: locationResult.error });
        setLoading(false);
        return;
      }

      if (!locationResult.withinRange) {
        Alert.alert('Out of Range', `You are ${locationResult.distance}m away from ${locationResult.workplaceName || 'workplace'}. Must be within ${locationResult.threshold}m.`);
        setLocationStatus({
          verified: false,
          distance: locationResult.distance,
          threshold: locationResult.threshold,
          workplaceName: locationResult.workplaceName,
        });
        setLoading(false);
        return;
      }

      setLocationStatus({
        verified: true,
        distance: locationResult.distance,
        workplaceName: locationResult.workplaceName,
      });

      const result = await checkInByEmployeeId(verifiedEmployee.id, verifiedEmployee.name);
      if (result.success && result.offline) {
        // Offline path — record was queued locally; will flush when online.
        // Skip photo upload (no server id yet) and skip the late-check query
        // (which would also fail offline). Still update local UI so the user
        // sees themselves as checked in.
        showToastMessage('Saved offline. Will sync when online.');
        const offlineAttendance = {
          id: null,
          checkIn: result.checkInTime,
          checkOut: null,
          employeeName: result.employeeName,
          offline: true,
          // Store the queue item id + raw UTC check-in time so the check-out
          // flow can replace this entry with a combined create record.
          offlineQueueId: result.localId || null,
          checkInTimeUtc: result.checkInTimeUtc || null,
        };
        setTodayAttendance(offlineAttendance);
        // Persist to the same cache key that getTodayAttendanceByEmployeeId
        // reads on re-entry. This way if the user leaves and comes back while
        // still offline, the screen will show Check Out instead of Check In.
        try {
          const empId = verifiedEmployee?.id;
          if (empId) {
            await AsyncStorage.setItem(
              `@attCache:todayAtt:${empId}`,
              JSON.stringify(offlineAttendance),
            );
          }
        } catch (_) { /* ignore */ }
      } else if (result.success) {
        if (photoBase64) {
          const uploadResult = await uploadAttendancePhoto(result.attendanceId, photoBase64, 'check_in');
          if (uploadResult.success) {
            console.log('[Attendance] Check-in photo uploaded successfully');
          }
        }

        showToastMessage('Check-in successful!');
        setTodayAttendance({
          id: result.attendanceId,
          checkIn: result.checkInTime,
          checkOut: null,
          employeeName: result.employeeName,
        });

        // Check if employee is late and prompt for reason
        try {
          const lateResult = await getTodayAttendanceWithLateInfo(verifiedEmployee.id);
          if (lateResult.success && lateResult.records.length > 0) {
            const firstCheckin = lateResult.records.find(r => r.isFirstCheckinOfDay);
            if (firstCheckin && firstCheckin.isLate) {
              setLateInfo({
                isLate: true,
                lateMinutes: firstCheckin.lateMinutes,
                lateMinutesDisplay: firstCheckin.lateMinutesDisplay,
                lateSequence: firstCheckin.lateSequence,
                deductionAmount: firstCheckin.deductionAmount,
              });
              setPendingLateAttendanceId(firstCheckin.id);
              setShowLateReasonModal(true);
            }
          }
        } catch (lateErr) {
          console.log('[Attendance] Late check skipped:', lateErr?.message);
        }
      } else {
        Alert.alert('Check-in Failed', result.error || 'Check-in failed');
      }
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Check-in Error', error?.message || 'Failed to check in');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    // Allow check-out when we have a server ID OR an offline check-in (id=null but offline=true)
    if (!todayAttendance?.id && !todayAttendance?.offline) {
      showToastMessage('No check-in record found');
      return;
    }

    if (!verifiedEmployee?.id) {
      showToastMessage('Please scan fingerprint first');
      return;
    }

    Alert.alert(
      'Confirm Check Out',
      `Are you sure you want to check out at ${formatTimeOnly(new Date())}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            // Only require fingerprint re-auth if originally verified by fingerprint
            if (verificationMethod === 'fingerprint') {
              try {
                const authResult = await LocalAuthentication.authenticateAsync({
                  promptMessage: 'Scan fingerprint to check out',
                  fallbackLabel: 'Use device PIN',
                  disableDeviceFallback: false,
                });

                if (!authResult.success) {
                  showToastMessage('Authentication failed');
                  return;
                }
              } catch (error) {
                console.error('Fingerprint re-auth error:', error);
                showToastMessage('Authentication failed');
                return;
              }
            }
            // PIN users already verified — no re-auth needed

            setLoading(true);
            const cameraOpened = await openCamera('check_out');
            if (!cameraOpened) {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const processCheckOut = async (photoBase64) => {
    try {
      // Skip location verification when offline (same as processCheckIn)
      if (!offline) {
        const locationResult = await verifyAttendanceLocation(verifiedEmployee.userId || currentUser?.uid, verifiedEmployee.id);

        if (!locationResult.success) {
          Alert.alert('Location Error', locationResult.error || 'Location verification failed');
          setLocationStatus({ verified: false, error: locationResult.error });
          setLoading(false);
          return;
        }

        if (!locationResult.withinRange) {
          Alert.alert('Out of Range', `You are ${locationResult.distance}m away from ${locationResult.workplaceName || 'workplace'}. Must be within ${locationResult.threshold}m.`);
          setLocationStatus({
            verified: false,
            distance: locationResult.distance,
            threshold: locationResult.threshold,
            workplaceName: locationResult.workplaceName,
          });
          setLoading(false);
          return;
        }

        setLocationStatus({
          verified: true,
          distance: locationResult.distance,
          workplaceName: locationResult.workplaceName,
        });
      }

      // If the check-in was done offline (no server attendance ID), replace
      // the check-in queue entry with a single combined create that has BOTH
      // check_in and check_out. The Odoo offline_sync module only supports
      // 'create' and 'method' operations — a combined create is the cleanest
      // way to land a complete attendance record in one shot.
      if (todayAttendance?.offline && !todayAttendance?.id) {
        const now = new Date();
        const checkOutTimeUtc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')} ${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`;

        const offlineQueue = require('@utils/offlineQueue').default;

        // Remove the original check-in-only queue entry (if it hasn't synced yet)
        if (todayAttendance.offlineQueueId) {
          await offlineQueue.removeById(todayAttendance.offlineQueueId);
        }

        // Enqueue a single combined create with both check_in + check_out
        await offlineQueue.enqueue({
          model: 'hr.attendance',
          operation: 'create',
          values: {
            employee_id: verifiedEmployee.id,
            check_in: todayAttendance.checkInTimeUtc || checkOutTimeUtc,
            check_out: checkOutTimeUtc,
          },
        });

        const displayTime = now.toLocaleTimeString('en-US', {
          hour: '2-digit', minute: '2-digit', hour12: true,
        });

        showToastMessage('Check-out saved offline. Will sync when online.');
        // Show "All Done" for this session so the user sees the confirmation
        setTodayAttendance({
          ...todayAttendance,
          checkOut: displayTime,
          offline: true,
        });
        // Clear the cache so next re-entry shows Check In (allows multiple
        // check-in/check-out cycles per day, e.g. lunch break)
        try {
          const empId = verifiedEmployee?.id;
          if (empId) {
            await AsyncStorage.setItem(
              `@attCache:todayAtt:${empId}`,
              JSON.stringify(null),
            );
          }
        } catch (_) { /* ignore */ }
        setLoading(false);
        return;
      }

      const result = await checkOutToOdoo(todayAttendance.id);
      if (result.success) {
        if (photoBase64) {
          const uploadResult = await uploadAttendancePhoto(todayAttendance.id, photoBase64, 'check_out');
          if (uploadResult.success) {
            console.log('[Attendance] Check-out photo uploaded successfully');
          }
        }

        showToastMessage('Check-out successful!');
        // Keep the record visible in this session — show the checkout time in the box.
        // The whole record is cleared when the user leaves the screen via handleBackPress.
        setTodayAttendance((prev) => prev ? { ...prev, checkOut: result.checkOutTime } : prev);
      } else {
        Alert.alert('Check-out Failed', result.error || 'Check-out failed');
      }
    } catch (error) {
      console.error('Check-out error:', error);
      Alert.alert('Check-out Error', error?.message || 'Failed to check out');
    } finally {
      setLoading(false);
    }
  };

  // =============================================
  // WFH REQUEST SUBMIT
  // =============================================
  const handleWfhSubmit = async () => {
    if (!wfhReason.trim()) {
      showToastMessage('Please enter a reason for WFH');
      return;
    }

    const userId = verifiedEmployee?.userId || currentUser?.uid;
    if (!userId) {
      showToastMessage('User ID not available');
      return;
    }

    Alert.alert(
      'Submit WFH Request',
      `Submit work from home request for today?\n\nReason: ${wfhReason.trim()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setLoading(true);
            const today = getTodayDateString();
            const result = await submitWfhRequest(userId, today, wfhReason.trim());

            if (result.success) {
              showToastMessage('WFH request submitted for approval!');
              setWfhReason('');
              // Refresh requests list
              const requests = await getMyWfhRequests(userId);
              setWfhRequests(requests);
            } else {
              showToastMessage(result.error || 'Failed to submit WFH request');
            }
            setLoading(false);
          },
        },
      ]
    );
  };

  // =============================================
  // WFH CHECK-IN / CHECK-OUT
  // =============================================
  const handleWfhCheckIn = async () => {
    if (!todayWfhRequest?.id) {
      showToastMessage('No approved WFH request found');
      return;
    }

    Alert.alert(
      'WFH Check In',
      `Check in for Work From Home at ${formatTimeOnly(new Date())}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            try {
              const result = await wfhCheckIn(todayWfhRequest.id);
              if (result.success) {
                showToastMessage('WFH Check-in successful!');
                setTodayWfhRequest({
                  ...todayWfhRequest,
                  state: 'checked_in',
                  checkIn: result.checkInTime,
                });
              } else {
                showToastMessage(result.error || 'WFH check-in failed');
              }
            } catch (error) {
              console.error('WFH check-in error:', error);
              showToastMessage('Failed to check in');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleWfhCheckOut = async () => {
    if (!todayWfhRequest?.id) {
      showToastMessage('No WFH check-in found');
      return;
    }

    Alert.alert(
      'WFH Check Out',
      `Check out from Work From Home at ${formatTimeOnly(new Date())}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: 'destructive',
          onPress: async () => {
            // Only require fingerprint re-auth if originally verified by fingerprint
            if (verificationMethod === 'fingerprint') {
              try {
                const authResult = await LocalAuthentication.authenticateAsync({
                  promptMessage: 'Scan fingerprint to check out',
                  fallbackLabel: 'Use device PIN',
                  disableDeviceFallback: false,
                });

                if (!authResult.success) {
                  showToastMessage('Authentication failed');
                  return;
                }
              } catch (error) {
                showToastMessage('Authentication failed');
                return;
              }
            }

            setLoading(true);
            try {
              const result = await wfhCheckOut(todayWfhRequest.id);
              if (result.success) {
                showToastMessage('WFH Check-out successful!');
                setTodayWfhRequest({
                  ...todayWfhRequest,
                  state: 'checked_out',
                  checkOut: result.checkOutTime,
                });
              } else {
                showToastMessage(result.error || 'WFH check-out failed');
              }
            } catch (error) {
              console.error('WFH check-out error:', error);
              showToastMessage('Failed to check out');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // =============================================
  // HELPERS
  // =============================================
  const userName = verifiedEmployee?.name || currentUser?.name || currentUser?.user_name || currentUser?.login || 'User';
  const hasCheckedIn = todayAttendance && !todayAttendance.checkOut;
  const hasCheckedOut = !!(todayAttendance && todayAttendance.checkOut);

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Convert late minutes to "Hh Mm" format matching the Odoo module's minutes_to_hm.
  // Examples: 30 -> "30m", 60 -> "1h 00m", 90 -> "1h 30m", 145 -> "2h 25m"
  const formatLateDuration = (minutes, preformatted) => {
    // Prefer the server-formatted value (H:MM) if present, but display it as "Xh YYm".
    if (preformatted && typeof preformatted === 'string' && preformatted.includes(':')) {
      const [h, m] = preformatted.split(':');
      const hh = parseInt(h, 10) || 0;
      const mm = parseInt(m, 10) || 0;
      if (hh <= 0) return `${mm}m`;
      return `${hh}h ${String(mm).padStart(2, '0')}m`;
    }
    const total = parseInt(minutes, 10) || 0;
    if (total <= 0) return '0m';
    const hh = Math.floor(total / 60);
    const mm = total % 60;
    if (hh <= 0) return `${mm}m`;
    return `${hh}h ${String(mm).padStart(2, '0')}m`;
  };

  const getStateLabel = (state) => {
    const labels = {
      draft: 'Draft',
      pending: 'Pending Approval',
      approved: 'Approved',
      rejected: 'Rejected',
      checked_in: 'Checked In',
      checked_out: 'Checked Out',
      cancelled: 'Cancelled',
      expired: 'Expired',
    };
    return labels[state] || state;
  };

  const getStateColor = (state) => {
    const colors = {
      draft: '#9E9E9E',
      pending: '#FF9800',
      approved: '#4CAF50',
      rejected: '#F44336',
      checked_in: '#2196F3',
      checked_out: '#4CAF50',
      cancelled: '#9E9E9E',
      expired: '#9E9E9E',
    };
    return colors[state] || '#9E9E9E';
  };

  const handleBackPress = () => {
    if (attendanceMode && !isVerified) {
      setAttendanceMode(null);
    } else if (attendanceMode && isVerified) {
      setIsVerified(false);
      setVerifiedEmployee(null);
      setVerificationMethod(null);
      setTodayAttendance(null);
      setTodayWfhRequest(null);
      setLocationStatus(null);
      setAttendanceMode(null);
    } else {
      navigation.goBack();
    }
  };

  // =============================================
  // RENDER: MODE SELECTION
  // =============================================
  const renderModeSelection = () => (
    <View style={styles.modeSelectionContainer}>
      <Text style={styles.modeTitle}>Select Attendance Type</Text>
      <Text style={styles.modeSubtitle}>How are you working today?</Text>

      <TouchableOpacity
        style={styles.modeCard}
        onPress={() => setAttendanceMode('office')}
        activeOpacity={0.8}
      >
        <View style={[styles.modeIconContainer, { backgroundColor: '#E8F5E9' }]}>
          <MaterialIcons name="business" size={scale(32)} color="#4CAF50" />
        </View>
        <View style={styles.modeTextContainer}>
          <Text style={styles.modeCardTitle}>Office</Text>
          <Text style={styles.modeCardSubtitle}>Check in from office with location verification</Text>
        </View>
        <Feather name="chevron-right" size={scale(20)} color={COLORS.gray} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.modeCard}
        onPress={() => setAttendanceMode('leave')}
        activeOpacity={0.8}
      >
        <View style={[styles.modeIconContainer, { backgroundColor: '#FFF3E0' }]}>
          <MaterialIcons name="event-busy" size={scale(32)} color="#FF9800" />
        </View>
        <View style={styles.modeTextContainer}>
          <Text style={styles.modeCardTitle}>Leave Request</Text>
          <Text style={styles.modeCardSubtitle}>Apply for leave with manager approval</Text>
        </View>
        <Feather name="chevron-right" size={scale(20)} color={COLORS.gray} />
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.modeCard}
        onPress={() => setAttendanceMode('waiver')}
        activeOpacity={0.8}
      >
        <View style={[styles.modeIconContainer, { backgroundColor: '#F3E5F5' }]}>
          <MaterialIcons name="gavel" size={scale(32)} color="#9C27B0" />
        </View>
        <View style={styles.modeTextContainer}>
          <Text style={styles.modeCardTitle}>Late Waiver Request</Text>
          <Text style={styles.modeCardSubtitle}>Request waiver for a late arrival deduction</Text>
        </View>
        <Feather name="chevron-right" size={scale(20)} color={COLORS.gray} />
      </TouchableOpacity>
    </View>
  );

  // =============================================
  // RENDER: WFH SECTION (after fingerprint)
  // =============================================
  const renderWfhSection = () => {
    const wfhCheckedIn = todayWfhRequest?.state === 'checked_in';
    const wfhCheckedOut = todayWfhRequest?.state === 'checked_out';
    const wfhApproved = todayWfhRequest?.state === 'approved';

    return (
      <View style={styles.detailsSection}>
        {/* Greeting Card */}
        <View style={styles.greetingCard}>
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: '#2196F3' }]}>
              <Text style={styles.avatarText}>
                {userName.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={[styles.statusDot, { backgroundColor: '#2196F3' }]} />
          </View>
          <View style={styles.greetingTextContainer}>
            <Text style={styles.greetingText}>{getGreeting()}</Text>
            <Text style={styles.userNameText}>{userName}</Text>
          </View>
          <View style={styles.wfhBadge}>
            <Text style={styles.wfhBadgeText}>WFH</Text>
          </View>
        </View>

        {/* If approved WFH exists — show check-in/check-out */}
        {(wfhApproved || wfhCheckedIn || wfhCheckedOut) ? (
          <>
            {/* Status Cards */}
            <View style={styles.statusCardsContainer}>
              <View style={[styles.statusCard, todayWfhRequest?.checkIn ? styles.statusCardActive : styles.statusCardInactive]}>
                <View style={[styles.statusIconContainer, { backgroundColor: todayWfhRequest?.checkIn ? '#E8F5E9' : '#F5F5F5' }]}>
                  <MaterialIcons name="login" size={scale(20)} color={todayWfhRequest?.checkIn ? '#4CAF50' : COLORS.gray} />
                </View>
                <Text style={styles.statusCardLabel}>Check In</Text>
                <Text style={[styles.statusCardValue, todayWfhRequest?.checkIn && { color: '#4CAF50' }]}>
                  {todayWfhRequest?.checkIn || '--:--'}
                </Text>
              </View>

              <View style={[styles.statusCard, todayWfhRequest?.checkOut ? styles.statusCardActive : styles.statusCardInactive]}>
                <View style={[styles.statusIconContainer, { backgroundColor: todayWfhRequest?.checkOut ? '#FFEBEE' : '#F5F5F5' }]}>
                  <MaterialIcons name="logout" size={scale(20)} color={todayWfhRequest?.checkOut ? '#F44336' : COLORS.gray} />
                </View>
                <Text style={styles.statusCardLabel}>Check Out</Text>
                <Text style={[styles.statusCardValue, todayWfhRequest?.checkOut && { color: '#F44336' }]}>
                  {todayWfhRequest?.checkOut || '--:--'}
                </Text>
              </View>
            </View>

            {/* WFH Location info */}
            <View style={[styles.locationStatusCard, styles.locationVerified]}>
              <View style={styles.locationIconContainer}>
                <MaterialIcons name="home" size={scale(20)} color="#2196F3" />
              </View>
              <View style={styles.locationTextContainer}>
                <Text style={styles.locationStatusTitle}>Work From Home</Text>
                <Text style={styles.locationStatusSubtitle}>Location verification not required</Text>
              </View>
            </View>

            {/* Current Time */}
            <View style={styles.currentTimeCard}>
              <Feather name="clock" size={scale(16)} color="#2196F3" />
              <Text style={styles.currentTimeLabel}>Current Time:</Text>
              <Text style={[styles.currentTimeValue, { color: '#2196F3' }]}>{formatTimeOnly(currentTime)}</Text>
            </View>

            {/* Action Buttons */}
            <View style={styles.buttonContainer}>
              {wfhApproved && (
                <TouchableOpacity
                  style={[styles.checkInButton, { backgroundColor: '#2196F3', shadowColor: '#2196F3' }]}
                  onPress={handleWfhCheckIn}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.buttonIconContainer}>
                    <MaterialIcons name="home" size={scale(22)} color={COLORS.white} />
                  </View>
                  <View style={styles.buttonTextContainer}>
                    <Text style={styles.buttonTitle}>WFH Check In</Text>
                    <Text style={styles.buttonSubtitle}>Start your work from home day</Text>
                  </View>
                  <Feather name="chevron-right" size={scale(20)} color={COLORS.white} />
                </TouchableOpacity>
              )}

              {wfhCheckedIn && (
                <TouchableOpacity
                  style={[styles.checkOutButton, { backgroundColor: '#F44336' }]}
                  onPress={handleWfhCheckOut}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <View style={styles.buttonIconContainer}>
                    <MaterialIcons name="home" size={scale(22)} color={COLORS.white} />
                  </View>
                  <View style={styles.buttonTextContainer}>
                    <Text style={styles.buttonTitle}>WFH Check Out</Text>
                    <Text style={styles.buttonSubtitle}>End your work from home day</Text>
                  </View>
                  <Feather name="chevron-right" size={scale(20)} color={COLORS.white} />
                </TouchableOpacity>
              )}

              {wfhCheckedOut && (
                <View style={styles.completedContainer}>
                  <View style={styles.completedIconContainer}>
                    <Ionicons name="checkmark-circle" size={scale(36)} color="#4CAF50" />
                  </View>
                  <Text style={styles.completedTitle}>All Done!</Text>
                  <Text style={styles.completedText}>Your WFH attendance is complete for today</Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <>
            {/* No approved WFH — show request form */}
            <View style={styles.wfhFormCard}>
              <Text style={styles.wfhFormTitle}>Request Work From Home</Text>
              <Text style={styles.wfhFormSubtitle}>Submit a request for manager approval</Text>

              <View style={styles.wfhDateRow}>
                <MaterialIcons name="event" size={scale(18)} color={COLORS.primaryThemeColor} />
                <Text style={styles.wfhDateText}>Date: {formatDate(currentTime)}</Text>
              </View>

              <Text style={styles.wfhInputLabel}>Reason *</Text>
              <TextInput
                style={styles.wfhReasonInput}
                placeholder="Why do you need to work from home?"
                placeholderTextColor={COLORS.gray}
                value={wfhReason}
                onChangeText={setWfhReason}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />

              <TouchableOpacity
                style={styles.wfhSubmitButton}
                onPress={handleWfhSubmit}
                disabled={loading || !wfhReason.trim()}
                activeOpacity={0.8}
              >
                <MaterialIcons name="send" size={scale(18)} color={COLORS.white} />
                <Text style={styles.wfhSubmitText}>Submit Request</Text>
              </TouchableOpacity>
            </View>

            {/* WFH Request History */}
            {wfhRequests.length > 0 && (
              <View style={styles.wfhHistoryCard}>
                <Text style={styles.wfhHistoryTitle}>Recent Requests</Text>
                {wfhRequests.slice(0, 5).map((req) => (
                  <View key={req.id} style={styles.wfhHistoryItem}>
                    <View style={styles.wfhHistoryLeft}>
                      <Text style={styles.wfhHistoryDate}>{req.requestDate}</Text>
                      <Text style={styles.wfhHistoryReason} numberOfLines={1}>{req.reason}</Text>
                    </View>
                    <View style={[styles.wfhStatusBadge, { backgroundColor: getStateColor(req.state) + '20' }]}>
                      <Text style={[styles.wfhStatusText, { color: getStateColor(req.state) }]}>
                        {getStateLabel(req.state)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </View>
    );
  };

  // =============================================
  // RENDER: LEAVE REQUEST SECTION
  // =============================================
  const LEAVE_TYPES = [
    { value: 'sick', label: 'Sick Leave', icon: 'local-hospital', color: '#E74C3C' },
    { value: 'casual', label: 'Casual Leave', icon: 'event-available', color: '#FF9800' },
    { value: 'annual', label: 'Annual Leave', icon: 'beach-access', color: '#2196F3' },
    { value: 'personal', label: 'Personal Leave', icon: 'person', color: '#9C27B0' },
    { value: 'emergency', label: 'Emergency Leave', icon: 'warning', color: '#F44336' },
    { value: 'other', label: 'Other', icon: 'more-horiz', color: '#607D8B' },
  ];

  const fetchLeaveHistory = async () => {
    const uid = verifiedEmployee?.userId || currentUser?.uid;
    const empId = verifiedEmployee?.id || null;
    if (!uid && !empId) return;
    const requests = await getMyLeaveRequests(uid, empId);
    setLeaveRequests(requests);
  };

  const formatLeaveDate = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Imperative date picker openers — bypass show/hide state bugs on Android.
  // The OS dialog only fires onChange once per interaction so the picked date
  // never gets clobbered by a stray dismiss event.
  const openLeaveFromPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: leaveFromDate || new Date(),
        mode: 'date',
        minimumDate: new Date(),
        onChange: (event, date) => {
          if (event?.type === 'set' && date instanceof Date) {
            setLeaveFromDate(date);
            if (leaveToDate && date > leaveToDate) setLeaveToDate(null);
          }
        },
      });
    } else {
      setShowLeaveFromPicker(true);
    }
  };

  const openLeaveToPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: leaveToDate || leaveFromDate || new Date(),
        mode: 'date',
        minimumDate: leaveFromDate || new Date(),
        onChange: (event, date) => {
          if (event?.type === 'set' && date instanceof Date) {
            setLeaveToDate(date);
          }
        },
      });
    } else {
      setShowLeaveToPicker(true);
    }
  };

  const formatLeaveDateForOdoo = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const getLeaveStateColor = (state) => {
    switch (state) {
      case 'draft': return '#9E9E9E';
      case 'pending': return '#FF9800';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      case 'cancelled': return '#9E9E9E';
      default: return '#9E9E9E';
    }
  };

  const getLeaveStateLabel = (state) => {
    switch (state) { case 'draft': return 'Draft'; case 'pending': return 'Pending'; case 'approved': return 'Approved'; case 'rejected': return 'Rejected'; case 'cancelled': return 'Cancelled'; default: return state; }
  };

  const handleLeaveSubmit = () => {
    if (!leaveReason.trim()) {
      showToastMessage('Please enter a reason for leave');
      return;
    }
    const fromStr = formatLeaveDateForOdoo(leaveFromDate);
    const toStr = leaveToDate ? formatLeaveDateForOdoo(leaveToDate) : null;
    const typeLabel = LEAVE_TYPES.find(t => t.value === leaveType)?.label || leaveType;

    Alert.alert(
      'Submit Leave Request',
      `Type: ${typeLabel}\nFrom: ${formatLeaveDate(leaveFromDate)}\n${leaveToDate ? `To: ${formatLeaveDate(leaveToDate)}` : '(Single day)'}\n\nReason: ${leaveReason.trim()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setLoading(true);
            try {
              const uid = verifiedEmployee?.userId || currentUser?.uid;
              const empId = verifiedEmployee?.id || null;
              const result = await submitLeaveRequest(uid, leaveType, fromStr, isHalfDay ? null : toStr, leaveReason.trim(), empId, isHalfDay);
              if (result.success) {
                showToastMessage('Leave request submitted for approval!');
                setLeaveReason('');
                setLeaveToDate(null);
                setLeaveFromDate(new Date());
                setLeaveType('casual');
                setIsHalfDay(false);
                await fetchLeaveHistory();
                setLeaveTab('history');
              } else {
                Alert.alert('Error', result.error || 'Failed to submit');
              }
            } catch (error) {
              Alert.alert('Error', error?.message || 'Failed to submit');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleLeaveCancel = (requestId) => {
    Alert.alert('Cancel Leave', 'Are you sure?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes', style: 'destructive',
        onPress: async () => {
          setLoading(true);
          const result = await cancelLeaveRequest(requestId);
          if (result.success) { showToastMessage('Cancelled'); await fetchLeaveHistory(); }
          else { showToastMessage(result.error || 'Failed'); }
          setLoading(false);
        },
      },
    ]);
  };

  const renderLeaveSection = () => (
    <View style={{ flex: 1 }}>
      {/* Tab Bar */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: scale(8) }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: scale(10), gap: scale(4), borderBottomWidth: leaveTab === 'form' ? 2 : 0, borderBottomColor: '#FF9800' }}
          onPress={() => setLeaveTab('form')}
        >
          <MaterialIcons name="add-circle-outline" size={scale(16)} color={leaveTab === 'form' ? '#FF9800' : '#999'} />
          <Text style={{ fontSize: scale(12), fontFamily: leaveTab === 'form' ? FONT_FAMILY.urbanistBold : FONT_FAMILY.urbanistMedium, color: leaveTab === 'form' ? '#FF9800' : '#999' }}>New Request</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: scale(10), gap: scale(4), borderBottomWidth: leaveTab === 'history' ? 2 : 0, borderBottomColor: '#FF9800' }}
          onPress={() => { setLeaveTab('history'); fetchLeaveHistory(); }}
        >
          <MaterialIcons name="history" size={scale(16)} color={leaveTab === 'history' ? '#FF9800' : '#999'} />
          <Text style={{ fontSize: scale(12), fontFamily: leaveTab === 'history' ? FONT_FAMILY.urbanistBold : FONT_FAMILY.urbanistMedium, color: leaveTab === 'history' ? '#FF9800' : '#999' }}>My Requests</Text>
        </TouchableOpacity>
      </View>

      {leaveTab === 'form' ? (
        <View style={{ paddingHorizontal: scale(4) }}>
          {/* Leave Type */}
          <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: scale(6) }}>Leave Type *</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: scale(6), marginBottom: scale(10) }}>
            {LEAVE_TYPES.map(type => (
              <TouchableOpacity
                key={type.value}
                style={{
                  flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(10), paddingVertical: scale(6),
                  borderRadius: scale(16), borderWidth: 1, gap: scale(4),
                  borderColor: leaveType === type.value ? type.color : '#E0E0E0',
                  backgroundColor: leaveType === type.value ? type.color + '20' : '#FAFAFA',
                }}
                onPress={() => setLeaveType(type.value)}
              >
                <MaterialIcons name={type.icon} size={scale(14)} color={leaveType === type.value ? type.color : '#999'} />
                <Text style={{ fontSize: scale(11), fontFamily: leaveType === type.value ? FONT_FAMILY.urbanistBold : FONT_FAMILY.urbanistMedium, color: leaveType === type.value ? type.color : '#666' }}>{type.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* From Date */}
          <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: scale(6) }}>From Date *</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(10), gap: scale(8), marginBottom: scale(10) }}
            onPress={openLeaveFromPicker}
          >
            <MaterialIcons name="event" size={scale(18)} color="#FF9800" />
            <Text style={{ flex: 1, fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistMedium, color: '#333' }}>{formatLeaveDate(leaveFromDate)}</Text>
            <MaterialIcons name="arrow-drop-down" size={scale(18)} color="#999" />
          </TouchableOpacity>
          {Platform.OS === 'ios' && showLeaveFromPicker && (
            <DateTimePicker
              value={leaveFromDate || new Date()}
              mode="date"
              display="inline"
              minimumDate={new Date()}
              onChange={(event, date) => {
                if (event?.type === 'set' && date instanceof Date) {
                  setLeaveFromDate(date);
                  if (leaveToDate && date > leaveToDate) setLeaveToDate(null);
                  setShowLeaveFromPicker(false);
                } else if (event?.type === 'dismissed') {
                  setShowLeaveFromPicker(false);
                }
              }}
            />
          )}

          {/* Half Day Toggle */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isHalfDay ? '#FFF3E0' : '#fff', borderWidth: 1, borderColor: isHalfDay ? '#FF9800' : '#E0E0E0', borderRadius: scale(10), padding: scale(12), gap: scale(10), marginBottom: scale(10) }}
            onPress={() => { setIsHalfDay(!isHalfDay); if (!isHalfDay) setLeaveToDate(null); }}
          >
            <MaterialIcons name={isHalfDay ? 'check-box' : 'check-box-outline-blank'} size={scale(22)} color={isHalfDay ? '#FF9800' : '#999'} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: isHalfDay ? '#FF9800' : '#333' }}>Half Day Leave</Text>
              <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#888' }}>Apply for 0.5 day leave</Text>
            </View>
          </TouchableOpacity>

          {/* To Date (hidden when half day) */}
          {!isHalfDay && (
          <>
          <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: scale(6) }}>To Date (optional)</Text>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(10), gap: scale(8), marginBottom: scale(6) }}
            onPress={openLeaveToPicker}
          >
            <MaterialIcons name="event" size={scale(18)} color={leaveToDate ? '#FF9800' : '#CCC'} />
            <Text style={{ flex: 1, fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistMedium, color: leaveToDate ? '#333' : '#999' }}>{leaveToDate ? formatLeaveDate(leaveToDate) : 'Single day leave'}</Text>
            {leaveToDate && (
              <TouchableOpacity onPress={() => setLeaveToDate(null)} style={{ marginRight: scale(4) }}>
                <MaterialIcons name="close" size={scale(16)} color="#999" />
              </TouchableOpacity>
            )}
            <MaterialIcons name="arrow-drop-down" size={scale(18)} color="#999" />
          </TouchableOpacity>
          {Platform.OS === 'ios' && showLeaveToPicker && (
            <DateTimePicker
              value={leaveToDate || leaveFromDate || new Date()}
              mode="date"
              display="inline"
              minimumDate={leaveFromDate || new Date()}
              onChange={(event, date) => {
                if (event?.type === 'set' && date instanceof Date) {
                  setLeaveToDate(date);
                  setShowLeaveToPicker(false);
                } else if (event?.type === 'dismissed') {
                  setShowLeaveToPicker(false);
                }
              }}
            />
          )}
          </>
          )}

          {/* Days count */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3E0', borderRadius: scale(8), padding: scale(8), gap: scale(6), marginBottom: scale(10) }}>
            <MaterialIcons name="date-range" size={scale(16)} color="#FF9800" />
            <Text style={{ fontSize: scale(12), fontFamily: FONT_FAMILY.urbanistBold, color: '#FF9800' }}>
              {isHalfDay ? '0.5 day' : leaveToDate && leaveToDate >= leaveFromDate ? `${Math.ceil((leaveToDate - leaveFromDate) / (1000 * 60 * 60 * 24)) + 1} day(s)` : '1 day'}
            </Text>
          </View>

          {/* Reason */}
          <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: scale(6) }}>Reason *</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(10), fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', backgroundColor: '#fff', minHeight: scale(80) }}
            placeholder="Enter the reason for your leave..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
            value={leaveReason}
            onChangeText={setLeaveReason}
            textAlignVertical="top"
          />

          {/* Submit */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: !leaveReason.trim() ? '#CCC' : '#FF9800', borderRadius: scale(10), padding: scale(12), marginTop: scale(12), gap: scale(6) }}
            disabled={!leaveReason.trim() || loading}
            onPress={handleLeaveSubmit}
          >
            <MaterialIcons name="send" size={scale(18)} color="#fff" />
            <Text style={{ fontSize: scale(14), fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' }}>Submit Request</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* History Tab */
        <View>
          {leaveRequests.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: scale(40) }}>
              <MaterialIcons name="event-available" size={scale(40)} color="#4CAF50" />
              <Text style={{ fontSize: scale(14), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginTop: scale(10) }}>No leave requests</Text>
            </View>
          ) : (
            leaveRequests.map(req => {
              const stateColor = getLeaveStateColor(req.state);
              const typeInfo = LEAVE_TYPES.find(t => t.value === req.leaveType);
              const canCancel = ['draft', 'pending', 'approved'].includes(req.state);
              return (
                <View key={req.id} style={{ backgroundColor: '#fff', borderRadius: scale(10), padding: scale(12), marginBottom: scale(8), elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: scale(8) }}>
                    <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: scale(10), backgroundColor: (typeInfo?.color || '#607D8B') + '20' }}>
                      <Text style={{ fontSize: scale(10), fontFamily: FONT_FAMILY.urbanistBold, color: typeInfo?.color || '#607D8B' }}>{typeInfo?.label || req.leaveType}</Text>
                    </View>
                    <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: scale(10), backgroundColor: stateColor + '20' }}>
                      <Text style={{ fontSize: scale(10), fontFamily: FONT_FAMILY.urbanistBold, color: stateColor }}>{getLeaveStateLabel(req.state)}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: '#FAFAFA', borderRadius: scale(6), padding: scale(8), gap: scale(4) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Feather name="calendar" size={scale(12)} color="#888" />
                      <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }}>
                        {formatLeaveDate(req.fromDate)}{req.toDate ? ` → ${formatLeaveDate(req.toDate)}` : ' (Single day)'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Feather name="clock" size={scale(12)} color="#888" />
                      <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }}>{req.numberOfDays} day(s)</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Feather name="file-text" size={scale(12)} color="#888" />
                      <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }} numberOfLines={2}>{req.reason}</Text>
                    </View>
                    {req.approvedBy ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                        <Feather name="user-check" size={scale(12)} color="#888" />
                        <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }}>By: {req.approvedBy}</Text>
                      </View>
                    ) : null}
                    {req.rejectionReason ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                        <Feather name="x-circle" size={scale(12)} color="#E74C3C" />
                        <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#E74C3C' }}>{req.rejectionReason}</Text>
                      </View>
                    ) : null}
                  </View>
                  {canCancel && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: scale(8), paddingTop: scale(6), borderTopWidth: 1, borderTopColor: '#F0F0F0', gap: scale(4) }}
                      onPress={() => handleLeaveCancel(req.id)}
                    >
                      <MaterialIcons name="cancel" size={scale(14)} color="#E74C3C" />
                      <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#E74C3C' }}>Cancel Request</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );

  // =============================================
  // WAIVER REQUEST: helpers, fetchers & handler
  // =============================================
  const fetchEligibleLateAttendances = async () => {
    const empId = verifiedEmployee?.id;
    if (!empId) return;
    const records = await getEligibleLateAttendances(empId);
    setEligibleLateAttendances(records);
  };

  const fetchWaiverRequests = async () => {
    const empId = verifiedEmployee?.id;
    if (!empId) return;
    const records = await getMyWaiverRequests(empId);
    setWaiverRequests(records);
  };

  const handleWaiverSubmit = () => {
    if (!selectedWaiverAttendanceId) {
      showToastMessage('Please select a late attendance record');
      return;
    }
    if (!waiverReason.trim()) {
      showToastMessage('Please enter a reason for the waiver');
      return;
    }
    const selected = eligibleLateAttendances.find(r => r.id === selectedWaiverAttendanceId);
    Alert.alert(
      'Submit Waiver Request',
      `Date: ${selected?.date || ''}\nLate: ${formatLateDuration(selected?.lateMinutes, selected?.lateMinutesDisplay)}\nDeduction: ${selected?.deductionAmount || 0}\n\nReason: ${waiverReason.trim()}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setLoading(true);
            try {
              const empId = verifiedEmployee?.id;
              const result = await submitWaiverRequest(empId, selectedWaiverAttendanceId, waiverReason.trim());
              if (result.success) {
                showToastMessage('Waiver request submitted for approval!');
                setWaiverReason('');
                setSelectedWaiverAttendanceId(null);
                await fetchWaiverRequests();
                await fetchEligibleLateAttendances();
                setWaiverTab('history');
              } else {
                Alert.alert('Error', result.error || 'Failed to submit');
              }
            } catch (error) {
              Alert.alert('Error', error?.message || 'Failed to submit');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  // Auto-fetch eligible records & waiver list when entering waiver mode
  useEffect(() => {
    if (attendanceMode === 'waiver' && isVerified && verifiedEmployee?.id) {
      fetchEligibleLateAttendances();
      fetchWaiverRequests();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceMode, isVerified, verifiedEmployee]);

  const getWaiverStateColor = (state) => {
    switch (state) {
      case 'draft': return '#9E9E9E';
      case 'pending': return '#FF9800';
      case 'approved': return '#4CAF50';
      case 'rejected': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getWaiverStateLabel = (state) => {
    switch (state) {
      case 'draft': return 'Draft';
      case 'pending': return 'Pending';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      default: return state;
    }
  };

  const renderWaiverSection = () => (
    <View style={{ flex: 1 }}>
      {/* Tab Bar */}
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', marginBottom: scale(8) }}>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: scale(10), gap: scale(4), borderBottomWidth: waiverTab === 'form' ? 2 : 0, borderBottomColor: '#9C27B0' }}
          onPress={() => { setWaiverTab('form'); fetchEligibleLateAttendances(); }}
        >
          <MaterialIcons name="add-circle-outline" size={scale(16)} color={waiverTab === 'form' ? '#9C27B0' : '#999'} />
          <Text style={{ fontSize: scale(12), fontFamily: waiverTab === 'form' ? FONT_FAMILY.urbanistBold : FONT_FAMILY.urbanistMedium, color: waiverTab === 'form' ? '#9C27B0' : '#999' }}>New Request</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: scale(10), gap: scale(4), borderBottomWidth: waiverTab === 'history' ? 2 : 0, borderBottomColor: '#9C27B0' }}
          onPress={() => { setWaiverTab('history'); fetchWaiverRequests(); }}
        >
          <MaterialIcons name="history" size={scale(16)} color={waiverTab === 'history' ? '#9C27B0' : '#999'} />
          <Text style={{ fontSize: scale(12), fontFamily: waiverTab === 'history' ? FONT_FAMILY.urbanistBold : FONT_FAMILY.urbanistMedium, color: waiverTab === 'history' ? '#9C27B0' : '#999' }}>My Requests</Text>
        </TouchableOpacity>
      </View>

      {waiverTab === 'form' ? (
        <View style={{ paddingHorizontal: scale(4) }}>
          <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: scale(6) }}>Select Late Attendance *</Text>
          <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#888', marginBottom: scale(8) }}>Last 30 days · only un-waived records</Text>

          {eligibleLateAttendances.length === 0 ? (
            <View style={{ alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: scale(10), padding: scale(20), marginBottom: scale(10) }}>
              <MaterialIcons name="check-circle" size={scale(36)} color="#4CAF50" />
              <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginTop: scale(8) }}>No late records found</Text>
              <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#888', marginTop: scale(4), textAlign: 'center' }}>You have no eligible late attendances to waive.</Text>
            </View>
          ) : (
            <View style={{ marginBottom: scale(10) }}>
              {eligibleLateAttendances.map(rec => {
                const isSelected = selectedWaiverAttendanceId === rec.id;
                const isDisabled = rec.isWaived;
                return (
                  <TouchableOpacity
                    key={rec.id}
                    disabled={isDisabled}
                    activeOpacity={0.7}
                    onPress={() => setSelectedWaiverAttendanceId(rec.id)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', backgroundColor: isSelected ? '#F3E5F5' : '#fff',
                      borderWidth: 1, borderColor: isSelected ? '#9C27B0' : '#E0E0E0',
                      borderRadius: scale(10), padding: scale(10), gap: scale(10), marginBottom: scale(6),
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                  >
                    <MaterialIcons name={isSelected ? 'radio-button-checked' : 'radio-button-unchecked'} size={scale(20)} color={isSelected ? '#9C27B0' : '#999'} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: scale(12), fontFamily: FONT_FAMILY.urbanistBold, color: '#333' }}>
                        {rec.date} · {rec.checkInTime}
                      </Text>
                      <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#888', marginTop: scale(2) }}>
                        Late {formatLateDuration(rec.lateMinutes, rec.lateMinutesDisplay)} · Deduction: {rec.deductionAmount}
                      </Text>
                      {rec.lateReason ? (
                        <Text style={{ fontSize: scale(10), fontFamily: FONT_FAMILY.urbanistMedium, color: '#666', marginTop: scale(2) }} numberOfLines={1}>
                          "{rec.lateReason}"
                        </Text>
                      ) : null}
                    </View>
                    {rec.isWaived && (
                      <View style={{ paddingHorizontal: scale(6), paddingVertical: scale(2), borderRadius: scale(8), backgroundColor: '#E8F5E9' }}>
                        <Text style={{ fontSize: scale(9), fontFamily: FONT_FAMILY.urbanistBold, color: '#4CAF50' }}>WAIVED</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Reason */}
          <Text style={{ fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginBottom: scale(6) }}>Reason for Waiver *</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(10), fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistMedium, color: '#333', backgroundColor: '#fff', minHeight: scale(80) }}
            placeholder="e.g., office errand, client visit, traffic incident..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={3}
            value={waiverReason}
            onChangeText={setWaiverReason}
            textAlignVertical="top"
          />

          {/* Submit */}
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: (!selectedWaiverAttendanceId || !waiverReason.trim()) ? '#CCC' : '#9C27B0', borderRadius: scale(10), padding: scale(12), marginTop: scale(12), gap: scale(6) }}
            disabled={!selectedWaiverAttendanceId || !waiverReason.trim() || loading}
            onPress={handleWaiverSubmit}
          >
            <MaterialIcons name="send" size={scale(18)} color="#fff" />
            <Text style={{ fontSize: scale(14), fontFamily: FONT_FAMILY.urbanistBold, color: '#fff' }}>Submit Waiver Request</Text>
          </TouchableOpacity>
        </View>
      ) : (
        /* History Tab */
        <View>
          {waiverRequests.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: scale(40) }}>
              <MaterialIcons name="gavel" size={scale(40)} color="#9C27B0" />
              <Text style={{ fontSize: scale(14), fontFamily: FONT_FAMILY.urbanistBold, color: '#333', marginTop: scale(10) }}>No waiver requests</Text>
            </View>
          ) : (
            waiverRequests.map(req => {
              const stateColor = getWaiverStateColor(req.state);
              return (
                <View key={req.id} style={{ backgroundColor: '#fff', borderRadius: scale(10), padding: scale(12), marginBottom: scale(8), elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(8) }}>
                    <Text style={{ fontSize: scale(12), fontFamily: FONT_FAMILY.urbanistBold, color: '#333' }}>
                      {req.lateDate}
                    </Text>
                    <View style={{ paddingHorizontal: scale(8), paddingVertical: scale(3), borderRadius: scale(10), backgroundColor: stateColor + '20' }}>
                      <Text style={{ fontSize: scale(10), fontFamily: FONT_FAMILY.urbanistBold, color: stateColor }}>{getWaiverStateLabel(req.state)}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: '#FAFAFA', borderRadius: scale(6), padding: scale(8), gap: scale(4) }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Feather name="clock" size={scale(12)} color="#888" />
                      <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }}>
                        Late {formatLateDuration(req.lateMinutes, req.lateMinutesDisplay)} · Deduction: {req.originalDeduction}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: scale(6) }}>
                      <Feather name="file-text" size={scale(12)} color="#888" style={{ marginTop: scale(2) }} />
                      <Text style={{ flex: 1, fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }}>{req.reason}</Text>
                    </View>
                    {req.approvedBy ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                        <Feather name="user-check" size={scale(12)} color="#888" />
                        <Text style={{ fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#555' }}>By: {req.approvedBy}</Text>
                      </View>
                    ) : null}
                    {req.rejectionReason ? (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: scale(6) }}>
                        <Feather name="x-circle" size={scale(12)} color="#E74C3C" style={{ marginTop: scale(2) }} />
                        <Text style={{ flex: 1, fontSize: scale(11), fontFamily: FONT_FAMILY.urbanistMedium, color: '#E74C3C' }}>{req.rejectionReason}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );

  // =============================================
  // RENDER: OFFICE SECTION (existing flow)
  // =============================================
  const renderOfficeSection = () => (
    <View style={styles.detailsSection}>
      {/* Greeting Card */}
      <View style={styles.greetingCard}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {userName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.statusDot} />
        </View>
        <View style={styles.greetingTextContainer}>
          <Text style={styles.greetingText}>{getGreeting()}</Text>
          <Text style={styles.userNameText}>{userName}</Text>
        </View>
      </View>

      {/* Status Cards */}
      <View style={styles.statusCardsContainer}>
        <View style={[styles.statusCard, todayAttendance?.checkIn ? styles.statusCardActive : styles.statusCardInactive]}>
          <View style={[styles.statusIconContainer, { backgroundColor: todayAttendance?.checkIn ? '#E8F5E9' : '#F5F5F5' }]}>
            <MaterialIcons name="login" size={scale(20)} color={todayAttendance?.checkIn ? '#4CAF50' : COLORS.gray} />
          </View>
          <Text style={styles.statusCardLabel}>Check In</Text>
          <Text style={[styles.statusCardValue, todayAttendance?.checkIn && { color: '#4CAF50' }]}>
            {todayAttendance?.checkIn || '--:--'}
          </Text>
        </View>

        <View style={[styles.statusCard, todayAttendance?.checkOut ? styles.statusCardActive : styles.statusCardInactive]}>
          <View style={[styles.statusIconContainer, { backgroundColor: todayAttendance?.checkOut ? '#FFEBEE' : '#F5F5F5' }]}>
            <MaterialIcons name="logout" size={scale(20)} color={todayAttendance?.checkOut ? '#F44336' : COLORS.gray} />
          </View>
          <Text style={styles.statusCardLabel}>Check Out</Text>
          <Text style={[styles.statusCardValue, todayAttendance?.checkOut && { color: '#F44336' }]}>
            {todayAttendance?.checkOut || '--:--'}
          </Text>
        </View>
      </View>

      {/* Location Status */}
      {locationStatus && (
        <View style={[styles.locationStatusCard, locationStatus.verified ? styles.locationVerified : styles.locationNotVerified]}>
          <View style={styles.locationIconContainer}>
            <MaterialIcons
              name={locationStatus.verified ? "location-on" : "location-off"}
              size={scale(20)}
              color={locationStatus.verified ? '#4CAF50' : '#F44336'}
            />
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationStatusTitle}>
              {locationStatus.verified ? 'Location Verified' : 'Outside Workplace Range'}
            </Text>
            {locationStatus.distance !== undefined && (
              <Text style={styles.locationStatusSubtitle}>
                {locationStatus.distance}m from {locationStatus.workplaceName || 'workplace'}
                {!locationStatus.verified && ` (max ${locationStatus.threshold}m)`}
              </Text>
            )}
            {locationStatus.error && (
              <Text style={styles.locationStatusSubtitle}>{locationStatus.error}</Text>
            )}
          </View>
        </View>
      )}

      {/* Current Time */}
      <View style={styles.currentTimeCard}>
        <Feather name="clock" size={scale(16)} color={COLORS.primaryThemeColor} />
        <Text style={styles.currentTimeLabel}>Current Time:</Text>
        <Text style={styles.currentTimeValue}>{formatTimeOnly(currentTime)}</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {!hasCheckedIn && !hasCheckedOut && (
          <TouchableOpacity
            style={styles.checkInButton}
            onPress={handleCheckIn}
            disabled={loading}
            activeOpacity={0.8}
          >
            <View style={styles.buttonIconContainer}>
              <MaterialIcons name="fingerprint" size={scale(22)} color={COLORS.white} />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Check In</Text>
              <Text style={styles.buttonSubtitle}>Tap to mark your arrival</Text>
            </View>
            <Feather name="chevron-right" size={scale(20)} color={COLORS.white} />
          </TouchableOpacity>
        )}

        {hasCheckedIn && (
          <TouchableOpacity
            style={styles.checkOutButton}
            onPress={handleCheckOut}
            disabled={loading}
            activeOpacity={0.8}
          >
            <View style={styles.buttonIconContainer}>
              <MaterialIcons name="fingerprint" size={scale(22)} color={COLORS.white} />
            </View>
            <View style={styles.buttonTextContainer}>
              <Text style={styles.buttonTitle}>Check Out</Text>
              <Text style={styles.buttonSubtitle}>Tap to mark your departure</Text>
            </View>
            <Feather name="chevron-right" size={scale(20)} color={COLORS.white} />
          </TouchableOpacity>
        )}

        {hasCheckedOut && (
          <View style={styles.completedContainer}>
            <View style={styles.completedIconContainer}>
              <Ionicons name="checkmark-circle" size={scale(36)} color="#4CAF50" />
            </View>
            <Text style={styles.completedTitle}>All Done!</Text>
            <Text style={styles.completedText}>Your attendance is complete for today</Text>
          </View>
        )}
      </View>
    </View>
  );

  // =============================================
  // MAIN RENDER
  // =============================================
  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader
        title={attendanceMode === 'wfh' ? 'Work From Home' : attendanceMode === 'office' ? 'Office Attendance' : attendanceMode === 'leave' ? 'Leave Request' : attendanceMode === 'waiver' ? 'Late Waiver Request' : 'Attendance'}
        color={COLORS.black}
        backgroundColor={COLORS.white}
        onBackPress={handleBackPress}
      />

      {offline && (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="cloud-off" size={scale(16)} color="#7a4f00" />
          <Text style={styles.offlineBannerText}>
            OFFLINE MODE — punches will sync automatically when you reconnect
          </Text>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <RoundedScrollContainer style={styles.content}>
          {/* Header Card */}
          <View style={styles.headerCard}>
            <View style={styles.headerTop}>
              <View style={styles.dateSection}>
                <View style={styles.iconCircle}>
                  <Feather name="calendar" size={scale(18)} color={COLORS.white} />
                </View>
                <View style={styles.dateTextContainer}>
                  <Text style={styles.dateLabel}>Today</Text>
                  <Text style={styles.dateValue}>{formatDate(currentTime)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.timeSection}>
              <View style={styles.timeIconContainer}>
                <Ionicons name="time-outline" size={scale(22)} color={COLORS.primaryThemeColor} />
              </View>
              <Text style={styles.timeValue}>{formatTime(currentTime)}</Text>
              <Text style={styles.timeLabel}>Live Time</Text>
            </View>
          </View>

          {/* Mode Selection */}
          {!attendanceMode && renderModeSelection()}

          {/* Fingerprint + PIN Section (shown when mode selected but not yet verified) */}
          {attendanceMode && !isVerified && (
            <View style={styles.pinSection}>
              <View style={styles.pinHeader}>
                <TouchableOpacity
                  style={styles.fingerprintButton}
                  onPress={handleFingerprintScan}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  <MaterialIcons name="fingerprint" size={scale(56)} color={attendanceMode === 'wfh' ? '#2196F3' : attendanceMode === 'leave' ? '#FF9800' : COLORS.primaryThemeColor} />
                </TouchableOpacity>
                <Text style={styles.pinTitle}>Scan Fingerprint</Text>
                <Text style={styles.pinSubtitle}>Tap to verify your identity</Text>
              </View>

              {/* OR Divider */}
              <View style={styles.orDivider}>
                <View style={styles.orLine} />
                <Text style={styles.orText}>OR</Text>
                <View style={styles.orLine} />
              </View>

              {/* PIN Input */}
              <View style={styles.pinInputSection}>
                <View style={styles.pinInputHeader}>
                  <MaterialIcons name="dialpad" size={scale(20)} color={attendanceMode === 'wfh' ? '#2196F3' : attendanceMode === 'leave' ? '#FF9800' : COLORS.primaryThemeColor} />
                  <Text style={styles.pinInputTitle}>Enter PIN</Text>
                </View>
                <TextInput
                  style={styles.pinInputField}
                  placeholder="Enter your PIN"
                  placeholderTextColor={COLORS.gray}
                  value={pinInput}
                  onChangeText={setPinInput}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={10}
                />
                <TouchableOpacity
                  style={[styles.pinVerifyButton, { backgroundColor: attendanceMode === 'wfh' ? '#2196F3' : COLORS.primaryThemeColor }]}
                  onPress={handlePinVerify}
                  disabled={loading || !pinInput.trim()}
                  activeOpacity={0.8}
                >
                  <MaterialIcons name="check" size={scale(18)} color={COLORS.white} />
                  <Text style={styles.pinVerifyText}>Verify PIN</Text>
                </TouchableOpacity>
              </View>

              {deviceId && (
                <View style={styles.deviceIdContainer}>
                  <Text style={styles.deviceIdLabel}>Device ID:</Text>
                  <Text style={styles.deviceIdValue} numberOfLines={1}>{deviceId}</Text>
                </View>
              )}
            </View>
          )}

          {/* Verified Content */}
          {attendanceMode === 'office' && isVerified && renderOfficeSection()}
          {attendanceMode === 'wfh' && isVerified && renderWfhSection()}
          {attendanceMode === 'leave' && isVerified && renderLeaveSection()}
          {attendanceMode === 'waiver' && isVerified && renderWaiverSection()}
        </RoundedScrollContainer>
      </KeyboardAvoidingView>

      <OverlayLoader visible={loading && !showCamera} />

      {/* Camera Modal */}
      <Modal
        visible={showCamera}
        animationType="slide"
        onRequestClose={closeCamera}
      >
        <View style={styles.cameraContainer}>
          <Camera
            ref={cameraRef}
            style={styles.camera}
            type={Camera.Constants.Type.front}
          >
            <View style={styles.cameraOverlay}>
              <View style={styles.cameraHeader}>
                <TouchableOpacity
                  style={styles.cameraCloseButton}
                  onPress={() => {
                    closeCamera();
                    setLoading(false);
                  }}
                >
                  <MaterialIcons name="close" size={scale(28)} color={COLORS.white} />
                </TouchableOpacity>
                <Text style={styles.cameraTitle}>
                  {cameraType === 'check_in' ? 'Check In Photo' : 'Check Out Photo'}
                </Text>
                <View style={{ width: scale(40) }} />
              </View>

              <View style={styles.faceGuideContainer}>
                <View style={styles.faceGuide}>
                  <MaterialIcons name="face" size={scale(120)} color="rgba(255,255,255,0.3)" />
                </View>
                <Text style={styles.faceGuideText}>Position your face in the frame</Text>
              </View>

              <View style={styles.countdownContainer}>
                {countdown > 0 ? (
                  <>
                    <Text style={styles.countdownNumber}>{countdown}</Text>
                    <Text style={styles.countdownText}>Taking photo in...</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="camera" size={scale(48)} color={COLORS.white} />
                    <Text style={styles.countdownText}>Capturing...</Text>
                  </>
                )}
              </View>
            </View>
          </Camera>
        </View>
      </Modal>

      {/* Late Reason Modal */}
      <Modal
        visible={showLateReasonModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={styles.lateModalOverlay}>
          <View style={styles.lateModalContainer}>
            <View style={styles.lateModalHeader}>
              <MaterialIcons name="schedule" size={scale(28)} color="#E74C3C" />
              <Text style={styles.lateModalTitle}>You're Late</Text>
            </View>
            <Text style={styles.lateModalSubtitle}>
              You are {formatLateDuration(lateInfo?.lateMinutes, lateInfo?.lateMinutesDisplay)} late today
              {lateInfo?.lateSequence ? ` (Late #${lateInfo.lateSequence} this month)` : ''}
            </Text>
            {lateInfo?.deductionAmount > 0 && (
              <Text style={styles.lateDeductionText}>
                Salary deduction: {lateInfo.deductionAmount}
              </Text>
            )}
            <Text style={styles.lateReasonLabel}>Please provide a reason:</Text>
            <TextInput
              style={styles.lateReasonInput}
              placeholder="Enter your reason for being late..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              value={lateReasonText}
              onChangeText={setLateReasonText}
              textAlignVertical="top"
            />
            <TouchableOpacity
              style={[styles.lateSubmitButton, !lateReasonText.trim() && styles.lateSubmitButtonDisabled]}
              disabled={!lateReasonText.trim()}
              onPress={async () => {
                if (!lateReasonText.trim() || !pendingLateAttendanceId) return;
                setLoading(true);
                try {
                  await submitLateReason(pendingLateAttendanceId, lateReasonText.trim());
                  showToastMessage('Late reason submitted');
                } catch (err) {
                  console.log('[Attendance] Late reason submit error:', err?.message);
                }
                setShowLateReasonModal(false);
                setLateReasonText('');
                setPendingLateAttendanceId(null);
                setLoading(false);
              }}
            >
              <Text style={styles.lateSubmitButtonText}>Submit Reason</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3CD',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE69C',
    paddingHorizontal: scale(12),
    paddingVertical: scale(8),
    gap: scale(8),
  },
  offlineBannerText: {
    flex: 1,
    fontSize: scale(11),
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#7a4f00',
  },
  content: { flex: 1, padding: scale(12) },
  headerCard: { backgroundColor: COLORS.white, borderRadius: scale(16), padding: scale(14), marginBottom: scale(10), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  headerTop: { marginBottom: scale(10) },
  dateSection: { flexDirection: 'row', alignItems: 'center' },
  iconCircle: { width: scale(32), height: scale(32), borderRadius: scale(16), backgroundColor: COLORS.primaryThemeColor, justifyContent: 'center', alignItems: 'center', marginRight: scale(10) },
  dateTextContainer: { flex: 1 },
  dateLabel: { fontSize: scale(11), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 1 },
  dateValue: { fontSize: scale(14), fontWeight: '600', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold },
  timeSection: { alignItems: 'center', paddingTop: scale(10), borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  timeIconContainer: { marginBottom: scale(4) },
  timeValue: { fontSize: scale(30), fontWeight: 'bold', color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 2 },
  timeLabel: { fontSize: scale(10), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },

  // Mode Selection
  modeSelectionContainer: { marginBottom: scale(10) },
  modeTitle: { fontSize: scale(18), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 2 },
  modeSubtitle: { fontSize: scale(13), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: scale(12) },
  modeCard: { backgroundColor: COLORS.white, borderRadius: scale(14), padding: scale(14), flexDirection: 'row', alignItems: 'center', marginBottom: scale(8), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  modeIconContainer: { width: scale(46), height: scale(46), borderRadius: scale(12), justifyContent: 'center', alignItems: 'center', marginRight: scale(12) },
  modeTextContainer: { flex: 1 },
  modeCardTitle: { fontSize: scale(16), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 2 },
  modeCardSubtitle: { fontSize: scale(12), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium },

  // Fingerprint
  pinSection: { backgroundColor: COLORS.white, padding: scale(16), borderRadius: scale(16), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  pinHeader: { alignItems: 'center', marginBottom: scale(8) },
  pinTitle: { fontSize: scale(16), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 2 },
  pinSubtitle: { fontSize: scale(12), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium },
  fingerprintButton: { width: scale(90), height: scale(90), borderRadius: scale(45), backgroundColor: '#F0F4FF', justifyContent: 'center', alignItems: 'center', marginBottom: scale(10), borderWidth: 2, borderColor: COLORS.primaryThemeColor, borderStyle: 'dashed' },
  deviceIdContainer: { backgroundColor: '#F8F9FA', borderRadius: scale(10), padding: scale(10), flexDirection: 'row', alignItems: 'center', marginTop: scale(10) },
  deviceIdLabel: { fontSize: scale(11), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginRight: 6 },
  deviceIdValue: { fontSize: scale(11), color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, flex: 1 },

  // OR Divider
  orDivider: { flexDirection: 'row', alignItems: 'center', marginVertical: scale(10) },
  orLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  orText: { fontSize: scale(12), fontWeight: 'bold', color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistBold, marginHorizontal: scale(12) },

  // PIN Input
  pinInputSection: { marginBottom: scale(4) },
  pinInputHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: scale(8) },
  pinInputTitle: { fontSize: scale(14), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: scale(8) },
  pinInputField: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(12), fontSize: scale(16), fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, backgroundColor: '#FAFAFA', textAlign: 'center', letterSpacing: 6, marginBottom: scale(10) },
  pinVerifyButton: { borderRadius: scale(10), padding: scale(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pinVerifyText: { fontSize: scale(14), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: scale(6) },

  // Details
  detailsSection: { flex: 1 },
  greetingCard: { backgroundColor: COLORS.white, borderRadius: scale(16), padding: scale(14), flexDirection: 'row', alignItems: 'center', marginBottom: scale(10), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  avatarContainer: { position: 'relative', marginRight: scale(12) },
  avatar: { width: scale(44), height: scale(44), borderRadius: scale(22), backgroundColor: COLORS.primaryThemeColor, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: scale(20), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold },
  statusDot: { position: 'absolute', bottom: 1, right: 1, width: scale(12), height: scale(12), borderRadius: scale(6), backgroundColor: '#4CAF50', borderWidth: 2, borderColor: COLORS.white },
  greetingTextContainer: { flex: 1 },
  greetingText: { fontSize: scale(12), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 1 },
  userNameText: { fontSize: scale(16), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold },

  // WFH Badge
  wfhBadge: { backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: scale(10), paddingVertical: 4 },
  wfhBadgeText: { fontSize: scale(12), fontWeight: 'bold', color: '#2196F3', fontFamily: FONT_FAMILY.urbanistBold },

  // Status Cards
  statusCardsContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: scale(10) },
  statusCard: { flex: 1, backgroundColor: COLORS.white, borderRadius: scale(12), padding: scale(10), alignItems: 'center', marginHorizontal: scale(4), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
  statusCardActive: { borderWidth: 1, borderColor: '#E8E8E8' },
  statusCardInactive: { borderWidth: 1, borderColor: '#F0F0F0' },
  statusIconContainer: { width: scale(36), height: scale(36), borderRadius: scale(18), justifyContent: 'center', alignItems: 'center', marginBottom: scale(6) },
  statusCardLabel: { fontSize: scale(10), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: 2 },
  statusCardValue: { fontSize: scale(12), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold },

  // Time & Location
  currentTimeCard: { backgroundColor: '#F0F4FF', borderRadius: scale(10), padding: scale(10), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: scale(12) },
  currentTimeLabel: { fontSize: scale(12), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginLeft: 6 },
  currentTimeValue: { fontSize: scale(14), fontWeight: 'bold', color: COLORS.primaryThemeColor, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 4 },
  locationStatusCard: { borderRadius: scale(10), padding: scale(10), flexDirection: 'row', alignItems: 'center', marginBottom: scale(8) },
  locationVerified: { backgroundColor: '#E8F5E9', borderWidth: 1, borderColor: '#C8E6C9' },
  locationNotVerified: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' },
  locationIconContainer: { width: scale(34), height: scale(34), borderRadius: scale(17), backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center', marginRight: scale(10) },
  locationTextContainer: { flex: 1 },
  locationStatusTitle: { fontSize: scale(12), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold },
  locationStatusSubtitle: { fontSize: scale(11), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 1 },

  // Action Buttons
  buttonContainer: { marginTop: 2 },
  checkInButton: { backgroundColor: '#4CAF50', borderRadius: scale(14), padding: scale(14), flexDirection: 'row', alignItems: 'center', shadowColor: '#4CAF50', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  checkOutButton: { backgroundColor: '#F44336', borderRadius: scale(14), padding: scale(14), flexDirection: 'row', alignItems: 'center', shadowColor: '#F44336', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3 },
  buttonIconContainer: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginRight: scale(12) },
  buttonTextContainer: { flex: 1 },
  buttonTitle: { fontSize: scale(15), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 1 },
  buttonSubtitle: { fontSize: scale(11), color: 'rgba(255,255,255,0.8)', fontFamily: FONT_FAMILY.urbanistMedium },
  completedContainer: { backgroundColor: COLORS.white, padding: scale(20), borderRadius: scale(16), alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  completedIconContainer: { marginBottom: scale(8) },
  completedTitle: { fontSize: scale(18), fontWeight: 'bold', color: '#4CAF50', fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 2 },
  completedText: { fontSize: scale(12), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, textAlign: 'center' },

  // WFH Form
  wfhFormCard: { backgroundColor: COLORS.white, borderRadius: scale(16), padding: scale(14), marginBottom: scale(10), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  wfhFormTitle: { fontSize: scale(16), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 2 },
  wfhFormSubtitle: { fontSize: scale(12), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginBottom: scale(12) },
  wfhDateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F4FF', borderRadius: scale(8), padding: scale(10), marginBottom: scale(12) },
  wfhDateText: { fontSize: scale(13), color: COLORS.black, fontFamily: FONT_FAMILY.urbanistMedium, marginLeft: 6 },
  wfhInputLabel: { fontSize: scale(12), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: 6 },
  wfhReasonInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(12), fontSize: scale(13), fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, minHeight: scale(80), marginBottom: scale(12), backgroundColor: '#FAFAFA' },
  wfhSubmitButton: { backgroundColor: '#2196F3', borderRadius: scale(10), padding: scale(12), flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  wfhSubmitText: { fontSize: scale(14), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold, marginLeft: 6 },

  // WFH History
  wfhHistoryCard: { backgroundColor: COLORS.white, borderRadius: scale(16), padding: scale(14), marginBottom: scale(10), shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  wfhHistoryTitle: { fontSize: scale(14), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: scale(8) },
  wfhHistoryItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: scale(8), borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  wfhHistoryLeft: { flex: 1, marginRight: scale(10) },
  wfhHistoryDate: { fontSize: scale(12), fontWeight: 'bold', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold },
  wfhHistoryReason: { fontSize: scale(11), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 1 },
  wfhStatusBadge: { borderRadius: 6, paddingHorizontal: scale(8), paddingVertical: 3 },
  wfhStatusText: { fontSize: scale(10), fontWeight: 'bold', fontFamily: FONT_FAMILY.urbanistBold },

  // Camera
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between' },
  cameraHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(16), paddingTop: scale(50), paddingBottom: scale(16) },
  cameraCloseButton: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  cameraTitle: { fontSize: scale(18), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold },
  faceGuideContainer: { alignItems: 'center', justifyContent: 'center' },
  faceGuide: { width: width * 0.52, height: width * 0.52, borderRadius: width * 0.26, borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', marginBottom: scale(16) },
  faceGuideText: { fontSize: scale(16), color: COLORS.white, fontFamily: FONT_FAMILY.urbanistMedium },
  countdownContainer: { alignItems: 'center', paddingBottom: scale(80) },
  countdownNumber: { fontSize: scale(64), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold },
  countdownText: { fontSize: scale(16), color: COLORS.white, fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 8 },

  // Late Reason Modal
  lateModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  lateModalContainer: { backgroundColor: COLORS.white, borderRadius: scale(16), padding: scale(20), width: '100%', maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  lateModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: scale(8) },
  lateModalTitle: { fontSize: scale(20), fontWeight: 'bold', color: '#E74C3C', fontFamily: FONT_FAMILY.urbanistBold, marginLeft: scale(8) },
  lateModalSubtitle: { fontSize: scale(14), color: COLORS.gray, fontFamily: FONT_FAMILY.urbanistMedium, textAlign: 'center', marginBottom: scale(6) },
  lateDeductionText: { fontSize: scale(13), color: '#E74C3C', fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center', marginBottom: scale(10), backgroundColor: '#FDE8E8', paddingVertical: scale(6), paddingHorizontal: scale(12), borderRadius: scale(8) },
  lateReasonLabel: { fontSize: scale(13), fontWeight: '600', color: COLORS.black, fontFamily: FONT_FAMILY.urbanistBold, marginBottom: scale(6), marginTop: scale(4) },
  lateReasonInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: scale(10), padding: scale(12), fontSize: scale(14), fontFamily: FONT_FAMILY.urbanistMedium, color: COLORS.black, backgroundColor: '#FAFAFA', minHeight: scale(80), marginBottom: scale(14) },
  lateSubmitButton: { backgroundColor: COLORS.primaryThemeColor, borderRadius: scale(10), padding: scale(14), alignItems: 'center' },
  lateSubmitButtonDisabled: { backgroundColor: '#CCC' },
  lateSubmitButtonText: { fontSize: scale(15), fontWeight: 'bold', color: COLORS.white, fontFamily: FONT_FAMILY.urbanistBold },
});

export default UserAttendanceScreen;
