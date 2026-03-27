// src/screens/Auth/LoginScreenOdoo.js
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Keyboard,
  StyleSheet,
  Image,
  TouchableWithoutFeedback,
  TouchableOpacity,
  Alert,
  Linking,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
} from "react-native";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { LogBox } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button } from "@components/common/Button";
import { OverlayLoader } from "@components/Loader";
import axios from "axios";
import { post } from "@api/services/utils";
import { useNavigation } from "@react-navigation/native";
import Text from "@components/Text";
import { TextInput } from "@components/common/TextInput";
import { RoundedScrollContainer, SafeAreaView } from "@components/containers";
import { useAuthStore } from "@stores/auth";
import { showToastMessage } from "@components/Toast";
import { Checkbox } from "react-native-paper";
import { startLocationTracking } from "@services/LocationTrackingService";
import * as Location from 'expo-location';

import API_BASE_URL from "@api/config";
import { DEFAULT_ODOO_BASE_URL, DEFAULT_ODOO_DB, DEFAULT_USERNAME, DEFAULT_PASSWORD, setOdooBaseUrl } from "@api/config/odooConfig";
import { fetchCompanyCurrencyOdoo } from "@api/services/generalApi";
import { useCurrencyStore } from "@stores/currency";

LogBox.ignoreLogs(["new NativeEventEmitter"]);
LogBox.ignoreAllLogs();

// Check if URL looks like an Odoo server
const isOdooUrl = (url = "") => {
  const lower = url.toLowerCase();
  return (
    lower.startsWith('http') ||
    lower.includes('ngrok') ||
    lower.includes('odoo') ||
    lower.includes('/web') ||
    lower.includes(':8069')
  );
};

const LoginScreenOdoo = () => {
  const navigation = useNavigation();
  const setUser = useAuthStore((state) => state.login);
  const setCurrencyFromOdoo = useCurrencyStore((state) => state.setCurrencyFromOdoo);
  const [checked, setChecked] = useState(false);
  const [autoCredentials, setAutoCredentials] = useState(false);

  const updateCheckedState = (value) => {
    setChecked(value);
  };

  const { container, imageContainer } = styles;

  LogBox.ignoreLogs([
    "Non-serializable values were found in the navigation state",
  ]);

  const [inputs, setInputs] = useState({
    baseUrl: DEFAULT_ODOO_BASE_URL || "",
    db: DEFAULT_ODOO_DB || "",
    username: "",
    password: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [dbList, setDbList] = useState([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [dbDropdownVisible, setDbDropdownVisible] = useState(false);
  const [dbError, setDbError] = useState("");

  // Fetch databases from Odoo server when URL changes
  const fetchDatabases = useCallback(async (url) => {
    if (!url || !isOdooUrl(url)) {
      setDbList([]);
      setDbError("");
      return;
    }
    const normalized = url.startsWith('http') ? url : `https://${url}`;
    const fixed = normalized.replace(/(\d+\.\d+\.\d+\.\d+)\.(\d+)(\/.*)?$/, '$1:$2$3');
    const finalUrl = fixed.replace(/\/+$/, "");

    setDbLoading(true);
    setDbError("");
    try {
      const res = await axios.post(`${finalUrl}/web/database/list`, {
        jsonrpc: "2.0",
        method: "call",
        params: {},
      }, { headers: { "Content-Type": "application/json" }, timeout: 15000 });

      const databases = res.data?.result || [];
      if (databases.length === 0) {
        setDbList([]);
        setDbError("No databases found on this server");
      } else {
        setDbList(databases);
        setDbError("");
        if (databases.length === 1) {
          setInputs((prev) => ({ ...prev, db: databases[0] }));
        } else {
          setInputs((prev) => {
            // Keep current db if it exists in the fetched list
            if (prev.db && databases.includes(prev.db)) return prev;
            return { ...prev, db: "" };
          });
        }
      }
    } catch (err) {
      console.log("Failed to fetch DB list:", err?.message);
      setDbList([]);
      if (err?.message?.includes('timeout')) {
        setDbError("Server timed out. Check the URL and try again.");
      } else if (err?.message?.includes('Network Error')) {
        setDbError("Cannot reach server. Check URL and network.");
      } else {
        setDbError("Failed to fetch databases: " + (err?.message || "Unknown error"));
      }
    } finally {
      setDbLoading(false);
    }
  }, []);

  // Debounce URL changes to fetch databases
  useEffect(() => {
    const trimmedUrl = inputs.baseUrl?.trim();
    if (!trimmedUrl || !isOdooUrl(trimmedUrl)) {
      setDbList([]);
      return;
    }
    const timer = setTimeout(() => {
      fetchDatabases(trimmedUrl);
    }, 300);
    return () => clearTimeout(timer);
  }, [inputs.baseUrl, fetchDatabases]);

  const handleOnchange = (text, input) => {
    setInputs((prevState) => ({ ...prevState, [input]: text }));
  };

  const handleError = (error, input) => {
    setErrors((prevState) => ({ ...prevState, [input]: error }));
  };

  // Check if location services are enabled and permission is granted
  const checkLocationEnabled = async () => {
    try {
      const isLocationEnabled = await Location.hasServicesEnabledAsync();

      if (!isLocationEnabled) {
        Alert.alert(
          'Location Required',
          'Please turn on location services to login. This app requires location tracking.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return false;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Location permission is required to login. Please grant location access.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else {
                  Linking.openSettings();
                }
              }
            }
          ]
        );
        return false;
      }

      return true;
    } catch (error) {
      console.log('Location check error:', error);
      showToastMessage('Unable to check location status');
      return false;
    }
  };

  const validate = async () => {
    Keyboard.dismiss();
    let isValid = true;

    if (!inputs.username) {
      handleError("Please input user name", "username");
      isValid = false;
    }
    if (!inputs.password) {
      handleError("Please input password", "password");
      isValid = false;
    }
    // Require DB selection when using Odoo URL
    const baseUrlTrimmed = inputs.baseUrl?.trim();
    if (baseUrlTrimmed && isOdooUrl(baseUrlTrimmed) && !inputs.db?.trim()) {
      handleError("Please select a database", "db");
      isValid = false;
    }
    if (!checked) {
      showToastMessage("Please agree Privacy Policy");
      isValid = false;
    }

    if (isValid) {
      const locationEnabled = await checkLocationEnabled();
      if (locationEnabled) {
        login();
      }
    }
  };

  const login = async () => {
    setLoading(true);
    try {
      const baseUrlRaw = inputs.baseUrl || "";
      const baseUrl = baseUrlRaw.trim();
      const username = inputs.username;
      const password = inputs.password;

      const useOdoo = baseUrl && isOdooUrl(baseUrl);

      if (useOdoo) {
        const normalized = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
        const fixed = normalized.replace(/(\d+\.\d+\.\d+\.\d+)\.(\d+)(\/.*)?$/, '$1:$2$3');
        const finalOdooUrl = (fixed.replace(/\/+$/, "") || DEFAULT_ODOO_BASE_URL);
        console.log('Using Odoo URL:', finalOdooUrl);
        // Persist the URL so all API calls use it
        await setOdooBaseUrl(finalOdooUrl);
        const dbNameUsed = inputs.db?.trim() || DEFAULT_ODOO_DB;
        console.log('Logging in to Odoo DB:', dbNameUsed);
        let userData = null;
        try {
          const odooLoginReqBody = {
            jsonrpc: "2.0",
            method: "call",
            params: {
              db: dbNameUsed,
              login: username,
              password: password,
            },
          };
          const odooLoginReqHeaders = {
            headers: {
              "Content-Type": "application/json",
            },
          };
          console.log("[REQ] /web/session/authenticate", {
            url: `${finalOdooUrl}/web/session/authenticate`,
            body: odooLoginReqBody,
            headers: odooLoginReqHeaders.headers,
          });
          const odooLoginRes = await axios.post(
            `${finalOdooUrl}/web/session/authenticate`,
            odooLoginReqBody,
            odooLoginReqHeaders
          );
          console.log("[RES] /web/session/authenticate", JSON.stringify(odooLoginRes.data, null, 2));
          const result = odooLoginRes.data && odooLoginRes.data.result;
          if (result && result.uid) {
            userData = result;
            userData.odoo_db = dbNameUsed;
            // Clear cart cache if database changed
            try {
              const previousDb = await AsyncStorage.getItem('odoo_db');
              if (previousDb && previousDb !== dbNameUsed) {
                const allKeys = await AsyncStorage.getAllKeys();
                const cartKeys = allKeys.filter(k => k.startsWith('cart_'));
                if (cartKeys.length > 0) await AsyncStorage.multiRemove(cartKeys);
                console.log('[Login] DB changed, cleared', cartKeys.length, 'cached carts');
              }
            } catch (e) { console.warn('Failed to clear cart cache:', e?.message); }
            await AsyncStorage.setItem('odoo_db', dbNameUsed);
            await AsyncStorage.setItem("userData", JSON.stringify(userData));
            try {
              const setCookie = odooLoginRes.headers['set-cookie'] || odooLoginRes.headers['Set-Cookie'];
              if (setCookie) {
                const cookieStr = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
                await AsyncStorage.setItem('odoo_cookie', cookieStr);
              }
            } catch (e) {
              console.warn('Unable to persist Odoo cookie header:', e?.message || e);
            }
            setUser(userData);
            try {
              const companyCurrency = await fetchCompanyCurrencyOdoo();
              if (companyCurrency) setCurrencyFromOdoo(companyCurrency);
            } catch (e) { console.warn('Could not fetch company currency:', e?.message); }
            if (userData.uid && !userData.is_admin) {
              startLocationTracking(userData.uid);
            }
            navigation.navigate("AppNavigator");
          } else {
            showToastMessage("Invalid Odoo credentials or login failed");
          }
        } catch (err) {
          showToastMessage("/web/session/authenticate failed: " + (err?.message || 'Unknown error'));
        }
      } else {
        // UAE ADMIN LOGIN
        const response = await post("/viewuser/login", {
          user_name: username,
          password: password,
        });
        console.log("🚀 UAE admin login response:", JSON.stringify(response, null, 2));
        if (response && response.success === true && response.data?.length) {
          const userData = response.data[0];
          await AsyncStorage.setItem("userData", JSON.stringify(userData));
          setUser(userData);
          if (userData._id && userData.user_name !== 'admin') {
            startLocationTracking(userData._id);
          }
          navigation.navigate("AppNavigator");
        } else {
          showToastMessage("Invalid admin credentials");
        }
      }
    } catch (error) {
      console.log("Login Error:", error.response ? error.response.data : error.message);
      showToastMessage(`Error! ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={container}>
      <OverlayLoader visible={loading} />

      {/* Logo */}
      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <View style={imageContainer}>
          <Image
            source={require("@assets/images/header/logo_header.png")}
            style={{ width: 300, height: 180, alignSelf: "center" }}
          />
        </View>
      </TouchableWithoutFeedback>

      <RoundedScrollContainer
        backgroundColor={COLORS.white}
        paddingHorizontal={15}
        borderTopLeftRadius={40}
        borderTopRightRadius={40}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingTop: 50 }}>
          <View style={{ marginVertical: 5, marginHorizontal: 10 }}>
            <View style={{ marginTop: 0, marginBottom: 15 }}>
              {/* Hints */}
              <Text
                style={{
                  fontSize: 25,
                  fontFamily: FONT_FAMILY.urbanistBold,
                  color: "#2e2a4f",
                  textAlign: "center",
                }}
              >
                Login
              </Text>
            </View>

            {/* Server URL */}
            <TextInput
              value={'*'.repeat(inputs.baseUrl?.length || 0)}
              iconName="server-network"
              label="Server URL"
              placeholder=""
              error={errors.baseUrl}
              column={true}
              login={true}
              editable={false}
            />

            {/* Database */}
            <TextInput
              value={inputs.db}
              iconName="database"
              label="Database"
              placeholder="Database"
              error={errors.db}
              column={true}
              login={true}
              editable={false}
            />

            {/* DB Dropdown Modal */}
            {dbDropdownVisible && (
              <Modal visible={true} transparent animationType="fade">
                <TouchableWithoutFeedback onPress={() => setDbDropdownVisible(false)}>
                  <View style={{ flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.3)", padding: 40 }}>
                    <View style={{ backgroundColor: COLORS.white, borderRadius: 12, maxHeight: 300, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold, textAlign: "center", paddingVertical: 10 }}>
                        Select Database
                      </Text>
                      <FlatList
                        data={dbList}
                        keyExtractor={(item) => item}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            onPress={() => {
                              setInputs((prev) => ({ ...prev, db: item }));
                              setDbDropdownVisible(false);
                              handleError(null, "db");
                            }}
                            style={{
                              paddingVertical: 12,
                              paddingHorizontal: 20,
                              backgroundColor: inputs.db === item ? COLORS.primaryThemeColor + "20" : "transparent",
                            }}
                          >
                            <Text style={{
                              fontSize: 15,
                              fontFamily: FONT_FAMILY.urbanistMedium,
                              color: inputs.db === item ? COLORS.primaryThemeColor : "#2e2a4f",
                            }}>
                              {item}
                            </Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </Modal>
            )}

            {/* Username */}
            <TextInput
              value={inputs.username}
              onChangeText={(text) => handleOnchange(text, "username")}
              onFocus={() => handleError(null, "username")}
              iconName="account-outline"
              label="Username or Email"
              placeholder="Enter Username or Email"
              error={errors.username}
              column={true}
              login={true}
            />

            {/* Password */}
            <TextInput
              value={inputs.password}
              onChangeText={(text) => handleOnchange(text, "password")}
              onFocus={() => handleError(null, "password")}
              error={errors.password}
              iconName="lock-outline"
              label="Password"
              placeholder="Enter password"
              password
              column={true}
              login={true}
            />

            {/* Privacy Policy + Auto Credentials */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                <Checkbox
                  onPress={() =>
                    navigation.navigate("PrivacyPolicy", { updateCheckedState })
                  }
                  status={checked ? "checked" : "unchecked"}
                  color={COLORS.primaryThemeColor}
                />
                <Text
                  style={{
                    fontFamily: FONT_FAMILY.urbanistBold,
                    fontSize: 13,
                  }}
                >
                  I agree to the Privacy Policy
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const next = !autoCredentials;
                  setAutoCredentials(next);
                  if (next) {
                    setInputs(prev => ({ ...prev, username: DEFAULT_USERNAME || '', password: DEFAULT_PASSWORD || '' }));
                  } else {
                    setInputs(prev => ({ ...prev, username: '', password: '' }));
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.urbanistSemiBold, color: '#555' }} numberOfLines={1}>Auto Fill Credentials</Text>
                <View style={{
                  width: 40, height: 22, borderRadius: 11,
                  backgroundColor: autoCredentials ? COLORS.primaryThemeColor : '#ccc',
                  justifyContent: 'center', paddingHorizontal: 2,
                }}>
                  <View style={{
                    width: 18, height: 18, borderRadius: 9,
                    backgroundColor: '#fff',
                    alignSelf: autoCredentials ? 'flex-end' : 'flex-start',
                  }} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Login Button */}
            <View style={styles.bottom}>
              <Button title="Login" onPress={validate} />
            </View>

            <Text style={styles.poweredText}>Powered by 369ai | v1.0.0</Text>

          </View>
        </View>
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 10,
  },
  tinyLogo: {
    width: 200,
    height: 200,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: "20%",
  },
  bottom: {
    alignItems: "center",
    marginTop: 10,
  },
  label: {
    marginVertical: 5,
    fontSize: 14,
    color: COLORS.grey,
    marginLeft: 180,
    marginTop: 15,
  },
  poweredText: {
    color: '#aaa',
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 10,
  },
});

export default LoginScreenOdoo;
