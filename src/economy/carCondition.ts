/**
 * Модель состояния машины: техническое состояние, технический максимум, ЛКП, общее состояние,
 * скрытые черты экземпляра (отклонение максимума, коэффициент цены продавца), интервалы диагностики
 * и бонусы «Торговли». Только чистые функции.
 */
import * as B from './balance.ts';
import { calculateCarPrice, calculateMaxCondition } from '../utils/priceCalculator.ts';

export type Rng = () => number;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

// ─── Общее состояние ───────────────────────────────────────────────────────

/** Нет данных о ЛКП (старые сохранения) — считаем его равным техническому, общее не меняется */
export const overallCondition = (tech: number, paint?: number): number =>
  B.TECH_WEIGHT * tech + B.PAINT_WEIGHT * (paint ?? tech);

/** Максимально достижимое общее состояние: ЛКП можно восстановить до 100% */
export const overallMax = (techMax: number): number => B.TECH_WEIGHT * techMax + B.PAINT_WEIGHT * 100;

export interface CarPhysical {
  year: number;
  mileage: number;
  /** Текущее техническое состояние */
  condition: number;
  paintCondition?: number;
}

/**
 * Рыночная стоимость: существующая формула цены, в которую подставлено общее состояние.
 * ЛКП влияет на цену только здесь, отдельной надбавки нет.
 */
export const carValue = (basePrice: number, car: CarPhysical): number =>
  calculateCarPrice(basePrice, {
    year: car.year,
    mileage: car.mileage,
    condition: overallCondition(car.condition, car.paintCondition),
  });

/** Сколько $ добавляет к цене один пункт общего состояния этой машины */
export const valuePerOverallPoint = (basePrice: number, year: number, mileage: number): number =>
  (calculateCarPrice(basePrice, { year, mileage, condition: 100 }) - calculateCarPrice(basePrice, { year, mileage, condition: 0 })) /
  100;

/** Прирост стоимости от покраски с paintFrom до paintTo */
export const paintValueGain = (basePrice: number, year: number, mileage: number, paintFrom: number, paintTo: number): number =>
  Math.max(0, paintTo - paintFrom) * B.PAINT_WEIGHT * valuePerOverallPoint(basePrice, year, mileage);

// ─── Скрытые черты экземпляра ──────────────────────────────────────────────

export interface HiddenTraits {
  /** Реальный технический максимум */
  maxCondition: number;
  /** Реальное техническое состояние */
  condition: number;
  /** Реальное ЛКП */
  paintCondition: number;
  /** Коэффициент цены продавца */
  sellerFactor: number;
}

/**
 * Реальные характеристики создаются один раз при генерации объявления: максимум по году и пробегу
 * со случайным отклонением, состояние не выше максимума, ЛКП по возрасту, пробегу и случайности.
 */
export const generateTraits = (year: number, mileage: number, currentYear: number, rng: Rng): HiddenTraits => {
  const baseMax = calculateMaxCondition(year, mileage);
  const offset = B.MAX_OFFSET_MIN + rng() * (B.MAX_OFFSET_MAX - B.MAX_OFFSET_MIN);
  const maxCondition = round1(clamp(baseMax + offset, B.MIN_TECH_MAX, 100));
  const condition = round1(maxCondition * (0.3 + rng() * 0.65));
  const age = Math.max(0, currentYear - year);
  const noise = B.PAINT_NOISE_MIN + rng() * (B.PAINT_NOISE_MAX - B.PAINT_NOISE_MIN);
  const paintCondition = round1(
    clamp(100 - age * B.PAINT_AGE_PENALTY - (mileage / 10_000) * B.PAINT_MILEAGE_PENALTY + noise, B.PAINT_MIN, 100),
  );
  const sellerFactor = Math.round((B.SELLER_FACTOR_MIN + rng() * (B.SELLER_FACTOR_MAX - B.SELLER_FACTOR_MIN)) * 1000) / 1000;
  return { maxCondition, condition: Math.min(condition, maxCondition), paintCondition, sellerFactor };
};

// ─── Интервалы диагностики ─────────────────────────────────────────────────

export interface Interval {
  low: number;
  high: number;
}

/** Детерминированное число [0, 1) из строки: интервал не «прыгает» при повторном открытии */
export const hashUnit = (key: string): number => {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Перемешивание, чтобы близкие строки давали далёкие числа
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/**
 * Интервал ширины 2×halfWidth, обязательно содержащий value. Положение истины внутри
 * интервала задаётся ключом (объявление + параметр + источник + ширина), а не случайно при
 * каждом показе. У края шкалы интервал сдвигается, а не теряет истинное значение.
 * Границы округляются наружу до целых — точное значение из них не восстановить.
 */
export const makeInterval = (value: number, halfWidth: number, key: string): Interval => {
  if (halfWidth <= 0) return { low: value, high: value };
  const width = 2 * halfWidth;
  let low = value - hashUnit(key) * width;
  let high = low + width;
  if (low < 0) {
    low = 0;
    high = Math.min(100, width);
  }
  if (high > 100) {
    high = 100;
    low = Math.max(0, 100 - width);
  }
  return { low: Math.max(0, Math.floor(Math.min(low, value))), high: Math.min(100, Math.ceil(Math.max(high, value))) };
};

export const pickerAccuracyFactor = (pickerLevel: number): number =>
  Math.max(B.PICKER_ACCURACY_FLOOR, 1 - B.PICKER_ACCURACY_STEP * (pickerLevel - 1));

export const scannerAccuracy = (pickerLevel: number): B.Accuracy => {
  const f = pickerAccuracyFactor(pickerLevel);
  return { tech: B.SCANNER_ACCURACY.tech * f, max: B.SCANNER_ACCURACY.max * f, paint: B.SCANNER_ACCURACY.paint * f };
};

export type DiagnosticsLevel = 'visual' | 'inspected' | 'scanned' | 'exact';

export interface ListingReadout {
  level: DiagnosticsLevel;
  tech: Interval;
  max: Interval;
  paint: Interval;
}

/**
 * Вложенная цепочка интервалов: каждый следующий (более точный) лежит внутри предыдущего,
 * поэтому сопоставление интервалов разных уровней не раскрывает больше, чем самый точный из них.
 * Положение внутри внешнего интервала задаётся ключом — повторный показ даёт то же самое.
 */
const nestedInterval = (value: number, width: number, outer: Interval, key: string): Interval => {
  const minLow = Math.max(outer.low, value - width);
  const maxLow = Math.min(outer.high - width, value);
  if (maxLow < minLow) return outer;
  const low = minLow + hashUnit(key) * (maxLow - minLow);
  return { low, high: low + width };
};

/** Полуширины по цепочке уточнений вплоть до нужного уровня диагностики */
const accuracyChain = (level: DiagnosticsLevel, pickerLevel: number): B.Accuracy[] => {
  const chain: B.Accuracy[] = [B.VISUAL_ACCURACY];
  if (level === 'visual') return chain;
  chain.push(B.INSPECT_ACCURACY);
  if (level === 'inspected') return chain;
  for (let l = 1; l <= Math.max(1, pickerLevel); l++) chain.push(scannerAccuracy(l));
  return chain;
};

const roundOut = (iv: Interval, value: number): Interval => ({
  low: Math.max(0, Math.floor(Math.min(iv.low, value))),
  high: Math.min(100, Math.ceil(Math.max(iv.high, value))),
});

/** Что игрок знает об объявлении при данном уровне диагностики */
export const readListing = (
  listingId: string,
  truth: { condition: number; maxCondition: number; paintCondition: number },
  level: DiagnosticsLevel,
  pickerLevel = 1,
): ListingReadout => {
  if (level === 'exact') {
    const exact = (v: number): Interval => ({ low: v, high: v });
    return { level, tech: exact(truth.condition), max: exact(truth.maxCondition), paint: exact(truth.paintCondition) };
  }
  const chain = accuracyChain(level, pickerLevel);
  const narrow = (param: 'tech' | 'max' | 'paint', value: number): Interval => {
    let iv: Interval = { low: 0, high: 100 };
    chain.forEach((acc, i) => {
      iv = nestedInterval(value, Math.min(100, 2 * acc[param]), iv, `${listingId}|${param}|${i}`);
    });
    return roundOut(iv, value);
  };
  return {
    level,
    tech: narrow('tech', truth.condition),
    max: narrow('max', truth.maxCondition),
    paint: narrow('paint', truth.paintCondition),
  };
};

/** Описание износа для осмотра — только по уже показанному интервалу, без точных значений */
export const describeWear = (paint: Interval, tech: Interval): string[] => {
  const paintMid = (paint.low + paint.high) / 2;
  const techMid = (tech.low + tech.high) / 2;
  const notes: string[] = [];
  if (paintMid >= 80) notes.push('Кузов блестит, сколов почти нет');
  else if (paintMid >= 55) notes.push('Мелкие сколы и потёртости на кузове');
  else if (paintMid >= 30) notes.push('Выгоревшая краска, заметные царапины');
  else notes.push('Ржавчина и облезшая краска');
  if (techMid >= 70) notes.push('Мотор работает ровно, подвеска тихая');
  else if (techMid >= 45) notes.push('Слышны стуки в подвеске, двигатель с шумом');
  else notes.push('Сильные вибрации, течи масла, машина просит ремонта');
  return notes;
};

// ─── «Торговля» ────────────────────────────────────────────────────────────

export const tradePurchaseBonus = (level: number): number => B.TRADE_PURCHASE_STEP * (level - 1);
export const tradeSaleBonus = (level: number): number => B.TRADE_SALE_STEP * (level - 1);

/** Итоговая цена покупки с навыком: скидка применяется к уже итоговой цене объявления */
export const tradePurchasePrice = (listingPrice: number, level: number): number =>
  Math.max(1, Math.round(listingPrice * (1 - tradePurchaseBonus(level))));

/** Выручка продажи с навыком — применяется один раз, при выставлении на продажу */
export const tradeSalePrice = (price: number, level: number): number => Math.round(price * (1 + tradeSaleBonus(level)));
