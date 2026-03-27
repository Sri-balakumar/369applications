import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import SignaturePad from '@components/SignaturePad';

const AuthorizedSignatoriesTab = ({ formData, updateSignatory }) => {
  const [scrollEnabled, setScrollEnabled] = useState(true);

  return (
    <View style={styles.content}>
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Authorized Signatories</Text>

        {[0, 1, 2].map((idx) => (
          <View key={idx} style={styles.signatoryCard}>
            <Text style={styles.subTitle}>Signatory {idx + 1}</Text>

            <FormInput label="Name" placeholder="Enter name"
              value={formData.signatories[idx].name}
              onChangeText={(v) => updateSignatory(idx, 'name', v)} />

            <FormInput label="Nationality" placeholder="Enter nationality"
              value={formData.signatories[idx].nationality}
              onChangeText={(v) => updateSignatory(idx, 'nationality', v)} />

            <SignaturePad
              title={`Signatory ${idx + 1} Signature`}
              setScrollEnabled={setScrollEnabled}
              setUrl={() => {}}
              onSignatureBase64={(base64) => updateSignatory(idx, 'signatureBase64', base64)}
            />
          </View>
        ))}
      </View>

    </View>
  );
};

export default AuthorizedSignatoriesTab;

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
  signatoryCard: {
    marginBottom: 20,
  },
});
