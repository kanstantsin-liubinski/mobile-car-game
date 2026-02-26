import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  generateAllInitialListings,
  generateRandomListing,
  MIN_LISTINGS_PER_TIER,
  MAX_LISTINGS_PER_TIER,
} from '../utils/marketGenerator';
import type { MarketListing } from '../utils/marketGenerator';
import { TOTAL_TIERS } from '../data/carModels';

interface MarketContextType {
  /** Все текущие объявления по тирам */
  listings: Record<number, MarketListing[]>;
  /** Получить объявления для конкретного тира */
  getListingsForTier: (tier: number) => MarketListing[];
  /** Удалить объявление (при покупке) */
  removeListing: (listingId: string) => void;
  /** Оставшееся время до исчезновения (мс), -1 если не найдено */
  getTimeRemaining: (listingId: string) => number;
  /** Текущее время (обновляется каждую секунду для пересчёта таймеров) */
  currentTime: number;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

const MARKET_TICK_INTERVAL = 1000; // Обновляем каждую секунду

export const MarketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [listings, setListings] = useState<Record<number, MarketListing[]>>(() =>
    generateAllInitialListings()
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
        const updated: Record<number, MarketListing[]> = {};

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

        return changed ? updated : prev;
      });
    }, MARKET_TICK_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const getListingsForTier = useCallback(
    (tier: number): MarketListing[] => {
      return listings[tier] || [];
    },
    [listings]
  );

  const removeListing = useCallback((listingId: string) => {
    setListings((prev) => {
      const updated: Record<number, MarketListing[]> = {};
      let found = false;

      for (let tier = 1; tier <= TOTAL_TIERS; tier++) {
        const tierListings = prev[tier] || [];
        const filtered = tierListings.filter((l) => l.car.id !== listingId);

        if (filtered.length !== tierListings.length) {
          found = true;
        }

        updated[tier] = filtered;
      }

      return found ? updated : prev;
    });
  }, []);

  const getTimeRemaining = useCallback(
    (listingId: string): number => {
      for (let tier = 1; tier <= TOTAL_TIERS; tier++) {
        const listing = (listings[tier] || []).find((l) => l.car.id === listingId);
        if (listing) {
          return Math.max(0, listing.expiresAt - currentTime);
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
