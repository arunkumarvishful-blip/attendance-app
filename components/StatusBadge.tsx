import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getStatusColor } from '../lib/utils';
import { borderRadius, typography } from '../lib/theme';

export default function StatusBadge({ status }: { status: string }) {
const color = getStatusColor(status);
return (
<View style={[styles.badge, { backgroundColor: color.bg }]}>
<Text style={[styles.text, { color: color.text }]}>
{status.charAt(0).toUpperCase() + status.slice(1)}
</Text>
</View>
);
}

const styles = StyleSheet.create({
badge: {
paddingHorizontal: 10,
paddingVertical: 4,
borderRadius: borderRadius.full,
},
text: {
...typography.caption,
fontWeight: '600',
},
});
