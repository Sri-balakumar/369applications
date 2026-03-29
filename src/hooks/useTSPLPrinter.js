import { useState, useRef, useEffect, useCallback } from 'react';
import { NativeModules, Platform, PermissionsAndroid } from 'react-native';
import * as FileSystem from 'expo-file-system';
import pako from 'pako';

// ── Label size configs (203 DPI = 8 dots/mm) ──────────────────────────
const LABEL_SIZES = {
  '50x80':  { widthMM: 50, heightMM: 80,  widthDots: 400, heightDots: 640 },
  '50x120': { widthMM: 50, heightMM: 120, widthDots: 400, heightDots: 960 },
  '50x150': { widthMM: 50, heightMM: 150, widthDots: 400, heightDots: 1200 },
};

const BLE_CHUNK_SIZE = 182;

// ── Mock devices ───────────────────────────────────────────────────────
const MOCK_DEVICES = [
  { id: 'mock-001', name: 'NGP-BBP-M100 (Mock)', rssi: -45 },
  { id: 'mock-002', name: 'TSPL-Printer-01', rssi: -60 },
  { id: 'mock-003', name: 'BT-Label-58mm', rssi: -72 },
];

// ── Helpers (Hermes-safe, no TextEncoder/atob) ─────────────────────────
function stringToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
  return bytes;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToUint8Array(b64) {
  let str = b64.replace(/=+$/, '');
  const len = str.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64.indexOf(str[i]);
    const b = B64.indexOf(str[i + 1]);
    const c = B64.indexOf(str[i + 2]);
    const d = B64.indexOf(str[i + 3]);
    bytes[p++] = (a << 2) | (b >> 4);
    if (c !== -1) bytes[p++] = ((b & 0xf) << 4) | (c >> 2);
    if (d !== -1) bytes[p++] = ((c & 0x3) << 6) | d;
  }
  return bytes.slice(0, p);
}

// ── Minimal PNG decoder (uses pako for IDAT inflate) ───────────────────
function readUint32(buf, off) {
  return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}

function decodePNG(buf) {
  // Skip 8-byte PNG signature
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks = [];

  while (pos < buf.length) {
    const len = readUint32(buf, pos);
    const type = String.fromCharCode(buf[pos+4], buf[pos+5], buf[pos+6], buf[pos+7]);

    if (type === 'IHDR') {
      width = readUint32(buf, pos + 8);
      height = readUint32(buf, pos + 12);
      bitDepth = buf[pos + 16];
      colorType = buf[pos + 17];
    } else if (type === 'IDAT') {
      idatChunks.push(buf.slice(pos + 8, pos + 8 + len));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len; // 4 len + 4 type + data + 4 crc
  }

  // Concatenate IDAT chunks and inflate
  let totalLen = 0;
  for (const c of idatChunks) totalLen += c.length;
  const compressed = new Uint8Array(totalLen);
  let offset = 0;
  for (const c of idatChunks) { compressed.set(c, offset); offset += c.length; }

  const raw = pako.inflate(compressed);

  // Determine bytes per pixel
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const bpp = channels * (bitDepth / 8);
  const stride = width * bpp;

  // Un-filter scanlines -> RGBA output
  const rgba = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride); // previous row (zeros)

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1); // +1 for filter byte
    const filterType = raw[rowStart];
    const row = new Uint8Array(stride);

    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + 1 + i];
      const a = i >= bpp ? row[i - bpp] : 0;           // left
      const b = prev[i];                                 // above
      const c = (i >= bpp) ? prev[i - bpp] : 0;         // upper-left

      switch (filterType) {
        case 0: row[i] = x; break;                       // None
        case 1: row[i] = (x + a) & 0xff; break;          // Sub
        case 2: row[i] = (x + b) & 0xff; break;          // Up
        case 3: row[i] = (x + ((a + b) >> 1)) & 0xff; break; // Average
        case 4: {                                         // Paeth
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          row[i] = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
          break;
        }
        default: row[i] = x;
      }
    }

    // Convert row to RGBA
    for (let px = 0; px < width; px++) {
      const dstIdx = (y * width + px) * 4;
      if (channels === 4) {
        rgba[dstIdx]     = row[px * 4];
        rgba[dstIdx + 1] = row[px * 4 + 1];
        rgba[dstIdx + 2] = row[px * 4 + 2];
        rgba[dstIdx + 3] = row[px * 4 + 3];
      } else if (channels === 3) {
        rgba[dstIdx]     = row[px * 3];
        rgba[dstIdx + 1] = row[px * 3 + 1];
        rgba[dstIdx + 2] = row[px * 3 + 2];
        rgba[dstIdx + 3] = 255;
      } else if (channels === 1) {
        rgba[dstIdx] = rgba[dstIdx + 1] = rgba[dstIdx + 2] = row[px];
        rgba[dstIdx + 3] = 255;
      }
    }
    prev = row;
  }

  return { width, height, data: rgba };
}

// ── PNG → 1-bit monochrome bitmap ──────────────────────────────────────
function rgbaToMonoBitmap(rgbaData, width, height) {
  const widthBytes = Math.ceil(width / 8);
  const bitmap = new Uint8Array(widthBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = rgbaData[idx], g = rgbaData[idx + 1], b = rgbaData[idx + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      if (gray < 128) {
        const byteIdx = y * widthBytes + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        bitmap[byteIdx] |= (1 << bitIdx);
      }
    }
  }
  return bitmap;
}

// ── TSPL command builder ───────────────────────────────────────────────
function buildTSPLCommands(bitmap, widthBytes, heightDots, widthMM, heightMM) {
  const header = stringToBytes(
    `SIZE ${widthMM} mm,${heightMM} mm\r\n` +
    `GAP 2 mm,0 mm\r\n` +
    `DIRECTION 1\r\n` +
    `CLS\r\n` +
    `BITMAP 0,0,${widthBytes},${heightDots},0,`
  );
  const footer = stringToBytes('\r\nPRINT 1\r\n');
  const command = new Uint8Array(header.length + bitmap.length + footer.length);
  command.set(header, 0);
  command.set(bitmap, header.length);
  command.set(footer, header.length + bitmap.length);
  return command;
}

// ═══════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════
export default function useTSPLPrinter() {
  const bleManagerRef = useRef(null);
  const eventListenerRef = useRef(null);
  const connectedCharRef = useRef(null); // { serviceUUID, characteristicUUID }

  const [isMockMode, setIsMockMode] = useState(true);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printProgress, setPrintProgress] = useState(0);
  const [error, setError] = useState(null);

  // ── BLE initialisation ───────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // Guard: only load BLE package when native module is actually linked
    if (!NativeModules.BleManager) {
      console.log('[TSPL] BLE native module not available – mock mode');
      return;
    }

    try {
      const BleManager = require('react-native-ble-manager').default;
      BleManager.start({ showAlert: false })
        .then(() => {
          if (mounted) {
            bleManagerRef.current = BleManager;
            setIsMockMode(false);
            console.log('[TSPL] BLE manager started – real mode');
          }
        })
        .catch(() => {
          if (mounted) {
            console.log('[TSPL] BLE start failed – mock mode');
          }
        });
    } catch (_) {
      console.log('[TSPL] BLE require failed – mock mode');
    }
    return () => { mounted = false; };
  }, []);

  // ── Scan ─────────────────────────────────────────────────────────────
  const scanForPrinters = useCallback(async () => {
    setError(null);
    setDevices([]);
    setIsScanning(true);

    if (isMockMode) {
      await new Promise(r => setTimeout(r, 500));
      setDevices(MOCK_DEVICES);
      setIsScanning(false);
      console.log('[TSPL Mock] Scan complete – found 3 devices');
      return;
    }

    // Request runtime BLE permissions (required on Android 12+)
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        const allGranted = Object.values(granted).every(
          v => v === PermissionsAndroid.RESULTS.GRANTED
        );
        if (!allGranted) {
          setError('Bluetooth permissions denied');
          setIsScanning(false);
          console.log('[TSPL] Permissions denied:', granted);
          return;
        }
      } catch (err) {
        setError('Permission request failed');
        setIsScanning(false);
        return;
      }
    } else if (Platform.OS === 'android') {
      // Android < 12: only need location permission for BLE scan
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          setError('Location permission denied (needed for BLE scan)');
          setIsScanning(false);
          return;
        }
      } catch (err) {
        setError('Permission request failed');
        setIsScanning(false);
        return;
      }
    }

    const BleManager = bleManagerRef.current;

    // Check if Bluetooth is enabled
    try {
      await BleManager.enableBluetooth();
    } catch (_) {
      setError('Please turn on Bluetooth');
      setIsScanning(false);
      return;
    }

    const { NativeEventEmitter } = require('react-native');
    const emitter = new NativeEventEmitter(NativeModules.BleManager);
    const found = [];

    if (eventListenerRef.current) eventListenerRef.current.remove();
    eventListenerRef.current = emitter.addListener(
      'BleManagerDiscoverPeripheral',
      (peripheral) => {
        const name = peripheral.name || peripheral.localName || null;
        const id = peripheral.id;
        // Update existing device if we now have a name
        const existingIdx = found.findIndex(d => d.id === id);
        if (existingIdx >= 0) {
          if (name && !found[existingIdx].name) {
            found[existingIdx].name = name;
            found[existingIdx].rssi = peripheral.rssi;
            setDevices([...found]);
          }
          return;
        }
        const dev = { id, name: name || `Unknown (${id.slice(-5)})`, rssi: peripheral.rssi };
        found.push(dev);
        setDevices([...found]);
      }
    );

    try {
      await BleManager.scan([], 8, true);
      await new Promise(r => setTimeout(r, 9000));
    } catch (err) {
      setError('Scan failed: ' + err.message);
    } finally {
      setIsScanning(false);
      if (eventListenerRef.current) { eventListenerRef.current.remove(); eventListenerRef.current = null; }
    }
  }, [isMockMode]);

  // ── Connect ──────────────────────────────────────────────────────────
  const connectToDevice = useCallback(async (deviceId) => {
    setError(null);
    setIsConnecting(true);

    if (isMockMode) {
      await new Promise(r => setTimeout(r, 1500));
      const dev = MOCK_DEVICES.find(d => d.id === deviceId) || { id: deviceId, name: 'Mock Printer' };
      setConnectedDevice(dev);
      setIsConnecting(false);
      console.log(`[TSPL Mock] Connected to ${dev.name}`);
      return;
    }

    const BleManager = bleManagerRef.current;
    try {
      await BleManager.connect(deviceId);
      const info = await BleManager.retrieveServices(deviceId);

      // Find first writable characteristic
      let charInfo = null;
      for (const svc of (info.services || [])) {
        const chars = (info.characteristics || []).filter(c => c.service === (svc.uuid || svc));
        for (const ch of chars) {
          const props = ch.properties || {};
          if (props.Write || props.WriteWithoutResponse) {
            charInfo = { serviceUUID: ch.service, characteristicUUID: ch.characteristic };
            break;
          }
        }
        if (charInfo) break;
      }
      connectedCharRef.current = charInfo;

      const dev = devices.find(d => d.id === deviceId) || { id: deviceId, name: info.name || 'Printer' };
      setConnectedDevice(dev);
      console.log('[TSPL] Connected to', dev.name, charInfo ? '(char found)' : '(no writable char)');
    } catch (err) {
      setError('Connect failed: ' + err.message);
    } finally {
      setIsConnecting(false);
    }
  }, [isMockMode, devices]);

  // ── Disconnect ───────────────────────────────────────────────────────
  const disconnect = useCallback(async () => {
    if (connectedDevice && !isMockMode && bleManagerRef.current) {
      try { await bleManagerRef.current.disconnect(connectedDevice.id); } catch (_) {}
    }
    setConnectedDevice(null);
    connectedCharRef.current = null;
    console.log('[TSPL] Disconnected');
  }, [connectedDevice, isMockMode]);

  // ── Send bytes in chunks ─────────────────────────────────────────────
  const sendViaBLE = useCallback(async (commandBytes) => {
    if (isMockMode) {
      console.log(`[TSPL Mock] Sending ${commandBytes.length} bytes to printer...`);
      await new Promise(r => setTimeout(r, 2500));
      console.log(`[TSPL Mock] Sent ${commandBytes.length} bytes successfully`);
      return;
    }

    const BleManager = bleManagerRef.current;
    const char = connectedCharRef.current;
    if (!BleManager || !char || !connectedDevice) throw new Error('Printer not connected');

    const total = commandBytes.length;
    for (let offset = 0; offset < total; offset += BLE_CHUNK_SIZE) {
      const end = Math.min(offset + BLE_CHUNK_SIZE, total);
      const chunk = Array.from(commandBytes.slice(offset, end));
      await BleManager.write(connectedDevice.id, char.serviceUUID, char.characteristicUUID, chunk);
      setPrintProgress(Math.round((end / total) * 100));
      await new Promise(r => setTimeout(r, 20));
    }
  }, [isMockMode, connectedDevice]);

  // ── Print orchestration ──────────────────────────────────────────────
  const printReceipt = useCallback(async (viewShotRef, labelSizeKey = '50x80') => {
    setError(null);
    setIsPrinting(true);
    setPrintProgress(0);

    const labelSize = LABEL_SIZES[labelSizeKey] || LABEL_SIZES['50x80'];

    try {
      // Step 1: Capture PNG from ViewShot
      let pngUri;
      try {
        pngUri = await viewShotRef.current.capture();
        console.log('[TSPL] Captured receipt PNG:', pngUri);
      } catch (captureErr) {
        if (isMockMode) {
          console.log('[TSPL Mock] ViewShot not available, simulating print');
          const fakeBytes = labelSize.widthDots * labelSize.heightDots / 8;
          console.log(`[TSPL Mock] Would send ~${fakeBytes + 100} bytes to printer`);
          await new Promise(r => setTimeout(r, 2500));
          setIsPrinting(false);
          setPrintProgress(100);
          return;
        }
        throw captureErr;
      }

      // Step 2: Read PNG as base64, decode with inline PNG parser + pako
      const base64 = await FileSystem.readAsStringAsync(pngUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const pngBuffer = base64ToUint8Array(base64);
      const png = decodePNG(pngBuffer); // { width, height, data: Uint8Array(RGBA) }
      console.log(`[TSPL] Decoded PNG: ${png.width}x${png.height}`);

      // Step 3: Convert to 1-bit monochrome
      const bitmap = rgbaToMonoBitmap(png.data, png.width, png.height);
      const widthBytes = Math.ceil(png.width / 8);
      console.log(`[TSPL] Bitmap: ${widthBytes}x${png.height} = ${bitmap.length} bytes`);

      // Step 4: Build TSPL command
      const command = buildTSPLCommands(bitmap, widthBytes, png.height, labelSize.widthMM, labelSize.heightMM);
      console.log(`[TSPL] Total command: ${command.length} bytes`);

      // Step 5: Send via BLE
      await sendViaBLE(command);
      setPrintProgress(100);
      console.log('[TSPL] Print complete!');
    } catch (err) {
      console.error('[TSPL] Print error:', err);
      setError('Print failed: ' + err.message);
      throw err;
    } finally {
      setIsPrinting(false);
    }
  }, [isMockMode, sendViaBLE]);

  return {
    isMockMode,
    isScanning,
    devices,
    connectedDevice,
    isConnecting,
    isPrinting,
    printProgress,
    error,
    scanForPrinters,
    connectToDevice,
    disconnect,
    printReceipt,
    LABEL_SIZES,
  };
}

export { LABEL_SIZES };
