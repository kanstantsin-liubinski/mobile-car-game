import { useState } from 'react';
import type { Car, GarageCar } from '@/types';

export const useGarage = () => {
  const [garage, setGarage] = useState<GarageCar[]>([]);

  const addCar = (car: Car) => {
    const garageCar: GarageCar = {
      ...car,
      condition: 100,
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
      prev.map((car) =>
        car.id === carId
          ? { ...car, condition: Math.min(100, car.condition + 0.1) }
          : car
      )
    );
  };

  const getCar = (carId: string) => {
    return garage.find((car) => car.id === carId);
  };

  return { garage, addCar, removeCar, hasCar, repairCar, getCar };
};
