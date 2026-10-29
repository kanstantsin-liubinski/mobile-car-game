/**
 * Случайные события сделок: делают перепродажу менее предсказуемой.
 *
 * При покупке с рук:
 *  - скрытый дефект — технический максимум машины оказывается ниже, чем казалось. Риск зависит от
 *    того, насколько тщательно игрок смотрел объявление: без осмотра выше, со сканером — редко,
 *    после сторонней диагностики (точные цифры) — никогда;
 *  - находка — в машине что-то ценное (комплект резины, магнитола), сразу продаётся: немного денег.
 *
 * Во время продажи — покупатель с предложением:
 *  - «быстрая сделка» — забрать машину прямо сейчас чуть дешевле выставленной цены;
 *  - коллекционер (Премиум и выше) — дороже выставленной цены, тоже сразу.
 * Игрок принимает или отказывается; отказ ничего не стоит, продажа идёт дальше.
 *
 * События начинаются со 2 уровня: первая покупка и продажа в обучении идут без сюрпризов.
 */
import type { DiagnosticsLevel } from './carCondition.ts';

export const EVENTS_MIN_LEVEL = 2;

/** Шанс скрытого дефекта по тщательности проверки объявления */
export const DEFECT_CHANCE: Record<DiagnosticsLevel, number> = { visual: 0.18, inspected: 0.1, scanned: 0.04, exact: 0 };
/** Насколько дефект снижает технический максимум, пунктов */
export const DEFECT_LOSS = { min: 2, max: 6 };
export const FIND_CHANCE = 0.06;
/** Находка — доля цены покупки */
export const FIND_SHARE = { min: 0.02, max: 0.05 };

export const SALE_OFFER_CHANCE = 0.25;
/** Доля коллекционеров среди предложений на машины Премиум и выше */
export const COLLECTOR_SHARE = 0.35;
export const QUICK_MULT = { min: 0.93, max: 0.98 };
export const COLLECTOR_MULT = { min: 1.05, max: 1.12 };
/** Покупатель появляется на этом отрезке срока продажи */
export const OFFER_WINDOW = { from: 0.15, to: 0.6 };

const FINDS = ['комплект зимней резины', 'почти новую магнитолу', 'набор инструментов в багажнике', 'оригинальные коврики', 'запасной ключ с сигнализацией'];

const between = (rng: () => number, r: { min: number; max: number }) => r.min + rng() * (r.max - r.min);

export type PurchaseEvent =
  | { kind: 'defect'; /** на сколько снизился максимум */ loss: number; maxCondition: number }
  | { kind: 'find'; cents: number; item: string };

export const rollPurchaseEvent = (
  rng: () => number,
  p: { level: number; diag: DiagnosticsLevel; priceCents: number; condition: number; maxCondition: number },
): PurchaseEvent | null => {
  if (p.level < EVENTS_MIN_LEVEL) return null;
  const roll = rng();
  const defect = DEFECT_CHANCE[p.diag];
  if (roll < defect) {
    // Максимум не опускается ниже текущего состояния: машина не становится «сломаннее», чем есть
    const loss = Math.round(between(rng, DEFECT_LOSS) * 10) / 10;
    const maxCondition = Math.max(p.condition, Math.round((p.maxCondition - loss) * 10) / 10);
    const real = Math.round((p.maxCondition - maxCondition) * 10) / 10;
    return real > 0 ? { kind: 'defect', loss: real, maxCondition } : null;
  }
  if (roll < defect + FIND_CHANCE) {
    const cents = Math.max(100, Math.round((p.priceCents * between(rng, FIND_SHARE)) / 100) * 100);
    return { kind: 'find', cents, item: FINDS[Math.floor(rng() * FINDS.length)] };
  }
  return null;
};

export interface SaleOffer {
  kind: 'quick' | 'collector';
  /** Цена предложения = выставленная цена × mult */
  mult: number;
  /** Когда покупатель придёт (игровое время) */
  atMs: number;
  /** Игрок уже ответил */
  answered?: boolean;
}

export const rollSaleOffer = (
  rng: () => number,
  p: { level: number; tier?: number; startedAtMs: number; durationMs: number },
): SaleOffer | null => {
  if (p.level < EVENTS_MIN_LEVEL || p.durationMs <= 0 || rng() >= SALE_OFFER_CHANCE) return null;
  const collector = (p.tier ?? 1) >= 3 && rng() < COLLECTOR_SHARE;
  const mult = Math.round(between(rng, collector ? COLLECTOR_MULT : QUICK_MULT) * 1000) / 1000;
  const at = p.startedAtMs + Math.round(p.durationMs * (OFFER_WINDOW.from + rng() * (OFFER_WINDOW.to - OFFER_WINDOW.from)));
  return { kind: collector ? 'collector' : 'quick', mult, atMs: at };
};

/** Цена предложения в долларах (как цена продажи в гараже), до целого */
export const offerPrice = (sellPrice: number, offer: SaleOffer): number => Math.round(sellPrice * offer.mult);
