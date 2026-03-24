import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { COLORS } from '@constants/theme';

const OverlayLoader = ({ visible, bakgroundColor = false }) => {
    if (!visible) return null;

    const backgroundColor = bakgroundColor ? 'rgba(0, 0, 0, 0.5)' : ''

    return (
        <View style={[styles.overlay, { backgroundColor: backgroundColor }]}>
            <ActivityIndicator animating={true} size="large" color={COLORS.primaryThemeColor} />
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
});

export default OverlayLoader;
