import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Car, GarageCar, Mechanic } from '@/types';
import { calculateBasePrice, calculateMaxCondition } from '../utils/priceCalculator';

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

export const useGarage = (onSellCar?: (amount: number) => void) => {
  const [garage, setGarage] = useState<GarageCar[]>([]);
  const [garageSlots, setGarageSlots] = useState(1);
  const [maxGarageSlots, setMaxGarageSlots] = useState(3); // Максимум слотов на текущем уровне гаража
  const [mechanics, setMechanics] = useState<Mechanic[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialized = useRef(false);

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
    isInitialized.current = false;
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
    if (isLoaded) {
      saveGarageConfig();
    }
  }, [garageSlots, maxGarageSlots, mechanics, isLoaded]);

  const loadGarage = async () => {
    try {
      const saved = await AsyncStorage.getItem(GARAGE_KEY);
      if (saved !== null) {
        const garageData = JSON.parse(saved) as GarageCar[];
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
        const garageSlots = config.garageSlots || 1;
        const maxGarageSlots = config.maxGarageSlots || 3;
        
        setGarageSlots(garageSlots);
        setMaxGarageSlots(maxGarageSlots);
        
        // Обработка старого формата данных (mechanics как число)
        if (typeof config.mechanics === 'number') {
          // Конвертируем старый формат (число) в новый (массив)
          // Создаем массив механиков на основе количества слотов
          const newMechanics: Mechanic[] = [];
          
          for (let i = 0; i < garageSlots; i++) {
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
      isInitialized.current = true;
    } catch (error) {
      console.error('Error loading garage config:', error);
      isInitialized.current = true;
    }
  };

  const saveGarageConfig = async () => {
    try {
      await AsyncStorage.setItem(GARAGE_CONFIG_KEY, JSON.stringify({ garageSlots, maxGarageSlots, mechanics }));
    } catch (error) {
      console.error('Error saving garage config:', error);
    }
  };

  const addCar = useCallback((car: Car) => {
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

    const garageCar: GarageCar = {
      ...car,
      condition: roundedCondition,
      basePrice,
      maxCondition,
    };
    setGarage((prev) => [...prev, garageCar]);
  }, []);

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
          // Добавляем и всегда округляем до одного знака после запятой
          const newCondition = Math.round((car.condition + repairAmount) * 10) / 10;
          // Ограничиваем максимумом, тоже с округлением
          const cappedCondition = Math.min(
            Math.round(car.maxCondition * 10) / 10,
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

  const upgradeGarageSlot = useCallback(() => {
    setMaxGarageSlots((prev) => prev + 3);
  }, []);

  // Синхронизируем количество слотов с максимумом и механиков с количеством слотов
  useEffect(() => {
    // Пропускаем первую инициализацию, включаем только при реальном улучшении
    if (!isInitialized.current) {
      isInitialized.current = true;
      return;
    }
    // Если достигли максимума, добавляем слот
    if (garageSlots < maxGarageSlots) {
      setGarageSlots((prev) => prev + 1);
    }
  }, [maxGarageSlots]);

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

  // Оборачиваем возвращаемый объект в useMemo с зависимостью на все состояния
  const garageState = useMemo(
    () => ({
      garage,
      garageSlots,
      maxGarageSlots,
      mechanics,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      sellCar,
      upgradeGarageSlot,
      upgradeMechanicSkill,
      changeMechanicSlot,
      hireMechanic,
    }),
    [
      garage,
      garageSlots,
      maxGarageSlots,
      mechanics,
      addCar,
      removeCar,
      hasCar,
      repairCar,
      getCar,
      sellCar,
      upgradeGarageSlot,
      upgradeMechanicSkill,
      changeMechanicSlot,
      hireMechanic,
    ]
  );

  return garageState;
};
