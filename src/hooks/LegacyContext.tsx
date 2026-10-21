import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as L from '../economy/legacy';
import * as E from '../economy/economy';
import { GARAGES, getGarageRank } from '../data/cityBuildings';

/** Отдельный ключ: «Новая игра» и банкротство его не удаляют */
export const LEGACY_KEY = 'game_legacy';
const ECONOMY_KEY = 'game_economy';
const GARAGE_CONFIG_KEY = 'game_garage_config';

/** Стоимость гаражей бизнеса: основной и все младше него, по ценам покупки, центы */
export const garagesValueCents = (mainGarageId: string): number => {
  const rank = Math.max(0, getGarageRank(mainGarageId));
  return GARAGES.slice(0, rank + 1).reduce((sum, g) => sum + E.toCents(g.price), 0);
};

interface LegacyContextType {
  isLoaded: boolean;
  legacy: L.LegacyState;
  /** Перезапуск через «Наследие»: записывает очки и историю. Сброс карьеры делает вызывающий */
  restart: (career: L.CareerSummary) => Promise<boolean>;
  /** Карьера закончилась банкротством или «Новой игрой» — только история */
  recordEnd: (career: L.CareerSummary, end: 'bankruptcy' | 'new_game') => Promise<void>;
  /** Перед «Новой игрой» из меню: записать сохранённую карьеру, если она была */
  recordSavedCareer: () => Promise<void>;
  /** Отметить цель «Концерн» и достижения */
  update: (fn: (l: L.LegacyState) => L.LegacyState) => Promise<void>;
}

const LegacyContext = createContext<LegacyContextType | undefined>(undefined);

/** Чтение наследия напрямую из хранилища (экономике при создании новой карьеры) */
export const loadLegacy = async (): Promise<L.LegacyState> => {
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    return L.restoreLegacy(raw ? JSON.parse(raw) : null);
  } catch {
    return L.createLegacy();
  }
};

export const LegacyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [legacy, setLegacy] = useState<L.LegacyState>(L.createLegacy);
  const [isLoaded, setIsLoaded] = useState(false);
  const ref = useRef(legacy);

  useEffect(() => {
    loadLegacy().then((l) => {
      ref.current = l;
      setLegacy(l);
      setIsLoaded(true);
    });
  }, []);

  /** Запись сразу в хранилище: от неё зависит сброс карьеры */
  const write = useCallback(async (next: L.LegacyState) => {
    if (next === ref.current) return;
    ref.current = next;
    setLegacy(next);
    await AsyncStorage.setItem(LEGACY_KEY, JSON.stringify(next));
  }, []);

  const restart = useCallback(
    async (career: L.CareerSummary) => {
      const current = await loadLegacy();
      const next = L.applyRestart(current, career);
      if (next === current) return false;
      await write(next);
      return true;
    },
    [write],
  );

  const recordEnd = useCallback(
    async (career: L.CareerSummary, end: 'bankruptcy' | 'new_game') => write(L.recordCareerEnd(await loadLegacy(), career, end)),
    [write],
  );

  const recordSavedCareer = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(ECONOMY_KEY);
      const save = raw ? E.deserializeEconomy(raw) : null;
      if (!save) return;
      const s = save.state;
      // Пустая карьера (ничего не сделано) в историю не попадает
      if (s.player.xp.totalXp === 0 && s.completedMonths === 0 && s.totals.carsSold === 0) return;
      const config = JSON.parse((await AsyncStorage.getItem(GARAGE_CONFIG_KEY)) ?? '{}');
      const summary = E.careerSummary(s, save.gameTimeMs, garagesValueCents(config?.garageId ?? GARAGES[0].id));
      await write(L.recordCareerEnd(await loadLegacy(), summary, s.bankruptcy ? 'bankruptcy' : 'new_game'));
    } catch (error) {
      console.error('Error recording career:', error);
    }
  }, [write]);

  const update = useCallback(async (fn: (l: L.LegacyState) => L.LegacyState) => write(fn(await loadLegacy())), [write]);

  const value = useMemo(
    () => ({ isLoaded, legacy, restart, recordEnd, recordSavedCareer, update }),
    [isLoaded, legacy, restart, recordEnd, recordSavedCareer, update],
  );
  return <LegacyContext.Provider value={value}>{children}</LegacyContext.Provider>;
};

export const useLegacy = () => {
  const context = useContext(LegacyContext);
  if (!context) throw new Error('useLegacy must be used within LegacyProvider');
  return context;
};
