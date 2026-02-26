import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { headerStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useExperienceContext } from '@hooks/ExperienceContext';

interface TopMenuProps {
  balance: number;
  insets?: { top: number; right: number; bottom: number; left: number };
}

const CircularProgressBar = ({ percentage, level }: { percentage: number; level: number }) => {
  const size = 48;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (percentage / 100) * circumference;

  return (
    <View style={headerStyles.levelCircleContainer}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress arc */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.primary}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progressOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {/* Center level number */}
      <View style={headerStyles.levelCenterLabel}>
        <Text style={headerStyles.levelText}>{level}</Text>
      </View>
    </View>
  );
};

export const TopMenu = ({ balance, insets }: TopMenuProps) => {
  const { level, getProgress } = useExperienceContext();
  const { current, required, percentage } = getProgress();

  const formatBalance = (amount: number) => {
    return amount.toLocaleString('ru-RU');
  };

  return (
    <View style={[headerStyles.topMenu, insets && { paddingTop: insets.top }]}>
      <View style={headerStyles.balanceContainer}>
        <MaterialIcons name="account-balance-wallet" size={24} color={colors.primary} />
        <Text style={headerStyles.balanceValue}>${formatBalance(balance)}</Text>
      </View>

      <View style={headerStyles.levelIndicatorContainer}>
        {/* Circular Progress Bar */}
        <CircularProgressBar 
          percentage={percentage}
          level={level}
        />
        
        {/* Counter text */}
        <View style={{ gap: 1 }}>
          <Text style={[headerStyles.levelCounterText, { fontWeight: '700', color: colors.primary, fontSize: 12 }]}>
            {current}
          </Text>
          <Text style={[headerStyles.levelCounterText, { fontSize: 10 }]}>
            /{required}
          </Text>
        </View>
      </View>
    </View>
  );
};
