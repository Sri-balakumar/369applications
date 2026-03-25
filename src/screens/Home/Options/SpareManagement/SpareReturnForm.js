import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Platform, Alert } from 'react-native';
import Text from '@components/Text';
import { SafeAreaView, RoundedScrollContainer } from '@components/containers';
import { NavigationHeader } from '@components/Header';
import { TextInput as FormInput } from '@components/common/TextInput';
import { LoadingButton } from '@components/common/Button';
import { DropdownSheet } from '@components/common/BottomSheets';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { OverlayLoader } from '@components/Loader';
import { useAuthStore } from '@stores/auth';
import { format } from 'date-fns';
import {
  fetchApprovedSpareRequestsOdoo,
  fetchSpareRequestLinesOdoo,
  updateSpareLineReturnedQtyOdoo,
  transitionSpareRequestStateOdoo,
  fetchUsersOdoo,
} from '@api/services/generalApi';

const SpareReturnForm = ({ navigation }) => {
  const currentUser = useAuthStore((state) => state.user);

  const [spareRequest, setSpareRequest] = useState(null);
  const [lines, setLines] = useState([]);
  const [returnedBy, setReturnedBy] = useState(null);
  const [returnedTo, setReturnedTo] = useState(null);
  const [returnDate, setReturnDate] = useState(new Date());
  const [reason, setReason] = useState('');

  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [dropdownType, setDropdownType] = useState(null);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const [reqData, userData] = await Promise.allSettled([
          fetchApprovedSpareRequestsOdoo({ limit: 50 }),
          fetchUsersOdoo({ limit: 50 }),
        ]);

        const reqResult = reqData.status === 'fulfilled' ? reqData.value : [];
        const userResult = userData.status === 'fulfilled' ? userData.value : [];

        setRequests(reqResult.map(r => ({
          id: r.id,
          label: r.label || r.name,
          line_ids: r.line_ids,
          requested_by: r.requested_by,
          requested_to: r.requested_to,
        })));

        setUsers(userResult.map(u => ({ id: u.id, label: u.name })));

        // Auto-set current user as "Returned By"
        if (currentUser?.name || currentUser?.login) {
          setReturnedBy({ id: currentUser?.uid || null, label: currentUser?.name || currentUser?.login || '' });
        }
      } catch (err) {
        console.warn('Failed to load data:', err?.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const openDropdown = (type) => {
    setDropdownType(type);
    setIsDropdownVisible(true);
  };

  const handleDropdownSelect = async (item) => {
    setIsDropdownVisible(false);
    if (dropdownType === 'request') {
      await handleRequestSelect(item);
    } else if (dropdownType === 'returnedBy') {
      setReturnedBy(item);
    } else if (dropdownType === 'returnedTo') {
      setReturnedTo(item);
    }
    setDropdownType(null);
  };

  const getDropdownItems = () => {
    if (dropdownType === 'request') return requests;
    if (dropdownType === 'returnedBy' || dropdownType === 'returnedTo') return users;
    return [];
  };

  const getDropdownTitle = () => {
    if (dropdownType === 'request') return 'Select Spare Request';
    if (dropdownType === 'returnedBy') return 'Select Returned By';
    if (dropdownType === 'returnedTo') return 'Select Returned To';
    return '';
  };

  const handleRequestSelect = async (item) => {
    setSpareRequest(item);
    setLines([]);

    // Auto-fill "Returned To" from the person who requested the spare parts (returning back to store)
    if (item.requested_to) {
      setReturnedTo({ id: item.requested_to.id, label: item.requested_to.name });
    }

    if (item.line_ids && item.line_ids.length > 0) {
      setIsLoading(true);
      try {
        const fetchedLines = await fetchSpareRequestLinesOdoo(item.line_ids);
        // Only show lines that have been issued (issued_qty > 0)
        const issuedLines = fetchedLines.filter(l => l.issued_qty > 0);
        if (issuedLines.length === 0) {
          Alert.alert('Info', 'No parts have been issued for this request yet.');
          setIsLoading(false);
          return;
        }
        setLines(issuedLines.map(l => ({
          ...l,
          returnable: (l.issued_qty || 0) - (l.returned_qty || 0),
          return_qty_input: String(l.issued_qty || 0),
        })));
      } catch (err) {
        console.warn('Failed to fetch request lines:', err?.message);
        Alert.alert('Error', 'Failed to fetch request lines');
      } finally {
        setIsLoading(false);
      }
    } else {
      Alert.alert('Info', 'This request has no spare part lines.');
    }
  };

  const updateReturnQty = (index, value) => {
    setLines(prev => prev.map((line, i) =>
      i === index ? { ...line, return_qty_input: value } : line
    ));
  };

  const handleSubmit = async () => {
    if (!spareRequest) {
      Alert.alert('Validation Error', 'Please select a spare request.');
      return;
    }

    const linesToReturn = lines.filter(l => {
      const qty = parseFloat(l.return_qty_input);
      return qty > 0;
    });

    if (linesToReturn.length === 0) {
      Alert.alert('Validation Error', 'Please enter return quantity for at least one line.');
      return;
    }

    setIsSubmitting(true);
    let successCount = 0;
    let errorMessages = [];

    // Step 1: Transition state FIRST (action may auto-set qty)
    if (spareRequest?.id) {
      try {
        await transitionSpareRequestStateOdoo(spareRequest.id, 'returned', {
          userId: returnedBy?.id || null,
          toUserId: returnedTo?.id || null,
          date: format(returnDate, 'yyyy-MM-dd'),
          reason: reason.trim() || null,
        });
      } catch (err) {
        console.warn('State transition warning:', err?.message);
      }
    }

    // Step 2: Write the actual returned qty AFTER state transition so our values are final
    for (const line of linesToReturn) {
      try {
        const newReturnedQty = parseFloat(line.return_qty_input);
        await updateSpareLineReturnedQtyOdoo(line.id, newReturnedQty);
        successCount++;
      } catch (err) {
        errorMessages.push(`${line.product_name}: ${err?.message || 'Failed'}`);
      }
    }

    setIsSubmitting(false);

    if (errorMessages.length > 0) {
      Alert.alert(
        'Partial Success',
        `Updated ${successCount} lines.\nErrors:\n${errorMessages.join('\n')}`,
        [{ text: 'OK', onPress: () => { if (successCount > 0) navigation.goBack(); } }]
      );
    } else {
      Alert.alert('Success', `Returned ${successCount} spare part(s) successfully.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Return Spare Parts" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Select Request</Text>
          <FormInput
            label="Spare Request *"
            placeholder="Select a request to return parts from"
            dropIcon="menu-down"
            editable={false}
            value={spareRequest?.label || ''}
            onPress={() => openDropdown('request')}
          />
          {spareRequest && (
            <Text style={styles.hint}>
              Set the quantity to return for each issued spare part below
            </Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Return Details</Text>
          <FormInput
            label="Returned By"
            placeholder="Select user"
            dropIcon="menu-down"
            editable={false}
            value={returnedBy?.label || ''}
            onPress={() => openDropdown('returnedBy')}
          />
          <FormInput
            label="Returned To"
            placeholder="Select user"
            dropIcon="menu-down"
            editable={false}
            value={returnedTo?.label || ''}
            onPress={() => openDropdown('returnedTo')}
          />
          <FormInput
            label="Return Date"
            placeholder="Select date"
            dropIcon="calendar"
            editable={false}
            value={format(returnDate, 'dd/MM/yyyy')}
            onPress={() => setIsDatePickerVisible(true)}
          />
          <FormInput
            label="Reason"
            placeholder="Enter reason for return"
            value={reason}
            onChangeText={setReason}
            multiline
          />
        </View>

        {lines.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Issued Parts to Return</Text>
            {lines.map((line, index) => (
              <View key={line.id} style={styles.lineCard}>
                <View style={styles.lineHeader}>
                  <Text style={styles.lineNumber}>#{index + 1}</Text>
                  <Text style={styles.lineProduct} numberOfLines={2}>{line.product_name}</Text>
                </View>
                <View style={styles.lineInfo}>
                  <Text style={styles.infoText}>Issued: {line.issued_qty}</Text>
                  <Text style={styles.infoText}>Already Returned: {line.returned_qty}</Text>
                  <Text style={[styles.infoText, { color: line.returnable > 0 ? '#FF9800' : '#4CAF50' }]}>
                    Returnable: {line.returnable}
                  </Text>
                </View>
                <FormInput
                  label="Return Qty"
                  placeholder="0"
                  value={line.return_qty_input}
                  keyboardType="numeric"
                  onChangeText={(val) => updateReturnQty(index, val)}
                />
              </View>
            ))}
          </View>
        )}

        {lines.length > 0 && (
          <View style={styles.btnRow}>
            <LoadingButton
              backgroundColor={COLORS.primaryThemeColor}
              title="Confirm Return"
              onPress={handleSubmit}
              loading={isSubmitting}
            />
          </View>
        )}

        <DropdownSheet
          isVisible={isDropdownVisible}
          items={getDropdownItems()}
          title={getDropdownTitle()}
          onClose={() => { setIsDropdownVisible(false); setDropdownType(null); }}
          onValueChange={handleDropdownSelect}
        />

        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          date={returnDate}
          onConfirm={(date) => { setReturnDate(date); setIsDatePickerVisible(false); }}
          onCancel={() => setIsDatePickerVisible(false)}
        />
      </RoundedScrollContainer>
      <OverlayLoader visible={isLoading || isSubmitting} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
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
  hint: {
    fontSize: 12,
    color: '#4CAF50',
    fontFamily: FONT_FAMILY.urbanistMedium,
    marginTop: -4,
  },
  lineCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  lineNumber: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: COLORS.primaryThemeColor,
    marginRight: 8,
  },
  lineProduct: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#333',
    flex: 1,
  },
  lineInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  infoText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  btnRow: {
    marginBottom: 20,
  },
});

export default SpareReturnForm;
