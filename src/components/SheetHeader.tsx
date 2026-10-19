import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';

/** Заголовок нижнего окна с крестиком закрытия справа */
export const SheetHeader = ({ title, onClose }: { title: string; onClose: () => void }) => (
  <View style={styles.header}>
    <View style={styles.side} />
    <Text style={styles.title} numberOfLines={1}>
      {title}
    </Text>
    <TouchableOpacity style={styles.side} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Text style={styles.close}>✕</Text>
    </TouchableOpacity>
  </View>
);

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  side: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  close: { fontSize: 20, color: colors.textTertiary, fontWeight: '700' },
});
