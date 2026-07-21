---
title: "Chapter 11: Wyst Semantic Operations"
group: chapter
chapter: 11
order: 11
summary: "Qualified semantic operations, declared hardware access, target effects, and explicit uninitialized storage."
---

# Chapter 11: Wyst Semantic Operations

## selected snapshot Operation Surface (Normative)

The selected snapshot has **no prefix-`%` user syntax**. Every `%name(...)` spelling,
whether known to v0.8 or not, is rejected before operation-name lookup. `%`
may appear in internal compiler and IR notation and remains the arithmetic
remainder operator where expression grammar permits it; neither use creates a
source runtime-primitive namespace.

The normative active operation registry is the versioned
[`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv). Each row
owns one stable semantic identity, source surface, compiler-internal lowering
key, target plan, result and parameter contract, ordering contract, report
identity, and implementation state. Target plans join the authenticated A64
instruction, system-operation, and machine-semantics catalogs rather than
forming a second instruction or effect table. The separate
[`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv) is only
release evidence for the exact 88 predecessor names. It is not grammar, tooling
vocabulary, a migration alias table, or an operation-resolution input.

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
descriptor and adds that descriptor to the artifact's required-service set.
The current compatible profile selects executable environment
`qemu-aarch64-semihost-v1`, which offers exactly
`a64-semihost-hlt-f000-v1`; bare or unselected environments fail the import as
a hard target-compatibility error. Artifact preparation rechecks the required
set, and a runner must match the selected environment and satisfy every
required descriptor before launch. Target and runner environments are selected
independently: static artifact preparation authenticates only the target
contract and writes the exact requirement facts into `.wyst.artifact`.
Immediately before launch, `wync runner-preflight <artifact.elf> --runner
<catalog-id>` authenticates that metadata and the separately selected runner,
then rejects an unknown runner, mismatched environment identity, or incomplete
runner service set before any guest instruction executes. Runner choice is not
an artifact or cache identity input.
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

Compiler-owned operations that naturally belong to a language type use that
type's authenticated method or property surface: atomic methods come from the
atomic matrix; system-register declarations provide `.read()`, `.write(...)`,
and `.modify(...)`; endian access is an address method; vectors provide
`.abs()`, `.sqrt()`, and unary negation; and enum values provide `.tag`. The
bare `fma(a, b, c)` operation and generic `uninit<T>()` constructor are
unshadowable. `addr_of(local)` is the selected snapshot runtime address-materialization
operation. These surfaces still carry catalog identities even though they do
not require an architecture-category import.

### `MaybeUninit<T>` Whole-Object Storage

`MaybeUninit<T>` is opaque storage with exactly `T`'s size, alignment, storage
class, and calling-convention footprint, but it does not contain a
compiler-proved initialized `T` until a complete write establishes that fact.
The complete selected snapshot surface is:

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
operations. selected snapshot tracks initialization at whole-object granularity only.
`addr_of(slot)` yields `@MaybeUninit<T>` without reading it; that address has no
ordinary `.load()`, `.store()`, conversion, or relensing surface. A verified
complete producer write may establish initialized state. Foreign or opaque
mutation otherwise makes the state unknown, and the documented success path
must use `assume_init()` when no proof is available.

## Released v0.8 Prefix-`%` Reference (Historical, Non-Normative)

Every prefix-`%` spelling and example below is retained only as released-v0.8
design history. Present-tense descriptions in those historical sections state
v0.8 behavior; they do not admit a v0.9 spelling, alias, parser production, or
compatibility path. The active v0.9 authority is the section above and the
semantic operation catalog.

The following section also preserves old `#pin`, `#naked`, `#noescape`,
`#noreturn`, `T@[address]`, colon-slice, typed-address, `as.<category>`, and
legacy atomic examples. They are historical unless a later subsection is
explicitly labeled v0.9 normative.

---

## 1.3.2 Atomic Operations (historical v0.8 surface; non-normative)

The `%atomic_*`, `%cas`, `%fetch_*`, `%xchg`, `#acquire`, and `#release`
spellings in this historical section are removed in v0.9. The normative v0.9
type, method, element, result, and order catalog is the generated
[atomic matrix](generated-atomic-matrix.md), sourced from
[`atomic-matrix.json`](atomic-matrix.json). Implementations must not accept the
historical spellings below as aliases.

Atomic operations are the language-level primitives for atomic
inter-agent communication. Where `#acquire` and `#release` cover ordered
plain loads and stores, atomic operations cover **read-modify-write** (RMW)
sequences — compare-and-swap, fetch-and-add, exchange, and single-bit
updates — that have no equivalent in the plain-access shape and that
hand-written `ldxr`/`stxr` loops in checked `asm` get wrong with monotonous
regularity.

### When to Use Each Form

| Operation                            | Spelling                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Acquire-load of plain memory         | `#acquire u32@[addr]`                                                              |
| Release-store to plain memory        | `#release u32@[addr] = v`                                                          |
| Relaxed atomic load                  | `%atomic_load(addr, order = relaxed)`                                              |
| Sequentially-consistent atomic load  | `%atomic_load(addr, order = seq_cst)`                                              |
| Relaxed atomic store                 | `%atomic_store(addr, v, order = relaxed)`                                          |
| Sequentially-consistent atomic store | `%atomic_store(addr, v, order = seq_cst)`                                          |
| Compare-and-swap                     | `%cas(addr, exp, new, order = ...)`                                                |
| Fetch-and-add (and -sub, -or, -and, -xor) | `%fetch_add(addr, delta, order = ...)`                                        |
| Exchange                             | `%xchg(addr, val, order = ...)`                                                    |
| Set / clear a single bit             | `%atomic_bit_set(addr, n, order = ...)` / `%atomic_bit_clear(addr, n, order = ...)` |

There is exactly one canonical spelling per (operation, ordering) pair.
Acquire- and release-ordered single-word loads and stores stay in the
directive form; the remaining atomic read-modify-write and relaxed/seq_cst
load-store operations are runtime primitives.

---

### Memory Order Vocabulary

Five orderings are recognized. The order argument is a keyword from this
closed set; no other identifier is accepted:

| Order     | Meaning                                                                                   |
| --------- | ----------------------------------------------------------------------------------------- |
| `relaxed` | Atomic with respect to other agents (no torn values); no inter-access ordering.           |
| `acquire` | Subsequent operations of this agent cannot be hoisted above this one.                     |
| `release` | Preceding operations of this agent cannot be sunk below this one.                         |
| `acqrel`  | Both `acquire` and `release`. Legal on RMW operations only — not on pure loads or stores. |
| `seq_cst` | All `seq_cst` operations across all agents have a single total order.                     |

Legality by operation:

| Operation                                    | Legal orders                                         |
| -------------------------------------------- | ---------------------------------------------------- |
| `%atomic_load`                               | `relaxed`, `seq_cst`                                 |
| `%atomic_store`                              | `relaxed`, `seq_cst`                                 |
| `%cas`, `%fetch_*`, `%xchg`, `%atomic_bit_*` | `relaxed`, `acquire`, `release`, `acqrel`, `seq_cst` |

`%atomic_load` does not accept `acquire` — write `#acquire u32@[addr]`
instead. `%atomic_store` does not accept `release` — write
`#release u32@[addr] = v` instead. The redundant forms are invalid.

---

### Atomic Types

Atomic operations are defined on naturally aligned `u8`, `u16`, `u32`,
`u64`, `i8`, `i16`, `i32`, `i64`, and address types (`@T`, `@volatile T`,
`@mmio T`).
The address argument has element type matching the value type:

<!-- wyst-contract: historical-v0.8 -->
```wyst
counter : u64 = 0
%fetch_add(#addr_of(counter), 1, order = relaxed)
```

For RMW operations on `@volatile T` or `@mmio T`, the volatility of the address
type propagates into the access — the compiler treats the RMW as both volatile
_and_ atomic and emits the appropriate ARM64 instruction without any additional
`@volatile` machinery. `@mmio T` additionally records MMIO intent; the actual
architectural memory type still comes from the runtime mapping.

Floating-point atomics are outside the atomic surface. The 128-bit pair atomics
(`ldxp`/`stxp`, `casp`) are also unavailable in the pinned v0.9 compiler: the
language has no 128-bit value type and those checked-assembly rows are
`known_unsupported`. A later profile must activate their complete resource and
memory contracts before checked `asm` can expose them.

---

### Atomic Load and Store

<!-- wyst-contract: historical-v0.8 -->
```wyst
%atomic_load(addr : @T, order : { relaxed, seq_cst }) -> T
%atomic_store(addr : @T, val : T, order : { relaxed, seq_cst })
```

Relaxed forms exist when the program wants the atomicity guarantee (no
torn read on a misaligned-by-compiler-spill or shared word) but does not
need any inter-access ordering. Sequentially-consistent forms exist for
algorithms that require the global total-order guarantee that
acquire/release alone cannot provide.

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Relaxed read of a shared counter. Atomic at the word level; no ordering
// relative to surrounding code.
n := %atomic_load(counter_addr, order = relaxed)

// seq_cst store. Participates in the total order with all other seq_cst
// operations.
%atomic_store(flag_addr, 1 as.numeric u32, order = seq_cst)
```

---

### Compare-and-Swap

<!-- wyst-contract: historical-v0.8 -->
```wyst
%cas(addr : @T, expected : T, new : T, order : Order) -> (prev : T, ok : bool)
```

Returns a two-element tuple: `prev` is the value that was at `addr`
immediately before the operation, and `ok` is `true` if `prev == expected`
(the swap occurred) or `false` (the swap did not). When `ok` is `false`,
the value at `addr` is unchanged.

ARM64 does not distinguish success and failure orderings — the failure
path performs the load with the same barrier configuration as the success
path. Wyst therefore takes a single `order = ...` argument rather than the
C++/Rust pair. `acqrel` and `seq_cst` `%cas` are RMW orderings; `acquire`
applies to both the read and the write, `release` likewise.

<!-- wyst-contract: historical-v0.8 -->
```wyst
LOCK : @u64 = 0x8000

spin_lock :: () {
  loop {
    _, ok := %cas(LOCK, 0 as.numeric u64, 1 as.numeric u64, order = acquire)
    if ok {
      return
    }
    %wfe()
  }
}

spin_unlock :: () {
  #release u64@[LOCK] = 0
  %sev()
}
```

---

### Fetch-and-Modify

All `%fetch_*` operations and `%xchg` perform the named modify on the
location and return the **prior** value. This matches the ARMv8.1 LSE
instruction semantics (`ldadd`, `ldset`, `ldclr`, `ldeor`, `swp` all
return the previous memory contents; `%fetch_sub` uses `ldadd` with a
negated operand on LSE targets). Returning the prior value is
universal — the new value is always recomputable from `(prev, delta)`,
but the prior value is not recomputable from the new value alone.

<!-- wyst-contract: historical-v0.8 -->
```wyst
%fetch_add(addr : @T, delta : T, order : Order) -> T   // returns old
%fetch_sub(addr : @T, delta : T, order : Order) -> T
%fetch_or(addr : @T,  mask  : T, order : Order) -> T
%fetch_and(addr : @T, mask  : T, order : Order) -> T
%fetch_xor(addr : @T, mask  : T, order : Order) -> T
%xchg(addr : @T,      val   : T, order : Order) -> T
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Reference counting:
prev := %fetch_add(refcount_addr, 1, order = relaxed)

// Lock-free flag union (set bits 3 and 5 atomically):
%fetch_or(flags_addr, (1 << 3) | (1 << 5), order = acqrel)

// Take the previous head of a singly-linked list and replace it with NEW:
old_head := %xchg(head_addr, new_head, order = acqrel)
```

---

### Atomic Bit Operations

Single-bit atomic operations are a frequent enough kernel idiom to warrant
their own intrinsics — `%fetch_or(addr, 1 << n, ...)` works but obscures
intent and forces the compiler through a fetch_or-shaped lowering when LSE
provides `ldset`/`ldclr` directly.

<!-- wyst-contract: historical-v0.8 -->
```wyst
%atomic_bit_set(addr : @T,   bit : u32, order : Order) -> bool   // returns prior bit
%atomic_bit_clear(addr : @T, bit : u32, order : Order) -> bool   // returns prior bit
```

`bit` is the bit index, `0` being the least significant. The result is the
value of that bit _before_ the operation. `bit` must be a compile-time
constant less than `8 * #size_of(T)`; out-of-range is a compile error.

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Test-and-set the lock bit:
was_locked := %atomic_bit_set(status_addr, 0, order = acquire)
if was_locked == false {
    // we own the lock
}
```

---

### ARM64 Lowering

The reference lowering targets ARMv8.0-A (the language baseline). With
`features = lse` declared on the `#target` (see [chapter-04-modules.md](chapter-04-modules.md)), the compiler
emits the corresponding LSE single-instruction forms instead.

| Intrinsic           | Order   | ARMv8.0 (baseline)                          | ARMv8.1 LSE              |
| ------------------- | ------- | ------------------------------------------- | ------------------------ |
| `%atomic_load`      | relaxed | `ldr`                                       | `ldr`                    |
| `%atomic_load`      | seq_cst | `ldar`                                      | `ldar`                   |
| `%atomic_store`     | relaxed | `str`                                       | `str`                    |
| `%atomic_store`     | seq_cst | `stlr`                                      | `stlr`                   |
| `%cas`              | relaxed | `ldxr` / cmp / b.ne / `stxr` / cbnz loop    | `cas`                    |
| `%cas`              | acquire | `ldaxr` / cmp / b.ne / `stxr` / cbnz loop   | `casa`                   |
| `%cas`              | release | `ldxr` / cmp / b.ne / `stlxr` / cbnz loop   | `casl`                   |
| `%cas`              | acqrel  | `ldaxr` / cmp / b.ne / `stlxr` / cbnz loop  | `casal`                  |
| `%cas`              | seq_cst | `ldaxr` / cmp / b.ne / `stlxr` / cbnz loop  | `casal`                  |
| `%fetch_add`        | acqrel  | `ldaxr` / add / `stlxr` / cbnz loop         | `ldaddal`                |
| `%fetch_sub`        | acqrel  | `ldaxr` / sub / `stlxr` / cbnz loop         | `neg` + `ldaddal`        |
| `%fetch_or`         | acqrel  | `ldaxr` / orr / `stlxr` / cbnz loop         | `ldsetal`                |
| `%fetch_and`        | acqrel  | `ldaxr` / and / `stlxr` / cbnz loop         | `ldclral` (negated mask) |
| `%fetch_xor`        | acqrel  | `ldaxr` / eor / `stlxr` / cbnz loop         | `ldeoral`                |
| `%xchg`             | acqrel  | `ldaxr` / `stlxr` / cbnz loop               | `swpal`                  |
| `%atomic_bit_set`   | acqrel  | `ldaxr` / orr (#1<<n) / `stlxr` / cbnz loop | `ldsetal` (1-bit mask)   |
| `%atomic_bit_clear` | acqrel  | `ldaxr` / and / `stlxr` / cbnz loop         | `ldclral` (1-bit mask)   |

For non-`acqrel` RMW orderings under LSE, the appropriate `a`/`l`-suffix
variant is selected:

- `relaxed` → no suffix (`ldadd`, `ldset`, `swp`)
- `acquire` → `a` suffix (`ldadda`, `ldseta`, `swpa`)
- `release` → `l` suffix (`ldaddl`, `ldsetl`, `swpl`)
- `acqrel` and `seq_cst` → `al` suffix (`ldaddal`, `ldsetal`, `swpal`)

The baseline exclusive-load/store lowering retries until the primitive's
operation completes. The generated inner loop has no internal attempt counter,
retry budget, timeout path, or synthetic "gave up" result. For `%cas`, an
observed comparison mismatch is the ordinary `(prev, false)` result; a
store-exclusive failure is not user-visible and branches back to the exclusive
load. For `%fetch_*`, `%xchg`, and `%atomic_bit_*`, every store-exclusive
failure similarly branches back to the exclusive load until the store succeeds.

This is an operation-correctness contract, not a wait-free or lock-free
progress guarantee. A non-LSE loop may retry indefinitely under hostile
contention, interrupts, or implementation-defined exclusive-monitor loss; Wyst
does not promise that one agent completes in a bounded number of steps, nor
does it promise a global lock-free progress property for all contending agents.
Target architecture forward-progress rules apply only under their documented
conditions. The compiler does not insert explicit backoff. If a user requires
backoff, they write it around the primitive with `%yield()`, `%wfe()`, or a
source-level algorithmic retry policy.

Wyst does not silently replace non-LSE atomic RMW operations with fallback
locks or runtime helpers. If a future target or mode introduces lock-based or
runtime-assisted atomics, that assistance must be explicit in the operation's
effects, generated storage, and lowering reports rather than hidden behind the
same infallible primitive surface.

---

### Interaction with the Memory Model

Atomic operations participate in the happens-before relation described in
[chapter-09-memory-model.md](chapter-09-memory-model.md) on
the same footing as `#acquire`/`#release` directives:

- A `release`-ordered atomic write to address X synchronizes-with any
  subsequent `acquire`-ordered atomic read of X (or any acquire-ordered
  RMW on X) that observes its value, by the same synchronizes-with rule as
  `#release`/`#acquire`.
- `acqrel` RMW operations are both the release-side and the acquire-side
  of a synchronizes-with edge — they participate as either party.
- `seq_cst` operations participate in synchronizes-with according to their
  load/store/RMW side, _and_ are totally ordered with all other `seq_cst`
  operations across all locations by the global SC order.
- `relaxed` operations contribute no synchronizes-with edges. They
  guarantee single-copy atomicity at the access only.

The reordering table in [chapter-09-memory-model.md §9.4](chapter-09-memory-model.md) applies unchanged: an atomic access of order
O is treated as a memory operation of the corresponding row/column.

---

### Design Rationale

| Choice                                                 | Reason                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intrinsics for RMW; directives for ordered load/store  | Mirrors the language's existing modifier pattern for plain accesses (`@volatile T`, `@mmio T`, `#acquire`/`#release`). RMW has no plain-access equivalent so it gets a call form.                       |
| One canonical spelling per (op, order)                 | Single form to learn; single form to grep; no documentation drift between "two ways to do the same thing."                                                                                   |
| Labeled `order = ...` argument                         | Closed set of five orderings — naming each variant separately would balloon to ~30 intrinsics.                                                                                               |
| Single `order = ...` on `%cas` (no failure order)      | ARM64 hardware cannot distinguish; C++/Rust two-argument form is always lowered with the failure order widened to match success on ARM. The redundant parameter is a footgun, not a feature. |
| `%cas` returns `(prev, ok)`                            | Caller can branch on `ok` and inspect the racing value without a second load. Matches C11 `atomic_compare_exchange_strong`.                                                                  |
| All `%fetch_*` and `%xchg` return prior value          | Matches LSE instruction semantics directly. Returning the prior value is universal — the new value is recomputable from `(prev, delta)`, but not vice versa.                                 |
| `%atomic_bit_set` / `%atomic_bit_clear` as first-class | Single-bit RMW is frequent enough (flags, locks, ref-count bits) and LSE has dedicated `ldset`/`ldclr` — a generic `%fetch_or` would obscure intent and possibly miss the LSE lowering.      |
| LSE selected per-target, not per-call                  | The LL/SC vs LSE choice is a CPU capability, not an algorithmic choice. Per-call opt-in would force every site to answer "what if LSE isn't available?"                                      |
| Non-LSE retry loops do not expose internal failure     | The public primitive surface has no fallible result type for store-exclusive retry exhaustion, so the lowered loop must retry until the operation completes instead of silently returning a partial or invented result. |
| Progress guarantees are separate from atomicity        | Atomic RMW correctness says each completed operation is indivisible and returns the specified value. It does not promise wait-freedom or hidden lock-free progress under contention.          |
| No hidden fallback locks or helpers                    | Hidden locks would add synchronization effects and storage that kernel code must be able to audit. Any future fallback mechanism has to appear in effects, storage, and lowering reports.     |
| Floating-point and 128-bit atomics excluded            | No language type for 128-bit; FP atomics are rare in kernel code and easily emulated via `%cas` on the bit pattern.                                                                          |

---

## 1.3.3 Hardware Register Declarations and Access (v0.9 Normative Declarations)

The declaration, snapshot, field-policy, and compiler-owned method surface
through **System Register Declarations** below is current selected snapshot. The later
prefix-`%` register-call subsections are an explicitly labeled v0.8 snapshot;
selected snapshot uses the declared receiver methods described in the normative operation
surface above.

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
come exclusively from the normalized A64 authority, active support manifest,
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
Unknown or unnamed tuples are rejected. The predecessor generic encoded
read/write primitive rows are unavailable in selected snapshot; there is no raw encoding
escape.

Each system-register read, write, and complete modify is a full two-way
compiler-memory fence. No operation implies or emits `dmb`, `dsb`, or `isb`;
architecture-required sequencing remains an explicit source operation. Reports
distinguish the compiler-only fence from any emitted architectural barrier and
distinguish snapshot reads, raw writes, named writes, and complete modifies.
There are no register-specific weak-order exceptions.

### Named System Register Runtime Primitives (Historical v0.8 `%` Surface)

This subsection and its register-namespace, DAIF, examples, lowering, and
rationale subsections preserve the v0.8 `%mrs`/`%msr` contract only. v0.9 has
no generic raw system-register call: a declared register uses `.read().raw`,
`.write(value)`, or its field-aware `.modify(...)` method.

The distinct named `%mrs` / `%msr` runtime primitives remain defined in the
current language. Their accepted register names and semantics use the same
generated authority as declarations; they are not aliases for a declaration and
do not provide an encoded-register escape. Registers absent from the catalog and
noncanonical case variants are rejected. Each named register has exactly one
canonical spelling, and diagnostics for case-only variants name that spelling.

ARM64 system registers (TCR_ELx, SCTLR_ELx, VBAR_ELx, TTBR0_ELx, MAIR_ELx,
etc.) are the primary configuration surface for the CPU. Every non-trivial
kernel reads and writes them constantly. Wyst provides direct intrinsics for
system-register access, eliminating repetitive checked-assembly `mrs`/`msr`
blocks that would otherwise dominate early-boot and trap-handling code.

<!-- wyst-contract: historical-v0.8 -->
```wyst
%mrs(reg) -> u64                  // read system register
%msr(reg, val : u64)              // write system register
```

`reg` is a system register _name_, not an expression. It must appear as a
bare identifier directly in the `%mrs`/`%msr` argument position. The
compiler resolves the name against the architectural system register
table (see appendix); an unknown name is a compile error.

---

### Register Name Namespace

System register names occupy a dedicated namespace recognized **only** in
the `%mrs` / `%msr` argument position. They cannot
appear in expression position, are not values, and cannot be assigned to
variables.

This means a register name may collide with a same-named bitstruct type
(e.g. `TCR_EL1` is both an architectural register and a conventional
bitstruct type declaration) without ambiguity — the syntactic positions
are disjoint:

<!-- wyst-contract: historical-v0.8 -->
```wyst
bitstruct TCR_EL1: u64 { ... }      // TCR_EL1 is a type here

const raw: u64 = %mrs(TCR_EL1)       // TCR_EL1 is a register name here
const tcr: TCR_EL1 = bitcast<TCR_EL1>(raw)
```

Register names use the exact canonical table spelling. Most names use
uppercase architectural spelling such as `SCTLR_EL1`; architectural mixed-case
names such as `CurrentEL` and `SPSel` keep that spelling. Formatting preserves
accepted canonical names, diagnostics reject other case variants, and editor
completion only suggests canonical names.

---

### Access Permissions

The generated system-register authority encodes each register's access permissions.
Wyst rejects illegal accesses:

| Register kind                               | `%mrs(reg)`                                        | `%msr(reg, v)`    |
| ------------------------------------------- | -------------------------------------------------- | ----------------- |
| Read-write (e.g. `TCR_EL1`)                 | allowed                                            | allowed           |
| Read-only (e.g. `DCZID_EL0`, `CurrentEL`)   | allowed                                            | **compile error** |
| Write-only (e.g. `dczva` operands)          | **compile error**                                  | allowed           |
| Privileged at higher EL than current target | **compile error** unless `#target` declares the EL |

Permissions also depend on Exception Level. Reading `VBAR_EL2` from code
running at EL1 traps at runtime; the compiler additionally rejects this
statically when the target declares EL1 as its execution level.

---

### Return Type Discipline

`%mrs` always returns `u64` — the raw register width as the ARM64
architecture defines it. The caller converts to a bitstruct via the
exact-backing `bitcast` conversion (see [chapter-06-types.md §1.6.1](chapter-06-types.md)):

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Read TCR_EL1, modify a field, write it back:
const raw: u64 = %mrs(TCR_EL1)
var tcr: TCR_EL1 = bitcast<TCR_EL1>(raw)
tcr.T0SZ = 25
tcr.T1SZ = 25
%msr(TCR_EL1, bitcast<u64>(tcr))
%isb()                                 // required when the write affects translation
```

Returning a bitstruct-typed value implicitly would couple the
sysreg-lookup table to the type-name lookup table — a register's intrinsic
return type would depend on whether a same-named bitstruct type happens to
be in scope. The explicit `bitcast` is one extra operation per access and matches
the strict typing discipline established in [chapter-06-types.md §1.4.1](chapter-06-types.md).

The 32-bit-encoded system registers (e.g. `FPCR`, `FPSR` on some
encodings) are zero-extended on `%mrs` and have their upper 32 bits
ignored on `%msr`. The intrinsic interface is uniformly 64-bit.

---

### No Implicit Synchronization

`%msr` does not emit `isb`, `dsb`, or any other barrier. Writes to
fetch-affecting registers (`SCTLR_ELx`, `VBAR_ELx`, `TCR_ELx`,
`TTBR0_ELx`, `MAIR_ELx`, etc.) require an explicit `%isb()`
before the new value takes effect for instruction fetch. Writes to
translation-affecting registers require explicit `%dsb` + `%tlbi` +
`%dsb` + `%isb()` (the canonical ARM synchronization sequence).

The compiler will not silently insert a barrier the programmer did not
write. Treat every `%msr` as a register-write only; emit the
synchronization sequence the architecture documents for that register.

---

### DAIF Manipulation

`DAIFSet` and `DAIFClr` are special — they take a 4-bit immediate (a
bitmask of `D`/`A`/`I`/`F` interrupt categories) rather than a register
value. They get their own intrinsics:

<!-- wyst-contract: historical-v0.8 -->
```wyst
%daif_set(mask : u4)              // mask interrupts
%daif_clr(mask : u4)              // unmask interrupts
```

`mask` must be a compile-time constant in range `0..=15`. The bit
positions follow ARM ARM convention:

| Bit | Symbol | Meaning        |
| --- | ------ | -------------- |
| 0   | F      | FIQ            |
| 1   | I      | IRQ            |
| 2   | A      | SError (abort) |
| 3   | D      | Debug          |

<!-- wyst-contract: historical-v0.8 -->
```wyst
%daif_set(0b0010)    // mask IRQs
// ... critical section ...
%daif_clr(0b0010)    // unmask IRQs
```

The full `DAIF` register (containing the current mask state) is read and
written via the regular `%mrs(DAIF)` / `%msr(DAIF, val)` intrinsics. The
`%daif_set` / `%daif_clr` forms specifically lower to the immediate-form
`msr daifset, #imm` / `msr daifclr, #imm` instructions.

---

### Implementation-Defined Registers

Implementation-defined registers are available only through an authenticated
target-extension row and the `system_register ... at S...` declaration above.
The predecessor generic encoded `%mrs_s` and `%msr_s` calls are rejected. An
unknown tuple, even one whose fields fit the architectural bit widths, never
creates authority for an instruction.

---

### Worked Examples

#### Read-modify-write of a configuration register

<!-- wyst-contract: historical-v0.8 -->
```wyst
configure_tcr :: () {
  raw := %mrs(TCR_EL1)
  tcr := raw as.bits TCR_EL1
  tcr.t0sz = 25 // 39-bit virtual addresses
  tcr.t1sz = 25
  tcr.tg0 = 0 // 4KB granule
  tcr.tg1 = 2 // 4KB granule
  %msr(TCR_EL1, tcr as.bits u64)
  %isb()
}
```

#### VBAR install

<!-- wyst-contract: historical-v0.8 -->
```wyst
install_vectors :: () {
  %msr(VBAR_EL1, #addr_of(el1_vectors) as.address u64)
  %isb()
}
```

#### SCTLR cache enable

<!-- wyst-contract: historical-v0.8 -->
```wyst
enable_caches :: () {
  raw := %mrs(SCTLR_EL1)
  sctlr := raw as.bits SCTLR_EL1
  sctlr.c = 1 // data cache enable
  sctlr.i = 1 // instruction cache enable
  sctlr.m = 1 // MMU enable
  %msr(SCTLR_EL1, sctlr as.bits u64)
  %isb()
}
```

#### Critical section with DAIF masking

<!-- wyst-contract: historical-v0.8 -->
```wyst
update_shared :: () {
  %daif_set(0b0010) // mask IRQ
  shared_word += 1
  %daif_clr(0b0010) // unmask IRQ
}
```

---

### ARM64 Lowering

| Intrinsic              | Lowering                            |
| ---------------------- | ----------------------------------- |
| `%mrs(reg)`            | `mrs xN, reg`                       |
| `%msr(reg, val)`       | `msr reg, xN`                       |
| `%daif_set(mask)`      | `msr daifset, #mask`                |
| `%daif_clr(mask)`      | `msr daifclr, #mask`                |

`%mrs` and `%msr` are full two-way compiler memory fences. The compiler
treats system-register access as opaque-effect: no plain access, atomic,
or barrier may be reordered across it. This matches the architectural
reality that system-register state can affect arbitrary subsequent
behavior (translation, exception handling, cache behavior).

---

### Named Register Set

The named primitives and catalog-named declarations accept exactly the active
system-register identities assigned to their compiler surface by the generated
A64 support manifest. The normalized architecture authority and selected
authenticated extensions are the only register set. Documentation, completion,
diagnostics, reports, and lowering consume that generated set; this chapter does
not maintain an illustrative or fallback register table.

---

### Design Rationale

| Choice                                               | Reason                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bare identifier register names                       | One-to-one with ARM ARM mnemonics. No string quoting overhead. No `@`-prefix collision with intrinsic identifiers.                                                                    |
| Dedicated namespace recognized only in `%mrs`/`%msr` | Allows a register's bitstruct type to share its name without ambiguity (`TCR_EL1` is both a type and a register name).                                                                |
| Always-`u64` return type                             | No coupling between sysreg table and type-name lookup. Explicit `as` matches §1.4.1 strict typing.                                                                                    |
| Read-only / write-only enforced at compile time      | Eliminates a class of checked-`asm` mistakes that previously could only be caught at runtime by a synchronous abort.                                                                  |
| No implicit `isb` or barriers                        | The architecture defines distinct synchronization sequences per register (`isb` after `sctlr`, `dsb`+`isb` after `ttbr`/`tlbi`); the compiler cannot pick the right one mechanically. |
| Separate `%daif_set` / `%daif_clr`                   | These take immediates, not register values. Folding them into generic `%msr` would lie about the operand type.                                                                        |
| Authenticated encoded declaration for implementation-defined registers | Real silicon needs vendor registers, but a selected extension must provide identity, semantics, availability, and conformance evidence before the compiler emits the encoding. |
| Full two-way compiler fence on every access          | System-register writes can change translation, exception routing, cache behavior, etc. Treating them as opaque-effect is the only safe default.                                       |

---

## 1.3.4 Trap and Exception Intrinsics (Historical v0.8 `%` Surface; Non-Normative)

Synchronous exceptions are the boundary between EL0 user code and EL1
kernel code, between EL1 kernel and EL2 hypervisor, and between
non-secure and secure worlds. Every system call, every hypervisor call,
every monitor call, every brk-trap debugger interaction lowers to one of
the six ARM64 trap instructions. Wyst provides direct intrinsics for each
so trap-call sites are not stuck in checked `asm`.

<!-- wyst-contract: historical-v0.8 -->
```wyst
%svc(imm : u16)                  // supervisor call — to EL1
%hvc(imm : u16)                  // hypervisor call — to EL2
%smc(imm : u16)                  // secure monitor call — to EL3 (or trapped to EL2)
%brk(imm : u16)                  // software breakpoint — synchronous abort
%hlt(imm : u16)                  // halt — debug halting
%eret()                          // exception return
```

`imm` must be a compile-time constant in the range `0..=65535`; out-of-
range or non-constant immediates are a compile error.

---

### Operand and Clobber Model

Each trap intrinsic is the architectural primitive only — no syscall ABI
is baked in. The caller is responsible for marshaling arguments into and
results out of registers using `#pin` (see [chapter-08-functions.md §2.3](chapter-08-functions.md)):

<!-- wyst-contract: historical-v0.8 -->
```wyst
linux_write :: (fd : u64 #pin(x0), buf : @u8 #pin(x1), len : u64 #pin(x2)) -> u64 #pin(x0) {
  nr : u64 #pin(x8) = 64 // Linux __NR_write
  %svc(0)
  return // x0 holds the syscall return
}
```

The intrinsic itself acts as a full two-way compiler memory fence (no
load, store, atomic, or barrier may reorder across it) and clobbers all
AAPCS caller-saved general-purpose registers (x0–x17) and the procedure
link register (x30). Callee-saved registers (x19–x28) are preserved.

`#pin`'d locals are preserved across the trap **if and only if** the
register they pin is callee-saved (x19–x28). Pinning a caller-saved
register (x0–x17) across `%svc`/`%hvc`/`%smc` is legal — the value at
entry is delivered to the handler and the value at exit is whatever the
handler writes — but the variable's identity persists through the trap
only via the convention the handler agrees to. This is exactly how
syscall ABIs work: x0 going into `%svc` is the first argument; x0 coming
out is the result.

If the platform preserves more registers than this conservative intrinsic
contract, the pinned v0.9 compiler still applies the contract above. A future
checked-assembly profile may expose the trap row with fixed signature placements
and an authenticated callable boundary; until then, checked `svc`/`hvc`/`smc`
source forms are rejected rather than narrowed by a manual clobber list.

---

### Exception Level Gating

Trap intrinsics are gated against the `#target`-declared Exception Level:

| Intrinsic | Legal at EL   | Notes                                                      |
| --------- | ------------- | ---------------------------------------------------------- |
| `%svc`    | EL0, EL1, EL2 | targets EL1 from EL0, EL2 from EL1, etc.                   |
| `%hvc`    | EL1, EL2      | compile error at EL0; UNDEFINED if HCR_EL2.HCD=1 (runtime) |
| `%smc`    | EL1, EL2, EL3 | compile error at EL0; may be trapped to EL2                |
| `%brk`    | any           |                                                            |
| `%hlt`    | any           | requires debugger to be attached at runtime                |
| `%eret`   | EL1, EL2, EL3 | compile error at EL0 (EL0 has no exception link register)  |

If `#target` does not declare an EL, the compiler assumes EL1 and emits
all intrinsics that are legal at EL1.

---

### `%eret` Semantics

`%eret` is `#noreturn`. Control transfers to the address in `ELR_ELx`
with status `SPSR_ELx`, where `x` is the current EL. The compiler treats
the enclosing function as `#noreturn`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#noreturn
return_to_el0 :: (target_pc : u64, target_sp : u64, spsr : u64) {
  %msr(ELR_EL1, target_pc)
  %msr(SP_EL0, target_sp)
  %msr(SPSR_EL1, spsr)
  %eret()
}
```

The function does not need an explicit `#noreturn` attribute if the
compiler can prove that every control path ends in `%eret()` (or another
`#noreturn` runtime primitive), but writing it makes the intent unambiguous.

`%eret()` does not take operands: `elr` and `spsr` must be configured via
`%msr` before the primitive. This matches the ARM ARM exactly and avoids
hiding two `msr` instructions inside a single primitive call.

In canonical v0.9 IR, `%eret()` is the last value in its block and is followed
only by an `unreachable` terminator. Before emitting the architectural `eret`,
non-`naked` ARM64 lowering restores all compiler-owned saved registers and
dismantles its frame without appending `ret`; `naked` lowering emits no
compiler-owned epilogue.

---

### Worked Examples

#### Linux syscall shim

<!-- wyst-contract: historical-v0.8 -->
```wyst
linux_syscall :: (nr : u64 #pin(x8), a0 : u64 #pin(x0), a1 : u64 #pin(x1), a2 : u64 #pin(x2)) -> u64 #pin(x0) {
  %svc(0)
  return
}
```

#### Software breakpoint with code

<!-- wyst-contract: historical-v0.8 -->
```wyst
debug_trap :: () {
  %brk(0xDEAD) // attach a debugger to inspect
}
```

#### PSCI CPU_OFF call (EL1 → EL3 via HVC if virtualized, SMC if firmware)

<!-- wyst-contract: historical-v0.8 -->
```wyst
#noreturn
psci_cpu_off :: () {
  func_id : u32 #pin(x0) = 0x8400_0002 // PSCI_CPU_OFF
  %hvc(0)
  loop {
    %wfe()
  } // fallback if firmware returns from CPU_OFF
}
```

#### Exception return to userspace

<!-- wyst-contract: historical-v0.8 -->
```wyst
#noreturn
return_to_user :: (pc : u64, user_sp : u64) {
  %msr(ELR_EL1, pc)
  %msr(SP_EL0, user_sp)
  %msr(SPSR_EL1, 0x0) // EL0t, all interrupts unmasked
  %eret()
}
```

---

### ARM64 Lowering

| Intrinsic   | Lowering   | Clobbers (default)                       |
| ----------- | ---------- | ---------------------------------------- |
| `%svc(imm)` | `svc #imm` | x0–x17, x30, memory, cc                  |
| `%hvc(imm)` | `hvc #imm` | x0–x17, x30, memory, cc                  |
| `%smc(imm)` | `smc #imm` | x0–x17, x30, memory, cc                  |
| `%brk(imm)` | `brk #imm` | full fence; debugger may modify anything |
| `%hlt(imm)` | `hlt #imm` | full fence; debugger may modify anything |
| `%eret`     | `eret`     | terminates control flow (`#noreturn`)    |

The compiler emits no implicit barriers before or after a trap intrinsic.
If the handler's effects depend on prior stores being globally observed,
the caller emits `%dsb` before the trap.

---

### Design Rationale

| Choice                                | Reason                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architectural-only (no syscall ABI)   | Different OSes use different syscall conventions; baking one in (Linux x8/x0–x5, BSD x16/x0–x7, custom kernel) would tie the language to a platform. The `#pin`-based wrapper pattern composes cleanly. |
| Compile-time immediate                | `svc`/`brk` immediates are part of the instruction encoding. Runtime values cannot select an encoding; checked-assembly immediates are compile-time constants too.                                    |
| AAPCS caller-saved clobber by default | Matches what GCC/Clang emit for plain `asm("svc #0")`. Conservative; OS-specific handlers preserving more can be wrapped.                                                                               |
| `%eret` operand-less                  | ARM ARM matches; users see exactly which `%msr` calls set up the return state. Hiding them inside `%eret` would obscure the elr/spsr configuration.                                                     |
| `%eret` is `#noreturn`                | Eliminates a class of "fell through `%eret`" bugs where the compiler thinks control continues. Composes with the function-attribute system.                                                             |
| EL gating at compile time             | Many trap misuses (HVC from EL0, ERET from EL0) are statically detectable. Catching them at compile time beats a runtime synchronous abort with no source location.                                     |
| `%hlt` included                       | Debugger / semihosting interfaces use HLT; it's part of the trap-family surface even though kernel code rarely uses it directly.                                                                        |

---

## 1.3.5 Cache and TLB Maintenance Intrinsics (Historical v0.8 `%` Surface; Non-Normative)

Bringing up an MMU, mapping a new page, modifying executable code,
managing DMA-coherent buffers — all require explicit cache and TLB
maintenance on ARM64. Wyst provides one intrinsic per architectural
maintenance instruction; the canonical synchronization sequences are
documented as worked examples rather than hidden inside the intrinsics.

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Data cache by virtual address (to Point of Coherency unless noted):
%dc_cvac(addr  : u64)            // clean
%dc_civac(addr : u64)            // clean + invalidate
%dc_ivac(addr  : u64)            // invalidate (kernel-only)
%dc_cvau(addr  : u64)            // clean to Point of Unification
%dc_zva(addr   : u64)            // zero one DC ZVA block (alignment required)
%dczid_block_size() -> u64       // runtime DC ZVA block size, or 0 when prohibited

// Instruction cache:
%ic_iallu()                      // invalidate all, local PE
%ic_ialluis()                    // invalidate all, inner shareable broadcast
%ic_ivau(addr : u64)             // invalidate by VA to PoU

// TLB invalidation (EL1 variants — EL2 / EL3 forms are also defined):
%tlbi_vmalle1()                  // all entries for current VMID, local
%tlbi_vmalle1is()                // same, inner-shareable broadcast
%tlbi_alle1()                    // all entries (any ASID/VMID), local
%tlbi_alle1is()                  // same, inner-shareable broadcast
%tlbi_aside1(asid : u16)         // by ASID, local
%tlbi_aside1is(asid : u16)       // by ASID, inner-shareable broadcast
%tlbi_vae1(va    : u64)          // by VA, current ASID, local
%tlbi_vae1is(va  : u64)          // by VA, current ASID, inner-shareable broadcast
%tlbi_vaae1(va   : u64)          // by VA, any ASID, local
%tlbi_vaae1is(va : u64)          // by VA, any ASID, inner-shareable broadcast
%tlbi_vale1(va   : u64)          // by VA, leaf only, current ASID, local
%tlbi_vale1is(va : u64)          // by VA, leaf only, current ASID, IS

// EL2 stage-1 TLB invalidation:
%tlbi_alle2()                    // all EL2 stage-1 entries, local
%tlbi_alle2is()                  // same, inner-shareable broadcast
%tlbi_vae2(va    : u64)          // by VA, EL2 stage-1, local
%tlbi_vae2is(va  : u64)          // by VA, EL2 stage-1, inner-shareable broadcast
%tlbi_vale2(va   : u64)          // by VA, EL2 stage-1 leaf only, local
%tlbi_vale2is(va : u64)          // by VA, EL2 stage-1 leaf only, IS

// EL2 stage-2 and combined stage-1+2 invalidation:
%tlbi_ipas2e1(ipa    : u64)      // by IPA, stage-2, local
%tlbi_ipas2e1is(ipa  : u64)      // by IPA, stage-2, inner-shareable broadcast
%tlbi_ipas2le1(ipa   : u64)      // by IPA, stage-2 leaf only, local
%tlbi_ipas2le1is(ipa : u64)      // by IPA, stage-2 leaf only, IS
%tlbi_vmalls12e1()               // all stage-1+2 entries for current VMID, local
%tlbi_vmalls12e1is()             // same, inner-shareable broadcast

// EL3 stage-1 TLB invalidation:
%tlbi_alle3()                    // all EL3 stage-1 entries, local
%tlbi_alle3is()                  // same, inner-shareable broadcast
%tlbi_vae3(va    : u64)          // by VA, EL3 stage-1, local
%tlbi_vae3is(va  : u64)          // by VA, EL3 stage-1, inner-shareable broadcast
%tlbi_vale3(va   : u64)          // by VA, EL3 stage-1 leaf only, local
%tlbi_vale3is(va : u64)          // by VA, EL3 stage-1 leaf only, IS
```

The EL2 and EL2 stage-2 TLB intrinsics are available when
`#target(... el = 2)` or higher is declared. The EL3 TLB intrinsics
require `#target(... el = 3)`. Wyst spellings follow the ARM TLBI
mnemonic exactly after the `%tlbi_` prefix; there are no generic
`*_el2` or `*_el3` aliases.

**Effect categories:** `%dc_*` and `%ic_*` intrinsics introduce
`cache_maintenance`; `%tlbi_*` intrinsics introduce `tlb_maintenance`;
`%dczid_block_size()` introduces `sysreg`.
This split lets driver code permit cache-line maintenance for DMA while still
denying address-translation invalidation.

---

### No Implicit Barriers

Every intrinsic emits exactly its single ARM instruction. No `dsb`,
`isb`, or surrounding fence is inserted. The caller is responsible for
the architectural synchronization sequence.

The cache/TLB ops are nonetheless **full two-way compiler memory fences**
(no load, store, atomic, or barrier may reorder across them). A `%tlbi`
changes the meaning of every subsequent address translation; a
`%dc_civac` changes what every subsequent load can observe. The compiler
treats both categories as opaque effects.

---

### Canonical Synchronization Sequences

The patterns below are the standard ARM ARM sequences for the common
maintenance operations.

#### Invalidate a TLB entry after a page-table update

<!-- wyst-contract: historical-v0.8 -->
```wyst
invalidate_va :: (va : u64) {
  %dsb(ishst) // wait for prior page-table store to be observable
  %tlbi_vaae1is(va) // broadcast invalidation to all PEs
  %dsb(ish) // wait for the invalidation to complete everywhere
  %isb() // local pipeline sync
}
```

#### Flush a single cache line back to memory (for DMA-out)

<!-- wyst-contract: historical-v0.8 -->
```wyst
flush_for_dma :: (addr : u64) {
  %dc_cvac(addr)
  %dsb(sy) // wait until the clean reaches the PoC and the DMA device
}
```

#### Invalidate before a DMA-in read

<!-- wyst-contract: historical-v0.8 -->
```wyst
prepare_dma_in :: (addr : u64) {
  %dc_civac(addr) // ensure no stale cached value shadows the DMA write
  %dsb(sy)
}
```

#### DMA Cache Release Recipe

This is an executable recipe for the two
cache-maintenance edges most kernel DMA paths need. It runs on QEMU
`virt` and uses a CPU-side device simulator so the build and UART signal
are deterministic; it proves the emitted instruction sequence and source
ordering, not the electrical behavior of a physical DMA controller.

The recipe keeps each buffer in one explicitly aligned cache line:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#align(0x40)
dma_tx_line : [8]u64 = 0
#align(0x40)
dma_rx_line : [8]u64 = 0
```

CPU-to-device handoff:

1. CPU writes the transmit buffer with ordinary stores.
2. CPU runs `%dc_cvac(#addr_of(dma_tx_line))`.
3. CPU runs `%dsb(sy)` before ringing the device doorbell.

Device-to-CPU handoff:

1. CPU prepares the receive buffer with `%dc_civac(#addr_of(dma_rx_line))`
   and `%dsb(sy)` before the simulated device writes it.
2. CPU observes the completion word through a volatile or MMIO-intent address.
3. CPU runs `%dc_civac(#addr_of(dma_rx_line))` and `%dsb(sy)` before
   reading the receive buffer.

The recipe emits `DMA ok\n` over PL011 UART only after the
checked transmit words and receive words match. The cache operations and
barriers are deliberately in Wyst source; the compiler does not infer DMA
ownership, insert hidden cache maintenance, or synthesize barriers around
volatile accesses.

#### Synchronize newly written instructions (self-modifying code)

<!-- wyst-contract: historical-v0.8 -->
```wyst
sync_icache :: (addr : u64) {
  %dc_cvau(addr) // clean D-cache line to PoU
  %dsb(ish)
  %ic_ivau(addr) // invalidate I-cache line at the same VA
  %dsb(ish)
  %isb()
}
```

#### Initial MMU bring-up: invalidate all TLBs

<!-- wyst-contract: historical-v0.8 -->
```wyst
flush_tlb_all :: () {
  %dsb(ishst)
  %tlbi_vmalle1()
  %dsb(ish)
  %isb()
}
```

---

### `%dc_zva` Alignment

`%dc_zva(addr)` zeroes a single DC ZVA block. The address must be aligned
to the block size reported by `DCZID_EL0`. Misaligned addresses produce a
fault. The block size is implementation-defined and may differ from the
compile-time cache-line width used for layout by `#cache_line_width()`.

Wyst exposes the runtime query as `%dczid_block_size() -> u64`. The
primitive reads `DCZID_EL0`, returns `4 << BS` bytes for `BS = DCZID_EL0[3:0]`,
and returns `0` when `DCZID_EL0.DZP` reports that `dc zva` is prohibited.
It has the `sysreg` effect category and is a full two-way compiler memory
fence. It emits no cache maintenance and no architectural barrier; callers
still write `%dc_zva` loops and synchronization explicitly.

<!-- wyst-contract: historical-v0.8 -->
```wyst
zero_page :: (page_base : u64) {
  n : u64 = 4096
  addr := page_base
  line := %dczid_block_size()
  end := page_base + n
  if line == 0 {
    return
  }
  while addr < end {
    %dc_zva(addr)
    addr += line
  }
  %dsb(ish)
}
```

---

### ARM64 Lowering

| Intrinsic       | Lowering          | Compiler fence | Notes                         |
| --------------- | ----------------- | -------------- | ----------------------------- |
| `%dc_cvac(a)`   | `dc cvac, xN`     | two-way        | clean to PoC                  |
| `%dc_civac(a)`  | `dc civac, xN`    | two-way        | clean + invalidate to PoC     |
| `%dc_ivac(a)`   | `dc ivac, xN`     | two-way        | EL1+ only; UNDEFINED at EL0   |
| `%dc_cvau(a)`   | `dc cvau, xN`     | two-way        | clean to PoU                  |
| `%dc_zva(a)`    | `dc zva, xN`      | two-way        | ZVA-block-aligned address required |
| `%dczid_block_size()` | `mrs xN, DCZID_EL0` + bit extraction | two-way | returns bytes, or 0 when prohibited |
| `%ic_iallu()`   | `ic iallu`        | two-way        |                               |
| `%ic_ialluis()` | `ic ialluis`      | two-way        | inner-shareable broadcast     |
| `%ic_ivau(a)`   | `ic ivau, xN`     | two-way        |                               |
| `%tlbi_*` (all) | `tlbi <op>[, xN]` | two-way        |                               |

---

### Design Rationale

| Choice                                      | Reason                                                                                                                                                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One intrinsic per ARM instruction           | Direct mapping makes code reviewable against the ARM ARM; no hidden expansion to remember.                                                                                                                      |
| No implicit `dsb`/`isb`                     | Different ops have different canonical sequences; correct synchronization for a `dc_zva` loop is _one_ `dsb` after the loop, not one per call. Implicit barriers force suboptimal code. Consistent with §1.3.3. |
| Full compiler fence on every intrinsic      | Cache and TLB operations change the meaning of subsequent accesses (translation, observed values). Reordering them is never safe.                                                                               |
| Inner-shareable variants exposed explicitly | The `*is` suffix changes broadcast scope, which has real performance implications and real correctness implications on multi-PE systems. Hiding it inside a "smart default" would mask the choice.              |
| `%dc_zva` alignment unchecked statically    | The ZVA block size is `Target-defined` (`DCZID_EL0`); not knowable from Wyst layout target facts. The convention is to query `%dczid_block_size()` at boot and align loops to that value.                    |
| EL2 / EL3 TLBI variants gated by `#target`  | Matches the §1.3.3 / §1.3.4 EL-gating model.                                                                                                                                                                    |

---

## 1.3.6 CPU Hint Intrinsics (Historical v0.8 `%` Surface; Non-Normative)

The ARM64 hint instructions communicate scheduling information to the CPU
— wait for a wakeup, signal other PEs, yield to a SMT sibling, take no
action. They appear throughout boot code, idle loops, spinlocks, and
exception handlers; they are first-class intrinsics in Wyst.

<!-- wyst-contract: historical-v0.8 -->
```wyst
%wfi()        // wait for interrupt — CPU enters low-power state until an interrupt
%wfe()        // wait for event — CPU enters low-power state until an event
%sev()        // send event to all PEs in the inner-shareable domain
%sevl()       // send event, local PE only
%yield()      // hint that the current thread can yield to a sibling SMT thread
%nop()        // no operation — one instruction's worth of nothing
```

All six lower to a single ARM hint instruction and have no operands. They do
not act as compiler memory fences and may be scheduled relative to memory
operations when source-order and effect dependencies permit. `%sev` and `%sevl`
introduce `cpu_event`; `%wfe` introduces both `cpu_event` and `cpu_halt` because
it consumes event-register state and may wait; `%wfi` introduces `cpu_halt`;
`%yield` and `%nop` have neither effect. These categories record CPU-state
interaction, not a memory-model synchronization edge.

| Intrinsic  | Lowering | Compiler fence | Effect                  |
| ---------- | -------- | -------------- | ----------------------- |
| `%wfi()`   | `wfi`    | none           | `cpu_halt`              |
| `%wfe()`   | `wfe`    | none           | `cpu_event`, `cpu_halt` |
| `%sev()`   | `sev`    | none           | `cpu_event`             |
| `%sevl()`  | `sevl`   | none           | `cpu_event`             |
| `%yield()` | `yield`  | none           | none                    |
| `%nop()`   | `nop`    | none           | none                    |

`%wfi` requires an interrupt to be deliverable to wake the PE — typically
this means at least one of IRQ/FIQ is unmasked at the time of the
instruction, or the interrupt is configured to wake the PE regardless of
mask state via the GIC. `%wfe` wakes on the broader "event" condition,
which includes `sev`/`sevl` from any PE in the shareable domain _and_ any
unlocked `stxr` operation completing.

The spinlock pattern at §1.3.2 uses `%wfe()` in the wait loop and `%sev()`
in the unlock path; this is the canonical use.

`%nop()` is occasionally useful for alignment padding when explicit control is
needed. Padding inside a `vector_table` slot is target-owned and automatic;
see [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md).

There is no design rationale beyond "these are ARM hint instructions; they
get one intrinsic each." The interesting design choices are above this
layer.

---

### `%compiler_barrier` — Compiler Memory Fence

<!-- wyst-contract: historical-v0.8 -->
```wyst
%compiler_barrier()
```

`%compiler_barrier()` is a statement-level full two-way compiler memory
fence. The compiler must not move loads, stores, atomics, volatile accesses,
runtime primitives with side effects, or non-pure `asm` blocks across it in
either direction.

**Effects:** Full two-way compiler memory fence. Emits no ARM64 instruction.
Provides no hardware memory-ordering guarantee and creates no
happens-before edge between agents. Use `%dsb`, `%dmb`, or `%isb()` when the
CPU must execute an architectural barrier.

**Effect category:** `barrier`.

**ARM64 lowering:**

| Intrinsic             | Lowering |
| --------------------- | -------- |
| `%compiler_barrier()` | none     |

---

## 1.3.7 v0.9 `per_cpu` Target and Access Projection

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
`wyst.atomic-matrix.v1` uses the same one-base and offset rule around its one
requested atomic operation.
The compile-time `#percpu_offset_of(binding)` query emits only the final
template byte offset and does not acquire a base.

Compound assignment is not one such operation: selected snapshot rejects it for `per_cpu`
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

The selected snapshot has no TLS storage class or TLS base mechanism. The predecessor TLS
declaration and offset-query rows, `.tls` template generation, `PT_TLS`, and
ELF TLS relocations are outside the selected snapshot language and target contract.

### Released v0.8 Per-CPU and TLS Model (Historical)

> Everything from this heading through the historical design-rationale table
> immediately before §1.3.8 is a released v0.8 snapshot. Its address
> materialization, cross-CPU access, base caching, runtime-copy recipe, exported
> size symbols, `#percpu`, and TLS claims are not v0.9 behavior and cannot
> override the current section above.

A kernel needs a way to declare data that has one instance per logical
CPU (per-CPU variables — current-running-thread pointer, idle stats,
softirq queues) and a user runtime needs a way to declare data that has
one instance per thread (TLS — errno, thread-local caches). ARM64
provides two dedicated thread/CPU pointer registers — `TPIDR_EL1` for
EL1 kernel use and `TPIDR_EL0` for EL0 user use — and Wyst lifts both
into the language as declaration attributes.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#percpu
my_counter : u64 = 0 // one u64 per logical CPU, EL1
#tls
errno_val : u32 = 0 // one u32 per thread, EL0
```

Both attributes are placement decisions: they put the variable into a
special section that is per-CPU- or per-thread-instantiated by the
runtime at boot or thread creation. Access through the bare variable
name reads or writes the current instance.

---

#### Historical Declaration

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Per-CPU (EL1 kernel data; one instance per logical CPU):
current_task : #percpu @task = 0
softirq_pending : #percpu u32 = 0
cpu_stats : #percpu cpu_stats_record = { calls: 0, switches: 0 }

// Thread-local (EL0 user data; one instance per thread):
errno_val : #tls u32 = 0
tls_cache : #tls @cache_entry = 0
```

| Attribute | Section   | Pointer register | Legal at EL |
| --------- | --------- | ---------------- | ----------- |
| `#percpu` | `.percpu` | `TPIDR_EL1`      | EL1+        |
| `#tls`    | `.tls`    | `TPIDR_EL0`      | any         |

The initial value is the **master** copy. The runtime allocates per-CPU
or per-thread storage (size = `size_of(percpu section)`) and copies the
master into each instance at CPU bring-up or thread creation. The
object image contains the master in the `.percpu` (or `.tls`) section; the
layout module places this section.

Per-CPU and thread-local declarations:

- Must have a compile-time-constant initial value.
- May be of any type that the master section can store (scalars,
  structs, fixed arrays, enums; not slices, not function pointers in
  this static-ELF slice).
- May be `pub`'d. The exported symbol refers to the section offset
  (suitable for runtime relocation arithmetic), not any specific CPU's
  instance.

Function pointer storage is deferred until object/link-capable output can
define exactly which function symbol references are legal in copied master
sections.

---

#### Historical Access

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Read the current CPU's instance:
n := my_counter

// Modify:
my_counter += 1

// Take the current CPU's instance address:
p : @u64 = #addr_of(my_counter)
```

The compiler lowers a per-CPU access to:

```
mrs   xT, TPIDR_EL1               // load per-CPU base
ldr   xN, [xT, #offset_of(var)]   // current CPU's instance
```

For repeated accesses, the compiler hoists the `mrs` and reuses the base
register across uses within a single function (deterministic CSE; the
base is materialized exactly once per function unless escaped via a call
that may clobber `TPIDR_EL1`). Programs that need explicit control can
`#pin` a local to `TPIDR_EL1`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
update_stats :: () {
  base : u64 #pin(TPIDR_EL1) = %mrs(TPIDR_EL1)
  cpu_stats.calls += 1
  cpu_stats.switches += 1
}
```

The current-CPU address of a `#percpu` variable requires runtime
address materialization because it reads `TPIDR_EL1` and adds the
per-CPU offset at runtime. To compute another CPU's instance address, use
`#percpu_offset_of`:

<!-- wyst-contract: sketch -->
```wyst
#percpu_offset_of(var) -> u64             // section-relative offset; constant
percpu_base_for_cpu(cpu_id) -> u64        // provided by the runtime
```

`#percpu_offset_of(var)` is a compile-time constant (the variable's
offset in the `.percpu` section). `percpu_base_for_cpu(cpu_id)` is not a
compiler intrinsic — the runtime implements it as a table lookup or via
a per-CPU base array. Wyst does not mandate the table format; the runtime
provides it.

The numeric offset is deterministic for one complete build, but it is a
final image layout fact, not a stable source ABI. It can change when
`.percpu` declarations in the import closure are added, removed,
reordered, or realigned before `var`, or when layout constraints change.
The compiler emits warning `W0203` for `#percpu_offset_of` and
`#tls_offset_of` uses to make this dependency visible. Persist symbolic
identities or recompute offsets for the current image; do not persist the
numeric value as a cross-build protocol value.

A cross-CPU access:

<!-- wyst-contract: historical-v0.8 -->
```wyst
peek_remote_counter :: (cpu : u32) -> u64 {
  base : @u8 = percpu_base_for_cpu(cpu) as.address @u8
  addr : @u64 = (base + #percpu_offset_of(my_counter)) as.lens @u64
  return u64@[addr]
}
```

`#tls` accesses are symmetric, using `TPIDR_EL0` and `#tls_offset_of`.

---

#### Historical Layout

The layout module must declare the `.percpu` and `.tls` sections (see
[chapter-04-modules.md](chapter-04-modules.md)) for the symbols to have a home. Common practice:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#section .text : align = 16, in = rom
#section .rodata : align = 16, after = .text
#section .data : align = 8, after = .rodata
#section .percpu : align = 64, after = .data // master copy in image
#section .bss : align = 16, in = ram
#section .tls : align = 16, in = ram // master copy for TLS
```

The compiler additionally exports the section size for runtime use:

<!-- wyst-contract: historical-v0.8 -->
```wyst
pub __percpu_size ::= #size_of(.percpu)
pub __tls_size    ::= #size_of(.tls)
```

The runtime's per-CPU bring-up sequence is then:

1. Allocate `__percpu_size * num_cpus` bytes.
2. For each CPU N: copy the master `.percpu` section to instance N.
3. Set `TPIDR_EL1` on each CPU to its instance base.

Wyst does not provide a runtime; the kernel writes this sequence using
the primitives above.

---

#### Historical ARM64 Lowering

| Construct                           | Lowering                                             |
| ----------------------------------- | ---------------------------------------------------- |
| `read(percpu_var)`                  | `mrs xT, TPIDR_EL1; ldr xN, [xT, #offset]`           |
| `write(percpu_var, val)`            | `mrs xT, TPIDR_EL1; str xN, [xT, #offset]`           |
| current-CPU address materialization | `mrs xT, TPIDR_EL1; add xN, xT, #offset`             |
| `#percpu_offset_of(var)`            | compile-time constant; lowers to `#offset` immediate |
| `read(tls_var)`                     | `mrs xT, TPIDR_EL0; ldr xN, [xT, #offset]`           |

The `mrs` is repeated only when the compiler cannot prove `TPIDR_EL1` /
`TPIDR_EL0` is unchanged since the prior materialization. `%msr(TPIDR_EL1, ...)`,
`%svc`/`%hvc`/`%smc` (which may switch contexts), and function calls that
have not annotated `#preserves(TPIDR_EL1)` all invalidate the cached
base. (The `#preserves` attribute is outside this model.)

---

#### Historical Design Rationale

| Choice                                                           | Reason                                                                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#percpu` and `#tls` as declaration attributes                   | Placement decisions belong on the declaration, not the access site. Every access of `my_counter` is uniformly per-CPU; the attribute on the declaration tells the reader once.        |
| Section-based storage                                            | Aligns with the existing layout-module section model (`.percpu` is just another section). The runtime owns per-CPU instance allocation; the compiler owns the master copy and offset. |
| `TPIDR_EL1` for kernel, `TPIDR_EL0` for user                     | Architecturally blessed registers. Linux, FreeBSD, and most BSD-derived ARM64 kernels follow this convention; aligning lowers the surprise tax for kernel developers.                 |
| Current-CPU address materialization returns current-CPU instance | Matches the access semantics (`my_counter` is the current instance). Cross-CPU needs `#percpu_offset_of` + a runtime-provided base table.                                             |
| `#percpu_offset_of` is a compile-time constant                   | Makes cross-CPU access a clean two-term computation (`base + offset`) without compiler involvement at use-sites; warning `W0203` marks the image-layout coupling.                     |
| `x18` stays unmandated                                           | Different platforms (Linux SCS, macOS) use `x18` differently; not baking a role in keeps Wyst compatible with each.                                                                    |
| No `#percpu_for(cpu_id, var)` intrinsic at language level        | Runtime-table format varies (flat array vs hash vs RCU-protected list). Leaving this to the runtime preserves flexibility.                                                            |
| Master copy must have a compile-time-constant initializer        | The boot copy is part of the image. Runtime-computed initial values would require a separate construction path.                                                                       |

---

## 1.3.8 Performance Intrinsics (Historical v0.8 `%` Surface; Non-Normative)

Performance intrinsics expose ARM64 hardware hints and counters that have
no effect on program correctness but influence cache behaviour, memory
ordering visibility, and measurement. None of these intrinsics are compiler
fences unless stated otherwise.

---

### `%prefetch` — Cache Prefetch Hint

<!-- wyst-contract: historical-v0.8 -->
```wyst
%prefetch(addr : @T, access : { read, write }, locality : { streaming, low, medium, high })
```

Hints to the hardware that `addr` will be accessed soon. The CPU may
prefetch the cache line containing `addr` into the indicated cache level.
The hardware is free to ignore the hint.

**Parameters:**

| Parameter  | Values      | Meaning                                      |
| ---------- | ----------- | -------------------------------------------- |
| `access`   | `read`      | data will be read (`PLD`)                    |
|            | `write`     | data will be written (`PST`)                 |
| `locality` | `streaming` | no temporal reuse expected; L1 stream policy |
|            | `low`       | low reuse; target L3 keep                    |
|            | `medium`    | moderate reuse; target L2 keep               |
|            | `high`      | high reuse; target L1 keep                   |

**ARM64 lowering:**

| `access` | `locality`  | ARM64 instruction |
| -------- | ----------- | ----------------- |
| `read`   | `streaming` | `prfm pldl1strm`  |
| `read`   | `low`       | `prfm pldl3keep`  |
| `read`   | `medium`    | `prfm pldl2keep`  |
| `read`   | `high`      | `prfm pldl1keep`  |
| `write`  | `streaming` | `prfm pstl1strm`  |
| `write`  | `low`       | `prfm pstl3keep`  |
| `write`  | `medium`    | `prfm pstl2keep`  |
| `write`  | `high`      | `prfm pstl1keep`  |

**Effects:** No compiler fence. No memory ordering effect. `%prefetch` is a
pure hint: it may be freely reordered relative to all other operations wherever
the active scheduling policy permits. It never traps, never clobbers registers, and never
modifies memory.

**Example:**

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Prefetch the next cache line while processing the current element.
// The prefetch overlaps with the computation below.
%prefetch(ptr + 64, read, high)
sum += u64@[ptr]
```

---

### `%ldnp` / `%stnp` — Non-Temporal Load/Store Pair

<!-- wyst-contract: historical-v0.8 -->
```wyst
%ldnp(addr : @T) -> (T, T)
%stnp(addr : @T, val1 : T, val2 : T)
```

Non-temporal loads and stores hint to the cache hierarchy that the accessed
data has low temporal locality. The hardware may allocate the data in a
way that causes it to be evicted sooner than a normal access, or bypass
the cache entirely on some implementations.

**Supported types:** `u32`, `u64`, `f32`, `f64`. The address must be
naturally aligned for the pair width (8 bytes for `u32`/`f32` pairs,
16 bytes for `u64`/`f64` pairs). Misaligned non-temporal access is a
`Architectural fault or trap`.

**ARM64 lowering:**

| Intrinsic             | Type  | ARM64 instruction   |
| --------------------- | ----- | ------------------- |
| `%ldnp(addr)`         | `u64` | `ldnp xA, xB, [xN]` |
| `%ldnp(addr)`         | `u32` | `ldnp wA, wB, [xN]` |
| `%ldnp(addr)`         | `f64` | `ldnp dA, dB, [xN]` |
| `%ldnp(addr)`         | `f32` | `ldnp sA, sB, [xN]` |
| `%stnp(addr, v1, v2)` | `u64` | `stnp xA, xB, [xN]` |
| `%stnp(addr, v1, v2)` | `u32` | `stnp wA, wB, [xN]` |
| `%stnp(addr, v1, v2)` | `f64` | `stnp dA, dB, [xN]` |
| `%stnp(addr, v1, v2)` | `f32` | `stnp sA, sB, [xN]` |

**Effects:** No compiler fence. Non-temporal stores follow the same
reordering rules as plain stores. They are **not** barriers.

**Important:** On some implementations, non-temporal stores bypass the
cache and write directly to the point of coherency. A `%dsb(ish)` barrier
after a batch of non-temporal stores may be needed before the data is
guaranteed visible to other agents. See
[chapter-09-memory-model.md §1.3.1](chapter-09-memory-model.md) for barrier semantics.

**Example:**

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Streaming copy: data is read once and written once with no reuse.
(a, b) := %ldnp(src)
%stnp(dst, a, b)
```

---

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
`a64-generic-virtual-counter-v1`. That descriptor authenticates one
`CNTVCT_EL0` read, a 64-bit result, modulo-`2^64` wrapping,
`runtime_register(CNTFRQ_EL0)` frequency acquisition, minimum EL0, the
`CNTKCTL_EL1.EL0VCTEN_when_EL0` enablement condition, and
`architectural_fault_or_trap` failure behavior.

This generic descriptor owns only source-operation facts: read identity and
lowering, width, frequency **acquisition**, minimum execution level,
enablement, failure, and source-report identity. In particular,
`runtime_register(CNTFRQ_EL0)` identifies how a future measurement producer
may acquire a realized frequency; `cpu.read_counter()` itself does not read
that register or authenticate a frequency value.

The selected snapshot descriptor result-width contract is the closed range `1..=64`. The
declared width may be narrower than the generated system-register carrier, but
may never be wider. The operation still returns `u64`: bits below the declared
width are the counter value and all higher bits are zero. Wrapping is modulo
`2^width`.

Runtime enablement is also a closed selected snapshot vocabulary. It describes a condition
that the execution environment must already satisfy; it is never an implicit
compiler setup sequence.

| Descriptor value | selected snapshot meaning |
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
enablement, failure, wrapping behavior, source-report identity, and catalog/
authority origin.

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

Every current built-in target that admits this source descriptor atomically
selects static provider `a64-generic-virtual-counter-instance-provider-v1`
version 1 under product schema `wyst.platform-counter-instance-provider.v1` as
a target-profile extension. That static product is bound to
`a64-generic-virtual-counter-v1`, names record schema
`wyst.platform-counter-instance-record.v1` and universe-evidence schema
`wyst.platform-counter-universe-evidence.v1`, and participates in compilation
identities. Its five-field product digest is
`sha256:ab1c41697aac01bea2961dd676ea33f980712a4471ea70ed226adcf4ed3659b1`;
it does not represent a runtime domain, epoch, or measurement observation. A
valid record receives its normalized per-run identity under
`wyst.platform-counter-instance-identity.v1`.

At launch or measurement time a consumer may accept one immutable per-run
instance record under the selected schema. The record authenticates its runtime
counter domain and configuration epoch; exactly one `fixed_hz`, `variable`, or
`unknown` realized-frequency mode with acquisition and evidence identities;
exactly one `same_core_only` or
`shared_monotonic(max_offset_ticks = N)` comparison mode with evidence identity;
and exactly one `none_with_authority` serialization value with reason,
authority, and evidence identities or `source_explicit` value with nonempty
ordered `before`/`after` operations, `read = core.arch.cpu.read_counter`,
measured overhead, and evidence identity. Each before/after step must be an
active zero-operand void architecture barrier operation. It also authenticates
the complete applicable/inapplicable platform-state universe and progress
evidence, every mutable source/frequency/offset/reset/rebase/comparability
control and its applicability/exclusion/epoch transition, all evidence
identities, and a digest over its complete normalized content. Runtime record
identity/content never enters a reusable compilation-cache key.

Those record rows are complete only when they exactly match one independently
authenticated combined universe authority. The selected platform-environment
adapter supplies a contract under
`wyst.platform-counter-universe-evidence-contract.v1` that pins the exact
content digest of an authority under
`wyst.platform-counter-universe-evidence.v1`; recomputing a self-consistent
digest over producer-chosen rows is insufficient. The authority binds the
provider/source, exact counter domain and configuration epoch, both universe
evidence references, exact sorted state identities, and exact sorted control
identities with sorted effects. Domain and epoch enter its digest, preventing
authority replay across runtime scopes. The record carries both
`universe_evidence_contract_identity` and
`universe_evidence_content_digest`; both enter record content, evidence,
identity, and lifecycle binding and must match that authority along with every
row, effect, and reference. Runtime authority content remains outside
compilation and reusable-cache identities. Current conformance uses only the
compiler-owned baseline synthetic authority digest
`sha256:c656328d5dde4c49e71ea298af58ac8daa27a8bb9205219d59c061bea3a3ebb1`.

The closed lifecycle begins at launch as exactly `RawReadsOnly` or `Bound` and
advances only `Launch -> Measurement -> Report`. A record may first appear at
measurement only from the preserved raw-only launch state. Once bound it cannot
disappear or be substituted, and it cannot first appear at report. A changed
source, domain, universe trust anchor, authority digest, or recognized provider
fact is `mismatched`; an unrecognized provider identity is `unknown`; a changed
epoch, record identity, or content
digest is `stale`; and disappearance or report-first appearance is `incomplete`.
This state token prevents a later consumer from dropping its
predecessor evidence or substituting an older or different otherwise-valid
record.

No runtime record is required merely to execute `cpu.read_counter()`. Without
one, the operation remains an authenticated raw source read and every numeric
verification or report result is explicitly unsupported. A record with the
closed disposition `unknown`, `malformed`, `incomplete`, `stale`, `mismatched`,
or `ambiguous` fails closed rather than lending selected fields to a numeric
claim. Missing authority-declared rows or a present record without authority
are `incomplete`. Extra rows; changed effects, scope, trust anchor, references,
or digest; a source or other recognized-fact disagreement; and invalid
epoch-transition relationships are `mismatched`. Multiple authorities are
`ambiguous`. No record with no
authority remains raw-only. The future
performance/resource-report and benchmark-comparison contract may authorize a
numeric elapsed claim only when its interval evidence binds the same source-
descriptor, provider/schema, and immutable record identity/content digest at
both endpoints and proves one unchanged runtime domain/configuration epoch,
endpoint comparability and any maximum offset, explicit serialization and
charged overhead, a realized frequency for the claimed unit, all possible
platform states and their progress evidence, exclusion of every mutable
control, and a maximum span strictly below the source modulus. None of those
runtime facts is implied by `a64-generic-virtual-counter-v1`, target selection,
the static provider/schema, the two compiler fences, or the two raw reads.

The predecessor cycle-counter primitive survives only as a frozen removal-audit
row. No current parser recognizes it, and it does not define the semantics of
`cpu.read_counter()`.

---

### Design Rationale

| Choice                                          | Reason                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `cache.prefetch` exposed directly, not auto-inserted | Auto-prefetching is a compiler transformation Wyst does not perform. Explicit prefetch lets the programmer control the distance and policy. |
| Full ARM64 `PRFM` coverage                      | ARM64 distinguishes load/store × three cache levels × keep/stream. Abstracting to fewer options would hide machine semantics.              |
| Non-temporal load/store operations use pairs    | ARM64 `LDNP`/`STNP` are pair instructions — exposing single-element non-temporal ops would require synthetic pair construction.            |
| `cpu.read_counter` is a full fence               | The fence keeps source loads/stores inside the sampled region. It neither serializes hardware endpoints nor upgrades raw ticks into elapsed-time evidence. |
| Artifact target selects one source descriptor    | Counter source, availability, privilege, frequency acquisition, and failure stay explicit; feature inference and fallback cannot change emitted code. |
