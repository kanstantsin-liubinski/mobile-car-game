/**
 * Горящие предложения авторынка: раз в 10 игровых дней — проверка с шансом от навыка «Менеджмент».
 * Одновременно активно не больше одного предложения; если 90 дней не было ни одного — следующая проверка гарантирована.
 * Все случайности детерминированы (seed + номер проверки), поэтому перезагрузка ничего не перебрасывает.
 * Модуль не знает, как устроена машина: объявление генерирует и уценивает вызывающий код.
 */
import { DAY_MS } from './time.ts';

export const HOT_CHECK_INTERVAL_MS = 10 * DAY_MS;
export const HOT_GUARANTEE_MS = 90 * DAY_MS;
export const HOT_MIN_DISCOUNT = 0.15;
export const HOT_MAX_DISCOUNT = 0.3;
export const HOT_MIN_DURATION_MS = 2 * DAY_MS;
export const HOT_MAX_DURATION_MS = 4 * DAY_MS;

export type HotOfferStatus = 'active' | 'bought' | 'expired';

export interface HotOffer<T> {
  id: string;
  marketId: string;
  tier: number;
  /** Объявление уже со сниженной ценой */
  listing: T;
  /** Обычная цена этой машины на рынке */
  normalPrice: number;
  /** Цена со скидкой — именно её платит игрок */
  price: number;
  /** Доля скидки, 0.15–0.30 */
  discount: number;
  createdAtMs: number;
  expiresAtMs: number;
  status: HotOfferStatus;
  /** Уведомление по этому предложению уже показано */
  notified: boolean;
}

export interface HotOfferState<T> {
  seed: number;
  /** Сколько проверок уже проведено — номер следующей проверки для RNG */
  checksDone: number;
  nextCheckAtMs: number;
  lastCheckAtMs: number | null;
  /** Когда появилось последнее предложение (или когда стартовал отсчёт) — для гарантии */
  lastOfferAtMs: number;
  /** Последнее предложение: активное, купленное или истёкшее */
  offer: HotOffer<T> | null;
}

export interface HotOfferDraft<T> {
  marketId: string;
  tier: number;
  listing: T;
  normalPrice: number;
}

export interface HotOfferContext<T> {
  /** Шанс на проверке (от текущего уровня менеджмента) */
  chance: number;
  /** Сгенерировать обычное объявление, используя только переданный rng; null — генерировать нечего */
  generate: (rng: () => number) => HotOfferDraft<T> | null;
  /** Вернуть объявление с новой ценой */
  applyPrice: (listing: T, price: number, offerId: string) => T;
}

// ─── Детерминированный RNG ─────────────────────────────────────────────────

export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Свой независимый поток случайностей для каждой проверки */
export const rngForCheck = (seed: number, checkIndex: number): (() => number) =>
  mulberry32((Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(checkIndex + 1, 0x85ebca6b)) >>> 0);

export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;

// ─── Состояние ─────────────────────────────────────────────────────────────

export const createHotOfferState = <T>(seed: number, now: number): HotOfferState<T> => ({
  seed: seed >>> 0,
  checksDone: 0,
  nextCheckAtMs: now + HOT_CHECK_INTERVAL_MS,
  lastCheckAtMs: null,
  lastOfferAtMs: now,
  offer: null,
});

export const discountedPrice = (normalPrice: number, discount: number): number =>
  Math.max(1, Math.round(normalPrice * (1 - discount)));

export const isOfferActive = <T>(offer: HotOffer<T> | null | undefined, now: number): offer is HotOffer<T> =>
  !!offer && offer.status === 'active' && now < offer.expiresAtMs;

export const activeOffer = <T>(s: HotOfferState<T>, now: number): HotOffer<T> | null =>
  isOfferActive(s.offer, now) ? s.offer : null;

const expireAt = <T>(s: HotOfferState<T>, now: number): HotOfferState<T> =>
  s.offer && s.offer.status === 'active' && now >= s.offer.expiresAtMs
    ? { ...s, offer: { ...s.offer, status: 'expired' } }
    : s;

/** Одна проверка в момент t (номер проверки — checksDone) */
const runCheck = <T>(s: HotOfferState<T>, t: number, ctx: HotOfferContext<T>): HotOfferState<T> => {
  const index = s.checksDone;
  const next = { ...s, checksDone: index + 1, lastCheckAtMs: t, nextCheckAtMs: t + HOT_CHECK_INTERVAL_MS };
  // Пока висит активное предложение, второе не появляется
  if (isOfferActive(s.offer, t)) return next;

  const rng = rngForCheck(s.seed, index);
  const roll = rng();
  const guaranteed = t - s.lastOfferAtMs >= HOT_GUARANTEE_MS;
  if (!guaranteed && roll >= ctx.chance) return next;

  const discount = Math.round((HOT_MIN_DISCOUNT + rng() * (HOT_MAX_DISCOUNT - HOT_MIN_DISCOUNT)) * 100) / 100;
  const durationMs =
    Math.round((HOT_MIN_DURATION_MS + rng() * (HOT_MAX_DURATION_MS - HOT_MIN_DURATION_MS)) / 1000) * 1000;
  const draft = ctx.generate(rng);
  if (!draft) return next;

  const id = `hot-${s.seed.toString(36)}-${index}`;
  const price = discountedPrice(draft.normalPrice, discount);
  return {
    ...next,
    lastOfferAtMs: t,
    offer: {
      id,
      marketId: draft.marketId,
      tier: draft.tier,
      listing: ctx.applyPrice(draft.listing, price, id),
      normalPrice: draft.normalPrice,
      price,
      discount,
      createdAtMs: t,
      expiresAtMs: t + durationMs,
      status: 'active',
      notified: false,
    },
  };
};

/** Провести все проверки, наступившие к моменту now, и снять истёкшее предложение */
export const advanceHotOffers = <T>(s0: HotOfferState<T>, now: number, ctx: HotOfferContext<T>): HotOfferState<T> => {
  let s = s0;
  // Время идёт только в активной игре, так что догонять приходится немного; предохранитель на всякий случай
  for (let guard = 0; s.nextCheckAtMs <= now && guard < 10_000; guard++) {
    const t = s.nextCheckAtMs;
    s = runCheck(expireAt(s, t), t, ctx);
  }
  return expireAt(s, now);
};

export const markOfferBought = <T>(s: HotOfferState<T>, offerId: string): HotOfferState<T> =>
  s.offer && s.offer.id === offerId && s.offer.status === 'active'
    ? { ...s, offer: { ...s.offer, status: 'bought' } }
    : s;

export const markOfferNotified = <T>(s: HotOfferState<T>, offerId: string): HotOfferState<T> =>
  s.offer && s.offer.id === offerId && !s.offer.notified ? { ...s, offer: { ...s.offer, notified: true } } : s;

/** Восстановление из сохранения: битые данные — начинаем отсчёт заново */
export const restoreHotOfferState = <T>(raw: unknown, now: number): HotOfferState<T> => {
  const r = raw as Partial<HotOfferState<T>> | null | undefined;
  if (!r || typeof r.seed !== 'number' || typeof r.nextCheckAtMs !== 'number') {
    return createHotOfferState(randomSeed(), now);
  }
  return {
    seed: r.seed >>> 0,
    checksDone: typeof r.checksDone === 'number' ? r.checksDone : 0,
    nextCheckAtMs: r.nextCheckAtMs,
    lastCheckAtMs: typeof r.lastCheckAtMs === 'number' ? r.lastCheckAtMs : null,
    lastOfferAtMs: typeof r.lastOfferAtMs === 'number' ? r.lastOfferAtMs : now,
    offer: r.offer ?? null,
  };
};
