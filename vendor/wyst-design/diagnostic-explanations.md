---
title: "Diagnostic Explanations and Source Actions"
group: reference
section: tools
order: 610
summary: "Current diagnostic codes, explanations, suggestions, source actions, and source insights."
---

# Diagnostic Explanations and Source Actions

The compiler assigns one diagnostic kind to each emitted diagnostic.
The kind supplies the code, severity, title, explanation, help, and suggestions.
The diagnostic occurrence supplies the message and source-specific facts.

Command-line diagnostic forms are in
[Check, Format, and Diagnostics](check-format-and-diagnostics.md).
LSP delivery is in
[Editor Integration](editor-integration.md).

## Active Diagnostic Codes

The current compiler can emit these error codes:

```text
E0000-E0004
E0101-E0107, E0109-E0112
E0200-E0205, E0210-E0253
E0300-E0302, E0305-E0307, E0309-E0310
E0400-E0411
E0501-E0502, E0504-E0507
E0600-E0605
E0700-E0701
E0800-E0807
E0900
E1000, E1003
```

The current compiler can emit these warning codes:

```text
W0202-W0210, W0212-W0219
```

## Standalone Explanations

Use `wync explain` with one active code:

```sh
wync explain E0213
wync explain W0204
```

The command writes the explanation to stdout.
The output contains the title, summary, explanation, help, and suggestions.
An unknown or malformed code causes a diagnostic and exit status `1`.

## Occurrence Details

A diagnostic occurrence can add these details:

- one primary source label;
- zero or more secondary source labels;
- notes;
- a specific `why` field;
- a specific `help` field;
- suggestions;
- exact source actions; and
- source insights.

Occurrence-specific `why` and `help` text replace the general registry text.
Some emitters add the general registry text when no specific text exists.

A suggestion is text only.
The compiler does not convert suggestion text into an edit.

## Exact Source Actions

The diagnostic model supports only the `exact` source-edit applicability value.
An exact source action contains one ordered transaction.
The transaction can contain edits for multiple documents.

Each document edit contains these facts:

- the document path;
- an optional editor version;
- the complete original text; and
- ordered, non-overlapping byte-range replacements.

Each replacement contains the expected text and the replacement text.
The compiler validates the complete transaction before it changes any document.

The compiler rejects the transaction for these conditions:

- a document is missing;
- a version or original text is stale;
- a range is invalid;
- document or replacement order is invalid;
- replacements overlap; or
- expected text does not match.

A rejected transaction changes no document.
A successful transaction produces an exact inverse transaction.

Current semantic diagnostics attach exact actions in these cases:

- `W0217` can attach a `refactor.rewrite` structure-order preview.
- `W0218` can attach a `quickfix` that removes a redundant local type.

The language server also creates focused source actions.
See [Editor Integration](editor-integration.md).

## Source Insights

The current source-insight kind is `target-capability`.
It states that the selected target does not provide a required feature.

A source insight does not state a measured performance result.
Text diagnostics render it as a named line.
JSON diagnostic forms render it as structured `kind` and `message` data.
