import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { headerStyles } from '@styles/styles';
import { colors } from '@styles/colors';

interface TopMenuProps {
  balance: number;
  insets?: { top: number; right: number; bottom: number; left: number };
}

export const TopMenu = ({ balance, insets }: TopMenuProps) => {
  const formatBalance = (amount: number) => {
    return amount.toLocaleString('ru-RU');
  };

  return (
    <View style={[headerStyles.topMenu, insets && { paddingTop: insets.top }]}>
      <View style={headerStyles.balanceContainer}>
        <MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
        <Text style={headerStyles.balanceValue}>${formatBalance(balance)}</Text>
      </View>
    </View>
  );
};
