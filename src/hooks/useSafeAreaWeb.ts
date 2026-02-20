import { useState, useEffect } from 'react';
import { Platform } from 'react-native';

interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function useSafeAreaWeb(): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>({
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  });

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return;
    }

    const updateInsets = () => {
      // На мобильных размерах в браузере устанавливаем обычные значения safe-area
      const width = window.innerWidth;
      const isMobile = width <= 768;

      if (isMobile) {
        // Симулируем iOS safe-area на мобильных
        const isNotch = width <= 390;
        setInsets({
          top: isNotch ? 47 : 44,
          right: 0,
          bottom: 34,
          left: 0,
        });
      } else {
        // На десктопе safe-area не нужен
        setInsets({
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
        });
      }
    };

    updateInsets();
    window.addEventListener('resize', updateInsets);
    
    return () => window.removeEventListener('resize', updateInsets);
  }, []);

  return insets;
}
