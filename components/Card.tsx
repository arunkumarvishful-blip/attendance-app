import { View, StyleSheet } from 'react-native';
import { colors, borderRadius, shadows, spacing } from '../lib/theme';

export default function Card(props: any) {
const { children, style, ...rest } = props;
return <View style={[styles.card, style]} {...rest}>{children}</View>;
}

const styles = StyleSheet.create({
card: {
backgroundColor: colors.surface,
borderRadius: borderRadius.lg,
padding: spacing.lg,
...shadows.md,
},
});
