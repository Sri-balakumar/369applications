import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const FinancialInfoTab = ({ formData, updateField, updateBank }) => {
  return (
    <View style={styles.content}>
      {/* Sales Volume */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Present Yearly Sales Volume</Text>

        <FormInput label="Yearly Sales Volume" placeholder="0.00"
          value={formData.yearlySalesVolume}
          onChangeText={(v) => updateField('yearlySalesVolume', v)}
          keyboardType="numeric" />

        <FormInput label="Sales Days" placeholder="0"
          value={formData.salesDays}
          onChangeText={(v) => updateField('salesDays', v)}
          keyboardType="numeric" />
      </View>

      {/* Bank Details */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Bank Details</Text>

        {[0, 1].map((idx) => (
          <View key={idx} style={styles.bankCard}>
            <Text style={styles.subTitle}>Bank {idx + 1}</Text>

            <FormInput label="Bank Name" placeholder="Enter bank name"
              value={formData.banks[idx].bankName}
              onChangeText={(v) => updateBank(idx, 'bankName', v)} />

            <FormInput label="Account" placeholder="Enter account number"
              value={formData.banks[idx].account}
              onChangeText={(v) => updateBank(idx, 'account', v)} />

            <FormInput label="Branch" placeholder="Enter branch"
              value={formData.banks[idx].branch}
              onChangeText={(v) => updateBank(idx, 'branch', v)} />

            <FormInput label="Country" placeholder="Enter country"
              value={formData.banks[idx].country}
              onChangeText={(v) => updateBank(idx, 'country', v)} />

            <FormInput label="Telephone" placeholder="Enter telephone"
              value={formData.banks[idx].telephone}
              onChangeText={(v) => updateBank(idx, 'telephone', v)}
              keyboardType="phone-pad" />

            <FormInput label="Fax" placeholder="Enter fax"
              value={formData.banks[idx].fax}
              onChangeText={(v) => updateBank(idx, 'fax', v)} />
          </View>
        ))}
      </View>

    </View>
  );
};

export default FinancialInfoTab;

const styles = StyleSheet.create({
  content: { padding: 16 },
  sectionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      android: { elevation: 2 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 4 },
    }),
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginBottom: 10,
  },
  subTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    marginBottom: 8,
    marginTop: 4,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  bankCard: {
    marginBottom: 12,
  },
});
