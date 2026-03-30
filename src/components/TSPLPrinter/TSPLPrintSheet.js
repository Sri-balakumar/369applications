import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import Text from '@components/Text';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import useTSPLPrinter from '@hooks/useTSPLPrinter';
import ReceiptTemplate from './ReceiptTemplate';
import ViewShot from 'react-native-view-shot';

const LABEL_SIZE_OPTIONS = ['50x80', '50x120', '50x150'];

const TSPLPrintSheet = ({ isVisible, onClose, invoice, cashierName, currency, partnerPhone }) => {
  const bottomSheetRef = useRef(null);
  const viewShotRef = useRef(null);
  const snapPoints = useMemo(() => ['55%', '80%'], []);
  const [selectedSize, setSelectedSize] = useState('50x80');

  const {
    isMockMode, isScanning, devices, connectedDevice,
    isConnecting, isPrinting, printProgress, error,
    scanForPrinters, connectToDevice, disconnect, printReceipt,
    LABEL_SIZES,
  } = useTSPLPrinter();

  useEffect(() => {
    if (isVisible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [isVisible]);

  const handleSheetChanges = useCallback((index) => {
    if (index === -1) onClose();
  }, [onClose]);

  const handleDevicePress = useCallback(async (device) => {
    if (connectedDevice?.id === device.id) {
      await disconnect();
    } else {
      await connectToDevice(device.id);
    }
  }, [connectedDevice, connectToDevice, disconnect]);

  const handlePrint = useCallback(async () => {
    try {
      await printReceipt(viewShotRef, selectedSize);
      Alert.alert('Print Successful', 'Label has been printed successfully.', [
        { text: 'OK', onPress: () => onClose() },
      ]);
    } catch (err) {
      Alert.alert(
        'Print Failed',
        `Could not print the label.\n\nError: ${err?.message || 'Unknown error'}\n\nPlease check:\n• Printer is turned on\n• Bluetooth is connected\n• Paper/label is loaded`,
        [{ text: 'OK' }]
      );
    }
  }, [printReceipt, selectedSize, onClose]);

  const renderDevice = ({ item }) => {
    const isConnected = connectedDevice?.id === item.id;
    return (
      <TouchableOpacity
        style={[styles.deviceItem, isConnected && styles.deviceItemActive]}
        onPress={() => handleDevicePress(item)}
        disabled={isConnecting}
      >
        <View style={styles.deviceRow}>
          <View style={[styles.dot, isConnected && styles.dotActive]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.deviceName, isConnected && styles.deviceNameActive]}>
              {item.name}
            </Text>
            <Text style={styles.deviceRssi}>Signal: {item.rssi} dBm</Text>
          </View>
          {isConnecting && connectedDevice === null && (
            <ActivityIndicator size="small" color={COLORS.primaryThemeColor} />
          )}
          {isConnected && (
            <Text style={styles.connectedBadge}>Connected</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      {/* Off-screen receipt for ViewShot capture */}
      <View style={styles.offscreen} pointerEvents="none">
        <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1, result: 'tmpfile' }}>
          <ReceiptTemplate
            invoice={invoice}
            cashierName={cashierName}
            currency={currency}
            partnerPhone={partnerPhone}
            labelSize={LABEL_SIZES[selectedSize]}
          />
        </ViewShot>
      </View>

      <BottomSheetModal
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={handleSheetChanges}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.handleIndicator}
      >
        <BottomSheetView style={styles.content}>
          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={styles.title}>Label Printer</Text>
            {isMockMode && (
              <View style={styles.mockBadge}>
                <Text style={styles.mockBadgeText}>MOCK MODE</Text>
              </View>
            )}
          </View>

          {/* Label Size Selector */}
          <Text style={styles.sectionLabel}>Label Size</Text>
          <View style={styles.sizeRow}>
            {LABEL_SIZE_OPTIONS.map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.sizeBtn, selectedSize === size && styles.sizeBtnActive]}
                onPress={() => setSelectedSize(size)}
              >
                <Text style={[styles.sizeBtnText, selectedSize === size && styles.sizeBtnTextActive]}>
                  {size.replace('x', ' x ')} mm
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Scan Button */}
          <TouchableOpacity
            style={styles.scanBtn}
            onPress={scanForPrinters}
            disabled={isScanning}
          >
            {isScanning ? (
              <View style={styles.scanBtnRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.scanBtnText}>  Scanning...</Text>
              </View>
            ) : (
              <Text style={styles.scanBtnText}>Scan for Printers</Text>
            )}
          </TouchableOpacity>

          {/* Device List */}
          {devices.length > 0 && (
            <View style={styles.deviceList}>
              <Text style={styles.sectionLabel}>Found Devices</Text>
              <FlatList
                data={devices}
                keyExtractor={(item) => item.id}
                renderItem={renderDevice}
                scrollEnabled={false}
              />
            </View>
          )}

          {/* Error */}
          {error && <Text style={styles.errorText}>{error}</Text>}

          {/* Print Button */}
          <TouchableOpacity
            style={[styles.printBtn, !connectedDevice && styles.printBtnDisabled]}
            onPress={handlePrint}
            disabled={!connectedDevice || isPrinting}
          >
            {isPrinting ? (
              <View style={styles.scanBtnRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.printBtnText}>
                  {'  '}Printing{printProgress > 0 ? ` ${printProgress}%` : '...'}
                </Text>
              </View>
            ) : (
              <Text style={styles.printBtnText}>Print Label</Text>
            )}
          </TouchableOpacity>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
};

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    opacity: 0,
    left: 0,
    top: 0,
    zIndex: -1,
  },
  sheetBg: {
    backgroundColor: '#fff',
    borderRadius: 20,
  },
  handleIndicator: {
    backgroundColor: '#ccc',
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  // Title
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
  },
  mockBadge: {
    backgroundColor: '#FFF3CD',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  mockBadgeText: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#856404',
  },
  // Section
  sectionLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#555',
    marginBottom: 8,
  },
  // Size selector
  sizeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  sizeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#ddd',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  sizeBtnActive: {
    borderColor: COLORS.primaryThemeColor,
    backgroundColor: COLORS.primaryThemeColor,
  },
  sizeBtnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#666',
  },
  sizeBtnTextActive: {
    color: '#fff',
  },
  // Scan button
  scanBtn: {
    backgroundColor: '#1E88E5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  scanBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBtnText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  // Device list
  deviceList: {
    marginBottom: 14,
  },
  deviceItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 6,
  },
  deviceItemActive: {
    borderColor: COLORS.primaryThemeColor,
    backgroundColor: '#f0eef8',
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ccc',
  },
  dotActive: {
    backgroundColor: '#4CAF50',
  },
  deviceName: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
  },
  deviceNameActive: {
    color: COLORS.primaryThemeColor,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
  deviceRssi: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
  },
  connectedBadge: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#4CAF50',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  // Error
  errorText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#D32F2F',
    marginBottom: 10,
    textAlign: 'center',
  },
  // Print button
  printBtn: {
    backgroundColor: '#7B2D8E',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  printBtnDisabled: {
    backgroundColor: '#ccc',
  },
  printBtnText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});

export default TSPLPrintSheet;
