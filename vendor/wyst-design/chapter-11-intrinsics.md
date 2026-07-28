---
title: "Chapter 11: Wyst Semantic Operations"
group: chapter
chapter: 11
order: 11
summary: "Qualified semantic operations, declared hardware access, target effects, and explicit uninitialized storage."
---

# Chapter 11: Wyst Semantic Operations

## Operation Surface

Wyst has no prefix-`%` user syntax. `%` may appear in internal compiler and IR
notation and remains the arithmetic remainder operator where expression
grammar permits it; neither use creates a source operation namespace.

The active operation registry is
[`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv). Each row
owns one stable semantic identity, source surface, compiler-internal lowering
key, target plan, result and parameter contract, ordering contract, report
identity, and implementation state. Target plans join the authenticated A64
instruction, system-operation, and machine-semantics catalogs rather than
forming a second instruction or effect table.

Atomic storage uses the closed matrix in
[`atomic-matrix.json`](atomic-matrix.json). Its scalar elements are `bool`,
`u8`, `u16`, `u32`, `u64`, `i8`, `i16`, `i32`, and `i64`, plus admitted
one-word address values. The matrix owns method arity, legal orders, results,
and lowering.

Architecture operations are qualified-only members of sealed `core.arch`
categories. A selective import binds the category, optionally under a local
alias, while the operation's semantic identity remains unchanged:

<!-- wyst-contract: check-pass -->
```wyst
module semantic_operations

import core.arch { cpu, barrier, cache, tlb, exception, memory as mem }

fn wait_for_event() {
  barrier.compiler()
  cpu.wfe()
}

fn load_pair(location: @u64) -> (first: u64, second: u64) {
  return mem.load_pair_non_temporal(location)
}
```

The closed architecture categories are `cpu`, `barrier`, `cache`, `tlb`,
`exception`, and `memory`. Bare leaf imports, unqualified leaf calls, expanded
aliases, user wrappers masquerading as catalog declarations, and re-exports of
sealed categories are not operation surface. Imports create compile-time
namespace bindings only: they emit no wrapper, runtime symbol, dispatch, or
call. Availability, privilege, effects, faults, ordering, and lowering are
derived from the cataloged identity and selected target profile.

Environment services follow the same identity and qualification rules under
sealed `core.environment`, but are selected by the executable environment, not
by architecture alone. For example:

<!-- wyst-contract: sketch -->
```wyst
import core.environment { semihost }

const result: u64 = semihost.call(operation, parameter)
```

Importing `semihost` is valid only when the target selects its exact service
descriptor.
The current compatible profile selects executable environment
`qemu-aarch64-semihost`, which offers exactly
`a64-semihost-hlt-f000`; bare or unselected environments fail the import as
a hard target-compatibility error during compilation.
On A64, `semihost.call` places its two `u64` arguments in `x0` and `x1`, emits
`hlt #0xf000`, and returns `x0`. It remains distinct from
`exception.hlt(0xf000)`, which has no semihost ABI meaning.

The provider-facing sealed `core.execution` namespace instead uses one private
direct whole-module import and exposes only
`execution.suspension_point()`. Its stable semantic identity is
`core.execution.suspension_point`; its internal identity is
`execution_suspension_point`. It introduces the target-neutral
`execution_suspension` effect and typed `strand_suspension_boundary`, then
returns immediately with zero machine or runtime artifact. It is not an
environment service or a general user-callable yield. Chapter 13 owns the
selected-target/provider/leaf/adjacent-transfer authentication and rejects
standalone, missing, duplicate, separated, post-transfer, and redundant marker
placements. Imported Wyst or foreign calls whose callable bound already
contains the effect use their ordinary pre-transfer boundary and no marker.

The target-neutral fatal boundary is another sealed whole-module semantic
operation:

<!-- wyst-contract: valid -->
```wyst
import core.trap

fn fatal(reason: u16) -> never effects(trap) {
  trap.fatal(reason)
}
```

`core.trap` is private and cannot be selectively imported or re-exported.
`trap.fatal` has stable semantic identity `core.trap.fatal` and internal
lowering identity `fatal_trap`; it is a runtime operation, not a `#`-prefixed
compile-time meta-operation.

Compiler-owned operations that naturally belong to a language type use that
type's authenticated method or property surface: atomic methods come from the
atomic matrix; system-register declarations provide `.read()`, `.write(...)`,
and `.modify(...)`; endian access is an address method; vectors provide
`.abs()`, `.sqrt()`, and unary negation; and enum values provide `.tag`. The
bare `fma(a, b, c)` operation and generic `uninit<T>()` constructor are
unshadowable. `addr_of(local)` is Wyst runtime address-materialization
operation. These surfaces still carry catalog identities even though they do
not require an architecture-category import.

### `MaybeUninit<T>` Whole-Object Storage

`MaybeUninit<T>` is opaque storage with exactly `T`'s size, alignment, storage
class, and calling-convention footprint, but it does not contain a
compiler-proved initialized `T` until a complete write establishes that fact.
The complete Wyst surface is:

<!-- wyst-contract: sketch -->
```wyst
module explicit_uninitialized_storage

fn example(value: u64) -> u64 {
  var slot = uninit<u64>()
  const raw: u64 = slot.read_uninit()
  slot.write(value)
  const proven: u64 = slot.read()
  const asserted: u64 = slot.assume_init()
  const slot_address: @MaybeUninit<u64> = addr_of(slot)
  return raw + proven + asserted
}
```

`uninit<T>()` reserves storage without zeroing, writing, allocating, or
inventing initialization. `slot.write(value)` evaluates `value` once, performs
one complete typed write, and establishes compiler-proved initialization.
`slot.read()` performs one non-consuming typed read and is valid only when
every incoming control-flow path proves complete initialization.

`slot.read_uninit()` is valid in every initialization state. It performs one
explicit indeterminate-bit observation, returns an ordinary `T`, leaves the
state unchanged, and is represented distinctly in typed IR; its result is
never compiler `poison` or `undef`. `slot.assume_init()` performs a typed read,
records a trusted initialization assertion, and makes later evidence
assertion-derived. A false assertion is a confined contract violation, not
permission for unrelated optimizer assumptions.

`MaybeUninit<T>` is non-copyable and cannot be passed or returned by value,
embedded in an aggregate, converted, relensed, or used by ordinary value
operations. Wyst tracks initialization at whole-object granularity only.
`addr_of(slot)` yields `@MaybeUninit<T>` without reading it; that address has no
ordinary `.load()`, `.store()`, conversion, or relensing surface. A verified
complete producer write may establish initialized state. Foreign or opaque
mutation otherwise makes the state unknown, and the documented success path
must use `assume_init()` when no proof is available.

## Hardware Register Declarations and Access

The declaration, snapshot, field-policy, and compiler-owned method surface
through **System Register Declarations** below defines hardware access.

### Register Maps and MMIO Placement

`register_map` describes a reusable set of MMIO registers. A register has one
access mode, one unsigned backing width, one byte offset, and an optional field
block. `mmio` places a map at one base address:

<!-- wyst-contract: sketch -->
```wyst
register_map Pl011 {
  DR: readwrite u32 at 0x00 {
    DATA: u8 at 0..=7
  }

  FR: readonly u32 at 0x18 {
    TXFF: bool at 5
  }
}

mmio UART0: Pl011 at 0x0900_0000
```

Register offsets and MMIO placement addresses are compile-time integers. A
placed register address is the base plus its byte offset, checked without
wraparound. Each access must satisfy the backing width's natural MMIO alignment;
a provably misaligned declaration or access is rejected. Register offsets are
not source address expressions, and `at` remains a declarative-placement word.

The register backing is exactly `u8`, `u16`, `u32`, or `u64`. A register may
omit its field block and still creates the nominal `Map.Register.Value` snapshot
defined in Chapter 6. A placed map exposes its registers only through the map
instance, for example `UART0.FR`; placement does not copy storage, allocate
memory, or perform an access.

A standalone scalar MMIO declaration names one register directly:

<!-- wyst-contract: sketch -->
```wyst
mmio TIMER: readonly u64 at 0x0200_bff8
```

Its declared type must be a target-supported fixed-width scalar that lowers to
one load or store. It uses that scalar directly and has no snapshot wrapper,
`.raw`, named-field write, or `modify` operation. Vectors and aggregates are
invalid scalar MMIO types. The raw `@mmio T` address type remains available as
the lower-level dynamic-address surface.

`register_map`, `mmio`, and `system_register` are contextual declaration
introducers and remain ordinary identifiers outside their registered top-level
slots. `readonly`, `writeonly`, and `readwrite` are likewise contextual access
modes only in hardware declaration positions. The spelling `access(...)` is
not grammar. `device` is globally reserved and rejected pending a separately
specified board/SoC model.

### Captured Reads, Raw Writes, and Named Operations

For a map register, `.read()` is available exactly when the register is
readable. It performs one full-width hardware read and returns the register's
nominal snapshot. Its read-only `.raw` and readable field projections observe
that one captured value and cannot perform another access.

A raw `.write(value)` is available exactly when the register is writable. It
accepts exactly one value of the raw backing type and performs one full-width
write. It deliberately bypasses named-field and reserved-bit construction
policy and writes every supplied bit. A snapshot is not accepted implicitly;
the caller writes `snapshot.raw`. There are no snapshot overloads, `read_raw`,
or `write_raw` aliases.

A named `.write(FIELD = value, ...)` begins with a deterministic zero backing,
applies every field's write-policy encoding and the fixed reserved-bit image,
and performs one full-width write. A named `.modify(FIELD = value, ...)`
evaluates the receiver and arguments, performs one full-width read, applies the
named updates to that captured backing under the field and reserved policies,
and performs one full-width write. It is not atomic.

Raw and named arguments cannot be mixed. Named write and modify require at
least one argument; every label must name a unique writable field. Duplicate,
unknown, unreadable-only, or policy-inert labels are rejected. Both operations
return no value. The receiver and every argument are evaluated exactly once in
left-to-right written order before any hardware access. No operation inserts a
retry, truncation, architectural barrier, or extra access.

### Hardware Fields and Policies

Hardware fields use the same normalized carrier and `at N` / `at A..=B`
location engine as `bitstruct`. Constant locations, positive width, bounds,
overlap, carrier representability, complete payload-less-enum encoding, and
explicit runtime truncation are checked once by that shared engine. Hardware
policies do not extend standalone `bitstruct` declarations.

A field without an access mode inherits its register's mode. An explicit field
mode may only narrow the register mode to a non-empty subset. Thus a `readwrite`
register may contain a `readonly` or `writeonly` field, while a `readonly`
register cannot contain a writable field and a `writeonly` register cannot
contain a readable field.

The closed postfix policy vocabulary is:

| Policy class | Spellings | Meaning |
| --- | --- | --- |
| Reset metadata | `reset VALUE` | records the field's declared reset encoding; it emits no access and creates no runtime initialization |
| Read behavior | `read_clears`, `read_sets` | the hardware clears or sets the field as a consequence of the one declared read |
| Write behavior | `write_ignored` | writes to the field have no hardware meaning and the field is not a named writable argument |
| Write-one behavior | `write_one_clears`, `write_one_sets`, `write_one_toggles` | each one bit written requests the named action; zero is the inactive encoding |
| Write-zero behavior | `write_zero_clears`, `write_zero_sets`, `write_zero_toggles` | each zero bit written requests the named action; one is the inactive encoding |

Suffixes occur only in reset, read-policy, write-policy order and at most once
per class. Missing reset metadata means unknown, not zero. A reset value must be
constant and representable in the field width. Policies do not authorize an
access direction that the register or field mode forbids. Impossible
combinations are rejected rather than assigned approximate semantics.

For action policies, a named argument is the action-bit mask in the field's
carrier, not a promise of the post-write state. Unmentioned write-one fields use
their zero inactive encoding and unmentioned write-zero fields use their one
inactive encoding. A field without a write action policy is inserted normally
into the zero base. This construction is admitted only when all unmentioned
fields have a deterministic safe encoding for the one requested write.

Bits not covered by a named field or explicit reserved region are implicitly
reserved-zero for named writes. An explicit reserved region uses the same bit
location grammar and only overrides that default:

<!-- wyst-contract: sketch -->
```wyst
reserved at 8..=15 one
reserved at 16..=31 preserve
```

Reserved regions have no field accessor and cannot appear as named arguments.
`one` contributes ones to a named write. `preserve` copies the captured bits
during a named modify and makes named write invalid because named write performs
no implicit read. Reserved regions and fields may not overlap.

Named modify is available only when the field engine can satisfy every field,
reserved, and read-side-effect rule with exactly one read followed by one write.
In particular, a destructive `read_clears` or `read_sets` policy cannot be
silently compensated with another read or write. If the exact pair is not safe,
modify is rejected; there is no fallback operation.

### System Register Declarations

ARM64 system registers use exactly `system_register NAME: ACCESS u64` plus the
hardware field block. A catalog-named declaration omits `at`, uses the exact
case-sensitive canonical catalog register name, and uses `{}` when it declares
no fields:

<!-- wyst-contract: sketch -->
```wyst
system_register CurrentEL: readonly u64 {}

system_register SCTLR_EL1: readwrite u64 {
  M: readwrite bool at 0
  C: readwrite bool at 2
  I: readwrite bool at 12
}
```

Every declaration creates `NAME.Value`, including an empty declaration.
`.read()` emits one `mrs` and returns that nominal snapshot. `.raw` is a
read-only `u64`; fields project from the same captured value. Raw `.write(...)`
accepts exactly `u64` and emits one `msr`; a snapshot requires explicit `.raw`.
Named write and modify use the same policy engine as register maps and retain
the exact one-write or one-read/one-write contract.

The declared access mode cannot exceed the authenticated register directions.
The compiler checks canonical identity, support disposition, selected target
revision and features, execution level, security and implicit state, effects,
faults, and field legality. All facts and the emitted `mrs`/`msr` instruction
come exclusively from the normalized A64 authority, active support catalog,
and compiler-semantic catalog. A declaration cannot create or override an
architectural fact, and no compiler phase owns a parallel system-register
table. Lowering consumes typed catalog identity and never constructs source
`asm`.

An authenticated implementation-defined target-extension register uses the
sole encoded declaration spelling:

<!-- wyst-contract: sketch -->
```wyst
system_register VENDOR_CTL: readwrite u64 at S3_0_C15_C2_0
```

The fieldless encoded form omits braces; an encoded declaration with fields
places its field block after the literal. The literal's exact case-sensitive
grammar is `S<op0>_<op1>_C<CRn>_C<CRm>_<op2>`. Components are canonical unsigned
decimal without a leading zero except for `0`; their widths are respectively 2,
3, 4, 4, and 3 bits. Strings, lowercase `s` or `c`, expressions, omitted
components, alternate separators, and noncanonical aliases are rejected.

The exact tuple must resolve to one active authenticated target-extension row
with complete compiler semantics and selected-target availability. The literal
selects that known row and never creates a register or instruction fact.
Unknown or unnamed tuples are rejected. There is no raw encoding escape.

Each system-register read, write, and complete modify is a full two-way
compiler-memory fence. No operation implies or emits `dmb`, `dsb`, or `isb`;
architecture-required sequencing remains an explicit source operation. Reports
distinguish the compiler-only fence from any emitted architectural barrier and
distinguish snapshot reads, raw writes, named writes, and complete modifies.
There are no register-specific weak-order exceptions.

## `per_cpu` Target and Access Projection

Chapter 8 is the sole source-semantic owner. This section defines the target
facts and machine-operation projection required by that contract; it does not
add an address-taking or TLS surface.

For every selected executable target, the compiler's authoritative target
product records these `per_cpu` facts:

| Fact | Required meaning |
| --- | --- |
| availability | whether reachable current-core access is supported |
| base mechanism | the exact register, system-register read, runtime hook, or other operation that obtains the live-instance base |
| required alignment | the minimum alignment promised for that live base and checked against the template contract |
| reserved state | every register, system register, exception-level, calling-convention, and clobber assumption used by the mechanism |
| realization kind | `single-instance-test-runtime`, later per-core runtime realization, or unavailable |

A mechanism name alone is insufficient. For example, `TPIDR_EL1` may be used
only when the selected target explicitly declares its exception-level
availability, base alignment, reservation/clobber rules, and realization kind.
No generic ARM64 default silently grants that contract.

The sole initial single-instance access-enabling surface is
`#target(..., per_cpu = single_instance_tpidr_el1)`. It installs this closed
fact set in the target product:

| Fact | `single_instance_tpidr_el1` value |
| --- | --- |
| availability | `available` |
| base mechanism | one `MRS TPIDR_EL1` per direct source access |
| minimum exception level | EL1 (`el >= 1`) |
| required live-base alignment | 16 bytes |
| reserved system state | `TPIDR_EL1` |
| realization kind | `single-instance-test-runtime` |

The runtime, not the compiler, installs the 16-byte-aligned live-instance base
in `TPIDR_EL1`. A call or primitive may modify that reserved system state only
when its own target contract says so; regardless, each later source access
performs its own `MRS` and does not reuse an earlier value.

One direct source read or write lowers to one fresh base acquisition, the
binding's final linked `.percpu` byte offset plus any checked field/element
offset, and exactly one type-appropriate logical operation. Ordinary scalar
storage uses one typed load or store. A bitstruct-field write is the sole
multi-instruction memory projection: one confined backing-word load,
`BitfieldInsert`, and store share that source access's one base. Typed-IR
verification accepts only that exact read-modify-write dataflow. The compiler
may fold an encodable constant offset into the operation, but it may not reuse
the base from an earlier access, create a compiler-owned cache slot, hoist the
acquisition, or materialize a general address. A method from
The atomic matrix uses the same one-base and offset rule around its one
requested atomic operation.
The compile-time `#percpu_offset_of(binding)` query emits only the final
template byte offset and does not acquire a base.

Compound assignment is not one such operation: Wyst rejects it for `per_cpu`
storage and requires separate direct read and write expressions, each with its
own fresh base acquisition.

Before the production multicore realization milestone, reachable access
requires that exact selection. Its
`single-instance-test-runtime` realization supplies live
storage and the declared base contract; it may not make the `.percpu` template
itself live storage. In its absence, declaration and offset layout may still be
formed, but every reachable access receives a hard target diagnostic. Hardware
discovery, a single-core observation, or the chosen exception level never
implicitly selects the realization.

Lowering and storage/explain reports expose the selected availability, base
mechanism, required alignment, reserved state, realization kind, declaration
identity, final offset, and source access origin. An unavailable fact is
reported as unavailable rather than guessed. The compiler emits the immutable
initialization template and access instruction sequence only: it performs no
replication, allocation, base installation, startup copy, or ordinary-global
collapse.

Wyst has no TLS storage class or TLS base mechanism and emits no `.tls`
template, `PT_TLS`, or ELF TLS relocations.

### `cpu.read_counter` — Target-Selected Measurement Counter Source

<!-- wyst-contract: sketch -->
```wyst
module measured_work
import core.arch { cpu }

fn sample() -> u64 {
    return cpu.read_counter()
}
```

`cpu.read_counter() -> u64` reads the one generic measurement-counter **source
descriptor** selected by the artifact target. The current QEMU `virt` and
`raspi4b` artifact targets each explicitly select
`a64-generic-virtual-counter`. That descriptor authenticates one
`CNTVCT_EL0` read, a 64-bit result, modulo-`2^64` wrapping,
`runtime_register(CNTFRQ_EL0)` frequency acquisition, minimum EL0, the
`CNTKCTL_EL1.EL0VCTEN_when_EL0` enablement condition, and
`architectural_fault_or_trap` failure behavior.

This generic descriptor owns only source-operation facts: read identity and
lowering, width, frequency **acquisition**, minimum execution level,
enablement, and failure. In particular,
`runtime_register(CNTFRQ_EL0)` identifies how a future measurement producer
may acquire a realized frequency; `cpu.read_counter()` itself does not read
that register or authenticate a frequency value.

Wyst descriptor result-width contract is the closed range `1..=64`. The
declared width may be narrower than the generated system-register carrier, but
may never be wider. The operation still returns `u64`: bits below the declared
width are the counter value and all higher bits are zero. Wrapping is modulo
`2^width`.

Runtime enablement is also a closed Wyst vocabulary. It describes a condition
that the execution environment must already satisfy; it is never an implicit
compiler setup sequence.

| Descriptor value | Wyst meaning |
| --- | --- |
| `none` | No additional runtime-enablement condition is declared. |
| `CNTKCTL_EL1.EL0VCTEN_when_EL0` | An EL0 read requires the generated `CNTKCTL_EL1.EL0VCTEN` dependency to permit virtual-counter access. |

Unknown, malformed, or register/EL-inconsistent enablement values invalidate
the descriptor. The compiler validates the named control register, its
execution-level shape, and the selected source accessor's generated dependency
facts where those facts are available.

Selection is an artifact-target fact, not an architecture-feature inference.
A source-only `#target(...)`, a custom/bare artifact target with no descriptor,
an unknown descriptor, or duplicate/multiple descriptors does not expose the
operation. The compiler rejects the call. In particular, a `pmu` feature never
changes the selected source to `PMCCNTR_EL0`, and no generic-timer or PMU
fallback is synthesized.

**Effects:** Full two-way compiler memory fence. The compiler must not
reorder loads or stores across a `cpu.read_counter()` call. It is also a source
scheduling boundary. This prevents
the compiler from moving source work outside the sampled region. It does not
serialize execution at either hardware endpoint and does not itself establish
a valid timing interval.

**Effect category:** `perf_counter`.

**Lowering:** exactly one `mrs xN, CNTVCT_EL0`. A 64-bit descriptor adds no
result-extraction instruction. A narrower descriptor adds exactly one
authenticated `and xN, xN, #((1 << width) - 1)` to zero-extend the declared low
width to `u64`; that extraction is not a second semantic counter read. There is
no wrapper, dispatch, enablement sequence, frequency read, retry,
architectural barrier, or fallback. The backend authenticates the descriptor
ID, selected artifact-target identity, generated system-register accessor,
encoding ID, and semantic-operation IR record before emitting the read word.

Effects and lowering reports record the selected artifact target, source-
descriptor identity, source, width, frequency-acquisition class, minimum EL,
enablement, failure, wrapping behavior, and catalog/authority origin.

**Example:**

<!-- wyst-contract: sketch -->
```wyst
const start: u64 = cpu.read_counter()
compute(data)
const end: u64 = cpu.read_counter()
```

These are two raw samples. Width-aware subtraction can produce only
`(end - start) mod 2^width`, a modular tick delta. The source descriptor alone
does not make that delta elapsed time, latency, or a value in seconds.

No runtime record is required to execute `cpu.read_counter()`. The operation
is a raw source read, and the compiler does not promote two reads into a
numeric elapsed-time claim. Any future measurement facility must define the
runtime frequency, endpoint comparability, serialization, mutable controls,
and maximum unambiguous interval it needs; those facts are not implied by the
source descriptor, compiler fences, or raw reads.

### Design Rationale

| Choice                                          | Reason                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `cache.prefetch` exposed directly, not auto-inserted | Auto-prefetching is a compiler transformation Wyst does not perform. Explicit prefetch lets the programmer control the distance and policy. |
| Full ARM64 `PRFM` coverage                      | ARM64 distinguishes load/store × three cache levels × keep/stream. Abstracting to fewer options would hide machine semantics.              |
| Non-temporal load/store operations use pairs    | ARM64 `LDNP`/`STNP` are pair instructions — exposing single-element non-temporal ops would require synthetic pair construction.            |
| `cpu.read_counter` is a full fence               | The fence keeps source loads/stores inside the sampled region. It neither serializes hardware endpoints nor upgrades raw ticks into elapsed-time evidence. |
| Artifact target selects one source descriptor    | Counter source, availability, privilege, frequency acquisition, and failure stay explicit; feature inference and fallback cannot change emitted code. |

## Canonical fatal boundary

`trap.fatal(reason: u16) -> never effects(trap)` is the target-neutral
authenticated fatal boundary. The explicit reason evaluates once and is
retained in typed IR; ARM64 places it in `x0` and emits reserved `BRK #0xf001`.
It never grants undefined-behavior assumptions and is rejected by
`#[deny_effects(trap)]`. Chapter 26 owns materialized `expect_or_trap` policy.
