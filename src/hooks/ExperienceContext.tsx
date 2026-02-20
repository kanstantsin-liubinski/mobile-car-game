import React, { createContext, useContext, useState } from 'react';

interface ExperienceContextType {
  totalExperience: number;
  level: number;
  addExperience: (amount: number) => void;
  getProgress: () => { current: number; required: number };
  getLevel: () => number;
}

const ExperienceContext = createContext<ExperienceContextType | undefined>(undefined);

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
  const [totalExperience, setTotalExperience] = useState(500);
  const levelData = calculateLevelAndProgress(totalExperience);

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
