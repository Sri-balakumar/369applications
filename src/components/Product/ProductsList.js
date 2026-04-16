import React, { useState } from 'react';
import { View, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';

const ProductsList = ({ item, onPress, showQuickAdd, onQuickAdd }) => {
    // Only consider the image "real" if it's a base64 data URI (product has image stored)
    const hasRealImage = item?.image_url && typeof item.image_url === 'string' && item.image_url.startsWith('data:image');
    const [imageFailed, setImageFailed] = useState(!hasRealImage);

    const currency = useCurrencyStore((state) => state.currency);
    const priceValue = (item?.price ?? item?.list_price ?? 0);
    const stockQty = item?.qty_available ?? item?.total_product_quantity ?? null;

    return (
        <TouchableOpacity onPress={onPress} style={styles.container} activeOpacity={0.7}>
            {showQuickAdd && (
                <TouchableOpacity style={styles.plusBtn} onPress={() => onQuickAdd?.(item)}>
                    <Text style={styles.plusText}>+</Text>
                </TouchableOpacity>
            )}
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
                {stockQty !== null && (
                    <View style={[styles.stockBadge, { backgroundColor: stockQty > 0 ? '#4CAF50' : '#F44336' }]}>
                        <Text style={styles.stockText}>{stockQty}</Text>
                    </View>
                )}
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.name} numberOfLines={2}>{item?.product_name?.trim()}</Text>
                <Text style={styles.price}>{Number(priceValue).toFixed(3)} {currency || ''}</Text>
            </View>
        </TouchableOpacity>
    );
};

export default ProductsList;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        margin: 5,
        borderRadius: 14,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#f0f0f0',
        overflow: 'hidden',
        ...Platform.select({
            android: { elevation: 3 },
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
        }),
    },
    imageWrapper: {
        width: '100%',
        height: 110,
        backgroundColor: '#f9f9f9',
        justifyContent: 'center',
        alignItems: 'center',
    },
    image: {
        width: '80%',
        height: 100,
        resizeMode: 'contain',
    },
    noImageText: {
        color: '#999',
        fontSize: 12,
        fontFamily: FONT_FAMILY.urbanistMedium,
    },
    textContainer: {
        width: '100%',
        paddingHorizontal: 8,
        paddingVertical: 10,
        alignItems: 'center',
    },
    name: {
        fontSize: 12,
        textAlign: 'center',
        color: '#2e2a4f',
        fontFamily: FONT_FAMILY.urbanistBold,
        lineHeight: 16,
    },
    price: {
        fontSize: 13,
        textAlign: 'center',
        color: COLORS.primaryThemeColor,
        marginTop: 4,
        fontFamily: FONT_FAMILY.urbanistExtraBold,
    },
    plusBtn: {
        position: 'absolute',
        top: 6,
        right: 6,
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: COLORS.orange,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    plusText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    stockBadge: {
        position: 'absolute',
        bottom: 4,
        left: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 8,
    },
    stockText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: FONT_FAMILY.urbanistBold,
    },
});
