---
title: "Wyst Source Of Truth"
group: manual
order: 0
summary: "Current design authority and conflict resolution."
---

# Wyst Source Of Truth

Wyst is a hobby language under active development. The compiler is whatever the
current source builds, and the documentation describes that source. The
language and compiler have no version and make no backwards-compatibility
promise. Git records history; superseded designs, migration paths, publication
records, and release metadata do not belong in the compiler or manual.

## Authority Order

When required prose, grammar, IR documentation, ABI rules, object schemas, or
examples conflict, use this order:

1. The owning design chapter for the user-visible rule.
2. Appendix B for lexical grammar, parseability, and disambiguation.
3. Chapter 15 for ABI behavior and Chapter 16 for emitted artifacts.
4. Appendix A for compiler-internal IR shape and verifier invariants.
5. Tests and examples as evidence of current behavior.

User-visible semantics win over an internal representation or stale test.
Correct the lower-authority source when resolving a conflict.

## Machine-Readable Catalogs

Checked-in catalogs own closed vocabularies where maintaining one definition
prevents compiler and tooling drift:

- [syntax-words.tsv](syntax-words.tsv) owns source words.
- [meta-operation-catalog.tsv](meta-operation-catalog.tsv) owns meta operations.
- [attribute-catalog.tsv](attribute-catalog.tsv) owns declaration attributes.
- [builtin-type-members.tsv](builtin-type-members.tsv) owns contextual members
  of builtin types, including their exact typed compile-time values.
- [semantic-operation-catalog.tsv](semantic-operation-catalog.tsv) owns
  qualified semantic operations.
- [hardening-catalog.tsv](hardening-catalog.tsv) owns the closed set of
  artifact-selected generated checks, source obligations, failure paths,
  target sequences, and compiler constraints.
- [generic-bounds.tsv](generic-bounds.tsv) owns generic capabilities.
- [sealed-core.tsv](sealed-core.tsv) owns compiler-bundled `core` namespaces,
  their public declaration surfaces, source modules, and operation-contract
  identities.
- [atomic-matrix.json](atomic-matrix.json) owns supported atomic combinations.
- [link-format-catalog.tsv](link-format-catalog.tsv) owns the versioned static
  link representations and content bindings.
- [link-interface-schema.tsv](link-interface-schema.tsv) owns canonical
  semantic-interface records.
- [a64-link-relocations.tsv](a64-link-relocations.tsv) and
  [a64-link-veneers.tsv](a64-link-veneers.tsv) own the accepted static AArch64
  relocation behavior and every permitted veneer recipe.

Compiler-owned declaration roles live directly beside their implementation and
are validated against the bundled source declaration.

The A64 data files are offline compiler inputs for instruction selection,
encoding, decoding, checked assembly, and target behavior. Generated copies
must remain reproducible from the inputs they replace.

## Change Process

Make a language change across the implementation and the documentation that
describes current behavior. Update regression tests whose expectations changed
intentionally, and retain or add focused tests that catch plausible unrelated
breakage.

Delete replaced parsers, aliases, adapters, schema readers, ABI paths, fixtures,
and diagnostics unless the current design still uses them.

Tests are regression guards, not permanent language contracts. Prefer tests of
observable parsing, diagnostics, lowering, emitted bytes, and runtime behavior
over tests that lock documentation wording, internal registries, provenance
graphs, or process checklists.
