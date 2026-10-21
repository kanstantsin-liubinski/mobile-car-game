import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  generateAllInitialListings,
  generateRandomListing,
  MIN_LISTINGS_PER_TIER,
  MAX_LISTINGS_PER_TIER,
} from '../utils/marketGenerator';
import type { MarketListing, Rng } from '../utils/marketGenerator';
import { TOTAL_TIERS } from '../data/carModels';
import { unlockedTiers } from '../economy/economy';
import { MARKETS } from '../data/cityBuildings';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import * as H from '../economy/hotOffers';
import { HOT_OFFER_NOTIFY_LEVEL, hotOfferChance } from '../economy/progression';
import { readListing, type DiagnosticsLevel, type ListingReadout } from '../economy/carCondition';
import { SERVICE_DIAGNOSTICS_DAYS } from '../economy/balance';
import { DAY_MS } from '../economy/time';
import { calculateMaxCondition } from '../utils/priceCalculator';

/** Что игрок уже сделал с объявлением. Сами характеристики машины диагностика не меняет. */
export interface ListingDiag {
  inspected?: boolean;
  scanned?: boolean;
  /** Сторонняя диагностика заказана: когда будет готова (игровое время) */
  serviceReadyAtMs?: number;
}

type TierListings = Record<number, MarketListing[]>;
export type HotOffer = H.HotOffer<MarketListing>;
type HotState = H.HotOfferState<MarketListing>;

/** Сохранение авторынка: обычные объявления и горящие предложения отдельно — обновление рынка не трогает горящее */
interface MarketSave {
  version: 2;
  listings: Record<string, TierListings>;
  hot: HotState;
  diag?: Record<string, ListingDiag>;
}

interface MarketContextType {
  /** Все текущие объявления: авторынок → тир → объявления */
  listings: Record<string, TierListings>;
  /** Получить объявления конкретного авторынка для тира */
  getListingsForTier: (marketId: string, tier: number) => MarketListing[];
  /** Удалить объявление (при покупке) */
  removeListing: (listingId: string) => void;
  /** Оставшееся время до исчезновения (мс), -1 если не найдено */
  getTimeRemaining: (listingId: string) => number;
  /** Текущее игровое время — объявления живут по игровым часам и стоят на паузе вместе с игрой */
  currentTime: number;
  /** Активное горящее предложение (не больше одного) */
  hotOffer: HotOffer | null;
  /** Когда следующая проверка горящего предложения (игровое время) */
  hotNextCheckAtMs: number | null;
  /** Горящее предложение как объявление этого рынка и класса, если оно там есть */
  getHotListing: (marketId: string, tier: number) => MarketListing | null;
  /** Красная точка авторынка: менеджмент от 2 уровня и есть активное предложение */
  marketHasAlert: (marketId: string) => boolean;
  /** Уведомление по предложению показано — больше не показывать */
  markHotNotified: (offerId: string) => void;
  /** Диагностика объявления */
  getDiag: (listingId: string) => ListingDiag;
  /** Что игрок знает о машине из объявления: интервалы или точные значения */
  getReadout: (listing: MarketListing) => ListingReadout;
  inspectListing: (listing: MarketListing) => void;
  scanListing: (listing: MarketListing) => boolean;
  orderServiceDiagnostics: (listing: MarketListing) => boolean;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

const MARKET_KEY = 'game_market';
const MARKET_TICK_MS = 1000; // Проверяем объявления раз в секунду игрового времени

/** Один тик авторынка: убираем истёкшие объявления, добавляем новые, если не хватает */
const tickMarket = (prev: TierListings, now: number): { listings: TierListings; changed: boolean } => {
  let changed = false;
  const updated: TierListings = {};

  for (let tier = 1; tier <= TOTAL_TIERS; tier++) {
    const tierListings = prev[tier] || [];

    // Убираем истёкшие
    const active = tierListings.filter((l) => l.expiresAt > now);

    if (active.length !== tierListings.length) {
      changed = true;
    }

    // Если не хватает объявлений — добавляем
    if (active.length < MIN_LISTINGS_PER_TIER) {
      changed = true;
      const existingModelIds = active.map((l) => l.modelId);
      const needed = MIN_LISTINGS_PER_TIER + Math.floor(Math.random() * (MAX_LISTINGS_PER_TIER - MIN_LISTINGS_PER_TIER + 1)) - active.length;

      for (let i = 0; i < Math.max(1, needed); i++) {
        const allModels = [...existingModelIds, ...active.map((l) => l.modelId)];
        const newListing = generateRandomListing(tier, now, allModels);
        active.push(newListing);
        existingModelIds.push(newListing.modelId);
      }
    }

    updated[tier] = active;
  }

  return { listings: updated, changed };
};

/** Горящее предложение собирается обычным генератором, но только из открытых игроку классов */
const hotContext = (managementLevel: number, unlocked: number[]): H.HotOfferContext<MarketListing> => ({
  chance: hotOfferChance(managementLevel),
  generate: (rng: Rng) => {
    const tiers = unlocked;
    if (tiers.length === 0) return null;
    const market = MARKETS[Math.floor(rng() * MARKETS.length)];
    const tier = tiers[Math.floor(rng() * tiers.length)];
    const listing = generateRandomListing(tier, 0, [], rng);
    return { marketId: market.id, tier, listing, normalPrice: listing.car.price };
  },
  // Скидка только на цену покупки: рыночная стоимость машины в гараже остаётся обычной
  applyPrice: (listing, price, id) => ({
    ...listing,
    car: { ...listing.car, id, price, marketPrice: listing.car.marketPrice ?? listing.car.price },
  }),
});

const hotAsListing = (offer: HotOffer): MarketListing => ({
  ...offer.listing,
  createdAt: offer.createdAtMs,
  expiresAt: offer.expiresAtMs,
});

const tickAllMarkets = (prev: Record<string, TierListings>, now: number) => {
  let changed = false;
  const updated: Record<string, TierListings> = {};
  for (const market of MARKETS) {
    const { listings: marketListings, changed: marketChanged } = tickMarket(prev[market.id] || {}, now);
    updated[market.id] = marketListings;
    if (marketChanged) changed = true;
  }
  return changed ? updated : prev;
};

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    isLoaded: economyLoaded,
    state: economy,
    recordInspection,
    recordScan,
    payServiceDiagnostics,
  } = useEconomy();
  const { gameTimeMs } = useGameClock();
  // У каждого авторынка свой независимый набор объявлений
  const [listings, setListings] = useState<Record<string, TierListings>>({});
  const [hot, setHot] = useState<HotState | null>(null);
  const [diag, setDiag] = useState<Record<string, ListingDiag>>({});
  const [isLoaded, setIsLoaded] = useState(false);
  const currentTime = gameTimeMs;
  const marketSecond = Math.floor(gameTimeMs / MARKET_TICK_MS);
  const managementLevel = economy.player.management.level;
  const unlocked = unlockedTiers(economy);
  // Шанс и открытые классы берутся на момент проверки
  const hotCtxRef = useRef(hotContext(managementLevel, unlocked));
  hotCtxRef.current = hotContext(managementLevel, unlocked);

  // Загружаем сохранённые объявления, когда известно игровое время
  useEffect(() => {
    if (!economyLoaded || isLoaded) return;
    const load = async () => {
      let saved: Record<string, TierListings> = {};
      let savedHot: unknown = null;
      let savedDiag: Record<string, ListingDiag> = {};
      try {
        const raw = await AsyncStorage.getItem(MARKET_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Старый формат — просто объявления без горящих предложений
          if (parsed && parsed.version === 2) {
            saved = parsed.listings ?? {};
            savedHot = parsed.hot;
            savedDiag = parsed.diag ?? {};
          } else {
            saved = parsed ?? {};
          }
        }
      } catch (error) {
        console.error('Error loading market:', error);
      }
      setListings(tickAllMarkets(saved, gameTimeMs));
      setDiag(savedDiag);
      setHot(H.advanceHotOffers(H.restoreHotOfferState<MarketListing>(savedHot, gameTimeMs), gameTimeMs, hotCtxRef.current));
      setIsLoaded(true);
    };
    load();
  }, [economyLoaded, isLoaded]);

  useEffect(() => {
    if (!isLoaded || !hot) return;
    const save: MarketSave = { version: 2, listings, hot, diag };
    AsyncStorage.setItem(MARKET_KEY, JSON.stringify(save)).catch((error) =>
      console.error('Error saving market:', error),
    );
  }, [listings, hot, diag, isLoaded]);

  // Диагностика исчезнувших объявлений больше не нужна (практика за них уже учтена экономикой)
  useEffect(() => {
    if (!isLoaded) return;
    const alive = new Set<string>();
    for (const market of Object.values(listings)) {
      for (const tier of Object.values(market)) for (const l of tier) alive.add(l.car.id);
    }
    if (hot?.offer && hot.offer.status === 'active') alive.add(hot.offer.id);
    setDiag((prev) => {
      const keys = Object.keys(prev).filter((id) => alive.has(id));
      return keys.length === Object.keys(prev).length ? prev : Object.fromEntries(keys.map((id) => [id, prev[id]]));
    });
  }, [listings, hot?.offer?.id, hot?.offer?.status, isLoaded]);

  // Раз в игровую секунду убираем истёкшие объявления, добавляем новые и проводим проверки горящих предложений
  useEffect(() => {
    if (!isLoaded) return;
    setListings((prev) => tickAllMarkets(prev, gameTimeMs));
    setHot((prev) => {
      if (!prev) return prev;
      const next = H.advanceHotOffers(prev, gameTimeMs, hotCtxRef.current);
      // Пересчёт без изменений не должен вызывать сохранение
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [marketSecond, isLoaded]);

  const hotOffer = hot ? H.activeOffer(hot, gameTimeMs) : null;

  const getListingsForTier = useCallback(
    (marketId: string, tier: number): MarketListing[] => {
      return listings[marketId]?.[tier] || [];
    },
    [listings]
  );

  const removeListing = useCallback((listingId: string) => {
    // Купленное горящее предложение исчезает навсегда
    setHot((prev) => (prev ? H.markOfferBought(prev, listingId) : prev));
    setListings((prev) => {
      const updated: Record<string, TierListings> = {};
      let found = false;

      for (const [marketId, marketListings] of Object.entries(prev)) {
        const updatedMarket: TierListings = {};
        for (let tier = 1; tier <= TOTAL_TIERS; tier++) {
          const tierListings = marketListings[tier] || [];
          const filtered = tierListings.filter((l) => l.car.id !== listingId);

          if (filtered.length !== tierListings.length) {
            found = true;
          }

          updatedMarket[tier] = filtered;
        }
        updated[marketId] = updatedMarket;
      }

      return found ? updated : prev;
    });
  }, []);

  const getTimeRemaining = useCallback(
    (listingId: string): number => {
      if (hotOffer && hotOffer.id === listingId) return Math.max(0, hotOffer.expiresAtMs - currentTime);
      for (const marketListings of Object.values(listings)) {
        for (let tier = 1; tier <= TOTAL_TIERS; tier++) {
          const listing = (marketListings[tier] || []).find((l) => l.car.id === listingId);
          if (listing) {
            return Math.max(0, listing.expiresAt - currentTime);
          }
        }
      }
      return -1;
    },
    [listings, currentTime, hotOffer]
  );

  const getHotListing = useCallback(
    (marketId: string, tier: number): MarketListing | null =>
      hotOffer && hotOffer.marketId === marketId && hotOffer.tier === tier ? hotAsListing(hotOffer) : null,
    [hotOffer],
  );

  const marketHasAlert = useCallback(
    (marketId: string) => managementLevel >= HOT_OFFER_NOTIFY_LEVEL && !!hotOffer && hotOffer.marketId === marketId,
    [managementLevel, hotOffer],
  );

  const pickerLevel = economy.player.picker.level;

  const getDiag = useCallback((listingId: string): ListingDiag => diag[listingId] ?? {}, [diag]);

  const getReadout = useCallback(
    (listing: MarketListing): ListingReadout => {
      const d = diag[listing.car.id] ?? {};
      const level: DiagnosticsLevel =
        d.serviceReadyAtMs !== undefined && gameTimeMs >= d.serviceReadyAtMs
          ? 'exact'
          : d.scanned
            ? 'scanned'
            : d.inspected
              ? 'inspected'
              : 'visual';
      const { car } = listing;
      return readListing(
        car.id,
        {
          condition: car.condition,
          maxCondition: car.maxCondition ?? calculateMaxCondition(car.year, car.mileage),
          paintCondition: car.paintCondition ?? car.condition,
        },
        level,
        pickerLevel,
      );
    },
    [diag, gameTimeMs, pickerLevel],
  );

  const patchDiag = useCallback((id: string, patch: ListingDiag) => {
    setDiag((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /** «Осмотреть»: бесплатно, уточняет интервалы; практика — только за первый осмотр объявления */
  const inspectListing = useCallback(
    (listing: MarketListing) => {
      if (diag[listing.car.id]?.inspected) return;
      recordInspection(listing.car.id);
      patchDiag(listing.car.id, { inspected: true });
    },
    [diag, recordInspection, patchDiag],
  );

  /** Свой сканер: мгновенно и бесплатно */
  const scanListing = useCallback(
    (listing: MarketListing) => {
      if (diag[listing.car.id]?.scanned) return true;
      if (!recordScan(listing.car.id)) return false;
      patchDiag(listing.car.id, { scanned: true, inspected: true });
      return true;
    },
    [diag, recordScan, patchDiag],
  );

  /** Сторонний сервис: платно, 1 игровой день, затем точные значения */
  const orderServiceDiagnostics = useCallback(
    (listing: MarketListing) => {
      if (diag[listing.car.id]?.serviceReadyAtMs !== undefined) return true;
      if (!payServiceDiagnostics(listing.car.id, listing.tier)) return false;
      patchDiag(listing.car.id, { serviceReadyAtMs: gameTimeMs + SERVICE_DIAGNOSTICS_DAYS * DAY_MS });
      return true;
    },
    [diag, payServiceDiagnostics, patchDiag, gameTimeMs],
  );

  const markHotNotified = useCallback((offerId: string) => {
    setHot((prev) => (prev ? H.markOfferNotified(prev, offerId) : prev));
  }, []);

  return (
    <MarketContext.Provider
      value={{
        listings,
        getListingsForTier,
        removeListing,
        getTimeRemaining,
        currentTime,
        hotOffer,
        hotNextCheckAtMs: hot?.nextCheckAtMs ?? null,
        getHotListing,
        marketHasAlert,
        markHotNotified,
        getDiag,
        getReadout,
        inspectListing,
        scanListing,
        orderServiceDiagnostics,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
};

export const useMarketContext = () => {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error('useMarketContext must be used within MarketProvider');
  }
  return context;
};
