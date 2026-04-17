import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, borderRadius, spacing, typography } from '../lib/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: any;
  small?: boolean;
}

export default function Button({ title, onPress, variant = 'primary', loading, disabled, style, small }: ButtonProps) {
  const variantStyles: Record<string, any> = {
    primary: { bg: colors.primary, text: colors.white },
    secondary: { bg: colors.surfaceSecondary, text: colors.text },
    danger: { bg: colors.danger, text: colors.white },
    ghost: { bg: 'transparent', text: colors.primary },
  };
  const v = variantStyles[variant];

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: v.bg },
        small && styles.small,
        (disabled || loading) && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={v.text} size="small" />
      ) : (
        <Text style={[styles.text, { color: v.text }, small && styles.smallText]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  text: {
    ...typography.body,
    fontWeight: '600',
  },
  smallText: {
    fontSize: 13,
  },
  disabled: {
    opacity: 0.6,
  },
});