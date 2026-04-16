import React, { useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const CategoryList = ({ item, onPress }) => {
    // Only consider it a real image if it's a base64 data URI
    const hasRealImage = item?.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('data:image');
    const [imageFailed, setImageFailed] = useState(!hasRealImage);

    return (
        <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.7}>
            <View style={styles.imageWrapper}>
                {imageFailed ? (
                    <Text style={styles.noImageText}>No Image</Text>
                ) : (
                    <Image
                        source={{ uri: item.image_url }}
                        style={styles.image}
                        onError={() => setImageFailed(true)}
                    />
                )}
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
    image: {
        width: 70,
        height: 70,
        borderRadius: 35,
        resizeMode: 'cover',
    },
    noImageText: {
        fontSize: 10,
        color: '#999',
        fontFamily: FONT_FAMILY.urbanistMedium,
        textAlign: 'center',
    },
    name: {
        fontSize: 13,
        textAlign: 'center',
        color: '#2e2a4f',
        fontFamily: FONT_FAMILY.urbanistBold,
        lineHeight: 17,
    },
});
