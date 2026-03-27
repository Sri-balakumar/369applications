import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS, FONT_FAMILY } from '@constants/theme';

const BusinessProprietorsTab = ({ formData, updateField, updateProprietor }) => {
  return (
    <View style={styles.content}>
      {/* Business Information */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Business Information</Text>

        <FormInput label="Local Sponsor" placeholder="Enter local sponsor"
          value={formData.localSponsor} onChangeText={(v) => updateField('localSponsor', v)} />

        <FormInput label="Occupation" placeholder="Enter occupation"
          value={formData.occupation} onChangeText={(v) => updateField('occupation', v)} />
      </View>

      {/* Proprietors */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Proprietors / Stakeholders / Shareholders</Text>

        {[0, 1, 2].map((idx) => (
          <View key={idx} style={styles.proprietorCard}>
            <Text style={styles.subTitle}>Proprietor {idx + 1}</Text>

            <FormInput label="Name" placeholder="Enter name"
              value={formData.proprietors[idx].name}
              onChangeText={(v) => updateProprietor(idx, 'name', v)} />

            <FormInput label="Nationality" placeholder="Enter nationality"
              value={formData.proprietors[idx].nationality}
              onChangeText={(v) => updateProprietor(idx, 'nationality', v)} />

            <FormInput label="Holding %" placeholder="0.00"
              value={formData.proprietors[idx].holdingPercent}
              onChangeText={(v) => updateProprietor(idx, 'holdingPercent', v)}
              keyboardType="numeric" />
          </View>
        ))}
      </View>

    </View>
  );
};

export default BusinessProprietorsTab;

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
  proprietorCard: {
    marginBottom: 12,
  },
});
