---
title: "Chapter 6: Wyst Type System"
group: chapter
chapter: 6
order: 6
summary: "Scalar values, constants, conversions, addresses, arrays, slices, structs, bitstructs, and enums."
---

# Chapter 6: Wyst Type System

> **Canonical scope.** Scalar primitives, non-scalar built-in type forms,
> conversions, arrays, slices, structs, bitstructs, enums, strings, numeric
> literals, comments, compile-time conditionals, `#static_assert`, and the
> generic type-parameter model.
> Operator semantics live in [chapter-07-operators.md](chapter-07-operators.md); grammar in
> [appendix-b-grammar.md](appendix-b-grammar.md); memory access semantics in
> [chapter-09-memory-model.md](chapter-09-memory-model.md).

The sections below independently specify scalars, literals, conversions,
addresses, arrays, slices, structs, bitstructs, enums, compile-time conditions,
and generics. Generic syntax is implemented and can be consulted separately
from the scalar and aggregate rules.

---

## Types, Aggregates, and Generics

Wyst keeps fixed arrays (`[N]T`), slices (`[]T`), vectors (`[T:N]`),
addresses, callable shapes, and nominal types.
Dynamic containers use the authenticated ordinary generic declaration whose
canonical identity is `core.collections.DynamicArray`; source must import it
explicitly and then apply the locally bound type as `DynamicArray<T>` (or its
import qualifier/alias). Chapter 10 defines that role and its storage contract.

Nominal aggregate declarations are keyword-led. Generic parameter lists are
permitted only on `struct`, `enum`, and `fn` declarations:

<!-- wyst-contract: fmt -->
```wyst
module types.aggregates

struct Pair<T, U> {
  first: T
  second: U
}

enum Result<T: fixed_layout_movable, E: fixed_layout_movable> {
  ok(T)
  err(E)
}
```

Struct values use the expected-type literal `{ field = value, ... }`. The
complete nominal type must come from an annotation, assignment target,
callable parameter, or return type; field names never infer it. Every declared
field appears exactly once, and unknown, duplicate, shorthand, colon-valued,
and missing fields are errors. Field expressions evaluate once in written
order; declaration order still owns layout.

<!-- wyst-contract: sketch -->
```wyst
const origin: Point = { x = 0, y = 0 }

fn make_point() -> Point {
  return { x = 4, y = 8 }
}

draw(point = { x = 10, y = 20 })
const bytes: [4]u8 = [1, 2, 3, 4]
```

Arrays and vectors use `[value, ...]`; named multi-results use `(value, ...)`. A
payload-free enum variant may use expected-type shorthand such as
`const idle: Message = .quit`; payload variants use the enum constructor,
for example `Message.write(packet)`.

Generics are explicit and type-only. Parameter and argument lists are
non-empty; every application supplies the complete type-argument list, and
arguments are full types that may nest. Wyst has no generic inference,
defaults, value parameters, aliases, user-defined bounds, traits, or turbofish.
Bounds come only from the closed compiler-defined capability catalog. Built-in
or duplicate parameter names and incorrect arity are errors.
[The generic-bounds registry](generic-bounds.tsv) is the
machine-readable authority for every active bound's spelling, subject set,
capability contract, and enum-payload eligibility; adding a bound requires one
complete atomic registry row.

After a value path, `<...>` is a generic application only when its matching
`>` is followed by `(`, `.`, `[`, `)`, `]`, `,`, `}`, or end of file;
otherwise comparison parsing wins. Within an already committed generic list,
`>>` and `>>=` split contextually into the required closing `>` tokens and any
remainder, so `Outer<Inner<u8>>` needs no separating whitespace.

Every instantiation is keyed by semantic declaration identity plus its complete
ordered concrete type arguments (and an empty value-argument tuple in Wyst).
Revisiting the same canonical key closes a legitimate recursive cycle. A
strictly growing instantiation chain is rejected with a deterministic
root-to-demand trace. A compiler safety budget is a distinct resource failure
and reports that same canonical trace; it is not the semantic termination rule.

### Named Conversions, Addresses, and Slices

This section defines conversions, addresses, memory access, address offsets,
and slices.

#### Named conversion operations

Wyst has no implicit numeric conversion. A context may give an untyped literal
its first concrete type when the literal is representable; that is literal
typing, not conversion of an already typed value. Every conversion of an
already typed value uses exactly one unshadowable compiler-owned operation:

| Operation | Closed legality | Result |
| --- | --- | --- |
| `widen<T>(value)` | integer source and wider integer `T` with the same signedness | zero-extension for unsigned values; sign-extension for signed values |
| `truncate<T>(value)` | integer source and narrower integer `T` | low `#size_of(T) * 8` bits; discarded high bits are not checked |
| `signcast<T>(value)` | equal-width integer source and `T` with opposite signedness | identical complete bit pattern interpreted with `T`'s signedness |
| `numeric<T>(value)` | representable untyped integer; integer identity; wider integer target with different signedness; or an explicit integer/`bool` crossing | extend a wider crossing according to the source signedness, then interpret as `T`; integer-to-`bool` is nonzero, and `bool`-to-integer is zero or one |
| `bitcast<T>(value)` | a compiler-listed equal-representation pair, including a `bitstruct` and its exact backing integer | identical complete bit pattern, with no validation or normalization |
| `address<T>(value)` | `u64` to a data-address type, or any one-word data/callable address to `u64` | identical target-word address bits |
| `relens<T>(value)` | data address to complete target address type `T` with the same ordinary/volatile/MMIO qualifier set and a different pointee | identical address bits with `T`'s pointee lens |
| `qualify<T>(value)` | data address to complete target address type `T` with the same pointee and a different ordinary/volatile/MMIO qualifier set | identical address bits with `T`'s explicitly selected qualifier intent |
| `floatcast<T>(value)` | an admitted scalar conversion involving `f32` or `f64` | IEEE value when representable; exceptional float-to-integer cases are target-defined |
| `saturate<T>(value)` | integer source and narrower integer `T` with the same signedness | clamp the mathematical value to `T.min .. T.max`, then produce `T` |
| `truncate_bits(value, width)` | fixed-width integer value and compile-time constant `width` in `1 ..= bit_width(value)` | the same declared integer type, with only the low `width` representation bits retained and every higher bit zero |

For `truncate_bits`, a width equal to the source width is identity. For a signed
source and a smaller width, clearing the higher bits makes the result
non-negative; the operation does not sign-extend the retained field. The value
is evaluated once before the width is validated. `saturate` is not a floating
conversion and is not an alias for target float-to-integer behavior.

The type argument is mandatory on every operation that shows `<T>` above,
denotes the complete result type (including a complete address type), and is
never inferred or defaulted. Even an untyped integer literal requires
`address<@U>(literal)` to become an address; an address context does not bind it
implicitly. These names cannot be declared, imported,
aliased, shadowed, taken as callable values, or overloaded. Each operation is
pure and performs no allocation, branch, trap, or memory access. A conversion
whose source and target types are outside its row is a compile-time error; the
compiler never silently selects another conversion class.

Raw integer construction of a callable remains a trust boundary and uses the
separately specified `trusted_callable<T>(address)`, not `address<T>`. `checked<T>(value)` is a
reserved spelling and is rejected until its failure model is implemented.

#### Address types and explicit access

`@T`, `@volatile T`, and `@mmio T` are one-target-word address types. The
qualifier is part of the type. `@volatile` controls compiler-visible access
observability and ordering; `@mmio` adds programmer MMIO intent; neither type
establishes the architectural page-table memory type. Merely applying
`qualify<T>` performs no access and introduces no `volatile_access` or `mmio`
effect. Removing either qualifier produces the existing qualifier-loss warning.

The contextual word `at` is not an address operator. It appears only in a
declarative placement production, such as a layout entry or another
compiler-defined declaration space. Runtime address values continue to use the
`@` type prefix.

An address exposes these compiler-owned methods:

<!-- wyst-contract: sketch -->
```wyst
const word: u32 = word_address.load()
word_address.store(word)
```

The receiver fixes the exact pointee type and qualifier. `.load()` takes no
argument and returns `T`; `.store(value)` requires exactly `T` except for normal
contextual typing of an untyped literal. Each call emits exactly one typed
memory event. An ordinary receiver has no effect, a volatile receiver has
`volatile_access`, and an MMIO receiver has both `volatile_access` and `mmio`.
No method performs an implicit `relens`, qualifier change, allocation, fence,
or alignment repair.

A byte-lensed address additionally supports explicit-endian integer access:

<!-- wyst-contract: sketch -->
```wyst
const magic: u32 = bytes.load<u32>(endian = .big)
bytes.store<u16>(count, endian = .little)
```

The receiver must be exactly `@u8`, `@volatile u8`, or `@mmio u8`. The explicit
type is exactly `u16`, `i16`, `u32`, `i32`, `u64`, or `i64`; `endian` is a
mandatory label and its value is exactly `.big` or `.little`. Neither the type
nor byte order is inferred or defaulted. Raw integers, non-byte address lenses,
and atomic addresses are rejected. The operation is one width-`T` access plus
only the byte reversal required by the selected target. Bytewise fallback,
temporary storage, an adjusted address, hidden fences, and multiple memory
events are forbidden.

For the current AArch64 target, ordinary and volatile 16-, 32-, and 64-bit
scalar accesses explicitly permit an unaligned address. Eight-bit access is
naturally aligned at every byte address. MMIO access instead requires natural
alignment for its width. The compiler rejects a provably misaligned MMIO
access. It inserts no runtime check for a dynamically aligned address; a
dynamically misaligned MMIO operation is a possible
`architectural_fault_or_trap`, never compiler-exploitable undefined behavior or
a trusted assertion. Semantic reports record the required alignment, the
selected target's unaligned-access fact, and whether an architectural fault is
possible.

#### Unit-explicit address operations

Typed addresses support none of `+`, `-`, `+=`, or `-=`. Address traversal uses
exactly these unshadowable operations:

<!-- wyst-contract: sketch -->
```wyst
const next_byte: @u8 = byte_offset(bytes, byte_count)
const next_word: @u32 = element_offset(words, element_count)
const length_address: @u64 = field_addr(header, Header.length)
```

`byte_offset(pointer, count)` counts bytes and preserves the receiver lens and
qualifiers. `element_offset(pointer, count)` counts complete receiver pointees,
scales once by `#size_of(T)`, and preserves the receiver type.
`field_addr(pointer, Header.field)` requires a pointer whose pointee is
`Header`, adds that declared field's byte offset, changes the result lens to the
field type, and preserves address qualifiers. The field selector is a
compile-time type-field identity, not a runtime value.

The count may have any fixed-width integer type; it is not implicitly converted.
Its signed or unsigned mathematical value and any element scaling are computed
in arbitrary precision, then the final one-word address is reduced modulo
`2^64`. Thus negative signed counts move backward and address overflow wraps at
the target word. Relocation addends are always bytes. A constant
`element_offset` addend is scaled exactly once before becoming a relocation
addend; `byte_offset` and `field_addr` addends are already byte counts.

`addr_of(local)` materializes the runtime address of addressable local storage
without reading or writing it:

<!-- wyst-contract: sketch -->
```wyst
var slot: u64 = 0
const slot_address: @u64 = addr_of(slot)
```

The result preserves the local's exact declared type, so an existing
`MaybeUninit<T>` local produces `@MaybeUninit<T>`. Materialization may force
a reported frame/addressability resource and is rejected for hard
register-placed storage. Existing `noescape` and local-address lifetime rules
reject returning, storing, or otherwise escaping the result. This operation is
distinct from relocation-producing `#addr_of(symbol)`.

#### Slice range views and raw views

`[]T` remains a non-owning two-word view with read-only `.data: @T` and
`.len: u64` projections. A fixed array or an existing slice supports exactly
these end-exclusive range forms:

<!-- wyst-contract: sketch -->
```wyst
const whole: []u8 = buffer[..]
const middle: []u8 = buffer[2 ..< 5]
const head: []u8 = buffer[..< 5]
const tail: []u8 = buffer[2 ..]
```

`..<` separates two present bounds. `..` denotes omitted start and/or end only
inside this slice grammar. Slice ranges and integer-loop ranges are syntax, not
first-class range values. The compiler evaluates the source, then a present
start, then a present end, exactly once each from left to right. Forming the
view performs no allocation, copy, bounds check, or memory access. Only a bound
or ordering that is provably invalid at compile time is rejected; dynamic
bounds remain unchecked.

Slice subscripts do not apply directly to `DynamicArray<T>`. That type's own
operation contract may expose a slice separately, but its descriptor is not an
array or slice source for this grammar.

An ordinary `@T` address has the sole raw-view constructor:

<!-- wyst-contract: sketch -->
```wyst
const base: @u8 = address<@u8>(0x4000)
const raw: []u8 = base.slice(elements = 64)
const tail_raw: []u8 = element_offset(base, 8).slice(elements = 56)
```

The receiver must be ordinary, not volatile or MMIO. The `elements` label is
mandatory and always counts `T` elements, never bytes. The count is a
fixed-width integer and a provably negative value is rejected. The receiver
and count are evaluated once from left to right. Construction itself performs
no memory access or allocation.

## 1.4 Scalar Primitive Types

| Type           | Meaning                                             |
| -------------- | --------------------------------------------------- |
| bool           | boolean; size 1, alignment 1, stored as byte 0 or 1 |
| u8/u16/u32/u64 | unsigned integers                                   |
| i8/i16/i32/i64 | signed integers                                     |
| f32/f64        | floating point                                      |

Scalar primitives are irreducible machine values. They have fixed size and
alignment, can live in a single scalar register or scalar memory slot, and are
the direct operands for Wyst's numeric and boolean operators.

Examples:

### Non-Scalar Built-In Type Forms

These are built into the language, but they are not scalar primitives. They
carry structure, interpretation, indirection, length, or lane shape beyond a
single irreducible scalar value.

| Type        | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| string      | built-in `{ data : @u8, len : u64 }`, size 16, alignment 8 |
| @T          | address into T                                            |
| @volatile T | volatile-qualified address into T                         |
| @mmio T     | volatile-qualified address into T with MMIO intent        |
| [T:N]       | SIMD vector type                                          |
| [N]T        | fixed-size stack array                                    |
| []T         | slice descriptor                                          |
| DynamicArray<T> | explicitly imported dynamic array descriptor            |

The built-in `string` type is a length-carrying byte string for UTF-8 text.
Its `len` field is the number of bytes, not the number of Unicode scalar
values, user-perceived characters, or grapheme clusters. The compiler stores
string literal content exactly as encoded after escape processing and performs
no Unicode normalization. Like the other built-in type names, `string` is
lexed as an identifier and resolved as a type in type contexts; it is not a
keyword token.

Examples:

---

## 1.6.1 Bitstructs and Typed Bit Fields

`bitstruct` declares a nominal value whose complete representation is one
unsigned backing scalar. It provides typed, named access to contiguous bit
locations without introducing arbitrary-width scalar types.

<!-- wyst-contract: sketch -->
```wyst
enum UartMode: u8 {
  disabled = 0
  normal = 1
  fifo = 2
  reserved = 3
}

bitstruct Control: u32 {
  ENABLE: bool at 0
  MODE: UartMode at 6..=7
  DIVISOR: u8 at 8..=11
}
```

The backing type is exactly one of `u8`, `u16`, `u32`, or `u64`. A field has an
explicit `bool`, fixed-width integer, or payload-less enum carrier and one
location.
`at N` denotes one bit. `at A..=B` denotes the inclusive low-to-high range
whose width is `B - A + 1`. All positions are constant, `A <= B`, the derived
width is positive, every bit is within the backing type, and fields do not
overlap. A `bool` field occupies exactly one bit.

`width N`, `bits(...)`, an intervening `bit` word, exclusive or descending
ranges, empty ranges, non-contiguous ranges, and alternate range spellings are
not part of the language. A logical value split across non-adjacent hardware
locations is represented by separate fields and combined explicitly by the
program.

### Carrier and Encoding Rules

A field read extracts its location and returns the declared carrier type. An
enum carrier must be payload-less and must declare exactly one variant for
every encoding representable by the field width. Duplicate, missing, negative,
or out-of-range encodings are rejected. A hardware field with reserved or
unknown encodings must name those variants or use an unsigned integer carrier
and decode explicitly. Extraction can therefore never manufacture an invalid
enum value.

An unsigned carrier zero-extends the extracted encoding. A signed integer
carrier sign-extends from the field width into the declared carrier width, so a
three-bit `i8` field interprets encoding `0b111` as `-1`.

Because coverage is complete, the all-zero backing/reset image also decodes to
a valid value for every enum-backed field; no raw import can create a missing
enum encoding.

A carrier may be wider than its location. An enum value or a constant value
proven to fit the encoded width may be written directly. A runtime integer
whose carrier has more representation bits than the field requires must pass
through `truncate_bits(value, width)` with the field's exact width. This
operation keeps the carrier type while making the discarded high bits explicit.
No field write silently truncates.

<!-- wyst-contract: sketch -->
```wyst
var control: Control = bitcast<Control>(raw)
control.ENABLE = true
control.MODE = .fifo
control.DIVISOR = truncate_bits(dynamic_divisor, 4)
```

A field mutation preserves every backing bit outside the selected location.
For addressable storage this is one logical source read-modify-write and is not
an atomic memory operation. It does not protect shared memory or MMIO from
concurrent access; use the relevant atomic operation or external
synchronization when another agent may update the same backing word.

### Complete Construction

The expected-type aggregate form constructs a `bitstruct`:

<!-- wyst-contract: sketch -->
```wyst
const initial: Control = {
  ENABLE = true,
  MODE = .normal,
  DIVISOR = 4,
}
```

Every declared field must appear exactly once. Unknown, duplicate, or missing
fields are rejected. Field expressions are evaluated once in written order.
Construction begins with a zero backing value and inserts the named fields, so
every unoccupied backing bit is zero. A later field mutation instead preserves
all bits outside the selected field, including unnamed bits imported from a
raw backing value.

A fieldless bitstruct is constructed by the complete empty aggregate `{}` and
therefore has the all-zero backing value. For a bitstruct with any declared
field, `{}` is incomplete and is rejected by the same completeness rule.

### Raw Boundary

`bitcast` is the sole raw import/export boundary:

<!-- wyst-contract: sketch -->
```wyst
const control: Control = bitcast<Control>(raw)
const encoded: u32 = bitcast<u32>(control)
```

The conversion is legal only between a `bitstruct` and its exact declared
backing type. It preserves every backing bit, including unnamed bits, with no
masking, validation, normalization, memory access, or hidden instruction.
There is no implicit conversion and no `from_bits`, `to_bits`, or constructor
alias.

### Lowering and Diagnostics

The compiler records one normalized typed-field description for declaration
checking, field access, formatting/editor metadata, semantic reports, typed IR,
and target lowering. The description contains the nominal owner, exact backing
type, carrier type, low bit, encoded width, mask, and enum encoding coverage.
Diagnostics and reports are derived from that description rather than
re-parsing field syntax in later phases.
Hardware register declarations that expose named bit locations consume this
same normalized interface; they do not define a second field grammar or
encoding checker.

On AArch64, an integer or boolean extraction/insertion may select `ubfx`/`bfi`
when those instructions implement the typed operation exactly. Enum carriers
use their complete checked encoding. Target lowering is deterministic and may
use an equivalent instruction sequence when required by the carrier, but it
must not add an access, implicit truncation, validation, or normalization.

The generic capability bound is spelled `bitstruct`. It admits nominal
`bitstruct` types and promises whole-value equality, storage, passing,
returning, and address-taking.

---

## 1.6.2 Hardware Register Snapshot Types

Hardware register declarations separate a register's captured value from the
object that performs the hardware access. A reusable MMIO register map declares
register offsets and backing widths; a placed `mmio` declaration supplies the
base address:

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

Each register in `register_map M` introduces exactly one nominal captured-value
type named `M.REG.Value`. The type exists even when the register declaration has
no field block. `UART0.FR.read()`, for example, performs one hardware read and
returns `Pl011.FR.Value`. The returned value is an ordinary captured value: it
may be bound, copied, passed, or returned according to ordinary value rules and
never performs another hardware access by being observed.

Every snapshot has a read-only `.raw` projection whose type is the register's
exact backing type. Each readable named field projects from the same captured
backing value. A field projection therefore emits only the value extraction
required by its carrier and bit location; it cannot reload the register. A
write-only field has no readable projection. Snapshots are not implicitly
convertible to their backing type and are not accepted by a raw register write;
the explicit boundary is `snapshot.raw`. There is no source snapshot
constructor, raw-to-snapshot conversion, writable `.raw`, `read_raw`, or
`write_raw` surface.

A register-map backing is exactly `u8`, `u16`, `u32`, or `u64`. This is both the
snapshot's raw representation and the width of every full-register MMIO
transfer. Signed integers, `bool`, enums, addresses, floating-point values,
vectors, arrays, and aggregates are not map-register backing types. Named
hardware fields continue to use the shared typed-field carriers and normalized
locations from §1.6.1; their carriers do not change the backing width.

A system-register declaration creates the analogous nominal `NAME.Value` type,
always with raw representation `u64`. The declaration may contain the same
normalized hardware field descriptions. A fieldless catalog-named declaration
uses an explicit empty field block, while a fieldless encoded target-extension
declaration uses its canonical blockless form:

<!-- wyst-contract: sketch -->
```wyst
system_register CurrentEL: readonly u64 {}
system_register VENDOR_CTL: readwrite u64 at S3_0_C15_C2_0
```

Every other system-register backing is rejected, including signed or narrower
integers, enums, bitstructs, vectors, and aggregates. Field carriers affect
extraction and insertion only; one system-register transfer is always exactly
64 bits.

A standalone scalar MMIO declaration deliberately does not create a nominal
snapshot:

<!-- wyst-contract: sketch -->
```wyst
mmio TIMER: readonly u64 at 0x0200_bff8
const ticks: u64 = TIMER.read()
```

Its read result and write operand are the declared scalar `T` directly. `T`
must be a fixed-width scalar that the selected target can transfer with one
load/store operation; vectors and aggregates are rejected because they require
multiple accesses. A scalar MMIO object has no `.raw`, named-field projection,
named write, or `modify` operation. Hardware that requires fields uses a
one-register map instead.

The declaration, field-policy, operation, and exact-access rules are specified
in [Chapter 11](chapter-11-intrinsics.md). Compiler-event ordering and effects
are specified in [Chapter 9](chapter-09-memory-model.md). These snapshot types do
not alter the raw `@mmio T` address type.

---

## 1.6.3 Enums

Payload-less enums are transparent tag values. A payload enum stores the
declared tag at offset zero followed by aligned inline storage large enough for
its largest variant.

The shared payload alignment is the largest variant alignment. The payload
offset is `align_up(size_of(tag_type), payload_alignment)`, and total size is rounded up to the aggregate alignment. Construction writes the tag and active
payload and deterministically zeroes inactive payload and padding bytes.
Variant fields retain their declared types and offsets.

Chapter 26 defines construction, matching, moves, initialization, destruction,
equality, and outcome behavior. Chapter 15 defines ABI classification, Appendix
A defines typed IR facts, and Chapter 23 defines debug information.

---

## 1.7 Strings

Runtime `string` values produced from string literals live in `.rodata`.
When a string literal initializes `[N]u8`, the decoded bytes are embedded in
that fixed array's storage and zero-filled as described in the fixed-array
section.

Example:

Compile-time interpretation:

<!-- wyst-contract: sketch -->
```wyst
// `string` is built in with this representation:
// { data : @u8, len : u64 }
```

Strings are:

- non-owning
- immutable
- length-tracked
- compile-time generated

No null terminator is required.

---

## 1.7.1 Character Literals

A single-quoted character literal has type `u8`:

Character literals support the escape sequences `\\`, `\'`, `\0`, `\n`,
`\r`, `\t`, and `\xHH`. They are compile-time constants and follow the same
constant-folding rules as integer literals.

The value is the ASCII byte for a direct character or the explicit byte named
by an escape sequence. Direct non-ASCII characters are rejected rather than
truncated; use string literals for UTF-8 text.

Because the type is `u8`, character literals participate in the normal
type system with no implicit widening:

---

## 1.8 Compile-Time Constants

Constant expressions use the arithmetic and type-conversion rules described in
this design corpus.

Top-level compile-time constants are evaluated by dependency graph, not source
order. A top-level constant may refer to another visible top-level constant
declared later in the same module or imported module, provided the dependency
graph is acyclic. A cycle among top-level constants is a compile error.

Local constants declared inside a function body remain lexical: a local
constant is visible only after its declaration, and local forward references
are rejected.

Example:

Forward top-level references are valid when acyclic:

Cycles are rejected:

Compile-time evaluation is part of the core language.

---

## 1.9 Numeric Literals and Digit Separators

Numeric literals support `_` as a digit separator to improve readability:

Rules:

- `_` may appear between any two digits
- `_` cannot appear at the start or end of a literal
- Multiple `_` in a row are not allowed
- `_` is ignored during parsing — purely syntactic sugar

This applies to all numeric bases:

| Base    | Example         |
| ------- | --------------- |
| Hex     | `0x09_00_00_00` |
| Decimal | `4_096`         |
| Binary  | `0b1111_0000`   |

Float literals also support separators:

---

## 1.10 Comments

Single-line comments use `//`:

Multi-line comments use `/* ... */`:

Rules:

- `//` comments extend to end of line
- `/* ... */` comments span arbitrary lines
- `/* ... */` cannot be nested
- `/* ... */` may appear anywhere whitespace is allowed

---

## 1.11 Multiline String Literals

Multiline strings use triple-quotes `""" ... """`:

Rules:

- Opening `"""` is followed by `\` to suppress the first newline
- Closing `\` before `"""` suppresses the trailing newline
- Without `\` on the opening or closing line, the newline is included
- Standard escape sequences (`\n`, `\t`, `\\`, `\"`) work inside
- The string is stored in `.rodata` with exact byte content

Examples:

Multiline strings compile to the same built-in `string` representation:

<!-- wyst-contract: sketch -->
```wyst
// { data : @u8, len : u64 }
```

The `len` is the exact byte count of the string content (excluding the `"""` delimiters).
For UTF-8 text, this may be larger than the number of Unicode scalar values or
user-perceived characters.

### Dedented Multiline Strings

When a multiline string is indented in source code to match surrounding code,
the indentation becomes part of the string content. The `#dedent` directive
strips common leading whitespace at compile time:

Produces:

```
<html>
  <head></head>
  <body>
    <p>Hello</p>
  </body>
</html>
```

Algorithm:

1. Collect all non-blank lines (after the opening `"""`)
2. Find the minimum leading whitespace across those lines
3. Strip that amount from the start of every line
4. Preserve relative indentation between lines

Rules:

- `#dedent` is a compile-time directive — no runtime cost
- Works with existing `"""\` / `\"""` newline suppression
- The opening `\` is optional; use it when the string should not start with a newline
- The trailing `\` is optional; use it when the string should not end with a newline.
  Indentation before the closing `"""` is allowed after a trailing `\` and is
  not part of the string.
- Operates before the string is placed in `.rodata`
- Result is the same `string` struct (`data` + `len`)

---

## 1.12 Operators

Wyst operators fall into three categories: unary, binary, and compound
assignment. All operators are deterministic — overflow, division, and
shift semantics are fully specified with no undefined behavior.

For complete arithmetic semantics, integer overflow rules, shift edge cases,
and floating-point behavior, see the Wyst Operator Specification document.
This section covers the operator set, precedence, and ARM64 lowering.

---

### Unary Operators

Unary operators appear in prefix position and bind more tightly than any
binary operator.

| Operator | Name               | Definition                                                        |
| -------- | ------------------ | ----------------------------------------------------------------- |
| `+`      | identity           | `0 + x`                                                           |
| `-`      | negation           | `0 - x`                                                           |
| `~`      | bitwise complement | every bit of `x` flipped; equivalent to `-(x + 1)` for signed `x` |
| `!`      | logical NOT        | `false` if `x` is true, `true` if `x` is false                    |

The `~` symbol is **unary only** — it has no binary role.

---

### Binary Operators

#### Arithmetic

| Operator | Name                 | Operands         |
| -------- | -------------------- | ---------------- |
| `+`      | sum                  | integers, floats |
| `-`      | subtraction          | integers, floats |
| `*`      | multiplication       | integers, floats |
| `/`      | division (truncated) | integers, floats |
| `%`      | modulo (truncated)   | integers         |
| `%%`     | remainder (floored)  | integers         |

Integer division truncates toward zero. `%%` produces a remainder with the
same sign as the divisor (floored). See the Operator Specification for the
full sign table, the division-by-zero rules, and the most-negative-value
overflow exception.

#### Bitwise

| Operator | Name            | Operands |
| -------- | --------------- | -------- |
| `\|`     | bitwise OR      | integers |
| `^`      | bitwise XOR     | integers |
| `&`      | bitwise AND     | integers |
| `&^`     | bitwise AND-NOT | integers |
| `<<`     | left shift      | integers |
| `>>`     | right shift     | integers |

`&^` computes `a & (~b)` — AND with the bitwise complement of the right
operand. It lowers directly to `bic` on ARM64.

`>>` is an **arithmetic shift** for signed integers (sign bit extended) and
a **logical shift** for unsigned integers (zeros shifted in).

#### Comparison

Comparison operators produce a `bool` result.

| Operator | Name             |
| -------- | ---------------- |
| `==`     | equal            |
| `!=`     | not equal        |
| `<`      | less than        |
| `<=`     | less or equal    |
| `>`      | greater than     |
| `>=`     | greater or equal |

#### Logical

Logical operators short-circuit: the right operand is only evaluated if the
result is not determined by the left operand alone.

| Operator | Name        | Definition                       |
| -------- | ----------- | -------------------------------- |
| `&&`     | logical AND | `b` if `a` is true, else `false` |
| `\|\|`   | logical OR  | `true` if `a` is true, else `b`  |

---

### Operator Precedence

Unary operators bind more tightly than all binary operators.

Binary operators use the Chapter 7 precedence table. Higher numbers bind more
tightly. Operators of equal precedence associate left to right, except
comparison operators, which are non-associative and require parentheses for
explicit grouping.

| Precedence | Operators                   | Associativity   |
| ---------- | --------------------------- | --------------- |
| 9          | `*` `/` `%` `%%`            | left            |
| 8          | `+` `-`                     | left            |
| 7          | `<<` `>>`                   | left            |
| 6          | `&` `&^`                    | left            |
| 5          | `^`                         | left            |
| 4          | `\|`                        | left            |
| 3          | `==` `!=` `<` `>` `<=` `>=` | non-associative |
| 2          | `&&`                        | left            |
| 1          | `\|\|`                      | left            |

Common expressions and how they parse:

---

### Compound Assignment Operators

All binary operators have a compound assignment form. `a op= b` is exactly
`a = a op b`. The left operand is evaluated once.

#### Arithmetic

| Operator | Equivalent   |
| -------- | ------------ |
| `+=`     | `a = a + b`  |
| `-=`     | `a = a - b`  |
| `*=`     | `a = a * b`  |
| `/=`     | `a = a / b`  |
| `%=`     | `a = a % b`  |
| `%%=`    | `a = a %% b` |

#### Bitwise

| Operator | Equivalent   |
| -------- | ------------ |
| `\|=`    | `a = a \| b` |
| `^=`     | `a = a ^ b`  |
| `&=`     | `a = a & b`  |
| `&^=`    | `a = a &^ b` |
| `<<=`    | `a = a << b` |
| `>>=`    | `a = a >> b` |

#### Logical

| Operator | Equivalent     |
| -------- | -------------- |
| `&&=`    | `a = a && b`   |
| `\|\|=`  | `a = a \|\| b` |

Short-circuit semantics are preserved in `&&=` and `||=`.

---

### ARM64 Lowering

| Wyst expression | ARM64 instruction(s)     | Notes                            |
| -------------- | ------------------------ | -------------------------------- |
| `a + b`        | `add xD, xA, xB`         |                                  |
| `a - b`        | `sub xD, xA, xB`         |                                  |
| `a * b`        | `mul xD, xA, xB`         |                                  |
| `a / b`        | `sdiv` / `udiv`          | signed or unsigned by type       |
| `a % b`        | `sdiv` + `msub`          | truncated remainder              |
| `a %% b`       | `sdiv` + `msub` + adjust | floored remainder; zero-safe for `b == 0` |
| `a \| b`       | `orr xD, xA, xB`         |                                  |
| `a ^ b`        | `eor xD, xA, xB`         |                                  |
| `a & b`        | `and xD, xA, xB`         |                                  |
| `a &^ b`       | `bic xD, xA, xB`         | direct ARM64 instruction         |
| `a << b`       | `lsl wD/xD, wA/xA, wB/xB` | count modulo `max(32,width(T))` |
| `a >> b`       | `asr` / `lsr`            | signed → `asr`, unsigned → `lsr`; same count domain |
| `-x`           | `neg xD, xA`             |                                  |
| `~x`           | `mvn xD, xA`             |                                  |
| `!x`           | `cmp xA, #0` + `cset`    |                                  |

---

## 1.13 Compile-Time Conditionals

Compile-time conditionals use the `#if` directive in the locked design:

---

## 1.14 Runtime Conditionals

<!-- wyst-contract: sketch -->
```wyst
if count == 0 {
    return
}
```

In the locked design, `#if` is a compile-time directive evaluated during
constant folding.
`if` is a runtime conditional that generates branches.

---

## 1.15 Static Assert

`#static_assert` verifies a compile-time boolean expression and halts
compilation with a diagnostic message if it is false.

<!-- wyst-contract: sketch -->
```wyst
#static_assert(expr, "message")
```

`expr` must be a compile-time constant boolean expression. `message` is a
required string literal — a failing assert without context is nearly as
useful as no assert.

---

### Contrast with `#if`

`#if` selects between two outcomes — it is a tool for variation:

`#static_assert` makes a hard guarantee — it is a tool for catching mistakes:

<!-- wyst-contract: sketch -->
```wyst
#static_assert(#size_of(uart_regs) == 0x48, "uart_regs layout must match PL011 spec")
```

If the assertion fails, compilation stops. There is no else branch.

---

### Compile-Time Query Directives

The following `#` query forms are available in any compile-time expression
context, not only in `#static_assert`:

| Query form            | Returns                                                       |
| --------------------- | ------------------------------------------------------------- |
| `#size_of(T)`         | size of type `T` in bytes, as a compile-time `u64`            |
| `#align_of(T)`        | alignment requirement of type `T` in bytes                    |
| `#len(array)`         | element count of a fixed-array value, as a compile-time `u64` |
| `#field_offset(T, f)` | byte offset of field `f` in struct type `T`                   |
| `#cache_line_width()` | cache line width in bytes for current `#target` (default: 64) |

`#size_of` and `#align_of` are type-parameterized. `#field_offset` is
type-and-field-parameterized. `#len` is storage-path-parameterized and requires
that path to have a fixed-array type. `#cache_line_width()` is
target-parameterized — its value is set by `#target(... cache_line = N)` or
defaults to 64. See [chapter-09-memory-model.md §9.12](chapter-09-memory-model.md) for cache line
awareness semantics.

---

### Common Uses

#### Exception frame layout

<!-- wyst-contract: sketch -->
```wyst
// Saved registers use the target profile's fixed field shape.
trap_frame TrapFrame: aarch64 {
  x: [31]u64 // saved x0 through x30
  elr: u64 // exception link register (saved PC)
  spsr: u64 // saved PSTATE
  interrupted_sp: u64 // interrupted stack pointer
}

// Hard establishes/restores label clauses verify the canonical transitions;
// see Chapter 14 for the complete trap-frame ABI.
#static_assert(#size_of(TrapFrame) == 0x110, "trap frame must match the ABI")
```

#### Architecture assumptions

<!-- wyst-contract: sketch -->
```wyst
#static_assert(#size_of(@u8) == 8, "expected 64-bit address size")
#static_assert(PAGE_SIZE == 4096, "only 4K pages supported on this target")
```

---

### Placement

`#static_assert` may appear at:

- module scope — checked when the module is compiled
- inside a function body — checked at the function definition during semantic
  checking, even if the function is unreachable or marked `#[inline]`
- inside a `bitstruct` or `struct` declaration — checked when the
  type is resolved

Statement-level `#if` expansion happens before function-body semantic checking,
so `#static_assert` is evaluated only in the selected branch.

---

### ARM64 Lowering

`#static_assert` emits no instructions. It is a compile-time directive only.
A passing assertion disappears entirely from the output. A failing assertion
halts compilation before any output is produced.

---

## 1.13 Generics: Type-Parameter Model

This section defines Wyst's generic syntax and type-system model:
type-parametric functions, structs, and enums with explicit type arguments.
Generic aliases, traits, concepts, typeclasses, and compile-time value
parameters are outside this model.

---

### Reserved Boundaries

The angle-bracket token pair `<...>` is implemented for generic type parameter
and type argument syntax. Compile-time value parameters are not part of Wyst's
generic model. Forms such as `RingBuffer<T, Capacity>` or `Foo<T, 4>` are not
valid generic declarations or instantiations; fixed arrays continue to use the
dedicated `[N]T` syntax.

The narrow dynamic-array initializer spelling
`dyn_array_init<T>(arena, capacity = ..., growth = ...)` uses the same explicit
generic type-argument spelling as generic calls. Its angle-bracket argument
must be a type, and it does not accept compile-time values.

---

### Generic Model

Wyst's generic syntax supports type parameters on functions, structs, and enums:

The parameter names `T` and `E` range over types, not values. They may be used
in type positions inside the generic declaration. They are not runtime values,
not constants, and not permitted as array bounds.

Generic type parameter lists are non-empty. `Box<> :: struct { ... }` and
`noop<> :: () { }` are rejected; if a declaration has no type parameters, it
should be written without `<...>`.

Type parameter names are ordinary identifiers. Wyst does not enforce a casing
convention, so `T`, `E`, `key`, and `value` are all valid parameter names.
However, type parameters may not reuse built-in type names such as `bool`,
`string`, `u8`, `u16`, `u32`, `u64`, `i8`, `i16`, `i32`, `i64`, `f32`, or
`f64`. A built-in type name in type position should always mean the built-in
type, not a shadowing generic parameter. A generic declaration also may not
repeat a type parameter name: `Pair<T, T>` is rejected because both occurrences
would bind the same name.

Type parameters are unbounded by default. A generic body may move, store, pass,
return, take addresses of, load/store through typed memory forms such as
`T@[addr]`, and form descriptor types over an unbounded `T`, but it may not
assume operations or structure that are not known from the declaration. In
particular, an unbounded `T` does not imply numeric operators, ordering, field
access, enum tag tests, boolean conditions, casts, default construction,
methods, or interface/trait members.

A type parameter may carry one built-in compile-time capability bound:

The bound syntax is declaration-only:

```peg
GenericTypeParam <- Identifier (':' GenericBound)?
GenericBound     <- 'integer'
                  / 'unsigned_integer'
                  / 'signed_integer'
                  / 'float'
                  / 'numeric'
                  / 'scalar'
                  / 'address'
                  / 'bitstruct'
                  / 'payload_word'
                  / 'fixed_layout_movable'
```

The bound names are recognized only in generic type-parameter bound position.
They are not global keywords and do not reserve ordinary value, type, field, or
module names outside that syntax.

Bounds are compile-time capabilities only. They do not add runtime checks,
hidden branches, dynamic dispatch, vtables, dictionaries, reflection metadata,
or implicit conversions. A bound only lets the compiler accept operations that
are valid for every concrete type in that closed family:

| Bound              | Accepted type arguments                          | Generic operations promised by the bound                                           |
| ------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `integer`          | `u8`, `u16`, `u32`, `u64`, `i8`, `i16`, `i32`, `i64` | integer arithmetic, integer comparison, bitwise operators, and shifts              |
| `unsigned_integer` | `u8`, `u16`, `u32`, `u64`                        | unsigned integer arithmetic, comparison, bitwise operators, and shifts             |
| `signed_integer`   | `i8`, `i16`, `i32`, `i64`                        | signed integer arithmetic, comparison, bitwise operators, shifts, and unary negate |
| `float`            | `f32`, `f64`                                     | floating arithmetic, comparison, and unary negate                                  |
| `numeric`          | all integer and float scalar types               | arithmetic and comparison common to integers and floats; no bitwise operators      |
| `scalar`           | `bool`, all integer scalar types, and floats     | equality, inequality, storage, passing, returning, and address-taking              |
| `address`          | pointer types such as `@T`, `@volatile T`, and `@mmio T` | pointer equality and address movement where pointer operations are already legal   |
| `bitstruct`        | nominal `bitstruct` types                        | whole-value equality, storage, passing, returning, and address-taking              |
| `payload_word`     | `bool`, integer scalar types, pointer types, function-pointer types, and nominal `bitstruct` types | narrowly word-sized generic storage contracts; not the general enum capability |
| `fixed_layout_movable` | compiler-proven fixed-layout values with ordinary move semantics | storage, passing, returning, address-taking, and inline enum payload fields |

The built-in bound set is intentionally narrow. It is not a trait, concept,
interface, typeclass, or structural predicate system. User-defined capability
bounds are outside this model.

Generic instantiation requires explicit type arguments:

<!-- wyst-contract: sketch -->
```wyst
swap<u64>(left, right)
```

The compiler does not infer `T = u64` from `swap(left, right)`. Generic type
uses are likewise explicit, as in `Result<u64, AllocError>`.
The number of type arguments must exactly match the generic declaration's type
parameter count. Wyst has no default type arguments and no omitted argument
inference, so `Pair<u64>` is rejected for `Pair<T, U>`, and
`swap<u64, u32>(...)` is rejected for `swap<T>(...)`.
If a type parameter has a bound, the corresponding type argument must satisfy
that bound at the instantiation site. For example, `add_one<bool>(true)` is
rejected because `bool` does not satisfy `integer`.

Generic enum payloads use the `fixed_layout_movable` capability. A payload
variant that stores a type parameter directly, such as `Ok(T)`, must declare
`T: fixed_layout_movable`. The narrower `payload_word` bound remains available
only to APIs whose own contract genuinely requires one word; it is not an enum
restriction. Violations are rejected at the declaration or instantiation
boundary:

Generic type arguments are full types, so they may contain other instantiated
generic types and existing type constructors:

<!-- wyst-contract: sketch -->
```wyst
Pair<Box<u64>, Error>
[]Box<u64>
@Box<[]u8>
```

Every entry inside `<...>` must still be a concrete type. Compile-time values
are not generic type arguments, so `Foo<T, 4>` is not accepted as a generic type
instantiation. Generic declarations are not first-class type values:
`MapLike<Box>` and `Wrapper<Result>` are rejected because `Box` and `Result`
still require their own complete type argument lists. Generic type argument
lists are also non-empty: `Box<>` and `swap<>()` are rejected rather than
treated as monomorphic uses.

Generic structs and enums instantiate to nominal types. The identity of a
generic nominal instantiation is the declaring type plus the concrete type
argument tuple. Two mentions of the same imported `Box<u64>` name the same
type, but `Box<u64>` and `Box<u32>` are distinct, and `Box<u64>` is not
assignment-compatible with another same-layout declaration such as
`Slot<u64>`. Layout compatibility does not create implicit conversion or
structural interchangeability.

Generic functions instantiate to distinct semantic function symbols by
declaring function plus concrete type argument tuple. Two modules that call the
same imported `swap<u64>` refer to the same canonical instantiation, but
different generic declarations do not merge just because their instantiated
bodies, signatures, or machine code match. A later backend or linker may fold
identical machine code only as an invisible optimization; diagnostics, debug
info, address identity, and symbol identity must still preserve the original
generic declaration and type arguments.

Diagnostics and debug info spell generic instantiations with the declaring path
and the canonical type-argument list, for example
`math.swap<u64>` or `collections.Result<@u8, AllocErrorCode>`. ELF symbols for
concrete generic instantiations use the required encoding in
[chapter-16-object-format.md §4.3](chapter-16-object-format.md#43-mangling), for
example `swap__wg1__u64`, so tooling has one public ABI spelling while
diagnostics keep the source-facing spelling.

Generic aliases are not part of Wyst's generic model. A named generic type must
be introduced by a `struct` or `enum` declaration, so its nominal identity is
anchored by source declaration rather than by alias expansion.

#### Generic Instantiation Termination

Generic instantiation is keyed by canonical semantic identity, not source text,
parser object identity, generated symbol spelling, or traversal order. The
canonical key is:

```text
CanonicalInstantiationKey =
  (DeclarationIdentity, TypeArgumentList, ValueArgumentList)
```

`DeclarationIdentity` is the resolved declaration identity produced by the
source graph and name-resolution phases. Import aliases, local qualification
choices, generated symbol names, and same-layout declarations do not change it.

`TypeArgumentList` is the complete ordered list of canonical concrete type
arguments. Each entry uses type identity after name resolution, including
nominal declaration identity for structs, enums, and bitstructs, and includes
the complete nested argument lists of any generic type arguments. A partial
generic declaration such as `Box` without all of its type arguments has no
canonical instantiation key.

`ValueArgumentList` is the complete ordered list of canonical compile-time
value arguments. Wyst's current generic model has no compile-time value
parameters, so this list is always empty today. A future value-parameter
feature must define a typed, fully evaluated, phase-owned canonical value
before allowing a non-empty list; source-equivalent expressions that produce
the same typed value canonicalize to the same entry, while values with
different declared parameter types remain distinct.

The instantiator maintains a semantic instantiation trace from each root
request to the request currently being expanded. A request that revisits an
active `CanonicalInstantiationKey` is a valid recursive cycle for
instantiation-termination purposes: the expansion closes over the existing
instantiation and does not create a second copy. For example, `List<u64>` may
refer to `@List<u64>`, and a generic function `walk<u64>` may call
`walk<u64>`, because both edges revisit the exact same canonical instantiation.
This rule only closes the generic request graph. It does not make by-value
recursive layout valid; type layout still rejects unsized recursive storage.

An instantiation chain must be rejected when it is strictly growing. A chain is
strictly growing when it revisits a declaration identity with a different
canonical key whose argument tuple contains an earlier argument tuple or
argument value under additional type or value structure. Examples include
`Nest<T>` requesting `Nest<Box<T>>`, then `Nest<Box<Box<T>>>`; requesting
`Nest<(value: T)>`, then `Nest<(value: (value: T))>`; or repeatedly wrapping a
type argument in another slice, array, pointer, tuple, container, or generic
application. Such a chain is not a finite recursive cycle because it never
revisits the exact same canonical instantiation.

Not every same-declaration revisit with different arguments is automatically a
growing-chain error. A finite set of distinct instantiations may be valid if it
eventually closes by revisiting exact canonical keys and no edge is strictly
growing. The rejection rule is the strictly growing chain, not a ban on all
mutual recursion between different concrete instantiations.

The language does not define an arbitrary recursion-depth, instantiation-count,
or expansion-step limit. Termination is semantic: exact canonical cycles are
finite, strictly growing chains are invalid, and finite acyclic request graphs
are allowed regardless of depth. Implementations may still enforce safety
limits for memory, time, stack use, or worklist size. Hitting such a limit is a
resource failure, not a semantic generic-recursion diagnostic, and the failure
must include the semantic instantiation trace, the limit that was reached, and
the canonical instantiation request that would have been expanded next.

Instantiation traces are deterministic. Trace entries render canonical
instantiation keys using the source-facing generic spelling from this chapter,
the owning declaration identity, complete type and value arguments, and the
source span that requested the next edge. Roots are considered in canonical
declaration-identity order, instantiation requests inside a declaration are
considered in source order, and ties are broken by canonical key order. Reports
and diagnostics must never depend on hash-map order, pointer addresses,
filesystem traversal order, thread scheduling, or the backend symbol encoder.

The canonical concrete type identity of a function pointer includes its fixed
effect upper bound after catalog normalization. Omitted `effects(...)`,
`effects(all)`, and an explicit complete catalog denote the same conservative
upper bound; named subsets use catalog order and remove duplicates. A different
fixed subset is a different concrete type argument and therefore a different
`CanonicalInstantiationKey`. The generic-instantiation ownership and transport
contract carries this exact canonical key through inference, semantic bodies, demand
worklists, caches, emitted definitions, and deduplication. No later phase may
drop the bound or reconstruct the key from a mangled symbol.

The generic design must satisfy the following constraints:

| Constraint                                                                 | Reason                                                                                                                                                                                         |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type parameters only                                                       | Keeps generic substitution focused on the type system; compile-time value parameters are not part of the language.                                                                             |
| Non-empty generic lists                                                    | Empty `<...>` adds a monomorphic spelling with no substitution semantics; monomorphic declarations and uses should omit generic syntax.                                                        |
| Ordinary identifier parameter names; built-in and duplicate names rejected | Avoids a casing rule while keeping scalar, built-in, and binder names unambiguous.                                                                                                             |
| Generic functions, structs, and enums only                                 | Covers generic algorithms, typed containers, and `Result<T, E>`/`Option<T>`-style sum types without adding aliases or interfaces.                                                              |
| Nominal generic type instantiations                                        | Preserves Wyst's exact type identity model; same-layout generic structs/enums do not silently substitute for one another.                                                                       |
| Nested generic type arguments                                              | Generic containers compose without special cases; `GenericTypeArgList` accepts `Type`, not only bare names.                                                                                    |
| Unbounded by default; closed built-in bounds only                          | Useful storage, forwarding, and container patterns do not require bounds. Numeric/address/bitstruct/payload-word helpers get explicit compile-time capability checks without a trait/interface system. |
| Monomorphization, not erasure                                              | Wyst has no runtime; type-erased generics would require a runtime dispatch mechanism (vtables, dictionaries) that does not exist.                                                               |
| One canonical function symbol per declaration/type tuple                   | Determinism: identical (`T`, `U`, ...) tuples for the same generic function declaration must produce one semantic symbol; different declarations never merge structurally.                     |
| Canonical instantiation key includes declaration identity plus complete type and value arguments | Termination, diagnostics, debug info, and symbol generation all need the same identity rule. Value-argument identity is reserved as an empty list until a future value-parameter feature exists. |
| Exact canonical cycles allowed; strictly growing chains rejected           | Self-recursive generic containers and functions should close over one instantiation, while `T -> Box<T> -> Box<Box<T>>` style expansion is not a finite program.                              |
| Explicit type arguments at instantiation                                   | Keeps generic binding local and deterministic; type-argument inference is not part of the language.                                                                                            |
| Exact type-argument arity, no defaults                                     | Avoids hidden substitution rules; every instantiation spells the same concrete type tuple that participates in nominal identity and symbol identity.                                           |
| No implicit conversions at instantiation                                   | §1.4.1 bans implicit numeric conversion across the whole language; instantiating `swap(T)` with `T = u32` must not silently accept a `u8` argument.                                            |
| Integrates with compile-time forms                                         | `#static_assert`, `#size_of`, `#align_of`, and `#if` work inside a generic body the same way they work in monomorphic code.                                                                    |
| Deterministic instantiation order                                          | Per the [Reproducibility Model](chapter-01-language-design.md); a generic instantiated from two modules must produce byte-identical code regardless of which module the compiler visits first. |
| No semantic recursion-depth limit                                          | Resource limits may protect an implementation, but they are resource failures with semantic traces rather than part of the language's accept/reject boundary.                                  |
| No late typed errors after substitution                                    | Missing generic capabilities are rejected at the generic declaration, and type-argument bound mismatches are rejected at the instantiation boundary. The compiler must not discover an invalid `T + 1` only after substituting some unrelated type. |

---

### Explicit Non-Goals

The generic design deliberately excludes:

- user-defined generic bounds, traits, interfaces, concepts, typeclasses, or
  structural capability predicates;
- type-argument inference at call sites or type-use sites;
- default type arguments;
- generic aliases;
- compile-time value parameters such as `Foo<T, N>` or `RingBuffer<T, 256>`;
- higher-kinded parameters, generic declaration values, partial generic
  application, or passing an unapplied generic declaration as a type argument.

The locked choice here is angle-bracket type parameters, monomorphized over
complete concrete type tuples for functions, structs, and enums, with explicit
nested type arguments at every instantiation site, unbounded parameters by
default, a closed set of built-in compile-time capability bounds, nominal type
identity for generic structs/enums, canonical semantic function symbols per
generic declaration/type tuple, canonical source-facing diagnostic/debug
spelling, and no value parameters.

---

### Non-Generic Parametric Idioms

The implemented generic model above is the required type-parameter surface.
The patterns below remain useful when a problem does not need a generic
declaration: manual monomorphization, `bitstruct` declarations, address-lens
code, and external code generation. `#if` is included here as the compile-time
selection rule, not as a type-value mechanism.

#### Manual Monomorphization

Write one function per concrete type. For small, frequently-monomorphic
operations (swap, min, max, byte-reverse), this is the path of least
resistance.

This is exactly what monomorphization would produce. The cost is
hand-maintenance when you add a new type.

#### `#if` Over Same-Typed Compile-Time Variation

When compile-time conditionals are used for variation, they pick between two
same-typed values or same-signature implementations based on a build-time
constant:

This covers configuration-driven value and body selection without becoming a
parametric function. Both branches must type-check against the same contextual
type; only the selected branch is emitted. Wyst does not have type values or
type aliases, so a configuration that changes storage type still uses explicit
concrete declarations or manual monomorphization.

#### `bitstruct` for Explicit Register Layouts

For register-layout records, `bitstruct` (see §1.6.1) makes each backing
width explicit. These declarations are nominal and are not generic aliases.

<!-- wyst-contract: sketch -->
```wyst
bitstruct SctlrEl1: u64 { ... } // 64-bit system register image
bitstruct MidrEl1: u64 { ... }  // 64-bit system register image
bitstruct FsrEl1: u32 { ... }   // 32-bit fault status image
```

#### `@T` for Pointer-Parametric Code

Since `@T` is structurally a tagged 64-bit address (see §1.4.1) and
arithmetic on it is element-scaled, address-walking code can be written over
the _bit width_ of the access by passing the address with the intended lens:

The "type-parametric" axis here collapses to "typed address arithmetic plus
explicit access width," which is enough for most low-level kernel work.

#### External Code Generation

External scripts, build tools, or editor macros may still generate concrete
Wyst source for repetitive declarations or project-local conventions outside
the generic model. Generated source has no special semantic status: the source
the compiler checks is the concrete source in the build input.

---

### Design Rationale

| Decision                                                    | Rationale                                                                                                                                                                                                             |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lock the syntax and model                                   | Generics have parser, IR, linker, debug-info, and diagnostic implications, so the language contract needs a precise shape.                                                                                            |
| Reserve `<...>` for generics                                | Wyst uses `<T>` syntax for type parameters and type arguments. Keeping that token pair dedicated avoids conflicting meanings.                                                                                          |
| Type-parameter-only generics                                | Most uses (`Result<T, E>`, typed containers, swaps/helpers) need types. Value parameters are excluded so fixed-size storage remains spelled with `[N]T` rather than a second parametric mechanism.                    |
| No casing rule for type parameters                          | Wyst avoids style rules in the parser. Rejecting only built-in type-name collisions preserves clarity without forcing `T`/`E`/`Key`/`Value` spelling.                                                                  |
| Generics include functions, structs, and enums only         | Functions cover generic algorithms; structs cover typed storage; enums cover result/option-style control flow. Generic aliases and interfaces are excluded to keep nominal identity direct.                           |
| Generic structs/enums instantiate nominally                 | A type's source declaration remains part of its identity after substitution. This avoids layout-based accidental compatibility and keeps diagnostics aligned with user-written names.                                 |
| Generic functions instantiate by declaration and type tuple | Repeated uses of `swap<u64>` share one semantic symbol, while `swap<u64>` and `exchange<u64>` remain distinct even if their code is identical. This keeps debug info, diagnostics, and address identity unsurprising. |
| Type arguments may nest                                     | Container patterns quickly need shapes such as `Pair<Box<u64>, Error>`; allowing type arguments to be full types avoids a second generics syntax expansion later.                                            |
| `T` is unbounded by default, with narrow built-in bounds     | Storage, movement, forwarding, and descriptor code can be useful without bounds. Numeric, scalar, address, bitstruct, and payload-word helpers get explicit compile-time capability checks without a general interface system. |
| No type-argument inference or defaults                      | Every instantiation spells its concrete type tuple. This keeps diagnostics, symbol identity, and monomorphization deterministic.                                                                                      |
| Canonical source-facing instantiation names                 | Diagnostics and debug info need stable names that users can map back to source; `Path.Name<canonical-args>` does that without exposing backend mangling.                                                              |
| Document non-generic idioms explicitly                      | The idioms above cover common parametric patterns that do not need the generic model.                                                                                                                                 |
| No user-defined interface/trait/concept system               | Wyst's generic model is substitution over explicit concrete type tuples plus closed built-in capabilities, not capability dispatch. This avoids a second type-system layer.                                            |

---

### Tradeoffs

- **Cost:** code may still need hand-monomorphized copies when an operation
  needs a capability outside the closed built-in bound set. For the
  kernel-scale workload Wyst targets, this is a small annoyance, not a
  structural problem.
- **Cost:** generic lowering must interact with
  the parser (context-sensitive `<...>`), type system (substitution and
  nominal identity), IR (substitution), linker (deduplication), debug info
  (per-instantiation DIEs), and error reporting (instantiation
  stacks).
- **Benefit:** the design fits Wyst's explicit-storage and nominal-identity
  model rather than copying C++, Rust, or Zig.

---
