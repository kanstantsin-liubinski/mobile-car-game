import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ExperienceContextType {
  totalExperience: number;
  level: number;
  addExperience: (amount: number) => void;
  getProgress: () => { current: number; required: number; percentage: number };
  getLevel: () => number;
  isTierUnlocked: (tier: number) => boolean;
  getRequiredLevelForTier: (tier: number) => number;
}

const ExperienceContext = createContext<ExperienceContextType | undefined>(undefined);

const EXPERIENCE_KEY = 'game_experience';

// Formula: to go from level N to N+1, need N * 1000 XP (level 1→2 = 1000, 2→3 = 2000, etc.)
// Level 0→1 requires 1000 XP as a baseline
const getExperienceRequired = (level: number): number => {
  return Math.max(level, 1) * 1000;
};

// Tier unlock levels: tier 1 = always, tier 2 = level 5, tier 3 = level 10, etc.
const TIER_UNLOCK_LEVELS: Record<number, number> = {
  1: 0,
  2: 5,
  3: 10,
  4: 15,
  5: 20,
  6: 25,
};

const getRequiredLevelForTier = (tier: number): number => {
  return TIER_UNLOCK_LEVELS[tier] ?? 0;
};

const isTierUnlockedByLevel = (tier: number, level: number): boolean => {
  return level >= getRequiredLevelForTier(tier);
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

  const getProgress = () => {
    const percentage = levelData.requiredForNext > 0
      ? (levelData.progressInLevel / levelData.requiredForNext) * 100
      : 0;
    return {
      current: levelData.progressInLevel,
      required: levelData.requiredForNext,
      percentage: Math.min(percentage, 100),
    };
  };

  const isTierUnlocked = (tier: number): boolean => {
    return isTierUnlockedByLevel(tier, levelData.level);
  };

  const getLevel = () => levelData.level;

  return (
    <ExperienceContext.Provider
      value={{
        totalExperience,
        level: levelData.level,
        addExperience,
        getProgress,
        getLevel,
        isTierUnlocked,
        getRequiredLevelForTier,
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
