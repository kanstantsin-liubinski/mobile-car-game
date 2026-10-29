import React from 'react';
import { View, Text, StyleSheet, type ImageSourcePropType } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '@styles/colors';
import { CARD_RADIUS, LOCATION_BAND, LOCATION_GAP, SCREEN_INSET } from '@styles/styles';
import { GameIcon } from '@components/GameIcon';
import { RedDot } from '@components/RedDot';
import { useGoals } from '@components/goals/GoalsContext';
import { useEconomy } from '@hooks/EconomyContext';
import { pendingGoalRewards } from '../economy/economy';

interface LocationHeaderProps {
  title: string;
  /** Картинка локации из assets/icons; если нет — показывается emoji */
  icon?: ImageSourcePropType;
  emoji?: string;
  /** Кнопка «назад» слева от названия */
  onBack?: () => void;
  /** Поверх контента (для карты города), иначе — обычный блок над контентом */
  overlay?: boolean;
}

/** Табличка с названием текущей локации в верхнем левом углу экрана */
export const LocationHeader = ({ title, icon, emoji, onBack, overlay }: LocationHeaderProps) => {
  return (
    <View style={[styles.wrapper, overlay && styles.wrapperOverlay]} pointerEvents="box-none">
      {onBack && (
        <TouchableOpacity
          style={[styles.pill, styles.backButton]}
          onPress={onBack}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <MaterialIcons name="chevron-left" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      )}
      <View style={[styles.pill, styles.titlePill]} pointerEvents="none">
        {icon ? <GameIcon source={icon} size={30} /> : <Text style={styles.emoji}>{emoji}</Text>}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <GoalsButton />
    </View>
  );
};

/** Кнопка «Цели» справа: задания дня, достижения, коллекция; красная точка — есть награда */
const GoalsButton = () => {
  const goals = useGoals();
  const { state } = useEconomy();
  if (!goals) return null;
  const pending = pendingGoalRewards(state);
  return (
    <TouchableOpacity style={[styles.pill, styles.goalsButton]} onPress={goals.openGoals} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
      <Text style={styles.goalsIcon}>🎯</Text>
      <Text style={styles.goalsText}>Цели</Text>
      {pending > 0 && <RedDot />}
    </TouchableOpacity>
  );
};

const PILL_HEIGHT = 42;

const styles = StyleSheet.create({
  // Высота полосы задана жёстко: на всех экранах плашка стоит на одном месте и одной высоты,
  // что бы ни лежало внутри (кнопка «назад», иконка или emoji)
  wrapper: {
    height: LOCATION_GAP + PILL_HEIGHT + LOCATION_BAND,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SCREEN_INSET,
    paddingTop: LOCATION_GAP,
    paddingBottom: LOCATION_BAND,
  },
  wrapperOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  pill: {
    height: PILL_HEIGHT,
    borderRadius: CARD_RADIUS,
    backgroundColor: 'rgba(30, 41, 59, 0.92)',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    width: PILL_HEIGHT,
  },
  titlePill: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    flexShrink: 1,
  },
  emoji: {
    fontSize: 18,
  },
  goalsButton: {
    marginLeft: 'auto',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  goalsIcon: {
    fontSize: 18,
  },
  goalsText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
