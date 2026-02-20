import React, { createContext, useContext, useState } from 'react';

interface SoldCarsContextType {
  soldCars: string[];
  markAsSold: (carId: string) => void;
  isSold: (carId: string) => boolean;
}

const SoldCarsContext = createContext<SoldCarsContextType | undefined>(undefined);

export const SoldCarsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [soldCars, setSoldCars] = useState<string[]>([]);

  const markAsSold = (carId: string) => {
    setSoldCars((prev) => [...prev, carId]);
  };

  const isSold = (carId: string) => {
    const sold = soldCars.includes(carId);
    return sold;
  };

  const value: SoldCarsContextType = {
    soldCars,
    markAsSold,
    isSold,
  };

  return (
    <SoldCarsContext.Provider value={value}>
      {children}
    </SoldCarsContext.Provider>
  );
};

export const useSoldCarsContext = () => {
  const context = useContext(SoldCarsContext);
  if (!context) {
    throw new Error('useSoldCarsContext must be used within SoldCarsProvider');
  }
  return context;
};
