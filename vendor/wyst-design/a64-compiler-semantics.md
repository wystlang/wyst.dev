---
title: "A64 Compiler-Semantic Catalog"
group: manual
order: 27
summary: "Authenticated register, state, memory, control, privilege, effect, and structural facts for the pinned A64 authority."
---

# A64 Compiler-Semantic Catalog

This document is the required human-readable contract for
`targets.a64-compiler-semantic-catalog`. The machine-readable authorities are:

- [`a64-instruction-semantics.tsv`](catalogs/aarch64/generated/a64-instruction-semantics.tsv);
- [`a64-state-semantics.tsv`](catalogs/aarch64/source/a64-state-semantics.tsv);
- [`a64-structural-semantics.tsv`](catalogs/aarch64/source/a64-structural-semantics.tsv);
- [`a64-support-policy.json`](catalogs/aarch64/source/a64-support-policy.json), the current activation
  policy, and [`a64-support-rows.tsv`](catalogs/aarch64/generated/a64-support-rows.tsv), its generated
  support table;
- [`a64-encoding-catalog.tsv`](catalogs/aarch64/generated/a64-encoding-catalog.tsv), the exact active
  checked-assembly source-form catalog, and generated
  [`a64-active-encoding-catalog.tsv`](catalogs/aarch64/generated/a64-active-encoding-catalog.tsv), the
  shared active encoder/decoder/fixup index.

When support changes, update the source catalogs, regenerate the derived tables
that the compiler consumes, and update the affected behavior tests.

## Support disposition and focused closure

Each row is either active on one or more compiler surfaces or recognized as
`known_unsupported`. Active source forms may belong to general checked assembly
or to target-owned structural sequences such as vector tables and trap frames.
The support table defines the compiler's supported selection.

Checked-assembly diagnostics apply support disposition before target
availability. An unrecognized spelling is unknown. A recognized inactive
spelling is known unsupported by the current compiler regardless of target
features. Only an active spelling can continue to architectural revision,
feature, execution-level, and state predicates and be reported as
target-unavailable. Selecting more target features cannot activate an inactive
row.

Editor metadata publishes the current per-row support disposition and surface
assignment. Executables contain only the emitted instruction bytes; disassembly
and reports classify those bytes against the current catalog when requested.

Support disposition is observable on emitted code. `wync disasm` annotates
each word with `support=active`, `support=known_unsupported`,
`support=reserved`, or `support=unallocated`. The lowering text report uses the
same `support` values and its JSON form publishes them as `supportDisposition`.
A resolved word receives `active`
or `known_unsupported` from the current support table. Reserved and
unallocated words receive distinct outcomes from the authenticated full-word
authority partition. This is an
encoding-row classification, not an assertion that the instruction's origin
surface is active. In particular, an encoding may be active for ordinary
lowering and architecture operations while its source form remains unavailable
to the narrower checked-assembly pack.

## Instruction contract

An instruction row records operands; explicit and implicit reads and writes;
ties, destructive uses, early clobbers, fixed roles, and overlap rules;
register views, arrangements, lists and lanes, and target-owned operands; the
complete memory range, alignment, addressing, writeback, tag, gather/scatter,
first-fault, atomic, exclusive, ordering, and progress facts; control and stack
behavior; architecture, feature, execution-level, security, virtualization,
streaming, and state gates; effects and authority requirements; determinism,
fault, target-defined, and deprecation facts.

`none` is an explicit fact. Empty fields, wildcards, and `unknown` are invalid.
Operand- or target-dependent facts use a named `formula:` expression. A formula must retain its precise
dependency; it cannot be replaced with a generic memory or effect bit. Every
formula used by the current admitted rows is executed into an operand- and
target-resolved contract before checked-assembly consumers see register, state,
ordering, effect, authority, determinism, or target-defined facts. The original
expression remains attached only as provenance. All 309 ordinary-lowering and
architecture-operation encodings now use this active semantic set and the
generated encoding authority.

The focused semantic catalog contains 309 exact rows. Its general-purpose
checked-assembly view contains 13 source forms: ADRP, NOP, YIELD, WFE, WFI, SEV,
SEVL, RET, B, BL, ERET,
MRS, and MSR, against exactly 4,331 current A64 instruction forms (4,349 raw
forms minus 18 authenticated future-only exclusions). Generic HINT with its
seven-bit immediate is
recognized but known unsupported. The compiler rejects `hint #imm` fail-closed
before checked IR because immediates outside `#0` through `#5` overlap
feature-specific authority forms—for example, `hint #7` is XPACLRI when
FEAT_PAuth is present—and the active pack has no target-aware complete
immediate classifier. Generic HINT disassembly may still be shown as a
known-unsupported inspection result, but it is not assigned an active
checked-assembly grammar or semantic row. The six exact named forms retain
their own official identity and semantic row. MRS and MSR retain
selected-system-register formulas for privilege, security, state, ordering,
effect, fault, and target-defined behavior. RET and ERET record terminal
control transfer and their architectural fault boundary. NOP is mechanically
eligible for effect-free assembly; the other current rows are not.

Sixteen-byte pair atomic or exclusive rows, when admitted by the authority,
must describe one 16-byte atomic memory range, require 16-byte alignment and an
atomic-capable Normal-memory contract, and must never claim the one-word
`atomic<u64>` source-storage contract.

## Register and architectural-state classes

The 31-row state schema binds each compiler class to its authority identity,
architecture, feature gate, minimum revision, and authenticated pinned-source
basis. The finite required set includes GPR, FP/SIMD, SVE Z/P/FFR and vector
length, SME ZA/ZT0/streaming and streaming vector length, NZCV, PSTATE,
FPCR/FPSR, pointer-authentication keys, MTE tag state, exception state,
exclusive monitors, and the per-processing-element event register. Missing
classes, weakened feature or revision gates, or source references absent from
the digested target supplement are compiler-build failures.

Class coverage is independent of instruction coverage. A state-class record
does not admit an encoding that lacks its own complete instruction-semantic
row.

## Derived effect-free eligibility and execution tests

Effect-free eligibility is derived only for deterministic fallthrough
computations with no memory, implicit or target-owned state, effects, authority,
fault/trap, target-defined behavior, stack transition, or region escape.

The QEMU fixtures exercise instruction results, state transitions, and the trap
frame. When the compiler or language semantics change intentionally, update the
fixtures alongside the implementation.

## Structural profiles

The AArch64 vector-table row requires `0x800` alignment and the 16 canonical
roles in architectural order, each exactly `0x80` bytes, with bare entry and
terminal-body rules. The AArch64 trap-frame row requires a `0x10`-aligned,
`0x110`-byte frame containing `x0` through `x30`, `ELR_ELx`, `SPSR_ELx`, and the
interrupted stack pointer at the cataloged offsets. Entry and restore contracts
save and restore that exact state; restore terminates through ERET. Both
profiles retain their EL, exception-state, target-profile, and compatibility
gates rather than inheriting them from source placement.

## Consumers

The support catalog is the sole support-disposition authority. The generated
active catalog is the shared machine authority for the 309 ordinary-lowering
and architecture-operation encodings; its current index contains 301 generated
operand decoders and 10 generated fixup programs, three transported as typed
checked-assembly fixups. Production encoders use
`instruction_catalog::encode_active_fields`, final emission and placement
patches authenticate the selected active word, and generated SYS/PSTATE tables
own their finite semantic domains. The proof
`encoding::ordinary_selector_set_exactly_covers_every_active_encoding` checks
that ordinary selectors cover exactly the 309 active rows.

ARM64 `system_register` declarations consume the same generated register and
MRS/MSR identities plus their selected-system-register semantic formulas. A
catalog-named declaration resolves its exact canonical name; an encoded
declaration resolves one authenticated active target-extension row before typed
IR. Neither source declaration nor lowering may create a register fact, keep a
free tuple, own a second permission/effect table, or construct assembly text.

For checked assembly, `AsmBodyIr::Catalog` transports parsed catalog
instructions, typed operands, labels, fixups, stable identities, spelling, and
source spans across the IR boundary. The backend consumes those typed items and
does not reparse assembly body text. The semantic pass also derives purity,
machine effects, clobbers, control flow, and ordinary stack preservation from
those rows; source does not restate them. `retained` is only an occurrence
retention requirement, while stack and trap-frame transitions are compiler-owned
first-class statements. The regressions
`backend::tests::inline_asm_ops::checked_asm_ir_carries_typed_identity_and_symbolic_gpr_to_emission`
and
`backend::tests::inline_asm_ops::checked_asm_ir_carries_typed_local_labels_and_fixups_to_emission`
cover that boundary. Known-unsupported rows cannot fall through to a
compatibility parser or handwritten assembly encoding.

The complete generated recognition decoder classifies every word as active,
known unsupported, reserved, or unallocated; the active operand decoder and
canonical renderer consume generated field programs. Editor publication carries
the support identity, counts, exact per-row dispositions, and generated SYS
vocabulary. Authenticated generated target-supplement metadata owns vector-slot
and trap-frame field shape, order, offsets, and extents in production validation
and lowering.

The current A64 semantics cover the compiler's active instruction set. This is
not a universal support claim: 4,023 encodings and 4,602 source forms remain
explicitly `known_unsupported` until their semantics are implemented and
tested. Functional-execution coverage remains independent; static generation,
validation, and encode/decode self-consistency do not prove runtime behavior.
