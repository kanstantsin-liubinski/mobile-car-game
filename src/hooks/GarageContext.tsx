import React, { createContext, useContext, useMemo } from 'react';
import type { Car, GarageCar, Mechanic } from '@/types';
import { useGarage, type MechanicRepairInfo, type ActiveSellInfo } from '@hooks/useGarage';
import { useGlobalTimer } from '@hooks/GlobalTimerContext';
import { useExperienceContext } from '@hooks/ExperienceContext';
import { useBalanceContext } from '@hooks/BalanceContext';
import { useSoldCarsContext } from '@hooks/SoldCarsContext';

interface GarageContextType {
  garage: GarageCar[];
  garageSlots: number;
  maxGarageSlots: number;
  mechanics: Mechanic[];
  mechanicRepairs: Record<string, MechanicRepairInfo>;
  mechanicRepairsProgress: Record<string, number>;
  mechanicRepairsCondition: Record<string, number>;
  activeSells: Record<string, ActiveSellInfo>;
  activeSellsProgress: Record<string, number>;
  addCar: (car: Car, slotIndex?: number) => void;
  removeCar: (carId: string) => void;
  hasCar: (carId: string) => boolean;
  repairCar: (carId: string, skillMultiplier?: number) => void;
  getCar: (carId: string) => GarageCar | undefined;
  sellCar: (carId: string, sellPrice: number) => void;
  changeCarSlot: (carId: string, slotIndex: number) => boolean;
  upgradeGarageSlot: () => void;
  upgradeMechanicSkill: (mechanicId: string) => boolean;
  changeMechanicSlot: (mechanicId: string, newSlotIndex: number) => boolean;
  hireMechanic: (mechanicId: string) => boolean;
  canUpgradeGarage: () => boolean;
  startMechanicRepair: (carId: string, mechanicId: string) => void;
  cancelMechanicRepair: (carId: string) => void;
  startSell: (carId: string, sellPrice: number, duration: number) => void;
  cancelSell: (carId: string) => void;
}

const GarageContext = createContext<GarageContextType | undefined>(undefined);

interface GarageProviderProps {
  children: React.ReactNode;
  onSellCar?: (amount: number) => void;
}

export const GarageProvider: React.FC<GarageProviderProps> = ({ children, onSellCar }) => {
  const { addTimer, removeTimer, getProgress } = useGlobalTimer();
  const { addExperience } = useExperienceContext();
  const { addBalance } = useBalanceContext();
  const { markAsSold } = useSoldCarsContext();

  const callbacks = useMemo(() => ({
    addTimer,
    removeTimer,
    getProgress,
    addExperience,
    addBalance,
    markAsSold,
  }), [addTimer, removeTimer, getProgress, addExperience, addBalance, markAsSold]);

  const garageState = useGarage(onSellCar, callbacks);

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
