import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SoldCarsContextType {
  soldCars: string[];
  markAsSold: (carId: string) => void;
  isSold: (carId: string) => boolean;
}

const SoldCarsContext = createContext<SoldCarsContextType | undefined>(undefined);

const SOLD_CARS_KEY = 'game_sold_cars';

export const SoldCarsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [soldCars, setSoldCars] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Загружаем список проданных машин при монтировании
  useEffect(() => {
    loadSoldCars();
  }, []);

  // Сохраняем список при изменении
  useEffect(() => {
    if (isLoaded) {
      saveSoldCars(soldCars);
    }
  }, [soldCars, isLoaded]);

  const loadSoldCars = async () => {
    try {
      const saved = await AsyncStorage.getItem(SOLD_CARS_KEY);
      if (saved !== null) {
        const carsData = JSON.parse(saved) as string[];
        setSoldCars(carsData);
      }
    } catch (error) {
      console.error('Error loading sold cars:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveSoldCars = async (carsData: string[]) => {
    try {
      await AsyncStorage.setItem(SOLD_CARS_KEY, JSON.stringify(carsData));
    } catch (error) {
      console.error('Error saving sold cars:', error);
    }
  };

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
