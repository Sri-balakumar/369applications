import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Image, ActivityIndicator, TouchableOpacity } from 'react-native';
import Text from '@components/Text';
import { FONT_FAMILY, COLORS } from '@constants/theme';
import { useCurrencyStore } from '@stores/currency';

const ProductsList = ({ item, onPress, showQuickAdd, onQuickAdd }) => {
    const errorImage = require('@assets/images/error/error.png');
    const [imageLoading, setImageLoading] = useState(true);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setImageLoading(false);
        }, 10000); // Adjust the timeout as needed

        return () => clearTimeout(timeout);
    }, []);

    const truncatedName =
        item?.product_name?.length > 35 ? item?.product_name?.substring(0, 60) + '...' : item?.product_name;

    const currency = useCurrencyStore((state) => state.currency);
    const priceValue = (item?.price ?? item?.list_price ?? 0);


    return (
        <TouchableOpacity onPress={onPress} style={styles.container}>
            {showQuickAdd && (
                <TouchableOpacity style={styles.plusBtn} onPress={() => onQuickAdd?.(item)}>
                    <Text style={styles.plusText}>+</Text>
                </TouchableOpacity>
            )}
            {imageLoading && <ActivityIndicator size="small" color="black" style={styles.activityIndicator} />}
            <Image
                source={item?.image_url ? { uri: item.image_url } : errorImage}
                style={styles.image}
                onLoad={() => setImageLoading(false)}
                onError={() => setImageLoading(false)}
            />
                        <View style={styles.textContainer}>
                                <Text style={styles.name}>{truncatedName?.trim()}</Text>
                                <Text style={styles.price}>{priceValue?.toString ? Number(priceValue).toFixed(2) : priceValue} {currency || ''}</Text>
                                <Text style={styles.code}>
                                    {item.product_code ?? item.code ?? item.default_code ?? ''}
                                </Text>
                                <Text style={styles.category}>
                                    {
                                        item?.category?.category_name
                                        || (Array.isArray(item?.categ_id) ? item.categ_id[1] : null)
                                        || item?.category_name
                                        || ''
                                    }
                                </Text>
                        </View>
        </TouchableOpacity>
    );
};

export default ProductsList;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        position: 'relative',
        alignItems: 'center',
        margin: 6,
        borderWidth: 0.5,
        borderRadius: 10,
        paddingVertical: 10,
        borderColor: 'grey',
        backgroundColor: 'white',
        width: 150,  // Set a fixed width
        height: 180, // Adjusted height to make space for text
    },
    activityIndicator: {
        position: 'absolute',
        top: 30,
        left: 50,
    },
    image: {
        width: 85,  // Adjusted width as necessary
        height: 100, // Adjusted height as necessary
        resizeMode: 'contain',
        borderRadius: 8,
        alignSelf: 'center',  // Center image horizontally
    },
    textContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 5,
        // paddingVertical: 5,
    },
    name: {
        fontSize: 12,
        textAlign: 'center',
        textTransform: 'capitalize',
        color: '#2E2B2B',
        fontFamily: FONT_FAMILY.urbanistBold,
    },
    price: {
        fontSize: 12,
        textAlign: 'center',
        color: COLORS.green,
        marginTop: 4,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    plusBtn: {
        position: 'absolute',
        top: 8,
        right: 8,
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.orange, // changed from green to orange
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    plusText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
    },
    category: {
        fontSize: 11,
        textAlign: 'center',
        color: COLORS.primaryThemeColor,
        marginTop: 2,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    code: {
        fontSize: 11,
        textAlign: 'center',
        color: COLORS.orange,
        marginTop: 2,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
});
