import React, { useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { AntDesign } from '@expo/vector-icons';
import Text from './Text';
import SignaturePad from './SignaturePad';
import { COLORS, FONT_FAMILY } from '@constants/theme';

// Full-screen modal that hosts the signature pad. Opens when the user taps
// "Tap to sign" on the parent form; closes when they tap Save (receiving the
// base64 PNG via `onSave`) or Cancel. No ScrollView conflict because the
// modal owns the whole screen.
const SignatureModal = ({ visible, onClose, onSave, title = 'Signature' }) => {
  // Buffer the latest base64 from SignaturePad's onSignatureBase64 callback.
  // We only forward it to the parent when the user taps Save.
  const [latestBase64, setLatestBase64] = useState(null);
  // Remount SignaturePad on each open (ensures fresh canvas + default black ink).
  const [padKey, setPadKey] = useState(0);

  const handleOpen = () => {
    setLatestBase64(null);
    setPadKey((k) => k + 1);
  };

  const handleSave = () => {
    if (!latestBase64) {
      // Nothing drawn — just close.
      onClose && onClose();
      return;
    }
    onSave && onSave(latestBase64);
    onClose && onClose();
  };

  const handleClear = () => {
    setLatestBase64(null);
    setPadKey((k) => k + 1);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      onShow={handleOpen}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
            <AntDesign name="close" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.headerBtn}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <SignaturePad
            key={padKey}
            title=""
            setUrl={() => {}}
            setScrollEnabled={() => {}}
            onSignatureBase64={setLatestBase64}
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity style={[styles.footerBtn, styles.clearBtn]} onPress={handleClear}>
            <AntDesign name="delete" size={16} color="#fff" />
            <Text style={styles.footerBtnText}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.footerBtn, styles.saveBtn]} onPress={handleSave}>
            <AntDesign name="check" size={16} color="#fff" />
            <Text style={styles.footerBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f6fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryThemeColor,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  headerBtn: { padding: 6, minWidth: 50 },
  title: { color: '#fff', fontSize: 16, fontFamily: FONT_FAMILY.urbanistBold },
  saveText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'right' },
  body: { flex: 1, padding: 12 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  clearBtn: { backgroundColor: '#9E9E9E' },
  saveBtn: { backgroundColor: '#4CAF50' },
  footerBtnText: { color: '#fff', fontSize: 14, fontFamily: FONT_FAMILY.urbanistBold },
});

export default SignatureModal;
