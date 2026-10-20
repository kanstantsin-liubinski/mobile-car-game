import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { colors } from '@styles/colors';
import { LocationHeader } from '@components/LocationHeader';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useGarageContext } from '@hooks/GarageContext';
import { useToast } from '@components/toast/ToastContext';
import { GameIcon } from '@components/GameIcon';
import { ICONS, TIER_ICONS } from '@img/gameIcons';
import { TIER_NAMES, TIER_UNLOCK_LEVELS } from '../data/carModels';
import * as B from '../economy/balance';
import { equipmentDef } from '../economy/economy';
import { canPerform, deliveryOutcome, serviceDef, type Order, type PickingOrder, type ServiceOrder } from '../economy/orders';
import { formatMoney, formatGameDays, pluralDays } from '../economy/format';
import { DAY_MS } from '../economy/time';

type Tab = 'service' | 'picking';

const ACCENT = '#A78BFA';

/** Заказы клиентов: автосервис и подбор авто, репутация бизнеса */
export const OrdersScreen = () => {
  const { state } = useEconomy();
  const { gameTimeMs } = useGameClock();
  const [tab, setTab] = useState<Tab>('service');
  const orders = state.orders;
  const rep = orders.reputation;
  const lastChange = orders.repHistory[0];
  const nextCheck = Math.max(0, orders.nextCheckAtMs - gameTimeMs);

  const active = orders.active.filter((o) => o.kind === tab);
  const board = orders.board.filter((o) => o.kind === tab);
  const history = orders.closed.filter((o) => o.kind === tab).slice(0, 5);

  return (
    <View style={{ flex: 1 }}>
      <LocationHeader title="Заказы" icon={ICONS.money} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.container}>
        <View style={styles.repCard}>
          <View style={styles.rowBetween}>
            <Text style={styles.repTitle} numberOfLines={1}>
              ⭐ Репутация
            </Text>
            <Text style={styles.repValue}>{rep} / 100</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${rep}%` }]} />
          </View>
          {lastChange && (
            <Text style={styles.muted}>
              Последнее: {lastChange.delta > 0 ? '+' : ''}
              {lastChange.delta} — {lastChange.reason}
            </Text>
          )}
          <Text style={styles.muted}>
            Новые заказы: шанс {Math.round(B.orderSpawnChance(rep) * 100)}% раз в 10 дней (следующая проверка через{' '}
            {formatGameDays(nextCheck, DAY_MS)}), второй заказ — {Math.round(B.extraOrderChance(rep) * 100)}%, повышенная оплата —{' '}
            {Math.round(B.premiumOrderChance(rep) * 100)}%.
            {rep < B.LOW_REPUTATION ? ' При такой репутации доверяют только простые работы.' : ''}
          </Text>
        </View>

        <View style={styles.tabs}>
          {(['service', 'picking'] as Tab[]).map((t) => (
            <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'service' ? '🔧 Автосервис' : '🤝 Подбор авто'}
                {orders.active.some((o) => o.kind === t) ? ' •' : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>
          В работе ({active.length}/{tab === 'service' ? B.MAX_ACTIVE_SERVICE_ORDERS : B.MAX_ACTIVE_PICKING_ORDERS})
        </Text>
        {active.length === 0 && <Text style={styles.empty}>Нет принятых заказов.</Text>}
        {active.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}

        <Text style={styles.section}>Предложения клиентов</Text>
        {board.length === 0 && (
          <Text style={styles.empty}>Пока нет предложений. Новые появляются при проверке раз в 10 игровых дней.</Text>
        )}
        {board.map((o) => (
          <OrderCard key={o.id} order={o} />
        ))}

        {history.length > 0 && <Text style={styles.section}>История</Text>}
        {history.map((o) => (
          <Text key={o.id} style={styles.historyRow}>
            {o.status === 'delivered' ? '✅' : o.status === 'failed' ? '❌' : '↩️'}{' '}
            {o.kind === 'service' ? serviceDef(o.type).name : 'Подбор'} · {TIER_NAMES[o.tier]} ·{' '}
            {o.status === 'delivered' ? `оплата ${formatMoney(o.paidCents ?? 0)}` : o.status === 'failed' ? 'провал' : 'отказ'}
            {o.repDelta ? ` · репутация ${o.repDelta > 0 ? '+' : ''}${o.repDelta}` : ''}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
};

const OrderCard = ({ order }: { order: Order }) => {
  const economy = useEconomy();
  const { state, unlockedTiers } = economy;
  const { gameTimeMs } = useGameClock();
  const garage = useGarageContext();
  const { showToast } = useToast();
  const offered = order.status === 'offered';
  const isService = order.kind === 'service';
  const def = isService ? serviceDef((order as ServiceOrder).type) : null;
  const tierLocked = !unlockedTiers.includes(order.tier);

  // Блокировки принятия — с понятным объяснением
  let block: string | null = null;
  if (offered) {
    if (tierLocked) block = `Класс «${TIER_NAMES[order.tier]}» откроется на ${TIER_UNLOCK_LEVELS[order.tier]} уровне`;
    else if (isService && !canPerform((order as ServiceOrder).type, state.equipment.owned)) {
      block = `Нужно оборудование: ${equipmentDef(def!.equipment).name}`;
    } else if (state.orders.active.filter((o) => o.kind === order.kind).length >= (isService ? B.MAX_ACTIVE_SERVICE_ORDERS : B.MAX_ACTIVE_PICKING_ORDERS)) {
      block = 'Достигнут лимит одновременных заказов';
    } else if (isService && garage.findSlotForOrder(order as ServiceOrder) === null) {
      block =
        (order as ServiceOrder).type === 'paint'
          ? 'Нужна свободная покрасочная камера'
          : 'Нет свободного слота в гараже (свои машины не убираются)';
    } else if (isService && state.balanceCents < (order as ServiceOrder).partsCents) {
      block = 'Не хватает денег на детали';
    }
  }

  const accept = () => {
    if (isService) {
      const res = garage.acceptServiceOrder(order.id);
      if (res === 'ok') {
        showToast({ title: 'Заказ принят', message: 'Машина клиента уже в гараже.', icon: TIER_ICONS[order.tier], tone: 'success' });
      }
    } else if (economy.acceptOrder(order.id)) {
      showToast({ title: 'Заказ на подбор принят', message: 'Найдите машину на авторынке и подготовьте её.', icon: TIER_ICONS[order.tier] });
    }
  };

  const deliver = () => {
    const o = order as ServiceOrder;
    const outcome = deliveryOutcome(o, o.completedAtMs ?? gameTimeMs);
    if (!economy.deliverServiceOrder(order.id)) return;
    showToast({
      title: 'Заказ сдан',
      message: `Оплата ${formatMoney(Math.round(o.rewardCents * outcome.payShare))} · репутация ${outcome.repDelta > 0 ? '+' : ''}${outcome.repDelta}`,
      icon: ICONS.money,
      tone: 'success',
    });
  };

  const deadlineLeft = order.deadlineAtMs !== undefined ? order.deadlineAtMs - gameTimeMs : null;
  const graceLeft =
    order.deadlineAtMs !== undefined ? order.deadlineAtMs + B.ORDER_GRACE_DAYS * DAY_MS - gameTimeMs : null;
  const done = isService && (order as ServiceOrder).completedAtMs !== undefined;
  const wasLate = done && order.deadlineAtMs !== undefined && (order as ServiceOrder).completedAtMs! > order.deadlineAtMs;

  return (
    <View style={[styles.card, order.premium && styles.premium]}>
      <View style={styles.cardHead}>
        <GameIcon source={TIER_ICONS[order.tier]} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {isService ? def!.name : 'Подбор авто'} · {TIER_NAMES[order.tier]}
            {order.premium ? ' · 💎 выгодный' : ''}
          </Text>
          <Text style={styles.muted}>{order.description}</Text>
        </View>
      </View>

      {isService ? (
        <ServiceDetails order={order as ServiceOrder} />
      ) : (
        <PickingDetails order={order as PickingOrder} />
      )}

      <Text style={styles.line}>
        ⏱ Срок: {pluralDays(order.deadlineDays)} после принятия
        {deadlineLeft !== null &&
          (deadlineLeft > 0
            ? ` · осталось ${formatGameDays(deadlineLeft, DAY_MS)}`
            : graceLeft !== null && graceLeft > 0
              ? ` · просрочен! льготный период ${formatGameDays(graceLeft, DAY_MS)} (оплата 70%, −3)`
              : '')}
      </Text>
      <Text style={styles.line}>
        ⭐ Репутация: +{def?.complex ? B.REP_COMPLEX_ON_TIME : B.REP_SIMPLE_ON_TIME} вовремя (+{B.REP_EARLY_BONUS} досрочно),{' '}
        {B.REP_LATE} с опозданием, {B.REP_FAILED} провал, {B.REP_CANCEL} отказ
      </Text>

      {offered ? (
        <>
          {block && <Text style={styles.block}>🔒 {block}</Text>}
          {!offered || (
            <Text style={styles.muted}>Предложение действует ещё {formatGameDays(order.offerExpiresAtMs - gameTimeMs, DAY_MS)}.</Text>
          )}
          <View style={styles.actions}>
            <TouchableOpacity style={[styles.primary, !!block && styles.disabled]} disabled={!!block} onPress={accept}>
              <Text style={styles.primaryText}>Принять</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondary} onPress={() => economy.declineOffer(order.id)}>
              <Text style={styles.secondaryText}>Отказаться</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          {isService && (
            <Text style={[styles.line, done && { color: '#22C55E', fontWeight: '700' }]}>
              {done
                ? wasLate
                  ? '✓ Работа закончена с опозданием — оплата 70%'
                  : '✓ Работа закончена вовремя — можно сдавать'
                : 'Машина в гараже: отремонтируйте (или покрасьте) её до цели.'}
            </Text>
          )}
          {!isService && (
            <Text style={styles.line}>
              Подходящую машину передайте из гаража кнопкой «Передать клиенту» на её карточке.
            </Text>
          )}
          <View style={styles.actions}>
            {isService && (
              <TouchableOpacity style={[styles.primary, !done && styles.disabled]} disabled={!done} onPress={deliver}>
                <Text style={styles.primaryText}>Сдать заказ</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.danger} onPress={() => economy.cancelOrder(order.id)}>
              <Text style={styles.dangerText}>Отказаться ({B.REP_CANCEL})</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const ServiceDetails = ({ order }: { order: ServiceOrder }) => {
  const isPaint = order.type === 'paint';
  return (
    <>
      <Text style={styles.line}>
        🚗 {order.car.name}, {order.car.year} · {order.car.mileage.toLocaleString('ru-RU')} км
      </Text>
      <Text style={styles.line}>
        🔧 Объём: {order.workPoints.toLocaleString('ru-RU')} п. {isPaint ? 'ЛКП' : 'тех. состояния'} · оборудование:{' '}
        {equipmentDef(serviceDef(order.type).equipment).name.toLowerCase()}
      </Text>
      <Text style={styles.line}>
        💵 Оплата {formatMoney(order.rewardCents)} · детали и материалы {formatMoney(order.partsCents)} (платите сразу, клиент
        возмещает в оплате) · чистыми {formatMoney(order.rewardCents - order.partsCents)}
      </Text>
    </>
  );
};

const PickingDetails = ({ order }: { order: PickingOrder }) => (
  <>
    <Text style={styles.line}>
      📋 Класс «{TIER_NAMES[order.tier]}», пробег до {order.maxMileage.toLocaleString('ru-RU')} км, общее состояние от{' '}
      {order.minOverall}%{order.minPaint !== null ? `, ЛКП от ${order.minPaint}%` : ''}
    </Text>
    <Text style={styles.line}>
      💵 Клиент заплатит {formatMoney(order.priceCents)} сразу при передаче. Машину покупаете сами, ремонт и покраска — за ваш
      счёт. Слот гаража заказ не занимает.
    </Text>
  </>
);

const styles = StyleSheet.create({
  // Отступы внутри прокрутки: полоса прокрутки идёт по краю экрана, а не поверх карточек
  container: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  repCard: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
    marginBottom: 12,
  },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  repTitle: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  repValue: { fontSize: 15, fontWeight: '800', color: '#FBBF24', fontVariant: ['tabular-nums'] },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#FBBF24' },
  muted: { fontSize: 12, color: colors.textTertiary, lineHeight: 17 },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.cardBg,
  },
  tabActive: { borderColor: ACCENT, backgroundColor: 'rgba(167, 139, 250, 0.15)' },
  tabText: { fontSize: 14, fontWeight: '700', color: colors.textTertiary },
  tabTextActive: { color: colors.textPrimary },
  section: { fontSize: 12, fontWeight: '800', color: colors.textTertiary, marginTop: 10, marginBottom: 6, textTransform: 'uppercase' },
  empty: { fontSize: 13, color: colors.textTertiary, marginBottom: 6 },
  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 6,
    marginBottom: 10,
  },
  premium: { borderColor: '#FBBF24' },
  cardHead: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary },
  line: { fontSize: 12, color: colors.textPrimary, lineHeight: 17 },
  block: { fontSize: 12, color: '#F59E0B', fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  primary: { flex: 1, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  primaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  secondary: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryText: { color: colors.textPrimary, fontWeight: '700', fontSize: 14 },
  danger: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  dangerText: { color: '#EF4444', fontWeight: '700', fontSize: 14 },
  disabled: { opacity: 0.45 },
  historyRow: { fontSize: 12, color: colors.textTertiary, marginBottom: 4 },
});
