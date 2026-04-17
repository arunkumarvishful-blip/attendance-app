import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getStatusColor } from '../lib/utils';

export default function StatusPill({ status }: { status: string }) {
const c = getStatusColor(status);
return (
<View style={[styles.pill, { backgroundColor: c.bg }]}>
<View style={[styles.dot, { backgroundColor: c.text }]} />
<Text style={[styles.text, { color: c.text }]}>{status.charAt(0).toUpperCase() + status.slice(1)}</Text>
</View>
);
}

const styles = StyleSheet.create({
pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, gap: 6, alignSelf: 'flex-start' },
dot: { width: 6, height: 6, borderRadius: 3 },
text: { fontSize: 12, fontWeight: '600' },
});
