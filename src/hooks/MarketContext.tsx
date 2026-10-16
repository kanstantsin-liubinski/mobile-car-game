import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  generateAllInitialListings,
  generateRandomListing,
  MIN_LISTINGS_PER_TIER,
  MAX_LISTINGS_PER_TIER,
} from '../utils/marketGenerator';
import type { MarketListing } from '../utils/marketGenerator';
import { TOTAL_TIERS } from '../data/carModels';
import { MARKETS } from '../data/cityBuildings';

type TierListings = Record<number, MarketListing[]>;

interface MarketContextType {
  /** Все текущие объявления: авторынок → тир → объявления */
  listings: Record<string, TierListings>;
  /** Получить объявления конкретного авторынка для тира */
  getListingsForTier: (marketId: string, tier: number) => MarketListing[];
  /** Удалить объявление (при покупке) */
  removeListing: (listingId: string) => void;
  /** Оставшееся время до исчезновения (мс), -1 если не найдено */
  getTimeRemaining: (listingId: string) => number;
  /** Текущее время (обновляется каждую секунду для пересчёта таймеров) */
  currentTime: number;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

const MARKET_TICK_INTERVAL = 1000; // Обновляем каждую секунду

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
        const newListing = generateRandomListing(tier, allModels);
        active.push(newListing);
        existingModelIds.push(newListing.modelId);
      }
    }

    updated[tier] = active;
  }

  return { listings: updated, changed };
};

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // У каждого авторынка свой независимый набор объявлений
  const [listings, setListings] = useState<Record<string, TierListings>>(() =>
    Object.fromEntries(MARKETS.map((m) => [m.id, generateAllInitialListings()]))
  );
  const [currentTime, setCurrentTime] = useState(Date.now());
  const listingsRef = useRef(listings);
  listingsRef.current = listings;

  // Основной цикл: обновляем таймеры, убираем истёкшие, добавляем новые
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setCurrentTime(now);

      setListings((prev) => {
        let changed = false;
        const updated: Record<string, TierListings> = {};

        for (const market of MARKETS) {
          const { listings: marketListings, changed: marketChanged } = tickMarket(prev[market.id] || {}, now);
          updated[market.id] = marketListings;
          if (marketChanged) changed = true;
        }

        return changed ? updated : prev;
      });
    }, MARKET_TICK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const getListingsForTier = useCallback(
    (marketId: string, tier: number): MarketListing[] => {
      return listings[marketId]?.[tier] || [];
    },
    [listings]
  );

  const removeListing = useCallback((listingId: string) => {
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
    [listings, currentTime]
  );

  return (
    <MarketContext.Provider
      value={{
        listings,
        getListingsForTier,
        removeListing,
        getTimeRemaining,
        currentTime,
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
