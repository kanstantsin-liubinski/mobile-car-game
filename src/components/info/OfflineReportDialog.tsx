import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { DialogOverlay } from '@components/DialogOverlay';
import { useEconomy } from '@hooks/EconomyContext';
import { colors } from '@styles/colors';
import { ICONS } from '@img/gameIcons';
import { formatMoney, formatRealSpan } from '../../economy/format';
import { OFFLINE_MAX_MS } from '../../economy/offline';
import { haptics } from '../../utils/haptics';

/** «С возвращением»: что заработали автоматизированные филиалы, пока игры не было */
export const OfflineReportDialog = () => {
  const { offlineReport: report, dismissOfflineReport } = useEconomy();

  useEffect(() => {
    if (report) haptics.success();
  }, [report]);

  if (!report) return null;
  const capped = report.awayMs > report.workedMs;
  return (
    <DialogOverlay
      visible
      icon={ICONS.money}
      accent="#22C55E"
      title="С возвращением!"
      message={
        capped
          ? `Тебя не было ${formatRealSpan(report.awayMs)}. Автоматизированные филиалы работали первые ${formatRealSpan(report.workedMs)} — дольше без тебя управляющие не справляются.`
          : `Тебя не было ${formatRealSpan(report.awayMs)}. Всё это время автоматизированные филиалы работали.`
      }
      buttons={[{ label: `Забрать ${formatMoney(report.totalCents)}`, onPress: dismissOfflineReport }]}
    >
      <View style={styles.box}>
        {report.lines.map((l) => (
          <View key={l.garageId} style={styles.row}>
            <Text style={styles.name} numberOfLines={1}>
              {l.name}
            </Text>
            <Text style={styles.value}>{formatMoney(l.cents, { sign: true })}</Text>
          </View>
        ))}
        {report.lines.length > 1 && (
          <View style={[styles.row, styles.total]}>
            <Text style={[styles.name, styles.bold]}>Итого</Text>
            <Text style={[styles.value, styles.bold]}>{formatMoney(report.totalCents, { sign: true })}</Text>
          </View>
        )}
      </View>
      <Text style={styles.hint}>
        Деньги уже на счету. Филиал зарабатывает со своей обычной скоростью — по прибыли последних месяцев, не дольше{' '}
        {formatRealSpan(OFFLINE_MAX_MS)} после закрытия игры.
      </Text>
    </DialogOverlay>
  );
};

const styles = StyleSheet.create({
  box: { backgroundColor: colors.cardBg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  total: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 6 },
  name: { flexShrink: 1, fontSize: 14, color: colors.textSecondary },
  value: { fontSize: 15, fontWeight: '800', color: '#22C55E', fontVariant: ['tabular-nums'] },
  bold: { fontWeight: '800', color: colors.textPrimary },
  hint: { fontSize: 12, lineHeight: 17, color: colors.textTertiary, textAlign: 'center' },
});
