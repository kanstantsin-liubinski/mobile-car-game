import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Platform, type ImageSourcePropType } from 'react-native';
import { SheetModal } from '@components/SheetModal';
import { TouchableOpacity } from '@components/Touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@styles/colors';
import { garageStyles } from '@styles/styles';
import { useGarageContext } from '@hooks/GarageContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GameIcon } from '@components/GameIcon';
import { SheetHeader } from '@components/SheetHeader';
import { ActionTiles, type TileSpec } from '@components/ActionTiles';
import { ICONS, getMechanicAvatar } from '@img/gameIcons';
import { formatMoney, formatGameDays, pluralDays } from '../../economy/format';
import { DAY_MS } from '../../economy/time';
import { MAX_SELL_DAYS_INFO, OWN_REPAIR_PARTS_SHARE, PLAYER_PAINT_PER_TAP } from '../../economy/balance';
import { carValue, overallCondition, repairPartsCents } from '../../economy/carCondition';
import { clearanceSpeedFactor, ownPaintMaterialsShare } from '../../economy/economy';
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
        <Text style={[styles.barValue, styles.nums, { color: PAINT }]} numberOfLines={1}>
          {paint.toFixed(1)}%{car.paintTarget ? ` → ${car.paintTarget}%` : ''}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${paint}%`, backgroundColor: PAINT }]} />
      </View>
      {/* Одна строка с цифрами фиксированной ширины: при тапах ничего не переносится и не скачет */}
      <View style={styles.barHead}>
        <Text style={styles.overall} numberOfLines={1}>
          Общее состояние
        </Text>
        <Text style={[styles.overall, styles.nums]} numberOfLines={1}>
          {overall.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
};

/** Компактная полоска идущего процесса (продажа, ремонт механиком) */
const ProcessPanel = ({
  color,
  title,
  text,
  progress,
  avatar,
}: {
  color: string;
  title: string;
  text: string;
  progress: number;
  avatar?: ImageSourcePropType;
}) => (
  <View style={[styles.panel, { borderColor: color }]}>
    <View style={styles.row}>
      {avatar && <GameIcon source={avatar} size={24} />}
      <Text style={[styles.title, { flex: 1 }]}>{title}</Text>
    </View>
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress))}%`, backgroundColor: color }]} />
    </View>
    <Text style={styles.text}>{text}</Text>
  </View>
);

// ─── Процессы покраски и заказ клиента ─────────────────────────────────────

/** Карточки идущих процессов покраски и информация о заказе — над плитками действий */
export const CarStatusPanels = ({ car }: { car: GarageCar }) => {
  const {
    boothSlot,
    boothJob,
    painterRun,
    painters,
    servicePaints,
    activeSells,
    activeSellsProgress,
    activeSellsRemaining,
    mechanicRepairs,
    mechanicRepairsProgress,
    mechanicRepairsRemaining,
    mechanics,
  } = useGarageContext();
  const { state } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const paint = car.paintCondition ?? car.condition;
  const service = servicePaints[car.id];
  const job = boothSlot !== null && car.slotIndex === boothSlot && boothJob?.carId === car.id ? boothJob : null;
  const order = car.clientOrderId ? state.orders.active.find((o) => o.id === car.clientOrderId) : undefined;

  const sale = activeSells[car.id];
  const repair = mechanicRepairs[car.id];

  return (
    <>
      {sale && (
        <ProcessPanel
          color={ACTION_COLORS.sell}
          title={`💰 Продаётся за ${formatMoney(Math.round(sale.sellPrice * 100))}`}
          text={`До продажи ${formatGameDays(activeSellsRemaining[car.id] ?? 0, DAY_MS)}`}
          progress={activeSellsProgress[car.id] ?? 0}
        />
      )}

      {repair && (
        <ProcessPanel
          color={ACTION_COLORS.mechanic}
          avatar={getMechanicAvatar(repair.mechanicId)}
          title={`${mechanics.find((m) => m.id === repair.mechanicId)?.name ?? 'Механик'} ремонтирует до ${repair.maxCondition}%`}
          text={`Осталось ${formatGameDays(mechanicRepairsRemaining[car.id] ?? 0, DAY_MS)}`}
          progress={mechanicRepairsProgress[car.id] ?? 0}
        />
      )}

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
            <Text style={[styles.text, { color: '#22C55E', fontWeight: '700' }]}>✓ Работа готова — сдай заказ в разделе «Заказы».</Text>
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
            <Text style={styles.text}>Крась плиткой «Покрасить» или поручи маляру.</Text>
          )}
        </View>
      )}
    </>
  );
};

// ─── Действия ──────────────────────────────────────────────────────────────

interface CarActionsProps {
  car: GarageCar;
  /** Механик, прикреплённый к слоту машины (нанятый) */
  mechanic: Mechanic | null;
  tapRepairPercent: number;
  /** false — тап не выполнился (нет денег на детали, максимум) */
  onRepair: () => void | boolean;
  onSell: () => void;
  onMechanic: () => void;
}

type PaintConfirm = { kind: 'service' | 'booth' } | null;

/** Перестановка машины в свободный слот гаража */
const MoveCarModal = ({ car, visible, onClose }: { car: GarageCar; visible: boolean; onClose: () => void }) => {
  const { garage, allSlots, isParkingSlot, slotLabel, boothSlot, changeCarSlot } = useGarageContext();
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  return (
    <SheetModal visible={visible} onRequestClose={onClose}>
      <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12 }]}>
        <SheetHeader title="Переставить машину" onClose={onClose} />
        <Text style={styles.confirmLine}>
          {car.name} сейчас {isParkingSlot(car.slotIndex) ? 'на стоянке' : 'в слоте'} {slotLabel(car.slotIndex)}. Выбери свободное место:
        </Text>
        <View style={styles.moveSlots}>
          {allSlots.map((i) => {
            const occupied = garage.some((c) => c.slotIndex === i && c.id !== car.id) || (isParkingSlot(i) && !!car.clientOrderId);
            const current = car.slotIndex === i;
            const isBooth = i === boothSlot;
            return (
              <TouchableOpacity
                key={i}
                style={[styles.moveSlot, current && styles.moveSlotCurrent, occupied && styles.tileDisabled]}
                disabled={occupied || current}
                onPress={() => {
                  if (changeCarSlot(car.id, i)) onClose();
                }}
              >
                <Text style={styles.moveSlotText}>{isBooth ? '🎨' : slotLabel(i)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.text}>
          🎨 — покрасочная камера: там можно красить, но нельзя ремонтировать.{allSlots.some(isParkingSlot) ? ' P — коммерческая стоянка: только хранение и продажа.' : ''}
        </Text>
      </View>
    </SheetModal>
  );
};

const STOP = '#EF4444';
const fmtNum = (v: number, digits = 3) => v.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/**
 * Все действия над машиной — плитками в стиле авторынка: ремонт, механик, покраска,
 * продажа, передача клиенту и остановка идущих процессов. У каждой — подсказка (i).
 */
export const CarActions = ({ car, mechanic, tapRepairPercent, onRepair, onSell, onMechanic }: CarActionsProps) => {
  const {
    boothSlot,
    boothJob,
    painterRun,
    painterPaused,
    painters,
    servicePaints,
    activeSells,
    mechanicRepairs,
    servicePaintQuote,
    boothPaintQuote,
    paintTap,
    setPainterPaused,
    cancelBoothJob,
    cancelSell,
    cancelMechanicRepair,
    carBusyReason,
    pickingCandidate,
    deliverPicking,
  } = useGarageContext();
  const { state, paintTapMultiplier } = useEconomy();
  const [confirm, setConfirm] = useState<PaintConfirm>(null);
  const [moving, setMoving] = useState(false);
  const { garage, allSlots, isParkingSlot, tuningQuote, tuneCar } = useGarageContext();

  const isClient = !!car.clientOrderId;
  const inBooth = boothSlot !== null && car.slotIndex === boothSlot;
  const parked = isParkingSlot(car.slotIndex);
  const job = inBooth && boothJob?.carId === car.id ? boothJob : null;
  const servicePaint = servicePaints[car.id];
  const selling = activeSells[car.id];
  const repairing = mechanicRepairs[car.id];
  const paint = car.paintCondition ?? car.condition;
  const atMax = car.condition >= car.maxCondition;
  const tapPartsCents = repairPartsCents(car, car.condition, Math.min(car.maxCondition, car.condition + tapRepairPercent));
  // На сколько подорожает своя машина от следующего тапа (для кнопки и всплывающей награды)
  const tapGainCents = isClient
    ? 0
    : Math.round(
        (carValue(car.basePrice, { ...car, condition: Math.min(car.maxCondition, car.condition + tapRepairPercent) }) -
          carValue(car.basePrice, car)) *
          100,
      );
  const busy = carBusyReason(car.id);
  const hiredPainter = painters.find((p) => p.hired);
  const tiles: TileSpec[] = [];
  const mechanicContract = mechanic ? state.contracts[mechanic.id] : undefined;
  const slowMechanic = !!mechanic && clearanceSpeedFactor(mechanicContract, car.tier) < 1;

  // Машина на продаже: единственное действие — снять с продажи
  if (selling) {
    tiles.push({
      key: 'unsell',
      emoji: '✕',
      title: 'Снять',
      subtitle: 'с продажи',
      state: 'ready',
      accent: STOP,
      info: 'Машина вернётся в гараж, продажа отменится. Позже можно выставить снова с другой ценой.',
      onPress: () => cancelSell(car.id),
    });
  } else {
    // ─ Технический ремонт: тапом и механиком (не в камере, не на стоянке и не во время покраски в сервисе)
    if (!inBooth && !servicePaint && !parked) {
      tiles.push({
        key: 'repair',
        icon: ICONS.repair,
        title: 'Ремонт',
        subtitle: atMax ? 'Машина максимально отремонтирована' : repairing ? 'Чинит механик' : 'Тапай или держи палец',
        state: atMax ? 'done' : repairing ? 'locked' : 'ready',
        accent: ACTION_COLORS.repair,
        info: `Ручной ремонт: каждый тап добавляет ${fmtNum(tapRepairPercent)}% технического состояния, до максимума ${car.maxCondition}%.${
          isClient ? '' : ` За свою машину ты платишь за детали — ${Math.round(OWN_REPAIR_PARTS_SHARE * 100)}% прироста её стоимости от тапа.`
        } Тап даёт 1 практику навыка «Механик»${
          isClient ? '.' : ', а первое полное восстановление своей машины — бонус XP.'
        }`,
        onPress: onRepair,
        repeat: true,
        hero: true,
        progress: { value: car.condition, max: car.maxCondition },
        // Цена тапа видна сразу: раньше детали списывались молча, и новичок не понимал, куда уходят деньги
        stats: isClient
          ? [
              { label: 'за тап', value: `+${fmtNum(tapRepairPercent)}%`, color: '#60A5FA' },
              { label: 'до цели', value: `${fmtNum(Math.max(0, car.maxCondition - car.condition), 1)}%`, color: '#A78BFA' },
            ]
          : [
              { label: 'за тап', value: `+${fmtNum(tapRepairPercent)}%`, color: '#60A5FA' },
              { label: 'детали', value: formatMoney(-tapPartsCents), color: '#F59E0B' },
              { label: 'цена', value: formatMoney(tapGainCents, { sign: true }), color: '#4ADE80' },
            ],
        // Всплывает над кнопкой: на сколько подорожала своя машина от этого тапа
        popup: () => (tapGainCents > 0 ? formatMoney(tapGainCents, { sign: true }) : `+${fmtNum(tapRepairPercent)}%`),
      });

      if (repairing) {
        tiles.push({
          key: 'stoprepair',
          emoji: '✕',
          title: 'Стоп',
          subtitle: 'остановить механика',
          state: 'ready',
          accent: STOP,
          info: 'Механик прекратит ремонт и освободит слот. Уже сделанный ремонт сохранится.',
          onPress: () => cancelMechanicRepair(car.id),
        });
      } else if (!atMax) {
        tiles.push({
          key: 'mechanic',
          icon: mechanic ? getMechanicAvatar(mechanic.id) : ICONS.hireMechanic,
          title: 'Механику',
          subtitle: mechanic ? (slowMechanic ? `${mechanic.name} · ×0,5, нет допуска` : mechanic.name) : 'нет на слоте',
          state: mechanic ? 'ready' : 'locked',
          accent: ACTION_COLORS.mechanic,
          info: mechanic
            ? `${mechanic.name} сам отремонтирует машину до ${car.maxCondition}%. Детали (${Math.round(OWN_REPAIR_PARTS_SHARE * 100)}% прироста стоимости) оплачиваются сразу, неиспользованное вернётся при остановке.${
                slowMechanic ? ' У механика нет допуска к этому классу — он работает вдвое медленнее; повысь допуск в окне «Механики».' : ''
              }`
            : 'Найми механика (гараж → «Механики»): он сам встанет на свободный слот и будет ремонтировать, пока ты занят другим.',
          onPress: onMechanic,
        });
      }
    }

    // ─ Покраска: в камере — своими силами или маляром, вне камеры — сторонний сервис
    if (job) {
      if (painterRun) {
        tiles.push({
          key: 'self',
          emoji: '🖌️',
          title: 'Сам',
          subtitle: 'остановить маляра',
          state: 'ready',
          accent: ACTION_COLORS.paint,
          info: 'Маляр прервётся (останется в штате), дальше красишь тапами сам — это прокачивает твой навык «Маляр».',
          onPress: () => setPainterPaused(true),
        });
      } else {
        tiles.push({
          key: 'tap',
          emoji: '🖌️',
          title: 'Покрасить',
          subtitle: 'Тапай или держи палец',
          state: 'ready',
          progress: { value: paint, max: car.paintTarget ?? 100 },
          stats: [
            { label: 'за тап', value: `+${fmtNum(PLAYER_PAINT_PER_TAP * paintTapMultiplier)} ЛКП`, color: '#38BDF8' },
            { label: 'до цели', value: `${fmtNum(Math.max(0, (car.paintTarget ?? 100) - paint), 1)} п.`, color: '#A78BFA' },
          ],
          cheers: ['Ровный слой!', 'Ни одной капли!', 'Блестит!', 'Как с завода!', 'Отлично!', 'Мастер кисти!', 'Красота!', 'Так держать!', 'Ровнее не бывает!', 'Глянец!'],
          accent: ACTION_COLORS.paint,
          info: `Каждый тап добавляет ${fmtNum(PLAYER_PAINT_PER_TAP * paintTapMultiplier)} п. ЛКП (растёт с навыком «Маляр») и даёт 1 практику. Материалы уже оплачены.`,
          onPress: () => paintTap(),
          repeat: true,
          hero: true,
          popup: () => `+${fmtNum(PLAYER_PAINT_PER_TAP * paintTapMultiplier)} ЛКП`,
        });
        if (hiredPainter && painterPaused) {
          tiles.push({
            key: 'painter',
            icon: getMechanicAvatar(hiredPainter.id),
            title: 'Маляру',
            subtitle: hiredPainter.name,
            state: 'ready',
            accent: ACTION_COLORS.paint,
            info: `${hiredPainter.name} докрасит машину сам, 2,5 п. ЛКП в день с учётом навыка.`,
            onPress: () => setPainterPaused(false),
          });
        }
      }
      tiles.push({
        key: 'stoppaint',
        emoji: '✕',
        title: 'Стоп',
        subtitle: 'остановить покраску',
        state: 'ready',
        accent: STOP,
        info: 'Покраска прекратится, уже нанесённое ЛКП сохранится. Оплаченные материалы не возвращаются.',
        onPress: cancelBoothJob,
      });
    } else if (inBooth) {
      const quote = boothPaintQuote(car.id);
      const done = !quote || quote.from >= quote.target;
      const cost = quote?.materialsCents ?? 0;
      tiles.push({
        key: 'booth',
        emoji: '🎨',
        title: 'Покраска',
        subtitle: done ? 'ЛКП 100%' : cost > 0 ? `материалы ${formatMoney(cost)}` : 'материалы оплачены',
        state: done ? 'done' : busy || state.balanceCents < cost ? 'locked' : 'ready',
        accent: ACTION_COLORS.paint,
        info: `Покраска в своей камере до ${quote?.target ?? 100}%: материалы — ${Math.round(ownPaintMaterialsShare(state) * 100)}% прироста стоимости${
          state.equipment.owned.includes('paint_matching') ? ' (с компьютерным подбором краски)' : ''
        }, они входят в себестоимость машины. Красишь тапами сам или красит нанятый маляр.`,
        onPress: () => setConfirm({ kind: 'booth' }),
      });
    } else if (!isClient && !parked) {
      const quote = servicePaintQuote(car.id);
      const done = paint >= 100;
      tiles.push({
        key: 'service',
        emoji: '🎨',
        title: 'Покраска',
        subtitle: servicePaint
          ? 'в сервисе'
          : done
            ? 'ЛКП 100%'
            : quote
              ? `${formatMoney(quote.costCents)} · ${pluralDays(quote.days)}`
              : '',
        state: servicePaint ? 'pending' : done ? 'done' : !quote || busy || state.balanceCents < quote.costCents ? 'locked' : 'ready',
        accent: ACTION_COLORS.paint,
        info: 'Сторонний сервис покрасит до 100%: цена — 80% прироста стоимости, срок 2 дня + 1 день на каждые 15 п. ЛКП. Машина в это время занята. Затраты входят в себестоимость. Своя покрасочная камера — дешевле (гараж → «Оборудование»).',
        onPress: () => setConfirm({ kind: 'service' }),
      });
    }

    // ─ Тюнинг на диностенде: технический максимум выше (один раз на машину)
    const tuning = tuningQuote(car.id);
    if (!isClient && state.equipment.owned.includes('dyno') && (tuning || car.tuned)) {
      tiles.push({
        key: 'tune',
        emoji: '🏎️',
        title: 'Тюнинг',
        subtitle: car.tuned ? 'сделан' : tuning ? `${formatMoney(tuning.costCents)} · макс ${fmtNum(tuning.to)}%` : '',
        state: car.tuned ? 'done' : !tuning || busy || state.balanceCents < tuning.costCents ? 'locked' : 'ready',
        accent: '#F97316',
        info: tuning
          ? `Диностенд: технический максимум ${fmtNum(tuning.from)}% → ${fmtNum(tuning.to)}%. Стоит ${formatMoney(
              tuning.costCents,
            )} (четверть будущего прироста стоимости), входит в себестоимость. Поднятые пункты ещё нужно отремонтировать (с деталями).`
          : 'Тюнинг этой машины уже сделан.',
        onPress: () => tuneCar(car.id),
      });
    }

    // ─ Перестановка в другое свободное место (слот или стоянка)
    const freeSlots = allSlots.filter((i) => !garage.some((c) => c.slotIndex === i) && !(isClient && isParkingSlot(i))).length;
    if (!isClient && freeSlots > 0) {
      tiles.push({
        key: 'move',
        emoji: '↔️',
        title: 'Переставить',
        subtitle: busy && !selling ? 'машина занята' : `свободно: ${freeSlots}`,
        state: (busy && !selling) || repairing ? 'locked' : 'ready',
        accent: colors.textTertiary,
        info: 'Переставить машину в свободный слот гаража — например, в покрасочную камеру или к другому механику. Во время ремонта и покраски переставить нельзя.',
        onPress: () => setMoving(true),
      });
    }

    // ─ Продажа
    if (!isClient) {
      tiles.push({
        key: 'sell',
        icon: ICONS.sell,
        title: 'Продать',
        subtitle: busy ? 'машина занята' : 'на рынок',
        state: busy ? 'locked' : 'ready',
        accent: ACTION_COLORS.sell,
        info: `Выставить на продажу: цена ±10% ползунком — чем дороже, тем дольше ждать (до ${MAX_SELL_DAYS_INFO} дней), −10% — сразу. Навык «Торговля» добавляет к выручке.`,
        onPress: onSell,
      });
    }

    // ─ Передача клиенту по заказу на подбор — если класс подходит
    const picking = state.orders.active.find((o) => o.kind === 'picking');
    if (!isClient && picking && picking.kind === 'picking' && car.tier === picking.tier) {
      const candidate = pickingCandidate(car.id);
      const problems = candidate ? pickingMismatch(picking, candidate) : ['нет данных'];
      tiles.push({
        key: 'client',
        emoji: '🤝',
        title: 'Клиенту',
        subtitle: problems.length > 0 ? 'не подходит' : formatMoney(picking.priceCents),
        state: problems.length > 0 || busy ? 'locked' : 'ready',
        accent: ACTION_COLORS.client,
        info:
          problems.length > 0
            ? `Для заказа на подбор пока не подходит: ${problems.join(', ')}.`
            : `Продажа клиенту сразу по цене заказа ${formatMoney(picking.priceCents)}, без ожидания. Плюс репутация и практика.`,
        onPress: () => deliverPicking(picking.id, car.id),
      });
    }
  }

  return (
    <>
      {/* Действия отделены от цены и статусов: линия и воздух */}
      <View style={styles.actions}>
        <ActionTiles tiles={tiles} />
      </View>
      <PaintConfirmModal car={car} confirm={confirm} onClose={() => setConfirm(null)} />
      <MoveCarModal car={car} visible={moving} onClose={() => setMoving(false)} />
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
    <SheetModal visible onRequestClose={onClose}>
        <View style={[garageStyles.modalContent, { paddingBottom: insets.bottom + 12 }]}>
          <SheetHeader title={service ? 'Покраска в сервисе' : 'Покраска в камере'} onClose={onClose} />
          <View style={styles.confirmBox}>
            <Text style={styles.confirmLine}>
              {car.name}: ЛКП {Math.round(quote.from)}% → {quote.target}%
            </Text>
            {service && <Text style={styles.confirmLine}>Срок: {pluralDays(service.days)}, машина в это время занята</Text>}
            {booth && <Text style={styles.confirmLine}>Красишь сам тапами или красит нанятый маляр</Text>}
            {costCents > 0 && (
              <>
                <Text style={styles.confirmLine}>
                  {service ? 'Стоимость' : 'Материалы'}: {formatMoney(costCents)} — войдёт в себестоимость машины
                </Text>
                <Text style={styles.confirmLine}>Машина подорожает примерно на {formatMoney(gainCents)}</Text>
                <Text style={[styles.confirmLine, { fontWeight: '800', color: gainCents - costCents >= 0 ? '#22C55E' : '#EF4444' }]}>
                  Итого заработаешь ≈ {formatMoney(gainCents - costCents, { sign: true })}
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
    </SheetModal>
  );
};

const styles = StyleSheet.create({
  actions: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  bars: { gap: 4, marginTop: 6, marginBottom: 12 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  barLabel: { fontSize: 12, color: colors.textTertiary },
  barValue: { fontSize: 12, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, backgroundColor: '#27272A', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  overall: { fontSize: 12, color: colors.textPrimary, fontWeight: '700' },
  nums: { fontVariant: ['tabular-nums'] },
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
  moveSlots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 12 },
  moveSlot: {
    width: 52,
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveSlotCurrent: { borderColor: colors.primary, backgroundColor: 'rgba(99, 102, 241, 0.25)' },
  moveSlotText: { fontSize: 18, fontWeight: '800', color: colors.textPrimary },
  confirmLine: { fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
});
