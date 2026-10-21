/// <reference types="node" />
/**
 * Тесты лестницы уровней и контента: открытие классов (и старые сохранения), уровни оборудования,
 * новые типы заказов, особые контракты, аукцион, эффекты продвинутого оборудования.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as B from './balance.ts';
import * as O from './orders.ts';
import * as E from './economy.ts';
import * as A from './auctions.ts';
import { DAY_MS } from './time.ts';
import { generateRandomListing } from '../utils/marketGenerator.ts';

const $ = (d: number) => d * 100;
const atLevel = (level: number, balance = $(10_000_000)): E.EconomyState => {
  const s = E.createEconomy(balance, true, true, 11);
  return { ...s, player: { ...s.player, xp: { level, xp: 0, totalXp: 0 } } };
};
const sampleCar = (tier: number, rng: () => number): O.SampleCar => {
  const { car } = generateRandomListing(tier, 0, [], rng);
  return { ...car, tier, modelId: car.name, basePrice: car.basePrice!, maxCondition: car.maxCondition!, paintCondition: car.paintCondition! };
};
const boardAt = (level: number, owned: B.EquipmentId[], tiers: number[], seeds = 300) => {
  const orders: O.Order[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const st = O.advanceOrders(
      { ...O.createOrdersState(seed, 0), reputation: 800, lastOrderAtMs: -10 * DAY_MS },
      0,
      { unlockedTiers: tiers, owned, playerLevel: level, sampleCar },
    );
    orders.push(...st.board);
  }
  return orders;
};

describe('лестница уровней', () => {
  it('классы: Средний 8, Премиум 20, Люкс 35, Спорт 55, Гипер 75', () => {
    assert.deepEqual(E.unlockedTiers(atLevel(7)), [1]);
    assert.deepEqual(E.unlockedTiers(atLevel(8)), [1, 2]);
    assert.deepEqual(E.unlockedTiers(atLevel(20)), [1, 2, 3]);
    assert.deepEqual(E.unlockedTiers(atLevel(75)), [1, 2, 3, 4, 5, 6]);
  });

  it('старое сохранение: открытые раньше классы остаются открытыми', () => {
    const old = atLevel(12) as Partial<E.EconomyState>;
    delete old.ladderVersion;
    delete old.grandfatheredTiers;
    const loaded = E.deserializeEconomy(JSON.stringify({ version: 1, gameTimeMs: 0, state: old }))!.state;
    // До лестницы на 12 уровне были открыты Средний (5) и Премиум (10)
    assert.deepEqual(loaded.grandfatheredTiers, [3]);
    assert.deepEqual(E.unlockedTiers(loaded), [1, 2, 3]);
    // Новое сохранение повторно не пересчитывается
    const again = E.deserializeEconomy(E.serializeEconomy(loaded, 0))!.state;
    assert.deepEqual(again.grandfatheredTiers, [3]);
  });

  it('оборудование по лестнице: камера 18, продвинутое 40, стоянка 60', () => {
    assert.equal(E.equipmentBlock(atLevel(17), 'paint_booth'), 'level');
    assert.equal(E.equipmentBlock(atLevel(18), 'paint_booth'), null);
    for (const id of ['alignment', 'body_frame', 'paint_matching', 'dyno'] as B.EquipmentId[]) {
      assert.equal(E.equipmentBlock(atLevel(39), id), 'level');
      assert.equal(E.equipmentBlock(atLevel(40), id), null);
    }
    assert.equal(E.equipmentBlock(atLevel(59), 'parking'), 'level');
    assert.equal(E.equipmentBlock(atLevel(60), 'parking'), null);
  });
});

describe('новые заказы', () => {
  it('развал-схождение — только со стендом; корпоративные — с 70 уровня', () => {
    const without = boardAt(70, ['basic_tools'], [1, 2]).filter((o) => o.kind === 'service');
    const withStand = boardAt(70, ['basic_tools', 'alignment'], [1, 2]).filter((o) => o.kind === 'service');
    const doable = (os: O.Order[], t: B.ServiceOrderType) => os.filter((o) => o.kind === 'service' && o.type === t);
    assert.ok(doable(withStand, 'alignment').length > 0);
    assert.ok(doable(without, 'alignment').length < doable(withStand, 'alignment').length);
    assert.ok(doable(withStand, 'corporate').length > 0, 'на 70 уровне есть корпоративные');
    assert.equal(doable(boardAt(69, ['basic_tools'], [1]), 'corporate').length, 0, 'до 70 — нет');
  });

  it('особые контракты: с 85 уровня, старший класс, дороже и дольше', () => {
    assert.equal(boardAt(84, ['basic_tools'], [1, 2, 3, 4, 5, 6]).filter((o) => o.kind === 'picking' && o.special).length, 0);
    const special = boardAt(85, ['basic_tools'], [1, 2, 3, 4, 5, 6]).filter((o): o is O.PickingOrder => o.kind === 'picking' && !!o.special);
    assert.ok(special.length > 0);
    for (const o of special) {
      assert.equal(o.tier, 6);
      assert.ok(o.deadlineDays >= B.SPECIAL_CONTRACT_MIN_DAYS);
      assert.equal(o.minPaint, B.SPECIAL_CONTRACT_MIN_PAINT);
    }
  });
});

describe('продвинутое оборудование', () => {
  it('подбор краски — материалы на треть дешевле; стапель ускоряет кузовной ремонт клиента', () => {
    let s = atLevel(40);
    assert.equal(E.ownPaintMaterialsShare(s), B.OWN_PAINT_MATERIALS_SHARE);
    s = E.buyEquipment(s, 'paint_matching').state;
    assert.ok(Math.abs(E.ownPaintMaterialsShare(s) - B.OWN_PAINT_MATERIALS_SHARE * B.PAINT_MATCHING_FACTOR) < 1e-12);
    const body = { id: 'b1', kind: 'service', type: 'body', status: 'active' } as unknown as O.Order;
    s = { ...s, orders: { ...s.orders, active: [body] } };
    assert.equal(E.clientWorkMultiplier(s, 'b1'), 1);
    s = E.buyEquipment(s, 'body_frame').state;
    assert.equal(E.clientWorkMultiplier(s, 'b1'), B.BODY_FRAME_SPEED);
    assert.equal(E.clientWorkMultiplier(s, undefined), 1);
  });

  it('стоянка: 6 мест только после покупки', () => {
    let s = atLevel(60);
    assert.equal(E.parkingSpots(s), 0);
    s = E.buyEquipment(s, 'parking').state;
    assert.equal(E.parkingSpots(s), B.PARKING_SPOTS);
  });
});

describe('аукцион', () => {
  const ctx = (enabled = true): A.AuctionContext => ({ enabled, unlockedTiers: [1, 2, 3], sample: (t, rng) => generateRandomListing(t, 0, [], rng).car });

  it('лот появляется только с 30 уровня', () => {
    assert.equal(E.advanceAuction(atLevel(29), 0, ctx().sample).auction.current, null);
    const s = E.advanceAuction(atLevel(30), 0, ctx().sample);
    assert.ok(s.auction.current);
    assert.equal(s.auction.current!.status, 'open');
  });

  it('бот перебивает до своего предела, потом лидирует игрок; выкуп — обычная покупка', () => {
    let s = E.advanceAuction(atLevel(30), 0, ctx().sample);
    const lot0 = s.auction.current!;
    for (let i = 0; i < 200 && s.auction.current!.leader !== 'player'; i++) s = E.auctionBid(s, DAY_MS).state;
    const lot = s.auction.current!;
    assert.equal(lot.leader, 'player');
    assert.ok(lot.currentCents > lot.botMaxCents - A.bidStepCents(lot) * 2, 'цена дошла до предела бота');
    assert.equal(E.auctionBid(s, DAY_MS).ok, false, 'лидеру ставить не нужно');
    assert.equal(s.balanceCents, atLevel(30).balanceCents, 'деньги до выкупа не списываются');
    // Конец лота
    s = E.advanceAuction(s, lot0.endsAtMs, ctx().sample);
    assert.equal(s.auction.current!.status, 'won');
    const claimed = E.claimAuctionLot(s, lot0.endsAtMs + DAY_MS);
    assert.ok(claimed.ok);
    assert.equal(claimed.state.balanceCents, s.balanceCents - lot.currentCents);
    assert.equal(claimed.state.assets[lot.car.id].purchaseCents, lot.currentCents);
    assert.equal(claimed.state.auction.current, null);
    assert.equal(E.claimAuctionLot(claimed.state, lot0.endsAtMs + DAY_MS).ok, false, 'второй раз не выкупить');
  });

  it('невыкупленный лот уходит без штрафа; проигранный — в историю', () => {
    let s = E.advanceAuction(atLevel(30), 0, ctx().sample);
    const lot = s.auction.current!;
    s = E.auctionBid(s, 1).state;
    const lost = E.advanceAuction(s, lot.endsAtMs, ctx().sample);
    if (lost.auction.current?.status === 'won') {
      const expired = E.advanceAuction(lost, lot.endsAtMs + (B.AUCTION_CLAIM_DAYS + 1) * DAY_MS, ctx().sample);
      assert.equal(expired.auction.history[0].status, 'expired');
      assert.equal(expired.balanceCents, s.balanceCents);
    } else {
      assert.equal(lost.auction.history[0].status, 'lost');
    }
  });
});
