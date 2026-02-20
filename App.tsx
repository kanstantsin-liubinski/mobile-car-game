import { StatusBar } from 'expo-status-bar';
import { View, Platform } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageScreen, MarketScreen } from '@screens';
import { BottomMenu } from '@components/BottomMenu';
import { TopMenu } from '@components/TopMenu';
import { useNavigation } from '@hooks/useNavigation';
import { useBalance } from '@hooks/useBalance';
import { useSafeAreaWeb } from '@hooks/useSafeAreaWeb';
import { GarageProvider } from '@hooks/GarageContext';
import { commonStyles } from '@styles/styles';

function AppContent() {
  const { currentScreen, goToScreen } = useNavigation();
  const { balance } = useBalance();
  
  // Используем нативные insets на мобильных, веб-версию на браузере
  const nativeInsets = useSafeAreaInsets();
  const webInsets = useSafeAreaWeb();
  const insets = Platform.OS === 'web' ? webInsets : nativeInsets;

  return (
    <View style={commonStyles.container}>
      <TopMenu balance={balance} insets={insets} />
      
      <View style={commonStyles.content}>
        {currentScreen === 'garage' && <GarageScreen />}
        {currentScreen === 'market' && <MarketScreen />}
      </View>

      <BottomMenu currentScreen={currentScreen} onScreenChange={goToScreen} />

      <StatusBar style="auto" />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GarageProvider>
        <AppContent />
      </GarageProvider>
    </SafeAreaProvider>
  );
}
