import React, { useEffect, useState } from 'react';
import { View, Image, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Font from 'expo-font';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { useAuthStore } from '@stores/auth';
import Constants from 'expo-constants'
import { getConfig } from '@utils/config';
import { useCurrencyStore } from '@stores/currency';
import { fetchCompanyCurrencyOdoo } from '@api/services/generalApi';
import { loadOdooBaseUrl } from '@api/config/odooConfig';

const SplashScreen = () => {
    const navigation = useNavigation();
    const [fontsLoaded, setFontsLoaded] = useState(false);
    const setLoggedInUser = useAuthStore(state => state.login);
    const setCurrency = useCurrencyStore((state) => state.setCurrency);
    const setCurrencyFromOdoo = useCurrencyStore((state) => state.setCurrencyFromOdoo);

    useEffect(() => {
        // Get app name and config based on app name
        const appName = Constants.expoConfig.name;
        const config = getConfig(appName);

        // Set currency based on package name from config
        setCurrency(config.packageName);

        // Load custom fonts
        async function loadFonts() {
            await Font.loadAsync({
                'Urbanist-Black': require('@assets/fonts/Urbanist/Urbanist-Black.ttf'),
                'Urbanist-Bold': require('@assets/fonts/Urbanist/Urbanist-Bold.ttf'),
                'Urbanist-ExtraBold': require('@assets/fonts/Urbanist/Urbanist-ExtraBold.ttf'),
                'Urbanist-ExtraLight': require('@assets/fonts/Urbanist/Urbanist-ExtraLight.ttf'),
                'Urbanist-Light': require('@assets/fonts/Urbanist/Urbanist-Light.ttf'),
                'Urbanist-Medium': require('@assets/fonts/Urbanist/Urbanist-Medium.ttf'),
                'Urbanist-Regular': require('@assets/fonts/Urbanist/Urbanist-Regular.ttf'),
                'Urbanist-SemiBold': require('@assets/fonts/Urbanist/Urbanist-SemiBold.ttf'),
                'Urbanist-Thin': require('@assets/fonts/Urbanist/Urbanist-Thin.ttf'),
            });
            setFontsLoaded(true);
        }
        loadFonts();
    }, []);

    useEffect(() => {
        async function checkUserData() {
            // Restore saved Odoo URL into memory before any API calls
            await loadOdooBaseUrl();
            const storedUserData = await AsyncStorage.getItem('userData');
            if (storedUserData) {
                const userData = JSON.parse(storedUserData);
                setLoggedInUser(userData);
                // Fetch company currency from Odoo
                try {
                    const companyCurrency = await fetchCompanyCurrencyOdoo();
                    if (companyCurrency) setCurrencyFromOdoo(companyCurrency);
                } catch (e) { console.warn('Could not fetch company currency:', e?.message); }
                // Reset the navigation stack to prevent going back to the splash screen
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'AppNavigator' }],
                });
            } else {
                navigation.reset({
                    index: 0,
                    routes: [{ name: 'LoginScreenOdoo' }],
                });
            }
        }
        if (fontsLoaded) {
            const timeout = setTimeout(() => {
                checkUserData()
            }, 300);
            return () => clearTimeout(timeout);
        }
    }, [fontsLoaded, navigation]);

    if (!fontsLoaded) {
        return null;
    }

    return (
        <View style={styles.container} />
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    versionText: {
        position: 'absolute',
        bottom: 30,
        fontSize: 16,
        marginTop: 20,
        color: COLORS.primaryThemeColor,
        fontFamily: FONT_FAMILY.urbanistBold,
    },
});

export default SplashScreen;
