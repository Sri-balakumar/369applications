import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';
import { fetchOpenPosSessionOdoo, fetchPosConfigsOdoo, openPosSessionOdoo } from '@api/services/generalApi';
import Toast from 'react-native-toast-message';

const POSRegister = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [openSession, setOpenSession] = useState(null);
  const [configs, setConfigs] = useState([]);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    setLoading(true);
    try {
      const sessions = await fetchOpenPosSessionOdoo();
      if (sessions && sessions.length > 0) {
        setOpenSession(sessions[0]);
      } else {
        const cfgs = await fetchPosConfigsOdoo();
        setConfigs(cfgs);
      }
    } catch (e) {
      console.warn('Failed to check POS session:', e?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenRegister = async () => {
    if (openSession) {
      navigation.navigate('POSOpenAmount', { sessionId: openSession.id });
      return;
    }

    // Use first available config or default
    const configId = configs.length > 0 ? configs[0].id : 1;
    setOpening(true);
    try {
      const session = await openPosSessionOdoo({ posConfigId: configId, openingBalance: 0 });
      if (session && session.id) {
        setOpenSession(session);
        navigation.navigate('POSOpenAmount', { sessionId: session.id });
      } else {
        // Fallback: navigate without session (will work without POS order creation)
        navigation.navigate('POSOpenAmount', { sessionId: null });
      }
    } catch (e) {
      console.warn('Failed to open POS session:', e?.message);
      Toast.show({ type: 'info', text1: 'POS Session', text2: 'Continuing without POS session', position: 'bottom' });
      navigation.navigate('POSOpenAmount', { sessionId: null });
    } finally {
      setOpening(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <NavigationHeader title="POS Register" onBackPress={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2b6cb0" />
          <Text style={{ marginTop: 16, color: '#666', fontSize: 16 }}>Checking POS session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="POS Register" onBackPress={() => navigation.goBack()} />
      <View style={styles.centered}>
        <View style={styles.card}>
          <Text style={styles.icon}>🧾</Text>
          <Text style={styles.title}>
            {openSession ? 'Session Active' : 'Open Register'}
          </Text>
          <Text style={styles.subtitle}>
            {openSession
              ? `Session: ${openSession.name || openSession.id}\nStarted: ${openSession.start_at || '-'}`
              : 'Start a new POS register before taking orders.'}
          </Text>
          <Button
            title={openSession ? 'Resume Session' : 'Open Register'}
            onPress={handleOpenRegister}
            loading={opening}
            style={styles.openBtn}
            textStyle={{ fontSize: 18 }}
          />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centered: { flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingHorizontal: 12, paddingTop: 40 },
  card: { backgroundColor: '#fff', padding: 40, borderRadius: 18, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 12, elevation: 6, width: '95%', minHeight: 420 },
  icon: { fontSize: 64, marginBottom: 16, color: '#2b6cb0' },
  title: { fontSize: 26, fontWeight: '700', marginTop: 8, color: '#222' },
  subtitle: { color: '#444', marginTop: 12, marginBottom: 22, textAlign: 'center', fontSize: 18 },
  openBtn: { marginTop: 18, width: '95%', paddingVertical: 14, borderRadius: 12 },
});

export default POSRegister;
