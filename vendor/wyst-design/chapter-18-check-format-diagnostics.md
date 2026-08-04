---
title: "Chapter 18: Wyst Check, Format, And Diagnostics"
group: chapter
chapter: 18
order: 18
summary: "Check mode, formatter behavior, diagnostic formats, editor catalog, and syntax highlighting floor."
---

# Chapter 18: Wyst Check, Format, And Diagnostics

The tooling contract for validation-oriented commands is intentionally smaller
than the full language-server contract in
[chapter-20-editor-integration.md](chapter-20-editor-integration.md).

This chapter specifies the CLI behavior for `check` and `fmt` and the diagnostic
schemas. Editor delivery is specified in
[chapter 20](chapter-20-editor-integration.md); long-form learning explanations
are specified in [chapter 19](chapter-19-learning-diagnostics.md).

## Check Mode

`wync check` validates the same frontend build inputs as `wync build`, then
stops before IR lowering and output emission.

Accepted project inputs:

```sh
wync check .
wync check path/to/project
wync check path/to/wyst.project
wync check path/to/wyst.project --artifact NAME
```

Accepted explicit root-file inputs:

```sh
wync check src/boot.wyst \
  --source-root src \
  --layout layout.wyst \
  --target qemu-virt-aarch64-el2
```

The explicit mode also accepts a source list:

```sh
wync check boot.wyst uart.wyst --layout layout.wyst
```

Validation includes:

- manifest parsing and manifest field validation in project mode;
- import-closure source discovery for project and explicit root-file modes;
- target profile validation and module `#target` compatibility checks;
- layout module parsing and semantic checking;
- source graph parsing and semantic checking with published typed layout
  symbols available.

Project check selects the same validated artifact build plan as project build.
Without `--artifact` it uses the manifest default; `--artifact NAME` selects a
declared alternative. For `static_library`, check validates the selected
layout-free module/interface frontend and does not impose a final-link layout
or entry. `--artifact` is not accepted by explicit root-file mode.

Check mode does not:

- lower source to IR;
- create output directories;
- emit ELF or object files;
- write the manifest `output` path;
- run QEMU or perform binary inspection.

Exit behavior:

- `0`: validation succeeded; stdout is empty. Stderr is empty unless the
  compiler emitted warnings.
- `1`: frontend validation failed; stderr contains a rendered diagnostic.
- `2`: CLI arguments were invalid; stderr contains the usage diagnostic.

`wync check` accepts `--diagnostic-format text|json|lsp-json`. Text is the
default. It also accepts `--warn-effectful-nesting`, an opt-in lint that emits
warning `W0204` when one expression nests multiple calls, volatile memory
accesses, atomics, or traps; the warning asks the programmer to bind those
subexpressions to locals before combining them.

`--warn-redundant-local-types` enables `W0218` when a local initializer can be
checked without its annotation and independently produces the same local type,
initializer facts, and expression types. The warning carries an exact quick
fix that removes only the `: Type` text. It does not fire when the annotation
selects literal width, overload resolution, aggregate shape, register
placement, or another contextual typing decision.

`--warn-structure-layout MINIMUM_BYTES` enables `W0217` for an unconstrained
concrete structure whose canonical target-selected reorder candidate reduces
total size by at least the positive integer threshold. The occurrence reports
the structure, current and candidate sizes, exact reduction, why the threshold
was met, and the shared exact preview action. A warning never fires for a
zero-size benefit or a layout-constrained structure, and never presents the
reduction as a performance guarantee. `wync lsp` accepts the same startup
option; changing the LSP threshold requires restarting the server. CLI and LSP
diagnostics consume the same semantic analysis and renderer.

JSON diagnostics are emitted to
stderr as one object with a deterministic `diagnostics` array, including
non-fatal warnings when validation succeeds. The `json` payload mirrors the
in-process diagnostic model: severity, code, message,
diagnostic-kind identity, optional primary label, secondary labels, notes,
suggestions, checked code actions, and source insights. The `lsp-json` payload
emits LSP-style diagnostic objects for editor adapters: document URI, zero-based
UTF-16 ranges, numeric severity, code, source, message, related information, and
the same structured data.

## Diagnostics Floor

Every diagnostic originates from the canonical typed diagnostic-kind registry
defined in Chapter 19. Emitters select a typed kind and add occurrence-specific
facts; they do not own raw codes, severities, summaries, explanations, or
suggestion metadata. The text, JSON, LSP, editor, documentation, and standalone
explanation surfaces all consume that one registry entry.

The compiler uses the stable plain-text diagnostic renderer:

```text
error[E0001]: message
  --> path/to/file.wyst:line:column
line | source text
     | ^^^^^ label
  ::: path/to/file.wyst:other-line:other-column
line | source text
     | ^^^^^ secondary label
  note: supporting note
```

Warnings use the same renderer with `warning[W####]` as the header. Warnings do
not change check-mode exit status when no errors are present.

The renderer and JSON payloads support one primary source label, zero or more
secondary source labels, zero or more notes, generic suggestions, checked code
actions, and typed source insights. Generic prose is rendered as a
`suggestion`; only an applicability-checked exact source edit may be called a
`fix` or `code_action`.

A checked source edit has the sole applicability value `exact`. It is one
transaction over one or more source documents. Each document carries its
original text, optional editor revision, and an ordered list of non-overlapping
byte-range replacements; each replacement retains the exact text it expects to
replace. The compiler validates every document, revision, range, and expected
text before applying any replacement. A stale, unsupported, out-of-order,
overlapping, missing-document, or only partially applicable transaction leaves
all source unchanged. A successful application produces an exact inverse
transaction.

Placement failures use that same structured diagnostic. Their related labels
retain the normalized `after` edges and fixed-address source spans, while notes
render the causal section path, arithmetic operands, and its image-base,
region-origin, or fixed-address authority origin. Text, JSON, and LSP adapters
must consume this provenance rather than reconstructing a path from the final
section addresses.

## LSP-Compatible Diagnostic JSON

`--diagnostic-format lsp-json` is the first editor-protocol bridge. It is not a
full `textDocument/publishDiagnostics` notification and does not start a
language server; it is a stable adapter payload that can be grouped by `uri`
and forwarded into an editor client. The top-level object contains a
`diagnostics` array.

Each diagnostic entry contains:

- `uri`: file URI for the primary diagnostic label.
- `range`: LSP-style zero-based range. Character offsets are UTF-16 code units.
- `severity`: numeric LSP severity. `1` is error and `2` is warning.
- `code`: Wyst diagnostic code.
- `source`: always `wync`.
- `message`: diagnostic message.
- `relatedInformation`: secondary labels as LSP locations plus messages.
- `data.primaryLabel`: the primary label message, when present.
- `data.notes`: supporting diagnostic notes.
- `data.why` and `data.help`: canonical diagnostic-kind context when present.
- `data.suggestions`: generic prose choices that are not edits.
- `data.codeActions`: exact source-edit transactions with document revisions,
  ranges, expected text, replacements, and applicability data.
- `data.sourceInsights`: typed compiler observations with `kind` and `message`.

The LSP-compatible payload is driven by the same `Diagnostic` values rendered
by text and golden JSON mode. Editor integrations must not reparse source to
invent diagnostics.

## Editor Completion And Hover Catalog

`wync editor-catalog` emits a deterministic JSON catalog for editor adapters.
It is intentionally a compiler-owned data surface rather than a second
editor-local vocabulary. Its `sourceEditApplicability` field publishes the
closed applicability vocabulary; the current and only value is `exact`.

The catalog contains:

- `completionItems`: keyword, directive, intrinsic, builtin type, and reserved
  register entries.
- `builtinTypeMembers`: contextual builtin-type constants with their owner,
  member spelling, exact result type and value, evaluation class, state, and
  hover text. These are offered only after the matching type and dot; they are
  not global completion items.
- `label`: completion/hover lookup text.
- `category`: stable Wyst category such as `keyword`, `directive`,
  `intrinsic`, `builtin-type`, or `register`.
- `lspCompletionKind`: numeric LSP completion kind that an adapter can forward
  directly.
- `insertText`: default insertion text.
- `detail`: short completion detail.
- `hoverMarkdown`: markdown hover text for the same label.

This catalog is lexical and built-in only. It does not include user-defined
modules, functions, constants, globals, structs, enums, bitstructs, labels, or
published layout symbols. Project-aware symbol completion is outside the lexical catalog
surface.

Diagnostic recovery is intentionally narrow: `wync check` can report
multiple diagnostics from early top-level semantic validation, such as
duplicate top-level names and duplicate module declarations in the same source
graph. Parser errors, layout failures, target-profile failures, item-body
checking, IR lowering, and build output still stop at the first fatal
diagnostic.

## Editor Syntax Highlighting

Editor syntax-highlighting foundations should mirror the compiler lexer
vocabulary:

- a small lexical Tree-sitter grammar whose tokens mirror the compiler lexer
  vocabulary;
- editor adapters that use the grammar and query captures for Wyst comments,
  strings, numbers, keywords, directives, intrinsics, registers, and builtin
  type names.

These editor assets do not validate programs and do not define a second Wyst
syntax. `wync check` remains the source of truth for diagnostics. Editor
grammars should track the compiler's keyword, directive, intrinsic, register,
type, comment, and string highlighting floor.

## Format Mode

`wync fmt <input.wyst>` parses one source file and prints the canonical source
form to stdout. When the input is named `wyst.project`, the same command uses
the closed project-manifest parser and prints the canonical manifest form,
including kind-specific layout and companion clauses. It does not rewrite the
input file.

`wync fmt <input.wyst> --check` parses the same source, compares it with the
canonical form, exits `0` for already formatted input, and exits `1` with a
source diagnostic when the file differs.

Formatter canonicalization includes declaration annotations and imports:

- block indentation uses two spaces per nesting level;
- formatter-owned breakable syntax occupies at most 100 columns, including
  indentation; an indivisible identifier, literal, comment, or target-owned
  checked-assembly line may exceed that limit because the formatter does not
  change its contents;
- flat layouts are all-or-nothing: if a nested type, argument, or aggregate
  field breaks, its enclosing layout group is re-rendered in multiline form;
  multiline ordinary callable headers use one parameter per line, keep a
  result type flat in its final position when it fits, put `from` and `effects`
  on continuation lines, and place the body brace on its own line;
- declaration attributes use the canonical `#[name]` or `#[a, b]` form
  directly above the declaration, with catalog-defined ordering for grouped
  attributes;
- declaration-prefix modifiers, calling conventions, placements, and linkage
  remain in their canonical keyword-led positions rather than being converted
  into attributes;
- in Wyst source, adjacent standalone module imports remain standalone and are
  partitioned into private `core.*` imports, private project imports, and
  public re-exports, in that order; empty groups are omitted, non-empty groups
  have exactly one blank line between them, and module paths are sorted
  lexicographically within each group;
- an explicit Wyst `import (...)` or `pub import (...)` group remains grouped,
  preserves its syntax, sorts its entries lexicographically by module path,
  and renders one entry per line at one indentation level with a comma after
  every entry; a public group has one leading `pub` applying uniformly to all
  entries, while private explicit groups participate in the `core.*`-before-
  project order and different visibilities use separate groups or standalone
  declarations;
- selections inside a module import are sorted lexicographically by their
  original exported names; aliases and attached comments move with the entry
  they describe, while linker `import symbol` declarations do not participate
  in module-import ordering;
- in a string-literal initializer for `[N]u8`, trailing `\0` bytes that the
  zero-fill rule would supply are omitted; leading or interior null bytes are
  preserved.
- comma-separated lists accept one optional trailing comma. The formatter
  omits trailing commas in single-line lists and uses a trailing comma when it
  renders a comma list across multiple lines.

The formatter is AST-backed:

- it supports one source file at a time;
- it renders declaration-prefix modifiers and canonical `#[...]` attributes in
  their grammar-owned positions before the declaration;
- it preserves one intentional blank line between block statements, separates
  completed control-flow blocks from following statements, starts a new
  paragraph when straight-line execution returns to local bindings, separates
  a cleanup `discard` run from a following terminal transition, and collapses
  larger vertical gaps to one blank line;
- it keeps one-line constant/global facts and `#static_assert` runs dense,
  separates multiline constants from surrounding declarations and each other,
  separates fact declarations from static assertions, and preserves one
  intentional blank line between otherwise dense fact groups;
- it omits redundant parentheses around conversion expressions used as postfix
  bases, such as `relens<@T>(address).store(value)`;
- it renders fixed byte-array string initializers in canonical unpadded form,
  while leaving `string`, non-`u8` arrays, and brace array literals unchanged;
- it keeps layout-module placement and symbol groups dense instead of inserting
  a blank line between every top-level layout declaration;
- it preserves line and block comments that sit between declarations, fields,
  switch arms, or statements, including same-line trailing comments;
- it rejects only comment placements the AST-backed printer cannot safely
  attach yet, such as comments embedded inside expressions;
- it rejects syntax placeholders that the parser cannot round-trip;
- it does not run semantic analysis or require a layout file;
- for `wyst.project`, it emits canonical project, artifact, clause, policy,
  verification, `layout .environment`, and `static_library` ordering without
  resolving target profiles or reading a source layout;
- it does not modify files in place.

The long-term formatter direction is rustfmt-level precision: a richer
token/trivia model should eventually preserve comments, blank-line intent, and
awkward edge placements without relying on AST-only attachment heuristics.
Project-wide formatting and in-place rewrite flags are outside the formatter
surface. `wync check` remains validation-only and does not rewrite
source files or report style-only failures.

Outcome diagnostics use the canonical typed diagnostic registry. Check mode
rejects category conversion, first-class interactive use, missing/duplicate
handlers, mismatched forwarding, illegal `?`, nonexhaustive or mismatched
expression matches, invalid sum payload capability, progress escape/capture,
invalid or exceeded handler ceilings, denied arm effects or `trap`, cleanup escape,
terminal local borrows, and invalid C output obligations. The formatter emits
the single Chapter 26 spelling and no compatibility alternative.
