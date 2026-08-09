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
[`semantic-operation-catalog.tsv`](catalogs/language/semantic-operation-catalog.tsv). Each row
owns one stable semantic identity, source surface, compiler-internal lowering
key, target plan, result and parameter contract, ordering contract, report
identity, explicit observation policy, and implementation state. Target plans
join the authenticated A64 instruction, system-operation, and
machine-semantics catalogs rather than forming a second instruction or effect
table.

Atomic storage uses the closed matrix in
[`atomic-matrix.json`](catalogs/language/atomic-matrix.json). Its scalar elements are `bool`,
`u8`, `u16`, `u32`, `u64`, `i8`, `i16`, `i32`, and `i64`, plus admitted
one-word address values. The matrix owns method arity, legal orders, results,
and lowering.

Architecture operations are qualified-only members of sealed `core.arch`
categories. A selective import binds the category, optionally under a local
alias, while the operation's semantic identity remains unchanged:

<!-- wyst-contract: check-pass -->
```wyst
module semantic_operations

import core.arch { barrier, cache, cpu, exception, memory as mem, tlb }

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
The numeric operation and parameter do not provide compiler-provable memory
authority. Each source-visible `semihost.call` is therefore an explicit
`environment_contract` trust boundary: the programmer asserts that those
values authorize every host address, extent, alignment, initialization,
mutation, ordering, ownership, completion, and lifetime obligation exercised
until the synchronous call returns or traps. The compiler invalidates
unpreserved storage facts at the boundary, records the assertion in explain
reports, and propagates the trust through direct calls, callable values,
imports, and semantic interfaces. A missing, unknown, or incompatible trust
entry in the environment-service catalog rejects the service; numeric
operation values never silently imply a narrower contract.

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

<!-- wyst-contract: check-pass -->
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

### Checked Core Operations

The sealed `core.checked` module is the qualified namespace for explicit
checked core operations. It is available only through one private whole-module
import such as `import core.checked`; leaf imports and `pub import` are
rejected. The local qualifier may not be shadowed. There is no flat
`checked<T>(value)` operation. Nominal operand, result, and failure types come
from `core.quantities`, `core.collections.Result`, and `core.checked`.

Every checked constructor or refiner is pure `effects(none)`, evaluates its
written operands exactly once from left to right, and returns its exact
`must_observe Result<T, E>`. Operations whose refined input has already made a
failure impossible return the success value directly. Failure is ordinary
typed data: there is no trap, ambient status, exception, allocation, cleanup,
synchronization, retry, loop, handler search, or runtime call. A result may be
matched, explicitly discarded, returned, forwarded with exact `?`, or consumed
by an ordinary helper such as `expect_or_trap`; leaving it unobserved is a
source error.

The active surface is:

| Operation | Exact success type | Exact failure type |
| --- | --- | --- |
| `checked.index(index: ElementIndex, length: ElementLength)` | `ElementIndex` | `IndexFailure` |
| `checked.range(lower: ElementBoundary, upper: ElementBoundary)` | `ElementRange` | `RangeFailure` |
| `checked.slice_range(lower: ElementBoundary, upper: ElementBoundary, length: ElementLength)` | `ElementRange` | `SliceFailure` |
| `checked.numeric<T>(value)` | explicit integer or `bool` target `T` | `NumericConversionFailure` |
| `checked.byte_offset<A>(base: A, offset: ByteOffset)` | exact address type `A` | `AddressOffsetFailure` |
| `checked.element_offset<A>(base: A, offset: ElementOffset)` | exact address type `A` | `ElementAddressOffsetFailure` |
| `checked.physical_offset(base: PhysicalAddress, offset: ByteOffset)` | `PhysicalAddress` | `AddressOverflowFailure` |
| `checked.alignment(bytes: ByteLength)` | `Alignment` | `AlignmentFailure` |
| `checked.align_up(value: ByteLength, alignment: Alignment)` | `ByteLength` | `AlignOverflowFailure` |
| `checked.align_down(value: ByteLength, alignment: Alignment)` | direct `ByteLength` | none |
| `checked.physical_align_up(value: PhysicalAddress, alignment: Alignment)` | `PhysicalAddress` | `PhysicalAlignOverflowFailure` |
| `checked.physical_align_down(value: PhysicalAddress, alignment: Alignment)` | direct `PhysicalAddress` | none |
| `checked.byte_extent<A>(base: A, length: ByteLength)` | `ByteExtent<A>` | `ByteExtentFailure` |
| `checked.element_extent<A>(base: A, length: ElementLength)` | `ElementExtent<A>` | `ElementExtentFailure` |
| `checked.physical_extent(base: PhysicalAddress, length: ByteLength)` | `PhysicalExtent` | `ByteExtentFailure` |
| `checked.contains_bytes<A>(extent: ByteExtent<A>, offset: ByteOffset, access: ByteLength)` | `ByteRange` | `ContainmentFailure` |
| `checked.contains_elements<A>(extent: ElementExtent<A>, offset: ElementOffset, access: ElementLength)` | `ElementRange` | `ElementContainmentFailure` |
| `checked.contains_physical(extent: PhysicalExtent, offset: ByteOffset, access: ByteLength)` | `ByteRange` | `ContainmentFailure` |
| `checked.field<T>(value: T, width: u8)` | the exact integer type `T` | `FieldEncodingFailure` |
| `checked.generation(expected: Generation, observed: Generation)` | `Generation` | `GenerationMismatch` |
| `checked.next_generation(current: Generation)` | `Generation` | `GenerationExhausted` |

An operation accepts only the nominal domains shown in this table; an equal
carrier type is not substitutable. Operations showing `<A>` require one
explicit complete ordinary, volatile, or MMIO address type and preserve that
exact pointee lens and qualifier set. Operations showing `<T>` require one
explicit complete type argument. All other checked operations reject a type
argument.

Index success requires `index.value < length.value`. Range construction is
end-exclusive and requires `lower.value <= upper.value`. Slice-range success
additionally requires `upper.value <= length.value`. These operations return
nominal proof/range values; they do not access memory or form a slice. The
verifier may consume the `Ok` value from the exact authenticated
`checked.index` result as bounds evidence only for a descriptor carrying the
same length identity. This relational fact binds the checked index, exact
length, and result generation; it is not a property of the returned integer
alone. It survives SSA-local copies and moves, joins whose incoming values all
name the same authenticated result, and mandatory inlining such as
`expect_or_trap`. It does not survive storage, aggregate reconstruction,
opaque or out-of-line calls, joining different checked results, mutation or
reassignment of either identity, descriptor reconstruction, or a generation
transition. A new checked boundary is required after any such transition.

`checked.numeric<T>` accepts only `bool` and fixed-width integer sources and
targets. It succeeds exactly when the source's mathematical value is losslessly
representable by `T`; integer-to-`bool` therefore accepts only zero and one,
and `bool` converts to integer zero or one. Floating-point participation is a
compile-time error. A constant outside the target range produces the same
typed `Error` as a dynamic value rather than changing the operation into a
configuration diagnostic.

Checked address offsets reject mathematical results outside `0 .. 2^64-1`.
Element offsets scale once by `#size_of(A's pointee)` in arbitrary precision;
a zero-sized pointee produces no displacement. Typed address offsets also
require the resulting address to satisfy the pointee's declared alignment.
Overflow has precedence over misalignment in the failure enum. Physical
address offsets check the same range without typed-pointee alignment.

A valid `Alignment` is a nonzero power of two no greater than `2^63` and can be
constructed outside `core.quantities` only through `checked.alignment`.
Alignment operations therefore do not recheck that invariant. Align-up can
still reject a result beyond `u64.MAX`; align-down cannot fail or overflow.
Physical variants apply the same rules to address bits.

Extent construction validates the mathematical exclusive end, not a wrapped
one-word end address. `base + byte_length` or
`base + element_length * #size_of(T)` may equal exactly `2^64`; a larger end
fails. Zero-length extents and extents of zero-sized elements are valid.
Containment requires a nonnegative offset no greater than the extent length and
`access <= length - offset`; consequently a zero-length access at the exclusive
end is valid. Success returns the corresponding end-exclusive nominal range.

`checked.field<T>` accepts only an integer carrier. `width` must be a
compile-time constant in `1 ..= bit_width(T)`; a dynamic, zero, or oversized
width is a compile-time configuration error. At runtime, success requires the
mathematical value to fit the selected unsigned or two's-complement signed
field width. `checked.generation` succeeds only on equality and returns the
observed generation. `checked.next_generation` returns `current + 1` unless
`current` is `u64.MAX`; generation never wraps.

The failure declarations in `core.checked` are the canonical minimal payloads
for these families. They retain the operands and fixed metadata needed to
diagnose the rejected relation, use only fixed-layout movable fields, and do
not contain strings, allocated detail, or an open-ended status code. Adding or
reordering a checked operation requires an atomic update to that sealed module,
the semantic-operation catalog, typed lowering, verifier authentication,
reports/editor facts, and focused success/failure tests.

### `MaybeUninit<T>` Whole-Object Storage

`MaybeUninit<T>` is opaque storage with exactly `T`'s size, alignment, storage
class, and calling-convention footprint, but it does not contain a
compiler-proved initialized `T` until a complete write establishes that fact.
`T` must satisfy `copyable_discardable`; affine and terminal values use
dedicated typed resource or provider APIs. The complete Wyst surface is:

<!-- wyst-contract: sketch -->
```wyst
module explicit_uninitialized_storage

fn example(value: u64) -> u64 {
  var slot = uninit<u64>()
  const raw: u64 = slot.read_uninit()
  slot.write(value)
  const proven: u64 = slot.read()
  const slot_address: @MaybeUninit<u64> = addr_of(slot)
  return raw + proven
}
```

`uninit<T>()` reserves storage without zeroing, writing, allocating, or
inventing initialization. `slot.write(value)` evaluates `value` once, performs
one complete typed write, and establishes compiler-proved initialization. It
is valid in either raw-storage state; replacing initialized contents discards
the prior copy without cleanup. `slot.read()` performs one non-consuming typed
read, leaves the storage initialized, and is valid only when every incoming
control-flow path proves complete initialization. The element bound makes both
operations incapable of duplicating or abandoning affine or terminal
authority, so generic raw storage has no `take()` or `replace()` protocol.

`slot.read_uninit()` is valid only while complete initialization is unproved
and `T` is compiler-proved bit-total: every object-representation bit pattern
is valid, and the type carries no address, view, resource, or terminal
authority. The property is structural and cannot be asserted by source. The
operation performs one explicit indeterminate-bit observation, returns an
ordinary `T`, leaves the state unchanged, and is represented distinctly in
typed IR; its result is never compiler `poison` or `undef`. A compiler-proved
or assertion-initialized slot rejects it and uses `read()` instead.
The initial bits are unspecified but stable: repeated `read_uninit()` calls on
the same slot return the same pattern until a write or possible opaque mutation
begins a new raw-storage epoch. This permits value reuse but creates no runtime
epoch field, counter, or check.
`slot.assume_init()` performs a typed read, records a trusted initialization
assertion, and makes later evidence assertion-derived. It is available only
when `T` carries no address, view,
affine-resource, or terminal authority: representation validity alone cannot
manufacture provenance, extent, lifetime, access, ownership, or resolution
authority from raw bits. Authority-bearing values instead require a dedicated
trusted constructor or provider contract that establishes the relevant facts.
The operation contributes `initialization_assertion`, rather than
`external_storage` or `foreign_contract`, to the enclosing callable's
structural trust bound. It is legal only when complete initialization is
unproved; a compiler-proved or already assertion-initialized slot rejects the
operation and uses `read()` instead. A false assertion is a confined contract
violation, not permission for unrelated optimizer assumptions.

`MaybeUninit<T>` is non-copyable and cannot be passed or returned by value,
embedded in an aggregate, converted, relensed, or used by ordinary value
operations. Wyst tracks initialization at whole-object granularity only.
Byte, field, element, and other projection writes neither publish typed
subvalues nor accumulate hidden initialization bits. Projection writes alone
leave the storage raw until one complete authenticated producer transition;
Wyst currently defines no incremental fixed-array builder. Wyst rejects repeated
control flow that attempts to turn element-by-element raw writes into a new
fixed-array value, while allowing repeated mutation after a complete array
value exists.
`addr_of(slot)` yields `@MaybeUninit<T>` without reading it; that address has no
ordinary `.load()`, `.store()`, conversion, or relensing surface. A verified
complete producer write may establish initialized state; separate projection
writes never combine into that proof. A call carrying an applicable
`initializes(slot)` guarantee counts as a complete producer write; an
outcome-gated guarantee counts only on its refined result path. The relation is
a postcondition, not an exact-write count: multiple complete writes are valid
when the slot remains proved initialized at the applicable return. Each
replacement ends the stored lease for the previous value. The relation imposes
no obligation on traps, divergence, or other exits that never return control to
the caller. A slot may enter the call already initialized; the relation may
replace its value and does not preserve its prior contents or origins. On a
returned variant without an applicable initialization guarantee, prior
initialization becomes unproved unless a separate `unchanged(slot)` guarantee
applies; `preserves(slot)` alone is insufficient. An opaque or bodyless
validator may combine `unchanged(slot) on .Variant` with
`initializes(slot) on .Variant` for the same outcome, authenticating an
unchanged authority-free representation in place. The pair contributes
`initialization_assertion` and `external_storage`, plus `foreign_contract` for
a foreign declaration; it cannot authenticate authority without a dedicated
provider contract. There is no generic `validate_init<T>()` intrinsic. Safe
Wyst code uses bit-total raw observations, explicit value checks, and ordinary
complete construction instead. Safe Wyst also exposes no `bytes_of_uninit`,
byte view, reinterpretation, projection, conversion, or relensing operation for
`MaybeUninit<T>`; a bit-total carrier must be selected before external bits
arrive. There is also no generic `zeroed<T>()` or `MaybeUninit<T>.zero()`
intrinsic; complete typed zero values use ordinary construction, while raw
zeroing remains byte-storage work. `uninit<T>()` may create only a
function-local `MaybeUninit<T>` binding. The slot may be lent by address within
that activation but cannot appear in module, per-CPU, aggregate, parameter, or
result storage and cannot escape. Such a loan is synchronous: every callback,
agent, interrupt, DMA, or device access must end before the borrowing call
returns, and no handle may retain the address. Asynchronous work uses persistent
byte storage and a typed completion provider instead. A source-visible
suspension may retain the local slot only with no outstanding loan; the exact
preserved activation and each resume point carry its static state without a
runtime flag. At a control-flow join, initialized-state operations remain
available only when
every reachable incoming path proves complete initialization. Otherwise
`read()` is unavailable until source refines the distinguishing outcome or
performs another complete producer write; no runtime flag records the path.
When every path proves initialization but stores authority from different
sources, the slot remains initialized with the union of all possible origins.
The slot and later reads constrain every such source through static leases; no
runtime origin discriminator is added.
Foreign or opaque mutation otherwise makes the state unknown. For
authority-free `T`, a documented success path may use `assume_init()` when no
proof is available; authority-bearing `T` must use a dedicated provider
contract. Likewise, an opaque or bodyless `initializes(storage)` claim alone
cannot establish address or view authority; the provider spells
`initializes(out) from source`, or adds `on .Variant` when
the initialization and origin are conditional. The initialized authority
inherits the source's extent, lifetime, invalidators, and access relations. A
compiler-authenticated Wyst write of an already-valid copyable authority may
preserve those relations without trust or runtime metadata. At an unverified
boundary the combined contract contributes `initialization_assertion` and
`external_storage`; a foreign declaration additionally contributes
`foreign_contract`.

An initialization transition is value-complete rather than necessarily
byte-total. Every logical field, enum tag, and active payload must be valid;
padding and inactive payload bytes may remain indeterminate after an opaque or
foreign producer. Native Wyst construction still zeroes those bytes. Ordinary
typed use ignores them, while explicit raw observation yields indeterminate
bits rather than compiler poison or `undef`.

An initialized slot containing copyable address or view authority retains a
static lease on every possible backing source until its path-sensitive last
possible read, a replacing write, or loss of initialized availability. A
`read()` result receives an independent copy of the lease; overwriting the slot
does not invalidate that result. The compiler emits no lease metadata or
runtime operation.

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
a valid timing interval. A common-subexpression or lowering-materialization
cache may not reuse a definition from the opposite side of the read; definitions
on the two sides remain distinct even when their pure value is equal. A value
genuinely computed before the read may remain live and be consumed afterward,
but its defining work remains before the read and is not duplicated or moved.
The boundary emits no hidden `dmb`, `dsb`, `isb`, or other synchronization.

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
