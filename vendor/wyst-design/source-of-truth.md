---
title: "Wyst Source Of Truth"
group: manual
order: 0
summary: "Snapshot authority, conflict resolution, feature states, and schema contracts."
---

# Wyst Source Of Truth

## Development Status

Wyst is unpublished and under active development. It makes no backwards-
compatibility promise for source, semantics, design principles, ABI behavior,
object or report schemas, compiler interfaces, names, identities, or digest
algorithms. Any of them may be revised or replaced when the project learns that
a different design is better.

This document is authoritative for the currently selected repository snapshot,
not for all future Wyst designs. Terms such as _canonical_, _versioned_,
_stable_, _closed_, _normative_, and _exact_ require consistency and
determinism inside that snapshot. They do not make a decision permanent or
create a migration obligation. A content digest identifies exact content under
its selected algorithm; changing the content or algorithm changes the digest.
Digest checks exist to reject accidentally mixed artifacts, not to preserve an
obsolete contract.

The Wyst language and `wync` compiler use independent semantic versions for
actual releases. Roadmap completion and ordinary development changes do not
change those versions. Exact content-derived identities distinguish development
language snapshots and compiler builds between releases. A release is an
explicit publication decision that may nominate any clean committed snapshot
at any time; its proposed language and compiler versions are selected from the
changes since their respective previous releases and bound into the full gate.
They become released only when that exact passing snapshot is published.

Before `1.0.0`, a breaking change or compatible feature increments the
applicable language or compiler minor version, while a contract-preserving fix
increments its patch version. At or after `1.0.0`, an incompatible change
increments the major version, a compatible feature increments the minor
version, and a compatible fix increments the patch version. Documentation,
tests, and evidence-only changes require no release. A compiler-only release
does not change the language version. Schema revisions, target architecture
revisions, and external tool versions remain independent domain identifiers.

The normative canonical input, domain-separation, bump, nomination, and
publication rules are in [`release-identity.md`](release-identity.md). The
machine-readable projection is `semantic-db.json`'s `releaseIdentityContract`.
Current development records carry `wyst.language-snapshot.v1` and
`wync.compiler-build.v1` SHA-256 identities, `releaseStatus = development`, and
null semantic release versions. The Cargo package version is packaging input
only and is never rendered as a released compiler version.
The current semantic compatibility tuple is
`wyst.object-compatibility-key.v2`; final images carry
`wyst.artifact-identity.v2`. Both bind the exact language snapshot rather than
a release label.

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
[`a64-support-policy.json`](a64-support-policy.json) is the checked-in selected snapshot
activation policy. The authenticated generated
[`a64-support-manifest.json`](a64-support-manifest.json) and
[`a64-support-rows.tsv`](a64-support-rows.tsv) exactly partition all 8,955
support-bearing encoding, source-form/alias, and target-structural subjects as
active or `known_unsupported`. They record a focused ordinary-lowering,
architecture-operation, checked-assembly, and structural support profile, not
universal A64 compiler support. The manifest digest-owns the generated
[`a64-support-source-domains.json`](a64-support-source-domains.json) projection:
the exact 13 general-purpose and seven target-structural-only active source
forms, their operand grammars and aliases, and their register view/list
domains. That projection is cross-tool input, not an independent authority.
[`a64-conformance-manifest.json`](a64-conformance-manifest.json) is the
generated terminal release gate for that profile. Its exact
[`a64-conformance-evidence.tsv`](a64-conformance-evidence.tsv) ledger accounts
for the same 8,955 rows as 330 active and 8,625 `known_unsupported`, with zero
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
focused A64 authority-through-conformance model activates 308 encodings for
ordinary lowering
and architecture operations, keeps general-purpose checked assembly
intentionally at 13 exact source forms, adds seven target-structural-only
source forms, and supplies 308 instruction-semantic rows, 31 state contracts,
and two structural contracts. The deterministic active catalog contains 301
generated operand decoders and 10 generated fixup programs, three transported
as typed checked-assembly fixups. Ordinary and
architecture encoders select its rows, while checked-assembly IR transports
parsed identities, typed operands, labels, and fixups without backend text
reconstruction. The full-authority decoder proves the complete active/known-
unsupported/reserved/unallocated word partition. There are no remaining focused
completion blockers. Universal A64 checked-assembly activation belongs to the
later universal A64 checked-assembly conformance milestone; the 4,023 inactive
encodings and 4,602 inactive source forms
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

This document is the human-readable view of the selected Wyst semantic
snapshot. The machine-readable registry is
[`design/semantic-db.json`](semantic-db.json); it owns enumerated semantic
facts such as feature states, version identifiers, operator spellings, effect
names, public vocabularies, ABI classifications, and schema names. Detailed
rules still live in the chapters and appendices under the precedence order
below.

The selected snapshot runtime operation surface is the checked-in
[`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv). It owns
sealed category membership, stable semantic identity, parameters, ordering,
target plan, report identity, and delegation to earlier language owners. The
[`measurement-counter-catalog.tsv`](measurement-counter-catalog.tsv) and
[`environment-service-catalog.tsv`](environment-service-catalog.tsv) select
the fixed generic counter-source and semihost ABI contracts. The counter
catalog owns only source identity/lowering, width, frequency acquisition,
minimum EL/enablement, failure, and source-report identity. It does not own or
imply a runtime domain/configuration epoch, endpoint comparability,
serialization, a realized frequency, platform-state progress, mutable-control
exclusion, maximum interval span, or numeric elapsed-time semantics. The static
provider `a64-generic-virtual-counter-instance-provider-v1` version 1 is an
atomic target-profile extension under
`wyst.platform-counter-instance-provider.v1`, bound to that exact source
descriptor, record schema `wyst.platform-counter-instance-record.v1`, and
universe-evidence schema `wyst.platform-counter-universe-evidence.v1`. Its
compiler-owned synthetic consumer validates optional immutable per-run records
and derives `wyst.platform-counter-instance-identity.v1` identities only after
the record exactly matches one authority whose digest is pinned by an
independently selected
`wyst.platform-counter-universe-evidence-contract.v1` platform-environment
contract. Self-consistent authority resealing is insufficient; no current
concrete environment is claimed as a producer. The performance/
resource-report and benchmark-comparison milestone must bind the source-
descriptor, provider/schema, and record identities/content digest at both
endpoints to interval evidence. Runtime record facts are not fields of the
counter-source catalog and never enter reusable compilation-cache keys.
The exact 88-name predecessor inventory lives only in
[`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv); it is a
release-audit input and is deliberately absent from active parser and editor
vocabulary.

Host compiler-efficiency authority is versioned by
`wync.compilerEfficiencyPolicy.v1` and
`wync.compilerEfficiencyEvidence.v1`, with `wync rebuild-benchmark` and
`wync/tools/bench/` as the single measurement path. Chapter 24 owns the exact
workloads, eligible-runner and interleaved baseline/candidate protocol,
aggregation, budgets, evidence-preservation contract, status axes, and timing-
trace reconciliation. The policy is a checked-in host release-gate input;
samples, aggregates, and verdicts are terminal host release evidence. Neither
class is a compilation input or may
affect source acceptance, diagnostics, phase scheduling, reusable compilation-
cache keys, artifact identities, or emitted bytes. These host schemas neither
consume platform counter-instance records nor define the static, modeled, or
target-measured performance schemas reserved for the later performance/resource
milestone.

`wync.localBench.v1` is an envelope over the exact policy and
`wync.compilerEfficiencyEvidence.v1`; it owns no independent baseline,
aggregation, budget, or verdict. Evidence with a missing or mismatched policy
schema/version/identity/content digest produces no verdict. Only two eligible
sample sets with identical canonical workload inputs and the required same
runner-configuration identity are `comparable`; cross-machine evidence cannot
drive a verdict without a separately versioned calibration contract. The same
domain-separated physical-instance digest, one run-session UUID, and a clean
before/after Wyst revision/tree identity are also required. A pending
bootstrap has no baseline review and cannot produce a verdict; explicit
bootstrap-review mode can produce only reviewed null-verdict P0 evidence after
all non-baseline facts pass. Every pinned
baseline is invalid unless its policy record preserves the reviewed previous
and new binary identities/object references, verbatim raw evidence and its
complete run archive, exact P0 policy, runner/physical/run-session identities,
reason, and accepted regressions under Chapter 24's exact contract.
Deterministically compressed, content-addressed compiler binaries, policy,
verbatim evidence, and complete deterministic run archives
are checked in under `wync/tools/bench/evidence/v1/objects/sha256/`; both
compressed-object and uncompressed-content SHA-256 digests are covered by a
reviewed ledger under `wync/tools/bench/evidence/v1/records/`. Scratch paths and
mutable job artifacts are not durable evidence. External release assets are
optional mirrors only and cannot affect local eligibility.
The terminal registry, not a self-referential policy field, accepts the exact
reviewed P0→P1 transition plus exactly one bootstrap and one final passing
record. Preservation verification replays semantic suite, compiler-role,
absolute-budget, equivalence, repository, and verdict checks; byte presence
alone is insufficient. Numeric budgets are inactive until their exact content
digest has explicit human reviewer/time/reason approval.
The selected policy records each timing host ID's exact kind and ordered
canonical-phase mapping. Evidence aggregation revalidates sample membership,
interleaved execution ordinals, compiler identities, and rebuild-report fields;
preservation revalidates byte identity between verbatim evidence, its local-
report envelope, and every archived raw command output while rejecting
unreviewed objects.

Execution-strand authority is versioned by
`wyst.execution-strands.v1` and `wyst.context-stability.v1`. Chapter 13 owns
the agent/strand control order, target-neutral `execution_suspension` effect,
mandatory `strand_suspension_boundary`, zero-code authenticated
`core.execution.suspension_point` marker, and the closed stability order
`active_context_affine < task_stable < cross_strand_stable`. Chapter 2 owns
`wyst.execution-environment-contract.v1` plus the versioned execution- and
completion-provider descriptor schemas. These are compiler compatibility and
provenance facts: they do not define a scheduler, operating-system API,
safepoint, memory barrier, task-selection synchronization edge, or relocatable
native stack.

The closed selected snapshot `#` surface is the 14-row
[`meta-operation-catalog.tsv`](meta-operation-catalog.tsv), which owns each
operation's legal positions, parameters, phase, result, target facts,
relocation behavior, and diagnostics contract. The complete recorded 53-name
predecessor **disposition mapping** lives only in
[`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv). No predecessor
row remains in the current syntax-word catalog. No production lexer, parser,
formatter, diagnostic, or editor path consumes the historical spellings. The
audit is a release/conformance input only, never a token, parser, diagnostic,
alias, rewrite, completion, hover, or highlight input.
[`removed-source-spelling-allowlist.tsv`](removed-source-spelling-allowlist.tsv)
closes the checked-in release-input boundary. Only the two non-parser manifests
and named negative `.wyst` fixtures receive whole-file allowances. Genuine
released-history prose uses `archived-historical` allowances with exact Markdown
section boundaries; every such scope must contain a recognized predecessor
spelling. `ROADMAP.md` is a non-normative planning document excluded as one
exact file rather than allowlisted; it cannot feed parser, editor, tooling,
manifest, or release catalogs.

Clause-to-test traceability is tracked in
[`design/conformance-index.md`](conformance-index.md). A semantic clause is not
complete merely because prose, examples, or compiler code changed; the clause's
conformance row must be added or updated at the same time.

Current manual snapshot:

| Surface | Current identity | Status | Notes |
| ------- | ------- | ------ | ----- |
| Language | `wyst.language-snapshot.v1` + computed SHA-256 identity | selected snapshot | Covers the current keyword-led core syntax, closed meta-operation and attribute surfaces, hard modifiers, non-parser predecessor-removal audits, and target-defined vector-table and trap-frame DSLs currently selected in this worktree. The content identity authenticates the exact contract and makes no release claim. |
| Compiler build | `wync.compiler-build.v1` + computed SHA-256 identity | development build | Covers the exact compiler input and build-fact closure. Ordinary builds carry no language or compiler semantic release version. |
| Native ABI | `wyst.nativeAbi.v0.8` | current selected snapshot | Chapter 15 owns the currently selected Native and AAPCS64 rules. |
| Object/interface schema bundle | `wyst.objectInterface.v2` | implemented plus future-version rows | Chapter 16 and the semantic database own semantic-module variants, declaration/symbol/member/compatibility identities, generic body/dependency ownership and link-once survivor contracts, object artifact, relocation, and emitted-interface classifications. |
| Report schema bundle | `wync.reports.v1` | implemented and experimental rows | Groups the report schemas listed below. Individual report payloads still carry their own `schema` and status fields. |
| Editor/diagnostic interface schema bundle | `wync.interfaces.v1` | implemented | Groups CLI/editor/LSP adapter payloads listed below. |

The repository contains historical release tags, including `v0.8`. No new
release is currently nominated. Future releases use the semantic-version policy
above, while rows marked implemented below describe the active worktree unless
they explicitly describe a historical snapshot.

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

Every feature row uses one of these states. These are current development and
implementation states, not compatibility promises; a deliberate clean-break
change may revise a row and remove its old surface atomically.

| State | Meaning |
| ----- | ------- |
| Implemented | Accepted by the compiler or emitted by tooling in the selected snapshot, with tests or snapshots protecting its current contract. It may still be redesigned. |
| Future-version normative | A candidate rule selected for planned work, but not necessarily accepted or emitted by the current compiler. It may be revised before implementation. |
| Experimental | An available inspection or research surface that may change or be removed without migration support. |
| Reserved | Rejected syntax, names, encodings, or namespaces with no active meaning in the selected snapshot. Reservation makes no promise about their future use. |
| Deprecated | Still accepted in the selected snapshot but currently planned for replacement or removal. No minimum compatibility period is implied. |
| Removed | Absent from the selected snapshot. Implementations reject it or treat it as unknown; examples use it only when documenting history or diagnostics. |

Features not listed here inherit the state of the nearest listed feature
family. A chapter that introduces a new externally visible syntax form, ABI
rule, report field, CLI payload, object artifact, or editor behavior must add
or update a row in this registry.

## Feature Status Registry

### Core Language

| Feature family | State | Snapshot / publication history | Owning detail |
| -------------- | ----- | ------------------------------ | ------------- |
| Independent semantic release versions and exact language-snapshot/compiler-build identities (`release.semantic-version-and-exact-identity`) | Implemented | selected snapshot; no current release nomination | [`release-identity.md`](release-identity.md); [`language-snapshot-inputs-v1.txt`](language-snapshot-inputs-v1.txt); `wync identity`; `wync/tools/release-gate.sh` |
| ARM64-first systems-language identity, deterministic lowering, no compiler-exploitable undefined behavior | Implemented | legacy v0.7 publication | Chapter 1 |
| Behavior taxonomy for Defined, Target-defined, Indeterminate bits, Architectural fault or trap, and Trusted-contract violation, with no category granting optimizer impossible-state assumptions | Implemented | legacy v0.8 publication | Chapter 1 |
| Compilation Phase Contract for phase products, semantic fact ownership, terminal report-only facts, and rendering compatibility adapters (`language.compilation-phase-contract`) | Implemented | legacy v0.8 publication | [chapter-25-compilation-phases.md](chapter-25-compilation-phases.md) |
| Authority-derived compiler inspection reports with typed phase products, common epistemic metadata, truthful unknown/generated/decode/allocation states, structural typed-IR dependency shape, and project-artifact read-only behavior (`tooling.authority-derived-inspection-reports`) | Experimental | `wync.reports.v1` | [chapter-21-explain.md](chapter-21-explain.md) |
| Canonical typed diagnostic-kind registry shared by error and warning emitters, explanations, CLI/JSON/LSP/editor rendering, suggestions, and checked code actions (`tooling.canonical-diagnostic-kind-registry`) | Implemented | `wync.interfaces.v1` | Chapters 18–20 |
| IR/source semantic agreement for fixed arrays, range slices, dynamic arrays, enums, aggregates, explicit address methods/units, named conversions, raw addresses, relocation origins, and alignment/fault facts (`language.ir-source-semantic-agreement`) | Implemented | selected snapshot | [appendix-a-ir.md](appendix-a-ir.md); Chapter 16 |
| Structural SSA construction from immutable predecessor environments, exact typed phi edges, dominance verification, and deterministic simultaneous incoming ABI transfers (`language.structural-ssa-and-incoming-abi-transfers`) | Implemented | legacy v0.8 publication | [appendix-a-ir.md](appendix-a-ir.md); Chapter 15 |
| Trust-boundary model for `trusted_callable<T>(address)`, raw-address assertions, raw function-pointer construction, foreign declarations, manually stated foreign effects, inline-assembly effects and clobbers, ABI overrides, and unproven library contracts | Implemented | selected snapshot | Chapter 1; Chapter 21 |
| Ordinary local reads require initialization on every incoming control-flow path; deliberate indeterminate-bit observation uses the explicit `MaybeUninit<T>.read_uninit()` contract | Implemented | selected snapshot | Chapters 9 and 11; `semantic-db.json` behavior classifications |
| Whole-object deliberate raw storage uses the non-copyable `MaybeUninit<T>` API: `uninit<T>()`, `.write`, proved `.read`, audited `.read_uninit`, `.assume_init`, and `addr_of`, with CFG-joined initialization evidence and distinct typed IR/report facts (`language.maybe-uninit-whole-object-storage`) | Implemented | selected snapshot | the qualified semantic-operation catalog milestone; Chapter 9; Chapter 11; Appendix A |
| Qualified semantic operations under sealed `core.arch`/`core.environment` categories and the authenticated whole-module `core.execution` provider marker, stable typed-IR/report identity, target plans, fixed counter-source/service/provider descriptors, and the exact non-parser 88-name `%` removal audit (`language.semantic-operation-catalog`) | Implemented | `wyst.semantic-operation-catalog.v0.9` | [`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv); [`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv); the qualified semantic-operation catalog milestone |
| Closed 15-form compile-time, target, layout-query, and fatal-boundary `#` surface with phase, type, target-fact, relocation, and trap contracts (`language.meta-operation-catalog`) | Implemented | `wyst.metaOperations.v0.9` | [`meta-operation-catalog.tsv`](meta-operation-catalog.tsv); Chapter 26 |
| Every recorded predecessor `#` name outside the retained 15-form surface (`language.legacy-hash-directive-dispositions`) | Removed | selected snapshot | [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) is a non-parser legacy development-snapshot audit. Production source has one grammar and no compatibility path for these spellings. |
| UTF-8 source, ASCII identifiers, comments, string literals, byte character literals with ASCII direct characters and explicit byte escapes, numeric literal separators (`language.lexical-literal-surface`) | Implemented | legacy v0.8 publication | Appendix B, Chapter 6 |
| Semicolon-free, whitespace-insensitive source; grammar-complete statement boundaries; maximal expression continuation; brace-only control-flow bodies; bare `_` discard; and longest-match `..<`, `..=`, `..` punctuation (`language.source-lexical-contract`) | Implemented | selected snapshot | Appendix B |
| One versioned syntax-word catalog with unique reserved, contextual, and unshadowable rows shared by all source tools (`language.syntax-word-catalog`) | Implemented | `wyst.syntaxWords.v0.9` | [`syntax-words.tsv`](syntax-words.tsv) |
| Keyword-led `module`, `import`, `fn`, `const`, `var`, `label`, `struct`, `enum`, and `bitstruct` declarations, with `pub` only in its canonical prefix slot and phase-correct mandatory binding initializers (`language.keyword-led-declarations-bindings`) | Implemented | selected snapshot | Chapters 4, 6, and 8; Appendix B |
| Predecessor punctuation-led core declarations and unkeyworded bindings (`language.punctuation-led-core-declarations`) | Removed | selected snapshot | Appendix B; use the keyword-led forms. |
| Direct non-ASCII character literals truncated to `u8` (`language.truncating-non-ascii-character-literals`) | Removed | legacy v0.8 publication | Appendix B; use string literals for UTF-8 text or explicit `\xNN` byte escapes. |
| Scalar primitives, `bool`, fixed-width integers, `f32`/`f64`, `string`, untyped integer constants | Implemented | legacy v0.7 publication | Chapter 6 |
| Unshadowable named conversions `widen`, `truncate`, `signcast`, `numeric`, `bitcast`, `address`, `relens`, `qualify`, `floatcast`, `saturate`, and `truncate_bits`, with no implicit numeric conversion (`language.named-explicit-conversions`) | Implemented | selected snapshot | Chapter 6; Appendices A and B |
| Predecessor categorized postfix conversions (`language.predecessor-categorized-conversions`) | Removed | selected snapshot | Use the corresponding named conversion operation. |
| `checked<T>(value)` conversion (`language.checked-conversion`) | Reserved | none | Rejected until the selected failure model is implemented. |
| Floating-point arithmetic in compile-time constants | Future-version normative | `wyst.language.next` | Chapters 6, 7, and 8 mark the accepted future surface; current compiler rejects it. |
| Declarative-placement-only `at`; `@T`, `@volatile T`, and `@mmio T` address types with visible `.load()` and `.store(value)` operations, byte-address endian methods, and exact qualifier effects (`language.explicit-address-memory-operations`) | Implemented | selected snapshot | Chapter 6; Chapter 9; Appendices A and B |
| Unit-explicit `byte_offset`, `element_offset`, and `field_addr`, with no typed-address `+`, `-`, `+=`, or `-=` and byte-measured relocation addends (`language.unit-explicit-address-offsets`) | Implemented | selected snapshot | Chapter 6; Chapter 16; Appendix A |
| Runtime `addr_of(local)` with exact local lens, addressability resource reporting, hard-register rejection, and non-escape lifetime (`language.runtime-local-address-materialization`) | Implemented | selected snapshot | Chapter 6; Chapter 11; Appendix A |
| Predecessor typed-memory, runtime address-of, endian primitive, and typed-address arithmetic spellings (`language.predecessor-address-access-syntax`) | Removed | selected snapshot | Use address methods and the unit-explicit named operations. |
| Effects, authority/trust facts, and generated backend resources are separate; `#[deny_effects(...)]` and effect diagnostics cover semantic effects, while `#[frame(...)]` and frame/spill/register/code-size/veneer/caller-copy facts are post-lowering resources | Implemented | selected snapshot | Chapter 1; Chapter 21 |
| Volatile access semantics, MMIO intent, and architectural memory type are separate; `@volatile T` records compiler-visible access ordering, `@mmio T` records programmer MMIO intent, and Device/Normal memory type comes from target/runtime mapping facts | Implemented | legacy v0.8 publication | Chapters 6 and 9; Appendix A |
| Arrays `[N]T`, read-only non-owning slices `[]T`, end-exclusive `[..]`/`[..<]` slice ranges, and ordinary-address `.slice(elements = count)` raw views (`language.slice-range-views`) | Implemented | selected snapshot | Chapter 6; Appendix B |
| Typed materialized `Option`/`Result`, arbitrary fixed-layout movable enum payloads, expression `match`, nominal synchronous operations, exact operation-only `?`, zero-capture progress with concrete ceilings and `handler_invoke`, explicit recovery capabilities, cancellation commitment, reverse-order `defer` cleanup, explicit fatal extraction, and status/out plus tagged/out C profiles (`language.typed-outcomes-and-progress`) | Implemented | `wyst.materializedSum.v1` + `wyst.operationProtocol.v1` | [Chapter 26](chapter-26-errors-and-progress.md); Chapters 6, 8, 13, and 15; Appendices A-B |
| One universal deterministic target-aware optimizer with authenticated proof/cost/provenance records, internal switch costing, bounded compiler-selected internal inlining, operation-outcome scalar replacement and control fusion, and no public optimization selector or mode identity (`compiler.universal-deterministic-optimization`) | Implemented | `wync.optimizer.a64.v1` + `wyst.typedOperationKernelComparison.v1` | [Chapter 17](chapter-17-optimization.md); [`typed-operation-kernel-control-budget-v1.json`](typed-operation-kernel-control-budget-v1.json) |
| Predecessor colon-range views, raw descriptor constructors, and direct dynamic-array slicing (`language.predecessor-slice-construction-syntax`) | Removed | selected snapshot | Use range slices on fixed arrays/existing slices or `@T.slice(elements = count)`. |
| Explicitly imported `core.collections.DynamicArray<T>`, `#len`, and its operation-owned view surface | Implemented | selected snapshot | Chapters 6 and 10 |
| Authenticated sealed-core dynamic-container role for `core.collections.DynamicArray<T>`, with no prelude, name-based recognition, or implicit retention (`language.dynamic-array-core-role`) | Implemented | selected snapshot | Chapter 10; `semantic-db.json` `sealedCoreImportCatalog` |
| Sealed declaration-role authority with no project/source/manifest/foreign assignment and no magic allocator, storage, container, movement, runtime, or support names (`language.sealed-declaration-role-authority`) | Implemented | `wyst.declaration-role-registry.v1` | [`declaration-roles.tsv`](declaration-roles.tsv); Chapter 10; `semantic-db.json` `declarationRoleContract` |
| Legacy dynamic-array type spelling (`language.legacy-dynamic-array-type-spelling`) | Removed | selected snapshot | Use an explicit import of `core.collections.DynamicArray<T>`. |
| By-value fixed-array parameters | Reserved | none | Chapter 6 |
| Ordinary structs, `#field_offset`, and deterministic declaration-defined layout | Implemented | selected snapshot | Chapter 6 |
| Expected-type `{ field = value, ... }` struct and bitstruct literals, with written-order single evaluation and complete field validation (`language.expected-type-aggregate-literals`) | Implemented | selected snapshot | Chapter 6 |
| Type-prefixed struct literal spellings (`language.typed-struct-literal-spelling`) | Removed | selected snapshot | Use an expected type and `{ field = value, ... }`. |
| Predecessor representation directive and alternate struct layout modes | Reserved | none | Chapter 6; use explicit layout checks at ABI boundaries. |
| Nominal `bitstruct Name: Backing` declarations with typed boolean/integer/enum fields, single-position or inclusive contiguous locations, complete aggregate construction, exact-backing `bitcast`, range-checked writes, and shared typed-field lowering (`language.bitstruct-typed-fields`) | Implemented | selected snapshot | Chapter 6; Appendices A and B |
| Reusable `register_map` declarations, placed-map and standalone scalar `mmio`, nominal captured map-register snapshots, exact raw/named/modify boundaries, and one-access volatile MMIO lowering (`language.register-map-mmio-declarations`) | Implemented | selected snapshot | Chapters 6, 9, and 11; Appendices A and B; `semantic-db.json` `hardwareRegisterContract` |
| Shared hardware-field access narrowing, reset/read/write policy vocabulary, implicit reserved-zero and explicit reserved-one/preserve regions, and fail-closed named-write/modify availability (`language.hardware-field-policies`) | Implemented | selected snapshot | Chapters 6 and 11; Appendices A and B; `semantic-db.json` `hardwareRegisterContract` |
| ARM64 `system_register` declarations with nominal `u64` snapshots, exact compiler ordering, catalog-named identity, authenticated encoded target-extension selection, and no raw encoded call (`language.system-register-declarations`) | Implemented | selected snapshot | Chapter 11; `a64-compiler-semantics.md`; Appendices A and B; `semantic-db.json` `hardwareRegisterContract` |
| Predecessor standalone bit-range declarations, inferred field carriers, alternate location words/ranges, and non-contiguous field locations (`language.predecessor-bitfield-syntax`) | Removed | selected snapshot | Use `bitstruct`, an explicit field carrier, and `at N` or `at A..=B`. |
| Enum representation: payload-less enums are transparent tags; payload enums contain the declared tag plus aligned inline storage for the largest fixed-layout movable variant, with exact variant/field facts and deterministic inactive bytes | Implemented | `wyst.materializedSum.v1` | Chapter 6; Chapter 15; Chapter 23; Chapter 26; Appendix A |
| `is` enum pattern tests for implemented enum variants | Implemented | legacy v0.8 publication | Chapter 8; nested patterns and compound/negated payload bindings remain reserved below. |
| Multi-field enum payload variants and shallow multi-field `match` bindings | Implemented | `wyst.materializedSum.v1` | Chapters 6, 8, and 26; Appendix A |
| Nested patterns and payload bindings in compound or negated `is` patterns | Reserved | none | Chapter 8; inspect nested payloads with another `match` or direct positive `is`. |
| Generic functions, structs, and enums with explicit type arguments, monomorphization, the closed `wyst.genericBounds.v0.9` capability registry, and canonical generic symbols | Implemented | selected snapshot | Chapter 6; Chapter 16; [`generic-bounds.tsv`](generic-bounds.tsv) |
| Generic instantiation termination over canonical declaration identity plus complete type and value arguments, with exact canonical cycles permitted, strictly growing chains rejected, deterministic `wyst.genericInstantiationTrace.v0.9` traces, and resource limits reported as resource failures (`language.generics.instantiation-termination`) | Implemented | selected snapshot | Chapter 6; `semantic-db.json` `genericInstantiationContract` |
| Generic aliases, type-argument inference, default type arguments, value parameters, traits, interfaces, concepts, typeclasses, higher-kinded parameters | Reserved | none | Chapter 6; implementation-plan discussion is non-authoritative until reflected here. |
| `#if` compile-time conditionals over deterministic constant values | Implemented | legacy v0.8 publication | Chapter 6 |
| Left-to-right expression evaluation order, short-circuiting `&&`/`||`, eager `select`, source-order effect preservation, and optional effectful-nesting lint | Implemented | legacy v0.8 publication | Chapter 7; Chapters 9 and 13 for memory and scheduling constraints |
| Conventional arithmetic, shift, bitwise, comparison, and logical operator precedence, with non-associative comparison operators (`language.operator-precedence-and-comparison-associativity`) | Implemented | legacy v0.8 publication | Chapter 7; Appendix B |
| Implicit `schedule.standard` policy for ordinary code, with dependency-safe pure reordering, source-order effect and memory preservation, deterministic tie-breaking, report/build-identity recording, and no unstated implementation scheduling policy (`language.standard-scheduling-policy`) | Implemented | selected snapshot | Chapter 13; Chapter 22 |
| `schedule source { ... }` and `#[schedule(source)]` source-order compiler boundaries, including whole-body subject checks and preservation through mandatory inline expansion (`language.source-scheduling-boundaries`) | Implemented | selected snapshot | Chapter 13; Chapter 7; [`attribute-catalog.tsv`](attribute-catalog.tsv) |
| Execution agents and sequential strands; trap/interrupt entry/return control order without cross-agent synchronization; target-neutral `execution_suspension`; one preserved post-argument/pre-transfer `strand_suspension_boundary` on every exact or conservative capable call; retained-task/native-activation identity; and the authenticated zero-code provider marker (`language.execution-strands-suspension-boundaries`) | Implemented | `wyst.execution-strands.v1` | Chapter 13; Chapters 1 and 9; Appendix A; Chapter 16; `semantic-db.json` `executionStrandContract` |
| Closed non-erasable `context_stability` provenance, conservative join order, eligible storage/escape rules, affine liveness rejection, task/cross-strand preservation, exact-context return revalidation, and serialization closure (`language.context-stability-provenance`) | Implemented | `wyst.context-stability.v1` | Chapter 13; Appendix A; Chapter 16; `semantic-db.json` `contextStabilityContract` |
| Predecessor scheduling directive and policy names (`language.predecessor-scheduling-modes`) | Removed | selected snapshot | Chapter 13; use `schedule.standard` and `schedule source`. |
| Manifest-owned artifact `verify code` contracts for final instruction count, authenticated families, post-relocation bytes, prologue presence, spill slots, and veneers; the predecessor exact-code source attribute is ordinary invalid syntax | Implemented | selected snapshot | Chapter 13; `wyst.project` named-artifact contract |
| Runtime `if`, if expressions, integer-range `for`, `while`, `loop`, `break`, `continue`, `goto`, statement calls, expression calls, and terminal calls for functions and labels (`language.function-label-control-flow`) | Implemented | selected snapshot | Chapter 8 |
| Built-in end-exclusive `for i in start ..< end` with once-only left-to-right bound evaluation, compatible integer typing, immutable index, unit step, and structural transfers (`language.integer-range-for-loop`) | Implemented | selected snapshot | Chapter 8; Appendix B |
| Predecessor counted-loop forms (`language.repeat-loop-spelling`) | Removed | selected snapshot | Chapter 8; use integer-range `for`. |
| Keyword-led function declarations and labels, named tuple returns, function pointers, and `#addr_of` function values | Implemented | selected snapshot | Chapter 8 |
| Keyworded `const`/`var` named multi-return destructuring and simultaneous tuple assignment with one right-side evaluation (`language.named-multi-return-destructuring`) | Implemented | selected snapshot | Chapter 8 |
| Shared positional-or-labeled argument grammar, declaration-parameter label resolution for direct calls, written-order evaluation, and positional-only indirect calls (`language.labeled-call-arguments`) | Implemented | selected snapshot | Chapter 8 |
| Exhaustive enum-only `match`, shallow dot-variant alternatives, scoped payload bindings, optional final `else`, and matching `if value is .variant(binding)` patterns (`language.enum-match-patterns`) | Implemented | selected snapshot | Chapter 8 |
| Predecessor enum-dispatch statement, arm, and partial-mode spellings (`language.switch-case-partial`) | Removed | selected snapshot | Use `match`. |
| Anonymous tuple return fields, nested tuple returns, tuple parameters beyond the documented boundary | Reserved | none | Chapter 8 |
| Complete callable identity (convention, ordered parameter/result types, positional register placement, and per-parameter `noescape`, but never declaration parameter names), no implicit callable adaptation, `never`, inherently terminal `label` entries, `naked` lowering, `packed struct`, local `var name: T in register`, and the immutable-template/direct-access `per_cpu var` contract; before the production multicore realization milestone reachable access requires `#target(..., per_cpu = single_instance_tpidr_el1)` with the selected EL1+/TPIDR_EL1/16-byte-aligned single-instance facts (`language.callable-storage-contracts`) | Implemented | selected snapshot | Chapter 8, “selected snapshot Callable Identity, Terminal Entries, and Storage Classes,” is the sole source-semantic owner; Chapters 9, 11, 15, and 16 and Appendices A and B define aligned memory, target, ABI, object, IR, and grammar projections; `semantic-db.json`; `syntax-words.tsv` |
| Initializer-free or read-only local aliases for reserved architectural registers such as `lr`/`x30` and `x18` (`language.special-register-local-aliases`) | Removed | selected snapshot | Chapter 8; every local `var` has an initializer and ordinary `in register` placement rejects target-reserved registers. Use an authenticated checked-assembly, trap-frame, hardware, or system-register contract for architectural state. |
| Predecessor callable-modifier, register-placement, per-CPU/TLS, ABI-marker, and callable-type spellings | Removed | selected snapshot | Use `-> never`, declaration-prefix modifiers, callable parameter contracts, `in register`, `per_cpu var`, `fn(...)` / `extern "C" fn(...)`, and `#percpu_offset_of`. The selected snapshot has no TLS storage class. |
| The final selected snapshot declaration-attribute registry and atomic owner activation checks (`language.declaration-attribute-registry`) | Implemented | `wyst.declarationAttributes.v0.9` | [`attribute-catalog.tsv`](attribute-catalog.tsv); `align`, `section`, `inline`, `init`, `frame`, `deny_effects`, `cache_isolated`, and `schedule` are active; emitted custom sections require a matching layout-declared `code`/`rodata`/`data`/`bss` kind. |
| Predecessor standalone/directive declaration-attribute spellings, multiple declaration attribute groups, and accepted-but-ignored attributes (`language.predecessor-declaration-attribute-spellings`) | Removed | selected snapshot | Use the single `#[...]` registry grammar after an owning item activates a row. |
| Signature-style `asm` statements/expressions with ordered `pure`/alignment/stack modifiers, typed input/immediate/symbol/scratch parameters, scalar or named multi-results, `-> never`, semantic body binders, local labels, and catalog-derived effects/allocation constraints (`language.checked-assembly-signature`) | Implemented | selected snapshot | Chapter 8; Appendices A and B; the checked-assembly signature milestone |
| Predecessor sectioned assembly form, constraint calls, manual effects/clobbers, directional labels, raw allocatable registers, and operand interpolation | Removed | selected snapshot | Recorded only in the historical v0.8 snapshot in Appendix B; use signature-style `asm`. |
| Old code-item body separator for functions, labels, exception vectors, and vector-entry slots | Removed | legacy v0.8 publication | Use a direct body block after the declaration header. |
| Predecessor export directive | Removed | legacy v0.8 publication | Use the directional `export` declaration; `pub` controls only Wyst source visibility and has no linker effect. |
| `pub` Wyst source visibility and re-export, with no linker export effect (`language.source-visibility-not-linkage`) | Implemented | selected snapshot | Chapter 4 |
| Directional typed linker boundaries through `import symbol`, `export`, and `export weak`, including independent aliases and deterministic collision rejection (`language.directional-linker-boundaries`) | Implemented | selected snapshot | Chapter 4; Chapter 16; Appendix B; the directional linker-boundary milestone |
| Contextual named `layout` blocks with exactly one semantic entry before manifest-level selection, typed declaration-ordered `symbol` members, `readonly`/`readwrite` regions, typed section kinds, explicit placement constraints, layout-only `start`/`end`/`size` queries, rejection of compiler-owned non-layout sections, and structural typed-IR retention of the layout identity, member contracts, provenance, and recursive placement expressions (`language.named-layout-dsl`) | Implemented | selected snapshot | Chapter 4; Chapter 16; Appendices A and B; `semantic-db.json` `namedLayoutContract`; `layout` remains legal as a module-path component. |
| Predecessor layout directives in selected snapshot source | Removed | selected snapshot | Use the named layout DSL. Production source does not version-dispatch to the historical grammar. |
| Qualified imports by default, explicit selective imports and aliases, non-transitive imports, duplicate import rejection, and unsupported wildcard imports (`language.qualified-imports-default`) | Implemented | legacy v0.8 publication | Chapter 4 |
| Hierarchical module paths, whole-module final-component qualifiers, selective-only bare declarations, and collision-free `pub import` re-exports (`language.hierarchical-modules-imports-visibility`) | Implemented | selected snapshot | Chapter 4 |
| Comma-delimited `import (...)` groups with optional group-wide `pub`, uniform visibility across every entry, no per-entry or mixed visibility, source-order-preserving desugaring to ordinary module imports, and no linker-symbol entries (`language.grouped-module-imports`) | Implemented | selected snapshot | Chapter 4; Appendix B; Chapter 18 |
| Sealed `core` root, authenticated `core.collections` role metadata, unavailable-by-default selective-only `core.arch`/`core.environment` category roots, and whole-private-direct `core.execution` with only the provider-authenticated `suspension_point` member (`language.sealed-core-imports`) | Implemented | selected snapshot | Chapter 4; Chapter 13; `semantic-db.json` `sealedCoreImportCatalog`; [`sealed-core.tsv`](sealed-core.tsv) |
| `$` token | Reserved | none | Appendix B; postfix `?` is implemented only for exact direct-operation failure forwarding. |
| Machine-sized integer type names, typed numeric suffixes, and the predecessor zero-pointer literal | Removed | none | Appendix B and Chapter 6 reject these surfaces. |

### Targets, Build, Runtime, And Memory

| Feature family | State | Version | Owning detail |
| -------------- | ----- | ------- | ------------- |
| Project manifests, project-directory mode, explicit root-file mode, source roots, import closure, conditional source-layout input, environment-owned layout choice, and artifact product paths | Implemented | legacy v0.7 publication | Chapter 3 |
| Directory-anchored module discovery with anchor files, controlled sibling part files, deterministic enumeration, ignored/generated-file rules, duplicate-declaration diagnostics, stable module identity, and generated-manifest/editor parity (`language.module-discovery-model`) | Implemented | legacy v0.8 publication | Chapters 3 and 4 |
| One `executable` kind for artifact- and environment-owned layouts; canonical `layout .environment`; reserved `static_library` root/output/companion grammar with no-output refusal; complete profile-policy tuple; fail-closed typed QEMU EL2 DTB and secure EL3 no-argument entry schemas; fail-closed atomic target-profile extensions; and identity/report propagation (`build.hosted-distributable-artifacts`) | Implemented | selected snapshot | Chapters 2, 3, 4, 5, 16, and 22; `semantic-db.json` `targetProfileContract`, `targetEntrySchema`, and `targetProfileExtensionSet` |
| Source-matched static platform-counter provider/schema selection, independently pinned exact state/control-universe authority, immutable optional per-run record validation, raw-only no-record/no-authority behavior, reusable-cache exclusion, and compiler-owned synthetic producer/consumer conformance (`targets.platform-counter-instances`) | Implemented | `wyst.platform-counter-instance-provider.v1` | Chapters 2, 3, and 11; Appendix A; Chapter 22; `semantic-db.json` `platformCounterInstanceContract` |
| Four closed executable-environment classes plus authenticated execution/completion-provider descriptors, migration/preemption/current-core policies, provider-on-demand import admission, complete extension-set authentication, and compatibility/provenance/report propagation (`targets.execution-environment-provider-contracts`) | Implemented | `wyst.execution-environment-contract.v1` | Chapter 2; Chapter 13; `semantic-db.json` `executionEnvironmentContract` |
| Target declarations and complete v1 project profiles for `qemu-virt-aarch64-el1`, `qemu-virt-aarch64-el2`, `qemu-virt-aarch64-el2-lse`, `qemu-virt-aarch64-el3`, and `qemu-raspi4b-aarch64-el2` | Implemented | legacy v0.7 publication | Chapters 2, 3, 4, and 5 |
| Separate source requirements and build selections with `#requires(...)`, project/profile compatibility checks, explicit target facts for project artifact builds, target-fact provenance reports, and reusable modules compiling under multiple compatible target selections | Implemented | legacy v0.8 publication | Chapters 2, 3, and 4 |
| Pinned A64 compiler-semantic register, state, memory, control, privilege, effect, fault, purity, and structural-profile catalog (`targets.a64-compiler-semantic-catalog`) | Experimental | `wyst.a64CompilerSemantics.v1` | [`a64-compiler-semantics.md`](a64-compiler-semantics.md); complete for the focused manifest-active profile: 308 instruction encodings, 31 state contracts, and two structural profiles. Functional execution remains a distinct coverage axis and has pinned QEMU 11.0.0 evidence for every active instruction and structural row; universal breadth remains deferred to the universal A64 checked-assembly conformance milestone. |
| Generated A64 instruction catalog (`targets.a64-instruction-catalog`) | Experimental | `wyst.a64-instruction-catalog.v1` | [`a64-encoding-catalog.tsv`](a64-encoding-catalog.tsv) owns 20 checked source forms: 13 general-purpose forms and seven target-structural-only forms; [`a64-active-encoding-catalog.tsv`](a64-active-encoding-catalog.tsv) owns all 308 active encodings with 301 operand decoders and 10 generated fixup programs, three transported as typed checked-assembly fixups. Ordinary/architecture emission and typed checked-assembly IR consume these generated identities. The complete authority decoder distinguishes active, known unsupported, reserved, and unallocated words. |
| Exact focused A64 conformance ledger and release gate | Experimental | `wyst.a64-conformance-manifest.v2` | [`a64-conformance-manifest.json`](a64-conformance-manifest.json) authenticates exact evidence for all 8,955 support rows: 330 active rows with pinned QEMU 11.0.0 independent-oracle evidence and 8,625 `known_unsupported` rows. It also binds two pinned offline decode oracles over all 308 active encodings, exact LLVM encode round trips for all 307 LLVM-covered rows, 153 authenticated target profiles, checked-assembly allocation proofs, and the deterministic conformance fuzz gate. The mechanically demonstrated claim is limited to the focused active support profile; the universal A64 checked-assembly conformance milestone owns universal activation. |
| Layered target descriptor fields beyond the implemented v1 contract and atomic extension envelope | Future-version normative | planned target 32 | Chapters 2 and 3 |
| Physical Raspberry Pi hardware validation | Experimental | none | Chapter 2 |
| Volatile memory, atomics, barriers, shareability/freshness vocabulary, and no hidden synchronization | Implemented | legacy v0.7 publication | Chapter 9 and Chapter 11 |
| Concurrent memory model: per-location modification order, reads-from, synchronizes-with, happens-before, global `seq_cst` order, release sequences, barrier-mediated synchronization, race behavior, atomic RMW retry-until-complete correctness distinct from progress guarantees, volatile interactions, and closed alias proofs for transformations | Implemented | legacy v0.8 publication | Chapter 9 and Chapter 11 |
| Opaque non-copyable `atomic<T>` storage, direct-destination `atomic<T>(value)` construction, and the closed element, method, and order vocabulary (`language.opaque-atomic-storage-closed-orders`) | Implemented | selected snapshot | Chapter 9; Chapter 11; [`atomic-matrix.json`](atomic-matrix.json) is the sole catalog authority. |
| Predecessor atomic runtime primitives and per-access ordering directives (`language.predecessor-atomic-primitives-and-order-directives`) | Removed | selected snapshot | Use typed `@atomic<T>` methods; the exact dispositions are recorded only in the two non-parser removal manifests. Neither audit feeds the atomic matrix or source tooling. |
| Explicit ordinary allocation/storage APIs, arenas, typed handles, and buffer/string APIs with no privileged semantics or report facts inferred from their names | Implemented | legacy v0.7 publication plus `wyst.declaration-role-registry.v1` authority closure | Chapter 10 and Chapter 21 |
| Dynamic-array descriptor contract `wyst.dynamicArrayDescriptor.v0`: public seven-field authenticated `DynamicArray<T>` descriptor layout, invariants, policy encodings, lifetime rules, ABI/debug/persistence/foreign-inspection consequences, and `wyst.dynamicArrayOperation.v0` compiler-owned descriptor operations | Implemented | `wyst.dynamicArrayDescriptor.v0` | Chapter 10; Chapter 23; `wync explain storage` |
| Standard-library expansion beyond the thin allocation-explicit core | Future-version normative | future snapshot | Chapter 10; not current language surface. |
| Hidden allocation, hidden garbage collection, implicit cleanup, hidden locking, hidden parallelization | Removed | none | Chapter 10 |
| Target-defined `vector_table` declarations with exact authenticated selectors, canonical dotted slot names, fixed source order, target-owned section/alignment/extent, explicit terminal arrow or block bodies, catalog-authenticated padding, and duplicate/missing/reordered/overflow diagnostics (`language.exception-vector-slots`) | Implemented | selected snapshot | Chapter 14; Appendix B |
| Target-checked nominal `trap_frame` declarations and `naked label ... establishes T` / `restores T` hard clauses, with exact profile-owned fields, offsets, extent, stack alignment, execution levels, complete architectural state, and canonical checked-assembly transitions (`language.target-checked-trap-frame-dsl`) | Implemented | selected snapshot | Chapter 14; Appendix B |
| Released-v0.8 vector, vector-entry, and trap-frame directive surfaces (`language.predecessor-vector-trap-directives`) | Removed | selected snapshot | Historical v0.8 grammar snapshot in Appendix B; [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) |
| Per-callable execution-level facts for ARM64 functions, labels, `vector_table` slot entries, callbacks, `exception.eret` transitions, and exception entries | Implemented | selected snapshot | Chapters 5, 11, and 14 |
| Named ARM64 system-register primitive access uses exact canonical generated-catalog spelling, rejects noncanonical case variants with canonical hints, preserves canonical spelling in formatting and reports, and exposes only canonical names through editor completion (`language.system-register-canonical-spelling`) | Implemented | legacy v0.8 publication | Chapter 11; `a64-compiler-semantics.md` |
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
| Static AArch64 `ET_EXEC` ELF image output, section catalog, symbols, relocations applied by the final writer | Implemented | legacy v0.7 publication | Chapter 16 |
| One semantic-interface variant per module, collision-resistant declaration and ABI/linkage symbol identities, module-specific object-member identities, homogeneous module-independent compatibility keys, explicit inactive safety/trust/proof/hardening slots, multi-file module ownership, and canonical `per_cpu` template identity (`artifacts.semantic-object-identities`) | Implemented | `wyst.objectInterface.v2` | Chapter 16; `semantic-db.json` `semanticObjectIdentityContract` |
| Canonical generic semantic home, authenticated body/private-dependency transport, compatible consumer emission, hidden link-once identity, deterministic demand/archive order, complete identical-definition checking, provenance merge, final-survivor selection, and canonical placement/root preservation (`artifacts.generic-instantiation-ownership`) | Implemented contract; separate interface/object/archive/link execution remains pending | `wyst.objectInterface.v2` | Chapter 6; Chapter 16; `semantic-db.json` `genericInstantiationOwnershipContract` |
| Deterministic layout placement solver for regions, per-region and image cursors with causal owners, sections, alignment, multiple `after` dependencies, provenance-retaining fixed-address normalization, inherited regions, overlap, overflow, empty sections, deterministic tie-breaking, declaration order, padding/fill bytes, and constraint-path diagnostics (`artifacts.layout-placement-solver`) | Implemented | selected snapshot | Chapter 4; Chapter 16; consumed by the selected snapshot named layout DSL |
| Relocatable `ET_REL` object output (`wync -c` / `--emit-object`) | Future-version normative | planned target 32 | Chapter 16 |
| Explicit strong and weak external aliases | Implemented | selected snapshot | Chapter 4; Chapter 16; use `export` and `export weak`. |
| Hidden shared-object symbol visibility | Future-version normative | none | Chapter 16; no current source spelling. |
| Undefined external AAPCS symbols and link-time resolution | Future-version normative | planned target 34 | Chapter 16 |
| Deterministic multi-object static linking with cross-object veneers | Future-version normative | planned target 35 | Chapter 16 |
| Foreign AArch64 ELF object linkage | Future-version normative | planned target 36 | Chapter 16 |
| Static archive distribution plus authenticated companion and artifact/link reports | Future-version normative | planned target 37 | Chapter 16; the manifest grammar is reserved now, but selection fails before either product until an archive/companion producer is activated. |
| Dynamic linking, GOT/PLT, PIE, shared objects, ELF TLS, COMDAT/section groups, PE/COFF, Mach-O artifact modes | Experimental | none | Chapter 16 |
| DWARF 5 debug-info floor and deterministic debug sections | Implemented | legacy v0.7 publication | Chapter 23 |
| Debug build mode that forces frame records independent of leaf/non-leaf status | Future-version normative | `wyst.nativeAbi.next` | Chapter 15 names the ABI consequence; current CLI has no debug-build mode. |
| Predecessor source attribute for forcing frame records | Removed | selected snapshot | The non-parser [`legacy-hash-removal-audit.tsv`](legacy-hash-removal-audit.tsv) records the rejection; it has no replacement or compatibility path. |
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
| Deterministic rebuild report and host compiler-efficiency release gate (`tooling.compiler-efficiency-release-gate`) | Implemented | `wync.reports.v1` | Chapter 24; `wync.compilerEfficiencyPolicy.v1`; `wync.compilerEfficiencyEvidence.v1`; `wync rebuild-benchmark`; `wync/tools/bench/` |
| Release evidence and release archive facts | Implemented | `wync.reports.v1` | `CHANGELOG.md`, tests, and release tooling |
| Diagnostic suppression policy and static, modeled-cost, emitted-program, target-measured, and PMU/TMA report expansion beyond the host compiler-efficiency schemas | Future-version normative | none | Chapters 1, 21, and 24; Appendix A |

## Schema Registry

### Language Catalog And Identity Schemas

| Schema | Status | Authority |
| ------ | ------ | --------- |
| `wyst.syntaxWords.v0.9` | Implemented | [`syntax-words.tsv`](syntax-words.tsv); one unique row per special source spelling. |
| `wyst.metaOperations.v0.9` | Implemented; exactly 15 active rows | [`meta-operation-catalog.tsv`](meta-operation-catalog.tsv); complete phase, result, target-fact, relocation, behavior, owner, and tooling contracts. |
| `wyst.declarationAttributes.v0.9` | Implemented registry; exactly eight rows active | [`attribute-catalog.tsv`](attribute-catalog.tsv); `align`, `section`, `inline`, `init`, `frame`, `deny_effects`, `cache_isolated`, and `schedule` are the complete active set. |
| `wyst.genericBounds.v0.9` | Implemented | [`generic-bounds.tsv`](generic-bounds.tsv); closed subject and capability contracts with atomic extension rows. |
| `wyst.atomic-matrix.v1` | Implemented | [`atomic-matrix.json`](atomic-matrix.json); sole authority for atomic storage, elements, methods, legal orders, and ARM64 lowering selection. Legacy spelling dispositions are outside this matrix. |
| `wyst.genericInstantiationKey.v0.9` | Implemented | `semantic-db.json` `genericInstantiationContract`; semantic declaration identity plus complete concrete type and currently empty value-argument lists. |
| `wyst.genericInstantiationTrace.v0.9` | Implemented | `semantic-db.json` `genericInstantiationContract`; deterministic root-to-demand canonical-key trace. |
| `wyst.generic-ownership.v1` | Implemented contract | `semantic-db.json` `genericInstantiationOwnershipContract`; one semantic home, compatible physical emitters, hidden link-once identity, complete duplicate verification, deterministic survivor, and linker role. |
| `wyst.generic-body.v1` / `wyst.generic-dependency-closure.v1` / `wyst.generic-transport.v1` | Implemented contract | `semantic-db.json` `genericInstantiationOwnershipContract.bodyTransport`; canonical checked body, private generic closure, home-owned nongeneric dependencies, placement, and reserved role/effect slots. |
| `wyst.generic-definition.v1` / `wyst.generic-provenance-merge.v1` | Implemented contract | `semantic-db.json` `genericInstantiationOwnershipContract`; compatible emitted-definition tuple and canonical provenance union. |
| `wyst.generic-demand-worklist.v1` / `wyst.generic-archive-index.v1` | Implemented contract | `semantic-db.json` `genericInstantiationOwnershipContract`; canonical instantiation identity ordering, demand-driven extraction, stale-cache rejection, and no archive-order semantics. |
| `wyst.generic-placement.v1` / `wyst.generic-semantic-root.v1` | Implemented contract | `semantic-db.json` `genericInstantiationOwnershipContract.placement`; passive `section`, exact demanded contribution/root, alignment, custom section, and sectioned-inline out-of-line retention. |
| `wyst.namedLayout.v0.9` | Implemented | `semantic-db.json` `namedLayoutContract`; exact entry identity/validation, typed placement symbols, deterministic solver, initcall section, and checked-assembly preservation. |
| `wyst.target-profile-contract.v1` | Implemented | `semantic-db.json` `targetProfileContract`; complete layout-owner, ABI/return, privilege/admission, dynamic-import/TLS/unwind/panic/exit tuple and shared identity surfaces. |
| `wyst.target-profile-base.v1` | Implemented | `semantic-db.json` `targetProfileContract`; authenticated digest over the complete named profile, architecture/ABI, authority, environment/service/counter, and policy base used to bind extensions. |
| `wyst.target-entry-schema.v1` | Implemented | `semantic-db.json` `targetEntrySchema`; the two QEMU EL2 variants authenticate Wyst Native EL2 entry with exactly `dtb: @u8 in x0`, while `qemu-virt-aarch64-el3-noargs-v1` authenticates secure EL3 direct-ELF entry through `wyst-native-noargs-v1` and exactly `pub naked fn _start() -> never`. Both variants require an initially uninitialized stack and exactly one checked cataloged `mov sp, stack` transition from `stack: u64 in x1`; `x0` is not an EL3 entry parameter. The canonical EL3 fixture's direct `firmware_main()` successor is runtime evidence, not a compiler-schema field. Complete facts and digest bind target/artifact/cache/report/runner identities, and source claims never create or translate authority. |
| `wyst.target-profile-extension-set.v1` | Implemented | `semantic-db.json` `targetProfileExtensionSet`; indivisible base-profile-bound authentication with stable unknown, absent, stale, partial, and incompatible rejection. The current set combines the source-matched static platform-counter product and one execution-environment product for every built-in target. |
| `wyst.execution-environment-contract.v1` | Implemented | `semantic-db.json` `executionEnvironmentContract`; one of four closed classes bound to the exact authenticated base-profile policy tuple, plus closed provider lists and migration/preemption/current-core policy. |
| `wyst.execution-provider-descriptor.v1` | Implemented | `semantic-db.json` `executionEnvironmentContract`; selected-environment-bound provider identity/version/product facts and authenticated provider-leaf/transfer requirements. |
| `wyst.completion-provider-descriptor.v1` | Implemented | `semantic-db.json` `executionEnvironmentContract`; selected-environment-bound program-completion provider identity/version/product facts, required only by source that imports the descriptor. |
| `wyst.execution-strands.v1` | Implemented | `semantic-db.json` `executionStrandContract`; memory/control strand order, effect/boundary placement and preservation, zero-code marker, migration limits, and retained activation identity. |
| `wyst.context-stability.v1` | Implemented | `semantic-db.json` `contextStabilityContract`; closed provenance vocabulary, conservative joins, eligible storage, liveness, serialization, and trust-boundary rules. |
| `wyst.callable-context-summary.v2` | Implemented | `semantic-db.json` `contextStabilityContract.callableSummary`; one canonical digested transport atomically carries the exact-or-conservative callable effect bound, its authority, and field-sensitive parameter/result provenance, rejecting corruption, mismatch, erasure, upgrades, incompatible identities, missing/extra summaries, unknown tags, and noncanonical encodings. |
| `wyst.platform-counter-instance-provider.v1` | Implemented | `semantic-db.json` `platformCounterInstanceContract`; static extension product `a64-generic-virtual-counter-instance-provider-v1` version 1, role `platform_counter_instance_provider`, pinned five-field product digest `sha256:ab1c41697aac01bea2961dd676ea33f980712a4471ea70ed226adcf4ed3659b1`, bound to `a64-generic-virtual-counter-v1` and `wyst.platform-counter-universe-evidence.v1`. |
| `wyst.platform-counter-instance-record.v1` | Implemented | `semantic-db.json` `platformCounterInstanceContract`; complete normalized optional per-run domain/epoch, frequency, comparability, serialization/overhead, universe-authority contract identity and content digest, platform-state evidence, mutable-control, and evidence/digest record. |
| `wyst.platform-counter-instance-identity.v1` | Implemented | `semantic-db.json` `platformCounterInstanceContract`; immutable identity over the record and static provider/source schemas plus the authenticated content digest, which covers normalized runtime content and evidence identities; excluded from reusable compilation-cache keys. |
| `wyst.platform-counter-universe-evidence.v1` | Implemented | `semantic-db.json` `platformCounterInstanceContract`; combined authority over the provider/source, exact counter domain and configuration epoch, both universe evidence references, exact sorted state identities, and exact sorted control identities/effects. Scope enters the authority digest so evidence cannot be replayed across domains or epochs. Runtime authority content is excluded from compilation identity; baseline compiler-owned synthetic conformance pins digest `sha256:c656328d5dde4c49e71ea298af58ac8daa27a8bb9205219d59c061bea3a3ebb1`. |
| `wyst.platform-counter-universe-evidence-contract.v1` | Implemented | `semantic-db.json` `platformCounterInstanceContract`; independently selected platform-environment trust anchor that pins one exact scope-bound authority content digest and is itself carried by the record, so a producer cannot establish completeness by self-consistent resealing or silently swap authorities. |
| `wyst.hardwareRegisters.v0.9` | Implemented | `semantic-db.json` `hardwareRegisterContract`; Chapters 6, 9, and 11; Appendices A and B. |
| `wyst.coreImportCatalog.v0.9` | Implemented | [`sealed-core.tsv`](sealed-core.tsv) and `semantic-db.json` `sealedCoreImportCatalog`; sealed namespace/import policy, joined to the separate declaration-role registry for privileged members. |
| `wyst.dynamicContainerRole.v0.9` | Implemented | Authenticated `core.collections.DynamicArray` role metadata, independent of local spelling. |
| `wyst.declaration-role-registry.v1` | Implemented | [`declaration-roles.tsv`](declaration-roles.tsv); stable role/version, sealed identity, complete signature/ABI, interface/body digests, compiler semantics, compatibility, and resource capability binding. |
| `wyst.declaration-role-claim.v1` | Implemented contract | Exact authenticated interface/object/companion claim; unknown, duplicate, stale, mismatched, unavailable, or unauthorized claims fail closed. |
| `wyst.declaration-role-resource-capability.v1` | Implemented reservation | Closed future resource kinds and transition fields; grants no implicit cleanup, allocation, copy, destructor, or project-authored ownership authority. |
| `wyst.a64-instruction-semantics.v2` | Experimental | [`a64-instruction-semantics.tsv`](a64-instruction-semantics.tsv); exactly one complete semantic row for each of the 308 manifest-active encodings. Every row carries pinned QEMU 11.0.0 independent-oracle evidence: 302 expected-value paths, five state paths, and one trap structural path. Inactive encodings have no placeholder semantic row. |
| `wyst.a64-instruction-catalog.v1` | Experimental | [`a64-encoding-catalog.tsv`](a64-encoding-catalog.tsv) and generated [`a64-active-encoding-catalog.tsv`](a64-active-encoding-catalog.tsv); 20 checked-source grammars (13 general-purpose and seven target-structural-only) plus a shared 308-row active encoder/decoder index with 301 operand decoders, 10 generated fixup programs, three typed checked-assembly fixups, and a complete four-way authority word partition. |
| `wyst.a64-state-semantics.v3` | Experimental | [`a64-state-semantics.tsv`](a64-state-semantics.tsv); all 31 authority-backed register/state contracts required by the focused active support packs and dynamic semantic references. |
| `wyst.a64-structural-semantics.v2` | Experimental | [`a64-structural-semantics.tsv`](a64-structural-semantics.tsv); the two manifest-active AArch64 vector-table and trap-frame contracts. Both carry pinned QEMU 11.0.0 `trap-frame` structural-path evidence: selected `current.spx.sync` delivery for the vector table and the canonical entry-save/restore-ERET round trip for the trap frame. Authenticated generated metadata and compile-time tests additionally own shape, order, offsets, extents, selection, and state transitions. |
| `wyst.a64-support-policy.v1` | Experimental | [`a64-support-policy.json`](a64-support-policy.json); checked-in activation policy naming the `wyst.a64.checked-asm.core.v1`, `wyst.a64.target-structural-asm.aarch64.v1`, `wyst.a64.ordinary-lowering.v1`, `wyst.a64.architecture-operations.v1`, and `wyst.a64.target-structural.aarch64.v1` packs. |
| `wyst.a64-support-manifest.v1` | Experimental | [`a64-support-manifest.json`](a64-support-manifest.json) and [`a64-support-rows.tsv`](a64-support-rows.tsv); generated, authenticated partition of exactly 8,955 rows: 308 active/4,023 known-unsupported encodings, 20 active/4,602 known-unsupported source forms, and two active structural profiles, with zero unexplained or partially active rows. |
| `wyst.a64-support-source-domains.v1` | Experimental | [`a64-support-source-domains.json`](a64-support-source-domains.json); generated, support-manifest-digest-owned cross-tool projection of the exact 13 general-purpose and seven target-structural-only active source forms, including operand grammar, alias, and register view/list domains. It is derived from the authenticated raw source-form grammar, active instruction catalog, and support policy rather than defining a parallel authority. |
| `wyst.a64-conformance-policy.v2` | Experimental | [`a64-conformance-policy.json`](a64-conformance-policy.json); closed suites, pinned static and execution oracles, authenticated target bindings, allocation evidence identity, and fuzz parameters for the focused release gate. |
| `wyst.a64-conformance-evidence.v2` | Experimental | [`a64-conformance-evidence.tsv`](a64-conformance-evidence.tsv); exactly one complete evidence row for each of the 8,955 support-bearing rows, including row-exact predicate-negative applicability and pinned independent-oracle execution for all 330 active rows. |
| `wyst.a64-conformance-targets.v2` | Experimental | [`a64-conformance-targets.tsv`](a64-conformance-targets.tsv); all 153 targets include `base`, positive-state identity, selection kind, and authenticated selection digest: `v8Ap0` `base` and `base|fp_simd` base/FP/AdvSIMD profiles, a `v8Ap1` `base|lse` LSE profile, and 149 conformance-only `v9Ap7` known-unsupported precedence bindings. |
| `wyst.a64-conformance-static-oracles.v2` | Experimental | [`a64-conformance-oracles.tsv`](a64-conformance-oracles.tsv); offline LLVM 14.0.6 and Capstone 5.0.7 full-disassembly outcomes and adjudications for all 308 active encodings, plus exact LLVM reassembly words and an explicit decode-only Capstone boundary. |
| `wyst.a64-conformance-manifest.v2` | Experimental | [`a64-conformance-manifest.json`](a64-conformance-manifest.json); generated identity and exact 330-active/8,625-known-unsupported release evidence summary, with all active rows pinned to QEMU 11.0.0 independent-oracle evidence, including runtime provenance, allocation, target, static-oracle, aggregate-gate, and fuzz coverage. |

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
| `wync.generatedManifest.v1` | Implemented | `wync generated-manifest` |
| `wync.rebuildBenchmark.v0` | Superseded; retained unchanged as a read-only historical contract | No current producer; exact schema/example under `wync/tools/bench/schemas/`; superseded by `wync.rebuildBenchmark.v1`; fields are never reinterpreted |
| `wync.rebuildBenchmark.v1` | Implemented | `wync rebuild-benchmark` |
| `wync.localBench.v0` | Superseded; retained unchanged as a read-only historical contract | No current producer; superseded by `wync.localBench.v1`; fields are never reinterpreted |
| `wync.localBench.v1` | Implemented envelope only | `wync/tools/bench/bench.mjs`; embeds or references exact policy/evidence and owns no baseline, aggregation, budget, or verdict |
| `wync.timingTrace.v0` | Superseded; retained unchanged as a read-only historical contract | No current producer; exact schema/example under `wync/tools/bench/schemas/`; superseded by `wync.timingTrace.v1`; fields are never reinterpreted |
| `wync.timingTrace.v1` | Implemented host-only attribution | Compiler `CliTimingSink`; canonical phase mappings, root reconciliation, and tracing-overhead evidence |
| `wync.compilerEfficiencyPolicy.v1` | Implemented checked-in host release-gate input | `wync/tools/bench/policy/compiler-efficiency-policy-v1.json`; sole workload/protocol/eligibility/aggregation/baseline/evidence-preservation/budget authority |
| `wync.compilerEfficiencyEvidence.v1` | Implemented terminal host release evidence | `wync/tools/bench/bench.mjs`; sole samples/aggregates/status/attribution/verdict authority bound to the exact policy |
| `wync.compilerEfficiencyPreservationRecord.v1` | Implemented terminal semantic ledger | Exactly seven authenticated roles: four compiler carriers, exact policy, verbatim evidence, and complete run archive |
| `wync.compilerEfficiencyPolicyTransition.v1` | Implemented review contract | Binds the distinct canonical P0/P1 policy digests, preserved P0 object, bootstrap record, and human review |
| `wync.compilerEfficiencyTerminalEvidenceRegistry.v1` | Pending required human/release inputs | `wync/tools/bench/evidence/v1/terminal-evidence-registry.json`; acceptance requires exactly one P0 bootstrap and one P1 pass |
| `wync.releaseEvidence.v1` | Implemented | `wync release-evidence` command stdout |
| `wync.releaseHostFacts.v1` | Implemented | release-evidence `host-facts.json` |
| `wync.releaseArchiveFacts.v1` | Implemented | release-evidence `release-facts.json` |

### Interface Schemas

| Schema | Status | Producer |
| ------ | ------ | -------- |
| `wync.diagnostics.v0` | Removed; superseded by `wync.diagnostics.v1` | No producer |
| `wync.diagnostics.v1` | Implemented | `wync check --diagnostic-format json` |
| `wync.diagnostics.lsp.v0` | Removed; superseded by `wync.diagnostics.lsp.v1` | No producer |
| `wync.diagnostics.lsp.v1` | Implemented | `wync check --diagnostic-format lsp-json` |
| `wync.diagnosticKinds.v1` | Implemented | Compiler diagnostic-kind registry and `wync explain E####|W####` |
| `wync.compilerIdentity.v1` | Implemented | `wync identity` |
| `wync.releaseRecords.v1` | Implemented | generic release nomination, passing-candidate, and publication records |
| `wync.editorCatalog.v1` | Implemented | `wync editor-catalog` |
| LSP 3.x JSON-RPC payloads with Wyst-owned method subset | Implemented | `wync lsp` |
| Zed extension manifest `schema_version = 1` | Implemented | `editors/zed-wyst/extension.toml` |

Schema changes require updating this registry, the owning chapter, every
producer and consumer, and the snapshot tests in the same atomic change. A
schema name or version may be replaced; retaining the previous schema is not
required.

## Development Change Process

Clean-break changes are allowed throughout the unpublished language. A change
may replace accepted syntax, semantics, design principles, ABI behavior,
schemas, names, identities, or digest algorithms in place. A suffix such as
`v1` records a selected contract; it does not grant that contract permanent
identity or require a compatibility layer. The project may rename, renumber,
or replace it whenever that makes the current design clearer.

Make each change atomically across every affected authority and consumer. This
includes this registry, the owning design chapters, `design/semantic-db.json`,
grammar and generated catalogs, compiler phases, runtime or library code,
artifact producers and consumers, CLI/editor surfaces, fixtures, conformance
rows, snapshots, and release checks. Until that set agrees, the change is
incomplete.

By default, remove obsolete parsers, aliases, adapters, schema readers, ABI
paths, identities, fixtures, and migration diagnostics. Do not retain a legacy
path or deprecation window merely because the replaced design once existed in
the repository. Historical tags, changelog entries, and archived evidence may
record an older snapshot without making it a supported input.

Version and digest fields remain useful for internal consistency. Select or
change them so artifacts from incompatible snapshots fail clearly instead of
being combined accidentally. When governed content or the digest algorithm
changes, its digest must change. A digest authenticates bytes under the current
contract; it does not make those bytes or that contract unchangeable.

Language snapshots and compiler builds use content-derived identities in
addition to semantic release versions. A package or release version identifies
a compatibility-positioned publication, not exact compiler bytes. Release
tooling operates only after maintainers explicitly nominate an exact clean
snapshot and select proposed language and compiler versions under the bump rules
above. It validates all claims marked implemented in that snapshot and never
consults unrelated roadmap completion. The proposed versions, exact identities,
artifacts, and evidence must agree; the versions become released only on
publication.

If Wyst later publishes a surface whose users need compatibility, the owning
design document must introduce that explicit promise, its scope, and its test
obligations. No current version, state, identity, or historical release implies
such a promise.

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
