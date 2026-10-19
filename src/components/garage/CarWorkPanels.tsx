import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Platform, type ImageSourcePropType } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@styles/colors';
import { garageStyles } from '@styles/styles';
import { useGarageContext } from '@hooks/GarageContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GameIcon } from '@components/GameIcon';
import { SheetHeader } from '@components/SheetHeader';
import { ICONS, getMechanicAvatar } from '@img/gameIcons';
import { formatMoney, formatGameDays, pluralDays } from '../../economy/format';
import { DAY_MS } from '../../economy/time';
import { PLAYER_PAINT_PER_TAP } from '../../economy/balance';
import { overallCondition } from '../../economy/carCondition';
import { pickingMismatch, serviceDef } from '../../economy/orders';
import type { GarageCar, Mechanic } from '@/types';

/** Цвета действий над машиной: у каждого действия свой, процессы окрашены так же */
export const ACTION_COLORS = {
  repair: colors.primary,
  mechanic: '#10B981',
  sell: '#CA8A04',
  paint: '#0EA5E9',
  client: '#8B5CF6',
};

const PAINT = ACTION_COLORS.paint;

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

// ─── Плитка действия ───────────────────────────────────────────────────────

interface TileProps {
  title: string;
  subtitle?: string;
  color: string;
  icon?: ImageSourcePropType;
  emoji?: string;
  disabled?: boolean;
  onPress: () => void;
}

/** Все действия над машиной — одинаковые плитки: иконка, название, подпись, свой цвет */
export const ActionTile = ({ title, subtitle, color, icon, emoji, disabled, onPress }: TileProps) => (
  <TouchableOpacity
    style={[styles.tile, { backgroundColor: color }, disabled && styles.tileDisabled]}
    disabled={disabled}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <View style={styles.tileHead}>
      {icon ? <GameIcon source={icon} size={20} /> : emoji ? <Text style={styles.tileEmoji}>{emoji}</Text> : null}
      <Text style={styles.tileTitle} numberOfLines={1}>
        {title}
      </Text>
    </View>
    {!!subtitle && (
      <Text style={styles.tileSub} numberOfLines={1}>
        {subtitle}
      </Text>
    )}
  </TouchableOpacity>
);

// ─── Процессы покраски и заказ клиента ─────────────────────────────────────

/** Карточки идущих процессов покраски и информация о заказе — над плитками действий */
export const CarStatusPanels = ({ car }: { car: GarageCar }) => {
  const { boothSlot, boothJob, painterRun, painters, servicePaints, cancelBoothJob } = useGarageContext();
  const { state } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const paint = car.paintCondition ?? car.condition;
  const service = servicePaints[car.id];
  const job = boothSlot !== null && car.slotIndex === boothSlot && boothJob?.carId === car.id ? boothJob : null;
  const order = car.clientOrderId ? state.orders.active.find((o) => o.id === car.clientOrderId) : undefined;

  return (
    <>
      {order && order.kind === 'service' && (
        <View style={[styles.panel, { borderColor: ACTION_COLORS.client }]}>
          <Text style={styles.title}>👤 Машина клиента · {serviceDef(order.type).name}</Text>
          <Text style={styles.text}>
            {order.type === 'paint'
              ? `Покрасить до 100% в камере (сейчас ${Math.round(paint)}%).`
              : `Отремонтировать до ${car.maxCondition}% (сейчас ${car.condition.toFixed(1)}%).`}{' '}
            Оплата при сдаче: {formatMoney(order.rewardCents)}. Не продаётся.
          </Text>
          {order.completedAtMs !== undefined && (
            <Text style={[styles.text, { color: '#22C55E', fontWeight: '700' }]}>✓ Работа готова — сдайте заказ в разделе «Заказы».</Text>
          )}
        </View>
      )}

      {service && (
        <View style={[styles.panel, { borderColor: PAINT }]}>
          <Text style={styles.title}>🎨 Покраска в стороннем сервисе</Text>
          <Text style={styles.text}>
            ЛКП {Math.round(service.startPaint)}% → {service.targetPaint}% · осталось{' '}
            {formatGameDays(service.startedAtMs + service.durationMs - gameTimeMs, DAY_MS)}
          </Text>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.min(100, Math.max(0, ((gameTimeMs - service.startedAtMs) / service.durationMs) * 100))}%`,
                  backgroundColor: PAINT,
                },
              ]}
            />
          </View>
        </View>
      )}

      {job && (
        <View style={[styles.panel, { borderColor: PAINT }]}>
          <Text style={styles.title}>
            🎨 Покраска в камере: {paint.toFixed(1)}% → {job.targetPaint}%
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, (paint / job.targetPaint) * 100)}%`, backgroundColor: PAINT }]} />
          </View>
          {painterRun ? (
            <View style={styles.row}>
              <GameIcon source={getMechanicAvatar(painterRun.painterId)} size={24} />
              <Text style={[styles.text, { flex: 1 }]}>
                {painters.find((p) => p.id === painterRun.painterId)?.name ?? 'Маляр'} красит:{' '}
                {(painterRun.speedPerSec * 10).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} п. в день, осталось{' '}
                {formatGameDays(((job.targetPaint - paint) / painterRun.speedPerSec) * 1000, DAY_MS)}
              </Text>
            </View>
          ) : (
            <Text style={styles.text}>Красьте кнопкой «Покрасить» или поручите маляру.</Text>
          )}
          <TouchableOpacity style={styles.cancel} onPress={cancelBoothJob}>
            <Text style={styles.cancelText}>✕ Остановить покраску (материалы не вернутся)</Text>
          </TouchableOpacity>
        </View>
      )}
    </>
  );
};

// ─── Действия ──────────────────────────────────────────────────────────────

interface CarActionsProps {
  car: GarageCar;
  /** Механик, прикреплённый к слоту машины (если может ремонтировать) */
  mechanic: Mechanic | null;
  tapRepairPercent: number;
  onRepair: () => void;
  onSell: () => void;
  onMechanic: () => void;
}

type PaintConfirm = { kind: 'service' | 'booth' } | null;

/** Плитки всех действий над машиной: ремонт, механик, продажа, покраска, передача клиенту */
export const CarActions = ({ car, mechanic, tapRepairPercent, onRepair, onSell, onMechanic }: CarActionsProps) => {
  const {
    boothSlot,
    boothJob,
    painterRun,
    painterPaused,
    painters,
    servicePaints,
    servicePaintQuote,
    boothPaintQuote,
    paintTap,
    setPainterPaused,
    carBusyReason,
    pickingCandidate,
    deliverPicking,
  } = useGarageContext();
  const { state, paintTapMultiplier } = useEconomy();
  const [confirm, setConfirm] = useState<PaintConfirm>(null);

  const isClient = !!car.clientOrderId;
  const inBooth = boothSlot !== null && car.slotIndex === boothSlot;
  const job = inBooth && boothJob?.carId === car.id ? boothJob : null;
  const servicePaint = servicePaints[car.id];
  const paint = car.paintCondition ?? car.condition;
  const atMax = car.condition >= car.maxCondition;
  const busy = carBusyReason(car.id);
  const hiredPainter = painters.find((p) => p.hired);

  const tiles: React.ReactNode[] = [];

  // Технический ремонт — не в камере и не во время покраски в сервисе
  if (!inBooth && !servicePaint) {
    tiles.push(
      <ActionTile
        key="repair"
        icon={atMax ? undefined : ICONS.repair}
        emoji={atMax ? '✓' : undefined}
        title={atMax ? 'Техника в максимуме' : 'Ремонт'}
        subtitle={atMax ? `${car.maxCondition}%` : `+${tapRepairPercent.toLocaleString('ru-RU', { maximumFractionDigits: 3 })}% за тап`}
        color={ACTION_COLORS.repair}
        disabled={atMax}
        onPress={onRepair}
      />,
    );
  }

  if (mechanic) {
    tiles.push(
      <ActionTile
        key="mechanic"
        icon={getMechanicAvatar(mechanic.id)}
        title="Механику"
        subtitle={`${mechanic.name} починит до ${car.maxCondition}%`}
        color={ACTION_COLORS.mechanic}
        onPress={onMechanic}
      />,
    );
  }

  // Покраска: в камере — своими силами или маляром, вне камеры — в стороннем сервисе
  if (job) {
    if (painterRun) {
      tiles.push(
        <ActionTile key="self" emoji="🖌️" title="Красить самому" subtitle="Остановить маляра" color={PAINT} onPress={() => setPainterPaused(true)} />,
      );
    } else {
      tiles.push(
        <ActionTile
          key="tap"
          emoji="🖌️"
          title="Покрасить"
          subtitle={`+${(PLAYER_PAINT_PER_TAP * paintTapMultiplier).toLocaleString('ru-RU', { maximumFractionDigits: 3 })} п. ЛКП за тап`}
          color={PAINT}
          onPress={() => paintTap()}
        />,
      );
      if (hiredPainter && painterPaused) {
        tiles.push(
          <ActionTile
            key="painter"
            icon={getMechanicAvatar(hiredPainter.id)}
            title="Маляру"
            subtitle={`${hiredPainter.name} докрасит сам`}
            color={PAINT}
            onPress={() => setPainterPaused(false)}
          />,
        );
      }
    }
  } else if (inBooth) {
    const quote = boothPaintQuote(car.id);
    if (quote && quote.from < quote.target) {
      tiles.push(
        <ActionTile
          key="booth"
          emoji="🎨"
          title="Покрасить в камере"
          subtitle={quote.materialsCents > 0 ? `материалы ${formatMoney(quote.materialsCents)}` : 'материалы оплачены'}
          color={PAINT}
          disabled={!!busy || state.balanceCents < quote.materialsCents}
          onPress={() => setConfirm({ kind: 'booth' })}
        />,
      );
    }
  } else if (!isClient && !servicePaint && paint < 100) {
    const quote = servicePaintQuote(car.id);
    if (quote) {
      tiles.push(
        <ActionTile
          key="service"
          emoji="🎨"
          title="Покраска в сервисе"
          subtitle={`${formatMoney(quote.costCents)} · ${pluralDays(quote.days)}`}
          color={PAINT}
          disabled={!!busy || state.balanceCents < quote.costCents}
          onPress={() => setConfirm({ kind: 'service' })}
        />,
      );
    }
  }

  if (!isClient && !busy) {
    tiles.push(<ActionTile key="sell" icon={ICONS.sell} title="Продать" subtitle="Выставить на рынок" color={ACTION_COLORS.sell} onPress={onSell} />);
  }

  // Передача клиенту по заказу на подбор — если класс подходит
  const picking = state.orders.active.find((o) => o.kind === 'picking');
  let pickingNote: string | null = null;
  if (!isClient && picking && picking.kind === 'picking' && car.tier === picking.tier) {
    const candidate = pickingCandidate(car.id);
    const problems = candidate ? pickingMismatch(picking, candidate) : ['нет данных'];
    pickingNote = problems.length > 0 ? `Для заказа на подбор пока не подходит: ${problems.join(', ')}.` : null;
    tiles.push(
      <ActionTile
        key="client"
        emoji="🤝"
        title="Передать клиенту"
        subtitle={formatMoney(picking.priceCents)}
        color={ACTION_COLORS.client}
        disabled={problems.length > 0 || !!busy}
        onPress={() => deliverPicking(picking.id, car.id)}
      />,
    );
  }

  return (
    <>
      <View style={styles.tiles}>{tiles}</View>
      {pickingNote && <Text style={styles.note}>{pickingNote}</Text>}
      <PaintConfirmModal car={car} confirm={confirm} onClose={() => setConfirm(null)} />
    </>
  );
};

/** Подтверждение покраски: что будет с ЛКП, сколько стоит и сколько добавит к цене */
const PaintConfirmModal = ({ car, confirm, onClose }: { car: GarageCar; confirm: PaintConfirm; onClose: () => void }) => {
  const { servicePaintQuote, boothPaintQuote, startServicePaint, startBoothJob } = useGarageContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  if (!confirm) return null;
  const service = confirm.kind === 'service' ? servicePaintQuote(car.id) : null;
  const booth = confirm.kind === 'booth' ? boothPaintQuote(car.id) : null;
  const quote = service ?? booth;
  if (!quote) return null;
  const costCents = service ? service.costCents : booth!.materialsCents;
  const gainCents = quote.gainCents;

  const start = () => {
    const ok = service ? startServicePaint(car.id) : startBoothJob(car.id);
    if (ok) onClose();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={garageStyles.modalOverlay}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12 }]}>
          <SheetHeader title={service ? 'Покраска в сервисе' : 'Покраска в камере'} onClose={onClose} />
          <View style={styles.confirmBox}>
            <Text style={styles.confirmLine}>
              {car.name}: ЛКП {Math.round(quote.from)}% → {quote.target}%
            </Text>
            {service && <Text style={styles.confirmLine}>Срок: {pluralDays(service.days)}, машина в это время занята</Text>}
            {booth && <Text style={styles.confirmLine}>Красите сами тапами или нанятый маляр</Text>}
            {costCents > 0 && (
              <>
                <Text style={styles.confirmLine}>
                  {service ? 'Стоимость' : 'Материалы'}: {formatMoney(costCents)} — войдёт в себестоимость машины
                </Text>
                <Text style={styles.confirmLine}>Машина подорожает примерно на {formatMoney(gainCents)}</Text>
                <Text style={[styles.confirmLine, { fontWeight: '800', color: gainCents - costCents >= 0 ? '#22C55E' : '#EF4444' }]}>
                  Итого заработаете ≈ {formatMoney(gainCents - costCents, { sign: true })}
                </Text>
              </>
            )}
          </View>
          <View style={garageStyles.modalButtonsContainer}>
            <TouchableOpacity style={[garageStyles.modalButton, garageStyles.cancelButton]} onPress={onClose}>
              <Text style={garageStyles.modalButtonText}>Отмена</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[garageStyles.modalButton, { backgroundColor: PAINT, borderColor: PAINT }]} onPress={start}>
              <Text style={[garageStyles.modalButtonText, { color: '#FFF' }]}>
                {costCents > 0 ? `Покрасить · ${formatMoney(costCents)}` : 'Начать покраску'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    borderRadius: 12,
    borderWidth: 2,
    padding: 10,
    gap: 6,
    backgroundColor: colors.cardBg,
  },
  title: { fontSize: 13, fontWeight: '800', color: colors.textPrimary },
  text: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancel: { alignSelf: 'center', paddingVertical: 4 },
  cancelText: { color: '#EF4444', fontSize: 12, fontWeight: '700' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 58,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    gap: 2,
  },
  tileDisabled: { opacity: 0.45 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileEmoji: { fontSize: 16, color: '#FFF', fontWeight: '800' },
  tileTitle: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: '#FFF' },
  tileSub: { fontSize: 11, fontWeight: '600', color: 'rgba(255, 255, 255, 0.85)' },
  note: { fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 6 },
  confirmBox: { gap: 6, marginBottom: 14 },
  confirmLine: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
});
