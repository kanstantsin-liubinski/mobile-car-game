import React from 'react';
import { Modal, View, Text, StyleSheet, Platform } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { garageStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { SheetHeader, SheetScroll } from '@components/SheetHeader';

/** Информационное окно снизу фиксированной высоты: заголовок с крестиком и прокручиваемое содержимое */
export const InfoSheet = ({
  visible,
  title,
  onClose,
  onClosed,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  /** Окно полностью закрыто (см. SheetModal) */
  onClosed?: () => void;
  children: React.ReactNode;
}) => {
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  return (
    <SheetModal visible={visible} onRequestClose={onClose} onClosed={onClosed}>
        <View style={[garageStyles.modalContent, styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
          <SheetHeader title={title} onClose={onClose} flush />
          {visible && <SheetScroll>{children}</SheetScroll>}
        </View>
    </SheetModal>
  );
};

/** Блок с заголовком внутри информационного окна */
export const InfoSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

/** Строка «подпись — значение» */
export const InfoRow = ({ label, value, accent }: { label: string; value: string; accent?: string }) => (
  <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, accent ? { color: accent } : null]}>{value}</Text>
  </View>
);

export const InfoText = ({ children }: { children: React.ReactNode }) => <Text style={styles.text}>{children}</Text>;

export const InfoBar = ({ progress, color }: { progress: number; color: string }) => (
  <View style={styles.track}>
    <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%`, backgroundColor: color }]} />
  </View>
);

const styles = StyleSheet.create({
  // Фиксированная высота: окно не прыгает при обновлении содержимого
  sheet: { height: '78%' },
  section: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: colors.textTertiary, textTransform: 'uppercase', marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  label: { flexShrink: 1, fontSize: 13, color: colors.textTertiary },
  value: { fontSize: 13, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'], textAlign: 'right' },
  text: { fontSize: 13, color: colors.textPrimary, lineHeight: 19 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden', marginVertical: 2 },
  fill: { height: '100%', borderRadius: 4 },
});
