---
title: "Chapter 2: Wyst Target Descriptors"
group: chapter
chapter: 2
order: 2
summary: "Target facts, execution environments, and why runnability is explicit."
---

# Chapter 2: Wyst Target Descriptors

Wyst uses a layered target model for project builds and hardware/runtime work.

Runnable code depends on more than an ISA name. This chapter distinguishes
source-level `#requires` declarations, exact `#target` facts for target-bound
modules, project profiles, and full target descriptors.

## Thesis

A named ISA is not a complete machine contract. AArch64 code may share
instructions while differing in ABI, exception level, binary format, loader
rules, firmware or OS services, MMIO ranges, device protocols, signing, and
run/copy policy. Wyst target descriptors therefore separate target facts into
layers instead of flattening everything into one target string.

## Layers

| Layer                 | Owns                                                                      | Examples                                                                                            |
| --------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Host/tool             | Facts about the tool invocation and host-side providers.                  | Host OS, compiler version, helper tools, SDK discovery, generated-artifact provenance.              |
| ISA                   | Facts about instruction legality and microarchitectural estimates.        | `arm64-v8a`, CPU class, exact CPU when known, `lse`, cache-line width, scheduling/estimate table.   |
| Execution environment | Facts about how the binary is entered, who owns layout, and what privileged services exist. | Root/entry ABI and return policy, layout owner, privilege/admission policy, dynamic imports, TLS, unwind, panic/exit, loader contract, firmware calls, syscalls. |
| Platform/device       | Facts about declared hardware and protocol surfaces.                      | MMIO ranges, timers, interrupt controller, framebuffer, board memory map, generated bindings.       |

## Source Boundary

`#requires` is the reusable source-level declaration for target requirements a
module depends on. It states minimum or required capabilities, not a complete
machine selection. A reusable library should use `#requires(...)` when it needs
an ISA baseline, ISA feature, minimum exception level, or ABI capability.

<!-- wyst-contract: check-pass -->
```wyst
module source_requirement_demo

import core.arch { cpu }

#requires(arch = arm64-v8a, el = 1, abi = ( aapcs64 ))

fn spin_once() {
  cpu.nop()
}
```

`#requires` accepts these source requirement fields:

| Field | Meaning |
| ----- | ------- |
| `arch` | Minimum architecture revision. `arm64-v8a` is the current implemented baseline. |
| `features` | Required ISA feature set, such as `lse` or `pmu`. |
| `el` | Minimum ARM Exception Level required by the module. A higher selected entry level is compatible. |
| `abi` | Required ABI capability set, currently `wyst-native` and `aapcs64`. |

Build-selection fields such as `cpu`, tuning model, object format, loader,
device map, platform services, and artifact handoff do not belong in
`#requires`. They are selected by a project profile, project manifest, or
future artifact configuration.

`#target` remains accepted for exact source-level target facts in target-bound
boot/runtime modules. It is optional for reusable
source: if a module omits exact target facts, project artifact builds must
supply artifact-affecting facts from `wyst.project`, while source-only and
loose-file checks may use compiler analysis defaults.

<!-- wyst-contract: check-pass -->
```wyst
module target_demo

#target(arch = arm64-v8a, cpu = generic, el = 1)
```

The source declaration should stay compact. Larger platform and device facts
belong in target profiles, generated artifacts, standard-library modules, or
project manifests with stable provenance.

Compact source-level mapping facts may be stated when a module needs to expose
known architectural memory type ranges to diagnostics or reports:

<!-- wyst-contract: check-pass -->
```wyst
module target_memory_demo

#target(arch = arm64-v8a, device_memory = (0x0900_0000..0x0900_1000))
```

`device_memory` records a target-provided fact that the named numeric range is
configured as Device memory by the selected platform/runtime. It does not come
from `@volatile T`, `@mmio T`, or any cast in source code; address qualifiers
describe compiler-visible access semantics and programmer intent, not the
page-table property.

A module has one exact target contract and one source requirement contract.
Multi-file modules may repeat `#target(...)` or `#requires(...)`, but repeated
declarations of the same construct must describe the same normalized
named-argument set; Wyst does not merge partial declarations.

## Project Profile Floor

Project builds bind source requirements and exact source target facts to named
target profiles, explicit project target facts, or both. If both profile and
explicit project facts are present, they must agree. If a module declares
`#requires(...)`, the selected project target must provide every required
capability. If a module declares `#target(...)`, it must be compatible with the
project target facts exactly, except that feature tuples remain subset-checked.
If it omits `#target(...)`, the project target facts act as semantic defaults.
Project artifact, evidence, and explain-report commands require an explicit
project target selection before final legality, layout, or emitted bytes are
computed; they do not silently consume EL, cache-line, feature, ABI, object
format, or loader defaults. Target reports record whether facts came from an
explicit profile/custom project facts, source requirements, permitted analysis
defaults, or unverified assumptions. Current project artifact reports must have
no unverified target assumptions.

### Target Profile Contract v1

Every project artifact target is authenticated as one
`wyst.target-profile-contract.v1` product before any target facts become visible
to source checking, layout validation, lowering, or reporting. The product has
these mandatory policy fields:

| Field | Contract |
| ----- | -------- |
| `layout_owner` | Exactly `.artifact` or `.environment`. |
| `root_abi` | ABI of the selected source root closure. |
| `entry_abi` | ABI of an executable entry, when the artifact kind has one. |
| `root_return_policy` | Whether and how the root may return. |
| `privilege_policy` | Initial privilege and architectural-state contract. |
| `admission_policy` | Project authority/trust classes admitted by the target. |
| `dynamic_import_policy` | Dynamic-import availability and binding policy. |
| `tls_policy` | Thread-local-storage availability and ABI policy. |
| `unwind_policy` | Target unwind representation and availability. |
| `panic_policy` | Panic termination or propagation contract. |
| `exit_policy` | Available program-completion paths. |

The layout owner is not a manifest Boolean. For an executable, benchmark, or
fixture, `.artifact` requires exactly `layout NAME from "PATH"`, while
`.environment` requires exactly `layout .environment` and rejects a source
layout. The normalized owner and choice are retained together. A
`static_library` has no entry or layout and is therefore exempt from choosing
either manifest layout form; its target profile remains the sole target
selection.

Target profiles also authenticate exactly one
`wyst.target-profile-extension-set.v1`. An extension selection is an
indivisible, versioned product bound to the complete
`wyst.target-profile-base.v1` digest and layout owner. Authentication covers
its identity, active version, product
schema, complete normalized fields, compiler-owned expected content digest,
and profile/owner compatibility. Consumers receive either the complete
authenticated set or no extension facts. Unknown, absent, stale, partial, or
incompatible products are stable errors; no consumer may accept a subset,
retain a product from another base profile, or ignore an unrecognized product.

The target contract schema and digest, typed entry-schema identity and digest
when present, extension-set schema and digest, every policy field, layout
owner, and normalized layout choice are common identity inputs. They
participate atomically in target compatibility, artifact identity, semantic
interfaces, reusable cache keys, diagnostics, reports, and runner preflight. A
change cannot update one of those surfaces without invalidating the shared
identity used by all of them.

The `qemu-virt-aarch64-el2` and `qemu-virt-aarch64-el2-lse` profiles each
authenticate one `wyst.target-entry-schema.v1` product. It fixes Wyst Native
calling convention, initial EL2, never-returning behavior, and exactly one
incoming parameter, `dtb: @u8 in x0`. It also authenticates the initially
uninitialized stack and the sole admitted initialization transition:
`asm establishes stack (stack: u64 in x1 = ...) { mov sp, stack }`. The
transition reads `x1` and therefore preserves firmware `x0`. Source names,
types, register placements, stack clauses, or instructions never construct or
extend this authority. Missing, stale, partial, wrong-profile, wrong-arity,
wrong-name, wrong-type, wrong-register, wrong-convention, wrong-EL,
returning, or mismatched-transition products fail before artifact output.

`qemu-virt-aarch64-el3` authenticates a distinct product with identity
`qemu-virt-aarch64-el3-noargs-v1` and entry ABI
`wyst-native-noargs-v1`. It fixes secure EL3, the exact zero-parameter root
`pub naked fn _start() -> never`, and the same initially uninitialized stack.
That root must contain exactly one checked transition,
`asm establishes stack (stack: u64 in x1 = __stack_top) { mov sp, stack }`.
The canonical production fixture follows it directly with `firmware_main()`,
but that callee name is runtime evidence rather than an authenticated schema
field. In this schema `x0` is not an entry parameter and carries no
authenticated DTB. The EL2 DTB schema and EL3 no-argument schema are not
interchangeable, even when source happens to use the same stack transition.

The current authenticated extension set contains the source-matched platform-
counter product described below and exactly one execution-environment product.
Consumers authenticate the combined set once; they may not authenticate either
product as a subset and merge facts afterward. A source import that requires an
execution or completion provider is accepted only when that exact descriptor is
offered by the selected environment product. An unused descriptor does not
create a link or runtime dependency.

All current built-in profiles have `.artifact` layout ownership and share this
policy tuple except for the entry ABI, which is profile-specific below:

- `root_abi = wyst-module-root-v1`;
- `root_return_policy = never`;
- `admission_policy = freestanding-authenticated-a64-v1`;
- `dynamic_import_policy = forbidden`;
- `tls_policy = forbidden`;
- `unwind_policy = dwarf-cfi-static-elf-v1`; and
- `panic_policy = source-defined-terminal-v1`.

Their remaining exact rows are:

| Profiles | `entry_abi` | `privilege_policy` | `exit_policy` |
| -------- | ----------- | ------------------ | ------------- |
| `qemu-virt-aarch64-el1` | `wyst-native-zero-parameter-v1` | `aarch64-entry-el1` | `semihost-service-or-terminal-v1` |
| `qemu-virt-aarch64-el2`, `qemu-virt-aarch64-el2-lse` | `wyst-native-dtb-x0-v1` | `aarch64-entry-el2` | `semihost-service-or-terminal-v1` |
| `qemu-virt-aarch64-el3` | `wyst-native-noargs-v1` | `aarch64-entry-el3` | `semihost-service-or-terminal-v1` |
| `qemu-raspi4b-aarch64-el2` | `wyst-native-zero-parameter-v1` | `aarch64-entry-el2` | `terminal-only-v1` |

The QEMU `virt` baseline profiles are:

```text
qemu-virt-aarch64-el1
qemu-virt-aarch64-el2
qemu-virt-aarch64-el3
```

They name the QEMU-oriented static ELF baseline at exact EL1, EL2, and EL3
entry levels: `arm64-v8a`, generic CPU, Wyst native ABI, static AArch64 ELF
output, and existing AAPCS64 interop support. The EL3 profile is the secure
direct-ELF handoff; unlike the EL2 profiles, it neither authenticates nor
delivers a DTB parameter in `x0`. Module-level `#requires(...)` declarations
must be satisfied, and module-level `#target(...)` declarations must be
compatible with the selected project profile when one is present.

All three profiles select executable environment `qemu-aarch64-semihost-v1`. Its
closed offer set contains exactly `a64-semihost-hlt-f000-v1`, so importing
`core.environment.semihost` records that descriptor as an artifact
requirement. A runner must advertise the same environment identity and satisfy
that required descriptor before launching the artifact. The runner environment
comes from an independent authenticated runner catalog, not from target facts
or a manifest service clause. Static artifact preparation authenticates the
target offer and records exact requirements in `.wyst.artifact`; the production
`wync runner-preflight <artifact.elf> --runner <catalog-id>` gate decodes and
authenticates those facts, including the complete target-entry schema when the
profile has one, immediately before launch, then rejects an unknown,
mismatched, incomplete, or stale product. Runner selection does not affect
artifact or cache identity.

It also selects exactly one measurement-counter **source descriptor**,
`a64-generic-virtual-counter-v1`, for `cpu.read_counter()`. This selection is a
separate authenticated artifact-target fact; `arm64-v8a`, `generic`, and a
`pmu` feature do not imply or replace it. The source descriptor fixes the read
identity/lowering, width, frequency-acquisition path, privilege/enablement,
failure, and source-report identity only. It does not assert a runtime counter
domain or configuration epoch, core comparability or offset, endpoint
serialization, platform-state progress, mutable-control exclusion, or a proved
maximum interval span.

Every built-in target that selects this source descriptor also requires exactly
one source-matched platform-counter-instance extension through the atomic
target-profile extension set. The extension is a static compiler-owned
provider/schema product with identity
`a64-generic-virtual-counter-instance-provider-v1`, version 1, product role
`platform_counter_instance_provider`, product schema
`wyst.platform-counter-instance-provider.v1`, and instance-record schema
`wyst.platform-counter-instance-record.v1`. It also names combined universe-
evidence schema `wyst.platform-counter-universe-evidence.v1`. Its exact source-
descriptor reference, normalized fields, product digest, and enclosing
extension-set digest participate in target compatibility, reusable compilation-
cache keys, semantic interfaces, artifact identity, diagnostics, generated
manifests, and reports. Authentication exposes the complete product or no
product; a target cannot observe a partial provider schema or select two
providers for one source descriptor.

The static product does not claim that a boot, process, launch, measurement
epoch, or instance record exists. A runtime record is a separate optional
launch/measurement input and never contributes to a reusable compilation-cache
key.

The corresponding QEMU profile for artifacts that require LSE atomics is:

```text
qemu-virt-aarch64-el2-lse
```

It has the same CPU, EL, executable-environment, environment-service offer,
ABI, and measurement-counter-source contracts as `qemu-virt-aarch64-el2`, and
additionally selects the authenticated `lse` target feature. The baseline
profile does not silently acquire LSE merely because the compiler can encode
it; neither target profile selects a launch runner.

The board-emulation profile is:

```text
qemu-raspi4b-aarch64-el2
```

It names QEMU's `raspi4b` machine with `arm64-v8a`, `cortex-a72`, EL2 entry,
static AArch64 ELF lowering, and a runner-owned flat `kernel8.img`-style
handoff artifact. The profile is intentionally scoped to QEMU board
emulation; it does not claim physical Raspberry Pi model 4, revision B,
hardware bring-up.
It selects executable environment `bare-aarch64-v1`, whose service offer set
is empty. In particular, architecture support for `hlt` does not make the
sealed semihost service available.

The `raspi4b` artifact profile independently selects the same exact
`a64-generic-virtual-counter-v1` measurement-counter source descriptor. A
custom or otherwise bare target with no explicit counter selection does not
inherit that choice and must reject `cpu.read_counter()`. Empty, unknown,
duplicate, or multiple source-descriptor selections are invalid target facts.

### Executable Environment And Provider Descriptors

The normalized execution-environment class is one closed target-profile
extension fact, never source syntax or an independent manifest switch:

| Class | Meaning |
| ----- | ------- |
| `freestanding_privileged` | Kernels and privileged bare-metal images. |
| `freestanding_unprivileged` | Restricted bare-metal images. |
| `hosted_systems` | Ordinary systems programs on an existing operating system. |
| `hosted_restricted` | WystOS first-party EL0 service images and comparable restricted services. |

The product schema is `wyst.execution-environment-contract.v1`. It is bound to
the selected target's exact authenticated base-profile digest; that base
continues to own layout-owner, root/entry ABI and return,
privilege/architectural-state, admitted authority/trust, dynamic-import, TLS,
unwind, panic, and exit policies. The environment product itself carries its
class, role, closed execution-provider and completion-provider descriptor
lists, and explicit retained-strand migration, asynchronous-preemption, and
current-core/`per_cpu` policies. Target selection remains the one manifest
choice; `hosted`, `kernel`, `privileged`, `concurrency`, `provider`, and similar
Boolean clauses do not exist.

An execution provider uses schema `wyst.execution-provider-descriptor.v1`; a
completion provider uses
`wyst.completion-provider-descriptor.v1`. Descriptor authentication binds its
stable identity and version to the enclosing environment product and selected
target base digest, complete normalized provider fields, and expected product
digest. Compatibility, semantic-interface and artifact identity, reusable
cache keys, diagnostics, provenance, and reports consume the authenticated
descriptor identity. Unknown, absent, duplicate, stale, partial, or
base-incompatible descriptors fail closed without exposing partial facts.

All current built-in profiles select
`wyst-execution-environment-freestanding-privileged-v1` version 1 with class
`freestanding_privileged`. Their execution- and completion-provider lists are
empty; retained-strand migration is `forbidden`, asynchronous preemption is
`same_core`, and both current-core and `per_cpu` policy are
`invalidate_and_reacquire_after_boundary`. The product's exact pinned digest is
`sha256:8879282db08925796d3dc275fbf6249d73ee861dffe83985d5ab5bd1de4cf662`,
owned by its checked-in [semantic database row](semantic-db.json).
The other three environment-class products retain `unavailable` current-core
and `per_cpu` policies and are not selected by the current built-in profiles.

The pre-provider, source-local
`#target(per_cpu = single_instance_tpidr_el1)` test realization is a separate
single-instance contract; it does not populate these environment-provider
facts or claim migratable current-context state, and it cannot by itself become
valid production IR or an artifact. Production typed IR, a direct build, and a
project build require an authenticated execution-environment contract whenever
that realization is available; absence is a hard incompatibility. Once a
contract is selected, source/semantic validation and typed IR join the
realization against its exact `per_cpu_policy`. All five current built-ins
therefore admit an explicit `single_instance_tpidr_el1` realization;
`unavailable` or an absent environment is a hard incompatibility rather than a
convention or fallback. This admission does not permit strand migration:
`retained_strand_migration_policy=forbidden` remains authoritative. The
compiler's synthetic conformance environment
separately authenticates `wyst-synthetic-execution-provider-v1` version 1 and
`wyst-synthetic-completion-provider-v1` version 1; those synthetic products do
not claim a WystOS, Linux, macOS, QEMU, or bare-metal runtime implementation.

The synthetic execution-provider product has the exact pinned digest
`sha256:3a698ddcfbc34f0d6f556b71d672e114dd550cf58fe4ca862544dddd566d716a`
in its checked-in [semantic database row](semantic-db.json).
In addition to its identity, version, schema, role, provider-leaf identity,
adjacent transfer identity, migration, preemption, current-core/`per_cpu`,
task-return, activation/object-identity, and continuation-lifetime facts, its
authenticated control-order and publication fields are exactly:

| Product field | Authenticated value |
| ------------- | ------------------- |
| `architectural_return_control_order` | `after_completed_handler_with_recursive_nesting` |
| `architectural_return_strand_identity` | `exact_interrupted_strand` |
| `current_continuation_rebranding` | `forbidden` |
| `provider_metadata_handoff_publication` | `release_acquire` |
| `provider_owned_metadata` | `saved_context_run_queue_current_task` |
| `scheduler_transfer_agent_order` | `saved_with_interrupted_agent` |
| `selected_task_transfer` | `resume_distinct_saved_strand_or_nonreturning` |
| `task_selection_unrelated_program_memory_happens_before` | `none` |
| `trap_entry_control_order` | `after_exact_interrupted_strand_prefix` |
| `trap_entry_strand_identity` | `fresh_same_execution_agent_strand` |

A provider is required only when imported source requires its exact descriptor.
Merely defining a resumable function or carrying `execution_suspension` does
not select or link a provider. The provider-only
`core.execution.suspension_point` import therefore fails when the selected
environment does not offer its authenticated execution provider, even though
the language effect and ordinary effect-bearing foreign callable contracts
remain available. A restricted class is compile/link admission and audit
policy, not a memory-security boundary; the operating environment must still
enforce privilege, mappings, and capabilities.

### Platform Counter Instance Provider And Record

The five current built-in profiles select the same source-matched static
provider/schema product because all five expose
`a64-generic-virtual-counter-v1`. This is compiler-owned synthetic conformance,
not a claim that QEMU, a board, WystOS, Linux, or macOS currently produces a
runtime record. A later concrete environment may produce at most one immutable
record under the selected schema for one launch or measurement lifetime.

The record schema is `wyst.platform-counter-instance-record.v1`; the normalized
per-run identity derived from it uses
`wyst.platform-counter-instance-identity.v1`. Neither changes the static
provider version or extension identity. The provider's five-field product,
including field `universe_evidence_schema` with value
`wyst.platform-counter-universe-evidence.v1`, has pinned digest
`sha256:ab1c41697aac01bea2961dd676ea33f980712a4471ea70ed226adcf4ed3659b1`.

The producer-facing record envelope contains all of the following,
independently rather than as inferred aliases:

- `record_schema` and `record_version`;
- `provider_identity`, `provider_version`, `provider_schema`, and
  `provider_product_digest` copied from the authenticated static product;
- the exact `source_descriptor`, a runtime `counter_domain_id`, and
  `configuration_epoch`;
- one closed `frequency`, `comparability`, and `serialization` value;
- `universe_evidence_contract_identity` and
  `universe_evidence_content_digest`, which select the exact trust anchor and
  authenticated combined state/control-universe authority;
- `state_universe_evidence_identity` and the complete normalized `states`;
- `control_universe_evidence_identity` and the complete normalized
  `mutable_controls`; and
- `claimed_content_digest`, which authentication recomputes over the complete
  normalized content before exposing any field.

The producer makes each `configuration_epoch` identity unique within its
`counter_domain_id`. The compiler validates its canonical spelling, requires a
pairwise epoch change for an authenticated mutable-control transition, and
carries the exact epoch through a record lifecycle. It deliberately keeps no
global runtime epoch ledger; establishing global producer uniqueness would make
the compiler a runtime implementation.

Authentication requires every identity to be nonempty and canonical, validates
the payload identity of each custom core-idle or power state separately, and
requires every free-text reason to be nonempty, trimmed, and printable. It sorts
states by state identity and controls by control identity, sorts every control's
effects, collects every referenced evidence identity in canonical order, and
exposes one immutable record with its authenticated `content_digest` and
derived record identity. The synthetic conformance record's exact content and
record-identity digests are pinned by its checked-in
[semantic database row](semantic-db.json).
The closed realized-frequency modes are:

| Mode | Required content |
| ---- | ---------------- |
| `fixed_hz` | Nonzero `ticks_per_second`, `acquisition_identity`, and `evidence_identity`. |
| `variable` | `configuration_identity`, `acquisition_identity`, and `evidence_identity`. |
| `unknown` | A nonempty normalized `reason`, `acquisition_identity`, and `evidence_identity`; this mode supplies no numeric frequency. |

Endpoint comparability is closed:

| Mode | Contract |
| ---- | -------- |
| `same_core_only` | Carries `evidence_identity`; samples are comparable only after the interval consumer proves that both endpoints are on the same core. No core identity or cross-core offset is inferred. |
| `shared_monotonic(max_offset_ticks = N)` | Carries `evidence_identity`; samples may cross cores in the one runtime domain and epoch, with nonnegative `N` retained as the maximum offset evidence bound. |

Endpoint serialization is also closed:

| Mode | Contract |
| ---- | -------- |
| `none_with_authority` | Carries normalized `reason`, `authority_identity`, and `evidence_identity` stating why no additional endpoint sequence is required. This is not an inference from the counter instruction. |
| `source_explicit` | Carries nonempty ordered `before` and `after` operation identities, `read = core.arch.cpu.read_counter`, `measured_overhead_ticks`, and `evidence_identity`. Every before/after step must resolve to an active, zero-operand, void `core.arch.barrier` architecture operation. Unknown, non-barrier, implicit, backend-added, and unnamed steps are invalid. |

The state universe always contains `active`, `wfe`, `wfi`, and `system_suspend`,
plus every selected `core_idle:IDENTITY` or `power:IDENTITY` state, and carries a
separate universe evidence identity. Every row is normalized as exactly
`applicable` or `inapplicable`. An applicable row has exactly one progress
classification—`continuous_monotonic`, `stops`, `may_reset_or_rebase`, or
`unknown`—and an evidence identity. An inapplicable row carries no progress
claim but still carries an evidence identity and remains in the closed universe,
so a consumer cannot mistake omission for evidence of impossibility. Duplicate
or missing required rows make the record fail closed.

Completeness is not established by those minimum rows or by a record producer
resealing its own subset. Before accepting a present record, the selected
platform-environment adapter must independently select one contract under
`wyst.platform-counter-universe-evidence-contract.v1`. That contract pins the
exact normalized content digest of one authority under
`wyst.platform-counter-universe-evidence.v1`; a self-consistent recomputed
authority digest is insufficient. The authenticated authority atomically binds
the static provider and source, the exact runtime `counter_domain_id` and
`configuration_epoch`, both universe evidence references, the exact sorted
state identities, and the exact sorted control identities with sorted effects.
Its scope fields enter the authority digest, so evidence from an earlier domain
or epoch cannot be replayed. The record additionally carries the selected
contract identity, and both that identity and the authority digest enter its
content digest, evidence aggregate, record identity, and lifecycle binding. The
baseline compiler-owned synthetic contract identity is
`synthetic.platform-counter-universe-contract.v1/counter-domain:boot-0001/configuration-epoch:0001`;
its scope-bound authority digest is
`sha256:c656328d5dde4c49e71ea298af58ac8daa27a8bb9205219d59c061bea3a3ebb1`.

The mutable-control universe carries its own evidence identity. Every control
lists one or more unique closed effects: `source`, `frequency`, `offset`,
`reset_or_rebase`, or `comparability`. Its applicability is closed: an
`inapplicable` row carries an evidence identity; an `applicable` row additionally
names `owner`, `required_exclusion`, and `begins_new_epoch_operation` plus its
evidence identity. The universe always contains applicability rows for
`CNTVOFF_EL2` and `CNTFRQ_EL0`; the former lists at least `offset` and the latter
at least `frequency`. Neither row may be omitted because it is inapplicable or
because a generic architectural statement sounds sufficient.

The record must exactly match that one authenticated authority, including its
counter domain, configuration epoch, contract identity, and content digest.
Omitting an authority-declared state or control is `incomplete`; an extra row or
a changed effect, scope, trust anchor, universe reference, or authority content
digest is `mismatched`. A present record with no authority is `incomplete`, and
multiple authorities are
`ambiguous`. No record together with no authority remains the legal raw-only
case. Runtime authority content, like runtime record content, is excluded from
compilation, semantic-interface, artifact, and reusable-cache identities; only
the static universe-evidence schema named by the provider enters them.

Record consumption uses one closed lifecycle state machine. It always begins at
`launch` from the launch resolution and records exactly one of
the raw-reads-only disposition with no runtime instance record or the bound
disposition carrying `BINDING`. Advancement
requires that preserved predecessor state and follows exactly
`Launch -> Measurement -> Report`; `Report` is terminal.

| Previous state | Next stage and legal evidence |
| -------------- | ----------------------------- |
| `Launch.RawReadsOnly` | `Measurement.RawReadsOnly`, or `Measurement.Bound` when the record first appears. |
| `Launch.Bound` | `Measurement.Bound` carrying the exact same immutable record. |
| `Measurement.RawReadsOnly` | `Report.RawReadsOnly`; a record cannot first appear at report. |
| `Measurement.Bound` | `Report.Bound` carrying the exact same immutable record. |

Thus a bound record cannot disappear, a measurement record can first appear
only from the preserved raw-only launch state, and no later stage can substitute
another otherwise-valid record. Every `Bound` value carries the identity
schema, record identity and content digest, universe-authority contract identity
and content digest, provider identity and product digest, source descriptor,
runtime domain, and configuration epoch. The closed state token structurally
enforces the one-record maximum across the run; the current compiler-owned
synthetic consumer exercises it without claiming to be a concrete runtime.

An out-of-order stage or attempt to advance terminal `Report` is `stale`. A
bound record that disappears or first appears at report is `incomplete`.
Changing the identity schema, provider product, source, runtime domain,
universe-authority contract identity, or authority content digest after binding
is `mismatched`; changing the epoch, record identity, or record content digest is
`stale`.

A mutable-control epoch transition is distinct from carrying one record through
that lifecycle. It retains the authenticated provider and runtime domain,
changes the epoch, names an applicable control and its exact
`begins_new_epoch_operation`, and binds the next authenticated record identity.
Reusing an epoch, changing the domain/provider, or naming a different or
inapplicable operation fails closed.

Record consumption has the closed failure dispositions `unknown`, `malformed`,
`incomplete`, `stale`, `mismatched`, and `ambiguous`; the last includes multiply
selected records and authorities. An unrecognized provider identity is
`unknown`; `mismatched` covers a source or other recognized-fact disagreement
and an invalid epoch-transition relationship. A recognized provider's stale
version, schema, or product digest is `stale`. It exposes no partial trusted
record. Absence is deliberately
different and resolves as `no_runtime_instance_record`: raw
`cpu.read_counter()` remains legal under the source descriptor, while every
numeric verification or report result is explicitly unsupported. No consumer
may infer frequency, progress, serialization, domain, epoch, or comparability
from the source descriptor or static provider product.

The future performance/resource-report and benchmark-comparison contract owns
validated measured intervals. It must bind the same source descriptor, static
provider/schema, immutable record identity/content digest, runtime domain, and
configuration epoch to both endpoints before interpreting a modular tick delta
numerically. The platform-counter-instance contract defines and validates the
lifecycle evidence; it does not itself publish elapsed-time or latency results.

The full layered descriptor schema is outside the project-manifest surface.
See [chapter-03-project-builds.md](chapter-03-project-builds.md) for the project
manifest contract.

## Uses

Target descriptors may drive:

- feature gating for intrinsics and instruction forms;
- ABI and calling-convention checks;
- exception-level and privilege diagnostics;
- object-format and entry-contract selection;
- device/MMIO/protocol availability diagnostics;
- deterministic build and explain provenance;
- static latency/throughput estimates for reports.

Microarchitectural estimates are report inputs by default. They do not change
emitted code unless an explicit scheduling or optimization mode consumes them.

## Non-Goals

- Do not make UEFI, Linux, QEMU, or any board model core language semantics.
- Do not treat firmware, OS, or device protocols as portable source facts.
- Do not let target-specific timing counters become portable time semantics.
- Do not let profile data or PMU measurements silently rewrite source or
  emitted code.
