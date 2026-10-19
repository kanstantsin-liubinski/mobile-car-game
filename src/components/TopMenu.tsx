import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { headerStyles } from '@styles/styles';
import { colors } from '@styles/colors';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { formatMoney } from '../economy/format';
import { DAY_MS } from '../economy/time';
import { GameIcon } from '@components/GameIcon';
import { ICONS } from '@img/gameIcons';

interface TopMenuProps {
  insets?: { top: number; right: number; bottom: number; left: number };
  /** Нажатие на баланс открывает финансовую панель */
  onPressBalance: () => void;
}

const CircularProgressBar = ({ percentage, level }: { percentage: number; level: number }) => {
  const size = 24;
  const strokeWidth = 2;
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

export const TopMenu = ({ insets, onPressBalance }: TopMenuProps) => {
  const { level, getProgress } = useExperienceContext();
  const { current, required, percentage } = getProgress();
  const { state } = useEconomy();
  const { calendar } = useGameClock();

  return (
    <View style={[headerStyles.topMenu, insets && { paddingTop: insets.top }]}>
      {/* Баланс — только свободные деньги; по нажатию открываются финансы */}
      <TouchableOpacity style={headerStyles.balanceContainer} onPress={onPressBalance} activeOpacity={0.7}>
        <GameIcon source={ICONS.money} size={30} />
        <Text style={headerStyles.balanceValue}>{formatMoney(state.balanceCents)}</Text>
        {state.loan && <Text style={headerStyles.loanBadge}>долг</Text>}
      </TouchableOpacity>

      {/* Календарь и время до зарплатного дня */}
      <TouchableOpacity style={headerStyles.calendar} onPress={onPressBalance} activeOpacity={0.7}>
        <Text style={headerStyles.calendarText}>
          {calendar.weekday} День {calendar.day}
        </Text>
        {/* Текущий день: 10 секунд активной игры */}
        <View style={[headerStyles.calendarTrack, headerStyles.dayTrack]}>
          <View
            style={[
              headerStyles.calendarFill,
              headerStyles.dayFill,
              { width: `${calendar.msToPayday <= 0 ? 100 : ((calendar.msIntoMonth % DAY_MS) / DAY_MS) * 100}%` },
            ]}
          />
        </View>
        {/* Месяц: 30 дней до зарплатного дня */}
        <View style={headerStyles.calendarTrack}>
          <View style={[headerStyles.calendarFill, { width: `${calendar.monthProgress * 100}%` }]} />
        </View>
        <Text style={headerStyles.calendarMonth}>Месяц {calendar.month}</Text>
      </TouchableOpacity>

      <View style={headerStyles.levelIndicatorContainer}>
        <GameIcon source={ICONS.xp} size={24} />
        {/* Circular Progress Bar */}
        <CircularProgressBar 
          percentage={percentage}
          level={level}
        />
        
        {/* Counter text */}
        <Text style={headerStyles.levelCounterText}>
          <Text style={{ fontWeight: '700', color: colors.primary }}>{current}</Text>
          <Text>/{required}</Text>
        </Text>
      </View>
    </View>
  );
};
