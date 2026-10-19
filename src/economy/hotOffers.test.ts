/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOT_CHECK_INTERVAL_MS,
  HOT_GUARANTEE_MS,
  HOT_MAX_DISCOUNT,
  HOT_MAX_DURATION_MS,
  HOT_MIN_DISCOUNT,
  HOT_MIN_DURATION_MS,
  activeOffer,
  advanceHotOffers,
  createHotOfferState,
  discountedPrice,
  markOfferBought,
  markOfferNotified,
  restoreHotOfferState,
  rngForCheck,
  type HotOfferContext,
  type HotOfferState,
} from './hotOffers.ts';
import { DAY_MS } from './economy.ts';
import { hotOfferChance } from './progression.ts';

interface FakeListing {
  id: string;
  price: number;
  model: number;
}

const ctx = (chance: number, calls?: { n: number }): HotOfferContext<FakeListing> => ({
  chance,
  generate: (rng) => {
    if (calls) calls.n += 1;
    return { marketId: 'market', tier: 1, normalPrice: 10_000, listing: { id: 'x', price: 10_000, model: Math.floor(rng() * 100) } };
  },
  applyPrice: (listing, price, id) => ({ ...listing, price, id }),
});

const fresh = (seed = 42): HotOfferState<FakeListing> => createHotOfferState(seed, 0);

describe('шанс горящего предложения', () => {
  it('22% на 1 уровне, +5% относительно за уровень, потолок 60%', () => {
    assert.equal(hotOfferChance(1), 0.22);
    assert.ok(Math.abs(hotOfferChance(2) - 0.231) < 1e-9);
    assert.ok(Math.abs(hotOfferChance(20) - 0.429) < 1e-9);
    assert.equal(hotOfferChance(100), 0.6);
  });
});

describe('проверки', () => {
  it('до 10 игровых дней проверок нет', () => {
    const s = advanceHotOffers(fresh(), HOT_CHECK_INTERVAL_MS - 1, ctx(1));
    assert.equal(s.checksDone, 0);
    assert.equal(s.offer, null);
  });

  it('проверка ровно на 10-й день, шанс 100% — предложение появляется', () => {
    const s = advanceHotOffers(fresh(), HOT_CHECK_INTERVAL_MS, ctx(1));
    assert.equal(s.checksDone, 1);
    assert.equal(s.lastCheckAtMs, HOT_CHECK_INTERVAL_MS);
    assert.equal(s.nextCheckAtMs, 2 * HOT_CHECK_INTERVAL_MS);
    const offer = activeOffer(s, HOT_CHECK_INTERVAL_MS);
    assert.ok(offer);
    assert.equal(offer.createdAtMs, HOT_CHECK_INTERVAL_MS);
    assert.equal(offer.notified, false);
  });

  it('шанс 0 — без гарантии ничего не появляется', () => {
    const s = advanceHotOffers(fresh(), 8 * HOT_CHECK_INTERVAL_MS, ctx(0));
    assert.equal(s.checksDone, 8);
    assert.equal(s.offer, null);
  });

  it('90 дней без предложений — следующая проверка гарантирована', () => {
    const s = advanceHotOffers(fresh(), HOT_GUARANTEE_MS, ctx(0));
    assert.equal(s.checksDone, 9);
    assert.ok(s.offer);
    assert.equal(s.offer.createdAtMs, HOT_GUARANTEE_MS);
  });

  it('после предложения гарантия отсчитывается заново', () => {
    let s = advanceHotOffers(fresh(), HOT_GUARANTEE_MS, ctx(0));
    const firstId = s.offer!.id;
    s = advanceHotOffers(s, 2 * HOT_GUARANTEE_MS - HOT_CHECK_INTERVAL_MS, ctx(0));
    assert.equal(s.offer!.id, firstId);
    s = advanceHotOffers(s, 2 * HOT_GUARANTEE_MS, ctx(0));
    assert.notEqual(s.offer!.id, firstId);
  });

  it('пока активно предложение, второе не создаётся', () => {
    const state: HotOfferState<FakeListing> = {
      ...fresh(),
      offer: {
        id: 'long', marketId: 'market', tier: 1, listing: { id: 'long', price: 1, model: 0 },
        normalPrice: 2, price: 1, discount: 0.2, createdAtMs: 0, expiresAtMs: 15 * DAY_MS,
        status: 'active', notified: false,
      },
    };
    const calls = { n: 0 };
    const s = advanceHotOffers(state, HOT_CHECK_INTERVAL_MS, ctx(1, calls));
    assert.equal(calls.n, 0);
    assert.equal(s.offer!.id, 'long');
    assert.equal(s.checksDone, 1);
  });

  it('скидка 15–30% и длительность 2–4 дня, скидка только к цене', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = advanceHotOffers(fresh(seed), HOT_CHECK_INTERVAL_MS, ctx(1));
      const o = s.offer!;
      assert.ok(o.discount >= HOT_MIN_DISCOUNT && o.discount <= HOT_MAX_DISCOUNT, `${o.discount}`);
      const d = o.expiresAtMs - o.createdAtMs;
      assert.ok(d >= HOT_MIN_DURATION_MS && d <= HOT_MAX_DURATION_MS, `${d}`);
      assert.equal(o.normalPrice, 10_000);
      assert.equal(o.price, discountedPrice(10_000, o.discount));
      assert.equal(o.listing.price, o.price);
      assert.equal(o.listing.id, o.id);
    }
  });

  it('истекает по игровому времени', () => {
    let s = advanceHotOffers(fresh(), HOT_CHECK_INTERVAL_MS, ctx(1));
    const o = s.offer!;
    s = advanceHotOffers(s, o.expiresAtMs - 1, ctx(1));
    assert.ok(activeOffer(s, o.expiresAtMs - 1));
    s = advanceHotOffers(s, o.expiresAtMs, ctx(1));
    assert.equal(activeOffer(s, o.expiresAtMs), null);
    assert.equal(s.offer!.status, 'expired');
  });

  it('частота близка к шансу (детерминированный RNG)', () => {
    let hits = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) if (rngForCheck(7, i)() < 0.22) hits++;
    assert.ok(Math.abs(hits / N - 0.22) < 0.03, `${hits / N}`);
  });
});

describe('детерминизм и сохранение', () => {
  it('тот же seed — то же предложение, сколько бы раз ни пересчитывали', () => {
    const a = advanceHotOffers(fresh(99), HOT_GUARANTEE_MS, ctx(0.5));
    const b = advanceHotOffers(fresh(99), HOT_GUARANTEE_MS, ctx(0.5));
    assert.deepEqual(a, b);
  });

  it('пошаговый и разовый пересчёт дают одно и то же', () => {
    let step = fresh(5);
    for (let t = 0; t <= 3 * HOT_GUARANTEE_MS; t += 1000) step = advanceHotOffers(step, t, ctx(0.3));
    const once = advanceHotOffers(fresh(5), 3 * HOT_GUARANTEE_MS, ctx(0.3));
    assert.deepEqual(step, once);
  });

  it('перезагрузка через JSON не перебрасывает предложение', () => {
    const s = advanceHotOffers(fresh(3), HOT_CHECK_INTERVAL_MS, ctx(1));
    const restored = restoreHotOfferState<FakeListing>(JSON.parse(JSON.stringify(s)), HOT_CHECK_INTERVAL_MS);
    assert.deepEqual(restored, s);
    assert.deepEqual(advanceHotOffers(restored, HOT_CHECK_INTERVAL_MS + 5, ctx(1)), advanceHotOffers(s, HOT_CHECK_INTERVAL_MS + 5, ctx(1)));
  });

  it('битое сохранение — новый отсчёт от текущего времени', () => {
    const s = restoreHotOfferState<FakeListing>({ junk: true }, 500);
    assert.equal(s.nextCheckAtMs, 500 + HOT_CHECK_INTERVAL_MS);
    assert.equal(s.offer, null);
  });

  it('покупка и уведомление помечаются один раз и только для своего id', () => {
    let s = advanceHotOffers(fresh(), HOT_CHECK_INTERVAL_MS, ctx(1));
    const id = s.offer!.id;
    assert.equal(markOfferNotified(s, 'other'), s);
    s = markOfferNotified(s, id);
    assert.equal(s.offer!.notified, true);
    assert.equal(markOfferNotified(s, id), s);
    s = markOfferBought(s, id);
    assert.equal(s.offer!.status, 'bought');
    assert.equal(activeOffer(s, HOT_CHECK_INTERVAL_MS), null);
    assert.equal(markOfferBought(s, id), s);
  });
});
