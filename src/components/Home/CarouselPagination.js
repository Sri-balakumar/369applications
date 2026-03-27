import { View, StyleSheet, Dimensions, Image } from 'react-native'
import React, { useState, useCallback } from 'react'
import Carousel, { Pagination } from 'react-native-snap-carousel';
import { useFocusEffect } from '@react-navigation/native';
import { fetchAppBannersOdoo } from '@api/services/generalApi';
import { COLORS } from '@constants/theme';

const { width: screenWidth } = Dimensions.get('window');

const FALLBACK_DATA = [
    { image: require('@assets/images/Home/Banner/banner_phone_1.jpg') },
    { image: require('@assets/images/Home/Banner/banner_phone_2.jpg') },
    { image: require('@assets/images/Home/Banner/banner_phone_3.jpg') },
    { image: require('@assets/images/Home/Banner/banner_phone_4.jpg') },
    { image: require('@assets/images/Home/Banner/banner_phone_5.jpg') }
];

const CarouselPagination = () => {
    const [activeSlide, setActiveSlide] = useState(0);
    const [data, setData] = useState(FALLBACK_DATA);

    useFocusEffect(useCallback(() => {
        fetchAppBannersOdoo().then(banners => {
            if (banners && banners.length > 0) {
                setData(banners.map(b => ({
                    id: b.id,
                    image: { uri: `data:image/png;base64,${b.image}` },
                })));
            }
        }).catch(() => {});
    }, []));

    const sliderWidth = screenWidth - 24;

    return (
        <View style={styles.wrapper}>
            <Carousel
                data={data}
                renderItem={({ item }) => (
                    <View style={styles.item}>
                        <Image source={item.image} style={styles.image} />
                    </View>
                )}
                sliderWidth={sliderWidth}
                itemWidth={sliderWidth}
                autoplay={true}
                loop={true}
                autoplayInterval={3000}
                autoplayDelay={1000}
                enableSnap={true}
                containerCustomStyle={styles.carouselContainer}
                onSnapToItem={(index) => setActiveSlide(index)}
            />
            <Pagination
                dotsLength={data.length}
                activeDotIndex={activeSlide}
                containerStyle={styles.paginationContainer}
                dotStyle={styles.activeDot}
                inactiveDotStyle={styles.inactiveDot}
                inactiveDotOpacity={0.4}
                inactiveDotScale={0.7}
            />
        </View>
    )
}

export default CarouselPagination

const styles = StyleSheet.create({
    wrapper: {
        marginTop: 12,
        marginBottom: 4,
    },
    carouselContainer: {
        marginHorizontal: 12,
    },
    item: {
        borderRadius: 14,
        overflow: 'hidden',
    },
    image: {
        width: '100%',
        height: 170,
        borderRadius: 14,
        resizeMode: 'cover',
    },
    paginationContainer: {
        paddingVertical: 8,
    },
    activeDot: {
        width: 20,
        height: 6,
        borderRadius: 3,
        backgroundColor: COLORS.primaryThemeColor,
        marginHorizontal: 2,
    },
    inactiveDot: {
        width: 8,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#ccc',
    },
});
