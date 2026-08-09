---
title: "Check, Format, and Diagnostics"
group: reference
section: tools
order: 600
summary: "Current command forms for validation, formatting, and diagnostic output."
---

# Check, Format, and Diagnostics

This reference describes the `wync check` and `wync fmt` commands.
It also describes the diagnostic forms that these commands use.

Diagnostic explanations are in
[Diagnostic Explanations and Source Actions](diagnostic-explanations.md).
Language-server behavior is in
[Editor Integration](editor-integration.md).

## Check Mode

Use project mode to check one artifact from a `wyst.project` file:

```sh
wync check .
wync check path/to/project
wync check path/to/wyst.project
wync check path/to/wyst.project --artifact NAME
```

Without `--artifact`, the compiler selects the default artifact.
Project mode reads the target and source graph from the manifest.
Project mode does not accept `--target`.

Use explicit mode to check one or more source roots:

```sh
wync check src/boot.wyst \
  --source-root src \
  --layout layout.wyst \
  --target qemu-virt-aarch64-el2

wync check boot.wyst uart.wyst --layout layout.wyst
```

Explicit mode requires `--layout`.
Each `--source-root` adds a directory for import discovery.
Explicit mode does not accept `--artifact`.

`wync check` performs these operations:

- It parses and validates the manifest in project mode.
- It discovers the selected source graph.
- It validates target facts and source `#target` declarations.
- It checks the selected layout for explicit and final-link requests.
- It checks a static-library source graph without a final-link layout.
- It parses, normalizes, instantiates, and checks the source graph.
- It creates semantic interfaces in memory.
- It creates verified IR when an indexing proof requires memory-safety analysis.

The command does not perform machine lowering.
The command does not create native objects, archives, or an ELF file.
The command does not write the selected artifact output.

The checker can recover from some top-level semantic errors.
Thus, one invocation can report multiple diagnostics.
Parse errors and many later failures stop the current check.

## Check Warnings

Warnings do not cause failure when the check has no error.
The following options enable additional warnings:

- `--warn-effectful-nesting` enables `W0204`.
  It reports nested calls, volatile accesses, atomics, or traps in one expression.
- `--warn-redundant-local-types` enables `W0218`.
  It reports a removable local type annotation.
  The compiler emits the warning only when removal preserves inferred facts.
- `--warn-structure-layout N` enables `W0217`.
  `N` must be a positive byte count.
  The warning requires an exact size reduction of at least `N` bytes.

`W0217` can include an exact structure-reordering preview.
`W0218` can include an exact edit that removes the annotation.
Neither warning makes a performance claim.

## Diagnostic Formats

`wync check` accepts this option:

```sh
--diagnostic-format text|json|lsp-json
```

The default format is `text`.
Diagnostics go to stderr.
The command writes no normal output to stdout.

Text diagnostics use this form:

```text
error[E0213]: type mismatch
  --> src/boot.wyst:4:18
4 | const value: u32 = wide
  |                    ^^^^ found u64
  help: make the conversion explicit
```

A text diagnostic can contain one primary label, secondary labels, notes,
`why`, `help`, suggestions, and source insights.
Warnings use `warning[W####]`.

The `json` format writes one object with a `diagnostics` array.
Each entry contains the severity, code, and message.
An entry can also contain `primary`, `secondary`, `notes`, `why`, and `help`.
Optional arrays are `suggestions`, `codeActions`, and `sourceInsights`.

The `lsp-json` format also writes one object with a `diagnostics` array.
This output is not an LSP notification.
Each entry uses these LSP-compatible fields:

- `uri`
- `range`, with zero-based UTF-16 positions
- numeric `severity`, where `1` is error and `2` is warning
- `code`
- `source`, with the value `wync`
- `message`
- `relatedInformation`
- structured compiler data under `data`

An adapter can group these entries by `uri`.
The adapter must not treat the object as a framed LSP message.

## Exit Status

`wync check` and `wync fmt` use these exit statuses:

- `0` means that the command succeeded.
- `1` means that validation, formatting, or file access failed.
- `2` means that command-line arguments were invalid.

A successful check can write enabled warnings to stderr.

## Format Mode

`wync fmt` formats exactly one file.
Without `--check`, it rewrites the input file in place:

```sh
wync fmt src/boot.wyst
wync fmt path/to/wyst.project
```

The command writes the file only when the canonical text differs.
It does not print the formatted text to stdout.

Use `--check` to test the file without changing it:

```sh
wync fmt src/boot.wyst --check
wync fmt --check src/boot.wyst
```

The check succeeds when the file is canonical.
It exits with status `1` and a diagnostic when the file differs.

For a file named `wyst.project`, the command uses the manifest parser and formatter.
For other files, the command uses the Wyst source parser and AST formatter.
Source formatting does not run semantic checking.
It does not require a layout file.

The source formatter applies these principal rules:

- It uses two spaces for each indentation level.
- It limits breakable syntax to 100 columns.
- It can leave indivisible text or target-owned assembly lines longer than 100 columns.
- It uses canonical declaration attributes and modifiers.
- It sorts module imports and selected names within their formatter groups.
- It uses multiline trailing commas for comma lists.
- It preserves supported declaration, field, arm, statement, and trailing comments.
- It preserves one intentional blank line at supported statement boundaries.
- It removes redundant postfix-base parentheses.
- It omits trailing zero bytes from fixed `[N]u8` string initializers when zero-fill supplies them.

The formatter rejects a comment position that it cannot attach safely.
For example, a comment inside an expression can cause this rejection.
The formatter also rejects parser placeholders that cannot make a stable round trip.
