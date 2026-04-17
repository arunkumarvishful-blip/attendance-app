import React from 'react';
import { View, StyleSheet } from 'react-native';

export default function GlassCard({ children, style, noPadding }: any) {
  return (
    <View style={[styles.outer, style, noPadding && { padding: 0 }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
});