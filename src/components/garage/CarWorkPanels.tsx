import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '@styles/colors';
import { useGarageContext } from '@hooks/GarageContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { GameIcon } from '@components/GameIcon';
import { getMechanicAvatar } from '@img/gameIcons';
import { formatMoney, formatGameDays, pluralDays } from '../../economy/format';
import { DAY_MS } from '../../economy/time';
import { PLAYER_PAINT_PER_TAP } from '../../economy/balance';
import { overallCondition } from '../../economy/carCondition';
import { pickingMismatch, serviceDef } from '../../economy/orders';
import type { GarageCar } from '@/types';

const PAINT = '#38BDF8';

/** Полосы ЛКП и общего состояния под технической полосой карточки */
export const PaintBars = ({ car }: { car: GarageCar }) => {
  const paint = car.paintCondition ?? car.condition;
  const overall = overallCondition(car.condition, car.paintCondition);
  return (
    <View style={styles.bars}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>ЛКП</Text>
        <Text style={[styles.barValue, { color: PAINT }]}>
          {paint.toFixed(1)}%{car.paintTarget ? ` → ${car.paintTarget}%` : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${paint}%`, backgroundColor: PAINT }]} />
      </View>
      <Text style={styles.overall}>Общее состояние: {overall.toFixed(1)}% (80% техника + 20% ЛКП)</Text>
    </View>
  );
};

/**
 * Покраска машины: сторонний сервис (вне камеры) или своя камера (машина в слоте камеры).
 * В камере красит игрок тапами или нанятый маляр.
 */
export const CarPaintPanel = ({ car }: { car: GarageCar }) => {
  const {
    boothSlot,
    boothJob,
    painterRun,
    painterPaused,
    painters,
    servicePaints,
    servicePaintQuote,
    startServicePaint,
    boothPaintQuote,
    startBoothJob,
    cancelBoothJob,
    paintTap,
    setPainterPaused,
    carBusyReason,
    mechanicRepairs,
    activeSells,
  } = useGarageContext();
  const { balance, paintTapMultiplier } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const paint = car.paintCondition ?? car.condition;
  const inBooth = boothSlot !== null && car.slotIndex === boothSlot;
  const service = servicePaints[car.id];

  // Сторонний сервис уже красит
  if (service) {
    const left = service.startedAtMs + service.durationMs - gameTimeMs;
    const progress = Math.min(100, Math.max(0, ((gameTimeMs - service.startedAtMs) / service.durationMs) * 100));
    return (
      <View style={[styles.panel, { borderColor: PAINT }]}>
        <Text style={styles.title}>🎨 Покраска в стороннем сервисе</Text>
        <Text style={styles.text}>
          ЛКП {Math.round(service.startPaint)}% → {service.targetPaint}% · осталось {formatGameDays(left, DAY_MS)}
        </Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%`, backgroundColor: PAINT }]} />
        </View>
      </View>
    );
  }

  if (inBooth) {
    const job = boothJob?.carId === car.id ? boothJob : null;
    const painter = painters.find((p) => p.hired);
    if (!job) {
      const quote = boothPaintQuote(car.id);
      const busy = carBusyReason(car.id);
      const done = !quote || quote.from >= quote.target;
      return (
        <View style={[styles.panel, { borderColor: PAINT }]}>
          <Text style={styles.title}>🎨 Машина в покрасочной камере</Text>
          {done ? (
            <Text style={styles.text}>Покраска не требуется — ЛКП уже {Math.round(paint)}%.</Text>
          ) : (
            <>
              <Text style={styles.text}>
                ЛКП {Math.round(quote.from)}% → {quote.target}%.{' '}
                {quote.materialsCents > 0
                  ? `Материалы ${formatMoney(quote.materialsCents)} (в себестоимость машины), прирост стоимости ≈ ${formatMoney(quote.gainCents)}.`
                  : 'Материалы уже оплачены в заказе клиента.'}
              </Text>
              {busy && <Text style={styles.warn}>{busy}</Text>}
              <TouchableOpacity
                style={[styles.button, (!!busy || balance * 100 < quote.materialsCents) && styles.disabled]}
                disabled={!!busy || balance * 100 < quote.materialsCents}
                onPress={() => startBoothJob(car.id)}
              >
                <Text style={styles.buttonText}>
                  Начать покраску{quote.materialsCents > 0 ? ` · ${formatMoney(quote.materialsCents)}` : ''}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      );
    }
    const progress = Math.min(100, (paint / job.targetPaint) * 100);
    return (
      <View style={[styles.panel, { borderColor: PAINT }]}>
        <Text style={styles.title}>🎨 Покраска в камере: {paint.toFixed(1)}% → {job.targetPaint}%</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progress}%`, backgroundColor: PAINT }]} />
        </View>
        {painterRun ? (
          <View style={styles.row}>
            <GameIcon source={getMechanicAvatar(painterRun.painterId)} size={26} />
            <Text style={[styles.text, { flex: 1 }]}>
              {painter?.name ?? 'Маляр'} красит: {(painterRun.speedPerSec * 10).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} п. в день
            </Text>
            <TouchableOpacity style={styles.smallButton} onPress={() => setPainterPaused(true)}>
              <Text style={styles.smallText}>Красить самому</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TouchableOpacity style={[styles.button, { backgroundColor: PAINT }]} onPress={() => paintTap()}>
              <Text style={styles.buttonText}>
                Покрасить (+{(PLAYER_PAINT_PER_TAP * paintTapMultiplier).toLocaleString('ru-RU', { maximumFractionDigits: 3 })}%)
              </Text>
            </TouchableOpacity>
            {painter && painterPaused && (
              <TouchableOpacity style={styles.smallButton} onPress={() => setPainterPaused(false)}>
                <Text style={styles.smallText}>Поручить маляру {painter.name}</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        <TouchableOpacity style={styles.cancel} onPress={cancelBoothJob}>
          <Text style={styles.cancelText}>✕ Остановить покраску (материалы не вернутся)</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Своя машина вне камеры: можно отдать в сторонний сервис
  if (car.clientOrderId || paint >= 100 || mechanicRepairs[car.id] || activeSells[car.id]) return null;
  const quote = servicePaintQuote(car.id);
  if (!quote) return null;
  const affordable = balance * 100 >= quote.costCents;
  return (
    <View style={[styles.panel, { borderColor: colors.border }]}>
      <Text style={styles.text}>
        🎨 Покраска в сервисе: ЛКП {Math.round(quote.from)}% → 100% за {pluralDays(quote.days)}, {formatMoney(quote.costCents)}. Прирост
        стоимости ≈ {formatMoney(quote.gainCents)}.
      </Text>
      <TouchableOpacity
        style={[styles.smallButton, !affordable && styles.disabled]}
        disabled={!affordable}
        onPress={() => startServicePaint(car.id)}
      >
        <Text style={styles.smallText}>Отправить на покраску · {formatMoney(quote.costCents)}</Text>
      </TouchableOpacity>
    </View>
  );
};

/** Заказы на машине: клиентская машина (что сделать) или своя машина под заказ на подбор */
export const CarOrderPanel = ({ car }: { car: GarageCar }) => {
  const { state } = useEconomy();
  const { deliverPicking, pickingCandidate, carBusyReason } = useGarageContext();

  if (car.clientOrderId) {
    const order = state.orders.active.find((o) => o.id === car.clientOrderId);
    if (!order || order.kind !== 'service') return null;
    const def = serviceDef(order.type);
    const done = order.completedAtMs !== undefined;
    return (
      <View style={[styles.panel, { borderColor: '#A78BFA' }]}>
        <Text style={styles.title}>👤 Машина клиента · {def.name}</Text>
        <Text style={styles.text}>{order.description}</Text>
        <Text style={styles.text}>
          {order.type === 'paint'
            ? `Покрасить до 100% в камере (сейчас ${Math.round(car.paintCondition ?? 0)}%).`
            : `Отремонтировать до ${car.maxCondition}% (сейчас ${car.condition.toFixed(1)}%).`}{' '}
          Оплата при сдаче: {formatMoney(order.rewardCents)}.
        </Text>
        <Text style={[styles.text, done && { color: '#22C55E', fontWeight: '700' }]}>
          {done ? '✓ Работа готова — сдайте заказ в разделе «Заказы».' : 'Не продаётся: машина принадлежит клиенту.'}
        </Text>
      </View>
    );
  }

  const picking = state.orders.active.find((o) => o.kind === 'picking');
  if (!picking || picking.kind !== 'picking' || car.tier !== picking.tier) return null;
  const candidate = pickingCandidate(car.id);
  if (!candidate) return null;
  const problems = pickingMismatch(picking, candidate);
  const busy = carBusyReason(car.id);
  return (
    <View style={[styles.panel, { borderColor: '#A78BFA' }]}>
      <Text style={styles.title}>🤝 Подходит под заказ на подбор?</Text>
      {problems.length > 0 ? (
        <Text style={styles.warn}>Пока нет: {problems.join(', ')}.</Text>
      ) : (
        <Text style={styles.text}>Подходит. Клиент заплатит {formatMoney(picking.priceCents)} сразу.</Text>
      )}
      {busy && <Text style={styles.warn}>{busy}</Text>}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: '#8B5CF6' }, (problems.length > 0 || !!busy) && styles.disabled]}
        disabled={problems.length > 0 || !!busy}
        onPress={() => deliverPicking(picking.id, car.id)}
      >
        <Text style={styles.buttonText}>Передать клиенту · {formatMoney(picking.priceCents)}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bars: { gap: 4, marginTop: 6, marginBottom: 12 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 12, color: colors.textTertiary },
  barValue: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#27272A', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  overall: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  panel: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
  },
  title: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  text: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  warn: { fontSize: 12, color: '#F59E0B', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  smallButton: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: PAINT,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  smallText: { color: PAINT, fontSize: 12, fontWeight: '700' },
  cancel: { alignSelf: 'center', paddingVertical: 4 },
  cancelText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
