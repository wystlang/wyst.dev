---
title: "Wyst Language Reference Manual"
group: manual
order: 0
---

# Wyst Language Reference Manual

This is the canonical Wyst language and compiler design reference. It is
organized for lookup by topic, not as a tutorial or a sequence to read from
front to back. Use the contents and appendices to go directly to the contract
you need.

Wyst is unpublished and under active development, with no backwards-
compatibility promise. This manual describes the currently selected repository
snapshot. Every language syntax, semantic rule, design principle, ABI rule,
schema, name, identity, and digest algorithm remains open to deliberate
revision. In this manual, _canonical_, _versioned_, _stable_, _closed_, and
_normative_ constrain the selected snapshot and its internally consistent
artifacts; they do not make a choice permanent. A content digest changes when
its content or digest algorithm changes and exists to reject mixed artifacts,
not to preserve an old design.

The language and compiler use independent semantic versions for actual
releases. Exact content identities distinguish development language snapshots
and compiler builds. Roadmap work never bumps a release version. A release may
be nominated at any time, independently of the roadmap; its proposed semantic
versions are selected from the changes since the previous releases, bound into
the complete gate, and become released only on publication.
[`release-identity.md`](release-identity.md) defines the exact canonical input
sets, domain-separated encodings, independent bump policy, nomination gate, and
publication transition. Computed digests are carried by compiler outputs and
are deliberately absent from their own authority inputs.

Each topic describes the language or compiler contract at the design level.
Feature state, schema versions, and conflict authority are defined in
[source-of-truth.md](source-of-truth.md). If any chapter, appendix, example, IR
note, or ABI rule conflicts with that file, the source of truth wins and the
lower-authority document must be updated.

## Authority

[source-of-truth.md](source-of-truth.md) is the selected-snapshot registry for:

- the currently selected language snapshot and Native ABI, report, and
  interface schema contracts;
- which document wins when prose, grammar, IR documentation, ABI rules,
  and examples conflict;
- feature status within the selected snapshot: implemented, future-version
  normative, experimental, reserved, deprecated, or removed;
- compilation phase products and semantic fact ownership boundaries.

[conformance-index.md](conformance-index.md) is the clause-to-test
traceability index. It records the positive, negative, execution, IR, lowering,
artifact, explain-report, and reproducibility evidence for each semantic
database feature row, and it names untested evidence explicitly.

[syntax-words.tsv](syntax-words.tsv) is the normative selected-snapshot source-
word catalog. [attribute-catalog.tsv](attribute-catalog.tsv) is the closed current
declaration-attribute registry; its rows remain inactive until their semantic
owner changes the row state atomically with the implementation and evidence.
[meta-operation-catalog.tsv](meta-operation-catalog.tsv) is the closed active
15-form compiler/meta-operation surface. The complete 53-name predecessor
mapping is isolated in the non-parser
[legacy-hash-removal-audit.tsv](legacy-hash-removal-audit.tsv); it creates no
diagnostic, alias, rewrite, completion, hover, or highlighting path.
[c-operation-adapter-catalog.tsv](c-operation-adapter-catalog.tsv) is the closed
status/out and tagged/out adapter-profile registry owned by Chapter 26.
[generic-bounds.tsv](generic-bounds.tsv) is the closed active capability-bound
registry consumed by parsing, instantiation, diagnostics, and tooling.
[sealed-core.tsv](sealed-core.tsv) authenticates compiler-bundled core
namespaces. [declaration-roles.tsv](declaration-roles.tsv) is the sole closed
registry for privileged declaration roles; it binds the source-backed dynamic
container declaration to its exact semantic identity, signature, ABI, and
interface/body digests and reserves future resource capability fields without
granting project code authority.
[a64-compiler-semantics.md](a64-compiler-semantics.md) defines the experimental
pinned A64 compiler-semantic contract for the completed focused A64 authority-
through-conformance profile. [a64-support-policy.json](a64-support-policy.json) is the
checked-in activation policy; `wync/tools/a64-support-manifest.mjs`
deterministically generates [a64-support-manifest.json](a64-support-manifest.json)
and the exact row ledger [a64-support-rows.tsv](a64-support-rows.tsv). The ledger
partitions all 8,955 support-bearing subjects into 308 active and 4,023
`known_unsupported` encodings, 20 active and 4,602 `known_unsupported` source
forms or official aliases, and two active target-structural profiles, with no
unexplained or partially active row. The focused bundle contains 308 complete
instruction-semantic rows, 31 authenticated state contracts, and two structural
contracts.

[a64-conformance-manifest.json](a64-conformance-manifest.json) is the terminal
focused-profile release gate. It authenticates
[a64-conformance-evidence.tsv](a64-conformance-evidence.tsv), with exactly
8,955 evidence rows partitioned as 330 active and 8,625
`known_unsupported`; [a64-conformance-targets.tsv](a64-conformance-targets.tsv),
whose 153 profiles all include `base`, with `v8Ap0` (v8.0) `base` and
`base|fp_simd` base/FP/AdvSIMD profiles, a `v8Ap1` (v8.1) `base|lse` LSE
profile, and 149 conformance-only `v9Ap7` (v9.7) unsupported-precedence
profiles; and the offline
[a64-conformance-oracles.tsv](a64-conformance-oracles.tsv)
fixture. The fixture covers all 308 active encodings with pinned LLVM 14.0.6
and Capstone 5.0.7 outcomes: LLVM has one recorded gap, Capstone has none, and
every full operand-text difference is adjudicated. LLVM also reassembles every
one of its 307 decoded witnesses to the exact original word; Capstone is
explicitly decode-only. Functional execution is reported separately from those
static oracles. All 330 active evidence rows are covered by pinned QEMU 11.0.0
independent-oracle evidence, with zero unavailable-oracle gaps and zero
authenticated-reference rows. The 308 instruction rows divide into 302
expected-value paths, five state paths, and one trap structural path; the 13
active general-purpose source-form rows project the corresponding instruction evidence. The
trap-frame runtime fixture also pins both active target-structural rows by
observing the selected vector slot and the complete
entry-save/restore-ERET round trip. The gate also binds the checked-assembly
allocation proof identity and the deterministic
`a64_conformance` fuzz target, whose release floor is 65,536 random words.

Normal generation and verification remain offline:

```sh
./wync/tools/a64-conformance-gate.sh check
```

The 308 encodings are active for ordinary lowering and architecture operations;
the deliberately narrower `wyst.a64.checked-asm.core.v1` pack admits 13 exact
general-purpose source forms and their encodings. The separate
`wyst.a64.target-structural-asm.aarch64.v1` pack admits seven source forms only
after an exact target-owned sequence is authenticated.
[a64-encoding-catalog.tsv](a64-encoding-catalog.tsv) owns all 20 checked-source
grammars and canonical identities. The generated
[a64-active-encoding-catalog.tsv](a64-active-encoding-catalog.tsv) is the shared
machine authority for all 308 active encodings and contains 301 generated
operand decoders and 10 generated fixup programs, three transported as typed
checked-assembly fixups. Ordinary lowering and
architecture operations select these identities through
`instruction_catalog::encode_active_fields`; generated SYS/PSTATE finite-domain
contracts replace parallel operation tables. Checked assembly crosses the IR
boundary as `AsmBodyIr::Catalog` items carrying parsed instruction identities,
typed operands, labels, and fixups, so the backend does not reconstruct them
from source text. Final emission and placement patch boundaries authenticate
the selected active word.

The full-authority decoder derives Arm's reserved encoding region from the
authenticated pinned `Instructions.json` record and classifies every 32-bit
word as active, known unsupported, reserved, or unallocated. Disassembly and
lowering reports expose the same four-way result. The support and conformance
mechanisms satisfy the focused A64 authority-through-conformance contract; there are no
remaining focused completion blockers. They do not claim universal A64
support: the 4,023 inactive encodings and 4,602 inactive source forms remain
explicit work for the universal A64 checked-assembly conformance milestone.
Functional-execution evidence is also a
separate per-row coverage axis; generated static consistency and encode/decode
round trips are not described as independent execution validation.
[a64-raw-encoding-source-forms.jsonl.gz](a64-raw-encoding-source-forms.jsonl.gz)
is a deterministic source-adequacy audit generated by
`wync/tools/a64-raw-forms.mjs`. It reconciles all 4,331 current instruction
forms and 291 official aliases, preserves their reachable raw grammar,
predicates, mask/value layouts, and decoder-mask overlaps, and authenticates
the generator plus every input it reads. The generated
`arm64::authority_decode` recognition table derives its versioned runtime
schema and identity from this artifact; both identities are carried in build
evidence and version 7 `.wyst.a64.catalog` ELF metadata as the decoder schema,
runtime-identity digest, and raw source-form artifact digest. This remains a
recognition and canonical-identity layer, not a complete typed parser or
encoder: the pinned open-source authority supplies no assembly or disassembly
transforms, relocation records, or typed fixups, and the artifact records
those zero-coverage axes explicitly rather than inventing them. The current
full-authority recognition decoder proves the ordered 32-bit partition over
allocated rows, the authenticated reserved region, and the unallocated
complement. The allocated UDF encoding overrides the reserved region by exact
mask specificity, so unsupported operand semantics are never inferred from the
region classification.

## Table of Contents

| Chapter | File                                                                             | Purpose                                                                                                                            |
| ------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1       | [chapter-01-language-design.md](chapter-01-language-design.md)                   | Language identity, principles, no compiler-exploitable UB, effect system, and compiler philosophy.                                 |
| 2       | [chapter-02-targets.md](chapter-02-targets.md)                                   | Target facts, execution environments, and why runnability is explicit.                                                             |
| 3       | [chapter-03-project-builds.md](chapter-03-project-builds.md)                     | Project layout, manifests, source discovery, target selection, and build modes.                                                    |
| 4       | [chapter-04-modules.md](chapter-04-modules.md)                                   | Modules, imports, visibility, source references, and layout/module boundaries.                                                     |
| 5       | [chapter-05-boot.md](chapter-05-boot.md)                                         | First runnable program shape, boot entry assumptions, and early runtime setup.                                                     |
| 6       | [chapter-06-types.md](chapter-06-types.md)                                       | Scalar values, constants, conversions, addresses, arrays, slices, structs, bitstructs, and enums.                                  |
| 7       | [chapter-07-operators.md](chapter-07-operators.md)                               | Expression syntax, arithmetic, comparison, casts, precedence, and branchless selection.                                            |
| 8       | [chapter-08-functions.md](chapter-08-functions.md)                               | Declarations, functions, parameters, returns, control flow, labels, inline helpers, register pinning, and assembly escape hatches. |
| 9       | [chapter-09-memory-model.md](chapter-09-memory-model.md)                         | Normal memory, volatile memory, atomics, barriers, ordering, agents, and happens-before.                                           |
| 10      | [chapter-10-runtime.md](chapter-10-runtime.md)                                   | Explicit allocation direction, arenas, storage contracts, dynamic arrays, handles, buffers, and runtime boundaries.                |
| 11      | [chapter-11-intrinsics.md](chapter-11-intrinsics.md)                             | Runtime primitives for atomics, sysregs, traps, cache/TLB maintenance, CPU hints, counters, and target hooks.                      |
| 12      | [chapter-12-simd.md](chapter-12-simd.md)                                         | Explicit vector types, lane operations, vector loads/stores, and non-autovectorization policy.                                     |
| 13      | [chapter-13-scheduling.md](chapter-13-scheduling.md)                             | The standard scheduling policy and explicit source-order compiler boundaries.                                                       |
| 14      | [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md)               | Alignment, exception vectors, vector slots, and checked trap-frame ABI basics.                                                     |
| 15      | [chapter-15-abi-spec.md](chapter-15-abi-spec.md)                                 | Native ABI, AAPCS64 interop, argument/return classification, stack protocol, and register ownership.                               |
| 16      | [chapter-16-object-format.md](chapter-16-object-format.md)                       | Emitted artifacts, ELF sections, symbols, relocations, deterministic output, and object-format boundaries.                         |
| 17      | [chapter-17-optimization-modes.md](chapter-17-optimization-modes.md)             | Optimization modes and the boundary between explicit source behavior and compiler choices.                                         |
| 18      | [chapter-18-check-format-diagnostics.md](chapter-18-check-format-diagnostics.md) | Check mode, formatter behavior, diagnostic formats, editor catalog, and syntax highlighting floor.                                 |
| 19      | [chapter-19-learning-diagnostics.md](chapter-19-learning-diagnostics.md)         | Diagnostic explanations, learning fields, source insights, and teachable compiler feedback.                                        |
| 20      | [chapter-20-editor-integration.md](chapter-20-editor-integration.md)             | Editor/LSP behavior, language-server capabilities, task templates, and debug launch boundaries.                                    |
| 21      | [chapter-21-explain.md](chapter-21-explain.md)                                   | Lowering, effects, storage, and provenance reports that connect source to machine behavior.                                        |
| 22      | [chapter-22-generated-manifest.md](chapter-22-generated-manifest.md)             | Generated/build manifest provenance, declared inputs, host/tool facts, and artifact facts.                                         |
| 23      | [chapter-23-debug-info.md](chapter-23-debug-info.md)                             | Debug information goals, DWARF sections, DIEs, locations, and determinism.                                                         |
| 24      | [chapter-24-scale.md](chapter-24-scale.md)                                       | Scale measurement, deterministic rebuild benchmarking, and non-goals.                                                              |
| 25      | [chapter-25-compilation-phases.md](chapter-25-compilation-phases.md)             | Compilation phase products, semantic fact ownership, dependency rules, and rendering compatibility adapters.                       |
| 26      | [chapter-26-errors-and-progress.md](chapter-26-errors-and-progress.md)           | Materialized outcomes, live operations, exact forwarding, progress, recovery, cancellation, cleanup, traps, and C adapters.         |

## Appendices

| Appendix | File                                                                       | Purpose                                                                                                    |
| -------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| A        | [appendix-a-ir.md](appendix-a-ir.md)                                       | Compiler IR, SSA, effect representation, verifier invariants, register allocation, and lowering internals. |
| B        | [appendix-b-grammar.md](appendix-b-grammar.md)                             | Formal grammar, lexical rules, parsing forms, reserved syntax, and conformance.                            |
| C        | [appendix-c-doc-example-contracts.md](appendix-c-doc-example-contracts.md) | Documentation example categories and normative example conventions.                                        |
