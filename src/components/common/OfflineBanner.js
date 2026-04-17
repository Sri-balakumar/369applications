// src/components/common/OfflineBanner.js
//
// Reusable offline indicator. Drop this component anywhere; it subscribes to
// networkStatus and shows a yellow strip only when the device is offline.
//
// Usage:
//   import OfflineBanner from '@components/common/OfflineBanner';
//   <OfflineBanner />
//   // or with custom message:
//   <OfflineBanner message="Banners will sync when you reconnect" />

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { FONT_FAMILY } from '@constants/theme';
import networkStatus from '@utils/networkStatus';

const OfflineBanner = ({ message = 'OFFLINE MODE — changes will sync automatically when you reconnect', onOnline }) => {
  const [offline, setOffline] = useState(false);
  const wasOfflineRef = React.useRef(false);

  useEffect(() => {
    let mounted = true;
    networkStatus.isOnline().then((online) => {
      if (mounted) {
        setOffline(!online);
        wasOfflineRef.current = !online;
      }
    });
    const unsubscribe = networkStatus.subscribe((online) => {
      if (!mounted) return;
      const wasOff = wasOfflineRef.current;
      setOffline(!online);
      wasOfflineRef.current = !online;
      // When flipping from offline → online, trigger refresh callback
      if (online && wasOff && onOnline) {
        // Small delay to let sync flush first
        setTimeout(() => { if (mounted) onOnline(); }, 2000);
      }
    });
    return () => { mounted = false; unsubscribe && unsubscribe(); };
  }, [onOnline]);

  if (!offline) return null;

  return (
    <View style={styles.banner}>
      <MaterialIcons name="cloud-off" size={16} color="#7a4f00" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3CD',
    borderBottomWidth: 1,
    borderBottomColor: '#FFE69C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  text: {
    flex: 1,
    fontSize: 11,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#7a4f00',
  },
});

export default OfflineBanner;
