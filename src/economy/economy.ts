/**
 * Финансовое ядро игры: календарь, деньги, активы, зарплаты, увольнения, кредит, банкротство.
 *
 * Чистые функции без React и хранилища — их использует EconomyProvider и покрывают тесты
 * (economy.test.ts). Все суммы — в центах (целые числа), время — игровые миллисекунды
 * активной игры (gameTimeMs), которые идут только пока игра открыта и не на паузе.
 *
 * Модель учёта:
 * - balanceCents — только свободные деньги;
 * - активы — непроданные машины по себестоимости (покупка + прямые затраты);
 * - выручка и себестоимость признаются в момент продажи;
 * - зарплата начисляется по отработанному времени и выплачивается в конце месяца;
 * - кредит — обязательство, он не увеличивает прибыль и не даёт свободных денег.
 *
 * Здесь же хранится прогрессия (опыт игрока, навыки игрока и механиков): награды выдаются
 * в той же атомарной операции, что и деньги, поэтому XP не начисляется дважды.
 */

import * as P from './progression.ts';
import * as B from './balance.ts';
import * as O from './orders.ts';
import { randomSeed } from './hotOffers.ts';
import { pluralDays } from './format.ts';
import { rollBranchMonths, type BranchState } from './branchModel.ts';
import { legacyMarginBonusCents, legacyXpMultiplier, type CareerSummary } from './legacy.ts';
import { TIER_UNLOCK_LEVELS, TOTAL_TIERS } from '../data/carModels.ts';
import * as A from './auctions.ts';

// ─── Константы ─────────────────────────────────────────────────────────────

import { DAY_MS, DAYS_IN_MONTH, MONTH_MS } from './time.ts';
export { DAY_MS, DAYS_IN_MONTH, MONTH_MS };
export const LOAN_TERM_MONTHS = 6;
export const HISTORY_MONTHS = 12;
/**
 * Оклад механика ≈ 37,5% прироста стоимости, который он даёт за месяц при полной загрузке
 * на машинах своего допуска (balance.ts: mechanicBaseSalaryCents). Эконом — $290.
 */
export const MECHANIC_MONTHLY_SALARY_CENTS = B.mechanicBaseSalaryCents(1);

/** Профессии сотрудников: механик и маляр работают руками, управляющий ведёт филиал */
export type Profession = 'mechanic' | 'painter' | 'manager';

/** Базовый оклад (1 уровень) по профессии и допуску к классу */
export const baseSalaryCents = (profession: Profession = 'mechanic', clearance = 1): number =>
  profession === 'manager'
    ? B.MANAGER_BASE_SALARY_CENTS
    : profession === 'painter'
      ? B.painterBaseSalaryCents(clearance)
      : B.mechanicBaseSalaryCents(clearance);

/**
 * Оклад растёт вместе с производительностью: механик и маляр +5% за уровень навыка (как скорость),
 * управляющий — B.MANAGER_SALARY_STEP за уровень.
 */
export const salaryForLevel = (skillLevel: number, profession: Profession = 'mechanic', clearance = 1): number =>
  Math.round(
    baseSalaryCents(profession, clearance) *
      (profession === 'manager' ? 1 + B.MANAGER_SALARY_STEP * (skillLevel - 1) : P.skillMultiplier(skillLevel)),
  );

/** Оклад по текущему контракту: профессия, уровень и допуск */
export const contractSalary = (c: Contract): number => salaryForLevel(c.skill.level, c.profession, c.clearance ?? 1);
/** Сколько последних операций помнить для защиты от повторного применения */
const PROCESSED_OPS_LIMIT = 1000;
/** Минимальное время наблюдения, после которого показываем советы об эффективности */
export const ADVICE_MIN_OBSERVATION_MS = 6 * DAY_MS;

export const toCents = (dollars: number): number => Math.round(dollars * 100);
export const fromCents = (cents: number): number => cents / 100;

// ─── Типы ──────────────────────────────────────────────────────────────────

/** Отрезок работы механика по одной ставке (за текущий, ещё не выплаченный период) */
export interface SalarySegment {
  monthlyCents: number;
  fromMs: number;
  /** null — отрезок ещё идёт */
  toMs: number | null;
}

/** Трудовой контракт. Есть контракт — механик в штате. */
export interface Contract {
  mechanicId: string;
  contractId: string;
  hiredAtMs: number;
  monthlyCents: number;
  segments: SalarySegment[];
  /** Когда механик начал текущий ремонт (null — простаивает) */
  busySinceMs: number | null;
  /** Время ремонтов в текущем месяце, без идущего сейчас */
  busyMsMonth: number;
  jobsDoneMonth: number;
  jobsDoneTotal: number;
  /** Навык «Механик» сотрудника. Принадлежит контракту: увольнение сбрасывает его целиком. */
  skill: P.SkillState;
  /** До какого момента практика уже учтена в skill.practice (копится только во время ремонта) */
  practiceSyncedAtMs: number;
  /** Когда навык последний раз повысился — с этого момента действует новая скорость */
  levelChangedAtMs: number;
  /** Контракт из сохранения до системы навыков: уровень возьмётся из старых данных механика */
  legacySkillPending?: boolean;
  /** Профессия: механик (по умолчанию), маляр или управляющий. Навык, курсы и оклад — по профессии */
  profession?: Profession;
  /** Допуск к классам машин 1–6 (механик, маляр): выше допуска — работа вдвое медленнее. По умолчанию 1 */
  clearance?: number;
  /** Филиал, к которому прикреплён сотрудник (нет — основной гараж) */
  branchId?: string;
}

/** Непроданная машина по себестоимости */
export interface Asset {
  carId: string;
  name: string;
  tier?: number;
  purchaseCents: number;
  /** Прямые затраты на машину после покупки (ремонт, улучшения) */
  extraCostsCents: number;
  acquiredMonth: number;
  /** Сколько пунктов состояния не хватало до максимума при покупке */
  initialWearPct?: number;
  /** Бонус XP за первое полное восстановление уже выдан */
  fullRepairAwarded?: boolean;
}

export interface Loan {
  principalCents: number;
  issuedMonth: number;
  /** Последний месяц, в конце которого долг должен быть погашен */
  dueMonth: number;
}

/** Операции текущего месяца */
export interface MonthLedger {
  revenueCents: number;
  cogsCents: number;
  carsSold: number;
  carsBought: number;
  carPurchasesCents: number;
  /** Зарплата, уже выплаченная при увольнениях в этом месяце */
  firedSalaryCents: number;
  severanceCents: number;
  otherIncomeCents: number;
  otherExpenseCents: number;
  investmentsCents: number;
  loanTakenCents: number;
  loanRepaidCents: number;
  /** XP, полученный за продажи в этом месяце — база для месячного бонуса */
  salesXp: number;
  /** XP за полные ремонты в этом месяце (в бонус не входит) */
  repairXp: number;
  /** Оплата клиентов за выполненные заказы автосервиса */
  serviceRevenueCents: number;
  /** Детали и материалы для заказов клиентов */
  serviceCostsCents: number;
  /** Сторонняя диагностика объявлений */
  diagnosticsCents: number;
  /** Затраты на собственные машины (покраска): деньги ушли, но это себестоимость машины, а не расход месяца */
  carExtraCostsCents: number;
  /** Практика «Подборщика» за осмотры в этом месяце (лимит) */
  inspectPractice: number;
  /** Бонус наследия к положительной марже продаж и заказов */
  legacyBonusCents: number;
}

export interface MechanicMonthStat {
  mechanicId: string;
  salaryCents: number;
  loadPct: number | null;
  jobsDone: number;
}

export interface MonthReport extends MonthLedger {
  month: number;
  payrollCents: number;
  salaryCents: number;
  dealProfitCents: number;
  netProfitCents: number;
  balanceStartCents: number;
  balanceEndCents: number;
  loanEndCents: number;
  mechanics: MechanicMonthStat[];
  /** Бонус XP за прибыльный месяц */
  monthXp: number;
  /** Практика менеджмента за месяц */
  managementPractice: number;
}

export interface Bankruptcy {
  month: number;
  shortfallCents: number;
  debtCents: number;
  payrollCents: number;
}

export interface EconomyState {
  version: 1;
  completedMonths: number;
  balanceCents: number;
  monthStartBalanceCents: number;
  ledger: MonthLedger;
  contracts: Record<string, Contract>;
  assets: Record<string, Asset>;
  loan: Loan | null;
  history: MonthReport[];
  processedOps: string[];
  bankruptcy: Bankruptcy | null;
  totals: {
    carsSold: number;
    revenueCents: number;
    netProfitCents: number;
    /** Бонус наследия за всю карьеру (не входит в базу очков наследия) */
    legacyBonusCents: number;
    bestMonthProfitCents: number;
  };
  /** Контракты для механиков из сохранений до финансовой системы уже созданы */
  contractsMigrated: boolean;
  player: PlayerProgress;
  /** Опыт и навык игрока перенесены из сохранений до системы прогрессии */
  playerMigrated: boolean;
  /** Купленное оборудование и слот покрасочной камеры (null — камера не установлена) */
  equipment: EquipmentState;
  /** Заказы клиентов и репутация */
  orders: O.OrdersState;
  /** Последние начисления опыта (новые первыми) */
  xpLog: XpEntry[];
  /** Филиалы по id гаража (основной гараж сюда не входит) */
  branches: Record<string, BranchState>;
  /** Карьера: id для защиты от повторного закрытия в «Наследии» */
  careerId: string;
  /** Очки наследия, действующие в этой карьере (фиксируются при её создании) */
  legacyPoints: number;
  /** Классы, открытые до лестницы уровней (старое сохранение): остаются открытыми */
  grandfatheredTiers: number[];
  /** Версия лестницы уровней, по которой создано сохранение */
  ladderVersion: number;
  /** Аукцион на авторынке (с 30 уровня) */
  auction: A.AuctionState;
  /** Цель «Автомобильный концерн» куплена в этой карьере (дублируется в «Наследии») */
  concernPurchased?: boolean;
}

export interface XpEntry {
  month: number;
  amount: number;
  reason: string;
  /** Уровень после начисления */
  level: number;
}

export const XP_LOG_LIMIT = 20;

export interface EquipmentState {
  owned: B.EquipmentId[];
  boothSlot: number | null;
}

export const createEquipment = (): EquipmentState => ({ owned: ['basic_tools'], boothSlot: null });

export interface PlayerProgress {
  xp: P.PlayerXp;
  skill: P.SkillState;
  /** Навык «Менеджмент»: шанс горящих предложений, с 2 уровня — уведомления о них */
  management: P.SkillState;
  /** «Маляр»: ручная покраска в своей камере */
  painter: P.SkillState;
  /** «Подборщик»: точность своего сканера */
  picker: P.SkillState;
  /** «Торговля»: скидка при покупке и прибавка при продаже */
  trade: P.SkillState;
  /** Успешные ручные тапы ремонта за всё время */
  manualTaps: number;
}

export const createPlayerProgress = (): PlayerProgress => ({
  xp: P.createPlayerXp(),
  skill: P.createSkill(),
  management: P.createSkill(),
  painter: P.createSkill(),
  picker: P.createSkill(),
  trade: P.createSkill(),
  manualTaps: 0,
});

// ─── Создание состояния ────────────────────────────────────────────────────

export const emptyLedger = (): MonthLedger => ({
  revenueCents: 0,
  cogsCents: 0,
  carsSold: 0,
  carsBought: 0,
  carPurchasesCents: 0,
  firedSalaryCents: 0,
  severanceCents: 0,
  otherIncomeCents: 0,
  otherExpenseCents: 0,
  investmentsCents: 0,
  loanTakenCents: 0,
  loanRepaidCents: 0,
  salesXp: 0,
  repairXp: 0,
  serviceRevenueCents: 0,
  serviceCostsCents: 0,
  diagnosticsCents: 0,
  carExtraCostsCents: 0,
  inspectPractice: 0,
  legacyBonusCents: 0,
});

export const createEconomy = (
  balanceCents: number,
  contractsMigrated = true,
  playerMigrated = true,
  seed: number = randomSeed(),
  legacyPoints = 0,
): EconomyState => ({
  version: 1,
  completedMonths: 0,
  balanceCents,
  monthStartBalanceCents: balanceCents,
  ledger: emptyLedger(),
  contracts: {},
  assets: {},
  loan: null,
  history: [],
  processedOps: [],
  bankruptcy: null,
  totals: { carsSold: 0, revenueCents: 0, netProfitCents: 0, legacyBonusCents: 0, bestMonthProfitCents: 0 },
  contractsMigrated,
  player: createPlayerProgress(),
  playerMigrated,
  equipment: createEquipment(),
  orders: O.createOrdersState(seed, 0),
  xpLog: [],
  branches: {},
  careerId: `career-${(seed >>> 0).toString(36)}`,
  legacyPoints,
  grandfatheredTiers: [],
  ladderVersion: LADDER_VERSION,
  auction: A.createAuctionState(seed ^ 0x51ed27, 0),
});

export const LADDER_VERSION = 2;

/** Классы машин, открытые игроку: по уровню (лестница) плюс открытые в старом сохранении */
export const unlockedTiers = (s: Pick<EconomyState, 'player' | 'grandfatheredTiers'>): number[] =>
  Array.from({ length: TOTAL_TIERS }, (_, i) => i + 1).filter(
    (t) => s.player.xp.level >= (TIER_UNLOCK_LEVELS[t] ?? 0) || (s.grandfatheredTiers ?? []).includes(t),
  );

// ─── Календарь ─────────────────────────────────────────────────────────────

export const currentMonth = (s: EconomyState): number => s.completedMonths + 1;
export const monthStartMs = (s: EconomyState): number => s.completedMonths * MONTH_MS;
export const monthEndMs = (s: EconomyState): number => (s.completedMonths + 1) * MONTH_MS;

/** Зарплатный день: время дошло до конца месяца, а месяц ещё не закрыт */
export const isPaydayPending = (s: EconomyState, now: number): boolean =>
  !s.bankruptcy && now >= monthEndMs(s);

/** Продвигает игровое время на dt, не перескакивая через конец месяца */
export const advanceGameTime = (s: EconomyState, now: number, dtMs: number): number =>
  Math.min(now + Math.max(0, dtMs), monthEndMs(s));

export interface CalendarInfo {
  month: number;
  day: number;
  /** «ПН»…«ВС», неделя непрерывна через месяцы */
  weekday: string;
  msIntoMonth: number;
  msToPayday: number;
  monthProgress: number;
}

export const getCalendar = (s: EconomyState, now: number): CalendarInfo => {
  const msIntoMonth = Math.min(MONTH_MS, Math.max(0, now - monthStartMs(s)));
  const day = Math.min(DAYS_IN_MONTH, Math.floor(msIntoMonth / DAY_MS) + 1);
  return {
    month: currentMonth(s),
    day,
    weekday: P.weekdayOf(currentMonth(s), day),
    msIntoMonth,
    msToPayday: MONTH_MS - msIntoMonth,
    monthProgress: msIntoMonth / MONTH_MS,
  };
};

// ─── Зарплаты ──────────────────────────────────────────────────────────────

/**
 * Начисление за отрезок считается заново из времени, а не накапливается по тикам,
 * поэтому частота обновлений не влияет на сумму, а полный месяц даёт ровно оклад.
 */
const segmentCents = (seg: SalarySegment, now: number): number => {
  const end = seg.toMs ?? now;
  const ms = Math.max(0, Math.min(end, now) - seg.fromMs);
  return Math.round((seg.monthlyCents * ms) / MONTH_MS);
};

export const accruedSalaryCents = (c: Contract, now: number): number =>
  c.segments.reduce((sum, seg) => sum + segmentCents(seg, now), 0);

/** Начисленная, но ещё не выплаченная зарплата всего штата */
export const payrollCents = (s: EconomyState, now: number): number =>
  Object.values(s.contracts).reduce((sum, c) => sum + accruedSalaryCents(c, now), 0);

/** Сколько придётся заплатить в зарплатный день, если состав штата не изменится */
export const projectedPayrollCents = (s: EconomyState): number => payrollCents(s, monthEndMs(s));

export const startContract = (
  s: EconomyState,
  mechanicId: string,
  now: number,
  monthlyCents?: number,
  profession: Profession = 'mechanic',
): EconomyState => {
  if (s.contracts[mechanicId]) return s;
  monthlyCents = monthlyCents ?? salaryForLevel(1, profession, 1);
  const contract: Contract = {
    profession,
    mechanicId,
    contractId: `${mechanicId}@${now}`,
    hiredAtMs: now,
    monthlyCents,
    segments: [{ monthlyCents, fromMs: now, toMs: null }],
    busySinceMs: null,
    busyMsMonth: 0,
    jobsDoneMonth: 0,
    jobsDoneTotal: 0,
    skill: P.createSkill(),
    practiceSyncedAtMs: now,
    levelChangedAtMs: now,
  };
  return { ...s, contracts: { ...s.contracts, [mechanicId]: contract } };
};

/** Оклад каждого механика приводится к его уровню навыка с момента now (старые сохранения, смена баланса) */
export const syncSalariesWithSkill = (s: EconomyState, now: number): EconomyState => {
  let state = s;
  for (const c of Object.values(s.contracts)) {
    const target = contractSalary(c);
    if (c.monthlyCents !== target) state = changeSalary(state, c.mechanicId, target, now);
  }
  return state;
};

/** Новая ставка действует с момента изменения; прошлое время остаётся по старой */
export const changeSalary = (s: EconomyState, mechanicId: string, monthlyCents: number, now: number): EconomyState => {
  const c = s.contracts[mechanicId];
  if (!c || c.monthlyCents === monthlyCents) return s;
  const segments = c.segments.map((seg) => (seg.toMs === null ? { ...seg, toMs: now } : seg));
  segments.push({ monthlyCents, fromMs: now, toMs: null });
  return { ...s, contracts: { ...s.contracts, [mechanicId]: { ...c, monthlyCents, segments } } };
};

// ─── Загрузка механиков ────────────────────────────────────────────────────

/** Текущая практика механика: сохранённая + накопленная с последней синхронизации во время ремонта */
export const workerPracticeAt = (c: Contract, now: number): number =>
  c.skill.level >= P.SKILL_MAX_LEVEL || c.busySinceMs === null
    ? c.skill.practice
    : c.skill.practice + (P.WORKER_PRACTICE_PER_SEC * Math.max(0, now - c.practiceSyncedAtMs)) / 1000;

/**
 * Переносит практику, набранную ремонтом до момента until, в навык механика.
 * Переход уровня фиксируется в точный момент достижения порога: с него действует
 * новая скорость и новый оклад, а прошлое время оплачивается по старой ставке.
 */
export const syncWorkerSkill = (s: EconomyState, mechanicId: string, until: number): EconomyState => {
  const c = s.contracts[mechanicId];
  if (!c || c.busySinceMs === null || until <= c.practiceSyncedAtMs) return s;
  let skill = c.skill;
  let t = c.practiceSyncedAtMs;
  let segments = c.segments;
  let monthlyCents = c.monthlyCents;
  let levelChangedAtMs = c.levelChangedAtMs;

  while (skill.level < P.SKILL_MAX_LEVEL) {
    const need = P.requiredPractice(skill.level) - skill.practice;
    const crossAt = t + Math.ceil((need / P.WORKER_PRACTICE_PER_SEC) * 1000);
    if (crossAt > until) break;
    const overshoot = (P.WORKER_PRACTICE_PER_SEC * (crossAt - t)) / 1000 - need;
    skill = { ...skill, level: skill.level + 1, practice: Math.max(0, overshoot) };
    t = crossAt;
    levelChangedAtMs = crossAt;
    monthlyCents = salaryForLevel(skill.level, c.profession, c.clearance ?? 1);
    segments = [
      ...segments.map((seg) => (seg.toMs === null ? { ...seg, toMs: crossAt } : seg)),
      { monthlyCents, fromMs: crossAt, toMs: null },
    ];
  }
  if (skill.level < P.SKILL_MAX_LEVEL) {
    skill = { ...skill, practice: skill.practice + (P.WORKER_PRACTICE_PER_SEC * (until - t)) / 1000 };
  } else {
    skill = { ...skill, practice: 0 };
  }
  const updated: Contract = { ...c, skill, segments, monthlyCents, levelChangedAtMs, practiceSyncedAtMs: until };
  return { ...s, contracts: { ...s.contracts, [mechanicId]: updated } };
};

/** Есть механик, который уже набрал практику на новый уровень, но это ещё не зафиксировано */
export const hasPendingWorkerLevelUp = (s: EconomyState, now: number): boolean =>
  Object.values(s.contracts).some(
    (c) => c.profession !== 'manager' && c.skill.level < P.SKILL_MAX_LEVEL && workerPracticeAt(c, now) >= P.requiredPractice(c.skill.level),
  );

/** Практика управляющего за событие (заказ): уровень растёт сразу, новый оклад — с этого момента */
export const addWorkerPractice = (s: EconomyState, id: string, amount: number, now: number): EconomyState => {
  const c = s.contracts[id];
  if (!c || amount <= 0) return s;
  const skill = P.addPractice(c.skill, amount, workerCurve(c));
  let state: EconomyState = {
    ...s,
    contracts: { ...s.contracts, [id]: { ...c, skill, levelChangedAtMs: skill.level !== c.skill.level ? now : c.levelChangedAtMs } },
  };
  if (skill.level !== c.skill.level) state = changeSalary(state, id, salaryForLevel(skill.level, c.profession, c.clearance ?? 1), now);
  return state;
};

export const syncAllWorkers = (s: EconomyState, until: number): EconomyState =>
  Object.keys(s.contracts).reduce((state, id) => syncWorkerSkill(state, id, until), s);

export const setMechanicBusy = (s: EconomyState, mechanicId: string, busy: boolean, now: number): EconomyState => {
  const c = s.contracts[mechanicId];
  if (!c) return s;
  if (busy && c.busySinceMs === null) {
    return { ...s, contracts: { ...s.contracts, [mechanicId]: { ...c, busySinceMs: now, practiceSyncedAtMs: now } } };
  }
  if (!busy && c.busySinceMs !== null) {
    const synced = syncWorkerSkill(s, mechanicId, now).contracts[mechanicId];
    const from = Math.max(synced.busySinceMs ?? now, monthStartMs(s));
    const busyMsMonth = synced.busyMsMonth + Math.max(0, now - from);
    return { ...s, contracts: { ...s.contracts, [mechanicId]: { ...synced, busySinceMs: null, busyMsMonth } } };
  }
  return s;
};

/** Скорость автоматического ремонта механика: ×(1 + 5% за уровень) */
export const workerSpeedMultiplier = (c: Contract | undefined): number => P.skillMultiplier(c?.skill.level ?? 1);

/** Работа с машиной класса выше допуска сотрудника — медленнее (B.NO_CLEARANCE_SPEED) */
export const clearanceSpeedFactor = (c: Contract | undefined, carTier: number | undefined): number =>
  carTier !== undefined && carTier > (c?.clearance ?? 1) ? B.NO_CLEARANCE_SPEED : 1;

export const clearanceUpgradeCostCents = (c: Contract): number =>
  (c.clearance ?? 1) >= 6
    ? 0
    : B.CLEARANCE_UPGRADE_SALARIES * baseSalaryCents(c.profession, (c.clearance ?? 1) + 1);

/**
 * Повышение допуска сотрудника на один класс: разовая плата (расход «Обучение»), оклад растёт
 * с этого момента. Уже начисленная зарплата не пересчитывается.
 */
export const upgradeClearance = (s: EconomyState, id: string, now: number): OpResult => {
  const synced = syncWorkerSkill(s, id, now);
  const c = synced.contracts[id];
  if (!c || c.profession === 'manager' || (c.clearance ?? 1) >= 6) return { state: s, ok: false };
  const cost = clearanceUpgradeCostCents(c);
  const paid = spendOtherExpense(synced, cost);
  if (!paid.ok) return { state: s, ok: false };
  const updated: Contract = { ...c, clearance: (c.clearance ?? 1) + 1 };
  const state = { ...paid.state, contracts: { ...paid.state.contracts, [id]: updated } };
  return { ok: true, state: changeSalary(state, id, contractSalary(updated), now) };
};

export const recordMechanicJob = (s: EconomyState, mechanicId: string): EconomyState => {
  const c = s.contracts[mechanicId];
  if (!c) return s;
  const updated = { ...c, jobsDoneMonth: c.jobsDoneMonth + 1, jobsDoneTotal: c.jobsDoneTotal + 1 };
  return { ...s, contracts: { ...s.contracts, [mechanicId]: updated } };
};

export interface MechanicActivity {
  staffMs: number;
  busyMs: number;
  idleMs: number;
  /** Доля занятости от времени в штате в этом месяце; null — слишком рано считать */
  loadPct: number | null;
}

export const getMechanicActivity = (s: EconomyState, c: Contract, now: number): MechanicActivity => {
  const start = monthStartMs(s);
  const staffMs = Math.max(0, now - Math.max(c.hiredAtMs, start));
  const running = c.busySinceMs !== null ? Math.max(0, now - Math.max(c.busySinceMs, start)) : 0;
  const busyMs = Math.min(staffMs, c.busyMsMonth + running);
  return {
    staffMs,
    busyMs,
    idleMs: staffMs - busyMs,
    loadPct: staffMs > 0 ? busyMs / staffMs : null,
  };
};

// ─── Денежные операции ─────────────────────────────────────────────────────

export const isProcessed = (s: EconomyState, opId?: string) => !!opId && s.processedOps.includes(opId);

export const withProcessed = (s: EconomyState, opId?: string): EconomyState =>
  opId ? { ...s, processedOps: [...s.processedOps, opId].slice(-PROCESSED_OPS_LIMIT) } : s;

export interface OpResult {
  state: EconomyState;
  ok: boolean;
}

/** Начисление опыта с записью в журнал: за что и сколько */
const awardXp = (s: EconomyState, amount: number, reason = 'Опыт'): EconomyState => {
  if (!(amount > 0)) return s;
  const xp = P.addXp(s.player.xp, amount);
  const entry: XpEntry = { month: currentMonth(s), amount: Math.floor(amount), reason, level: xp.level };
  return { ...s, player: { ...s.player, xp }, xpLog: [entry, ...(s.xpLog ?? [])].slice(0, XP_LOG_LIMIT) };
};

// ─── Наследие: бонусы карьеры ─────────────────────────────────────────────

/** Опыт с множителем наследия (применяется один раз — к самой награде) */
export const legacyXp = (s: EconomyState, baseXp: number): number => Math.round(baseXp * legacyXpMultiplier(s.legacyPoints ?? 0));

/** Бонус наследия к положительной марже: отдельной строкой учёта, на баланс сразу */
export const creditLegacyBonus = (s: EconomyState, marginCents: number): EconomyState => {
  const bonus = legacyMarginBonusCents(s.legacyPoints ?? 0, marginCents);
  if (bonus <= 0) return s;
  return {
    ...s,
    balanceCents: s.balanceCents + bonus,
    ledger: { ...s.ledger, legacyBonusCents: s.ledger.legacyBonusCents + bonus },
    totals: { ...s.totals, legacyBonusCents: s.totals.legacyBonusCents + bonus },
  };
};

// ─── Навыки игрока: единая инфраструктура ─────────────────────────────────

export type SkillKey = 'mechanic' | 'painter' | 'picker' | 'trade' | 'management';

export const SKILL_CURVES: Record<SkillKey, P.PracticeCurve> = {
  mechanic: P.requiredPractice,
  painter: P.requiredPractice,
  picker: P.requiredPickerPractice,
  trade: P.requiredTradePractice,
  management: P.requiredManagementPractice,
};

export const playerSkill = (s: EconomyState, key: SkillKey): P.SkillState =>
  key === 'mechanic' ? s.player.skill : s.player[key];

const withPlayerSkill = (s: EconomyState, key: SkillKey, skill: P.SkillState): EconomyState =>
  key === 'mechanic' ? { ...s, player: { ...s.player, skill } } : { ...s, player: { ...s.player, [key]: skill } };

/** Практика навыку игрока (каждое событие начисляется вызывающей операцией ровно один раз) */
export const awardSkill = (s: EconomyState, key: SkillKey, amount: number): EconomyState =>
  amount > 0 ? withPlayerSkill(s, key, P.addPractice(playerSkill(s, key), amount, SKILL_CURVES[key])) : s;

const awardManagement = (s: EconomyState, amount: number): EconomyState => awardSkill(s, 'management', amount);

/** Списание свободных денег. Кредит здесь не используется — только реальный баланс. */
export const spend = (s: EconomyState, cents: number, apply: (l: MonthLedger) => MonthLedger, opId?: string): OpResult => {
  if (isProcessed(s, opId)) return { state: s, ok: true };
  if (cents < 0 || cents > s.balanceCents || s.bankruptcy) return { state: s, ok: false };
  const state = withProcessed({ ...s, balanceCents: s.balanceCents - cents, ledger: apply(s.ledger) }, opId);
  return { state, ok: true };
};

export const canAfford = (s: EconomyState, cents: number): boolean => !s.bankruptcy && cents <= s.balanceCents;

export interface CarPurchase {
  carId: string;
  name: string;
  tier?: number;
  priceCents: number;
  /** Состояние при покупке и максимально достижимое — для бонуса XP за полное восстановление */
  conditionPct?: number;
  maxConditionPct?: number;
}

const wearOf = (car: CarPurchase): number =>
  car.conditionPct !== undefined && car.maxConditionPct !== undefined
    ? Math.max(0, car.maxConditionPct - car.conditionPct)
    : 0;

/** Покупка машины: деньги уходят, машина становится активом (без расхода в прибыли) */
export const buyCar = (s: EconomyState, car: CarPurchase): OpResult => {
  const opId = `buy:${car.carId}`;
  const res = spend(s, car.priceCents, (l) => ({
    ...l,
    carsBought: l.carsBought + 1,
    carPurchasesCents: l.carPurchasesCents + car.priceCents,
  }), opId);
  if (!res.ok || s.assets[car.carId]) return res;
  const asset: Asset = {
    carId: car.carId,
    name: car.name,
    tier: car.tier,
    purchaseCents: car.priceCents,
    extraCostsCents: 0,
    acquiredMonth: currentMonth(s),
    initialWearPct: wearOf(car),
    fullRepairAwarded: false,
  };
  return { ...res, state: { ...res.state, assets: { ...res.state.assets, [car.carId]: asset } } };
};

/** Прямые затраты на конкретную машину увеличивают её себестоимость */
export const spendOnCar = (s: EconomyState, carId: string, cents: number, opId?: string): OpResult => {
  const asset = s.assets[carId];
  if (!asset) return { state: s, ok: false };
  const res = spend(s, cents, (l) => ({ ...l, carExtraCostsCents: l.carExtraCostsCents + cents }), opId);
  if (!res.ok || isProcessed(s, opId)) return res;
  const updated = { ...asset, extraCostsCents: asset.extraCostsCents + cents };
  return { ...res, state: { ...res.state, assets: { ...res.state.assets, [carId]: updated } } };
};

/** Возврат части затрат на машину (неиспользованные детали остановленного ремонта) — себестоимость уменьшается */
export const refundOnCar = (s: EconomyState, carId: string, cents: number, opId?: string): EconomyState => {
  const asset = s.assets[carId];
  if (!asset || cents <= 0 || isProcessed(s, opId) || s.bankruptcy) return s;
  const back = Math.min(cents, asset.extraCostsCents);
  if (back <= 0) return s;
  return withProcessed(
    {
      ...s,
      balanceCents: s.balanceCents + back,
      ledger: { ...s.ledger, carExtraCostsCents: s.ledger.carExtraCostsCents - back },
      assets: { ...s.assets, [carId]: { ...asset, extraCostsCents: asset.extraCostsCents - back } },
    },
    opId,
  );
};

export const assetCostCents = (a: Asset): number => a.purchaseCents + a.extraCostsCents;
export const assetsTotalCents = (s: EconomyState): number =>
  Object.values(s.assets).reduce((sum, a) => sum + assetCostCents(a), 0);

export interface CarSale {
  carId: string;
  priceCents: number;
  /** Себестоимость, если машины почему-то нет в активах (старые сохранения) */
  fallbackCostCents: number;
  tier?: number;
}

/** Продажа: на баланс приходит вся цена, прибыль = выручка − себестоимость. Повтор игнорируется. */
export const sellCar = (s: EconomyState, sale: CarSale): EconomyState => {
  const opId = `sale:${sale.carId}`;
  if (isProcessed(s, opId) || s.bankruptcy) return s;
  const asset = s.assets[sale.carId];
  const cost = asset ? assetCostCents(asset) : sale.fallbackCostCents;
  const purchase = asset ? asset.purchaseCents : sale.fallbackCostCents;
  // Месячный бонус XP считается от базового опыта продаж, наследие умножает только саму награду
  const baseXp = P.saleXp(asset?.tier ?? sale.tier, sale.priceCents, purchase, asset?.extraCostsCents ?? 0);
  const xp = legacyXp(s, baseXp);
  const practice = P.managementSalePractice(sale.priceCents, purchase, asset?.extraCostsCents ?? 0);
  const { [sale.carId]: _sold, ...assets } = s.assets;
  const withXp = awardXp(creditLegacyBonus({
    ...s,
    balanceCents: s.balanceCents + sale.priceCents,
    assets,
    ledger: {
      ...s.ledger,
      revenueCents: s.ledger.revenueCents + sale.priceCents,
      cogsCents: s.ledger.cogsCents + cost,
      carsSold: s.ledger.carsSold + 1,
      salesXp: s.ledger.salesXp + baseXp,
    },
    totals: {
      ...s.totals,
      carsSold: s.totals.carsSold + 1,
      revenueCents: s.totals.revenueCents + sale.priceCents,
    },
  }, sale.priceCents - cost), xp, `Продажа: ${asset?.name ?? 'машина'} (доходность ${purchase > 0 ? Math.round(((sale.priceCents - cost) / purchase) * 100) : 0}%)`);
  return withProcessed(awardSkill(awardManagement(withXp, practice), 'trade', practice), opId);
};

/** XP за первое полное восстановление конкретной машины — один раз за экземпляр */
export const awardFullRepair = (s: EconomyState, carId: string): EconomyState => {
  const asset = s.assets[carId];
  if (!asset || asset.fullRepairAwarded || s.bankruptcy) return s;
  const xp = legacyXp(s, P.fullRepairXp(asset.tier, asset.initialWearPct ?? 0));
  const marked: EconomyState = {
    ...s,
    assets: { ...s.assets, [carId]: { ...asset, fullRepairAwarded: true } },
    ledger: { ...s.ledger, repairXp: s.ledger.repairXp + xp },
  };
  return awardXp(marked, xp, `Полное восстановление: ${asset.name}`);
};

/** Машины из сохранений до финансовой системы попадают в активы по цене покупки */
export const ensureAssets = (s: EconomyState, cars: CarPurchase[]): EconomyState => {
  const changed = cars.filter((c) => !s.assets[c.carId] || s.assets[c.carId].initialWearPct === undefined);
  if (changed.length === 0) return s;
  const assets = { ...s.assets };
  for (const car of changed) {
    const existing = assets[car.carId];
    // Износ при покупке неизвестен — берём оставшийся до максимума сейчас
    assets[car.carId] = existing
      ? { ...existing, tier: existing.tier ?? car.tier, initialWearPct: wearOf(car), fullRepairAwarded: false }
      : {
          carId: car.carId,
          name: car.name,
          tier: car.tier,
          purchaseCents: car.priceCents,
          extraCostsCents: 0,
          acquiredMonth: currentMonth(s),
          initialWearPct: wearOf(car),
          fullRepairAwarded: false,
        };
  }
  return { ...s, assets };
};

/** Покупка гаража — вложение в бизнес, а не операционный расход месяца */
export const buyGarage = (s: EconomyState, cents: number): OpResult =>
  spend(s, cents, (l) => ({ ...l, investmentsCents: l.investmentsCents + cents }));

/** Прочие операционные расходы (например, обучение механика) */
export const spendOtherExpense = (s: EconomyState, cents: number): OpResult =>
  spend(s, cents, (l) => ({ ...l, otherExpenseCents: l.otherExpenseCents + cents }));

/** Прочие доходы (например, монетка из фонтана) */
export const earnOtherIncome = (s: EconomyState, cents: number): EconomyState => {
  if (cents <= 0 || s.bankruptcy) return s;
  return {
    ...s,
    balanceCents: s.balanceCents + cents,
    ledger: { ...s.ledger, otherIncomeCents: s.ledger.otherIncomeCents + cents },
  };
};

// ─── Навыки: тапы игрока и курсы ───────────────────────────────────────────

/** Сила ручного тапа ремонта: ×(1 + 5% за уровень навыка игрока) */
/** Сила ручного тапа ремонта: навык «Механик» × профессиональные инструменты */
export const playerTapMultiplier = (s: EconomyState): number => P.skillMultiplier(s.player.skill.level) * repairToolsMultiplier(s);

/** Успешный ручной тап — ровно 1 практика, независимо от того, сколько он починил */
export const recordPlayerTap = (s: EconomyState): EconomyState => {
  if (s.bankruptcy) return s;
  return {
    ...s,
    player: { ...s.player, skill: P.addPractice(s.player.skill, 1), manualTaps: s.player.manualTaps + 1 },
  };
};

export interface CourseOffer {
  costCents: number;
  preview: P.CoursePreview;
  affordable: boolean;
}

export const playerCourseOffer = (s: EconomyState, now: number): CourseOffer => {
  const costCents = toCents(P.playerCourseCost(s.player.skill.level));
  return { costCents, preview: P.previewCourse(s.player.skill, now), affordable: canAfford(s, costCents) };
};

/** Курс игрока: оплата только свободными деньгами, расход месяца, без XP */
export const buyPlayerCourse = (s: EconomyState, now: number): OpResult => {
  const offer = playerCourseOffer(s, now);
  const skill = P.applyCourse(s.player.skill, now);
  if (!offer.preview.available || !skill) return { state: s, ok: false };
  const paid = spendOtherExpense(s, offer.costCents);
  if (!paid.ok) return paid;
  return { ok: true, state: { ...paid.state, player: { ...paid.state.player, skill } } };
};

export const managementCourseOffer = (s: EconomyState, now: number): CourseOffer => {
  const costCents = toCents(P.playerCourseCost(s.player.management.level));
  return {
    costCents,
    preview: P.previewCourse(s.player.management, now, P.requiredManagementPractice),
    affordable: canAfford(s, costCents),
  };
};

/** Курс менеджмента: те же правила и цена, что у курса «Механика», перезарядка своя */
export const buyManagementCourse = (s: EconomyState, now: number): OpResult => {
  const offer = managementCourseOffer(s, now);
  const management = P.applyCourse(s.player.management, now, P.requiredManagementPractice);
  if (!offer.preview.available || !management) return { state: s, ok: false };
  const paid = spendOtherExpense(s, offer.costCents);
  if (!paid.ok) return paid;
  return { ok: true, state: { ...paid.state, player: { ...paid.state.player, management } } };
};

/** Кривая практики сотрудника: у управляющего своя (практика за заказы), у механика и маляра — общая */
export const workerCurve = (c: Pick<Contract, 'profession'>): P.PracticeCurve =>
  c.profession === 'manager' ? P.requiredManagerPractice : P.requiredPractice;

export const workerCourseOffer = (s: EconomyState, mechanicId: string, now: number): CourseOffer | null => {
  const synced = syncWorkerSkill(s, mechanicId, now);
  const c = synced.contracts[mechanicId];
  if (!c) return null;
  const costCents = toCents(P.workerCourseCost(c.monthlyCents, c.skill.level));
  const skill = { ...c.skill, practice: workerPracticeAt(c, now) };
  return { costCents, preview: P.previewCourse(skill, now, workerCurve(c)), affordable: canAfford(s, costCents) };
};

/** Курс механика: при переходе уровня новая скорость и оклад действуют с этого момента */
export const buyWorkerCourse = (s: EconomyState, mechanicId: string, now: number): OpResult => {
  const offer = workerCourseOffer(s, mechanicId, now);
  if (!offer || !offer.preview.available) return { state: s, ok: false };
  const synced = syncWorkerSkill(s, mechanicId, now);
  const c = synced.contracts[mechanicId];
  const skill = P.applyCourse(c.skill, now, workerCurve(c));
  if (!skill) return { state: s, ok: false };
  const paid = spendOtherExpense(synced, offer.costCents);
  if (!paid.ok) return { state: s, ok: false };
  let state: EconomyState = {
    ...paid.state,
    contracts: {
      ...paid.state.contracts,
      [mechanicId]: {
        ...c,
        skill,
        practiceSyncedAtMs: now,
        levelChangedAtMs: skill.level !== c.skill.level ? now : c.levelChangedAtMs,
      },
    },
  };
  if (skill.level !== c.skill.level) state = changeSalary(state, mechanicId, salaryForLevel(skill.level, c.profession, c.clearance ?? 1), now);
  return { state, ok: true };
};

// ─── Кредит ────────────────────────────────────────────────────────────────

/** Кредит только покрывает обязательные выплаты: свободных денег он не добавляет */
const borrow = (s: EconomyState, cents: number): EconomyState => {
  if (cents <= 0) return s;
  const month = currentMonth(s);
  // Один кредит: новый недостаток добавляется к долгу, срок не продлевается.
  // Взят в месяце 3 (например, при его закрытии) → гасить до конца месяца 9: месяцы 4–9.
  const loan: Loan = s.loan
    ? { ...s.loan, principalCents: s.loan.principalCents + cents }
    : { principalCents: cents, issuedMonth: month, dueMonth: month + LOAN_TERM_MONTHS };
  return { ...s, loan, ledger: { ...s.ledger, loanTakenCents: s.ledger.loanTakenCents + cents } };
};

export const maxRepayCents = (s: EconomyState): number =>
  s.loan ? Math.min(s.balanceCents, s.loan.principalCents) : 0;

export const repayLoan = (s: EconomyState, cents: number): OpResult => {
  if (!s.loan || s.bankruptcy) return { state: s, ok: false };
  const amount = Math.min(Math.max(0, Math.floor(cents)), maxRepayCents(s));
  if (amount <= 0) return { state: s, ok: false };
  const principalCents = s.loan.principalCents - amount;
  return {
    ok: true,
    state: {
      ...s,
      balanceCents: s.balanceCents - amount,
      loan: principalCents > 0 ? { ...s.loan, principalCents } : null,
      ledger: { ...s.ledger, loanRepaidCents: s.ledger.loanRepaidCents + amount },
    },
  };
};

/** Сколько полных месяцев осталось на погашение, включая текущий */
export const loanMonthsLeft = (s: EconomyState): number =>
  s.loan ? Math.max(0, s.loan.dueMonth - currentMonth(s) + 1) : 0;

// ─── Увольнение ────────────────────────────────────────────────────────────

export interface FirePreview {
  accruedCents: number;
  compensationCents: number;
  totalCents: number;
  fromBalanceCents: number;
  loanCents: number;
}

export const previewFire = (s: EconomyState, mechanicId: string, now: number): FirePreview | null => {
  const c = s.contracts[mechanicId];
  if (!c) return null;
  const accruedCents = accruedSalaryCents(c, now);
  const compensationCents = c.monthlyCents;
  const totalCents = accruedCents + compensationCents;
  const fromBalanceCents = Math.min(s.balanceCents, totalCents);
  return { accruedCents, compensationCents, totalCents, fromBalanceCents, loanCents: totalCents - fromBalanceCents };
};

/** Увольнение: долг по зарплате + один оклад компенсации; недостающее покрывает кредит */
export const fireMechanic = (s: EconomyState, mechanicId: string, now: number): OpResult => {
  const preview = previewFire(s, mechanicId, now);
  if (!preview || s.bankruptcy) return { state: s, ok: false };
  const { [mechanicId]: _fired, ...contracts } = s.contracts;
  let state: EconomyState = {
    ...s,
    contracts,
    balanceCents: s.balanceCents - preview.fromBalanceCents,
    ledger: {
      ...s.ledger,
      firedSalaryCents: s.ledger.firedSalaryCents + preview.accruedCents,
      severanceCents: s.ledger.severanceCents + preview.compensationCents,
    },
  };
  state = borrow(state, preview.loanCents);
  return { state, ok: true };
};

// ─── Итоги месяца ──────────────────────────────────────────────────────────

export interface MonthResult {
  revenueCents: number;
  cogsCents: number;
  dealProfitCents: number;
  salaryCents: number;
  severanceCents: number;
  otherIncomeCents: number;
  otherExpenseCents: number;
  investmentsCents: number;
  /** Заказы автосервиса: оплата клиентов и детали */
  serviceRevenueCents: number;
  serviceCostsCents: number;
  serviceProfitCents: number;
  diagnosticsCents: number;
  legacyBonusCents: number;
  netProfitCents: number;
  carsSold: number;
}

/** Прибыль месяца на момент now: зарплата — начисленная (выплаченная при увольнениях + текущий долг) */
export const getMonthResult = (s: EconomyState, now: number): MonthResult => {
  const l = s.ledger;
  const dealProfitCents = l.revenueCents - l.cogsCents;
  const salaryCents = l.firedSalaryCents + payrollCents(s, now);
  return {
    revenueCents: l.revenueCents,
    cogsCents: l.cogsCents,
    dealProfitCents,
    salaryCents,
    severanceCents: l.severanceCents,
    otherIncomeCents: l.otherIncomeCents,
    otherExpenseCents: l.otherExpenseCents,
    investmentsCents: l.investmentsCents,
    serviceRevenueCents: l.serviceRevenueCents,
    serviceCostsCents: l.serviceCostsCents,
    serviceProfitCents: l.serviceRevenueCents - l.serviceCostsCents,
    diagnosticsCents: l.diagnosticsCents,
    legacyBonusCents: l.legacyBonusCents,
    netProfitCents:
      l.legacyBonusCents +
      dealProfitCents +
      (l.serviceRevenueCents - l.serviceCostsCents) -
      salaryCents -
      l.severanceCents -
      l.otherExpenseCents -
      l.diagnosticsCents +
      l.otherIncomeCents,
    carsSold: l.carsSold,
  };
};

export interface ClosePreview {
  month: number;
  payrollCents: number;
  /** Сколько зарплаты оплатится свободными деньгами */
  cashForPayrollCents: number;
  /** Недостаток на зарплату, который покроет кредит (не в последний месяц кредита) */
  loanNeededCents: number;
  /** Последний месяц кредита: долг нужно погасить целиком */
  isLoanDeadline: boolean;
  /** Погашение кредита, которое будет выполнено */
  repayCents: number;
  maxRepayCents: number;
  balanceAfterCents: number;
  loanAfterCents: number;
  /** false — денег не хватает, при закрытии наступит банкротство */
  canContinue: boolean;
  shortfallCents: number;
}

export const previewClose = (s: EconomyState, requestedRepayCents: number): ClosePreview => {
  const month = currentMonth(s);
  const payroll = payrollCents(s, monthEndMs(s));
  const debt = s.loan?.principalCents ?? 0;
  const isLoanDeadline = !!s.loan && s.loan.dueMonth <= month;

  if (isLoanDeadline) {
    const needed = payroll + debt;
    const canContinue = s.balanceCents >= needed;
    return {
      month,
      payrollCents: payroll,
      cashForPayrollCents: Math.min(s.balanceCents, payroll),
      loanNeededCents: 0,
      isLoanDeadline,
      repayCents: debt,
      maxRepayCents: debt,
      balanceAfterCents: canContinue ? s.balanceCents - needed : 0,
      loanAfterCents: canContinue ? 0 : debt,
      canContinue,
      shortfallCents: Math.max(0, needed - s.balanceCents),
    };
  }

  const cashForPayrollCents = Math.min(s.balanceCents, payroll);
  const loanNeededCents = payroll - cashForPayrollCents;
  const balanceAfterPayroll = s.balanceCents - cashForPayrollCents;
  const maxRepay = Math.min(balanceAfterPayroll, debt);
  const repayCents = Math.min(Math.max(0, Math.floor(requestedRepayCents)), maxRepay);
  return {
    month,
    payrollCents: payroll,
    cashForPayrollCents,
    loanNeededCents,
    isLoanDeadline,
    repayCents,
    maxRepayCents: maxRepay,
    balanceAfterCents: balanceAfterPayroll - repayCents,
    loanAfterCents: debt + loanNeededCents - repayCents,
    canContinue: true,
    shortfallCents: 0,
  };
};

export type CloseOutcome = 'noop' | 'closed' | 'bankrupt';

/**
 * Закрытие месяца: выплата зарплат, кредит при нехватке, погашение, отчёт в историю.
 * Работает только в зарплатный день и переводит календарь на следующий месяц,
 * поэтому повторный вызов ничего не делает — месяц закрывается ровно один раз.
 */
export const closeMonth = (
  s0: EconomyState,
  now: number,
  requestedRepayCents: number,
): { state: EconomyState; outcome: CloseOutcome } => {
  if (!isPaydayPending(s0, now)) return { state: s0, outcome: 'noop' };
  const end = monthEndMs(s0);
  // Практика и повышения механиков до конца месяца должны попасть в его зарплату
  const s = syncAllWorkers(s0, end);
  const preview = previewClose(s, requestedRepayCents);

  if (!preview.canContinue) {
    const bankruptcy: Bankruptcy = {
      month: preview.month,
      shortfallCents: preview.shortfallCents,
      debtCents: s.loan?.principalCents ?? 0,
      payrollCents: preview.payrollCents,
    };
    // В итоги бизнеса попадает и последний, незакрытый месяц
    const lastMonth = getMonthResult(s, end);
    const totals = { ...s.totals, netProfitCents: s.totals.netProfitCents + lastMonth.netProfitCents };
    return { state: { ...s, bankruptcy, totals }, outcome: 'bankrupt' };
  }

  const mechanics: MechanicMonthStat[] = Object.values(s.contracts).map((c) => ({
    mechanicId: c.mechanicId,
    salaryCents: accruedSalaryCents(c, end),
    loadPct: getMechanicActivity(s, c, end).loadPct,
    jobsDone: c.jobsDoneMonth,
  }));
  const result = getMonthResult(s, end);

  let state: EconomyState = { ...s, balanceCents: s.balanceCents - preview.cashForPayrollCents };
  if (!preview.isLoanDeadline) state = borrow(state, preview.loanNeededCents);
  if (preview.repayCents > 0) state = repayLoan(state, preview.repayCents).state;

  // Бонус за прибыльный месяц: от XP продаж этого месяца, ремонт в базу не входит
  const bonusXp = P.monthXp(result.netProfitCents, s.ledger.salesXp);
  state = awardXp(state, bonusXp, `Прибыльный месяц ${preview.month}`);
  // Практика менеджмента за прибыльный месяц — тоже ровно один раз, вместе с закрытием
  const managementPractice = P.managementMonthPractice(result.netProfitCents);
  state = awardManagement(state, managementPractice);

  const ledger = state.ledger;
  const report: MonthReport = {
    ...ledger,
    month: preview.month,
    payrollCents: preview.payrollCents,
    salaryCents: result.salaryCents,
    dealProfitCents: result.dealProfitCents,
    netProfitCents: result.netProfitCents,
    balanceStartCents: s.monthStartBalanceCents,
    balanceEndCents: state.balanceCents,
    loanEndCents: state.loan?.principalCents ?? 0,
    mechanics,
    monthXp: bonusXp,
    managementPractice,
  };

  // Филиалы: оклады их сотрудников за месяц, загрузка слотов, история отчётов
  const branchSalaries: Record<string, number> = {};
  for (const c of Object.values(s.contracts)) {
    if (c.branchId) branchSalaries[c.branchId] = (branchSalaries[c.branchId] ?? 0) + accruedSalaryCents(c, end);
  }
  const branches = rollBranchMonths(s.branches ?? {}, branchSalaries, monthStartMs(s), end, preview.month + 1);

  // Новый период: начисления начинаются заново с конца месяца по текущей ставке
  const contracts: Record<string, Contract> = {};
  for (const c of Object.values(state.contracts)) {
    contracts[c.mechanicId] = {
      ...c,
      segments: [{ monthlyCents: c.monthlyCents, fromMs: end, toMs: null }],
      busyMsMonth: 0,
      jobsDoneMonth: 0,
    };
  }

  state = {
    ...state,
    contracts,
    branches,
    completedMonths: s.completedMonths + 1,
    monthStartBalanceCents: state.balanceCents,
    ledger: emptyLedger(),
    history: [...s.history, report].slice(-HISTORY_MONTHS),
    totals: {
      ...state.totals,
      netProfitCents: state.totals.netProfitCents + result.netProfitCents,
      bestMonthProfitCents: Math.max(state.totals.bestMonthProfitCents ?? 0, result.netProfitCents),
    },
  };
  return { state, outcome: 'closed' };
};

// ─── Аукцион ───────────────────────────────────────────────────────────────

export const auctionEnabled = (s: EconomyState): boolean => s.player.xp.level >= B.LADDER.auctions;

export const advanceAuction = (s: EconomyState, now: number, sample: A.AuctionContext['sample']): EconomyState => {
  if (s.bankruptcy) return s;
  const auction = A.advanceAuction(s.auction, now, { enabled: auctionEnabled(s), unlockedTiers: unlockedTiers(s), sample });
  return auction === s.auction ? s : { ...s, auction };
};

export const auctionBid = (s: EconomyState, now: number): OpResult => {
  if (s.bankruptcy || !auctionEnabled(s)) return { state: s, ok: false };
  const auction = A.placeBid(s.auction, now, s.balanceCents);
  return auction === s.auction ? { state: s, ok: false } : { ok: true, state: { ...s, auction } };
};

/** Выкуп выигранного лота: обычная покупка машины по цене ставки (место в гараже проверяет гараж) */
export const claimAuctionLot = (s: EconomyState, now: number): OpResult => {
  const lot = s.auction.current;
  if (!lot || lot.status !== 'won' || (lot.claimUntilMs !== undefined && now > lot.claimUntilMs)) return { state: s, ok: false };
  const bought = buyCar(s, {
    carId: lot.car.id,
    name: lot.car.name,
    tier: lot.tier,
    priceCents: lot.currentCents,
    conditionPct: lot.car.condition,
    maxConditionPct: lot.car.maxCondition,
  });
  if (!bought.ok) return bought;
  return { ok: true, state: { ...bought.state, auction: A.markClaimed(bought.state.auction) } };
};

// ─── Цель «Автомобильный концерн» ──────────────────────────────────────────

/**
 * Покупка концерна: вложение из свободных денег, один раз. Условия «Наследия» (100 уровень,
 * перезапуски, очки) проверяет вызывающий (concern.ts) — здесь только то, что знает экономика.
 */
export const buyConcern = (s: EconomyState): OpResult => {
  if (s.concernPurchased || s.loan || s.bankruptcy) return { state: s, ok: false };
  if (Object.keys(s.branches ?? {}).length < B.CONCERN_MIN_BRANCHES) return { state: s, ok: false };
  const cost = toCents(B.CONCERN_PRICE);
  const paid = spend(s, cost, (l) => ({ ...l, investmentsCents: l.investmentsCents + cost }), 'concern');
  if (!paid.ok) return paid;
  return { ok: true, state: { ...paid.state, concernPurchased: true } };
};

// ─── Продвинутое оборудование ──────────────────────────────────────────────

/** Доля материалов своей покраски: компьютерный подбор краски — на треть дешевле */
export const ownPaintMaterialsShare = (s: EconomyState): number =>
  B.OWN_PAINT_MATERIALS_SHARE * (hasEquipment(s, 'paint_matching') ? B.PAINT_MATCHING_FACTOR : 1);

/** Скорость работы по клиентской машине: стапель ускоряет кузовной ремонт */
export const clientWorkMultiplier = (s: EconomyState, orderId: string | undefined): number => {
  if (!orderId || !hasEquipment(s, 'body_frame')) return 1;
  const o = s.orders.active.find((x) => x.id === orderId);
  return o?.kind === 'service' && o.type === 'body' ? B.BODY_FRAME_SPEED : 1;
};

/** Мест на коммерческой стоянке */
export const parkingSpots = (s: EconomyState): number => (hasEquipment(s, 'parking') ? B.PARKING_SPOTS : 0);

// ─── Итоги карьеры (для «Наследия») ────────────────────────────────────────

/** Чистая прибыль карьеры без бонуса наследия: закрытые месяцы + текущий на момент now */
export const careerBaseProfitCents = (s: EconomyState, now: number): number =>
  s.totals.netProfitCents + getMonthResult(s, now).netProfitCents - (s.totals.legacyBonusCents ?? 0);

/**
 * Стоимость бизнеса: свободные деньги + машины по себестоимости + гаражи (их цены передаёт вызывающий)
 * + оборудование + вложения в филиалы − кредит − начисленная зарплата.
 */
export const businessValueCents = (s: EconomyState, now: number, garagesValueCents: number): number => {
  const equipment = s.equipment.owned.reduce((sum, id) => sum + toCents(B.EQUIPMENT.find((e) => e.id === id)?.price ?? 0), 0);
  const branches = Object.values(s.branches ?? {}).reduce((sum, b) => {
    let v = toCents(B.BRANCH_OPEN_COST[b.garageId] ?? 0);
    for (let k = 2; k <= b.slots.length; k++) v += toCents(B.branchSlotCost(k));
    return sum + v;
  }, 0);
  return s.balanceCents + assetsTotalCents(s) + garagesValueCents + equipment + branches - (s.loan?.principalCents ?? 0) - payrollCents(s, now);
};

export const careerSummary = (s: EconomyState, now: number, garagesValueCents: number): CareerSummary => ({
  careerId: s.careerId,
  level: s.player.xp.level,
  months: s.completedMonths + 1,
  carsSold: s.totals.carsSold,
  baseProfitCents: careerBaseProfitCents(s, now),
  netWorthCents: businessValueCents(s, now, garagesValueCents),
  bestMonthProfitCents: s.totals.bestMonthProfitCents ?? 0,
  branches: Object.keys(s.branches ?? {}).length,
  hasDebt: !!s.loan,
  bankrupt: !!s.bankruptcy,
  pointsDuring: s.legacyPoints ?? 0,
});

// ─── Советы ────────────────────────────────────────────────────────────────

export interface AdviceInput {
  now: number;
  mechanicNames: Record<string, string>;
  /** Пустые места под машины в гараже */
  emptySlots: number;
  /** Машины, которые ещё можно чинить, но их никто не ремонтирует */
  carsAwaitingRepair: number;
}

export interface Advice {
  id: string;
  level: 'info' | 'warning' | 'danger';
  text: string;
}

const money = (cents: number) => `$${Math.round(cents / 100).toLocaleString('ru-RU')}`;

/** Советы только по реальным измеримым данным, без случайностей */
export const buildAdvice = (s: EconomyState, input: AdviceInput): Advice[] => {
  const { now } = input;
  const advice: Advice[] = [];
  const cal = getCalendar(s, now);

  if (cal.msToPayday <= 60_000 && cal.msToPayday > 0) {
    const projected = projectedPayrollCents(s);
    const days = pluralDays(Math.ceil(cal.msToPayday / DAY_MS));
    if (projected > s.balanceCents) {
      advice.push({
        id: 'payday-short',
        level: 'danger',
        text: `До зарплатного дня ${days}. Не хватает ${money(projected - s.balanceCents)} — недостающее покроет кредит.`,
      });
    } else if (projected > 0) {
      advice.push({ id: 'payday-soon', level: 'info', text: `До зарплатного дня ${days}. Денег на выплату хватает.` });
    }
  }

  for (const c of Object.values(s.contracts)) {
    if (c.profession === 'manager') continue;
    const activity = getMechanicActivity(s, c, now);
    if (activity.staffMs < ADVICE_MIN_OBSERVATION_MS || activity.loadPct === null) continue;
    if (activity.loadPct < 0.5) {
      const idlePct = Math.round((1 - activity.loadPct) * 100);
      const name = input.mechanicNames[c.mechanicId] ?? 'Механик';
      advice.push({
        id: `idle-${c.mechanicId}`,
        level: 'warning',
        text: `${name} простаивал ${idlePct}% времени в этом месяце. Возможно, механиков больше, чем работы.`,
      });
    }
  }

  const result = getMonthResult(s, now);
  if (cal.msIntoMonth >= MONTH_MS / 3 && result.salaryCents > 0 && result.salaryCents > result.dealProfitCents) {
    advice.push({
      id: 'payroll-over-profit',
      level: 'warning',
      text: `Зарплаты (${money(result.salaryCents)}) превышают прибыль от сделок (${money(result.dealProfitCents)}).`,
    });
  }

  if (
    input.carsAwaitingRepair > 0 &&
    Object.values(s.contracts).some((c) => !c.branchId && c.profession !== 'manager' && c.busySinceMs === null)
  ) {
    advice.push({
      id: 'idle-capacity',
      level: 'info',
      text: 'Есть свободный механик и машины, которые можно отремонтировать.',
    });
  }

  if (input.emptySlots > 0) {
    advice.push({
      id: 'empty-slots',
      level: 'info',
      text: `В гараже свободных мест: ${input.emptySlots}. Можно купить ещё машины на перепродажу.`,
    });
  }

  const last = s.history.slice(-2);
  if (last.length === 2 && last.every((m) => m.netProfitCents < 0)) {
    advice.push({ id: 'loss-streak', level: 'danger', text: 'Вы работаете в убыток второй месяц подряд.' });
  }

  if (s.loan) {
    const left = loanMonthsLeft(s);
    advice.push({
      id: 'loan-due',
      level: left <= 1 ? 'danger' : 'warning',
      text: left <= 1
        ? `Это последний месяц кредита: в конце месяца нужно вернуть ${money(s.loan.principalCents)}, иначе банкротство.`
        : `До погашения кредита осталось ${left} мес. Долг: ${money(s.loan.principalCents)}.`,
    });
  }

  return advice;
};

// ─── Перенос старых сохранений ─────────────────────────────────────────────

/** Уровень по старой формуле опыта: с 0, каждый уровень стоил 1000 × уровень (минимум 1000) */
const legacyLevelFromXp = (totalXp: number): { level: number; fraction: number } => {
  let level = 0;
  let rest = Math.max(0, totalXp);
  while (rest >= Math.max(level, 1) * 1000) {
    rest -= Math.max(level, 1) * 1000;
    level += 1;
  }
  return { level, fraction: rest / (Math.max(level, 1) * 1000) };
};

/**
 * Опыт и навык игрока из сохранений до системы прогрессии. Уровень сохраняется
 * (тиры и гаражи открывались по нему), доля прогресса внутри уровня переносится.
 */
export const migrateLegacyPlayer = (
  s: EconomyState,
  legacy: { totalXp: number | null; skillLevel: number | null },
): EconomyState => {
  if (s.playerMigrated) return s;
  const { level: oldLevel, fraction } = legacyLevelFromXp(legacy.totalXp ?? 0);
  const level = Math.max(1, oldLevel);
  const xp: P.PlayerXp = { level, xp: Math.floor(fraction * P.requiredXp(level)), totalXp: Math.max(0, legacy.totalXp ?? 0) };
  return {
    ...s,
    player: { ...s.player, xp, skill: P.createSkill(legacy.skillLevel ?? 1) },
    playerMigrated: true,
  };
};

/** Уровень навыка механика из старых данных гаража (бывшая прокачка за $500) */
export const initLegacyWorkerSkill = (s: EconomyState, mechanicId: string, level: number, now: number): EconomyState => {
  const c = s.contracts[mechanicId];
  if (!c || !c.legacySkillPending) return s;
  const updated: Contract = { ...c, skill: P.createSkill(level), legacySkillPending: false, levelChangedAtMs: now };
  return syncSalariesWithSkill({ ...s, contracts: { ...s.contracts, [mechanicId]: updated } }, now);
};

// ─── Оборудование ──────────────────────────────────────────────────────────

export const hasEquipment = (s: EconomyState, id: B.EquipmentId): boolean => s.equipment.owned.includes(id);

export const equipmentDef = (id: B.EquipmentId): B.EquipmentDef =>
  B.EQUIPMENT.find((e) => e.id === id) ?? B.EQUIPMENT[0];

export type EquipmentBlock = 'owned' | 'level' | 'money';

export const equipmentBlock = (s: EconomyState, id: B.EquipmentId): EquipmentBlock | null => {
  const def = equipmentDef(id);
  if (hasEquipment(s, id)) return 'owned';
  if (s.player.xp.level < def.requiredLevel) return 'level';
  if (!canAfford(s, toCents(def.price))) return 'money';
  return null;
};

/** Покупка оборудования — вложение в бизнес (как гараж), из свободных денег, без кредита */
export const buyEquipment = (s: EconomyState, id: B.EquipmentId): OpResult => {
  if (equipmentBlock(s, id)) return { state: s, ok: false };
  const cents = toCents(equipmentDef(id).price);
  const res = spend(s, cents, (l) => ({ ...l, investmentsCents: l.investmentsCents + cents }), `equip:${id}`);
  if (!res.ok) return res;
  return { ok: true, state: { ...res.state, equipment: { ...res.state.equipment, owned: [...res.state.equipment.owned, id] } } };
};

export type BoothInstallBlock = 'not-owned' | 'installed' | 'bad-slot' | 'last-slot';

/**
 * Камеру можно поставить только так, чтобы остался хотя бы один обычный слот.
 * Что слот свободен (нет машины и механика) — проверяет гараж.
 */
export const boothInstallBlock = (s: EconomyState, slot: number, garageSlots: number): BoothInstallBlock | null => {
  if (!hasEquipment(s, 'paint_booth')) return 'not-owned';
  if (s.equipment.boothSlot !== null) return 'installed';
  if (slot < 0 || slot >= garageSlots) return 'bad-slot';
  if (garageSlots - 1 < 1) return 'last-slot';
  return null;
};

export const installBooth = (s: EconomyState, slot: number, garageSlots: number): OpResult =>
  boothInstallBlock(s, slot, garageSlots)
    ? { state: s, ok: false }
    : { ok: true, state: { ...s, equipment: { ...s.equipment, boothSlot: slot } } };

/** Демонтаж: что в камере нет работы, проверяет гараж; камера остаётся купленной */
export const uninstallBooth = (s: EconomyState): EconomyState =>
  s.equipment.boothSlot === null ? s : { ...s, equipment: { ...s.equipment, boothSlot: null } };

/** Профессиональные инструменты: +15% к скорости технического ремонта (игрок и механики), не к покраске */
export const repairToolsMultiplier = (s: EconomyState): number =>
  hasEquipment(s, 'pro_tools') ? B.PRO_TOOLS_REPAIR_BONUS : 1;

/** Сила ручного тапа покраски: ×(1 + 5% за уровень «Маляра») */
export const paintTapMultiplier = (s: EconomyState): number => P.skillMultiplier(s.player.painter.level);

/** Успешный тап покраски в своей камере — 1 практика «Маляра» */
export const recordPaintTap = (s: EconomyState): EconomyState => (s.bankruptcy ? s : awardSkill(s, 'painter', 1));

// ─── Диагностика объявлений ────────────────────────────────────────────────

/** Первый осмотр объявления: +5 «Подборщика», не больше 30 таких очков в месяц */
export const recordInspection = (s: EconomyState, listingId: string): EconomyState => {
  const opId = `inspect:${listingId}`;
  if (isProcessed(s, opId) || s.bankruptcy) return s;
  const amount = Math.max(0, Math.min(B.PICKER_INSPECT_PRACTICE, B.PICKER_INSPECT_MONTHLY_CAP - s.ledger.inspectPractice));
  const state = awardSkill({ ...s, ledger: { ...s.ledger, inspectPractice: s.ledger.inspectPractice + amount } }, 'picker', amount);
  return withProcessed(state, opId);
};

/** Первая диагностика объявления своим сканером: +40 «Подборщика» */
export const recordScan = (s: EconomyState, listingId: string): OpResult => {
  if (!hasEquipment(s, 'scanner') || s.bankruptcy) return { state: s, ok: false };
  const opId = `scan:${listingId}`;
  if (isProcessed(s, opId)) return { state: s, ok: true };
  return { ok: true, state: withProcessed(awardSkill(s, 'picker', B.PICKER_SCAN_PRACTICE), opId) };
};

export const serviceDiagnosticsCents = (tier: number | undefined): number =>
  toCents(B.SERVICE_DIAGNOSTICS_PRICE[tier ?? 1] ?? B.SERVICE_DIAGNOSTICS_PRICE[1]);

/** Сторонняя диагностика: расход месяца, без практики; повторно за то же объявление не списывается */
export const payServiceDiagnostics = (s: EconomyState, listingId: string, tier: number | undefined): OpResult => {
  const cents = serviceDiagnosticsCents(tier);
  return spend(s, cents, (l) => ({ ...l, diagnosticsCents: l.diagnosticsCents + cents }), `diag:${listingId}`);
};

// ─── Заказы клиентов ───────────────────────────────────────────────────────

/** Проверки доски и сроки заказов к моменту now; без изменений возвращает то же состояние */
export const advanceOrders = (s: EconomyState, now: number, ctx: Omit<O.OrdersContext, 'owned'>): EconomyState => {
  if (s.bankruptcy) return s;
  const orders = O.advanceOrders(s.orders, now, { ...ctx, owned: s.equipment.owned });
  return orders === s.orders ? s : { ...s, orders };
};

/** Принять заказ. Ремонтный: детали оплачиваются сразу из свободных денег (свободный слот проверяет гараж) */
export const acceptOrder = (s: EconomyState, id: string, now: number, unlockedTiers: number[]): OpResult => {
  if (s.bankruptcy) return { state: s, ok: false };
  if (O.acceptBlock(s.orders, id, { owned: s.equipment.owned, unlockedTiers })) return { state: s, ok: false };
  const order = s.orders.board.find((o) => o.id === id)!;
  let state = s;
  if (order.kind === 'service' && order.partsCents > 0) {
    const cents = order.partsCents;
    const paid = spend(s, cents, (l) => ({ ...l, serviceCostsCents: l.serviceCostsCents + cents }), `accept:${id}`);
    if (!paid.ok) return paid;
    state = paid.state;
  }
  return { ok: true, state: { ...state, orders: O.acceptOrder(state.orders, id, now) } };
};

export const declineOffer = (s: EconomyState, id: string): EconomyState => ({ ...s, orders: O.declineOffer(s.orders, id) });

/** Отказ от принятого заказа: −5 репутации, деньги за детали не возвращаются */
export const cancelOrder = (s: EconomyState, id: string, now: number): EconomyState =>
  s.orders.active.some((o) => o.id === id) ? { ...s, orders: O.cancelOrder(s.orders, id, now) } : s;

export const markOrderWorkDone = (s: EconomyState, id: string, at: number): EconomyState => {
  const orders = O.markWorkDone(s.orders, id, at);
  return orders === s.orders ? s : { ...s, orders };
};

/** Сдать ремонтный заказ: оплата по моменту фактического окончания работы, один раз */
export const deliverServiceOrder = (s: EconomyState, id: string, now: number): OpResult => {
  const opId = `deliver:${id}`;
  const o = s.orders.active.find((x) => x.id === id);
  if (isProcessed(s, opId) || s.bankruptcy || !o || o.kind !== 'service' || o.completedAtMs === undefined) {
    return { state: s, ok: false };
  }
  const outcome = O.deliveryOutcome(o, o.completedAtMs);
  const paid = Math.round(o.rewardCents * outcome.payShare);
  let state: EconomyState = {
    ...s,
    balanceCents: s.balanceCents + paid,
    ledger: { ...s.ledger, serviceRevenueCents: s.ledger.serviceRevenueCents + paid },
    orders: O.completeOrder(s.orders, id, now, outcome, paid),
  };
  // Маржа заказа: оплата клиента − детали, оплаченные при принятии
  state = creditLegacyBonus(state, paid - o.partsCents);
  state = awardSkill(state, 'management', B.MANAGEMENT_ORDER_PRACTICE);
  return { ok: true, state: withProcessed(state, opId) };
};

/**
 * Передать машину по заказу на подбор: обычная продажа (себестоимость, прибыль, XP — стандартно)
 * по согласованной цене, сразу, без таймера продажи. Плюс репутация и практика за заказ.
 */
export const deliverPickingOrder = (
  s: EconomyState,
  id: string,
  carId: string,
  candidate: O.PickingCandidate,
  now: number,
): OpResult => {
  const opId = `deliver:${id}`;
  const o = s.orders.active.find((x) => x.id === id);
  if (isProcessed(s, opId) || s.bankruptcy || !o || o.kind !== 'picking' || !s.assets[carId]) return { state: s, ok: false };
  if (O.pickingMismatch(o, candidate).length > 0) return { state: s, ok: false };
  const outcome = O.deliveryOutcome(o, now);
  const price = outcome.late ? Math.round(o.priceCents * B.PICKING_LATE_PRICE_SHARE) : o.priceCents;
  let state = sellCar(s, { carId, priceCents: price, fallbackCostCents: 0, tier: candidate.tier });
  state = { ...state, orders: O.completeOrder(state.orders, id, now, outcome, price, carId) };
  state = awardSkill(state, 'management', B.MANAGEMENT_ORDER_PRACTICE);
  state = awardSkill(state, 'trade', B.TRADE_PICKING_PRACTICE);
  return { ok: true, state: withProcessed(state, opId) };
};

// ─── Курсы всех навыков игрока ─────────────────────────────────────────────

export const skillCourseOffer = (s: EconomyState, key: SkillKey, now: number): CourseOffer => {
  const skill = playerSkill(s, key);
  const costCents = toCents(P.playerCourseCost(skill.level));
  return { costCents, preview: P.previewCourse(skill, now, SKILL_CURVES[key]), affordable: canAfford(s, costCents) };
};

/** Курс навыка игрока: до 50% порога, без переноса, раз на уровень, своя перезарядка у каждого навыка */
export const buySkillCourse = (s: EconomyState, key: SkillKey, now: number): OpResult => {
  const offer = skillCourseOffer(s, key, now);
  const skill = P.applyCourse(playerSkill(s, key), now, SKILL_CURVES[key]);
  if (!offer.preview.available || !skill) return { state: s, ok: false };
  const paid = spendOtherExpense(s, offer.costCents);
  if (!paid.ok) return paid;
  return { ok: true, state: withPlayerSkill(paid.state, key, skill) };
};

// ─── Сохранение ────────────────────────────────────────────────────────────

export interface EconomySave {
  version: 1;
  gameTimeMs: number;
  state: EconomyState;
}

export const serializeEconomy = (state: EconomyState, gameTimeMs: number): string =>
  JSON.stringify({ version: 1, gameTimeMs, state } satisfies EconomySave);

/** Восстановление: время не может уйти за конец месяца, лишние поля старых версий не ломают загрузку */
export const deserializeEconomy = (raw: string): EconomySave | null => {
  try {
    const save = JSON.parse(raw) as EconomySave;
    if (!save || save.version !== 1 || !save.state) return null;
    const base = createEconomy(0);
    const loaded = save.state as Partial<EconomyState>;
    // Контракты из версии без навыков: навык уровня 1 до переноса уровня из данных гаража
    const contracts: Record<string, Contract> = {};
    for (const [id, c] of Object.entries(loaded.contracts ?? {})) {
      contracts[id] = c.skill
        ? c
        : {
            ...c,
            skill: P.createSkill(),
            practiceSyncedAtMs: c.busySinceMs ?? c.hiredAtMs,
            levelChangedAtMs: c.hiredAtMs,
            legacySkillPending: true,
          };
    }
    const state: EconomyState = {
      ...base,
      ...save.state,
      contracts,
      ledger: { ...base.ledger, ...save.state.ledger },
      totals: { ...base.totals, ...save.state.totals },
      // Нет данных прогрессии — это сохранение старой версии, опыт перенесёт провайдер
      player: loaded.player
        ? {
            ...loaded.player,
            management: loaded.player.management ?? P.createSkill(),
            painter: loaded.player.painter ?? P.createSkill(),
            picker: loaded.player.picker ?? P.createSkill(),
            trade: loaded.player.trade ?? P.createSkill(),
          }
        : base.player,
      equipment: loaded.equipment
        ? { owned: Array.from(new Set<B.EquipmentId>(['basic_tools', ...loaded.equipment.owned])), boothSlot: loaded.equipment.boothSlot ?? null }
        : createEquipment(),
      xpLog: loaded.xpLog ?? [],
      careerId: loaded.careerId ?? `career-${(loaded.orders?.seed ?? randomSeed()).toString(36)}`,
      legacyPoints: loaded.legacyPoints ?? 0,
      auction: A.restoreAuctionState(loaded.auction, randomSeed(), Math.max(0, save.gameTimeMs || 0)),
      // Сохранение до лестницы уровней: открытые тогда классы не закрываются
      ladderVersion: LADDER_VERSION,
      grandfatheredTiers:
        loaded.ladderVersion === LADDER_VERSION
          ? loaded.grandfatheredTiers ?? []
          : Object.entries(B.OLD_TIER_UNLOCK_LEVELS)
              .filter(([, lv]) => (loaded.player?.xp.level ?? 1) >= lv)
              .map(([t]) => Number(t))
              .filter((t) => (loaded.player?.xp.level ?? 1) < (TIER_UNLOCK_LEVELS[t] ?? 0)),
      branches: Object.fromEntries(
        Object.entries(loaded.branches ?? {}).map(([id, b]) => [
          id,
          { ...b, jobs: (b.jobs ?? []).map((j) => ({ ...j, busyFromMs: j.busyFromMs ?? j.startAtMs })) },
        ]),
      ),
      orders: O.restoreOrdersState(loaded.orders, randomSeed(), Math.max(0, save.gameTimeMs || 0)),
      playerMigrated: loaded.player ? (loaded.playerMigrated ?? true) : false,
      history: (loaded.history ?? []).map((m) => ({ ...m, monthXp: m.monthXp ?? 0, managementPractice: m.managementPractice ?? 0, salesXp: m.salesXp ?? 0, repairXp: m.repairXp ?? 0 })),
    };
    const gameTimeMs = Math.min(Math.max(0, save.gameTimeMs || 0), monthEndMs(state));
    return { version: 1, gameTimeMs, state };
  } catch {
    return null;
  }
};
