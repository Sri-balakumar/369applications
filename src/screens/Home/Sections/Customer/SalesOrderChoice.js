import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';

const SalesOrderChoice = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <NavigationHeader title="Sales Order" onBackPress={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.title}>Sales Orders</Text>

        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.option, styles.placeOrder]} onPress={() => navigation.navigate('SaleOrderListScreen')}>
            <Text style={styles.optionTitle}>All Orders</Text>
            <Text style={styles.optionSub}>View all quotations and sales orders</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.option, styles.placeOrder]} onPress={() => navigation.navigate('CustomerScreen')}>
            <Text style={styles.optionTitle}>Place Order</Text>
            <Text style={styles.optionSub}>Choose a customer and create a sales order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 28 },
  title: { fontSize: 28, fontWeight: '800', marginTop: 18, color: '#fff' },
  buttons: { marginTop: 28 },
  option: { padding: 24, borderRadius: 12, marginBottom: 18, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa' },
  placeOrder: { backgroundColor: '#fafafa' },
  optionTitle: { fontSize: 22, fontWeight: '800' },
  optionSub: { color: '#666', marginTop: 8, fontSize: 16 },
});

export default SalesOrderChoice;
