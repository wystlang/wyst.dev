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

[Modules and Symbol Boundaries](modules-and-symbol-boundaries.md) owns declaration
scope, typed static storage addresses, and inferred type identity.
[Check, Format, and Diagnostics](check-format-and-diagnostics.md) owns canonical
source width, match-arm layout, returned-view clause layout, and import comment attachment.
[Editor Integration](editor-integration.md) owns canonical import actions,
complete callable help, checked value and custody summaries, and checked syntax
rewrites. [Check, Format, and Diagnostics](check-format-and-diagnostics.md) also
owns the opt-in unused-result warning.
[Intermediate Representation](intermediate-representation.md) owns constant
array lengths in layouts, initialization, and callable ABI contracts.
[Type System](type-system.md#bitstruct-types) owns bitstruct field carriers,
nominal identity, literal rules, and the exclusion of opaque fields. It also
owns contextual field-address selection and complete struct initializer shorthand; [Editor Integration](editor-integration.md)
owns its separate field and binding navigation and rename identities.
The Type System also distinguishes indexed value copies from borrowed slices;
address-taking retains the projected storage lease.
[Memory Model](memory-model.md#typed-addresses-and-views) owns the backing-storage
constraints on owners, backing storage, and aliases of a returned exclusive loan.
It also owns the propagation of outcome-qualified loans and scoped address facts
through aggregate payloads.
[Inspection Reports](inspection-reports.md) owns reference execution of repeated
value definitions and their materialized local storage.
It also owns compiler-fact comparison and source-position proof queries. These
queries expose authenticated facts from the selected source snapshot.
[Binary Formats](binary-formats.md) owns sequential wire schemas, checked
dependent expressions, generated native storage and operations, and their
failure and source-location contracts. Wire layout is separate from native
type layout.
[Functions and Control Flow](functions-and-control-flow.md) owns explicit
scoped `noescape` locals, aggregate borrowing contracts, suspension boundaries,
name-first parameter contracts, exclusive-loan call markers, their receiver
spelling, and stackless typed static scalar access.
[Semantic Operations and Hardware Declarations](semantic-operations.md)
owns the returning four-word SMC boundary.
[Interfaces and Implementations](interfaces-and-implementations.md) owns
borrowed `noescape @Self` requirements, exact conformance, and exclusion of
receiver-origin results.
[Entry Contracts](entry-contracts.md) owns the Apple m1n1 handoff parameters,
profile-selected stack scratch, pinned readonly entry snapshots, and checked
42-bit stack-alias deltas, including named values checked at final placement,
and profile-owned stack establishment in source-managed naked entries.
[A64 Compiler Semantics](a64-compiler-semantics.md) owns exact platform-gated
VHE entry access derivation, read-only Apple CPU-local FIQ admission checks,
finite translation-write authority, and selected
platform authentication of conditional system-register words in lowering reports;
[Target Profiles](target-profiles.md) owns the selected Apple maintenance limits
and the four-CPU QEMU redistributor admission, local timer setup, and addressed SGI contract.
[AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md)
owns vector installation destinations, including EL1 state selected through
the independently authorized EL2 `VBAR_EL12` accessor.

[Named Layouts and Placement](named-layouts-and-placement.md) owns final-placement
assertions and their separation from ordinary compile-time proofs.

[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) owns the
single offer block, flat handler arms, and distinct live and stored forwarding.
Stored forwarding keeps the authenticated success type in effect analysis.

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
