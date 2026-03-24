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
  fetchSpareRequestLinesOdoo,
  updateSpareLineIssuedQtyOdoo,
  transitionSpareRequestStateOdoo,
  fetchUsersOdoo,
} from '@api/services/generalApi';

const SpareIssueForm = ({ navigation, route }) => {
  const currentUser = useAuthStore((state) => state.user);
  const requestData = route?.params?.requestData || null;

  const [spareRequest] = useState(requestData);
  const [lines, setLines] = useState([]);
  const [issuedBy] = useState({
    id: currentUser?.uid || null,
    label: currentUser?.name || currentUser?.login || '',
  });
  const [issuedTo, setIssuedTo] = useState(null);
  const [issueDate, setIssueDate] = useState(new Date());

  const [users, setUsers] = useState([]);

  const [isDropdownVisible, setIsDropdownVisible] = useState(false);
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // Fetch users for "Issued To" dropdown
        const userData = await fetchUsersOdoo({ limit: 50 });
        setUsers((userData || []).map(u => ({ id: u.id, label: u.name })));

        // Auto-fill "Issued To" from the person who requested
        if (requestData?.requested_by) {
          setIssuedTo({
            id: requestData.requested_by.id,
            label: requestData.requested_by.name || requestData.requested_by.label || '',
          });
        }

        // Auto-load lines for the pre-selected request
        if (requestData?.line_ids && requestData.line_ids.length > 0) {
          const fetchedLines = await fetchSpareRequestLinesOdoo(requestData.line_ids);
          setLines(fetchedLines.map(l => ({
            ...l,
            issue_qty_input: String(l.requested_qty || 0),
          })));
        }
      } catch (err) {
        console.warn('Failed to load data:', err?.message);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  const updateIssueQty = (index, value) => {
    setLines(prev => prev.map((line, i) =>
      i === index ? { ...line, issue_qty_input: value } : line
    ));
  };

  const handleSubmit = async () => {
    if (!spareRequest) {
      Alert.alert('Error', 'No spare request selected.');
      return;
    }

    const linesToIssue = lines.filter(l => {
      const qty = parseFloat(l.issue_qty_input);
      return qty > 0;
    });

    if (linesToIssue.length === 0) {
      Alert.alert('Validation Error', 'Please enter issue quantity for at least one line.');
      return;
    }

    // Confirmation dialog - show exact values being sent
    const summary = linesToIssue.map(l => `${l.product_name}: ${l.issue_qty_input} (line ${l.id})`).join('\n');
    console.log('ISSUE SUBMIT - lines to issue:', linesToIssue.map(l => ({ id: l.id, product: l.product_name, input: l.issue_qty_input, requested: l.requested_qty, existing_issued: l.issued_qty })));
    Alert.alert(
      'Confirm Issue',
      `Issue the following spare parts?\n\n${summary}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Yes, Issue', onPress: () => processIssue(linesToIssue) },
      ]
    );
  };

  const processIssue = async (linesToIssue) => {
    setIsSubmitting(true);
    let successCount = 0;
    let errorMessages = [];

    // Step 1: Transition state FIRST (action_issue may auto-set qty to requested_qty)
    if (spareRequest?.id) {
      try {
        await transitionSpareRequestStateOdoo(spareRequest.id, 'issued', {
          userId: issuedBy?.id || null,
          toUserId: issuedTo?.id || null,
          date: format(issueDate, 'yyyy-MM-dd'),
        });
      } catch (err) {
        console.warn('State transition warning:', err?.message);
      }
    }

    // Step 2: Write the actual issued qty AFTER state transition so our values are final
    for (const line of linesToIssue) {
      try {
        const newIssuedQty = parseFloat(line.issue_qty_input);
        await updateSpareLineIssuedQtyOdoo(line.id, newIssuedQty);
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
      Alert.alert('Success', `Issued ${successCount} spare part(s) successfully.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  };

  const remaining = (line) => {
    const rem = (line.requested_qty || 0) - (line.issued_qty || 0);
    return rem > 0 ? rem : 0;
  };

  return (
    <SafeAreaView>
      <NavigationHeader title="Issue Spare Parts" onBackPress={() => navigation.goBack()} />
      <RoundedScrollContainer>
        {/* Request Info */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Request Details</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Request:</Text>
            <Text style={styles.infoValue}>{spareRequest?.name || spareRequest?.label || '-'}</Text>
          </View>
          {spareRequest?.partner_name ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Customer:</Text>
              <Text style={styles.infoValue}>{spareRequest.partner_name}</Text>
            </View>
          ) : null}
          {spareRequest?.requested_by?.name ? (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Requested by:</Text>
              <Text style={styles.infoValue}>{spareRequest.requested_by.name}</Text>
            </View>
          ) : null}
        </View>

        {/* Issue Details */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Issue Details</Text>
          <FormInput
            label="Issued By"
            placeholder="Auto-set to current user"
            editable={false}
            value={issuedBy?.label || ''}
          />
          <FormInput
            label="Issued To"
            placeholder="Select user"
            dropIcon="menu-down"
            editable={false}
            value={issuedTo?.label || ''}
            onPress={() => setIsDropdownVisible(true)}
          />
          <FormInput
            label="Issue Date"
            placeholder="Select date"
            dropIcon="calendar"
            editable={false}
            value={format(issueDate, 'dd/MM/yyyy')}
            onPress={() => setIsDatePickerVisible(true)}
          />
        </View>

        {/* Spare Parts Lines */}
        {lines.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Spare Parts to Issue</Text>
            {lines.map((line, index) => (
              <View key={line.id} style={styles.lineCard}>
                <View style={styles.lineHeader}>
                  <Text style={styles.lineNumber}>#{index + 1}</Text>
                  <Text style={styles.lineProduct} numberOfLines={2}>{line.product_name}</Text>
                </View>
                <View style={styles.lineInfo}>
                  <Text style={styles.infoText}>Requested: {line.requested_qty}</Text>
                  <Text style={styles.infoText}>Already Issued: {line.issued_qty}</Text>
                  <Text style={[styles.infoText, { color: remaining(line) > 0 ? '#FF9800' : '#4CAF50' }]}>
                    Remaining: {remaining(line)}
                  </Text>
                </View>
                <FormInput
                  label="Issue Qty"
                  placeholder="0"
                  value={line.issue_qty_input}
                  keyboardType="numeric"
                  onChangeText={(val) => updateIssueQty(index, val)}
                />
              </View>
            ))}
          </View>
        )}

        {lines.length > 0 && (
          <View style={styles.btnRow}>
            <LoadingButton
              backgroundColor={COLORS.primaryThemeColor}
              title="Confirm Issue"
              onPress={handleSubmit}
              loading={isSubmitting}
            />
          </View>
        )}

        {lines.length === 0 && !isLoading && (
          <View style={styles.sectionCard}>
            <Text style={{ fontSize: 14, color: '#999', fontFamily: FONT_FAMILY.urbanistMedium, textAlign: 'center' }}>
              No spare part lines found for this request.
            </Text>
          </View>
        )}

        <DropdownSheet
          isVisible={isDropdownVisible}
          items={users}
          title="Select Issued To"
          onClose={() => setIsDropdownVisible(false)}
          onValueChange={(item) => { setIssuedTo(item); setIsDropdownVisible(false); }}
        />

        <DateTimePickerModal
          isVisible={isDatePickerVisible}
          mode="date"
          date={issueDate}
          onConfirm={(date) => { setIssueDate(date); setIsDatePickerVisible(false); }}
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  infoLabel: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
    maxWidth: '60%',
    textAlign: 'right',
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

export default SpareIssueForm;
