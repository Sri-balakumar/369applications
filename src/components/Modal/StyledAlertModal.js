import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Modal from 'react-native-modal';
import Text from '@components/Text';

/**
 * Attractive confirmation popup matching the logout modal design.
 *
 * Props:
 *   isVisible       - boolean
 *   message         - string (main text)
 *   confirmText     - string (default "YES")
 *   cancelText      - string (default "NO")
 *   middleText      - string | null (optional 3rd button between confirm & cancel, e.g. "Gallery")
 *   onConfirm       - () => void
 *   onCancel        - () => void
 *   onMiddle        - () => void (only when middleText is set)
 *   destructive     - boolean (turns confirm button red)
 */
const StyledAlertModal = ({
  isVisible = false,
  message = '',
  confirmText = 'YES',
  cancelText = 'NO',
  middleText = null,
  onConfirm,
  onCancel,
  onMiddle,
  destructive = false,
}) => {
  return (
    <Modal
      isVisible={isVisible}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      backdropOpacity={0.7}
      animationInTiming={400}
      animationOutTiming={300}
      backdropTransitionInTiming={400}
      backdropTransitionOutTiming={300}
      onBackButtonPress={onCancel}
      onBackdropPress={onCancel}
    >
      <View style={styles.container}>
        {/* Logo circle */}
        <View style={styles.logoWrapper}>
          <Image
            source={require('@assets/images/logo/logo.png')}
            style={styles.logo}
          />
        </View>

        <Text style={styles.message}>{message}</Text>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, { flex: 1 }, destructive && styles.destructiveBtn]}
            onPress={onConfirm}
          >
            <Text style={styles.buttonText}>{confirmText}</Text>
          </TouchableOpacity>

          {middleText && onMiddle ? (
            <TouchableOpacity
              style={[styles.button, { flex: 1 }]}
              onPress={onMiddle}
            >
              <Text style={styles.buttonText}>{middleText}</Text>
            </TouchableOpacity>
          ) : null}

          {cancelText ? (
            <TouchableOpacity
              style={[styles.button, { flex: 1 }]}
              onPress={onCancel}
            >
              <Text style={styles.buttonText}>{cancelText}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    borderColor: COLORS.primaryThemeColor,
    borderWidth: 2,
    paddingVertical: 30,
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  logoWrapper: {
    borderRadius: 80,
    backgroundColor: COLORS.white,
    position: 'absolute',
    top: -40,
    borderWidth: 2,
    borderColor: COLORS.orange || '#FF9800',
  },
  logo: {
    resizeMode: 'contain',
    height: 80,
    width: 80,
    borderRadius: 80,
  },
  message: {
    marginVertical: 18,
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  button: {
    backgroundColor: COLORS.primaryThemeColor,
    borderRadius: 10,
    padding: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  destructiveBtn: {
    backgroundColor: '#E74C3C',
  },
  buttonText: {
    color: 'white',
    fontFamily: FONT_FAMILY.urbanistBold,
  },
});

export default StyledAlertModal;
