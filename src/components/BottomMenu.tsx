import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { menuStyles } from '../styles/styles';
import { colors } from '../styles/colors';
import type { Screen } from '../types';

interface BottomMenuProps {
  currentScreen: Screen;
  onScreenChange: (screen: Screen) => void;
}

export const BottomMenu = ({ currentScreen, onScreenChange }: BottomMenuProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[menuStyles.bottomMenu, { paddingBottom: insets.bottom }]}>
      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'garage' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('garage')}
      >
        <MaterialIcons
          name="garage"
          size={24}
          color={currentScreen === 'garage' ? colors.white : colors.inactive}
        />
      </TouchableOpacity>

      <TouchableOpacity
        style={[menuStyles.menuButton, currentScreen === 'market' && menuStyles.menuButtonActive]}
        onPress={() => onScreenChange('market')}
      >
        <MaterialIcons
          name="store"
          size={24}
          color={currentScreen === 'market' ? colors.white : colors.inactive}
        />
      </TouchableOpacity>
    </View>
  );
};
