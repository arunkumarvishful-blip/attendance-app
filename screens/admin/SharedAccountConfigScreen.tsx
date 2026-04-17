import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { colors, gradients, borderRadius, spacing } from '../../lib/theme';
import { LinearGradient } from 'expo-linear-gradient';

export default function SharedAccountConfigScreen() {
  const configs = useQuery(api.sharedAccountConfig.getAllConfigs);
  const accountLogs = useQuery(api.sharedAccountConfig.getAccountAccessLogs, {
    accountEmail: 'employee@gmail.com',
    limit: 50,
  });

  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [showAccessLogs, setShowAccessLogs] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  if (!configs) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Shared Account Configuration</Text>
          <Text style={styles.subtitle}>Device & Role Restrictions</Text>
        </View>

        {/* Account Configurations */}
        <View style={styles.configsContainer}>
          {configs.map((config) => (
            <AccountConfigCard
              key={config.accountEmail}
              config={config}
              onPress={() => setSelectedAccount(config.accountEmail)}
              isSelected={selectedAccount === config.accountEmail}
            />
          ))}
        </View>

        {/* Access Logs Button */}
        <TouchableOpacity
          style={styles.logsButton}
          onPress={() => setShowAccessLogs(true)}
        >
          <MaterialCommunityIcons name="history" size={20} color="white" />
          <Text style={styles.logsButtonText}>View Access Logs</Text>
        </TouchableOpacity>

        <View style={{ height: spacing.xl }} />
      </ScrollView>

      {/* Access Logs Modal */}
      <AccessLogsModal
        visible={showAccessLogs}
        logs={accountLogs}
        onClose={() => setShowAccessLogs(false)}
      />

      {/* Selected Account Details Modal */}
      {selectedAccount && (
        <AccountDetailsModal
          account={configs.find((c) => c.accountEmail === selectedAccount)}
          onClose={() => setSelectedAccount(null)}
        />
      )}
    </SafeAreaView>
  );
}

interface AccountConfig {
  accountEmail: string;
  allowedRoles: string[];
  allowedDeviceIds: string[];
  allowMultipleDevices: boolean;
  description: string;
  isActive: boolean;
}

function AccountConfigCard({
  config,
  onPress,
  isSelected,
}: {
  config: AccountConfig;
  onPress: () => void;
  isSelected: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress}>
      <LinearGradient
        colors={isSelected ? gradients.primary : [colors.surface, colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, isSelected && styles.cardSelected]}
      >
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardTitle}>{config.accountEmail}</Text>
            <Text style={styles.cardSubtitle}>{config.description}</Text>
          </View>
          <MaterialCommunityIcons
            name={config.allowMultipleDevices ? 'devices' : 'tablet'}
            size={24}
            color={isSelected ? 'white' : colors.primary}
          />
        </View>

        <View style={styles.cardDivider} />

        {/* Allowed Roles */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isSelected && styles.sectionTitleSelected]}>
            Allowed Roles
          </Text>
          <View style={styles.rolesContainer}>
            {config.allowedRoles.map((role) => (
              <View
                key={role}
                style={[styles.roleTag, isSelected && styles.roleTagSelected]}
              >
                <Text
                  style={[styles.roleTagText, isSelected && styles.roleTagTextSelected]}
                >
                  ✓ {role}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Device Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isSelected && styles.sectionTitleSelected]}>
            Device Policy
          </Text>
          <View style={styles.deviceInfo}>
            <MaterialCommunityIcons
              name={config.allowMultipleDevices ? 'check-circle' : 'lock'}
              size={18}
              color={isSelected ? '#4CAF50' : colors.success}
            />
            <Text style={[styles.deviceText, isSelected && styles.deviceTextSelected]}>
              {config.allowMultipleDevices
                ? 'Works on any registered device'
                : 'Restricted to one device only'}
            </Text>
          </View>

          {!config.allowMultipleDevices && config.allowedDeviceIds.length > 0 && (
            <View style={styles.boundDevice}>
              <Text style={[styles.boundDeviceLabel, isSelected && styles.textWhite]}>
                Bound Device:
              </Text>
              <Text style={[styles.boundDeviceId, isSelected && styles.textWhite]}>
                {config.allowedDeviceIds[0]}
              </Text>
            </View>
          )}
        </View>

        {/* Blocked Roles */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, isSelected && styles.sectionTitleSelected]}>
            Blocked Roles
          </Text>
          <View style={styles.blockedRolesContainer}>
            {getBlockedRoles(config.allowedRoles).map((role) => (
              <Text
                key={role}
                style={[styles.blockedRole, isSelected && styles.blockedRoleSelected]}
              >
                ✗ {role}
              </Text>
            ))}
          </View>
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
}

interface AccessLog {
  deviceId: string;
  employeeId?: string;
  action: string;
  allowed: boolean;
  blockReason?: string;
  timestamp: number;
  date: string;
}

function AccessLogsModal({
  visible,
  logs,
  onClose,
}: {
  visible: boolean;
  logs?: AccessLog[];
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={colors.primary} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Access Logs</Text>
          <View style={{ width: 24 }} />
        </View>

        {logs && logs.length > 0 ? (
          <FlatList
            data={logs}
            keyExtractor={(item, idx) => `${item.timestamp}-${idx}`}
            renderItem={({ item }) => (
              <View style={styles.logItem}>
                <View style={styles.logItemHeader}>
                  <View style={styles.logItemStatus}>
                    <MaterialCommunityIcons
                      name={item.allowed ? 'check-circle' : 'alert-circle'}
                      size={16}
                      color={item.allowed ? colors.success : colors.error}
                    />
                    <Text
                      style={[
                        styles.logItemAction,
                        { color: item.allowed ? colors.success : colors.error },
                      ]}
                    >
                      {item.allowed ? 'ALLOWED' : 'BLOCKED'}
                    </Text>
                  </View>
                  <Text style={styles.logItemTime}>
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </Text>
                </View>

                <Text style={styles.logItemDetail}>Device: {item.deviceId}</Text>
                <Text style={styles.logItemDetail}>Action: {item.action}</Text>

                {item.blockReason && (
                  <Text style={styles.logItemReason}>{item.blockReason}</Text>
                )}
              </View>
            )}
            scrollEnabled
            nestedScrollEnabled
          />
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons
              name="history"
              size={48}
              color={colors.textSecondary}
            />
            <Text style={styles.emptyText}>No access logs yet</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function AccountDetailsModal({
  account,
  onClose,
}: {
  account?: AccountConfig;
  onClose: () => void;
}) {
  if (!account) return null;

  return (
    <Modal visible={true} transparent animationType="fade">
      <View style={styles.centeredModal}>
        <View style={styles.detailsCard}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color={colors.primary} />
          </TouchableOpacity>

          <Text style={styles.detailsTitle}>{account.accountEmail}</Text>
          <Text style={styles.detailsDescription}>{account.description}</Text>

          <View style={styles.detailsSection}>
            <Text style={styles.detailsSectionTitle}>Account Details</Text>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Device Policy:</Text>
              <Text style={styles.detailValue}>
                {account.allowMultipleDevices ? 'Multiple Devices' : 'Single Device'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Allowed Roles:</Text>
              <Text style={styles.detailValue}>{account.allowedRoles.length} roles</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Status:</Text>
              <Text
                style={[
                  styles.detailValue,
                  { color: account.isActive ? colors.success : colors.error },
                ]}
              >
                {account.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.detailsCloseButton} onPress={onClose}>
            <Text style={styles.detailsCloseButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function getBlockedRoles(allowedRoles: string[]): string[] {
  const allRoles = [
    'Property Manager',
    'Technician',
    'Housekeeping',
    'Software',
    'Accounting',
    'General',
    'Management',
  ];
  return allRoles.filter((role) => !allowedRoles.includes(role));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  configsContainer: {
    padding: spacing.md,
    gap: spacing.md,
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  cardDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  section: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  sectionTitleSelected: {
    color: 'rgba(255, 255, 255, 0.8)',
  },
  rolesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  roleTag: {
    backgroundColor: colors.success + '20',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  roleTagSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  roleTagText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '500',
  },
  roleTagTextSelected: {
    color: 'white',
  },
  deviceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  deviceText: {
    fontSize: 12,
    color: colors.text,
  },
  deviceTextSelected: {
    color: 'white',
  },
  boundDevice: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  boundDeviceLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  boundDeviceId: {
    fontSize: 11,
    color: colors.text,
    marginTop: spacing.xs,
  },
  textWhite: {
    color: 'white',
  },
  blockedRolesContainer: {
    gap: spacing.xs,
  },
  blockedRole: {
    fontSize: 12,
    color: colors.error,
  },
  blockedRoleSelected: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  logsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  logsButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  modal: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  logItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  logItemStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  logItemAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  logItemTime: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  logItemDetail: {
    fontSize: 12,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  logItemReason: {
    fontSize: 12,
    color: colors.error,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  centeredModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: spacing.md,
  },
  detailsCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    width: '100%',
    maxWidth: 400,
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginBottom: spacing.md,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detailsDescription: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  detailsSection: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  detailsSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  detailLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  detailsCloseButton: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
  },
  detailsCloseButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
    fontSize: 14,
  },
});
