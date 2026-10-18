/// <reference types="node" />
/**
 * Тесты финансового ядра. Запуск: npm test (node --test, без сборки — Node сам снимает типы).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAY_MS,
  MONTH_MS,
  MECHANIC_MONTHLY_SALARY_CENTS as SALARY,
  advanceGameTime,
  syncSalariesWithSkill,
  salaryForLevel,
  accruedSalaryCents,
  assetsTotalCents,
  buildAdvice,
  buyCar,
  buyGarage,
  canAfford,
  closeMonth,
  createEconomy,
  deserializeEconomy,
  earnOtherIncome,
  fireMechanic,
  getCalendar,
  getMechanicActivity,
  getMonthResult,
  isPaydayPending,
  loanMonthsLeft,
  monthEndMs,
  payrollCents,
  previewClose,
  previewFire,
  repayLoan,
  sellCar,
  serializeEconomy,
  setMechanicBusy,
  changeSalary,
  startContract,
  awardFullRepair,
  buyPlayerCourse,
  buyWorkerCourse,
  migrateLegacyPlayer,
  recordPlayerTap,
  syncWorkerSkill,
  workerPracticeAt,
  type EconomyState,
} from './economy.ts';
import { COURSE_COOLDOWN_MS, requiredXp } from './progression.ts';

const $ = (dollars: number) => dollars * 100;

/** Прогоняет время тиками по 250 мс, как игровые часы */
const runTicks = (s: EconomyState, from: number, ms: number, tick = 250): number => {
  let t = from;
  for (let elapsed = 0; elapsed < ms; elapsed += tick) t = advanceGameTime(s, t, tick);
  return t;
};

const close = (s: EconomyState, now: number, repay = 0) => closeMonth(s, now, repay);

/** Проверка на null с сужением типа */
function must<T>(value: T | null | undefined): T {
  assert.ok(value);
  return value as T;
}

describe('календарь', () => {
  it('300 секунд активного времени завершают месяц ровно один раз', () => {
    let s = createEconomy($(10_000));
    let t = runTicks(s, 0, MONTH_MS + 5_000); // тики после конца месяца время не двигают
    assert.equal(t, MONTH_MS);
    assert.equal(isPaydayPending(s, t), true);
    const first = close(s, t);
    assert.equal(first.outcome, 'closed');
    s = first.state;
    assert.equal(getCalendar(s, t).month, 2);
    assert.equal(close(s, t).outcome, 'noop', 'повторное закрытие ничего не делает');
    t = runTicks(s, t, 1000);
    assert.equal(getCalendar(s, t).day, 1);
  });

  it('день и время до зарплаты', () => {
    const s = createEconomy(0);
    const cal = getCalendar(s, 17 * DAY_MS + 5_000);
    assert.equal(cal.day, 18);
    assert.equal(cal.msToPayday, MONTH_MS - 175_000);
  });

  it('сохранение не продвигает время: после загрузки остаётся столько же до зарплаты', () => {
    const s = createEconomy($(1000));
    const t = MONTH_MS - 42_000;
    const restored = must(deserializeEconomy(serializeEconomy(s, t)));
    assert.equal(getCalendar(restored.state, restored.gameTimeMs).msToPayday, 42_000);
  });

  it('незакрытый зарплатный день восстанавливается после перезагрузки', () => {
    const s = startContract(createEconomy($(5000)), 'm1', 0);
    const restored = must(deserializeEconomy(serializeEconomy(s, MONTH_MS)));
    assert.equal(isPaydayPending(restored.state, restored.gameTimeMs), true);
    const closed = close(restored.state, restored.gameTimeMs);
    assert.equal(closed.state.balanceCents, $(5000) - SALARY);
    // перезагрузка уже после закрытия: месяц не закрывается снова
    const again = must(deserializeEconomy(serializeEconomy(closed.state, MONTH_MS)));
    assert.equal(close(again.state, again.gameTimeMs).outcome, 'noop');
  });
});

describe('зарплаты', () => {
  it('за полный месяц начисляется ровно оклад, частые тики не дают лишних центов', () => {
    let s = startContract(createEconomy(0), 'm1', 0);
    const t = runTicks(s, 0, MONTH_MS, 7);
    assert.equal(accruedSalaryCents(s.contracts.m1, t), SALARY);
    assert.equal(SALARY, $(360));
    s = close({ ...s, balanceCents: $(2000) }, t).state;
    assert.equal(s.balanceCents, $(2000) - SALARY);
  });

  it('баланс не уменьшается до зарплатного дня', () => {
    const s = startContract(createEconomy($(1000)), 'm1', 0);
    runTicks(s, 0, MONTH_MS / 2);
    assert.equal(s.balanceCents, $(1000));
    assert.equal(payrollCents(s, MONTH_MS / 2), SALARY / 2);
  });

  it('наём на 16-й день — оплата за оставшиеся 15 дней', () => {
    const s = startContract(createEconomy(0), 'm1', 15 * DAY_MS);
    assert.equal(payrollCents(s, MONTH_MS), SALARY / 2);
  });

  it('оклад приводится к уровню навыка: прошлое по старой ставке, дальше по новой', () => {
    let s = startContract(createEconomy(0), 'm1', 0, $(1500));
    s = syncSalariesWithSkill(s, MONTH_MS / 2);
    assert.equal(payrollCents(s, MONTH_MS), $(750) + SALARY / 2);
    assert.equal(syncSalariesWithSkill(s, MONTH_MS), s, 'повторно ничего не меняет');
    assert.equal(salaryForLevel(1), SALARY);
  });

  it('смена ставки не пересчитывает прошлое время', () => {
    let s = startContract(createEconomy(0), 'm1', 0, $(3000));
    s = changeSalary(s, 'm1', $(6000), MONTH_MS / 2);
    assert.equal(payrollCents(s, MONTH_MS), $(1500) + $(3000));
  });

  it('пример ТЗ: $10 000 + сделки $3 000, зарплаты $5 000 → $8 000 и −$2 000', () => {
    let s = createEconomy($(10_000));
    s = startContract(s, 'm1', 0, $(5000));
    s = buyCar(s, { carId: 'c1', name: 'Car', priceCents: $(7000) }).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(10_000), fallbackCostCents: 0 });
    assert.equal(s.balanceCents, $(13_000));
    const result = close(s, MONTH_MS);
    assert.equal(result.state.balanceCents, $(8000));
    assert.equal(result.state.history[0].netProfitCents, -$(2000));
    assert.equal(result.state.history[0].dealProfitCents, $(3000));
  });

  it('без механиков и с нулевой зарплатой месяц закрывается без списаний', () => {
    const s = startContract(createEconomy($(100)), 'm0', 0, 0);
    const r = close(s, MONTH_MS);
    assert.equal(r.state.balanceCents, $(100));
    assert.equal(r.state.loan, null);
  });

  it('механик нанят прямо перед концом месяца — почти ничего не начислено', () => {
    const s = startContract(createEconomy($(100)), 'm1', MONTH_MS - 1000);
    assert.equal(payrollCents(s, MONTH_MS), SALARY / 300); // оклад за последнюю секунду
  });
});

describe('увольнение', () => {
  it('стоимость = начисленная зарплата + оклад', () => {
    const s = startContract(createEconomy($(10_000)), 'm1', 0, $(3000));
    const p = must(previewFire(s, 'm1', 10 * DAY_MS));
    assert.equal(p.accruedCents, $(1000));
    assert.equal(p.compensationCents, $(3000));
    assert.equal(p.totalCents, $(4000));
  });

  it('после увольнения зарплата не начисляется и не списывается повторно', () => {
    let s = startContract(createEconomy($(10_000)), 'm1', 0, $(3000));
    s = fireMechanic(s, 'm1', 10 * DAY_MS).state;
    assert.equal(s.balanceCents, $(6000));
    assert.equal(payrollCents(s, MONTH_MS), 0);
    const r = close(s, MONTH_MS);
    assert.equal(r.state.balanceCents, $(6000));
    assert.equal(r.state.history[0].salaryCents, $(1000));
    assert.equal(r.state.history[0].severanceCents, $(3000));
    assert.equal(r.state.history[0].netProfitCents, -$(4000));
  });

  it('уволенный прямо перед концом месяца не попадает в зарплатный фонд', () => {
    let s = startContract(createEconomy($(10_000)), 'm1', 0);
    s = fireMechanic(s, 'm1', MONTH_MS - 1).state;
    assert.equal(previewClose(s, 0).payrollCents, 0);
  });

  it('повторный наём — новый контракт с нуля', () => {
    let s = startContract(createEconomy($(10_000)), 'm1', 0);
    s = setMechanicBusy(s, 'm1', true, 0);
    s = fireMechanic(s, 'm1', 50_000).state;
    s = startContract(s, 'm1', 100_000);
    const c = s.contracts.m1;
    assert.equal(c.hiredAtMs, 100_000);
    assert.equal(c.jobsDoneTotal, 0);
    assert.equal(c.busySinceMs, null);
    assert.equal(accruedSalaryCents(c, MONTH_MS), SALARY / 3 * 2);
  });

  it('не хватает денег на увольнение — недостаток в кредит, свободных денег не появляется', () => {
    let s = startContract(createEconomy($(1000)), 'm1', 0, $(3000));
    s = fireMechanic(s, 'm1', 10 * DAY_MS).state;
    assert.equal(s.balanceCents, 0);
    assert.equal(s.loan?.principalCents, $(3000));
  });
});

describe('активы и продажи', () => {
  it('покупка уменьшает баланс и создаёт актив без убытка в прибыли', () => {
    let s = createEconomy($(20_000));
    s = buyCar(s, { carId: 'c1', name: 'Car', priceCents: $(10_000) }).state;
    assert.equal(s.balanceCents, $(10_000));
    assert.equal(assetsTotalCents(s), $(10_000));
    assert.equal(getMonthResult(s, 0).netProfitCents, 0);
  });

  it('продажа: на баланс вся цена, прибыль = выручка − себестоимость', () => {
    let s = createEconomy($(20_000));
    s = buyCar(s, { carId: 'c1', name: 'Car', priceCents: $(10_000) }).state;
    s = { ...s, assets: { c1: { ...s.assets.c1, extraCostsCents: $(2000) } } };
    s = sellCar(s, { carId: 'c1', priceCents: $(16_000), fallbackCostCents: 0 });
    assert.equal(s.balanceCents, $(26_000));
    assert.equal(getMonthResult(s, 0).dealProfitCents, $(4000));
    assert.equal(assetsTotalCents(s), 0);
  });

  it('повторная продажа той же машины не начисляет деньги дважды', () => {
    let s = buyCar(createEconomy($(20_000)), { carId: 'c1', name: 'Car', priceCents: $(10_000) }).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(15_000), fallbackCostCents: 0 });
    s = sellCar(s, { carId: 'c1', priceCents: $(15_000), fallbackCostCents: 0 });
    assert.equal(s.balanceCents, $(25_000));
  });

  it('прибыль не зачисляется повторно в зарплатный день', () => {
    let s = buyCar(createEconomy($(20_000)), { carId: 'c1', name: 'Car', priceCents: $(10_000) }).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(15_000), fallbackCostCents: 0 });
    const r = close(s, MONTH_MS);
    assert.equal(r.state.balanceCents, $(25_000));
    assert.equal(r.state.history[0].netProfitCents, $(5000));
  });

  it('машина куплена в одном месяце, продана в другом — прибыль в месяце продажи', () => {
    let s = buyCar(createEconomy($(20_000)), { carId: 'c1', name: 'Car', priceCents: $(10_000) }).state;
    s = close(s, MONTH_MS).state;
    assert.equal(s.history[0].netProfitCents, 0);
    s = sellCar(s, { carId: 'c1', priceCents: $(12_000), fallbackCostCents: 0 });
    s = close(s, 2 * MONTH_MS).state;
    assert.equal(s.history[1].netProfitCents, $(2000));
  });

  it('гараж — вложение, а не расход месяца; доход фонтана — прочий доход', () => {
    let s = buyGarage(createEconomy($(30_000)), $(25_000)).state;
    s = earnOtherIncome(s, 10);
    const r = getMonthResult(s, 0);
    assert.equal(r.investmentsCents, $(25_000));
    assert.equal(r.netProfitCents, 10);
    assert.equal(s.balanceCents, $(5000) + 10);
  });
});

describe('кредит', () => {
  it('нехватка на зарплату покрывается кредитом ровно на недостающую сумму', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    assert.equal(s.balanceCents, 0);
    assert.deepEqual(s.loan, { principalCents: $(3000), issuedMonth: 1, dueMonth: 7 });
    assert.equal(loanMonthsLeft(s), 6);
  });

  it('кредит месяца 3 нужно погасить до конца месяца 9', () => {
    let s = createEconomy($(1000));
    s = close(s, MONTH_MS).state;
    s = close(s, 2 * MONTH_MS).state;
    s = startContract(s, 'm1', 2 * MONTH_MS, $(4000));
    s = close(s, 3 * MONTH_MS).state;
    assert.equal(s.loan?.issuedMonth, 3);
    assert.equal(s.loan?.dueMonth, 9);
  });

  it('новая нехватка увеличивает действующий кредит, но не продлевает срок', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    const due = s.loan?.dueMonth;
    s = close(s, 2 * MONTH_MS).state;
    assert.equal(s.loan?.principalCents, $(8000));
    assert.equal(s.loan?.dueMonth, due);
  });

  it('частичное погашение уменьшает долг; нельзя отдать больше баланса или долга', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    s = { ...s, balanceCents: $(10_000) };
    s = repayLoan(s, $(1000)).state;
    assert.equal(s.loan?.principalCents, $(2000));
    s = repayLoan(s, $(999_999)).state;
    assert.equal(s.loan, null);
    assert.equal(s.balanceCents, $(7000));
  });

  it('выручка от продажи не идёт на кредит автоматически', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    s = buyCar({ ...s, balanceCents: $(1000) }, { carId: 'c1', name: 'Car', priceCents: $(1000) }).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(4000), fallbackCostCents: 0 });
    assert.equal(s.balanceCents, $(4000));
    assert.equal(s.loan?.principalCents, $(3000));
  });

  it('кредит не даёт денег на покупки', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    assert.equal(canAfford(s, $(1)), false);
    assert.equal(buyCar(s, { carId: 'c1', name: 'Car', priceCents: $(1) }).ok, false);
  });

  it('погашение в отчёте месяца с ползунка', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    s = { ...s, balanceCents: $(20_000) };
    const preview = previewClose(s, $(2000));
    assert.equal(preview.repayCents, $(2000));
    s = close(s, 2 * MONTH_MS, $(2000)).state;
    assert.equal(s.loan?.principalCents, $(1000));
    assert.equal(s.balanceCents, $(20_000) - $(5000) - $(2000));
  });

  it('последний месяц: денег хватает — долг гасится целиком, игра продолжается', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state; // кредит $3 000 до конца месяца 7
    for (let m = 2; m <= 6; m++) s = close({ ...s, balanceCents: s.balanceCents + $(5000) }, m * MONTH_MS).state;
    assert.equal(loanMonthsLeft(s), 1);
    s = { ...s, balanceCents: s.balanceCents + $(8000) };
    const preview = previewClose(s, 0);
    assert.equal(preview.isLoanDeadline, true);
    assert.equal(preview.repayCents, $(3000));
    const r = close(s, 7 * MONTH_MS);
    assert.equal(r.outcome, 'closed');
    assert.equal(r.state.loan, null);
  });

  it('последний месяц: денег не хватает — банкротство', () => {
    let s = startContract(createEconomy($(2000)), 'm1', 0, $(5000));
    s = close(s, MONTH_MS).state;
    for (let m = 2; m <= 6; m++) s = close({ ...s, balanceCents: s.balanceCents + $(5000) }, m * MONTH_MS).state;
    s = { ...s, balanceCents: s.balanceCents + $(6000) }; // нужно 5 000 + 3 000
    const r = close(s, 7 * MONTH_MS);
    assert.equal(r.outcome, 'bankrupt');
    assert.equal(r.state.bankruptcy?.shortfallCents, $(2000));
    assert.equal(isPaydayPending(r.state, 7 * MONTH_MS), false, 'после банкротства время стоит');
    const closedNet = s.history.reduce((sum, m) => sum + m.netProfitCents, 0);
    assert.equal(r.state.totals.netProfitCents, closedNet - $(5000), 'итоги включают месяц банкротства');
  });
});

describe('загрузка и советы', () => {
  it('загрузка считается от времени в штате в этом месяце', () => {
    let s = startContract(createEconomy(0), 'm1', 10 * DAY_MS);
    s = setMechanicBusy(s, 'm1', true, 10 * DAY_MS);
    s = setMechanicBusy(s, 'm1', false, 15 * DAY_MS);
    const a = getMechanicActivity(s, s.contracts.m1, 20 * DAY_MS);
    assert.equal(a.staffMs, 10 * DAY_MS);
    assert.equal(a.busyMs, 5 * DAY_MS);
    assert.equal(a.loadPct, 0.5);
  });

  it('простой показывается только после достаточного наблюдения', () => {
    const s = startContract(createEconomy($(100_000)), 'm1', 0);
    const early = buildAdvice(s, { now: 2 * DAY_MS, mechanicNames: { m1: 'Иван' }, emptySlots: 0, carsAwaitingRepair: 0 });
    assert.equal(early.some((a) => a.id === 'idle-m1'), false);
    const later = buildAdvice(s, { now: 20 * DAY_MS, mechanicNames: { m1: 'Иван' }, emptySlots: 0, carsAwaitingRepair: 0 });
    assert.equal(later.some((a) => a.id === 'idle-m1'), true);
  });

  it('предупреждение о нехватке денег перед зарплатой', () => {
    const s = startContract(createEconomy($(100)), 'm1', 0);
    const advice = buildAdvice(s, { now: MONTH_MS - 30_000, mechanicNames: {}, emptySlots: 0, carsAwaitingRepair: 0 });
    assert.equal(advice.some((a) => a.id === 'payday-short'), true);
  });

  it('убыток второй месяц подряд', () => {
    let s = startContract(createEconomy($(100_000)), 'm1', 0);
    s = close(s, MONTH_MS).state;
    s = close(s, 2 * MONTH_MS).state;
    const advice = buildAdvice(s, { now: 2 * MONTH_MS, mechanicNames: {}, emptySlots: 0, carsAwaitingRepair: 0 });
    assert.equal(advice.some((a) => a.id === 'loss-streak'), true);
    assert.equal(s.history[1].netProfitCents, -SALARY, 'отрицательная прибыль не обнуляется');
  });
});

describe('история', () => {
  it('хранятся последние 12 месяцев', () => {
    let s = createEconomy($(1));
    for (let m = 1; m <= 15; m++) s = close(s, m * MONTH_MS).state;
    assert.equal(s.history.length, 12);
    assert.equal(s.history[0].month, 4);
    assert.equal(monthEndMs(s), 16 * MONTH_MS);
  });
});

describe('опыт игрока в экономике', () => {
  const car = { carId: 'c1', name: 'Car', tier: 1, priceCents: $(1000), conditionPct: 50, maxConditionPct: 80 };

  it('продажа с прибылью даёт XP один раз, убыток — ничего', () => {
    let s = buyCar(createEconomy($(10_000)), car).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(1250), fallbackCostCents: 0 });
    assert.equal(s.player.xp.totalXp, 50);
    s = sellCar(s, { carId: 'c1', priceCents: $(1250), fallbackCostCents: 0 });
    assert.equal(s.player.xp.totalXp, 50, 'повторная обработка не начисляет XP');
    let loss = buyCar(createEconomy($(10_000)), car).state;
    loss = sellCar(loss, { carId: 'c1', priceCents: $(900), fallbackCostCents: 0 });
    assert.equal(loss.player.xp.totalXp, 0);
  });

  it('полный ремонт: бонус один раз, по износу при покупке', () => {
    let s = buyCar(createEconomy($(10_000)), car).state; // износ 30 → полный бонус 10
    s = awardFullRepair(s, 'c1');
    s = awardFullRepair(s, 'c1');
    assert.equal(s.player.xp.totalXp, 10);
  });

  it('неполный ремонт и продажа без восстановления не дают бонус ремонта', () => {
    let s = buyCar(createEconomy($(10_000)), car).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(1000), fallbackCostCents: 0 });
    assert.equal(s.player.xp.totalXp, 0);
  });

  it('прибыльный месяц: +10% XP продаж один раз; убыточный и нулевой — без бонуса', () => {
    let s = buyCar(createEconomy($(10_000)), car).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(2000), fallbackCostCents: 0 }); // ROI 100% → 200 XP
    s = awardFullRepair(s, 'c1'); // нет в активах — ничего
    const closed = close(s, MONTH_MS);
    assert.equal(closed.state.history[0].monthXp, 20);
    assert.equal(closed.state.player.xp.totalXp, 220);
    assert.equal(close(closed.state, MONTH_MS).outcome, 'noop', 'бонус не выдаётся повторно');

    let losing = startContract(buyCar(createEconomy($(10_000)), car).state, 'm1', 0);
    losing = sellCar(losing, { carId: 'c1', priceCents: $(1100), fallbackCostCents: 0 }); // +$100, зарплата $360
    assert.equal(close(losing, MONTH_MS).state.history[0].monthXp, 0);
    assert.equal(close(createEconomy(0), MONTH_MS).state.history[0].monthXp, 0);
  });

  it('XP переживает сохранение и не начисляется заново', () => {
    let s = buyCar(createEconomy($(10_000)), car).state;
    s = sellCar(s, { carId: 'c1', priceCents: $(1250), fallbackCostCents: 0 });
    const restored = must(deserializeEconomy(serializeEconomy(s, 0)));
    const again = sellCar(restored.state, { carId: 'c1', priceCents: $(1250), fallbackCostCents: 0 });
    assert.equal(again.player.xp.totalXp, 50);
  });

  it('перенос старого опыта сохраняет уровень', () => {
    const migrated = migrateLegacyPlayer(createEconomy(0, true, false), { totalXp: 2500, skillLevel: 3 });
    assert.equal(migrated.player.xp.level, 2);
    assert.equal(migrated.player.xp.xp, Math.floor(0.25 * requiredXp(2)));
    assert.equal(migrated.player.skill.level, 3);
    assert.equal(migrateLegacyPlayer(migrated, { totalXp: 999_999, skillLevel: 9 }), migrated);
  });
});

describe('навыки и курсы в экономике', () => {
  it('ручной тап: ровно 1 практика', () => {
    let s = createEconomy(0);
    for (let i = 0; i < 1001; i++) s = recordPlayerTap(s);
    assert.equal(s.player.skill.level, 2);
    assert.equal(s.player.skill.practice, 1);
    assert.equal(s.player.manualTaps, 1001);
  });

  it('механик: 2 практики за секунду ремонта, простой не считается', () => {
    let s = startContract(createEconomy(0), 'm1', 0);
    s = setMechanicBusy(s, 'm1', true, 0);
    s = setMechanicBusy(s, 'm1', false, 100_000); // 100 сек ремонта
    assert.equal(s.contracts.m1.skill.practice, 200);
    assert.equal(workerPracticeAt(s.contracts.m1, 200_000), 200, 'в простое практика стоит');
  });

  it('повышение навыка механика меняет только будущую зарплату', () => {
    let s = startContract(createEconomy(0), 'm1', 0);
    s = setMechanicBusy(s, 'm1', true, 0);
    s = syncWorkerSkill(s, 'm1', MONTH_MS); // порог 1000 практики → 500 сек > месяца, уровня нет
    assert.equal(s.contracts.m1.skill.level, 1);
    s = syncWorkerSkill(s, 'm1', 500_000); // 1000 практики ровно на 500-й секунде
    const c = s.contracts.m1;
    assert.equal(c.skill.level, 2);
    assert.equal(c.levelChangedAtMs, 500_000);
    assert.equal(c.monthlyCents, salaryForLevel(2));
    // Начисления до 500 сек — по старой ставке
    assert.equal(c.segments.find((seg) => seg.toMs === 500_000)?.monthlyCents, SALARY);
  });

  it('увольнение сбрасывает навык, повторный наём — с уровня 1', () => {
    let s = startContract(createEconomy($(100_000)), 'm1', 0);
    s = { ...s, contracts: { ...s.contracts, m1: { ...s.contracts.m1, skill: { ...s.contracts.m1.skill, practice: 500 } } } };
    s = buyWorkerCourse(s, 'm1', 0).state; // пример C: 500/1000 + курс → уровень 2
    assert.equal(s.contracts.m1.skill.level, 2);
    assert.equal(s.contracts.m1.skill.practice, 0);
    s = fireMechanic(s, 'm1', COURSE_COOLDOWN_MS).state;
    s = startContract(s, 'm1', COURSE_COOLDOWN_MS + 1);
    assert.equal(s.contracts.m1.skill.level, 1);
    assert.equal(s.contracts.m1.skill.courseCooldownUntilMs, 0);
    assert.equal(s.contracts.m1.monthlyCents, SALARY);
  });

  it('курс — расход месяца, без XP; перезарядки игрока и механика независимы и сохраняются', () => {
    let s = startContract(createEconomy($(10_000)), 'm1', 0);
    s = buyPlayerCourse(s, 1000).state;
    assert.equal(s.balanceCents, $(9000));
    assert.equal(s.ledger.otherExpenseCents, $(1000));
    assert.equal(s.player.skill.practice, 500);
    assert.equal(s.player.xp.totalXp, 0);
    assert.equal(buyPlayerCourse(s, 2000).ok, false, 'второй курс на том же уровне нельзя');
    const worker = buyWorkerCourse(s, 'm1', 2000);
    assert.equal(worker.ok, true, 'перезарядка игрока не мешает механику');
    const restored = must(deserializeEconomy(serializeEconomy(worker.state, 2000)));
    assert.equal(restored.state.player.skill.courseCooldownUntilMs, 1000 + COURSE_COOLDOWN_MS);
    assert.equal(restored.state.contracts.m1.skill.courseCooldownUntilMs, 2000 + COURSE_COOLDOWN_MS);
    assert.equal(getMonthResult(restored.state, 2000).otherExpenseCents, $(1000) + $(200));
  });

  it('курс не оплачивается кредитом', () => {
    const s = createEconomy($(500));
    assert.equal(buyPlayerCourse(s, 0).ok, false);
  });
});
