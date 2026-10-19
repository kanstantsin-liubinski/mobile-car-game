import { useState } from 'react';
import type { Screen } from '@types';
import { DEFAULT_MARKET_ID } from '../data/cityBuildings';

/** Запрос открыть авторынок на конкретном классе (например, по тапу на уведомление) */
export interface MarketFocus {
  tier: number;
  /** Меняется при каждом запросе, чтобы повторный тап снова переключил вкладку */
  nonce: number;
}

export const useNavigation = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('garage');
  // Какой авторынок открыт (выбирается на карте города)
  const [activeMarketId, setActiveMarketId] = useState(DEFAULT_MARKET_ID);
  const [marketFocus, setMarketFocus] = useState<MarketFocus | null>(null);

  const goToScreen = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const openMarket = (marketId: string, focusTier?: number) => {
    setActiveMarketId(marketId);
    if (focusTier !== undefined) setMarketFocus({ tier: focusTier, nonce: Date.now() });
    setCurrentScreen('market');
  };

  return { currentScreen, goToScreen, activeMarketId, marketFocus, openMarket };
};
