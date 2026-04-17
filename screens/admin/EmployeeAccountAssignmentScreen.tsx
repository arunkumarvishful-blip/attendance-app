import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  FlatList,
  Modal,
  SectionList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { colors, gradients, borderRadius, spacing } from '../../lib/theme';

export function EmployeeAccountAssignmentScreen() {
  const [searchText, setSearchText] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<'employee@gmail.com' | 'office@gmail.com'>('employee@gmail.com');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [selectedRole, setSelectedRole] = useState('');

  // Queries
  const employees = useQuery(api.employees.getAllEmployees) || [];
  const assignedEmployees = useQuery(api.employeeAccountAssignment.getEmployeesForAccount, {
    accountEmail: selectedAccount,
  }) || [];

  // Mutations
  const assignEmployee = useMutation(api.employeeAccountAssignment.assignEmployeeToAccount);
  const removeEmployee = useMutation(api.employeeAccountAssignment.removeEmployeeFromAccount);

  // Get allowed roles for selected account
  const allowedRolesMap = {
    'employee@gmail.com': ['Property Manager', 'Technician', 'Housekeeping'],
    'office@gmail.com': ['Software', 'Accounting', 'General', 'Management'],
  };

  const allowedRoles = allowedRolesMap[selectedAccount];

  // Filter employees for assignment
  const unassignedEmployees = employees.filter(emp => {
    const isAssigned = assignedEmployees.some(a => a._id === emp._id);
    const matchesSearch = searchText === '' || 
      `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchText.toLowerCase());
    return !isAssigned && matchesSearch;
  });

  const handleAssignEmployee = async () => {
    if (!selectedEmployee || !selectedRole) {
      Alert.alert('Error', 'Please select employee and role');
      return;
    }

    try {
      await assignEmployee({
        employeeId: selectedEmployee._id,
        accountEmail: selectedAccount,
        roleForThisAccount: selectedRole,
      });
      Alert.alert('Success', `${selectedEmployee.firstName} assigned to ${selectedAccount}`);
      setShowAssignModal(false);
      setSelectedEmployee(null);
      setSelectedRole('');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleRemoveEmployee = async (employeeId: string) => {
    Alert.alert(
      'Remove Assignment',
      'Are you sure you want to remove this employee from this account?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Remove',
          onPress: async () => {
            try {
              await removeEmployee({
                employeeId,
                accountEmail: selectedAccount,
              });
              Alert.alert('Success', 'Employee removed from account');
            } catch (error: any) {
              Alert.alert('Error', error.message);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Employee Account Assignments</Text>
          <Text style={styles.subtitle}>Manage which shared accounts employees can use</Text>
        </View>

        {/* Account Tabs */}
        <View style={styles.tabsContainer}>
          {(['employee@gmail.com', 'office@gmail.com'] as const).map((account) => (
            <TouchableOpacity
              key={account}
              style={[
                styles.tab,
                selectedAccount === account && styles.tabActive,
              ]}
              onPress={() => setSelectedAccount(account)}
            >
              <MaterialCommunityIcons
                name="email"
                size={16}
                color={selectedAccount === account ? colors.white : colors.text}
              />
              <Text
                style={[
                  styles.tabText,
                  selectedAccount === account && styles.tabTextActive,
                ]}
              >
                {account}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Account Info */}
        <View style={styles.infoCard}>
          <MaterialCommunityIcons name="information" size={20} color={colors.primary} />
          <View style={{ marginLeft: spacing.md }}>
            <Text style={styles.infoTitle}>Allowed Roles</Text>
            <Text style={styles.infoText}>
              {allowedRoles.join(', ')}
            </Text>
          </View>
        </View>

        {/* Assigned Employees Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Assigned Employees ({assignedEmployees.length})
            </Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAssignModal(true)}
            >
              <MaterialCommunityIcons name="plus" size={18} color={colors.white} />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {assignedEmployees.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="account-remove"
                size={48}
                color={colors.lightBorder}
              />
              <Text style={styles.emptyStateText}>No employees assigned yet</Text>
            </View>
          ) : (
            <FlatList
              data={assignedEmployees}
              keyExtractor={(item) => item._id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.employeeCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.employeeName}>
                      {item.firstName} {item.lastName}
                    </Text>
                    <Text style={styles.employeeEmail}>{item.email}</Text>
                    <View style={styles.roleTagContainer}>
                      <View style={[styles.roleTag, { backgroundColor: `${colors.primary}20` }]}>
                        <Text style={[styles.roleTagText, { color: colors.primary }]}>
                          {item.role}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveEmployee(item._id)}
                  >
                    <MaterialCommunityIcons
                      name="close-circle"
                      size={24}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </View>
              )}
            />
          )}
        </View>
      </ScrollView>

      {/* Assign Modal */}
      <Modal
        visible={showAssignModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAssignModal(false)}>
              <Text style={styles.modalHeaderText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Assign Employee</Text>
            <TouchableOpacity onPress={handleAssignEmployee}>
              <Text style={[styles.modalHeaderText, { color: colors.primary }]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Search Employees */}
            <View style={styles.formSection}>
              <Text style={styles.formLabel}>Search & Select Employee</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Type name or email..."
                value={searchText}
                onChangeText={setSearchText}
                placeholderTextColor={colors.textSecondary}
              />

              <FlatList
                data={unassignedEmployees}
                keyExtractor={(item) => item._id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.employeeOption,
                      selectedEmployee?._id === item._id && styles.employeeOptionSelected,
                    ]}
                    onPress={() => setSelectedEmployee(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.employeeOptionName}>
                        {item.firstName} {item.lastName}
                      </Text>
                      <Text style={styles.employeeOptionDept}>{item.department}</Text>
                    </View>
                    {selectedEmployee?._id === item._id && (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={24}
                        color={colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyMessage}>
                    {employees.length === 0
                      ? 'No employees available'
                      : 'All employees already assigned to this account'}
                  </Text>
                }
              />
            </View>

            {/* Select Role */}
            {selectedEmployee && (
              <View style={styles.formSection}>
                <Text style={styles.formLabel}>Select Role for {selectedAccount}</Text>
                {allowedRoles.map((role) => (
                  <TouchableOpacity
                    key={role}
                    style={[
                      styles.roleOption,
                      selectedRole === role && styles.roleOptionSelected,
                    ]}
                    onPress={() => setSelectedRole(role)}
                  >
                    <View
                      style={[
                        styles.roleCheckbox,
                        selectedRole === role && styles.roleCheckboxChecked,
                      ]}
                    >
                      {selectedRole === role && (
                        <MaterialCommunityIcons
                          name="check"
                          size={16}
                          color={colors.white}
                        />
                      )}
                    </View>
                    <Text style={styles.roleOptionText}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightBorder,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightBorder,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12,
    marginLeft: spacing.sm,
    color: colors.text,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.white,
  },
  infoCard: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  infoText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
  },
  addButtonText: {
    marginLeft: spacing.xs,
    color: colors.white,
    fontWeight: '600',
  },
  employeeCard: {
    flexDirection: 'row',
    padding: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.lightBorder,
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  employeeEmail: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  roleTagContainer: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  roleTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  roleTagText: {
    fontSize: 12,
    fontWeight: '600',
  },
  removeButton: {
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyStateText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: colors.lightBorder,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  modalHeaderText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: spacing.lg,
  },
  formSection: {
    marginBottom: spacing.lg,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.md,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.lightBorder,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    fontSize: 14,
    color: colors.text,
  },
  employeeOption: {
    flexDirection: 'row',
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.lightBorder,
    alignItems: 'center',
  },
  employeeOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  employeeOptionName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  employeeOptionDept: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  emptyMessage: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginVertical: spacing.lg,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.lightBorder,
  },
  roleOptionSelected: {
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}10`,
  },
  roleCheckbox: {
    width: 24,
    height: 24,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.lightBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  roleCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleOptionText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
});
