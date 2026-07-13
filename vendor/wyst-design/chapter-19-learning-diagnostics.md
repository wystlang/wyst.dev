---
title: "Chapter 19: Wyst Learning Diagnostics And Source Insights"
group: chapter
chapter: 19
order: 19
summary: "Diagnostic explanations, learning fields, source insights, and teachable compiler feedback."
---

# Chapter 19: Wyst Learning Diagnostics And Source Insights

The diagnostic teaching surface adds explanations and source insights on top of
the stable diagnostic renderer and editor delivery path. It does not create a
second diagnostic model in editor adapters.

Explanation lookup, teaching content, and source insights extend the core
diagnostic data without changing its model.

## Diagnostic Explanation Registry

The compiler owns a registry keyed by stable diagnostic codes such as `E0210`.
Each registered entry contains:

- a code;
- a short title;
- a short summary;
- a longer explanation;
- compact `why` and `help` text for opted-in diagnostics;
- example fixes.

The registry is deliberately static and deterministic. Adding, removing, or
renaming explanations is an explicit compiler change rather than incidental
output churn.

## `wync explain`

`wync explain E####` prints the long-form explanation for a diagnostic code
without requiring a failing source file. This lets terminal users and editor
adapters offer teaching help for diagnostics that have already been reported.

The text form is compact:

```text
E0210: Duplicate top-level name

A module cannot define the same top-level name twice.

Why:
  Top-level names are module facts used by later checks and lowering.

Help:
  Rename one declaration or remove the duplicate item.

Example fixes:
  - Rename one declaration to reflect its distinct role.
```

Unknown codes fail with a normal diagnostic so scripts can distinguish missing
registry coverage from successful explanation lookup.

## Learning Coverage

The learning diagnostics corpus should cover:

- duplicate top-level names;
- syntax errors with missing delimiters;
- unknown names;
- type mismatches;
- bad intrinsic argument counts;
- inline assembly contract mistakes;
- target/profile mismatches;
- one provenance-labeled performance implication for an unavailable target
  feature.

Every diagnostic code that appears in user-facing diagnostics should be covered
by `wync explain E####`.

## Structured Diagnostic Data

Structured fields are added to the same `Diagnostic` value used by text, JSON,
and LSP-compatible JSON renderers. The fields are optional and should be present
only when they add learning value:

- `why`: a concise reason tied to a compiler fact;
- `help`: a concise next step;
- fix choices;
- source insight confidence and provenance labels.

Terminal diagnostics should stay stable and compact. JSON and LSP-compatible
diagnostics expose the same data under stable keys so editor clients can show
expandable explanations and fix choices without reparsing source.

When present, JSON diagnostics expose structured fields at the diagnostic
object level:

- `why`: string;
- `help`: string;
- `fixes`: array of `{ "label": string, "detail": string | null }`;
- `sourceInsights`: array of
  `{ "kind": string, "message": string, "confidence": string, "provenance": string[] }`.

LSP-compatible diagnostics expose the same keys under `data`. Absent optional
fields are omitted from both JSON forms so existing diagnostics keep their
stable payload shape until they opt into learning data.

For ordinary editor hovers, LSP-compatible diagnostics also fold compact
`note`, `why`, `help`, `fix`, and source-insight lines into the diagnostic
`message`. This keeps Zed and other clients useful without requiring
editor-specific rendering of custom `Diagnostic.data`.

Generic syntax errors use the registry differently from semantic learning
diagnostics: parser and lexer `E0101` diagnostics add concise `why` and `help`
context, but they do not attach generic fix choices to every parse error. The
longer examples remain available through `wync explain E0101`.

The same structured surface covers project-name diagnostics and stack lifetime
errors. Import diagnostics include structured help for unresolved or ambiguous
module namespaces, and escaped-address diagnostics identify both the source
stack lifetime and the escaping use in text, JSON, and LSP-compatible
JSON.

## Source Insights

Performance implications are source insights, not broad linting. A performance
suggestion must be high-confidence and tied to a named source rule, target
fact, lowering fact, static estimate, or measured evidence. Unlabeled
performance advice is rejected by the diagnostic policy.

The first performance implication is intentionally narrow: when a module
requires the `lse` target feature but the selected target profile does not
provide it, the diagnostic states that LSE atomic lowering is unavailable for
that profile. The confidence is `high`, and the provenance labels are `target
fact` and `lowering fact`.
