import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, borderRadius, spacing } from '../lib/theme';

export default function GlassInput({ label, error, style, ...props }: any) {
return (
<View style={[styles.container, style]}>
{label && <Text style={styles.label}>{label}</Text>}
<TextInput
style={styles.input}
placeholderTextColor="rgba(255,255,255,0.25)"
selectionColor={colors.primary}
{...props}
/>
{error && <Text style={styles.error}>{error}</Text>}
</View>
);
}

const styles = StyleSheet.create({
container: { marginBottom: spacing.md },
label: { fontSize: 12, fontWeight: '500', color: 'rgba(255,255,255,0.5)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' },
input: {
backgroundColor: 'rgba(255,255,255,0.06)',
borderWidth: 1,
borderColor: 'rgba(255,255,255,0.1)',
borderRadius: borderRadius.md,
paddingHorizontal: 16,
paddingVertical: 14,
fontSize: 15,
color: '#fff',
},
error: { fontSize: 12, color: colors.danger, marginTop: 4 },
});
