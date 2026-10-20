/**
 * Конфигурация баланса для механик расширения: ЛКП, диагностика, покраска, оборудование,
 * заказы клиентов, репутация, навыки «Маляр», «Подборщик», «Торговля».
 *
 * Опорные цифры текущей экономики (из carModels.ts и priceCalculator.ts):
 * - средняя базовая цена модели по классам: Эконом ≈ $14,4k, Средний ≈ $27,7k, Премиум ≈ $45,7k,
 *   Люкс ≈ $75k, Спорт ≈ $145k, Гипер ≈ $2,1M;
 * - у типичной подержанной машины множители пробега и возраста дают ≈ 0,45 от базы,
 *   поэтому 1 пункт общего состояния стоит ≈ 0,45% базы (Эконом ≈ $65, Средний ≈ $125);
 * - механик чинит 0,05 п./сек = 0,5 п. в игровой день, оклад $360 (≈40% выработки на Экономе).
 * Все значения ниже — стартовые, их можно калибровать без поиска по проекту.
 */

// ─── Состояние машины и ЛКП ────────────────────────────────────────────────

/** Доля технического состояния и ЛКП в общем состоянии (сумма = 1) */
export const TECH_WEIGHT = 0.8;
export const PAINT_WEIGHT = 0.2;

/** Индивидуальное отклонение технического максимума от расчёта по году и пробегу, п.п. */
export const MAX_OFFSET_MIN = -10;
export const MAX_OFFSET_MAX = 3;
/** Ниже этого технический максимум не опускается */
export const MIN_TECH_MAX = 10;

/** Скрытый коэффициент цены продавца: реальная цена объявления ×[0,88; 1,12] */
export const SELLER_FACTOR_MIN = 0.88;
export const SELLER_FACTOR_MAX = 1.12;

/** Генерация ЛКП: 100 − возраст × k − пробег(10 тыс. км) × k ± случайность экземпляра */
export const PAINT_AGE_PENALTY = 2.2;
export const PAINT_MILEAGE_PENALTY = 0.8;
export const PAINT_NOISE_MIN = -18;
export const PAINT_NOISE_MAX = 12;
export const PAINT_MIN = 5;

// ─── Диагностика ───────────────────────────────────────────────────────────

export interface Accuracy {
  /** Полуширина интервала, п.п.: текущее тех. состояние, тех. максимум, ЛКП */
  tech: number;
  max: number;
  paint: number;
}

/** Бесплатный взгляд на объявление */
export const VISUAL_ACCURACY: Accuracy = { tech: 15, max: 10, paint: 15 };
/** «Осмотреть»: внимательный осмотр уточняет, но хуже сканера */
export const INSPECT_ACCURACY: Accuracy = { tech: 12, max: 8, paint: 12 };
/** Собственный компьютерный сканер (×точность «Подборщика») */
export const SCANNER_ACCURACY: Accuracy = { tech: 10, max: 6, paint: 10 };
/** «Подборщик»: −3% полуширины сканера за уровень, но не уже 35% от исходной */
export const PICKER_ACCURACY_STEP = 0.03;
export const PICKER_ACCURACY_FLOOR = 0.35;

/** Полная диагностика в стороннем сервисе, $ по классам (1 Эконом … 6 Гипер) */
export const SERVICE_DIAGNOSTICS_PRICE: Record<number, number> = {
  1: 300,
  2: 500,
  3: 900,
  4: 1500,
  5: 2000,
  6: 2500,
};
/** Длительность сторонней диагностики, игровых дней */
export const SERVICE_DIAGNOSTICS_DAYS = 1;

// ─── Практика «Подборщика» ─────────────────────────────────────────────────

export const PICKER_INSPECT_PRACTICE = 5;
export const PICKER_INSPECT_MONTHLY_CAP = 30;
export const PICKER_SCAN_PRACTICE = 40;

// ─── «Торговля» ────────────────────────────────────────────────────────────

/** Скидка при покупке за уровень после первого */
export const TRADE_PURCHASE_STEP = 0.002;
/** Прибавка к выручке при продаже за уровень после первого */
export const TRADE_SALE_STEP = 0.0015;
/** Практика «Торговли» за успешный заказ на подбор */
export const TRADE_PICKING_PRACTICE = 40;
/** Практика «Менеджмента» за любой успешно выполненный заказ */
export const MANAGEMENT_ORDER_PRACTICE = 200;

/** Самая долгая продажа (+10% к цене), игровых дней — для подсказок */
export const MAX_SELL_DAYS_INFO = 30;

// ─── Покраска ──────────────────────────────────────────────────────────────

/**
 * Цены покраски считаются от прироста стоимости конкретной машины, поэтому одинаково
 * работают во всех классах. Пункт ЛКП стоит 0,2 пункта общего состояния.
 * - Сторонний сервис берёт 80% прироста стоимости: покраска в сервисе выгодна, но мало.
 * - Своя камера: материалы 30% прироста, работа своя (тапы) или маляра.
 */
export const SERVICE_PAINT_SHARE = 0.8;
export const OWN_PAINT_MATERIALS_SHARE = 0.3;
/** Сторонняя покраска: 2 дня + 1 день на каждые 15 п. ЛКП */
export const SERVICE_PAINT_BASE_DAYS = 2;
export const SERVICE_PAINT_POINTS_PER_DAY = 15;
/** Ручная покраска в камере: п. ЛКП за тап (×навык «Маляр») */
export const PLAYER_PAINT_PER_TAP = 0.5;
/** Маляр: п. ЛКП в секунду игрового времени (×навык маляра) = 2,5 п. в игровой день */
export const PAINTER_SPEED_PER_SEC = 0.25;
/**
 * Оклад маляра ≈ 40% чистого вклада при полной загрузке.
 * 0,25 п./сек → 75 п. ЛКП за месяц. Камера открывается на 5 уровне вместе со «Средним» классом:
 * пункт ЛКП там ≈ 0,2 × $125 ≈ $25, минус 30% материалов ≈ $17,5 → ≈ $1 300 в месяц → оклад ≈ $500.
 * На Экономе вклад ≈ $570, поэтому маляр выгоден прежде всего на машинах дороже.
 */
export const PAINTER_MONTHLY_SALARY_CENTS = 50_000;

/**
 * Камера окупается за 10–15 хороших покрасок: на «Среднем» классе типичная покраска
 * ≈ 48 п. ЛКП ≈ $1 300 прироста; своя камера экономит против сервиса ≈ 50% прироста ≈ $650
 * → 12 покрасок ≈ $8 000.
 */

// ─── Оборудование ──────────────────────────────────────────────────────────

export type EquipmentId = 'basic_tools' | 'scanner' | 'transmission' | 'paint_booth' | 'engine' | 'pro_tools';

export interface EquipmentDef {
  id: EquipmentId;
  name: string;
  description: string;
  /** Общий уровень игрока, с которого можно купить */
  requiredLevel: number;
  /** Цена, $; 0 — выдаётся бесплатно со старта */
  price: number;
  /** Постоянно занимает гаражный слот */
  occupiesSlot: boolean;
}

export const EQUIPMENT: EquipmentDef[] = [
  {
    id: 'basic_tools',
    name: 'Базовый набор инструментов',
    description: 'ТО, подвеска и кузовной ремонт. Выдаётся бесплатно.',
    requiredLevel: 1,
    price: 0,
    occupiesSlot: false,
  },
  {
    id: 'scanner',
    name: 'Компьютерный сканер',
    description: 'Бесплатная диагностика объявлений на авторынке: интервалы уже, «Подборщик» сужает их ещё.',
    requiredLevel: 3,
    price: 3_000,
    occupiesSlot: false,
  },
  {
    id: 'transmission',
    name: 'Оборудование для АКПП',
    description: 'Открывает заказы на ремонт коробок передач.',
    requiredLevel: 5,
    price: 9_000,
    occupiesSlot: false,
  },
  {
    id: 'paint_booth',
    name: 'Покрасочная камера',
    description: 'Покраска своими силами или маляром. Постоянно занимает один слот гаража.',
    requiredLevel: 5,
    price: 8_000,
    occupiesSlot: true,
  },
  {
    id: 'engine',
    name: 'Оборудование для ремонта двигателя',
    description: 'Открывает заказы на сложный ремонт моторов.',
    requiredLevel: 7,
    price: 14_000,
    occupiesSlot: false,
  },
  {
    id: 'pro_tools',
    name: 'Профессиональные инструменты',
    description: '+15% к скорости технического ремонта для игрока и механиков.',
    requiredLevel: 10,
    price: 30_000,
    occupiesSlot: false,
  },
];

export const PRO_TOOLS_REPAIR_BONUS = 1.15;

// ─── Заказы клиентов ───────────────────────────────────────────────────────

export type ServiceOrderType = 'maintenance' | 'suspension' | 'body' | 'engine' | 'transmission' | 'paint';

export interface ServiceOrderDef {
  type: ServiceOrderType;
  name: string;
  /** Длительность при базовой скорости одного исполнителя, игровых дней */
  minDays: number;
  maxDays: number;
  /** Простые: +2 репутации, сложные: +4 */
  complex: boolean;
  /** Нужное оборудование (базовые инструменты есть всегда) */
  equipment: EquipmentId;
  /** Доля деталей/материалов от стоимости работы */
  partsShare: number;
  /** Множитель оплаты работы за пункт */
  laborMult: number;
  descriptions: string[];
}

export const SERVICE_ORDER_TYPES: ServiceOrderDef[] = [
  { type: 'maintenance', name: 'Небольшое ТО', minDays: 2, maxDays: 4, complex: false, equipment: 'basic_tools', partsShare: 0.3, laborMult: 1, descriptions: ['Замена масла и фильтров', 'Плановое ТО перед поездкой', 'Замена колодок и жидкостей'] },
  { type: 'suspension', name: 'Подвеска', minDays: 4, maxDays: 7, complex: false, equipment: 'basic_tools', partsShare: 0.4, laborMult: 1, descriptions: ['Стучит спереди на кочках', 'Замена амортизаторов', 'Перебрать ходовую'] },
  { type: 'body', name: 'Кузовной ремонт', minDays: 5, maxDays: 9, complex: true, equipment: 'basic_tools', partsShare: 0.35, laborMult: 1.05, descriptions: ['Вмятина на двери после парковки', 'Выправить крыло и бампер', 'Ремонт порогов'] },
  { type: 'engine', name: 'Ремонт двигателя', minDays: 8, maxDays: 15, complex: true, equipment: 'engine', partsShare: 0.5, laborMult: 1.1, descriptions: ['Двигатель троит и ест масло', 'Капремонт после перегрева', 'Замена цепи ГРМ'] },
  { type: 'transmission', name: 'Ремонт АКПП', minDays: 10, maxDays: 18, complex: true, equipment: 'transmission', partsShare: 0.5, laborMult: 1.1, descriptions: ['Пинки при переключении', 'Коробка уходит в аварийный режим', 'Переборка АКПП'] },
  { type: 'paint', name: 'Покраска', minDays: 6, maxDays: 12, complex: true, equipment: 'paint_booth', partsShare: 0.3, laborMult: 1, descriptions: ['Перекрасить капот и крышу', 'Полная покраска кузова', 'Убрать сколы и ржавчину'] },
];

/**
 * Базовая оплата работы: 85% того, сколько тот же пункт состояния добавил бы к цене типичной
 * подержанной машины класса. Дальше её умножает orderRewardMultiplier (уровень и репутация).
 * Детали клиент возмещает отдельно.
 */
export const ORDER_LABOR_SHARE = 0.85;
/** Типичная доля стоимости подержанной машины от базы (пробег × возраст) */
export const TYPICAL_USED_FACTOR = 0.45;
/** Повышенное вознаграждение */
export const PREMIUM_REWARD_MULT = 1.35;
/** Средняя базовая цена модели класса, $ — для оценки стоимости работ */
export const TIER_AVG_BASE: Record<number, number> = {
  1: 14_400,
  2: 27_700,
  3: 45_700,
  4: 75_200,
  5: 144_500,
  6: 2_060_000,
};
/** Срок = оценка × коэффициент + запас дней */
export const ORDER_DEADLINE_MULT = 1.6;
export const ORDER_DEADLINE_EXTRA_DAYS = 2;
/** Льготный период после срока, игровых дней */
export const ORDER_GRACE_DAYS = 5;
/** Оплата в льготный период */
export const ORDER_LATE_PAY_SHARE = 0.7;
/** «Значительно раньше срока»: осталось не меньше этой доли срока */
export const ORDER_EARLY_SHARE = 0.4;
/** Сколько дней предложение висит на доске */
export const ORDER_OFFER_DAYS = 5;
export const MAX_ACTIVE_SERVICE_ORDERS = 2;
export const MAX_ACTIVE_PICKING_ORDERS = 1;
/** Проверка новых заказов — каждый игровой день */
export const ORDER_CHECK_DAYS = 1;
/** Если столько дней не было ни одного нового заказа — следующая проверка гарантированно его приносит */
export const ORDER_GUARANTEE_DAYS = 3;
/** Доля сгенерированных заказов, которые игрок может выполнить имеющимся оборудованием */
export const ORDER_AVAILABLE_TYPE_WEIGHT = 0.75;
/** Ниже этой репутации приходят только простые заказы (≈30 простых заказов от старта) */
export const LOW_REPUTATION = 130;

/** Подбор: срок, игровых дней */
export const PICKING_MIN_DAYS = 20;
export const PICKING_MAX_DAYS = 35;
/** Подбор: клиент платит стоимость машины в требуемом состоянии × множитель */
export const PICKING_PRICE_MIN = 1.08;
export const PICKING_PRICE_MAX = 1.18;
/** Подбор сдан в льготный период: −3 репутации и цена ниже на 10% */
export const PICKING_LATE_PRICE_SHARE = 0.9;

// ─── Репутация ─────────────────────────────────────────────────────────────

/**
 * Шкала репутации 0–1000, новый автосервис начинает со 100. Репутация копится медленно:
 * 1–2 очка за выполненный заказ, поэтому до 1000 — сотни заказов. Штрафы — в несколько заказов.
 */
export const REPUTATION_MAX = 1000;
export const REPUTATION_START = 100;
export const REP_SIMPLE_ON_TIME = 1;
export const REP_COMPLEX_ON_TIME = 2;
/** Досрочно — +1, но за один заказ не больше REP_MAX_PER_ORDER */
export const REP_EARLY_BONUS = 1;
export const REP_MAX_PER_ORDER = 2;
export const REP_LATE = -2;
export const REP_CANCEL = -3;
export const REP_FAILED = -5;
export const REPUTATION_HISTORY = 20;

const repShare = (reputation: number) => Math.min(1, Math.max(0, reputation / REPUTATION_MAX));

/**
 * Частота заказов зависит только от репутации: шанс нового заказа в день 20% → 100% (на 1000 —
 * заказ приходит каждый день),
 * шанс второго заказа в тот же день 0% → 35%. Плюс гарантия — не реже раза в 3 дня.
 */
export const orderSpawnChance = (reputation: number): number => 0.2 + 0.8 * repShare(reputation);
export const extraOrderChance = (reputation: number): number => 0.35 * repShare(reputation);
/** Шанс выгодного заказа (×1,35): 10% → 45% */
export const premiumOrderChance = (reputation: number): number => 0.1 + 0.35 * repShare(reputation);

/** Сколько предложений помещается на доску: с ростом репутации клиентов больше */
export const maxBoardService = (reputation: number): number => 3 + Math.floor(repShare(reputation) * 4);
export const maxBoardPicking = (reputation: number): number => 1 + Math.floor(repShare(reputation) * 2);

/**
 * Оплата работы по заказу растёт с репутацией сервиса (ступенями) и общим уровнем игрока:
 *   множитель = ступень репутации × (1 + 0,015 × min(уровень − 1, 20))
 * Ступени репутации: 0–249 — ×1; 250–499 — ×1,25; 500–749 — ×1,75; 750–999 — ×2; 1000 — ×2,5.
 * Уровень: +1,5% за уровень, до +30% к 21-му. Применяется к работе, детали клиент возмещает по себестоимости.
 */
export const REPUTATION_PAY_STEPS: { from: number; mult: number }[] = [
  { from: 0, mult: 1 },
  { from: 250, mult: 1.25 },
  { from: 500, mult: 1.75 },
  { from: 750, mult: 2 },
  { from: 1000, mult: 2.5 },
];
export const orderReputationFactor = (reputation: number): number =>
  REPUTATION_PAY_STEPS.reduce((m, step) => (reputation >= step.from ? step.mult : m), 1);
export const orderLevelFactor = (playerLevel: number): number => 1 + 0.015 * Math.min(Math.max(0, playerLevel - 1), 20);
export const orderRewardMultiplier = (playerLevel: number, reputation: number): number =>
  orderReputationFactor(reputation) * orderLevelFactor(playerLevel);
