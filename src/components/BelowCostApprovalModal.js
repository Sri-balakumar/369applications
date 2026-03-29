import React, { useState } from 'react';
import { View, StyleSheet, TextInput, ScrollView, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { authenticateApproverOdoo } from '@api/services/generalApi';

const BelowCostApprovalModal = ({
  visible,
  belowCostLines = [],
  orderTotal = 0,
  currency = 'OMR',
  onApprove,
  onReject,
  onCancel,
}) => {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAction = async (action) => {
    if (!login.trim() || !password.trim()) {
      showToastMessage('Please enter approver login and password');
      return;
    }
    setLoading(true);
    try {
      const auth = await authenticateApproverOdoo(login.trim(), password.trim());
      if (!auth.success) {
        showToastMessage(auth.error || 'Authentication failed');
        setLoading(false);
        return;
      }
      if (action === 'approve') {
        await onApprove({ approverId: auth.uid, approverName: auth.name, reason: reason.trim() });
      } else {
        await onReject({ approverId: auth.uid, approverName: auth.name, reason: reason.trim() });
      }
      resetFields();
    } catch (err) {
      showToastMessage(err?.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  const resetFields = () => {
    setLogin('');
    setPassword('');
    setReason('');
  };

  const handleCancel = () => {
    resetFields();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={s.backdrop}>
        <View style={s.container}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Warning Banner */}
            <View style={s.warningBanner}>
              <Text style={s.warningIcon}>⚠</Text>
              <Text style={s.warningTitle}>Below Cost Sale Detected!</Text>
              <Text style={s.warningText}>
                This order contains products priced below the minimum allowed price. Authorization from an approved person is required to proceed.
              </Text>
            </View>

            {/* Order Info */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>ORDER INFORMATION</Text>
              <View style={s.infoRow}>
                <Text style={s.label}>Order Total:</Text>
                <Text style={s.value}>{orderTotal.toFixed(3)} {currency}</Text>
              </View>
            </View>

            {/* Below Cost Lines Table */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>BELOW COST LINES</Text>
              <View style={s.tableHeader}>
                <Text style={[s.th, { flex: 2 }]}>Product</Text>
                <Text style={[s.th, { flex: 1 }]}>Price</Text>
                <Text style={[s.th, { flex: 1 }]}>Cost</Text>
                <Text style={[s.th, { flex: 1 }]}>Margin</Text>
                <Text style={[s.th, { flex: 0.5 }]}>Qty</Text>
              </View>
              {belowCostLines.map((line, idx) => (
                <View key={idx} style={s.tableRow}>
                  <Text style={[s.td, { flex: 2 }]} numberOfLines={1}>{line.productName}</Text>
                  <Text style={[s.td, { flex: 1 }]}>{line.unitPrice.toFixed(3)}</Text>
                  <Text style={[s.td, { flex: 1 }]}>{line.costPrice.toFixed(3)}</Text>
                  <Text style={[s.td, { flex: 1, color: line.marginPercent < 0 ? '#F44336' : '#FF9800' }]}>
                    {line.marginPercent.toFixed(2)}%
                  </Text>
                  <Text style={[s.td, { flex: 0.5 }]}>{line.qty}</Text>
                </View>
              ))}
            </View>

            {/* Approver Authentication */}
            <View style={s.section}>
              <Text style={s.sectionTitle}>APPROVER AUTHENTICATION</Text>
              <TextInput
                style={s.input}
                placeholder="Approver Login"
                placeholderTextColor="#999"
                value={login}
                onChangeText={setLogin}
                autoCapitalize="none"
                editable={!loading}
              />
              <TextInput
                style={s.input}
                placeholder="Approver Password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />
              <TextInput
                style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Reason for approval (optional)"
                placeholderTextColor="#999"
                value={reason}
                onChangeText={setReason}
                multiline
                editable={!loading}
              />
            </View>

            {/* Action Buttons */}
            {loading ? (
              <ActivityIndicator size="large" color={COLORS.primaryThemeColor} style={{ marginVertical: 16 }} />
            ) : (
              <View style={s.buttonRow}>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={() => handleAction('approve')}>
                  <Text style={s.btnText}>Approve & Confirm</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#F44336' }]} onPress={() => handleAction('reject')}>
                  <Text style={s.btnText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, { backgroundColor: '#999' }]} onPress={handleCancel}>
                  <Text style={s.btnText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
    maxHeight: '90%',
  },
  warningBanner: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    alignItems: 'center',
  },
  warningIcon: {
    fontSize: 28,
    marginBottom: 6,
  },
  warningTitle: {
    fontSize: 16,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#E65100',
    marginBottom: 6,
  },
  warningText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#2e2a4f',
    letterSpacing: 1,
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#666',
  },
  value: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#333',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#2e2a4f',
    borderRadius: 4,
    padding: 8,
  },
  th: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  td: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.urbanistBold,
    color: '#fff',
  },
});

export default BelowCostApprovalModal;
