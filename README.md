# Context Tools (VS Code / VSCodium)

LLM-friendly copy utilities for your codebase. Quickly copy the **current file**, **selection**, **all open editors**, the **project tree**, and even **Problems** (diagnostics) — all as tidy fenced blocks that are easy to paste into chats or issues.

## Why

When asking for help (or filing a bug), you often need a small stack of files plus a sense of the project structure. This extension automates that:

- Adds a `PATH:` header to each fence so readers immediately know which file they’re seeing.
- Optionally strips or placeholders the import lines to reduce noise for LLMs.
- Builds a compact project **tree** with sensible ignores.
- Can include **Problems** (errors/warnings) alongside your code.

---

## Commands (Command Palette)

- **Context Tools: Copy Current File**
- **Context Tools: Copy Selection**
- **Context Tools: Copy Open Editors**
- **Context Tools: Copy Selected Files** (Explorer context menu)
- **Context Tools: Copy Project Tree**
- **Context Tools: Copy Markdown Doc** (Tree + Files)
- **Context Tools: Copy Problems (All Files)**
- **Context Tools: Copy Current File + Problems**
- **Context Tools: Copy Open Editors + Problems**
- **Context Tools: Open Settings**

> Explorer context menu:
>
> - **Copy Selected Files**
> - **Copy Markdown Doc**

### Default Keybindings

- **Copy Current File:** `Ctrl+Alt+C` (`Cmd+Alt+C` on macOS)
- **Copy Open Editors:** `Ctrl+Alt+M` (`Cmd+Alt+M`)
- **Copy Project Tree:** `Ctrl+Alt+T` (`Cmd+Alt+T`)

---

## Output Examples

### File fence

````text
``` PATH: src/app/page.tsx
/* { ... imports ... } */

export default function Page() {
  return <div>Hello</div>;
}


### Problems list

```text
# Problems

## src/app/page.tsx
- **Error** at 10:5 `2304` _(source: ts)_ — Cannot find name 'Foo'.
- **Warning** at 12:1 _(source: eslint)_ — Unexpected console statement.
```

### Project tree

```text
my-project
├─ src
│  ├─ index.ts
│  └─ lib
│     └─ util.ts
└─ package.json
```

---

## Settings

**Fence header & wrapper**

- `ctxtools.fenceInfoMode`: `"path" | "fullpath" | "language" | "literal" | "format" | "none"`  
  _Default:_ `"path"`. Controls the text after ```/~~~ (header).
- `ctxtools.fenceInfoLiteral`: string used when mode = `"literal"`. _Default:_ `"PATH"`.
- `ctxtools.fenceHeaderTemplate`: used when mode = `"format"`.  
  Placeholders: `${path}`, `${fullPath}`, `${filename}`, `${ext}`, `${dir}`, `${workspace}`, `${language}`.  
  _Default:_ `"PATH: ${path}"`.
- `ctxtools.fence.wrapper`: `"backticks" | "tildes" | "none"`. _Default:_ `"backticks"`.
- `ctxtools.fence.count`: number of fence characters (3–5). _Default:_ `3`.
- `ctxtools.fence.escape`: escape inner fences to avoid accidental closure. _Default:_ `true`.

**Imports handling (to reduce LLM noise)**

- `ctxtools.copy.importsMode`: `"keep" | "strip" | "placeholder"`. _Default:_ `"placeholder"`.
- `ctxtools.copy.importsPlaceholder`: placeholder text when using `"placeholder"`. _Default:_ `"{ ... imports ... }"`.

**Project tree**

- `ctxtools.tree.maxFiles`: max files to scan. _Default:_ `800`.
- `ctxtools.tree.maxDepth`: max directory depth. _Default:_ `8`.
- `ctxtools.tree.exclude`: base exclude glob; merged with the others.
- `ctxtools.tree.excludeFolders`: array of folder names to ignore.  
  _Default:_  
  `[".git","node_modules","dist","build",".cache",".venv","__pycache__",".idea",".vscode","coverage",".pytest_cache",".mypy_cache","out","target",".next",".turbo"]`
- `ctxtools.tree.extraExcludeGlobs`: extra globs to ignore (e.g., images/binaries).

**Markdown doc**

- `ctxtools.doc.includeTree`: include the project tree. _Default:_ `true`.
- `ctxtools.doc.includeFiles`: `"selected-or-open" | "open-editors-only" | "selected-only"`.  
  _Default:_ `"selected-or-open"`.
- `ctxtools.doc.title`: title template. _Default:_ `"${workspace} Context"`.

---

## Development

1. `npm install`
2. `npm run compile`
3. Press **F5** in VS Code to launch the Extension Development Host.
4. Optional packaging: `npx vsce package` (generates a `.vsix`)  
   Install from VSIX via the Extensions view overflow menu.

### Build targets

The extension uses modern TS settings (e.g., `es2021` libs) so methods like `String.prototype.replaceAll` work. If you change `tsconfig.json`, keep that in mind.

---

## Notes & Limitations

- Clipboard is __plain text__. To _attach files_ to chats, drag-and-drop from your OS instead.
- Very large selections or many open editors produce large clipboards; consider using the Markdown doc command to bundle context more compactly.

---

## License

MIT
