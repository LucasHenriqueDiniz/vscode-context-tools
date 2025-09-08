import * as vscode from "vscode";
import * as path from "path";

/* =========================
   Small utils
========================= */
function cfg() { return vscode.workspace.getConfiguration("ctxtools"); }

/** ES2020-safe string replaceAll for LITERAL substrings (no regex). */
function replaceAllLiteral(haystack: string, needle: string, replacement: string): string {
  if (needle === "") return haystack;
  return haystack.split(needle).join(replacement);
}

/* =========================
   Fence helpers
========================= */
function getFenceWrapper(): { open: string; close: string } {
  const style = cfg().get<"backticks" | "tildes" | "none">("fence.wrapper", "backticks");
  const count = Math.min(5, Math.max(3, cfg().get<number>("fence.count", 3)));
  if (style === "none") return { open: "", close: "" };
  const ch = style === "backticks" ? "`" : "~";
  const bar = ch.repeat(count);
  return { open: bar + " ", close: "\n" + bar };
}

function escapeFence(text: string): string {
  if (!cfg().get<boolean>("fence.escape", true)) return text;
  const style = cfg().get<"backticks" | "tildes" | "none">("fence.wrapper", "backticks");
  const count = Math.min(5, Math.max(3, cfg().get<number>("fence.count", 3)));
  if (style === "none") return text;
  const ch = style === "backticks" ? "`" : "~";
  const token = ch.repeat(count);
  // break fence markers inside content
  return text.replace(new RegExp(token, "g"), token.slice(0, count - 1) + "\u200b" + ch);
}

function workspaceForUri(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

function relPath(uri: vscode.Uri): string {
  const ws = workspaceForUri(uri);
  if (!ws) return uri.fsPath.replace(/\\/g, "/");
  return path.relative(ws.uri.fsPath, uri.fsPath).replace(/\\/g, "/");
}

function fileInfoPlaceholders(uri: vscode.Uri, language: string): Record<string, string> {
  const ws = workspaceForUri(uri);
  const p = uri.fsPath;
  const fullPath = p.replace(/\\/g, "/");
  const rp = relPath(uri);
  const filename = path.basename(p);
  const ext = path.extname(p).replace(/^\./, "");
  const dir = path.dirname(rp);
  const workspace = ws ? path.basename(ws.uri.fsPath) : "";
  return { path: rp, fullPath, filename, ext, dir, workspace, language };
}

function buildFenceHeader(mode: string, uri: vscode.Uri, language: string): string {
  const ph = fileInfoPlaceholders(uri, language);
  switch (mode) {
    case "path": return `PATH: ${ph.path}`;
    case "fullpath": return `PATH: ${ph.fullPath}`;
    case "language": return language || "";
    case "literal": return cfg().get<string>("fenceInfoLiteral", "PATH");
    case "format": {
      let tpl = cfg().get<string>("fenceHeaderTemplate", "PATH: ${path}");
      Object.entries(ph).forEach(([k, v]) => {
        tpl = replaceAllLiteral(tpl, "${" + k + "}", v);
      });
      return tpl;
    }
    case "none": default: return "";
  }
}

/* =========================
   Imports handling
========================= */
type ImportsMode = "keep" | "strip" | "placeholder";

function commentPlaceholderFor(language: string, placeholderText: string): string {
  const lower = language.toLowerCase();
  if (lower.includes("python")) return `# ${placeholderText}`;
  // default block comment
  return `/* ${placeholderText} */`;
}

function stripOrPlaceholderImports(original: string, language: string): { text: string; insertedPH: boolean } {
  const mode = cfg().get<ImportsMode>("copy.importsMode", "placeholder");
  if (mode === "keep") return { text: original, insertedPH: false };

  const placeholderText = cfg().get<string>("copy.importsPlaceholder", "{ ... imports ... }");

  const lines = original.split(/\r?\n/);
  const lower = language.toLowerCase();

  const isJsLike = /(javascript|typescript)/i.test(lower);
  const isCssLike = /(css|less|scss|sass)/i.test(lower);
  const isPy = lower.includes("python");

  let removedAny = false;
  const kept: string[] = [];

  for (const line of lines) {
    const l = line.trim();

    let isImport = false;

    if (isJsLike) {
      if (/^import\s/.test(l)) isImport = true;
      else if (/^export\s+(\*|{)/.test(l) && /\sfrom\s+['"]/.test(l)) isImport = true;
      else if (/^(const|let|var)\s+\w+\s*=\s*require\(/.test(l)) isImport = true;
    } else if (isCssLike) {
      if (/^@import\s/i.test(l)) isImport = true;
    } else if (isPy) {
      if (/^import\s+\S+/.test(l)) isImport = true;
      else if (/^from\s+\S+\s+import\s+/.test(l)) isImport = true;
    }

    if (isImport) {
      removedAny = true;
      continue; // strip line
    }
    kept.push(line);
  }

  if (removedAny && mode === "placeholder") {
    const phLine = commentPlaceholderFor(language, placeholderText);
    let insertAt = 0;
    if (kept.length > 0) {
      const first = kept[0].trim();
      if (
        first.startsWith("/*") ||
        first.startsWith("//") ||
        first.startsWith("#!") ||
        first.startsWith("# ") ||
        first.startsWith("'use ") ||
        first.startsWith('"use ')
      ) {
        insertAt = 1;
      }
    }
    kept.splice(insertAt, 0, phLine);
    return { text: kept.join("\n"), insertedPH: true };
  }

  return { text: kept.join("\n"), insertedPH: false };
}

/* =========================
   Fences (file/selection)
========================= */
async function buildFenceForUri(uri: vscode.Uri): Promise<string> {
  const doc = await vscode.workspace.openTextDocument(uri);
  const language = doc.languageId || "";
  const header = buildFenceHeader(cfg().get<string>("fenceInfoMode", "path"), uri, language);

  let content = doc.getText();
  const handled = stripOrPlaceholderImports(content, language);
  content = handled.text;

  content = escapeFence(content);

  const { open, close } = getFenceWrapper();
  if (open === "" && close === "") {
    // plain copy without fence
    return content;
  }
  const headerSpace = header ? header : "";
  return `${open}${headerSpace}\n${content}\n${close}`;
}

async function buildFenceForSelection(editor: vscode.TextEditor): Promise<string> {
  const uri = editor.document.uri;
  const language = editor.document.languageId || "";
  const header = buildFenceHeader(cfg().get<string>("fenceInfoMode", "path"), uri, language);

  const sel = editor.selection;
  const text = editor.document.getText(sel.isEmpty ? undefined : sel);
  const handled = stripOrPlaceholderImports(text, language);
  const body = escapeFence(handled.text);

  const { open, close } = getFenceWrapper();
  if (open === "" && close === "") return body;
  const headerSpace = header ? header : "";
  return `${open}${headerSpace}\n${body}\n${close}`;
}

function unique<T>(arr: T[]): T[] {
  const s = new Set<T>();
  const out: T[] = [];
  for (const x of arr) { if (!s.has(x)) { s.add(x); out.push(x); } }
  return out;
}

function getOpenTextTabUris(): vscode.Uri[] {
  const set = new Set<string>();
  const uris: vscode.Uri[] = [];
  for (const g of vscode.window.tabGroups.all) {
    for (const t of g.tabs) {
      const input = t.input as any;
      if (input?.uri instanceof vscode.Uri) {
        const key = input.uri.toString();
        if (!set.has(key)) { set.add(key); uris.push(input.uri); }
      } else if (input?.original instanceof vscode.Uri && input?.modified instanceof vscode.Uri) {
        const k1 = input.original.toString(); const k2 = input.modified.toString();
        if (!set.has(k1)) { set.add(k1); uris.push(input.original); }
        if (!set.has(k2)) { set.add(k2); uris.push(input.modified); }
      }
    }
  }
  return uris;
}

/* =========================
   Project tree
========================= */
interface TreeNode {
  name: string;
  dirs: Map<string, TreeNode>;
  files: string[];
}

function addToTree(root: TreeNode, relPathStr: string, maxDepth: number) {
  const parts = relPathStr.split("/").filter(Boolean);
  let node = root;
  for (let i = 0; i < parts.length; i++) {
    const isLast = i === parts.length - 1;
    const p = parts[i];
    const depth = i + 1;
    if (depth > maxDepth) break;

    if (isLast) {
      node.files.push(p);
    } else {
      if (!node.dirs.has(p)) node.dirs.set(p, { name: p, dirs: new Map(), files: [] });
      node = node.dirs.get(p)!;
    }
  }
}

function renderTree(node: TreeNode, prefix = ""): string[] {
  const dirNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b));
  const fileNames = [...node.files].sort((a, b) => a.localeCompare(b));

  const entries: Array<{ type: "dir" | "file"; name: string }> = [
    ...dirNames.map(n => ({ type: "dir" as const, name: n })),
    ...fileNames.map(n => ({ type: "file" as const, name: n })),
  ];

  const lines: string[] = [];
  entries.forEach((entry, idx) => {
    const isLast = idx === entries.length - 1;
    const branch = isLast ? "└─ " : "├─ ";
    if (entry.type === "file") {
      lines.push(prefix + branch + entry.name);
    } else {
      lines.push(prefix + branch + entry.name);
      const child = node.dirs.get(entry.name)!;
      const nextPrefix = prefix + (isLast ? "   " : "│  ");
      lines.push(...renderTree(child, nextPrefix));
    }
  });
  return lines;
}

function buildTreeText(rootName: string, rels: string[], maxDepth: number): string {
  const root: TreeNode = { name: rootName, dirs: new Map(), files: [] };
  for (const rel of rels) addToTree(root, rel, maxDepth);

  const lines = [rootName, ...renderTree(root)];
  return lines.join("\n");
}

function combineExcludeGlobs(base: string, names: string[], extra: string): string {
  const parts: string[] = [];
  if (base && base.trim()) parts.push(base.replace(/^\{|\}$/g, ""));
  if (extra && extra.trim()) parts.push(extra.replace(/^\{|\}$/g, ""));
  for (const n of names) {
    const clean = n.replace(/^\/+|\/+$/g, "");
    parts.push(`**/${clean}/**`);
  }
  const flat = parts.filter(Boolean).join(",");
  return "{" + flat + "}";
}

async function getTreeForWorkspace(maxFiles: number, maxDepth: number): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return "(no workspace)";
  }
  const folder = folders[0];
  const excludeBase = cfg().get<string>("tree.exclude", "");
  const excludeNames = cfg().get<string[]>("tree.excludeFolders", []);
  const extra = cfg().get<string>("tree.extraExcludeGlobs", "");
  const exclude = combineExcludeGlobs(excludeBase, excludeNames, extra);

  const uris = await vscode.workspace.findFiles("**/*", exclude, maxFiles);
  const rels = uris
    .map(u => path.relative(folder.uri.fsPath, u.fsPath).replace(/\\/g, "/"))
    .filter(r => r && !r.startsWith("."));
  return buildTreeText(path.basename(folder.uri.fsPath), rels, maxDepth);
}

/* =========================
   Markdown Doc
========================= */
async function buildMarkdownDoc(selected: vscode.Uri[] | undefined): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  const wsName = folders && folders.length > 0 ? path.basename(folders[0].uri.fsPath) : "Workspace";
  const titleTpl = cfg().get<string>("doc.title", "${workspace} Context");
  const title = replaceAllLiteral(titleTpl, "${workspace}", wsName);

  const includeTree = cfg().get<boolean>("doc.includeTree", true);
  const includeFilesMode = cfg().get<"selected-or-open" | "open-editors-only" | "selected-only">("doc.includeFiles", "selected-or-open");

  let filesToUse: vscode.Uri[] = [];
  if (includeFilesMode === "selected-or-open") {
    if (selected && selected.length > 0) filesToUse = selected;
    else filesToUse = getOpenTextTabUris();
  } else if (includeFilesMode === "open-editors-only") {
    filesToUse = getOpenTextTabUris();
  } else if (includeFilesMode === "selected-only") {
    filesToUse = selected || [];
  }

  const blocks: string[] = [];
  blocks.push(`# ${title}\n`);

  if (includeTree) {
    const maxFiles = cfg().get<number>("tree.maxFiles", 800);
    const maxDepth = cfg().get<number>("tree.maxDepth", 8);
    const tree = await getTreeForWorkspace(maxFiles, maxDepth);
    blocks.push(`## Project Tree\n\n\`\`\`\n${tree}\n\`\`\`\n`);
  }

  if (filesToUse.length > 0) {
    blocks.push("## Files\n");
    for (const uri of unique(filesToUse)) {
      const block = await buildFenceForUri(uri);
      blocks.push(block);
      blocks.push(""); // blank line
    }
  }

  return blocks.join("\n").trim() + "\n";
}

/* =========================
   Problems helpers
========================= */
function severityToString(s: vscode.DiagnosticSeverity): "Error" | "Warning" | "Info" | "Hint" {
  switch (s) {
    case vscode.DiagnosticSeverity.Error: return "Error";
    case vscode.DiagnosticSeverity.Warning: return "Warning";
    case vscode.DiagnosticSeverity.Information: return "Info";
    case vscode.DiagnosticSeverity.Hint: return "Hint";
    default: return "Info";
  }
}

function codeToString(code: string | number | { value: string | number; target?: vscode.Uri } | undefined): string | null {
  if (code === undefined || code === null) return null;
  if (typeof code === "object" && "value" in code) return String((code as any).value);
  return String(code);
}

function formatDiagnosticLine(d: vscode.Diagnostic): string {
  const sev = severityToString(d.severity);
  const line = d.range.start.line + 1;
  const col = d.range.start.character + 1;
  const code = codeToString(d.code);
  const src = d.source ? d.source : "";
  const msg = (d.message || "").replace(/\s+/g, " ").trim();
  const codePart = code ? " `" + code + "`" : "";
  const srcPart = src ? ` _(source: ${src})_` : "";
  return `- **${sev}** at ${line}:${col}${codePart}${srcPart} — ${msg}`;
}

function groupDiagnosticsByUri(diags: ReadonlyArray<[vscode.Uri, readonly vscode.Diagnostic[]]>): Map<string, { uri: vscode.Uri; list: vscode.Diagnostic[] }> {
  const map = new Map<string, { uri: vscode.Uri; list: vscode.Diagnostic[] }>();
  for (const [uri, arr] of diags) {
    if (!arr || arr.length === 0) continue;
    const key = uri.toString();
    if (!map.has(key)) map.set(key, { uri, list: [] });
    map.get(key)!.list.push(...arr);
  }
  return map;
}

async function buildProblemsSection(limitToUris?: vscode.Uri[]): Promise<string> {
  const all = vscode.languages.getDiagnostics(); // [[Uri, Diagnostic[]], ...]
  let grouped = groupDiagnosticsByUri(all);

  if (limitToUris && limitToUris.length > 0) {
    const set = new Set(limitToUris.map(u => u.toString()));
    grouped = new Map([...grouped.entries()].filter(([k]) => set.has(k)));
  }

  if (grouped.size === 0) return `# Problems\n\nNo problems found.\n`;

  const entries = [...grouped.values()].sort((a, b) => relPath(a.uri).localeCompare(relPath(b.uri)));

  const parts: string[] = [];
  parts.push(`# Problems\n`);
  for (const { uri, list } of entries) {
    const file = relPath(uri);
    parts.push(`## ${file}`);
    const ordered = [...list].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity - b.severity; // Error(0) first
      return a.range.start.line - b.range.start.line;
    });
    for (const d of ordered) parts.push(formatDiagnosticLine(d));
    parts.push("");
  }
  return parts.join("\n");
}

/* =========================
   Activation
========================= */
export function activate(context: vscode.ExtensionContext) {
  // Copy current file
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyCurrentFileAsFence", async () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return vscode.window.showInformationMessage("No active editor.");
    const out = await buildFenceForUri(ed.document.uri);
    await vscode.env.clipboard.writeText(out);
    vscode.window.setStatusBarMessage("Context Tools: Current file copied.", 2000);
  }));

  // Copy selection
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copySelectionAsFence", async () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return vscode.window.showInformationMessage("No active editor.");
    const out = await buildFenceForSelection(ed);
    await vscode.env.clipboard.writeText(out);
    vscode.window.setStatusBarMessage("Context Tools: Selection copied.", 2000);
  }));

  // Copy all open editors
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyAllOpenEditorsAsFences", async () => {
    const uris = getOpenTextTabUris();
    if (uris.length === 0) return vscode.window.showInformationMessage("No open editors.");
    const blocks: string[] = [];
    for (const u of unique(uris)) {
      blocks.push(await buildFenceForUri(u));
    }
    const out = blocks.join("\n\n");
    await vscode.env.clipboard.writeText(out);
    vscode.window.setStatusBarMessage("Context Tools: Open editors copied.", 2000);
  }));

  // Copy selected files (from Explorer selection)
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copySelectedFilesAsFences", async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
    let targets: vscode.Uri[] = [];
    if (Array.isArray(uris) && uris.length > 0) targets = uris;
    else if (uri) targets = [uri];
    else return vscode.window.showInformationMessage("Use this from Explorer context menu (select one or more files).");

    const blocks: string[] = [];
    for (const u of unique(targets)) {
      let stat: vscode.FileStat | undefined;
      try {
        stat = await vscode.workspace.fs.stat(u);
      } catch {
        stat = undefined;
      }
      if (!stat) continue;
      if (stat.type & vscode.FileType.File) {
        blocks.push(await buildFenceForUri(u));
      }
    }
    if (blocks.length === 0) return vscode.window.showInformationMessage("No regular files selected.");
    const out = blocks.join("\n\n");
    await vscode.env.clipboard.writeText(out);
    vscode.window.setStatusBarMessage("Context Tools: Selected files copied.", 2000);
  }));

  // Copy project tree
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyProjectTree", async () => {
    const maxFiles = cfg().get<number>("tree.maxFiles", 800);
    const maxDepth = cfg().get<number>("tree.maxDepth", 8);
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return vscode.window.showInformationMessage("Open a workspace first.");

    const folder = folders[0];
    const excludeBase = cfg().get<string>("tree.exclude", "");
    const excludeNames = cfg().get<string[]>("tree.excludeFolders", []);
    const extra = cfg().get<string>("tree.extraExcludeGlobs", "");
    const exclude = combineExcludeGlobs(excludeBase, excludeNames, extra);

    const uris = await vscode.workspace.findFiles("**/*", exclude, maxFiles);
    const rels = uris
      .map(u => path.relative(folder.uri.fsPath, u.fsPath).replace(/\\/g, "/"))
      .filter(r => r);
    const tree = buildTreeText(path.basename(folder.uri.fsPath), rels, cfg().get<number>("tree.maxDepth", 8));

    const { open, close } = getFenceWrapper();
    const fenced = open ? `${open}\n${tree}\n${close}` : tree;
    await vscode.env.clipboard.writeText(fenced);
    vscode.window.setStatusBarMessage("Context Tools: Project tree copied.", 2000);
  }));

  // Copy Markdown Doc summary
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyMarkdownDocSummary", async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
    let selected: vscode.Uri[] | undefined;
    if (Array.isArray(uris) && uris.length > 0) selected = uris;
    else if (uri) selected = [uri];

    const md = await buildMarkdownDoc(selected);
    await vscode.env.clipboard.writeText(md);
    vscode.window.setStatusBarMessage("Context Tools: Markdown doc copied.", 2000);
  }));

  // Open settings
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.openSettings", async () => {
    await vscode.commands.executeCommand("workbench.action.openSettings", "Context Tools");
  }));

  /* ===== Problems commands ===== */

  // Problems (all files)
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyProblemsAll", async () => {
    const md = await buildProblemsSection();
    await vscode.env.clipboard.writeText(md);
    vscode.window.setStatusBarMessage("Context Tools: Problems (all) copied.", 2000);
  }));

  // Current file + Problems
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyCurrentFileWithProblems", async () => {
    const ed = vscode.window.activeTextEditor;
    if (!ed) return vscode.window.showInformationMessage("No active editor.");
    const fence = await buildFenceForUri(ed.document.uri);
    const probs = await buildProblemsSection([ed.document.uri]);
    const out = fence + "\n\n" + probs;
    await vscode.env.clipboard.writeText(out);
    vscode.window.setStatusBarMessage("Context Tools: Current file + problems copied.", 2000);
  }));

  // Open editors + Problems
  context.subscriptions.push(vscode.commands.registerCommand("ctxtools.copyOpenEditorsWithProblems", async () => {
    const uris = getOpenTextTabUris();
    if (uris.length === 0) return vscode.window.showInformationMessage("No open editors.");
    const blocks: string[] = [];
    for (const u of unique(uris)) blocks.push(await buildFenceForUri(u));
    const probs = await buildProblemsSection(uris);
    const out = blocks.join("\n\n") + "\n\n" + probs;
    await vscode.env.clipboard.writeText(out);
    vscode.window.setStatusBarMessage("Context Tools: Open editors + problems copied.", 2000);
  }));
}

export function deactivate() {}
