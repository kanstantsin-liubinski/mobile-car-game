/**
 * Аукцион на авторынке (с 30 уровня). Один лот за раз: машина старшего открытого класса,
 * полностью проверенная аукционным домом (точные состояние, максимум и ЛКП). Торги — против
 * одного бота со скрытым пределом ставок (85–108% рыночной стоимости): на каждую ставку игрока
 * бот сразу отвечает, пока не упрётся в свой предел. Кто ведёт к концу лота — выиграл.
 *
 * Деньги не замораживаются: выигранный лот нужно выкупить (свободные деньги и свободное место)
 * за 3 дня, иначе он уходит без штрафа. Время — игровое, RNG детерминированный.
 */
import * as B from './balance.ts';
import { DAY_MS } from './time.ts';
import { mulberry32, rngForCheck } from './hotOffers.ts';
import type { Car } from '@/types';

export type AuctionLeader = 'none' | 'player' | 'bot';
export type LotStatus = 'open' | 'won' | 'lost' | 'claimed' | 'expired';

export interface AuctionBid {
  who: 'player' | 'bot';
  cents: number;
  atMs: number;
}

export interface AuctionLot {
  id: string;
  tier: number;
  car: Car;
  /** Рыночная стоимость машины в текущем состоянии */
  marketCents: number;
  startCents: number;
  currentCents: number;
  leader: AuctionLeader;
  /** Скрытый предел бота */
  botMaxCents: number;
  startsAtMs: number;
  endsAtMs: number;
  status: LotStatus;
  claimUntilMs?: number;
  bids: AuctionBid[];
}

export interface AuctionState {
  seed: number;
  lotsHeld: number;
  current: AuctionLot | null;
  nextLotAtMs: number;
  history: AuctionLot[];
}

export interface AuctionContext {
  /** Аукцион открыт уровнем */
  enabled: boolean;
  unlockedTiers: number[];
  /** Машина для лота из генератора авторынка */
  sample: (tier: number, rng: () => number) => Car;
}

export const AUCTION_HISTORY = 5;

export const createAuctionState = (seed: number, now: number): AuctionState => ({
  seed: seed >>> 0,
  lotsHeld: 0,
  current: null,
  nextLotAtMs: now,
  history: [],
});

export const restoreAuctionState = (raw: unknown, seed: number, now: number): AuctionState => {
  const r = raw as Partial<AuctionState> | null | undefined;
  if (!r || typeof r.seed !== 'number') return createAuctionState(seed, now);
  return { ...createAuctionState(r.seed, now), ...r, history: (r.history ?? []).slice(0, AUCTION_HISTORY) };
};

const round100 = (cents: number) => Math.max(10_000, Math.round(cents / 10_000) * 10_000);

/** Шаг ставки: 5% стартовой цены, кратно $100 */
export const bidStepCents = (lot: Pick<AuctionLot, 'startCents'>): number => round100(lot.startCents * B.AUCTION_STEP_SHARE);

/** Сколько игрок должен поставить сейчас */
export const nextPlayerBidCents = (lot: AuctionLot): number =>
  lot.leader === 'none' ? lot.startCents : lot.currentCents + bidStepCents(lot);

const archive = (s: AuctionState, lot: AuctionLot): AuctionState => ({
  ...s,
  current: null,
  history: [lot, ...s.history].slice(0, AUCTION_HISTORY),
});

const makeLot = (s: AuctionState, at: number, ctx: AuctionContext): AuctionLot | null => {
  if (ctx.unlockedTiers.length === 0) return null;
  const rng = rngForCheck(s.seed ^ 0x2545f491, s.lotsHeld);
  // Чаще — старшие открытые классы: аукцион про редкие дорогие машины
  const tiers = [...ctx.unlockedTiers].sort((a, b) => a - b);
  const top = tiers.slice(-2);
  const tier = top[Math.floor(rng() * top.length)];
  const car = ctx.sample(tier, mulberry32(Math.floor(rng() * 0xffffffff)));
  const marketCents = Math.round((car.marketPrice ?? car.price) * 100);
  const startCents = round100(marketCents * B.AUCTION_START_SHARE);
  const botMaxCents = Math.round(marketCents * (B.AUCTION_BOT_MIN + rng() * (B.AUCTION_BOT_MAX - B.AUCTION_BOT_MIN)));
  return {
    id: `lot-${s.seed.toString(36)}-${s.lotsHeld}`,
    tier,
    car: { ...car, id: `auction-${s.seed.toString(36)}-${s.lotsHeld}` },
    marketCents,
    startCents,
    currentCents: startCents,
    leader: 'none',
    botMaxCents,
    startsAtMs: at,
    endsAtMs: at + B.AUCTION_LOT_DAYS * DAY_MS,
    status: 'open',
    bids: [],
  };
};

/** Окончания лотов, сроки выкупа и новые лоты к моменту now */
export const advanceAuction = (s0: AuctionState, now: number, ctx: AuctionContext): AuctionState => {
  let s = s0;
  const lot = s.current;
  if (lot?.status === 'open' && now >= lot.endsAtMs) {
    const won = lot.leader === 'player';
    s = {
      ...s,
      current: won ? { ...lot, status: 'won', claimUntilMs: lot.endsAtMs + B.AUCTION_CLAIM_DAYS * DAY_MS } : null,
      nextLotAtMs: lot.endsAtMs + B.AUCTION_PAUSE_DAYS * DAY_MS,
      history: won ? s.history : [{ ...lot, status: 'lost' as const }, ...s.history].slice(0, AUCTION_HISTORY),
    };
  }
  const cur = s.current;
  if (cur?.status === 'won' && cur.claimUntilMs !== undefined && now > cur.claimUntilMs) {
    s = archive(s, { ...cur, status: 'expired' });
  }
  if (!s.current && ctx.enabled && now >= s.nextLotAtMs) {
    const next = makeLot(s, Math.max(s.nextLotAtMs, now - B.AUCTION_LOT_DAYS * DAY_MS + 1), ctx);
    if (next) s = { ...s, current: next, lotsHeld: s.lotsHeld + 1 };
  }
  return s;
};

export const auctionDue = (s: AuctionState, now: number, enabled: boolean): boolean =>
  (s.current?.status === 'open' && now >= s.current.endsAtMs) ||
  (s.current?.status === 'won' && s.current.claimUntilMs !== undefined && now > s.current.claimUntilMs) ||
  (!s.current && enabled && now >= s.nextLotAtMs);

export type BidBlock = 'no-lot' | 'closed' | 'leading' | 'money';

export const bidBlock = (s: AuctionState, now: number, balanceCents: number): BidBlock | null => {
  const lot = s.current;
  if (!lot) return 'no-lot';
  if (lot.status !== 'open' || now >= lot.endsAtMs) return 'closed';
  if (lot.leader === 'player') return 'leading';
  if (balanceCents < nextPlayerBidCents(lot)) return 'money';
  return null;
};

/** Ставка игрока: бот сразу перебивает на шаг, если это не выше его предела */
export const placeBid = (s: AuctionState, now: number, balanceCents: number): AuctionState => {
  if (bidBlock(s, now, balanceCents)) return s;
  const lot = s.current!;
  const playerCents = nextPlayerBidCents(lot);
  const bids: AuctionBid[] = [...lot.bids, { who: 'player', cents: playerCents, atMs: now }];
  const botCents = playerCents + bidStepCents(lot);
  const updated: AuctionLot =
    botCents <= lot.botMaxCents
      ? { ...lot, currentCents: botCents, leader: 'bot', bids: [...bids, { who: 'bot', cents: botCents, atMs: now }] }
      : { ...lot, currentCents: playerCents, leader: 'player', bids };
  return { ...s, current: updated };
};

/** Лот выкуплен: в историю (деньги и машину проводят экономика и гараж) */
export const markClaimed = (s: AuctionState): AuctionState =>
  s.current?.status === 'won' ? archive(s, { ...s.current, status: 'claimed' }) : s;
