import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { GameIcon } from '@components/GameIcon';
import { colors } from '@styles/colors';
import { CARD_RADIUS, garageStyles } from '@styles/styles';

export interface DialogButton {
  label: string;
  onPress: () => void;
  /** primary — основное действие (цвет accent), secondary — серая кнопка */
  tone?: 'primary' | 'secondary';
}

interface DialogOverlayProps {
  visible: boolean;
  title: string;
  message?: string;
  icon?: ImageSourcePropType;
  emoji?: string;
  /** Цвет рамки и основной кнопки */
  accent?: string;
  /** Слой: выше игры, ниже обязательного отчёта зарплатного дня (500) */
  zIndex?: number;
  buttons: DialogButton[];
  children?: React.ReactNode;
}

/**
 * Окно-событие по центру поверх всей игры. Это слой, а не Modal: на iOS Modal не покажется,
 * если в этот момент открыто или закрывается другое окно, а событие может прийти в любую секунду.
 */
export const DialogOverlay = ({ visible, title, message, icon, emoji, accent = colors.primary, zIndex = 450, buttons, children }: DialogOverlayProps) => {
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!visible) return;
    appear.setValue(0);
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [visible, appear]);

  if (!visible) return null;
  return (
    <View style={[styles.layer, { zIndex, elevation: zIndex }]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: appear }]} />
      <Animated.View
        style={[
          styles.card,
          { borderColor: accent, opacity: appear, transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] },
        ]}
      >
        {icon ? <GameIcon source={icon} size={56} style={styles.icon} /> : emoji ? <Text style={styles.emoji}>{emoji}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {children}
        <View style={styles.buttons}>
          {buttons.map((b) => (
            <TouchableOpacity
              key={b.label}
              style={[
                garageStyles.modalButton,
                b.tone === 'secondary' ? garageStyles.cancelButton : { backgroundColor: accent, borderColor: accent },
              ]}
              onPress={b.onPress}
            >
              <Text style={[garageStyles.modalButtonText, b.tone !== 'secondary' && { color: '#FFF', fontWeight: '800' }]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  backdrop: { backgroundColor: 'rgba(0, 0, 0, 0.7)' },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.darkBg,
    borderRadius: CARD_RADIUS + 4,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  icon: { alignSelf: 'center' },
  emoji: { fontSize: 44, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
});
