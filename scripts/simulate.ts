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
import { DAY_MS } from '../src/economy/time.ts';
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

const MECHANIC_PTS_PER_DAY = 0.5; // 0,05 п./сек × 10 сек
const TAP_REPAIR = 0.1;
const PAINTER_PTS_PER_DAY = B.PAINTER_SPEED_PER_SEC * 10;
const BUY_DAYS = 1;
const SAMPLES = 3000;
/** Варианты продажи: ползунок −10% (сразу), 0% (15 дней), +10% (30 дней) */
const SALE_OPTIONS = [
  { mult: 0.9, days: 0 },
  { mult: 1, days: 15 },
  { mult: 1.1, days: 30 },
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
  for (const sale of SALE_OPTIONS) {
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
log('Продажа — лучший для прибыли/день вариант ползунка (−10% сразу, 0% за 15 дней, +10% за 30 дней). 1 игровой месяц = 5 минут игры.');

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
  let cash = 25_000;
  let garage = 0;
  let player = P.createPlayerXp();
  const at: Record<string, number> = {};
  const cashAt: Record<string, number> = {};
  for (let month = 1; month <= (o.maxMonths ?? 3000); month++) {
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
    player = addXpWith(player, xp * 1.1, o.xpCurve ?? P.requiredXp); // +10% — бонус прибыльного месяца
    const next = garage + 1;
    if (next < GARAGES.length && player.level >= o.garageLevels[next] && cashAt[GARAGES[next].name] === undefined) cashAt[GARAGES[next].name] = cash;
    if (next < GARAGES.length && cash >= o.garagePrices[next] * 1.3 && player.level >= o.garageLevels[next]) {
      cash -= o.garagePrices[next];
      garage = next;
      at[GARAGES[next].name] = month;
    }
    for (const lv of [5, 8, 12, 20, 35, 50, 75, 100]) if (player.level >= lv && at[`ур. ${lv}`] === undefined) at[`ур. ${lv}`] = month;
    if (player.level >= 100) break;
  }
  return { at, cashAt };
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
const LADDER_TIERS = { 1: 0, 2: 8, 3: 20, 4: 35, 5: 55, 6: 75 };
const LADDER_GARAGES = [0, 5, 20, 50];
const NEW = { garagePrices: GARAGES.map((g) => g.price), garageLevels: LADDER_GARAGES, tierLevels: LADDER_TIERS };
careerRow('До обновления, активный игрок', { ...OLD, active: true });
careerRow('Лестница ТЗ + старая кривая XP, активный', { ...NEW, xpCurve: OLD_CURVE, active: true });
careerRow('Новый конфиг, активный игрок', { ...NEW, active: true });
careerRow('Новый конфиг, только механики', { ...NEW, active: false });
log('');
log(`Новый конфиг: кривая XP ${P.XP_CURVE_BASE} + ${P.XP_CURVE_LINEAR}n + ${P.XP_CURVE_QUADRATIC}n², классы открываются на ур. 8/20/35/55/75, гаражи — на ур. 5/20/50 за ${GARAGES.slice(1).map((g) => usd(g.price)).join(' / ')}.`);

// ─── 5. Риск ───────────────────────────────────────────────────────────────

log('');
log('## 7. Риск случайной покупки (без выбора)');
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

writeFileSync(new URL('../docs/BALANCE_REPORT.md', import.meta.url), out.join('\n') + '\n', 'utf8');
