import React, { useState, useRef } from 'react';
import { View, TouchableOpacity, StyleSheet, FlatList, Dimensions, Platform, Image, Alert, Linking } from 'react-native';
import Modal from 'react-native-modal';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Text from '@components/Text';
import { NavigationHeader } from '@components/Header';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import Toast from 'react-native-toast-message';

const ActionModal = ({ title, setImageUrl, onBeforePicker }) => {
    const [isActionVisible, setIsActionVisible] = useState(false);
    const pendingActionRef = useRef(null);
    const screenHeight = Dimensions.get('window').height;

    const openModal = () => setIsActionVisible(true);
    const closeModal = () => setIsActionVisible(false);

    const showPermissionDeniedAlert = (permissionType) => {
        Alert.alert(
            'Permission Required',
            `${permissionType} permission is needed. Please enable it in your device Settings.`,
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ]
        );
    };

    const takePhoto = async () => {
        if (onBeforePicker) await onBeforePicker();
        try {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') {
                showPermissionDeniedAlert('Camera');
                return;
            }
            const result = await ImagePicker.launchCameraAsync({
                allowsEditing: false,
                quality: 0.8,
            });
            handleImagePicked(result);
        } catch (error) {
            console.error('Error taking photo:', error);
            Toast.show({ type: 'error', text1: 'Camera Error', text2: error?.message || 'Failed to open camera', position: 'bottom' });
        }
    };

    const pickImage = async () => {
        if (onBeforePicker) await onBeforePicker();
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                showPermissionDeniedAlert('Photo Library');
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                allowsEditing: false,
                quality: 0.8,
            });
            handleImagePicked(result);
        } catch (error) {
            console.error('Error picking image:', error);
            Toast.show({ type: 'error', text1: 'Gallery Error', text2: error?.message || 'Failed to open gallery', position: 'bottom' });
        }
    };

    const pickDocument = async () => {
        if (onBeforePicker) await onBeforePicker();
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: ['image/*', 'application/pdf'],
                copyToCacheDirectory: true,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                const asset = result.assets[0];
                console.log(`[ActionModal] Document picked: ${asset.name}, uri=${asset.uri}`);
                setImageUrl(asset.uri);
            }
        } catch (error) {
            console.error('Error picking document:', error);
            Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to pick document', position: 'bottom' });
        }
    };

    const handleOptionPress = (action) => {
        pendingActionRef.current = action;
        closeModal();
    };

    const onModalHide = () => {
        const action = pendingActionRef.current;
        if (action) {
            pendingActionRef.current = null;
            // Delay to ensure modal is fully unmounted before launching picker
            setTimeout(() => {
                action();
            }, 300);
        }
    };

    const handleImagePicked = (pickerResult) => {
        if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
            const asset = pickerResult.assets[0];
            if (asset.uri) {
                console.log(`[ActionModal] Image picked: uri=${asset.uri}`);
                setImageUrl(asset.uri);
            }
        }
    };

    const options = [
        { title: 'Take Photo', image: require('@assets/icons/modal/camera.png'), onPress: () => handleOptionPress(takePhoto) },
        { title: 'Gallery', image: require('@assets/icons/modal/gallery_upload.png'), onPress: () => handleOptionPress(pickImage) },
        { title: 'Documents', image: require('@assets/icons/modal/file_upload.png'), onPress: () => handleOptionPress(pickDocument) },
        { title: 'Cancel', image: require('@assets/icons/modal/cancel.png'), onPress: closeModal },
    ];

    const ListAction = ({ title, image, onPress }) => {
        return (
            <TouchableOpacity style={styles.container} onPress={onPress}>
                <Image source={image} style={styles.image} />
                <Text style={styles.title}>{title}</Text>
            </TouchableOpacity>
        );
    };

    return (
        <>
            <Modal
                isVisible={isActionVisible}
                onBackdropPress={closeModal}
                onSwipeComplete={closeModal}
                onModalHide={onModalHide}
                swipeThreshold={300}
                swipeDirection={['down']}
                animationIn="slideInUp"
                animationOut="slideOutDown"
                style={{
                    margin: 0,
                    borderTopRightRadius: 30,
                    borderTopLeftRadius: 30,
                    backgroundColor: 'white',
                    justifyContent: 'flex-start',
                    marginTop: screenHeight / 1.8,
                }}
            >
                <View style={{ backgroundColor: COLORS.primaryThemeColor, borderTopRightRadius: 25, borderTopLeftRadius: 25, padding: 8 }}>
                    <NavigationHeader
                        title="Choose Options"
                        onBackPress={closeModal}
                    />
                </View>
                <FlatList
                    data={options}
                    numColumns={4}
                    keyExtractor={(item, index) => index.toString()}
                    contentContainerStyle={{ padding: 8 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item }) => (<ListAction title={item.title} image={item.image} onPress={item.onPress} />)}
                />
            </Modal>
            <Text style={styles.label}>{title}</Text>
            <TouchableOpacity style={{ width: 80, height: 80 }} onPress={openModal}>
                <Image source={require('@assets/icons/modal/image_upload.png')} style={{ width: 80, height: 80, tintColor: COLORS.orange }} />
            </TouchableOpacity>
        </>
    );
};

export default ActionModal;

export const styles = StyleSheet.create({
    modalContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.white,
        borderRadius: 20,
        padding: 20,
        ...Platform.select({
            android: {
                elevation: 4,
            },
            ios: {
                shadowColor: 'black',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
            },
        })
    },
    container: {
        borderColor: COLORS.primaryThemeColor,
        borderWidth: 1,
        height: 120,
        borderRadius: 30,
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        margin: 8,
        borderStyle: 'dotted'
    },
    image: {
        width: 35,
        height: 35,
        tintColor: COLORS.primaryThemeColor,
        marginBottom: 15,
    },
    title: {
        fontSize: 18,
        fontFamily: FONT_FAMILY.urbanistBold,
        color: COLORS.black,
        alignSelf: 'center'
    },
    label: {
        marginVertical: 5,
        fontSize: 16,
        color: '#2e2a4f',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
});
