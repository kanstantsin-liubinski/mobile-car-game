/// <reference types="node" />
/** Тесты работы автоматизированных филиалов, пока игра закрыта */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './economy.ts';
import * as Br from './branches.ts';
import * as Off from './offline.ts';
import { DAY_MS, MONTH_MS } from './time.ts';

const $ = (d: number) => d * 100;
const G1: Br.GarageInfo = { id: 'garage_1', name: 'Гараж 1', slots: 1, rank: 0 };
const NAMES = { garage_1: 'Гараж 1' };
const HOUR = 60 * 60 * 1000;

const economy = (level = 12): E.EconomyState => {
  const s = E.createEconomy($(50_000), true, true, 7);
  return { ...s, player: { ...s.player, xp: { level, xp: 0, totalXp: 0 } } };
};

/** Филиал с управляющим и прошлым месяцем: оплата $9 000, детали $2 000, оклады $1 000 → $6 000 чистыми */
const withHistory = (automation = true): E.EconomyState => {
  let s = Br.openBranch(economy(), G1, 1, 0).state;
  s = Br.hireBranchStaff(s, 'garage_1', 'manager', 0).state;
  s = Br.hireBranchStaff(s, 'garage_1', 'mechanic', 0, 0).state;
  s = Br.setBranchAutomation(s, 'garage_1', automation, 0);
  const b = s.branches.garage_1;
  const month: Br.BranchMonth = {
    ...Br.emptyBranchMonth(1),
    revenueCents: $(9_000),
    partsCents: $(2_000),
    salaryCents: $(1_000),
    slotMs: MONTH_MS,
  };
  return { ...s, branches: { garage_1: { ...b, openedAtMs: -MONTH_MS, history: [month] } } };
};

describe('филиалы вне игры', () => {
  it('скорость — по чистой прибыли месяца: час отсутствия = час работы', () => {
    const s = withHistory();
    const rate = Off.offlineBranchRate(s, s.branches.garage_1, 0)!;
    // Текущий месяц ещё не начался (0 мс), значит скорость — по прошлому: $6 000 за месяц
    assert.equal(Math.round(rate * MONTH_MS), $(6_000));
    const { state, report } = Off.applyOfflineBranches(s, 0, HOUR, NAMES);
    const expected = Math.round(rate * HOUR);
    assert.equal(report!.totalCents, expected);
    assert.equal(state.balanceCents, s.balanceCents + expected);
    assert.equal(state.ledger.offlineIncomeCents, expected);
    assert.equal(E.getMonthResult(state, 0).offlineIncomeCents, expected, 'входит в прибыль месяца');
  });

  it('не дольше 4 часов; короткая отлучка не считается', () => {
    const s = withHistory();
    const four = Off.applyOfflineBranches(s, 0, 4 * HOUR, NAMES).report!;
    const ten = Off.applyOfflineBranches(s, 0, 10 * HOUR, NAMES).report!;
    assert.equal(ten.totalCents, four.totalCents);
    assert.equal(ten.workedMs, Off.OFFLINE_MAX_MS);
    assert.equal(ten.awayMs, 10 * HOUR);
    assert.equal(Off.applyOfflineBranches(s, 0, 30_000, NAMES).report, null);
  });

  it('без автоматизации, без данных или в убытке — ничего', () => {
    assert.equal(Off.applyOfflineBranches(withHistory(false), 0, HOUR, NAMES).report, null);
    let fresh = Br.hireBranchStaff(Br.openBranch(economy(), G1, 1, 0).state, 'garage_1', 'manager', 0).state;
    fresh = Br.setBranchAutomation(Br.hireBranchStaff(fresh, 'garage_1', 'mechanic', 0, 0).state, 'garage_1', true, 0);
    assert.ok(fresh.branches.garage_1.automation);
    assert.equal(Off.offlineBranchRate(fresh, fresh.branches.garage_1, DAY_MS), null, 'меньше 5 дней работы');
    const s = withHistory();
    const losing = {
      ...s,
      branches: { garage_1: { ...s.branches.garage_1, history: [{ ...s.branches.garage_1.history[0], revenueCents: 0 }] } },
    };
    assert.equal(Off.applyOfflineBranches(losing, 0, HOUR, NAMES).report, null);
  });

  it('при банкротстве — ничего', () => {
    const s = { ...withHistory(), bankruptcy: { month: 1, shortfallCents: 1, debtCents: 0, payrollCents: 0 } };
    assert.equal(Off.applyOfflineBranches(s, 0, HOUR, NAMES).report, null);
  });
});
