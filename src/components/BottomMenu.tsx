import React from 'react';
import { View, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { menuStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { GarageIcon, MarketIcon, SkillsIcon } from '@img/index';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import type { Screen } from '@/types/index';

interface BottomMenuProps {
  currentScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export const BottomMenu = ({ currentScreen, onScreenChange }: BottomMenuProps) => {
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  return (
    <View style={[menuStyles.bottomMenu, { paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'garage' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('garage')}
      >
        <GarageIcon
          size={24}
          color={currentScreen === 'garage' ? colors.textPrimary : colors.menuInactive}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'market' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('market')}
      >
        <MarketIcon
          size={24}
          color={currentScreen === 'market' ? colors.textPrimary : colors.menuInactive}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'skills' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('skills')}
      >
        <SkillsIcon
          size={24}
          color={currentScreen === 'skills' ? colors.textPrimary : colors.menuInactive}
        />
      </TouchableOpacity>
    </View>
  );
};
