import { useState } from 'react';
import type { Car, GarageCar } from '@/types';
import { calculateBasePrice, calculateMaxCondition } from '../utils/priceCalculator';

export const useGarage = (onSellCar?: (amount: number) => void) => {
  const [garage, setGarage] = useState<GarageCar[]>([]);

  const addCar = (car: Car) => {
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
  };

  const removeCar = (carId: string) => {
    setGarage((prev) => prev.filter((car) => car.id !== carId));
  };

  const hasCar = (carId: string) => {
    return garage.some((car) => car.id === carId);
  };

  const repairCar = (carId: string) => {
    setGarage((prev) =>
      prev.map((car) => {
        if (car.id === carId) {
          // Добавляем 0.1 и всегда округляем до одного знака после запятой
          const newCondition = Math.round((car.condition + 0.1) * 10) / 10;
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
  };

  const getCar = (carId: string) => {
    return garage.find((car) => car.id === carId);
  };

  const sellCar = (carId: string, sellPrice: number) => {
    removeCar(carId);
    onSellCar?.(sellPrice);
  };

  return { garage, addCar, removeCar, hasCar, repairCar, getCar, sellCar };
};
