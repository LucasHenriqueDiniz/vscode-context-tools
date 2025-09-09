# Changelog

All notable changes to this project will be documented here.

## [0.0.9] — 2025-09-08

### **Initial public release**

### Added

- Commands:
  - **Context Tools: Copy Current File**
  - **Context Tools: Copy Selection**
  - **Context Tools: Copy Open Editors**
  - **Context Tools: Copy Selected Files** (Explorer)
  - **Context Tools: Copy Project Tree**
  - **Context Tools: Copy Markdown Doc** (Tree + Files)
  - **Context Tools: Copy Problems (All Files)**
  - **Context Tools: Copy Current File + Problems**
  - **Context Tools: Copy Open Editors + Problems**
  - **Context Tools: Open Settings**
- Import handling for LLMs: `keep | strip | placeholder` (+ configurable `importsPlaceholder`).
- Flexible fence headers: modes `path | fullpath | language | literal | format | none`; template vars `${path}`, `${fullPath}`, `${filename}`, `${ext}`, `${dir}`, `${workspace}`, `${language}`.
- Fence wrapper options (`backticks | tildes | none`), fence length (3–5), and inner-fence escaping.
- Project tree generator with smart ignores and limits:
  - `ctxtools.tree.maxFiles`, `ctxtools.tree.maxDepth`
  - `ctxtools.tree.exclude`, `ctxtools.tree.excludeFolders`, `ctxtools.tree.extraExcludeGlobs`
- Markdown doc generator with optional project tree and dynamic title.

### Changed

- All command titles standardized to start with **“Context Tools:”** for easier discovery.
- Build target/libs updated to **ES2021** (e.g., support for `String.prototype.replaceAll`).

### Fixed

- Problems copier now picks up diagnostics reliably and de-duplicates entries.
- “Copy Open Editors” reliably includes all open editors (edge case where only one was copied).
- Minor path handling and Windows separator quirks.

### Assets

- New extension icon.

## [0.0.1–0.0.8] — Pre-release

- Internal iterations and experiments; not published to Marketplace.
