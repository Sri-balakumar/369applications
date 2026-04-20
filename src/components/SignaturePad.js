import React, { useRef, useState, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { StyleSheet, View, TouchableOpacity, Image, PanResponder } from "react-native";
import Svg, { Path } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import Text from "./Text";
import { COLORS, FONT_FAMILY } from "@constants/theme";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { uploadApi } from "@api/uploads";
import { AntDesign, MaterialCommunityIcons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";

const INK_COLORS = ['#000000', '#2563eb', '#dc2626', '#16a34a', '#9333ea', '#1e1b4b', '#404040'];

const PEN_SIZES = [
    { label: '1px', width: 1.5 },
    { label: '2px', width: 2.5 },
    { label: '3px', width: 3.5 },
];

const SignaturePad = forwardRef(({ setUrl, setScrollEnabled, title, previousSignature = '', onSignatureBase64 }, ref) => {
    const [penColor, setPenColor] = useState('#000000');
    const [activeSizeIdx, setActiveSizeIdx] = useState(1);
    const [isEraser, setIsEraser] = useState(false);
    const [isCanvasActive, setIsCanvasActive] = useState(false);
    const [uploadedImage, setUploadedImage] = useState(null);
    const [version, setVersion] = useState(0);

    const containerRef = useRef(null);   // bordered outer View (gestures only)
    const captureRefInner = useRef(null); // borderless inner View that gets snapshotted
    const offset = useRef({ x: 0, y: 0 });
    const pathsRef = useRef([]); // [{ color, width, points: [{x,y}, ...] }, ...]
    const activeRef = useRef(null);
    const frameRef = useRef(null);
    const hasInteracted = useRef(false);

    const strokeWidth = PEN_SIZES[activeSizeIdx].width;

    // Keep live pen config in refs so the PanResponder closure (created once
    // via useRef below) always reads the LATEST values — not the initial
    // render's snapshot. Without this, taps on color / size / eraser update
    // React state but strokes stay in the first-render color.
    const penColorRef = useRef(penColor);
    const isEraserRef = useRef(isEraser);
    const strokeWidthRef = useRef(strokeWidth);
    useEffect(() => { penColorRef.current = penColor; }, [penColor]);
    useEffect(() => { isEraserRef.current = isEraser; }, [isEraser]);
    useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

    const measureLayout = useCallback(() => {
        if (containerRef.current?.measureInWindow) {
            try {
                containerRef.current.measureInWindow((x, y) => {
                    offset.current = { x, y };
                });
            } catch (e) {}
        }
    }, []);

    const scheduleRender = useCallback(() => {
        if (frameRef.current) return;
        frameRef.current = requestAnimationFrame(() => {
            frameRef.current = null;
            setVersion((v) => v + 1);
        });
    }, []);

    // Snapshot the signature on demand and return the base64 URI. Used by
    // SignatureModal's Save button to guarantee we get the latest strokes
    // even if the user taps Save before the background captureAndNotify
    // completes. Returns null if nothing was drawn.
    const captureNow = async () => {
        if (pathsRef.current.length === 0 && !activeRef.current) return null;
        try {
            const uri = await captureRef(captureRefInner, { format: 'png', quality: 0.9, result: 'tmpfile' });
            const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
            return `data:image/png;base64,${b64}`;
        } catch (e) {
            console.warn('Signature captureNow failed:', e?.message);
            return null;
        }
    };

    useImperativeHandle(ref, () => ({
        capture: captureNow,
        clear: () => {
            pathsRef.current = [];
            activeRef.current = null;
            setVersion((v) => v + 1);
        },
    }), []);

    const captureAndNotify = async () => {
        if (pathsRef.current.length === 0) return;
        try {
            // Snapshot the INNER borderless surface — the outer container has
            // a dashed/solid border for the user, which otherwise shows up as
            // a faint line at the edges of the saved PNG.
            const uri = await captureRef(captureRefInner, { format: 'png', quality: 0.9, result: 'tmpfile' });
            if (setUrl) setUrl(uri);
            if (onSignatureBase64) {
                try {
                    const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
                    onSignatureBase64(`data:image/png;base64,${b64}`);
                } catch (readErr) {
                    console.warn('Signature read-as-base64 failed:', readErr?.message);
                }
            }
            // Fire upload in background — don't block the UI.
            (async () => {
                try {
                    const uploadUrl = await uploadApi(uri);
                    if (uploadUrl && setUrl) setUrl(uploadUrl);
                } catch (e) { /* ignore */ }
            })();
        } catch (e) {
            console.warn('Signature captureRef failed:', e?.message);
        }
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderTerminationRequest: () => false,
            onPanResponderGrant: (evt) => {
                hasInteracted.current = true;
                setIsCanvasActive(true);
                if (setScrollEnabled) setScrollEnabled(false);
                const { pageX, pageY } = evt.nativeEvent;
                activeRef.current = {
                    color: isEraserRef.current ? '#FFFFFF' : penColorRef.current,
                    width: strokeWidthRef.current,
                    points: [{ x: pageX - offset.current.x, y: pageY - offset.current.y }],
                };
                scheduleRender();
            },
            onPanResponderMove: (evt) => {
                if (!activeRef.current) return;
                const { pageX, pageY } = evt.nativeEvent;
                activeRef.current.points.push({ x: pageX - offset.current.x, y: pageY - offset.current.y });
                scheduleRender();
            },
            onPanResponderRelease: () => {
                if (activeRef.current && activeRef.current.points.length > 0) {
                    pathsRef.current.push(activeRef.current);
                }
                activeRef.current = null;
                scheduleRender();
                // Re-enable scroll after a brief delay so the user can scroll the form.
                setTimeout(() => { if (setScrollEnabled) setScrollEnabled(true); }, 200);
                // Capture the signature once the stroke finishes.
                captureAndNotify();
            },
            onPanResponderTerminate: () => {
                if (activeRef.current && activeRef.current.points.length > 0) {
                    pathsRef.current.push(activeRef.current);
                }
                activeRef.current = null;
                scheduleRender();
                if (setScrollEnabled) setScrollEnabled(true);
            },
        })
    ).current;

    const handleColorSelect = (color) => {
        setPenColor(color);
        setIsEraser(false);
    };

    const handleSizeSelect = (idx) => { setActiveSizeIdx(idx); };
    const handleEraser = () => { setIsEraser(true); };
    const handlePen = () => { setIsEraser(false); };

    const handleClear = () => {
        pathsRef.current = [];
        activeRef.current = null;
        setIsCanvasActive(false);
        setUploadedImage(null);
        if (setScrollEnabled) setScrollEnabled(true);
        setVersion((v) => v + 1);
    };

    const handleUpload = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Toast.show({ type: 'error', text1: 'Permission Denied', text2: 'Gallery access is required to upload a signature.' });
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, base64: true });
            if (result.canceled) return;

            const asset = result.assets[0];
            if (onSignatureBase64 && asset.base64) {
                onSignatureBase64(`data:image/png;base64,${asset.base64}`);
            }
            pathsRef.current = [];
            activeRef.current = null;
            setUploadedImage(asset.uri);
            hasInteracted.current = true;
            setIsCanvasActive(true);
            setVersion((v) => v + 1);
            (async () => {
                try {
                    const uploadUrl = await uploadApi(asset.uri);
                    if (uploadUrl && setUrl) setUrl(uploadUrl);
                } catch (e) { /* ignore */ }
            })();
            Toast.show({ type: 'success', text1: 'Uploaded', text2: 'Signature image uploaded successfully.' });
        } catch (error) {
            console.error('Signature upload error:', error);
            Toast.show({ type: 'error', text1: 'Upload Failed', text2: error?.message || 'Could not upload signature image.' });
        }
    };

    const toD = (pts) => {
        if (!pts || pts.length < 1) return '';
        let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
        for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
        return d;
    };

    const showCanvas = !previousSignature || hasInteracted.current;
    const allPaths = pathsRef.current;
    const active = activeRef.current;

    return (
        <>
            <Text style={styles.label}>{title}</Text>

            {showCanvas && (
                <View style={styles.toolsCard}>
                    <Text style={styles.toolsTitle}>SIGNATURE TOOLS</Text>

                    <TouchableOpacity
                        style={[styles.toolBtn, !isEraser && styles.toolBtnActive]}
                        onPress={handlePen}
                    >
                        <MaterialCommunityIcons name="pen" size={16} color={!isEraser ? '#714B67' : '#6c757d'} />
                        <Text style={[styles.toolBtnText, !isEraser && styles.toolBtnTextActive]}>Pen</Text>
                    </TouchableOpacity>

                    <View style={styles.toolRow}>
                        <Text style={styles.toolLabel}>Size</Text>
                        <View style={styles.sizeRow}>
                            {PEN_SIZES.map((size, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={[styles.sizeBtn, activeSizeIdx === idx && styles.sizeBtnActive]}
                                    onPress={() => handleSizeSelect(idx)}
                                >
                                    <Text style={[styles.sizeBtnText, activeSizeIdx === idx && styles.sizeBtnTextActive]}>{size.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

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

                    <TouchableOpacity
                        style={[styles.toolBtn, isEraser && styles.toolBtnActive]}
                        onPress={handleEraser}
                    >
                        <MaterialCommunityIcons name="eraser" size={16} color={isEraser ? '#714B67' : '#6c757d'} />
                        <Text style={[styles.toolBtnText, isEraser && styles.toolBtnTextActive]}>Eraser</Text>
                    </TouchableOpacity>

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

            <Text style={styles.drawLabel}>
                {isCanvasActive ? 'SIGNING IN PROGRESS...' : 'SIGN IN THE BOX BELOW'}
            </Text>

            <View
                ref={containerRef}
                collapsable={false}
                onLayout={measureLayout}
                style={styles.signContainer}
                {...panResponder.panHandlers}
            >
                {previousSignature && !hasInteracted.current ? (
                    <Image style={{ width: '100%', height: '100%' }} source={{ uri: previousSignature }} />
                ) : (
                    <View ref={captureRefInner} collapsable={false} style={styles.captureSurface}>
                        <Svg style={StyleSheet.absoluteFill}>
                            {allPaths.map((p, idx) => (
                                <Path key={idx} d={toD(p.points)} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" />
                            ))}
                            {active && active.points.length > 0 && (
                                <Path d={toD(active.points)} fill="none" stroke={active.color} strokeWidth={active.width} strokeLinecap="round" strokeLinejoin="round" />
                            )}
                        </Svg>
                        {uploadedImage && (
                            <Image style={styles.uploadedImagePreview} source={{ uri: uploadedImage }} resizeMode="contain" />
                        )}
                    </View>
                )}
            </View>
            <Text style={styles.hintText}>
                {isCanvasActive ? 'Use Clear button to redo.' : 'Draw your signature in the box above.'}
            </Text>
        </>
    );
});

export const CustomClearButton = ({ title, onPress }) => (
    <TouchableOpacity style={[styles.button, { backgroundColor: COLORS.orange }]} onPress={onPress}>
        <Text style={[styles.buttonText, { color: 'white' }]}>{title}</Text>
    </TouchableOpacity>
);

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
    captureSurface: {
        // Inner layer that actually gets captured to PNG. No border / radius
        // so the saved image is a clean white sheet with just the strokes.
        flex: 1,
        backgroundColor: '#fff',
    },
    uploadedImagePreview: {
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: '#fff',
    },
    label: { marginTop: 8, marginBottom: 4, fontSize: 16, color: "#1B4F72", fontFamily: FONT_FAMILY.urbanistBold },
    drawLabel: { fontSize: 12, color: '#495057', fontFamily: FONT_FAMILY.urbanistBold, letterSpacing: 0.5, marginBottom: 6, marginTop: 12 },
    hintText: { fontSize: 11, color: '#adb5bd', fontFamily: FONT_FAMILY.urbanistMedium, marginTop: 6, marginBottom: 4 },
    toolsCard: { backgroundColor: '#f0f4ff', borderWidth: 1, borderColor: '#c5d0e6', borderRadius: 8, padding: 14, marginTop: 8 },
    toolsTitle: { fontSize: 12, fontFamily: FONT_FAMILY.urbanistBold, color: '#714B67', letterSpacing: 0.5, marginBottom: 12 },
    toolRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    toolLabel: { fontSize: 12, color: '#495057', fontFamily: FONT_FAMILY.urbanistSemiBold, marginRight: 10, minWidth: 65 },
    toolBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6, borderWidth: 1, borderColor: '#c5d0e6', backgroundColor: '#fff', gap: 6, marginBottom: 12 },
    toolBtnActive: { borderColor: '#714B67', backgroundColor: '#f5eef4' },
    toolBtnText: { fontSize: 13, color: '#6c757d', fontFamily: FONT_FAMILY.urbanistSemiBold },
    toolBtnTextActive: { color: '#714B67' },
    sizeRow: { flexDirection: 'row', gap: 8 },
    sizeBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 4, borderWidth: 1, borderColor: '#c5d0e6', backgroundColor: '#fff' },
    sizeBtnActive: { borderColor: '#714B67', backgroundColor: '#f5eef4' },
    sizeBtnText: { fontSize: 12, color: '#6c757d', fontFamily: FONT_FAMILY.urbanistSemiBold },
    sizeBtnTextActive: { color: '#714B67', fontFamily: FONT_FAMILY.urbanistBold },
    colorRow: { flexDirection: 'row', gap: 8 },
    colorDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'transparent' },
    colorDotActive: { borderColor: '#714B67', borderWidth: 3 },
    toolActions: { flexDirection: 'row', gap: 16 },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    actionBtnText: { fontSize: 13, fontFamily: FONT_FAMILY.urbanistSemiBold },
    button: { width: 100, paddingHorizontal: 20, alignItems: 'center', paddingVertical: 5, borderRadius: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1.5, shadowRadius: 2, elevation: 5 },
    buttonText: { fontFamily: FONT_FAMILY.urbanistBold, textAlign: 'center', fontSize: 12, color: COLORS.white },
});
