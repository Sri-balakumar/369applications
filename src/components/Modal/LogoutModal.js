// LogoutModal.js
import React from 'react';
import { View, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Modal from 'react-native-modal';
import Text from '@components/Text';

const LogoutModal = ({
    isVisible,
    hideLogoutAlert,
    handleLogout,
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
            onBackButtonPress={hideLogoutAlert}
        >

            <View style={styles.alertContainer}>
                <View style={{ borderRadius: 80, backgroundColor: COLORS.white, position: 'absolute', top: -40, borderWidth: 2, borderColor: COLORS.orange }}>
                    <Image source={require('@assets/images/logo/logo.png')} style={{ resizeMode: 'contain', height: 80, width: 80, borderRadius: 80, }} />
                </View>
                <Text style={styles.alertText}>Are you sure you want to log out?</Text>
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={[styles.alertButton, { flex:1 }]}
                        onPress={handleLogout}
                    >
                        <Text style={styles.alertButtonText}>YES</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.alertButton, { flex:1 }]}
                        onPress={hideLogoutAlert}
                    >
                        <Text style={styles.alertButtonText}>NO</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};
export default LogoutModal;

const styles = StyleSheet.create({
    alertContainer: {
        backgroundColor: COLORS.white,
        borderRadius: 10,
        borderColor:COLORS.primaryThemeColor,
        borderWidth:2,
        // padding: 40,
        paddingVertical:30,
        alignItems: 'center',
        paddingHorizontal:10
    },
    alertText: {
        marginVertical: 18,
        // alignSelf:'flex-start',
        fontSize: 16,
        fontFamily:FONT_FAMILY.urbanistBold
    },
    buttonRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    alertButton: {
        backgroundColor: COLORS.primaryThemeColor,
        borderRadius: 10,
        // paddingVertical: 10,
        padding:15,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 5,
    },
    alertButtonText: {
        color: 'white',
        fontFamily:FONT_FAMILY.urbanistBold
    },
});
