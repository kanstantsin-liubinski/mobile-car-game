# 📍 Path Aliases

Проект использует path aliases для удобного импорта файлов без относительных путей.

## Аналиасы

```
@/*           → src/*
@img/*        → src/img/*
@screens/*    → src/screens/*
@components/* → src/components/*
@styles/*     → src/styles/*
@hooks/*      → src/hooks/*
@types/*      → src/types/*
```

## Примеры использования

**Раньше (с относительными путями):**
```typescript
import { GarageIcon } from '../../../img/GarageIcon';
import { commonStyles } from '../styles/styles';
import type { Screen } from '../types/index';
```

**Теперь (с алиасами):**
```typescript
import { GarageIcon } from '@img';
import { commonStyles } from '@styles/styles';
import type { Screen } from '@types';
```

## Как это работает

- **TypeScript**: Конфигурация в `tsconfig.json`
- **Metro Bundler**: Конфигурация в `metro.config.js`

Оба файла автоматически синхронизируют пути, поэтому при добавлении нового алиаса нужно обновить оба файла.

## Добавление нового алиаса

1. Обновите `tsconfig.json`:
```json
"paths": {
  "@newFolder/*": ["src/newFolder/*"]
}
```

2. Обновите `metro.config.js`:
```javascript
if (name === '@newFolder') {
  return require.resolve('./src/newFolder');
}
```

Готово! 🎯
