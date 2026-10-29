import React, { createContext, useContext, useMemo, useState } from 'react';
import { View } from 'react-native';

/**
 * Высота карточки наставника, которая лежит поверх экрана над меню. Пока она видна, прокручиваемые
 * экраны добавляют снизу столько же места (TutorialSpacer): докрутив до конца, игрок видит весь
 * контент над карточкой, и обучение не перекрывает кнопки.
 */
const TutorialInsetContext = createContext<{ inset: number; setInset: (height: number) => void }>({
  inset: 0,
  setInset: () => {},
});

export const TutorialInsetProvider = ({ children }: { children: React.ReactNode }) => {
  const [inset, setInset] = useState(0);
  const value = useMemo(() => ({ inset, setInset }), [inset]);
  return <TutorialInsetContext.Provider value={value}>{children}</TutorialInsetContext.Provider>;
};

export const useTutorialInset = () => useContext(TutorialInsetContext).inset;
export const useSetTutorialInset = () => useContext(TutorialInsetContext).setInset;

/**
 * Пустое место в конце прокрутки экрана под карточкой обучения. slack — собственный нижний отступ
 * экрана после этого места: он уже даёт часть просвета, поэтому вычитается — над карточкой остаётся
 * такой же просвет, как под ней (до меню).
 */
export const TutorialSpacer = ({ slack = 0 }: { slack?: number }) => {
  const inset = useTutorialInset();
  const height = inset - slack;
  return inset > 0 && height > 0 ? <View style={{ height }} /> : null;
};
