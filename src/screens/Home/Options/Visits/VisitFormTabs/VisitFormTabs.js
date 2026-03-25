import { useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useState, useEffect } from 'react';
import { SafeAreaView } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { CustomTabBar } from '@components/TabBar';
import Customer from './Customer';
import VisitDetails from './VisitDetails';
import InAndOut from './InAndOut';
import * as Location from 'expo-location';
import { OverlayLoader } from '@components/Loader';
import { useAuthStore } from '@stores/auth';
import { validateFields } from '@utils/validation';
import { showToast } from '@utils/common';
import { formatDate } from '@utils/common/date';
import { Keyboard } from 'react-native';
import {
    fetchVisitPlanDetailsOdoo,
    createCustomerVisitOdoo,
    fetchEmployeesOdoo,
} from '@api/services/generalApi';


const VisitFormTabs = ({ navigation, route }) => {

    const layout = useWindowDimensions();
    const [index, setIndex] = useState(0);
    const [routes] = useState([
        { key: 'first', title: 'Customer' },
        { key: 'second', title: 'Visit Details' },
        { key: 'third', title: 'In & OUt' },
    ]);
    const { visitPlanId = "", pipelineId = "" } = route?.params || {};
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState({});
    const currentUser = useAuthStore(state => state.user)
    const [formData, setFormData] = useState({
        customer: '',
        employee: '',
        siteLocation: '',
        dateAndTime: new Date(),
        nextVisitDate: null,
        contactPerson: '',
        visitPurpose: '',
        remarks: '',
        longitude: null,
        latitude: null,
        timeIn: null,
        timeOut: null,
        imageUrls: [],
    })

    // Auto-fill employee from Odoo
    useEffect(() => {
        const loadEmployee = async () => {
            try {
                const employees = await fetchEmployeesOdoo();
                const userName = currentUser?.related_profile?.name || currentUser?.name || '';
                const match = employees.find(e => e.name?.toLowerCase() === userName?.toLowerCase());
                if (match) {
                    setFormData(prev => ({ ...prev, employee: { id: match.id, label: match.name } }));
                }
            } catch (err) {
                console.error('Error loading employee:', err);
            }
        };
        loadEmployee();
    }, []);

    // Fetch visit plan details if available
    const loadVisitPlan = async () => {
        setIsLoading(true);
        try {
            const detail = await fetchVisitPlanDetailsOdoo(visitPlanId);
            if (detail) {
                setFormData(prev => ({
                    ...prev,
                    customer: detail.customer ? { id: detail.customer.id, label: detail.customer.name } : '',
                    employee: detail.employee ? { id: detail.employee.id, label: detail.employee.name } : prev.employee,
                    dateAndTime: detail.visit_date ? new Date(detail.visit_date) : new Date(),
                    visitPurpose: detail.purpose ? { id: detail.purpose.id, label: detail.purpose.name } : '',
                    remarks: detail.remarks || '',
                }));
            }
        } catch (error) {
            console.error('Error fetching visit plan details:', error);
            showToast({ type: 'error', title: 'Error', message: 'Failed to fetch visit plan details.' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (visitPlanId) loadVisitPlan();
    }, [visitPlanId])

    useEffect(() => {
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                console.log('Permission to access location was denied');
                return;
            }
            let location = await Location.getCurrentPositionAsync({});
            setFormData(prev => ({
                ...prev,
                longitude: location.coords.longitude,
                latitude: location.coords.latitude,
            }));
        })();
    }, []);


    const handleFieldChange = (field, value) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prevErrors) => ({ ...prevErrors, [field]: null }));
        }
    };

    const handleTabChange = (nextIndex) => {
        setIndex(nextIndex);
    };
    const renderScene = ({ route }) => {
        switch (route.key) {
            case 'first':
                return <Customer handleFieldChange={handleFieldChange} formData={formData} errors={errors} onNextPress={() => handleTabChange(1)} />;
            case 'second':
                return <VisitDetails handleFieldChange={handleFieldChange} formData={formData} errors={errors} onNextPress={() => handleTabChange(2)} />;
            case 'third':
                return <InAndOut handleFieldChange={handleFieldChange} formData={formData} errors={errors} submit={submit} loading={isSubmitting} />;
            default:
                return null;
        }
    };


    const validateForm = (fieldsToValidate) => {
        Keyboard.dismiss();
        const { isValid, errors } = validateFields(formData, fieldsToValidate);
        setErrors(errors);
        return isValid;
    };

    const submit = async () => {
        const fieldsToValidate = ['employee', 'customer', 'dateAndTime', 'remarks', 'visitPurpose', 'timeIn', 'timeOut'];
        if (validateForm(fieldsToValidate)) {
            setIsSubmitting(true);
            try {
                await createCustomerVisitOdoo({
                    customerId: formData.customer?.id,
                    employeeId: formData.employee?.id || false,
                    dateTime: formData.dateAndTime ? formatDate(formData.dateAndTime, 'yyyy-MM-dd HH:mm:ss') : null,
                    purposeId: formData.visitPurpose?.id || false,
                    remarks: formData.remarks || '',
                    longitude: formData.longitude || 0,
                    latitude: formData.latitude || 0,
                    contactPerson: formData.contactPerson?.label || '',
                    contactNumber: formData.contactPerson?.contactNo || '',
                    timeIn: formData.timeIn ? formatDate(formData.timeIn, 'yyyy-MM-dd HH:mm:ss') : null,
                    timeOut: formData.timeOut ? formatDate(formData.timeOut, 'yyyy-MM-dd HH:mm:ss') : null,
                    visitPlanId: visitPlanId ? parseInt(visitPlanId) : false,
                });
                showToast({
                    type: "success",
                    title: "Success",
                    message: "Customer Visit created successfully",
                });
                navigation.goBack();
            } catch (error) {
                console.error("Error creating Customer Visit:", error);
                showToast({
                    type: "error",
                    title: "ERROR",
                    message: error?.data?.message || error?.message || "An unexpected error occurred.",
                });
            } finally {
                setIsSubmitting(false);
            }
        }
    };


    return (
        <SafeAreaView>
            <NavigationHeader
                title="New Customer Visit"
                onBackPress={() => navigation.goBack()}
            />
            <TabView
                navigationState={{ index, routes }}
                renderScene={renderScene}
                renderTabBar={props => <CustomTabBar {...props} scrollEnabled={false}/>}
                onIndexChange={setIndex}
                initialLayout={{ width: layout.width }}
            />
            <OverlayLoader visible={isLoading || isSubmitting} />
        </SafeAreaView>
    );
};

export default VisitFormTabs;
