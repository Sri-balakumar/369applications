import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { format } from 'date-fns';

const CompanyInfoTab = ({ formData, updateField, openDatePicker }) => {
  return (
    <View style={styles.content}>
      {/* Company Information */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Company Information</Text>

        <FormInput label="Company Name" placeholder="Enter company name"
          value={formData.companyName} onChangeText={(v) => updateField('companyName', v)} />

        <FormInput label="Company Address" placeholder="Enter address"
          value={formData.companyAddress} onChangeText={(v) => updateField('companyAddress', v)}
          multiline numberOfLines={2} />

        <FormInput label="Email" placeholder="Enter email"
          value={formData.email} onChangeText={(v) => updateField('email', v)}
          keyboardType="email-address" />

        <FormInput label="Phone Number" placeholder="Enter phone"
          value={formData.phoneNumber} onChangeText={(v) => updateField('phoneNumber', v)}
          keyboardType="phone-pad" />

        <FormInput label="Fax" placeholder="Enter fax"
          value={formData.fax} onChangeText={(v) => updateField('fax', v)} />

        <FormInput label="Trade License No" placeholder="Enter license number"
          value={formData.tradeLicenseNo} onChangeText={(v) => updateField('tradeLicenseNo', v)} />

        <FormInput label="PO Box" placeholder="Enter PO Box"
          value={formData.poBox} onChangeText={(v) => updateField('poBox', v)} />
      </View>

      {/* Dates */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>License & Credit Dates</Text>

        <FormInput label="License Issue Date" dropIcon="calendar" placeholder="Select Date" editable={false}
          value={formData.licenseIssueDate ? format(formData.licenseIssueDate, 'yyyy-MM-dd') : ''}
          onPress={() => openDatePicker('licenseIssueDate')} />

        <FormInput label="License Expiry Date" dropIcon="calendar" placeholder="Select Date" editable={false}
          value={formData.licenseExpiryDate ? format(formData.licenseExpiryDate, 'yyyy-MM-dd') : ''}
          onPress={() => openDatePicker('licenseExpiryDate')} />

        <FormInput label="Credit Issue Date" dropIcon="calendar" placeholder="Select Date" editable={false}
          value={formData.creditIssueDate ? format(formData.creditIssueDate, 'yyyy-MM-dd') : ''}
          onPress={() => openDatePicker('creditIssueDate')} />

        <FormInput label="Credit Expiry Date" dropIcon="calendar" placeholder="Select Date" editable={false}
          value={formData.creditExpiryDate ? format(formData.creditExpiryDate, 'yyyy-MM-dd') : ''}
          onPress={() => openDatePicker('creditExpiryDate')} />
      </View>

      {/* Branch Details */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Branch Details</Text>

        <FormInput label="Branch Mobile No" placeholder="Enter branch mobile"
          value={formData.branchMobileNo} onChangeText={(v) => updateField('branchMobileNo', v)}
          keyboardType="phone-pad" />

        <FormInput label="Branch Telephone" placeholder="Enter branch telephone"
          value={formData.branchTelephone} onChangeText={(v) => updateField('branchTelephone', v)}
          keyboardType="phone-pad" />

        <FormInput label="Branch Fax" placeholder="Enter branch fax"
          value={formData.branchFax} onChangeText={(v) => updateField('branchFax', v)} />
      </View>

    </View>
  );
};

export default CompanyInfoTab;

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
});
