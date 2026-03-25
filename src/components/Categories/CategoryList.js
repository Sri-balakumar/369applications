import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const CategoryList = ({ item, onPress }) => {
    const errorImage = require('@assets/images/error/error.png');

    useEffect(() => {
        const timeout = setTimeout(() => {
            setImageLoading(false);
        }, 10000);
        return () => clearTimeout(timeout);
    }, []);

    const [imageLoading, setImageLoading] = useState(true);

    return (
        <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.7}>
            <View style={styles.imageWrapper}>
                {imageLoading && <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={styles.loader} />}
                <Image
                    source={item?.image_url ? { uri: item.image_url } : errorImage}
                    style={styles.image}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                />
            </View>
            <Text style={styles.name} numberOfLines={2}>{item?.category_name}</Text>
        </TouchableOpacity>
    );
};

export default CategoryList;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        margin: 6,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#f0f0f0',
        ...Platform.select({
            android: { elevation: 3 },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
        }),
    },
    imageWrapper: {
        width: 70,
        height: 70,
        borderRadius: 35,
        backgroundColor: COLORS.primaryThemeColor + '10',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginBottom: 10,
        borderWidth: 1.5,
        borderColor: COLORS.primaryThemeColor + '25',
    },
    loader: {
        position: 'absolute',
    },
    image: {
        width: 70,
        height: 70,
        borderRadius: 35,
        resizeMode: 'cover',
    },
    name: {
        fontSize: 13,
        textAlign: 'center',
        color: '#2e2a4f',
        fontFamily: FONT_FAMILY.urbanistBold,
        lineHeight: 17,
    },
});
