const http = require('http');

/**
 * Обход бага Expo CLI: схему адреса бандла он берёт из заголовка `x-forwarded-proto` как есть.
 *
 * Туннель или цепочка прокси присылает в нём список через запятую (`https, http`) — по
 * стандарту так можно. Expo склеивает из этого адрес `https, http://…/index.ts.bundle`:
 * Expo Go не может загрузить бандл и вылетает, а в консоли сервера появляется
 * «Unable to resolve manifest assets… Cannot read properties of null (reading '0')».
 * Проверено на @expo/cli 57.0.31 и 57.0.32 (`ExpoGoManifestHandlerMiddleware`).
 *
 * Чиним на уровне HTTP-сервера Node, а не middleware Metro: обработчик манифеста Expo
 * стоит в начале цепочки, раньше `server.enhanceMiddleware`. Модуль подключается из
 * `metro.config.js`, а конфиг Expo CLI грузит в том же процессе до старта сервера.
 * Как только Expo это исправит, файл и его подключение можно удалить.
 */
const PATCHED = Symbol.for('mobile-car-game.normalizeForwardedProto');

const normalize = (value) => {
  const first = String(Array.isArray(value) ? value[0] : value)
    .split(',')[0]
    .trim()
    .toLowerCase();
  return first === 'http' || first === 'https' ? first : null;
};

if (!http.Server.prototype[PATCHED]) {
  const emit = http.Server.prototype.emit;

  http.Server.prototype.emit = function (event, req, ...rest) {
    const headers = event === 'request' ? req?.headers : undefined;
    if (headers?.['x-forwarded-proto'] !== undefined) {
      const proto = normalize(headers['x-forwarded-proto']);
      // Непонятную схему лучше убрать совсем: тогда Expo возьмёт свою, `http`.
      if (proto) headers['x-forwarded-proto'] = proto;
      else delete headers['x-forwarded-proto'];
    }
    return emit.call(this, event, req, ...rest);
  };

  http.Server.prototype[PATCHED] = true;
}
