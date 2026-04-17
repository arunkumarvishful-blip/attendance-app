import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, colors } from '../lib/theme';

export default function KPICard({ title, value, icon, color, glowColor }: any) {
  return (
    <View style={[styles.card, { borderColor: glowColor || colors.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: glowColor || colors.primaryLight }]}>
        <Ionicons name={icon} size={18} color={color || colors.primary} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: borderRadius.lg, borderWidth: 1, padding: 16, alignItems: 'center', gap: 6 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 24, fontWeight: '700', color: '#E6EDF3', letterSpacing: -0.5 },
  title: { fontSize: 10, fontWeight: '500', color: 'rgba(230,237,243,0.5)', letterSpacing: 0.5, textTransform: 'uppercase' },
});