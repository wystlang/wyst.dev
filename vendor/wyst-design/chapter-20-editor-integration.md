---
title: "Chapter 20: Editor Integration"
group: chapter
chapter: 20
order: 20
summary: "Editor/LSP behavior, language-server capabilities, task templates, and debug launch boundaries."
---

# Chapter 20: Editor Integration

Editor integration combines syntax highlighting assets, LSP-compatible
diagnostics, an editor completion/hover catalog, a persistent compiler-owned
language server, and editor task/debug templates.

The CLI tooling and learning-diagnostic contracts are defined in
[chapter 18](chapter-18-check-format-diagnostics.md) and
[chapter 19](chapter-19-learning-diagnostics.md). This chapter specifies
transport, LSP capabilities, packaging, and task/debug templates.

## Goals

- Keep compiler facts in `wync`; editor adapters should not own a second parser,
  checker, or project model.
- Provide a persistent language-server mode suitable for editors such as Zed.
- Preserve deterministic diagnostics, formatting, completion, and hover
  behavior across CLI and editor entry points.
- Make Zed packaging publishable without changing the compiler repository into
  an editor-only extension repository.

## Non-Goals

- Broad refactoring suites beyond narrow rename and focused high-confidence code
  actions.
- Indirect function-pointer call hierarchy, inline-assembly control-flow
  modeling, or whole-program dynamic call graphs.
- A Wyst-specific debug adapter.
- Semantic token theming as a replacement for the Tree-sitter syntax grammar.
- Editor-specific behavior that cannot be reproduced by compiler-owned
  protocol payloads.

## Architecture

The preferred shape is:

1. `wync lsp` runs as a persistent stdin/stdout language server.
2. The server reuses the same lexer, parser, semantic checker, formatter, and
   diagnostic renderers as the CLI.
3. Editor adapters only locate and launch `wync`, register language metadata,
   and forward protocol messages.
4. The Zed extension remains a thin Rust/Wasm wrapper around the compiler-owned
   language server plus the Tree-sitter grammar and highlight queries.

The Zed extension should resolve the language-server binary in this order:

1. User-configured binary path from Zed settings.
2. `wync` on the workspace `PATH`.
3. A documented local development path, if the workspace has a usable compiler
   binary.

Automatic compiler downloads require a versioning and distribution policy for
editor-distributed binaries.

## Language Server Protocol Surface

`wync lsp` starts a persistent stdio JSON-RPC server using standard
`Content-Length` framed messages. The surface handles:

- `initialize`: returns `serverInfo` for `wync` and advertises open/close, save,
  incremental change synchronization, document formatting, completion, code
  actions, hover, semantic tokens, inlay hints, signature help, folding,
  selection ranges, document links, document symbols, call hierarchy,
  definitions, references, document highlights, prepare-rename support, and
  workspace symbols.
- `textDocument/didOpen` and `textDocument/didSave`: locate the nearest
  `wyst.project`, or fall back to loose-file checking when no manifest is found.
  Loose-file checks use the nearest `layout.wyst` in the file's directory or
  ancestors when one exists; without a layout file, the server still reports
  source-only frontend diagnostics such as syntax, name, and type errors.
- `textDocument/didChange`: applies full or incremental in-memory document
  changes, debounces rapid edits, checks the latest unsaved text, and supersedes
  older pending diagnostics for the same file.
- `workspace/didChangeWatchedFiles`: refreshes diagnostics for open documents so
  changed imports, layouts, and manifests are reflected without requiring an
  edit to the active buffer.
- `textDocument/publishDiagnostics`: publishes diagnostics using the same
  `Diagnostic` values and LSP-compatible renderer as `wync check`. When a
  diagnostic has explanation fields, compact `why`, `help`, `suggestion`, and
  source-insight lines are included in the standard LSP message, while the same
  structured fields remain available under `Diagnostic.data`. Exact edits stay
  in checked code-action data rather than prose message lines.
- `textDocument/formatting`: formats the whole document through the canonical
  formatter and returns a full-document edit matching `wync fmt`.
- `textDocument/completion`: returns compiler-owned editor catalog entries plus
  names visible to the open document, including parameters, locals, top-level
  declarations from related sources, project module names, and struct/bitstruct
  fields after typed field-access prefixes.
- `textDocument/hover`: resolves the token under the cursor and returns
  compiler-owned hover markdown for editor-catalog items, top-level declarations
  (function signatures, constants, globals, and `struct`/`enum`/`bitstruct`
  types), function parameters, and in-scope local variables, plus context-aware
  signature-style `asm` facts for ordered modifiers, typed input/immediate/
  symbol/scratch parameters, results, fixed placements, stack contracts,
  semantic body binders, labels, and assembly instruction text. Top-level declarations are discovered
  through the same project/module facts used by go-to-definition; parameters and
  locals are resolved from the enclosing function's scope. Function hovers render
  the signature, while other declarations, parameters, and locals render their
  parsed source form; declaration hovers include adjacent `///` or `/** ... */`
  doc comments, and layout hovers describe dot-prefixed section names such as
  `.bss` plus `#region` fields and attributes. Numeric literals, string
  literals, operators, enum variants, payload bindings, struct members, memory
  accesses, and target/profile arguments have focused hover payloads when the
  compiler has stable facts for them.
- `textDocument/codeAction`: returns applicability-checked code actions for
  cases, including numeric literal base conversion, close-match unknown-name
  replacement, duplicate `#module` line removal, and diagnostic-backed explicit
  cast insertion for narrow type-mismatch spans. Diagnostic-backed actions carry
  diagnostic IDs, the source document version, exact ranges, expected source
  text, exact replacements, and applicability in action data. If any of those
  facts is stale or ambiguous, no edit is returned.
- `textDocument/semanticTokens/full`: returns lexer-backed semantic tokens that
  layer on top of Tree-sitter highlighting.
- `textDocument/inlayHint` and `textDocument/signatureHelp`: use parsed function
  declarations to show parameter names and active call signatures.
- `textDocument/foldingRange`, `textDocument/selectionRange`, and
  `textDocument/documentLink`: provide brace-based folding, syntax-aware
  selection ranges, and import links. Import links use project module facts when
  a manifest is present, with a loose-file fallback for module-shaped paths.
- `textDocument/documentSymbol`: returns module and top-level declaration
  symbols parsed by the compiler.
- `textDocument/definition`: resolves imported modules, top-level declarations,
  local facts where supported, and layout symbols through the typed editor
  index.
- `textDocument/references`, `textDocument/documentHighlight`, and
  `workspace/symbol`: expose project references, current-document highlights,
  and workspace symbols from typed symbol identities rather than text scans.
- `textDocument/prepareRename` and `textDocument/rename`: report the exact
  rename range/placeholder and return workspace edits for supported symbol
  renames.
- `textDocument/prepareCallHierarchy`, `callHierarchy/incomingCalls`, and
  `callHierarchy/outgoingCalls`: report resolved direct function call edges
  without claiming function-pointer or inline-assembly edges.
- `shutdown`: returns `null` and records that the server is ready to exit.
- `exit`: terminates with status `0` after `shutdown`, or status `1` if a
  client exits before shutdown.

Open documents are checked through in-memory overlays, so diagnostics,
formatting, completion, and hover can observe unsaved editor text without
forking parser or checker logic into editor adapters.

The Zed extension declares the `wync` language server and launches `wync lsp`
through a Rust/Wasm extension wrapper. It resolves the binary from Zed
`lsp.wync.binary.path` settings, then `wync` on the workspace `PATH`, then a
documented local development path.

## Typed Editor Index

The compiler owns a typed editor index as the authority for editor
navigation facts. The index is built from one source graph abstraction in both
project and loose-file modes, using the open in-memory document plus related
project, layout, and loose support sources.

The typed index owns stable identities for module declarations, top-level
definitions, vector slots, parameters, locals, enum-pattern bindings, typed
name references, and resolved direct function call sites. LSP definitions,
references, document highlights, top-level rename, declaration hover, workspace
symbols, and direct call hierarchy consume those identities instead of falling
back to token-text matches. When a semantic identity is missing or ambiguous,
the editor feature fails closed with an empty result or compact protocol error;
it does not guess from raw text.

## Type-Aware Editor Actions

Type-aware editor actions build on the typed index. Rename now
supports local typed identities in addition to top-level symbols: parameters,
locals, and enum-pattern bindings are renamed by symbol identity, so shadowed
bindings in nested scopes are not edited. Ambiguous identities and conservative
name collisions fail closed with protocol errors rather than speculative edits.

Diagnostic-backed code actions expose structured action data. A narrow
type-aware code action handles a narrow `E0213` type-mismatch case by inserting
an explicit conversion where the compiler-visible expected type comes from a typed
local/global/constant initializer or function return. The action data includes
the diagnostic ID, document version, exact range, expected text, exact
replacement, and applicability so editors can apply it without scraping
diagnostic messages. Generic suggestions never enter this edit path.

## Language Server Capabilities

The language-server surface includes:

- `textDocument/publishDiagnostics` from the same `Diagnostic` values used by
  `wync check`, including loose-file support, in-memory unsaved text, debounce,
  and watched-file refreshes.
- `textDocument/formatting` backed by the canonical formatter. Range formatting
  is outside this surface.
- `textDocument/completion` backed by the editor catalog, in-scope names,
  related project symbols, project modules, and typed field-access facts.
- `textDocument/hover` backed by compiler-owned hover facts for source,
  layout, inline assembly, literals, operators, targets, and declarations.
- `textDocument/documentSymbol`, `textDocument/definition`,
  `textDocument/references`, `textDocument/documentHighlight`,
  `workspace/symbol`, prepare/execute rename, and direct named-function call
  hierarchy.
- `textDocument/semanticTokens/full`, `textDocument/inlayHint`,
  `textDocument/signatureHelp`, `textDocument/foldingRange`,
  `textDocument/selectionRange`, `textDocument/documentLink`, and focused
  `textDocument/codeAction` checked edits.

The language server must treat project membership the same way as project
builds and checks: `wyst.project` manifests and explicit root-file mode are
compiler contracts, not editor conventions.

## Editor Task And Debug Capabilities

Editor task and debug templates expose documented compiler commands rather than
inventing editor-only behavior:

- check task: `wync check`;
- format-check task: `wync fmt --check`;
- format task: `wync fmt`;
- build task: `wync build`;
- optional run/debug task for a supported local or QEMU-backed target.

Zed does not load tasks from extensions. Zed extensions provide languages,
debuggers, themes, icon themes, snippets, and MCP servers, and Zed reads tasks
only from a project-local `.zed/tasks.json` or the global
`~/.config/zed/tasks.json`. Reference task definitions map to documented
`wync` commands rather than editor-only behavior:

- `wync check` on `$ZED_WORKTREE_ROOT` (project check);
- `wync fmt --check` on `$ZED_FILE` (canonical formatting check);
- `wync fmt` on `$ZED_FILE` (in-place canonical formatting);
- `wync build` on `$ZED_WORKTREE_ROOT` (project build).

The same `tasks.json` files add two QEMU-backed templates for the
`qemu-virt-aarch64-el2` profile that are explicit about target, ELF path, and
adapter:

- `qemu-virt run` boots the project's emitted ELF — the `wyst.project` `output`
  path — headless under
  `qemu-system-aarch64 -machine virt,virtualization=on -cpu cortex-a53`.
- `qemu-virt debug (gdbstub)` boots the same ELF frozen at reset with a QEMU
  gdbstub on `tcp::1234` (`-s -S`) for an external GDB or LLDB, or a DAP adapter
  such as CodeLLDB.

Debug integration must name the existing adapter it depends on and the emitted
artifact it launches. A Wyst-specific debug adapter is out of scope.

The gdbstub template launches the emitted ELF, so it proves the narrow debug
scenario, but it provides only source-line stepping and `x29`-chain backtraces.
Full debugger fidelity — variable values, type-aware inspection, and watch
identity — requires debug information beyond the deterministic DWARF source
floor (function and source-line rows), including
variable-location lists, type DIEs, or call-frame information (see
[chapter-23-debug-info.md](chapter-23-debug-info.md)).
