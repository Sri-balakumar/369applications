import React, { useState } from 'react';
import { View, ScrollView, Text as RNText, TouchableOpacity, Switch, Alert, TextInput } from 'react-native';
import { SafeAreaView } from '@components/containers';
import { useLoader } from '@hooks';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import axios from 'axios';
import { getOdooAuthHeaders, ODOO_BASE_URL } from '@api/config/odooConfig';
import { AntDesign } from '@expo/vector-icons';

const CreateCustomerScreen = ({ navigation }) => {
  const [loading, startLoading, stopLoading] = useLoader(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    is_qualified: false,
    is_active: true,
    customer_category: 'active_qualified',
  });

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const createCustomer = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Customer name is required');
      return;
    }

    startLoading();
    try {
      const headers = await getOdooAuthHeaders();
      const response = await axios.post(
        `${ODOO_BASE_URL}/web/dataset/call_kw`,
        {
          jsonrpc: '2.0',
          method: 'call',
          params: {
            model: 'res.partner',
            method: 'create',
            args: [
              {
                name: formData.name,
                phone: formData.phone || false,
                email: formData.email || false,
                customer_category: formData.customer_category,
                active: formData.is_active,
              },
            ],
            kwargs: {},
          },
        },
        { headers }
      );

      if (!response.data.error) {
        Alert.alert('Success', 'Customer created successfully', [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]);
      } else {
        Alert.alert('Error', response.data.error.data?.message || 'Failed to create customer');
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      Alert.alert('Error', error.message || 'Failed to create customer');
    } finally {
      stopLoading();
    }
  };

  const categoryOptions = [
    { label: 'Active Qualified', value: 'active_qualified' },
    { label: 'Active Not Qualified', value: 'active_not_qualified' },
    { label: 'Inactive Qualified', value: 'inactive_qualified' },
    { label: 'Inactive Not Qualified', value: 'inactive_not_qualified' },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      {/* Custom Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.lightGray,
          backgroundColor: COLORS.white,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <AntDesign name="arrowleft" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <RNText
          style={{
            fontSize: 18,
            fontFamily: FONT_FAMILY.urbanistBold,
            color: COLORS.black,
            flex: 1,
            marginLeft: 16,
          }}
        >
          Create Customer
        </RNText>
      </View>
      <ScrollView
        style={{ flex: 1, paddingHorizontal: 16 }}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 32 }}
      >
        {/* Customer Name */}
        <View style={{ marginBottom: 20 }}>
          <RNText
            style={{
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanistBold,
              color: COLORS.grayText,
              marginBottom: 8,
            }}
          >
            Customer Name *
          </RNText>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: COLORS.lightGray,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanist,
              color: COLORS.black,
              backgroundColor: COLORS.white,
            }}
            placeholder="Enter customer name"
            placeholderTextColor={COLORS.lightGray}
            value={formData.name}
            onChangeText={(value) => handleInputChange('name', value)}
          />
        </View>

        {/* Phone */}
        <View style={{ marginBottom: 20 }}>
          <RNText
            style={{
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanistBold,
              color: COLORS.grayText,
              marginBottom: 8,
            }}
          >
            Phone
          </RNText>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: COLORS.lightGray,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanist,
              color: COLORS.black,
              backgroundColor: COLORS.white,
            }}
            placeholder="Enter phone number"
            placeholderTextColor={COLORS.lightGray}
            value={formData.phone}
            onChangeText={(value) => handleInputChange('phone', value)}
            keyboardType="phone-pad"
          />
        </View>

        {/* Email */}
        <View style={{ marginBottom: 20 }}>
          <RNText
            style={{
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanistBold,
              color: COLORS.grayText,
              marginBottom: 8,
            }}
          >
            Email
          </RNText>
          <TextInput
            style={{
              borderWidth: 1,
              borderColor: COLORS.lightGray,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 12,
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanist,
              color: COLORS.black,
              backgroundColor: COLORS.white,
            }}
            placeholder="Enter email address"
            placeholderTextColor={COLORS.lightGray}
            value={formData.email}
            onChangeText={(value) => handleInputChange('email', value)}
            keyboardType="email-address"
          />
        </View>

        {/* Category Dropdown */}
        <View style={{ marginBottom: 20 }}>
          <RNText
            style={{
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanistBold,
              color: COLORS.grayText,
              marginBottom: 8,
            }}
          >
            Category
          </RNText>
          <View
            style={{
              borderWidth: 1,
              borderColor: COLORS.lightGray,
              borderRadius: 8,
              backgroundColor: COLORS.white,
              overflow: 'hidden',
            }}
          >
            {categoryOptions.map((option, index) => (
              <TouchableOpacity
                key={option.value}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  borderBottomWidth: index !== categoryOptions.length - 1 ? 1 : 0,
                  borderBottomColor: COLORS.lightGray,
                  backgroundColor: formData.customer_category === option.value ? COLORS.lightGray : COLORS.white,
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
                onPress={() => handleInputChange('customer_category', option.value)}
              >
                <RNText
                  style={{
                    fontSize: 14,
                    fontFamily: FONT_FAMILY.urbanist,
                    color: formData.customer_category === option.value ? COLORS.primary : COLORS.black,
                    fontWeight: formData.customer_category === option.value ? '600' : '400',
                  }}
                >
                  {option.label}
                </RNText>
                {formData.customer_category === option.value && (
                  <AntDesign name="check" size={18} color={COLORS.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Active Toggle */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            paddingHorizontal: 12,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: COLORS.lightGray,
            borderRadius: 8,
            backgroundColor: COLORS.white,
          }}
        >
          <RNText
            style={{
              fontSize: 14,
              fontFamily: FONT_FAMILY.urbanistBold,
              color: COLORS.grayText,
            }}
          >
            Active
          </RNText>
          <Switch
            value={formData.is_active}
            onValueChange={(value) => handleInputChange('is_active', value)}
            trackColor={{ false: COLORS.lightGray, true: COLORS.primary }}
            thumbColor={formData.is_active ? COLORS.primary : COLORS.grayText}
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={{
            backgroundColor: COLORS.primary,
            paddingVertical: 14,
            borderRadius: 8,
            alignItems: 'center',
            marginTop: 20,
            opacity: loading ? 0.6 : 1,
          }}
          onPress={createCustomer}
          disabled={loading}
        >
          <RNText
            style={{
              fontSize: 16,
              fontFamily: FONT_FAMILY.urbanistBold,
              color: COLORS.white,
            }}
          >
            {loading ? 'Creating...' : 'Create Customer'}
          </RNText>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

export default CreateCustomerScreen;
