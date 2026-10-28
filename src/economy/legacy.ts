/**
 * «Наследие» — перезапуск карьеры с постоянными бонусами.
 *
 * Хранится отдельно от экономики (ключ game_legacy): банкротство и «Новая игра» его не стирают,
 * они только записывают закончившуюся карьеру в историю. Очки наследия начисляются только при
 * перезапуске через «Наследие» и только за новую прибыль:
 *   всего очков = floor(10 × √(прибыль всех закрытых карьер / $1 000 000)),
 *   начисляется = всего − уже полученные.
 * Прибыль считается без денег, полученных от самого бонуса наследия.
 *
 * Бонусы действуют с начала следующей карьеры (очки фиксируются в экономике при её создании):
 *   множитель прибыли = min(10; 1 + 0,04P + 0,0015P²) — только к положительной марже продаж и заказов,
 *     отдельной строкой «Бонус наследия»;
 *   множитель опыта = min(2,5; 1 + 0,04P) — один раз к опыту продаж и восстановлений;
 *     месячный бонус XP считается от базового опыта продаж; за убытки опыта нет;
 *   стартовый капитал = $25 000 + min($250 000; $5 000 × P).
 */
import * as B from './balance.ts';

export type CareerEnd = 'legacy' | 'bankruptcy' | 'new_game';

export interface CareerRecord {
  /** Номер карьеры (1, 2, …) */
  number: number;
  careerId: string;
  end: CareerEnd;
  level: number;
  months: number;
  carsSold: number;
  /** Чистая прибыль карьеры без бонуса наследия */
  baseProfitCents: number;
  netWorthCents: number;
  branches: number;
  /** Очки, полученные при закрытии (только перезапуск через «Наследие») */
  pointsEarned: number;
  /** Очки наследия, с которыми карьера шла */
  pointsDuring: number;
}

export interface LegacyRecords {
  bestLevel: number;
  bestNetWorthCents: number;
  bestMonthProfitCents: number;
  maxBranches: number;
  totalCarsSold: number;
  totalMonths: number;
}

export interface LegacyState {
  version: 1;
  /** Карьер, закрытых перезапуском через «Наследие» */
  restarts: number;
  /** Всего карьер (включая банкротства и «Новую игру») */
  careers: number;
  pointsTotal: number;
  lifetimeBaseProfitCents: number;
  /** Карьеры, уже закрытые (защита от повторного начисления) */
  closedCareerIds: string[];
  history: CareerRecord[];
  records: LegacyRecords;
  /** Достижения и цели (id) */
  achievements: string[];
  /** Хоть одна карьера дошла до 100 уровня */
  reachedLevel100: boolean;
  /** Цель «Автомобильный концерн» */
  concern: { purchased: boolean; purchasedAtCareer: number | null };
}

export const LEGACY_HISTORY_LIMIT = 50;

export const createLegacy = (): LegacyState => ({
  version: 1,
  restarts: 0,
  careers: 0,
  pointsTotal: 0,
  lifetimeBaseProfitCents: 0,
  closedCareerIds: [],
  history: [],
  records: { bestLevel: 1, bestNetWorthCents: 0, bestMonthProfitCents: 0, maxBranches: 0, totalCarsSold: 0, totalMonths: 0 },
  achievements: [],
  reachedLevel100: false,
  concern: { purchased: false, purchasedAtCareer: null },
});

export const restoreLegacy = (raw: unknown): LegacyState => {
  const r = raw as Partial<LegacyState> | null | undefined;
  if (!r || r.version !== 1) return createLegacy();
  const base = createLegacy();
  return {
    ...base,
    ...r,
    records: { ...base.records, ...(r.records ?? {}) },
    concern: { ...base.concern, ...(r.concern ?? {}) },
    closedCareerIds: (r.closedCareerIds ?? []).slice(-200),
    history: (r.history ?? []).slice(-LEGACY_HISTORY_LIMIT),
    achievements: r.achievements ?? [],
  };
};

// ─── Формулы ───────────────────────────────────────────────────────────────

export const legacyPointsTotal = (lifetimeBaseProfitCents: number): number =>
  Math.floor(B.LEGACY_POINTS_SCALE * Math.sqrt(Math.max(0, lifetimeBaseProfitCents) / 100 / B.LEGACY_POINTS_PROFIT_UNIT));

export const legacyProfitMultiplier = (points: number): number =>
  Math.min(B.LEGACY_PROFIT_MAX, 1 + B.LEGACY_PROFIT_LINEAR * points + B.LEGACY_PROFIT_QUADRATIC * points * points);

export const legacyXpMultiplier = (points: number): number => Math.min(B.LEGACY_XP_MAX, 1 + B.LEGACY_XP_PER_POINT * points);

/** Прибавка к стартовому капиталу новой карьеры, $ */
export const legacyStartCash = (points: number): number =>
  Math.min(B.LEGACY_START_CASH_MAX, B.LEGACY_START_CASH_PER_POINT * Math.max(0, points));

/** Бонус наследия к положительной марже, центы (убыток бонуса не получает) */
export const legacyMarginBonusCents = (points: number, marginCents: number): number =>
  points > 0 && marginCents > 0 ? Math.round(marginCents * (legacyProfitMultiplier(points) - 1)) : 0;

// ─── Перезапуск ────────────────────────────────────────────────────────────

/** Итоги текущей карьеры — их считает экономика (economy.careerSummary) */
export interface CareerSummary {
  careerId: string;
  level: number;
  months: number;
  carsSold: number;
  baseProfitCents: number;
  netWorthCents: number;
  bestMonthProfitCents: number;
  branches: number;
  hasDebt: boolean;
  bankrupt: boolean;
  pointsDuring: number;
}

export interface RestartPreview {
  available: boolean;
  /** Почему недоступно */
  blocks: string[];
  pointsNow: number;
  pointsAfter: number;
  gain: number;
  profitMultNow: number;
  profitMultAfter: number;
  xpMultNow: number;
  xpMultAfter: number;
  /** Стартовый капитал следующей карьеры, $ (база + бонус очков) */
  startCashNow: number;
  startCashAfter: number;
  resets: string[];
  keeps: string[];
}

/** Стартовый капитал любой новой карьеры, $ */
export const BASE_START_CASH = 25_000;

export const RESETS = [
  'Деньги, кредит и все машины',
  'Гаражи и филиалы (снова Гараж 1)',
  'Оборудование и покрасочная камера',
  'Весь персонал и его прокачка',
  'Репутация автосервиса и заказы',
  'Уровень игрока и опыт',
  'Все пять навыков игрока',
];

export const KEEPS = [
  'Очки и бонусы наследия (в том числе прибавка к стартовому капиталу)',
  'Число карьер и история карьер',
  'Рекорды и статистика',
  'Достижения и цели (концерн)',
];

export const restartPreview = (legacy: LegacyState, career: CareerSummary): RestartPreview => {
  const blocks: string[] = [];
  if (career.level < B.LEGACY_MIN_LEVEL) blocks.push(`Нужен ${B.LEGACY_MIN_LEVEL} уровень (сейчас ${career.level})`);
  if (career.hasDebt) blocks.push('Сначала погаси кредит');
  if (career.bankrupt) blocks.push('Бизнес банкрот');
  if (career.netWorthCents < B.LEGACY_MIN_NET_WORTH * 100)
    blocks.push(`Стоимость бизнеса от $${B.LEGACY_MIN_NET_WORTH.toLocaleString('ru-RU')}`);
  if (legacy.closedCareerIds.includes(career.careerId)) blocks.push('Эта карьера уже закрыта');
  const pointsAfter = legacyPointsTotal(legacy.lifetimeBaseProfitCents + Math.max(0, career.baseProfitCents));
  const gain = Math.max(0, pointsAfter - legacy.pointsTotal);
  if (gain < 1 && blocks.length === 0) blocks.push('Прибыль этой карьеры пока не даёт новых очков');
  const total = legacy.pointsTotal + gain;
  return {
    available: blocks.length === 0,
    blocks,
    pointsNow: legacy.pointsTotal,
    pointsAfter: total,
    gain,
    profitMultNow: legacyProfitMultiplier(legacy.pointsTotal),
    profitMultAfter: legacyProfitMultiplier(total),
    xpMultNow: legacyXpMultiplier(legacy.pointsTotal),
    xpMultAfter: legacyXpMultiplier(total),
    startCashNow: BASE_START_CASH + legacyStartCash(legacy.pointsTotal),
    startCashAfter: BASE_START_CASH + legacyStartCash(total),
    resets: RESETS,
    keeps: KEEPS,
  };
};

const withRecords = (legacy: LegacyState, career: CareerSummary, end: CareerEnd, pointsEarned: number): LegacyState => {
  const record: CareerRecord = {
    number: legacy.careers + 1,
    careerId: career.careerId,
    end,
    level: career.level,
    months: career.months,
    carsSold: career.carsSold,
    baseProfitCents: career.baseProfitCents,
    netWorthCents: career.netWorthCents,
    branches: career.branches,
    pointsEarned,
    pointsDuring: career.pointsDuring,
  };
  const r = legacy.records;
  return {
    ...legacy,
    careers: legacy.careers + 1,
    closedCareerIds: [...legacy.closedCareerIds, career.careerId].slice(-200),
    history: [...legacy.history, record].slice(-LEGACY_HISTORY_LIMIT),
    reachedLevel100: legacy.reachedLevel100 || career.level >= 100,
    records: {
      bestLevel: Math.max(r.bestLevel, career.level),
      bestNetWorthCents: Math.max(r.bestNetWorthCents, career.netWorthCents),
      bestMonthProfitCents: Math.max(r.bestMonthProfitCents, career.bestMonthProfitCents),
      maxBranches: Math.max(r.maxBranches, career.branches),
      totalCarsSold: r.totalCarsSold + career.carsSold,
      totalMonths: r.totalMonths + career.months,
    },
  };
};

/** Перезапуск через «Наследие»: очки за новую прибыль, карьера в историю. Повтор для той же карьеры — без изменений */
export const applyRestart = (legacy: LegacyState, career: CareerSummary): LegacyState => {
  const preview = restartPreview(legacy, career);
  if (!preview.available) return legacy;
  const next = withRecords(legacy, career, 'legacy', preview.gain);
  return {
    ...next,
    restarts: legacy.restarts + 1,
    pointsTotal: preview.pointsAfter,
    lifetimeBaseProfitCents: legacy.lifetimeBaseProfitCents + Math.max(0, career.baseProfitCents),
  };
};

/** Карьера закончилась банкротством или «Новой игрой»: только история и рекорды, очки не начисляются */
export const recordCareerEnd = (legacy: LegacyState, career: CareerSummary, end: Exclude<CareerEnd, 'legacy'>): LegacyState =>
  legacy.closedCareerIds.includes(career.careerId) ? legacy : withRecords(legacy, career, end, 0);
