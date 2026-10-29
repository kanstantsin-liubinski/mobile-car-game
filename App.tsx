import { StatusBar } from 'expo-status-bar';
import { View, Text, Platform } from 'react-native';
import { preloadAllImages } from './src/img/preloadImages';
import { colors } from '@styles/colors';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useRef, useState } from 'react';

import { GarageScreen, MarketScreen, SkillsScreen, CityScreen, DealershipScreen, OrdersScreen } from '@screens';
import { BottomMenu, TopMenu, MainMenu } from '@components';
import { useNavigation } from '@hooks/useNavigation';
import { DEFAULT_MARKET_ID } from './src/data/cityBuildings';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GarageProvider } from '@hooks/GarageContext';
import { EconomyProvider, useGameClock } from '@hooks/EconomyContext';
import { LegacyProvider, useLegacy } from '@hooks/LegacyContext';
import { SoldCarsProvider } from '@hooks/SoldCarsContext';
import { GameStateProvider, useGameState } from '@hooks/GameStateContext';
import { MarketProvider } from '@hooks/MarketContext';
import { PaydayModal } from '@components/finance/PaydayModal';
import { FinancePanel } from '@components/finance/FinancePanel';
import { ExperienceModal } from '@components/info/ExperienceModal';
import { LegacyModal } from '@components/legacy/LegacyModal';
import { LegacyWatcher } from '@components/legacy/LegacyWatcher';
import { CalendarModal } from '@components/info/CalendarModal';
import { BankruptcyScreen } from '@components/finance/BankruptcyScreen';
import { ToastProvider } from '@components/toast/ToastContext';
import { ProgressionToasts } from '@components/toast/ProgressionToasts';
import { HotOfferNotifier } from '@components/toast/HotOfferNotifier';
import { MentorTutorial } from '@components/tutorial/MentorTutorial';
import { commonStyles } from '@styles/styles';
import AsyncStorage from '@react-native-async-storage/async-storage';

function GameContent() {
  const { currentScreen, goToScreen, activeMarketId, marketFocus, openMarket } = useNavigation();
  const [financeOpen, setFinanceOpen] = useState(false);
  const [xpOpen, setXpOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(false);
  const legacyAfterXp = useRef(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { paydayPending } = useGameClock();
  useEffect(() => {
    if (paydayPending) {
      setFinanceOpen(false);
      setXpOpen(false);
      setLegacyOpen(false);
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
              <GarageScreen onOpenMarket={() => openMarket(DEFAULT_MARKET_ID)} />
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
            {/* Наставник ведёт новичка по первому циклу: карточка поверх экрана над меню */}
            <MentorTutorial screen={currentScreen} onOpenMarket={() => openMarket(DEFAULT_MARKET_ID)} />
          </View>
          <BottomMenu currentScreen={currentScreen} onScreenChange={goToScreen} />

          {/* Финансы: панель по нажатию на баланс, обязательный отчёт в зарплатный день, банкротство */}
          {/* В зарплатный день панель закрывается: отчёт — поверх всей игры */}
          <FinancePanel visible={financeOpen && !paydayPending} onClose={() => setFinanceOpen(false)} />
          <ExperienceModal
            visible={xpOpen && !paydayPending}
            onClose={() => setXpOpen(false)}
            onOpenLegacy={() => {
              // «Наследие» откроется, когда окно «Опыт» полностью закроется (iOS не показывает Modal поверх закрывающегося)
              legacyAfterXp.current = true;
              setXpOpen(false);
            }}
            onClosed={() => {
              if (!legacyAfterXp.current) return;
              legacyAfterXp.current = false;
              setLegacyOpen(true);
            }}
          />
          <LegacyModal visible={legacyOpen && !paydayPending} onClose={() => setLegacyOpen(false)} />
          <CalendarModal visible={calendarOpen && !paydayPending} onClose={() => setCalendarOpen(false)} />
          <PaydayModal />
          <BankruptcyScreen />
          <ProgressionToasts />
          <LegacyWatcher />
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
  const { recordSavedCareer } = useLegacy();
  // Все картинки игры грузим и декодируем один раз при запуске — дальше они рисуются сразу
  const [imagesReady, setImagesReady] = useState(false);
  const [imagesProgress, setImagesProgress] = useState(0);
  useEffect(() => {
    let alive = true;
    preloadAllImages((p) => alive && setImagesProgress(p)).then(() => alive && setImagesReady(true));
    return () => {
      alive = false;
    };
  }, []);

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
    // Прошлая карьера уходит в историю «Наследия» (очки не начисляются, наследие сохраняется)
    await recordSavedCareer();
    await resetGameData();
    setCurrentScreen('game');
  };

  const handleExit = () => {
    // На веб версии - ничего не делаем
    // На мобильной - закрыть приложение (требует native code)
    console.log('Exit pressed');
  };

  if (isLoading || !imagesReady) {
    return (
      <View style={[commonStyles.container, { alignItems: 'center', justifyContent: 'center', gap: 14 }]}>
        <Text style={{ fontSize: 30, fontWeight: '800', color: colors.primary }}>CAR GAME</Text>
        <View style={{ width: 180, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' }}>
          <View style={{ width: `${Math.round(imagesProgress * 100)}%`, height: '100%', backgroundColor: colors.primary }} />
        </View>
        <Text style={{ fontSize: 12, color: colors.textTertiary }}>Загрузка… {Math.round(imagesProgress * 100)}%</Text>
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
        <LegacyProvider>
          <AppWrapper />
        </LegacyProvider>
      </GameStateProvider>
    </SafeAreaProvider>
  );
}
