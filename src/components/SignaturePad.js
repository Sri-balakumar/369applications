import React, { useRef, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Image } from "react-native";
import SignatureScreen from "react-native-signature-canvas";
import Text from "./Text";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { uploadApi } from "@api/uploads";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

const INK_COLORS = ['#000000', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#1e1b4b', '#404040'];

const PEN_SIZES = [
    { label: '1px', min: 0.5, max: 1 },
    { label: '2px', min: 1, max: 2.5 },
    { label: '3px', min: 2, max: 4 },
];

export const CustomClearButton = ({ title, onPress }) => {
    return (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: COLORS.orange }]}
            onPress={onPress}
        >
            <Text style={[styles.buttonText, { color: "white" }]}>{title}</Text>
        </TouchableOpacity>
    );
};

const SignaturePad = ({ setUrl, setScrollEnabled, title, previousSignature = '', onSignatureBase64 }) => {
    const [isSign, setSign] = useState(false);
    const [penColor, setPenColor] = useState('#000000');
    const [activeSizeIdx, setActiveSizeIdx] = useState(1);
    const [isEraser, setIsEraser] = useState(false);
    const ref = useRef();
    const [isCanvasActive, setIsCanvasActive] = useState(false);
    const [uploadedImage, setUploadedImage] = useState(null);
    const hasInteracted = useRef(false);

    const activateCanvas = () => {
        setScrollEnabled(false);
        setIsCanvasActive(true);
        hasInteracted.current = true;
    };

    const handleColorSelect = (color) => {
        setPenColor(color);
        setIsEraser(false);
        ref.current?.changePenColor(color);
    };

    const handleSizeSelect = (idx) => {
        setActiveSizeIdx(idx);
        const size = PEN_SIZES[idx];
        ref.current?.changePenSize(size.min, size.max);
    };

    const handleEraser = () => {
        setIsEraser(true);
        ref.current?.changePenColor('#FFFFFF');
    };

    const handlePen = () => {
        setIsEraser(false);
        ref.current?.changePenColor(penColor);
    };

    const handleOK = (signature) => {
        if (onSignatureBase64) {
            onSignatureBase64(signature);
        }
        const path = FileSystem.cacheDirectory + `signature${Date.now()}.png`;
        FileSystem.writeAsStringAsync(
            path,
            signature.replace("data:image/png;base64,", ""),
            { encoding: FileSystem.EncodingType.Base64 }
        )
            .then(() => {
                console.log("Writing signature to file completed. Path:", path);
                return FileSystem.getInfoAsync(path);
            })
            .then(async () => {
                try {
                    const uploadUrl = await uploadApi(path);
                    console.log("API response upload url:", uploadUrl);
                    if (uploadUrl) {
                        setUrl(uploadUrl);
                    }
                } catch (error) {
                    console.log("API error:", error);
                }
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    };

    const handleClear = () => {
        ref.current.clearSignature();
        setSign(null);
        setIsEraser(false);
        ref.current?.changePenColor(penColor);
        setIsCanvasActive(false);
        setUploadedImage(null);
        setScrollEnabled(true);
    };

    const handleUpload = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Gallery access is required to upload a signature.' });
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
                quality: 0.8,
                base64: true,
            });
            if (result.canceled) return;

            const asset = result.assets[0];

            // Pass base64 to parent (this is the primary data used for Odoo submission)
            if (onSignatureBase64 && asset.base64) {
                onSignatureBase64(`data:image/png;base64,${asset.base64}`);
            }

            // Show uploaded image in canvas and mark as interacted FIRST
            // (so the preview shows even if uploadApi fails)
            ref.current?.clearSignature();
            setUploadedImage(asset.uri);
            hasInteracted.current = true;
            setIsCanvasActive(true);
            setSign(true);

            // Upload the file to backend (non-blocking — failure is OK since base64 is already captured)
            try {
                const uploadUrl = await uploadApi(asset.uri);
                if (uploadUrl) {
                    setUrl(uploadUrl);
                }
            } catch (uploadErr) {
                console.warn('Signature file upload failed (base64 still captured):', uploadErr?.message);
            }
            Toast.show({ type: 'success', text1: 'Uploaded', text2: 'Signature image uploaded successfully.' });
        } catch (error) {
            console.error('Signature upload error:', error);
            Toast.show({ type: 'error', text1: 'Upload Failed', text2: error?.message || 'Could not upload signature image.' });
        }
    };

    const handleEnd = () => {
        ref.current.readSignature();
        setSign(true);
        // Re-enable scroll shortly after lifting finger so user can scroll the form
        setTimeout(() => setScrollEnabled(true), 600);
    };

    const webStyle = `
        .m-signature-pad { box-shadow: none; border: none; width: 100%; height: 100%; margin: 0; padding: 0; }
        .m-signature-pad--body { border: none; width: 100%; height: 100%; }
        .m-signature-pad--footer { display: none; }
        body, html { width: 100%; height: 100%; margin: 0; padding: 0; overflow: hidden; }
        canvas { width: 100% !important; height: 100% !important; }
    `;
    const showCanvas = !previousSignature || hasInteracted.current;

    return (
        <>
            <Text style={styles.label}>{title}</Text>

            {/* Signature Tools */}
            {showCanvas && (
                <View style={styles.toolsCard}>
                    <Text style={styles.toolsTitle}>SIGNATURE TOOLS</Text>

                    {/* Pen */}
                    <TouchableOpacity
                        style={[styles.toolBtn, !isEraser && styles.toolBtnActive]}
                        onPress={handlePen}
                    >
                        <MaterialCommunityIcons name="pen" size={16} color={!isEraser ? '#714B67' : '#6c757d'} />
                        <Text style={[styles.toolBtnText, !isEraser && styles.toolBtnTextActive]}>Pen</Text>
                    </TouchableOpacity>

                    {/* Size */}
                    <View style={styles.toolRow}>
                        <Text style={styles.toolLabel}>Size</Text>
                        <View style={styles.sizeRow}>
                            {PEN_SIZES.map((size, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.sizeBtn, activeSizeIdx === idx && styles.sizeBtnActive]}
                                    onPress={() => handleSizeSelect(idx)}
                                >
                                    <Text style={[styles.sizeBtnText, activeSizeIdx === idx && styles.sizeBtnTextActive]}>
                                        {size.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Ink Color */}
                    <View style={styles.toolRow}>
                        <Text style={styles.toolLabel}>Ink Color</Text>
                        <View style={styles.colorRow}>
                            {INK_COLORS.map((color) => (
                                <TouchableOpacity key={color} onPress={() => handleColorSelect(color)}>
                                    <View style={[
                                        styles.colorDot,
                                        { backgroundColor: color },
                                        penColor === color && !isEraser && styles.colorDotActive,
                                    ]} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Eraser */}
                    <TouchableOpacity
                        style={[styles.toolBtn, isEraser && styles.toolBtnActive]}
                        onPress={handleEraser}
                    >
                        <MaterialCommunityIcons name="eraser" size={16} color={isEraser ? '#714B67' : '#6c757d'} />
                        <Text style={[styles.toolBtnText, isEraser && styles.toolBtnTextActive]}>Eraser</Text>
                    </TouchableOpacity>

                    {/* Clear & Upload */}
                    <View style={styles.toolActions}>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleClear}>
                            <AntDesign name="delete" size={14} color="#dc3545" />
                            <Text style={[styles.actionBtnText, { color: '#dc3545' }]}>Clear</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.actionBtn} onPress={handleUpload}>
                            <AntDesign name="upload" size={14} color="#714B67" />
                            <Text style={[styles.actionBtnText, { color: '#714B67' }]}>Upload</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Canvas */}
            <Text style={styles.drawLabel}>
                {isCanvasActive ? 'SIGNING IN PROGRESS...' : 'TAP THE BOX BELOW TO START SIGNING'}
            </Text>
            <View
                style={styles.signContainer}
                onTouchStart={() => {
                    if (isCanvasActive) setScrollEnabled(false);
                }}
            >
                {previousSignature && !hasInteracted.current ? (
                    <Image
                        style={{ width: "100%", height: '100%' }}
                        source={{ uri: previousSignature }}
                    />
                ) : (
                    <>
                        <SignatureScreen
                            style={{ flex: 1, width: '100%' }}
                            webStyle={webStyle}
                            ref={ref}
                            penColor="#000000"
                            onOK={handleOK}
                            onEnd={handleEnd}
                        />
                        {uploadedImage && (
                            <Image
                                style={styles.uploadedImagePreview}
                                source={{ uri: uploadedImage }}
                                resizeMode="contain"
                            />
                        )}
                        {!isCanvasActive && !uploadedImage && (
                            <TouchableOpacity
                                style={styles.canvasOverlay}
                                activeOpacity={0.9}
                                onPress={activateCanvas}
                            >
                                <MaterialCommunityIcons name="draw-pen" size={28} color="#714B67" />
                                <Text style={styles.tapToSignText}>Tap here to start signing</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>
            <Text style={styles.hintText}>
                {isCanvasActive
                    ? 'Sign now. Use Clear button to redo.'
                    : 'Tap the signature box to activate, then draw your signature.'}
            </Text>
        </>
    );
};

export default SignaturePad;

const styles = StyleSheet.create({
    signContainer: {
        height: 320,
        width: "100%",
        borderWidth: 1,
        borderColor: "#c5d0e6",
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: '#fff',
    },
    uploadedImagePreview: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#fff',
        zIndex: 5,
    },
    canvasOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
        gap: 8,
    },
    tapToSignText: {
        color: '#714B67',
        fontSize: 14,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        letterSpacing: 0.3,
    },
    label: {
        marginTop: 8,
        marginBottom: 4,
        fontSize: 16,
        color: "#1B4F72",
        fontFamily: FONT_FAMILY.urbanistBold,
    },
    drawLabel: {
        fontSize: 12,
        color: '#495057',
        fontFamily: FONT_FAMILY.urbanistBold,
        letterSpacing: 0.5,
        marginBottom: 6,
        marginTop: 12,
    },
    hintText: {
        fontSize: 11,
        color: '#adb5bd',
        fontFamily: FONT_FAMILY.urbanistMedium,
        marginTop: 6,
        marginBottom: 4,
    },

    /* Tools Card */
    toolsCard: {
        backgroundColor: '#f0f4ff',
        borderWidth: 1,
        borderColor: '#c5d0e6',
        borderRadius: 8,
        padding: 14,
        marginTop: 8,
    },
    toolsTitle: {
        fontSize: 12,
        fontFamily: FONT_FAMILY.urbanistBold,
        color: '#714B67',
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    toolRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    toolLabel: {
        fontSize: 12,
        color: '#495057',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
        marginRight: 10,
        minWidth: 65,
    },
    toolBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#c5d0e6',
        backgroundColor: '#fff',
        gap: 6,
        marginBottom: 12,
    },
    toolBtnActive: {
        borderColor: '#714B67',
        backgroundColor: '#f5eef4',
    },
    toolBtnText: {
        fontSize: 13,
        color: '#6c757d',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    toolBtnTextActive: {
        color: '#714B67',
    },

    /* Size */
    sizeRow: {
        flexDirection: 'row',
        gap: 8,
    },
    sizeBtn: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#c5d0e6',
        backgroundColor: '#fff',
    },
    sizeBtnActive: {
        borderColor: '#714B67',
        backgroundColor: '#f5eef4',
    },
    sizeBtnText: {
        fontSize: 12,
        color: '#6c757d',
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },
    sizeBtnTextActive: {
        color: '#714B67',
        fontFamily: FONT_FAMILY.urbanistBold,
    },

    /* Colors */
    colorRow: {
        flexDirection: 'row',
        gap: 8,
    },
    colorDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    colorDotActive: {
        borderColor: '#714B67',
        borderWidth: 3,
    },

    /* Actions */
    toolActions: {
        flexDirection: 'row',
        gap: 16,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    actionBtnText: {
        fontSize: 13,
        fontFamily: FONT_FAMILY.urbanistSemiBold,
    },

    /* Legacy (kept for backward compat) */
    button: {
        width: 100,
        paddingHorizontal: 20,
        alignItems: "center",
        paddingVertical: 5,
        borderRadius: 5,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 1.5,
        shadowRadius: 2,
        elevation: 5,
    },
    buttonText: {
        fontFamily: FONT_FAMILY.urbanistBold,
        textAlign: "center",
        fontSize: 12,
        color: COLORS.white,
    },
});
