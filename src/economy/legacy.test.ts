/// <reference types="node" />
/**
 * Тесты «Наследия»: очки и множители, условия и идемпотентность перезапуска, история карьер,
 * бонус к положительной марже (отдельная строка) и множитель опыта без двойного применения.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as B from './balance.ts';
import * as E from './economy.ts';
import * as L from './legacy.ts';
import { saleXp } from './progression.ts';

const $ = (d: number) => d * 100;

const career = (over: Partial<L.CareerSummary> = {}): L.CareerSummary => ({
  careerId: 'c1',
  level: 25,
  months: 60,
  carsSold: 80,
  baseProfitCents: $(1_000_000),
  netWorthCents: $(400_000),
  bestMonthProfitCents: $(30_000),
  branches: 1,
  hasDebt: false,
  bankrupt: false,
  pointsDuring: 0,
  ...over,
});

describe('формулы наследия', () => {
  it('очки = floor(10 × √(прибыль / $1M))', () => {
    assert.equal(L.legacyPointsTotal(0), 0);
    assert.equal(L.legacyPointsTotal($(250_000)), 5);
    assert.equal(L.legacyPointsTotal($(1_000_000)), 10);
    assert.equal(L.legacyPointsTotal($(100_000_000)), 100);
    assert.equal(L.legacyPointsTotal(-$(5_000)), 0);
  });

  it('множитель прибыли 1 + 0,04P + 0,0015P², опыта min(2,5; 1 + 0,02P)', () => {
    assert.equal(L.legacyProfitMultiplier(0), 1);
    assert.ok(Math.abs(L.legacyProfitMultiplier(10) - 1.55) < 1e-12);
    assert.ok(Math.abs(L.legacyXpMultiplier(10) - 1.2) < 1e-12);
    assert.equal(L.legacyXpMultiplier(500), B.LEGACY_XP_MAX);
    assert.equal(L.legacyProfitMultiplier(300), B.LEGACY_PROFIT_MAX, 'без разгона: потолок множителя прибыли');
    assert.equal(L.legacyMarginBonusCents(10, -$(100)), 0, 'за убыток бонуса нет');
    assert.equal(L.legacyMarginBonusCents(10, $(1000)), $(550));
  });
});

describe('перезапуск', () => {
  it('условия: 20 уровень, без долга, стоимость бизнеса, новые очки', () => {
    const legacy = L.createLegacy();
    assert.match(L.restartPreview(legacy, career({ level: 19 })).blocks[0], /20 уровень/);
    assert.ok(L.restartPreview(legacy, career({ hasDebt: true })).blocks.some((b) => /кредит/.test(b)));
    assert.ok(L.restartPreview(legacy, career({ netWorthCents: $(5_000) })).blocks.some((b) => /Стоимость/.test(b)));
    assert.ok(L.restartPreview(legacy, career({ baseProfitCents: $(1_000) })).blocks.some((b) => /новых очков/.test(b)));
    const ok = L.restartPreview(legacy, career());
    assert.equal(ok.available, true);
    assert.equal(ok.gain, 10);
    assert.ok(ok.resets.length > 0 && ok.keeps.length > 0);
  });

  it('начисляются только новые очки; повтор той же карьеры ничего не даёт', () => {
    let legacy = L.applyRestart(L.createLegacy(), career());
    assert.equal(legacy.pointsTotal, 10);
    assert.equal(legacy.restarts, 1);
    assert.equal(legacy.history[0].pointsEarned, 10);
    assert.equal(L.applyRestart(legacy, career()), legacy, 'та же карьера второй раз не закрывается');
    // Вторая карьера с той же прибылью: всего √2 × 10 = 14 → +4
    legacy = L.applyRestart(legacy, career({ careerId: 'c2' }));
    assert.equal(legacy.pointsTotal, 14);
    assert.equal(legacy.history[1].pointsEarned, 4);
    assert.equal(legacy.lifetimeBaseProfitCents, $(2_000_000));
  });

  it('банкротство и «Новая игра» не стирают наследие и не дают очков', () => {
    const legacy = L.applyRestart(L.createLegacy(), career());
    const after = L.recordCareerEnd(legacy, career({ careerId: 'c2', bankrupt: true }), 'bankruptcy');
    assert.equal(after.pointsTotal, legacy.pointsTotal);
    assert.equal(after.careers, 2);
    assert.equal(after.history[1].end, 'bankruptcy');
    assert.equal(L.recordCareerEnd(after, career({ careerId: 'c2' }), 'new_game'), after);
  });

  it('рекорды и 100 уровень сохраняются; старое сохранение восстанавливается', () => {
    const legacy = L.applyRestart(L.createLegacy(), career({ level: 100 }));
    assert.equal(legacy.reachedLevel100, true);
    assert.equal(legacy.records.bestLevel, 100);
    const round = L.restoreLegacy(JSON.parse(JSON.stringify(legacy)));
    assert.deepEqual(round, legacy);
    assert.deepEqual(L.restoreLegacy(null), L.createLegacy());
  });
});

describe('бонусы в карьере', () => {
  const withCar = (points: number) => {
    const s = E.createEconomy($(50_000), true, true, 3, points);
    return E.buyCar(s, { carId: 'car', name: 'Lada', tier: 1, priceCents: $(5_000), conditionPct: 40, maxConditionPct: 80 }).state;
  };

  it('прибыльная продажа: бонус отдельной строкой, XP × множитель один раз, база месяца — без множителя', () => {
    const s = withCar(10);
    const sold = E.sellCar(s, { carId: 'car', priceCents: $(7_000), fallbackCostCents: 0, tier: 1 });
    const bonus = L.legacyMarginBonusCents(10, $(2_000));
    assert.equal(sold.ledger.legacyBonusCents, bonus);
    assert.equal(sold.balanceCents, s.balanceCents + $(7_000) + bonus);
    const base = saleXp(1, $(7_000), $(5_000), 0);
    assert.equal(sold.ledger.salesXp, base);
    assert.equal(sold.player.xp.totalXp, Math.round(base * 1.2));
    const month = E.getMonthResult(sold, 0);
    assert.equal(month.legacyBonusCents, bonus);
    assert.equal(month.netProfitCents, $(2_000) + bonus);
    assert.equal(E.careerBaseProfitCents(sold, 0), $(2_000), 'база очков — без бонуса');
    assert.equal(E.sellCar(sold, { carId: 'car', priceCents: $(7_000), fallbackCostCents: 0 }), sold, 'повтор продажи не начисляет');
  });

  it('убыточная продажа: ни бонуса, ни опыта', () => {
    const s = withCar(30);
    const sold = E.sellCar(s, { carId: 'car', priceCents: $(4_000), fallbackCostCents: 0, tier: 1 });
    assert.equal(sold.ledger.legacyBonusCents, 0);
    assert.equal(sold.player.xp.totalXp, 0);
  });

  it('без наследия всё как раньше', () => {
    const s = withCar(0);
    const sold = E.sellCar(s, { carId: 'car', priceCents: $(7_000), fallbackCostCents: 0, tier: 1 });
    assert.equal(sold.ledger.legacyBonusCents, 0);
    assert.equal(sold.player.xp.totalXp, saleXp(1, $(7_000), $(5_000), 0));
  });

  it('итоги карьеры для перезапуска: стоимость бизнеса и прибыль без бонуса', () => {
    const s = withCar(10);
    const sum = E.careerSummary(s, 0, $(25_000));
    assert.equal(sum.netWorthCents, s.balanceCents + $(5_000) + $(25_000));
    assert.equal(sum.pointsDuring, 10);
    assert.equal(sum.careerId, s.careerId);
  });
});
