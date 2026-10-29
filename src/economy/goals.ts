/**
 * Цели игрока: ежедневные задания, достижения и коллекция моделей.
 *
 * Ежедневные задания — три на реальные сутки (по часам устройства): что-то продать, починить,
 * выполнить заказ. Цели подбираются под уровень и открытые классы. Награда — деньги и опыт за
 * каждое задание и бонус за все три. Не успел — задания сгорают в полночь, новые приходят сами.
 *
 * Достижения — разовые вехи карьеры (продажи, уровень, лучший месяц, заказы, восстановления,
 * филиалы, коллекция) с денежной наградой, которую забирают вручную.
 *
 * Коллекция — какие модели из каталога игрок уже продавал (сколько раз и с какой лучшей прибылью).
 * Полностью собранный класс — отдельное достижение.
 *
 * Модуль чистый: состояние целей живёт в экономике (EconomyState.goals), события приходят из её
 * операций (продажа, тап, заказ, покупка, осмотр, полное восстановление).
 */
import { mulberry32 } from './hotOffers.ts';
import { requiredXp } from './progression.ts';
import { CAR_MODELS_BY_TIER, TIER_NAMES } from '../data/carModels.ts';

export type TaskKind = 'sellProfit' | 'sellRoi' | 'taps' | 'orders' | 'buyTier' | 'inspect' | 'profitSum' | 'fullRepair';

export interface DailyTask {
  id: string;
  kind: TaskKind;
  /** Сколько нужно (для profitSum — центы прибыли) */
  target: number;
  progress: number;
  /** buyTier — класс; sellRoi — доходность в процентах */
  param?: number;
  rewardCents: number;
  rewardXp: number;
  claimed: boolean;
}

export interface DailyState {
  /** Локальная дата «2026-10-30» */
  dayKey: string;
  tasks: DailyTask[];
  bonusClaimed: boolean;
}

export interface CollectionEntry {
  tier?: number;
  sold: number;
  bestProfitCents: number;
}

export interface GoalsState {
  daily: DailyState | null;
  /** Достижения, награду за которые уже забрали */
  achievements: string[];
  /** Проданные модели по названию */
  collection: Record<string, CollectionEntry>;
  counters: { ordersDone: number; fullRepairs: number };
}

export const createGoals = (): GoalsState => ({
  daily: null,
  achievements: [],
  collection: {},
  counters: { ordersDone: 0, fullRepairs: 0 },
});

/** Состояние из старого сохранения (полей могло не быть) */
export const restoreGoals = (g: Partial<GoalsState> | undefined): GoalsState => ({
  daily: g?.daily ?? null,
  achievements: g?.achievements ?? [],
  collection: g?.collection ?? {},
  counters: { ordersDone: g?.counters?.ordersDone ?? 0, fullRepairs: g?.counters?.fullRepairs ?? 0 },
});

// ─── События ──────────────────────────────────────────────────────────────

export type GoalEvent =
  | { type: 'sale'; name: string; tier?: number; profitCents: number; /** прибыль / цена покупки */ roi: number }
  | { type: 'tap' }
  | { type: 'order' }
  | { type: 'buy'; tier?: number }
  | { type: 'inspect' }
  | { type: 'fullRepair' };

/** Насколько событие продвигает задание */
const taskGain = (t: DailyTask, e: GoalEvent): number => {
  switch (t.kind) {
    case 'sellProfit':
      return e.type === 'sale' && e.profitCents > 0 ? 1 : 0;
    case 'sellRoi':
      return e.type === 'sale' && e.roi * 100 >= (t.param ?? 0) ? 1 : 0;
    case 'profitSum':
      return e.type === 'sale' ? Math.max(0, e.profitCents) : 0;
    case 'taps':
      return e.type === 'tap' ? 1 : 0;
    case 'orders':
      return e.type === 'order' ? 1 : 0;
    case 'buyTier':
      return e.type === 'buy' && (e.tier ?? 0) >= (t.param ?? 1) ? 1 : 0;
    case 'inspect':
      return e.type === 'inspect' ? 1 : 0;
    case 'fullRepair':
      return e.type === 'fullRepair' ? 1 : 0;
  }
};

export const trackGoal = (g0: GoalsState | undefined, e: GoalEvent): GoalsState => {
  const g = restoreGoals(g0);
  let daily = g.daily;
  if (daily) {
    let changed = false;
    const tasks = daily.tasks.map((t) => {
      const gain = t.progress >= t.target ? 0 : taskGain(t, e);
      if (gain <= 0) return t;
      changed = true;
      return { ...t, progress: Math.min(t.target, t.progress + gain) };
    });
    if (changed) daily = { ...daily, tasks };
  }
  let { collection, counters } = g;
  if (e.type === 'sale') {
    const prev = collection[e.name];
    collection = {
      ...collection,
      [e.name]: {
        tier: e.tier ?? prev?.tier,
        sold: (prev?.sold ?? 0) + 1,
        bestProfitCents: Math.max(prev?.bestProfitCents ?? Number.NEGATIVE_INFINITY, e.profitCents),
      },
    };
  }
  if (e.type === 'order') counters = { ...counters, ordersDone: counters.ordersDone + 1 };
  if (e.type === 'fullRepair') counters = { ...counters, fullRepairs: counters.fullRepairs + 1 };
  return { ...g, daily, collection, counters };
};

// ─── Ежедневные задания ───────────────────────────────────────────────────

/** Локальная дата устройства — граница суток для заданий */
export const dayKeyOf = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const hash = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

const avgBasePrice = (tier: number): number => {
  const models = CAR_MODELS_BY_TIER[tier] ?? CAR_MODELS_BY_TIER[1];
  return models.reduce((sum, m) => sum + m.basePrice, 0) / models.length;
};

/** Награда за одно задание: деньги растут с уровнем, опыт — 6% от нужного на уровень */
export const taskRewardCents = (level: number): number => Math.round((150 + 100 * level) / 50) * 50 * 100;
export const taskRewardXp = (level: number): number => Math.max(5, Math.round(requiredXp(level) * 0.06));
/** Бонус за все три задания дня */
export const dailyBonusCents = (level: number): number => taskRewardCents(level) * 2;

interface TaskPlan {
  kind: TaskKind;
  /** Подходит ли игроку на этом уровне */
  ok: (level: number) => boolean;
  make: (level: number, topTier: number) => Pick<DailyTask, 'target' | 'param'>;
}

const PLANS: TaskPlan[] = [
  { kind: 'sellProfit', ok: () => true, make: (lv) => ({ target: lv < 8 ? 1 : lv < 25 ? 2 : 3 }) },
  { kind: 'sellRoi', ok: () => true, make: (lv) => ({ target: 1, param: lv < 10 ? 15 : lv < 30 ? 20 : 25 }) },
  // Сумма прибыли за день: ~8% средней цены новой машины старшего открытого класса
  { kind: 'profitSum', ok: (lv) => lv >= 3, make: (_lv, tier) => ({ target: Math.max(500, Math.round((avgBasePrice(tier) * 0.08) / 100) * 100) * 100 }) },
  { kind: 'taps', ok: (lv) => lv < 40, make: (lv) => ({ target: lv < 10 ? 100 : lv < 25 ? 200 : 300 }) },
  { kind: 'orders', ok: () => true, make: (lv) => ({ target: lv < 15 ? 1 : 2 }) },
  { kind: 'buyTier', ok: (lv) => lv >= 8, make: (_lv, tier) => ({ target: 1, param: tier }) },
  { kind: 'inspect', ok: (lv) => lv < 30, make: () => ({ target: 3 }) },
  { kind: 'fullRepair', ok: () => true, make: () => ({ target: 1 }) },
];

export const DAILY_TASK_COUNT = 3;

/** Три разных задания на день: выбор зависит от даты и карьеры, поэтому перезапуск их не меняет */
export const createDaily = (dayKey: string, level: number, topTier: number, careerId: string): DailyState => {
  const rng = mulberry32(hash(`${careerId}:${dayKey}`));
  const pool = PLANS.filter((p) => p.ok(level));
  const tasks: DailyTask[] = [];
  while (tasks.length < DAILY_TASK_COUNT && pool.length > 0) {
    const plan = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    tasks.push({
      id: `${dayKey}:${plan.kind}`,
      kind: plan.kind,
      progress: 0,
      ...plan.make(level, topTier),
      rewardCents: taskRewardCents(level),
      rewardXp: taskRewardXp(level),
      claimed: false,
    });
  }
  return { dayKey, tasks, bonusClaimed: false };
};

const pluralCars = (n: number) => (n === 1 ? 'машину' : n < 5 ? 'машины' : 'машин');

/** Текст задания: «Продай 2 машины с прибылью» */
export const taskTitle = (t: DailyTask, formatMoney: (cents: number) => string): string => {
  switch (t.kind) {
    case 'sellProfit':
      return t.target === 1 ? 'Продай машину с прибылью' : `Продай ${t.target} ${pluralCars(t.target)} с прибылью`;
    case 'sellRoi':
      return `Продай машину с доходностью от ${t.param}%`;
    case 'profitSum':
      return `Заработай ${formatMoney(t.target)} на продажах`;
    case 'taps':
      return `Сделай ${t.target} тапов ремонта`;
    case 'orders':
      return t.target === 1 ? 'Выполни заказ клиента' : `Выполни ${t.target} заказа клиентов`;
    case 'buyTier':
      return `Купи машину класса «${TIER_NAMES[t.param ?? 1]}» или выше`;
    case 'inspect':
      return `Осмотри ${t.target} объявления на рынке`;
    case 'fullRepair':
      return 'Полностью восстанови свою машину';
  }
};

export const taskDone = (t: DailyTask): boolean => t.progress >= t.target;

// ─── Достижения ───────────────────────────────────────────────────────────

/** Всё, по чему считаются достижения */
export interface AchievementStats {
  carsSold: number;
  level: number;
  bestMonthProfitCents: number;
  ordersDone: number;
  fullRepairs: number;
  branches: number;
  /** Сколько разных моделей класса уже продано */
  collected: Record<number, number>;
}

export interface Achievement {
  id: string;
  title: string;
  text: string;
  target: number;
  value: (s: AchievementStats) => number;
  rewardCents: number;
  /** Деньги показываются в долларах, остальное — числом */
  money?: boolean;
}

const $ = (d: number) => d * 100;

const series = (
  prefix: string,
  value: Achievement['value'],
  steps: [number, string, string, number][],
  money = false,
): Achievement[] =>
  steps.map(([target, title, text, reward]) => ({ id: `${prefix}_${target}`, title, text, target, value, rewardCents: $(reward), money }));

export const ACHIEVEMENTS: Achievement[] = [
  ...series('sales', (s) => s.carsSold, [
    [1, 'Первая сделка', 'Продай первую машину', 500],
    [10, 'Перекупщик', 'Продай 10 машин', 2_000],
    [50, 'Автодилер', 'Продай 50 машин', 10_000],
    [200, 'Король авторынка', 'Продай 200 машин', 50_000],
    [1000, 'Легенда рынка', 'Продай 1 000 машин', 250_000],
  ]),
  ...series('level', (s) => s.level, [
    [5, 'Новичок освоился', 'Достигни 5 уровня', 1_000],
    [10, 'Профи', 'Достигни 10 уровня', 3_000],
    [20, 'Эксперт', 'Достигни 20 уровня', 10_000],
    [35, 'Мастер', 'Достигни 35 уровня', 40_000],
    [50, 'Магнат', 'Достигни 50 уровня', 100_000],
    [75, 'Титан', 'Достигни 75 уровня', 300_000],
    [100, 'Легенда', 'Достигни 100 уровня', 1_000_000],
  ]),
  ...series(
    'month',
    (s) => s.bestMonthProfitCents,
    [
      [$(10_000), 'Хороший месяц', 'Заработай за месяц $10 000 чистыми', 2_000],
      [$(100_000), 'Отличный месяц', 'Заработай за месяц $100 000 чистыми', 20_000],
      [$(1_000_000), 'Месяц-миллионер', 'Заработай за месяц $1 000 000 чистыми', 200_000],
    ],
    true,
  ),
  ...series('orders', (s) => s.ordersDone, [
    [5, 'Сервис открыт', 'Выполни 5 заказов клиентов', 1_000],
    [25, 'Постоянные клиенты', 'Выполни 25 заказов клиентов', 5_000],
    [100, 'Сервис года', 'Выполни 100 заказов клиентов', 20_000],
  ]),
  ...series('repairs', (s) => s.fullRepairs, [
    [1, 'Как новая', 'Полностью восстанови свою машину', 500],
    [10, 'Золотые руки', 'Полностью восстанови 10 своих машин', 3_000],
    [50, 'Реставратор', 'Полностью восстанови 50 своих машин', 15_000],
  ]),
  ...series('branches', (s) => s.branches, [
    [1, 'Своя сеть', 'Открой первый филиал', 10_000],
    [3, 'Империя', 'Открой 3 филиала', 100_000],
  ]),
  // Собрать класс: продать каждую модель класса хотя бы раз; награда — средняя цена новой машины класса
  ...[1, 2, 3, 4, 5, 6].map(
    (tier): Achievement => ({
      id: `collection_${tier}`,
      title: `Коллекция «${TIER_NAMES[tier]}»`,
      text: `Продай каждую модель класса «${TIER_NAMES[tier]}» хотя бы раз`,
      target: CAR_MODELS_BY_TIER[tier].length,
      value: (s) => s.collected[tier] ?? 0,
      rewardCents: Math.round(avgBasePrice(tier) / 100) * 100 * 100,
    }),
  ),
];

/** Сколько разных моделей каждого класса продано (только модели из каталога) */
export const collectedByTier = (collection: Record<string, CollectionEntry>): Record<number, number> => {
  const out: Record<number, number> = {};
  for (const [tier, models] of Object.entries(CAR_MODELS_BY_TIER)) {
    out[Number(tier)] = models.filter((m) => (collection[m.name]?.sold ?? 0) > 0).length;
  }
  return out;
};

export const achievementReached = (a: Achievement, stats: AchievementStats): boolean => a.value(stats) >= a.target;
