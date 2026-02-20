import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { GarageScreen, MarketScreen } from './src/screens';
import { BottomMenu } from './src/components/BottomMenu';
import { useNavigation } from './src/hooks/useNavigation';
import { commonStyles } from './src/styles/styles';

function AppContent() {
  const { currentScreen, goToScreen } = useNavigation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[commonStyles.container, { paddingTop: insets.top }]}>
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
      <AppContent />
    </SafeAreaProvider>
  );
}
