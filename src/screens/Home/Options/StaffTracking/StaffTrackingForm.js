import { Keyboard, View } from 'react-native';
import React, { useState, useEffect } from 'react';
import { NavigationHeader } from '@components/Header';
import { RoundedScrollContainer, SafeAreaView } from '@components/containers';
import { TextInput as FormInput } from '@components/common/TextInput';
import { formatDate } from '@utils/common/date';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import * as Location from 'expo-location';
import { fetchDepartmentsDropdown } from '@api/dropdowns/dropdownApi';
import { showToastMessage } from '@components/Toast';
import { useAuthStore } from '@stores/auth';
import { showToast } from '@utils/common';
import { post } from '@api/services/utils';
import { OverlayLoader } from '@components/Loader';
import { validateFields } from '@utils/validation';

const StaffTrackingForm = ({ navigation, route }) => {
  const currentUser = useAuthStore((state) => state.user);
  const [selectedType, setSelectedType] = useState(null);
  const [errors, setErrors] = useState({});
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [locationName, setLocationName] = useState('');

  const [formData, setFormData] = useState({
    department: '',
    checkInTime: new Date(),
    checkOutTime: null,
    remarks: '',
    longitude: null,
    latitude: null,
    status: 'check_in'
  });

  const [dropdowns, setDropdowns] = useState({ departments: [], status: [
    { id: 'check_in', label: 'Check In' },
    { id: 'check_out', label: 'Check Out' },
  ] });

  // Get current location and reverse geocode
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Permission to access location was denied');
        showToastMessage('Location permission denied');
        return;
      }

      try {
        let location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High
        });

        setFormData(prev => ({
          ...prev,
          longitude: location.coords.longitude,
          latitude: location.coords.latitude,
        }));

        // Reverse geocode to get address
        const reverseGeocode = await Location.reverseGeocodeAsync({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude
        });

        if (reverseGeocode && reverseGeocode.length > 0) {
          const address = reverseGeocode[0];
          const addressParts = [
            address.name,
            address.street,
            address.city,
            address.region,
            address.country
          ].filter(Boolean);
          setLocationName(addressParts.join(', '));
        }
      } catch (error) {
        console.error('Error getting location:', error);
        showToastMessage('Error getting location');
      }
    })();
  }, []);

  // Fetch dropdowns
  useEffect(() => {
    const fetchData = async () => {
      try {
        const departmentsDropdown = await fetchDepartmentsDropdown();
        setDropdowns(prevDropdown => ({
          ...prevDropdown,
          departments: departmentsDropdown.map((data) => ({
            id: data._id,
            label: data.department_name,
          })),
        }));
      } catch (error) {
        console.error("Error fetching dropdown data:", error);
      }
    };

    fetchData();
  }, []);

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors((prevErrors) => ({
        ...prevErrors,
        [field]: null,
      }));
    }
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Department':
        items = dropdowns.departments;
        fieldName = 'department';
        break;
      case 'Status':
        items = dropdowns.status;
        fieldName = 'status';
        break;
      default:
        return null;
    }
    return (
      <DropdownSheet
        isVisible={isVisible}
        items={items}
        title={selectedType}
        onClose={() => setIsVisible(false)}
        onValueChange={(value) => handleFieldChange(fieldName, value)}
      />
    );
  };

  const validateForm = (fieldsToValidate) => {
    Keyboard.dismiss();
    const { isValid, errors } = validateFields(formData, fieldsToValidate);
    setErrors(errors);
    return isValid;
  };

  const submit = async () => {
    const fieldsToValidate = ['remarks'];
    if (validateForm(fieldsToValidate)) {
      if (!formData.latitude || !formData.longitude) {
        showToastMessage('Location not available. Please enable GPS.');
        return;
      }

      setIsSubmitting(true);
      const trackingData = {
        employee_id: currentUser?.related_profile?._id,
        department_id: formData?.department?.id || currentUser?.related_profile?.department_id || null,
        check_in_time: formData?.checkInTime || null,
        check_out_time: formData?.checkOutTime || null,
        remarks: formData?.remarks || null,
        longitude: formData?.longitude || null,
        latitude: formData?.latitude || null,
        location_name: locationName || null,
        status: formData?.status?.id || 'check_in',
      };
      console.log("Staff Tracking Data:", JSON.stringify(trackingData, null, 2));

      try {
        const response = await post("/createStaffTracking", trackingData);
        if (response.success) {
          showToast({
            type: "success",
            title: "Success",
            message: response.message || "Staff tracking recorded successfully",
          });
          navigation.goBack();
        } else {
          console.error("Staff Tracking Failed:", response.message);
          showToast({
            type: "error",
            title: "ERROR",
            message: response.message || "Staff tracking creation failed",
          });
        }
      } catch (error) {
        console.error("Error creating Staff Tracking:", error);
        showToast({
          type: "error",
          title: "ERROR",
          message: "An unexpected error occurred. Please try again later.",
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="Staff Check-In/Out"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          required
          label={"Date & Time"}
          dropIcon={"calendar"}
          editable={false}
          value={formatDate(formData.checkInTime, 'dd-MM-yyyy hh:mm:ss')}
        />
        <FormInput
          label={"Employee"}
          editable={false}
          value={currentUser?.related_profile?.name || currentUser?.name || ''}
        />
        <FormInput
          label={"Department"}
          placeholder={"Select Department"}
          dropIcon={"menu-down"}
          editable={false}
          value={formData.department?.label}
          validate={errors.department}
          onPress={() => toggleBottomSheet('Department')}
        />
        <FormInput
          label={"Current Location"}
          editable={false}
          multiline={true}
          value={locationName || 'Fetching location...'}
        />
        <FormInput
          label={"Latitude"}
          editable={false}
          value={formData.latitude ? formData.latitude.toString() : 'Fetching...'}
        />
        <FormInput
          label={"Longitude"}
          editable={false}
          value={formData.longitude ? formData.longitude.toString() : 'Fetching...'}
        />
        <FormInput
          label={"Status"}
          placeholder={"Select Status"}
          dropIcon={"menu-down"}
          editable={false}
          value={formData.status?.label || 'Check In'}
          onPress={() => toggleBottomSheet('Status')}
        />
        <FormInput
          label={"Remarks"}
          placeholder={"Enter Remarks"}
          multiline={true}
          textAlignVertical='top'
          numberOfLines={5}
          required
          value={formData.remarks}
          validate={errors.remarks}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton title='SUBMIT' onPress={submit} loading={isSubmitting} />
      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading} />
    </SafeAreaView>
  );
};

export default StaffTrackingForm;
