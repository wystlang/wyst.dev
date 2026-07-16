---
title: "Wyst Source Of Truth"
group: manual
order: 0
summary: "Versioned authority, conflict resolution, feature states, and schema versions."
---

# Wyst Source Of Truth

The target-architecture authority is versioned too. For A64,
`a64-authority.json` pins the upstream release and generator,
`a64-catalog.tsv` is the deterministic normalized compiler input, and
`a64-bijection.tsv` accounts for upstream records. Compiler builds consume
these checked-in files and never fetch or select an unversioned release.
[`a64-compiler-semantics.md`](a64-compiler-semantics.md) and its three checked-in
TSV catalogs attach the complete compiler-semantic contract to every admitted
instruction, register/state class, vector table, and trap frame. Functional
execution evidence remains a separate coverage axis; pinned QEMU 11.0.0
fixtures cover all 308 active instruction rows and both active structural rows.
[`a64-support-policy.json`](a64-support-policy.json) is the checked-in v0.9
activation policy. The authenticated generated
[`a64-support-manifest.json`](a64-support-manifest.json) and
[`a64-support-rows.tsv`](a64-support-rows.tsv) exactly partition all 8,955
support-bearing encoding, source-form/alias, and target-structural subjects as
active or `known_unsupported`. They record a focused ordinary-lowering,
architecture-operation, checked-assembly, and structural support profile, not
universal A64 compiler support.
[`a64-conformance-manifest.json`](a64-conformance-manifest.json) is the
generated terminal release gate for that profile. Its exact
[`a64-conformance-evidence.tsv`](a64-conformance-evidence.tsv) ledger accounts
for the same 8,955 rows as 329 active and 8,626 `known_unsupported`, with zero
unexplained or partially active rows. The digested
[`a64-conformance-policy.json`](a64-conformance-policy.json), checked-in
two-tool [`a64-conformance-oracles.tsv`](a64-conformance-oracles.tsv) fixture,
and 153-row [`a64-conformance-targets.tsv`](a64-conformance-targets.tsv) ledger
make static comparison, pinned functional execution, `v8Ap0`/`v8Ap1` active feature
predicates through authenticated `base`, `fp_simd`, and `lse` compiler
bindings, conformance-only `v9Ap7` unsupported precedence, allocation, and fuzz
evidence explicit. Every synthetic target includes `base`; normal builds and
tests gain no host-tool or network dependency.
Conformance schema, release, generator, generator-source/input, policy,
manifest, evidence, target, and static-oracle identities participate in build
identity and release evidence and are carried through generated manifests,
editor metadata, and version 7 `.wyst.a64.catalog` ELF metadata. The release
claim is complete only for the exact focused active support profile; it is not a
universal A64 conformance claim.
For checked assembly, unknown spelling precedes support lookup, a recognized
`known_unsupported` row fails for the compiler release before target-feature
availability, and only an active row may produce a target-unavailable
diagnostic. Support schema, release, generator and input identities, policy,
manifest and row digests, and the selected pack identity participate in build
identity/evidence and authenticated ELF catalog metadata; editor metadata
publishes the support identity, counts, and per-row disposition. The completed
focused Roadmap items 46-50 model activates 308 encodings for ordinary lowering
and architecture operations, keeps general-purpose checked assembly
intentionally at 12 exact source forms, adds seven target-structural-only
source forms, and supplies 308 instruction-semantic rows, 31 state contracts,
and two structural contracts. The deterministic active catalog contains 301
generated operand decoders and 10 generated typed fixups. Ordinary and
architecture encoders select its rows, while checked-assembly IR transports
parsed identities, typed operands, labels, and fixups without backend text
reconstruction. The full-authority decoder proves the complete active/known-
unsupported/reserved/unallocated word partition. There are no remaining focused
completion blockers. Universal A64 checked-assembly activation belongs to later
Roadmap item 105; the 4,023 inactive encodings and 4,603 inactive source forms
remain explicit rather than being hidden behind target availability.
Disassembly exposes every emitted word's support classification as `active`,
`known_unsupported`, `reserved`, or `unallocated`; lowering text reports publish
the same `support` value and lowering JSON publishes `supportDisposition`.
Resolved rows derive their classification from the release manifest, while
reserved and unallocated outcomes derive from the authenticated authority
partition. The classification does not
assert origin-surface activation: an encoding can be active for ordinary
lowering and architecture operations while its source form remains
`known_unsupported` in the narrower checked-assembly pack.

This document is the human-readable view of the versioned Wyst semantic
authority. The machine-readable registry is
[`design/semantic-db.json`](semantic-db.json); it owns enumerated semantic
facts such as feature states, version identifiers, operator spellings, effect
names, public vocabularies, ABI classifications, and schema names. Detailed
rules still live in the chapters and appendices under the precedence order
below.

The v0.9 runtime operation surface is the checked-in
[`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv). It owns
sealed category membership, stable semantic identity, parameters, ordering,
target plan, report identity, and delegation to earlier language owners. The
[`measurement-counter-catalog.tsv`](measurement-counter-catalog.tsv) and
[`environment-service-catalog.tsv`](environment-service-catalog.tsv) select
the fixed counter and semihost ABI contracts. The exact 88-name predecessor
inventory lives only in
[`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv); it is a
release-audit input and is deliberately absent from active parser and editor
vocabulary.

The closed v0.9 `#` surface is the 14-row
[`meta-operation-catalog.tsv`](meta-operation-catalog.tsv), which owns each
operation's legal positions, parameters, phase, result, target facts,
relocation behavior, and diagnostics contract. The complete frozen 53-name
predecessor **disposition mapping** lives only in
[`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv). No predecessor
row remains in the current syntax-word catalog. The released-v0.8 compatibility
grammar consumes its raw historical `#identifier` shape independently; neither
that grammar nor current tooling derives a name from the audit. The audit is a
release/conformance input, never a token, parser, diagnostic, alias, rewrite,
completion, hover, or highlight input.

Clause-to-test traceability is tracked in
[`design/conformance-index.md`](conformance-index.md). A semantic clause is not
complete merely because prose, examples, or compiler code changed; the clause's
conformance row must be added or updated at the same time.

Current manual snapshot:

| Surface | Version | Status | Notes |
| ------- | ------- | ------ | ----- |
| Language | `wyst.language.v0.9` | development normative snapshot | Covers the keyword-led v0.9 core syntax, closed meta-operation and attribute surfaces, hard modifiers, legacy-directive dispositions, and target-defined vector-table and trap-frame DSLs. |
| Native ABI | `wyst.nativeAbi.v0.8` | released normative snapshot | Chapter 15 owns the detailed Native and AAPCS64 rules. |
| Object/interface schema bundle | `wyst.objectInterface.v0` | implemented plus future-version rows | Chapter 16 and the semantic database own object artifact, relocation, symbol, and emitted-interface classifications. |
| Report schema bundle | `wync.reports.v1` | implemented and experimental rows | Groups the report schemas listed below. Individual report payloads still carry their own `schema` and status fields. |
| Editor/diagnostic interface schema bundle | `wync.interfaces.v1` | implemented | Groups CLI/editor/LSP adapter payloads listed below. |

Released `wync` package version `0.8.0` implements the `v0.8` release line. The
current development compiler and manual snapshot target `wyst.language.v0.9`;
rows marked implemented below are active on this development line unless they
explicitly name an earlier released version.

## Authority Order

When normative prose, grammar, IR documentation, ABI rules, object schemas, or
checked examples conflict, use this order:

1. versioned semantic clauses: this file, `design/semantic-db.json`, and the
   owning chapter section for the specific semantic rule.
2. syntax grammar: Appendix B for lexical grammar, parseability,
   disambiguation, and reserved tokens. A grammar production does not make a
   feature available unless the semantic registry marks it implemented or
   future-version normative.
3. ABI and object schemas: Chapter 15 for Wyst Native ABI and AAPCS64 interop,
   Chapter 16 for emitted artifact/object schemas, and this registry for
   schema version names.
4. conformance tests: checked examples, compiler tests, snapshots, and
   fixtures. Tests are implementation evidence; if they disagree with a
   higher authority, update the test, implementation, or semantic rule
   together.
5. explanatory examples: Appendix C governs example categories. Examples
   never create language semantics by themselves.

Appendix A wins only for compiler-internal IR shape and verifier invariants.
If Appendix A conflicts with user-visible semantics, ABI rules, or object
schemas, the higher-authority semantic, ABI, or object rule wins and Appendix A
must be corrected.

## Feature States

Every feature row uses one of these states:

| State | Meaning |
| ----- | ------- |
| Implemented | Accepted by the current compiler or emitted by the current tooling, with tests or snapshots protecting the contract. |
| Future-version normative | The rule is already chosen for a named future version or release target, but the current compiler may reject it or omit it. |
| Experimental | An available inspection/research surface or planning rule that is not a normative compatibility promise and may change or be removed without migration support. |
| Reserved | Syntax, names, encodings, or namespaces are held so future additions remain non-breaking. Reserved forms are rejected unless a later row changes their state. |
| Deprecated | Still accepted, but discouraged and scheduled for replacement or removal. A deprecated row must name the replacement or removal condition. |
| Removed | No longer part of Wyst. Implementations should reject it or treat it as an unknown construct; examples must not use it except in diagnostics. |

Features not listed here inherit the state of the nearest listed feature
family. A chapter that introduces a new externally visible syntax form, ABI
rule, report field, CLI payload, object artifact, or editor behavior must add
or update a row in this registry.

## Feature Status Registry

### Core Language

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| ARM64-first systems-language identity, deterministic lowering, no compiler-exploitable undefined behavior | Implemented | `wyst.language.v0.7` | Chapter 1 |
| Behavior taxonomy for Defined, Target-defined, Indeterminate bits, Architectural fault or trap, and Trusted-contract violation, with no category granting optimizer impossible-state assumptions | Implemented | `wyst.language.v0.8` | Chapter 1 |
| Compilation Phase Contract for phase products, semantic fact ownership, terminal report-only facts, and rendering compatibility adapters (`language.compilation-phase-contract`) | Implemented | `wyst.language.v0.8` | [chapter-25-compilation-phases.md](chapter-25-compilation-phases.md) |
| Authority-derived compiler inspection reports with typed phase products, common epistemic metadata, truthful unknown/generated/decode/allocation states, structural typed-IR dependency shape, and project-artifact read-only behavior (`tooling.authority-derived-inspection-reports`) | Experimental | `wync.reports.v1` | [chapter-21-explain.md](chapter-21-explain.md) |
| Canonical typed diagnostic-kind registry shared by error and warning emitters, explanations, CLI/JSON/LSP/editor rendering, suggestions, and checked code actions (`tooling.canonical-diagnostic-kind-registry`) | Implemented | `wync.interfaces.v1` | Chapters 18–20 |
| IR/source semantic agreement for fixed arrays, range slices, dynamic arrays, enums, aggregates, explicit address methods/units, named conversions, raw addresses, relocation origins, and alignment/fault facts (`language.ir-source-semantic-agreement`) | Implemented | `wyst.language.v0.9` | [appendix-a-ir.md](appendix-a-ir.md); Chapter 16 |
| Structural SSA construction from immutable predecessor environments, exact typed phi edges, dominance verification, and deterministic simultaneous incoming ABI transfers (`language.structural-ssa-and-incoming-abi-transfers`) | Implemented | `wyst.language.v0.8` | [appendix-a-ir.md](appendix-a-ir.md); Chapter 15 |
| Trust-boundary model for `trusted_callable<T>(address)`, raw-address assertions, raw function-pointer construction, foreign declarations, manually stated foreign effects, inline-assembly effects and clobbers, ABI overrides, and unproven library contracts | Implemented | `wyst.language.v0.9` | Chapter 1; Chapter 21 |
| Ordinary local reads require initialization on every incoming control-flow path; deliberate indeterminate-bit observation uses the explicit `MaybeUninit<T>.read_uninit()` contract | Implemented | `wyst.language.v0.9` | Chapters 9 and 11; `semantic-db.json` behavior classifications |
| Whole-object deliberate raw storage uses the non-copyable `MaybeUninit<T>` API: `uninit<T>()`, `.write`, proved `.read`, audited `.read_uninit`, `.assume_init`, and `addr_of`, with CFG-joined initialization evidence and distinct typed IR/report facts (`language.maybe-uninit-whole-object-storage`) | Implemented | `wyst.language.v0.9` | Roadmap item 53; Chapter 9; Chapter 11; Appendix A |
| Qualified semantic operations under sealed `core.arch`/`core.environment` categories, stable typed-IR/report identity, target plans, fixed counter/service descriptors, and the exact non-parser 88-name `%` removal audit (`language.semantic-operation-catalog`) | Implemented | `wyst.semantic-operation-catalog.v0.9` | [`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv); [`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv); Roadmap item 53 |
| Closed 14-form compile-time, target, and layout-query `#` surface with phase, type, target-fact, and relocation contracts (`language.meta-operation-catalog`) | Implemented | `wyst.metaOperations.v0.9` | [`meta-operation-catalog.tsv`](meta-operation-catalog.tsv); Roadmap item 54 |
| Every frozen predecessor `#` name outside the retained 14-form surface (`language.legacy-hash-directive-dispositions`) | Removed | `wyst.language.v0.9` | [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) is a non-parser release audit with no compatibility path. |
| UTF-8 source, ASCII identifiers, comments, string literals, byte character literals with ASCII direct characters and explicit byte escapes, numeric literal separators (`language.lexical-literal-surface`) | Implemented | `wyst.language.v0.8` | Appendix B, Chapter 6 |
| Semicolon-free, whitespace-insensitive source; grammar-complete statement boundaries; maximal expression continuation; brace-only control-flow bodies; bare `_` discard; and longest-match `..<`, `..=`, `..` punctuation (`language.source-lexical-contract-v0.9`) | Implemented | `wyst.language.v0.9` | Appendix B |
| One versioned syntax-word catalog with unique reserved, contextual, and unshadowable rows shared by all source tools (`language.syntax-word-catalog`) | Implemented | `wyst.syntaxWords.v0.9` | [`syntax-words.tsv`](syntax-words.tsv) |
| Keyword-led `module`, `import`, `fn`, `const`, `var`, `label`, `struct`, `enum`, and `bitstruct` declarations, with `pub` only in its canonical prefix slot and phase-correct mandatory binding initializers (`language.keyword-led-declarations-bindings`) | Implemented | `wyst.language.v0.9` | Chapters 4, 6, and 8; Appendix B |
| Punctuation-led core declarations using `#module`, `#import`, `::`, `:=`, `::=`, or an unkeyworded binding (`language.punctuation-led-core-declarations`) | Removed | `wyst.language.v0.9` | Appendix B; use the keyword-led forms. |
| Direct non-ASCII character literals truncated to `u8` (`language.truncating-non-ascii-character-literals`) | Removed | `wyst.language.v0.8` | Appendix B; use string literals for UTF-8 text or explicit `\xNN` byte escapes. |
| Scalar primitives, `bool`, fixed-width integers, `f32`/`f64`, `string`, untyped integer constants | Implemented | `wyst.language.v0.7` | Chapter 6 |
| Unshadowable named conversions `widen`, `truncate`, `signcast`, `numeric`, `bitcast`, `address`, `relens`, `qualify`, `floatcast`, `saturate`, and `truncate_bits`, with no implicit numeric conversion (`language.named-explicit-conversions`) | Implemented | `wyst.language.v0.9` | Chapter 6; Appendices A and B |
| Categorized postfix `as.<category>` conversions (`language.predecessor-categorized-conversions`) | Removed | `wyst.language.v0.9` | Use the corresponding named conversion operation. |
| `checked<T>(value)` conversion (`language.checked-conversion`) | Reserved | none | Rejected until the selected failure model is implemented. |
| Floating-point arithmetic in compile-time constants | Future-version normative | `wyst.language.next` | Chapters 6, 7, and 8 mark the accepted future surface; current compiler rejects it. |
| Declarative-placement-only `at`; `@T`, `@volatile T`, and `@mmio T` address types with visible `.load()` and `.store(value)` operations, byte-address endian methods, and exact qualifier effects (`language.explicit-address-memory-operations`) | Implemented | `wyst.language.v0.9` | Chapter 6; Chapter 9; Appendices A and B |
| Unit-explicit `byte_offset`, `element_offset`, and `field_addr`, with no typed-address `+`, `-`, `+=`, or `-=` and byte-measured relocation addends (`language.unit-explicit-address-offsets`) | Implemented | `wyst.language.v0.9` | Chapter 6; Chapter 16; Appendix A |
| Runtime `addr_of(local)` with exact local lens, addressability resource reporting, hard-register rejection, and non-escape lifetime (`language.runtime-local-address-materialization`) | Implemented | `wyst.language.v0.9` | Chapter 6; Chapter 11; Appendix A |
| `T@[address]`, `[T:N]@[address]`, `%addr_of(local)`, `%load_be`, `%load_le`, `%store_be`, `%store_le`, and typed-address arithmetic operators (`language.predecessor-address-access-syntax`) | Removed | `wyst.language.v0.9` | Use address methods and the unit-explicit named operations. |
| Effects, authority/trust facts, and generated backend resources are separate; `#[deny_effects(...)]` and effect diagnostics cover semantic effects, while `#[frame(...)]` and frame/spill/register/code-size/veneer/caller-copy facts are post-lowering resources | Implemented | `wyst.language.v0.9` | Chapter 1; Chapter 21 |
| Volatile access semantics, MMIO intent, and architectural memory type are separate; `@volatile T` records compiler-visible access ordering, `@mmio T` records programmer MMIO intent, and Device/Normal memory type comes from target/runtime mapping facts | Implemented | `wyst.language.v0.8` | Chapters 6 and 9; Appendix A |
| Arrays `[N]T`, read-only non-owning slices `[]T`, end-exclusive `[..]`/`[..<]` slice ranges, and ordinary-address `.slice(elements = count)` raw views (`language.slice-range-views`) | Implemented | `wyst.language.v0.9` | Chapter 6; Appendix B |
| Colon slices, raw `[]T{data = ..., len = ...}` descriptors, and slicing `DynamicArray<T>` directly (`language.predecessor-slice-construction-syntax`) | Removed | `wyst.language.v0.9` | Use range slices on fixed arrays/existing slices or `@T.slice(elements = count)`. |
| Explicitly imported `core.collections.DynamicArray<T>`, `#len`, and its operation-owned view surface | Implemented | `wyst.language.v0.9` | Chapters 6 and 10 |
| Authenticated sealed-core dynamic-container role for `core.collections.DynamicArray<T>`, with no prelude, name-based recognition, or implicit retention (`language.dynamic-array-core-role`) | Implemented | `wyst.language.v0.9` | Chapter 10; `semantic-db.json` `sealedCoreImportCatalog` |
| Legacy dynamic-array type spelling `[dynamic]T` (`language.legacy-dynamic-array-type-spelling`) | Removed | `wyst.language.v0.9` | Use an explicit import of `core.collections.DynamicArray<T>`. |
| By-value fixed-array parameters | Reserved | none | Chapter 6 |
| Ordinary structs, `#field_offset`, and deterministic declaration-defined layout | Implemented | `wyst.language.v0.9` | Chapter 6 |
| Expected-type `{ field = value, ... }` struct and bitstruct literals, with written-order single evaluation and complete field validation (`language.expected-type-aggregate-literals`) | Implemented | `wyst.language.v0.9` | Chapter 6 |
| Type-prefixed struct literal spellings `Type { ... }` and `Type(...)` (`language.typed-struct-literal-spelling`) | Removed | `wyst.language.v0.9` | Use an expected type and `{ field = value, ... }`. |
| `#repr(C)` and alternate struct layout modes | Reserved | none | Chapter 6; use explicit layout checks at ABI boundaries. |
| Nominal `bitstruct Name: Backing` declarations with typed boolean/integer/enum fields, single-position or inclusive contiguous locations, complete aggregate construction, exact-backing `bitcast`, range-checked writes, and shared typed-field lowering (`language.bitstruct-typed-fields`) | Implemented | `wyst.language.v0.9` | Chapter 6; Appendices A and B |
| Reusable `register_map` declarations, placed-map and standalone scalar `mmio`, nominal captured map-register snapshots, exact raw/named/modify boundaries, and one-access volatile MMIO lowering (`language.register-map-mmio-declarations`) | Implemented | `wyst.language.v0.9` | Chapters 6, 9, and 11; Appendices A and B; `semantic-db.json` `hardwareRegisterContract` |
| Shared hardware-field access narrowing, reset/read/write policy vocabulary, implicit reserved-zero and explicit reserved-one/preserve regions, and fail-closed named-write/modify availability (`language.hardware-field-policies`) | Implemented | `wyst.language.v0.9` | Chapters 6 and 11; Appendices A and B; `semantic-db.json` `hardwareRegisterContract` |
| ARM64 `system_register` declarations with nominal `u64` snapshots, exact compiler ordering, catalog-named identity, authenticated encoded target-extension selection, and no raw encoded call (`language.system-register-declarations`) | Implemented | `wyst.language.v0.9` | Chapter 11; `a64-compiler-semantics.md`; Appendices A and B; `semantic-db.json` `hardwareRegisterContract` |
| Standalone `bitfield(T)` declarations, `bits(lo, hi)`, untyped inferred field carriers, `width N`, `bit` location words, exclusive or alternate ranges, and non-contiguous field locations (`language.predecessor-bitfield-syntax`) | Removed | `wyst.language.v0.9` | Use `bitstruct`, an explicit field carrier, and `at N` or `at A..=B`. |
| Enum representation: payload-less enums are transparent tags; payload enums are fixed two-word values with tag at offset 0 and payload at offset 8 | Implemented | `wyst.language.v0.8` | Chapter 6; Chapter 15; Chapter 23; Appendix A |
| `is` enum pattern tests for implemented enum variants | Implemented | `wyst.language.v0.8` | Chapter 8; nested patterns and compound/negated payload bindings remain reserved below. |
| Multi-field enum payload variants, tuple payload patterns, nested patterns, payload bindings in compound or negated `is` patterns | Reserved | none | Chapters 6 and 8; current compiler rejects these forms. |
| Generic functions, structs, and enums with explicit type arguments, monomorphization, the closed `wyst.genericBounds.v0.9` capability registry, and canonical generic symbols | Implemented | `wyst.language.v0.9` | Chapter 6; Chapter 16; [`generic-bounds.tsv`](generic-bounds.tsv) |
| Generic instantiation termination over canonical declaration identity plus complete type and value arguments, with exact canonical cycles permitted, strictly growing chains rejected, deterministic `wyst.genericInstantiationTrace.v0.9` traces, and resource limits reported as resource failures (`language.generics.instantiation-termination`) | Implemented | `wyst.language.v0.9` | Chapter 6; `semantic-db.json` `genericInstantiationContract` |
| Generic aliases, type-argument inference, default type arguments, value parameters, traits, interfaces, concepts, typeclasses, higher-kinded parameters | Reserved | none | Chapter 6; implementation-plan discussion is non-authoritative until reflected here. |
| `#if` compile-time conditionals over deterministic constant values | Implemented | `wyst.language.v0.8` | Chapter 6 |
| Left-to-right expression evaluation order, short-circuiting `&&`/`||`, eager `select`, source-order effect preservation, and optional effectful-nesting lint | Implemented | `wyst.language.v0.8` | Chapter 7; Chapters 9 and 13 for memory and scheduling constraints |
| Conventional arithmetic, shift, bitwise, comparison, and logical operator precedence, with non-associative comparison operators (`language.operator-precedence-and-comparison-associativity`) | Implemented | `wyst.language.v0.8` | Chapter 7; Appendix B |
| Implicit `schedule.standard` policy for ordinary code, with dependency-safe pure reordering, source-order effect and memory preservation, deterministic tie-breaking, report/build-identity recording, and no unstated implementation scheduling policy (`language.standard-scheduling-policy`) | Implemented | `wyst.language.v0.9` | Chapter 13; Chapter 22 |
| `schedule source { ... }` and `#[schedule(source)]` source-order compiler boundaries, including whole-body subject checks and preservation through mandatory inline expansion (`language.source-scheduling-boundaries`) | Implemented | `wyst.language.v0.9` | Chapter 13; Chapter 7; [`attribute-catalog.tsv`](attribute-catalog.tsv) |
| `#schedule(strict|relaxed|throughput|latency)` and predecessor `schedule.default`, `schedule.strict`, `schedule.relaxed`, `schedule.throughput`, and `schedule.latency` policy names (`language.predecessor-scheduling-modes`) | Removed | `wyst.language.v0.9` | Chapter 13; use `schedule.standard` and `schedule source`. |
| `#exact(...)` exact-code contracts for emitted instruction count, permitted instruction families, exact bytes, register assignments, prologue presence, spills, veneers, section placement, and alignment, verified after lowering against the emitted artifact and rejected when unsatisfied | Implemented | `wyst.language.v0.8` | Chapter 13 |
| Runtime `if`, if expressions, integer-range `for`, `while`, `loop`, `break`, `continue`, `goto`, statement calls, expression calls, and terminal calls for functions and labels (`language.function-label-control-flow`) | Implemented | `wyst.language.v0.9` | Chapter 8 |
| Built-in end-exclusive `for i in start ..< end` with once-only left-to-right bound evaluation, compatible integer typing, immutable index, unit step, and structural transfers (`language.integer-range-for-loop`) | Implemented | `wyst.language.v0.9` | Chapter 8; Appendix B |
| `repeat count { ... }`, `repeat count, i { ... }`, and `repeat lo..hi` predecessor forms (`language.repeat-loop-spelling`) | Removed | `wyst.language.v0.9` | Chapter 8; use integer-range `for`. |
| Keyword-led function declarations and labels, named tuple returns, function pointers, and `#addr_of` function values | Implemented | `wyst.language.v0.9` | Chapter 8 |
| Keyworded `const`/`var` named multi-return destructuring and simultaneous tuple assignment with one right-side evaluation (`language.named-multi-return-destructuring`) | Implemented | `wyst.language.v0.9` | Chapter 8 |
| Shared positional-or-labeled argument grammar, declaration-parameter label resolution for direct calls, written-order evaluation, and positional-only indirect calls (`language.labeled-call-arguments`) | Implemented | `wyst.language.v0.9` | Chapter 8 |
| Exhaustive enum-only `match`, shallow dot-variant alternatives, scoped payload bindings, optional final `else`, and matching `if value is .variant(binding)` patterns (`language.enum-match-patterns`) | Implemented | `wyst.language.v0.9` | Chapter 8 |
| `switch`, `case`, and `#partial` enum dispatch (`language.switch-case-partial`) | Removed | `wyst.language.v0.9` | Use `match`. |
| Anonymous tuple return fields, nested tuple returns, tuple parameters beyond the documented boundary | Reserved | none | Chapter 8 |
| Complete callable identity (convention, ordered parameter/result types, positional register placement, and per-parameter `noescape`, but never declaration parameter names), no implicit callable adaptation, `never`, inherently terminal `label` entries, `naked` lowering, `packed struct`, local `var name: T in register`, and the immutable-template/direct-access `per_cpu var` contract; before item 92 reachable access requires `#target(..., per_cpu = single_instance_tpidr_el1)` with the frozen EL1+/TPIDR_EL1/16-byte-aligned single-instance facts (`language.callable-storage-contracts`) | Implemented | `wyst.language.v0.9` | Chapter 8, “v0.9 Callable Identity, Terminal Entries, and Storage Classes,” is the sole source-semantic owner; Chapters 9, 11, 15, and 16 and Appendices A and B define aligned memory, target, ABI, object, IR, and grammar projections; `semantic-db.json`; `syntax-words.tsv` |
| `#noreturn`, `#naked`, `#noescape`, `#pin`, `#percpu`, `[aapcs]`, legacy `@(...)` / `@[aapcs] (...)` callable types, `#tls`, `#tls_offset_of`, and `thread_local` predecessor spellings | Removed | `wyst.language.v0.9` | Use `-> never`, declaration-prefix modifiers, callable parameter contracts, `in register`, `per_cpu var`, `fn(...)` / `extern "C" fn(...)`, and `#percpu_offset_of`. Wyst v0.9 has no TLS storage class. |
| The final v0.9 declaration-attribute registry and atomic owner activation checks (`language.declaration-attribute-registry`) | Implemented | `wyst.declarationAttributes.v0.9` | [`attribute-catalog.tsv`](attribute-catalog.tsv); `align`, `section`, `inline`, `init`, `frame`, `deny_effects`, `cache_isolated`, and `schedule` are active; emitted custom sections require a matching layout-declared `code`/`rodata`/`data`/`bss` kind. |
| Predecessor standalone/directive declaration-attribute spellings, multiple declaration attribute groups, and accepted-but-ignored attributes (`language.predecessor-declaration-attribute-spellings`) | Removed | `wyst.language.v0.9` | Use the single `#[...]` registry grammar after an owning item activates a row. |
| Signature-style `asm` statements/expressions with ordered `pure`/alignment/stack modifiers, typed input/immediate/symbol/scratch parameters, scalar or named multi-results, `-> never`, semantic body binders, local labels, and catalog-derived effects/allocation constraints (`language.checked-assembly-signature-v0.9`) | Implemented | `wyst.language.v0.9` | Chapter 8; Appendices A and B; Roadmap item 49 |
| `#asm`, `inputs`/`outputs`/`clobbers`/`options`/`body` sections, constraint calls, manual effects/clobbers, directional labels, raw allocatable registers, and `{operand}` interpolation | Removed | `wyst.language.v0.9` | Retained only by the explicitly versioned v0.8 compatibility grammar in Appendix B; use signature-style `asm`. |
| Old `= { ... }` code-item body separator for functions, labels, exception vectors, and `#ventry` slots | Removed | `wyst.language.v0.8` | Use a direct body block after the declaration header. |
| `#export` directive | Removed | `wyst.language.v0.8` | Use the directional `export` declaration; `pub` controls only Wyst source visibility and has no linker effect. |
| `pub` Wyst source visibility and re-export, with no linker export effect (`language.source-visibility-not-linkage`) | Implemented | `wyst.language.v0.9` | Chapter 4 |
| Directional typed linker boundaries through `import symbol`, `export`, and `export weak`, including independent aliases and deterministic collision rejection (`language.directional-linker-boundaries`) | Implemented | `wyst.language.v0.9` | Chapter 4; Chapter 16; Appendix B; Roadmap item 57 |
| Qualified imports by default, explicit selective imports and aliases, non-transitive imports, duplicate import rejection, and unsupported wildcard imports (`language.qualified-imports-default`) | Implemented | `wyst.language.v0.8` | Chapter 4 |
| Hierarchical module paths, whole-module final-component qualifiers, selective-only bare declarations, and collision-free `pub import` re-exports (`language.hierarchical-modules-imports-visibility`) | Implemented | `wyst.language.v0.9` | Chapter 4 |
| Sealed `core` root, authenticated `core.collections` role metadata, and unavailable-by-default selective-only `core.arch`/`core.environment` category roots (`language.sealed-core-imports`) | Implemented | `wyst.language.v0.9` | Chapter 4; `semantic-db.json` `sealedCoreImportCatalog` |
| `$` token and postfix `?` operator | Reserved | none | Appendix B |
| `usize`, `isize`, numeric literal suffixes, `null` literal | Removed | none | Appendix B and Chapter 6 reject these surfaces. |

### Targets, Build, Runtime, And Memory

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| Project manifests, project-directory mode, explicit root-file mode, source roots, import closure, layout file, output path | Implemented | `wyst.language.v0.7` | Chapter 3 |
| Directory-anchored module discovery with anchor files, controlled sibling part files, deterministic enumeration, ignored/generated-file rules, duplicate-declaration diagnostics, stable module identity, and generated-manifest/editor parity (`language.module-discovery-model`) | Implemented | `wyst.language.v0.8` | Chapters 3 and 4 |
| Target declarations and project profiles for `qemu-virt-aarch64-el1`, `qemu-virt-aarch64-el2`, `qemu-virt-aarch64-el2-lse`, and `qemu-raspi4b-aarch64-el2` | Implemented | `wyst.language.v0.7` | Chapters 2, 3, and 4 |
| Separate source requirements and build selections with `#requires(...)`, project/profile compatibility checks, explicit target facts for project artifact builds, target-fact provenance reports, and reusable modules compiling under multiple compatible target selections | Implemented | `wyst.language.v0.8` | Chapters 2, 3, and 4 |
| Pinned A64 compiler-semantic register, state, memory, control, privilege, effect, fault, purity, and structural-profile catalog (`targets.a64-compiler-semantic-catalog`) | Experimental | `wyst.a64CompilerSemantics.v1` | [`a64-compiler-semantics.md`](a64-compiler-semantics.md); complete for the focused manifest-active profile: 308 instruction encodings, 31 state contracts, and two structural profiles. Functional execution remains a distinct coverage axis and has pinned QEMU 11.0.0 evidence for every active instruction and structural row; universal breadth remains item 105. |
| Generated A64 instruction catalog (`targets.a64-instruction-catalog`) | Experimental | `wyst.a64-instruction-catalog.v1` | [`a64-encoding-catalog.tsv`](a64-encoding-catalog.tsv) owns 19 checked source forms: 12 general-purpose forms and seven target-structural-only forms; [`a64-active-encoding-catalog.tsv`](a64-active-encoding-catalog.tsv) owns all 308 active encodings with 301 operand decoders and 10 typed fixups. Ordinary/architecture emission and typed checked-assembly IR consume these generated identities. The complete authority decoder distinguishes active, known unsupported, reserved, and unallocated words. |
| Exact focused A64 conformance ledger and release gate | Experimental | `wyst.a64-conformance-manifest.v2` | [`a64-conformance-manifest.json`](a64-conformance-manifest.json) authenticates exact evidence for all 8,955 support rows: 329 active rows with pinned QEMU 11.0.0 independent-oracle evidence and 8,626 `known_unsupported` rows. It also binds two pinned offline decode oracles over all 308 active encodings, exact LLVM encode round trips for all 307 LLVM-covered rows, 153 authenticated target profiles, checked-assembly allocation proofs, and the deterministic conformance fuzz gate. The mechanically demonstrated claim is limited to the focused active support profile; Roadmap item 105 owns universal activation. |
| Layered target descriptor schema beyond current manifest/profile facts | Future-version normative | `wyst.language.v0.8` target 32 | Chapters 2 and 3 |
| Physical Raspberry Pi hardware validation | Experimental | none | Chapter 2 |
| Volatile memory, atomics, barriers, shareability/freshness vocabulary, and no hidden synchronization | Implemented | `wyst.language.v0.7` | Chapter 9 and Chapter 11 |
| Concurrent memory model: per-location modification order, reads-from, synchronizes-with, happens-before, global `seq_cst` order, release sequences, barrier-mediated synchronization, race behavior, atomic RMW retry-until-complete correctness distinct from progress guarantees, volatile interactions, and closed alias proofs for transformations | Implemented | `wyst.language.v0.8` | Chapter 9 and Chapter 11 |
| Opaque non-copyable `atomic<T>` storage, direct-destination `atomic<T>(value)` construction, and the closed element, method, and order vocabulary (`language.opaque-atomic-storage-closed-orders`) | Implemented | `wyst.language.v0.9` | Chapter 9; Chapter 11; [`atomic-matrix.json`](atomic-matrix.json) is the sole catalog authority. |
| `#acquire`, `#release`, `%atomic_load`, `%atomic_store`, `%cas`, `%xchg`, `%fetch_add/sub/and/or/xor`, and `%atomic_bit_set/clear` (`language.predecessor-atomic-primitives-and-order-directives`) | Removed | `wyst.language.v0.9` | Use typed `@atomic<T>` methods; `%` dispositions are frozen only in [`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv), while `#acquire`/`#release` dispositions are frozen only in [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv). Neither audit feeds the atomic matrix or source tooling. |
| Explicit allocation/storage contracts, arenas, dynamic-array descriptors, typed handles, buffer/string API contracts | Implemented | `wyst.language.v0.7` | Chapter 10 and Chapter 21 |
| Dynamic-array descriptor contract `wyst.dynamicArrayDescriptor.v0`: public seven-field `DynamicArray<T>` descriptor layout, invariants, policy encodings, lifetime rules, ABI/debug/persistence/foreign-inspection consequences, and `wyst.dynamicArrayOperation.v0` report metadata | Implemented | `wyst.dynamicArrayDescriptor.v0` | Chapter 10; Chapter 23; `wync explain storage` |
| Standard-library expansion beyond the thin allocation-explicit core | Future-version normative | `wyst.language.v0.8+` | Chapter 10; not current language surface. |
| Hidden allocation, hidden garbage collection, implicit cleanup, hidden locking, hidden parallelization | Removed | none | Chapter 10 |
| Target-defined `vector_table` declarations with exact authenticated selectors, canonical dotted slot names, fixed source order, target-owned section/alignment/extent, explicit terminal arrow or block bodies, catalog-authenticated padding, and duplicate/missing/reordered/overflow diagnostics (`language.exception-vector-slots`) | Implemented | `wyst.language.v0.9` | Chapter 14; Appendix B |
| Target-checked nominal `trap_frame` declarations and `naked label ... establishes T` / `restores T` hard clauses, with exact profile-owned fields, offsets, extent, stack alignment, execution levels, complete architectural state, and canonical checked-assembly transitions (`language.target-checked-trap-frame-dsl`) | Implemented | `wyst.language.v0.9` | Chapter 14; Appendix B |
| Released-v0.8 `#exception_vector`, `#ventry`, and `#trap_frame` directive surfaces (`language.predecessor-vector-trap-directives`) | Removed | `wyst.language.v0.9` | Historical v0.8 grammar snapshot in Appendix B; [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) |
| Per-callable execution-level facts for ARM64 functions, labels, `vector_table` slot entries, callbacks, `exception.eret` transitions, and exception entries | Implemented | `wyst.language.v0.9` | Chapters 5, 11, and 14 |
| Named ARM64 system-register primitive access uses exact canonical generated-catalog spelling, rejects noncanonical case variants with canonical hints, preserves canonical spelling in formatting and reports, and exposes only canonical names through editor completion (`language.system-register-canonical-spelling`) | Implemented | `wyst.language.v0.8` | Chapter 11; `a64-compiler-semantics.md` |
| Production SMP runtime beyond current explicit QEMU smoke recipe | Future-version normative | `wyst.language.next` | Chapters 9 and 11 |
| SVE/SVE2, MTE, PAC, and broad architecture-extension integration | Experimental | none | Chapter 1; the supported profile remains available through signature-style checked `asm`. |

### Native ABI, Foreign ABI, And Artifacts

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| Wyst Native ABI register ownership, argument/return classification, stack protocol, frame layout, indirect returns | Implemented | `wyst.nativeAbi.v0.7` | Chapter 15 |
| AAPCS64 opt-in functions, function pointer type distinction, and official argument/result classification | Implemented | `wyst.nativeAbi.v0.8` | Chapter 15 |
| Wyst Native variadic calling convention | Removed | none | Chapter 15 |
| Fixed-arity calls into C variadic entry points and explicit `va_list` idioms | Implemented | `wyst.nativeAbi.v0.7` | Chapter 15 |
| Direct C header import and broad C importer workflow | Experimental | none | Chapter 15 |
| Static AArch64 `ET_EXEC` ELF image output, section catalog, symbols, relocations applied by the final writer | Implemented | `wyst.language.v0.7` | Chapter 16 |
| Deterministic layout placement solver for regions, sections, alignment, `after` dependencies, fixed addresses, inherited regions, overlap, overflow, empty sections, deterministic tie-breaking, padding/fill bytes, and required diagnostics | Implemented | `wyst.language.v0.8` | Chapter 4; Chapter 16 |
| Relocatable `ET_REL` object output (`wync -c` / `--emit-object`) | Future-version normative | `wyst.language.v0.8` target 32 | Chapter 16 |
| Explicit strong and weak external aliases | Implemented | `wyst.language.v0.9` | Chapter 4; Chapter 16; use `export` and `export weak`. |
| Hidden shared-object symbol visibility | Future-version normative | none | Chapter 16; no current source spelling. |
| Undefined external AAPCS symbols and link-time resolution | Future-version normative | `wyst.language.v0.8` target 34 | Chapter 16 |
| Deterministic multi-object static linking with cross-object veneers | Future-version normative | `wyst.language.v0.8` target 35 | Chapter 16 |
| Foreign AArch64 ELF object linkage | Future-version normative | `wyst.language.v0.8` target 36 | Chapter 16 |
| Static archive distribution plus artifact/link reports | Future-version normative | `wyst.language.v0.8` target 37 | Chapter 16 |
| Dynamic linking, GOT/PLT, PIE, shared objects, ELF TLS, COMDAT/section groups, PE/COFF, Mach-O artifact modes | Experimental | none | Chapter 16 |
| DWARF 5 debug-info floor and deterministic debug sections | Implemented | `wyst.language.v0.7` | Chapter 23 |
| Debug build mode that forces frame records independent of leaf/non-leaf status | Future-version normative | `wyst.nativeAbi.next` | Chapter 15 names the ABI consequence; current CLI has no debug-build mode. |
| `#backtrace` source attribute for forcing frame records | Removed | `wyst.language.v0.9` | The non-parser [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) records the rejection; it has no replacement or compatibility path. |
| DWARF-4 bitfield attribute fallback (`DW_AT_bit_offset`) | Deprecated | none | Chapter 23 requires DWARF 5 forms. |

### Tooling, Reports, And Interfaces

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| `wync check`, text diagnostics, `json` diagnostics, `lsp-json` diagnostics | Implemented | `wync.interfaces.v1` | Chapter 18 |
| `wync fmt` and `wync fmt --check` canonical formatting | Implemented | `wync.interfaces.v1` | Chapter 18 |
| `wync editor-catalog` lexical completion/hover catalog | Implemented | `wync.interfaces.v1` | Chapter 18 |
| Compiler-backed `wync lsp`, typed editor index, editor actions, Zed extension assets, Tree-sitter lexical grammar | Implemented | `wync.interfaces.v1` | Chapter 20 and `editors/README.md` |
| Project-wide formatting and in-place rewrite flags | Experimental | none | Chapter 18 |
| Debug adapters, remote trace transports, visualizer tooling | Experimental | none | Chapter 20 |
| `wync explain lowering` experimental compiler inspection report | Experimental | `wync.reports.v1` | Chapter 21 |
| `wync explain effects` experimental compiler inspection report | Experimental | `wync.reports.v1` | Chapter 21 |
| `wync explain storage` experimental compiler inspection report | Experimental | `wync.reports.v1` | Chapter 21 |
| `wync generated-manifest` | Implemented | `wync.reports.v1` | Chapter 22 |
| Deterministic rebuild benchmark report | Implemented | `wync.reports.v1` | Chapter 24 |
| Release evidence and release archive facts | Implemented | `wync.reports.v1` | `CHANGELOG.md`, tests, and release tooling |
| Diagnostic suppression policy and performance/resource, modeled-cost, measured benchmark, and PMU/TMA report expansion beyond the current structural inspection schemas | Future-version normative | none | Chapters 1, 21, and 24; Appendix A |

## Schema Registry

### Language Catalog And Identity Schemas

| Schema | Status | Authority |
| ------ | ------ | --------- |
| `wyst.syntaxWords.v0.9` | Implemented | [`syntax-words.tsv`](syntax-words.tsv); one unique row per special source spelling. |
| `wyst.metaOperations.v0.9` | Implemented; exactly 14 active rows | [`meta-operation-catalog.tsv`](meta-operation-catalog.tsv); complete phase, result, target-fact, relocation, behavior, owner, and tooling contracts. |
| `wyst.declarationAttributes.v0.9` | Implemented registry; six rows active | [`attribute-catalog.tsv`](attribute-catalog.tsv); `align`, `section`, `inline`, `init`, `cache_isolated`, and `schedule` are active; later-owner rows remain inactive. |
| `wyst.genericBounds.v0.9` | Implemented | [`generic-bounds.tsv`](generic-bounds.tsv); closed subject and capability contracts with atomic extension rows. |
| `wyst.atomic-matrix.v1` | Implemented | [`atomic-matrix.json`](atomic-matrix.json); sole Item-52 authority for atomic storage, elements, methods, legal orders, and ARM64 lowering selection. Legacy spelling dispositions are outside this matrix. |
| `wyst.genericInstantiationKey.v0.9` | Implemented | `semantic-db.json` `genericInstantiationContract`; semantic declaration identity plus complete concrete type and currently empty value-argument lists. |
| `wyst.genericInstantiationTrace.v0.9` | Implemented | `semantic-db.json` `genericInstantiationContract`; deterministic root-to-demand canonical-key trace. |
| `wyst.hardwareRegisters.v0.9` | Implemented | `semantic-db.json` `hardwareRegisterContract`; Chapters 6, 9, and 11; Appendices A and B. |
| `wyst.coreImportCatalog.v0.9` | Implemented | [`sealed-core.tsv`](sealed-core.tsv) and `semantic-db.json` `sealedCoreImportCatalog`; sealed namespace policy, bundled source identity, and authenticated roles. |
| `wyst.dynamicContainerRole.v0.9` | Implemented | Authenticated `core.collections.DynamicArray` role metadata, independent of local spelling. |
| `wyst.a64-instruction-semantics.v2` | Experimental | [`a64-instruction-semantics.tsv`](a64-instruction-semantics.tsv); exactly one complete semantic row for each of the 308 manifest-active encodings. Every row carries pinned QEMU 11.0.0 independent-oracle evidence: 302 expected-value paths, five state paths, and one trap structural path. Inactive encodings have no placeholder semantic row. |
| `wyst.a64-instruction-catalog.v1` | Experimental | [`a64-encoding-catalog.tsv`](a64-encoding-catalog.tsv) and generated [`a64-active-encoding-catalog.tsv`](a64-active-encoding-catalog.tsv); 19 checked-source grammars (12 general-purpose and seven target-structural-only) plus a shared 308-row active encoder/decoder index with 301 operand decoders, 10 typed fixups, and a complete four-way authority word partition. |
| `wyst.a64-state-semantics.v3` | Experimental | [`a64-state-semantics.tsv`](a64-state-semantics.tsv); all 31 authority-backed register/state contracts required by the focused active support packs and dynamic semantic references. |
| `wyst.a64-structural-semantics.v2` | Experimental | [`a64-structural-semantics.tsv`](a64-structural-semantics.tsv); the two manifest-active AArch64 vector-table and trap-frame contracts. Both carry pinned QEMU 11.0.0 `trap-frame` structural-path evidence: selected `current.spx.sync` delivery for the vector table and the canonical entry-save/restore-ERET round trip for the trap frame. Authenticated generated metadata and compile-time tests additionally own shape, order, offsets, extents, selection, and state transitions. |
| `wyst.a64-support-policy.v1` | Experimental | [`a64-support-policy.json`](a64-support-policy.json); checked-in activation policy naming the `wyst.a64.checked-asm.core.v1`, `wyst.a64.target-structural-asm.aarch64.v1`, `wyst.a64.ordinary-lowering.v1`, `wyst.a64.architecture-operations.v1`, and `wyst.a64.target-structural.aarch64.v1` packs. |
| `wyst.a64-support-manifest.v1` | Experimental | [`a64-support-manifest.json`](a64-support-manifest.json) and [`a64-support-rows.tsv`](a64-support-rows.tsv); generated, authenticated partition of exactly 8,955 rows: 308 active/4,023 known-unsupported encodings, 19 active/4,603 known-unsupported source forms, and two active structural profiles, with zero unexplained or partially active rows. |
| `wyst.a64-conformance-policy.v2` | Experimental | [`a64-conformance-policy.json`](a64-conformance-policy.json); closed suites, pinned static and execution oracles, authenticated target bindings, allocation evidence identity, and fuzz parameters for the focused release gate. |
| `wyst.a64-conformance-evidence.v2` | Experimental | [`a64-conformance-evidence.tsv`](a64-conformance-evidence.tsv); exactly one complete evidence row for each of the 8,955 support-bearing rows, including row-exact predicate-negative applicability and pinned independent-oracle execution for all 329 active rows. |
| `wyst.a64-conformance-targets.v2` | Experimental | [`a64-conformance-targets.tsv`](a64-conformance-targets.tsv); all 153 targets include `base`, positive-state identity, selection kind, and authenticated selection digest: `v8Ap0` `base` and `base|fp_simd` base/FP/AdvSIMD profiles, a `v8Ap1` `base|lse` LSE profile, and 149 conformance-only `v9Ap7` known-unsupported precedence bindings. |
| `wyst.a64-conformance-static-oracles.v2` | Experimental | [`a64-conformance-oracles.tsv`](a64-conformance-oracles.tsv); offline LLVM 14.0.6 and Capstone 5.0.7 full-disassembly outcomes and adjudications for all 308 active encodings, plus exact LLVM reassembly words and an explicit decode-only Capstone boundary. |
| `wyst.a64-conformance-manifest.v2` | Experimental | [`a64-conformance-manifest.json`](a64-conformance-manifest.json); generated identity and exact 329-active/8,626-known-unsupported release evidence summary, with all active rows pinned to QEMU 11.0.0 independent-oracle evidence, including runtime provenance, allocation, target, static-oracle, aggregate-gate, and fuzz coverage. |

### Report Schemas

| Schema | Status | Producer |
| ------ | ------ | -------- |
| `wync.explain.lowering.v0` | Removed; superseded by `wync.explain.lowering.v1` | No producer |
| `wync.explain.lowering.v1` | Experimental | `wync explain lowering --format json` and text header |
| `wync.explain.effects.v0` | Removed; superseded by `wync.explain.effects.v1` | No producer |
| `wync.explain.effects.v1` | Experimental | `wync explain effects --format json` and text header |
| `wync.explain.storage.v0` | Removed; superseded by `wync.explain.storage.v1` | No producer |
| `wync.explain.storage.v1` | Experimental | `wync explain storage --format json` and text header |
| `wync.reportEpistemic.v0` | Experimental common field contract | All experimental compiler inspection reports |
| `wync.generatedManifest.v0` | Implemented | `wync generated-manifest` |
| `wync.rebuildBenchmark.v0` | Implemented | Deterministic rebuild benchmark JSON |
| `wync.releaseEvidence.v0` | Implemented | `wync release-evidence` command stdout |
| `wync.releaseHostFacts.v0` | Implemented | release-evidence `host-facts.json` |
| `wync.releaseArchiveFacts.v0` | Implemented | release-evidence `release-facts.json` |

### Interface Schemas

| Schema | Status | Producer |
| ------ | ------ | -------- |
| `wync.diagnostics.v0` | Removed; superseded by `wync.diagnostics.v1` | No producer |
| `wync.diagnostics.v1` | Implemented | `wync check --diagnostic-format json` |
| `wync.diagnostics.lsp.v0` | Removed; superseded by `wync.diagnostics.lsp.v1` | No producer |
| `wync.diagnostics.lsp.v1` | Implemented | `wync check --diagnostic-format lsp-json` |
| `wync.diagnosticKinds.v1` | Implemented | Compiler diagnostic-kind registry and `wync explain E####|W####` |
| `wync.editorCatalog.v0` | Implemented | `wync editor-catalog` |
| LSP 3.x JSON-RPC payloads with Wyst-owned method subset | Implemented | `wync lsp` |
| Zed extension manifest `schema_version = 1` | Implemented | `editors/zed-wyst/extension.toml` |

Schema version changes require updating this registry, the owning chapter, the
producer, and the snapshot tests in the same change.

## Compatibility And Change Process

A change is source-compatible when existing accepted source continues to parse,
check, format, and lower with the same user-visible meaning under the same
language version. A change is source-breaking when it rejects previously
accepted source, changes parse structure, changes overload/operator meaning,
changes default target facts, or changes diagnostics relied on by checked
fixtures. Source-breaking changes require a new language version row, a
deprecation or removal row for the affected feature, and conformance tests for
old and new behavior.

A change is ABI-compatible when existing compiled interfaces keep the same
calling convention, register ownership, stack layout, aggregate
classification, symbol spelling, relocation meaning, section contract, and
debug/unwind implication under the same Native ABI version. ABI-breaking
changes require a new Native ABI version, an owning Chapter 15 or Chapter 16
rule update, and binary-inspection or QEMU evidence.

A change is schema-compatible when existing JSON/report/interface consumers can
ignore added fields and continue to read all previously documented fields with
the same type and meaning. Removing fields, renaming fields, changing field
types, changing enum string values, or changing required/optional status is
schema-breaking and requires a new schema version plus snapshot updates.

Deprecation requires an explicit feature row with state `Deprecated`, a named
replacement or removal condition, diagnostics or documentation explaining the
transition, and at least one release line where the deprecated surface remains
recognized unless the row states that the feature is already removed. Removed
features must be deleted from normative examples or marked only as diagnostic
examples.

Documentation CI rejects contradictory normative claims by checking
`design/semantic-db.json`, this file, checked `wyst` contract fences, and
compiler-visible vocabulary together. New compiler-visible features must add a
semantic database feature row before they can be documented as implemented,
future-version normative, experimental, reserved, deprecated, or removed.

## Conformance Completion Gate

Every semantic database feature row is a normative semantic clause for
traceability purposes. Each clause must have an entry in
[`design/conformance-index.md`](conformance-index.md) with, as applicable:

- a positive source test;
- a negative diagnostic test;
- an execution test;
- an IR snapshot;
- a lowering or disassembly snapshot;
- an ELF/object/relocation snapshot;
- an explain-report snapshot;
- a reproducibility test.

A missing evidence class must be written as `untested:` with a concrete reason,
not left implied. An evidence class that cannot apply to the clause must be
written as `not-applicable:` with a concrete reason. Covered evidence must link
to a real test file, test symbol, or snapshot fixture so documentation CI can
verify the link.

Future-version normative, reserved, deprecated, removed, unsupported, and
experimental syntax or modes must fail loudly when they are compiler-visible.
They must not be accepted and ignored. If no spelling or mode exists yet, the
conformance index must say why the negative diagnostic evidence class is not
applicable or remains untested.

This is the completion gate for versioned semantic work: a change that adds,
changes, implements, reserves, removes, promotes, or documents a semantic
clause is not complete until its conformance row is added or updated.
Documentation CI enforces row presence, coverage-category presence, and covered
test-link validity.
