# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Проект

VSCode-расширение для поддержки Google Closure Library (legacy `goog.require` / `goog.provide`).
Активируется при наличии `gcl.json` в корне workspace пользователя.

## Команды

```bash
npm install          # установить зависимости
npm run compile      # однократная сборка (esbuild → dist/extension.js)
npm run watch        # watch-режим для разработки (esbuild)
npm run typecheck    # проверка типов без сборки (tsc --noEmit)
vsce package         # собрать .vsix для установки
```

Для запуска и отладки: открыть проект в VSCode, нажать **F5** — откроется Extension Development Host с активированным расширением.

## Ключевая архитектура

**Точка входа**: `src/extension.ts` → `activate()` читает `gcl.json`, инициализирует `IndexManager`, регистрирует провайдеры.

**Конфиг (`gcl.json` в проекте пользователя)**:
```json
{
  "depsFile": "./deps.js",
  "closureLibraryRoot": "../closure-library",
  "externsGlob": ["./externs/**/*.js"],
  "projectRoot": "./js"
}
```

**Пути в `deps.js`** — относительные от `<closureLibraryRoot>/closure/goog/` (директория `base.js`).
Абсолютный путь файла = `path.resolve(googBaseDir, relativePathFromDeps)`.

**Индексируются два `deps.js`**:
1. Проектный (`gcl.json → depsFile`)
2. Closure-library (`<closureLibraryRoot>/closure/goog/deps.js`)

**Провайдеры** регистрируются напрямую через VSCode Extension API (без LSP-процесса):
- `DefinitionProvider` — Go to Definition для `goog.require/provide` и символов в коде
- `CompletionProvider` — автодополнение внутри `goog.require('...')`
- `HoverProvider` — тултип с путём файла и зависимостями

**`FileSystemWatcher`** на оба `deps.js` — при изменении переиндексирует автоматически.

## Структура `src/`

```
src/
├── extension.ts              — activate() / deactivate()
├── config/
│   └── GclConfig.ts          — парсинг gcl.json, резолв абсолютных путей
├── index/
│   ├── DepsParser.ts         — regex-парсер строк goog.addDependency(...)
│   ├── NamespaceIndex.ts     — Map<namespace, NamespaceEntry> + Map<file, entries>
│   └── IndexManager.ts       — инициализация, watcher, StatusBar
├── providers/
│   ├── DefinitionProvider.ts
│   ├── CompletionProvider.ts
│   └── HoverProvider.ts
└── util/
    └── pathUtils.ts
```

## Важные детали реализации

- `DepsParser.ts` использует regex, не AST — deps.js строго форматирован
- `DefinitionProvider` сканирует первые 100 строк целевого файла для точного позиционирования на `goog.provide`
- `CompletionProvider` триггерится на символы `'` и `"` внутри `goog.require(...)`
- Все пути в `NamespaceEntry.filePath` — абсолютные
