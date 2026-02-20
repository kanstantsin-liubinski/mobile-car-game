import React, { createContext, useContext } from 'react';
import type { Car, GarageCar } from '@/types';
import { useGarage } from '@hooks/useGarage';

interface GarageContextType {
  garage: GarageCar[];
  addCar: (car: Car) => void;
  removeCar: (carId: string) => void;
  hasCar: (carId: string) => boolean;
  repairCar: (carId: string) => void;
  getCar: (carId: string) => GarageCar | undefined;
}

const GarageContext = createContext<GarageContextType | undefined>(undefined);

export const GarageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const garageState = useGarage();

  return (
    <GarageContext.Provider value={garageState}>
      {children}
    </GarageContext.Provider>
  );
};

export const useGarageContext = () => {
  const context = useContext(GarageContext);
  if (!context) {
    throw new Error('useGarageContext must be used within GarageProvider');
  }
  return context;
};
