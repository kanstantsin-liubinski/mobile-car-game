import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ImageSourcePropType } from 'react-native';
import { DialogOverlay, type DialogButton } from '@components/DialogOverlay';
import { haptics } from '../../utils/haptics';

export interface GameEventView {
  /** Одно и то же событие не встаёт в очередь дважды */
  id: string;
  title: string;
  message: string;
  icon?: ImageSourcePropType;
  emoji?: string;
  accent?: string;
  buttons: DialogButton[];
}

interface GameEventsContextType {
  pushEvent: (event: GameEventView) => void;
}

const GameEventsContext = createContext<GameEventsContextType | null>(null);

/**
 * Очередь событий сделок (дефект при покупке, покупатель с предложением): по одному окну за раз.
 * Нажатие любой кнопки закрывает окно и показывает следующее событие.
 */
export const GameEventsProvider = ({ children }: { children: React.ReactNode }) => {
  const [queue, setQueue] = useState<GameEventView[]>([]);
  const ids = useRef(new Set<string>());

  const pushEvent = useCallback((event: GameEventView) => {
    if (ids.current.has(event.id)) return;
    ids.current.add(event.id);
    haptics.warning();
    setQueue((prev) => [...prev, event]);
  }, []);

  const current = queue[0];
  const close = useCallback(() => setQueue((prev) => prev.slice(1)), []);
  const value = useMemo(() => ({ pushEvent }), [pushEvent]);

  return (
    <GameEventsContext.Provider value={value}>
      {children}
      {current && (
        <DialogOverlay
          key={current.id}
          visible
          title={current.title}
          message={current.message}
          icon={current.icon}
          emoji={current.emoji}
          accent={current.accent}
          buttons={current.buttons.map((b) => ({
            ...b,
            onPress: () => {
              close();
              b.onPress();
            },
          }))}
        />
      )}
    </GameEventsContext.Provider>
  );
};

export const useGameEvents = () => {
  const context = useContext(GameEventsContext);
  if (!context) throw new Error('useGameEvents must be used within GameEventsProvider');
  return context;
};
