// Global Jest setup — mocks for Expo native modules + RN internals so unit
// tests can run without a device or native bridge. Anything below is loaded
// before each test file via the `setupFiles` entry in package.json's jest
// config.

jest.useFakeTimers();

// AsyncStorage (uses the official mock shipped with the package)
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Expo native modules — return safe defaults, no native dependency required.
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(() => Promise.resolve({ success: true })),
  hasHardwareAsync: jest.fn(() => Promise.resolve(true)),
  isEnrolledAsync: jest.fn(() => Promise.resolve(true)),
  supportedAuthenticationTypesAsync: jest.fn(() => Promise.resolve([1, 2])),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2 },
}));

jest.mock('expo-camera', () => ({
  Camera: 'Camera',
  CameraType: { back: 'back', front: 'front' },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied' },
  useCameraPermissions: () => [{ status: 'granted', granted: true }, jest.fn()],
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted' })
  ),
  getCurrentPositionAsync: jest.fn(() =>
    Promise.resolve({ coords: { latitude: 0, longitude: 0 } })
  ),
}));

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true })
  ),
}));

jest.mock('expo-image-picker', () => ({
  launchCameraAsync: jest.fn(() =>
    Promise.resolve({ canceled: false, assets: [{ base64: 'mock-base64' }] })
  ),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
  applicationId: 'com.test.app',
}));

// React Native internal that errors out without a real native bridge.
jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');

// Silence noisy Animated warnings during tests.
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Animated:')) return;
  originalWarn(...args);
};
