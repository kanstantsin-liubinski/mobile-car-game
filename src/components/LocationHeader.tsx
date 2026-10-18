import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, type ImageSourcePropType } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors } from '@styles/colors';
import { GameIcon } from '@components/GameIcon';

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
    </View>
  );
};

const PILL_HEIGHT = 42;

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
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
    borderRadius: 14,
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
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
