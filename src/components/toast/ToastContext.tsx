import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { TouchableOpacity } from '@components/Touchable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@styles/colors';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GameIcon } from '@components/GameIcon';
import { haptics } from '../../utils/haptics';

/** Сколько тост висит на экране (реальное время) */
const TOAST_DURATION_MS = 5000;

export interface ToastOptions {
  title: string;
  message?: string;
  icon?: ImageSourcePropType;
  tone?: 'info' | 'success' | 'hot';
  /** Тап по тосту: действие и закрытие */
  onPress?: () => void;
}

interface Toast extends ToastOptions {
  id: number;
}

interface ToastContextType {
  showToast: (toast: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/** Короткие уведомления вверху экрана — видны на любом экране игры */
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (toast: ToastOptions) => {
      nextId.current += 1;
      const id = nextId.current;
      // Хорошие новости и горящие предложения ощущаются и без взгляда на экран
      if (toast.tone === 'success') haptics.success();
      else if (toast.tone === 'hot') haptics.warning();
      setToasts((prev) => [...prev, { ...toast, id }]);
      timers.current.set(id, setTimeout(() => dismiss(id), TOAST_DURATION_MS));
    },
    [dismiss],
  );

  useEffect(() => {
    const active = timers.current;
    return () => active.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

const ToastHost = ({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) => {
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;
  if (toasts.length === 0) return null;

  return (
    <View style={[styles.host, { top: insets.top + 8 }]} pointerEvents="box-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </View>
  );
};

const ToastItem = ({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) => {
  const appear = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [appear]);

  const accent = toast.tone === 'success' ? '#22C55E' : toast.tone === 'hot' ? '#F97316' : colors.primary;
  const handlePress = toast.onPress
    ? () => {
        onDismiss(toast.id);
        toast.onPress?.();
      }
    : undefined;

  return (
    <Animated.View
      style={[
        styles.toast,
        { borderLeftColor: accent },
        {
          opacity: appear,
          transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }],
        },
      ]}
    >
      <TouchableOpacity style={styles.body} onPress={handlePress} disabled={!handlePress} activeOpacity={0.8}>
        {toast.icon && <GameIcon source={toast.icon} size={40} />}
        <View style={styles.texts}>
          <Text style={styles.title}>{toast.title}</Text>
          {toast.message && <Text style={styles.message}>{toast.message}</Text>}
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onDismiss(toast.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.close}>✕</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 1000,
    gap: 8,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(30, 41, 59, 0.97)',
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  texts: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  message: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 2,
  },
  close: {
    fontSize: 16,
    color: colors.textTertiary,
    paddingHorizontal: 4,
  },
});
