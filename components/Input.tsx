import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, borderRadius, spacing, typography } from '../lib/theme';

interface InputProps {
  label?: string;
  error?: string;
  [key: string]: any;
}

export default function Input({ label, error, style, ...props }: InputProps) {
return (
<View style={styles.container}>
{label && <Text style={styles.label}>{label}</Text>}
<TextInput
style={[styles.input, error && styles.inputError, style]}
placeholderTextColor={colors.textTertiary}
{...props}
/>
{error && <Text style={styles.error}>{error}</Text>}
</View>
);
}

const styles = StyleSheet.create({
container: { marginBottom: spacing.md },
label: { ...typography.label, marginBottom: spacing.xs + 2 },
input: {
borderWidth: 1,
borderColor: colors.border,
borderRadius: borderRadius.md,
paddingHorizontal: spacing.md,
paddingVertical: spacing.md,
fontSize: 15,
color: colors.text,
backgroundColor: colors.surface,
},
inputError: { borderColor: colors.danger },
error: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
});