---
title: "Editor Integration"
group: reference
section: tools
order: 620
summary: "Current language-server protocol, editor catalog, Tree-sitter, and Zed integration."
---

# Editor Integration

`wync lsp` runs the compiler language server on stdin and stdout.
It uses JSON-RPC messages with `Content-Length` framing.

The server uses the compiler lexer, parser, formatter, semantic checker, and diagnostic model.
The server keeps open document text in memory.
Thus, editor requests can use unsaved text.

## Start The Server

Start the server with this command:

```sh
wync lsp
```

The command accepts these startup warning options:

```sh
wync lsp --warn-redundant-local-types
wync lsp --warn-unused-results
wync lsp --warn-structure-layout 8
```

The structure-layout threshold must be a positive byte count.
The startup options remain fixed until the server stops.
The LSP command does not accept `--warn-effectful-nesting`.

## Protocol Capabilities

The `initialize` result identifies the server as `wync`.
It advertises incremental text synchronization with open, close, and save notifications.

The server implements these document requests:

- whole-document formatting and newline on-type formatting;
- completion and hover;
- code actions;
- full and range semantic tokens;
- inlay hints and signature help;
- folding and selection ranges;
- document links and document symbols;
- definition, references, and document highlights;
- prepare-rename and rename; and
- prepare-call-hierarchy, incoming calls, and outgoing calls.

The server also implements `workspace/symbol`.
It refreshes open-document diagnostics after `workspace/didChangeWatchedFiles`.

The on-demand `wync/proof` request accepts `textDocument.uri`, an LSP `position`,
and an optional `artifact` name. Its JSON result uses the same checked products
as `wync explain proof`. LSP positions use zero-based UTF-16 units; the response
also reports the equivalent one-based UTF-8 byte position. The query checks the
current open document and selected project artifact. Another dirty open
document makes the dependency snapshot unavailable. A rejected edit never
receives facts from an earlier successful check. See
[Source-Position Proof Report](inspection-reports.md#source-position-proof-report)
for selection, evidence, and verification scope.

Completion triggers are `#`, `@`, and `%`.
Signature-help triggers are `(` and `,`.
On-type formatting triggers on a newline.

The server supports these code-action kinds:

- `quickfix`
- `refactor.rewrite`
- `source.organizeImports`

Current actions include numeric-base conversion and close-name replacement.
They also include missing imports, duplicate-module removal, and import-namespace repair.
The server can add an explicit conversion for a narrow `E0213` case.
It can preview an exact beneficial structure order.
Import organization uses the formatter's ordering and comment attachment rules.
It changes only supported top-level import spans, including their attached comments.
It preserves aliases, re-export visibility, group containers, and duplicate imports.
It does not remove unused imports. Ambiguous comment attachment produces no action.

Checked source actions can insert argument labels, remove a complete uniquely
inferable generic argument list, replace an exact Result-forwarding match with
`?`, or explicitly discard an otherwise legal abandoned call result. Each action
checks the complete edited document with the normal compiler. Call identities,
materializations, and retained expression types must agree. Labels retain source
evaluation order. The forwarding action requires unchanged success and whole
error payloads, retains the operand's explicit transfer, and requires the
compiler's exact forwarding mode. Mapped errors, recovery handlers, removed
comments, invalid documents, and ambiguous materializations produce no action.
Another dirty open document suppresses these actions until saved dependency
facts can describe the whole project. Edits carry the source text and document
version; selecting an action never grants trust or inserts ownership transfer.

All edits use the exact source-action rules in
[Diagnostic Explanations and Source Actions](diagnostic-explanations.md).
An action fails closed when its compiler facts are stale or ambiguous.

The server does not implement range formatting.
Call hierarchy contains resolved direct function calls only.

## Diagnostics

`didOpen` schedules an editor-scoped check after 75 milliseconds so syntax and
completion requests can run first.
`didChange` applies full or incremental changes and uses a 150 millisecond debounce.
An editor-scoped project check analyzes the edited module and its transitive imports.
It reuses the selected project plan, checked layout, and unchanged semantic work.
`didSave` schedules an immediate complete project check.
A newer live check cancels an older pending or running check for the same URI.
The server does not publish a completed check when a newer edit supersedes it.

An open document retains one immutable, versioned source snapshot. Editor
requests share its text and line index. An edit invalidates only transient
analysis for that document; save and watched-file events invalidate project-wide
state. Source-graph construction shares parsed modules with the editor index so
successful parses are not repeated within one request.

Incremental semantic checking records reusable results by module. A changed
module is checked again while unchanged imported modules reuse their function
checks. A changed provider invalidates its transitive importers. Project-wide
validation still runs when it is required for cross-module correctness. A
superseded live check polls its cancellation token between compiler phases and
source items, then stops without caching or publishing its partial result.

`didClose` cancels pending checks and publishes an empty diagnostic array.
Watched-file changes recheck all open documents.

The server publishes at most 256 diagnostics for one URI.
When more diagnostics exist, it publishes 255 diagnostics and one limit notice.
The notice has code `WYNC_DIAGNOSTIC_LIMIT` and severity `3`.

## Project And Loose-File Analysis

For a project document, the server selects the owning artifact plan.
If several artifacts own the document, it selects the default when possible.
It rejects an ambiguous selection when the artifact semantics differ.

A file outside every artifact closure receives a project-membership diagnostic.
The server checks that file without borrowing an artifact target or layout.

When no `wyst.project` exists, the server uses loose-file analysis.
It searches the file directory and its ancestors for `layout.wyst`.
Without a layout file, it still reports source-only syntax, name, and type diagnostics.

Formatting and syntax-based editor features remain available when project selection fails.
Typed navigation and other semantic features return no result when identity is missing or ambiguous.

## Completion, Hover, And Navigation

`wync editor-catalog` writes deterministic compiler-owned JSON to stdout.
The catalog contains syntax words, built-in types, type members, registers, and semantic operations.
It also contains checked A64 source-form facts used by editor features.

The LSP combines this catalog with facts from the current document graph.
Completion can include parameters, locals, declarations, project modules, and typed fields.
During an edit, completion reuses the last stable project source graph and replaces
the changed source in that graph. A save or watched-file change invalidates the
stable graph.

Hover can describe catalog items, declarations, parameters, locals, literals, operators, and typed fields.
It can also describe target facts, layout facts, and checked assembly facts.

Navigation uses typed symbol identities for supported declarations and local bindings.
Rename does not change a shadowed binding with a different identity.
A complete struct initializer such as `{base}` has separate field and binding
identities. Definition, references, token styling, and token-initiated rename
select the binding. `textDocument/declaration` selects the field; rename from
that field declaration selects the field identity. Renaming the binding to
`new_base` produces `{base = new_base}`. Renaming the field produces
`{new_base = base}`. Field rename requires checked identities for all matching
field references, including initializers, projections, and field designators.
Unavailable or ambiguous facts withhold the edit. Edits carry document versions
and exact source text; changed documents invalidate them.
Contextual `field_addr(pointer, .field)` selectors use the checked pointee's
exact field identity for navigation, rename, hover, and semantic tokens.
Completion in an unfinished callable projection checks its receiver in the
current lexical scope. It preserves opaque-field visibility and withholds
results when dependencies have unsaved changes. Each explicit nested projection
has its own field identity.
Import document links use project module facts when a project is available.

Static interfaces and their operations have distinct typed symbol identities.
Definition, references, rename, hover, completion, semantic tokens, inlay hints,
and signature help follow interface constraints, implementation mappings, and
qualified operation calls without treating an operation as a struct field.

Staged function signatures preserve `comptime`, type-pack, and value-pack
markers. Signature help treats every argument after the fixed prefix as an
element of the final value pack.

Ordinary callable hover and signature help share one contract renderer. They
retain parameter modes, `noescape`, result observation and mode, returned-view
relations, placements, preconditions, postconditions, concurrency clauses,
effects, and trust bounds. Direct-call help follows resolved declarations,
including aliases and explicit generic applications. Static-interface help
retains the complete declared requirement. Declaration links identify the owner.
Written effect and trust clauses describe upper bounds, not operations that
every call executes.

Exclusive call markers and receiver markers highlight `mut` as a keyword.
The marked place retains its declaration, references, and rename identity.
Adding an argument label preserves the marker as `name = mut value`.

On-demand value hover uses checked expression types, type abilities, enum
payloads, and resource transitions from the normal checker. It shows copy and
discard permissions, outcome payload custody, transfer, and terminal resolution.
It links known `must_resolve` origins to their declarations. Opaque values do
not expose their representation. These summaries add no inlay hints and perform
no separate type inference.

Checked summaries require facts for the exact source snapshot. Invalid source
produces no checked summary. Because project checking replaces one open source
at a time, summaries are withheld while another open buffer differs from disk.
Save and watched-file events expire project facts. Source contract text remains
available independently of checked value summaries.

## Binary schema tooling

Binary tooling uses the retained declaration AST. Schema names, captured
parameters, fields, child schema names, argument labels, and predicates have
separate structural roles. Navigation resolves earlier scalar fields and child
field paths without treating a schema as a native type. Contextual names such as
`where` and `bits` keep their identifier role outside the predicate and format
positions.

Checked generated functions and native types navigate to their owning schema.
The index admits these targets only from authenticated compiler declarations
whose module, source path, and declaration span match the retained schema.
Invalid schemas and similarly named authored declarations do not create targets.
Direct rename of binary schemas and their generated API declarations is not
supported. Navigation and references remain available.

The formatter preserves field and argument order, whole-field padding placement,
and comments. It keeps multiline parameter and argument lists and formats the
ordinary scalar expressions inside a schema. A commented scalar fragment keeps
its source spelling so formatting does not detach or reorder its comments.
Tree-sitter exposes the corresponding declaration, shape, argument, and predicate
nodes. These editor nodes do not replace compiler schema validation.

The accepted semantics and pending release gates are in
[Binary Formats](binary-formats.md). Generated checks retain source locations on
the authored schema; diagnostics must not point at a synthetic source buffer.

## Protocol Limits

The server rejects an LSP message body larger than 67,108,864 bytes.
It rejects a header line longer than 8,192 bytes.
It rejects a complete header block larger than 32,768 bytes.
The request body must be UTF-8.

A missing-import action searches at most 32 directory levels.
It examines at most 1,024 candidate files.

`shutdown` returns `null`.
An `exit` after `shutdown` uses process status `0`.
An `exit` before `shutdown` uses process status `1`.

## Tree-sitter Assets

The repository contains a Tree-sitter grammar in `editors/tree-sitter-wyst`.
The grammar provides syntax structure and highlighting tokens.
It does not validate a Wyst program.

The Zed extension contains highlight, bracket, outline, and override queries.
It also contains Wyst snippets.

## Zed Language Server Configuration

The Zed extension requires `lsp.wync.binary.path`.
The path must be absolute.
The extension does not search the workspace `PATH` for `wync`.

Use settings such as these:

```json
{
  "languages": {
    "Wyst": {
      "semantic_tokens": "combined"
    }
  },
  "lsp": {
    "wync": {
      "binary": {
        "path": "/absolute/path/to/wync/target/release/wync"
      }
    }
  }
}
```

Use `combined` semantic tokens so Zed keeps syntax highlighting and applies
compiler-known symbol roles. Restart the Wyst language server after this
setting changes.

For a changed document, semantic-token requests use the current source lexer
and parser without rebuilding the project index. This keeps highlighting
responsive for incomplete text. A clean document collects declarations from
reachable imports and resolves references only for the requested file.

When `binary.arguments` is absent or empty, the extension passes `lsp`.
The extension also passes configured binary environment variables.

## Zed Tasks

The file `editors/zed-wyst/tasks.json` contains four reference tasks:

- check the worktree with `wync check`;
- check the open file with `wync fmt --check`;
- format the open file in place with `wync fmt`; and
- build the worktree with `wync build`.

The extension does not install these tasks.
Copy them into project-local `.zed/tasks.json` or the global Zed tasks file.
The reference task file does not contain a QEMU or debugger task.
