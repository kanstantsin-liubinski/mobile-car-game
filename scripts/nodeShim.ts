/** Картинки в данных подключаются через require (Metro); в Node симулятору нужен только путь */
(globalThis as { require?: (path: string) => string }).require ??= (path: string) => path;
