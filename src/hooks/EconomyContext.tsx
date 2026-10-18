import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as E from '../economy/economy';
import { calculateMaxCondition } from '../utils/priceCalculator';
import type { Car } from '@/types';

const ECONOMY_KEY = 'game_economy';
/** Ключи до финансовой системы и системы прогрессии — читаются один раз для переноса сохранений */
const LEGACY_BALANCE_KEY = 'game_balance';
const LEGACY_EXPERIENCE_KEY = 'game_experience';
const LEGACY_SKILLS_KEY = 'game_skills';
const INITIAL_BALANCE_CENTS = E.toCents(25_000);

const TICK_MS = 250;
/** Если JS долго не получал тики (зависание, фон без события), дольше секунды за раз не засчитываем */
const MAX_TICK_MS = 1000;
const SAVE_EVERY_MS = 1000;

interface EconomyContextType {
  isLoaded: boolean;
  state: E.EconomyState;
  /** Свободные деньги в долларах */
  balance: number;
  /** Текущее игровое время (для мгновенных операций вне ререндера) */
  getNow: () => number;
  canAfford: (dollars: number) => boolean;
  buyCar: (car: Car) => boolean;
  recordCarSale: (car: Pick<Car, 'id' | 'price' | 'tier'>, sellPrice: number) => void;
  /** Машина впервые полностью восстановлена — бонус XP (один раз на экземпляр) */
  awardFullRepair: (carId: string) => void;
  /** Успешный ручной тап ремонта: +1 практика навыка игрока */
  recordPlayerTap: () => void;
  playerTapMultiplier: number;
  playerCourseOffer: () => E.CourseOffer;
  buyPlayerCourse: () => boolean;
  workerCourseOffer: (mechanicId: string) => E.CourseOffer | null;
  buyWorkerCourse: (mechanicId: string) => boolean;
  initLegacyWorkerSkill: (mechanicId: string, level: number) => void;
  buyGarage: (dollars: number) => boolean;
  payMechanicTraining: (dollars: number) => boolean;
  addOtherIncome: (dollars: number) => void;
  hireMechanic: (mechanicId: string) => void;
  previewFire: (mechanicId: string) => E.FirePreview | null;
  fireMechanic: (mechanicId: string) => boolean;
  setMechanicBusy: (mechanicId: string, busy: boolean, atMs?: number) => void;
  recordMechanicJob: (mechanicId: string) => void;
  migrateContracts: (hiredMechanicIds: string[]) => void;
  ensureAssets: (cars: (Car & { maxCondition?: number })[]) => void;
  repayLoan: (cents: number) => boolean;
  closeMonth: (repayCents: number) => E.CloseOutcome;
}

interface GameClockContextType {
  gameTimeMs: number;
  calendar: E.CalendarInfo;
  paydayPending: boolean;
}

const EconomyContext = createContext<EconomyContextType | undefined>(undefined);
const GameClockContext = createContext<GameClockContextType | undefined>(undefined);

/**
 * Единственный владелец денег и игрового времени.
 * Время идёт только пока игра открыта, приложение активно, нет зарплатного дня и банкротства.
 * Всё финансовое состояние и время сохраняются одним ключом, поэтому закрытие месяца атомарно.
 */
export const EconomyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<E.EconomyState>(() => E.createEconomy(INITIAL_BALANCE_CENTS));
  const [gameTimeMs, setGameTimeMs] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Рефы — источник истины для синхронных операций: два быстрых нажатия видят уже обновлённое состояние
  const stateRef = useRef(state);
  const timeRef = useRef(0);
  const loadedRef = useRef(false);
  const appActiveRef = useRef(AppState.currentState === 'active' || AppState.currentState == null);
  const lastTickRef = useRef<number | null>(null);
  const lastSaveRef = useRef(0);
  const dirtyRef = useRef(false);

  const persist = useCallback(() => {
    if (!loadedRef.current) return;
    lastSaveRef.current = Date.now();
    dirtyRef.current = false;
    AsyncStorage.setItem(ECONOMY_KEY, E.serializeEconomy(stateRef.current, timeRef.current)).catch((error) =>
      console.error('Error saving economy:', error),
    );
  }, []);

  /** Применяет операцию к актуальному состоянию и сразу сохраняет */
  const commit = useCallback(
    (next: E.EconomyState, options: { deferSave?: boolean } = {}) => {
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
      // Частые мелкие операции (тапы) сохраняются вместе с ближайшим тиком часов — не чаще раза в секунду
      if (options.deferSave) dirtyRef.current = true;
      else persist();
    },
    [persist],
  );

  const run = useCallback(
    (op: (s: E.EconomyState, now: number) => E.OpResult): boolean => {
      const res = op(stateRef.current, timeRef.current);
      if (res.ok) commit(res.state);
      return res.ok;
    },
    [commit],
  );

  // ─── Загрузка и перенос старых сохранений ─────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(ECONOMY_KEY);
        const save = raw ? E.deserializeEconomy(raw) : null;
        if (save) {
          // Оклады приводятся к уровню навыка (новый баланс зарплат действует с этого момента)
          stateRef.current = E.syncSalariesWithSkill(save.state, save.gameTimeMs);
          timeRef.current = save.gameTimeMs;
        } else {
          // Сохранение до финансовой системы: переносим баланс, контракты механикам создаст гараж
          const legacy = await AsyncStorage.getItem(LEGACY_BALANCE_KEY);
          const balanceCents = legacy !== null ? E.toCents(parseFloat(legacy) || 0) : INITIAL_BALANCE_CENTS;
          stateRef.current = E.createEconomy(balanceCents, legacy === null, legacy === null);
          timeRef.current = 0;
        }
        if (!stateRef.current.playerMigrated) {
          // Опыт и навык «Механик» игрока из прежних ключей сохранения
          const [xpRaw, skillsRaw] = await Promise.all([
            AsyncStorage.getItem(LEGACY_EXPERIENCE_KEY),
            AsyncStorage.getItem(LEGACY_SKILLS_KEY),
          ]);
          let skillLevel: number | null = null;
          try {
            const skills = skillsRaw ? JSON.parse(skillsRaw) : null;
            skillLevel = Array.isArray(skills) ? skills.find((sk: any) => sk?.id === 'mechanic')?.level ?? null : null;
          } catch {
            skillLevel = null;
          }
          stateRef.current = E.migrateLegacyPlayer(stateRef.current, {
            totalXp: xpRaw !== null ? parseInt(xpRaw, 10) || 0 : null,
            skillLevel,
          });
        }
      } catch (error) {
        console.error('Error loading economy:', error);
      } finally {
        loadedRef.current = true;
        setState(stateRef.current);
        setGameTimeMs(timeRef.current);
        setIsLoaded(true);
        persist();
      }
    };
    load();
  }, [persist]);

  // ─── Игровые часы ─────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const s = stateRef.current;
      const running =
        loadedRef.current && appActiveRef.current && !s.bankruptcy && !E.isPaydayPending(s, timeRef.current);
      const wall = Date.now();
      if (!running) {
        lastTickRef.current = null;
        return;
      }
      const dt = lastTickRef.current === null ? 0 : Math.min(MAX_TICK_MS, wall - lastTickRef.current);
      lastTickRef.current = wall;
      const next = E.advanceGameTime(s, timeRef.current, dt);
      if (next === timeRef.current) return;
      timeRef.current = next;
      setGameTimeMs(next);
      // Механик набрал практику на новый уровень — фиксируем: с этого момента новая скорость и оклад
      if (E.hasPendingWorkerLevelUp(s, next)) {
        commit(E.syncAllWorkers(s, next));
        return;
      }
      // Зарплатный день наступил — фиксируем сразу, чтобы перезагрузка вернула в него же
      if (E.isPaydayPending(s, next) || wall - lastSaveRef.current >= SAVE_EVERY_MS) persist();
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [persist, commit]);

  // Сворачивание / уход вкладки в фон: время встаёт, состояние сохраняется
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      appActiveRef.current = next === 'active';
      lastTickRef.current = null;
      if (next !== 'active') persist();
    });
    const onPageHide = () => persist();
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('pagehide', onPageHide);
      window.addEventListener('beforeunload', onPageHide);
    }
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('pagehide', onPageHide);
        window.removeEventListener('beforeunload', onPageHide);
      }
    };
  }, [persist]);

  // ─── Операции ─────────────────────────────────────────────────────
  const getNow = useCallback(() => timeRef.current, []);

  const canAfford = useCallback((dollars: number) => E.canAfford(stateRef.current, E.toCents(dollars)), []);

  const buyCar = useCallback(
    (car: Car) =>
      run((s) =>
        E.buyCar(s, {
          carId: car.id,
          name: car.name,
          tier: car.tier,
          priceCents: E.toCents(car.price),
          conditionPct: car.condition,
          maxConditionPct: calculateMaxCondition(car.year, car.mileage),
        }),
      ),
    [run],
  );

  const recordCarSale = useCallback(
    (car: Pick<Car, 'id' | 'price' | 'tier'>, sellPrice: number) => {
      commit(
        E.sellCar(stateRef.current, {
          carId: car.id,
          priceCents: E.toCents(sellPrice),
          fallbackCostCents: E.toCents(car.price),
          tier: car.tier,
        }),
      );
    },
    [commit],
  );

  const buyGarage = useCallback((dollars: number) => run((s) => E.buyGarage(s, E.toCents(dollars))), [run]);

  const awardFullRepair = useCallback((carId: string) => commit(E.awardFullRepair(stateRef.current, carId)), [commit]);

  const recordPlayerTap = useCallback(
    () => commit(E.recordPlayerTap(stateRef.current), { deferSave: true }),
    [commit],
  );

  const playerCourseOffer = useCallback(() => E.playerCourseOffer(stateRef.current, timeRef.current), []);
  const buyPlayerCourse = useCallback(() => run((s, now) => E.buyPlayerCourse(s, now)), [run]);
  const workerCourseOffer = useCallback(
    (mechanicId: string) => E.workerCourseOffer(stateRef.current, mechanicId, timeRef.current),
    [],
  );
  const buyWorkerCourse = useCallback(
    (mechanicId: string) => run((s, now) => E.buyWorkerCourse(s, mechanicId, now)),
    [run],
  );
  const initLegacyWorkerSkill = useCallback(
    (mechanicId: string, level: number) =>
      commit(E.initLegacyWorkerSkill(stateRef.current, mechanicId, level, timeRef.current)),
    [commit],
  );

  const payMechanicTraining = useCallback(
    (dollars: number) => run((s) => E.spendOtherExpense(s, E.toCents(dollars))),
    [run],
  );

  const addOtherIncome = useCallback(
    (dollars: number) => commit(E.earnOtherIncome(stateRef.current, E.toCents(dollars))),
    [commit],
  );

  const hireMechanic = useCallback(
    (mechanicId: string) => commit(E.startContract(stateRef.current, mechanicId, timeRef.current)),
    [commit],
  );

  const previewFire = useCallback(
    (mechanicId: string) => E.previewFire(stateRef.current, mechanicId, timeRef.current),
    [],
  );

  const fireMechanic = useCallback(
    (mechanicId: string) => run((s, now) => E.fireMechanic(s, mechanicId, now)),
    [run],
  );

  const setMechanicBusy = useCallback(
    (mechanicId: string, busy: boolean, atMs?: number) =>
      commit(E.setMechanicBusy(stateRef.current, mechanicId, busy, atMs ?? timeRef.current)),
    [commit],
  );

  const recordMechanicJob = useCallback(
    (mechanicId: string) => commit(E.recordMechanicJob(stateRef.current, mechanicId)),
    [commit],
  );

  const migrateContracts = useCallback(
    (hiredMechanicIds: string[]) => {
      let s = stateRef.current;
      if (s.contractsMigrated) return;
      for (const id of hiredMechanicIds) s = E.startContract(s, id, timeRef.current);
      commit({ ...s, contractsMigrated: true });
    },
    [commit],
  );

  const ensureAssets = useCallback(
    (cars: (Car & { maxCondition?: number })[]) =>
      commit(
        E.ensureAssets(
          stateRef.current,
          cars.map((c) => ({
            carId: c.id,
            name: c.name,
            tier: c.tier,
            priceCents: E.toCents(c.price),
            conditionPct: c.condition,
            maxConditionPct: c.maxCondition,
          })),
        ),
      ),
    [commit],
  );

  const repayLoan = useCallback((cents: number) => run((s) => E.repayLoan(s, cents)), [run]);

  const closeMonth = useCallback(
    (repayCents: number) => {
      const { state: next, outcome } = E.closeMonth(stateRef.current, timeRef.current, repayCents);
      if (outcome !== 'noop') {
        commit(next);
        lastTickRef.current = null;
      }
      return outcome;
    },
    [commit],
  );

  const economyValue = useMemo<EconomyContextType>(
    () => ({
      isLoaded,
      state,
      balance: E.fromCents(state.balanceCents),
      getNow,
      canAfford,
      buyCar,
      recordCarSale,
      awardFullRepair,
      recordPlayerTap,
      playerTapMultiplier: E.playerTapMultiplier(state),
      playerCourseOffer,
      buyPlayerCourse,
      workerCourseOffer,
      buyWorkerCourse,
      initLegacyWorkerSkill,
      buyGarage,
      payMechanicTraining,
      addOtherIncome,
      hireMechanic,
      previewFire,
      fireMechanic,
      setMechanicBusy,
      recordMechanicJob,
      migrateContracts,
      ensureAssets,
      repayLoan,
      closeMonth,
    }),
    [
      isLoaded,
      state,
      getNow,
      canAfford,
      buyCar,
      recordCarSale,
      awardFullRepair,
      recordPlayerTap,
      playerCourseOffer,
      buyPlayerCourse,
      workerCourseOffer,
      buyWorkerCourse,
      initLegacyWorkerSkill,
      buyGarage,
      payMechanicTraining,
      addOtherIncome,
      hireMechanic,
      previewFire,
      fireMechanic,
      setMechanicBusy,
      recordMechanicJob,
      migrateContracts,
      ensureAssets,
      repayLoan,
      closeMonth,
    ],
  );

  const clockValue = useMemo<GameClockContextType>(
    () => ({
      gameTimeMs,
      calendar: E.getCalendar(state, gameTimeMs),
      paydayPending: isLoaded && E.isPaydayPending(state, gameTimeMs),
    }),
    [gameTimeMs, state, isLoaded],
  );

  return (
    <EconomyContext.Provider value={economyValue}>
      <GameClockContext.Provider value={clockValue}>{children}</GameClockContext.Provider>
    </EconomyContext.Provider>
  );
};

export const useEconomy = () => {
  const context = useContext(EconomyContext);
  if (!context) throw new Error('useEconomy must be used within EconomyProvider');
  return context;
};

export const useGameClock = () => {
  const context = useContext(GameClockContext);
  if (!context) throw new Error('useGameClock must be used within EconomyProvider');
  return context;
};
