/**
 * Прогрессия: опыт и уровни игрока, профессиональный навык «Механик» (игрока и нанятых механиков),
 * курсы обучения и календарь недели. Только формулы и чистые функции — без React и хранилища.
 */

// ─── Опыт игрока ───────────────────────────────────────────────────────────

/** XP, нужный на текущем уровне, чтобы перейти на следующий. Уровни бесконечны. */
export const XP_CURVE_BASE = 100;
export const XP_CURVE_LINEAR = 10;
export const XP_CURVE_QUADRATIC = 1.5;
/** Кривая подобрана симулятором (scripts/simulate.ts): активный игрок доходит до 20-го уровня за ≈5 ч, до 100-го — за ≈45 ч */
export const requiredXp = (level: number): number => {
  const n = Math.max(0, level - 1);
  return Math.round(XP_CURVE_BASE + XP_CURVE_LINEAR * n + XP_CURVE_QUADRATIC * n * n);
};

export interface PlayerXp {
  level: number;
  /** XP внутри текущего уровня */
  xp: number;
  totalXp: number;
}

export const createPlayerXp = (): PlayerXp => ({ level: 1, xp: 0, totalXp: 0 });

/** Начисление XP: остаток переносится, за одну награду можно подняться на несколько уровней */
export const addXp = (p: PlayerXp, amount: number): PlayerXp => {
  const gain = Math.max(0, Math.floor(amount));
  if (gain === 0) return p;
  let level = p.level;
  let xp = p.xp + gain;
  while (xp >= requiredXp(level)) {
    xp -= requiredXp(level);
    level += 1;
  }
  return { level, xp, totalXp: p.totalXp + gain };
};

/** Классы: 1 Эконом, 2 Средний, 3 Премиум, 4 Люкс, 5 Спорт, 6 Гипер */
export const SALE_BASE_XP: Record<number, number> = {
  1: 50,
  2: 80,
  3: 125,
  4: 190,
  5: 235, // TODO: в ТЗ нет класса «Спорт» — значение посередине между Люксом и Гипером
  6: 280,
};

export const FULL_REPAIR_XP: Record<number, number> = {
  1: 10,
  2: 16,
  3: 25,
  4: 38,
  5: 47, // TODO: см. SALE_BASE_XP
  6: 56,
};

/** Множитель XP за сделку: ×1 за каждые 25% доходности (до ×4) и плавный бонус выше 100% (до +2) */
export const saleXpMultiplier = (roi: number): number => {
  if (!(roi > 0)) return 0;
  const base = Math.min(roi / 0.25, 4);
  const bonus = Math.min(2, 4 * Math.max(roi - 1, 0));
  return base + bonus;
};

/**
 * XP за продажу. ROI считается от цены покупки; прямые затраты на машину уменьшают прибыль.
 * Без прибыли или с некорректной ценой покупки — 0.
 */
export const saleXp = (tier: number | undefined, salePrice: number, purchasePrice: number, directCosts = 0): number => {
  if (!tier || !(purchasePrice > 0)) return 0;
  const profit = salePrice - purchasePrice - directCosts;
  if (profit <= 0) return 0;
  return Math.round((SALE_BASE_XP[tier] ?? 0) * saleXpMultiplier(profit / purchasePrice));
};

/** XP за первое полное восстановление: полный бонус при износе от 30 пунктов */
export const fullRepairXp = (tier: number | undefined, initialWearPct: number): number => {
  if (!tier || !(initialWearPct > 0)) return 0;
  return Math.round((FULL_REPAIR_XP[tier] ?? 0) * Math.min(1, initialWearPct / 30));
};

/** Бонус за прибыльный месяц: 10% XP продаж месяца, не больше 80 */
export const monthXp = (netProfitCents: number, salesXpThisMonth: number): number =>
  netProfitCents > 0 ? Math.min(80, Math.round(salesXpThisMonth * 0.1)) : 0;

// ─── Профессиональный навык «Механик» ──────────────────────────────────────

export const SKILL_MAX_LEVEL = 20;
/** Курс можно проходить раз в 3 игровых месяца (900 сек активной игры) */
export const COURSE_COOLDOWN_MS = 3 * 300_000;
/** Нанятый механик получает 2 практики за секунду реального ремонта */
export const WORKER_PRACTICE_PER_SEC = 2;

export interface SkillState {
  level: number;
  /** Практика внутри текущего уровня (у механиков может быть дробной — считается от времени) */
  practice: number;
  /** На каком уровне был пройден последний курс (на одном уровне — один курс) */
  courseLevel: number | null;
  /** Игровое время, до которого действует перезарядка курсов */
  courseCooldownUntilMs: number;
  coursesTaken: number;
}

export const createSkill = (level = 1): SkillState => ({
  level: Math.min(SKILL_MAX_LEVEL, Math.max(1, Math.floor(level))),
  practice: 0,
  courseLevel: null,
  courseCooldownUntilMs: 0,
  coursesTaken: 0,
});

/** Сколько практики нужно на уровне, чтобы перейти на следующий (своя у каждого навыка) */
export type PracticeCurve = (level: number) => number;

/** Навык «Механик» */
export const requiredPractice: PracticeCurve = (level) => 1000 + 250 * (level - 1);

/** Навык «Менеджмент» */
export const requiredManagementPractice: PracticeCurve = (level) => 350 + 75 * (level - 1);

/** Профессия «Управляющий» (сотрудник филиала): +20 практики за выполненный заказ */
export const requiredManagerPractice: PracticeCurve = (level) => 150 + 40 * (level - 1);

/** Навык «Подборщик» */
export const requiredPickerPractice: PracticeCurve = (level) => 200 + 45 * (level - 1);

/** Навык «Торговля» */
export const requiredTradePractice: PracticeCurve = (level) => 300 + 65 * (level - 1);

/** +5% эффективности за каждый уровень после первого (линейно, без перемножения) */
export const skillMultiplier = (level: number): number => 1 + 0.05 * (level - 1);

/** Практика с переносом остатка; на максимальном уровне больше не копится */
export const addPractice = (skill: SkillState, amount: number, curve: PracticeCurve = requiredPractice): SkillState => {
  if (skill.level >= SKILL_MAX_LEVEL || !(amount > 0)) return skill;
  let level = skill.level;
  let practice = skill.practice + amount;
  while (level < SKILL_MAX_LEVEL && practice >= curve(level)) {
    practice -= curve(level);
    level += 1;
  }
  if (level >= SKILL_MAX_LEVEL) practice = 0;
  return { ...skill, level, practice };
};

export type CourseBlock = 'max-level' | 'already-taken' | 'cooldown' | 'threshold-reached';

export interface CoursePreview {
  available: boolean;
  block: CourseBlock | null;
  /** Сколько практики курс добавит прямо сейчас */
  granted: number;
  capacity: number;
  /** Курс сразу переведёт на следующий уровень */
  levelsUp: boolean;
  cooldownLeftMs: number;
}

export const courseCapacity = (level: number, curve: PracticeCurve = requiredPractice): number =>
  Math.floor(curve(level) * 0.5);

export const previewCourse = (skill: SkillState, now: number, curve: PracticeCurve = requiredPractice): CoursePreview => {
  const required = curve(skill.level);
  const capacity = courseCapacity(skill.level, curve);
  const granted = Math.max(0, Math.min(capacity, Math.ceil(required - skill.practice)));
  const cooldownLeftMs = Math.max(0, skill.courseCooldownUntilMs - now);
  let block: CourseBlock | null = null;
  if (skill.level >= SKILL_MAX_LEVEL) block = 'max-level';
  else if (skill.practice >= required) block = 'threshold-reached';
  else if (skill.courseLevel === skill.level) block = 'already-taken';
  else if (cooldownLeftMs > 0) block = 'cooldown';
  return {
    available: block === null,
    block,
    granted: block === 'max-level' ? 0 : granted,
    capacity,
    levelsUp: skill.practice + granted >= required,
    cooldownLeftMs,
  };
};

/**
 * Курс покрывает не больше половины порога текущего уровня. Если порог достигнут —
 * уровень повышается, а прогресс нового уровня строго 0: избыток курса не переносится.
 */
export const applyCourse = (skill: SkillState, now: number, curve: PracticeCurve = requiredPractice): SkillState | null => {
  const preview = previewCourse(skill, now, curve);
  if (!preview.available) return null;
  const base = {
    ...skill,
    courseLevel: skill.level,
    courseCooldownUntilMs: now + COURSE_COOLDOWN_MS,
    coursesTaken: skill.coursesTaken + 1,
  };
  if (preview.levelsUp) return { ...base, level: skill.level + 1, practice: 0 };
  return { ...base, practice: skill.practice + preview.granted };
};

const roundToNearest50 = (value: number): number => Math.round(value / 50) * 50;

/** Курс игрока, в долларах */
export const playerCourseCost = (level: number): number => roundToNearest50(1000 * Math.pow(1.25, level - 1));

/** Курс нанятого механика, в долларах, от его текущего оклада */
export const workerCourseCost = (monthlySalaryCents: number, level: number): number =>
  Math.max(100, roundToNearest50(0.5 * (monthlySalaryCents / 100) * skillMultiplier(level)));

// ─── Навык «Менеджмент» ────────────────────────────────────────────────────

/** Шанс горящего предложения на одной проверке: +5% к базовым 22% за уровень (относительно), не выше 60% */
export const hotOfferChance = (managementLevel: number): number =>
  Math.min(0.6, 0.22 * (1 + 0.05 * (managementLevel - 1)));

/** С этого уровня менеджмента — уведомления о горящих предложениях и индикатор авторынка */
export const HOT_OFFER_NOTIFY_LEVEL = 2;

/** Практика менеджмента за продажу: от ROI сделки (тот же расчёт, что и для XP) */
export const managementSalePractice = (salePrice: number, purchasePrice: number, directCosts = 0): number => {
  if (!(purchasePrice > 0)) return 0;
  const roi = (salePrice - purchasePrice - directCosts) / purchasePrice;
  if (roi >= 0.1) return 80;
  if (roi > 0) return 20;
  return 0;
};

/** Практика менеджмента за прибыльный месяц */
export const managementMonthPractice = (netProfitCents: number): number => (netProfitCents > 0 ? 160 : 0);

// ─── Календарь недели ──────────────────────────────────────────────────────

export const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'] as const;

/** Первый день первого месяца — понедельник; неделя идёт непрерывно через месяцы (по 30 дней) */
export const weekdayOf = (month: number, dayOfMonth: number): string => {
  const totalDaysPassed = (month - 1) * 30 + (dayOfMonth - 1);
  return WEEKDAYS[((totalDaysPassed % 7) + 7) % 7];
};
