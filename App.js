import React, { useEffect } from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import CustomToast from '@components/Toast/CustomToast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Import GestureHandlerRootView
import StackNavigator from '@navigation/StackNavigator';
import { Provider } from 'react-native-paper';
import OfflineSyncService from '@services/OfflineSyncService';
import CacheWarmer from '@services/CacheWarmer';
import offlineQueue from '@utils/offlineQueue';
export default function App() {

  LogBox.ignoreLogs(["new NativeEventEmitter"]);
  LogBox.ignoreAllLogs();

  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
  ]);

  // Start the offline sync background flusher once on app boot. It listens
  // for connectivity changes and auto-flushes the on-device queue to Odoo
  // when the device comes back online.
  useEffect(() => {
    // One-time cleanup: remove any broken queue items from older code versions
    // (e.g. items with operation='checkout' that Odoo rejects).
    offlineQueue.getAll().then(async (items) => {
      for (const item of items) {
        if (item.operation !== 'create' && item.operation !== 'method') {
          await offlineQueue.removeById(item.id);
          console.log('[App] Cleaned invalid queue item:', item.id, item.operation);
        }
        if ((item.retryCount || 0) >= 3) {
          await offlineQueue.removeById(item.id);
          console.log('[App] Cleaned failed queue item:', item.id);
        }
      }
    }).catch(() => {});

    OfflineSyncService.start();
    // Pull-side background worker: warms every list cache on boot (if logged
    // in + online) and again on every offline → online transition, so the
    // user doesn't have to visit each screen to populate offline data.
    CacheWarmer.start();
    return () => {
      OfflineSyncService.stop();
      CacheWarmer.stop();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Provider>
      <NavigationContainer>
        <SafeAreaProvider>
          <BottomSheetModalProvider>
            <StackNavigator />
          </BottomSheetModalProvider>
          <Toast config={CustomToast} />
        </SafeAreaProvider>
      </NavigationContainer>
      </Provider>
    </GestureHandlerRootView>
  );
}
