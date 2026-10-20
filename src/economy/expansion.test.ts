/// <reference types="node" />
/**
 * Тесты расширения: ЛКП и общее состояние, скрытые черты, интервалы диагностики, «Подборщик»,
 * «Торговля», оборудование и камера, покраска, заказы и репутация, курсы пяти навыков, миграция.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as B from './balance.ts';
import * as C from './carCondition.ts';
import * as O from './orders.ts';
import * as E from './economy.ts';
import { DAY_MS, MONTH_MS } from './time.ts';
import { mulberry32 } from './hotOffers.ts';
import { COURSE_COOLDOWN_MS, requiredPickerPractice, requiredTradePractice, requiredPractice } from './progression.ts';
import { calculateCarPrice, calculateMaxCondition } from '../utils/priceCalculator.ts';

const $ = (d: number) => d * 100;
const must = <T,>(v: T | null | undefined): T => {
  assert.ok(v !== null && v !== undefined);
  return v as T;
};

// ─── ЛКП и общее состояние ─────────────────────────────────────────────────

describe('общее состояние и ЛКП', () => {
  it('0,8 × тех + 0,2 × ЛКП; максимум 0,8 × тех. максимум + 20', () => {
    assert.equal(C.overallCondition(50, 100), 60);
    assert.equal(C.overallCondition(80, 30), 70);
    assert.equal(C.overallMax(60), 68);
  });

  it('без ЛКП (старое сохранение) общее = техническому — цена не меняется', () => {
    assert.equal(C.overallCondition(42.5), 42.5);
    const car = { year: 2010, mileage: 150_000, condition: 42.5 };
    assert.equal(C.carValue(20_000, car), calculateCarPrice(20_000, car));
  });

  it('технический ремонт не меняет ЛКП, покраска не меняет тех. максимум (модель хранит их раздельно)', () => {
    const before = { year: 2012, mileage: 120_000, condition: 40, paintCondition: 50 };
    const repaired = { ...before, condition: 60 };
    const painted = { ...before, paintCondition: 100 };
    assert.equal(repaired.paintCondition, 50);
    assert.equal(painted.condition, 40);
    assert.ok(C.carValue(20_000, painted) > C.carValue(20_000, before));
  });

  it('ЛКП учитывается в цене ровно один раз', () => {
    const car = { year: 2015, mileage: 80_000, condition: 50, paintCondition: 50 };
    const gain = C.carValue(30_000, { ...car, paintCondition: 100 }) - C.carValue(30_000, car);
    const expected = C.paintValueGain(30_000, car.year, car.mileage, 50, 100);
    assert.ok(Math.abs(gain - expected) <= 1, `${gain} vs ${expected}`);
  });
});

describe('скрытые черты экземпляра', () => {
  it('максимум = формула + отклонение [−10; +3], состояние не выше максимума, всё в пределах', () => {
    for (let seed = 1; seed <= 400; seed++) {
      const rng = mulberry32(seed);
      const year = 1998 + (seed % 27);
      const mileage = 5_000 + ((seed * 7919) % 450_000);
      const t = C.generateTraits(year, mileage, 2026, rng);
      const base = calculateMaxCondition(year, mileage);
      assert.ok(t.maxCondition >= Math.max(B.MIN_TECH_MAX, base + B.MAX_OFFSET_MIN) - 0.05, `${t.maxCondition} ${base}`);
      assert.ok(t.maxCondition <= Math.min(100, base + B.MAX_OFFSET_MAX) + 0.05);
      assert.ok(t.condition <= t.maxCondition && t.condition >= 0);
      assert.ok(t.paintCondition >= B.PAINT_MIN && t.paintCondition <= 100);
      assert.ok(t.sellerFactor >= B.SELLER_FACTOR_MIN && t.sellerFactor <= B.SELLER_FACTOR_MAX);
    }
  });

  it('ЛКП в среднем хуже у старых машин, но у одного года разное', () => {
    const avg = (year: number) => {
      let sum = 0;
      const set = new Set<number>();
      for (let i = 0; i < 200; i++) {
        const p = C.generateTraits(year, (2026 - year) * 15_000, 2026, mulberry32(i + year * 1000)).paintCondition;
        sum += p;
        set.add(p);
      }
      return { mean: sum / 200, distinct: set.size };
    };
    const old = avg(2000);
    const fresh = avg(2022);
    assert.ok(old.mean < fresh.mean - 20, `${old.mean} ${fresh.mean}`);
    assert.ok(old.distinct > 50);
  });
});

// ─── Диагностика ───────────────────────────────────────────────────────────

describe('интервалы диагностики', () => {
  const truth = { condition: 47.3, maxCondition: 71.2, paintCondition: 3.4 };

  it('каждый интервал содержит истину и лежит в 0–100 (включая края шкалы)', () => {
    for (let i = 0; i < 2000; i++) {
      const v = (i * 37) % 1001 / 10;
      for (const half of [15, 10, 6, 2.5]) {
        const iv = C.makeInterval(v, half, `L${i}|x|${half}`);
        assert.ok(iv.low <= v && v <= iv.high, `${v} in [${iv.low}, ${iv.high}]`);
        assert.ok(iv.low >= 0 && iv.high <= 100);
      }
    }
  });

  it('интервалы всех уровней содержат истину, вложены друг в друга и не выходят за 0–100', () => {
    for (let i = 0; i < 600; i++) {
      const t = { condition: (i * 37) % 1001 / 10, maxCondition: (i * 53) % 1001 / 10, paintCondition: (i * 71) % 1001 / 10 };
      const levels = [
        C.readListing(`L${i}`, t, 'visual'),
        C.readListing(`L${i}`, t, 'inspected'),
        C.readListing(`L${i}`, t, 'scanned', 1),
        C.readListing(`L${i}`, t, 'scanned', 10),
        C.readListing(`L${i}`, t, 'scanned', 20),
      ];
      for (const r of levels) {
        assert.ok(r.tech.low <= t.condition && t.condition <= r.tech.high);
        assert.ok(r.max.low <= t.maxCondition && t.maxCondition <= r.max.high);
        assert.ok(r.paint.low <= t.paintCondition && t.paintCondition <= r.paint.high);
        assert.ok(r.tech.low >= 0 && r.tech.high <= 100);
      }
      for (let k = 1; k < levels.length; k++) {
        for (const p of ['tech', 'max', 'paint'] as const) {
          assert.ok(levels[k][p].low >= levels[k - 1][p].low && levels[k][p].high <= levels[k - 1][p].high, `вложенность ${p}`);
        }
      }
    }
  });

  it('без оборудования — интервалы, повторное открытие даёт те же значения', () => {
    const a = C.readListing('car-1', truth, 'visual');
    const b = C.readListing('car-1', truth, 'visual');
    assert.deepEqual(a, b);
    assert.ok(a.tech.high - a.tech.low >= 29);
    assert.ok(a.max.high - a.max.low >= 19);
  });

  it('сканер уже бесплатного осмотра, «Подборщик» сужает дальше, но не ниже 35%', () => {
    const width = (r: C.ListingReadout) => r.tech.high - r.tech.low;
    const visual = C.readListing('car-2', truth, 'visual');
    const scan1 = C.readListing('car-2', truth, 'scanned', 1);
    const scan20 = C.readListing('car-2', truth, 'scanned', 20);
    assert.ok(width(scan1) < width(visual));
    assert.ok(width(scan20) < width(scan1));
    assert.equal(C.pickerAccuracyFactor(1), 1);
    assert.ok(Math.abs(C.pickerAccuracyFactor(10) - 0.73) < 1e-9);
    assert.ok(Math.abs(C.pickerAccuracyFactor(20) - 0.43) < 1e-9);
    assert.equal(C.pickerAccuracyFactor(100), 0.35);
    assert.ok(Math.abs(C.scannerAccuracy(10).tech - 7.3) < 1e-9);
  });

  it('сторонняя диагностика раскрывает точные значения', () => {
    const r = C.readListing('car-3', truth, 'exact');
    assert.deepEqual(r.tech, { low: 47.3, high: 47.3 });
    assert.deepEqual(r.paint, { low: 3.4, high: 3.4 });
  });

  it('осмотр полезен, но хуже сканера', () => {
    assert.ok(B.INSPECT_ACCURACY.tech < B.VISUAL_ACCURACY.tech);
    assert.ok(B.SCANNER_ACCURACY.tech < B.INSPECT_ACCURACY.tech);
  });
});

describe('практика «Подборщика»', () => {
  it('осмотр: +5 один раз за объявление и не больше 30 в месяц', () => {
    let s = E.createEconomy(0, true, true, 1);
    s = E.recordInspection(s, 'a');
    s = E.recordInspection(s, 'a');
    assert.equal(s.player.picker.practice, 5);
    for (let i = 0; i < 10; i++) s = E.recordInspection(s, `x${i}`);
    assert.equal(s.player.picker.practice, 30);
  });

  it('сканер: +40 за первую диагностику объявления, без сканера нельзя', () => {
    let s = E.createEconomy($(10_000), true, true, 1);
    assert.equal(E.recordScan(s, 'a').ok, false);
    s = { ...s, player: { ...s.player, xp: { level: 3, xp: 0, totalXp: 0 } } };
    s = E.buyEquipment(s, 'scanner').state;
    s = E.recordScan(s, 'a').state;
    s = E.recordScan(s, 'a').state;
    assert.equal(s.player.picker.practice, 40);
  });

  it('сторонняя диагностика: цена по классу, без практики, повтор не списывает', () => {
    let s = E.createEconomy($(10_000), true, true, 1);
    s = must(E.payServiceDiagnostics(s, 'a', 2).state);
    assert.equal(s.balanceCents, $(9_500));
    assert.equal(s.ledger.diagnosticsCents, $(500));
    s = E.payServiceDiagnostics(s, 'a', 2).state;
    assert.equal(s.balanceCents, $(9_500));
    assert.equal(s.player.picker.practice, 0);
    assert.equal(E.serviceDiagnosticsCents(5), $(2_000));
    assert.equal(E.getMonthResult(s, 0).netProfitCents, -$(500));
  });

  it('порог: 200 + 45 за уровень', () => {
    assert.equal(requiredPickerPractice(1), 200);
    assert.equal(requiredPickerPractice(3), 290);
  });
});

// ─── Торговля ──────────────────────────────────────────────────────────────

describe('«Торговля»', () => {
  it('бонусы: 0,2% и 0,15% за уровень; на 20-м — 3,8% и 2,85%', () => {
    assert.equal(C.tradePurchaseBonus(1), 0);
    assert.ok(Math.abs(C.tradePurchaseBonus(20) - 0.038) < 1e-12);
    assert.ok(Math.abs(C.tradeSaleBonus(20) - 0.0285) < 1e-12);
    assert.equal(C.tradePurchasePrice(10_000, 20), 9_620);
    assert.equal(C.tradeSalePrice(10_000, 20), 10_285);
  });

  it('скидки перемножаются: продавец → горящее → навык', () => {
    const normal = 10_000;
    const seller = Math.round(normal * 0.9);
    const hot = Math.round(seller * (1 - 0.2));
    assert.equal(C.tradePurchasePrice(hot, 11), Math.round(7_200 * (1 - 0.02)));
  });

  it('практика: +80 / +20 / 0 за продажу, порог 300 + 65', () => {
    const car = { carId: 'c', name: 'C', tier: 1, priceCents: $(1000) };
    const sold = (p: number) => E.sellCar(E.buyCar(E.createEconomy($(5000), true, true, 1), car).state, { carId: 'c', priceCents: $(p), fallbackCostCents: 0 });
    assert.equal(sold(1200).player.trade.practice, 80);
    assert.equal(sold(1050).player.trade.practice, 20);
    assert.equal(sold(900).player.trade.practice, 0);
    assert.equal(requiredTradePractice(1), 300);
  });
});

// ─── Оборудование и камера ─────────────────────────────────────────────────

describe('оборудование', () => {
  const leveled = (level: number, balance = 100_000) => {
    const s = E.createEconomy($(balance), true, true, 1);
    return { ...s, player: { ...s.player, xp: { level, xp: 0, totalXp: 0 } } };
  };

  it('базовый набор есть со старта; остальное — по уровню и за деньги, как вложение', () => {
    assert.ok(E.hasEquipment(leveled(1), 'basic_tools'));
    assert.equal(E.equipmentBlock(leveled(2), 'scanner'), 'level');
    assert.equal(E.equipmentBlock(leveled(3, 100), 'scanner'), 'money');
    const s = E.buyEquipment(leveled(3), 'scanner').state;
    assert.ok(E.hasEquipment(s, 'scanner'));
    assert.equal(s.ledger.investmentsCents, $(3_000));
    assert.equal(E.getMonthResult(s, 0).netProfitCents, 0, 'вложение не убыток месяца');
    assert.equal(E.buyEquipment(s, 'scanner').ok, false, 'второй раз не покупается');
  });

  it('камера занимает ровно один слот и требует оставить обычный слот', () => {
    let s = E.buyEquipment(leveled(5), 'paint_booth').state;
    assert.equal(E.boothInstallBlock(s, 0, 1), 'last-slot');
    assert.equal(E.boothInstallBlock(s, 2, 2), 'bad-slot');
    s = E.installBooth(s, 1, 2).state;
    assert.equal(s.equipment.boothSlot, 1);
    assert.equal(E.installBooth(s, 0, 2).ok, false, 'вторую не поставить');
    // Переезд в больший гараж: камера и оборудование остаются (это состояние экономики)
    const restored = must(E.deserializeEconomy(E.serializeEconomy(s, 0))).state;
    assert.equal(restored.equipment.boothSlot, 1);
    assert.ok(restored.equipment.owned.includes('paint_booth'));
    s = E.uninstallBooth(s);
    assert.equal(s.equipment.boothSlot, null);
    assert.ok(E.hasEquipment(s, 'paint_booth'));
  });

  it('проф. инструменты: +15% к тапу ремонта, не к покраске и не к окладу', () => {
    let s = E.buyEquipment(leveled(10), 'pro_tools').state;
    assert.ok(Math.abs(E.playerTapMultiplier(s) - 1.15) < 1e-12);
    assert.equal(E.paintTapMultiplier(s), 1);
    s = E.startContract(s, 'm', 0);
    assert.equal(s.contracts.m.monthlyCents, E.MECHANIC_MONTHLY_SALARY_CENTS);
  });
});

// ─── Покраска и маляры ─────────────────────────────────────────────────────

describe('покраска и маляры', () => {
  it('затраты на покраску своей машины — в себестоимость, не в расход месяца', () => {
    let s = E.buyCar(E.createEconomy($(10_000), true, true, 1), { carId: 'c', name: 'C', tier: 1, priceCents: $(2000) }).state;
    s = must(E.spendOnCar(s, 'c', $(300), 'paint:c:1').state);
    assert.equal(s.balanceCents, $(7_700));
    assert.equal(s.assets.c.extraCostsCents, $(300));
    assert.equal(s.ledger.carExtraCostsCents, $(300));
    s = E.spendOnCar(s, 'c', $(300), 'paint:c:1').state;
    assert.equal(s.balanceCents, $(7_700), 'повтор операции не списывает');
    s = E.sellCar(s, { carId: 'c', priceCents: $(2600), fallbackCostCents: 0 });
    assert.equal(E.getMonthResult(s, 0).dealProfitCents, $(300));
  });

  it('тап покраски — 1 практика «Маляра», порог как у «Механика»', () => {
    const s = E.recordPaintTap(E.recordPaintTap(E.createEconomy(0, true, true, 1)));
    assert.equal(s.player.painter.practice, 2);
    assert.equal(s.player.skill.practice, 0, 'навык «Механик» не затронут');
  });

  it('маляр: свой оклад, практика только во время работы, увольнение сбрасывает', () => {
    let s = E.startContract(E.createEconomy($(10_000), true, true, 1), 'p', 0, undefined, 'painter');
    assert.equal(s.contracts.p.monthlyCents, B.PAINTER_MONTHLY_SALARY_CENTS);
    // Простой: практика не идёт
    assert.equal(E.workerPracticeAt(s.contracts.p, 50_000), 0);
    s = E.setMechanicBusy(s, 'p', true, 50_000);
    s = E.setMechanicBusy(s, 'p', false, 60_000);
    assert.equal(s.contracts.p.skill.practice, 20);
    // Повышение маляра пересчитывает оклад по его профессии
    s = E.setMechanicBusy(s, 'p', true, 60_000);
    s = E.syncWorkerSkill(s, 'p', 60_000 + (requiredPractice(1) / 2) * 1000);
    assert.equal(s.contracts.p.skill.level, 2);
    assert.equal(s.contracts.p.monthlyCents, E.salaryForLevel(2, 'painter'));
    // Оба типа в одном зарплатном фонде
    s = E.startContract(s, 'm', 0);
    const payroll = E.payrollCents(s, MONTH_MS);
    assert.ok(payroll > s.contracts.m.monthlyCents);
    const fired = E.fireMechanic(s, 'p', 100_000).state;
    assert.equal(fired.contracts.p, undefined);
    const rehired = E.startContract(fired, 'p', 110_000, undefined, 'painter');
    assert.equal(rehired.contracts.p.skill.level, 1);
  });
});

// ─── Заказы ────────────────────────────────────────────────────────────────

const sampleCar = (tier: number, rng: () => number): O.SampleCar => ({
  tier,
  name: 'Test',
  modelId: `t${tier}`,
  emoji: '🚗',
  speed: 180,
  year: 2012,
  mileage: 100_000 + Math.floor(rng() * 50_000),
  basePrice: 15_000,
  condition: 40,
  maxCondition: 70,
  paintCondition: 60,
});
const ctx = (owned: B.EquipmentId[] = ['basic_tools']): O.OrdersContext => ({ unlockedTiers: [1], owned, sampleCar });

describe('доска заказов и репутация', () => {
  it('первая проверка сразу, затем раз в 10 дней; доска не переполняется', () => {
    let s = O.createOrdersState(7, 0);
    s = O.advanceOrders(s, 0, ctx());
    assert.equal(s.checksDone, 1);
    s = O.advanceOrders(s, 200 * DAY_MS, ctx());
    assert.equal(s.checksDone, 21);
    assert.ok(s.board.filter((o) => o.kind === 'service').length <= B.MAX_BOARD_SERVICE);
    assert.ok(s.board.filter((o) => o.kind === 'picking').length <= B.MAX_BOARD_PICKING);
  });

  it('репутация влияет на частоту и качество', () => {
    assert.equal(B.orderSpawnChance(0), 0.45);
    assert.ok(Math.abs(B.orderSpawnChance(100) - 0.85) < 1e-12);
    assert.equal(B.extraOrderChance(100), 0.6);
    assert.ok(Math.abs(B.premiumOrderChance(100) - 0.45) < 1e-12);
    const count = (rep: number) => {
      let total = 0;
      let premium = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const s = O.advanceOrders({ ...O.createOrdersState(seed, 0), reputation: rep }, 0, ctx());
        total += s.board.length;
        premium += s.board.filter((o) => o.premium).length;
      }
      return { total, premium };
    };
    const low = count(0);
    const high = count(100);
    assert.ok(high.total > low.total * 1.4, `${low.total} → ${high.total}`);
    assert.ok(high.premium > low.premium * 2, `${low.premium} → ${high.premium}`);
    assert.ok(low.total > 0, 'при нулевой репутации заказы всё равно приходят');
  });

  it('при низкой репутации — только простые заказы', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = O.advanceOrders({ ...O.createOrdersState(seed, 0), reputation: 5 }, 0, ctx());
      for (const o of s.board) if (o.kind === 'service') assert.ok(!O.serviceDef(o.type).complex);
    }
  });

  it('репутация ограничена 0–100 и ведёт историю', () => {
    let s = O.changeReputation(O.createOrdersState(1, 0), 80, 'тест', 0);
    assert.equal(s.reputation, 100);
    s = O.changeReputation(s, -150, 'тест', 1);
    assert.equal(s.reputation, 0);
    assert.equal(s.repHistory[0].delta, -100);
  });
});

/** Экономика с одним ремонтным заказом нужного типа на доске */
const withServiceOrder = (type: B.ServiceOrderType = 'maintenance', balance = 10_000) => {
  let s = E.createEconomy($(balance), true, true, 1);
  let orders = s.orders;
  for (let seed = 1; seed < 2000; seed++) {
    orders = O.advanceOrders({ ...O.createOrdersState(seed, 0), reputation: 60 }, 0, ctx(['basic_tools', 'engine', 'transmission', 'paint_booth']));
    if (orders.board.some((o) => o.kind === 'service' && o.type === type)) break;
  }
  s = { ...s, orders };
  const order = orders.board.find((o) => o.kind === 'service' && o.type === type) as O.ServiceOrder;
  return { s, order };
};

describe('ремонтные заказы', () => {
  it('без оборудования не принять; с ним — детали оплачены, машина клиента не актив', () => {
    const { s, order } = withServiceOrder('engine');
    assert.equal(E.acceptOrder(s, order.id, 0, [1]).ok, false, 'нет оборудования для двигателя');
    const equipped = { ...s, equipment: { owned: ['basic_tools', 'engine'] as B.EquipmentId[], boothSlot: null } };
    const res = E.acceptOrder(equipped, order.id, 0, [1]);
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, equipped.balanceCents - order.partsCents);
    assert.equal(Object.keys(res.state.assets).length, 0);
    assert.equal(E.assetsTotalCents(res.state), 0);
  });

  it('вовремя: полная оплата и +репутация; повторная сдача ничего не даёт', () => {
    const { s, order } = withServiceOrder('maintenance');
    let st = E.acceptOrder(s, order.id, 0, [1]).state;
    assert.equal(E.deliverServiceOrder(st, order.id, 1000).ok, false, 'работа не закончена');
    st = E.markOrderWorkDone(st, order.id, 5 * DAY_MS);
    // Сдать позже срока, но работа была готова вовремя — всё равно вовремя
    const res = E.deliverServiceOrder(st, order.id, (order.deadlineDays + 3) * DAY_MS);
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, st.balanceCents + order.rewardCents);
    assert.ok(res.state.orders.reputation > st.orders.reputation);
    assert.equal(res.state.player.management.practice, B.MANAGEMENT_ORDER_PRACTICE);
    const again = E.deliverServiceOrder(res.state, order.id, (order.deadlineDays + 3) * DAY_MS);
    assert.equal(again.ok, false);
    assert.equal(again.state.balanceCents, res.state.balanceCents);
    const result = E.getMonthResult(res.state, 0);
    assert.equal(result.serviceProfitCents, order.rewardCents - order.partsCents);
  });

  it('досрочно: дополнительный +1', () => {
    const { s, order } = withServiceOrder('maintenance');
    let st = E.acceptOrder(s, order.id, 0, [1]).state;
    st = E.markOrderWorkDone(st, order.id, DAY_MS);
    const res = E.deliverServiceOrder(st, order.id, DAY_MS).state;
    assert.equal(res.orders.reputation - st.orders.reputation, B.REP_SIMPLE_ON_TIME + B.REP_EARLY_BONUS);
  });

  it('небольшая просрочка: 70% и −3; окончательная: 0 и −8 (без суммирования)', () => {
    const { s, order } = withServiceOrder('maintenance');
    const accepted = E.acceptOrder(s, order.id, 0, [1]).state;
    const late = E.markOrderWorkDone(accepted, order.id, (order.deadlineDays + 2) * DAY_MS);
    const paidLate = E.deliverServiceOrder(late, order.id, (order.deadlineDays + 2) * DAY_MS).state;
    assert.equal(paidLate.balanceCents - late.balanceCents, Math.round(order.rewardCents * 0.7));
    assert.equal(paidLate.orders.reputation - late.orders.reputation, B.REP_LATE);

    const failed = E.advanceOrders(accepted, (order.deadlineDays + B.ORDER_GRACE_DAYS) * DAY_MS + 1, { unlockedTiers: [1], sampleCar });
    assert.equal(failed.orders.active.length, 0);
    assert.equal(failed.orders.closed[0].status, 'failed');
    assert.equal(failed.orders.reputation - accepted.orders.reputation, B.REP_FAILED);
    assert.equal(failed.balanceCents, accepted.balanceCents, 'оплаты нет, детали не вернули');
  });

  it('отказ от принятого: −5; отказ от предложения — без последствий', () => {
    const { s, order } = withServiceOrder('maintenance');
    const declined = E.declineOffer(s, order.id);
    assert.equal(declined.orders.reputation, s.orders.reputation);
    const accepted = E.acceptOrder(s, order.id, 0, [1]).state;
    const cancelled = E.cancelOrder(accepted, order.id, 10);
    assert.equal(cancelled.orders.reputation - accepted.orders.reputation, B.REP_CANCEL);
    assert.equal(E.cancelOrder(cancelled, order.id, 10), cancelled);
  });

  it('не больше двух активных ремонтных заказов', () => {
    let s = E.createEconomy($(100_000), true, true, 1);
    let orders = s.orders;
    for (let seed = 1; seed < 2000; seed++) {
      orders = O.advanceOrders({ ...O.createOrdersState(seed, 0), reputation: 100 }, 5 * DAY_MS, ctx());
      orders = O.advanceOrders(orders, 9 * DAY_MS, ctx());
      orders = O.advanceOrders(orders, 10 * DAY_MS, ctx());
      if (orders.board.filter((o) => o.kind === 'service').length >= 3 || seed > 500) break;
    }
    s = { ...s, orders };
    const ids = orders.board.filter((o) => o.kind === 'service').map((o) => o.id);
    s = E.acceptOrder(s, ids[0], 0, [1]).state;
    s = E.acceptOrder(s, ids[1], 0, [1]).state;
    assert.equal(E.acceptOrder(s, ids[2], 0, [1]).ok, false);
  });

  it('оплата заказа ниже ремонта под перепродажу того же объёма', () => {
    const { order } = withServiceOrder('suspension');
    const labor = order.rewardCents - order.partsCents;
    const resaleValue = order.workPoints * B.TECH_WEIGHT * O.tierPointValue(order.tier) * 100 * (order.premium ? B.PREMIUM_REWARD_MULT : 1);
    assert.ok(labor < resaleValue);
  });
});

describe('заказы на подбор', () => {
  const pickingSetup = () => {
    let s = E.createEconomy($(50_000), true, true, 1);
    let orders = s.orders;
    for (let seed = 1; seed < 2000; seed++) {
      orders = O.advanceOrders({ ...O.createOrdersState(seed, 0), reputation: 60 }, 0, ctx());
      if (orders.board.some((o) => o.kind === 'picking')) break;
    }
    s = { ...s, orders };
    const order = orders.board.find((o) => o.kind === 'picking') as O.PickingOrder;
    return { s, order };
  };

  it('требования выполнимы для машины из генератора, слот не нужен', () => {
    const { s, order } = pickingSetup();
    assert.ok(order.minOverall <= C.overallMax(70));
    assert.ok(order.maxMileage >= 100_000);
    const accepted = E.acceptOrder(s, order.id, 0, [1]);
    assert.ok(accepted.ok);
    assert.equal(accepted.state.balanceCents, s.balanceCents, 'принятие ничего не стоит');
  });

  it('неподходящую машину не принять; подходящая продаётся сразу по согласованной цене', () => {
    const { s, order } = pickingSetup();
    let st = E.acceptOrder(s, order.id, 0, [1]).state;
    st = E.buyCar(st, { carId: 'car', name: 'X', tier: 1, priceCents: $(3_000) }).state;
    const bad = { tier: 1, mileage: order.maxMileage + 1, overall: 100, paintCondition: 100 };
    assert.equal(E.deliverPickingOrder(st, order.id, 'car', bad, DAY_MS).ok, false);
    const good = { tier: 1, mileage: order.maxMileage, overall: order.minOverall, paintCondition: 100 };
    const res = E.deliverPickingOrder(st, order.id, 'car', good, DAY_MS);
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, st.balanceCents + order.priceCents);
    assert.equal(res.state.assets.car, undefined);
    assert.equal(res.state.ledger.carsSold, 1);
    assert.equal(res.state.player.management.practice >= B.MANAGEMENT_ORDER_PRACTICE, true);
    assert.ok(res.state.player.trade.practice >= B.TRADE_PICKING_PRACTICE);
    assert.equal(E.deliverPickingOrder(res.state, order.id, 'car', good, DAY_MS).ok, false);
  });

  it('провал подбора: −8, купленная машина остаётся у игрока', () => {
    const { s, order } = pickingSetup();
    let st = E.acceptOrder(s, order.id, 0, [1]).state;
    st = E.buyCar(st, { carId: 'car', name: 'X', tier: 1, priceCents: $(3_000) }).state;
    const failed = E.advanceOrders(st, (order.deadlineDays + B.ORDER_GRACE_DAYS) * DAY_MS + 1, { unlockedTiers: [1], sampleCar });
    assert.equal(failed.orders.reputation - st.orders.reputation, B.REP_FAILED);
    assert.ok(failed.assets.car);
    assert.equal(failed.balanceCents, st.balanceCents);
  });
});

// ─── Навыки и курсы ────────────────────────────────────────────────────────

describe('пять навыков и курсы', () => {
  it('у каждого навыка свой прогресс и своя перезарядка курсов', () => {
    let s = E.createEconomy($(100_000), true, true, 1);
    const keys: E.SkillKey[] = ['mechanic', 'painter', 'picker', 'trade', 'management'];
    for (const key of keys) {
      const res = E.buySkillCourse(s, key, 0);
      assert.ok(res.ok, key);
      s = res.state;
    }
    for (const key of keys) {
      const skill = E.playerSkill(s, key);
      assert.equal(skill.practice, Math.floor(E.SKILL_CURVES[key](1) * 0.5), key);
      assert.equal(E.buySkillCourse(s, key, COURSE_COOLDOWN_MS).ok, false, 'второй курс на том же уровне нельзя');
    }
  });

  it('курс покрывает не больше 50% порога и не переносит избыток', () => {
    let s = E.createEconomy($(100_000), true, true, 1);
    s = { ...s, player: { ...s.player, picker: { ...s.player.picker, practice: 150 } } };
    s = E.buySkillCourse(s, 'picker', 0).state;
    assert.equal(s.player.picker.level, 2);
    assert.equal(s.player.picker.practice, 0);
  });
});

// ─── Миграция ──────────────────────────────────────────────────────────────

describe('миграция сохранений', () => {
  it('старое сохранение получает новые навыки, оборудование и заказы без потери прогресса', () => {
    const s = E.createEconomy($(12_345), true, true, 1);
    const old: any = JSON.parse(JSON.stringify(s));
    delete old.equipment;
    delete old.orders;
    delete old.player.painter;
    delete old.player.picker;
    delete old.player.trade;
    old.player.skill.level = 7;
    for (const k of ['serviceRevenueCents', 'serviceCostsCents', 'diagnosticsCents', 'carExtraCostsCents', 'inspectPractice']) delete old.ledger[k];
    const restored = must(E.deserializeEconomy(JSON.stringify({ version: 1, gameTimeMs: 1234, state: old }))).state;
    assert.equal(restored.balanceCents, $(12_345));
    assert.equal(restored.player.skill.level, 7);
    assert.equal(restored.player.trade.level, 1);
    assert.deepEqual(restored.equipment, { owned: ['basic_tools'], boothSlot: null });
    assert.equal(restored.orders.reputation, B.REPUTATION_START);
    assert.equal(restored.ledger.serviceRevenueCents, 0);
    assert.equal(E.getMonthResult(restored, 0).netProfitCents, 0);
  });

  it('состояние заказов и репутации переживает сохранение', () => {
    const { s, order } = withServiceOrder('maintenance');
    const st = E.acceptOrder(s, order.id, 0, [1]).state;
    const restored = must(E.deserializeEconomy(E.serializeEconomy(st, 500))).state;
    assert.deepEqual(restored.orders, st.orders);
  });
});

describe('журнал опыта', () => {
  it('каждое начисление XP записывается с причиной; без XP — без записи', () => {
    let s = E.buyCar(E.createEconomy($(10_000), true, true, 1), { carId: 'c', name: 'Golf', tier: 1, priceCents: $(1000) }).state;
    s = E.sellCar(s, { carId: 'c', priceCents: $(1250), fallbackCostCents: 0 });
    assert.equal(s.xpLog.length, 1);
    assert.equal(s.xpLog[0].amount, s.player.xp.totalXp);
    assert.ok(s.xpLog[0].reason.startsWith('Продажа: Golf'));
    const loss = E.sellCar(E.buyCar(E.createEconomy($(10_000), true, true, 1), { carId: 'd', name: 'X', tier: 1, priceCents: $(1000) }).state, { carId: 'd', priceCents: $(900), fallbackCostCents: 0 });
    assert.equal(loss.xpLog.length, 0);
  });

  it('хранит не больше 20 последних записей и переживает сохранение', () => {
    let s = E.createEconomy($(100_000), true, true, 1);
    for (let i = 0; i < 25; i++) {
      s = E.buyCar(s, { carId: `c${i}`, name: `Car ${i}`, tier: 1, priceCents: $(1000) }).state;
      s = E.sellCar(s, { carId: `c${i}`, priceCents: $(1500), fallbackCostCents: 0 });
    }
    assert.equal(s.xpLog.length, E.XP_LOG_LIMIT);
    assert.ok(s.xpLog[0].reason.includes('Car 24'));
    const restored = must(E.deserializeEconomy(E.serializeEconomy(s, 0))).state;
    assert.deepEqual(restored.xpLog, s.xpLog);
  });
});
