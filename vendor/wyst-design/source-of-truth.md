---
title: "Wyst Source Of Truth"
group: manual
order: 0
summary: "Versioned authority, conflict resolution, feature states, and schema versions."
---

# Wyst Source Of Truth

This document is the human-readable view of the versioned Wyst semantic
authority. The machine-readable registry is
[`design/semantic-db.json`](semantic-db.json); it owns enumerated semantic
facts such as feature states, version identifiers, operator spellings, effect
names, public vocabularies, ABI classifications, and schema names. Detailed
rules still live in the chapters and appendices under the precedence order
below.

Clause-to-test traceability is tracked in
[`design/conformance-index.md`](conformance-index.md). A semantic clause is not
complete merely because prose, examples, or compiler code changed; the clause's
conformance row must be added or updated at the same time.

Current manual snapshot:

| Surface | Version | Status | Notes |
| ------- | ------- | ------ | ----- |
| Language | `wyst.language.v0.8` | released normative snapshot | Covers the `v0.8` release manual and compiler behavior. |
| Native ABI | `wyst.nativeAbi.v0.8` | released normative snapshot | Chapter 15 owns the detailed Native and AAPCS64 rules. |
| Object/interface schema bundle | `wyst.objectInterface.v0` | implemented plus future-version rows | Chapter 16 and the semantic database own object artifact, relocation, symbol, and emitted-interface classifications. |
| Report schema bundle | `wync.reports.v0` | implemented | Groups the report schemas listed below. Individual report payloads still carry their own `schema` field. |
| Editor/diagnostic interface schema bundle | `wync.interfaces.v0` | implemented | Groups CLI/editor/LSP adapter payloads listed below. |

Released `wync` package version `0.8.0` implements the `v0.8` release line.
Rows marked implemented below are part of the current release unless they
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
| Experimental | Planning or research material only. It is not normative, not scheduled, and not a compatibility promise. |
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
| IR/source semantic agreement for fixed arrays, slices, dynamic arrays, enums, aggregates, typed addresses, raw addresses, explicit relocation origins, and lowering/artifact alignment (`language.ir-source-semantic-agreement`) | Implemented | `wyst.language.v0.8` | [appendix-a-ir.md](appendix-a-ir.md); Chapter 16 |
| Trust-boundary model for `#trusted_cast`, raw-address assertions, raw function-pointer construction, foreign declarations, manually stated foreign effects, inline-assembly effects and clobbers, ABI overrides, and unproven library contracts | Implemented | `wyst.language.v0.8` | Chapter 1; Chapter 21 |
| Ordinary local reads require initialization; deliberate raw storage uses `MaybeUninit<T>`, `%read_uninit`, `%write_uninit`, and explicit indeterminate-read IR | Implemented | `wyst.language.v0.8` | Chapter 9; Chapter 11; Appendix A |
| UTF-8 source, ASCII identifiers, comments, string literals, byte character literals with ASCII direct characters and explicit byte escapes, numeric literal separators (`language.lexical-literal-surface`) | Implemented | `wyst.language.v0.8` | Appendix B, Chapter 6 |
| Direct non-ASCII character literals truncated to `u8` (`language.truncating-non-ascii-character-literals`) | Removed | `wyst.language.v0.8` | Appendix B; use string literals for UTF-8 text or explicit `\xNN` byte escapes. |
| Scalar primitives, `bool`, fixed-width integers, `f32`/`f64`, `string`, untyped integer constants | Implemented | `wyst.language.v0.7` | Chapter 6 |
| Categorized explicit `as.<category>` conversions and no implicit numeric conversion (`language.categorized-explicit-conversions`) | Implemented | `wyst.language.v0.8` | Chapters 6 and 7; Appendix B |
| Floating-point arithmetic in compile-time constants | Future-version normative | `wyst.language.next` | Chapters 6, 7, and 8 mark the accepted future surface; current compiler rejects it. |
| `@T` and `@volatile T` address types, explicit `T@[addr]` loads and stores, `#addr_of` | Implemented | `wyst.language.v0.7` | Chapters 6, 8, 9, 11, and 16 |
| Typed address arithmetic model: `+`/`-` use element offsets, byte offsets use an explicit `@u8` or `u64` lens, field offsets are byte counts, relocation addends are bytes, and obvious double scaling is diagnosed | Implemented | `wyst.language.v0.8` | Chapters 6, 9, and 16; Appendix A |
| Effects, authority/trust facts, and generated backend resources are separate; `#deny` and effect diagnostics cover semantic effects, while `#frame` and frame/spill/register/code-size/veneer/caller-copy facts are post-lowering resources | Implemented | `wyst.language.v0.8` | Chapter 1; Chapter 21 |
| Volatile access semantics, MMIO intent, and architectural memory type are separate; `@volatile T` records compiler-visible access ordering, `@mmio T` records programmer MMIO intent, and Device/Normal memory type comes from target/runtime mapping facts | Implemented | `wyst.language.v0.8` | Chapters 6 and 9; Appendix A |
| Arrays `[N]T`, slices `[]T`, dynamic descriptors `[dynamic]T`, `#len`, array-to-slice views | Implemented | `wyst.language.v0.7` | Chapters 6 and 10 |
| By-value fixed-array parameters | Reserved | none | Chapter 6 |
| Structs, `#packed`, `#field_offset`, deterministic layout | Implemented | `wyst.language.v0.7` | Chapter 6 |
| `#repr(C)` and alternate struct layout modes | Reserved | none | Chapter 6; use explicit layout checks at ABI boundaries. |
| Bitfields with contiguous ranges and whole-value backing-integer conversion | Implemented | `wyst.language.v0.7` | Chapter 6 |
| Non-contiguous bitfield field ranges | Removed | none | Rejected feature; use separate fields. |
| Enum representation: payload-less enums are transparent tags; payload enums are fixed two-word values with tag at offset 0 and payload at offset 8 | Implemented | `wyst.language.v0.8` | Chapter 6; Chapter 15; Chapter 23; Appendix A |
| `is` enum pattern tests for implemented enum variants | Implemented | `wyst.language.v0.8` | Chapter 8; nested patterns and compound/negated payload bindings remain reserved below. |
| Multi-field enum payload variants, tuple payload patterns, nested patterns, payload bindings in compound or negated `is` patterns | Reserved | none | Chapters 6 and 8; current compiler rejects these forms. |
| Generic functions, structs, and enums with explicit type arguments, monomorphization, closed built-in bounds, and canonical generic symbols | Implemented | `wyst.language.v0.8` | Chapter 6 and Chapter 16 |
| Generic instantiation termination over canonical declaration identity plus complete type and value arguments, with exact canonical cycles permitted, strictly growing chains rejected, deterministic traces, and resource limits reported as resource failures | Future-version normative | `wyst.language.next` | Chapter 6 |
| Generic aliases, type-argument inference, default type arguments, value parameters, traits, interfaces, concepts, typeclasses, higher-kinded parameters | Reserved | none | Chapter 6; implementation-plan discussion is non-authoritative until reflected here. |
| `#if` compile-time conditionals over deterministic constant values | Implemented | `wyst.language.v0.8` | Chapter 6 |
| Left-to-right expression evaluation order, short-circuiting `&&`/`||`, eager `select`, source-order effect preservation, and optional effectful-nesting lint | Implemented | `wyst.language.v0.8` | Chapter 7; Chapters 9 and 13 for memory and scheduling constraints |
| Conventional arithmetic, shift, bitwise, comparison, and logical operator precedence, with non-associative comparison operators (`language.operator-precedence-and-comparison-associativity`) | Implemented | `wyst.language.v0.8` | Chapter 7; Appendix B |
| Distinct implicit `schedule.default` mode for ordinary code, with dependency-safe pure reordering, source-order effect and memory preservation, deterministic tie-breaking, report/build-identity recording, and no unstated implementation scheduling policy | Implemented | `wyst.language.v0.8` | Chapter 13; Chapter 22 |
| `#schedule(strict)` preserves source-level semantic operations and their sequence, permits required support lowering, and does not control multiply-add contraction outside the global `%fma` rule | Implemented | `wyst.language.v0.8` | Chapter 13; Chapter 7 |
| `#exact(...)` exact-code contracts for emitted instruction count, permitted instruction families, exact bytes, register assignments, prologue presence, spills, veneers, section placement, and alignment, verified after lowering against the emitted artifact and rejected when unsatisfied | Implemented | `wyst.language.v0.8` | Chapter 13 |
| Runtime `if`, if expressions, `repeat`, `while`, `loop`, `break`, `continue`, `goto`, statement calls, expression calls, and direct `#noreturn` calls as block terminators for functions and labels | Implemented | `wyst.language.v0.8` | Chapter 8 |
| `repeat lo..hi` range syntax | Removed | none | Rejected; use `repeat N, i`. |
| Function declarations, labels, named tuple returns, function pointers, `#addr_of` function values | Implemented | `wyst.language.v0.7` | Chapter 8 |
| Anonymous tuple return fields, nested tuple returns, tuple parameters beyond the documented boundary | Reserved | none | Chapter 8 |
| Register pinning with `#pin`, `#noescape`, special-register restrictions, pinned-entry address-taking restrictions, and call-boundary checks (`language.register-pinning`) | Implemented | `wyst.language.v0.8` | Chapters 1, 8, 15, Appendix A |
| Inline helpers with `#inline` under stackless and raw-context restrictions | Implemented | `wyst.language.v0.7` | Chapter 8 |
| `#naked`, `#asm`, checked operands/clobbers/options/body sections, `#asm(preserves_sp)`, `#asm(sets_sp)` | Implemented | `wyst.language.v0.7` | Chapter 8 and Appendix A |
| Old `= { ... }` code-item body separator for functions, labels, exception vectors, and `#ventry` slots | Removed | `wyst.language.v0.8` | Use a direct body block after the declaration header. |
| `#export` directive | Removed | `wyst.language.v0.8` | Use `pub`. |
| `pub` visibility for exported declarations | Implemented | `wyst.language.v0.8` | Chapter 4 |
| Qualified imports by default, explicit selective imports and aliases, non-transitive imports, duplicate import rejection, and unsupported wildcard imports (`language.qualified-imports-default`) | Implemented | `wyst.language.v0.8` | Chapter 4 |
| `#weak` and `#hidden` source spelling for symbol binding/visibility | Future-version normative | `wyst.language.v0.8` target 33 | Chapter 4 and Chapter 16 |
| `$` token and postfix `?` operator | Reserved | none | Appendix B |
| `usize`, `isize`, numeric literal suffixes, `null` literal | Removed | none | Appendix B and Chapter 6 reject these surfaces. |

### Targets, Build, Runtime, And Memory

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| Project manifests, project-directory mode, explicit root-file mode, source roots, import closure, layout file, output path | Implemented | `wyst.language.v0.7` | Chapter 3 |
| Directory-anchored module discovery with anchor files, controlled sibling part files, deterministic enumeration, ignored/generated-file rules, duplicate-declaration diagnostics, stable module identity, and generated-manifest/editor parity (`language.module-discovery-model`) | Implemented | `wyst.language.v0.8` | Chapters 3 and 4 |
| Target declarations and project profiles for `qemu-virt-aarch64-el2` and `qemu-raspi4b-aarch64-el2` | Implemented | `wyst.language.v0.7` | Chapters 2, 3, and 4 |
| Separate source requirements and build selections with `#requires(...)`, project/profile compatibility checks, explicit target facts for project artifact builds, target-fact provenance reports, and reusable modules compiling under multiple compatible target selections | Implemented | `wyst.language.v0.8` | Chapters 2, 3, and 4 |
| Layered target descriptor schema beyond current manifest/profile facts | Future-version normative | `wyst.language.v0.8` target 32 | Chapters 2 and 3 |
| Physical Raspberry Pi hardware validation | Experimental | none | Chapter 2 |
| Volatile memory, atomics, barriers, shareability/freshness vocabulary, and no hidden synchronization | Implemented | `wyst.language.v0.7` | Chapter 9 and Chapter 11 |
| Concurrent memory model: per-location modification order, reads-from, synchronizes-with, happens-before, global `seq_cst` order, release sequences, barrier-mediated synchronization, race behavior, atomic RMW retry-until-complete correctness distinct from progress guarantees, volatile interactions, and closed alias proofs for transformations | Implemented | `wyst.language.v0.8` | Chapter 9 and Chapter 11 |
| Explicit allocation/storage contracts, arenas, dynamic-array descriptors, typed handles, buffer/string API contracts | Implemented | `wyst.language.v0.7` | Chapter 10 and Chapter 21 |
| Dynamic-array descriptor contract `wyst.dynamicArrayDescriptor.v0`: public seven-field `[dynamic]T` descriptor layout, invariants, policy encodings, lifetime rules, ABI/debug/persistence/foreign-inspection consequences, and `wyst.dynamicArrayOperation.v0` report metadata for current non-generic wrappers | Implemented | `wyst.dynamicArrayDescriptor.v0` | Chapter 10; Chapter 23; `wync explain storage` |
| Standard-library expansion beyond the thin allocation-explicit core | Future-version normative | `wyst.language.v0.8+` | Chapter 10; not current language surface. |
| Hidden allocation, hidden garbage collection, implicit cleanup, hidden locking, hidden parallelization | Removed | none | Chapter 10 |
| Exception vectors, `#ventry`, `#trap_frame`, trap-frame ABI, EL gating | Implemented | `wyst.language.v0.7` | Chapters 5, 11, and 14 |
| ARM64 exception-vector slots use canonical architectural identifiers, fixed declaration order, 0x800 table alignment, exact 128-byte padded slot emission, required explicit bodies for unused roles, duplicate/missing/out-of-order diagnostics, and separate non-semantic `#ventry(label = "...")` metadata (`language.exception-vector-slots`) | Implemented | `wyst.language.v0.8` | Chapter 14 |
| Per-callable execution-level facts for ARM64 functions, labels, `#ventry` entries, callbacks, `%eret` transitions, and exception-vector entries | Implemented | `wyst.language.v0.8` | Chapters 5, 11, and 14 |
| Named ARM64 system-register access uses exact canonical table spelling, rejects noncanonical case variants with canonical hints, preserves canonical spelling in formatting and reports, and exposes only canonical names through editor completion (`language.system-register-canonical-spelling`) | Implemented | `wyst.language.v0.8` | Chapter 11 |
| Production SMP runtime beyond current explicit QEMU smoke recipe | Future-version normative | `wyst.language.next` | Chapters 9 and 11 |
| SVE/SVE2, MTE, PAC, and broad architecture-extension integration | Experimental | none | Chapter 1; explicit `#asm` remains available today. |

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
| Symbol binding and visibility beyond default/global/local | Future-version normative | `wyst.language.v0.8` target 33 | Chapter 16 |
| Undefined external AAPCS symbols and link-time resolution | Future-version normative | `wyst.language.v0.8` target 34 | Chapter 16 |
| Deterministic multi-object static linking with cross-object veneers | Future-version normative | `wyst.language.v0.8` target 35 | Chapter 16 |
| Foreign AArch64 ELF object linkage | Future-version normative | `wyst.language.v0.8` target 36 | Chapter 16 |
| Static archive distribution plus artifact/link reports | Future-version normative | `wyst.language.v0.8` target 37 | Chapter 16 |
| Dynamic linking, GOT/PLT, PIE, shared objects, ELF TLS, COMDAT/section groups, PE/COFF, Mach-O artifact modes | Experimental | none | Chapter 16 |
| DWARF 5 debug-info floor and deterministic debug sections | Implemented | `wyst.language.v0.7` | Chapter 23 |
| Debug build mode that forces frame records independent of leaf/non-leaf status | Future-version normative | `wyst.nativeAbi.next` | Chapter 15 names the ABI consequence; current CLI has no debug-build mode. |
| `#backtrace` source attribute for forcing frame records | Reserved | none | Chapter 15 may discuss this as a future condition only; the current parser/editor vocabulary does not accept `#backtrace`. |
| DWARF-4 bitfield attribute fallback (`DW_AT_bit_offset`) | Deprecated | none | Chapter 23 requires DWARF 5 forms. |

### Tooling, Reports, And Interfaces

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| `wync check`, text diagnostics, `json` diagnostics, `lsp-json` diagnostics | Implemented | `wync.interfaces.v0` | Chapter 18 |
| `wync fmt` and `wync fmt --check` canonical formatting | Implemented | `wync.interfaces.v0` | Chapter 18 |
| `wync editor-catalog` lexical completion/hover catalog | Implemented | `wync.interfaces.v0` | Chapter 18 |
| Compiler-backed `wync lsp`, typed editor index, editor actions, Zed extension assets, Tree-sitter lexical grammar | Implemented | `wync.interfaces.v0` | Chapter 20 and `editors/README.md` |
| Project-wide formatting and in-place rewrite flags | Experimental | none | Chapter 18 |
| Debug adapters, remote trace transports, visualizer tooling | Experimental | none | Chapter 20 |
| `wync explain lowering` | Implemented | `wync.reports.v0` | Chapter 21 |
| `wync explain effects` | Implemented | `wync.reports.v0` | Chapter 21 |
| `wync explain storage` | Implemented | `wync.reports.v0` | Chapter 21 |
| `wync generated-manifest` | Implemented | `wync.reports.v0` | Chapter 22 |
| Deterministic rebuild benchmark report | Implemented | `wync.reports.v0` | Chapter 24 |
| Release evidence and release archive facts | Implemented | `wync.reports.v0` | `CHANGELOG.md`, tests, and release tooling |
| Richer diagnostic payloads, suppression policy, performance/correctness report expansion, PMU/TMA report expansion | Experimental | none | Chapters 19, 21, and 24 |

## Schema Registry

### Report Schemas

| Schema | Status | Producer |
| ------ | ------ | -------- |
| `wync.explain.lowering.v0` | Implemented | `wync explain lowering --format json` and text header |
| `wync.explain.effects.v0` | Implemented | `wync explain effects --format json` and text header |
| `wync.explain.storage.v0` | Implemented | `wync explain storage --format json` and text header |
| `wync.generatedManifest.v0` | Implemented | `wync generated-manifest` |
| `wync.rebuildBenchmark.v0` | Implemented | Deterministic rebuild benchmark JSON |
| `wync.releaseEvidence.v0` | Implemented | `wync release-evidence` command stdout |
| `wync.releaseHostFacts.v0` | Implemented | release-evidence `host-facts.json` |
| `wync.releaseArchiveFacts.v0` | Implemented | release-evidence `release-facts.json` |

### Interface Schemas

| Schema | Status | Producer |
| ------ | ------ | -------- |
| `wync.diagnostics.v0` | Implemented | `wync check --diagnostic-format json` |
| `wync.diagnostics.lsp.v0` | Implemented | `wync check --diagnostic-format lsp-json` |
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
