import { Keyboard } from 'react-native';
import React, { useState, useEffect } from 'react';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { LoadingButton } from '@components/common/Button';
import { TextInput as FormInput } from '@components/common/TextInput';
import { DropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { formatDate } from '@utils/common/date';
import { useAuthStore } from '@stores/auth';
import { validateFields } from '@utils/validation';
import { showToast } from '@utils/common';
import { fetchCustomersOdoo, fetchEmployeesOdoo, fetchVisitPurposesOdoo, createVisitPlanOdoo } from '@api/services/generalApi';

const VisitPlanForm = ({ navigation }) => {

  const currentUser = useAuthStore(state => state.user)

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [isTimePickerVisible, setIsTimePickerVisible] = useState(false);
  const [isDateTimePickerVisible, setIsDateTimePickerVisible] = useState(false);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    customer: '',
    assignedTo: { id: currentUser?.related_profile?._id || '', label: currentUser?.related_profile?.name || '' },
    selectDuration: '',
    dateAndTime: '',
    visitPurpose: '',
    remarks: '',
  });

  const [dropdown, setDropdown] = useState({
    customer: [],
    assignedTo: [],
    selectDuration: [
      { id: 'tomorrow', label: 'Tomorrow' },
      { id: 'custom', label: 'Custom Date' }
    ],
    visitPurpose: [],
  });

  const handleFieldChange = (field, value) => {
    setFormData((prevFormData) => ({
      ...prevFormData,
      [field]: value,
    }));
    if (errors[field]) {
      setErrors((prevErrors) => ({
        ...prevErrors,
        [field]: null,
      }));
    }
  };

  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [customers, employees, purposes] = await Promise.all([
          fetchCustomersOdoo(),
          fetchEmployeesOdoo(),
          fetchVisitPurposesOdoo(),
        ]);
        setDropdown((prevDropdown) => ({
          ...prevDropdown,
          customer: customers.map(c => ({ id: c.id, label: c.name })),
          assignedTo: employees.map(e => ({ id: e.id, label: e.name })),
          visitPurpose: purposes.map(p => ({ id: p.id, label: p.name })),
        }));
        // Auto-fill assigned to if not set
        if (!formData.assignedTo?.id) {
          const userName = currentUser?.related_profile?.name || currentUser?.name || '';
          const match = employees.find(e => e.name?.toLowerCase() === userName?.toLowerCase());
          if (match) {
            setFormData(prev => ({ ...prev, assignedTo: { id: match.id, label: match.name } }));
          }
        }
      } catch (error) {
        console.error('Error fetching dropdown data:', error);
      }
    };

    fetchDropdownData();
  }, []);


  useEffect(() => {
    if (formData.selectDuration?.id === 'tomorrow') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      handleFieldChange('dateAndTime', tomorrow);
      setIsTimePickerVisible(true);
    } else if (formData.selectDuration?.id === 'custom') {
      setIsDateTimePickerVisible(true);
    }
  }, [formData.selectDuration]);

  const handleTimeChange = (time) => {
    if (time) {
      const selectedDate = formData.dateAndTime ? new Date(formData.dateAndTime) : new Date();
      selectedDate.setHours(time.getHours());
      selectedDate.setMinutes(time.getMinutes());
      handleFieldChange('dateAndTime', selectedDate);
    }
    setIsTimePickerVisible(false);
  };

  const handleDateChange = (date) => {
    if (date) {
      handleFieldChange('dateAndTime', date);
    }
    setIsDateTimePickerVisible(false);
  };

  const toggleBottomSheet = (type) => {
    setSelectedType(type);
    setIsVisible(!isVisible);
  };

  const renderBottomSheet = () => {
    let items = [];
    let fieldName = '';

    switch (selectedType) {
      case 'Customers':
        items = dropdown.customer;
        fieldName = 'customer';
        break;
      case 'Employees':
        items = dropdown.assignedTo;
        fieldName = 'assignedTo';
        break;
      case 'Select Duration':
        items = dropdown.selectDuration;
        fieldName = 'selectDuration';
        break;
      case 'Visit Purpose':
        items = dropdown.visitPurpose;
        fieldName = 'visitPurpose';
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

  const handleSubmit = async () => {
    const fieldsToValidate = ['customer', 'dateAndTime', 'visitPurpose', 'remarks'];
    if (validateForm(fieldsToValidate)) {
      setIsSubmitting(true);
      try {
        await createVisitPlanOdoo({
          customerId: formData.customer?.id,
          employeeId: formData.assignedTo?.id || false,
          visitDate: formData.dateAndTime ? formatDate(formData.dateAndTime, 'yyyy-MM-dd HH:mm:ss') : null,
          purposeId: formData.visitPurpose?.id || false,
          remarks: formData.remarks || '',
        });
        showToast({ type: "success", title: "Success", message: "Visit Plan created successfully" });
        navigation.navigate("VisitsPlanScreen");
      } catch (error) {
        console.error('Error creating visit plan:', error);
        showToast({ type: "error", title: "Error", message: error?.data?.message || error?.message || "Create Visit Plan failed" });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader
        title="New Customer Visit Plan"
        onBackPress={() => navigation.goBack()}
      />
      <RoundedScrollContainer>
        <FormInput
          label={"Customer Name"}
          placeholder={"Select Customer"}
          value={formData?.customer?.label}
          dropIcon={"menu-down"}
          editable={false}
          required
          multiline
          validate={errors.customer}
          onPress={() => toggleBottomSheet('Customers')}
        />
        <FormInput
          label={"Assigned To"}
          placeholder={"Select Assignee"}
          dropIcon={"menu-down"}
          value={formData?.assignedTo?.label}
          editable={false}
          required
          onPress={() => toggleBottomSheet('Employees')}
        />
        <FormInput
          label={"Date & Time"}
          placeholder={"Select visit time"}
          dropIcon={"calendar"}
          required
          editable={false}
          value={formData.dateAndTime ? formatDate(formData.dateAndTime, 'dd-MM-yyyy HH:mm:ss') : "Select visit time"}
          validate={errors.dateAndTime}
          onPress={() => toggleBottomSheet('Select Duration')}
        />
        <FormInput
          label={"Visit Purpose"}
          placeholder={"Select purpose of visit"}
          dropIcon={"menu-down"}
          editable={false}
          required
          value={formData?.visitPurpose?.label}
          validate={errors.visitPurpose}
          onPress={() => toggleBottomSheet('Visit Purpose')}
        />
        <FormInput
          label={"Remarks"}
          required
          placeholder={"Enter Remarks"}
          multiline={true}
          numberOfLines={5}
          validate={errors.remarks}
          textAlignVertical={'top'}
          onChangeText={(value) => handleFieldChange('remarks', value)}
        />
        {renderBottomSheet()}
        <LoadingButton
          loading={isSubmitting}
          title={'SAVE'}
          onPress={handleSubmit}
        />
        <DateTimePickerModal
          isVisible={isTimePickerVisible}
          mode='time'
          display="default"
          accentColor='green'
          onConfirm={handleTimeChange}
          onCancel={() => setIsTimePickerVisible(false)}
        />
        <DateTimePickerModal
          isVisible={isDateTimePickerVisible}
          mode='datetime'
          display="default"
          accentColor='green'
          onConfirm={handleDateChange}
          onCancel={() => setIsDateTimePickerVisible(false)}
        />
      </RoundedScrollContainer>
    </SafeAreaView>
  );
};

export default VisitPlanForm;
