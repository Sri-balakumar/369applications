import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TextInput, ScrollView, ActivityIndicator, TouchableOpacity, Modal, FlatList } from 'react-native';
import Text from '@components/Text';
import { COLORS, FONT_FAMILY } from '@constants/theme';
import { showToastMessage } from '@components/Toast';
import { authenticateApproverOdoo, fetchUsersOdoo } from '@api/services/generalApi';
import { MaterialIcons } from '@expo/vector-icons';

const BelowCostApprovalModal = ({
  visible,
  belowCostLines = [],
  orderTotal = 0,
  currency = 'OMR',
  onApprove,
  onReject,
  onCancel,
}) => {
  const [selectedUser, setSelectedUser] = useState(null);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  // Approver dropdown state
  const [showDropdown, setShowDropdown] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [fetchingUsers, setFetchingUsers] = useState(false);

  // Fetch users when dropdown opens or search text changes
  useEffect(() => {
    if (!showDropdown) return;
    const timeout = setTimeout(() => {
      loadUsers(searchText);
    }, 300);
    return () => clearTimeout(timeout);
  }, [showDropdown, searchText]);

  const loadUsers = async (search = '') => {
    setFetchingUsers(true);
    try {
      const result = await fetchUsersOdoo({ searchText: search, limit: 20 });
      setUsers(result || []);
    } catch (err) {
      console.error('[BelowCostModal] fetchUsersOdoo error:', err?.message);
      setUsers([]);
    } finally {
      setFetchingUsers(false);
    }
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setShowDropdown(false);
    setSearchText('');
  };

  const handleAction = async (action) => {
    if (!selectedUser) {
      showToastMessage('Please select an authorized approver');
      return;
    }
    if (!password.trim()) {
      showToastMessage('Please enter approver password');
      return;
    }
    setLoading(true);
    try {
      const auth = await authenticateApproverOdoo(selectedUser.login, password.trim());
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
    setSelectedUser(null);
    setPassword('');
    setReason('');
    setSearchText('');
    setShowDropdown(false);
    setUsers([]);
  };

  const handleCancel = () => {
    resetFields();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={s.backdrop}>
        <View style={s.container}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="always">
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

              {/* Authorized Approver Dropdown */}
              <Text style={s.fieldLabel}>Authorized Approver</Text>
              <TouchableOpacity
                style={s.dropdownTrigger}
                onPress={() => setShowDropdown(!showDropdown)}
                disabled={loading}
              >
                <Text style={selectedUser ? s.dropdownText : s.dropdownPlaceholder}>
                  {selectedUser ? selectedUser.name : 'Select approver...'}
                </Text>
                <MaterialIcons
                  name={showDropdown ? 'arrow-drop-up' : 'arrow-drop-down'}
                  size={24}
                  color="#666"
                />
              </TouchableOpacity>

              {showDropdown && (
                <View style={s.dropdownContainer}>
                  <View style={s.searchRow}>
                    <MaterialIcons name="search" size={18} color="#999" />
                    <TextInput
                      style={s.searchInput}
                      placeholder="Search users..."
                      placeholderTextColor="#999"
                      value={searchText}
                      onChangeText={setSearchText}
                      autoCapitalize="none"
                      autoFocus
                    />
                  </View>
                  {fetchingUsers ? (
                    <ActivityIndicator size="small" color={COLORS.primaryThemeColor} style={{ padding: 12 }} />
                  ) : users.length === 0 ? (
                    <Text style={s.noResults}>No users found</Text>
                  ) : (
                    <FlatList
                      data={users}
                      keyExtractor={(item) => String(item.id)}
                      style={{ maxHeight: 160 }}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="always"
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={[
                            s.dropdownItem,
                            selectedUser?.id === item.id && s.dropdownItemSelected,
                          ]}
                          onPress={() => handleSelectUser(item)}
                        >
                          <Text style={s.dropdownItemText}>{item.name}</Text>
                        </TouchableOpacity>
                      )}
                    />
                  )}
                </View>
              )}

              <Text style={[s.fieldLabel, { marginTop: 10 }]}>Approver Password</Text>
              <TextInput
                style={s.input}
                placeholder="Enter password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
                onFocus={() => setShowDropdown(false)}
              />
              <TextInput
                style={[s.input, { height: 70, textAlignVertical: 'top' }]}
                placeholder="Reason for approval (optional)"
                placeholderTextColor="#999"
                value={reason}
                onChangeText={setReason}
                multiline
                editable={!loading}
                onFocus={() => setShowDropdown(false)}
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
  fieldLabel: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistSemiBold,
    color: '#444',
    marginBottom: 6,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  dropdownText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    flex: 1,
  },
  dropdownPlaceholder: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    flex: 1,
  },
  dropdownContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginBottom: 6,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
    paddingVertical: 2,
    marginLeft: 6,
  },
  dropdownItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  dropdownItemSelected: {
    backgroundColor: COLORS.primaryThemeColor + '15',
  },
  dropdownItemText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#333',
  },
  noResults: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.urbanistMedium,
    color: '#999',
    textAlign: 'center',
    padding: 12,
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
