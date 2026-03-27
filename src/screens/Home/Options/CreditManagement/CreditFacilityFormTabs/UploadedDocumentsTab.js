import React from 'react';
import { View, StyleSheet, Platform, TouchableOpacity, Image, Alert } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';

const DOCUMENT_FIELDS = [
  { key: 'tradeLicenseFile', label: 'Trade License File' },
  { key: 'passportCopyFile', label: 'Passport Copy File' },
  { key: 'taxRegistrationFile', label: 'Tax Registration File' },
  { key: 'creditApplicationFile', label: 'Credit Application File' },
  { key: 'nationalityIdFile', label: 'Nationality ID File' },
];

const UploadedDocumentsTab = ({ formData, updateField }) => {

  const pickImage = async (fieldKey) => {
    Alert.alert('Select Image', 'Choose an option', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Camera access is required.', position: 'bottom' });
            return;
          }
          const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: true });
          if (!result.canceled && result.assets[0]) {
            updateField(fieldKey, `data:image/png;base64,${result.assets[0].base64}`);
          }
        },
      },
      {
        text: 'Gallery',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Gallery access is required.', position: 'bottom' });
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });
          if (!result.canceled && result.assets[0]) {
            updateField(fieldKey, `data:image/png;base64,${result.assets[0].base64}`);
          }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeImage = (fieldKey) => {
    updateField(fieldKey, null);
  };

  return (
    <View style={styles.content}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Uploaded Documents</Text>

        <View style={styles.documentsGrid}>
          {DOCUMENT_FIELDS.map((doc) => (
            <View key={doc.key} style={styles.documentItem}>
              <Text style={styles.documentLabel}>{doc.label}</Text>

              {formData[doc.key] ? (
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: formData[doc.key] }}
                    style={styles.imagePreview}
                    resizeMode="cover"
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeImage(doc.key)}
                  >
                    <MaterialCommunityIcons name="close-circle" size={24} color="#dc3545" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.uploadPlaceholder}
                  onPress={() => pickImage(doc.key)}
                >
                  <MaterialCommunityIcons name="camera-plus" size={40} color="#adb5bd" />
                  <Text style={styles.uploadText}>Tap to upload</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      </View>

    </View>
  );
};

export default UploadedDocumentsTab;

const styles = StyleSheet.create({
  content: { padding: 16 },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 10,
  },
  documentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  documentItem: {
    width: '48%',
    marginBottom: 16,
  },
  documentLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
    marginBottom: 8,
  },
  uploadPlaceholder: {
    height: 150,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fafafa',
  },
  uploadText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#adb5bd',
    marginTop: 4,
  },
  imageContainer: {
    height: 150,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  removeButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'white',
    borderRadius: 12,
  },
});
