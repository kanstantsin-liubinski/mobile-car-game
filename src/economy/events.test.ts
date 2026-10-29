/// <reference types="node" />
/** Тесты случайных событий сделок */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as Ev from './events.ts';
import { mulberry32 } from './hotOffers.ts';

/** Генератор, выдающий заданные числа по кругу */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

const buy = { level: 10, priceCents: 1_000_000, condition: 40, maxCondition: 70 };

describe('события при покупке', () => {
  it('скрытый дефект снижает максимум, но не ниже текущего состояния', () => {
    const e = Ev.rollPurchaseEvent(seq(0.01, 1), { ...buy, diag: 'visual' })!;
    assert.equal(e.kind, 'defect');
    if (e.kind !== 'defect') return;
    assert.equal(e.maxCondition, 70 - Ev.DEFECT_LOSS.max);
    const tight = Ev.rollPurchaseEvent(seq(0.01, 1), { ...buy, condition: 68, diag: 'visual' })!;
    assert.deepEqual(tight, { kind: 'defect', loss: 2, maxCondition: 68 });
    assert.equal(Ev.rollPurchaseEvent(seq(0.01, 1), { ...buy, condition: 70, diag: 'visual' }), null, 'снижать некуда');
  });

  it('риск зависит от проверки: после точной диагностики дефектов нет', () => {
    const rate = (diag: 'visual' | 'inspected' | 'scanned' | 'exact') => {
      const rng = mulberry32(5);
      let n = 0;
      for (let i = 0; i < 20_000; i++) if (Ev.rollPurchaseEvent(rng, { ...buy, diag })?.kind === 'defect') n++;
      return n / 20_000;
    };
    const visual = rate('visual');
    const inspected = rate('inspected');
    const scanned = rate('scanned');
    assert.ok(Math.abs(visual - Ev.DEFECT_CHANCE.visual) < 0.015, String(visual));
    assert.ok(visual > inspected && inspected > scanned);
    assert.equal(rate('exact'), 0);
  });

  it('находка приносит 2–5% цены; на 1 уровне событий нет', () => {
    const e = Ev.rollPurchaseEvent(seq(Ev.DEFECT_CHANCE.inspected + 0.01, 0.5, 0), { ...buy, diag: 'inspected' })!;
    assert.equal(e.kind, 'find');
    if (e.kind === 'find') assert.ok(e.cents >= 20_000 && e.cents <= 50_000, String(e.cents));
    assert.equal(Ev.rollPurchaseEvent(seq(0.01), { ...buy, level: 1, diag: 'visual' }), null);
  });
});

describe('покупатель во время продажи', () => {
  const sale = { level: 10, tier: 3, startedAtMs: 1_000, durationMs: 100_000 };

  it('быстрая сделка дешевле, коллекционер дороже; приходит в окне срока продажи', () => {
    const quick = Ev.rollSaleOffer(seq(0.1, 0.9, 0.5, 0.5), sale)!;
    assert.equal(quick.kind, 'quick');
    assert.ok(quick.mult >= Ev.QUICK_MULT.min && quick.mult <= Ev.QUICK_MULT.max);
    const collector = Ev.rollSaleOffer(seq(0.1, 0.1, 0.5, 0.5), sale)!;
    assert.equal(collector.kind, 'collector');
    assert.ok(collector.mult > 1);
    for (const o of [quick, collector]) {
      assert.ok(o.atMs >= 1_000 + 15_000 && o.atMs <= 1_000 + 60_000, String(o.atMs));
    }
    assert.equal(Ev.offerPrice(10_000, { ...collector, mult: 1.1 }), 11_000);
  });

  it('эконом-класс — без коллекционеров; мгновенная продажа и 1 уровень — без предложений', () => {
    assert.equal(Ev.rollSaleOffer(seq(0.1, 0.1, 0.5, 0.5), { ...sale, tier: 1 })!.kind, 'quick');
    assert.equal(Ev.rollSaleOffer(seq(0.1), { ...sale, durationMs: 0 }), null);
    assert.equal(Ev.rollSaleOffer(seq(0.1), { ...sale, level: 1 }), null);
    assert.equal(Ev.rollSaleOffer(seq(0.9), sale), null, 'не каждый раз');
  });
});
