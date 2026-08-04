---
title: "Chapter 19: Diagnostic Explanations And Source Insights"
group: chapter
chapter: 19
order: 19
summary: "Canonical diagnostic kinds, explanation parity, suggestions, checked code actions, and typed source insights."
---

# Chapter 19: Diagnostic Explanations And Source Insights

Diagnostic explanations and source insights extend the core diagnostic value.
They do not create a second diagnostic model for CLI, JSON, LSP, editors, or
documentation; every surface consumes the current compiler model directly.

## Canonical Diagnostic-Kind Registry

The compiler owns one typed diagnostic-kind registry. An emitter selects a
`DiagnosticKind`; it does not embed an independently maintained `E####` or
`W####` string. The registry is the sole owner of:

- stable code;
- severity;
- semantic subject;
- short title and summary;
- long explanation;
- concise `why` and `help` metadata;
- generic suggestions; and
- active or explicitly reserved state.

An emitter supplies occurrence-specific data such as source labels, concrete
names, values, dependency paths, notes, and checked edits. Rendering adapters
look up registry metadata from the typed kind and cannot change its code,
severity, or subject.

The registry covers errors and warnings. Repository validation scans every
reachable `E####` and `W####` emitter, verifies that it selects an active kind,
and verifies the reverse direction: every registered entry has a reachable
emitter or the explicit `reserved` state. Reserved entries are not presented as
live explanations.

One code may be shared by multiple emitters only when one subject, summary,
explanation, and suggestion set truthfully covers all of them. Otherwise the
registry defines separate kinds and codes.

`W0217` is the opt-in structure-layout opportunity. Its occurrence-specific
facts are the canonical current and candidate sizes, exact byte reduction,
configured minimum, selected candidate order, and a checked preview edit. Its
registry explanation explicitly limits the claim to memory-image size: neither
the registry nor the occurrence may promise faster execution. Generic prose
does not manufacture its edit; the semantic layout product supplies the same
exact action consumed by LSP.

`W0218` is the opt-in redundant-local-type opportunity. The checker evaluates
the initializer in isolated annotated and unannotated semantic probes and
emits the occurrence only when the inferred local type, initializer facts, and
every recorded expression type agree. Its exact quick fix removes the
annotation and its colon while preserving adjacent comments. Generic
instantiations sharing one source annotation must all prove the removal before
the warning is emitted.

The naked-code diagnostic subjects are:

| Code | Subject |
| --- | --- |
| `E0304` | a naked stack-pointer value violates the required alignment |
| `E0306` | a naked function or label can reach its end without explicit control transfer |
| `E0307` | a source `return` is used where naked code requires explicit control transfer |
| `E0308` | a naked entry parameter would arrive on the incoming stack |
| `E0309` | a naked indirect call lacks a statically verified register-only and terminality contract |
| `E0310` | `addr_of(local)` in naked code would require compiler-owned stack storage |
| `E0505` | an outgoing call from naked code would require stack arguments |

These codes do not explain system registers, ordinary memory access, atomics,
or section placement. If those subjects need distinct diagnostics, they use
their own registered kinds.

## `wync explain`

`wync explain E####` and `wync explain W####` print the active registry entry
without requiring a failing source file. Unknown and reserved codes fail with a
normal diagnostic so scripts can distinguish them from live explanation
coverage.

The text form is compact:

```text
E0210: Duplicate top-level name

A module cannot define the same top-level name twice.

Why:
  Top-level names are module facts used by later checks and lowering.

Help:
  Rename one declaration or remove the duplicate item.

Suggestions:
  - Rename one declaration to reflect its distinct role.
```

## Suggestions And Code Actions

Generic prose is a `suggestion`. Text diagnostics render it with
`suggestion:`, and structured diagnostics expose `suggestions`. A registry
example, recommended manual change, or prose choice is never called a `fix` or
`code_action`.

`fix` and `code_action` are reserved for an edit that is:

- bound to exact source documents and byte/UTF-16 ranges;
- backed by the semantic fact that makes the replacement valid;
- supplied with an exact replacement string;
- checked for applicability against the current source text; and
- rejected when the source, range, identity, or expected text has changed.

The closed applicability vocabulary contains only `exact`. An exact source edit
is an atomic transaction over one or more documents. Documents are ordered by
path; replacements are ordered by byte range and must not overlap. Each
document retains the complete original source and an optional editor revision,
and each replacement retains the exact text it expects. Before changing any
source, the compiler validates the applicability, complete document set,
revisions, original source, UTF-8 boundaries, range order, non-overlap, and
expected text. Any failure rejects the whole transaction without changing any
document. Applying a valid transaction returns an exact inverse whose expected
text and ranges describe the edited source, so apply/invert round trips cleanly.

LSP `textDocument/codeAction` transports these checked edits. Its standard
`WorkspaceEdit.documentChanges` binds edits to document revisions, while
structured action data retains the exact transaction including expected text.
An editor adapter must not convert a suggestion into an edit by parsing prose.

## Structured Diagnostic Data

Text, JSON, LSP-compatible JSON, LSP publish diagnostics, editor hovers,
generated documentation, and `wync explain` consume the same diagnostic-kind
entry. Material fields have parity across surfaces.

Occurrence data may add:

- `why`: a concise reason tied to a compiler fact;
- `help`: a concise next step;
- `suggestions`: generic prose choices from the registry or emitter;
- `codeActions`: checked atomic source-edit transactions with document,
  revision, expected-text, range, replacement, and applicability facts; and
- `sourceInsights`: typed non-edit observations.

Absent optional fields are omitted. LSP-compatible diagnostics expose the same
fields under `Diagnostic.data`; the standard `message` may include concise
`note`, `why`, `help`, and `suggestion` lines, but it does not label prose as a
fix. Code actions remain structured protocol results rather than message text.

Parser and lexer diagnostics may add concise registry context without attaching
generic edits. Project, import, target, stack-lifetime, and warning diagnostics
use the same registry and parity rules.

## Source Insights

A source insight states its kind and the current compiler observation. It does
not carry confidence or provenance bookkeeping. It cannot imply a performance
outcome without an actual operation and selected lowering difference.

When a selected target lacks `lse`, the generic observation is a
`target-capability` insight: the selected target does not provide that feature.
It becomes a performance or lowering insight only when it identifies an
affected source operation and the actual selected alternative lowering. It
must not claim a speedup, latency, throughput, or cache effect without modeled
or measured evidence and explicit limits.

## Regression Coverage

Tests validate:

- every live error and warning in both registry-to-emitter directions;
- subject-negative vocabulary, so an explanation does not mention an unrelated
  semantic subject;
- identical kind metadata on text, JSON, LSP, editor, documentation, and
  standalone explanation surfaces;
- generic suggestions never appearing as fixes or code actions;
- checked edit range, ordering, non-overlap, replacement, applicability,
  atomicity, inversion, and stale/partial-source rejection; and
- target-capability insights not claiming unsupported performance results.
