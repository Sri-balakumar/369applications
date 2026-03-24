import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Dimensions, Modal, Alert, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer } from '@components/containers';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { checkInByEmployeeId, checkOutToOdoo, getTodayAttendanceByEmployeeId, getEmployeeByDeviceId, verifyEmployeePin, verifyAttendanceLocation, uploadAttendancePhoto, submitWfhRequest, getTodayApprovedWfh, wfhCheckIn, wfhCheckOut, getMyWfhRequests } from '@services/AttendanceService';
import { MaterialIcons, Feather, Ionicons } from '@expo/vector-icons';
import { Camera } from 'expo-camera';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Application from 'expo-application';

const { width, height } = Dimensions.get('window');
const isSmall = width < 360;
const scale = (size) => Math.round((width / 390) * size);

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

  // Camera state
  const [cameraPermission, requestCameraPermission] = Camera.useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [cameraType, setCameraType] = useState('check_in');
  const [countdown, setCountdown] = useState(3);
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef(null);

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
    if (attendanceMode === 'wfh' && isVerified && !todayWfhRequest && uid) {
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
  }, [attendanceMode, isVerified, todayWfhRequest, verifiedEmployee]);

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

        if (attendanceMode === 'office') {
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

        if (attendanceMode === 'office') {
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
      const locationResult = await verifyAttendanceLocation(verifiedEmployee.userId || currentUser?.uid);

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
      if (result.success) {
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
    if (!todayAttendance?.id) {
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
      const locationResult = await verifyAttendanceLocation(verifiedEmployee.userId || currentUser?.uid);

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

      const result = await checkOutToOdoo(todayAttendance.id);
      if (result.success) {
        if (photoBase64) {
          const uploadResult = await uploadAttendancePhoto(todayAttendance.id, photoBase64, 'check_out');
          if (uploadResult.success) {
            console.log('[Attendance] Check-out photo uploaded successfully');
          }
        }

        showToastMessage('Check-out successful!');
        // Reset so user can check-in again (multiple check-in/out per day)
        setTodayAttendance(null);
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
  const hasCheckedOut = false; // Allow multiple check-in/out per day

  const getGreeting = () => {
    const hour = currentTime.getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
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
        onPress={() => setAttendanceMode('wfh')}
        activeOpacity={0.8}
      >
        <View style={[styles.modeIconContainer, { backgroundColor: '#E3F2FD' }]}>
          <MaterialIcons name="home-work" size={scale(32)} color="#2196F3" />
        </View>
        <View style={styles.modeTextContainer}>
          <Text style={styles.modeCardTitle}>Work From Home</Text>
          <Text style={styles.modeCardSubtitle}>Request WFH or check in if approved</Text>
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
        title={attendanceMode === 'wfh' ? 'Work From Home' : attendanceMode === 'office' ? 'Office Attendance' : 'Attendance'}
        color={COLORS.black}
        backgroundColor={COLORS.white}
        onBackPress={handleBackPress}
      />

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
                  <MaterialIcons name="fingerprint" size={scale(56)} color={attendanceMode === 'wfh' ? '#2196F3' : COLORS.primaryThemeColor} />
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
                  <MaterialIcons name="dialpad" size={scale(20)} color={attendanceMode === 'wfh' ? '#2196F3' : COLORS.primaryThemeColor} />
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
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
});

export default UserAttendanceScreen;
