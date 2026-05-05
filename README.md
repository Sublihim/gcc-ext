# gcc-ext — Google Closure Library Support for VSCode

[Русский](doc/README.ru.md)

VSCode extension that brings code navigation, autocompletion, and hover info to legacy [Google Closure Library](https://github.com/google/closure-library) projects using `goog.require` / `goog.provide`.

## Features

- **Go to Definition** — F12 on `goog.require('my.Namespace')` jumps to the `goog.provide` declaration in the source file. Also works on namespace symbols used in code (`new my.Namespace()`, `my.Namespace.method()`).
- **Autocompletion** — Ctrl+Space inside `goog.require('...')` shows all known namespaces filtered by the typed prefix.
- **Hover** — Hovering over a namespace string shows the source file path, its `requires` dependencies, and the JSDoc comment from the target file.
- **Auto-reindex** — Both `deps.js` files are watched; the index updates automatically when they change.
- **Status bar** — Shows index state: `GCL: indexing...` → `GCL: 4521 ns`.

## Requirements

- Your project must use `goog.provide` / `goog.require` (legacy Closure style, not `goog.module`).
- A `deps.js` file must exist that lists all project namespaces via `goog.addDependency(...)`.
- The full `google-closure-library` source must be available locally (the extension reads its own `deps.js`).

## Setup

**1. Create `gcl.json` in your project root:**

```json
{
  "depsFile": "./deps.js",
  "depsRoot": ".",
  "closureLibraryRoot": "../project-libs/closure-library",
  "externsGlob": ["./externs/**/*.js"],
  "projectRoot": "./js",
  "folders": [
    ".",
    "../project-a",
    "../project-b",
    "../project-libs"
  ]
}
```

| Field | Description |
|---|---|
| `depsFile` | Path to your project's `deps.js`, relative to `gcl.json` |
| `depsRoot` | Root directory that paths inside your `deps.js` are relative to (defaults to `.`) |
| `closureLibraryRoot` | Path to the `google-closure-library` directory |
| `externsGlob` | Glob patterns for extern files (optional) |
| `projectRoot` | Root directory of your JS source files |
| `folders` | List of folders to include in the VSCode Multi-root Workspace (optional) |

**2. Open the project folder in VSCode.** The extension activates automatically when `gcl.json` is detected.

**3. Check the status bar** — `GCL: N ns` confirms the index is ready.

## How It Works

The extension reads `deps.js` (never scans source files) to build an in-memory namespace→file index. Two files are indexed:

1. Your project's `deps.js` (`depsFile` from `gcl.json`)
2. The closure-library's own `deps.js` (`<closureLibraryRoot>/closure/goog/deps.js`)

Paths in **your project's** `deps.js` are resolved relative to `depsRoot` (defaults to the workspace root).  
Paths in the **closure-library** `deps.js` are resolved relative to `<closureLibraryRoot>/closure/goog/` — the directory where `base.js` lives.

## Commands

| Command | Description |
|---|---|
| `GCL: Show Index Stats` | Displays total number of indexed namespaces |
| `GCL: Reindex` | Forces a full re-read of both `deps.js` files |
| `GCL: Generate Workspace File` | Creates `gcc.code-workspace` from the `folders` list in `gcl.json` |

After running **GCL: Generate Workspace File**, VSCode will prompt you to open `gcc.code-workspace`. Opening it switches VSCode to Multi-root Workspace mode — all folders from `gcl.json` appear in the Explorer.

## Development

```bash
git clone https://github.com/Sublihim/gcc-ext
cd gcc-ext
npm install
npm run compile
```

Open in VSCode and press **F5** to launch an Extension Development Host with the extension active.

```bash
npm run watch   # incremental compile on save
npm run lint    # ESLint
vsce package    # build .vsix for manual install
```

## Limitations

- Only `goog.provide` / `goog.require` style is supported (`goog.module` is not).
- Navigation relies on `deps.js` being up to date — files not listed there are invisible to the extension.
- Externs indexing and diagnostic warnings are planned for a future release.

## License

MIT
