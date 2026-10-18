import React, { createContext, useContext } from 'react';
import { useGarage, type GarageState } from '@hooks/useGarage';

const GarageContext = createContext<GarageState | undefined>(undefined);

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
