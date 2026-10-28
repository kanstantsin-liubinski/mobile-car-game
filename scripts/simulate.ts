/**
 * Балансировочный симулятор Car Tycoon.
 *
 * Использует настоящие формулы игры: генератор машин авторынка, формулу цены и общего состояния,
 * оклады по допуску, детали, покраску, генератор заказов, формулы XP.
 * Запуск: node --no-warnings scripts/simulate.ts  (пишет docs/BALANCE_REPORT.md)
 *
 * Модель упрощена там, где реальная игра зависит от решений игрока: «хорошая сделка» — лучшая
 * четверть объявлений по прибыли на день занятия слота (игрок выбирает, а не берёт всё подряд).
 */
import './nodeShim.ts';
import { writeFileSync } from 'node:fs';
import * as B from '../src/economy/balance.ts';
import * as O from '../src/economy/orders.ts';
import * as P from '../src/economy/progression.ts';
import { carValue, paintValueGain } from '../src/economy/carCondition.ts';
import { generateRandomListing } from '../src/utils/marketGenerator.ts';
import { mulberry32 } from '../src/economy/hotOffers.ts';
import * as E from '../src/economy/economy.ts';
import * as Br from '../src/economy/branches.ts';
import * as L from '../src/economy/legacy.ts';
import { DAY_MS, MONTH_MS } from '../src/economy/time.ts';
import { TIER_NAMES, TIER_UNLOCK_LEVELS } from '../src/data/carModels.ts';
import { GARAGES } from '../src/data/cityBuildings.ts';

const out: string[] = [];
const log = (line = '') => {
  out.push(line);
  console.log(line);
};
const usd = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const topQuartile = <T,>(xs: T[], key: (x: T) => number) =>
  [...xs].sort((a, b) => key(b) - key(a)).slice(0, Math.max(1, Math.floor(xs.length / 4)));

const MECHANIC_PTS_PER_DAY = B.MECHANIC_POINTS_PER_DAY;
const TAP_REPAIR = 0.1;
const PAINTER_PTS_PER_DAY = B.PAINTER_SPEED_PER_SEC * 10;
const BUY_DAYS = 1;
const SAMPLES = 3000;
/** Варианты продажи: ползунок −10% (сразу), 0% и +10% — сроки по классу машины (B.saleDays) */
const saleOptions = (tier: number) => [
  { mult: 0.9, days: B.saleDays(tier, -10) },
  { mult: 1, days: B.saleDays(tier, 0) },
  { mult: 1.1, days: B.saleDays(tier, 10) },
];

interface Deal {
  tier: number;
  buy: number;
  profit: number;
  days: number;
  perDay: number;
  xp: number;
}

type RepairMode = 'mechanic' | 'taps';
type PaintMode = 'none' | 'service' | 'booth';

/**
 * Перепродажа одной машины: купить по цене объявления, починить техническую часть до максимума,
 * по желанию покрасить, продать лучшим для прибыли/день вариантом ползунка. Слот занят всё это время.
 */
const resaleDeal = (
  tier: number,
  rng: () => number,
  opts: { repair: RepairMode; tapsPerDay?: number; paint: PaintMode; mechanicClearance?: number },
): Deal => {
  const { car } = generateRandomListing(tier, 0, [], rng);
  const base = car.basePrice!;
  const max = car.maxCondition!;
  const paint0 = car.paintCondition!;
  const buy = car.price;
  const before = { year: car.year, mileage: car.mileage, condition: car.condition, paintCondition: paint0 };
  const techGain = carValue(base, { ...before, condition: max }) - carValue(base, before);
  const parts = techGain * B.OWN_REPAIR_PARTS_SHARE;
  const techPts = Math.max(0, max - car.condition);
  const clearance = opts.mechanicClearance ?? tier;
  const speed =
    opts.repair === 'mechanic'
      ? MECHANIC_PTS_PER_DAY * (clearance >= tier ? 1 : B.NO_CLEARANCE_SPEED)
      : (opts.tapsPerDay ?? 30) * TAP_REPAIR;
  const repairDays = techPts / speed;
  let paintCost = 0;
  let paintDays = 0;
  let paintTo = paint0;
  if (opts.paint !== 'none' && paint0 < 100) {
    const gain = paintValueGain(base, car.year, car.mileage, paint0, 100);
    paintTo = 100;
    if (opts.paint === 'service') {
      paintCost = gain * B.SERVICE_PAINT_SHARE;
      paintDays = B.SERVICE_PAINT_BASE_DAYS + Math.ceil((100 - paint0) / B.SERVICE_PAINT_POINTS_PER_DAY);
    } else {
      paintDays = (100 - paint0) / PAINTER_PTS_PER_DAY;
      paintCost = gain * B.OWN_PAINT_MATERIALS_SHARE + (B.painterBaseSalaryCents(tier) / 100 / 30) * paintDays;
    }
  }
  const market = carValue(base, { ...before, condition: max, paintCondition: paintTo });
  const salaryPerDay = opts.repair === 'mechanic' ? B.mechanicBaseSalaryCents(clearance) / 100 / 30 : 0;
  let best: Deal | null = null;
  for (const sale of saleOptions(tier)) {
    // Механик закреплён за слотом и получает оклад весь цикл — и пока машина продаётся
    const days = BUY_DAYS + repairDays + paintDays + sale.days;
    const salePrice = market * sale.mult;
    const profit = salePrice - buy - parts - paintCost - salaryPerDay * days;
    const deal: Deal = {
      tier,
      buy,
      profit,
      days,
      perDay: profit / days,
      xp: P.saleXp(tier, salePrice, buy, parts + paintCost) + P.fullRepairXp(tier, max - car.condition),
    };
    if (!best || deal.perDay > best.perDay) best = deal;
  }
  return best!;
};

const deals = (tier: number, opts: Parameters<typeof resaleDeal>[2], seed = 1) => {
  const rng = mulberry32(seed * 7919 + tier);
  return Array.from({ length: SAMPLES }, () => resaleDeal(tier, rng, opts));
};
/** Лучшая четверть сделок по прибыли на день слота — так выбирает внимательный игрок */
const good = (ds: Deal[]) => topQuartile(ds, (d) => d.perDay);
const perSlotMonth = (ds: Deal[]) => mean(ds.map((d) => d.perDay)) * 30;

log('# Car Tycoon — отчёт балансировочного симулятора');
log('');
log(`Сгенерировано \`node --no-warnings scripts/simulate.ts\` на реальных формулах игры, ${SAMPLES} машин на класс и стратегию.`);
log('«Хорошая сделка» — лучшая четверть объявлений по прибыли на день занятия слота: игрок выбирает, а не покупает всё подряд.');
log(`Продажа — лучший для прибыли/день вариант ползунка: −10% сразу, 0% и +10% — за ${[1, 2, 3, 4, 5, 6].map((t) => `${B.saleDays(t, 0)}/${B.saleDays(t, 10)}`).join(', ')} дней по классам. 1 игровой месяц = 5 минут игры.`);

// ─── 1. Перепродажа по классам ─────────────────────────────────────────────

log('');
log('## 1. Перепродажа: механик с допуском класса, детали 30% прироста');
log('');
log('| Класс | Оклад механика | Оклад / прирост за месяц полной загрузки | Случайная сделка, $/слот·мес | Хорошая сделка, $/слот·мес | Убыточных случайных | Дней на цикл (хорошая) | XP хорошей сделки | Цена покупки (хорошая) |');
log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
const resaleGood: Record<number, { month: number; xp: number; days: number; buy: number }> = {};
for (let tier = 1; tier <= 6; tier++) {
  const ds = deals(tier, { repair: 'mechanic', paint: 'none' });
  const g = good(ds);
  const salary = B.mechanicBaseSalaryCents(tier) / 100;
  const share = salary / (MECHANIC_PTS_PER_DAY * 30 * B.TECH_WEIGHT * B.tierPointValue(tier));
  resaleGood[tier] = { month: perSlotMonth(g), xp: mean(g.map((d) => d.xp)), days: mean(g.map((d) => d.days)), buy: mean(g.map((d) => d.buy)) };
  log(
    `| ${TIER_NAMES[tier]} | ${usd(salary)} | ${pct(share)} | ${usd(perSlotMonth(ds))} | ${usd(resaleGood[tier].month)} | ${pct(
      ds.filter((d) => d.profit < 0).length / ds.length,
    )} | ${Math.round(resaleGood[tier].days)} | ${Math.round(resaleGood[tier].xp)} | ${usd(resaleGood[tier].buy)} |`,
  );
}

log('');
log('## 2. Механик без допуска (×0,5) против механика с допуском');
log('');
log('| Класс машины | Механик с допуском «Эконом», $/слот·мес | С допуском класса, $/слот·мес | Путь допуска окупается за |');
log('|---|---:|---:|---:|');
for (const tier of [2, 3, 4]) {
  const low = perSlotMonth(good(deals(tier, { repair: 'mechanic', paint: 'none', mechanicClearance: 1 }, 5)));
  const high = perSlotMonth(good(deals(tier, { repair: 'mechanic', paint: 'none' }, 5)));
  let cost = 0;
  for (let c = 2; c <= tier; c++) cost += (B.CLEARANCE_UPGRADE_SALARIES * B.mechanicBaseSalaryCents(c)) / 100;
  log(`| ${TIER_NAMES[tier]} | ${usd(low)} | ${usd(high)} | ${high > low ? `${(cost / (high - low)).toFixed(1)} мес.` : 'не окупается'} |`);
}

log('');
log('## 3. Ручной ремонт тапами (без механика), Эконом');
log('');
log('| Тапов в игровой день | Хорошая сделка, $/слот·мес | Дней на цикл |');
log('|---:|---:|---:|');
for (const taps of [10, 30, 60]) {
  const g = good(deals(1, { repair: 'taps', tapsPerDay: taps, paint: 'none' }));
  log(`| ${taps} | ${usd(perSlotMonth(g))} | ${Math.round(mean(g.map((d) => d.days)))} |`);
}

// ─── 2. Покраска ───────────────────────────────────────────────────────────

log('');
log('## 4. Покраска: сервис против своей камеры с маляром (хорошие сделки)');
log('');
const boothPrice = B.EQUIPMENT.find((e) => e.id === 'paint_booth')!.price;
log(`Камера стоит ${usd(boothPrice)} и постоянно занимает слот. Маляр: ${usd(B.painterBaseSalaryCents(1) / 100)}/мес (допуск «Эконом»).`);
log('');
log('Машина красится в слоте камеры, поэтому покраска не занимает рабочий слот — сравнивается цена одной покраски до 100%.');
log('');
log('| Класс | Прирост цены (средн.) | Сервис берёт | Своя камера: материалы + время маляра | Своя камера: материалы (красит игрок) | Экономия с маляром | Покрасок до окупаемости (маляр / игрок) | Маляр: чистыми в месяц полной загрузки |');
log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const tier of [1, 2, 3, 4]) {
  const rng = mulberry32(99 + tier);
  const painterPerDay = B.painterBaseSalaryCents(tier) / 100 / 30;
  const rows = Array.from({ length: SAMPLES }, () => {
    const { car } = generateRandomListing(tier, 0, [], rng);
    const gain = paintValueGain(car.basePrice!, car.year, car.mileage, car.paintCondition!, 100);
    const days = (100 - car.paintCondition!) / PAINTER_PTS_PER_DAY;
    return { gain, service: gain * B.SERVICE_PAINT_SHARE, materials: gain * B.OWN_PAINT_MATERIALS_SHARE, painter: painterPerDay * days, days };
  });
  const g = mean(rows.map((r) => r.gain));
  const service = mean(rows.map((r) => r.service));
  const materials = mean(rows.map((r) => r.materials));
  const painter = mean(rows.map((r) => r.painter));
  const savePainter = service - materials - painter;
  const savePlayer = service - materials;
  const paintsPerMonth = 30 / mean(rows.map((r) => r.days));
  log(
    `| ${TIER_NAMES[tier]} | ${usd(g)} | ${usd(service)} | ${usd(materials + painter)} | ${usd(materials)} | ${usd(savePainter)} | ${
      savePainter > 0 ? Math.ceil(boothPrice / savePainter) : '—'
    } / ${Math.ceil(boothPrice / savePlayer)} | ${usd(savePainter * paintsPerMonth)} |`,
  );
}
log('');
log('| Класс | Перепродажа без покраски, $/слот·мес | С покраской в сервисе, $/слот·мес |');
log('|---|---:|---:|');
for (const tier of [1, 2, 3, 4]) {
  log(
    `| ${TIER_NAMES[tier]} | ${usd(perSlotMonth(good(deals(tier, { repair: 'mechanic', paint: 'none' }, 3))))} | ${usd(
      perSlotMonth(good(deals(tier, { repair: 'mechanic', paint: 'service' }, 3))),
    )} |`,
  );
}

// ─── 3. Клиентские заказы ──────────────────────────────────────────────────

const sampleCar = (tier: number, rng: () => number): O.SampleCar => {
  const { car } = generateRandomListing(tier, 0, [], rng);
  return {
    tier,
    name: car.name,
    emoji: car.emoji,
    speed: car.speed,
    year: car.year,
    mileage: car.mileage,
    basePrice: car.basePrice!,
    condition: car.condition,
    maxCondition: car.maxCondition!,
    paintCondition: car.paintCondition!,
  } as O.SampleCar;
};

/** Ремонтные заказы: прибыль на слот в месяц при полной загрузке механиком с допуском класса заказа */
const serviceOrders = (reputation: number, level: number, tiers: number[], simpleOnly = false) => {
  const perDay: number[] = [];
  for (let seed = 1; perDay.length < 1500 && seed < 20000; seed++) {
    const st = O.advanceOrders(
      { ...O.createOrdersState(seed, 0), reputation, lastOrderAtMs: -10 * DAY_MS },
      0,
      { unlockedTiers: tiers, owned: ['basic_tools', 'engine', 'transmission'], playerLevel: level, sampleCar },
    );
    for (const o of st.board) {
      if (o.kind !== 'service' || o.type === 'paint') continue;
      if (simpleOnly && O.isComplex(o)) continue;
      const days = o.workPoints / MECHANIC_PTS_PER_DAY;
      perDay.push((o.rewardCents - o.partsCents) / 100 / days - B.mechanicBaseSalaryCents(o.tier) / 100 / 30);
    }
  }
  return mean(perDay) * 30;
};

/** Сколько ремонтных заказов приходит в месяц при данной репутации (доска разбирается каждый день) */
const ordersPerMonth = (reputation: number) => {
  let total = 0;
  const runs = 40;
  for (let seed = 1; seed <= runs; seed++) {
    let s = { ...O.createOrdersState(seed, 0), reputation };
    const ctx = { unlockedTiers: [1], owned: ['basic_tools'] as B.EquipmentId[], playerLevel: 1, sampleCar };
    for (let day = 1; day <= 60; day++) {
      s = O.advanceOrders(s, day * DAY_MS, ctx);
      total += s.board.filter((o) => o.kind === 'service').length;
      s = { ...s, board: [] };
    }
  }
  return total / runs / 2;
};

log('');
log('## 5. Ремонтные заказы клиентов (слот загружен полностью, механик с нужным допуском)');
log('');
log('| Классы | Репутация | Уровень | Все заказы, $/слот·мес | Простые (ТО, подвеска), $/слот·мес | Перепродажа (хорошая), $/слот·мес |');
log('|---|---:|---:|---:|---:|---:|');
for (const [tiers, rep, level] of [
  [[1], 100, 1],
  [[1], 500, 10],
  [[1], 1000, 20],
  [[1, 2], 500, 12],
  [[1, 2, 3], 1000, 30],
  [[1, 2, 3, 4], 1000, 100],
] as [number[], number, number][]) {
  log(
    `| ${tiers.map((t) => TIER_NAMES[t]).join(', ')} | ${rep} | ${level} | ${usd(serviceOrders(rep, level, tiers))} | ${usd(
      serviceOrders(rep, level, tiers, true),
    )} | ${usd(mean(tiers.map((t) => resaleGood[t].month)))} |`,
  );
}
log('');
log('| Репутация | Ремонтных заказов в месяц |');
log('|---:|---:|');
for (const rep of [100, 250, 500, 750, 1000]) log(`| ${rep} | ${ordersPerMonth(rep).toFixed(1)} |`);

// ─── 4. Карьера: уровни и гаражи ───────────────────────────────────────────

/**
 * Упрощённая карьера: все слоты заняты хорошими сделками самого выгодного открытого класса, который
 * по карману (на машину нужна её цена + 20% на детали и оклады). Следующий гараж покупается,
 * когда хватает денег с запасом 30% и есть уровень.
 */
/** Активный игрок: сам чинит тапами одну машину (10 тапов в игровой день ≈ 1 тап в секунду) */
const tapGood: Record<number, { month: number; xp: number; days: number; buy: number }> = {};
for (let tier = 1; tier <= 6; tier++) {
  const g = good(deals(tier, { repair: 'taps', tapsPerDay: 10, paint: 'none' }, 7));
  tapGood[tier] = { month: perSlotMonth(g), xp: mean(g.map((d) => d.xp)), days: mean(g.map((d) => d.days)), buy: mean(g.map((d) => d.buy)) };
}

interface CareerOpts {
  garagePrices: number[];
  garageLevels: number[];
  tierLevels: Record<number, number>;
  /** Игрок сам чинит одну машину тапами */
  active: boolean;
  /** XP на переход с уровня; по умолчанию — формула игры */
  xpCurve?: (level: number) => number;
  maxMonths?: number;
  /** Очки наследия этой карьеры */
  legacyPoints?: number;
  /** Награды за уровни и прибавка наследия к стартовому капиталу (нет у конфигов до обновления) */
  rewards?: boolean;
  /** Остановить карьеру (перезапуск), когда условие выполнено */
  stop?: (x: { level: number; cash: number; month: number }) => boolean;
}

const addXpWith = (p: P.PlayerXp, amount: number, curve: (level: number) => number): P.PlayerXp => {
  let { level, xp } = p;
  xp += Math.floor(amount);
  while (xp >= curve(level)) {
    xp -= curve(level);
    level += 1;
  }
  return { level, xp, totalXp: p.totalXp + Math.floor(amount) };
};

/**
 * Упрощённая карьера: все слоты заняты хорошими сделками самого выгодного открытого класса, который
 * по карману (на машину нужна её цена + 20% на детали и оклады). Следующий гараж покупается,
 * когда хватает денег с запасом 30% и есть уровень. Наличность фиксируется в момент, когда гараж
 * становится доступен по уровню, — по ней подбирается цена.
 */
const career = (o: CareerOpts) => {
  const rewards = o.rewards ?? true;
  let cash = L.BASE_START_CASH + (rewards ? L.legacyStartCash(o.legacyPoints ?? 0) : 0);
  let garage = 0;
  let player = P.createPlayerXp();
  let baseProfit = 0;
  let months = 0;
  const profitMult = L.legacyProfitMultiplier(o.legacyPoints ?? 0);
  const xpMult = L.legacyXpMultiplier(o.legacyPoints ?? 0);
  const at: Record<string, number> = {};
  const cashAt: Record<string, number> = {};
  for (let month = 1; month <= (o.maxMonths ?? 3000); month++) {
    months = month;
    const cashBefore = cash;
    const slots = GARAGES[garage].slots;
    const open = (t: number) => player.level >= (o.tierLevels[t] ?? 0);
    const best = (pool: typeof resaleGood) => {
      const ok = [1, 2, 3, 4, 5, 6].filter((t) => open(t) && cash >= pool[t].buy * 1.2);
      return ok.length ? ok.reduce((a, b) => (pool[b].month > pool[a].month ? b : a)) : 1;
    };
    let xp = 0;
    let free = slots;
    if (o.active) {
      const t = best(tapGood);
      cash += tapGood[t].month;
      xp += (30 / tapGood[t].days) * tapGood[t].xp;
      free -= 1;
    }
    if (free > 0) {
      const t = best(resaleGood);
      const used = Math.max(o.active ? 0 : 1, Math.min(free, Math.floor(cash / (resaleGood[t].buy * 1.2))));
      cash += used * resaleGood[t].month;
      xp += ((used * 30) / resaleGood[t].days) * resaleGood[t].xp;
    }
    // Наследие: бонус к положительной прибыли (отдельной строкой, в базу очков не входит), XP × множитель
    const earned = cash - cashBefore;
    baseProfit += earned;
    if (earned > 0) cash += earned * (profitMult - 1);
    const levelBefore = player.level;
    player = addXpWith(player, xp * xpMult + xp * 0.1, o.xpCurve ?? P.requiredXp); // +10% от базового XP — бонус прибыльного месяца
    // Награда за уровни: на деньги, но не в базовую прибыль (как в игре — в базу очков наследия не входит)
    if (rewards) cash += P.levelUpRewardsBetween(levelBefore, player.level);
    const next = garage + 1;
    if (next < GARAGES.length && player.level >= o.garageLevels[next] && cashAt[GARAGES[next].name] === undefined) cashAt[GARAGES[next].name] = cash;
    if (next < GARAGES.length && cash >= o.garagePrices[next] * 1.3 && player.level >= o.garageLevels[next]) {
      cash -= o.garagePrices[next];
      garage = next;
      at[GARAGES[next].name] = month;
    }
    for (const lv of [5, 8, 12, 20, 35, 50, 75, 100]) if (player.level >= lv && at[`ур. ${lv}`] === undefined) at[`ур. ${lv}`] = month;
    if (cash >= 1e9 && at['$1 млрд'] === undefined) at['$1 млрд'] = month;
    if (o.stop ? o.stop({ level: player.level, cash, month }) : player.level >= 100) break;
  }
  return { at, cashAt, baseProfit, months, level: player.level, cash };
};

const hours = (m?: number) => (m === undefined ? '—' : `${m} (${((m * 5) / 60).toFixed(1)} ч)`);
const careerRow = (name: string, o: CareerOpts) => {
  const { at, cashAt } = career(o);
  log(
    `| ${name} | ${hours(at['ур. 5'])} | ${hours(at['ур. 12'])} | ${hours(at['ур. 20'])} | ${hours(at['ур. 50'])} | ${hours(at['ур. 100'])} | ${[
      'Гараж 2',
      'Гараж 3',
      'Гараж 4',
    ]
      .map((g) => `${hours(at[g])}, было ${cashAt[g] === undefined ? '—' : usd(cashAt[g])}`)
      .join(' | ')} |`,
  );
};

log('');
log('## 6. Карьера: скорость уровней и покупки гаражей');
log('');
log('Месяцев от старта (в скобках — часы игры). Для гаражей — когда куплен и сколько денег было, когда он стал доступен по уровню.');
log('');
log('| Вариант | Ур. 5 | Ур. 12 | Ур. 20 | Ур. 50 | Ур. 100 | Гараж 2 | Гараж 3 | Гараж 4 |');
log('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
const OLD_CURVE = (l: number) => 100 + 20 * (l - 1) + 4 * (l - 1) ** 2;
const OLD = { garagePrices: [0, 25_000, 75_000, 200_000], garageLevels: [0, 2, 5, 10], tierLevels: { 1: 0, 2: 5, 3: 10, 4: 15, 5: 20, 6: 25 }, xpCurve: OLD_CURVE };
const NEW = { garagePrices: GARAGES.map((g) => g.price), garageLevels: GARAGES.map((g) => g.requiredLevel), tierLevels: TIER_UNLOCK_LEVELS };
careerRow('До обновления, активный игрок', { ...OLD, active: true, rewards: false });
careerRow('Лестница + старая кривая XP, активный', { ...NEW, xpCurve: OLD_CURVE, active: true, rewards: false });
careerRow('Текущий конфиг, активный игрок', { ...NEW, active: true });
careerRow('Текущий конфиг, только механики', { ...NEW, active: false });
log('');
log(
  `Текущий конфиг: кривая XP ${P.XP_CURVE_BASE} + ${P.XP_CURVE_LINEAR}n + ${P.XP_CURVE_QUADRATIC}n², классы открываются на ур. ${[2, 3, 4, 5, 6]
    .map((t) => TIER_UNLOCK_LEVELS[t])
    .join('/')}, гаражи — на ур. ${GARAGES.slice(1)
    .map((g) => g.requiredLevel)
    .join('/')} за ${GARAGES.slice(1)
    .map((g) => usd(g.price))
    .join(' / ')}.`,
);

// ─── Наследие: серия карьер ────────────────────────────────────────────────

const NEW_CAREER = { garagePrices: GARAGES.map((g) => g.price), garageLevels: GARAGES.map((g) => g.requiredLevel), tierLevels: TIER_UNLOCK_LEVELS, active: true };

/** Серия карьер: каждая заканчивается перезапуском на своём уровне, последняя идёт до 100 уровня и $1 млрд */
const legacyRun = (restartLevels: number[]) => {
  let lifetimeCents = 0;
  let points = 0;
  let totalMonths = 0;
  const rows: string[] = [];
  for (let i = 0; i <= restartLevels.length; i++) {
    const last = i === restartLevels.length;
    const stopLevel = restartLevels[i];
    const c = career({
      ...NEW_CAREER,
      legacyPoints: points,
      maxMonths: 6000,
      stop: last ? (x) => x.level >= 100 && x.cash >= 1e9 : (x) => x.level >= stopLevel,
    });
    totalMonths += c.months;
    lifetimeCents += Math.max(0, c.baseProfit) * 100;
    const before = points;
    if (!last) points = Math.max(points, L.legacyPointsTotal(lifetimeCents));
    rows.push(
      `| ${i + 1} | ${before} | ${last ? `до ур. 100 и $1 млрд` : `ур. ${stopLevel}`} | ${hours(c.months)} | ${usd(c.baseProfit)} | ${
        last ? '—' : `+${points - before} → ${points}`
      } | ×${L.legacyProfitMultiplier(before).toFixed(2)} / ×${L.legacyXpMultiplier(before).toFixed(2)} | ${((totalMonths * 5) / 60).toFixed(1)} ч |` +
        (last ? ` ур. 100: ${hours(c.at['ур. 100'])}, $1 млрд: ${hours(c.at['$1 млрд'])}` : ''),
    );
  }
  return { rows, totalHours: (totalMonths * 5) / 60, points, restarts: restartLevels.length };
};

log('');
log('## 7. Наследие: серия карьер (активный игрок, новый конфиг)');
log('');
log(`Очки = floor(10 × √(прибыль закрытых карьер / $1M)), прибыль × min(${B.LEGACY_PROFIT_MAX}; 1 + 0,04P + 0,0015P²) к положительной марже, опыт × min(${B.LEGACY_XP_MAX}; 1 + ${B.LEGACY_XP_PER_POINT}P), стартовый капитал + min($${B.LEGACY_START_CASH_MAX.toLocaleString("en-US")}; $${B.LEGACY_START_CASH_PER_POINT.toLocaleString("en-US")} × P).`);
for (const plan of [[], [20], [20, 35], [20, 35, 50], [20, 35, 50, 75]]) {
  log('');
  log(`**Перезапуски на уровнях: ${plan.length ? plan.join(', ') : 'без перезапусков'}**`);
  log('');
  log('| Карьера | Очки в карьере | Перезапуск | Длительность | Прибыль (база) | Очки после | Бонусы прибыль / опыт | Всего времени | Итог последней |');
  log('|---:|---:|---|---:|---:|---:|---|---:|---|');
  const r = legacyRun(plan);
  for (const row of r.rows) log(row);
  const ok = r.restarts >= B.CONCERN_MIN_RESTARTS && r.points >= B.CONCERN_MIN_LEGACY_POINTS;
  log('');
  log(
    `Цель «Концерн» (${B.CONCERN_MIN_RESTARTS}+ перезапусков, ${B.CONCERN_MIN_LEGACY_POINTS}+ очков, 100 уровень, $1 млрд): ${
      ok ? `выполнима за ≈${r.totalHours.toFixed(0)} ч` : `не выполнена — перезапусков ${r.restarts}, очков ${r.points}`
    }.`,
  );
}

// ─── Филиал с управляющим ──────────────────────────────────────────────────

interface BranchRun {
  rep: number;
  level: number;
  managerLevel: number;
  strategy: B.ManagerStrategy;
  clearance: number;
  slots?: number;
  months?: number;
}

/**
 * Филиал в Гараже 1 на реальном модуле branches.ts: игровые тики каждые 0,25 дня, зарплатный день
 * через closeMonth. Репутация держится на заданном уровне (её рост от филиала не учитывается).
 */
const simulateBranch = (r: BranchRun) => {
  const months = r.months ?? 12;
  const garage = r.slots && r.slots > 1 ? { id: 'garage_3', name: 'Гараж 3', slots: 4, rank: 2 } : { id: 'garage_1', name: 'Гараж 1', slots: 1, rank: 0 };
  let s = E.createEconomy(E.toCents(10_000_000), true, true, 1000 + r.rep + r.managerLevel * 7 + r.clearance);
  s = { ...s, player: { ...s.player, xp: { level: Math.max(r.level, r.slots && r.slots > 1 ? 25 : 12), xp: 0, totalXp: 0 } } };
  s = Br.openBranch(s, garage, 3, 0).state;
  s = Br.hireBranchStaff(s, garage.id, 'manager', 0).state;
  const b0 = s.branches[garage.id];
  const managerId = b0.managerId!;
  s = { ...s, contracts: { ...s.contracts, [managerId]: { ...s.contracts[managerId], skill: { ...s.contracts[managerId].skill, level: r.managerLevel } } } };
  s = E.changeSalary(s, managerId, E.salaryForLevel(r.managerLevel, 'manager', 1), 0);
  for (let slot = 0; slot < (r.slots ?? 1); slot++) {
    if (slot > 0) s = { ...s, branches: { ...s.branches, [garage.id]: { ...s.branches[garage.id], slots: [...s.branches[garage.id].slots, { mechanicId: null }] } } };
    s = Br.hireBranchStaff(s, garage.id, 'mechanic', 0, slot).state;
    const mid = s.branches[garage.id].slots[slot].mechanicId!;
    s = { ...s, contracts: { ...s.contracts, [mid]: { ...s.contracts[mid], clearance: r.clearance } } };
    s = E.changeSalary(s, mid, E.salaryForLevel(1, 'mechanic', r.clearance), 0);
  }
  s = Br.setBranchStrategy(Br.setBranchReserve(s, garage.id, 0), garage.id, r.strategy);
  s = Br.setBranchAutomation(s, garage.id, true, 0);
  const tiers = [1, 2, 3, 4, 5, 6].filter((t) => r.level >= TIER_UNLOCK_LEVELS[t]);
  const bctx: Br.BranchContext = { unlockedTiers: tiers, playerLevel: r.level, sampleCar };
  const start = s.balanceCents;
  for (let m = 0; m < months; m++) {
    s = { ...s, orders: { ...s.orders, reputation: r.rep } };
    for (let t = m * MONTH_MS; t < (m + 1) * MONTH_MS; t += DAY_MS / 4) s = Br.advanceBranches(s, t, bctx, { [garage.id]: garage.name });
    s = E.closeMonth(s, (m + 1) * MONTH_MS, 0).state;
  }
  const hist = s.branches[garage.id].history.map(Br.reportOf);
  const sum = (f: (x: Br.BranchReport) => number) => hist.reduce((a, x) => a + f(x), 0);
  return {
    netPerMonth: (s.balanceCents - start) / 100 / months,
    load: sum((x) => x.busyMs) / Math.max(1, sum((x) => x.slotMs)),
    ordersPerMonth: sum((x) => x.completed) / months,
    failed: sum((x) => x.failed + x.late) / months,
    errors: sum((x) => x.managerErrors) / months,
    expected: sum((x) => x.expectedProfitCents) / 100 / months,
    actual: sum((x) => x.actualProfitCents) / 100 / months,
    managerLevelEnd: s.contracts[managerId].skill.level,
  };
};

log('');
log('## 8. Автоматизированный филиал (реальный модуль branches.ts)');
log('');
log(`Открытие Гаража 1 как филиала: ${usd(B.BRANCH_OPEN_COST.garage_1)}. Оклады: управляющий ${usd(B.MANAGER_BASE_SALARY_CENTS / 100)} × (1 + 3% за уровень), механик по допуску. Классы открыты по лестнице ТЗ. Резерв 0.`);
log('Чистыми — изменение баланса за месяц после окладов. «Ожидание / факт» — оценка управляющего при принятии и фактическая прибыль по заказам (до оклада управляющего).');
log('');
log('| Репутация | Ур. игрока | Управляющий (ур.) | Стратегия | Допуск механика | Загрузка | Заказов/мес | Поздно или провал/мес | Ошибок/мес | Ожидание / факт, $/мес | Чистыми/мес | Окупаемость открытия |');
log('|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|');
const STRAT_NAMES: Record<string, string> = { careful: 'Осторожный', balanced: 'Сбалансированный', aggressive: 'Агрессивный' };
for (const r of [
  { rep: 150, level: 12, managerLevel: 1, strategy: 'careful', clearance: 1 },
  { rep: 150, level: 12, managerLevel: 1, strategy: 'balanced', clearance: 1 },
  { rep: 150, level: 12, managerLevel: 1, strategy: 'aggressive', clearance: 1 },
  { rep: 150, level: 12, managerLevel: 1, strategy: 'balanced', clearance: 2 },
  { rep: 300, level: 15, managerLevel: 5, strategy: 'balanced', clearance: 2 },
  { rep: 500, level: 20, managerLevel: 10, strategy: 'balanced', clearance: 2 },
  { rep: 800, level: 35, managerLevel: 15, strategy: 'balanced', clearance: 3 },
  { rep: 1000, level: 50, managerLevel: 20, strategy: 'aggressive', clearance: 4 },
] as BranchRun[]) {
  const x = simulateBranch(r);
  const cost = B.BRANCH_OPEN_COST.garage_1;
  log(
    `| ${r.rep} | ${r.level} | ${r.managerLevel} → ${x.managerLevelEnd} | ${STRAT_NAMES[r.strategy]} | ${TIER_NAMES[r.clearance]} | ${pct(x.load)} | ${x.ordersPerMonth.toFixed(1)} | ${x.failed.toFixed(2)} | ${x.errors.toFixed(1)} | ${usd(x.expected)} / ${usd(x.actual)} | ${usd(x.netPerMonth)} | ${x.netPerMonth > 0 ? `${Math.ceil(cost / x.netPerMonth)} мес.` : 'не окупается'} |`,
  );
}
log('');
log('Филиал на 4 слота (Гараж 3, уровень 25+, один управляющий на все слоты):');
log('');
log('| Репутация | Ур. игрока | Управляющий (ур.) | Допуск механиков | Загрузка | Заказов/мес | Чистыми/мес | Чистыми на слот |');
log('|---:|---:|---:|---|---:|---:|---:|---:|');
for (const r of [
  { rep: 500, level: 30, managerLevel: 10, strategy: 'balanced', clearance: 3, slots: 4 },
  { rep: 1000, level: 60, managerLevel: 20, strategy: 'balanced', clearance: 4, slots: 4 },
] as BranchRun[]) {
  const x = simulateBranch(r);
  log(`| ${r.rep} | ${r.level} | ${r.managerLevel} → ${x.managerLevelEnd} | ${TIER_NAMES[r.clearance]} | ${pct(x.load)} | ${x.ordersPerMonth.toFixed(1)} | ${usd(x.netPerMonth)} | ${usd(x.netPerMonth / 4)} |`);
}

// ─── Продвинутое оборудование ──────────────────────────────────────────────

const eqPrice = (id: B.EquipmentId) => B.EQUIPMENT.find((e) => e.id === id)!.price;
/** Ремонтные заказы данного типа на доске (репутация 800, уровень 45, классы до Люкса) */
const ordersOfType = (type: B.ServiceOrderType, owned: B.EquipmentId[]) => {
  const tiers = [1, 2, 3, 4];
  let count = 0;
  const net: number[] = [];
  const days: number[] = [];
  const runs = 40;
  for (let seed = 1; seed <= runs; seed++) {
    let s = { ...O.createOrdersState(seed * 31, 0), reputation: 800 };
    for (let day = 1; day <= 30; day++) {
      s = O.advanceOrders(s, day * DAY_MS, { unlockedTiers: tiers, owned, playerLevel: 45, sampleCar });
      for (const o of s.board) {
        if (o.kind !== 'service' || o.type !== type) continue;
        count++;
        net.push((o.rewardCents - o.partsCents) / 100);
        days.push(o.workPoints / MECHANIC_PTS_PER_DAY);
      }
      s = { ...s, board: [] };
    }
  }
  return { perMonth: count / runs, net: mean(net), days: mean(days) };
};

log('');
log('## 10. Продвинутое оборудование (уровень 40+), окупаемость');
log('');
log('| Оборудование | Цена | Что даёт (расчёт) | Окупаемость |');
log('|---|---:|---|---:|');
{
  const al = ordersOfType('alignment', ['basic_tools', 'alignment']);
  const perMonth = al.perMonth * (al.net - (B.mechanicBaseSalaryCents(3) / 100 / 30) * al.days);
  log(
    `| Стенд развал-схождения | ${usd(eqPrice('alignment'))} | ≈${al.perMonth.toFixed(1)} заказа/мес (реп. 800), ≈${usd(al.net)} за заказ за ${al.days.toFixed(1)} дн. работы | ${
      perMonth > 0 ? `${Math.ceil(eqPrice('alignment') / perMonth)} мес.` : '—'
    } |`,
  );
  const body = ordersOfType('body', ['basic_tools']);
  const saved = body.perMonth * body.days * (1 - 1 / B.BODY_FRAME_SPEED);
  const freedValue = saved * ((B.mechanicBaseSalaryCents(3) / 100 / 30) + body.net / body.days);
  log(
    `| Стапель | ${usd(eqPrice('body_frame'))} | кузовной ремонт ×${B.BODY_FRAME_SPEED}: при ${body.perMonth.toFixed(1)} заказах/мес освобождается ≈${saved.toFixed(
      1,
    )} дня слота под новые заказы | ≈${Math.ceil(eqPrice('body_frame') / Math.max(1, freedValue))} мес. |`,
  );
  for (const tier of [4, 5]) {
    const rng = mulberry32(400 + tier);
    const gains = Array.from({ length: SAMPLES }, () => {
      const { car } = generateRandomListing(tier, 0, [], rng);
      return paintValueGain(car.basePrice!, car.year, car.mileage, car.paintCondition!, 100);
    });
    const save = mean(gains) * B.OWN_PAINT_MATERIALS_SHARE * (1 - B.PAINT_MATCHING_FACTOR);
    log(`| Подбор краски (${TIER_NAMES[tier]}) | ${usd(eqPrice('paint_matching'))} | экономия ≈${usd(save)} на покраске | ${Math.ceil(eqPrice('paint_matching') / save)} покрасок |`);
  }
  for (const tier of [4, 5]) {
    const rng = mulberry32(500 + tier);
    const nets = Array.from({ length: SAMPLES }, () => {
      const { car } = generateRandomListing(tier, 0, [], rng);
      const max = car.maxCondition!;
      const to = Math.min(100, max + B.TUNING_MAX_BONUS);
      const gain = carValue(car.basePrice!, { ...car, condition: to }) - carValue(car.basePrice!, { ...car, condition: max });
      return gain * (1 - B.TUNING_COST_SHARE - B.OWN_REPAIR_PARTS_SHARE);
    });
    const net = mean(nets);
    log(`| Диностенд (${TIER_NAMES[tier]}) | ${usd(eqPrice('dyno'))} | тюнинг +${B.TUNING_MAX_BONUS} к максимуму: чистыми ≈${usd(net)} с машины после цены тюнинга и деталей | ${Math.ceil(eqPrice('dyno') / net)} машин |`);
  }
  // Стоянка: машины ждут продажи по +10% (30 дней), не занимая рабочие слоты
  const sport = resaleGood[5];
  const parkingMonth = B.PARKING_SPOTS * (sport.buy * 1.6 * 0.1) * (30 / 30);
  log(
    `| Коммерческая стоянка | ${usd(eqPrice('parking'))} | ${B.PARKING_SPOTS} мест: машины Спорта ждут продажи по +10% (30 дней), не занимая рабочие слоты — ≈${usd(parkingMonth)}/мес | ${Math.ceil(
      eqPrice('parking') / parkingMonth,
    )} мес. |`,
  );
}

// ─── 5. Риск ───────────────────────────────────────────────────────────────

log('');
log('## 11. Риск случайной покупки (без выбора)');
log('');
log('| Класс | Убыточных | Худший случай | Средняя прибыль сделки |');
log('|---|---:|---:|---:|');
for (const tier of [1, 3, 6]) {
  const ds = deals(tier, { repair: 'mechanic', paint: 'none' }, 11);
  log(
    `| ${TIER_NAMES[tier]} | ${pct(ds.filter((d) => d.profit < 0).length / ds.length)} | ${usd(Math.min(...ds.map((d) => d.profit)))} | ${usd(
      mean(ds.map((d) => d.profit)),
    )} |`,
  );
}

// ─── Итог ──────────────────────────────────────────────────────────────────

log('');
log('## 12. Итоговые параметры (из balance.ts на момент запуска)');
log('');
log('| Параметр | Значение |');
log('|---|---|');
for (const [k, v] of [
  ['Слоты гаражей', GARAGES.map((g) => g.slots).join(' / ')],
  ['Цены гаражей', GARAGES.map((g) => usd(g.price)).join(' / ')],
  ['Уровни гаражей', GARAGES.map((g) => g.requiredLevel).join(' / ')],
  ['Уровни классов', [1, 2, 3, 4, 5, 6].map((t) => TIER_UNLOCK_LEVELS[t]).join(' / ')],
  ['Кривая XP', `${P.XP_CURVE_BASE} + ${P.XP_CURVE_LINEAR}n + ${P.XP_CURVE_QUADRATIC}n²`],
  ['Детали своего ремонта', pct(B.OWN_REPAIR_PARTS_SHARE)],
  ['Материалы своей покраски', `${pct(B.OWN_PAINT_MATERIALS_SHARE)} (с подбором краски ×${B.PAINT_MATCHING_FACTOR})`],
  ['Оклад сотрудника', `${pct(B.STAFF_SALARY_SHARE)} потенциального прироста; механик Эконом ${usd(B.mechanicBaseSalaryCents(1) / 100)}`],
  ['Оплата заказов', `репутация до ×${B.REPUTATION_PAY_STEPS[B.REPUTATION_PAY_STEPS.length - 1].mult}, уровень до +${pct(B.ORDER_LEVEL_BONUS_PER_LEVEL * B.ORDER_LEVEL_BONUS_MAX_LEVELS)}`],
  ['Управляющий', `${usd(B.MANAGER_BASE_SALARY_CENTS / 100)} × (1 + ${pct(B.MANAGER_SALARY_STEP)} за уровень)`],
  ['Открытие филиалов', Object.values(B.BRANCH_OPEN_COST).map(usd).join(' / ')],
  ['Наследие', `с ур. ${B.LEGACY_MIN_LEVEL}, бизнес от ${usd(B.LEGACY_MIN_NET_WORTH)}, прибыль ≤ ×${B.LEGACY_PROFIT_MAX}, опыт ≤ ×${B.LEGACY_XP_MAX}`],
  ['Концерн', `${usd(B.CONCERN_PRICE)}, ${B.CONCERN_MIN_RESTARTS} перезапуска, ${B.CONCERN_MIN_LEGACY_POINTS} очков, ${B.CONCERN_MIN_BRANCHES} филиала / ${B.CONCERN_MIN_AUTO_SLOTS} слотов`],
] as [string, string][])
  log(`| ${k} | ${v} |`);

writeFileSync(new URL('../docs/BALANCE_REPORT.md', import.meta.url), out.join('\n') + '\n', 'utf8');
