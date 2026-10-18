import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Car, GarageCar, Mechanic } from '@/types';
import { calculateBasePrice, calculateMaxCondition } from '../utils/priceCalculator';
import { DEFAULT_GARAGE_ID, getGarageById, getGarageRank } from '../data/cityBuildings';
import { useEconomy, useGameClock } from '@hooks/EconomyContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';
import { useToast } from '@components/toast/ToastContext';
import { getCarTier } from '@components/CarImage';
import { TIER_ICONS, getMechanicAvatar } from '@img/gameIcons';
import { assetCostCents, toCents, workerSpeedMultiplier } from '../economy/economy';
import { saleXp } from '../economy/progression';
import { formatMoney } from '../economy/format';

/** Ремонт механиком. Время — игровое (мс активной игры), поэтому в фоне и на паузе ремонт стоит. */
export interface MechanicRepairInfo {
  mechanicId: string;
  startCondition: number;
  maxCondition: number;
  startedAtMs: number;
  durationMs: number;
  /** Скорость ремонта (% в секунду) с учётом навыка механика на момент старта/повышения */
  speedPerSec?: number;
  /** Уровень навыка механика, с которым считается текущая скорость */
  skillLevel?: number;
}

/** Выставленная на продажу машина. Время — игровое. */
export interface ActiveSellInfo {
  sellPrice: number;
  boughtPrice: number;
  startedAtMs: number;
  durationMs: number;
}

const GARAGE_KEY = 'game_garage';
const GARAGE_CONFIG_KEY = 'game_garage_config';
/** Базовая скорость ремонта механиком: % состояния в секунду игрового времени (×1 на 1-м уровне навыка) */
const MECHANIC_REPAIR_SPEED = 0.05;
/** Базовая эффективность ручного тапа, % состояния (умножается на навык игрока) */
const PLAYER_TAP_REPAIR = 0.1;

const MECHANIC_NAMES = [
  'Иван',
  'Сергей',
  'Дмитрий',
  'Петр',
  'Анатолий',
  'Владимир',
  'Алексей',
  'Юрий',
  'Николай',
  'Валентин',
];

const repairConditionAt = (repair: MechanicRepairInfo, now: number): number => {
  const elapsedSec = Math.max(0, now - repair.startedAtMs) / 1000;
  const speed = repair.speedPerSec ?? MECHANIC_REPAIR_SPEED;
  const condition = Math.round((repair.startCondition + elapsedSec * speed) * 100) / 100;
  return Math.min(repair.maxCondition, condition);
};

const progressAt = (startedAtMs: number, durationMs: number, now: number): number =>
  durationMs <= 0 ? 100 : Math.min(100, Math.max(0, ((now - startedAtMs) / durationMs) * 100));

const without = <T,>(record: Record<string, T>, key: string): Record<string, T> => {
  const { [key]: _removed, ...rest } = record;
  return rest;
};

export const useGarage = () => {
  const economy = useEconomy();
  const { gameTimeMs } = useGameClock();
  const { markAsSold } = useSoldCarsContext();
  const { showToast } = useToast();

  // Машины как они сохранены; во время ремонта состояние машины вычисляется из времени
  const [storedGarage, setGarage] = useState<GarageCar[]>([]);
  // Активный гараж игрока. Гаражи с меньшим рангом считаются неактивными (см. cityBuildings.ts)
  const [garageId, setGarageId] = useState(DEFAULT_GARAGE_ID);
  const garageSlots = getGarageById(garageId)?.slots ?? 1;
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const reconciledRef = useRef(false);

  // Ремонты и продажи хранятся вместе с гаражом и продолжаются после перезапуска
  const [mechanicRepairs, setMechanicRepairs] = useState<Record<string, MechanicRepairInfo>>({});
  const [activeSells, setActiveSells] = useState<Record<string, ActiveSellInfo>>({});

  const generateMechanicName = (): string => {
    const randomIndex = Math.floor(Math.random() * MECHANIC_NAMES.length);
    return MECHANIC_NAMES[randomIndex];
  };

  const generateMechanicId = (): string => {
    return `mechanic_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Загружаем гараж при монтировании
  useEffect(() => {
    loadGarage();
    loadGarageConfig();
  }, []);

  // Сохраняем гараж при изменении
  useEffect(() => {
    if (isLoaded) {
      saveGarage(storedGarage);
    }
  }, [storedGarage, isLoaded]);

  // Сохраняем конфиг гаража при изменении
  useEffect(() => {
    if (isConfigLoaded) {
      saveGarageConfig();
    }
  }, [garageId, mechanics, mechanicRepairs, activeSells, isConfigLoaded]);

  // Машины вне диапазона слотов активного гаража (старые сохранения) переставляем в свободные слоты
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded) return;
    setGarage((prev) => {
      if (!prev.some((c) => c.slotIndex >= garageSlots)) return prev;
      const used = new Set(prev.filter((c) => c.slotIndex >= 0 && c.slotIndex < garageSlots).map((c) => c.slotIndex));
      return prev.map((car) => {
        if (car.slotIndex < garageSlots) return car;
        let free = -1;
        for (let i = 0; i < garageSlots; i++) {
          if (!used.has(i)) { free = i; break; }
        }
        if (free !== -1) used.add(free);
        return { ...car, slotIndex: free };
      });
    });
  }, [isLoaded, isConfigLoaded, garageSlots]);

  const loadGarage = async () => {
    try {
      const saved = await AsyncStorage.getItem(GARAGE_KEY);
      if (saved !== null) {
        let garageData = JSON.parse(saved) as GarageCar[];
        // Добавляем slotIndex для старых машин, если его нет
        garageData = garageData.map((car) => ({
          ...car,
          slotIndex: car.slotIndex !== undefined ? car.slotIndex : -1,
        }));
        setGarage(garageData);
      }
    } catch (error) {
      console.error('Error loading garage:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveGarage = async (garageData: GarageCar[]) => {
    try {
      await AsyncStorage.setItem(GARAGE_KEY, JSON.stringify(garageData));
    } catch (error) {
      console.error('Error saving garage:', error);
    }
  };

  const loadGarageConfig = async () => {
    try {
      const saved = await AsyncStorage.getItem(GARAGE_CONFIG_KEY);
      if (saved !== null) {
        const config = JSON.parse(saved);

        let loadedGarageId: string;
        if (typeof config.garageId === 'string' && getGarageById(config.garageId)) {
          loadedGarageId = config.garageId;
        } else if (Array.isArray(config.ownedGarageIds) && config.ownedGarageIds.length > 0) {
          // Формат с несколькими гаражами: активным становится самый крутой из купленных
          loadedGarageId = config.ownedGarageIds.reduce(
            (best: string, id: string) => (getGarageRank(id) > getGarageRank(best) ? id : best),
            DEFAULT_GARAGE_ID,
          );
        } else if ((config.garageSlots || 1) > 1) {
          // Старый формат (апгрейд слотов до 3): выдаём Гараж 2, чтобы машины во 2-м слоте не потерялись
          loadedGarageId = 'garage_2';
        } else {
          loadedGarageId = DEFAULT_GARAGE_ID;
        }
        setGarageId(loadedGarageId);
        const slotsCount = getGarageById(loadedGarageId)?.slots ?? 1;

        // Обработка старого формата данных (mechanics как число)
        if (typeof config.mechanics === 'number') {
          // Конвертируем старый формат (число) в новый (массив)
          // Создаем массив механиков на основе количества слотов
          const newMechanics: Mechanic[] = [];

          for (let i = 0; i < slotsCount; i++) {
            newMechanics.push({
              id: generateMechanicId(),
              name: generateMechanicName(),
              slotIndex: -1,
              skillLevel: 1,
              experience: 0,
              hired: false,
            });
          }

          setMechanics(newMechanics);
        } else if (Array.isArray(config.mechanics)) {
          const updatedMechanics = config.mechanics.map((m: any) => ({
            ...m,
            hired: m.hired !== undefined ? m.hired : false,
          }));
          setMechanics(updatedMechanics);
        } else {
          setMechanics([]);
        }

        // Ремонты и продажи старого формата (на реальных часах) не переносим — они не сохранялись
        const isGameTimeRecord = (r: any) => r && typeof r.startedAtMs === 'number' && typeof r.durationMs === 'number';
        if (config.mechanicRepairs && typeof config.mechanicRepairs === 'object') {
          setMechanicRepairs(
            Object.fromEntries(Object.entries(config.mechanicRepairs).filter(([, r]) => isGameTimeRecord(r))) as Record<
              string,
              MechanicRepairInfo
            >,
          );
        }
        if (config.activeSells && typeof config.activeSells === 'object') {
          setActiveSells(
            Object.fromEntries(Object.entries(config.activeSells).filter(([, r]) => isGameTimeRecord(r))) as Record<
              string,
              ActiveSellInfo
            >,
          );
        }
      }
    } catch (error) {
      console.error('Error loading garage config:', error);
    } finally {
      setIsConfigLoaded(true);
    }
  };

  const saveGarageConfig = async () => {
    try {
      await AsyncStorage.setItem(
        GARAGE_CONFIG_KEY,
        JSON.stringify({ garageId, mechanics, mechanicRepairs, activeSells }),
      );
    } catch (error) {
      console.error('Error saving garage config:', error);
    }
  };

  // ─── Живое состояние машин и прогресс по игровому времени ──────────
  const garage = useMemo(
    () =>
      storedGarage.map((car) => {
        const repair = mechanicRepairs[car.id];
        return repair ? { ...car, condition: repairConditionAt(repair, gameTimeMs) } : car;
      }),
    [storedGarage, mechanicRepairs, gameTimeMs],
  );

  const { mechanicRepairsProgress, mechanicRepairsCondition, mechanicRepairsRemaining } = useMemo(() => {
    const progress: Record<string, number> = {};
    const condition: Record<string, number> = {};
    const remaining: Record<string, number> = {};
    for (const [carId, r] of Object.entries(mechanicRepairs)) {
      progress[carId] = progressAt(r.startedAtMs, r.durationMs, gameTimeMs);
      condition[carId] = repairConditionAt(r, gameTimeMs);
      remaining[carId] = Math.max(0, r.startedAtMs + r.durationMs - gameTimeMs);
    }
    return { mechanicRepairsProgress: progress, mechanicRepairsCondition: condition, mechanicRepairsRemaining: remaining };
  }, [mechanicRepairs, gameTimeMs]);

  const { activeSellsProgress, activeSellsRemaining } = useMemo(() => {
    const progress: Record<string, number> = {};
    const remaining: Record<string, number> = {};
    for (const [carId, sell] of Object.entries(activeSells)) {
      progress[carId] = progressAt(sell.startedAtMs, sell.durationMs, gameTimeMs);
      remaining[carId] = Math.max(0, sell.startedAtMs + sell.durationMs - gameTimeMs);
    }
    return { activeSellsProgress: progress, activeSellsRemaining: remaining };
  }, [activeSells, gameTimeMs]);

  // ─── Машины ───────────────────────────────────────────────────────
  const addCar = useCallback((car: Car, slotIndex?: number) => {
    // Вычисляем базовую цену (цену при состоянии 100%) от рыночной стоимости, а не от цены покупки
    const basePrice = calculateBasePrice(car.marketPrice ?? car.price, {
      year: car.year,
      mileage: car.mileage,
      condition: car.condition,
    });

    // Вычисляем максимальное состояние и округляем до одного знака
    const maxConditionRaw = calculateMaxCondition(car.year, car.mileage);
    const maxCondition = Math.round(maxConditionRaw * 10) / 10;

    // Округляем исходное состояние до одного знака для точности
    const roundedCondition = Math.round(car.condition * 10) / 10;

    setGarage((prevGarage) => {
      // Определяем слот для машины
      let assignedSlot = slotIndex;

      // Если слот не передан или он занят, ищем первый свободный
      if (assignedSlot === undefined || prevGarage.some((c) => c.slotIndex === assignedSlot)) {
        for (let i = 0; i < garageSlots; i++) {
          if (!prevGarage.some((c) => c.slotIndex === i)) {
            assignedSlot = i;
            break;
          }
        }
      }

      const garageCar: GarageCar = {
        ...car,
        condition: roundedCondition,
        basePrice,
        maxCondition,
        slotIndex: assignedSlot!, // Назначаем выбранный или первый свободный слот
      };
      return [...prevGarage, garageCar];
    });

    // Покупка проходит через гараж и с авторынка, и из автосалона — уведомление на любом экране
    const tier = getCarTier(car);
    showToast({
      title: `${car.name} куплен`,
      message: `Заплачено ${formatMoney(toCents(car.price))} · состояние ${roundedCondition}% из ${maxCondition}%`,
      icon: tier ? TIER_ICONS[tier] : undefined,
    });
  }, [garageSlots, showToast]);

  const removeCar = useCallback((carId: string) => {
    setGarage((prev) => prev.filter((car) => car.id !== carId));
  }, []);

  const hasCar = useCallback((carId: string) => garage.some((car) => car.id === carId), [garage]);

  /**
   * Ручной тап «Ремонт». Успешный тап (машина есть, не на максимуме, не у механика и не продаётся)
   * чинит на 0,1% × навык игрока и даёт ровно 1 практику. Первое полное восстановление — бонус XP.
   */
  const repairCar = useCallback((carId: string): boolean => {
    const car = storedGarage.find((c) => c.id === carId);
    if (!car || mechanicRepairs[carId] || activeSells[carId] || car.condition >= car.maxCondition) return false;

    const repairAmount = PLAYER_TAP_REPAIR * economy.playerTapMultiplier;
    // Точность до тысячных: +5% навыка не теряются при округлении
    const newCondition = Math.min(
      Math.round(car.maxCondition * 1000) / 1000,
      Math.round((car.condition + repairAmount) * 1000) / 1000,
    );
    setGarage((prev) => prev.map((c) => (c.id === carId ? { ...c, condition: newCondition } : c)));
    economy.recordPlayerTap();
    if (newCondition >= car.maxCondition) economy.awardFullRepair(carId);
    return true;
  }, [storedGarage, mechanicRepairs, activeSells, economy]);

  const getCar = useCallback((carId: string) => garage.find((car) => car.id === carId), [garage]);

  /**
   * Покупка более крутого гаража: он становится активным, машины и механики
   * переезжают в него (индексы слотов сохраняются — в новом гараже мест не меньше).
   * Списание денег и проверка уровня — на вызывающей стороне.
   */
  const buyGarage = useCallback((newGarageId: string) => {
    setGarageId((prev) => (getGarageRank(newGarageId) > getGarageRank(prev) ? newGarageId : prev));
  }, []);

  // Синхронизируем количество механиков с количеством слотов
  useEffect(() => {
    setMechanics((prevMechanics) => {
      let updatedMechanics = [...prevMechanics];

      // Если слотов больше, добавляем новых механиков
      while (updatedMechanics.length < garageSlots) {
        const newMechanic: Mechanic = {
          id: generateMechanicId(),
          name: generateMechanicName(),
          slotIndex: -1,
          skillLevel: 1,
          experience: 0,
          hired: false,
        };
        updatedMechanics.push(newMechanic);
      }

      // Если слотов меньше, удаляем лишних механиков
      if (updatedMechanics.length > garageSlots) {
        updatedMechanics = updatedMechanics.slice(0, garageSlots);
      }

      return updatedMechanics;
    });
  }, [garageSlots]);

  // ─── Механики ─────────────────────────────────────────────────────
  const changeMechanicSlot = useCallback((mechanicId: string, newSlotIndex: number): boolean => {
    // Разрешаем -1 для открепления и 0-garageSlots для прикрепления
    if (newSlotIndex !== -1 && (newSlotIndex < 0 || newSlotIndex >= garageSlots)) return false;

    setMechanics((prev) =>
      prev.map((m) => {
        if (m.id === mechanicId) {
          return { ...m, slotIndex: newSlotIndex };
        }
        return m;
      })
    );
    return true;
  }, [garageSlots]);

  /** Наём открывает трудовой контракт: зарплата начисляется с этого момента */
  const hireMechanic = useCallback((mechanicId: string): boolean => {
    const mechanic = mechanics.find((m) => m.id === mechanicId);
    if (!mechanic || mechanic.hired) return false;

    economy.hireMechanic(mechanicId);
    setMechanics((prev) =>
      prev.map((m) => (m.id === mechanicId ? { ...m, hired: true } : m))
    );
    return true;
  }, [mechanics, economy]);

  /** Останавливает ремонт и сохраняет уже достигнутое состояние машины */
  const stopRepair = useCallback((carId: string, repair: MechanicRepairInfo, now: number) => {
    const reached = repairConditionAt(repair, now);
    setGarage((prev) => prev.map((car) => (car.id === carId ? { ...car, condition: reached } : car)));
    setMechanicRepairs((prev) => without(prev, carId));
  }, []);

  /**
   * Увольнение: расчёт (долг по зарплате + оклад) через экономику, затем механик
   * освобождает слот, а его прокачка сбрасывается — повторный наём начинается с нуля.
   */
  const fireMechanic = useCallback((mechanicId: string): boolean => {
    if (!economy.fireMechanic(mechanicId)) return false;
    const now = economy.getNow();
    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      if (repair.mechanicId === mechanicId) stopRepair(carId, repair, now);
    }
    setMechanics((prev) =>
      prev.map((m) =>
        m.id === mechanicId ? { ...m, hired: false, slotIndex: -1, skillLevel: 1, experience: 0 } : m,
      ),
    );
    return true;
  }, [economy, mechanicRepairs, stopRepair]);

  const changeCarSlot = useCallback((carId: string, newSlotIndex: number): boolean => {
    // Проверяем, что слот в допустимом диапазоне
    if (newSlotIndex !== -1 && (newSlotIndex < 0 || newSlotIndex >= garageSlots)) return false;

    // Проверяем, что в целевом слоте нет другой машины
    if (newSlotIndex !== -1) {
      const carInSlot = garage.find((car) => car.slotIndex === newSlotIndex && car.id !== carId);
      if (carInSlot) return false;
    }

    setGarage((prev) =>
      prev.map((car) => {
        if (car.id === carId) {
          return { ...car, slotIndex: newSlotIndex };
        }
        return car;
      })
    );
    return true;
  }, [garage, garageSlots]);

  // ─── Ремонт механиком ─────────────────────────────────────────────
  const startMechanicRepair = useCallback((carId: string, mechanicId: string) => {
    const car = storedGarage.find((c) => c.id === carId);
    if (!car || car.condition >= car.maxCondition || mechanicRepairs[carId]) return;

    const now = economy.getNow();
    const contract = economy.state.contracts[mechanicId];
    const speedPerSec = MECHANIC_REPAIR_SPEED * workerSpeedMultiplier(contract);
    const improvementNeeded = car.maxCondition - car.condition;
    const durationMs = Math.ceil((improvementNeeded / speedPerSec) * 1000);

    economy.setMechanicBusy(mechanicId, true, now);
    setMechanicRepairs((prev) => ({
      ...prev,
      [carId]: {
        mechanicId,
        startCondition: car.condition,
        maxCondition: car.maxCondition,
        startedAtMs: now,
        durationMs,
        speedPerSec,
        skillLevel: contract?.skill.level ?? 1,
      },
    }));
  }, [storedGarage, mechanicRepairs, economy]);

  const cancelMechanicRepair = useCallback((carId: string) => {
    const repair = mechanicRepairs[carId];
    if (!repair) return;
    const now = economy.getNow();
    stopRepair(carId, repair, now);
    economy.setMechanicBusy(repair.mechanicId, false, now);
    changeMechanicSlot(repair.mechanicId, -1);
  }, [mechanicRepairs, economy, stopRepair, changeMechanicSlot]);

  // ─── Продажа ──────────────────────────────────────────────────────
  const startSell = useCallback((carId: string, sellPrice: number, duration: number) => {
    const car = storedGarage.find((c) => c.id === carId);
    if (!car || activeSells[carId]) return;
    setActiveSells((prev) => ({
      ...prev,
      [carId]: {
        sellPrice,
        boughtPrice: car.price,
        startedAtMs: economy.getNow(),
        durationMs: Math.max(0, Math.round(duration)),
      },
    }));
  }, [storedGarage, activeSells, economy]);

  const cancelSell = useCallback((carId: string) => {
    setActiveSells((prev) => without(prev, carId));
  }, []);

  // ─── Завершение ремонтов и продаж по игровому времени ─────────────
  useEffect(() => {
    if (!isLoaded || !isConfigLoaded || !economy.isLoaded) return;

    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      const finishedAt = repair.startedAtMs + repair.durationMs;
      if (gameTimeMs < finishedAt) continue;
      setGarage((prev) => prev.map((car) => (car.id === carId ? { ...car, condition: repair.maxCondition } : car)));
      setMechanicRepairs((prev) => without(prev, carId));
      economy.setMechanicBusy(repair.mechanicId, false, finishedAt);
      economy.recordMechanicJob(repair.mechanicId);
      economy.awardFullRepair(carId);
      changeMechanicSlot(repair.mechanicId, -1);

      // Два уведомления на любом экране: механик освободился и машина готова
      const mechanicName = mechanics.find((m) => m.id === repair.mechanicId)?.name ?? 'Механик';
      const car = storedGarage.find((c) => c.id === carId);
      const tier = car ? getCarTier(car) : undefined;
      showToast({
        title: `${mechanicName} закончил работу`,
        message: 'Теперь он бездействует — назначьте его на следующую машину.',
        icon: getMechanicAvatar(repair.mechanicId),
      });
      showToast({
        title: `${car?.name ?? 'Автомобиль'} готов`,
        message: `Отремонтирован до ${repair.maxCondition}% — можно продавать.`,
        icon: tier ? TIER_ICONS[tier] : undefined,
        tone: 'success',
      });
    }

    for (const [carId, sell] of Object.entries(activeSells)) {
      if (gameTimeMs < sell.startedAtMs + sell.durationMs) continue;
      const car = storedGarage.find((c) => c.id === carId);
      setActiveSells((prev) => without(prev, carId));
      if (!car) continue;
      // Экономика запоминает продажу по id машины: повтор после перезапуска не начислит ни деньги, ни XP
      const alreadyRecorded = economy.state.processedOps.includes(`sale:${carId}`);
      const asset = economy.state.assets[carId];
      economy.recordCarSale(car, sell.sellPrice);
      markAsSold(carId);
      removeCar(carId);

      if (!alreadyRecorded) {
        const priceCents = toCents(sell.sellPrice);
        const costCents = asset ? assetCostCents(asset) : toCents(car.price);
        const profitCents = priceCents - costCents;
        const tier = asset?.tier ?? getCarTier(car);
        const xp = saleXp(tier, priceCents, asset ? asset.purchaseCents : toCents(car.price), asset?.extraCostsCents ?? 0);
        showToast({
          title: `${car.name} продан за ${formatMoney(priceCents)}`,
          message: `${profitCents >= 0 ? 'Прибыль' : 'Убыток'} ${formatMoney(profitCents, { sign: true })}${xp > 0 ? ` · +${xp} XP` : ''}`,
          icon: tier ? TIER_ICONS[tier] : undefined,
          tone: profitCents > 0 ? 'success' : 'info',
        });
      }
    }
  }, [gameTimeMs, isLoaded, isConfigLoaded]);

  // ─── Механик повысил навык во время ремонта: с момента повышения — новая скорость ──
  useEffect(() => {
    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      const contract = economy.state.contracts[repair.mechanicId];
      if (!contract || contract.skill.level === (repair.skillLevel ?? 1)) continue;
      const at = Math.min(gameTimeMs, Math.max(repair.startedAtMs, contract.levelChangedAtMs));
      const reached = repairConditionAt(repair, at);
      const speedPerSec = MECHANIC_REPAIR_SPEED * workerSpeedMultiplier(contract);
      setMechanicRepairs((prev) =>
        prev[carId] === repair
          ? {
              ...prev,
              [carId]: {
                ...repair,
                startCondition: reached,
                startedAtMs: at,
                speedPerSec,
                skillLevel: contract.skill.level,
                durationMs: Math.ceil((Math.max(0, repair.maxCondition - reached) / speedPerSec) * 1000),
              },
            }
          : prev,
      );
    }
  }, [economy.state.contracts, mechanicRepairs, gameTimeMs]);

  // ─── Сверка с экономикой после загрузки (и перенос старых сохранений) ──
  useEffect(() => {
    if (reconciledRef.current || !isLoaded || !isConfigLoaded || !economy.isLoaded) return;
    reconciledRef.current = true;

    let employed: Set<string>;
    if (!economy.state.contractsMigrated) {
      // Сохранение до финансовой системы: нанятые механики получают контракт с текущего момента
      const hiredIds = mechanics.filter((m) => m.hired).map((m) => m.id);
      economy.migrateContracts(hiredIds);
      employed = new Set(hiredIds);
    } else {
      // Контракт — единственный признак работы в штате. Нет контракта — механик не нанят и без прокачки.
      employed = new Set(Object.keys(economy.state.contracts));
      setMechanics((prev) =>
        prev.map((m) => {
          const isEmployed = employed.has(m.id);
          if (isEmployed === m.hired) return m;
          return isEmployed
            ? { ...m, hired: true }
            : { ...m, hired: false, slotIndex: -1, skillLevel: 1, experience: 0 };
        }),
      );
    }

    // Ремонт без механика в штате прекращаем; занятость механиков синхронизируем с ремонтами
    const now = economy.getNow();
    const busy = new Set<string>();
    for (const [carId, repair] of Object.entries(mechanicRepairs)) {
      if (employed.has(repair.mechanicId)) busy.add(repair.mechanicId);
      else stopRepair(carId, repair, now);
    }
    for (const id of employed) economy.setMechanicBusy(id, busy.has(id), now);

    // Контракты до системы навыков: уровень берётся из прежней прокачки механика (не выше 20)
    for (const m of mechanics) {
      if (employed.has(m.id)) economy.initLegacyWorkerSkill(m.id, Math.min(20, m.skillLevel || 1));
    }

    // Машины из старых сохранений становятся активами по цене покупки
    economy.ensureAssets(storedGarage);
  }, [isLoaded, isConfigLoaded, economy.isLoaded]);

  const staffMechanics = useMemo(
    () =>
      mechanics.map((m) => {
        const contract = economy.state.contracts[m.id];
        return { ...m, skillLevel: contract ? contract.skill.level : 1 };
      }),
    [mechanics, economy.state.contracts],
  );

  return useMemo(
    () => ({
      garage,
      garageSlots,
      garageId,
      mechanics: staffMechanics,
      mechanicRepairs,
      mechanicRepairsProgress,
      mechanicRepairsCondition,
      mechanicRepairsRemaining,
      activeSells,
      activeSellsProgress,
      activeSellsRemaining,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      changeCarSlot,
      buyGarage,
      changeMechanicSlot,
      hireMechanic,
      fireMechanic,
      startMechanicRepair,
      cancelMechanicRepair,
      startSell,
      cancelSell,
    }),
    [
      garage,
      garageSlots,
      garageId,
      staffMechanics,
      mechanicRepairs,
      mechanicRepairsProgress,
      mechanicRepairsCondition,
      mechanicRepairsRemaining,
      activeSells,
      activeSellsProgress,
      activeSellsRemaining,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      changeCarSlot,
      buyGarage,
      changeMechanicSlot,
      hireMechanic,
      fireMechanic,
      startMechanicRepair,
      cancelMechanicRepair,
      startSell,
      cancelSell,
    ],
  );
};

export type GarageState = ReturnType<typeof useGarage>;
