import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { TabBarIcon } from '@components/TabBar';
import { HomeScreen, ProfileScreen } from '@screens';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { StyledAlertModal } from '@components/Modal';

const Tab = createBottomTabNavigator();

// Dummy component for the Logout tab (never actually renders)
const LogoutPlaceholder = () => null;

const AppNavigator = () => {
  const [showLogoutAlert, setShowLogoutAlert] = useState(false);
  const [logoutNavigation, setLogoutNavigation] = useState(null);

  const executeLogout = async () => {
    setShowLogoutAlert(false);
    try {
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('odoo_db');
      await AsyncStorage.removeItem('odoo_cookie');
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cartKeys = allKeys.filter(k => k.startsWith('cart_'));
        if (cartKeys.length > 0) await AsyncStorage.multiRemove(cartKeys);
      } catch (_) {}
      if (logoutNavigation) {
        logoutNavigation.dispatch(
          CommonActions.reset({ index: 0, routes: [{ name: 'LoginScreenOdoo' }] })
        );
      }
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const tabBarOptions = {
    tabBarShowLabel: false,
    tabBarHideOnKeyboard: true,
    headerShown: false,
    tabBarStyle: {
      position: "absolute",
      bottom: 5,
      right: 10,
      left: 10,
      borderTopRightRadius: 20,
      borderTopLeftRadius: 20,
      elevation: 0,
      height: 60,
      backgroundColor: '#2e294e',
    }
  };

  return (
    <>
    <Tab.Navigator screenOptions={tabBarOptions}>
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused }) =>
            <TabBarIcon
              focused={focused}
              iconComponent={require('@assets/icons/bottom_tabs/home.png')}
              label="Home"
            />
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused }) =>
            <TabBarIcon
              focused={focused}
              iconComponent={require('@assets/icons/bottom_tabs/profile.png')}
              label="Profile"
            />
        }}
      />
      <Tab.Screen
        name="Logout"
        component={LogoutPlaceholder}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            setLogoutNavigation(navigation);
            setShowLogoutAlert(true);
          },
        })}
        options={{
          tabBarIcon: ({ focused }) =>
            <View style={{ alignItems: 'center', minWidth: 70 }}>
              <View style={{ backgroundColor: focused ? COLORS.white : COLORS.primaryThemeColor, width: 40, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="logout" size={18} color={focused ? '#333' : '#fff'} />
              </View>
              <Text style={{ color: '#fff', fontSize: 11, fontFamily: FONT_FAMILY.urbanistSemiBold, marginTop: 2 }}>Logout</Text>
            </View>
        }}
      />
    </Tab.Navigator>
    <StyledAlertModal
      isVisible={showLogoutAlert}
      message="Are you sure you want to logout?"
      confirmText="YES"
      cancelText="NO"
      destructive
      onConfirm={executeLogout}
      onCancel={() => setShowLogoutAlert(false)}
    />
    </>
  );
};

export default AppNavigator;
