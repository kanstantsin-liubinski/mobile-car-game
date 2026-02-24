import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface Timer {
  id: string;
  type: 'sell' | 'repair' | 'auction'; // Типы операций
  duration: number; // В миллисекундах
  elapsed: number; // Прошедшее время в миллисекундах
  startedAt: number; // Timestamp когда начался
  onComplete: () => void; // Callback при завершении
  metadata?: Record<string, any>; // Дополнительные данные (carId, price и т.д.)
}

interface GlobalTimerContextType {
  timers: Timer[];
  addTimer: (timer: Omit<Timer, 'id' | 'elapsed' | 'startedAt'>, duration: number) => string;
  removeTimer: (id: string) => void;
  getTimer: (id: string) => Timer | undefined;
  getProgress: (id: string) => number; // 0-100%
}

const GlobalTimerContext = createContext<GlobalTimerContextType | undefined>(undefined);

const TIMER_UPDATE_INTERVAL = 100; // Обновляем каждые 100мс

export const GlobalTimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [timers, setTimers] = useState<Timer[]>([]);

  // Основной цикл обновления таймеров
  useEffect(() => {
    const interval = setInterval(() => {
      setTimers((prevTimers) => {
        const now = Date.now();
        const updated: Timer[] = [];

        prevTimers.forEach((timer) => {
          const elapsed = now - timer.startedAt;

          if (elapsed >= timer.duration) {
            // Таймер завершился
            timer.onComplete();
          } else {
            // Таймер ещё работает
            updated.push({
              ...timer,
              elapsed,
            });
          }
        });

        return updated;
      });
    }, TIMER_UPDATE_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  const addTimer = useCallback(
    (timer: Omit<Timer, 'id' | 'elapsed' | 'startedAt'>, duration: number): string => {
      const id = `timer_${Date.now()}_${Math.random()}`;
      const newTimer: Timer = {
        ...timer,
        id,
        duration,
        elapsed: 0,
        startedAt: Date.now(),
      };

      setTimers((prev) => [...prev, newTimer]);
      return id;
    },
    []
  );

  const removeTimer = useCallback((id: string) => {
    setTimers((prev) => prev.filter((timer) => timer.id !== id));
  }, []);

  const getTimer = useCallback(
    (id: string): Timer | undefined => {
      return timers.find((timer) => timer.id === id);
    },
    [timers]
  );

  const getProgress = useCallback(
    (id: string): number => {
      const timer = timers.find((t) => t.id === id);
      if (!timer) return 0;
      return (timer.elapsed / timer.duration) * 100;
    },
    [timers]
  );

  return (
    <GlobalTimerContext.Provider
      value={{
        timers,
        addTimer,
        removeTimer,
        getTimer,
        getProgress,
      }}
    >
      {children}
    </GlobalTimerContext.Provider>
  );
};

export const useGlobalTimer = () => {
  const context = useContext(GlobalTimerContext);
  if (!context) {
    throw new Error('useGlobalTimer must be used within GlobalTimerProvider');
  }
  return context;
};
