import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { borderRadius, shadows, spacing, colors } from '../lib/theme';

export default function StatCard({ title, value, icon, color, bgColor }: any) {
return (
<View style={[styles.card, { borderLeftColor: color }]}>
<View style={[styles.iconWrap, { backgroundColor: bgColor }]}>
<Ionicons name={icon} size={18} color={color} />
</View>
<Text style={styles.value}>{value}</Text>
<Text style={styles.title}>{title}</Text>
</View>
);
}

const styles = StyleSheet.create({
card: {
width: '47%',
backgroundColor: colors.surface,
borderRadius: borderRadius.lg,
padding: 14,
borderLeftWidth: 3,
...shadows.sm,
},
iconWrap: {
width: 32, height: 32, borderRadius: 8,
justifyContent: 'center', alignItems: 'center', marginBottom: 8,
},
value: { fontSize: 22, fontWeight: '700', color: colors.text },
title: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
});
