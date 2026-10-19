import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';
import { ActionTiles } from '@components/ActionTiles';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useMarketContext } from '@hooks/MarketContext';
import type { MarketListing } from '../utils/marketGenerator';
import { describeWear, overallCondition, scannerAccuracy, type Interval } from '../economy/carCondition';
import { hasEquipment, serviceDiagnosticsCents } from '../economy/economy';
import { formatMoney, formatGameDays } from '../economy/format';
import { DAY_MS } from '../economy/time';
import * as B from '../economy/balance';

const LEVEL_TEXT: Record<string, string> = {
  visual: 'Беглый взгляд',
  inspected: 'Внимательный осмотр',
  scanned: 'Компьютерная диагностика',
  exact: 'Полная проверка в сервисе',
};

const fmt = (iv: Interval, exact: boolean) =>
  exact ? `${iv.low.toFixed(1)}%` : iv.low === iv.high ? `${iv.low}%` : `${iv.low}–${iv.high}%`;

/**
 * Шкала параметра: до нижней границы — уверенно (яркий цвет), внутри интервала — неизвестно
 * где именно (тот же цвет, бледнее), дальше — пусто.
 */
const RangeBar = ({ label, iv, exact, color }: { label: string; iv: Interval; exact: boolean; color: string }) => (
  <View style={styles.row}>
    <View style={styles.rowHead}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color }]}>{fmt(iv, exact)}</Text>
    </View>
    <View style={styles.track}>
      <View style={[styles.sure, { width: `${iv.low}%`, backgroundColor: color }]} />
      {!exact && iv.high > iv.low && (
        <View style={[styles.unsure, { left: `${iv.low}%`, width: `${iv.high - iv.low}%`, backgroundColor: color }]} />
      )}
    </View>
  </View>
);

type ActionKey = 'inspect' | 'scan' | 'service';

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
  const scan = scannerAccuracy(state.player.picker.level);

  // Общее состояние — тоже интервалом: из границ технического и ЛКП
  const overall: Interval = {
    low: Math.floor(overallCondition(readout.tech.low, readout.paint.low)),
    high: Math.ceil(overallCondition(readout.tech.high, readout.paint.high)),
  };

  const INFO: Record<ActionKey, string> = {
    inspect: `Бесплатно и сразу. Внимательный осмотр уточняет интервалы (тех. ±${B.INSPECT_ACCURACY.tech}, максимум ±${B.INSPECT_ACCURACY.max}, ЛКП ±${B.INSPECT_ACCURACY.paint}) и описывает износ. Первый осмотр объявления: +${B.PICKER_INSPECT_PRACTICE} практики «Подборщика» (до ${B.PICKER_INSPECT_MONTHLY_CAP} в месяц).`,
    scan: `${
      hasScanner ? '' : 'Доступно после покупки компьютерного сканера (гараж → Оборудование, с 3 уровня). '
    }Своим сканером — бесплатно и сразу. Точность сейчас: тех. ±${scan.tech.toFixed(1)}, максимум ±${scan.max.toFixed(1)}, ЛКП ±${scan.paint.toFixed(1)}; навык «Подборщик» сужает интервалы. Первая проверка объявления: +${B.PICKER_SCAN_PRACTICE} практики.`,
    service: `Полная проверка в стороннем сервисе: точные значения через ${B.SERVICE_DIAGNOSTICS_DAYS} игровой день. Цена зависит от класса машины, практику не даёт. Если объявление исчезнет раньше, купить машину уже не получится.`,
  };

  const inspected = readout.level !== 'visual';
  const scanned = readout.level === 'scanned' || exact;
  const canPayService = balance * 100 >= serviceCents;

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
            <Text key={n} style={styles.note}>
              • {n}
            </Text>
          ))}
        </View>
      )}

      <ActionTiles
        tiles={[
          {
            key: 'inspect',
            emoji: '👀',
            title: 'Осмотреть',
            subtitle: inspected ? 'Осмотрено' : 'Бесплатно',
            state: inspected ? 'done' : 'ready',
            info: INFO.inspect,
            onPress: () => inspectListing(listing),
          },
          {
            key: 'scan',
            emoji: '💻',
            title: 'Компьютер',
            subtitle: !hasScanner ? 'Нужен сканер' : scanned ? 'Проверено' : 'Бесплатно',
            state: scanned ? 'done' : hasScanner ? 'ready' : 'locked',
            info: INFO.scan,
            onPress: () => scanListing(listing),
          },
          {
            key: 'service',
            emoji: '🧰',
            title: 'Сервис',
            subtitle: exact
              ? 'Точные данные'
              : servicePending
                ? `Готово через ${formatGameDays((diag.serviceReadyAtMs ?? 0) - gameTimeMs, DAY_MS)}`
                : `${formatMoney(serviceCents)} · 1 день`,
            state: exact ? 'done' : servicePending ? 'pending' : canPayService ? 'ready' : 'locked',
            info: INFO.service,
            onPress: () => orderServiceDiagnostics(listing),
          },
        ]}
      />
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
  sure: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  unsure: { position: 'absolute', top: 0, bottom: 0, opacity: 0.35 },
  overall: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  notes: { gap: 2 },
  note: { fontSize: 11, color: colors.textTertiary },
});
