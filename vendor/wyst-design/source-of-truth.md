---
title: "Wyst Source of Truth"
group: manual
order: 0
summary: "Design authority and conflict resolution."
---

# Wyst Source of Truth

Wyst is a hobby language under active development. The compiler is whatever the
current source builds, and the documentation describes that source. The
language and compiler have no version and make no backwards-compatibility
promise. Git records history; superseded designs, migration paths, publication
records, and release metadata do not belong in the compiler or manual.

## Authority Order

When required prose, grammar, IR documentation, ABI rules, object schemas, or
examples conflict, use this order:

1. The owning reference topic for the user-visible rule.
2. [Formal Grammar](formal-grammar.md) for lexical grammar, parseability, and disambiguation.
3. [ABI Specification](abi.md) for ABI behavior and
   [Artifact and Object Formats](artifact-and-object-formats.md) for emitted artifacts.
4. [Intermediate Representation](intermediate-representation.md) for compiler-internal
   IR shape and verifier invariants.
5. Tests and examples as evidence of compiler behavior.

User-visible semantics win over an internal representation or stale test.
Correct the lower-authority source when resolving a conflict.

## Architectural Decisions

Accepted records under [`../docs/adr/`](../docs/adr/) preserve the rationale
for hard-to-reverse decisions and constrain the next coherent language change.
They do not override an owning reference topic as a description of compiler
behavior. When an accepted decision becomes executable semantics, update its
owning reference topics, implementation, catalogs, and regression tests together; do
not make the manual claim behavior that the compiler does not enforce.

## Machine-Readable Catalogs

Checked-in catalogs own closed vocabularies where maintaining one definition
prevents compiler and tooling drift:

- [syntax-words.tsv](catalogs/language/syntax-words.tsv) owns source words.
- [meta-operation-catalog.tsv](catalogs/language/meta-operation-catalog.tsv) owns meta operations.
- [attribute-catalog.tsv](catalogs/language/attribute-catalog.tsv) owns declaration attributes.
- [builtin-type-members.tsv](catalogs/language/builtin-type-members.tsv) owns contextual members
  of builtin types, including their exact typed compile-time values.
- [integer-type-families.tsv](catalogs/language/integer-type-families.tsv) owns primitive integer
  spelling prefixes, signedness, and supported value-width ranges.
- [semantic-operation-catalog.tsv](catalogs/language/semantic-operation-catalog.tsv) owns
  qualified semantic operations.
- [generic-bounds.tsv](catalogs/language/generic-bounds.tsv) owns generic capabilities.
- [sealed-core.tsv](catalogs/language/sealed-core.tsv) owns compiler-bundled `core` namespaces,
  their public declaration surfaces, versioned surface digests, source modules,
  and operation-contract identities. The compiler requires an exact catalog and
  public-source bijection before binding.
- [atomic-matrix.json](catalogs/language/atomic-matrix.json) owns supported atomic combinations.
- [link-format-catalog.tsv](catalogs/language/link-format-catalog.tsv) owns the versioned static
  link representations and content bindings.
- [link-interface-schema.tsv](catalogs/language/link-interface-schema.tsv) owns canonical
  semantic-module-interface records.
- [a64-link-relocations.tsv](catalogs/aarch64/source/a64-link-relocations.tsv) and
  [a64-link-veneers.tsv](catalogs/aarch64/source/a64-link-veneers.tsv) own the accepted static AArch64
  relocation behavior and every permitted veneer recipe.

Compiler-owned declaration roles live directly beside their implementation and
are validated against the bundled source declaration.

The A64 data files are offline compiler inputs for instruction selection,
encoding, decoding, checked assembly, and target behavior. Generated copies
must remain reproducible from the inputs they replace.

[A64 Compiler-Semantic Catalog](a64-compiler-semantics.md) is the readable index
for those compiler-consumed ARM64 tables.

## Change Process

Make a language change across the implementation and the documentation that
describes current behavior. Update regression tests whose expectations changed
intentionally, and retain or add focused tests that catch plausible unrelated
breakage.

[Documentation Example Contracts](documentation-examples.md) defines the markers
and executable checks used by reference examples.

Delete replaced parsers, aliases, adapters, schema readers, ABI paths, fixtures,
and diagnostics unless the current design still uses them.

Tests are regression guards, not permanent language contracts. Prefer tests of
observable parsing, diagnostics, lowering, emitted bytes, and runtime behavior
over tests that lock documentation wording, internal registries, provenance
graphs, or process checklists.
