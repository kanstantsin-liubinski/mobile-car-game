import { useState } from 'react';
import type { Screen } from '@types';
import { DEFAULT_MARKET_ID } from '../data/cityBuildings';

export const useNavigation = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('garage');
  // Какой авторынок открыт (выбирается на карте города)
  const [activeMarketId, setActiveMarketId] = useState(DEFAULT_MARKET_ID);

  const goToScreen = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  const openMarket = (marketId: string) => {
    setActiveMarketId(marketId);
    setCurrentScreen('market');
  };

  return { currentScreen, goToScreen, activeMarketId, openMarket };
};
