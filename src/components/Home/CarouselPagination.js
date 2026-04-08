import { View, StyleSheet, Dimensions, Image, TouchableOpacity } from 'react-native'
import React, { useState, useCallback } from 'react'
import Carousel, { Pagination } from 'react-native-snap-carousel';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import { fetchAppBannersOdoo } from '@api/services/generalApi';
import { COLORS } from '@constants/theme';

const { width: screenWidth } = Dimensions.get('window');

const CarouselPagination = () => {
    const navigation = useNavigation();
    const [activeSlide, setActiveSlide] = useState(0);
    const [data, setData] = useState([]);
    const [loaded, setLoaded] = useState(false);

    useFocusEffect(useCallback(() => {
        fetchAppBannersOdoo()
            .then(banners => {
                if (banners && banners.length > 0) {
                    setData(banners.map(b => ({
                        id: b.id,
                        image: { uri: `data:image/png;base64,${b.image}` },
                    })));
                } else {
                    setData([]);
                }
            })
            .catch(() => { setData([]); })
            .finally(() => { setLoaded(true); });
    }, []));

    const sliderWidth = screenWidth - 24;

    // Until the first fetch completes, render nothing — avoids flashing the
    // plus button before real banners arrive.
    if (!loaded) {
        return <View style={styles.wrapper} />;
    }

    // No banners → show only a plus tile that opens Banner Management.
    if (data.length === 0) {
        return (
            <View style={styles.wrapper}>
                <TouchableOpacity
                    style={styles.addBannerCard}
                    activeOpacity={0.7}
                    onPress={() => navigation.navigate('BannerManagementScreen')}
                >
                    <MaterialIcons name="add" size={48} color={COLORS.primaryThemeColor} />
                </TouchableOpacity>
            </View>
        );
    }

    // Banners exist → carousel only, no plus button.
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
    addBannerCard: {
        marginHorizontal: 12,
        height: 170,
        borderRadius: 14,
        borderWidth: 2,
        borderStyle: 'dashed',
        borderColor: COLORS.primaryThemeColor,
        backgroundColor: '#f5f6fa',
        justifyContent: 'center',
        alignItems: 'center',
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
