---
title: "Chapter 11: Wyst Runtime Primitives"
group: chapter
chapter: 11
order: 11
summary: "Runtime primitives for atomics, sysregs, traps, cache/TLB maintenance, CPU hints, counters, and target hooks."
---

# Chapter 11: Wyst Runtime Primitives

> **Canonical scope.** The `%`-prefixed primitives that lower to runtime
> operations: stack-local address materialization, explicit raw-storage reads
> and writes, runtime enum tag projection, atomics (§1.3.2), system register
> access (§1.3.3), trap and exception entry (§1.3.4), cache and TLB maintenance
> (§1.3.5), CPU hints (§1.3.6), and per-CPU / thread-local storage (§1.3.7).
> The memory-access qualifier/directive forms (`@volatile T`, `@mmio T`,
> `#acquire`, `#release`) live in [chapter-09-memory-model.md](chapter-09-memory-model.md). IR-level intrinsic
> representation lives in [appendix-a-ir.md §6.8](appendix-a-ir.md).
>
> **Terminology.** Source code uses **runtime primitive** for `%...` forms
> and **compile-time form/directive** for `#...` forms. The compiler's IR may
> still use the internal term `intrinsic` for opaque runtime-lowered ops.

`%` primitives are explicit machine operations. The memory model defines when
they are legal to reorder; this chapter defines what operation each primitive
requests from the target.

---

### Checked Primitive Example

CPU hint primitives are explicit runtime operations:

<!-- wyst-contract: check-pass -->
```wyst
#module intrinsics_demo

#noreturn
wait_forever :: () {
  loop {
    %wfe()
  }
}
```

### Runtime Address Materialization

<!-- wyst-contract: sketch -->
```wyst
%addr_of(local : T) -> @T in an explicit address context
%addr_of(local : [N]T) -> @T or @[N]T in an explicit address context
```

`%addr_of(local)` materializes the address of stack-local storage in the
current function. It is the runtime counterpart to `#addr_of(symbol)`: the
result is an ordinary stack-frame address, not a relocation and not a
compile-time constant. It is illegal in `#naked` functions because those
functions do not have a compiler-owned frame.

**Effect category:** none. The primitive materializes a compiler-owned
stack-frame address, which is a generated backend resource fact rather than a
semantic effect. Stack-address escape remains checked by the lifetime/authority
rules; backend frame facts are reported after lowering.

`%addr_of(local)` does not choose a default lens in an inferred binding. Write
an explicit annotation or categorized conversion:

<!-- wyst-contract: sketch -->
```wyst
word : u64 = 0
word_ptr : @u64 = %addr_of(word)
word_ptr2 := %addr_of(word) as.lens @u64

bytes : @u8 = %addr_of(buf)
whole : @[4]u8 = %addr_of(buf)
bytes2 := %addr_of(buf) as.lens @u8
```

The resulting address may be used for direct memory operations inside the
containing function:

<!-- wyst-contract: sketch -->
```wyst
value : u64 = 41
ptr : @u64 = %addr_of(value)
u64@[ptr] = u64@[ptr] + 1
```

Returning the address, storing it into longer-lived storage, or passing it
through an ordinary function call is rejected. Direct calls may receive it only
through an address parameter marked `#noescape`, which the callee is checked
not to retain or expose under the syntactic `#noescape` rule: direct memory
access and direct forwarding to another `#noescape` parameter are allowed, while
casts, aliases, stores of the address value, indirect calls, and ordinary value
observations are rejected. Use `#addr_of(symbol)` for globals, functions,
labels, exception vectors, and other linkable storage.

---

### Explicit Raw Storage

<!-- wyst-contract: sketch -->
```wyst
%read_uninit(storage : MaybeUninit<T>) -> T
%write_uninit(storage : MaybeUninit<T>, value : T) -> void
```

`MaybeUninit<T>` names raw storage with the same layout and storage class as
`T` but without an initialized `T` value. `%read_uninit(storage)` is the only
source-level way to deliberately observe the current bits of that raw storage
as a `T`. `%write_uninit(storage, value)` writes a `T` value into the raw
storage without changing the storage's type.

These primitives do not zero memory, do not add fences, and do not introduce
volatile or atomic ordering. The observed value from `%read_uninit` is an
ordinary `T` value after the read, but the IR records the read as an explicit
indeterminate-read operation rather than manufacturing an SSA value with no
definition.

The storage operand must be a local `MaybeUninit<T>` binding. Stack-resident
and register-resident locals have identical source semantics; placement and
`#pin` affect only where the storage lives. Special-register aliases remain
read-only snapshots and cannot be used as mutable raw storage.

**Effect category:** none. These primitives operate on local raw storage and
do not by themselves materialize an address, touch external memory, or cross an
architectural boundary.

---

### Runtime Enum Tag Projection

<!-- wyst-contract: sketch -->
```wyst
%tag_of(value : Enum) -> the enum's declared discriminator type
```

`%tag_of(value)` projects the active discriminator from an enum value at
runtime. It is the runtime counterpart to `#tag_of(Enum.Variant)`, which is
restricted to compile-time variant metadata.

**Effect category:** none. `%tag_of` is a pure value projection. It does not
validate payload bytes, branch on variants, or read inactive payload storage.
The `as` operator still does not convert enums to integers; `%tag_of` is the
explicit spelling for this payload-discarding projection.

<!-- wyst-contract: sketch -->
```wyst
Event :: enum: u8 {
  Empty
  Data(u64)
}

event_tag :: (event : Event) -> u8 {
  return %tag_of(event)
}
```

Payload-less enum values lower as the discriminator value itself.
Payload-carrying enum values lower to extraction of the tag word at offset 0
from the fixed two-word enum representation.
There is no inverse runtime primitive for constructing an enum from a raw tag
and payload bytes.

---

## 1.3.2 Atomic Operations

Atomic operations are the language-level primitives for atomic
inter-agent communication. Where `#acquire` and `#release` cover ordered
plain loads and stores, atomic operations cover **read-modify-write** (RMW)
sequences — compare-and-swap, fetch-and-add, exchange, and single-bit
updates — that have no equivalent in the plain-access shape and that
hand-written `ldxr`/`stxr` loops in `#asm` get wrong with monotonous
regularity.

### When to Use Each Form

| Operation                            | Spelling                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| Acquire-load of plain memory         | `#acquire u32@[addr]`                                                              |
| Release-store to plain memory        | `#release u32@[addr] = v`                                                          |
| Relaxed atomic load                  | `%atomic_load(addr, order: relaxed)`                                              |
| Sequentially-consistent atomic load  | `%atomic_load(addr, order: seq_cst)`                                              |
| Relaxed atomic store                 | `%atomic_store(addr, v, order: relaxed)`                                          |
| Sequentially-consistent atomic store | `%atomic_store(addr, v, order: seq_cst)`                                          |
| Compare-and-swap                     | `%cas(addr, exp, new, order: ...)`                                                |
| Fetch-and-add (and -sub, -or, -and, -xor) | `%fetch_add(addr, delta, order: ...)`                                        |
| Exchange                             | `%xchg(addr, val, order: ...)`                                                    |
| Set / clear a single bit             | `%atomic_bit_set(addr, n, order: ...)` / `%atomic_bit_clear(addr, n, order: ...)` |

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

<!-- wyst-contract: sketch -->
```wyst
counter : u64 = 0
%fetch_add(#addr_of(counter), 1, order: relaxed)
```

For RMW operations on `@volatile T` or `@mmio T`, the volatility of the address
type propagates into the access — the compiler treats the RMW as both volatile
_and_ atomic and emits the appropriate ARM64 instruction without any additional
`@volatile` machinery. `@mmio T` additionally records MMIO intent; the actual
architectural memory type still comes from the runtime mapping.

Floating-point atomics are outside the atomic surface. The 128-bit pair atomics
(`ldxp`/`stxp`, `casp`) are accessible only via `#asm`; the language does
not model 128-bit value types.

---

### Atomic Load and Store

<!-- wyst-contract: sketch -->
```wyst
%atomic_load(addr : @T, order : { relaxed, seq_cst }) -> T
%atomic_store(addr : @T, val : T, order : { relaxed, seq_cst })
```

Relaxed forms exist when the program wants the atomicity guarantee (no
torn read on a misaligned-by-compiler-spill or shared word) but does not
need any inter-access ordering. Sequentially-consistent forms exist for
algorithms that require the global total-order guarantee that
acquire/release alone cannot provide.

<!-- wyst-contract: sketch -->
```wyst
// Relaxed read of a shared counter. Atomic at the word level; no ordering
// relative to surrounding code.
n := %atomic_load(counter_addr, order: relaxed)

// seq_cst store. Participates in the total order with all other seq_cst
// operations.
%atomic_store(flag_addr, 1 as.numeric u32, order: seq_cst)
```

---

### Compare-and-Swap

<!-- wyst-contract: sketch -->
```wyst
%cas(addr : @T, expected : T, new : T, order : Order) -> (prev : T, ok : bool)
```

Returns a two-element tuple: `prev` is the value that was at `addr`
immediately before the operation, and `ok` is `true` if `prev == expected`
(the swap occurred) or `false` (the swap did not). When `ok` is `false`,
the value at `addr` is unchanged.

ARM64 does not distinguish success and failure orderings — the failure
path performs the load with the same barrier configuration as the success
path. Wyst therefore takes a single `order:` argument rather than the
C++/Rust pair. `acqrel` and `seq_cst` `%cas` are RMW orderings; `acquire`
applies to both the read and the write, `release` likewise.

<!-- wyst-contract: sketch -->
```wyst
LOCK : @u64 = 0x8000

spin_lock :: () {
  loop {
    _, ok := %cas(LOCK, 0 as.numeric u64, 1 as.numeric u64, order:acquire)
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

<!-- wyst-contract: sketch -->
```wyst
%fetch_add(addr : @T, delta : T, order : Order) -> T   // returns old
%fetch_sub(addr : @T, delta : T, order : Order) -> T
%fetch_or(addr : @T,  mask  : T, order : Order) -> T
%fetch_and(addr : @T, mask  : T, order : Order) -> T
%fetch_xor(addr : @T, mask  : T, order : Order) -> T
%xchg(addr : @T,      val   : T, order : Order) -> T
```

<!-- wyst-contract: sketch -->
```wyst
// Reference counting:
prev := %fetch_add(refcount_addr, 1, order: relaxed)

// Lock-free flag union (set bits 3 and 5 atomically):
%fetch_or(flags_addr, (1 << 3) | (1 << 5), order: acqrel)

// Take the previous head of a singly-linked list and replace it with NEW:
old_head := %xchg(head_addr, new_head, order: acqrel)
```

---

### Atomic Bit Operations

Single-bit atomic operations are a frequent enough kernel idiom to warrant
their own intrinsics — `%fetch_or(addr, 1 << n, ...)` works but obscures
intent and forces the compiler through a fetch_or-shaped lowering when LSE
provides `ldset`/`ldclr` directly.

<!-- wyst-contract: sketch -->
```wyst
%atomic_bit_set(addr : @T,   bit : u32, order : Order) -> bool   // returns prior bit
%atomic_bit_clear(addr : @T, bit : u32, order : Order) -> bool   // returns prior bit
```

`bit` is the bit index, `0` being the least significant. The result is the
value of that bit _before_ the operation. `bit` must be a compile-time
constant less than `8 * #size_of(T)`; out-of-range is a compile error.

<!-- wyst-contract: sketch -->
```wyst
// Test-and-set the lock bit:
was_locked := %atomic_bit_set(status_addr, 0, order: acquire)
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
| Keyword `order:` argument                              | Closed set of five orderings — naming each variant separately would balloon to ~30 intrinsics.                                                                                               |
| Single `order:` on `%cas` (no failure order)           | ARM64 hardware cannot distinguish; C++/Rust two-argument form is always lowered with the failure order widened to match success on ARM. The redundant parameter is a footgun, not a feature. |
| `%cas` returns `(prev, ok)`                            | Caller can branch on `ok` and inspect the racing value without a second load. Matches C11 `atomic_compare_exchange_strong`.                                                                  |
| All `%fetch_*` and `%xchg` return prior value          | Matches LSE instruction semantics directly. Returning the prior value is universal — the new value is recomputable from `(prev, delta)`, but not vice versa.                                 |
| `%atomic_bit_set` / `%atomic_bit_clear` as first-class | Single-bit RMW is frequent enough (flags, locks, ref-count bits) and LSE has dedicated `ldset`/`ldclr` — a generic `%fetch_or` would obscure intent and possibly miss the LSE lowering.      |
| LSE selected per-target, not per-call                  | The LL/SC vs LSE choice is a CPU capability, not an algorithmic choice. Per-call opt-in would force every site to answer "what if LSE isn't available?"                                      |
| Non-LSE retry loops do not expose internal failure     | The public primitive surface has no fallible result type for store-exclusive retry exhaustion, so the lowered loop must retry until the operation completes instead of silently returning a partial or invented result. |
| Progress guarantees are separate from atomicity        | Atomic RMW correctness says each completed operation is indivisible and returns the specified value. It does not promise wait-freedom or hidden lock-free progress under contention.          |
| No hidden fallback locks or helpers                    | Hidden locks would add synchronization effects and storage that kernel code must be able to audit. Any future fallback mechanism has to appear in effects, storage, and lowering reports.     |
| Floating-point and 128-bit atomics excluded            | No language type for 128-bit; FP atomics are rare in kernel code and easily emulated via `%cas` on the bit pattern.                                                                          |

---

## 1.3.3 System Register Access

The compiler's architectural system-register table is closed for the named
`%mrs` / `%msr` forms: registers not listed there and noncanonical case
variants are rejected. Each named register has exactly one canonical spelling,
the exact spelling stored in the compiler's system-register table. Diagnostics
for case-only variants name the accepted replacement. Implementation-defined
registers use the explicit S-encoded `%mrs_s` / `%msr_s` fallback form.

ARM64 system registers (TCR_ELx, SCTLR_ELx, VBAR_ELx, TTBR0_ELx, MAIR_ELx,
etc.) are the primary configuration surface for the CPU. Every non-trivial
kernel reads and writes them constantly. Wyst provides direct intrinsics
for system-register access, eliminating the `#asm { mrs … }` /
`#asm { msr … }` boilerplate that otherwise dominates early-boot and
trap-handling code.

<!-- wyst-contract: sketch -->
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
the `%mrs` / `%msr` / `%mrs_s` / `%msr_s` argument position. They cannot
appear in expression position, are not values, and cannot be assigned to
variables.

This means a register name may collide with a same-named bitfield type
(e.g. `TCR_EL1` is both an architectural register and a conventional
bitfield type declaration) without ambiguity — the syntactic positions
are disjoint:

<!-- wyst-contract: sketch -->
```wyst
TCR_EL1 :: bitfield(u64) { ... }   // TCR_EL1 is a type here

raw := %mrs(TCR_EL1)                // TCR_EL1 is a register name here
tcr := raw as.bits TCR_EL1          // TCR_EL1 is a type here
```

Register names use the exact canonical table spelling. Most names use
uppercase architectural spelling such as `SCTLR_EL1`; architectural mixed-case
names such as `CurrentEL` and `SPSel` keep that spelling. Formatting preserves
accepted canonical names, diagnostics reject other case variants, and editor
completion only suggests canonical names.

---

### Access Permissions

The system register table encodes each register's access permissions.
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
architecture defines it. The caller converts to a bitfield via the
standard `as.bits` conversion (see [chapter-06-types.md §1.6.1](chapter-06-types.md)):

<!-- wyst-contract: sketch -->
```wyst
// Read TCR_EL1, modify a field, write it back:
raw := %mrs(TCR_EL1)
tcr := raw as.bits TCR_EL1
tcr.t0sz = 25
tcr.t1sz = 25
%msr(TCR_EL1, tcr as.bits u64)
%isb()                                 // required when the write affects translation
```

Returning a bitfield-typed value implicitly would couple the
sysreg-lookup table to the type-name lookup table — a register's intrinsic
return type would depend on whether a same-named bitfield type happens to
be in scope. The explicit `as` is one extra line per access and matches
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

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

ARM-architectural registers cover the standard surface. Implementation-
defined registers (Apple silicon performance counters, Cortex-A errata
workarounds, vendor-specific debug registers) use the S-encoded form:

<!-- wyst-contract: sketch -->
```wyst
%mrs_s(op0 : u2, op1 : u3, crn : u4, crm : u4, op2 : u3) -> u64
%msr_s(op0 : u2, op1 : u3, crn : u4, crm : u4, op2 : u3, val : u64)
```

All five encoding fields must be compile-time constants and fit their ARM64
field widths: `op0` is 2 bits, `op1` is 3 bits, `crn` is 4 bits, `crm` is
4 bits, and `op2` is 3 bits. The backend emits
`mrs xN, S<op0>_<op1>_C<crn>_C<crm>_<op2>` and
`msr S<op0>_<op1>_C<crn>_C<crm>_<op2>, xN` directly.

Example — read the Apple silicon `APRR_EL1` register:

<!-- wyst-contract: sketch -->
```wyst
raw := %mrs_s(3, 4, 15, 2, 0)
```

The compiler does not validate S-encoded register access against any
table — by definition these registers are not architectural. The
programmer asserts the encoding is correct.

---

### Worked Examples

#### Read-modify-write of a configuration register

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
```wyst
install_vectors :: () {
  %msr(VBAR_EL1, #addr_of(el1_vectors) as.address u64)
  %isb()
}
```

#### SCTLR cache enable

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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
| `%mrs_s(o0,o1,n,m,o2)` | `mrs xN, S<o0>_<o1>_C<n>_C<m>_<o2>` |
| `%msr_s(...)`          | `msr S<o0>_<o1>_C<n>_C<m>_<o2>, xN` |
| `%daif_set(mask)`      | `msr daifset, #mask`                |
| `%daif_clr(mask)`      | `msr daifclr, #mask`                |

`%mrs` and `%msr` are full two-way compiler memory fences. The compiler
treats system-register access as opaque-effect: no plain access, atomic,
or barrier may be reordered across it. This matches the architectural
reality that system-register state can affect arbitrary subsequent
behavior (translation, exception handling, cache behavior).

---

### Named Register Set

The named `%mrs` / `%msr` forms currently accept this closed compiler table.
Other architectural registers use `%mrs_s` / `%msr_s` with explicit
S-encodings until a later feature adds named rows:

| Register                                              | Width | EL  | R/W | Purpose                         |
| ----------------------------------------------------- | ----- | --- | --- | ------------------------------- |
| `CurrentEL`                                           | 64    | 1+  | R   | current exception level         |
| `DAIF`                                                | 64    | 1+  | RW  | interrupt mask state            |
| `SPSel`                                               | 64    | 1+  | RW  | stack pointer select            |
| `SCTLR_EL1`                                           | 64    | 1+  | RW  | system control                  |
| `TCR_EL1`                                             | 64    | 1+  | RW  | translation control             |
| `TTBR0_EL1`                                           | 64    | 1+  | RW  | translation table base 0        |
| `MAIR_EL1`                                            | 64    | 1+  | RW  | memory attribute indirection    |
| `VBAR_EL1`                                            | 64    | 1+  | RW  | exception vector base           |
| `ESR_EL1`                                             | 64    | 1+  | R   | exception syndrome              |
| `FAR_EL1`                                             | 64    | 1+  | R   | fault address                   |
| `ELR_EL1`                                             | 64    | 1+  | RW  | exception link register         |
| `SPSR_EL1`                                            | 64    | 1+  | RW  | saved program status            |
| `SP_EL1`                                              | 64    | 2+  | RW  | EL1 stack pointer               |
| `TPIDR_EL0`                                           | 64    | any | RW  | thread pointer EL0              |
| `TPIDR_EL1`                                           | 64    | 1+  | RW  | thread pointer EL1              |
| `CNTVCT_EL0`                                          | 64    | any | R   | virtual count                   |
| `PMCCNTR_EL0`                                         | 64    | any | R   | PMU cycle counter               |
| `MPIDR_EL1`                                           | 64    | 1+  | R   | multiprocessor affinity         |
| `DCZID_EL0`                                           | 64    | any | R   | DC ZVA block size and status    |
| `SCTLR_EL2`                                           | 64    | 2+  | RW  | EL2 system control              |
| `TCR_EL2`                                             | 64    | 2+  | RW  | EL2 translation control         |
| `TTBR0_EL2`                                           | 64    | 2+  | RW  | EL2 translation table base 0    |
| `MAIR_EL2`                                            | 64    | 2+  | RW  | EL2 memory attributes           |
| `VBAR_EL2`                                            | 64    | 2+  | RW  | EL2 exception vector base       |
| `ESR_EL2`                                             | 64    | 2+  | RW  | EL2 exception syndrome          |
| `FAR_EL2`                                             | 64    | 2+  | RW  | EL2 fault address               |
| `ELR_EL2`                                             | 64    | 2+  | RW  | EL2 exception link register     |
| `SPSR_EL2`                                            | 64    | 2+  | RW  | EL2 saved program status        |
| `CPTR_EL2`                                            | 64    | 2+  | RW  | EL2 architectural trap control  |
| `HCR_EL2`                                             | 64    | 2+  | RW  | hypervisor configuration        |

The full future register table belongs in appendix `design/sysregs.md` (TBD;
populated from ARM ARM D17 - System Register Encoding). Until then, named
system-register completion is generated only from the compiler table above.

---

### Design Rationale

| Choice                                               | Reason                                                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bare identifier register names                       | One-to-one with ARM ARM mnemonics. No string quoting overhead. No `@`-prefix collision with intrinsic identifiers.                                                                    |
| Dedicated namespace recognized only in `%mrs`/`%msr` | Allows a register's bitfield type to share its name without ambiguity (`TCR_EL1` is both a type and a register name).                                                                 |
| Always-`u64` return type                             | No coupling between sysreg table and type-name lookup. Explicit `as` matches §1.4.1 strict typing.                                                                                    |
| Read-only / write-only enforced at compile time      | Eliminates a class of `#asm`-mediated mistakes that previously could only be caught at runtime by a synchronous abort.                                                                |
| No implicit `isb` or barriers                        | The architecture defines distinct synchronization sequences per register (`isb` after `sctlr`, `dsb`+`isb` after `ttbr`/`tlbi`); the compiler cannot pick the right one mechanically. |
| Separate `%daif_set` / `%daif_clr`                   | These take immediates, not register values. Folding them into generic `%msr` would lie about the operand type.                                                                        |
| `%mrs_s` / `%msr_s` for implementation-defined       | Real silicon needs vendor registers. The S-encoded form is standard ARM assembler syntax; lifting it into the language keeps `#asm` reserved for genuinely unstructured cases.        |
| Full two-way compiler fence on every access          | System-register writes can change translation, exception routing, cache behavior, etc. Treating them as opaque-effect is the only safe default.                                       |

---

## 1.3.4 Trap and Exception Intrinsics

Synchronous exceptions are the boundary between EL0 user code and EL1
kernel code, between EL1 kernel and EL2 hypervisor, and between
non-secure and secure worlds. Every system call, every hypervisor call,
every monitor call, every brk-trap debugger interaction lowers to one of
the six ARM64 trap instructions. Wyst provides direct intrinsics for each
so trap-call sites are not stuck in `#asm`.

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

If the platform's ABI preserves more registers than AAPCS caller-saved
suggests (some hypervisor calls, some firmware interfaces), wrap the
intrinsic in `#asm` with a narrower clobber list.

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

<!-- wyst-contract: sketch -->
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

---

### Worked Examples

#### Linux syscall shim

<!-- wyst-contract: sketch -->
```wyst
linux_syscall :: (nr : u64 #pin(x8), a0 : u64 #pin(x0), a1 : u64 #pin(x1), a2 : u64 #pin(x2)) -> u64 #pin(x0) {
  %svc(0)
  return
}
```

#### Software breakpoint with code

<!-- wyst-contract: sketch -->
```wyst
debug_trap :: () {
  %brk(0xDEAD) // attach a debugger to inspect
}
```

#### PSCI CPU_OFF call (EL1 → EL3 via HVC if virtualized, SMC if firmware)

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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
| Compile-time immediate                | `svc`/`brk` immediates are part of the instruction encoding. Runtime values would require a `#asm` block anyway.                                                                                        |
| AAPCS caller-saved clobber by default | Matches what GCC/Clang emit for plain `asm("svc #0")`. Conservative; OS-specific handlers preserving more can be wrapped.                                                                               |
| `%eret` operand-less                  | ARM ARM matches; users see exactly which `%msr` calls set up the return state. Hiding them inside `%eret` would obscure the elr/spsr configuration.                                                     |
| `%eret` is `#noreturn`                | Eliminates a class of "fell through `%eret`" bugs where the compiler thinks control continues. Composes with the function-attribute system.                                                             |
| EL gating at compile time             | Many trap misuses (HVC from EL0, ERET from EL0) are statically detectable. Catching them at compile time beats a runtime synchronous abort with no source location.                                     |
| `%hlt` included                       | Debugger / semihosting interfaces use HLT; it's part of the trap-family surface even though kernel code rarely uses it directly.                                                                        |

---

## 1.3.5 Cache and TLB Maintenance Intrinsics

Bringing up an MMU, mapping a new page, modifying executable code,
managing DMA-coherent buffers — all require explicit cache and TLB
maintenance on ARM64. Wyst provides one intrinsic per architectural
maintenance instruction; the canonical synchronization sequences are
documented as worked examples rather than hidden inside the intrinsics.

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
```wyst
invalidate_va :: (va : u64) {
  %dsb(ishst) // wait for prior page-table store to be observable
  %tlbi_vaae1is(va) // broadcast invalidation to all PEs
  %dsb(ish) // wait for the invalidation to complete everywhere
  %isb() // local pipeline sync
}
```

#### Flush a single cache line back to memory (for DMA-out)

<!-- wyst-contract: sketch -->
```wyst
flush_for_dma :: (addr : u64) {
  %dc_cvac(addr)
  %dsb(sy) // wait until the clean reaches the PoC and the DMA device
}
```

#### Invalidate before a DMA-in read

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

## 1.3.6 CPU Hint Intrinsics

The ARM64 hint instructions communicate scheduling information to the CPU
— wait for a wakeup, signal other PEs, yield to a SMT sibling, take no
action. They appear throughout boot code, idle loops, spinlocks, and
exception handlers; they are first-class intrinsics in Wyst.

<!-- wyst-contract: sketch -->
```wyst
%wfi()        // wait for interrupt — CPU enters low-power state until an interrupt
%wfe()        // wait for event — CPU enters low-power state until an event
%sev()        // send event to all PEs in the inner-shareable domain
%sevl()       // send event, local PE only
%yield()      // hint that the current thread can yield to a sibling SMT thread
%nop()        // no operation — one instruction's worth of nothing
```

All six lower to a single ARM hint instruction and have no operands. They
do not act as compiler memory fences and may be freely scheduled relative
to memory operations — they are pure CPU-scheduling hints with no
memory-model effect.

| Intrinsic  | Lowering | Compiler fence |
| ---------- | -------- | -------------- |
| `%wfi()`   | `wfi`    | none           |
| `%wfe()`   | `wfe`    | none           |
| `%sev()`   | `sev`    | none           |
| `%sevl()`  | `sevl`   | none           |
| `%yield()` | `yield`  | none           |
| `%nop()`   | `nop`    | none           |

`%wfi` requires an interrupt to be deliverable to wake the PE — typically
this means at least one of IRQ/FIQ is unmasked at the time of the
instruction, or the interrupt is configured to wake the PE regardless of
mask state via the GIC. `%wfe` wakes on the broader "event" condition,
which includes `sev`/`sevl` from any PE in the shareable domain _and_ any
unlocked `stxr` operation completing.

The spinlock pattern at §1.3.2 uses `%wfe()` in the wait loop and `%sev()`
in the unlock path; this is the canonical use.

`%nop()` is occasionally useful for alignment padding when explicit
control is needed (the `#exception_vector` slot padding is otherwise
automatic — see [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md)).

There is no design rationale beyond "these are ARM hint instructions; they
get one intrinsic each." The interesting design choices are above this
layer.

---

### `%compiler_barrier` — Compiler Memory Fence

<!-- wyst-contract: sketch -->
```wyst
%compiler_barrier()
```

`%compiler_barrier()` is a statement-level full two-way compiler memory
fence. The compiler must not move loads, stores, atomics, volatile accesses,
runtime primitives with side effects, or opaque `#asm` blocks across it in
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

## 1.3.7 Per-CPU and Thread-Local Data

A kernel needs a way to declare data that has one instance per logical
CPU (per-CPU variables — current-running-thread pointer, idle stats,
softirq queues) and a user runtime needs a way to declare data that has
one instance per thread (TLS — errno, thread-local caches). ARM64
provides two dedicated thread/CPU pointer registers — `TPIDR_EL1` for
EL1 kernel use and `TPIDR_EL0` for EL0 user use — and Wyst lifts both
into the language as declaration attributes.

<!-- wyst-contract: sketch -->
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

### Declaration

<!-- wyst-contract: sketch -->
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

### Access

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
```wyst
peek_remote_counter :: (cpu : u32) -> u64 {
  base : @u8 = percpu_base_for_cpu(cpu) as.address @u8
  addr : @u64 = (base + #percpu_offset_of(my_counter)) as.lens @u64
  return u64@[addr]
}
```

`#tls` accesses are symmetric, using `TPIDR_EL0` and `#tls_offset_of`.

---

### Layout

The layout module must declare the `.percpu` and `.tls` sections (see
[chapter-04-modules.md](chapter-04-modules.md)) for the symbols to have a home. Common practice:

<!-- wyst-contract: sketch -->
```wyst
#section .text : align = 16, in = rom
#section .rodata : align = 16, after = .text
#section .data : align = 8, after = .rodata
#section .percpu : align = 64, after = .data // master copy in image
#section .bss : align = 16, in = ram
#section .tls : align = 16, in = ram // master copy for TLS
```

The compiler additionally exports the section size for runtime use:

<!-- wyst-contract: sketch -->
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

### ARM64 Lowering

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

### Design Rationale

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

## 1.3.8 Performance Intrinsics

Performance intrinsics expose ARM64 hardware hints and counters that have
no effect on program correctness but influence cache behaviour, memory
ordering visibility, and measurement. None of these intrinsics are compiler
fences unless stated otherwise.

---

### `%prefetch` — Cache Prefetch Hint

<!-- wyst-contract: sketch -->
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
pure hint: it may be freely reordered relative to all other operations by
any `#schedule` mode. It never traps, never clobbers registers, and never
modifies memory.

**Example:**

<!-- wyst-contract: sketch -->
```wyst
// Prefetch the next cache line while processing the current element.
// The prefetch overlaps with the computation below.
%prefetch(ptr + 64, read, high)
sum += u64@[ptr]
```

---

### `%ldnp` / `%stnp` — Non-Temporal Load/Store Pair

<!-- wyst-contract: sketch -->
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

<!-- wyst-contract: sketch -->
```wyst
// Streaming copy: data is read once and written once with no reuse.
(a, b) := %ldnp(src)
%stnp(dst, a, b)
```

---

### `%read_cycle_counter` — Cycle Counter Read

<!-- wyst-contract: sketch -->
```wyst
%read_cycle_counter() -> u64
```

Reads the ARM64 performance cycle counter. Returns the current value of
`PMCCNTR_EL0` when the PMU is enabled, or `CNTVCT_EL0` (the generic
timer counter) as a fallback when the `#target` does not declare PMU
support.

**Effects:** Full two-way compiler memory fence. The compiler must not
reorder loads or stores across a `%read_cycle_counter` call. This prevents
the compiler from moving measured work outside the timing window.

**Effect category:** `perf_counter`.

**Hardware requirements:** `PMCCNTR_EL0` is readable from EL0 only when
enabled via `PMUSERENR_EL0.EN = 1` and `PMCR_EL0.E = 1`. At EL1 and
above, the counter is always accessible. The compiler does not check or
enforce counter enablement — reading a disabled counter returns zero or
enters `Architectural fault or trap`, depending on the selected target and
current PMU state.

**ARM64 lowering:**

| PMU available | Instruction           |
| ------------- | --------------------- |
| yes           | `mrs xN, PMCCNTR_EL0` |
| no (fallback) | `mrs xN, CNTVCT_EL0`  |

PMU availability is determined by the `#target(features = ...)` declaration.

**Example:**

<!-- wyst-contract: sketch -->
```wyst
start := %read_cycle_counter()
compute(data)
end := %read_cycle_counter()
elapsed := end - start
```

**Note:** `%read_cycle_counter` is the first PMU-related performance
intrinsic. Future versions may add `%read_pmu_counter(idx : u32)` for
access to general-purpose PMU counters (e.g. cache-miss, branch-miss
event counts).

---

### Design Rationale

| Choice                                          | Reason                                                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `%prefetch` exposed directly, not auto-inserted | Auto-prefetching is a compiler transformation Wyst does not perform. Explicit prefetch lets the programmer control the distance and policy. |
| Full ARM64 `PRFM` coverage                      | ARM64 distinguishes load/store × three cache levels × keep/stream. Abstracting to fewer options would hide machine semantics.              |
| `%ldnp`/`%stnp` as pairs                        | ARM64 `LDNP`/`STNP` are pair instructions — exposing single-element non-temporal ops would require synthetic pair construction.            |
| `%read_cycle_counter` is a full fence           | Without the fence, the compiler could move loads/stores into or out of the timed region, producing misleading measurements.                |
| `CNTVCT_EL0` fallback                           | Many user-space environments disable `PMCCNTR_EL0`. The generic timer is always available and provides monotonic, high-resolution timing.  |
