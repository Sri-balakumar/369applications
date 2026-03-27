import React, { useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Text from '@components/Text';
import { TextInput as FormInput } from '@components/common/TextInput';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { DropdownSheet } from '@components/common/BottomSheets';
import SignaturePad from '@components/SignaturePad';
import { format } from 'date-fns';

const ANY_OTHER_BUSINESS_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
];

const ContactsTab = ({ formData, updatePurchasingContact, updateAccountsContact, openDatePicker }) => {
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  return (
    <View style={styles.content}>
      {/* Purchasing Contacts */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Purchasing Contacts</Text>

        {[0, 1].map((idx) => (
          <View key={idx} style={styles.contactCard}>
            <Text style={styles.subTitle}>Contact {idx + 1}</Text>

            <FormInput label="Name" placeholder="Enter name"
              value={formData.purchasingContacts[idx].name}
              onChangeText={(v) => updatePurchasingContact(idx, 'name', v)} />

            <FormInput label="Title" placeholder="Enter title"
              value={formData.purchasingContacts[idx].title}
              onChangeText={(v) => updatePurchasingContact(idx, 'title', v)} />

            <FormInput label="Telephone" placeholder="Enter telephone"
              value={formData.purchasingContacts[idx].telephone}
              onChangeText={(v) => updatePurchasingContact(idx, 'telephone', v)}
              keyboardType="phone-pad" />

            <FormInput label="Fax" placeholder="Enter fax"
              value={formData.purchasingContacts[idx].fax}
              onChangeText={(v) => updatePurchasingContact(idx, 'fax', v)} />

            <FormInput label="Email" placeholder="Enter email"
              value={formData.purchasingContacts[idx].email}
              onChangeText={(v) => updatePurchasingContact(idx, 'email', v)}
              keyboardType="email-address" />

            <SignaturePad
              title={`Purchasing Contact ${idx + 1} Signature`}
              setScrollEnabled={setScrollEnabled}
              setUrl={() => {}}
              onSignatureBase64={(base64) => updatePurchasingContact(idx, 'signatureBase64', base64)}
            />
          </View>
        ))}
      </View>

      {/* Accounts Contact */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Accounts Contact</Text>

        <FormInput label="Name" placeholder="Enter name"
          value={formData.accountsContact.name}
          onChangeText={(v) => updateAccountsContact('name', v)} />

        <FormInput label="Telephone" placeholder="Enter telephone"
          value={formData.accountsContact.telephone}
          onChangeText={(v) => updateAccountsContact('telephone', v)}
          keyboardType="phone-pad" />

        <FormInput label="Fax" placeholder="Enter fax"
          value={formData.accountsContact.fax}
          onChangeText={(v) => updateAccountsContact('fax', v)} />

        <FormInput label="Email" placeholder="Enter email"
          value={formData.accountsContact.email}
          onChangeText={(v) => updateAccountsContact('email', v)}
          keyboardType="email-address" />

        <FormInput label="Date Business Started" dropIcon="calendar" placeholder="Select Date" editable={false}
          value={formData.accountsContact.dateBusinessStarted ? format(formData.accountsContact.dateBusinessStarted, 'yyyy-MM-dd') : ''}
          onPress={() => openDatePicker('dateBusinessStarted')} />

        <FormInput label="Any Other Business" placeholder="Select"
          dropIcon="menu-down" editable={false}
          value={formData.accountsContact.anyOtherBusiness?.label || ''}
          onPress={() => setIsDropdownVisible(true)} />

        <FormInput label="Business Description" placeholder="Enter description"
          value={formData.accountsContact.businessDescription}
          onChangeText={(v) => updateAccountsContact('businessDescription', v)}
          multiline numberOfLines={3} />

        <SignaturePad
          title="Accounts Signature"
          setScrollEnabled={setScrollEnabled}
          setUrl={() => {}}
          onSignatureBase64={(base64) => updateAccountsContact('signatureBase64', base64)}
        />
      </View>

      <DropdownSheet
        isVisible={isDropdownVisible}
        items={ANY_OTHER_BUSINESS_OPTIONS}
        title="Any Other Business"
        onClose={() => setIsDropdownVisible(false)}
        onValueChange={(item) => {
          updateAccountsContact('anyOtherBusiness', item);
          setIsDropdownVisible(false);
        }}
      />
    </View>
  );
};

export default ContactsTab;

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
  contactCard: {
    marginBottom: 20,
  },
});
