import { useState } from 'react';

export const useBalance = () => {
  const [balance, setBalance] = useState(7000);

  const addBalance = (amount: number) => {
    setBalance((prev) => prev + amount);
  };

  const removeBalance = (amount: number) => {
    if (balance >= amount) {
      setBalance((prev) => prev - amount);
      return true;
    }
    return false;
  };

  return { balance, addBalance, removeBalance };
};
