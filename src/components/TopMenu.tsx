import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, Platform } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
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
  /** Нажатие на календарь — окно «Календарь» */
  onPressCalendar: () => void;
  /** Нажатие на опыт — окно «Опыт» */
  onPressXp: () => void;
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

/** Интервал игровых часов (EconomyContext) — анимация тянется ровно до следующего тика */
const CLOCK_TICK_MS = 250;

/**
 * Полоска текущего дня. Часы обновляются 4 раза в секунду, поэтому между тиками полоска
 * плавно доезжает до нового значения; на новом дне начинается с нуля. На паузе стоит на месте.
 */
const DayBar = ({ progress }: { progress: number }) =>
  Platform.OS === 'web' ? <DayBarWeb progress={progress} /> : <DayBarNative progress={progress} />;

/** Веб: CSS-переход ширины — значение ставится сразу, плавность рисует браузер */
const DayBarWeb = ({ progress }: { progress: number }) => {
  const last = useRef(progress);
  const wrapped = progress < last.current;
  last.current = progress;
  const transition = {
    transitionProperty: 'width',
    transitionDuration: wrapped ? '0ms' : `${CLOCK_TICK_MS}ms`,
    transitionTimingFunction: 'linear',
  } as object;
  return (
    <View style={[headerStyles.calendarTrack, headerStyles.dayTrack]}>
      <View style={[headerStyles.calendarFill, headerStyles.dayFill, { width: `${progress * 100}%` }, transition]} />
    </View>
  );
};

/** Телефон: Animated доезжает до нового значения за время между тиками часов */
const DayBarNative = ({ progress }: { progress: number }) => {
  const value = useRef(new Animated.Value(progress)).current;
  const last = useRef(progress);

  useEffect(() => {
    // Новый день — сбрасываем без анимации назад
    if (progress < last.current) value.setValue(0);
    last.current = progress;
    const anim = Animated.timing(value, {
      toValue: progress,
      duration: CLOCK_TICK_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, value]);

  return (
    <View style={[headerStyles.calendarTrack, headerStyles.dayTrack]}>
      <Animated.View
        style={[
          headerStyles.calendarFill,
          headerStyles.dayFill,
          { width: value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
};

export const TopMenu = ({ insets, onPressBalance, onPressCalendar, onPressXp }: TopMenuProps) => {
  const { level, getProgress } = useExperienceContext();
  const { current, required, percentage } = getProgress();
  const { state } = useEconomy();
  const { calendar } = useGameClock();

  return (
    <View style={[headerStyles.topMenu, insets && { paddingTop: insets.top }]}>
      {/* Баланс — только свободные деньги; по нажатию открываются финансы */}
      <TouchableOpacity style={headerStyles.balanceContainer} onPress={onPressBalance} activeOpacity={0.7}>
        <GameIcon source={ICONS.money} size={24} />
        <Text style={headerStyles.balanceValue} numberOfLines={1} adjustsFontSizeToFit>{formatMoney(state.balanceCents)}</Text>
        {state.loan && <Text style={headerStyles.loanBadge}>долг</Text>}
      </TouchableOpacity>

      {/* Календарь и время до зарплатного дня */}
      <TouchableOpacity style={headerStyles.calendar} onPress={onPressCalendar} activeOpacity={0.7}>
        <Text style={headerStyles.calendarText}>
          {calendar.weekday} День {calendar.day}
        </Text>
        {/* Текущий день: 10 секунд активной игры */}
        <DayBar progress={calendar.msToPayday <= 0 ? 1 : (calendar.msIntoMonth % DAY_MS) / DAY_MS} />
        {/* Месяц: 30 дней до зарплатного дня */}
        <View style={headerStyles.calendarTrack}>
          <View style={[headerStyles.calendarFill, { width: `${calendar.monthProgress * 100}%` }]} />
        </View>
        <Text style={headerStyles.calendarMonth}>Месяц {calendar.month}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={headerStyles.levelIndicatorContainer} onPress={onPressXp} activeOpacity={0.7}>
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
      </TouchableOpacity>
    </View>
  );
};
