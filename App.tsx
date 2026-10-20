import { StatusBar } from 'expo-status-bar';
import { View, Platform, Image } from 'react-native';
import { CITY_BACKGROUND } from './src/data/cityBuildings';
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
import { ExperienceModal } from '@components/info/ExperienceModal';
import { CalendarModal } from '@components/info/CalendarModal';
import { BankruptcyScreen } from '@components/finance/BankruptcyScreen';
import { ToastProvider } from '@components/toast/ToastContext';
import { ProgressionToasts } from '@components/toast/ProgressionToasts';
import { HotOfferNotifier } from '@components/toast/HotOfferNotifier';
import { commonStyles } from '@styles/styles';
import AsyncStorage from '@react-native-async-storage/async-storage';

function GameContent() {
  const { currentScreen, goToScreen, activeMarketId, marketFocus, openMarket } = useNavigation();
  const [financeOpen, setFinanceOpen] = useState(false);
  const [xpOpen, setXpOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { paydayPending } = useGameClock();
  useEffect(() => {
    if (paydayPending) {
      setFinanceOpen(false);
      setXpOpen(false);
      setCalendarOpen(false);
    }
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
          <TopMenu
            insets={insets}
            onPressBalance={() => setFinanceOpen(true)}
            onPressCalendar={() => setCalendarOpen(true)}
            onPressXp={() => setXpOpen(true)}
          />
          
          <View style={commonStyles.content}>
            {currentScreen === 'garage' && (
              <GarageScreen />
            )}
            {/* Город всегда смонтирован (скрыт на других экранах): большая карта не грузится заново при каждом переходе */}
            <View style={[{ flex: 1 }, currentScreen !== 'city' && { display: 'none' }]}>
              <CityScreen
                onOpenMarket={openMarket}
                onOpenDealership={() => goToScreen('dealership')}
                onOpenGarage={() => goToScreen('garage')}
              />
            </View>
            {currentScreen === 'market' && <MarketScreen marketId={activeMarketId} focus={marketFocus} onBack={() => goToScreen('city')} />}
            {currentScreen === 'dealership' && <DealershipScreen onBack={() => goToScreen('city')} />}
            {currentScreen === 'skills' && <SkillsScreen />}
            {currentScreen === 'orders' && <OrdersScreen />}
          </View>

          <BottomMenu currentScreen={currentScreen} onScreenChange={goToScreen} />

          {/* Финансы: панель по нажатию на баланс, обязательный отчёт в зарплатный день, банкротство */}
          {/* В зарплатный день панель закрывается: отчёт — поверх всей игры */}
          <FinancePanel visible={financeOpen && !paydayPending} onClose={() => setFinanceOpen(false)} />
          <ExperienceModal visible={xpOpen && !paydayPending} onClose={() => setXpOpen(false)} />
          <CalendarModal visible={calendarOpen && !paydayPending} onClose={() => setCalendarOpen(false)} />
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

/** Карта города — самая тяжёлая картинка: начинаем грузить её сразу при запуске, ещё в главном меню */
const preloadCityMap = () => {
  try {
    const uri = Image.resolveAssetSource(CITY_BACKGROUND)?.uri;
    if (uri) Image.prefetch(uri).catch(() => {});
  } catch {
    // Предзагрузка — только ускорение, без неё карта просто загрузится при первом показе
  }
};
preloadCityMap();

export default function App() {
  return (
    <SafeAreaProvider>
      <GameStateProvider>
        <AppWrapper />
      </GameStateProvider>
    </SafeAreaProvider>
  );
}
