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
- Keep Zed packaging thin without changing the compiler repository into an
  editor-only extension repository.

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

## Language Server Protocol Surface

`wync lsp` starts a persistent stdio JSON-RPC server using standard
`Content-Length` framed messages. `--warn-structure-layout MINIMUM_BYTES`
enables the same canonical `W0217` threshold used by `wync check`; the startup
configuration is fixed for the server lifetime.
`--warn-redundant-local-types` likewise enables `W0218` and its exact quick fix
for the server lifetime. The surface handles:

- `initialize`: returns `serverInfo` with the name `wync` and no version or
  content identity, and advertises open/close, save,
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
  doc comments. This implemented hover contract does not yet include
  member-specific named-layout payloads. Numeric literals, string literals,
  operators, enum variants, payload bindings, struct members, memory accesses,
  and target/profile arguments have focused hover payloads when the compiler
  has stable facts for them. Concrete structure hovers additionally show compact
  canonical size, alignment, useful-data extent, structure stride, internal and
  trailing padding, ABI/constraint status, and an exact positive-size
  opportunity without a performance promise. Structure-field declaration and
  reference hovers show offset, size, alignment, preceding padding, and
  fixed-array element stride. Generic structure declarations state that layout
  depends on concrete type arguments.
- `textDocument/codeAction`: returns applicability-checked code actions for
  cases, including numeric literal base conversion, close-match unknown-name
  replacement, duplicate `module` declaration removal, and diagnostic-backed explicit
  cast insertion for narrow type-mismatch spans. Diagnostic-backed actions carry
  diagnostic IDs, the source document version, exact ranges, expected source
  text, exact replacements, and the sole applicability value `exact` in action
  data. The standard workspace edit uses versioned `documentChanges`. If any
  source transaction fact is stale, unsupported, overlapping, ambiguous, or
  only partially applicable, no replacement is applied. An unconstrained
  structure with a positive exact size reduction also offers a
  `refactor.rewrite` preview whose reordered body comes from the canonical
  semantic layout product. It preserves the checked source text and document
  version and is never applied automatically; constrained and no-benefit
  structures expose no such action.
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

## Authenticated A64 Source Domains

Editor-facing checked-assembly facts come from
`design/catalogs/aarch64/generated/a64-support-source-domains.json`.
That generated artifact is the exact join of active `source_form` support rows
with the encoding catalog; editor code must not reconstruct a mnemonic-only or
hand-maintained operand list. The current matrix contains 20 source forms: 13
in `wyst.a64.checked-asm.core` (including `adrp`) and seven in
`wyst.a64.target-structural-asm.aarch64`.

For every active row, the compiler-owned editor catalog publishes
`sourceFormId`, `sourceMnemonic`, `supportPack`, `semanticOperands`,
`operandGrammar`, nullable `aliasOf`, and the full `registerViews` and
`registerLists` projections. Each register projection retains its operand
index, semantic role, domain, and exact grammar fragment. The catalog also
publishes the current source domains and authenticated digest.

Checked-assembly mnemonic hovers consume the same generated rows and report
their operand grammar, alias identity, and register domains. The canonical
formatter treats assembly body text as target-owned and its matrix regression
iterates those same rows, proving that every authenticated grammar, alias, and
register projection survives formatting and a second formatting pass. These
editor, LSP, formatter, and documentation surfaces therefore close over the
generated 20-row domain rather than over a separately curated mnemonic set.

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
Rename, formatting, organize-imports, and checked quick fixes are all formed
from the compiler's shared exact source-edit model; multi-document rename is one
ordered transaction rather than independently generated edits.

Diagnostic-backed code actions expose structured action data. A narrow
type-aware code action handles a narrow `E0213` type-mismatch case by inserting
an explicit conversion where the compiler-visible expected type comes from a typed
local/global/constant initializer or function return. The action data includes
the diagnostic ID, document version, exact range, expected text, exact
replacement, and `exact` applicability so editors can apply it without scraping
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

For a document under a project manifest, editor analysis selects from the same
validated artifact plans as the CLI. A source or layout owned by exactly one
artifact uses that artifact. A document owned by several artifacts uses the
default when the default is one of its owners. Otherwise the plans may share an
analysis only when kind, root contract, target facts, layout choice, ordered
module/source graph, and verification demands are identical; output paths and
debug/unwind/frame-pointer policies do not affect editor semantics. Incompatible
nondefault owners fail closed and name the conflicting artifacts. The manifest
document itself uses the default artifact.

A `.wyst` file below a manifest but outside every artifact closure is not given
the default artifact's target, layout, modules, or operation catalog. It remains
in source-local syntax, formatting, lexical, and semantic analysis and receives
a project-membership diagnostic. Navigation, completion, code actions, source
maps, and typed indexes likewise do not borrow a project graph for an unowned or
ambiguously owned document.

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

The reference `tasks.json` files deliberately omit generic QEMU run and gdbstub
tasks. They are copied into arbitrary projects, while the installed `wync`
surface does not publish the repository-internal Arm64 Linux Image packager.
An editor template must not guess a compiler checkout, duplicate that envelope,
or launch the emitted EL2 ELF directly.

A project-local runner script, provided by the project, owns launch for a
supported QEMU profile. For
`qemu-virt-aarch64-el2`, it derives the Arm64 Linux `.Image` from the emitted
ELF and passes that `.Image` — never the ELF — to QEMU's `-kernel`. A gdbstub
mode performs the same preparation before it adds `-s -S`. The debugger or DAP
adapter may load the ELF separately as its symbol file. Debug integration must
name the existing adapter it depends on; a Wyst-specific debug adapter is out
of scope.

That gdbstub path provides only source-line stepping and
`x29`-chain backtraces. Full debugger fidelity — variable values, type-aware
inspection, and watch identity — requires debug information beyond the
deterministic DWARF source floor (function and source-line rows), including
variable-location lists, type DIEs, or call-frame information (see
[chapter-23-debug-info.md](chapter-23-debug-info.md)).

The editor catalog, semantic tokens, hovers, Tree-sitter grammar, and generated
editor assets share the `fn`/`offers`/`handler`/`terminal`/`handle`/progress/
failure/cancellation/defer words, `must_observe`, `requires`, `ensures`,
`reason`, `result`, `discard`, `fixed_layout_movable`, postfix `?`, expression
`match`, and the qualified `trap.fatal` semantic operation from their owning
catalogs.
Interactive-function hovers expose the return, ordered offers, and optional
uniform handler ceiling. Ordinary callable hovers retain `must_observe` in the
result signature; typed semantic and IR facts retain contract clauses and
explicit discard sites. Fatal hover identifies the explicit `u16` reason.
Drift tests reject catalog or generated-parser disagreement.
