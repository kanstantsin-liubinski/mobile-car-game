# 🎨 Папка img - Иконки и ассеты

Все иконки и кастомные графические элементы приложения находятся в одном месте.

## Структура

```
src/img/
├── GarageIcon.tsx       - Компонент иконки гаража
├── MarketIcon.tsx       - Компонент иконки авторынка
└── index.ts             - Экспорты всех иконок
```

## Как добавить свою иконку

### Вариант 1: PNG/JPG

1. Положите файл иконки в папку `src/img/` (например, `garage.png`)
2. Создайте новый компонент `src/img/GarageIcon.tsx`:

```tsx
import React from 'react';
import { Image } from 'react-native';

interface IconProps {
  size?: number;
  color?: string;
}

export const GarageIcon = ({ size = 24, color }: IconProps) => {
  return (
    <Image
      source={require('./garage.png')}
      style={{ width: size, height: size, tintColor: color }}
    />
  );
};
```

3. Экспортируйте в `src/img/index.ts`:

```ts
export { GarageIcon } from './GarageIcon';
```

### Вариант 2: SVG

1. Установите библиотеку SVG:
```bash
npm install react-native-svg
```

2. Положите SVG файл в `src/img/` (например, `garage.svg`)
3. Создайте компонент:

```tsx
import React from 'react';
import { SvgUri } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

export const GarageIcon = ({ size = 24, color }: IconProps) => {
  return (
    <SvgUri
      width={size}
      height={size}
      uri={require('./garage.svg')}
      color={color}
    />
  );
};
```

## Текущие иконки

- **GarageIcon** - Иконка гаража (сейчас использует MaterialIcons "garage")
- **MarketIcon** - Иконка авторынка (сейчас использует MaterialIcons "store")

## Рекомендации

- Размер иконок: 24x24 px (используемый размер)
- Поддерживайте консистентный стиль для всех иконок
- Убедитесь, что иконка хорошо выглядит при приложении `color = #F1F5F9` (основной цвет текста)
