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
        margin: 5,
        paddingVertical: 12,
        paddingHorizontal: 6,
        borderRadius: 12,
        backgroundColor: '#fff',
        ...Platform.select({
            android: { elevation: 3 },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 4 },
        }),
    },
    imageWrapper: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginBottom: 8,
    },
    loader: {
        position: 'absolute',
    },
    image: {
        width: 60,
        height: 60,
        borderRadius: 30,
        resizeMode: 'cover',
    },
    name: {
        fontSize: 12,
        textAlign: 'center',
        color: '#333',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        lineHeight: 16,
    },
});
