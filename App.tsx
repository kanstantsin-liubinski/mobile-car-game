import { StatusBar } from 'expo-status-bar';
import { View, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';

import { GarageScreen, MarketScreen, SkillsScreen, CityScreen, DealershipScreen, OrdersScreen } from '@screens';
import { BottomMenu, TopMenu, MainMenu } from '@components';
import { useNavigation } from '@hooks/useNavigation';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GarageProvider } from '@hooks/GarageContext';
import { EconomyProvider, useGameClock } from '@hooks/EconomyContext';
import { SoldCarsProvider } from '@hooks/SoldCarsContext';
import { GameStateProvider, useGameState } from '@hooks/GameStateContext';
import { MarketProvider } from '@hooks/MarketContext';
import { PaydayModal } from '@components/finance/PaydayModal';
import { FinancePanel } from '@components/finance/FinancePanel';
import { BankruptcyScreen } from '@components/finance/BankruptcyScreen';
import { ToastProvider } from '@components/toast/ToastContext';
import { ProgressionToasts } from '@components/toast/ProgressionToasts';
import { HotOfferNotifier } from '@components/toast/HotOfferNotifier';
import { commonStyles } from '@styles/styles';
import AsyncStorage from '@react-native-async-storage/async-storage';

function GameContent() {
  const { currentScreen, goToScreen, activeMarketId, marketFocus, openMarket } = useNavigation();
  const [financeOpen, setFinanceOpen] = useState(false);
  const { paydayPending } = useGameClock();
  useEffect(() => {
    if (paydayPending) setFinanceOpen(false);
  }, [paydayPending]);

  // Используем нативные insets на мобильных, веб-версию на браузере
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  return (
    <ToastProvider>
    <MarketProvider>
      <GarageProvider>
        <View style={commonStyles.container}>
          <TopMenu insets={insets} onPressBalance={() => setFinanceOpen(true)} />
          
          <View style={commonStyles.content}>
            {currentScreen === 'garage' && (
              <GarageScreen />
            )}
            {currentScreen === 'city' && (
              <CityScreen
                onOpenMarket={openMarket}
                onOpenDealership={() => goToScreen('dealership')}
                onOpenGarage={() => goToScreen('garage')}
              />
            )}
            {currentScreen === 'market' && <MarketScreen marketId={activeMarketId} focus={marketFocus} onBack={() => goToScreen('city')} />}
            {currentScreen === 'dealership' && <DealershipScreen onBack={() => goToScreen('city')} />}
            {currentScreen === 'skills' && <SkillsScreen />}
            {currentScreen === 'orders' && <OrdersScreen />}
          </View>

          <BottomMenu currentScreen={currentScreen} onScreenChange={goToScreen} />

          {/* Финансы: панель по нажатию на баланс, обязательный отчёт в зарплатный день, банкротство */}
          {/* В зарплатный день панель закрывается: отчёт — поверх всей игры */}
          <FinancePanel visible={financeOpen && !paydayPending} onClose={() => setFinanceOpen(false)} />
          <PaydayModal />
          <BankruptcyScreen />
          <ProgressionToasts />
          <HotOfferNotifier onOpen={openMarket} />

          <StatusBar style="auto" />
        </View>
      </GarageProvider>
    </MarketProvider>
    </ToastProvider>
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
    <EconomyProvider key={`economy-${gameResetTrigger}`}>
      <SoldCarsProvider key={`sold-cars-${gameResetTrigger}`}>
        <GameContent />
      </SoldCarsProvider>
    </EconomyProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GameStateProvider>
        <AppWrapper />
      </GameStateProvider>
    </SafeAreaProvider>
  );
}
