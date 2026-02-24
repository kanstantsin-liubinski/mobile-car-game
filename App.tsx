import { StatusBar } from 'expo-status-bar';
import { View, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';

import { GarageScreen, MarketScreen, SkillsScreen } from '@screens';
import { BottomMenu, TopMenu, MainMenu } from '@components';
import { useNavigation } from '@hooks/useNavigation';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GarageProvider } from '@hooks/GarageContext';
import { BalanceProvider, useBalanceContext } from '@hooks/BalanceContext';
import { SoldCarsProvider, useSoldCarsContext } from '@hooks/SoldCarsContext';
import { SkillsProvider } from '@hooks/SkillsContext';
import { ExperienceProvider } from '@hooks/ExperienceContext';
import { GameStateProvider, useGameState } from '@hooks/GameStateContext';
import { GlobalTimerProvider } from '@hooks/GlobalTimerContext';
import { commonStyles } from '@styles/styles';
import AsyncStorage from '@react-native-async-storage/async-storage';

function GameContent() {
  const { currentScreen, goToScreen } = useNavigation();
  const { balance, addBalance } = useBalanceContext();
  const { markAsSold } = useSoldCarsContext();
  
  // Используем нативные insets на мобильных, веб-версию на браузере
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  const handleSellCar = (carId: string, sellPrice: number) => {
    addBalance(sellPrice);
    markAsSold(carId);
  };

  return (
    <GarageProvider onSellCar={(sellPrice) => {}}>
      <View style={commonStyles.container}>
        <TopMenu balance={balance} insets={insets} />
        
        <View style={commonStyles.content}>
          {currentScreen === 'garage' && <GarageScreen onSellCar={handleSellCar} />}
          {currentScreen === 'market' && <MarketScreen />}
          {currentScreen === 'skills' && <SkillsScreen />}
        </View>

        <BottomMenu currentScreen={currentScreen} onScreenChange={goToScreen} />

        <StatusBar style="auto" />
      </View>
    </GarageProvider>
  );
}

function AppWrapper() {
  const { currentScreen, setCurrentScreen, hasSaveData, resetGameData, isLoading, gameResetTrigger } = useGameState();

  // Сохраняем маркер при входе в игру
  useEffect(() => {
    const saveGameMarker = async () => {
      if (currentScreen === 'game') {
        try {
          await AsyncStorage.setItem('game_save_marker', 'true');
        } catch (error) {
          console.error('Error saving game marker:', error);
        }
      }
    };
    saveGameMarker();
  }, [currentScreen]);

  const handleContinue = () => {
    setCurrentScreen('game');
  };

  const handleNewGame = async () => {
    await resetGameData();
    setCurrentScreen('game');
  };

  const handleExit = () => {
    // На веб версии - ничего не делаем
    // На мобильной - закрыть приложение (требует native code)
    console.log('Exit pressed');
  };

  if (isLoading) {
    return (
      <View style={commonStyles.container}>
        <StatusBar style="auto" />
      </View>
    );
  }

  if (currentScreen === 'menu') {
    return (
      <>
        <MainMenu
          hasSaveData={hasSaveData}
          onContinue={handleContinue}
          onNewGame={handleNewGame}
          onExit={handleExit}
        />
        <StatusBar style="auto" />
      </>
    );
  }

  return (
    <BalanceProvider key={`balance-${gameResetTrigger}`}>
      <SoldCarsProvider key={`sold-cars-${gameResetTrigger}`}>
        <SkillsProvider key={`skills-${gameResetTrigger}`}>
          <ExperienceProvider key={`experience-${gameResetTrigger}`}>
            <GameContent />
          </ExperienceProvider>
        </SkillsProvider>
      </SoldCarsProvider>
    </BalanceProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GlobalTimerProvider>
        <GameStateProvider>
          <BalanceProvider>
            <SoldCarsProvider>
              <SkillsProvider>
                <ExperienceProvider>
                  <AppWrapper />
                </ExperienceProvider>
              </SkillsProvider>
            </SoldCarsProvider>
          </BalanceProvider>
        </GameStateProvider>
      </GlobalTimerProvider>
    </SafeAreaProvider>
  );
}
