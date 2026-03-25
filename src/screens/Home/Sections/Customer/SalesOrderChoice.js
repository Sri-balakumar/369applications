import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { MaterialIcons } from '@expo/vector-icons';

const SalesOrderChoice = ({ navigation }) => {
  return (
    <SafeAreaView>
      <NavigationHeader title="Sales Order" onBackPress={() => navigation.goBack()} logo={false} />
      <RoundedScrollContainer>
        <View style={styles.content}>
          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('SaleOrderListScreen')}
          >
            <View style={styles.iconContainer}>
              <MaterialIcons name="list-alt" size={28} color={COLORS.primaryThemeColor} />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.optionTitle}>All Orders</Text>
              <Text style={styles.optionSub}>View all quotations and sales orders</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#bbb" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.option}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('CustomerScreen')}
          >
            <View style={[styles.iconContainer, { backgroundColor: '#FFF3E0' }]}>
              <MaterialIcons name="add-shopping-cart" size={28} color="#FF9800" />
            </View>
            <View style={styles.textContainer}>
              <Text style={styles.optionTitle}>Place Order</Text>
              <Text style={styles.optionSub}>Choose a customer and create a sales order</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#bbb" />
          </TouchableOpacity>
        </View>
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primaryThemeColor,
    ...Platform.select({
      android: { elevation: 3 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: COLORS.primaryThemeColor + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  textContainer: { flex: 1 },
  optionTitle: {
    fontSize: 17,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    marginBottom: 4,
  },
  optionSub: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#888',
  },
});

export default SalesOrderChoice;
