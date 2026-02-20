import React, { createContext, useContext, useState } from 'react';

export interface Skill {
  id: string;
  name: string;
  level: number;
  progress: number; // 0-100
}

interface SkillsContextType {
  skills: Skill[];
  upgradeSkill: (skillId: string) => void;
  getSkill: (skillId: string) => Skill | undefined;
}

const SkillsContext = createContext<SkillsContextType | undefined>(undefined);

const INITIAL_SKILLS: Skill[] = [
  {
    id: 'mechanic',
    name: 'Механик',
    level: 1,
    progress: 0,
  },
];

const POINTS_PER_LEVEL = 100; // Нужно 100 кликов для уровня

export const SkillsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [skills, setSkills] = useState<Skill[]>(INITIAL_SKILLS);

  const upgradeSkill = (skillId: string) => {
    setSkills((prev) =>
      prev.map((skill) => {
        if (skill.id === skillId) {
          const newProgress = skill.progress + 1;

          // Если прогресс достиг максимума, поднимаем уровень
          if (newProgress >= POINTS_PER_LEVEL) {
            return {
              ...skill,
              level: skill.level + 1,
              progress: 0,
            };
          }

          return {
            ...skill,
            progress: newProgress,
          };
        }
        return skill;
      })
    );
  };

  const getSkill = (skillId: string) => {
    return skills.find((skill) => skill.id === skillId);
  };

  const value: SkillsContextType = {
    skills,
    upgradeSkill,
    getSkill,
  };

  return (
    <SkillsContext.Provider value={value}>
      {children}
    </SkillsContext.Provider>
  );
};

export const useSkillsContext = () => {
  const context = useContext(SkillsContext);
  if (!context) {
    throw new Error('useSkillsContext must be used within SkillsProvider');
  }
  return context;
};
