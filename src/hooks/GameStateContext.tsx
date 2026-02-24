import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type GameDifficulty = 'easy' | 'normal' | 'hard';
export type AppScreen = 'menu' | 'game';

interface GameStateContextType {
  difficulty: GameDifficulty;
  setDifficulty: (difficulty: GameDifficulty) => void;
  currentScreen: AppScreen;
  setCurrentScreen: (screen: AppScreen) => void;
  hasSaveData: boolean;
  checkSaveData: () => Promise<void>;
  clearSaveData: () => Promise<void>;
  isLoading: boolean;
  resetGameData: () => Promise<void>;
  gameResetTrigger: number; // Используется для триггера перезагрузки
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

const DIFFICULTY_KEY = 'game_difficulty';
const SAVE_DATA_KEY = 'game_save_data';
const SAVE_DATA_MARKER = 'game_save_marker';

export const GameStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [difficulty, setDifficultyState] = useState<GameDifficulty>('normal');
  const [currentScreen, setCurrentScreen] = useState<AppScreen>('menu');
  const [hasSaveData, setHasSaveData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [gameResetTrigger, setGameResetTrigger] = useState(0);

  // Проверяем наличие сохранений при загрузке приложения
  useEffect(() => {
    checkSaveData();
  }, []);

  const checkSaveData = async () => {
    try {
      setIsLoading(true);
      const savedMarker = await AsyncStorage.getItem(SAVE_DATA_MARKER);
      setHasSaveData(!!savedMarker);
      
      // Загружаем последнюю выбранную сложность
      const savedDifficulty = await AsyncStorage.getItem(DIFFICULTY_KEY);
      if (savedDifficulty && (savedDifficulty === 'easy' || savedDifficulty === 'normal' || savedDifficulty === 'hard')) {
        setDifficultyState(savedDifficulty);
      }
    } catch (error) {
      console.error('Error checking save data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setDifficulty = async (newDifficulty: GameDifficulty) => {
    setDifficultyState(newDifficulty);
    try {
      await AsyncStorage.setItem(DIFFICULTY_KEY, newDifficulty);
    } catch (error) {
      console.error('Error saving difficulty:', error);
    }
  };

  const clearSaveData = async () => {
    try {
      await AsyncStorage.removeItem(SAVE_DATA_MARKER);
      setHasSaveData(false);
    } catch (error) {
      console.error('Error clearing save data:', error);
    }
  };

  const resetGameData = async () => {
    try {
      // Очищаем все игровые данные
      await AsyncStorage.removeItem('game_balance');
      await AsyncStorage.removeItem('game_garage');
      await AsyncStorage.removeItem('game_experience');
      await AsyncStorage.removeItem('game_skills');
      await AsyncStorage.removeItem('game_sold_cars');
      await AsyncStorage.removeItem(SAVE_DATA_MARKER);
      
      // Триггерим перезагрузку компонентов
      setGameResetTrigger((prev) => prev + 1);
      setHasSaveData(false);
    } catch (error) {
      console.error('Error resetting game data:', error);
    }
  };

  const markGameAsSaved = async () => {
    try {
      await AsyncStorage.setItem(SAVE_DATA_MARKER, 'true');
      setHasSaveData(true);
    } catch (error) {
      console.error('Error marking game as saved:', error);
    }
  };

  return (
    <GameStateContext.Provider
      value={{
        difficulty,
        setDifficulty,
        currentScreen,
        setCurrentScreen,
        hasSaveData,
        checkSaveData,
        clearSaveData,
        isLoading,
        resetGameData,
        gameResetTrigger,
      }}
    >
      {children}
    </GameStateContext.Provider>
  );
};

export const useGameState = () => {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error('useGameState must be used within GameStateProvider');
  }
  return context;
};
