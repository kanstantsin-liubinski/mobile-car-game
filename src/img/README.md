# 🎨 Папка img — иконки игры

Картинки лежат в `assets/icons/` (PNG с прозрачным фоном), а подключаются через реестр
`src/img/gameIcons.ts`:

```tsx
import { GameIcon } from '@components/GameIcon';
import { ICONS, BUILDING_ICONS, TIER_ICONS, getMechanicAvatar } from '@img/gameIcons';

<GameIcon source={ICONS.money} size={24} />
```

- `ICONS` — интерфейс, характеристики машины, кнопки действий
- `BUILDING_ICONS` — гаражи, авторынок, автосалон (по id из `src/data/cityBuildings.ts`)
- `TIER_ICONS` — классы авто (по тиру из `src/data/carModels.ts`)
- `getMechanicAvatar(id)` — аватар механика, стабильно выбирается по его id

Чтобы добавить иконку: положите PNG в `assets/icons/<раздел>/` и добавьте `require` в `gameIcons.ts`.
