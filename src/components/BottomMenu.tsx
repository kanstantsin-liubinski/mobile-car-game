import React from 'react';
import { View, Text, Platform } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { useEconomy } from '@hooks/EconomyContext';
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
/** Точка-индикатор: одинаково от верхнего и правого края кнопки */
const DOT = { top: 5, right: 5 };

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
  // Заказы: точка, когда есть готовая к сдаче работа
  const { state } = useEconomy();
  const ordersAlert = state.orders.active.some((o) => o.kind === 'service' && o.completedAtMs !== undefined);

  return (
    <View style={[menuStyles.bottomMenu, { paddingBottom: insets.bottom }]}>
      <MenuItem label="Гараж" active={currentScreen === 'garage'} onPress={() => onScreenChange('garage')}>
        <GameIcon source={ICONS.navGarage} size={MENU_ICON_SIZE} style={currentScreen !== 'garage' && menuStyles.menuIconInactive} />
      </MenuItem>

      <MenuItem label="Город" active={isCityActive} onPress={() => onScreenChange('city')} alert={cityAlert}>
        <GameIcon source={ICONS.navCity} size={MENU_ICON_SIZE} style={!isCityActive && menuStyles.menuIconInactive} />
      </MenuItem>

      <MenuItem
        label="Заказы"
        active={currentScreen === 'orders'}
        onPress={() => onScreenChange('orders')}
        alert={ordersAlert && currentScreen !== 'orders'}
      >
        <Text style={{ fontSize: 30, opacity: currentScreen === 'orders' ? 1 : 0.55 }}>📋</Text>
      </MenuItem>

      <MenuItem label="Навыки" active={currentScreen === 'skills'} onPress={() => onScreenChange('skills')}>
        <GameIcon source={ICONS.skills} size={MENU_ICON_SIZE} style={currentScreen !== 'skills' && menuStyles.menuIconInactive} />
      </MenuItem>
    </View>
  );
};

/** Кнопка меню с подписью: одних иконок новичку не хватало, чтобы понять, где что */
const MenuItem = ({
  label,
  active,
  alert,
  onPress,
  children,
}: {
  label: string;
  active: boolean;
  alert?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) => (
  <View style={menuStyles.menuItem}>
    <TouchableOpacity style={[menuStyles.menuButton, active && menuStyles.menuButtonActive]} onPress={onPress} accessibilityLabel={label}>
      {children}
      {alert && <RedDot style={DOT} />}
    </TouchableOpacity>
    <Text style={[menuStyles.menuLabel, active && menuStyles.menuLabelActive]}>{label}</Text>
  </View>
);
