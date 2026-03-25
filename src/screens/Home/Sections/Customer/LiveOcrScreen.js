// src/screens/LiveOcrScreen.js

import React, { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';

//import ExpoMlkitOcr from 'expo-mlkit-ocr';

import { SafeAreaView, RoundedContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Text from '@components/Text';
import { Button } from '@components/common/Button';
import { COLORS } from '@constants/theme';

const LiveOcrScreen = ({ navigation }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  const [isScanning, setIsScanning] = useState(false);
  const [ocrText, setOcrText] = useState('');

  if (!permission) {
    return (
      <SafeAreaView>
        <NavigationHeader
          title="OCR Scanner"
          onBackPress={() => navigation.goBack()}
        />
        <RoundedContainer>
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.primaryThemeColor} />
            <Text style={styles.infoText}>Checking camera permission…</Text>
          </View>
        </RoundedContainer>
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView>
        <NavigationHeader
          title="OCR Scanner"
          onBackPress={() => navigation.goBack()}
        />
        <RoundedContainer>
          <View style={styles.center}>
            <Text style={styles.infoText}>
              We need camera access to scan text.
            </Text>
            <View style={{ height: 16 }} />
            <Button label="Allow Camera" onPress={requestPermission} />
          </View>
        </RoundedContainer>
      </SafeAreaView>
    );
  }

  const handleScanOnce = async () => {
    if (!cameraRef.current || isScanning) return;

    try {
      setIsScanning(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: true,
      });

      const result = await ExpoMlkitOcr.recognizeText(photo.uri);
      setOcrText(result?.text || 'No text detected.');
    } catch (error) {
      console.log('OCR error:', error);
      setOcrText('OCR failed. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="OCR Scanner"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedContainer>
        <View style={styles.cameraWrapper}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            zoom={0}
          />
        </View>

        <View style={styles.buttonRow}>
          <Button
            label={isScanning ? 'Scanning…' : 'Scan Text'}
            onPress={handleScanOnce}
            disabled={isScanning}
          />
        </View>

        <View style={styles.resultContainer}>
          <Text style={styles.resultTitle}>Extracted Text</Text>
          <ScrollView style={styles.resultBox}>
            <Text style={styles.resultText}>
              {ocrText || 'Point the camera at some text and tap "Scan Text".'}
            </Text>
          </ScrollView>
        </View>
      </RoundedContainer>
    </SafeAreaView>
  );
};

export default LiveOcrScreen;

const styles = StyleSheet.create({
  cameraWrapper: {
    height: 260,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  buttonRow: {
    marginBottom: 16,
  },
  resultContainer: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    marginBottom: 6,
    color: COLORS.primaryThemeColor,
  },
  resultBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 8,
    maxHeight: 200,
  },
  resultText: {
    fontSize: 13,
    color: '#111827',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  infoText: {
    fontSize: 14,
    textAlign: 'center',
    color: '#4B5563',
    marginTop: 8,
  },
});
