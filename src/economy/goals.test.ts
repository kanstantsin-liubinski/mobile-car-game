/// <reference types="node" />
/** Тесты целей: ежедневные задания, достижения, коллекция моделей */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as E from './economy.ts';
import * as G from './goals.ts';
import { CAR_MODELS_BY_TIER } from '../data/carModels.ts';

const $ = (d: number) => d * 100;
const DAY = '2026-10-30';

const economy = (level = 5): E.EconomyState => {
  const s = E.createEconomy($(50_000), true, true, 11);
  return { ...s, player: { ...s.player, xp: { level, xp: 0, totalXp: 0 } } };
};

/** Задания дня с нужным набором (подменяем, чтобы тест не зависел от случайного выбора) */
const withTasks = (s: E.EconomyState, kinds: G.TaskKind[]): E.EconomyState => {
  const daily = G.createDaily(DAY, s.player.xp.level, 1, s.careerId);
  const tasks = kinds.map((kind, i) => ({ ...daily.tasks[0], id: `${DAY}:${kind}`, kind, target: kind === 'taps' ? 3 : 1, param: kind === 'sellRoi' ? 15 : undefined, progress: 0 }));
  return { ...s, goals: { ...G.restoreGoals(s.goals), daily: { ...daily, tasks } } };
};

const buyAndSell = (s0: E.EconomyState, id: string, name: string, buy: number, sell: number): E.EconomyState => {
  const bought = E.buyCar(s0, { carId: id, name, tier: 1, priceCents: $(buy), conditionPct: 50, maxConditionPct: 80 });
  assert.ok(bought.ok);
  return E.sellCar(bought.state, { carId: id, priceCents: $(sell), fallbackCostCents: $(buy), tier: 1 });
};

describe('ежедневные задания', () => {
  it('три разных задания, одинаковые для той же даты и карьеры', () => {
    const a = G.createDaily(DAY, 20, 2, 'career-x');
    const b = G.createDaily(DAY, 20, 2, 'career-x');
    assert.equal(a.tasks.length, 3);
    assert.equal(new Set(a.tasks.map((t) => t.kind)).size, 3);
    assert.deepEqual(a, b);
  });

  it('с новыми сутками приходят новые задания, в те же сутки — не меняются', () => {
    const s = E.refreshDaily(economy(), DAY);
    assert.equal(s.goals!.daily!.dayKey, DAY);
    assert.equal(E.refreshDaily(s, DAY), s);
    assert.equal(E.refreshDaily(s, '2026-10-31').goals!.daily!.dayKey, '2026-10-31');
  });

  it('продажа, тапы и покупка двигают задания; выполненное забирается один раз', () => {
    let s = withTasks(economy(), ['sellProfit', 'taps', 'buyTier']);
    s = E.recordPlayerTap(E.recordPlayerTap(E.recordPlayerTap(s)));
    s = buyAndSell(s, 'c1', 'Kia Rio', 1_000, 1_300);
    const tasks = s.goals!.daily!.tasks;
    assert.ok(tasks.every(G.taskDone), JSON.stringify(tasks));

    const before = s;
    const res = E.claimDailyTask(s, `${DAY}:taps`);
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, before.balanceCents + tasks[1].rewardCents);
    assert.equal(res.state.player.xp.totalXp, before.player.xp.totalXp + tasks[1].rewardXp);
    assert.equal(E.claimDailyTask(res.state, `${DAY}:taps`).ok, false, 'второй раз нельзя');
  });

  it('бонус дня — только когда забраны все три', () => {
    let s = withTasks(economy(), ['sellProfit', 'sellRoi', 'buyTier']);
    s = buyAndSell(s, 'c1', 'Kia Rio', 1_000, 1_300);
    assert.equal(E.claimDailyBonus(s).ok, false);
    for (const t of s.goals!.daily!.tasks) s = E.claimDailyTask(s, t.id).state;
    const res = E.claimDailyBonus(s);
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, s.balanceCents + G.dailyBonusCents(5));
    assert.equal(E.claimDailyBonus(res.state).ok, false);
  });

  it('продажа в убыток не засчитывается в «с прибылью»', () => {
    const s = buyAndSell(withTasks(economy(), ['sellProfit']), 'c1', 'Kia Rio', 1_000, 900);
    assert.equal(s.goals!.daily!.tasks[0].progress, 0);
  });
});

describe('достижения и коллекция', () => {
  it('первая продажа открывает достижение, награда — один раз', () => {
    const s = buyAndSell(economy(), 'c1', 'Kia Rio', 1_000, 1_300);
    assert.equal(E.pendingGoalRewards(s), 2, 'первая сделка + уровень 5');
    const res = E.claimAchievement(s, 'sales_1');
    assert.ok(res.ok);
    assert.equal(res.state.balanceCents, s.balanceCents + $(500));
    assert.equal(E.claimAchievement(res.state, 'sales_1').ok, false);
    assert.equal(E.claimAchievement(res.state, 'sales_10').ok, false, 'не достигнуто');
  });

  it('коллекция помнит проданные модели и лучшую прибыль; полный класс — достижение', () => {
    let s = buyAndSell(economy(), 'c1', 'Kia Rio', 1_000, 1_300);
    s = buyAndSell(s, 'c2', 'Kia Rio', 1_000, 1_100);
    assert.deepEqual(s.goals!.collection['Kia Rio'], { tier: 1, sold: 2, bestProfitCents: $(300) });
    assert.equal(E.achievementStats(s).collected[1], 1);
    CAR_MODELS_BY_TIER[1].forEach((m, i) => {
      s = buyAndSell(s, `m${i}`, m.name, 1_000, 1_100);
    });
    assert.equal(E.achievementStats(s).collected[1], CAR_MODELS_BY_TIER[1].length);
    assert.ok(E.claimAchievement(s, 'collection_1').ok);
  });

  it('старое сохранение без целей загружается', () => {
    const s = economy();
    const { goals: _g, ...old } = s;
    const raw = E.serializeEconomy(old as E.EconomyState, 0);
    const loaded = E.deserializeEconomy(raw)!;
    assert.deepEqual(loaded.state.goals, G.createGoals());
  });
});
