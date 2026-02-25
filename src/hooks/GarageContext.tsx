import React, { createContext, useContext } from 'react';
import type { Car, GarageCar, Mechanic } from '@/types';
import { useGarage } from '@hooks/useGarage';

interface GarageContextType {
  garage: GarageCar[];
  garageSlots: number;
  maxGarageSlots: number;
  mechanics: Mechanic[];
  addCar: (car: Car) => void;
  removeCar: (carId: string) => void;
  hasCar: (carId: string) => boolean;
  repairCar: (carId: string, skillMultiplier?: number) => void;
  getCar: (carId: string) => GarageCar | undefined;
  sellCar: (carId: string, sellPrice: number) => void;
  upgradeGarageSlot: () => void;
  upgradeMechanicSkill: (mechanicId: string) => boolean;
  changeMechanicSlot: (mechanicId: string, newSlotIndex: number) => boolean;
  hireMechanic: (mechanicId: string) => boolean;
  canUpgradeGarage: () => boolean;
}

const GarageContext = createContext<GarageContextType | undefined>(undefined);

interface GarageProviderProps {
  children: React.ReactNode;
  onSellCar?: (amount: number) => void;
}

export const GarageProvider: React.FC<GarageProviderProps> = ({ children, onSellCar }) => {
  const garageState = useGarage(onSellCar);

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
