import React, { createContext, useContext } from 'react';
import { useBalance } from '@hooks/useBalance';

interface BalanceContextType {
  balance: number;
  addBalance: (amount: number) => void;
  removeBalance: (amount: number) => boolean;
}

const BalanceContext = createContext<BalanceContextType | undefined>(undefined);

export const BalanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const balanceState = useBalance();

  return (
    <BalanceContext.Provider value={balanceState}>
      {children}
    </BalanceContext.Provider>
  );
};

export const useBalanceContext = () => {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalanceContext must be used within BalanceProvider');
  }
  return context;
};
