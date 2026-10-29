import React, { createContext, useContext, useMemo, useState } from 'react';

interface GoalsContextType {
  open: boolean;
  openGoals: () => void;
  closeGoals: () => void;
}

const GoalsContext = createContext<GoalsContextType | null>(null);

/** Окно «Цели» одно на всю игру: открывается кнопкой в плашке локации на любом экране */
export const GoalsProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, openGoals: () => setOpen(true), closeGoals: () => setOpen(false) }), [open]);
  return <GoalsContext.Provider value={value}>{children}</GoalsContext.Provider>;
};

/** null — вне игры (кнопку не показываем) */
export const useGoals = () => useContext(GoalsContext);
