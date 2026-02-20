import { useState } from 'react';
import type { Screen } from '../types';

export const useNavigation = () => {
  const [currentScreen, setCurrentScreen] = useState<Screen>('garage');

  const goToScreen = (screen: Screen) => {
    setCurrentScreen(screen);
  };

  return { currentScreen, goToScreen };
};
