# gcc-ext — Поддержка Google Closure Library для VSCode

Расширение VSCode, которое добавляет навигацию по коду, автодополнение и hover-подсказки для legacy-проектов на [Google Closure Library](https://github.com/google/closure-library) с использованием `goog.require` / `goog.provide`.

## Возможности

- **Go to Definition** — F12 на `goog.require('my.Namespace')` переходит к объявлению `goog.provide` в исходном файле. Работает также при курсоре на символе в коде (`new my.Namespace()`, `my.Namespace.method()`).
- **Автодополнение** — Ctrl+Space внутри `goog.require('...')` показывает все известные неймспейсы, отфильтрованные по введённому префиксу.
- **Hover** — При наведении на строку с неймспейсом отображается путь к файлу, список зависимостей `requires` и JSDoc-комментарий из целевого файла.
- **Автоматическая переиндексация** — Оба файла `deps.js` отслеживаются; индекс обновляется автоматически при их изменении.
- **Строка состояния** — Показывает статус индекса: `GCL: индексирование...` → `GCL: 4521 ns`.

## Установка

1. Перейдите на страницу [Releases](https://github.com/Sublihim/gcc-ext/releases) и скачайте последний файл `.vsix`.
2. В VSCode откройте Command Palette (`Ctrl+Shift+P`) и выполните **Extensions: Install from VSIX...**.
3. Выберите скачанный файл `.vsix`.

Расширение активируется автоматически, как только в корне workspace появится `gcl.json` (см. раздел [Настройка](#настройка)).

## Требования

- Проект должен использовать `goog.provide` / `goog.require` (legacy Closure, не `goog.module`).
- Должен существовать файл `deps.js`, перечисляющий все неймспейсы проекта через `goog.addDependency(...)`.
- Локально должна быть доступна полная копия `google-closure-library` (расширение читает её `deps.js`).

## Настройка

**1. Создайте `gcl.json` в корне проекта:**

```json
{
  "depsFile": "./deps.js",
  "depsRoot": ".",
  "closureLibraryRoot": "../project-libs/closure-library",
  "externsGlob": ["./externs/**/*.js"],
  "projectRoot": "./js",
  "folders": [
    ".",
    { "path": "../project-a", "name": "Project A" },
    { "path": "../project-b", "name": "Project B" },
    "../project-libs"
  ]
}
```

| Поле | Описание |
|---|---|
| `depsFile` | Путь к `deps.js` проекта, относительно `gcl.json` |
| `depsRoot` | Директория, от которой отсчитываются пути внутри `deps.js` проекта (по умолчанию `.`) |
| `closureLibraryRoot` | Путь к директории `google-closure-library` |
| `externsGlob` | Glob-паттерны для externs-файлов (необязательно) |
| `projectRoot` | Корневая директория исходников JS |
| `folders` | Список папок для Multi-root Workspace VSCode (необязательно). Каждый элемент — строка с путём или объект `{ "path": "...", "name": "..." }` — `name` задаёт метку папки в Explorer |

**2. Откройте папку проекта в VSCode.** Расширение активируется автоматически при обнаружении `gcl.json`.

**3. Проверьте строку состояния** — `GCL: N ns` означает, что индекс готов.

## Принцип работы

Расширение читает `deps.js` (исходные файлы не сканируются) и строит in-memory индекс неймспейс→файл. Индексируются два файла:

1. `deps.js` вашего проекта (поле `depsFile` в `gcl.json`)
2. `deps.js` самой closure-library (`<closureLibraryRoot>/closure/goog/deps.js`)

Пути в **проектном** `deps.js` разрешаются относительно `depsRoot` (по умолчанию — корень workspace).  
Пути в `deps.js` **closure-library** разрешаются относительно `<closureLibraryRoot>/closure/goog/` — директории, где находится `base.js`.

## Команды

| Команда | Описание |
|---|---|
| `GCL: Show Index Stats` | Показывает общее количество проиндексированных неймспейсов |
| `GCL: Reindex` | Принудительно перечитывает оба файла `deps.js` |
| `GCL: Generate Workspace File` | Создаёт `gcc.code-workspace` из списка `folders` в `gcl.json` |

После выполнения **GCL: Generate Workspace File** VSCode предложит открыть `gcc.code-workspace`. При открытии VSCode переключается в режим Multi-root Workspace — все папки из `gcl.json` появляются в Explorer.

## Разработка

```bash
git clone https://github.com/Sublihim/gcc-ext
cd gcc-ext
npm install
npm run compile
```

Откройте проект в VSCode и нажмите **F5** — запустится Extension Development Host с активированным расширением.

```bash
npm run watch        # инкрементальная компиляция при сохранении
npm run lint         # ESLint
npm test             # запустить unit-тесты (Vitest)
npm run test:watch   # тесты в watch-режиме
npm run test:coverage  # тесты с отчётом о покрытии
vsce package         # собрать .vsix для ручной установки
```

Тесты находятся в `test/` — unit-тесты для парсеров и индекса, тесты провайдеров с mock-ом VSCode API. При воспроизведении бага: сначала добавьте fixture-файл в `test/fixtures/` и тест-кейс, затем чините.

## Ограничения

- Поддерживается только стиль `goog.provide` / `goog.require` (`goog.module` не поддерживается).
- Навигация зависит от актуальности `deps.js` — файлы, не перечисленные в нём, невидимы для расширения.
- Индексация externs и диагностические предупреждения запланированы в следующих версиях.

## Лицензия

MIT
