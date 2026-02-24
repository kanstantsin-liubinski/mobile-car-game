import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BALANCE_KEY = 'game_balance';
const INITIAL_BALANCE = 25000;

export const useBalance = () => {
  const [balance, setBalance] = useState(INITIAL_BALANCE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Загружаем баланс при монтировании
  useEffect(() => {
    loadBalance();
  }, []);

  // Сохраняем баланс при изменении
  useEffect(() => {
    if (isLoaded) {
      saveBalance(balance);
    }
  }, [balance, isLoaded]);

  const loadBalance = async () => {
    try {
      const saved = await AsyncStorage.getItem(BALANCE_KEY);
      if (saved !== null) {
        setBalance(parseInt(saved, 10));
      }
    } catch (error) {
      console.error('Error loading balance:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveBalance = async (newBalance: number) => {
    try {
      await AsyncStorage.setItem(BALANCE_KEY, newBalance.toString());
    } catch (error) {
      console.error('Error saving balance:', error);
    }
  };

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
