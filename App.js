import React from 'react';
import { LogBox } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import CustomToast from '@components/Toast/CustomToast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler'; // Import GestureHandlerRootView
import StackNavigator from '@navigation/StackNavigator';
import { Provider } from 'react-native-paper';
export default function App() {

  LogBox.ignoreLogs(["new NativeEventEmitter"]);
  LogBox.ignoreAllLogs();

  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
  ]);

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
