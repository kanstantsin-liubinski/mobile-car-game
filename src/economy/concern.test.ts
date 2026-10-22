/// <reference types="node" />
/** Тесты цели «Автомобильный концерн»: условия, покупка один раз, без кредита, игра продолжается */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as B from './balance.ts';
import * as E from './economy.ts';
import * as L from './legacy.ts';
import { concernAvailable, concernRequirements } from './concern.ts';

const $ = (d: number) => d * 100;

const richCareer = (): E.EconomyState => {
  const s = E.createEconomy($(B.CONCERN_PRICE + 1_000_000), true, true, 5, 30);
  const branch = (id: string, slots: number) => ({ garageId: id, slots: Array.from({ length: slots }, () => ({ mechanicId: null })) });
  return {
    ...s,
    player: { ...s.player, xp: { level: 80, xp: 0, totalXp: 0 } },
    branches: {
      garage_1: branch('garage_1', 1),
      garage_2: branch('garage_2', 2),
      garage_3: branch('garage_3', 4),
    } as unknown as E.EconomyState['branches'],
  };
};
const veteran = (): L.LegacyState => ({ ...L.createLegacy(), restarts: 3, careers: 3, pointsTotal: 25, reachedLevel100: true });

describe('цель «Концерн»', () => {
  it('все условия выполнены — можно купить', () => {
    const reqs = concernRequirements(richCareer(), veteran());
    assert.equal(reqs.length, 7);
    assert.ok(reqs.every((r) => r.done), JSON.stringify(reqs.filter((r) => !r.done)));
    assert.equal(concernAvailable(richCareer(), veteran()), true);
  });

  it('без 100 уровня, перезапусков, очков, сети, денег или с кредитом — нельзя', () => {
    const s = richCareer();
    assert.equal(concernAvailable(s, { ...veteran(), reachedLevel100: false }), false);
    assert.equal(concernAvailable(s, { ...veteran(), restarts: 2 }), false);
    assert.equal(concernAvailable(s, { ...veteran(), pointsTotal: 10 }), false);
    assert.equal(concernAvailable({ ...s, branches: {} }, veteran()), false);
    assert.equal(concernAvailable({ ...s, balanceCents: $(1_000) }, veteran()), false);
    const inDebt = { ...s, loan: { principalCents: $(10), issuedMonth: 1, dueMonth: 7 } };
    assert.equal(concernAvailable(inDebt, veteran()), false);
    assert.equal(E.buyConcern(inDebt).ok, false);
  });

  it('текущая карьера на 100 уровне засчитывается сразу', () => {
    const s = { ...richCareer(), player: { ...richCareer().player, xp: { level: 100, xp: 0, totalXp: 0 } } };
    assert.equal(concernRequirements(s, { ...veteran(), reachedLevel100: false })[0].done, true);
  });

  it('покупка — вложение $1 млрд, один раз; дальше игра идёт', () => {
    const s = richCareer();
    const res = E.buyConcern(s);
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, s.balanceCents - $(B.CONCERN_PRICE));
    assert.equal(res.state.ledger.investmentsCents, $(B.CONCERN_PRICE));
    assert.equal(res.state.concernPurchased, true);
    assert.equal(E.buyConcern(res.state).ok, false, 'второй раз не купить');
    assert.equal(concernAvailable(res.state, veteran()), false);
    assert.equal(E.getMonthResult(res.state, 0).netProfitCents, 0, 'вложение не уменьшает прибыль месяца');
  });
});
