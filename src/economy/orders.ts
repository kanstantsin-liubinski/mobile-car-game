/**
 * Заказы клиентов и репутация автосервиса — чистая логика без денег.
 * Деньги, практика и продажа машины по заказу на подбор — в economy.ts, который вызывает эти функции
 * внутри одной атомарной операции.
 *
 * Доска заказов обновляется проверкой каждый игровой день (детерминированный RNG — перезапуск
 * ничего не перебрасывает). Принятый ремонтный заказ занимает слот гаража (машина клиента),
 * заказ на подбор слот не занимает.
 */
import * as B from './balance.ts';
import { DAY_MS } from './time.ts';
import { mulberry32, rngForCheck } from './hotOffers.ts';
import { overallMax } from './carCondition.ts';
import { calculateCarPrice } from '../utils/priceCalculator.ts';

export type Rng = () => number;

export type OrderStatus = 'offered' | 'active' | 'delivered' | 'failed' | 'cancelled' | 'expired';

interface OrderBase {
  id: string;
  tier: number;
  premium: boolean;
  createdAtMs: number;
  /** Пока не принят — висит на доске до этого времени */
  offerExpiresAtMs: number;
  /** Срок на выполнение после принятия, игровых дней */
  deadlineDays: number;
  status: OrderStatus;
  acceptedAtMs?: number;
  deadlineAtMs?: number;
  closedAtMs?: number;
  /** Сколько фактически заплатил клиент */
  paidCents?: number;
  repDelta?: number;
}

/** Машина клиента: показывается в гараже, но не принадлежит игроку */
export interface ClientCar {
  name: string;
  modelId: string;
  emoji: string;
  speed: number;
  year: number;
  mileage: number;
  basePrice: number;
  /** Техническое состояние при приезде */
  condition: number;
  paintCondition: number;
}

export interface ServiceOrder extends OrderBase {
  kind: 'service';
  type: B.ServiceOrderType;
  description: string;
  /** Объём работы: пункты тех. состояния (или ЛКП для покраски) */
  workPoints: number;
  car: ClientCar;
  /** Детали и материалы — платит игрок при принятии, клиент возмещает при сдаче */
  partsCents: number;
  /** Оплата при сдаче вовремя (работа + возмещение деталей) */
  rewardCents: number;
  /** Когда работа фактически закончена (для оценки срока, даже если «Сдать» нажали позже) */
  completedAtMs?: number;
}

export interface PickingOrder extends OrderBase {
  kind: 'picking';
  description: string;
  maxMileage: number;
  /** Минимальное общее состояние, % */
  minOverall: number;
  /** Минимальное ЛКП, % (null — не важно) */
  minPaint: number | null;
  /** Сколько клиент платит за машину */
  priceCents: number;
  /** Нужная модель: цена клиента считается именно по ней (у старых сохранений может не быть) */
  modelName?: string;
  /** Машина, переданная клиенту */
  carId?: string;
  /** Особый контракт коллекционера (85+): дороже, дольше срок, высокое ЛКП */
  special?: boolean;
}

export type Order = ServiceOrder | PickingOrder;

export interface ReputationChange {
  atMs: number;
  delta: number;
  reason: string;
}

export interface OrdersState {
  seed: number;
  checksDone: number;
  nextCheckAtMs: number;
  /** Когда появился последний новый заказ — для гарантии «не реже раза в 3 дня» */
  lastOrderAtMs: number;
  /** Шкала репутации сохранения (старые сохранения — 100, теперь 1000) */
  repMax: number;
  /** Предложения на доске */
  board: Order[];
  /** Принятые и ещё не закрытые */
  active: Order[];
  /** Последние закрытые (история) */
  closed: Order[];
  reputation: number;
  repHistory: ReputationChange[];
}

export const CLOSED_HISTORY = 30;

export const createOrdersState = (seed: number, now: number): OrdersState => ({
  seed: seed >>> 0,
  checksDone: 0,
  // Первая проверка — сразу, чтобы раздел не был пустым
  nextCheckAtMs: now,
  lastOrderAtMs: now,
  repMax: B.REPUTATION_MAX,
  board: [],
  active: [],
  closed: [],
  reputation: B.REPUTATION_START,
  repHistory: [],
});

export const serviceDef = (type: B.ServiceOrderType): B.ServiceOrderDef =>
  B.SERVICE_ORDER_TYPES.find((d) => d.type === type) ?? B.SERVICE_ORDER_TYPES[0];

/** Цена пункта общего состояния типичной подержанной машины класса, $ */
export const tierPointValue = B.tierPointValue;

/** Сколько пунктов работы делает за игровой день один исполнитель с базовой скоростью */
export const pointsPerDay = (type: B.ServiceOrderType): number =>
  type === 'paint' ? B.PAINTER_SPEED_PER_SEC * (DAY_MS / 1000) : 0.05 * (DAY_MS / 1000);

export const isComplex = (o: Order): boolean => (o.kind === 'service' ? serviceDef(o.type).complex : false);

// ─── Генерация ─────────────────────────────────────────────────────────────

export interface SampleCar extends ClientCar {
  tier: number;
  maxCondition: number;
}

export interface OrdersContext {
  /** Классы машин, открытые общим уровнем игрока */
  unlockedTiers: number[];
  /** Общий уровень игрока — влияет на оплату заказов (не на их частоту) */
  playerLevel: number;
  owned: B.EquipmentId[];
  /** Обычная машина класса из генератора авторынка (использует только переданный rng) */
  sampleCar: (tier: number, rng: Rng) => SampleCar;
  /** Только эти типы ремонтных заказов (филиал: простые работы). По умолчанию — все */
  serviceTypes?: B.ServiceOrderType[];
  /** Доля заказов на подбор (по умолчанию 30%; у филиала — 0) */
  pickingShare?: number;
  /** Сколько независимых потоков клиентов проверяется в день (филиал: по одному на автоматизированный слот) */
  spawnRolls?: number;
  /** Дополнительные места на доске сверх нормы репутации */
  extraBoard?: number;
}

const pick = <T,>(items: T[], rng: Rng): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
const between = (min: number, max: number, rng: Rng) => min + rng() * (max - min);
/** Суммы заказов — в целых долларах */
const cents = (dollars: number) => Math.max(1, Math.round(dollars)) * 100;

/** С какого уровня игрока оборудование можно купить */
const equipmentLevel = (id: B.EquipmentId): number => B.EQUIPMENT.find((e) => e.id === id)?.requiredLevel ?? 1;

export const canPerform = (type: B.ServiceOrderType, owned: B.EquipmentId[]): boolean => {
  const eq = serviceDef(type).equipment;
  return eq === 'basic_tools' || owned.includes(eq);
};

const makeServiceOrder = (id: string, now: number, reputation: number, ctx: OrdersContext, rng: Rng): ServiceOrder => {
  const tier = pick(ctx.unlockedTiers, rng);
  const premium = rng() < B.premiumOrderChance(reputation);
  // Любые типы работ при любой репутации; чаще те, что игрок может выполнить имеющимся оборудованием.
  // Работа на оборудовании, которое по уровню ещё нельзя купить, не предлагается: взять её нельзя
  // никак, и на доске она была только шумом (покраска «с 18 уровня» у игрока 3-го).
  const allowed = (ctx.serviceTypes ? B.SERVICE_ORDER_TYPES.filter((d) => ctx.serviceTypes!.includes(d.type)) : B.SERVICE_ORDER_TYPES).filter(
    (d) => (d.minLevel ?? 0) <= ctx.playerLevel && equipmentLevel(d.equipment) <= ctx.playerLevel,
  );
  const doable = allowed.filter((d) => canPerform(d.type, ctx.owned));
  const locked = allowed.filter((d) => !canPerform(d.type, ctx.owned));
  const pool = locked.length === 0 || (doable.length > 0 && rng() < B.ORDER_AVAILABLE_TYPE_WEIGHT) ? doable : locked;
  const def = pick(pool.length > 0 ? pool : allowed, rng);

  const days = between(def.minDays, def.maxDays, rng);
  const workPoints = Math.round(days * pointsPerDay(def.type) * 10) / 10;
  const sample = ctx.sampleCar(tier, rng);
  const isPaint = def.type === 'paint';
  // Клиентская машина приезжает в таком состоянии, чтобы объём работы помещался в шкалу
  const condition = isPaint
    ? sample.condition
    : Math.round(Math.min(100 - workPoints, Math.max(5, sample.condition)) * 10) / 10;
  const paintCondition = isPaint ? Math.round(Math.max(0, 100 - workPoints) * 10) / 10 : sample.paintCondition;

  const weight = isPaint ? B.PAINT_WEIGHT : B.TECH_WEIGHT;
  const labor =
    workPoints *
    weight *
    tierPointValue(tier) *
    B.ORDER_LABOR_SHARE *
    B.orderRewardMultiplier(ctx.playerLevel, reputation) *
    def.laborMult *
    (premium ? B.PREMIUM_REWARD_MULT : 1);
  const parts = labor * def.partsShare;
  return {
    id,
    kind: 'service',
    type: def.type,
    tier,
    premium,
    description: pick(def.descriptions, rng),
    workPoints,
    car: { ...sample, condition, paintCondition },
    partsCents: cents(parts),
    rewardCents: cents(labor + parts),
    deadlineDays: Math.ceil(days * B.ORDER_DEADLINE_MULT) + B.ORDER_DEADLINE_EXTRA_DAYS,
    createdAtMs: now,
    offerExpiresAtMs: now + B.ORDER_OFFER_DAYS * DAY_MS,
    status: 'offered',
  };
};

/**
 * Требования заказа на подбор строятся от реальной машины из генератора авторынка: такой
 * экземпляр (и похожие) встречается на рынке, а ремонт и покраска доводят его до требований.
 */
const makePickingOrder = (id: string, now: number, reputation: number, ctx: OrdersContext, rng: Rng): PickingOrder => {
  // Особый контракт: коллекционеру нужна машина старшего открытого класса
  const special = ctx.playerLevel >= B.LADDER.specialContracts && rng() < B.SPECIAL_CONTRACT_CHANCE;
  const tier = special ? Math.max(...ctx.unlockedTiers) : pick(ctx.unlockedTiers, rng);
  const premium = rng() < B.premiumOrderChance(reputation);
  const sample = ctx.sampleCar(tier, rng);
  const maxMileage = Math.max(20_000, Math.ceil((sample.mileage * between(1.15, 1.4, rng)) / 10_000) * 10_000);
  const reachable = overallMax(sample.maxCondition);
  const minOverall = Math.max(25, Math.floor(reachable - between(4, 12, rng)));
  const minPaint = special ? B.SPECIAL_CONTRACT_MIN_PAINT : rng() < 0.4 ? Math.round(between(60, 85, rng)) : null;
  const value = calculateCarPrice(sample.basePrice, { year: sample.year, mileage: sample.mileage, condition: minOverall });
  // Наценка клиента за подбор тоже растёт с репутацией и уровнем — на 20% от прироста множителя
  const mult =
    between(B.PICKING_PRICE_MIN, B.PICKING_PRICE_MAX, rng) *
    (premium ? 1.08 : 1) *
    (special ? B.SPECIAL_CONTRACT_MULT : 1) *
    (1 + 0.2 * (B.orderRewardMultiplier(ctx.playerLevel, reputation) - 1));
  return {
    id,
    kind: 'picking',
    tier,
    premium,
    description: special ? pick(SPECIAL_PHRASES, rng) : pick(PICKING_PHRASES, rng),
    special: special || undefined,
    maxMileage,
    minOverall,
    minPaint,
    // Цена — по конкретной модели клиента: дешёвая модель того же класса заказ не выполняет
    modelName: sample.name,
    priceCents: cents(value * mult),
    deadlineDays: special
      ? Math.round(between(B.SPECIAL_CONTRACT_MIN_DAYS, B.SPECIAL_CONTRACT_MAX_DAYS, rng))
      : Math.round(between(B.PICKING_MIN_DAYS, B.PICKING_MAX_DAYS, rng)),
    createdAtMs: now,
    offerExpiresAtMs: now + B.ORDER_OFFER_DAYS * DAY_MS,
    status: 'offered',
  };
};

const SPECIAL_PHRASES = [
  'Особый контракт: коллекционер ищет экземпляр в отличном состоянии',
  'Особый контракт: машина для выставки, кузов должен блестеть',
  'Особый контракт: подарок к юбилею — только идеальное состояние',
];

const PICKING_PHRASES = [
  'Нужна машина для семьи, без сюрпризов',
  'Ищу автомобиль на каждый день, сам искать некогда',
  'Подбери машину в хорошем состоянии, заплачу сразу',
  'Хочу машину к отпуску — главное, чтобы не подвела',
];

const countKind = (orders: Order[], kind: Order['kind']) => orders.filter((o) => o.kind === kind).length;

/**
 * Одна ежедневная проверка доски. Шанс нового заказа и второго заказа зависят только от репутации;
 * если 3 дня не было ни одного нового заказа — заказ приходит гарантированно.
 */
const runCheck = (s: OrdersState, t: number, ctx: OrdersContext): OrdersState => {
  const index = s.checksDone;
  const next: OrdersState = { ...s, checksDone: index + 1, nextCheckAtMs: t + B.ORDER_CHECK_DAYS * DAY_MS };
  if (ctx.unlockedTiers.length === 0) return next;
  const rng = rngForCheck(s.seed ^ 0x5bd1e995, index);
  const board = [...next.board];
  const maxService = B.maxBoardService(s.reputation) + (ctx.extraBoard ?? 0);
  const maxPicking = B.maxBoardPicking(s.reputation);
  let spawned = 0;
  const spawn = (n: number) => {
    // Подбор — примерно каждый третий заказ; если нужная доска заполнена — берём другую
    const servicePlace = countKind(board, 'service') < maxService;
    const pickingPlace = countKind(board, 'picking') < maxPicking;
    if (!servicePlace && (!pickingPlace || ctx.pickingShare === 0)) return;
    const kind: Order['kind'] = (rng() < (ctx.pickingShare ?? 0.3) && pickingPlace) || !servicePlace ? 'picking' : 'service';
    const id = `ord-${s.seed.toString(36)}-${index}-${n}`;
    const orderRng = mulberry32(Math.floor(rng() * 0xffffffff));
    board.push(
      kind === 'picking'
        ? makePickingOrder(id, t, s.reputation, ctx, orderRng)
        : makeServiceOrder(id, t, s.reputation, ctx, orderRng),
    );
    spawned += 1;
  };
  const guaranteed = t - s.lastOrderAtMs >= B.ORDER_GUARANTEE_DAYS * DAY_MS;
  let n = 0;
  for (let roll = 0; roll < Math.max(1, ctx.spawnRolls ?? 1); roll++) {
    if ((roll === 0 && guaranteed) || rng() < B.orderSpawnChance(s.reputation)) {
      spawn(n++);
      if (rng() < B.extraOrderChance(s.reputation)) spawn(n++);
    }
  }
  return { ...next, board, lastOrderAtMs: spawned > 0 ? t : s.lastOrderAtMs };
};

const closeOrder = (s: OrdersState, order: Order): OrdersState => ({
  ...s,
  active: s.active.filter((o) => o.id !== order.id),
  board: s.board.filter((o) => o.id !== order.id),
  closed: [order, ...s.closed].slice(0, CLOSED_HISTORY),
});

export const changeReputation = (s: OrdersState, delta: number, reason: string, now: number): OrdersState => {
  if (delta === 0) return s;
  const reputation = Math.min(B.REPUTATION_MAX, Math.max(0, s.reputation + delta));
  return {
    ...s,
    reputation,
    repHistory: [{ atMs: now, delta: reputation - s.reputation, reason }, ...s.repHistory].slice(0, B.REPUTATION_HISTORY),
  };
};

/** Срок вышел вместе с льготным периодом */
export const isOverdueFinal = (o: Order, now: number): boolean =>
  o.status === 'active' && o.deadlineAtMs !== undefined && now > o.deadlineAtMs + B.ORDER_GRACE_DAYS * DAY_MS;

const orderLabel = (o: Order) => (o.kind === 'service' ? serviceDef(o.type).name : 'Подбор авто');

/** Окончательный провал: работа не закончена (ремонт) или машина не передана (подбор) */
const failOverdue = (s0: OrdersState, now: number): OrdersState => {
  let s = s0;
  for (const o of s0.active) {
    const done = o.kind === 'service' && o.completedAtMs !== undefined;
    if (done || !isOverdueFinal(o, now)) continue;
    const at = (o.deadlineAtMs ?? now) + B.ORDER_GRACE_DAYS * DAY_MS;
    s = closeOrder(s, { ...o, status: 'failed', closedAtMs: at, paidCents: 0, repDelta: B.REP_FAILED });
    s = changeReputation(s, B.REP_FAILED, `Провален заказ: ${orderLabel(o)}`, at);
  }
  return s;
};

const expireOffers = (s: OrdersState, now: number): OrdersState => {
  const board = s.board.filter((o) => o.offerExpiresAtMs > now);
  return board.length === s.board.length ? s : { ...s, board };
};

/** Все проверки и сроки, наступившие к now */
export const advanceOrders = (s0: OrdersState, now: number, ctx: OrdersContext): OrdersState => {
  let s = failOverdue(s0, now);
  for (let guard = 0; s.nextCheckAtMs <= now && guard < 1000; guard++) {
    const t = s.nextCheckAtMs;
    s = runCheck(expireOffers(s, t), t, ctx);
  }
  return expireOffers(s, now);
};

// ─── Действия игрока ───────────────────────────────────────────────────────

export const findOrder = (s: OrdersState, id: string): Order | undefined =>
  s.board.find((o) => o.id === id) ?? s.active.find((o) => o.id === id);

export type AcceptBlock = 'not-found' | 'equipment' | 'limit' | 'tier';

/** Можно ли принять (слот для ремонтного заказа проверяет гараж) */
export const acceptBlock = (s: OrdersState, id: string, ctx: Pick<OrdersContext, 'owned' | 'unlockedTiers'>): AcceptBlock | null => {
  const o = s.board.find((x) => x.id === id);
  if (!o) return 'not-found';
  if (!ctx.unlockedTiers.includes(o.tier)) return 'tier';
  if (o.kind === 'service') {
    if (!canPerform(o.type, ctx.owned)) return 'equipment';
    if (countKind(s.active, 'service') >= B.MAX_ACTIVE_SERVICE_ORDERS) return 'limit';
  } else if (countKind(s.active, 'picking') >= B.MAX_ACTIVE_PICKING_ORDERS) return 'limit';
  return null;
};

export const acceptOrder = (s: OrdersState, id: string, now: number): OrdersState => {
  const o = s.board.find((x) => x.id === id);
  if (!o) return s;
  const accepted: Order = { ...o, status: 'active', acceptedAtMs: now, deadlineAtMs: now + o.deadlineDays * DAY_MS };
  return { ...s, board: s.board.filter((x) => x.id !== id), active: [...s.active, accepted] };
};

/** Отказ от предложения на доске — без последствий */
export const declineOffer = (s: OrdersState, id: string): OrdersState => ({ ...s, board: s.board.filter((o) => o.id !== id) });

/** Отказ от принятого заказа: −5 репутации, затраты не возвращаются */
export const cancelOrder = (s: OrdersState, id: string, now: number): OrdersState => {
  const o = s.active.find((x) => x.id === id);
  if (!o) return s;
  const closed = closeOrder(s, { ...o, status: 'cancelled', closedAtMs: now, paidCents: 0, repDelta: B.REP_CANCEL });
  return changeReputation(closed, B.REP_CANCEL, `Отказ от заказа: ${orderLabel(o)}`, now);
};

/** Работа по ремонтному заказу закончена — фиксируем момент один раз */
export const markWorkDone = (s: OrdersState, id: string, at: number): OrdersState => {
  const o = s.active.find((x) => x.id === id);
  if (!o || o.kind !== 'service' || o.completedAtMs !== undefined) return s;
  return { ...s, active: s.active.map((x) => (x.id === id ? { ...o, completedAtMs: at } : x)) };
};

export interface DeliveryOutcome {
  /** Доля оплаты: 1 — вовремя, 0,7 — в льготный период */
  payShare: number;
  repDelta: number;
  early: boolean;
  late: boolean;
}

/** Оценка сдачи по моменту фактического выполнения */
export const deliveryOutcome = (o: Order, doneAt: number): DeliveryOutcome => {
  const deadline = o.deadlineAtMs ?? doneAt;
  const late = doneAt > deadline;
  if (late) return { payShare: B.ORDER_LATE_PAY_SHARE, repDelta: B.REP_LATE, early: false, late: true };
  const total = deadline - (o.acceptedAtMs ?? deadline);
  const early = total > 0 && (deadline - doneAt) / total >= B.ORDER_EARLY_SHARE;
  const base = isComplex(o) ? B.REP_COMPLEX_ON_TIME : B.REP_SIMPLE_ON_TIME;
  return { payShare: 1, repDelta: Math.min(B.REP_MAX_PER_ORDER, base + (early ? B.REP_EARLY_BONUS : 0)), early, late: false };
};

/** Закрыть заказ как выполненный (деньги начисляет экономика) */
export const completeOrder = (
  s: OrdersState,
  id: string,
  now: number,
  outcome: DeliveryOutcome,
  paidCents: number,
  carId?: string,
): OrdersState => {
  const o = s.active.find((x) => x.id === id);
  if (!o) return s;
  const done: Order =
    o.kind === 'picking'
      ? { ...o, status: 'delivered', closedAtMs: now, paidCents, repDelta: outcome.repDelta, carId }
      : { ...o, status: 'delivered', closedAtMs: now, paidCents, repDelta: outcome.repDelta };
  const reason = outcome.late
    ? `Сдан с опозданием: ${orderLabel(o)}`
    : outcome.early
      ? `Сдан досрочно: ${orderLabel(o)}`
      : `Выполнен вовремя: ${orderLabel(o)}`;
  return changeReputation(closeOrder(s, done), outcome.repDelta, reason, now);
};

// ─── Подбор: соответствие машины ───────────────────────────────────────────

export interface PickingCandidate {
  tier?: number;
  /** Модель машины игрока */
  name?: string;
  mileage: number;
  overall: number;
  paintCondition: number;
}

export const pickingMismatch = (o: PickingOrder, car: PickingCandidate): string[] => {
  const problems: string[] = [];
  if (car.tier !== o.tier) problems.push('другой класс');
  else if (o.modelName && car.name !== o.modelName) problems.push(`нужна модель ${o.modelName}`);
  if (car.mileage > o.maxMileage) problems.push('пробег больше допустимого');
  if (car.overall + 1e-9 < o.minOverall) problems.push(`общее состояние ниже ${o.minOverall}%`);
  if (o.minPaint !== null && car.paintCondition + 1e-9 < o.minPaint) problems.push(`ЛКП ниже ${o.minPaint}%`);
  return problems;
};

/**
 * Восстановление из сохранения. Старая шкала репутации 0–100 переводится в 0–1000 (×10 —
 * вместе с историей), а редкие проверки раз в 10 дней — в ежедневные с текущего момента.
 */
export const restoreOrdersState = (raw: unknown, seed: number, now: number): OrdersState => {
  const r = raw as Partial<OrdersState> | null | undefined;
  if (!r || typeof r.seed !== 'number') return createOrdersState(seed, now);
  const scale = r.repMax === B.REPUTATION_MAX ? 1 : B.REPUTATION_MAX / 100;
  const nextCheckAtMs = Math.min(r.nextCheckAtMs ?? now, now + B.ORDER_CHECK_DAYS * DAY_MS);
  const rescale = (o: Order): Order => (scale === 1 || o.repDelta === undefined ? o : { ...o, repDelta: o.repDelta * scale });
  return {
    seed: r.seed >>> 0,
    checksDone: r.checksDone ?? 0,
    nextCheckAtMs,
    lastOrderAtMs: typeof r.lastOrderAtMs === 'number' ? r.lastOrderAtMs : now,
    repMax: B.REPUTATION_MAX,
    board: r.board ?? [],
    active: r.active ?? [],
    closed: (r.closed ?? []).map(rescale),
    reputation: typeof r.reputation === 'number' ? Math.min(B.REPUTATION_MAX, r.reputation * scale) : B.REPUTATION_START,
    repHistory: (r.repHistory ?? []).map((h) => ({ ...h, delta: h.delta * scale })),
  };
};
