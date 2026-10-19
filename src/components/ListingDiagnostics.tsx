import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useMarketContext } from '@hooks/MarketContext';
import type { MarketListing } from '../utils/marketGenerator';
import { describeWear, overallCondition, type Interval } from '../economy/carCondition';
import { hasEquipment, serviceDiagnosticsCents } from '../economy/economy';
import { formatMoney, formatHotTimer } from '../economy/format';
import { DAY_MS } from '../economy/time';

const LEVEL_TEXT: Record<string, string> = {
  visual: 'Беглый взгляд',
  inspected: 'Внимательный осмотр',
  scanned: 'Компьютерная диагностика',
  exact: 'Полная проверка в сервисе',
};

const fmt = (iv: Interval, exact: boolean) =>
  exact ? `${iv.low.toFixed(1)}%` : iv.low === iv.high ? `${iv.low}%` : `${iv.low}–${iv.high}%`;

const RangeBar = ({ label, iv, exact, color }: { label: string; iv: Interval; exact: boolean; color: string }) => (
  <View style={styles.row}>
    <View style={styles.rowHead}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{fmt(iv, exact)}</Text>
    </View>
    <View style={styles.track}>
      {/* Неизвестная зона — диапазон, где может быть значение */}
      <View style={[styles.range, { left: `${iv.low}%`, width: `${Math.max(1.5, iv.high - iv.low)}%`, backgroundColor: color }]} />
    </View>
  </View>
);

/**
 * Что игрок знает о машине на рынке. До покупки — интервалы (каждый содержит реальное значение),
 * точные значения — только после сторонней проверки. Реальные числа в разметку не попадают.
 */
export const ListingDiagnostics = ({ listing }: { listing: MarketListing }) => {
  const { state, balance } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const { getReadout, getDiag, inspectListing, scanListing, orderServiceDiagnostics } = useMarketContext();
  const readout = getReadout(listing);
  const diag = getDiag(listing.car.id);
  const exact = readout.level === 'exact';
  const hasScanner = hasEquipment(state, 'scanner');
  const serviceCents = serviceDiagnosticsCents(listing.tier);
  const servicePending = diag.serviceReadyAtMs !== undefined && gameTimeMs < diag.serviceReadyAtMs;

  // Общее состояние — тоже интервалом: из границ технического и ЛКП
  const overall: Interval = {
    low: Math.floor(overallCondition(readout.tech.low, readout.paint.low)),
    high: Math.ceil(overallCondition(readout.tech.high, readout.paint.high)),
  };

  return (
    <View style={styles.box}>
      <Text style={styles.source}>🔎 {LEVEL_TEXT[readout.level]}</Text>
      <RangeBar label="Тех. состояние" iv={readout.tech} exact={exact} color="#F59E0B" />
      <RangeBar label="Тех. максимум" iv={readout.max} exact={exact} color={colors.primary} />
      <RangeBar label="ЛКП" iv={readout.paint} exact={exact} color="#38BDF8" />
      <Text style={styles.overall}>
        Общее состояние: {exact ? `${overallCondition(readout.tech.low, readout.paint.low).toFixed(1)}%` : `${overall.low}–${overall.high}%`}
      </Text>

      {(readout.level === 'inspected' || readout.level === 'scanned') && (
        <View style={styles.notes}>
          {describeWear(readout.paint, readout.tech).map((n) => (
            <Text key={n} style={styles.note}>• {n}</Text>
          ))}
        </View>
      )}

      {!exact && (
        <View style={styles.actions}>
          {readout.level === 'visual' && (
            <TouchableOpacity style={styles.action} onPress={() => inspectListing(listing)}>
              <Text style={styles.actionText}>👀 Осмотреть</Text>
            </TouchableOpacity>
          )}
          {hasScanner && readout.level !== 'scanned' && (
            <TouchableOpacity style={styles.action} onPress={() => scanListing(listing)}>
              <Text style={styles.actionText}>💻 Сканер</Text>
            </TouchableOpacity>
          )}
          {servicePending ? (
            <View style={[styles.action, styles.pending]}>
              <Text style={styles.actionText}>⏳ Сервис: {formatHotTimer((diag.serviceReadyAtMs ?? 0) - gameTimeMs, DAY_MS)}</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.action, balance * 100 < serviceCents && styles.disabled]}
              disabled={balance * 100 < serviceCents}
              onPress={() => orderServiceDiagnostics(listing)}
            >
              <Text style={styles.actionText}>🧰 Сервис {formatMoney(serviceCents)} · 1 день</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },
  source: { fontSize: 11, fontWeight: '700', color: colors.textTertiary },
  row: { gap: 3 },
  rowHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 12, color: colors.textTertiary },
  value: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, backgroundColor: '#27272A', overflow: 'hidden' },
  range: { position: 'absolute', top: 0, bottom: 0, borderRadius: 3, opacity: 0.85 },
  overall: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  notes: { gap: 2 },
  note: { fontSize: 11, color: colors.textTertiary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  action: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  pending: { borderColor: '#F59E0B' },
  disabled: { opacity: 0.45 },
  actionText: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
});
