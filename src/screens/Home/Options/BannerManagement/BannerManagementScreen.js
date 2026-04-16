import React, { useState, useCallback } from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Image, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { EmptyState } from '@components/common/empty';
import { OverlayLoader } from '@components/Loader';
import { showToastMessage } from '@components/Toast';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { fetchAppBannersOdoo, createAppBannerOdoo, deleteAppBannerOdoo } from '@api/services/generalApi';
import OfflineBanner from '@components/common/OfflineBanner';

const BannerManagementScreen = ({ navigation }) => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchBanners = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAppBannersOdoo();
      setBanners(data || []);
    } catch (err) {
      console.error('[BannerManagement] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchBanners(); }, [fetchBanners]));

  const handleAddBanner = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant gallery access to add banners.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.8,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const asset = result.assets[0];
      setActionLoading(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      const fileName = asset.fileName || `banner_${Date.now()}`;
      const createResult = await createAppBannerOdoo({ name: fileName, imageBase64: base64 });
      if (createResult?.offline) {
        showToastMessage('Banner saved offline. Will sync when online.');
        // Add placeholder to list so user sees it immediately
        setBanners((prev) => [...prev, { id: `offline_${Date.now()}`, name: fileName, image: base64, sequence: 999, offline: true }]);
      } else {
        showToastMessage('Banner added successfully');
        fetchBanners();
      }
    } catch (err) {
      Alert.alert('Error', err?.message || 'Failed to add banner');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBanner = (banner) => {
    const bannerName = banner.name || `Banner #${banner.id}`;
    Alert.alert('Delete Banner', `Are you sure you want to delete "${bannerName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        setActionLoading(true);
        try {
          const deleteResult = await deleteAppBannerOdoo(banner.id);
          if (deleteResult?.offline) {
            showToastMessage('Delete queued offline. Will sync when online.');
            setBanners((prev) => prev.filter((b) => b.id !== banner.id));
          } else {
            showToastMessage('Banner deleted');
            fetchBanners();
          }
        } catch (err) {
          Alert.alert('Error', err?.message || 'Failed to delete banner');
        } finally {
          setActionLoading(false);
        }
      }},
    ]);
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Banner Management" onBackPress={() => navigation.goBack()} />
      <OfflineBanner message="OFFLINE MODE — banner changes will sync when you reconnect" />
      <RoundedContainer>
        {banners.length === 0 && !loading ? (
          <EmptyState imageSource={require('@assets/images/EmptyData/empty.png')} message="No Banners Found" />
        ) : (
          <View style={styles.listContainer}>
            {banners.map((banner) => (
              <View key={banner.id} style={styles.bannerCard}>
                <Image
                  source={{ uri: `data:image/png;base64,${banner.image}` }}
                  style={styles.bannerImage}
                  resizeMode="cover"
                />
                <View style={styles.bannerInfo}>
                  <Text style={styles.bannerName} numberOfLines={1}>{banner.name || `Banner #${banner.id}`}</Text>
                  <Text style={styles.bannerSequence}>Sequence: {banner.sequence}</Text>
                </View>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteBanner(banner)}>
                  <MaterialIcons name="delete" size={22} color="#F44336" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <TouchableOpacity style={styles.fab} onPress={handleAddBanner}>
          <MaterialIcons name="add-a-photo" size={24} color="white" />
        </TouchableOpacity>
      </RoundedContainer>
      <OverlayLoader visible={actionLoading} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  listContainer: { padding: 10, paddingBottom: 80 },
  bannerCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 10, marginBottom: 10,
    ...Platform.select({ android: { elevation: 3 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3 } }),
  },
  bannerImage: { width: 120, height: 68, borderRadius: 8, backgroundColor: '#eee' },
  bannerInfo: { flex: 1, marginLeft: 12 },
  bannerName: { fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, color: '#333' },
  bannerSequence: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistMedium, color: '#999', marginTop: 4 },
  deleteBtn: { padding: 8 },
  fab: { position: 'absolute', margin: 16, right: 0, bottom: 0, backgroundColor: COLORS.primaryThemeColor, borderRadius: 30, width: 60, height: 60, justifyContent: 'center', alignItems: 'center', elevation: 6 },
});

export default BannerManagementScreen;
