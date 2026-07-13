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
```

Accepted explicit root-file inputs:

```sh
wync check src/boot.wyst \
  --source-root src \
  --layout layout.wyst \
  --target qemu-virt-aarch64-el2
```

The explicit mode also accepts the legacy explicit source-list shape:

```sh
wync check boot.wyst uart.wyst --layout layout.wyst
```

Validation includes:

- manifest parsing and manifest field validation in project mode;
- import-closure source discovery for project and explicit root-file modes;
- target profile validation and module `#target` compatibility checks;
- layout module parsing and semantic checking;
- source graph parsing and semantic checking with layout exports available.

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
subexpressions to locals before combining them. JSON diagnostics are emitted to
stderr as one object with schema `wync.diagnostics.v0` and a deterministic
`diagnostics` array, including non-fatal warnings when validation succeeds. The
`json` schema mirrors the in-process diagnostic model: severity, code, message,
optional primary label, secondary labels, and notes. The `lsp-json` schema is
`wync.diagnostics.lsp.v0` and emits LSP-style diagnostic objects for editor
adapters: document URI, zero-based UTF-16 ranges, numeric severity, code,
source, message, related information, and notes data.

## Diagnostics Floor

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

The renderer and JSON payloads support one primary source label, zero
or more secondary source labels, and zero or more notes. Diagnostic
suppression policy and richer machine-readable payloads are outside this
surface.

## LSP-Compatible Diagnostic JSON

`--diagnostic-format lsp-json` is the first editor-protocol bridge. It is not a
full `textDocument/publishDiagnostics` notification and does not start a
language server; it is a stable adapter payload that can be grouped by `uri`
and forwarded into an editor client. The top-level object contains `schema`
with value `wync.diagnostics.lsp.v0` and a `diagnostics` array.

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

The LSP-compatible payload is driven by the same `Diagnostic` values rendered
by text and snapshot JSON mode. Editor integrations must not reparse source to
invent diagnostics.

## Editor Completion And Hover Catalog

`wync editor-catalog` emits a deterministic JSON catalog for editor adapters.
It is intentionally a compiler-owned data surface rather than a second
editor-local vocabulary.

The catalog contains:

- `schema`: `wync.editorCatalog.v0`.
- `completionItems`: keyword, directive, intrinsic, builtin type, and reserved
  register entries.
- `label`: completion/hover lookup text.
- `category`: stable Wyst category such as `keyword`, `directive`,
  `intrinsic`, `builtin-type`, or `register`.
- `lspCompletionKind`: numeric LSP completion kind that an adapter can forward
  directly.
- `insertText`: default insertion text.
- `detail`: short completion detail.
- `hoverMarkdown`: markdown hover text for the same label.

This catalog is lexical and built-in only. It does not include user-defined
modules, functions, constants, globals, structs, enums, bitfields, labels, or
layout exports. Project-aware symbol completion is outside the lexical catalog
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
form to stdout. It does not rewrite the input file.

`wync fmt <input.wyst> --check` parses the same source, compares it with the
canonical form, exits `0` for already formatted input, and exits `1` with a
source diagnostic when the file differs.

Formatter canonicalization includes declaration annotations and imports:

- block indentation uses two spaces per nesting level;
- one declaration annotation stays as a bare `#name` line directly above the
  declaration;
- two or more declaration annotations become a single `#[a, b]` group directly
  above the declaration, sorted by this canonical directive order:
  `[aapcs, naked, inline, noreturn, trap_frame, initcall, cold, section,
  align, percpu, tls, weak, hidden]`;
- one import stays as `#import module.path`;
- two or more adjacent imports become a sorted `#import (` block with one
  import item per line and no commas.
- in a string-literal initializer for `[N]u8`, trailing `\0` bytes that the
  zero-fill rule would supply are omitted; leading or interior null bytes are
  preserved.
- comma-separated lists accept one optional trailing comma. The formatter
  omits trailing commas in single-line lists and uses a trailing comma only
  when it renders a comma list one item per line.

The formatter is AST-backed:

- it supports one source file at a time;
- it renders function-level directives such as `#inline`, `#naked`, and
  `#noreturn` as prefix lines before the function signature;
- it renders two or more declaration annotations as one grouped line such as
  `#[naked, noreturn]` directly above the declaration, while a single
  annotation remains in bare form such as `#cold`;
- it preserves one intentional blank line between block statements and collapses
  larger vertical gaps to one blank line;
- it keeps top-level constant/global facts and `#static_assert` runs dense
  instead of inserting a blank line between each declaration;
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
- it does not format project manifests;
- it does not modify files in place.

The long-term formatter direction is rustfmt-level precision: a richer
token/trivia model should eventually preserve comments, blank-line intent, and
awkward edge placements without relying on AST-only attachment heuristics.
Project-wide formatting and in-place rewrite flags are outside the formatter
surface. `wync check` remains validation-only and does not rewrite
source files or report style-only failures.
