import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors } from '../../lib/theme';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import * as Device from 'expo-device';

export default function DeviceManagementScreen({ companyId }: { companyId: string }) {
  const [showQRModal, setShowQRModal] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  // Get registered devices - directly from passed companyId
  const devices = useQuery(
    companyId ? api.deviceManagement.getRegisteredDevices : 'skip',
    companyId ? { companyId: companyId as any } : 'skip'
  );

  const registerDeviceMutation = useMutation(api.deviceManagement.registerDevice);
  const updateStatusMutation = useMutation(api.deviceManagement.updateDeviceStatus);

  const handleRegisterDevice = async () => {
    if (!deviceName.trim()) {
      Alert.alert('Error', 'Please enter a device name');
      return;
    }

    if (!companyId) {
      Alert.alert('Error', 'Company information not found');
      return;
    }

    setIsRegistering(true);
    try {
      const deviceId = Device.deviceId;
      const fullName = `${Device.manufacturer} ${Device.modelName}`;

      await registerDeviceMutation({
        deviceId: deviceId || 'unknown',
        deviceName: deviceName.trim(),
        companyId,
        notes: `Registered: ${fullName}`,
      });

      Alert.alert('Success', `Device "${deviceName}" registered successfully!`);
      setDeviceName('');
      setShowQRModal(false);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to register device');
    } finally {
      setIsRegistering(false);
    }
  };

  const handleRevokeDevice = async (deviceId: string) => {
    Alert.alert('Revoke Device?', 'This device will be disabled. Continue?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Revoke',
        onPress: async () => {
          try {
            await updateStatusMutation({
              registeredDeviceId: deviceId,
              status: 'revoked',
            });
            Alert.alert('Success', 'Device revoked');
          } catch (error: any) {
            Alert.alert('Error', error.message);
          }
        },
      },
    ]);
  };

  const handleReactivateDevice = async (deviceId: string) => {
    try {
      await updateStatusMutation({
        registeredDeviceId: deviceId,
        status: 'active',
      });
      Alert.alert('Success', 'Device reactivated');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return colors.success;
      case 'revoked': return colors.danger;
      case 'inactive': return colors.warning;
      default: return colors.secondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return 'check-circle';
      case 'revoked': return 'close-circle';
      case 'inactive': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  if (!devices) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Device Management</Text>
          <Text style={styles.subtitle}>Manage registered devices for shared accounts</Text>
        </View>

        {/* Register Button */}
        <TouchableOpacity
          style={styles.registerButton}
          onPress={() => setShowQRModal(true)}
        >
          <MaterialCommunityIcons name="plus-circle" size={20} color="#fff" />
          <Text style={styles.registerButtonText}>Register New Device</Text>
        </TouchableOpacity>

        {/* Devices List */}
        <View style={styles.devicesList}>
          <Text style={styles.sectionTitle}>
            Registered Devices ({devices.length})
          </Text>

          {devices.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="devices" size={48} color={colors.secondary} />
              <Text style={styles.emptyStateText}>No devices registered yet</Text>
            </View>
          ) : (
            devices.map((device: any) => (
              <View key={device._id} style={[styles.deviceCard, { borderLeftColor: getStatusColor(device.status) }]}>
                <View style={styles.deviceHeader}>
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{device.deviceName}</Text>
                    <Text style={styles.deviceId} numberOfLines={1}>
                      ID: {device.deviceId}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(device.status) + '20' }]}>
                    <MaterialCommunityIcons
                      name={getStatusIcon(device.status)}
                      size={14}
                      color={getStatusColor(device.status)}
                    />
                    <Text style={[styles.statusText, { color: getStatusColor(device.status) }]}>
                      {device.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.deviceMeta}>
                  <View style={styles.metaItem}>
                    <MaterialCommunityIcons name="calendar" size={14} color={colors.secondary} />
                    <Text style={styles.metaText}>
                      {new Date(device.registeredAt).toLocaleDateString()}
                    </Text>
                  </View>
                  {device.lastUsedAt && (
                    <View style={styles.metaItem}>
                      <MaterialCommunityIcons name="clock" size={14} color={colors.secondary} />
                      <Text style={styles.metaText}>
                        {new Date(device.lastUsedAt).toLocaleString()}
                      </Text>
                    </View>
                  )}
                </View>

                {device.notes && (
                  <Text style={styles.notes}>{device.notes}</Text>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                  {device.status === 'active' ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.revokeButton]}
                      onPress={() => handleRevokeDevice(device._id)}
                    >
                      <MaterialCommunityIcons name="lock" size={16} color={colors.danger} />
                      <Text style={[styles.actionText, { color: colors.danger }]}>Revoke</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.reactivateButton]}
                      onPress={() => handleReactivateDevice(device._id)}
                    >
                      <MaterialCommunityIcons name="lock-open" size={16} color={colors.success} />
                      <Text style={[styles.actionText, { color: colors.success }]}>Reactivate</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Register Device Modal */}
      <Modal visible={showQRModal} transparent animationType="slide">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register Device</Text>
              <TouchableOpacity onPress={() => setShowQRModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalInstructions}>
                Give this device a name (e.g., "Office Tablet", "Reception iPad")
              </Text>

              <TextInput
                style={styles.input}
                placeholder="Device name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={deviceName}
                onChangeText={setDeviceName}
                editable={!isRegistering}
              />

              <View style={styles.deviceInfoBox}>
                <Text style={styles.deviceInfoLabel}>This Device:</Text>
                <Text style={styles.deviceInfoValue}>
                  {Device.manufacturer} {Device.modelName}
                </Text>
                <Text style={styles.deviceInfoValue} numberOfLines={2}>
                  ID: {Device.deviceId}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.confirmButton, isRegistering && styles.buttonDisabled]}
                onPress={handleRegisterDevice}
                disabled={isRegistering}
              >
                {isRegistering ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.confirmButtonText}>Register Device</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowQRModal(false)}
                disabled={isRegistering}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgStart,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  registerButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 24,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  devicesList: {
    gap: 12,
  },
  deviceCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    gap: 12,
  },
  deviceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  deviceInfo: {
    flex: 1,
    gap: 4,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  deviceId: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'monospace',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  deviceMeta: {
    gap: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  notes: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  revokeButton: {
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    borderWidth: 1,
    borderColor: colors.danger,
  },
  reactivateButton: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: colors.success,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bgStart,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  modalBody: {
    padding: 16,
    gap: 16,
  },
  modalInstructions: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 16,
  },
  deviceInfoBox: {
    backgroundColor: 'rgba(74, 144, 217, 0.15)',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  deviceInfoLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  deviceInfoValue: {
    fontSize: 13,
    color: '#fff',
    fontFamily: 'monospace',
  },
  confirmButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});