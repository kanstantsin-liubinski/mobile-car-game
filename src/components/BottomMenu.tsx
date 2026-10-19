import React from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuStyles } from '@styles/styles';
import { GameIcon } from '@components/GameIcon';
import { ICONS } from '@img/gameIcons';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { useMarketContext } from '@hooks/MarketContext';
import { RedDot } from '@components/RedDot';
import { MARKETS } from '../data/cityBuildings';
import type { Screen } from '@/types/index';

const MENU_ICON_SIZE = 40;

interface BottomMenuProps {
  currentScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export const BottomMenu = ({ currentScreen, onScreenChange }: BottomMenuProps) => {
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  // Авторынок и автосалон открываются из города, поэтому вкладка «Город» активна и на них
  const isCityActive = currentScreen === 'city' || currentScreen === 'market' || currentScreen === 'dealership';
  // Горящее предложение на любом авторынке подсвечивает вкладку «Город»
  const { marketHasAlert } = useMarketContext();
  const cityAlert = currentScreen !== 'market' && MARKETS.some((m) => marketHasAlert(m.id));

  return (
    <View style={[menuStyles.bottomMenu, { paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'garage' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('garage')}
      >
        <GameIcon source={ICONS.navGarage} size={MENU_ICON_SIZE} style={currentScreen !== 'garage' && menuStyles.menuIconInactive} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[menuStyles.menuButton, isCityActive && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('city')}
      >
        <View>
          <GameIcon source={ICONS.navCity} size={MENU_ICON_SIZE} style={!isCityActive && menuStyles.menuIconInactive} />
          {cityAlert && <RedDot />}
        </View>
      </TouchableOpacity>

      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'skills' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('skills')}
      >
        <GameIcon source={ICONS.skills} size={MENU_ICON_SIZE} style={currentScreen !== 'skills' && menuStyles.menuIconInactive} />
      </TouchableOpacity>
    </View>
  );
};
