---
title: "Chapter 9: Wyst Memory Model"
group: chapter
chapter: 9
order: 9
summary: "Normal memory, volatile memory, atomics, barriers, ordering, agents, and happens-before."
---

# Chapter 9: Wyst Memory Model

> **Canonical scope.** ARM64 register model (§1.1), load/store
> architecture (§1.2), memory interpretation model (§1.3), memory
> access directives and volatility (§1.3.1), and the full memory
> model — execution model, compiler ordering rules, happens-before,
> visible-value-of-a-load, data races, atomicity, and interrupt handler
> ordering.
>
> Atomic runtime primitives live in [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md);
> address types and conversion rules live in [chapter-06-types.md §1.4.1](chapter-06-types.md);
> inline assembly fence semantics live in [chapter-08-functions.md §2.9](chapter-08-functions.md).

The memory model defines ordering for normal and volatile memory,
acquire/release operations, atomics, barriers, agents, and happens-before.
Its address and access dependencies are linked above.

---

### ARM64 Semantic Foundations

---

## 1.1 ARM64 Register Model

ARM64 is fundamentally register-oriented. Wyst surfaces this register file
as a set of **reserved tokens** rather than as a set of variables. The
register allocator owns variable-to-register mapping; the programmer
expresses register affinity only via `#pin` (section 2.3) and manipulates
registers directly only inside `#asm` blocks (section 2.9).

General-purpose:

```text
x0-x30   64-bit
w0-w30   lower 32-bit views
sp,wsp   stack pointer
xzr,wzr  zero register
lr       alias for x30
fp       alias for x29
ip0,ip1  aliases for x16, x17 (linker scratch)
```

SIMD/FP:

```text
v0-v31   128-bit vectors
q0-q31   128-bit views
d0-d31   f64 / lower 64-bit views
s0-s31   f32 / lower 32-bit views
h0-h31   f16 / lower 16-bit views
b0-b31   lower 8-bit views
```

These tokens are reserved by the lexer. Using one as a variable, parameter,
constant, function, struct field, or label name is a syntax error. They may
appear only:

1. As the argument of a `#pin(...)` directive on a declaration.
2. Inside the body of an `#asm { ... }` block.

A Wyst statement like:

<!-- wyst-contract: sketch -->
```wyst
x0 = x1 + x2
```

is rejected. Add is expressed by writing variables:

<!-- wyst-contract: sketch -->
```wyst
a : u64 = 1
b : u64 = 2
c : u64 = a + b // lowers to `add xD, xA, xB` for whichever GPRs the allocator picks
```

If the operation must use specific registers (firmware contract, fixed ABI),
pin the variables:

<!-- wyst-contract: sketch -->
```wyst
a : u64 #pin(x1) = 1
b : u64 #pin(x2) = 2
c : u64 #pin(x0) = a + b   // guaranteed `add x0, x1, x2`
```

If the operation must be emitted as a literal instruction (the rest of the
function is also hand-scheduled, or the encoding is load-bearing), use `#asm`:

<!-- wyst-contract: sketch -->
```wyst
#asm {
    body { add x0, x1, x2 }
}
```

---

## 1.2 Load/Store Architecture

ARM64 is a load/store ISA.

Arithmetic only operates on registers.

Memory access must be explicit.

Traditional ARM64:

```asm
ldr x0, [x1]
add x0, x0, #5
str x0, [x1]
```

Wyst preserves this explicitly.

<!-- wyst-contract: check-pass -->
```wyst
#module memory_demo

read_word :: (addr : @u64) -> u64 {
  return u64@[addr]
}
```

---

## 1.3 Memory Interpretation Model

This is one of Wyst's defining ideas.

Wyst does not elevate addresses into:

- ownership objects
- provenance-tracked references
- hidden pointer abstractions
- named address spaces

Addresses are typed values (`@T`) with a 64-bit machine representation,
interpreted through typed memory syntax. They are distinct from `u64`
(conversion requires `as`); source arithmetic on them is element-scaled.
The element type `T` records the stride used by plain `+` and `-`.
The formal rules live in [chapter-06-types.md §1.4.1](chapter-06-types.md) (Address Types subsection); this
section introduces the surface form.

ARM64 has a flat virtual address space. The only hardware distinction is:

- **Normal memory** — cached, reorderable
- **Device memory** — uncached, ordered, side-effecting

The ordering semantics of memory operations — what the compiler may reorder, what values
a load may return in the presence of concurrent stores, and how agents synchronize — are
specified in this chapter.

### Normal Access

Canonical form:

```text
type[address]
```

Examples:

<!-- wyst-contract: sketch -->
```wyst
mem : @u64 = 0x4000

x := u64@[mem]     // load: read u64 from address in mem
                  // x's type is inferred as u64 from the load

u64@[mem] = x     // store: write x to u64 at address in mem
```

The type of `x` is inferred from the load. Explicit annotation is also valid:

<!-- wyst-contract: sketch -->
```wyst
x : u64 = u64@[mem]
```

These are equivalent. The `:=` shorthand is simply `:` and `=` without whitespace.

### Volatile and MMIO-Intent Access

Volatility is a compiler-visible access contract on the **address type**.
There is no per-access `#volatile` directive in Wyst: declare the address as
`@volatile T` when every load or store through that value must be observable to
the compiler and protected from elision, merging, or reordering across other
compiler-visible memory effects.

`@mmio T` is a separate, greppable address form for programmer intent that the
address denotes MMIO. It carries the same volatile-access contract as
`@volatile T`, and accesses through it additionally introduce the `mmio` effect.
Neither `@volatile T` nor `@mmio T` proves that the address is mapped as ARM
Device memory. Normal-vs-Device memory type is established by page tables,
firmware, or platform configuration; target descriptions may record known
mapping facts, but a type conversion cannot create them.

<!-- wyst-contract: sketch -->
```wyst
UARTFR : @mmio u32 = 0x0900_0018
UARTDR : @mmio u32 = 0x0900_0000

status = u32@[UARTFR]      // volatile MMIO-intent load
u32@[UARTDR] = byte        // volatile MMIO-intent store
```

A volatile access is a **compiler barrier**. The compiler may not:

- eliminate the access (no dead store elimination, no load forwarding)
- hoist the access above surrounding code
- sink the access below surrounding code
- merge multiple accesses to the same address
- speculatively execute the access ahead of a guard condition

Two volatile accesses are never reordered with respect to each other.
A plain access may not be moved across a volatile access in either direction.

**Volatility does not emit CPU memory barriers.** ARM64's weak memory model
allows the CPU's store buffer to reorder writes to different addresses unless
explicit barrier instructions are present. For MMIO sequences where access
order must be observed by the device, use `%dsb` or `%dmb` between writes.
See section 1.3.1 for barrier runtime primitives and MMIO ordering patterns.

**Volatility and MMIO intent do not control cacheability.** Whether an address
is cached or uncached is determined by the page-table entry for that address
(specifically the MAIR index and the memory type attribute in the descriptor).
A volatile or MMIO-intent access to an address mapped as Normal-Cacheable in the
page tables will still go through the cache. Platform initialization code is
responsible for configuring MMIO regions with Device memory attributes
(e.g. Device-nGnRE) before accessing them.

### Address Types

Addresses are typed as `@T` — an address into elements of type `T`. This applies to **any** type with a compile-time-known size:

#### Integer Addresses

<!-- wyst-contract: sketch -->
```wyst
@u8   // address into u8s   (element stride 1)
@u16  // address into u16s  (element stride 2)
@u32  // address into u32s  (element stride 4)
@u64  // address into u64s  (element stride 8)
```

The "stride N" annotation describes what one _element_ occupies, and source
address arithmetic scales by that stride. `(p : @u32) + 1` is `p` advanced by
one `u32` element, or four bytes. To step in raw bytes, convert to `@u8` with
`as.lens` or use explicit numeric `u64` arithmetic. The formal arithmetic rules are in
[chapter-06-types.md §1.4.1](chapter-06-types.md) (Address Types subsection).
Do not write `p + i * #size_of(T)` for element `i`; that double-scales the
offset. The three distinct operations are `element_offset(p, i)` (`p + i`),
`byte_offset(p, bytes)` (`(p as.lens @u8) + bytes` or explicit `u64` arithmetic),
and `field_addr(p, T.field)` (`(p as.lens @u8) + #field_offset(T, field)` before an
explicit `as.lens` conversion to the field address lens).

#### Volatile and MMIO-Intent Addresses

The qualifier `@volatile T` marks an address with the volatile-access compiler
contract. The qualifier `@mmio T` marks the same access contract plus programmer
intent that the numeric address denotes an MMIO register or region. Every load
or store through either qualified address is a compiler barrier (see section
1.3.1). Only access through `@mmio T` introduces the `mmio` effect. Qualifiers
propagate through address arithmetic:

<!-- wyst-contract: sketch -->
```wyst
GIC_BASE_BYTES : @mmio u8 = 0x0800_0000
GICD_CTLR      : @mmio u32 = (GIC_BASE_BYTES + 0) as.lens @mmio u32
GICD_TYPER     : @mmio u32 = (GIC_BASE_BYTES + 4) as.lens @mmio u32

u32@[GICD_CTLR] = 1              // volatile MMIO-intent store
mask = u32@[GICD_TYPER]           // volatile MMIO-intent load at byte offset 4
```

There is no implicit conversion among `@T`, `@volatile T`, and `@mmio T` in any
direction. Stripping volatility or MMIO intent requires an explicit
`as.qualifier` conversion and emits a warning; adding either qualifier also
requires an explicit `as.qualifier` conversion.
These are visible source events and do not perform memory access by themselves.

Volatility is determined only by the static address type at the memory-access
site. A load or store through an expression of type `@T` is a plain access; a
load or store through an expression of type `@volatile T` or `@mmio T` is a
volatile access. Access through `@mmio T` additionally records MMIO intent.
This access-site rule does not create separate alias classes. A plain access
through `@T`, a volatile access through `@volatile T`, and an MMIO-intent access
through `@mmio T` may alias when their numeric address ranges can overlap,
including when one address was produced by casting the other.

#### Float Addresses

<!-- wyst-contract: sketch -->
```wyst
@f32  // address into f32s (stride 4)
@f64  // address into f64s (stride 8)
```

Float loads and stores use the same `type[address]` syntax:

<!-- wyst-contract: sketch -->
```wyst
addr : @f32 = 0x5000

val := f32@[addr]          // load f32
f32@[addr] = val           // store f32
```

#### Struct Addresses

<!-- wyst-contract: sketch -->
```wyst
// `string` is a built-in value with this representation:
// { data : @u8, len : u64 }

@string  // address into strings (stride 16)
```

Struct stride is the total size of the struct (sum of field sizes including padding). Addressing structs lets you treat contiguous struct data as an array:

<!-- wyst-contract: sketch -->
```wyst
msgs : @string = 0x6000

first_len_addr  : @u64 = ((msgs as.lens @u8) + #field_offset(string, len)) as.lens @u64
second_len_addr : @u64 = (((msgs + 1) as.lens @u8) + #field_offset(string, len)) as.lens @u64

first_len  := u64@[first_len_addr]
second_len := u64@[second_len_addr]
```

#### Vector Addresses

<!-- wyst-contract: sketch -->
```wyst
@[f32:4]  // address into [f32:4] vectors (stride 16)
@[u8:16]  // address into [u8:16] vectors (stride 16)
@[u64:2]  // address into [u64:2] vectors (stride 16)
```

Vector addresses follow the same model — stride equals the total vector size.

The element type records the intended access type. Array and slice indexing
syntax is a separate operation; `@T` address arithmetic uses element offsets:

<!-- wyst-contract: sketch -->
```wyst
base : @u64 = 0x4000

total += u64@[base + i]
```

### MMIO Example

<!-- wyst-contract: sketch -->
```wyst
UARTFR : @mmio u32 = 0x0900_0018
UARTDR : @mmio u32 = 0x0900_0000
TXFF   :: u32          = 1 << 5

while u32@[UARTFR] & TXFF != 0 {
    %nop()
}

u32@[UARTDR] = byte
```

MMIO intent and volatility come from the address type. No per-access directive
can be forgotten, and the type does not replace the runtime page-table setup
that maps the UART region as Device memory.

### Why This Model Exists

This syntax unifies:

- loads
- stores
- arrays
- MMIO
- volatile memory
- typed access
- pointer arithmetic

without introducing separate pointer semantics or named address spaces.

Advantages:

- smaller semantic core
- direct ARM64 mapping
- clearer lowering rules
- easier explainability
- matches hardware reality (flat address space)

Tradeoffs:

- harder alias analysis
- harder provenance tracking
- more compiler responsibility

Wyst intentionally favors semantic clarity over optimizer complexity.

---

## 1.3.1 Memory Access Directives and Volatility

Wyst distinguishes four orthogonal mechanisms for controlling memory
operations:

| Mechanism                | Form                             | Scope                                      |
| ------------------------ | -------------------------------- | ------------------------------------------ |
| Volatile access contract | `@volatile T` or `@mmio T` type  | every access through the typed address     |
| MMIO intent              | `@mmio T` type                   | every access through the typed address     |
| Synchronization ordering | `#acquire`/`#release` per access | one load or one store                      |
| CPU memory ordering      | `%dsb`/`%dmb`/`%isb()` barrier   | hardware and compiler fence at one point   |
| Compiler-only ordering   | `%compiler_barrier()`            | compiler fence at one point; emits nothing |

Volatility is **always** type-based. There is no per-access `#volatile`
directive in Wyst. Acquire/release are per-access because synchronization
sites are rare and explicit. Barriers are statement-level fences.

---

### Volatility via `@volatile T`

An address of type `@volatile T` carries a compiler-visible access contract,
not a page-table memory-type fact. Every load or store through such an address
is a **compiler barrier**:

- the compiler may not eliminate the access (no dead-store elimination,
  no load forwarding, no merging of consecutive accesses);
- the compiler may not hoist the access above surrounding code;
- the compiler may not sink the access below surrounding code;
- the compiler may not speculatively execute the access ahead of a guard.

Two volatile accesses are never reordered relative to each other. A plain
access may not be moved across a volatile access in either direction.

<!-- wyst-contract: sketch -->
```wyst
READY_FLAG : @volatile u32 = 0x8000_1000

status = u32@[READY_FLAG]      // volatile load — guaranteed emitted
u32@[READY_FLAG] = status | 1  // volatile store — guaranteed emitted
```

A volatile access lowers to the same `ldr`/`str` instruction as a plain
access. The "device" behavior comes from the page-table attributes for the
address, not from the instruction encoding. Volatility is a compiler
contract, not a hardware contract — it guarantees the compiler does not
optimize the access away.

#### Propagation

Volatility propagates through address arithmetic. If `p : @volatile u32`, then
`p + 4` is `@volatile u32` at element offset 4, which means byte address
`p + 16`. Use `p + 1` for the next `u32` element, or cast through `@volatile u8`
when a byte view is needed. Any access through the derived address is a
compiler barrier:

<!-- wyst-contract: sketch -->
```wyst
STATUS_WORDS  : @volatile u32 = 0x8000_1000

u32@[STATUS_WORDS + 0]  = 1             // volatile store, element offset 0
mask = u32@[STATUS_WORDS + 1]           // volatile load, element offset 1

STATUS_BYTES : @volatile u8 = STATUS_WORDS as.lens @volatile u8
type_addr : @volatile u32 = (STATUS_BYTES + 4) as.lens @volatile u32
same_mask = u32@[type_addr]         // same address, byte offset spelled explicitly
```

Volatility and MMIO intent are properties of the static result type of the
arithmetic expression. If an integer operand was produced from an address with
`as.address u64`, the source address's qualifiers must match the result address
qualifiers. Mixed-qualifier address arithmetic is rejected unless the source
first casts one address to the intended qualifier:

<!-- wyst-contract: sketch -->
```wyst
device : @mmio u32 = 0x0900_0000
plain : @u32          = 0x8000_0000

bad  := device + (plain as.address u64)                 // compile error
good := device + ((plain as.qualifier @mmio u32) as.address u64) // result is @mmio u32
```

There is no implicit conversion among `@T`, `@volatile T`, and `@mmio T` in any
direction. To strip volatility or MMIO intent use an explicit `as.qualifier`
conversion, which emits a warning. To treat a plain address as volatile or
MMIO-intent, use an explicit `as.qualifier` conversion as well. These
conversions do not perform an access and do not introduce
`volatile_access` or `mmio` effects until a later load or store:

<!-- wyst-contract: sketch -->
```wyst
device : @mmio u32 = 0x0900_0018
plain := device as.qualifier @u32             // qualifiers dropped; loads through `plain` are not barriers
volatile_only := device as.qualifier @volatile u32

ram : @u32 = 0x8000_0000
volatile_view := ram as.qualifier @volatile u32
device_view := ram as.qualifier @mmio u32
```

The static address type at the access site decides whether the access is
plain, volatile, or MMIO-intent, but it is not an alias boundary. If `plain`
and `device` hold the same numeric address, the compiler must assume
`u32@[plain]` and `u32@[device]` may touch the same bytes even though one
access is plain and the other is volatile with MMIO intent.

### MMIO Intent via `@mmio T`

`@mmio T` is the source-level marker for an address that the programmer intends
to use as memory-mapped I/O. It is intentionally separate from the architectural
memory type:

- converting an address to `@mmio T` records intent but does not perform MMIO;
- loading or storing through `@mmio T` introduces both `volatile_access` and
  `mmio` effects;
- target descriptors may report known Device-memory ranges, but those facts are
  mapping facts, not type conversions;
- the runtime or platform remains responsible for configuring page tables with
  Device memory attributes before MMIO is accessed.

#### What `@volatile` and `@mmio` Do Not Do

**Volatility does not emit CPU memory barriers.** ARM64's weak memory model
allows the CPU's store buffer to reorder writes to different addresses unless
explicit barrier instructions are present. For MMIO initialization sequences
where access order must be observed by the device, explicit barriers are
required. See **MMIO Ordering** below.

**Volatility and MMIO intent do not control cacheability.** Whether an address
is cached or uncached is determined by the page-table entry for that address
(specifically the MAIR index and the memory type attribute in the descriptor).
A volatile or MMIO-intent access to an address mapped as Normal-Cacheable in the
page tables will still go through the cache. Platform initialization code is
responsible for configuring MMIO regions with Device memory attributes
(e.g. Device-nGnRE) before accessing them.

---

### `#acquire`

`#acquire` is a load-acquire. It guarantees that all subsequent memory
accesses in program order are observed after this load. Use it to safely
read a lock or flag that another agent (another core, an interrupt handler)
may have written.

<!-- wyst-contract: sketch -->
```wyst
val = #acquire u64@[lock_addr]     // load-acquire
```

Lowers to `ldar xD, [xN]` on ARM64. `#acquire` is only valid on loads —
applying it to a store is a compile error.

`#acquire` is independent of volatility and MMIO intent: it is valid on `@T`,
`@volatile T`, and `@mmio T` addresses, though acquire-on-MMIO is rare and
indicates synchronization through a device register.

---

### `#release`

`#release` is a store-release. It guarantees that all preceding memory
accesses in program order are observed before this store. Use it to safely
write a lock or flag that another agent will subsequently read.

<!-- wyst-contract: sketch -->
```wyst
#release u64@[lock_addr] = 0       // store-release
```

Lowers to `stlr xD, [xN]` on ARM64. `#release` is only valid on stores —
applying it to a load is a compile error.

---

### Combination Rules

| Combination                                  | Validity      | Reason                          |
| -------------------------------------------- | ------------- | ------------------------------- |
| load/store via `@T`                          | valid         | plain access                    |
| load/store via `@volatile T`                 | valid         | volatile (compiler barrier)     |
| load/store via `@mmio T`                     | valid         | volatile plus MMIO intent       |
| `#acquire` on `@T` load                      | valid         | acquire-release synchronization |
| `#release` on `@T` store                     | valid         | acquire-release synchronization |
| `#acquire` on `@volatile T` load             | valid (rare)  | acquire-via-volatile           |
| `#release` on `@volatile T` store            | valid (rare)  | release-via-volatile           |
| `#acquire` on `@mmio T` load                 | valid (rare)  | acquire-via-MMIO-intent         |
| `#release` on `@mmio T` store                | valid (rare)  | release-via-MMIO-intent         |
| `#acquire` on store                          | compile error | acquire is load-only            |
| `#release` on load                           | compile error | release is store-only           |
| Both `#acquire` and `#release` on one access | compile error | mutually exclusive              |

---

### Barrier Runtime Primitives

Barriers enforce memory ordering at the CPU level, independent of any
specific memory access. They are required wherever the ARM64 weak memory
model would otherwise permit the CPU to reorder accesses in ways the program
cannot tolerate.

<!-- wyst-contract: sketch -->
```wyst
%dsb(sy)    // data synchronization barrier — full system
            // stalls until all preceding memory accesses complete
            // lowers to: dsb sy

%dsb(st)    // data synchronization barrier — stores only
            // stalls until all preceding stores complete
            // lowers to: dsb st

%dsb(ld)    // data synchronization barrier — loads only
            // stalls until all preceding loads complete
            // lowers to: dsb ld

%dsb(ish)   // data synchronization barrier — inner shareable domain
            // lowers to: dsb ish

%dsb(osh)   // data synchronization barrier — outer shareable domain
            // lowers to: dsb osh

%dsb(nsh)   // data synchronization barrier — non-shareable domain
            // lowers to: dsb nsh

%dmb(sy)    // data memory barrier — full system
            // orders but does not stall; preceding accesses are ordered
            // before subsequent ones but the CPU need not wait
            // lowers to: dmb sy

%dmb(ish)   // data memory barrier — inner shareable domain
            // lowers to: dmb ish

%isb()      // instruction synchronization barrier
            // flushes the pipeline; required after writing system registers
            // that affect instruction fetch or decode
            // lowers to: isb
```

The accepted `%dsb` and `%dmb` domain tokens are:

| Token family | Meaning |
| ------------ | ------- |
| `sy`         | full-system domain, all explicit memory accesses |
| `st`         | full-system domain, stores only |
| `ld`         | full-system domain, loads only |
| `ish`        | inner-shareable domain, all explicit memory accesses |
| `ishst`      | inner-shareable domain, stores only |
| `ishld`      | inner-shareable domain, loads only |
| `osh`        | outer-shareable domain, all explicit memory accesses |
| `oshst`      | outer-shareable domain, stores only |
| `oshld`      | outer-shareable domain, loads only |
| `nsh`        | non-shareable domain, all explicit memory accesses |
| `nshst`      | non-shareable domain, stores only |
| `nshld`      | non-shareable domain, loads only |

The option tokens match the ARM64 architecture manual shareability/access
domain notation.

`%dsb`, `%dmb`, and `%isb()` are also full two-way compiler memory fences:
the compiler must not move any load, store, atomic, volatile access, barrier,
or opaque side effect across them. This fusion is intentional policy, not an
accident of the current backend. Use `%compiler_barrier()` when source needs
only compiler ordering and must not emit a hardware barrier:

<!-- wyst-contract: sketch -->
```wyst
%compiler_barrier()   // full compiler memory fence; lowers to no instruction
```

`%compiler_barrier()` has no hardware memory-ordering effect. It does not
flush pipelines, drain store buffers, order cache or TLB maintenance, or
create a happens-before edge between agents.

---

### MMIO Ordering

Volatility and MMIO intent alone are not sufficient for MMIO initialization
sequences. On ARM64, the CPU store buffer may reorder stores to different addresses. A
device that requires its configuration registers to be written in a specific
order requires explicit barriers between those writes.

<!-- wyst-contract: sketch -->
```wyst
UART_CR : @mmio u32 = 0x0900_0030
UART_IBRD : @mmio u32 = 0x0900_0024
UART_FBRD : @mmio u32 = 0x0900_0028
```

**Incorrect** (CPU may reorder stores even though every access is volatile):

<!-- wyst-contract: sketch -->
```wyst
u32@[UART_CR]   = 0x0       // disable UART
u32@[UART_IBRD] = 1         // set baud divisor integer
u32@[UART_FBRD] = 40        // set baud divisor fraction
u32@[UART_CR]   = 0x301     // re-enable UART
```

**Correct** (barriers enforce hardware observation order):

<!-- wyst-contract: sketch -->
```wyst
u32@[UART_CR] = 0x0         // disable UART
%dsb(sy)                   // wait until disable is observed
u32@[UART_IBRD] = 1
u32@[UART_FBRD] = 40
%dsb(sy)                   // wait until baud writes complete
u32@[UART_CR] = 0x301       // re-enable UART
```

Use `%dsb(sy)` when you need the CPU to stall until all preceding stores
are globally observed. Use `%dmb(sy)` when ordering is required but
the stall is not — for example, in a sequence of independent register
writes where ordering relative to subsequent code matters but latency
between the writes themselves does not.

---

### Spinlock Example

A complete acquire/release spinlock using `%cas` for the compare-and-swap
and `#release` for the unlock store. `%cas` lowers to a single `casa`
instruction on ARMv8.1 LSE or an `ldaxr`/`stxr` loop on baseline ARMv8.0.

<!-- wyst-contract: sketch -->
```wyst
LOCK_ADDR :: @u64 = 0x8000

spin_lock :: () {
  loop {
    _, ok := %cas(LOCK_ADDR, 0 as.numeric u64, 1 as.numeric u64, order:acquire)
    if ok {
      return
    }
    %wfe()
  }
}

spin_unlock :: () {
  #release u64@[LOCK_ADDR] = 0 // store-release clears the lock
  %sev() // wake any waiters
}
```

This is the canonical spelling. An equivalent open-coded
`ldaxr`/`stlxr` version appears at §2.9 as a worked example of `#asm`
operand interpolation, but production code uses `%cas`. The full atomic
runtime primitive surface — `%cas`, `%fetch_*`, `%xchg`, `%atomic_bit_*`,
`%atomic_load`, `%atomic_store` — is specified in [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md).

---

### Relationship to `#schedule`

Volatile accesses are implicitly `#schedule(strict)` relative to other
volatile accesses — the compiler will not reorder them relative to each
other. This is a **compiler scheduling** constraint only. It does not prevent
CPU reordering at the hardware level; use `%dsb` or `%dmb` for that.

`#acquire` and `#release` establish ordering at the hardware level via
`ldar`/`stlr`; they do not constrain assembler scheduling of non-memory
operations.

---

### Why Volatility Lives in the Type

Per-access `#volatile` directives have a known failure mode: a single
forgotten annotation silently miscompiles, and the compiler issues no
warning because both forms are legal at every access site. Wyst rejects
that model. Volatility and MMIO intent are properties of _what the address
value is meant to access_, not _how a particular line of code touches it_.
Modelling them in the type makes the rule check-able:

- A function `read_reg(p : @volatile u32) -> u32` cannot be called with
  a plain `@u32` argument without an explicit categorized conversion.
- A function `peek(p : @u32) -> u32` cannot be called with an
  `@volatile u32` argument without an explicit categorized conversion.
- A function `read_mmio(p : @mmio u32) -> u32` cannot be called with a plain or
  volatile-only address without an explicit `as.qualifier @mmio u32` conversion.
- A struct field declared `@volatile u32` or `@mmio u32` cannot be accessed as
  if it were a plain `u32`.
- Refactoring an MMIO access into a helper preserves MMIO intent through the
  parameter type.

Code review can focus on the type declaration site, not on every access.

---

### Memory Model

---

## Overview

Wyst's memory model is language-level: it describes source executions before
production SMP runtime policy is added. It defines which values loads may
observe, which operations synchronize across agents, how barriers participate
in ordering, and which compiler transformations are legal.

The model has three distinct orders:

1. **Source event order**: the evaluation order required by Wyst source inside
   one execution agent.
2. **Compiler event order**: the order of memory and effect events in the
   emitted instruction stream after optimization.
3. **Architectural event order**: the order in which the selected target may
   make those emitted events visible to agents under the target memory model.

The compiler may change compiler event order only when the transformation is
allowed by this chapter. The architecture may still observe events in an order
permitted by ARM64 unless Wyst emits acquire, release, `seq_cst`, or barrier
instructions that constrain it. Where ARM64 terminology is used (inner
shareable, outer shareable, full system, Device memory, Normal memory), it
carries the ARM64 Architecture Reference Manual meaning.

---

## 9.1 Execution Model

### Agents

An **execution agent** is any unit of sequential execution that shares memory
with others:

- a hardware CPU core;
- an interrupt handler executing on a CPU core;
- a DMA controller or other bus master that can read or write system memory;
- an external device that owns or updates MMIO-visible state.

Each agent has a **source event order**: the order induced by Wyst evaluation
rules in [chapter-07-operators.md](chapter-07-operators.md), statement order,
and control flow. For an assignment, the address/storage-target side precedes
the assigned value. For a call, argument effects are ordered left-to-right
before the call effect.

### Memory Locations and Access Ranges

A **byte location** is one byte of addressable memory. An **access range** is
the contiguous byte range touched by one source load, store, or atomic
operation. Two events **conflict** when their access ranges overlap and at
least one event writes.

A **coherence location** is the exact access range of an access-atomic scalar
or atomic operation. Naturally aligned `u8`/`i8`, `u16`/`i16`, `u32`/`i32`,
`u64`/`i64`, address-width, `f32`, and `f64` scalar accesses are
access-atomic as described in §9.6. Wider aggregate, pair, vector, and
misaligned accesses are modeled as a deterministic sequence of smaller memory
events; each sub-event has its own access range.

### Memory Events

The model recognizes these source memory events:

| Event kind | Wyst surface | Writes? | Synchronizing? |
| --- | --- | --- | --- |
| Plain load | `T@[addr]` where `addr : @T` | no | no |
| Plain store | `T@[addr] = val` where `addr : @T` | yes | no |
| Volatile load | `T@[addr]` where `addr : @volatile T` | no | compiler-only fence |
| Volatile store | `T@[addr] = val` where `addr : @volatile T` | yes | compiler-only fence |
| MMIO-intent load | `T@[addr]` where `addr : @mmio T` | no | compiler-only fence plus `mmio` effect |
| MMIO-intent store | `T@[addr] = val` where `addr : @mmio T` | yes | compiler-only fence plus `mmio` effect |
| Acquire load | `#acquire T@[addr]` | no | acquire |
| Release store | `#release T@[addr] = val` | yes | release |
| Relaxed atomic load/store | `%atomic_load` / `%atomic_store` with `order: relaxed` | load: no, store: yes | no |
| Seq-cst atomic load/store | `%atomic_load` / `%atomic_store` with `order: seq_cst` | load: no, store: yes | acquire/release plus SC |
| Atomic RMW | `%cas`, `%fetch_*`, `%xchg`, `%atomic_bit_*` | success/RMW: yes; failed `%cas`: no | by `order:` |

An **atomic event** is a `#acquire` load, a `#release` store, a relaxed or
`seq_cst` atomic load/store, or an atomic RMW. Atomic events on the same
coherence location are single-copy atomic and do not tear. A read-modify-write
(RMW) event contains a read part and, when it succeeds or is an unconditional
RMW, a write part. A successful RMW's read and write are adjacent in the
location's modification order. A failed `%cas` is an atomic read with no write.

Volatility is determined only by the static address type at the access site.
Volatile and MMIO-intent accesses are observable compiler events, but they are
not synchronization events unless the access also uses `#acquire`, `#release`,
or an atomic intrinsic order that synchronizes.
An atomic intrinsic whose address operand has type `@volatile T` or `@mmio T`
is both atomic and volatile; `@mmio T` also adds MMIO intent. The strictest
compiler-ordering, synchronizes-with, and data-race rules for the combined
event all apply.

Barrier runtime primitives (`%dsb`, `%dmb`, `%isb()`) and
`%compiler_barrier()` are **barrier events**, not loads or stores. They are in
source event order, constrain compiler event order, and have the hardware
meaning described in §9.9. `%compiler_barrier()` has no architectural event.
`#schedule(strict)` boundaries are compiler scheduling boundaries only.

---

## 9.2 Modification Order, Reads-From, and Coherence

### Modification Order

Every byte location has a **modification order**: a total order of all writes
to that byte, including an initial write representing the byte's startup
contents. For an access-atomic write to a multi-byte coherence location, the
write appears as one indivisible modification of that exact range and as one
write in each covered byte's modification order.

For each coherence location used by atomic events, Wyst also defines a
per-location modification order for that exact byte range, written **mo(X)**.
`mo(X)` is a total order of the initial write, every access-atomic write to X,
and every successful atomic RMW write to X. That includes plain, volatile,
MMIO-intent, `#release`, atomic-store, and RMW writes when they touch the exact
range X as one access-atomic event. Non-access-atomic writes appear only in the
per-byte modification orders for their sub-accesses.

`mo(X)` is consistent with the per-byte modification orders for X. RMW events
are linearized at one point in `mo(X)`: their read part reads the immediately
preceding value in `mo(X)`, and their write part, if any, follows that read
without an intervening write to X. This is what makes the canonical `%cas` lock
/ `#release` unlock pattern a defined synchronization pattern rather than an
illicit mixed access.

### Reads-From

Each load-like event has a **reads-from** relation:

- An access-atomic scalar or atomic load from X reads from exactly one write W
  to X.
- A successful RMW reads from the write immediately before it in `mo(X)`.
- A failed `%cas` reads from one write in `mo(X)` and performs no write.
- A non-access-atomic load reads from one write per sub-access. A wider load
  may therefore observe bytes from different writes.
- A volatile or MMIO-intent load reads from the hardware-presented value at its
  architectural event, subject to the same access-atomic or tearing rules.

The result of a load is assembled from its reads-from write or writes. A
tearing read observes `Indeterminate bits`; those bits become an ordinary typed
value and are never optimizer poison.

### Per-Location Coherence

For one coherence location X, executions must satisfy these coherence rules:

1. If write A to X happens-before write B to X, then A precedes B in `mo(X)`.
2. If write A to X happens-before load L from X, then L may not read from a
   write that precedes A in `mo(X)`.
3. If load L from X reads from write A, and L happens-before write B to X, then
   A precedes B in `mo(X)`.
4. If load L1 from X happens-before load L2 from X, and L1 reads from A while
   L2 reads from B, then B must not precede A in `mo(X)`.

When no conflicting concurrent write exists, a load reads the latest write to
its location that happens-before the load, or the initial write when no such
write exists. When a conflicting concurrent write exists, §9.5 determines
whether the result is target-defined or indeterminate.

---

## 9.3 Synchronizes-With, Happens-Before, and SC Order

### Atomic Order Meanings

Every atomic order has this language-level meaning:

| Order | Language meaning |
| --- | --- |
| `relaxed` | Atomicity and participation in `mo(X)` only. No synchronizes-with edge and no cross-location ordering. |
| `acquire` | The read side is an acquire operation. Later source events in the same agent may not be observed before it. If it reads from a release sequence, it synchronizes with that release sequence's head. |
| `release` | The write side is a release operation. Earlier source events in the same agent may not be observed after it. It can head a release sequence. |
| `acqrel` | RMW-only. The event is both acquire and release; it can synchronize as a read and head or extend a release sequence as a write. |
| `seq_cst` | The event has acquire/release strength as applicable and participates in the single global sequentially consistent order. |

`%atomic_load` supports only `relaxed` and `seq_cst`; acquire loads use
`#acquire`. `%atomic_store` supports only `relaxed` and `seq_cst`; release
stores use `#release`. RMW intrinsics support the full order set.

### Release Sequences

Wyst supports release sequences. A **release sequence** on coherence location X
is the maximal contiguous sequence in `mo(X)` that starts with a release write
or release RMW H and continues through atomic RMW events on X, from any agent,
where each RMW reads from the immediately previous member of the sequence.
Plain stores, relaxed atomic stores, failed `%cas` reads, or writes to another
location end the sequence.

The sequence head H may be a `#release` store, a `seq_cst` store, or a
`release`/`acqrel`/`seq_cst` RMW. RMW operations that extend a release sequence
do not need release ordering themselves; their read-from chain carries the
sequence.

### Synchronizes-With

The **synchronizes-with** relation, written **sw**, contains these edges:

1. A release sequence head H on X synchronizes-with an acquire read A on X when
   A reads from any member of that release sequence. `seq_cst` loads and RMWs
   count as acquire reads; `acquire`, `acqrel`, and `seq_cst` RMWs count as
   acquire reads.
2. A release-side architectural barrier B1 synchronizes-with an acquire-side
   architectural barrier B2 when all of these hold:
   - B1 is `%dmb` or `%dsb` with an all-access or store-covering domain.
   - B2 is `%dmb` or `%dsb` with an all-access or load-covering domain.
   - B1 is source-ordered before a store S to flag location F.
   - A load L from F reads-from S.
   - L is source-ordered before B2.
   - both barriers' shareability/access domains cover F and the protected
     locations.

Barrier-mediated synchronization is intentionally explicit and domain
sensitive. Two agents issuing barriers without a read-from edge on a flag do
not synchronize. `%compiler_barrier()` never synchronizes with another agent.
`%isb()` orders instruction-side effects for one agent; by itself it does not
create a memory synchronizes-with edge.

### Happens-Before

The **happens-before** relation, written **hb**, is the transitive closure of:

- source event order within one agent;
- every synchronizes-with edge;
- initialization order before the first event that can access initialized
  storage.

If A hb B, every legal compiler event order and architectural execution must
preserve the visibility consequences required by A before B. `hb` is not a
claim that the emitted instructions are textually adjacent; it is the language
ordering relation used by visible-value, race, and transformation checks.

### Global Sequentially Consistent Order

All `seq_cst` atomic events participate in one total order, written **S**. S
contains every `%atomic_load(..., order: seq_cst)`, `%atomic_store(...,
order: seq_cst)`, and RMW intrinsic with `order: seq_cst`. S must be consistent
with:

- happens-before between `seq_cst` events;
- each location's `mo(X)` for `seq_cst` writes and successful `seq_cst` RMWs
  to X;
- each RMW's requirement that its read part observes the immediately preceding
  write in `mo(X)`.

A `seq_cst` store is a release write in `mo(X)` and S. A `seq_cst` load is an
acquire read in S. A `seq_cst` RMW is both acquire and release, participates in
`mo(X)`, and participates in S as one indivisible event.

### How a Seq-Cst Load Selects Its Value

A `seq_cst` load L from X selects its value by first choosing a write W to X
that is allowed by reads-from and per-location coherence. It must also satisfy
the SC constraints:

1. If W is `seq_cst`, W must precede L in S.
2. If there is a `seq_cst` write Wsc to X that precedes L in S, W must not
   precede Wsc in `mo(X)`.
3. If a write Whb to X happens-before L, W must not precede Whb in `mo(X)`.

Thus an SC load never observes a value older than the latest SC write to that
location before it in S, nor older than a write that already happens-before it.
It may read a later non-SC write in `mo(X)` when the ordinary reads-from rules
allow that write.

### Barrier Examples

Acquire/release synchronization is the preferred CPU-to-CPU spelling:

<!-- wyst-contract: sketch -->
```wyst
// Agent 1
u64@[buf] = data
#release u64@[flag] = 1

// Agent 2
seen = #acquire u64@[flag]
if seen == 1 {
    data = u64@[buf]
}
```

The release store heads a release sequence on `flag`. The acquire load reads
from that sequence, so the release synchronizes-with the acquire and the data
write happens-before the final data read.

Barrier-mediated synchronization is valid but less composable:

<!-- wyst-contract: sketch -->
```wyst
// Agent 1
u64@[buf] = data
%dmb(ishst)
u64@[flag] = 1

// Agent 2
seen = u64@[flag]
%dmb(ishld)
if seen == 1 {
    data = u64@[buf]
}
```

If the flag load reads from the flag store and the inner-shareable domain covers
both locations, the two barriers synchronize. If the flag load does not read
from the store, or the domain is wrong, no inter-agent hb edge is created.

### Normative Litmus Outcomes

The following litmus outcomes are part of the normative concurrent memory-model
suite. The executable form lives in
`wync/tests/memory_model_litmus.rs`; a regression must fail by naming the
semantic outcome that was wrongly admitted or rejected, not merely by noticing
that an instruction mnemonic changed.

| Litmus | Program shape | Outcome rule |
| --- | --- | --- |
| Message passing | Agent 0 writes `data`, then release-stores `flag`; agent 1 acquire-loads `flag`, then reads `data`. | If `flag == 1`, `data == 0` is forbidden; reading the release value synchronizes with the acquire and carries the payload write through hb. |
| Store buffering | Each agent stores one atomic location and then loads the other. | With `relaxed`, `r0 == 0 && r1 == 0` is allowed. With `seq_cst`, the same outcome is forbidden by the single SC order. |
| Load buffering | Each agent loads one atomic location and then stores the other. | With `relaxed`, `r0 == 1 && r1 == 1` is allowed. With `seq_cst`, the same outcome is forbidden because it creates an SC cycle. |
| Independent reads of independent writes (IRIW) | Two agents publish independent writes; two readers observe the locations in opposite orders. | Release/acquire permits the split observation when the reads synchronize only per location. `seq_cst` forbids the split observation through the global SC order. |
| Release sequence | A release store to `flag` is followed in `mo(flag)` by a relaxed RMW that reads it; a later acquire load reads the RMW value. | The acquire synchronizes with the release-sequence head, so stale protected data is forbidden. |
| Barrier message passing | Plain payload write, `%dmb(ishst)`, plain flag store; flag load, `%dmb(ishld)`, payload read. | If the flag load reads from the flag store and the domain covers both locations, stale payload is forbidden. Replacing the barriers with `%compiler_barrier()` allows the stale payload because no inter-agent sw edge exists. |
| Mixed atomic/plain access | One agent performs a relaxed atomic store while another performs a plain load of the same scalar location without hb. | The outcome is a data race classified as target-defined for access-atomic scalar accesses, not optimizer-undefined behavior. |
| Compiler scheduling and aliasing | A store followed by a load is compared with a load/store reordering. | Reordering may-alias accesses is forbidden when it admits a stale-load outcome. Reordering proven disjoint accesses is allowed when the transformed outcomes are a subset of the source outcomes. |

ARM64 lowering validation for these litmus tests is semantic, not mnemonic
based. The checked ARM64 contracts use architectural facts that correspond to
the ARMv8 formal model: other-multi-copy atomicity, aligned scalar
single-copy atomicity, the architectural ordering of a store-release before a
following load-acquire, and either LSE single-event RMW behavior or baseline
LL/SC retry-until-complete behavior. A lowering proof that only says "`ldar`
was emitted" or "`stlr` was emitted" is incomplete for Wyst `seq_cst`.

---

## 9.4 Compiler Event Order, Alias Proofs, and Transformations

### Compiler Event Order

The compiler emits a **compiler event order** for each agent: the order of
loads, stores, atomics, volatile accesses, barrier events, calls with memory
effects, and opaque `#asm` effects in the instruction stream. A transformation
is legal only when every source execution admitted by the emitted program has a
corresponding source execution admitted by this chapter with the same observable
volatile, MMIO, atomic, barrier, trap, call, and plain-memory effects.

Compiler event order is more constrained than architectural event order. For
example, a volatile load must remain textually ordered in compiler event order,
but the target may still need `%dmb` or `%dsb` for hardware ordering relative to
another agent. Conversely, `%compiler_barrier()` constrains compiler event
order but produces no architectural event.

### Closed Alias Proof List

Wyst deliberately rejects strict-aliasing folklore. Different element types,
different address qualifiers, casts through `u64`, and different parameter
names are not alias proofs. Every nontrivial memory reordering, load
forwarding, or dead-store removal must be justified by one of these closed
proofs:

1. **Distinct compiler-owned globals.** Two mutable or immutable globals with
   distinct compiler-assigned storage allocations are disjoint for their
   allocated byte ranges. This proof does not apply to numeric address
   constants, foreign symbols, linker overlays, or target-described MMIO
   ranges.
2. **Distinct non-escaping stack objects.** Two stack objects in the same
   function are disjoint for their allocated byte ranges while neither
   object's address has escaped through a store, return, indirect call,
   ordinary call without a precise no-memory contract, inline assembly, or cast
   to a value that can outlive the proof.
3. **Statically disjoint byte ranges.** Two accesses derived from the same
   proven base are disjoint when their byte offsets and widths are compile-time
   known and the ranges do not overlap. Typed element offsets, byte-lens casts,
   and `#field_offset` may be used to compute the ranges.
4. **Explicit future uniqueness guarantees.** A later language version may add
   a source feature that states uniqueness or no-aliasing. Such a feature is an
   alias proof only after it has its own semantic-db row, chapter rule, and
   conformance evidence. Current `#noescape` is not a uniqueness guarantee.

If none of these proofs applies, the compiler must assume the ranges may alias.
This includes two `@T` parameters, a `@T` access and an `@volatile T` access,
two computed numeric addresses, and two differently typed views of the same
bytes.

### Reordering Table

Given source event A before source event B, may the compiler emit B before A?

| Earlier A / later B | Plain | Volatile/MMIO | Acquire | Release | Atomic relaxed | Atomic SC | Barrier/opaque |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Plain | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | no |
| Volatile/MMIO | no | no | no | no | no | no | no |
| Acquire | no | no | no | no | no | no | no |
| Release | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | no |
| Atomic relaxed | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | yes, with alias proof and no dependency | no | no |
| Atomic SC | no | no | no | no | no | no | no |
| Barrier/opaque | no | no | no | no | no | no | no |

"Barrier/opaque" includes `%dsb`, `%dmb`, `%isb()`, `%compiler_barrier()`,
strict schedule boundaries, calls whose memory effects are not proven absent,
and opaque `#asm` blocks. A data, control, or address dependency is always a
separate reason that reordering is illegal.

### Allowed Transformations

The following transformations are allowed when their listed proof obligations
are met:

- Reorder two plain or relaxed-atomic events only when the closed alias proof
  list proves their ranges do not overlap, there is no dependency, and no
  intervening event imposes ordering.
- Forward a plain store to a later plain load only when the stored range fully
  covers the loaded range, no intervening event may write any overlapping byte,
  and the storage is proven private or otherwise non-observable by another
  agent for that interval.
- Delete a plain store only when a later write fully overwrites it before any
  possible read, volatile/MMIO access, atomic event, barrier, opaque call, or
  escaping use can observe it.
- Combine adjacent plain scalar accesses into an aggregate copy only when the
  resulting chunking is exactly the deterministic aggregate-copy rule in §9.6
  and no volatile, MMIO, atomic, barrier, or opaque event is crossed.
- Keep ordinary scalar values in registers when the source object is a
  non-escaping local or another closed alias proof shows no event can observe
  the memory slot.

### Forbidden Transformations

The compiler must not:

- use a data race, indeterminate read, invalid address, false trusted contract,
  or architectural fault as an impossible-state assumption;
- treat a data race as optimizer poison or LLVM-style `undef`;
- infer non-aliasing from different Wyst element types, signedness, volatility,
  MMIO intent, `@T` parameter names, or source casts;
- eliminate, duplicate, merge, split, speculate, or reorder volatile or
  MMIO-intent accesses except as required by the explicit access itself;
- move any memory event across `%dsb`, `%dmb`, `%isb()`,
  `%compiler_barrier()`, a strict schedule boundary, or an opaque memory-effect
  call or `#asm` block;
- weaken an atomic order, remove an atomic event, split one atomic RMW into
  separately observable source events, or synthesize an atomic event the source
  did not request;
- replace a racy source load with an arbitrary constant, cached value, or
  "as-if" value not delivered by the target execution;
- assume a plain access cannot race merely because racing would make the
  program incorrect.

---

## 9.5 Data Races and Mixed Accesses

### Data Race Definition

Two memory events M and N constitute a **data race** if:

1. they are from different agents;
2. their access ranges overlap;
3. at least one writes;
4. neither M hb N nor N hb M; and
5. they are not both atomic events on the same coherence location.

Atomic events on the same coherence location are serialized by `mo(X)` even
when their order is `relaxed`. They may fail to synchronize, but they do not
data-race with each other.

### Data Race Behavior

A data race in Wyst is never compiler undefined behavior. It is:

- `Target-defined` when every racing access that supplies the observed value is
  access-atomic for its range and memory type; or
- `Indeterminate bits` when any observed racing access can tear, decompose, or
  assemble bytes from independently racing sub-accesses.

The compiler emits the source memory events subject only to the allowed
transformations in §9.4. It does not delete, merge, invent, or reorder events
because a race exists. The selected target then determines which value a racing
access-atomic load observes. For Device memory and MMIO registers, the device
specification also participates in the target-defined result.

Programs with data races on shared mutable state are incorrect unless the race
is the device protocol itself. Wyst makes that incorrectness traceable to the
hardware execution rather than silently turning it into optimizer poison.

### Mixed Atomic and Plain Access

A plain, volatile, or MMIO-intent access that conflicts with an atomic event on
the same bytes is a data race unless happens-before orders the two events. The
plain side is the offending side; the atomic event keeps its own atomicity and
modification-order meaning.

The intended patterns are:

- use only atomic events for a shared synchronization location;
- use plain data writes before a release and plain data reads after a matching
  acquire;
- use plain flag accesses only with the barrier-mediated synchronization rule
  in §9.3;
- protect mixed plain/atomic maintenance code with interrupt masking, locks, or
  another hb edge.

The canonical spinlock pattern is not a mixed-access race:

<!-- wyst-contract: sketch -->
```wyst
// acquire
_, ok := %cas(lock, 0 as.numeric u64, 1 as.numeric u64, order: acquire)

// release
#release u64@[lock] = 0
```

Both operations are atomic events on the same coherence location. The release
store heads a release sequence; a later acquire `%cas` that reads the released
value synchronizes with it.

### Volatile and MMIO Races

Volatile access is an observability contract for the compiler, not a
data-race exemption. Two CPU agents concurrently accessing the same volatile
location, at least one writing, race unless hb orders them or both accesses are
also atomic events on the same coherence location.

MMIO-intent accesses through `@mmio T` are expected for device-owned registers:
the device is an agent and the register semantics are supplied by the device
and the page-table memory type. Two CPU agents concurrently writing the same
MMIO register still race at the language level unless externally serialized.

---

## 9.6 Atomicity

### Natural Alignment

A load or store of type T at a naturally aligned address (address is a multiple of
`size_of(T)`) is **access-atomic**: it appears to other agents as a single indivisible
operation. No intermediate partially-written value is observable.

| Type                | Size    | Required alignment |
| ------------------- | ------- | ------------------ |
| `u8`, `i8`          | 1 byte  | any                |
| `u16`, `i16`        | 2 bytes | 2-byte aligned     |
| `u32`, `i32`, `f32` | 4 bytes | 4-byte aligned     |
| `u64`, `i64`, `f64` | 8 bytes | 8-byte aligned     |

### Misaligned Access

A load or store at a misaligned address is not access-atomic. The access may be
decomposed by hardware into multiple sub-accesses. Concurrent agents may observe a
partial write. Misaligned accesses to device memory additionally produce alignment faults
on most ARM64 configurations.

### Multi-Word and Pair Accesses

Single-copy atomicity on the ARMv8-A baseline is guaranteed _only_ for single-register
aligned loads and stores up to 8 bytes (`u8`/`u16`/`u32`/`u64`). Any access wider than
that is _not_ access-atomic. Three lowerings trigger this in Wyst programs:

1. **General-purpose pair loads/stores (`ldp`/`stp`).** Explicit inline
   assembly, frame save/restore code, explicit pair-oriented primitives, and
   eligible compiler-synthesized stack/aggregate transfer chunks may use pair
   instructions. `ldp` is observed by other agents as two independent 8-byte
   loads; `stp` as two independent 8-byte stores. A racing agent may observe
   the high half from before the race and the low half from after it.
2. **128-bit vector loads/stores (`ldr q`/`str q`).** Full-vector accesses via the
   `[u8:16]@[addr]` form (§1.5.1) or other 16-byte SIMD lowerings are observed as two
   8-byte halves on ARMv8-A.
3. **Compiler-synthesized aggregate copies.** A struct, fixed-array,
   dynamic-array descriptor, slice/string descriptor, payload enum, or tuple copy
   wider than 8 bytes lowers to a deterministic sequence of chunks. Chunks may
   be scalar chunks or eligible 16-byte pair chunks. The whole sequence is not
   atomic, and racing agents may observe a prefix of old chunks and a suffix of
   new chunks, or the reverse, depending on which agent is reading and which is
   writing.

Compiler-synthesized aggregate copies use this exact chunk rule:

1. Copy legs run from byte offset 0 upward.
2. At each offset, first choose a 16-byte pair chunk when at least 16 bytes
   remain, both endpoints are 8-byte aligned, and the memory endpoint, if any,
   is non-volatile. Stack endpoints use the compiler's exact stack-slot offset;
   memory endpoints use the static alignment of the accessed type.
3. A pair chunk transfers two 8-byte subchunks in low-then-high order. Stack
   endpoints use `ldp` / `stp`; memory endpoints use `ldp` / `stp` when the
   AArch64 pair addressing mode encodes, otherwise two scalar 8-byte memory
   operations in low-then-high order. The pair chunk is not access-atomic.
4. If a pair chunk is not eligible, choose the largest scalar chunk size in
   `8, 4, 2, 1` that fits the remaining byte count and is guaranteed aligned at
   both endpoints. Each scalar chunk is one general-purpose-register load
   followed by one general-purpose-register store for that copy leg.
5. The compiler does not use SIMD vector load/store instructions for
   compiler-synthesized aggregate copies.
6. A memory-to-memory aggregate assignment is two deterministic copy legs: source
   memory is first materialized into a compiler-owned temporary with this rule,
   then the temporary is copied to destination memory with the same rule.

These are _hardware_ properties of the lowering. The compiler pins the chunking
above for reproducibility, and the §9.4 "non-access-atomic load" case applies to
multi-chunk aggregate copies when they race.

#### Worked example: 16-byte struct copy

<!-- wyst-contract: sketch -->
```wyst
Point :: struct {
    x : u64,
    y : u64,
}

src : @Point = 0x4000
dst : @Point = 0x4010

Point@[dst] = Point@[src]                // 16-byte aggregate copy
```

For a naturally aligned, non-volatile 16-byte `Point`, the compiler may lower
the source-memory leg as one pair chunk:

```text
ldp x9, x10, [src, #0]                 // low and high 8-byte subchunks
stp x9, x10, [tmp, #0]
```

Then it lowers the temporary-to-destination leg with the same chunk rule:

```text
ldp x9, x10, [tmp, #0]
stp x9, x10, [dst, #0]                 // low and high 8-byte subchunks
```

If the memory endpoint is volatile or insufficiently aligned for a pair chunk,
the leg falls back to scalar `ldr` / `str` chunks. If a non-volatile memory
endpoint is aligned but outside the encodable pair-addressing range, the memory
side uses two scalar 8-byte accesses while the stack side may still use the pair
operation for that 16-byte chunk. The observable race model is the same: there
is no 16-byte single-copy atomic aggregate assignment.

A concurrent agent reading `dst` while another agent issues this copy may observe
`(old_x, new_y)` or `(new_x, old_y)` — values that no agent ever stored as a whole
`Point`. Use `#acquire`/`#release` on a flag, atomic runtime primitives (§1.3.2),
or interrupt masking when wider-than-8-byte aggregates are shared across agents.

#### Bitfield case

Bitfield types (§1.6.1) use an unsigned `u8`/`u16`/`u32`/`u64` backing
integer, so a bitfield read-modify-write itself never spans the
single-copy-atomic width and is not subject to pair-store tearing. The
Bitfield Read-Modify-Write subsection below covers the _separate_ hazard of
two agents writing different fields of the same backing word.

#### FEAT_LSE2 (optional)

ARMv8.4 FEAT_LSE2 widens single-copy atomicity to 16 bytes for naturally aligned
accesses. Wyst programs do not rely on it by default. A future `#target(... features =
(lse2))` opt-in (see [chapter-04-modules.md](chapter-04-modules.md)) may add an
explicit 16-byte access or copy mode on platforms that support it; until that feature
gate is added, the baseline scalar-chunk aggregate-copy rule stands and all
multi-word aggregate copies are non-atomic.

### Bitfield Read-Modify-Write

A bitfield write `val.field = x` is a **read-modify-write**: the compiler reads the
backing word, modifies the target field, and writes the backing word back. This sequence
is **not atomic** with respect to concurrent writes to other fields of the same backing
word.

Two agents concurrently writing different fields of the same bitfield backing word race
on the overlapping bytes. The result observes `Indeterminate bits` and is likely to
corrupt one or both writes.

Programs must not allow concurrent writes to different fields of the same bitfield backing
word without external serialization. For MMIO registers this means bitfield writes must
not be used from interrupt handlers that share a register with the interrupted code, unless
the register is exclusively owned by one context at a time.

For practical safe patterns — including full-register writes, `ldxr`/`stxr` atomic RMW
loops, and interrupt-disable sequences — see the **Concurrency and Atomicity** section
in [chapter-06-types.md §1.6.1](chapter-06-types.md) (Bitfield Types).

---

## 9.7 Interrupt Handler Ordering

### Preemption Establishes Program Order

An interrupt handler begins executing after the interrupted code is suspended. All memory
operations that completed (were globally observed) before the suspension point are visible
to the handler. No additional synchronization primitive is required to observe values that
were stably written before the interrupt.

Operations that were in-flight (in the CPU store buffer, not yet globally observed) at
suspension are not guaranteed visible to the handler.

### Sharing Data With an Interrupt Handler (Single Core)

To share mutable data between foreground code and an interrupt handler on the same core:

1. Shared locations must be declared as `@volatile T` so that every access through them
   is a compiler barrier; the compiler cannot cache the value in a register across an
   interrupt point.
2. For writes that must complete before the handler reads them, issue `%dsb(sy)` after the
   write and before the signaling store.
3. For multi-word data that must be read or written consistently, disable interrupts during
   the critical section.

<!-- wyst-contract: sketch -->
```wyst
result_buf   : @u64          = 0x4000
result_ready : @volatile u64 = 0x4008      // volatility lives in the type

// Foreground: write result and signal handler
u64@[result_buf]   = computed_value         // write result (plain)
%dsb(sy)                                   // ensure result is globally observable
u64@[result_ready] = 1                       // signal (volatile via type)

// Interrupt handler: read signal and consume result
flag = u64@[result_ready]                   // volatile via type — compiler cannot cache
if flag == 1 {
    %dsb(ld)                               // ensure flag load completes before result read
    val = u64@[result_buf]                  // safe: dsb orders this after the flag read
}
```

### Sharing Data With an Interrupt Handler (Multi-Core)

When the handler may run on a different core than the producing code, preemption ordering
does not apply. Use the acquire-release model:

<!-- wyst-contract: sketch -->
```wyst
// Producing core
u64@[result_buf]        = computed_value    // write result
#release u64@[result_ready] = 1             // store-release: result_buf ordered before this

// Handler (any core)
flag = #acquire u64@[result_ready]          // load-acquire: subsequent reads ordered after
if flag == 1 {
    val = u64@[result_buf]                  // happens-after the release; result is visible
}
```

---

## 9.8 Initial Values

Memory locations not explicitly initialized contain `Indeterminate bits`:

- Memory zeroed by startup code (e.g. the `.bss` initialization loop) contains zero.
- Stack memory reused from a previous frame contains values written by that frame.
- Device registers contain device-specific power-on reset values.
- Memory from an allocator contains values from its previous occupant.

**The Wyst compiler does not zero-initialize local variables.** A local
variable declared but not assigned before use is not an implicit way to observe
its stack slot or register home. An ordinary read of a local before
initialization is a compile-time error.

<!-- wyst-contract: sketch -->
```wyst
main :: () -> u64 {
  x : u64
  return x // error[E0204]: local 'x' is read before it is initialized
}
```

Programs that deliberately need raw machine storage must say so in the type and
the operation:

<!-- wyst-contract: sketch -->
```wyst
main :: () -> u64 {
  storage : MaybeUninit<u64>
  first : u64 = %read_uninit(storage)
  %write_uninit(storage, 7)
  second : u64 = %read_uninit(storage)
  return first + second
}
```

`MaybeUninit<T>` reserves storage with the same layout, size, alignment, and
calling-convention footprint as `T`, but it does not initialize a `T` value and
does not imply automatic zeroing. `%read_uninit(storage)` is the explicit
indeterminate read operation; it returns a `T` value whose bits come from the
raw storage. `%write_uninit(storage, value)` writes a `T` value into that raw
storage. After an indeterminate read is observed, the result is an ordinary
typed value. It is never LLVM-style poison or `undef`, and the compiler must
not use the read as a reason to delete or invent unrelated behavior.

Initialization state is tracked for ordinary locals as a whole binding on each
source path. Fields and array elements inherit the initialization state of
their enclosing ordinary storage; assigning one field or element does not make
the whole ordinary aggregate readable if the aggregate itself was never
initialized. Current raw-storage intrinsics operate on the whole
`MaybeUninit<T>` object. Future field- or element-granular raw APIs must keep
the same explicit-read and explicit-write rule and must not introduce implicit
zeroing.

Moving `MaybeUninit<T>` moves the raw storage wrapper and its bytes. It does
not initialize, read, or destroy a hidden `T`. Wyst currently has no implicit
destructors or cleanup hooks for ordinary locals; `MaybeUninit<T>` therefore
adds no hidden cleanup obligation. If a later language version adds destructors,
the destructor for `T` must not run merely because `MaybeUninit<T>` storage
goes out of scope.

Register-resident and stack-resident storage have identical source semantics.
`#pin(x19)` or allocator placement may change where the storage lives, but not
whether an ordinary read is legal and not whether a raw read must be spelled
with `%read_uninit`.

---

## 9.9 ARM64 Correspondence

The Wyst memory model is a restriction and formalization of the ARM64 VMSA memory model.
Every guarantee Wyst makes is backed by a specific ARM64 hardware mechanism:

| Wyst operation                      | ARM64 instruction | Hardware guarantee                                                                     |
| ---------------------------------- | ----------------- | -------------------------------------------------------------------------------------- |
| Plain load (via `@T`)              | `ldr`             | No ordering guarantee; may be reordered with other non-acquire/release accesses        |
| Plain store (via `@T`)             | `str`             | No ordering guarantee                                                                  |
| Volatile load (via `@volatile T` or `@mmio T`)  | `ldr`             | Compiler barrier only; cacheability from page-table MAIR                               |
| Volatile store (via `@volatile T` or `@mmio T`) | `str`             | Compiler barrier only; cacheability from page-table MAIR                               |
| `#acquire` load                    | `ldar`            | One-way fence: all subsequent accesses observed after this load                        |
| `#release` store                   | `stlr`            | One-way fence: all preceding accesses observed before this store                       |
| `%dsb(sy)`                         | `dsb sy`          | Stall until all preceding explicit memory accesses are globally observed (full system) |
| `%dsb(st)`                         | `dsb st`          | Stall until all preceding explicit stores are globally observed                        |
| `%dsb(ld)`                         | `dsb ld`          | Stall until all preceding explicit loads are globally observed                         |
| `%dsb(ish)`                        | `dsb ish`         | `dsb sy` scoped to inner shareable domain                                              |
| `%dsb(osh)`                        | `dsb osh`         | `dsb sy` scoped to outer shareable domain                                              |
| `%dsb(nsh)`                        | `dsb nsh`         | `dsb sy` scoped to non-shareable domain                                                |
| `%dmb(sy)`                         | `dmb sy`          | Order preceding accesses before subsequent ones; no pipeline stall                     |
| `%dmb(ish)`                        | `dmb ish`         | `dmb sy` scoped to inner shareable domain                                              |
| `%isb()`                           | `isb`             | Flush pipeline; all preceding instructions retire before subsequent fetch              |
| `%compiler_barrier()`              | none              | Full compiler fence only; no hardware memory-ordering guarantee                        |

**`ldar` one-way semantics:** The load value is observed, and all subsequent accesses in
program order are observed after it. Preceding accesses may be observed before or after
the `ldar`. Acquire is a downward fence, not a full barrier.

**`stlr` one-way semantics:** All preceding accesses in program order are observed before
this store. Subsequent accesses may be observed before or after the `stlr`. Release is an
upward fence, not a full barrier.

**`dsb sy` stall semantics:** The pipeline stalls until all preceding explicit memory
accesses to any memory type are globally observed by all agents in the full system
shareability domain. `dsb` is stronger than `dmb`; use `dmb` when the stall is not
required.

**Beyond this model:** The ARM64 VMSA has additional mechanisms (load-exclusive/store-
exclusive pairs for RMW atomicity, cache maintenance instructions, TLB invalidation) that
are accessible through `#asm` but are not exposed as Wyst language primitives. For
lock-free data structures, explicit cache maintenance, or TLB management, use `#asm`
directly. `#asm` blocks are treated as full two-way compiler memory fences — the compiler
assumes they may read or write any memory location.

---

## 9.10 Known Hardware Hazards

Certain instruction patterns are legal and well-defined but trigger
microarchitectural penalties that are invisible at the ISA level. Wyst
documents these patterns so that `wyst explain` can flag them and programmers
can avoid them.

---

### 9.10.1 Store-to-Load Forwarding (STLF)

Modern ARM64 cores maintain a **store buffer** that allows a load to read a
value from a preceding store before it reaches the cache. When forwarding
succeeds, the load completes in a few cycles. When it fails, the core must
drain the store buffer and re-read from cache, adding 10–20 cycles of penalty.

#### When Forwarding Succeeds

Forwarding succeeds when the load reads exactly the bytes written by the most
recent store to the same address:

- Store and load are the same width and alignment.
- The load address is identical to the store address.
- The store is the most recent write to that address in program order.

<!-- wyst-contract: sketch -->
```wyst
// STLF succeeds: matching width and alignment
u64@[@buf] = value
result := u64@[@buf]        // forwarded from store buffer
```

#### When Forwarding Fails

Forwarding fails when the load cannot be satisfied entirely from a single
store buffer entry. Common failure cases:

| Pattern                                     | Example                                           | Problem                                          |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Width mismatch (narrow store, wider load)   | `u8@[p8] = x` then `u32@[p8 as.lens @u32]`          | Load spans bytes not in store buffer entry       |
| Width mismatch (wider store, narrower load) | `u64@[p64] = x` then `u32@[p64 as.lens @u32]`       | Some cores forward; others do not - non-portable |
| Partial overlap                             | Store to `p8`, load from `p8 + 2` where `p8 : @u8` | Load partially overlaps the store                |
| Multiple stores                             | `u32@[p32] = a` then `u32@[p32 + 1] = b` then `u64@[p32 as.lens @u64]` | Load needs data from two store buffer entries    |

<!-- wyst-contract: sketch -->
```wyst
// STLF failure: narrow store followed by wider load
buf : @u8 = 0x4000

u8@[buf] = flags
combined := u32@[buf as.lens @u32] // penalty: ~10-20 cycle stall

// STLF failure: constructing a value from sub-word stores
p : @u8 = 0x5000
p32 : @u32 = p as.lens @u32
p64 : @u64 = p as.lens @u64

u32@[p32]     = lo
u32@[p32 + 1] = hi
full := u64@[p64]            // penalty: two store buffer entries
```

#### Bitfield RMW and STLF

Bitfield field writes compile to read-modify-write sequences using `ubfx` and
`bfi` (see [chapter-06-types.md §1.6.1](chapter-06-types.md)). A field write followed by a
differently-sized read of the backing integer can trigger STLF failure:

<!-- wyst-contract: sketch -->
```wyst
status :: bitfield(u32) {
    ready : bits(0, 0)
    error : bits(1, 1)
    count : bits(2, 15)
}

// Potential STLF hazard: field write is a u32 RMW,
// but if the compiler or programmer batches sub-word
// stores, a subsequent full read may stall.
reg.ready = 1
reg.error = 0
reg.count = 42
raw := reg as.bits u32     // safe: all writes are full-width u32 RMW
```

In practice, bitfield field writes in Wyst are full-width RMW on the backing
type, so they do not cause width-mismatch STLF failures by themselves. The
hazard arises when mixing bitfield access with raw sub-word stores to the same
address, or when accessing the same memory at different widths through pointer
casts.

#### `wyst explain` Diagnostics

`wyst explain` should flag the following patterns as potential STLF hazards:

- A store of width N followed by a load of width M ≠ N at the same base
  address (or provably overlapping addresses).
- Two or more stores to adjacent sub-words followed by a wider load spanning
  them.
- A pointer cast that changes access width between a store and a subsequent
  load to the same address.

Diagnostics are informational. The patterns are well-defined; the penalty is
a performance issue, not a correctness issue.

#### Guidance

- **Store and load at the same width.** If a value is stored as `u32`, read it
  back as `u32`.
- **Batch sub-word writes.** Construct a full-width value in a register, then
  store once, rather than writing individual bytes or half-words.
- **Avoid cross-width aliasing.** Do not write through a `@u8` and read back
  through a `@u64` at the same address.

---

## 9.11 Quick Reference: Is This Reordering Permitted?

Given operation A before operation B in source, may the compiler emit B before A?

**No** if any of:

- A or B is a volatile or MMIO-intent access, unless the explicit access itself
  requires only its own lowered event.
- A or B is `%dsb`, `%dmb`, `%isb()`, `%compiler_barrier()`, a strict schedule
  boundary, an opaque `#asm`, or a call with unproven memory effects.
- B is a release event or `seq_cst` event that would be hoisted above A.
- A is an acquire event or `seq_cst` event that would have B moved before it.
- A and B access overlapping ranges, or the compiler lacks one of the closed
  alias proofs from §9.4.
- B depends on the value, address, control result, or effect produced by A.

**Yes** only for the cases allowed by the §9.4 reordering table: plain or
relaxed-atomic events with a closed alias proof, no dependency, and no
intervening event that imposes ordering.

---

## 9.12 Cache Line Awareness

Modern ARM64 processors transfer data between caches and main memory in
fixed-size **cache lines** (typically 64 bytes; 128 bytes on Apple M-series).
When two variables share a cache line and are written by different cores, the
MESI coherence protocol forces the line to bounce between caches — even if the
cores never access the same variable. This is **false sharing**, and it can
degrade throughput by 10–50×.

---

### `#shared` — Cache-Line Isolation

<!-- wyst-contract: sketch -->
```wyst
counter : #shared u64 = 0
flags : #shared u64 = 0
```

`#shared` is a placement attribute on mutable global variables and `#percpu`
declarations. It guarantees:

1. The variable is aligned to cache line width (`#cache_line_width()`).
2. The variable is padded to fill a full cache line.
3. Two `#shared` variables are guaranteed to occupy different cache lines.

**Legal positions:** `#shared` may appear on:

| Declaration kind   | Example                                 |
| ------------------ | --------------------------------------- |
| Mutable global     | `counter : #shared u64 = 0`             |
| `#percpu` variable | `#percpu local_count : #shared u64 = 0` |

**Illegal positions (compile error):**

| Position         | Reason                                             |
| ---------------- | -------------------------------------------------- |
| Local variables  | Stack layout is not shared between cores           |
| Constants (`::`) | Immutable data has no write-side coherence traffic |
| Struct fields    | Use explicit `#align` and padding instead          |

**Semantics:**

- `#shared` implies `#align(#cache_line_width())`.
- The total space consumed is `max(#size_of(T), #cache_line_width())`.
- `#shared` is a placement attribute, not a type modifier — `@T` still
  points to the variable's natural type, not to a padded wrapper.
- `#shared` does not add any memory ordering. For concurrent access, combine
  with `#acquire` / `#release` or barrier runtime primitives as needed.

<!-- wyst-contract: sketch -->
```wyst
// Two per-CPU counters that will never false-share
#percpu
request_count : #shared u64 = 0
#percpu
error_count : #shared u64 = 0
```

---

### `#cache_line_width()` — Compile-Time Query

<!-- wyst-contract: sketch -->
```wyst
stride :: #cache_line_width()       // 64 on most ARM64; 128 on Apple M-series
buf : #align(#cache_line_width()) [1024]u8
```

`#cache_line_width()` is a compile-time query that returns the cache line
width in bytes for the current `#target`. It is resolved at compile time — no
runtime cost, no code emitted.

**Default value:** 64 (matches Cortex-A and Neoverse families).

**Override:** `#target(... cache_line = 128)` sets the value for the
compilation unit. This is required for Apple M-series targets where the
DCache line size is 128 bytes.

**Legal positions:**

| Context                            | Example                                     |
| ---------------------------------- | ------------------------------------------- |
| `#align` argument                  | `#align(#cache_line_width())`               |
| `#static_assert`                   | `#static_assert(#cache_line_width() >= 64)` |
| Array size                         | `buf : [#cache_line_width()]u8`             |
| Constant declaration               | `CL :: #cache_line_width()`                 |
| Arithmetic in constant expressions | `stride :: #cache_line_width() * 2`         |

See [chapter-06-types.md §1.15](chapter-06-types.md) for the full compile-time query table.

---

### False-Sharing Diagnostic

The compiler emits a warning when two mutable globals (at least one of which
is public or `#percpu`) land on the same cache line and neither is marked
`#shared`:

```text
warning: 'counter_a' and 'counter_b' may share a cache line
         both are mutable globals; consider #shared if accessed from multiple cores
         counter_a at offset 0x1000, counter_b at offset 0x1008 (same 64-byte line)
```

The diagnostic is informational — false sharing is a performance issue, not a
correctness issue. Suppress it by adding `#shared` to the relevant
declarations, or by placing them in explicit `#section` blocks with sufficient
spacing.

---
