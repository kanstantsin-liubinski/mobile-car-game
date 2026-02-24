import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ExperienceContextType {
  totalExperience: number;
  level: number;
  addExperience: (amount: number) => void;
  getProgress: () => { current: number; required: number };
  getLevel: () => number;
}

const ExperienceContext = createContext<ExperienceContextType | undefined>(undefined);

const EXPERIENCE_KEY = 'game_experience';

// Formula: to reach level (level + 1), need (level + 1) * 1000 XP
const getExperienceRequired = (level: number): number => {
  return (level + 1) * 1000;
};

// Calculate level and progress based on total experience
const calculateLevelAndProgress = (
  totalExp: number
): { level: number; progressInLevel: number; requiredForNext: number } => {
  let currentLevel = 0;
  let remainingExp = totalExp;

  // Keep subtracting XP requirements until we can't anymore
  while (true) {
    const requiredForNext = getExperienceRequired(currentLevel);
    if (remainingExp >= requiredForNext) {
      remainingExp -= requiredForNext;
      currentLevel++;
    } else {
      break;
    }
  }

  const requiredForNext = getExperienceRequired(currentLevel);

  return {
    level: currentLevel,
    progressInLevel: remainingExp,
    requiredForNext,
  };
};

interface ExperienceProviderProps {
  children: React.ReactNode;
}

export const ExperienceProvider: React.FC<ExperienceProviderProps> = ({ children }) => {
  const [totalExperience, setTotalExperience] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const levelData = calculateLevelAndProgress(totalExperience);

  // Загружаем опыт при монтировании
  useEffect(() => {
    loadExperience();
  }, []);

  // Сохраняем опыт при изменении
  useEffect(() => {
    if (isLoaded) {
      saveExperience(totalExperience);
    }
  }, [totalExperience, isLoaded]);

  const loadExperience = async () => {
    try {
      const saved = await AsyncStorage.getItem(EXPERIENCE_KEY);
      if (saved !== null) {
        setTotalExperience(parseInt(saved, 10));
      }
    } catch (error) {
      console.error('Error loading experience:', error);
    } finally {
      setIsLoaded(true);
    }
  };

  const saveExperience = async (exp: number) => {
    try {
      await AsyncStorage.setItem(EXPERIENCE_KEY, exp.toString());
    } catch (error) {
      console.error('Error saving experience:', error);
    }
  };

  const addExperience = (amount: number): void => {
    setTotalExperience((prev) => prev + amount);
  };

  const getProgress = () => ({
    current: levelData.progressInLevel,
    required: levelData.requiredForNext,
  });

  const getLevel = () => levelData.level;

  return (
    <ExperienceContext.Provider
      value={{
        totalExperience,
        level: levelData.level,
        addExperience,
        getProgress,
        getLevel,
      }}
    >
      {children}
    </ExperienceContext.Provider>
  );
};

export const useExperienceContext = () => {
  const context = useContext(ExperienceContext);
  if (!context) {
    throw new Error('useExperienceContext must be used within ExperienceProvider');
  }
  return context;
};
