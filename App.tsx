import { StatusBar } from 'expo-status-bar';
import { View, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageScreen, MarketScreen, SkillsScreen } from '@screens';
import { BottomMenu } from '@components/BottomMenu';
import { TopMenu } from '@components/TopMenu';
import { useNavigation } from '@hooks/useNavigation';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GarageProvider } from '@hooks/GarageContext';
import { BalanceProvider, useBalanceContext } from '@hooks/BalanceContext';
import { SoldCarsProvider, useSoldCarsContext } from '@hooks/SoldCarsContext';
import { SkillsProvider } from '@hooks/SkillsContext';
import { ExperienceProvider } from '@hooks/ExperienceContext';
import { commonStyles } from '@styles/styles';

function AppContent() {
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

export default function App() {
  return (
    <SafeAreaProvider>
      <BalanceProvider>
        <SoldCarsProvider>
          <SkillsProvider>
            <ExperienceProvider>
              <AppContent />
            </ExperienceProvider>
          </SkillsProvider>
        </SoldCarsProvider>
      </BalanceProvider>
    </SafeAreaProvider>
  );
}
