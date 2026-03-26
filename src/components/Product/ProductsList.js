import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, TouchableOpacity, Platform } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';

const ProductsList = ({ item, onPress, showQuickAdd, onQuickAdd }) => {
    const errorImage = require('@assets/images/error/error.png');
    const [imageLoading, setImageLoading] = useState(true);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setImageLoading(false);
        }, 10000);
        return () => clearTimeout(timeout);
    }, []);

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
                {imageLoading && <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={styles.activityIndicator} />}
                <Image
                    source={item?.image_url ? { uri: item.image_url } : errorImage}
                    style={styles.image}
                    onLoad={() => setImageLoading(false)}
                    onError={() => setImageLoading(false)}
                />
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
    activityIndicator: {
        position: 'absolute',
    },
    image: {
        width: '80%',
        height: 100,
        resizeMode: 'contain',
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
