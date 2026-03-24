import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { Button } from '@components/common/Button';

const POSOpenAmount = ({ navigation, route }) => {
  const { sessionId } = route?.params || {};
  const [amount, setAmount] = useState('0.00');

  const handleOpen = () => {
    const parsed = parseFloat(amount) || 0;
    navigation.navigate('POSProducts', { openingAmount: parsed, sessionId });
  };

  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="Opening Amount" onBackPress={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.title}>Enter Opening Amount</Text>
        <Text style={styles.subtitle}>This amount will be used as the register opening cash.</Text>

        <TextInput
          keyboardType="numeric"
          value={amount}
          onChangeText={setAmount}
          style={styles.input}
        />

        <View style={{ marginTop: 20, alignItems: 'center' }}>
          <Button title="Open" onPress={handleOpen} style={styles.openBtn} textStyle={{ fontSize: 18 }} />
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f8fa', justifyContent: 'flex-start' },
  content: { padding: 28, backgroundColor: '#fff', borderRadius: 20, marginHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 8, minHeight: 360, justifyContent: 'flex-start', marginTop: 80 },
  title: { fontSize: 30, fontWeight: '800', marginTop: 6, color: '#111', textAlign: 'center' },
  subtitle: { color: '#444', marginTop: 12, marginBottom: 20, textAlign: 'center', fontSize: 18 },
  input: { marginTop: 8, padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 10, fontSize: 22, color: '#222', backgroundColor: '#f6f8fa', textAlign: 'center', height: 64 },
  openBtn: { width: '90%', paddingVertical: 14, borderRadius: 10 },
});

export default POSOpenAmount;
