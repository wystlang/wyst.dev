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
> Typed atomic storage and methods live in the generated
> [atomic matrix](generated-atomic-matrix.md) and
> [chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md);
> address types and conversion rules live in [chapter-06-types.md §1.4.1](chapter-06-types.md);
> inline assembly fence semantics live in [chapter-08-functions.md §2.9](chapter-08-functions.md).

The memory model defines ordering for normal and volatile memory,
acquire/release operations, atomics, barriers, agents, and happens-before.
Its address and access dependencies are linked above.

> **Source-version boundary.** Sections explicitly headed as current v0.9
> contracts use the active language surface. Other examples in this chapter
> retain the released v0.8 memory-model exposition for compatibility context.
> In those older sections, predecessor typed-memory, address-arithmetic,
> colon-range, runtime address-of, endian-access, categorized-conversion,
> atomic-primitive, and per-access-ordering forms are historical spellings,
> not v0.9 alternatives. Chapter 6's named address methods,
> unit-explicit offsets, `addr_of`, slice ranges, and named conversions
> supersede those spellings without changing the ordering model.

## v0.9 Atomic Acquire and Release Access (Current)

Acquire and release ordering is part of the closed method surface of opaque
atomic storage. The receiver is an `atomic<T>` binding or an explicit
`@atomic<T>` address:

<!-- wyst-contract: sketch -->
```wyst
var flag: atomic<u64> = atomic<u64>(0)
const observed: u64 = flag.load(.acquire)
flag.store(1, .release)
```

The receiver's exact atomic element type supplies `T`. `.load(.acquire)`
performs one load-acquire; `.store(value, .release)` performs one store-release
after evaluating the receiver and value once in source order. Ordinary,
volatile, and MMIO addresses do not gain atomic ordering and cannot implicitly
convert to `@atomic<T>`. The exact element/method/order matrix,
compare-exchange failure orders, ARM64 mapping, and removal table are generated
from [`atomic-matrix.json`](atomic-matrix.json). That matrix is the sole
authority for atomic storage types, methods, orders, result shapes, and the
disposition of the removed per-access ordering directives. It does not own
prefix-primitive mappings: the sole audit authority for those retired spellings is
the non-parser
[`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv).
Later occurrences of old atomic primitives or per-access ordering directives in
historical exposition are not current syntax.

### Construction, lifetime, and modification order

Direct construction creates the atomic location and contributes its initial
write **I**. I is the first member of that location's modification order and
happens-before every later atomic event on the location. For a runtime local,
evaluation of the constructor operand is sequenced before I, and I is complete
before the binding can escape or be observed. For module storage, I is part of
static initialization before program access. For each `per_cpu` instance, the
template bytes are copied only while that instance is unobserved; the resulting
instance-specific I happens-before publication and its first access. The
constructor has no order argument, is not a member of the global SC order, and
does not invent a user-visible atomic load or store event.

### Storage validity and exact width

Every atomic event requires atomic-capable **Normal memory** and the natural
alignment of its exact element width: 1, 2, 4, or 8 bytes, or the target word
alignment for an address element. `atomic<T>` does not manufacture either
property. Device/MMIO placement, under-aligned aggregate or packed placement,
provably misaligned `@atomic<T>`, and mixed atomic/plain access are rejected. A
dynamically constructed atomic address therefore carries an explicit audited
Normal-memory and alignment assertion; it is never inferred from an ordinary,
volatile, or MMIO address.

<!-- wyst-contract: fmt -->
```wyst
module memory.contract

fn mapped_counter(raw: u64) -> @atomic<u64> {
  return address<@atomic<u64>>(raw)
}
```

This exact named conversion is the sole raw construction path and is valid only
in an executable function body so its trust-boundary fact remains traceable in
human and JSON reports. It preserves the address bits and emits no memory event
or runtime check. A constant that is misaligned or overlaps target-declared
Device memory is rejected; for a dynamic value, natural alignment and
atomic-capable Normal memory remain explicit programmer assertions rather than
compiler proof. `relens`, qualifier conversion, reverse exposure to a plain
address, and implicit conversion never construct an atomic address.

The access width is exactly `#size_of(T)`. Checked 16-byte pair-atomic and
exclusive operations are separate range operations: they do not add an atomic
element class, turn `@atomic<u64>` into a 16-byte address, or otherwise widen
the opaque storage boundary.

### Sequential consistency and progress obligations

The v0.9 ARM64 mapping uses acquire loads, release stores, and acquire-release
RMW forms for `.seq_cst`, with no implicit `dmb`. Instruction selection alone
is not a proof of sequential consistency. The single global SC-order rules in
§9.3 and the normative store-buffering, load-buffering, and IRIW outcomes in
§9.3's “Normative Litmus Outcomes” remain mandatory evidence for this mapping.
A target-lowering change is invalid unless its architecture argument and
litmus suite preserve every required and forbidden outcome.

Every admitted operation uses an exact-width implementation with no hidden
lock, allocation, or helper: a selected LSE instruction or an LL/SC loop that
restarts after every store-exclusive failure. There is no retry budget,
timeout, synthetic compare failure, or fallback lock; an unsupported target
is a hard capability error. This is a lock-free implementation class, not a
wait-free guarantee for an individual agent: under contention an LL/SC caller
may retry indefinitely. Reports identify the selected lowering and progress
class explicitly.

## v0.9 Register and `per_cpu` Memory Contract (Current)

Chapter 8 is the sole source-semantic owner for
`language.callable-storage-contracts`. In v0.9, explicit register placement is
written `in register`; the predecessor register-placement directive is removed. Parameter and
result placement is part of callable identity, while `var name: T in register`
is a hard local-storage requirement.

A direct `per_cpu` scalar, field, or element use contributes the ordinary
memory event requested by its type plus the target-defined current-core base
acquisition needed for that use. The base acquisition and offset calculation
are part of that source access: they may not be cached, hoisted, or commoned
with another `per_cpu` access. An ordinary scalar read or write contributes one
load or store. A named bitstruct-field write is one logical source operation but
uses its normal confined backing-word read-modify-write sequence: one load,
`BitfieldInsert`, and one store, all through the same freshly acquired base.
Those operations have the same volatility, ordering, race, and alias rules as
their ordinary non-`per_cpu` counterparts. Atomic `per_cpu` storage is accessed
only through `wyst.atomic-matrix.v1` methods; the storage class itself adds no
atomicity or ordering.

There is no source-visible address, template address, or whole-aggregate copy
event for `per_cpu` storage. `#percpu_offset_of` is a compile-time final-template
byte-offset query and performs no current-core acquisition or memory access.
The target availability and single-instance gate are defined by Chapter 8 and
projected into target lowering by Chapter 11. Before the production multicore
realization milestone, reachable access requires
`#target(..., per_cpu = single_instance_tpidr_el1)` and its EL1+,
16-byte-aligned `TPIDR_EL1` live-base contract.

---

### ARM64 Semantic Foundations

---

## 1.1 ARM64 Register Model

ARM64 is fundamentally register-oriented. Wyst surfaces this register file
as a set of **reserved tokens** rather than as a set of variables. The
register allocator owns variable-to-register mapping; the programmer
expresses exact register placement only via the `in register` clauses in
`language.callable-storage-contracts`
and manipulates machine operands directly only inside checked `asm` bodies
(section 2.9).

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

1. In a legal `in register` placement position defined by
   `language.callable-storage-contracts`.
2. In a catalog-authorized position inside the body of an `asm { ... }` block.

A Wyst statement like:

<!-- wyst-contract: sketch -->
```wyst
x0 = x1 + x2
```

is rejected. Add is expressed by writing variables:

<!-- wyst-contract: historical-v0.8 -->
```wyst
a : u64 = 1
b : u64 = 2
c : u64 = a + b // lowers to `add xD, xA, xB` for whichever GPRs the allocator picks
```

If the operation must use specific registers (firmware contract, fixed ABI),
place the local variables explicitly:

<!-- wyst-contract: sketch -->
```wyst
var a: u64 in x1 = 1
var b: u64 in x2 = 2
var c: u64 in x0 = a + b   // guaranteed `add x0, x1, x2`
```

If an instruction must be emitted literally and its source form is active on
the checked-assembly surface, use `asm`. For example, the pinned pack admits a
load-bearing aligned NOP:

<!-- wyst-contract: sketch -->
```wyst
asm align 16 {
    nop
}
```

The pinned v0.9 pack does not activate `add` as a checked source form, so the
fixed-local expression above is the supported way to request `add x0, x1, x2`.
A literal checked `add` remains a support error until a later profile activates
its exact row.

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

<!-- wyst-contract: historical-v0.8 -->
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

<!-- wyst-contract: historical-v0.8 -->
```wyst
mem : @u64 = 0x4000

x := u64@[mem]     // load: read u64 from address in mem
                  // x's type is inferred as u64 from the load

u64@[mem] = x     // store: write x to u64 at address in mem
```

The type of `x` is inferred from the load. Explicit annotation is also valid:

<!-- wyst-contract: historical-v0.8 -->
```wyst
x : u64 = u64@[mem]
```

These historical forms are equivalent; the inferred-binding punctuation joined
the type separator and initializer marker without whitespace.

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

<!-- wyst-contract: historical-v0.8 -->
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
order must be observed by the device, import `core.arch.barrier` and use
`barrier.dsb` or `barrier.dmb` between writes. See section 1.3.1 for the
qualified barrier catalog and MMIO ordering patterns.

**Volatility and MMIO intent do not control cacheability.** Whether an address
is cached or uncached is determined by the page-table entry for that address
(specifically the MAIR index and the memory type attribute in the descriptor).
A volatile or MMIO-intent access to an address mapped as Normal-Cacheable in the
page tables will still go through the cache. Platform initialization code is
responsible for configuring MMIO regions with Device memory attributes
(e.g. Device-nGnRE) before accessing them.

### Declared Hardware Access Events

Placed register maps and standalone scalar `mmio` declarations use the same
observable access contract as raw access through `@mmio T`, while retaining
their stronger declaration and value-type rules from Chapters 6 and 11. Each
permitted `.read()` is exactly one volatile MMIO-intent load and each permitted
raw or named `.write(...)` is exactly one volatile MMIO-intent store. Every such
event carries both `volatile_access` and `mmio` effects.

The receiver and all arguments are evaluated once, left to right in written
order, before the hardware event. A policy-aware named write constructs its
complete backing value before its one store. A permitted `.modify(...)`
evaluates the receiver and arguments first, then performs exactly one hardware
read followed by exactly one hardware write. The pair is one compiler-ordering
unit but is not an atomic read-modify-write: another observer may update the
register between its read and write.

Every declared MMIO access is a full two-way compiler-memory boundary. A pass
must not eliminate, duplicate, merge, split, speculate, or reorder it, and no
plain, volatile, MMIO, atomic, barrier, or opaque memory event may cross it in
either direction. A complete modify may not be separated, interleaved with an
unrelated compiler memory event, or reduced to a single event. Field projection
from a captured register snapshot is an ordinary value operation and is not a
second event.

System-register declaration operations are also full two-way compiler-memory
boundaries. Their machine-semantic effects, privilege gates, faults, and
implicit-state facts come from the authenticated A64 catalog rather than from
the MMIO effect pair. A system-register modify likewise keeps its exact one
read/one write sequence together as one compiler-ordering unit.

These boundaries create no synchronizes-with or happens-before edge and provide
no atomicity. They emit no implicit `dmb`, `dsb`, or `isb`. Any architectural
barrier required by a device or system register remains a separate explicit
source operation. Effects and lowering reports distinguish scalar reads,
snapshot reads, raw full-width writes, policy-aware named writes, complete
read-modify-writes, compiler-only ordering, and actually emitted barrier
instructions.

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
one `u32` element, or four bytes. Current source advances in raw bytes with
`byte_offset`; the predecessor lens-conversion form is historical. The formal arithmetic rules are in
[chapter-06-types.md §1.4.1](chapter-06-types.md) (Address Types subsection).
Do not write `p + i * #size_of(T)` for element `i`; that double-scales the
offset. The three distinct current operations are `element_offset(p, i)`,
`byte_offset(p, bytes)`, and `field_addr(p, T.field)`; each records its unit
directly and needs no categorized conversion.

#### Volatile and MMIO-Intent Addresses

The qualifier `@volatile T` marks an address with the volatile-access compiler
contract. The qualifier `@mmio T` marks the same access contract plus programmer
intent that the numeric address denotes an MMIO register or region. Every load
or store through either qualified address is a compiler barrier (see section
1.3.1). Only access through `@mmio T` introduces the `mmio` effect. Qualifiers
propagate through address arithmetic:

<!-- wyst-contract: historical-v0.8 -->
```wyst
GIC_BASE_BYTES : @mmio u8 = 0x0800_0000
GICD_CTLR      : @mmio u32 = (GIC_BASE_BYTES + 0) as.lens @mmio u32
GICD_TYPER     : @mmio u32 = (GIC_BASE_BYTES + 4) as.lens @mmio u32

u32@[GICD_CTLR] = 1              // volatile MMIO-intent store
mask = u32@[GICD_TYPER]           // volatile MMIO-intent load at byte offset 4
```

There is no implicit conversion among `@T`, `@volatile T`, and `@mmio T` in any
direction. Stripping volatility or MMIO intent requires an explicit
`qualify<T>(address)` conversion and emits a warning; adding either qualifier
also requires that named conversion.
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

<!-- wyst-contract: historical-v0.8 -->
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

<!-- wyst-contract: historical-v0.8 -->
```wyst
msgs : @string = 0x6000

first_len_addr  : @u64 = ((msgs as.lens @u8) + #field_offset(string, len)) as.lens @u64
second_len_addr : @u64 = (((msgs + 1) as.lens @u8) + #field_offset(string, len)) as.lens @u64

first_len  := u64@[first_len_addr]
second_len := u64@[second_len_addr]
```

#### Vector Addresses

<!-- wyst-contract: historical-v0.8 -->
```wyst
@[f32:4]  // address into [f32:4] vectors (stride 16)
@[u8:16]  // address into [u8:16] vectors (stride 16)
@[u64:2]  // address into [u64:2] vectors (stride 16)
```

Vector addresses follow the same model — stride equals the total vector size.

The element type records the intended access type. Array and slice indexing
syntax is a separate operation; `@T` address arithmetic uses element offsets:

<!-- wyst-contract: historical-v0.8 -->
```wyst
base : @u64 = 0x4000

total += u64@[base + i]
```

### MMIO Example

<!-- wyst-contract: historical-v0.8 -->
```wyst
UARTFR : @mmio u32 = 0x0900_0018
UARTDR : @mmio u32 = 0x0900_0000
TXFF   :: u32          = 1 << 5

while u32@[UARTFR] & TXFF != 0 {
    cpu.nop()
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

## 1.3.1 Volatility, Historical Per-Access Directives, and Current Barriers

The `@volatile T` and `@mmio T` qualifier discussion remains applicable to
v0.9. The predecessor per-access acquire/release subsections and examples are a
released-v0.8 snapshot only; v0.9 uses the typed atomic methods in the current
section above. The qualified barrier subsection is an active v0.9 contract.

Wyst distinguishes five orthogonal mechanisms for controlling memory
operations:

| Mechanism                | Form                             | Scope                                      |
| ------------------------ | -------------------------------- | ------------------------------------------ |
| Volatile access contract | `@volatile T` or `@mmio T` type  | every access through the typed address     |
| MMIO intent              | `@mmio T` type                   | every access through the typed address     |
| Released-v0.8 synchronization ordering | predecessor per-access ordering directives | one load or one store             |
| CPU memory ordering      | `barrier.dsb(...)`/`barrier.dmb(...)`/`barrier.isb()` | hardware and compiler fence at one point |
| Compiler-only ordering   | `barrier.compiler()`              | compiler fence at one point; emits nothing |

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

<!-- wyst-contract: historical-v0.8 -->
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

<!-- wyst-contract: historical-v0.8 -->
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
the named `address<u64>(source)` conversion, the source address's qualifiers must match the result address
qualifiers. Mixed-qualifier address arithmetic is rejected unless the source
first casts one address to the intended qualifier:

<!-- wyst-contract: historical-v0.8 -->
```wyst
device : @mmio u32 = 0x0900_0000
plain : @u32          = 0x8000_0000

bad  := device + (plain as.address u64)                 // compile error
good := device + ((plain as.qualifier @mmio u32) as.address u64) // result is @mmio u32
```

There is no implicit conversion among `@T`, `@volatile T`, and `@mmio T` in any
direction. To strip volatility or MMIO intent use an explicit `qualify<T>`
conversion, which emits a warning. To treat a plain address as volatile or
MMIO-intent, use that named conversion as well. These
conversions do not perform an access and do not introduce
`volatile_access` or `mmio` effects until a later load or store:

<!-- wyst-contract: historical-v0.8 -->
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
`plain.load()` and `device.load()` may touch the same bytes even though one
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

### Released v0.8 Acquire Ordering

The predecessor acquire directive denotes a load-acquire. It guarantees that all subsequent memory
accesses in program order are observed after this load. Use it to safely
read a lock or flag that another agent (another core, an interrupt handler)
may have written.

<!-- wyst-contract: historical-v0.8 -->
```wyst
val = #acquire u64@[lock_addr]     // load-acquire
```

Lowers to `ldar xD, [xN]` on ARM64. The directive is only valid on loads —
applying it to a store is a compile error.

That released ordering form is independent of volatility and MMIO intent: it is valid on `@T`,
`@volatile T`, and `@mmio T` addresses, though acquire-on-MMIO is rare and
indicates synchronization through a device register.

---

### Released v0.8 Release Ordering

The predecessor release directive denotes a store-release. It guarantees that all preceding memory
accesses in program order are observed before this store. Use it to safely
write a lock or flag that another agent will subsequently read.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#release u64@[lock_addr] = 0       // store-release
```

Lowers to `stlr xD, [xN]` on ARM64. The directive is only valid on stores —
applying it to a load is a compile error.

---

### Combination Rules

| Combination                                  | Validity      | Reason                          |
| -------------------------------------------- | ------------- | ------------------------------- |
| load/store via `@T`                          | valid         | plain access                    |
| load/store via `@volatile T`                 | valid         | volatile (compiler barrier)     |
| load/store via `@mmio T`                     | valid         | volatile plus MMIO intent       |
| Released acquire ordering on `@T` load       | valid         | acquire-release synchronization |
| Released release ordering on `@T` store      | valid         | acquire-release synchronization |
| Released acquire ordering on `@volatile T` load | valid (rare) | acquire-via-volatile         |
| Released release ordering on `@volatile T` store | valid (rare) | release-via-volatile         |
| Released acquire ordering on `@mmio T` load  | valid (rare)  | acquire-via-MMIO-intent         |
| Released release ordering on `@mmio T` store | valid (rare)  | release-via-MMIO-intent         |
| Released acquire ordering on store           | compile error | acquire is load-only            |
| Released release ordering on load            | compile error | release is store-only           |
| Both released ordering forms on one access   | compile error | mutually exclusive              |

---

### Qualified Barrier Operations (Current v0.9)

Barriers enforce memory ordering at the CPU level, independent of any
specific memory access. They are required wherever the ARM64 weak memory
model would otherwise permit the CPU to reorder accesses in ways the program
cannot tolerate.

The examples below assume `import core.arch { barrier }`; the category name is
not ambient.

<!-- wyst-contract: sketch -->
```wyst
barrier.dsb(.sy)    // data synchronization barrier — full system
            // stalls until all preceding memory accesses complete
            // lowers to: dsb sy

barrier.dsb(.st)    // data synchronization barrier — stores only
            // stalls until all preceding stores complete
            // lowers to: dsb st

barrier.dsb(.ld)    // data synchronization barrier — loads only
            // stalls until all preceding loads complete
            // lowers to: dsb ld

barrier.dsb(.ish)   // data synchronization barrier — inner shareable domain
            // lowers to: dsb ish

barrier.dsb(.osh)   // data synchronization barrier — outer shareable domain
            // lowers to: dsb osh

barrier.dsb(.nsh)   // data synchronization barrier — non-shareable domain
            // lowers to: dsb nsh

barrier.dmb(.sy)    // data memory barrier — full system
            // orders but does not stall; preceding accesses are ordered
            // before subsequent ones but the CPU need not wait
            // lowers to: dmb sy

barrier.dmb(.ish)   // data memory barrier — inner shareable domain
            // lowers to: dmb ish

barrier.isb()      // instruction synchronization barrier
            // flushes the pipeline; required after writing system registers
            // that affect instruction fetch or decode
            // lowers to: isb
```

The accepted `barrier.dsb` and `barrier.dmb` arguments are dot-prefixed
compile-time cases from this closed vocabulary:

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

`barrier.dsb`, `barrier.dmb`, and `barrier.isb()` are also full two-way compiler memory fences:
the compiler must not move any load, store, atomic, volatile access, barrier,
or opaque side effect across them. This fusion is intentional policy, not an
accident of the current backend. Use `barrier.compiler()` when source needs
only compiler ordering and must not emit a hardware barrier:

<!-- wyst-contract: sketch -->
```wyst
barrier.compiler()   // full compiler memory fence; lowers to no instruction
```

`barrier.compiler()` has no hardware memory-ordering effect. It does not
flush pipelines, drain store buffers, order cache or TLB maintenance, or
create a happens-before edge between agents.

---

### MMIO Ordering

Volatility and MMIO intent alone are not sufficient for MMIO initialization
sequences. On ARM64, the CPU store buffer may reorder stores to different addresses. A
device that requires its configuration registers to be written in a specific
order requires explicit barriers between those writes.

<!-- wyst-contract: historical-v0.8 -->
```wyst
UART_CR : @mmio u32 = 0x0900_0030
UART_IBRD : @mmio u32 = 0x0900_0024
UART_FBRD : @mmio u32 = 0x0900_0028
```

**Incorrect** (CPU may reorder stores even though every access is volatile):

<!-- wyst-contract: historical-v0.8 -->
```wyst
u32@[UART_CR]   = 0x0       // disable UART
u32@[UART_IBRD] = 1         // set baud divisor integer
u32@[UART_FBRD] = 40        // set baud divisor fraction
u32@[UART_CR]   = 0x301     // re-enable UART
```

**Correct** (barriers enforce hardware observation order):

<!-- wyst-contract: historical-v0.8 -->
```wyst
u32@[UART_CR] = 0x0         // disable UART
barrier.dsb(.sy)            // wait until disable is observed
u32@[UART_IBRD] = 1
u32@[UART_FBRD] = 40
barrier.dsb(.sy)            // wait until baud writes complete
u32@[UART_CR] = 0x301       // re-enable UART
```

Use `barrier.dsb(.sy)` when you need the CPU to stall until all preceding stores
are globally observed. Use `barrier.dmb(.sy)` when ordering is required but
the stall is not — for example, in a sequence of independent register
writes where ordering relative to subsequent code matters but latency
between the writes themselves does not.

---

### Spinlock Migration Example

The released-v0.8 spelling used predecessor compare-and-swap and release-order
forms. The current v0.9 spelling uses the typed methods on opaque atomic
storage:

The example assumes `import core.arch { cpu }`; the category name is not
ambient.

<!-- wyst-contract: sketch -->
```wyst
var lock: atomic<u64> = atomic<u64>(0)

fn spin_lock() {
  loop {
    var (_, ok) = lock.compare_exchange(0, 1, .acquire)
    if ok {
      return
    }
    cpu.wfe()
  }
}

fn spin_unlock() {
  lock.store(0, .release) // store-release clears the lock
  cpu.sev() // wake any waiters
}
```

This is the canonical v0.9 spelling. The pinned v0.9 checked-assembly pack does
not activate open-coded `ldaxr`/`stlxr`, so production code uses the typed
atomic methods. The retired atomic-primitive spellings survive only in the non-parser
[`legacy-percent-removal-audit.tsv`](legacy-percent-removal-audit.tsv)
and the labeled released-v0.8 historical snapshot in
[chapter-11-intrinsics.md §1.3.2](chapter-11-intrinsics.md).

---

### Relationship to Scheduling

Volatile accesses remain in source event order relative to other volatile
accesses — the compiler will not reorder them relative to each
other. This is a **compiler scheduling** constraint only. It does not prevent
CPU reordering at the hardware level; use `barrier.dsb` or `barrier.dmb` for that.

The released-v0.8 per-access ordering forms established ordering at the
hardware level via `ldar`/`stlr`; they did not constrain assembler scheduling
of non-memory operations. Current v0.9 expresses those same orderings through
`.load(.acquire)` and `.store(value, .release)` on atomic storage.

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
  volatile-only address without an explicit `qualify<@mmio u32>(address)` conversion.
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

An **execution agent** is the memory-model umbrella for an ordered execution
history that can share memory with other agents:

- a hardware CPU core;
- a DMA controller or other bus master that can read or write system memory;
- an external device that owns or updates MMIO-visible state.

An **execution strand** is one sequential Wyst control-flow instance inside an
agent. Ordinary code, each trap/interrupt invocation, and each saved task
continuation are distinct strands as specified in Chapter 13. A trap handler is
therefore not a new memory-model agent: it is a fresh strand in the interrupted
agent. External agents without Wyst control flow have the corresponding
target-defined sequential history.

Each agent's **source event order** combines its strand orders with the
target-defined entry and ordinary-return control edges between them. Within a
strand, it is induced by Wyst evaluation rules in
[chapter-07-operators.md](chapter-07-operators.md), statement order, and
control flow. For an assignment, the address/storage-target side precedes the
assigned value. For a call, the callee expression and argument effects are
ordered left-to-right before the call effect and any suspension boundary.

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
| Plain load | `addr.load()` where `addr: @T` | no | no |
| Plain store | `addr.store(val)` where `addr: @T` | yes | no |
| Volatile load | `addr.load()` where `addr: @volatile T` | no | compiler-only fence |
| Volatile store | `addr.store(val)` where `addr: @volatile T` | yes | compiler-only fence |
| MMIO-intent load | `addr.load()` where `addr: @mmio T` | no | compiler-only fence plus `mmio` effect |
| MMIO-intent store | `addr.store(val)` where `addr: @mmio T` | yes | compiler-only fence plus `mmio` effect |
| Acquire atomic load | `atomic_addr.load(.acquire)` | no | acquire |
| Release atomic store | `atomic_addr.store(val, .release)` | yes | release |
| Relaxed atomic load/store | `.load(.relaxed)` / `.store(val, .relaxed)` | load: no, store: yes | no |
| Seq-cst atomic load/store | `.load(.seq_cst)` / `.store(val, .seq_cst)` | load: no, store: yes | acquire/release plus SC |
| Atomic RMW | `.compare_exchange`, `.exchange`, every `.fetch_*`, and both bit methods | success/RMW: yes; failed compare-exchange: no | by the closed order argument |

An **atomic event** is an ordered atomic load/store or an atomic RMW on an
`atomic<T>` binding or `@atomic<T>` address. Atomic events on the same
coherence location are single-copy atomic and do not tear. A read-modify-write
(RMW) event contains a read part and, when it succeeds or is an unconditional
RMW, a write part. A successful RMW's read and write are adjacent in the
location's modification order. A failed `compare_exchange` is an atomic read
with no write.

Volatility is determined only by the static address type at the access site.
Volatile and MMIO-intent accesses are observable compiler events, but they are
not synchronization events. Atomic storage cannot be volatile- or
MMIO-qualified and requires atomic-capable Normal memory; an ordinary,
`@volatile T`, or `@mmio T` address never acquires atomic ordering implicitly.

Qualified barrier operations (`barrier.dsb`, `barrier.dmb`, `barrier.isb()`)
and `barrier.compiler()` are **barrier events**, not loads or stores. They are in
source event order, constrain compiler event order, and have the hardware
meaning described in §9.9. `barrier.compiler()` has no architectural event.
`schedule source` boundaries are compiler scheduling boundaries only.

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
MMIO-intent, atomic-store, and RMW writes when they touch the exact range X as
one access-atomic event. Non-access-atomic writes appear only in the per-byte
modification orders for their sub-accesses.

`mo(X)` is consistent with the per-byte modification orders for X. RMW events
are linearized at one point in `mo(X)`: their read part reads the immediately
preceding value in `mo(X)`, and their write part, if any, follows that read
without an intervening write to X. This is what makes the canonical
`.compare_exchange(..., .acquire)` lock / `.store(..., .release)` unlock
pattern a defined synchronization pattern rather than an illicit mixed access.

### Reads-From

Each load-like event has a **reads-from** relation:

- An access-atomic scalar or atomic load from X reads from exactly one write W
  to X.
- A successful RMW reads from the write immediately before it in `mo(X)`.
- A failed `compare_exchange` reads from one write in `mo(X)` and performs no
  write.
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
| `acq_rel` | RMW-only. The event is both acquire and release; it can synchronize as a read and head or extend a release sequence as a write. |
| `seq_cst` | The event has acquire/release strength as applicable and participates in the single global sequentially consistent order. |

`.load` accepts `.relaxed`, `.acquire`, and `.seq_cst`; `.store` accepts
`.relaxed`, `.release`, and `.seq_cst`. `exchange`, `compare_exchange`, every
`fetch_*`, and both bit methods accept all five closed orders. No method has a
default order or runtime-dispatched order.

### Release Sequences

Wyst supports release sequences. A **release sequence** on coherence location X
is the maximal contiguous sequence in `mo(X)` that starts with a release write
or release RMW H and continues through atomic RMW events on X, from any agent,
where each RMW reads from the immediately previous member of the sequence.
Plain stores, relaxed atomic stores, failed `compare_exchange` reads, or writes
to another location end the sequence.

The sequence head H may be a `.release`/`.seq_cst` atomic store or a
`.release`/`.acq_rel`/`.seq_cst` RMW. RMW operations that extend a release
sequence do not need release ordering themselves; their read-from chain
carries the sequence.

### Synchronizes-With

The **synchronizes-with** relation, written **sw**, contains these edges:

1. A release sequence head H on X synchronizes-with an acquire read A on X when
   A reads from any member of that release sequence. `seq_cst` loads and RMWs
   count as acquire reads; `acquire`, `acq_rel`, and `seq_cst` RMWs count as
   acquire reads.
2. A release-side architectural barrier B1 synchronizes-with an acquire-side
   architectural barrier B2 when all of these hold:
   - B1 is `barrier.dmb` or `barrier.dsb` with an all-access or store-covering domain.
   - B2 is `barrier.dmb` or `barrier.dsb` with an all-access or load-covering domain.
   - B1 is source-ordered before a store S to flag location F.
   - A load L from F reads-from S.
   - L is source-ordered before B2.
   - both barriers' shareability/access domains cover F and the protected
     locations.

Barrier-mediated synchronization is intentionally explicit and domain
sensitive. Two agents issuing barriers without a read-from edge on a flag do
not synchronize. `barrier.compiler()` never synchronizes with another agent.
`barrier.isb()` orders instruction-side effects for one agent; by itself it does not
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
contains every `.load(.seq_cst)`, `.store(value, .seq_cst)`, and atomic RMW
method requested with `.seq_cst`. S must be consistent with:

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
var flag: atomic<u64> = atomic<u64>(0)

// Agent 1
buf.store(data)
flag.store(1, .release)

// Agent 2
const seen: u64 = flag.load(.acquire)
if seen == 1 {
    const data: u64 = buf.load()
}
```

The release store heads a release sequence on `flag`. The acquire load reads
from that sequence, so the release synchronizes-with the acquire and the data
write happens-before the final data read.

Barrier-mediated synchronization is valid but less composable:

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Agent 1
u64@[buf] = data
barrier.dmb(.ishst)
u64@[flag] = 1

// Agent 2
seen = u64@[flag]
barrier.dmb(.ishld)
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
| Barrier message passing | Plain payload write, `barrier.dmb(.ishst)`, plain flag store; flag load, `barrier.dmb(.ishld)`, payload read. | If the flag load reads from the flag store and the domain covers both locations, stale payload is forbidden. Replacing the barriers with `barrier.compiler()` allows the stale payload because no inter-agent sw edge exists. |
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
effects, and non-pure `asm` effects in the instruction stream. A transformation
is legal only when every source execution admitted by the emitted program has a
corresponding source execution admitted by this chapter with the same observable
volatile, MMIO, atomic, barrier, trap, call, and plain-memory effects.

Compiler event order is more constrained than architectural event order. For
example, a volatile load must remain textually ordered in compiler event order,
but the target may still need `barrier.dmb` or `barrier.dsb` for hardware ordering relative to
another agent. Conversely, `barrier.compiler()` constrains compiler event
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
   conformance evidence. Current `noescape` is not a uniqueness guarantee.

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

"Barrier/opaque" includes `barrier.dsb`, `barrier.dmb`, `barrier.isb()`, `barrier.compiler()`,
strict schedule boundaries, calls whose memory effects are not proven absent,
and non-pure `asm` blocks. A data, control, or address dependency is always a
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
- move any memory event across `barrier.dsb`, `barrier.dmb`, `barrier.isb()`,
  `barrier.compiler()`, a strict schedule boundary, or an opaque memory-effect
  call or non-pure `asm` block;
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
var lock: atomic<u64> = atomic<u64>(0)

// acquire
var (_, ok) = lock.compare_exchange(0, 1, .acquire)

// release
lock.store(0, .release)
```

Both operations are atomic events on the same coherence location. The release
store heads a release sequence; a later acquire `compare_exchange` that reads
the released value synchronizes with it.

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
2. **128-bit vector loads/stores (`ldr q`/`str q`).** Full-vector address-method
   accesses or other 16-byte SIMD lowerings are observed as two
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

<!-- wyst-contract: historical-v0.8 -->
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
`Point`. Use typed acquire/release atomic methods on a flag, the other typed
atomic methods (§1.3.2), or interrupt masking when wider-than-8-byte aggregates
are shared across agents.

#### Bitfield case

Bitfield types (§1.6.1) use an unsigned `u8`/`u16`/`u32`/`u64` backing
integer, so a bitstruct field read-modify-write itself never spans the
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

### Bitstruct Field Read-Modify-Write

A bitstruct field write `val.field = x` is a **read-modify-write**: the compiler reads the
backing word, modifies the target field, and writes the backing word back. This sequence
is **not atomic** with respect to concurrent writes to other fields of the same backing
word.

Two agents concurrently writing different fields of the same bitstruct backing word race
on the overlapping bytes. The result observes `Indeterminate bits` and is likely to
corrupt one or both writes.

Programs must not allow concurrent writes to different fields of the same bitstruct backing
word without external serialization. For MMIO registers this means bitstruct field writes must
not be used from interrupt handlers that share a register with the interrupted code, unless
the register is exclusively owned by one context at a time.

For practical safe patterns — including full-register writes, `ldxr`/`stxr` atomic RMW
loops, and interrupt-disable sequences — see the **Concurrency and Atomicity** section
in [chapter-06-types.md §1.6.1](chapter-06-types.md) (Bitfield Types).

---

## 9.7 Interrupt Handler Ordering

### Preemption Establishes One-Agent Control Order

An interrupt handler begins a fresh strand after the exact interrupted-strand
prefix at architectural entry. Nested handlers recursively nest that order.
Ordinary exception return completes the handler strand and resumes the
interrupted strand, placing its suffix after the completed handler. Those are
source/control-order edges for the same execution agent, not a flush of a store
buffer, cross-agent synchronization, or an architectural memory barrier.

A scheduler transfer saves that ordering with the interrupted agent and then
resumes a distinct saved strand for the selected task, or does not return. Task
selection does not relabel the handler continuation, publish unrelated memory,
or create a synchronizes-with/happens-before edge. Provider-owned saved-context,
run-queue, or current-task metadata handed to another owner requires explicit
provider release/acquire publication.

### Sharing Data With an Interrupt Handler (Single Core)

To share mutable data between foreground code and an interrupt handler on the same core:

1. Shared locations must be declared as `@volatile T` when every access must
   remain observable to the handler; volatility is a compiler-ordering
   contract, not cross-agent synchronization.
2. For writes that must complete before the handler reads them, issue `barrier.dsb(.sy)` after the
   write and before the signaling store.
3. For multi-word data that must be read or written consistently, disable interrupts during
   the critical section.

<!-- wyst-contract: historical-v0.8 -->
```wyst
result_buf   : @u64          = 0x4000
result_ready : @volatile u64 = 0x4008      // volatility lives in the type

// Foreground: write result and signal handler
u64@[result_buf]   = computed_value         // write result (plain)
barrier.dsb(.sy)                           // ensure result is globally observable
u64@[result_ready] = 1                       // signal (volatile via type)

// Interrupt handler: read signal and consume result
flag = u64@[result_ready]                   // volatile via type — compiler cannot cache
if flag == 1 {
    barrier.dsb(.ld)                       // ensure flag load completes before result read
    val = u64@[result_buf]                  // safe: dsb orders this after the flag read
}
```

### Sharing Data With an Interrupt Handler (Multi-Core)

When the handler may run on a different core than the producing code, preemption ordering
does not apply. Use the acquire-release model:

<!-- wyst-contract: sketch -->
```wyst
var result_ready: atomic<u64> = atomic<u64>(0)

// Producing core
result_buf.store(computed_value) // write result
result_ready.store(1, .release)  // result_buf ordered before this

// Handler (any core)
const flag: u64 = result_ready.load(.acquire)
if flag == 1 {
    const val: u64 = result_buf.load() // happens-after release; result is visible
}
```

---

## 9.8 Initial Values and `MaybeUninit<T>` (Current v0.9)

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
fn main() -> u64 {
  var x: u64
  return x // error[E0204]: local 'x' is read before it is initialized
}
```

Programs that deliberately need raw machine storage must say so in the type and
the operation:

<!-- wyst-contract: sketch -->
```wyst
fn main() -> u64 {
  var storage = uninit<u64>()
  const first: u64 = storage.read_uninit()
  storage.write(7)
  const second: u64 = storage.read()
  return first + second
}
```

`MaybeUninit<T>` reserves storage with the same layout, size, alignment, and
calling-convention footprint as `T`, but it does not initialize a `T` value and
does not imply automatic zeroing. `storage.read_uninit()` is the explicit
indeterminate read operation; it returns a `T` value whose bits come from the
raw storage and leaves the initialization state unchanged.
`storage.write(value)` performs one complete typed write and establishes
compiler-proved initialization, after which `storage.read()` is valid.
`storage.assume_init()` is the trusted assertion form when no proof is
available. After an indeterminate read is observed, the result is an ordinary
typed value. It is never LLVM-style poison or `undef`, and the compiler must
not use the read as a reason to delete or invent unrelated behavior.

Initialization state is tracked for ordinary locals as a whole binding on each
source path. Fields and array elements inherit the initialization state of
their enclosing ordinary storage; assigning one field or element does not make
the whole ordinary aggregate readable if the aggregate itself was never
initialized. Current raw-storage methods operate on the whole
`MaybeUninit<T>` object. Future field- or element-granular raw APIs must keep
the same explicit-read and explicit-write rule and must not introduce implicit
zeroing.

`MaybeUninit<T>` is non-copyable and cannot be passed or returned by value,
embedded in an aggregate, converted, relensed, or used by ordinary value
operations. It does not initialize, read, or destroy a hidden `T`. Wyst
currently has no implicit destructors or cleanup hooks for ordinary locals;
`MaybeUninit<T>` therefore adds no hidden cleanup obligation. If a later
language version adds destructors, the destructor for `T` must not run merely
because `MaybeUninit<T>` storage goes out of scope.

Register-resident and stack-resident storage have identical source semantics.
An explicit local `in x19` placement or allocator placement may change where
the storage lives, but not
whether an ordinary read is legal and not whether a raw read must be spelled
with `.read_uninit()`.

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
| Atomic `.load(.acquire)`           | `ldar`            | One-way fence: all subsequent accesses observed after this load                        |
| Atomic `.store(value, .release)`   | `stlr`            | One-way fence: all preceding accesses observed before this store                       |
| `barrier.dsb(.sy)`                 | `dsb sy`          | Stall until all preceding explicit memory accesses are globally observed (full system) |
| `barrier.dsb(.st)`                 | `dsb st`          | Stall until all preceding explicit stores are globally observed                        |
| `barrier.dsb(.ld)`                 | `dsb ld`          | Stall until all preceding explicit loads are globally observed                         |
| `barrier.dsb(.ish)`                | `dsb ish`         | `dsb sy` scoped to inner shareable domain                                              |
| `barrier.dsb(.osh)`                | `dsb osh`         | `dsb sy` scoped to outer shareable domain                                              |
| `barrier.dsb(.nsh)`                | `dsb nsh`         | `dsb sy` scoped to non-shareable domain                                                |
| `barrier.dmb(.sy)`                 | `dmb sy`          | Order preceding accesses before subsequent ones; no pipeline stall                     |
| `barrier.dmb(.ish)`                | `dmb ish`         | `dmb sy` scoped to inner shareable domain                                              |
| `barrier.isb()`                    | `isb`             | Flush pipeline; all preceding instructions retire before subsequent fetch              |
| `barrier.compiler()`               | none              | Full compiler fence only; no hardware memory-ordering guarantee                        |

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

**Beyond this model:** The ARM64 VMSA has additional mechanisms
(load-exclusive/store-exclusive pairs for RMW atomicity, cache maintenance
instructions, and TLB invalidation). The pinned v0.9 checked-assembly pack does
not activate those source forms; use the corresponding Wyst intrinsic where one
exists, otherwise the compiler rejects the operation until a later profile adds
its exact row. An admitted non-pure `asm` block is a full two-way compiler memory
fence, with architectural effects and memory ranges derived from parsed rows.

---

## 9.10 Potential Hardware Sensitivities

Certain instruction patterns are legal and well-defined but can behave
differently across microarchitectures. These observations are non-normative:
the language assigns no latency, cache, store-buffer, or throughput result to
them, and the current compiler inspection reports do not diagnose or price
them. A future modeled or measured performance surface must identify its model
or observation and carry the common epistemic metadata before making such a
claim.

---

### 9.10.1 Store-to-Load Forwarding (STLF)

ARM64 implementations commonly maintain a **store buffer** and may forward a
preceding stored value to a later load. Whether forwarding occurs and its
performance effect depend on the specific core, memory state, address proof,
and dynamic execution. Source shape alone does not prove either outcome.

#### Common Forwarding-Compatible Shape

Exact-width, exact-address accesses are a commonly compatible shape:

- Store and load are the same width and alignment.
- The load address is identical to the store address.
- The store is the most recent write to that address in program order.

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Commonly forwarding-compatible: matching width and alignment
u64@[@buf] = value
result := u64@[@buf]        // forwarded from store buffer
```

#### Potentially Forwarding-Resistant Shapes

The following shapes can prevent or complicate forwarding on some cores:

| Pattern                                     | Example                                           | Structural concern                               |
| ------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Width mismatch (narrow store, wider load)   | `p8.store(x)` then `relens<@u32>(p8).load()`      | The load spans bytes outside the narrow store    |
| Width mismatch (wider store, narrower load) | `p64.store(x)` then `relens<@u32>(p64).load()`    | Forwarding rules vary by implementation          |
| Partial overlap                             | Store to `p8`, load from `element_offset(p8, 2)`  | The accesses overlap without identical coverage  |
| Multiple stores                             | Two adjacent `p32` stores followed by `relens<@u64>(p32).load()` | The load spans multiple source stores |

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Potentially forwarding-resistant: narrow store followed by wider load
buf : @u8 = 0x4000

u8@[buf] = flags
combined := u32@[buf as.lens @u32]

// STLF failure: constructing a value from sub-word stores
p : @u8 = 0x5000
p32 : @u32 = p as.lens @u32
p64 : @u64 = p as.lens @u64

u32@[p32]     = lo
u32@[p32 + 1] = hi
full := u64@[p64]
```

#### Bitstruct RMW and STLF

Bitstruct field writes compile to read-modify-write sequences using bit-field
extract/insert operations such as `ubfx` and
`bfi` (see [chapter-06-types.md §1.6.1](chapter-06-types.md)). A field write followed by a
differently-sized read of the backing integer can trigger STLF failure:

<!-- wyst-contract: sketch -->
```wyst
bitstruct Status: u32 {
    READY: bool at 0
    ERROR: bool at 1
    COUNT: u16 at 2..=15
}

// Potential STLF hazard: field write is a u32 RMW,
// but if the compiler or programmer batches sub-word
// stores, a subsequent full read may stall.
reg.READY = true
reg.ERROR = false
reg.COUNT = 42
const raw: u32 = bitcast<u32>(reg) // all writes are full-width u32 RMW
```

In practice, bitstruct field writes in Wyst are full-width RMW on the backing
type, so they do not cause width-mismatch STLF failures by themselves. The
hazard arises when mixing bitstruct access with raw sub-word stores to the same
address, or when accessing the same memory at different widths through pointer
casts.

#### Compiler Inspection Boundary

The current compiler may display the exact typed accesses and final machine
instructions as structural facts, but it does not label these patterns as a
performance hazard or claim forwarding success, failure, or cost. Such a claim
requires a target-applicable versioned model with explicit assumptions or a
measured observation of an identified artifact and workload.

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
- A or B is `barrier.dsb`, `barrier.dmb`, `barrier.isb()`, `barrier.compiler()`, a strict schedule
  boundary, a non-pure `asm` block, or a call with unproven memory effects.
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

> **Released v0.8 placement snapshot.** The predecessor cache-isolation and
> per-CPU declaration forms and false-sharing diagnostic described below are historical v0.8
> material. They are not v0.9 alternatives and do not modify
> the `per_cpu var` layout or access rules in
> `language.callable-storage-contracts`. The predecessor cache-isolation
> attribute is removed in v0.9;
> cache-isolated storage requires its later owning item. The independent
> `#cache_line_width()` target query remains governed by its own current
> semantic-authority row.

---

### Released v0.8 Cache-Line Isolation (Historical)

<!-- wyst-contract: historical-v0.8 -->
```wyst
counter : #shared u64 = 0
flags : #shared u64 = 0
```

The predecessor cache-isolation attribute applies to mutable globals and the
released per-CPU declaration form. It guarantees:

1. The variable is aligned to cache line width (`#cache_line_width()`).
2. The variable is padded to fill a full cache line.
3. Two attributed variables are guaranteed to occupy different cache lines.

**Legal positions:** the predecessor attribute may appear on:

| Declaration kind   | Example                                 |
| ------------------ | --------------------------------------- |
| Mutable global     | released mutable-global declaration      |
| Per-CPU variable   | released per-CPU declaration              |

**Illegal positions (compile error):**

| Position         | Reason                                             |
| ---------------- | -------------------------------------------------- |
| Local variables  | Stack layout is not shared between cores           |
| Constants         | Immutable data has no write-side coherence traffic |
| Struct fields     | Use explicit `#[align(...)]` and padding instead   |

**Semantics:**

- The predecessor attribute implies cache-line alignment.
- The total space consumed is `max(#size_of(T), #cache_line_width())`.
- It is a placement attribute, not a type modifier — `@T` still
  points to the variable's natural type, not to a padded wrapper.
- It does not add any memory ordering. For concurrent access, use typed
  atomic acquire/release methods or barrier runtime primitives as needed.

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Two per-CPU counters that will never false-share
#percpu
request_count : #shared u64 = 0
#percpu
error_count : #shared u64 = 0
```

---

### `#cache_line_width()` — Compile-Time Query

<!-- wyst-contract: historical-v0.8 -->
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
| `#[align(...)]` argument           | `#[align(#cache_line_width())]`             |
| `#static_assert`                   | `#static_assert(#cache_line_width() >= 64)` |
| Array size                         | `buf : [#cache_line_width()]u8`             |
| Constant declaration               | `CL :: #cache_line_width()`                 |
| Arithmetic in constant expressions | `stride :: #cache_line_width() * 2`         |

See [chapter-06-types.md §1.15](chapter-06-types.md) for the full compile-time query table.

---

### False-Sharing Diagnostic

The compiler emits a warning when two mutable globals (at least one of which
is public or per-CPU) land on the same cache line and neither uses the current
`#[cache_isolated]` attribute:

```text
warning: 'counter_a' and 'counter_b' may share a cache line
         both are mutable globals; consider #[cache_isolated] if accessed from multiple cores
         counter_a at offset 0x1000, counter_b at offset 0x1008 (same 64-byte line)
```

The diagnostic is informational — false sharing is a performance issue, not a
correctness issue. Suppress it by adding `#[cache_isolated]` to the relevant
declarations, or by placing them in explicit `#[section(...)]` blocks with sufficient
spacing.

---
