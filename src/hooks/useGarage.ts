import { useState, useMemo, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Car, GarageCar, Mechanic } from '@/types';
import { calculateBasePrice, calculateMaxCondition } from '../utils/priceCalculator';
import { DEFAULT_GARAGE_ID, getGarageById, getGarageRank } from '../data/cityBuildings';

export interface MechanicRepairInfo {
  timerId: string;
  mechanicId: string;
  startCondition: number;
  maxCondition: number;
  startTime: number;
}

export interface ActiveSellInfo {
  timerId: string;
  sellPrice: number;
  duration: number;
}

export interface GarageCallbacks {
  addTimer: (timer: any, duration: number) => string;
  removeTimer: (id: string) => void;
  getProgress: (id: string) => number;
  addExperience: (amount: number) => void;
  addBalance: (amount: number) => void;
  markAsSold: (carId: string) => void;
}

const GARAGE_KEY = 'game_garage';
const GARAGE_CONFIG_KEY = 'game_garage_config';

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

export const useGarage = (onSellCar?: (amount: number) => void, callbacks?: GarageCallbacks) => {
  const [garage, setGarage] = useState<GarageCar[]>([]);
  // Активный гараж игрока. Гаражи с меньшим рангом считаются неактивными (см. cityBuildings.ts)
  const [garageId, setGarageId] = useState(DEFAULT_GARAGE_ID);
  const garageSlots = getGarageById(garageId)?.slots ?? 1;
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);

  // ─── Mechanic repair state (persists across screen switches) ────────
  const [mechanicRepairs, setMechanicRepairs] = useState<Record<string, MechanicRepairInfo>>({});
  const [mechanicRepairsProgress, setMechanicRepairsProgress] = useState<Record<string, number>>({});
  const [mechanicRepairsCondition, setMechanicRepairsCondition] = useState<Record<string, number>>({});

  // ─── Active sells state (persists across screen switches) ──────────
  const [activeSells, setActiveSells] = useState<Record<string, ActiveSellInfo>>({});
  const [activeSellsProgress, setActiveSellsProgress] = useState<Record<string, number>>({});

  // Helper functions for generating mechanic data
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
      saveGarage(garage);
    }
  }, [garage, isLoaded]);

  // Сохраняем конфиг гаража при изменении
  useEffect(() => {
    if (isConfigLoaded) {
      saveGarageConfig();
    }
  }, [garageId, mechanics, isConfigLoaded]);

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
      }
    } catch (error) {
      console.error('Error loading garage config:', error);
    } finally {
      setIsConfigLoaded(true);
    }
  };

  const saveGarageConfig = async () => {
    try {
      await AsyncStorage.setItem(GARAGE_CONFIG_KEY, JSON.stringify({ garageId, mechanics }));
    } catch (error) {
      console.error('Error saving garage config:', error);
    }
  };

  const addCar = useCallback((car: Car, slotIndex?: number) => {
    // Вычисляем базовую цену (цену при состоянии 100%)
    const basePrice = calculateBasePrice(car.price, {
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
  }, [garageSlots]);

  const removeCar = useCallback((carId: string) => {
    setGarage((prev) => {
      const filtered = prev.filter((car) => car.id !== carId);
      return filtered;
    });
  }, []);

  const hasCar = useCallback((carId: string) => {
    const has = garage.some((car) => car.id === carId);
    return has;
  }, [garage]);

  const repairCar = useCallback((carId: string, skillMultiplier: number = 1) => {
    setGarage((prev) =>
      prev.map((car) => {
        if (car.id === carId) {
          // Базовый ремонт 0.1%, умноженный на множитель скилла (уровень механика)
          const repairAmount = 0.1 * skillMultiplier;
          // Добавляем и округляем до трёх знаков после запятой (чтобы малые приращения не терялись)
          const newCondition = Math.round((car.condition + repairAmount) * 1000) / 1000;
          // Ограничиваем максимумом, тоже с округлением
          const cappedCondition = Math.min(
            Math.round(car.maxCondition * 1000) / 1000,
            newCondition
          );
          return { ...car, condition: cappedCondition };
        }
        return car;
      })
    );
  }, []);

  const getCar = useCallback((carId: string) => {
    return garage.find((car) => car.id === carId);
  }, [garage]);

  const sellCar = useCallback((carId: string, sellPrice: number) => {
    removeCar(carId);
    onSellCar?.(sellPrice);
  }, [removeCar, onSellCar]);

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

  const upgradeMechanicSkill = useCallback((mechanicId: string): boolean => {
    const mechanic = mechanics.find((m) => m.id === mechanicId);
    if (!mechanic) return false;

    setMechanics((prev) =>
      prev.map((m) => {
        if (m.id === mechanicId) {
          return {
            ...m,
            skillLevel: m.skillLevel + 1,
            experience: m.experience + 100,
          };
        }
        return m;
      })
    );
    return true;
  }, [mechanics]);

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

  const hireMechanic = useCallback((mechanicId: string): boolean => {
    const mechanic = mechanics.find((m) => m.id === mechanicId);
    if (!mechanic || mechanic.hired) return false;

    setMechanics((prev) =>
      prev.map((m) => {
        if (m.id === mechanicId) {
          return { ...m, hired: true };
        }
        return m;
      })
    );
    return true;
  }, [mechanics]);

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

  // ─── Mechanic repair effects ──────────────────────────────────────────

  // Update progress & visual condition for active repairs
  useEffect(() => {
    if (Object.keys(mechanicRepairs).length === 0 || !callbacks) {
      setMechanicRepairsProgress({});
      setMechanicRepairsCondition({});
      return;
    }

    const interval = setInterval(() => {
      const newProgress: Record<string, number> = {};
      const newCondition: Record<string, number> = {};

      Object.entries(mechanicRepairs).forEach(([carId, repair]) => {
        newProgress[carId] = callbacks.getProgress(repair.timerId);
        const elapsedSeconds = (Date.now() - repair.startTime) / 1000;
        const repairAmount = elapsedSeconds * 0.05;
        const currentCondition = Math.round((repair.startCondition + repairAmount) * 100) / 100;
        newCondition[carId] = Math.min(repair.maxCondition, currentCondition);
      });

      setMechanicRepairsProgress(newProgress);
      setMechanicRepairsCondition(newCondition);
    }, 50);

    return () => clearInterval(interval);
  }, [mechanicRepairs, callbacks]);

  // Actually apply repair ticks every 500ms
  useEffect(() => {
    if (Object.keys(mechanicRepairs).length === 0) return;

    const interval = setInterval(() => {
      Object.keys(mechanicRepairs).forEach((carId) => {
        repairCar(carId, 0.25);
      });
    }, 500);

    return () => clearInterval(interval);
  }, [mechanicRepairs, repairCar]);

  // Check if car reached max condition => finish repair
  useEffect(() => {
    if (!callbacks) return;

    Object.keys(mechanicRepairs).forEach((carId) => {
      const repair = mechanicRepairs[carId];
      if (!repair) return;

      const currentCar = garage.find((c) => c.id === carId);
      if (currentCar && currentCar.condition >= currentCar.maxCondition) {
        callbacks.removeTimer(repair.timerId);
        changeMechanicSlot(repair.mechanicId, -1);

        setMechanicRepairs((prev) => {
          const updated = { ...prev };
          delete updated[carId];
          return updated;
        });
        setMechanicRepairsProgress((prev) => {
          const updated = { ...prev };
          delete updated[carId];
          return updated;
        });
      }
    });
  }, [garage, mechanicRepairs, callbacks, changeMechanicSlot]);

  // Start mechanic repair
  const startMechanicRepair = useCallback((carId: string, mechanicId: string) => {
    if (!callbacks) return;

    const car = garage.find((c) => c.id === carId);
    if (!car || car.condition >= car.maxCondition) return;

    const improvementNeeded = car.maxCondition - car.condition;
    const repairSpeedPerSecond = 0.05;
    const durationSeconds = improvementNeeded / repairSpeedPerSecond;
    const durationMs = durationSeconds * 1000;

    const timerId = callbacks.addTimer(
      {
        type: 'repair' as const,
        duration: durationMs,
        onComplete: () => {
          changeMechanicSlot(mechanicId, -1);
          setMechanicRepairs((prev) => {
            const updated = { ...prev };
            delete updated[carId];
            return updated;
          });
          setMechanicRepairsProgress((prev) => {
            const updated = { ...prev };
            delete updated[carId];
            return updated;
          });
        },
        metadata: { carId, mechanicId },
      },
      durationMs,
    );

    setMechanicRepairs((prev) => ({
      ...prev,
      [carId]: {
        timerId,
        mechanicId,
        startCondition: car.condition,
        maxCondition: car.maxCondition,
        startTime: Date.now(),
      },
    }));
  }, [garage, callbacks, changeMechanicSlot]);

  // Cancel mechanic repair
  const cancelMechanicRepair = useCallback((carId: string) => {
    if (!callbacks) return;

    const repair = mechanicRepairs[carId];
    if (!repair) return;

    callbacks.removeTimer(repair.timerId);
    changeMechanicSlot(repair.mechanicId, -1);

    setMechanicRepairs((prev) => {
      const updated = { ...prev };
      delete updated[carId];
      return updated;
    });
    setMechanicRepairsProgress((prev) => {
      const updated = { ...prev };
      delete updated[carId];
      return updated;
    });
  }, [mechanicRepairs, callbacks, changeMechanicSlot]);

  // ─── Active sells effects ──────────────────────────────────────────

  // Update sell progress
  useEffect(() => {
    if (Object.keys(activeSells).length === 0 || !callbacks) {
      setActiveSellsProgress({});
      return;
    }

    const interval = setInterval(() => {
      const newProgress: Record<string, number> = {};
      Object.entries(activeSells).forEach(([carId, sell]) => {
        newProgress[carId] = callbacks.getProgress(sell.timerId);
      });
      setActiveSellsProgress(newProgress);
    }, 50);

    return () => clearInterval(interval);
  }, [activeSells, callbacks]);

  // Start sell
  const startSell = useCallback((carId: string, sellPrice: number, duration: number) => {
    if (!callbacks) return;

    // Capture boughtPrice before the car is removed
    const car = garage.find((c) => c.id === carId);
    const boughtPrice = car?.price ?? sellPrice;

    const timerId = callbacks.addTimer(
      {
        type: 'sell' as const,
        duration,
        onComplete: () => {
          // Sell the car, add balance, mark as sold
          sellCar(carId, sellPrice);
          callbacks.addBalance(sellPrice);
          callbacks.markAsSold(carId);

          // Add XP equal to profit percentage
          const profitPercent = Math.round(((sellPrice - boughtPrice) / boughtPrice) * 100);
          if (profitPercent > 0) {
            callbacks.addExperience(profitPercent);
          }

          setActiveSells((prev) => {
            const updated = { ...prev };
            delete updated[carId];
            return updated;
          });
          setActiveSellsProgress((prev) => {
            const updated = { ...prev };
            delete updated[carId];
            return updated;
          });
        },
        metadata: { carId, sellPrice },
      },
      duration,
    );

    setActiveSells((prev) => ({
      ...prev,
      [carId]: { timerId, sellPrice, duration },
    }));
  }, [callbacks, sellCar]);

  // Cancel sell
  const cancelSell = useCallback((carId: string) => {
    if (!callbacks) return;

    const activeSell = activeSells[carId];
    if (!activeSell) return;

    callbacks.removeTimer(activeSell.timerId);

    setActiveSells((prev) => {
      const updated = { ...prev };
      delete updated[carId];
      return updated;
    });
    setActiveSellsProgress((prev) => {
      const updated = { ...prev };
      delete updated[carId];
      return updated;
    });
  }, [activeSells, callbacks]);

  // Оборачиваем возвращаемый объект в useMemo с зависимостью на все состояния
  const garageState = useMemo(
    () => ({
      garage,
      garageSlots,
      garageId,
      mechanics,
      mechanicRepairs,
      mechanicRepairsProgress,
      mechanicRepairsCondition,
      activeSells,
      activeSellsProgress,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      sellCar,
      changeCarSlot,
      buyGarage,
      upgradeMechanicSkill,
      changeMechanicSlot,
      hireMechanic,
      startMechanicRepair,
      cancelMechanicRepair,
      startSell,
      cancelSell,
    }),
    [
      garage,
      garageSlots,
      garageId,
      mechanics,
      mechanicRepairs,
      mechanicRepairsProgress,
      mechanicRepairsCondition,
      activeSells,
      activeSellsProgress,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      sellCar,
      changeCarSlot,
      buyGarage,
      upgradeMechanicSkill,
      changeMechanicSlot,
      hireMechanic,
      startMechanicRepair,
      cancelMechanicRepair,
      startSell,
      cancelSell,
    ]
  );

  return garageState;
};
