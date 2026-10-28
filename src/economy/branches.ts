/**
 * Сеть филиалов и автоматизация.
 *
 * Старый гараж (ранг ниже основного) можно снова открыть как филиал. У филиала свои слоты, механики,
 * управляющий, доска заказов, клиентские машины и статистика; общие — деньги, репутация, уровень
 * игрока и зарплатный день (оклады сотрудников филиала — обычные контракты в общем фонде).
 *
 * Управляющий работает только в активном игровом времени: раз в «задержку» (зависит от уровня)
 * смотрит доску филиала, проверяет слот, механика, допуск, срок и ожидаемую прибыль, берёт лучший
 * заказ по стратегии, платит детали из свободных денег (не опускаясь ниже резерва), ставит механика,
 * следит за выполнением и сам сдаёт готовое. Ошибки управляющего мягкие: упущенный заказ, неудачный
 * выбор, лишний день задержки. Он не покупает и не продаёт машины, не берёт кредиты.
 *
 * Логика заказов (генерация, сроки, оценка сдачи, провал) — та же, что у основного автосервиса
 * (orders.ts); изменения репутации филиала переносятся в общую репутацию.
 */
import * as B from './balance.ts';
import * as O from './orders.ts';
import * as E from './economy.ts';
import { DAY_MS } from './time.ts';
import { rngForCheck } from './hotOffers.ts';
import { staffFullName } from '../data/staffNames.ts';
import { emptyBranchMonth, BRANCH_LOG_LIMIT, type BranchEvent, type BranchJob, type BranchMonth, type BranchSlot, type BranchState, type ManagerStrategy } from './branchModel.ts';

export * from './branchModel.ts';


export interface BranchContext {
  /** Классы, открытые уровнем игрока */
  unlockedTiers: number[];
  playerLevel: number;
  sampleCar: O.OrdersContext['sampleCar'];
}

const STAFF_LAST = ['Петров', 'Смирнов', 'Кузнецов', 'Попов', 'Соколов', 'Лебедев', 'Козлов', 'Новиков', 'Морозов', 'Волков'];

const hashString = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Имя сотрудника филиала: под его аватар (по id), фамилия — в нужном роде */
const staffName = (id: string): string => staffFullName(id, STAFF_LAST);


export const branchList = (s: E.EconomyState): BranchState[] => Object.values(s.branches ?? {});

const withBranch = (s: E.EconomyState, b: BranchState): E.EconomyState => ({ ...s, branches: { ...s.branches, [b.garageId]: b } });

const logEvent = (b: BranchState, atMs: number, text: string, kind: BranchEvent['kind'] = 'info'): BranchState => ({
  ...b,
  log: [{ atMs, text, kind }, ...b.log].slice(0, BRANCH_LOG_LIMIT),
});

const orderName = (o: O.Order) => (o.kind === 'service' ? O.serviceDef(o.type).name : 'Подбор');

// ─── Открытие филиала ──────────────────────────────────────────────────────

export interface GarageInfo {
  id: string;
  name: string;
  slots: number;
  /** Ранг (порядок) гаража: филиалом становится только гараж младше основного */
  rank: number;
}

/** Уровень, с которого можно открыть следующий филиал */
export const branchUnlockLevel = (s: E.EconomyState): number =>
  branchList(s).length === 0 ? B.BRANCH_FIRST_LEVEL : B.BRANCH_NETWORK_LEVEL;

export const branchOpenCostCents = (garageId: string): number => E.toCents(B.BRANCH_OPEN_COST[garageId] ?? B.BRANCH_OPEN_COST.garage_3);

/** Почему нельзя открыть филиал в этом гараже (null — можно) */
export const branchOpenBlock = (s: E.EconomyState, garage: GarageInfo, mainRank: number): string | null => {
  if (s.branches?.[garage.id]) return 'Филиал уже открыт';
  if (garage.rank >= mainRank) return 'Филиалом может стать только старый гараж — сначала переезжай в более крупный';
  if (branchList(s).length + 1 >= B.MAX_BUSINESS_OBJECTS) return `Не больше ${B.MAX_BUSINESS_OBJECTS} объектов бизнеса`;
  const level = s.player.xp.level;
  const need = branchUnlockLevel(s);
  if (level < need) return `Нужен ${need} уровень`;
  if (s.bankruptcy) return 'Бизнес банкрот';
  if (s.balanceCents < branchOpenCostCents(garage.id)) return 'Не хватает свободных денег';
  return null;
};

const createBranch = (s: E.EconomyState, garage: GarageInfo, now: number): BranchState => ({
  garageId: garage.id,
  openedAtMs: now,
  automation: false,
  strategy: 'balanced',
  reserveCents: E.toCents(B.BRANCH_DEFAULT_RESERVE),
  slots: [{ mechanicId: null }],
  equipment: [],
  managerId: null,
  staffNames: {},
  orders: { ...O.createOrdersState((s.orders.seed ^ hashString(garage.id)) >>> 0, now), reputation: s.orders.reputation },
  jobs: [],
  nextDecisionAtMs: now,
  decisions: 0,
  hires: 0,
  month: emptyBranchMonth(E.currentMonth(s)),
  history: [],
  log: [{ atMs: now, text: `Открыт филиал «${garage.name}»`, kind: 'ok' }],
  totals: { revenueCents: 0, partsCents: 0, completed: 0, failed: 0 },
});

/** Открыть филиал: разовое вложение из свободных денег (без кредита) */
export const openBranch = (s: E.EconomyState, garage: GarageInfo, mainRank: number, now: number): E.OpResult => {
  if (branchOpenBlock(s, garage, mainRank)) return { state: s, ok: false };
  const cost = branchOpenCostCents(garage.id);
  const paid = E.spend(s, cost, (l) => ({ ...l, investmentsCents: l.investmentsCents + cost }), `branch-open:${garage.id}`);
  if (!paid.ok) return paid;
  return { ok: true, state: withBranch(paid.state, createBranch(s, garage, now)) };
};

// ─── Автоматизация дополнительных слотов ───────────────────────────────────

export const maxAutoSlots = (garageSlots: number, playerLevel: number): number =>
  playerLevel >= B.EXTENDED_AUTOMATION_LEVEL ? garageSlots : Math.min(garageSlots, B.BRANCH_MAX_AUTO_SLOTS);

export const addSlotBlock = (s: E.EconomyState, b: BranchState, garageSlots: number): string | null => {
  const next = b.slots.length + 1;
  const level = s.player.xp.level;
  if (next > garageSlots) return 'Все места гаража уже автоматизированы';
  if (next > maxAutoSlots(garageSlots, level)) return `Больше ${B.BRANCH_MAX_AUTO_SLOTS} слотов — расширенная автоматизация с ${B.EXTENDED_AUTOMATION_LEVEL} уровня`;
  if (level < B.BRANCH_NETWORK_LEVEL) return `Нужен ${B.BRANCH_NETWORK_LEVEL} уровень`;
  const manager = b.managerId ? s.contracts[b.managerId] : undefined;
  const needManager = B.branchSlotManagerLevel(next);
  if (!manager) return 'Нужен управляющий';
  if (manager.skill.level < needManager) return `Управляющий должен быть ${needManager} уровня`;
  const cost = E.toCents(B.branchSlotCost(next));
  if (s.balanceCents - cost < b.reserveCents) return 'Не хватает денег с учётом резерва';
  return null;
};

export const addBranchSlot = (s: E.EconomyState, garageId: string, garageSlots: number, now: number): E.OpResult => {
  const b = s.branches?.[garageId];
  if (!b || addSlotBlock(s, b, garageSlots)) return { state: s, ok: false };
  const next = b.slots.length + 1;
  const cost = E.toCents(B.branchSlotCost(next));
  const paid = E.spend(s, cost, (l) => ({ ...l, investmentsCents: l.investmentsCents + cost }), `branch-slot:${garageId}:${next}`);
  if (!paid.ok) return paid;
  const updated = logEvent({ ...b, slots: [...b.slots, { mechanicId: null }] }, now, `Автоматизирован слот ${next}`, 'ok');
  return { ok: true, state: withBranch(paid.state, updated) };
};

// ─── Персонал филиала ──────────────────────────────────────────────────────

/** Скорость механика в пунктах работы за игровой день с учётом навыка и допуска к классу машины */
export const mechanicPointsPerDay = (c: E.Contract | undefined, tier: number): number =>
  c ? B.MECHANIC_POINTS_PER_DAY * E.workerSpeedMultiplier(c) * E.clearanceSpeedFactor(c, tier) : 0;

const restartJob = (s: E.EconomyState, b: BranchState, slot: number, now: number): { state: E.EconomyState; branch: BranchState } => {
  const job = b.jobs.find((j) => j.slot === slot);
  const mechanicId = b.slots[slot]?.mechanicId;
  const order = job ? b.orders.active.find((o) => o.id === job.orderId) : undefined;
  if (!job || job.finished || job.doneAtMs !== null || !mechanicId || !order) return { state: s, branch: b };
  const speed = mechanicPointsPerDay(s.contracts[mechanicId], order.tier);
  const doneAtMs = now + Math.ceil((job.remainingPts / speed) * DAY_MS);
  const branch = { ...b, jobs: b.jobs.map((j) => (j === job ? { ...j, doneAtMs, startAtMs: now, busyFromMs: now } : j)) };
  return { state: E.setMechanicBusy(s, mechanicId, true, now), branch };
};

/** Нанять сотрудника филиала: механика на слот или управляющего */
export const hireBranchStaff = (
  s: E.EconomyState,
  garageId: string,
  role: 'mechanic' | 'manager',
  now: number,
  slot = 0,
): E.OpResult => {
  const b = s.branches?.[garageId];
  if (!b || s.bankruptcy) return { state: s, ok: false };
  if (role === 'manager' && b.managerId) return { state: s, ok: false };
  if (role === 'mechanic' && (!b.slots[slot] || b.slots[slot].mechanicId)) return { state: s, ok: false };
  const id = `branch:${garageId}:${role}:${b.hires + 1}`;
  const name = staffName(id);
  let state = E.startContract(s, id, now, undefined, role);
  state = { ...state, contracts: { ...state.contracts, [id]: { ...state.contracts[id], branchId: garageId, name } } };
  let branch: BranchState = {
    ...b,
    hires: b.hires + 1,
    staffNames: { ...b.staffNames, [id]: name },
    managerId: role === 'manager' ? id : b.managerId,
    slots: role === 'mechanic' ? b.slots.map((sl, i) => (i === slot ? { mechanicId: id } : sl)) : b.slots,
  };
  branch = logEvent(branch, now, `Нанят ${role === 'manager' ? 'управляющий' : 'механик'} ${name}`, 'info');
  if (role === 'mechanic') {
    const restarted = restartJob(state, branch, slot, now);
    state = restarted.state;
    branch = restarted.branch;
  }
  return { ok: true, state: withBranch(state, branch) };
};

/** Механик со слота филиала уходит: работа на слоте встаёт с остатком до прихода следующего */
const vacateSlot = (s: E.EconomyState, b: BranchState, id: string, now: number): BranchState => {
  const slot = b.slots.findIndex((sl) => sl.mechanicId === id);
  if (slot < 0) return b;
  let branch = b;
  const job = b.jobs.find((j) => j.slot === slot && !j.finished && j.doneAtMs !== null);
  if (job && job.doneAtMs !== null) {
    const order = b.orders.active.find((o) => o.id === job.orderId);
    const speed = mechanicPointsPerDay(s.contracts[id], order?.tier ?? 1);
    const remainingPts = Math.max(0, ((job.doneAtMs - now) / DAY_MS) * speed);
    branch = { ...branch, jobs: branch.jobs.map((j) => (j === job ? { ...j, doneAtMs: null, remainingPts } : j)) };
  }
  return { ...branch, slots: branch.slots.map((sl, i) => (i === slot ? { mechanicId: null } : sl)) };
};

/**
 * Штат общий: механика из основного гаража (или другого филиала) можно перевести на слот филиала —
 * без увольнения, с его навыком, допуском и окладом. Занятого ремонтом не переводим: сначала стоп.
 */
export const transferBlock = (s: E.EconomyState, garageId: string, slot: number, id: string): string | null => {
  const b = s.branches?.[garageId];
  const c = s.contracts[id];
  if (!b || !b.slots[slot]) return 'Нет такого слота';
  if (b.slots[slot].mechanicId) return 'Слот занят';
  if (!c || (c.profession && c.profession !== 'mechanic')) return 'Не механик';
  if (c.branchId === garageId) return 'Уже в этом филиале';
  if (c.busySinceMs !== null) return 'Сейчас ремонтирует — сначала останови работу';
  return null;
};

export const transferToBranch = (s: E.EconomyState, garageId: string, slot: number, id: string, name: string, now: number): E.OpResult => {
  if (transferBlock(s, garageId, slot, id)) return { state: s, ok: false };
  let state = s;
  const from = s.contracts[id].branchId;
  const fromBranch = from ? s.branches?.[from] : undefined;
  if (fromBranch) state = withBranch(state, logEvent(vacateSlot(state, fromBranch, id, now), now, `${name} переведён в другой филиал`, 'info'));
  state = { ...state, contracts: { ...state.contracts, [id]: { ...state.contracts[id], branchId: garageId, name } } };
  const b = state.branches[garageId];
  let branch: BranchState = logEvent(
    { ...b, staffNames: { ...b.staffNames, [id]: name }, slots: b.slots.map((sl, i) => (i === slot ? { mechanicId: id } : sl)) },
    now,
    `${name} переведён на слот ${slot + 1}`,
    'info',
  );
  const restarted = restartJob(state, branch, slot, now);
  state = restarted.state;
  branch = restarted.branch;
  return { ok: true, state: withBranch(state, branch) };
};

/** Вернуть механика из филиала в общий штат основного гаража (не увольнение) */
export const releaseFromBranch = (s: E.EconomyState, garageId: string, id: string, now: number): E.OpResult => {
  const b = s.branches?.[garageId];
  const c = s.contracts[id];
  if (!b || !c || c.branchId !== garageId || b.managerId === id) return { state: s, ok: false };
  const name = b.staffNames[id] ?? c.name ?? 'Механик';
  const branch = logEvent(vacateSlot(s, b, id, now), now, `${name} вернулся в основной гараж`, 'info');
  const { branchId: _left, ...rest } = c;
  const state = E.setMechanicBusy({ ...s, contracts: { ...s.contracts, [id]: { ...rest, name } } }, id, false, now);
  return { ok: true, state: withBranch(state, branch) };
};

/** Уволить сотрудника филиала: обычное увольнение (зарплата + компенсация), работа на слоте встаёт */
export const fireBranchStaff = (s: E.EconomyState, garageId: string, id: string, now: number): E.OpResult => {
  const b = s.branches?.[garageId];
  if (!b || !s.contracts[id]) return { state: s, ok: false };
  let branch = b;
  const slot = b.slots.findIndex((sl) => sl.mechanicId === id);
  if (slot >= 0) {
    // Механик ушёл посреди работы — заказ встаёт с остатком работы до найма нового
    const job = b.jobs.find((j) => j.slot === slot && !j.finished && j.doneAtMs !== null);
    if (job && job.doneAtMs !== null) {
      const order = b.orders.active.find((o) => o.id === job.orderId);
      const speed = mechanicPointsPerDay(s.contracts[id], order?.tier ?? 1);
      const remainingPts = Math.max(0, ((job.doneAtMs - now) / DAY_MS) * speed);
      branch = { ...branch, jobs: branch.jobs.map((j) => (j === job ? { ...j, doneAtMs: null, remainingPts } : j)) };
    }
    branch = { ...branch, slots: branch.slots.map((sl, i) => (i === slot ? { mechanicId: null } : sl)) };
  }
  if (b.managerId === id) branch = { ...branch, managerId: null, automation: false };
  const fired = E.fireMechanic(E.setMechanicBusy(s, id, false, now), id, now);
  if (!fired.ok) return { state: s, ok: false };
  branch = logEvent(branch, now, `Уволен ${b.managerId === id ? 'управляющий' : 'механик'} ${b.staffNames[id] ?? ''}`.trim(), 'warn');
  return { ok: true, state: withBranch(fired.state, branch) };
};

// ─── Настройки управляющего ────────────────────────────────────────────────

export const automationBlock = (s: E.EconomyState, b: BranchState): string | null => {
  if (!b.managerId || !s.contracts[b.managerId]) return 'Найми управляющего';
  if (!b.slots.some((sl) => sl.mechanicId && s.contracts[sl.mechanicId])) return 'Найми механика на слот';
  return null;
};

export const setBranchAutomation = (s: E.EconomyState, garageId: string, on: boolean, now: number): E.EconomyState => {
  const b = s.branches?.[garageId];
  if (!b || b.automation === on) return s;
  if (on && automationBlock(s, b)) return s;
  const updated = logEvent(
    { ...b, automation: on, nextDecisionAtMs: on ? now : b.nextDecisionAtMs },
    now,
    on ? 'Автоматизация включена' : 'Автоматизация выключена',
    'info',
  );
  return withBranch(s, updated);
};

export const setBranchStrategy = (s: E.EconomyState, garageId: string, strategy: ManagerStrategy): E.EconomyState => {
  const b = s.branches?.[garageId];
  return b && b.strategy !== strategy ? withBranch(s, { ...b, strategy }) : s;
};

export const setBranchReserve = (s: E.EconomyState, garageId: string, reserveCents: number): E.EconomyState => {
  const b = s.branches?.[garageId];
  return b && b.reserveCents !== reserveCents ? withBranch(s, { ...b, reserveCents: Math.max(0, Math.round(reserveCents)) }) : s;
};

// ─── Оценка заказа управляющим ─────────────────────────────────────────────

export interface ManagerEstimate {
  workDays: number;
  /** Оплата − детали − оклад механика за дни работы, центы */
  profitCents: number;
  perDayCents: number;
  clearanceOk: boolean;
  /** Почему управляющий не возьмёт (null — подходит) */
  reject: string | null;
}

/** Какие заказы берёт управляющий: простые (с 90 уровня и кузов) + работы на оборудовании филиала */
export const managerTypes = (playerLevel: number, equipment: readonly B.EquipmentId[] = []): B.ServiceOrderType[] => {
  const base = playerLevel >= B.EXTENDED_AUTOMATION_LEVEL ? B.MANAGER_EXTENDED_TYPES : B.MANAGER_SIMPLE_TYPES;
  const extra = B.SERVICE_ORDER_TYPES.filter((d) => equipment.includes(d.equipment)).map((d) => d.type);
  return [...base, ...extra.filter((t) => !base.includes(t))];
};

/** Почему это оборудование нельзя купить в филиал (null — можно) */
export const branchEquipmentBlock = (s: E.EconomyState, garageId: string, id: B.EquipmentId, playerLevel: number): string | null => {
  const b = s.branches?.[garageId];
  const def = B.EQUIPMENT.find((e) => e.id === id);
  if (!b || !def || !B.BRANCH_EQUIPMENT.includes(id)) return 'Недоступно для филиала';
  if ((b.equipment ?? []).includes(id)) return 'Уже есть';
  if (playerLevel < def.requiredLevel) return `С ${def.requiredLevel} уровня`;
  if (s.balanceCents < E.toCents(def.price)) return 'Не хватает денег';
  return null;
};

/** Купить оборудование в филиал: вложение из свободных денег */
export const buyBranchEquipment = (s: E.EconomyState, garageId: string, id: B.EquipmentId, playerLevel: number, now: number): E.OpResult => {
  if (branchEquipmentBlock(s, garageId, id, playerLevel)) return { state: s, ok: false };
  const def = B.EQUIPMENT.find((e) => e.id === id)!;
  const cost = E.toCents(def.price);
  const paid = E.spend(s, cost, (l) => ({ ...l, investmentsCents: l.investmentsCents + cost }), `branch-eq:${garageId}:${id}`);
  if (!paid.ok) return paid;
  const b = paid.state.branches[garageId];
  return { ok: true, state: withBranch(paid.state, logEvent({ ...b, equipment: [...(b.equipment ?? []), id] }, now, `Куплено: ${def.name}`, 'ok')) };
};

export const estimateOrder = (
  s: E.EconomyState,
  b: BranchState,
  order: O.Order,
  mechanicId: string | null,
  playerLevel: number,
): ManagerEstimate => {
  const c = mechanicId ? s.contracts[mechanicId] : undefined;
  if (order.kind !== 'service') return { workDays: 0, profitCents: 0, perDayCents: 0, clearanceOk: false, reject: 'Подбор филиал не делает' };
  const speed = mechanicPointsPerDay(c, order.tier);
  const workDays = speed > 0 ? order.workPoints / speed : Infinity;
  const laborPerDay = c ? c.monthlyCents / 30 : 0;
  const profitCents = Math.round(order.rewardCents - order.partsCents - laborPerDay * workDays);
  const clearanceOk = !!c && E.clearanceSpeedFactor(c, order.tier) >= 1;
  const strat = B.managerStrategy(b.strategy);
  let reject: string | null = null;
  if (!managerTypes(playerLevel, b.equipment).includes(order.type)) reject = 'Нет оборудования в филиале';
  else if (!c) reject = 'Нет механика';
  else if (!clearanceOk && !strat.allowNoClearance) reject = 'Нет допуска у механика';
  else if (workDays > order.deadlineDays * strat.deadlineShare) reject = 'Не успеть с запасом';
  else if (profitCents < order.rewardCents * strat.minMarginShare) reject = profitCents < 0 ? 'Убыточный' : 'Мало прибыли';
  return { workDays, profitCents, perDayCents: profitCents / Math.max(0.1, workDays), clearanceOk, reject };
};

// ─── Ход филиала ───────────────────────────────────────────────────────────

/** Каждый автоматизированный слот приводит свой поток клиентов (частота — по общей репутации) */
const branchOrdersCtx = (ctx: BranchContext, b: BranchState): O.OrdersContext => ({
  unlockedTiers: ctx.unlockedTiers,
  playerLevel: ctx.playerLevel,
  owned: ['basic_tools', ...(b.equipment ?? [])],
  sampleCar: ctx.sampleCar,
  serviceTypes: managerTypes(ctx.playerLevel, b.equipment),
  pickingShare: 0,
  spawnRolls: b.slots.length,
  extraBoard: 2 * (b.slots.length - 1),
});

/** Изменения репутации филиала (оценка сдачи, провалы, отказы) переносятся в общую репутацию */
const syncReputation = (s: E.EconomyState, b: BranchState, garageName: string): { state: E.EconomyState; branch: BranchState } => {
  if (b.orders.repHistory.length === 0) return { state: s, branch: b };
  let orders = s.orders;
  for (const h of [...b.orders.repHistory].reverse()) orders = O.changeReputation(orders, h.delta, `${garageName}: ${h.reason}`, h.atMs);
  return {
    state: { ...s, orders },
    branch: { ...b, orders: { ...b.orders, repHistory: [], reputation: orders.reputation } },
  };
};

/** Доска филиала к моменту t (общая репутация копируется перед генерацией) */
const advanceBoard = (s: E.EconomyState, b: BranchState, t: number, ctx: BranchContext): BranchState => {
  const synced = b.orders.reputation === s.orders.reputation ? b.orders : { ...b.orders, reputation: s.orders.reputation };
  const orders = O.advanceOrders(synced, t, branchOrdersCtx(ctx, b));
  return orders === b.orders ? b : { ...b, orders };
};

/** Механики, закончившие работу к t, освобождаются; момент окончания фиксируется в заказе */
const finishJobs = (s0: E.EconomyState, b0: BranchState, t: number): { state: E.EconomyState; branch: BranchState } => {
  let s = s0;
  let b = b0;
  for (const job of b0.jobs) {
    if (job.finished || job.doneAtMs === null || job.doneAtMs > t) continue;
    const mechanicId = b.slots[job.slot]?.mechanicId;
    if (mechanicId) s = E.recordMechanicJob(E.setMechanicBusy(s, mechanicId, false, job.doneAtMs), mechanicId);
    b = {
      ...b,
      orders: O.markWorkDone(b.orders, job.orderId, job.doneAtMs),
      jobs: b.jobs.map((j) => (j.orderId === job.orderId ? { ...j, finished: true } : j)),
      month: { ...b.month, busyMs: b.month.busyMs + Math.max(0, job.doneAtMs - Math.max(job.busyFromMs, job.startAtMs)) },
    };
  }
  return { state: s, branch: b };
};

/** Заказы, которые orders.ts закрыл как проваленные (срок + льготный период) — освобождаем слоты */
const dropFailedJobs = (s0: E.EconomyState, b0: BranchState, t: number): { state: E.EconomyState; branch: BranchState } => {
  let s = s0;
  let b = b0;
  for (const job of b0.jobs) {
    if (b.orders.active.some((o) => o.id === job.orderId)) continue;
    const mechanicId = b.slots[job.slot]?.mechanicId;
    if (mechanicId && !job.finished) s = E.setMechanicBusy(s, mechanicId, false, t);
    b = logEvent(
      {
        ...b,
        jobs: b.jobs.filter((j) => j.orderId !== job.orderId),
        month: { ...b.month, failed: b.month.failed + 1 },
        totals: { ...b.totals, failed: b.totals.failed + 1 },
      },
      t,
      'Заказ провален: срок вышел',
      'warn',
    );
  }
  return { state: s, branch: b };
};

/** Сдать готовую работу: оплата по моменту фактического окончания, один раз */
const deliverJob = (s: E.EconomyState, b: BranchState, job: BranchJob, now: number): { state: E.EconomyState; branch: BranchState } => {
  const order = b.orders.active.find((o) => o.id === job.orderId);
  const opId = `branch-deliver:${job.orderId}`;
  if (!order || order.kind !== 'service' || order.completedAtMs === undefined || E.isProcessed(s, opId)) return { state: s, branch: b };
  const outcome = O.deliveryOutcome(order, order.completedAtMs);
  const paid = Math.round(order.rewardCents * outcome.payShare);
  let state: E.EconomyState = E.withProcessed(
    {
      ...s,
      balanceCents: s.balanceCents + paid,
      ledger: { ...s.ledger, serviceRevenueCents: s.ledger.serviceRevenueCents + paid },
    },
    opId,
  );
  state = E.creditLegacyBonus(state, paid - order.partsCents);
  state = E.awardOrderXp(state, order, outcome.late, E.BRANCH_ORDER_XP_SHARE);
  if (b.managerId) state = E.addWorkerPractice(state, b.managerId, B.MANAGER_ORDER_PRACTICE, now);
  // Факт: оклад механика с момента принятия (включая задержки управляющего) до окончания работы
  const workDays = Math.max(0, ((job.doneAtMs ?? now) - (order.acceptedAtMs ?? job.startAtMs)) / DAY_MS);
  const actual = Math.round(paid - order.partsCents - job.laborCentsPerDay * workDays);
  const branch = logEvent(
    {
      ...b,
      orders: O.completeOrder(b.orders, job.orderId, now, outcome, paid),
      jobs: b.jobs.filter((j) => j.orderId !== job.orderId),
      month: {
        ...b.month,
        revenueCents: b.month.revenueCents + paid,
        completed: b.month.completed + 1,
        late: b.month.late + (outcome.late ? 1 : 0),
        expectedProfitCents: b.month.expectedProfitCents + job.expectedProfitCents,
        actualProfitCents: b.month.actualProfitCents + actual,
      },
      totals: { ...b.totals, revenueCents: b.totals.revenueCents + paid, completed: b.totals.completed + 1 },
    },
    now,
    `Сдан заказ «${orderName(order)}»: ${E.fromCents(paid).toFixed(0)}$${outcome.late ? ' (с опозданием)' : ''}`,
    outcome.late ? 'warn' : 'ok',
  );
  return { state, branch };
};

/** Принять заказ в слот: детали из свободных денег (управляющий — не ниже резерва) */
const takeOrder = (
  s: E.EconomyState,
  b: BranchState,
  order: O.ServiceOrder,
  slot: number,
  t: number,
  opts: { byManager: boolean; startDelayMs?: number; estimate: ManagerEstimate },
): { state: E.EconomyState; branch: BranchState } | null => {
  const mechanicId = b.slots[slot]?.mechanicId;
  if (!mechanicId || !s.contracts[mechanicId]) return null;
  const reserve = opts.byManager ? b.reserveCents : 0;
  if (s.balanceCents - order.partsCents < reserve) return null;
  const parts = order.partsCents;
  const paid = E.spend(s, parts, (l) => ({ ...l, serviceCostsCents: l.serviceCostsCents + parts }), `branch-parts:${order.id}`);
  if (!paid.ok) return null;
  const startAtMs = t + (opts.startDelayMs ?? 0);
  const speed = mechanicPointsPerDay(s.contracts[mechanicId], order.tier);
  const job: BranchJob = {
    slot,
    orderId: order.id,
    byManager: opts.byManager,
    startAtMs,
    busyFromMs: startAtMs,
    doneAtMs: startAtMs + Math.ceil((order.workPoints / speed) * DAY_MS),
    remainingPts: order.workPoints,
    finished: false,
    expectedProfitCents: opts.estimate.profitCents,
    laborCentsPerDay: s.contracts[mechanicId].monthlyCents / 30,
  };
  const branch = logEvent(
    {
      ...b,
      orders: O.acceptOrder(b.orders, order.id, t),
      jobs: [...b.jobs, job],
      month: { ...b.month, partsCents: b.month.partsCents + parts },
      totals: { ...b.totals, partsCents: b.totals.partsCents + parts },
    },
    t,
    `${opts.byManager ? 'Управляющий взял' : 'Взят'} заказ «${orderName(order)}» → ${b.staffNames[mechanicId] ?? 'механик'}`,
    'info',
  );
  return { state: E.setMechanicBusy(paid.state, mechanicId, true, t), branch };
};

const freeSlots = (b: BranchState, s: E.EconomyState): number[] =>
  b.slots
    .map((sl, i) => ({ sl, i }))
    .filter(({ sl, i }) => sl.mechanicId && s.contracts[sl.mechanicId] && !b.jobs.some((j) => j.slot === i))
    .map(({ i }) => i);

const candidatesFor = (s: E.EconomyState, b: BranchState, slot: number, playerLevel: number) =>
  b.orders.board
    .filter((o): o is O.ServiceOrder => o.kind === 'service' && playerLevel >= 1)
    .map((o) => ({ order: o, est: estimateOrder(s, b, o, b.slots[slot].mechanicId, playerLevel) }))
    .filter((x) => x.est.reject === null && s.balanceCents - x.order.partsCents >= b.reserveCents)
    .sort((a, b2) => b2.est.perDayCents - a.est.perDayCents);

/** Одно решение управляющего в момент t */
const managerDecision = (s0: E.EconomyState, b0: BranchState, t: number, ctx: BranchContext): { state: E.EconomyState; branch: BranchState; acted: boolean } => {
  let s = s0;
  let b = b0;
  let acted = false;
  // Готовое сдаётся автоматически
  for (const job of b0.jobs) {
    if (!job.finished) continue;
    const res = deliverJob(s, b, job, t);
    s = res.state;
    b = res.branch;
    acted = true;
  }
  const manager = b.managerId ? s.contracts[b.managerId] : undefined;
  if (!manager) return { state: s, branch: b, acted };
  for (const slot of freeSlots(b, s)) {
    const candidates = candidatesFor(s, b, slot, ctx.playerLevel);
    if (candidates.length === 0) continue;
    const rng = rngForCheck((b.orders.seed ^ 0x9e3779b9) >>> 0, b.decisions);
    b = { ...b, decisions: b.decisions + 1 };
    acted = true;
    let pick = candidates[0];
    let startDelayMs = 0;
    if (rng() < B.managerErrorChance(manager.skill.level)) {
      const kind = rng();
      b = { ...b, month: { ...b.month, managerErrors: b.month.managerErrors + 1 } };
      if (kind < 0.4) {
        // Упущенный заказ: клиент ушёл, пока управляющий раздумывал
        b = logEvent({ ...b, orders: O.declineOffer(b.orders, pick.order.id) }, t, `Управляющий упустил заказ «${orderName(pick.order)}»`, 'warn');
        continue;
      }
      if (kind < 0.7 && candidates.length > 1) {
        pick = candidates[candidates.length - 1];
        b = logEvent(b, t, 'Управляющий выбрал не самый выгодный заказ', 'warn');
      } else {
        startDelayMs = DAY_MS;
        b = logEvent(b, t, 'Управляющий замешкался: работа начнётся на день позже', 'warn');
      }
    }
    const taken = takeOrder(s, b, pick.order, slot, t, { byManager: true, startDelayMs, estimate: pick.est });
    if (taken) {
      s = taken.state;
      b = taken.branch;
    }
  }
  return { state: s, branch: b, acted };
};

const delayMsOf = (s: E.EconomyState, b: BranchState): number => {
  const manager = b.managerId ? s.contracts[b.managerId] : undefined;
  return Math.max(1, Math.round(B.managerDelayDays(manager?.skill.level ?? 1) * DAY_MS));
};

const automated = (s: E.EconomyState, b: BranchState): boolean => b.automation && !!b.managerId && !!s.contracts[b.managerId];

/** Ход одного филиала к моменту now */
export const advanceBranch = (s0: E.EconomyState, garageId: string, garageName: string, now: number, ctx: BranchContext): E.EconomyState => {
  const b0 = s0.branches?.[garageId];
  if (!b0 || s0.bankruptcy) return s0;
  let s = s0;
  let b = b0;
  if (automated(s, b)) {
    const delay = delayMsOf(s, b);
    let t = Math.max(b.nextDecisionAtMs, b.openedAtMs);
    for (let guard = 0; t <= now && guard < 5000; guard++) {
      b = advanceBoard(s, b, t, ctx);
      ({ state: s, branch: b } = finishJobs(s, b, t));
      ({ state: s, branch: b } = dropFailedJobs(s, b, t));
      const res = managerDecision(s, b, t, ctx);
      s = res.state;
      b = res.branch;
      // Пока делать нечего — сразу к ближайшему событию (новая проверка доски, окончание работы), по сетке задержки
      let nextEvent = t + delay;
      if (!res.acted) {
        const events = [b.orders.nextCheckAtMs, ...b.jobs.filter((j) => !j.finished && j.doneAtMs !== null).map((j) => j.doneAtMs!)];
        const soonest = Math.min(...events, now + delay);
        if (soonest > nextEvent) nextEvent = t + Math.ceil((soonest - t) / delay) * delay;
      }
      t = nextEvent;
    }
    b = { ...b, nextDecisionAtMs: t };
  }
  b = advanceBoard(s, b, now, ctx);
  ({ state: s, branch: b } = finishJobs(s, b, now));
  ({ state: s, branch: b } = dropFailedJobs(s, b, now));
  ({ state: s, branch: b } = syncReputation(s, b, garageName));
  return b === b0 && s === s0 ? s0 : withBranch(s, b);
};

/** Нужен ли ход филиалам: проверка доски, окончание работы, решение управляющего */
export const branchesDue = (s: E.EconomyState, now: number, playerLevel: number): boolean =>
  branchList(s).some((b) => {
    if (b.orders.nextCheckAtMs <= now || b.orders.board.some((o) => o.offerExpiresAtMs <= now)) return true;
    if (b.orders.active.some((o) => O.isOverdueFinal(o, now))) return true;
    if (b.jobs.some((j) => !j.finished && j.doneAtMs !== null && j.doneAtMs <= now)) return true;
    if (!automated(s, b) || b.nextDecisionAtMs > now) return false;
    if (b.jobs.some((j) => j.finished)) return true;
    return freeSlots(b, s).some((slot) => candidatesFor(s, b, slot, playerLevel).length > 0);
  });

export const advanceBranches = (s: E.EconomyState, now: number, ctx: BranchContext, names: Record<string, string>): E.EconomyState =>
  branchList(s).reduce((state, b) => advanceBranch(state, b.garageId, names[b.garageId] ?? b.garageId, now, ctx), s);

// ─── Ручное управление игроком ─────────────────────────────────────────────

/** Взять заказ с доски филиала вручную (резерв не проверяется — решение игрока) */
export const acceptBranchOrder = (s: E.EconomyState, garageId: string, orderId: string, slot: number, now: number, playerLevel: number): E.OpResult => {
  const b = s.branches?.[garageId];
  const order = b?.orders.board.find((o) => o.id === orderId);
  if (!b || !order || order.kind !== 'service' || b.jobs.some((j) => j.slot === slot) || s.bankruptcy) return { state: s, ok: false };
  if (!managerTypes(playerLevel, b.equipment).includes(order.type)) return { state: s, ok: false };
  const taken = takeOrder(s, b, order, slot, now, { byManager: false, estimate: estimateOrder(s, b, order, b.slots[slot]?.mechanicId ?? null, playerLevel) });
  return taken ? { ok: true, state: withBranch(taken.state, taken.branch) } : { state: s, ok: false };
};

/** Сдать готовую работу вручную (если автоматизация выключена) */
export const deliverBranchJob = (s: E.EconomyState, garageId: string, slot: number, now: number): E.OpResult => {
  const b = s.branches?.[garageId];
  const job = b?.jobs.find((j) => j.slot === slot && j.finished);
  if (!b || !job) return { state: s, ok: false };
  const res = deliverJob(s, b, job, now);
  return res.state === s ? { state: s, ok: false } : { ok: true, state: withBranch(res.state, res.branch) };
};

/** Отказ от заказа в работе: как в основном сервисе — репутация, детали не возвращаются */
export const cancelBranchJob = (s: E.EconomyState, garageId: string, slot: number, now: number, garageName: string): E.OpResult => {
  const b = s.branches?.[garageId];
  const job = b?.jobs.find((j) => j.slot === slot);
  if (!b || !job) return { state: s, ok: false };
  const mechanicId = b.slots[slot]?.mechanicId;
  let state = mechanicId && !job.finished ? E.setMechanicBusy(s, mechanicId, false, now) : s;
  let branch = logEvent(
    {
      ...b,
      orders: O.cancelOrder(b.orders, job.orderId, now),
      jobs: b.jobs.filter((j) => j !== job),
      month: { ...b.month, cancelled: b.month.cancelled + 1 },
    },
    now,
    'Отказ от заказа',
    'warn',
  );
  ({ state, branch } = syncReputation(state, branch, garageName));
  return { ok: true, state: withBranch(state, branch) };
};

// ─── Отчёты ────────────────────────────────────────────────────────────────

/** Оклады сотрудников филиала, начисленные в текущем месяце */
export const branchSalaryCents = (s: E.EconomyState, garageId: string, now: number): number =>
  Object.values(s.contracts)
    .filter((c) => c.branchId === garageId)
    .reduce((sum, c) => sum + E.accruedSalaryCents(c, now), 0);

export interface BranchReport extends BranchMonth {
  netCents: number;
  loadPct: number | null;
  idleMs: number;
}

/** Текущий месяц филиала на момент now (оклады — начисленные) */
export const currentBranchReport = (s: E.EconomyState, b: BranchState, now: number): BranchReport => {
  const start = Math.max(E.monthStartMs(s), b.openedAtMs);
  const slotMs = b.slots.length * Math.max(0, now - start);
  const running = b.jobs
    .filter((j) => !j.finished && j.doneAtMs !== null && j.busyFromMs <= now)
    .reduce((sum, j) => sum + Math.max(0, now - Math.max(j.busyFromMs, j.startAtMs, start)), 0);
  const busyMs = Math.min(slotMs, b.month.busyMs + running);
  const salaryCents = branchSalaryCents(s, b.garageId, now);
  return {
    ...b.month,
    salaryCents,
    slotMs,
    busyMs,
    netCents: b.month.revenueCents - b.month.partsCents - salaryCents,
    loadPct: slotMs > 0 ? busyMs / slotMs : null,
    idleMs: Math.max(0, slotMs - busyMs),
  };
};

export const reportOf = (m: BranchMonth): BranchReport => ({
  ...m,
  netCents: m.revenueCents - m.partsCents - m.salaryCents,
  loadPct: m.slotMs > 0 ? Math.min(1, m.busyMs / m.slotMs) : null,
  idleMs: Math.max(0, m.slotMs - m.busyMs),
});

