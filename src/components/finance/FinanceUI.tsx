import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';
import { formatMoney } from '../../economy/format';

/** Общие строительные блоки финансовых экранов */

export const financeColors = {
  positive: '#22C55E',
  negative: '#EF4444',
  warning: '#F59E0B',
};

export const moneyColor = (cents: number) =>
  cents > 0 ? financeColors.positive : cents < 0 ? financeColors.negative : colors.textPrimary;

interface RowProps {
  label: string;
  /** Сумма в центах */
  cents?: number;
  /** Произвольное значение вместо суммы */
  value?: string;
  /** Подсветить знак суммы цветом и показывать «+» */
  signed?: boolean;
  bold?: boolean;
  muted?: boolean;
}

export const FinanceRow = ({ label, cents, value, signed, bold, muted }: RowProps) => (
  <View style={ui.row}>
    <Text style={[ui.rowLabel, bold && ui.bold, muted && ui.muted]}>{label}</Text>
    <Text
      style={[
        ui.rowValue,
        bold && ui.bold,
        muted && ui.muted,
        signed && cents !== undefined && { color: moneyColor(cents) },
      ]}
    >
      {value ?? (cents !== undefined ? formatMoney(cents, { sign: signed }) : '')}
    </Text>
  </View>
);

export const FinanceSection = ({ title, children }: { title?: string; children: React.ReactNode }) => (
  <View style={ui.section}>
    {title && <Text style={ui.sectionTitle}>{title}</Text>}
    {children}
  </View>
);

export const Notice = ({ level, children }: { level: 'info' | 'warning' | 'danger'; children: React.ReactNode }) => {
  const color = level === 'danger' ? financeColors.negative : level === 'warning' ? financeColors.warning : colors.primary;
  return (
    <View style={[ui.notice, { borderColor: color, backgroundColor: `${color}1F` }]}>
      <Text style={[ui.noticeText, { color: level === 'info' ? colors.textSecondary : color }]}>{children}</Text>
    </View>
  );
};

export const ui = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 12,
  },
  rowLabel: {
    flexShrink: 1,
    fontSize: 14,
    color: colors.textTertiary,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  bold: {
    fontWeight: '800',
    color: colors.textPrimary,
    fontSize: 15,
  },
  muted: {
    fontSize: 12,
  },
  section: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 6,
  },
  notice: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  noticeText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
  },
  dangerButton: {
    backgroundColor: financeColors.negative,
  },
});
