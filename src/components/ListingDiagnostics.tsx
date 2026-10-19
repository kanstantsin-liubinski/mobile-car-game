import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';
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

interface TileProps {
  emoji: string;
  title: string;
  subtitle: string;
  state: 'ready' | 'done' | 'locked' | 'pending';
  info: boolean;
  onPress: () => void;
  onInfo: () => void;
}

/** Одинаковые плитки действий диагностики: заголовок, подпись и (i) с описанием */
const Tile = ({ emoji, title, subtitle, state, info, onPress, onInfo }: TileProps) => (
  <View style={[styles.tile, state === 'done' && styles.tileDone, state === 'locked' && styles.tileLocked, state === 'pending' && styles.tilePending]}>
    <TouchableOpacity style={styles.tileBody} disabled={state !== 'ready'} onPress={onPress} activeOpacity={0.75}>
      <Text style={styles.tileEmoji}>{state === 'locked' ? '🔒' : state === 'done' ? '✓' : emoji}</Text>
      <Text style={styles.tileTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.tileSub} numberOfLines={2}>
        {subtitle}
      </Text>
    </TouchableOpacity>
    <TouchableOpacity style={[styles.info, info && styles.infoActive]} onPress={onInfo} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={[styles.infoText, info && { color: '#FFF' }]}>i</Text>
    </TouchableOpacity>
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
  const [infoFor, setInfoFor] = useState<ActionKey | null>(null);
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

  const toggleInfo = (key: ActionKey) => setInfoFor((prev) => (prev === key ? null : key));
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

      <View style={styles.tiles}>
        <Tile
          emoji="👀"
          title="Осмотреть"
          subtitle={inspected ? 'Осмотрено' : 'Бесплатно'}
          state={inspected ? 'done' : 'ready'}
          info={infoFor === 'inspect'}
          onPress={() => inspectListing(listing)}
          onInfo={() => toggleInfo('inspect')}
        />
        <Tile
          emoji="💻"
          title="Компьютер"
          subtitle={!hasScanner ? 'Нужен сканер' : scanned ? 'Проверено' : 'Бесплатно'}
          state={scanned ? 'done' : hasScanner ? 'ready' : 'locked'}
          info={infoFor === 'scan'}
          onPress={() => scanListing(listing)}
          onInfo={() => toggleInfo('scan')}
        />
        <Tile
          emoji="🧰"
          title="Сервис"
          subtitle={
            exact
              ? 'Точные данные'
              : servicePending
                ? `Готово через ${formatGameDays((diag.serviceReadyAtMs ?? 0) - gameTimeMs, DAY_MS)}`
                : `${formatMoney(serviceCents)} · 1 день`
          }
          state={exact ? 'done' : servicePending ? 'pending' : canPayService ? 'ready' : 'locked'}
          info={infoFor === 'service'}
          onPress={() => orderServiceDiagnostics(listing)}
          onInfo={() => toggleInfo('service')}
        />
      </View>
      {infoFor && (
        <TouchableOpacity style={styles.tooltip} onPress={() => setInfoFor(null)} activeOpacity={0.8}>
          <Text style={styles.tooltipText}>{INFO[infoFor]}</Text>
        </TouchableOpacity>
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
  sure: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  unsure: { position: 'absolute', top: 0, bottom: 0, opacity: 0.35 },
  overall: { fontSize: 12, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  notes: { gap: 2 },
  note: { fontSize: 11, color: colors.textTertiary },
  tiles: { flexDirection: 'row', gap: 6, marginTop: 4 },
  tile: {
    flex: 1,
    minHeight: 74,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
  },
  tileDone: { borderColor: '#22C55E' },
  tileLocked: { opacity: 0.55 },
  tilePending: { borderColor: '#F59E0B' },
  tileBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, gap: 2 },
  tileEmoji: { fontSize: 18, color: '#22C55E', fontWeight: '800' },
  tileTitle: { fontSize: 12, fontWeight: '800', color: colors.textPrimary },
  tileSub: { fontSize: 10, color: colors.textTertiary, textAlign: 'center' },
  info: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.textTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  infoText: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, fontStyle: 'italic' },
  tooltip: {
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.4)',
    borderRadius: 8,
    padding: 8,
  },
  tooltipText: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
});
