import React from 'react';
import { View, Text, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { colors } from '@styles/colors';

/** Внутренний отступ нижних окон (garageStyles.modalContent) — хедер, футер и прокрутка выходят на всю ширину */
export const SHEET_PADDING = 14;

/**
 * Заголовок нижнего окна с крестиком закрытия и серой линией снизу, как у шапки игры.
 * flush — сразу под ним прокрутка (SheetScroll): без отступа, чтобы содержимое уходило под линию.
 */
export const SheetHeader = ({ title, onClose, flush }: { title: string; onClose?: () => void; flush?: boolean }) => (
  <View style={[styles.header, flush && { marginBottom: 0 }]}>
    <View style={styles.side} />
    <Text style={styles.title} numberOfLines={1}>
      {title}
    </Text>
    {onClose ? (
      <TouchableOpacity style={styles.side} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    ) : (
      <View style={styles.side} />
    )}
  </View>
);

/** Футер окна с кнопками — отделён серой линией сверху, как нижнее меню игры; прокрутка над ним — вплотную к линии */
export const SheetFooter = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[styles.footer, style]}>{children}</View>
);

/**
 * Прокрутка содержимого окна на всю ширину и вплотную к линиям шапки и футера: все отступы —
 * внутри прокрутки, поэтому содержимое уходит под линию, а полоса прокрутки идёт по краю окна.
 */
export const SheetScroll = ({
  children,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) => (
  <ScrollView style={[styles.scroll, style]} contentContainerStyle={[styles.scrollContent, contentStyle]}>
    {children}
  </ScrollView>
);

export const sheetDividers = StyleSheet.create({
  /** Линия под заголовком окна на всю ширину */
  bottom: {
    marginHorizontal: -SHEET_PADDING,
    paddingHorizontal: SHEET_PADDING,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  /** Линия над футером окна на всю ширину */
  top: {
    marginHorizontal: -SHEET_PADDING,
    paddingHorizontal: SHEET_PADDING,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: -SHEET_PADDING,
    paddingHorizontal: SHEET_PADDING,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  side: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  close: { fontSize: 20, color: colors.textTertiary, fontWeight: '700' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: -SHEET_PADDING,
    paddingHorizontal: SHEET_PADDING,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scroll: { flexShrink: 1, marginHorizontal: -SHEET_PADDING },
  scrollContent: { paddingHorizontal: SHEET_PADDING, paddingTop: 12, paddingBottom: 12 },
});
