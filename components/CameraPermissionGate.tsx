
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradients, borderRadius } from '../lib/theme';

type CameraPermissionGateProps = {
  permission: { granted: boolean; canAskAgain?: boolean } | null | undefined;
  requestPermission: () => Promise<any>;
  children?: React.ReactNode;
};

export default function CameraPermissionGate({ permission, requestPermission, children }: CameraPermissionGateProps) {
  // Still loading permission status
  if (permission === null || permission === undefined) {
    return (
      <LinearGradient colors={gradients.background as any} style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking camera permission...</Text>
      </LinearGradient>
    );
  }

  // Permission granted — render children
  if (permission.granted) {
    return <>{children}</>;
  }

  // Permission not granted — show gate
  return (
    <LinearGradient colors={gradients.background as any} style={styles.container}>
      <View style={styles.iconCircle}>
        <Ionicons name="camera-outline" size={48} color={colors.primary} />
      </View>
      <Text style={styles.title}>Camera Access Required</Text>
      <Text style={styles.description}>
        This feature needs camera access to capture photos for face detection and document scanning.
      </Text>
      <TouchableOpacity style={styles.allowButton} onPress={requestPermission} activeOpacity={0.7}>
        <Ionicons name="shield-checkmark-outline" size={20} color="#fff" />
        <Text style={styles.allowButtonText}>Allow Access</Text>
      </TouchableOpacity>
      {permission.canAskAgain === false && (
        <Text style={styles.settingsHint}>
          Permission was denied. Please enable camera access in your device Settings.
        </Text>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    maxWidth: 300,
  },
  allowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: borderRadius.md,
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  settingsHint: {
    fontSize: 12,
    color: colors.warning,
    textAlign: 'center',
    marginTop: 16,
    maxWidth: 280,
    lineHeight: 18,
  },
});