import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, borderRadius } from '../lib/theme';

export default function GlassButton({ title, onPress, variant = 'primary', loading, disabled, small, icon, style }: any) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const isGhost = variant === 'ghost';
  const bg = isPrimary ? colors.primary : isDanger ? colors.danger : isGhost ? 'transparent' : 'rgba(255,255,255,0.08)';
  const textColor = (isPrimary || isDanger) ? '#fff' : isGhost ? colors.textSecondary : colors.primary;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.btn, small && styles.btnSmall, { backgroundColor: bg }, (disabled || loading) && styles.disabled, style]}
      activeOpacity={0.7}
    >
      {loading ? <ActivityIndicator color={textColor} size="small" /> : (
        <>
          {icon}
          <Text style={[styles.btnText, small && styles.btnTextSmall, { color: textColor }]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: borderRadius.md, gap: 8 },
  btnSmall: { paddingVertical: 10, paddingHorizontal: 16 },
  btnText: { fontSize: 15, fontWeight: '600' },
  btnTextSmall: { fontSize: 13 },
  disabled: { opacity: 0.5 },
});