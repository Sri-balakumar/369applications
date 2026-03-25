import React, { useState, useEffect } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { SafeAreaView } from "@components/containers";
import { Button } from "@components/common/Button";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import { useAuthStore } from '@stores/auth';
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LogoutModal } from "@components/Modal";

const ProfileScreen = ({ navigation }) => {
  const userDetails = useAuthStore(state => state.user);
  const [isVisible, setIsVisible] = useState(false);
  const [dbName, setDbName] = useState('N/A');
  const hideLogoutAlert = () => setIsVisible(false);

  useEffect(() => {
    const loadDb = async () => {
      try {
        const db = await AsyncStorage.getItem('odoo_db');
        if (db) { setDbName(db); return; }
        const stored = await AsyncStorage.getItem('userData');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.odoo_db) setDbName(parsed.odoo_db);
          else if (parsed?.db) setDbName(parsed.db);
        }
      } catch (e) {}
    };
    loadDb();
  }, []);
  const dbInitial = dbName.charAt(0).toUpperCase();
  const userName = userDetails?.related_profile?.name || userDetails?.user_name || dbName;

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('userData');
      await AsyncStorage.removeItem('odoo_db');
      await AsyncStorage.removeItem('odoo_cookie');
      try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cartKeys = allKeys.filter(k => k.startsWith('cart_'));
        if (cartKeys.length > 0) await AsyncStorage.multiRemove(cartKeys);
      } catch (e) { console.warn('Failed to clear carts:', e?.message); }
      navigation.reset({
        index: 0,
        routes: [{ name: 'LoginScreenOdoo' }],
      });
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      hideLogoutAlert();
    }
  };

  return (
    <SafeAreaView backgroundColor={COLORS.primaryThemeColor}>
      <View style={styles.headerBg} />

      <View style={styles.content}>
        {/* Avatar with DB initial */}
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{dbInitial}</Text>
          </View>
        </View>

        {/* User Name */}
        <Text style={styles.userName}>{userName}</Text>

        {/* 369ai Logo */}
        <Image
          source={require('@assets/images/Home/Header/header_transparent_bg.png')}
          style={styles.logo}
        />

        {/* Info Table */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>App Name</Text>
            <Text style={styles.infoValue}>369ai</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Database</Text>
            <Text style={styles.infoValue}>{dbName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>User</Text>
            <Text style={styles.infoValue}>{userName}</Text>
          </View>
          <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={styles.infoLabel}>Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>

        {/* Logout Button */}
        <View style={styles.logoutBtn}>
          <Button paddingHorizontal={50} title={'LOGOUT'} onPress={() => setIsVisible(true)} />
        </View>
      </View>

      <LogoutModal
        isVisible={isVisible}
        hideLogoutAlert={hideLogoutAlert}
        handleLogout={handleLogout}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  headerBg: {
    height: 140,
    backgroundColor: COLORS.primaryThemeColor,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -30,
    paddingTop: 10,
  },
  avatarContainer: {
    marginTop: -50,
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryThemeColor,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarText: {
    fontSize: 36,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },
  userName: {
    fontSize: 22,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#242760',
    marginBottom: 8,
  },
  logo: {
    width: 120,
    height: 40,
    resizeMode: 'contain',
    marginBottom: 12,
  },
  infoCard: {
    width: '85%',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  logoutBtn: {
    marginTop: 24,
  },
});

export default ProfileScreen;
