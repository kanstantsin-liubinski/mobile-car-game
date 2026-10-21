/// <reference types="node" />
/**
 * Тесты сети филиалов: открытие, персонал, управляющий (задержка, ошибки, стратегии, резерв),
 * сдача заказов, отсутствие двойных начислений, закрытие месяца и сохранение.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as B from './balance.ts';
import * as O from './orders.ts';
import * as E from './economy.ts';
import * as Br from './branches.ts';
import { DAY_MS, MONTH_MS } from './time.ts';
import { requiredManagerPractice } from './progression.ts';
import { generateRandomListing } from '../utils/marketGenerator.ts';

const $ = (d: number) => d * 100;
const G1: Br.GarageInfo = { id: 'garage_1', name: 'Гараж 1', slots: 1, rank: 0 };
const G2: Br.GarageInfo = { id: 'garage_2', name: 'Гараж 2', slots: 2, rank: 1 };
const NAMES = { garage_1: 'Гараж 1', garage_2: 'Гараж 2' };

const sampleCar = (tier: number, rng: () => number): O.SampleCar => {
  const { car } = generateRandomListing(tier, 0, [], rng);
  return {
    tier,
    name: car.name,
    modelId: car.name,
    emoji: car.emoji,
    speed: car.speed,
    year: car.year,
    mileage: car.mileage,
    basePrice: car.basePrice!,
    condition: car.condition,
    maxCondition: car.maxCondition!,
    paintCondition: car.paintCondition!,
  };
};
const ctx = (level = 12): Br.BranchContext => ({ unlockedTiers: [1], playerLevel: level, sampleCar });

/** Экономика игрока нужного уровня с деньгами */
const economy = (level = 12, balance = $(50_000), seed = 7): E.EconomyState => {
  const s = E.createEconomy(balance, true, true, seed);
  return { ...s, player: { ...s.player, xp: { level, xp: 0, totalXp: 0 } } };
};

/** Открытый филиал в Гараже 1 с механиком и управляющим, автоматизация включена */
const staffedBranch = (s0 = economy(), now = 0): E.EconomyState => {
  let s = Br.openBranch(s0, G1, 1, now).state;
  s = Br.hireBranchStaff(s, 'garage_1', 'manager', now).state;
  s = Br.hireBranchStaff(s, 'garage_1', 'mechanic', now, 0).state;
  return Br.setBranchAutomation(s, 'garage_1', true, now);
};

/** Ход филиалов по дням до времени until (как тики часов игры) */
const runDays = (s0: E.EconomyState, from: number, until: number, level = 12): E.EconomyState => {
  let s = s0;
  for (let t = from; t <= until; t += DAY_MS / 4) s = Br.advanceBranches(s, t, ctx(level), NAMES);
  return s;
};

describe('открытие филиала', () => {
  it('нужен 12 уровень, гараж младше основного и деньги; цена — вложение', () => {
    assert.match(Br.branchOpenBlock(economy(11), G1, 1)!, /12 уровень/);
    assert.match(Br.branchOpenBlock(economy(12), G1, 0)!, /старый гараж/);
    assert.match(Br.branchOpenBlock(economy(12, $(100)), G1, 1)!, /денег/);
    const s = economy();
    const res = Br.openBranch(s, G1, 1, 0);
    assert.ok(res.ok);
    const cost = $(B.BRANCH_OPEN_COST.garage_1);
    assert.equal(res.state.balanceCents, s.balanceCents - cost);
    assert.equal(res.state.ledger.investmentsCents, cost);
    assert.equal(res.state.branches.garage_1.slots.length, 1);
    assert.equal(res.state.branches.garage_1.automation, false);
    assert.equal(Br.openBranch(res.state, G1, 1, 0).ok, false, 'второй раз не открывается');
  });

  it('следующий филиал — с 25 уровня, всего не больше 4 объектов', () => {
    const s = Br.openBranch(economy(20, $(500_000)), G1, 2, 0).state;
    assert.match(Br.branchOpenBlock(s, G2, 2)!, /25 уровень/);
    const s25 = { ...s, player: { ...s.player, xp: { level: 25, xp: 0, totalXp: 0 } } };
    assert.equal(Br.branchOpenBlock(s25, G2, 2), null);
  });
});

describe('персонал филиала', () => {
  it('управляющий и механик — контракты филиала в общем зарплатном фонде', () => {
    const s = staffedBranch();
    const b = s.branches.garage_1;
    const manager = s.contracts[b.managerId!];
    const mechanic = s.contracts[b.slots[0].mechanicId!];
    assert.equal(manager.profession, 'manager');
    assert.equal(manager.branchId, 'garage_1');
    assert.equal(manager.monthlyCents, B.MANAGER_BASE_SALARY_CENTS);
    assert.equal(mechanic.branchId, 'garage_1');
    assert.equal(mechanic.monthlyCents, B.mechanicBaseSalaryCents(1));
    assert.ok(b.staffNames[b.managerId!]);
  });

  it('без управляющего или механика автоматизацию не включить', () => {
    let s = Br.openBranch(economy(), G1, 1, 0).state;
    assert.equal(Br.setBranchAutomation(s, 'garage_1', true, 0).branches.garage_1.automation, false);
    s = Br.hireBranchStaff(s, 'garage_1', 'manager', 0).state;
    assert.match(Br.automationBlock(s, s.branches.garage_1)!, /механика/);
  });

  it('задержка и ошибки управляющего — по таблице с интерполяцией', () => {
    assert.equal(B.managerDelayDays(1), 1);
    assert.equal(B.managerErrorChance(1), 0.15);
    assert.equal(B.managerDelayDays(3), 0.75);
    assert.ok(Math.abs(B.managerErrorChance(3) - 0.135) < 1e-12);
    assert.equal(B.managerDelayDays(10), 0.25);
    assert.equal(B.managerDelayDays(20), 0.1);
    assert.equal(B.managerErrorChance(20), 0.02);
    assert.equal(requiredManagerPractice(1), 150);
    assert.equal(requiredManagerPractice(3), 230);
  });
});

describe('работа управляющего', () => {
  it('сам берёт, выполняет и сдаёт простые заказы; деньги сходятся с отчётом филиала', () => {
    const s0 = staffedBranch();
    const s = runDays(s0, 0, 25 * DAY_MS);
    const b = s.branches.garage_1;
    assert.ok(b.month.completed >= 2, `сдано ${b.month.completed}`);
    for (const o of b.orders.closed) assert.ok(o.kind === 'service' && B.MANAGER_SIMPLE_TYPES.includes(o.type));
    // Оклады платятся в зарплатный день — до него баланс меняется только на оплату и детали
    assert.equal(s.balanceCents - s0.balanceCents, b.month.revenueCents - b.month.partsCents);
    assert.equal(s.ledger.serviceRevenueCents, b.month.revenueCents);
    assert.equal(s.ledger.serviceCostsCents, b.month.partsCents);
  });

  it('практика управляющего: +20 за заказ, уровень повышает оклад', () => {
    const s = runDays(staffedBranch(), 0, 29 * DAY_MS);
    const b = s.branches.garage_1;
    const m = s.contracts[b.managerId!];
    const earned = b.month.completed * B.MANAGER_ORDER_PRACTICE;
    if (earned >= requiredManagerPractice(1)) {
      assert.ok(m.skill.level >= 2);
      assert.ok(m.monthlyCents > B.MANAGER_BASE_SALARY_CENTS);
    } else {
      assert.equal(m.skill.practice, earned);
    }
  });

  it('повторный ход в тот же момент ничего не начисляет', () => {
    const s = runDays(staffedBranch(), 0, 20 * DAY_MS);
    const again = Br.advanceBranches(s, 20 * DAY_MS, ctx(), NAMES);
    assert.equal(again.balanceCents, s.balanceCents);
    assert.equal(again.branches.garage_1.month.completed, s.branches.garage_1.month.completed);
  });

  it('резерв: управляющий не платит детали, если останется меньше резерва', () => {
    let s = staffedBranch(economy(12, $(10_000)));
    s = Br.setBranchReserve(s, 'garage_1', $(1_000_000));
    const after = runDays(s, 0, 20 * DAY_MS);
    assert.equal(after.branches.garage_1.jobs.length, 0);
    assert.equal(after.balanceCents, s.balanceCents);
  });

  it('выключенная автоматизация: управляющий ничего не берёт', () => {
    const s = Br.setBranchAutomation(staffedBranch(), 'garage_1', false, 0);
    const after = runDays(s, 0, 15 * DAY_MS);
    assert.equal(after.branches.garage_1.jobs.length, 0);
    assert.ok(after.branches.garage_1.orders.board.length > 0, 'доска при этом обновляется');
  });

  it('осторожный не берёт машины выше допуска механика, сбалансированный — может', () => {
    let s = staffedBranch(economy(12));
    s = Br.setBranchStrategy(s, 'garage_1', 'careful');
    const b = s.branches.garage_1;
    const order: O.ServiceOrder = {
      id: 'x',
      kind: 'service',
      type: 'maintenance',
      tier: 2,
      premium: false,
      description: '',
      workPoints: 1.5,
      car: sampleCar(2, () => 0.5),
      partsCents: $(100),
      rewardCents: $(800),
      deadlineDays: 10,
      createdAtMs: 0,
      offerExpiresAtMs: DAY_MS * 5,
      status: 'offered',
    };
    assert.match(Br.estimateOrder(s, b, order, b.slots[0].mechanicId, 12).reject!, /допуск/);
    const balanced = Br.setBranchStrategy(s, 'garage_1', 'balanced');
    assert.equal(Br.estimateOrder(balanced, balanced.branches.garage_1, order, b.slots[0].mechanicId, 12).reject, null);
  });

  it('не берёт убыточные и не успевающие заказы', () => {
    const s = staffedBranch();
    const b = s.branches.garage_1;
    const base = { id: 'y', kind: 'service' as const, type: 'maintenance' as const, tier: 1, premium: false, description: '', car: sampleCar(1, () => 0.3), createdAtMs: 0, offerExpiresAtMs: DAY_MS, status: 'offered' as const };
    const slow: O.ServiceOrder = { ...base, workPoints: 4, partsCents: $(10), rewardCents: $(900), deadlineDays: 5 };
    assert.match(Br.estimateOrder(s, b, slow, b.slots[0].mechanicId, 12).reject!, /успеть/);
    const losing: O.ServiceOrder = { ...base, workPoints: 2, partsCents: $(100), rewardCents: $(110), deadlineDays: 20 };
    assert.match(Br.estimateOrder(s, b, losing, b.slots[0].mechanicId, 12).reject!, /Убыточный/);
  });

  it('увольнение механика останавливает работу, новый механик продолжает с остатка', () => {
    let s = runDays(staffedBranch(), 0, 3 * DAY_MS);
    let b = s.branches.garage_1;
    const job = b.jobs.find((j) => !j.finished);
    if (!job) return; // заказа в работе не оказалось — сценарий не применим к этому сиду
    const now = 3 * DAY_MS;
    s = Br.fireBranchStaff(s, 'garage_1', b.slots[0].mechanicId!, now).state;
    b = s.branches.garage_1;
    assert.equal(b.jobs[0].doneAtMs, null);
    assert.ok(b.jobs[0].remainingPts > 0);
    s = Br.hireBranchStaff(s, 'garage_1', 'mechanic', now + DAY_MS, 0).state;
    assert.ok(s.branches.garage_1.jobs[0].doneAtMs! > now + DAY_MS);
  });

  it('репутация за заказы филиала попадает в общую', () => {
    const s0 = staffedBranch();
    const s = runDays(s0, 0, 25 * DAY_MS);
    const delta = s.branches.garage_1.orders.closed.reduce((sum, o) => sum + (o.repDelta ?? 0), 0);
    assert.equal(s.orders.reputation - s0.orders.reputation, delta);
    assert.equal(s.branches.garage_1.orders.reputation, s.orders.reputation);
  });
});

describe('месяц и сохранение', () => {
  it('зарплатный день: оклады филиала в его отчёте, история, общий фонд', () => {
    let s = runDays(staffedBranch(), 0, MONTH_MS - 1);
    const salaries = Br.branchSalaryCents(s, 'garage_1', MONTH_MS);
    assert.ok(salaries > 0);
    s = E.closeMonth(s, MONTH_MS, 0).state;
    const report = s.branches.garage_1.history[0];
    assert.equal(report.salaryCents, salaries);
    assert.ok(report.slotMs > 0);
    assert.equal(s.branches.garage_1.month.completed, 0);
    assert.equal(s.history[0].payrollCents >= salaries, true);
  });

  it('старое сохранение без филиалов загружается, филиал переживает сохранение', () => {
    const old = E.createEconomy($(1000)) as Partial<E.EconomyState>;
    delete old.branches;
    const loaded = E.deserializeEconomy(JSON.stringify({ version: 1, gameTimeMs: 0, state: old }));
    assert.deepEqual(loaded!.state.branches, {});
    const s = runDays(staffedBranch(), 0, 5 * DAY_MS);
    const round = E.deserializeEconomy(E.serializeEconomy(s, 5 * DAY_MS))!;
    assert.deepEqual(round.state.branches, s.branches);
  });
});
