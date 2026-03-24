import { View, StyleSheet, Dimensions, Image } from 'react-native'
import React, { useState, useEffect } from 'react'
import Carousel, { Pagination } from 'react-native-snap-carousel';
import { fetchAppBannersOdoo } from '@api/services/generalApi';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

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

    useEffect(() => {
        fetchAppBannersOdoo().then(banners => {
            if (banners && banners.length > 0) {
                setData(banners.map(b => ({
                    id: b.id,
                    image: { uri: `data:image/png;base64,${b.image}` },
                })));
            }
        }).catch(() => {});
    }, []);

    const carouselMargin = 8;

    return (
        <View>
            <Carousel
                data={data}
                renderItem={({ item }) => (
                    <View style={styles.item}>
                        <Image source={item.image} style={styles.image} />
                    </View>
                )}
                sliderWidth={screenWidth - 2 * carouselMargin}
                itemWidth={screenWidth - 2 * carouselMargin}
                autoplay={true}
                containerCustomStyle={styles.carouselContainer}
                autoplayInterval={3000}
                onSnapToItem={(index) => setActiveSlide(index)}
            />
            <View style={styles.paginationContainer}>
                <Pagination
                    dotsLength={data.length}
                    activeDotIndex={activeSlide}
                    containerStyle={styles.paginationDotsContainer}
                    dotStyle={styles.paginationDot}
                    inactiveDotOpacity={0.4}
                    inactiveDotScale={0.6}
                />
            </View>
        </View>
    )
}

export default CarouselPagination

const styles = StyleSheet.create({
    image: {
        width: '100%',
        height: screenHeight * 0.20,
        borderRadius: 5,
        borderWidth: 1,
        // resizeMode: 'contain'
    },
    carouselContainer: {
        marginHorizontal: 8,
        marginVertical: 20
    },
    paginationContainer: {
        position: 'absolute',
        top: screenHeight * 0.16,
        width: '100%',
        alignItems: 'center',
    },
    paginationDotsContainer: {
        backgroundColor: 'transparent',
        paddingHorizontal: 10,
    },
    paginationDot: {
        height: 8,
        borderRadius: 4,
        marginHorizontal: 6,
        backgroundColor: '#5D5FEE',
    },
});
