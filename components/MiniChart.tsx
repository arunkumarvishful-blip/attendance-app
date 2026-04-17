import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius } from '../lib/theme';
import Svg, { Circle } from 'react-native-svg';

interface BarData {
label: string;
value: number;
color?: string;
}

export function BarChart({ data, height = 100 }: { data: BarData[]; height?: number }) {
const maxVal = Math.max(...data.map(d => d.value), 1);
return (
<View style={[bStyles.container, { height }]}>
<View style={bStyles.barsRow}>
{data.map((d, i) => (
<View key={i} style={bStyles.barWrapper}>
<View style={[bStyles.bar, {
height: `${(d.value / maxVal) * 70}%`,
backgroundColor: d.color || colors.primary,
}]} />
<Text style={bStyles.barVal}>{d.value}</Text>
<Text style={bStyles.barLabel}>{d.label}</Text>
</View>
))}
</View>
</View>
);
}

const bStyles = StyleSheet.create({
container: { justifyContent: 'flex-end' },
barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', flex: 1 },
barWrapper: { alignItems: 'center', flex: 1 },
bar: { width: 28, borderRadius: 6, minHeight: 4 },
barVal: { fontSize: 12, fontWeight: '600', color: colors.text, marginTop: 4 },
barLabel: { fontSize: 10, color: colors.textSecondary, marginTop: 1 },
});

export function ProgressRing({ percentage, size = 80 }: { percentage: number; size?: number }) {
const strokeWidth = 8;
const radius = (size - strokeWidth) / 2;
const circumference = 2 * Math.PI * radius;
const strokeDashoffset = circumference * (1 - percentage / 100);
const ringColor = percentage >= 80 ? colors.success : percentage >= 50 ? colors.warning : colors.danger;

return (
<View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
<Svg width={size} height={size}>
<Circle
cx={size / 2} cy={size / 2} r={radius}
stroke={colors.surfaceSecondary}
strokeWidth={strokeWidth}
fill="none"
/>
<Circle
cx={size / 2} cy={size / 2} r={radius}
stroke={ringColor}
strokeWidth={strokeWidth}
fill="none"
strokeDasharray={`${circumference}`}
strokeDashoffset={strokeDashoffset}
strokeLinecap="round"
rotation="-90"
origin={`${size / 2}, ${size / 2}`}
/>
</Svg>
<View style={{ position: 'absolute', alignItems: 'center' }}>
<Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{percentage}%</Text>
</View>
</View>
);
}

export function DeptBar({ label, present, total, rate }: { label: string; present: number; total: number; rate: number }) {
const barColor = rate >= 80 ? colors.success : rate >= 50 ? colors.warning : colors.danger;
return (
<View style={dStyles.row}>
<View style={dStyles.labelRow}>
<Text style={dStyles.label}>{label}</Text>
<Text style={dStyles.count}>{present}/{total} ({rate}%)</Text>
</View>
<View style={dStyles.barBg}>
<View style={[dStyles.barFill, { width: `${rate}%`, backgroundColor: barColor }]} />
</View>
</View>
);
}

const dStyles = StyleSheet.create({
row: { marginBottom: 12 },
labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
label: { fontSize: 13, fontWeight: '500', color: colors.text },
count: { fontSize: 12, color: colors.textSecondary },
barBg: { height: 8, backgroundColor: colors.surfaceSecondary, borderRadius: 4, overflow: 'hidden' },
barFill: { height: '100%', borderRadius: 4 },
});
