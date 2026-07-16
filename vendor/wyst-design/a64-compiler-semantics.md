---
title: "A64 Compiler-Semantic Catalog"
group: manual
order: 27
summary: "Authenticated register, state, memory, control, privilege, effect, and structural facts for the pinned A64 authority."
---

# A64 Compiler-Semantic Catalog

This document is the normative human-readable contract for
`targets.a64-compiler-semantic-catalog`. The machine-readable authorities are:

- [`a64-instruction-semantics.tsv`](a64-instruction-semantics.tsv), schema
  `wyst.a64-instruction-semantics.v2`;
- [`a64-state-semantics.tsv`](a64-state-semantics.tsv), schema
  `wyst.a64-state-semantics.v3`;
- [`a64-structural-semantics.tsv`](a64-structural-semantics.tsv), schema
  `wyst.a64-structural-semantics.v2`;
- [`a64-support-policy.json`](a64-support-policy.json), schema
  `wyst.a64-support-policy.v1`, the checked-in activation policy;
- [`a64-support-manifest.json`](a64-support-manifest.json), schema
  `wyst.a64-support-manifest.v1`, and its exact generated row ledger
  [`a64-support-rows.tsv`](a64-support-rows.tsv);
- [`a64-conformance-policy.json`](a64-conformance-policy.json), schema
  `wyst.a64-conformance-policy.v2`, and the generated
  [`a64-conformance-manifest.json`](a64-conformance-manifest.json), exact
  [`a64-conformance-evidence.tsv`](a64-conformance-evidence.tsv), synthetic
  [`a64-conformance-targets.tsv`](a64-conformance-targets.tsv), and checked-in
  [`a64-conformance-oracles.tsv`](a64-conformance-oracles.tsv);
- [`a64-encoding-catalog.tsv`](a64-encoding-catalog.tsv), the exact active
  checked-assembly source-form catalog, and generated
  [`a64-active-encoding-catalog.tsv`](a64-active-encoding-catalog.tsv), the
  shared active encoder/decoder/fixup index.

The bundle identity uses schema `wyst.a64-compiler-semantic-bundle.v2`. Its
canonical UTF-8 input is the bundle-schema line, a labeled semantic-generator
line, then the instruction, state, structural, system-operation, and PSTATE-
immediate identities in fixed order. Entries are tab-separated and the input
ends in a newline. The compiler first hashes every embedded machine-readable
component, then hashes this domain-separated canonical composition; a stale
component, schema, generator, authority-manifest projection, reordered
component, or bundle digest is fatal.

The support identity is a separate authenticated layer. The support generator
hashes its source, every catalog and policy input, the generated manifest, and
the generated row ledger. Stale identities, duplicate or orphaned rows, or a
difference between the active policy sets and the semantic/instruction catalog
sets are compiler-build failures.

The conformance identity is the terminal focused-profile gate over these
layers. It authenticates the policy, generator, complete input set, evidence
ledger, synthetic-target ledger, static-oracle fixture, allocation evidence,
and fuzz parameters. A stale digest or any failure to reconcile these artifacts
with the support, semantic, encoding, source-form, and structural catalogs is a
compiler-build failure.

The focused contract requires exactly one complete instruction-semantic row for
every active encoding, one authority-backed state-semantic row for every state
contract required by an active support pack, and one structural-semantic row
for every active vector-table or trap-frame profile. Inactive instruction rows
remain recognized and explicitly `known_unsupported`; they do not receive
placeholder semantics. This is an exact contract over the current active
support profile, not a claim of universal A64 compiler support.

## Support disposition and focused closure

The generated support ledger has exactly 8,955 rows:

| Row kind | Active | `known_unsupported` | Total |
| -------- | -----: | ------------------: | ----: |
| Encoding | 308 | 4,023 | 4,331 |
| Source form or official alias | 19 | 4,603 | 4,622 |
| Target structural profile | 2 | 0 | 2 |
| **Total** | **329** | **8,626** | **8,955** |

There are zero unexplained and zero partially active rows. All 308 active
encoding rows are assigned to both `wyst.a64.ordinary-lowering.v1` and
`wyst.a64.architecture-operations.v1`. The deliberately narrower
`wyst.a64.checked-asm.core.v1` pack assigns the 12 general-purpose checked
source forms and their exact encodings. The
`wyst.a64.target-structural-asm.aarch64.v1` pack assigns seven additional
source forms only to authenticated target-owned sequences. The vector-table and trap-frame
rows are active in `wyst.a64.target-structural.aarch64.v1`. The focused bundle
contains all 31 authenticated register/state contracts required by these
active consumers.

Checked-assembly diagnostics apply support disposition before target
availability. An unrecognized spelling is unknown. A recognized inactive
spelling is known unsupported by this compiler release regardless of target
features. Only an active spelling can continue to architectural revision,
feature, execution-level, and state predicates and be reported as
target-unavailable. Selecting more target features cannot activate an inactive
row.

The compiler carries support schema, release, generator, generator-source and
generator-input identities, policy, manifest, and row-ledger digests, and the
selected support-pack identity in compiler/build identity and build evidence.
The support identity and counts are also published to editor metadata, and the
authenticated identity is persisted in version 7 `.wyst.a64.catalog` ELF
metadata for later inspection. Editor metadata publishes the exact per-row
support disposition and surface assignment as well as the support identity and
counts.

Support disposition is observable on emitted code. `wync disasm` annotates
each word with `support=active`, `support=known_unsupported`,
`support=reserved`, or `support=unallocated`; active checked-assembly provenance additionally
prints its source-form, canonical-instruction, encoding, authority, and semantic
identities. The lowering text report uses the same `support` values and its JSON
form publishes them as `supportDisposition`. A resolved word receives `active`
or `known_unsupported` from the current release manifest. Reserved and
unallocated words receive distinct outcomes from the authenticated full-word
authority partition. This is an
encoding-row classification, not an assertion that the instruction's origin
surface is active. In particular, an encoding may be active for ordinary
lowering and architecture operations while its source form remains unavailable
to the narrower checked-assembly pack.

## Focused conformance gate

The `wync-a64-conformance-v1` generator makes the release claim mechanically
checkable. Its `wyst.a64-conformance-evidence.v2` ledger has exactly 8,955
rows, one for each support row: 329 active and 8,626 `known_unsupported`, with
zero unexplained, multiply classified, or partially active rows. The row-kind
denominators remain 4,331 encodings, 4,622 source forms or official aliases,
and two target-structural profiles. Active rows bind their complete positive,
negative, boundary, static-differential, functional-execution, and allocation
evidence as applicable. Every inactive row retains its authority recognition,
stable support diagnostic, rejection witness, and a synthetic target proving
that target selection cannot promote it into the compiler-supported set.

The checked-in `wyst.a64-conformance-static-oracles.v2` fixture records one
witness word for every one of the 308 active encodings. Pinned LLVM 14.0.6
covers 307 rows and has one recorded tool gap; pinned Capstone 5.0.7 covers all
308. LLVM independently reassembles all 307 decoded witnesses to their exact
input words; Capstone has no assembler surface and is explicitly decode-only.
Full normalized operand text produces 249 exact Wyst/tool canonical agreements,
30 adjudicated external symbolic/default-operand spellings that differ from
Wyst canonical text, 22 canonical-alias differences, six tool-text differences,
and one accepted one-tool gap. Ordinary generation, verification,
compiler builds, and tests consume this fixture offline and never invoke either
host tool. `node wync/tools/a64-conformance.mjs refresh-oracles` is the separate,
explicit maintenance operation that invokes the pinned tools and checks their
versions.

Functional execution remains independent from static differential evidence.
At conformance-ledger level, all 329 active rows are covered by pinned
independent QEMU 11.0.0 evidence; none carries an unavailable-oracle gap or
claims an authenticated reference vector. The 308 instruction rows divide
into 302 expected-value paths in `item50-execution`, five state paths in
`item50-stateful`, and the `SVC` trap structural path in `trap-frame`. The 12
active source-form rows project their corresponding instruction evidence. The
same `trap-frame` fixture pins both active structural rows by observing the
selected `current_el_spx_sync` vector slot and the complete canonical
entry-save/restore-ERET round trip.

The generated target ledger has 153 profiles, and every profile includes the
authenticated `base` compiler binding. The base profile uses that binding
alone; the FP and AdvSIMD profiles use `base|fp_simd`; all three use revision
`v8Ap0` (v8.0). The LSE profile uses `base|lse` at `v8Ap1` (v8.1). Together
they cover all 308 active encodings. Another 149 conformance-only profiles use
`v9Ap7` (v9.7) and combine `base` with each exact authenticated authority
feature family to make all 4,023 inactive encodings architecturally selectable
while proving that the stable compiler-support rejection still takes
precedence. Those profiles are authenticated conformance bindings rather than
shippable compiler targets: dependency, revision, conflict, and future-feature
rules still apply, while unresolved authority residual constraints are bypassed
only at this named test boundary and covered by a per-target selection digest.

Allocation evidence `wyst.a64.checked-asm-allocation.item50.v1` includes the
generated maximum-cardinality scratch family: the complete verifier accepts a
28-register no-spill assignment, rejects the 29-member family with a recorded
conflict core, and accepts every one-member deletion. Paired witnesses also
prove zero scratch entry/exit materialization, zero boundary transfer for
same-home inputs, tied operands, and result-home reuse, and no unassigned-home,
whole-bank reservation, spill/reload, or stack-placement artifact. The
`a64_conformance` fuzz target uses deterministic seed `0x6a09e667f3bcc909` and
at least 65,536 random authority words in addition to structured active-row
cases.

Normal verification is offline and deterministic:

```sh
./wync/tools/a64-conformance-gate.sh check
```

The manifest hashes the aggregate gate, target-rule inputs, the QEMU fixture
sources, layouts, transcripts, wrappers, static coverage tables,
dynamic encoding traces, and the shared runner. Release mode enforces exact
QEMU 11.0.0 provenance and runs the isolated 65,536-word fuzz floor:
`./wync/tools/a64-conformance-gate.sh release`.

The conformance schema, release, generator, generator-source and input
identities, policy, manifest, evidence, target, and static-oracle digests are
part of compiler/build identity and release evidence. The generated manifest,
editor catalog, and version 7 `.wyst.a64.catalog` metadata carry the same
identity, so a consumer cannot silently combine artifacts from different
profiles. This gate supports only the exact focused active support profile; it
does not claim universal A64 or universal checked-assembly conformance.

## Instruction contract

An instruction row records operands; explicit and implicit reads and writes;
ties, destructive uses, early clobbers, fixed roles, and overlap rules;
register views, arrangements, lists and lanes, and target-owned operands; the
complete memory range, alignment, addressing, writeback, tag, gather/scatter,
first-fault, atomic, exclusive, ordering, and progress facts; control and stack
behavior; architecture, feature, execution-level, security, virtualization,
streaming, and state gates; effects and authority requirements; determinism,
fault, target-defined, and deprecation facts.

`none` is an explicit fact. Empty fields, wildcards, `unknown`, and manual
clobber, effect, or purity assertions are invalid. Operand- or target-dependent
facts use a named `formula:` expression. A formula must retain its precise
dependency; it cannot be replaced with a generic memory or effect bit. Every
formula used by the current admitted rows is executed into an operand- and
target-resolved contract before checked-assembly consumers see register, state,
ordering, effect, authority, determinism, or target-defined facts. The original
expression remains attached only as provenance. All 308 ordinary-lowering and
architecture-operation encodings now use this active semantic set and the
generated encoding authority.

The focused semantic catalog contains 308 exact rows. Its general-purpose
checked-assembly view contains 12 source forms: NOP, YIELD, WFE, WFI, SEV,
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
pure-eligible; the other current rows are not.

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

## Derived purity and functional evidence

Pure eligibility is not an editable catalog field. The compiler derives it
only for deterministic fallthrough computations with no memory, implicit or
target-owned state, effects, authority, fault/trap, target-defined behavior,
stack transition, or region escape. A manual purity assertion is invalid.

Functional execution coverage is a separate closed field. Every row carries
exactly one of `authenticated_reference:<evidence-id>`,
`pinned_independent_oracle:<evidence-id>`, or
`execution_oracle_unavailable:<gap-id>`. The first classification is reserved
for authenticated functional reference vectors. The second names a pinned
independent executor and exact runtime fixture. The third records an explicit,
row-specific gap; it does not weaken the row's static compiler support.

The v0.9 focused instruction profile has all 308 rows covered by pinned QEMU
11.0.0 independent-oracle evidence and no unavailable-oracle gaps. Its primary
coverage partition is 302 `expected_value` paths, five `state_path` rows, and
one `structural_path` row. No current instruction row claims an authenticated
functional reference vector. Both structural rows have pinned `trap-frame`
`structural_path` evidence: one selects `current_el_spx_sync`, and the other
observes the canonical entry-save/restore-ERET round trip. When multiple valid
fixtures execute one instruction row, policy order selects the primary catalog
evidence identity while the conformance ledger retains the complete set. The
generated semantic manifest publishes all three instruction counts.

[`a64-conformance-policy.json`](a64-conformance-policy.json) is a digested input
to the semantic generator and owns this mapping. Evidence for an inactive
encoding is fatal, as are conflicting available classifications, missing
identities, and missing gap reasons. Schema validation, bijection checks,
encoding round trips, external disassembly comparisons, and static
self-consistency never count as functional execution validation.

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

The support manifest is the sole support-disposition authority. The generated
active catalog is the shared machine authority for the 308 ordinary-lowering
and architecture-operation encodings; its current index contains 301 generated
operand decoders and 10 generated typed fixup programs. Production encoders use
`instruction_catalog::encode_active_fields`, final emission and placement
patches authenticate the selected active word, and generated SYS/PSTATE tables
own their finite semantic domains. The proof
`encoding::ordinary_selector_set_exactly_covers_every_active_encoding` checks
that ordinary selectors cover exactly the 308 active rows.

ARM64 `system_register` declarations consume the same generated register and
MRS/MSR identities plus their selected-system-register semantic formulas. A
catalog-named declaration resolves its exact canonical name; an encoded
declaration resolves one authenticated active target-extension row before typed
IR. Neither source declaration nor lowering may create a register fact, keep a
free tuple, own a second permission/effect table, or construct assembly text.

For checked assembly, `AsmBodyIr::Catalog` transports parsed catalog
instructions, typed operands, labels, fixups, stable identities, spelling, and
source spans across the IR boundary. The backend consumes those typed items and
does not reparse assembly body text. The regressions
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

There are no remaining focused Roadmap items 46-50 completion blockers. This is
not a universal support claim: 4,023 encodings and 4,603 source forms remain
explicitly `known_unsupported` until Roadmap item 105 supplies complete
semantics and activation artifacts and reruns this gate over the official
denominator. Functional-execution coverage remains independent; static
generation, validation, and
encode/decode self-consistency do not count as an authenticated execution
oracle.
