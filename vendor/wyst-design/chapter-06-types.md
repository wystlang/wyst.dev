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

## v0.9 Types, Aggregates, and Generics (Current)

Wyst v0.9 keeps fixed arrays (`[N]T`), slices (`[]T`), vectors (`[T:N]`),
addresses, callable shapes, and nominal types, but removes the predecessor
dynamic-array type marker.
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

enum Result<T: payload_word, E: payload_word> {
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

Type-prefixed struct-construction spellings and `{ value, ... }`
array literals, and `field: value` literal entries are removed. Arrays and
vectors use `[value, ...]`; named multi-results use `(value, ...)`. A
payload-free enum variant may use expected-type shorthand such as
`const idle: Message = .quit`; payload variants use the enum constructor,
for example `Message.write(packet)`.

Generics are explicit and type-only. Parameter and argument lists are
non-empty; every application supplies the complete type-argument list, and
arguments are full types that may nest. Wyst v0.9 has no generic inference,
defaults, value parameters, aliases, user-defined bounds, traits, or turbofish.
Bounds come only from the closed compiler-defined capability catalog. Built-in
or duplicate parameter names and incorrect arity are errors.
The versioned [`wyst.genericBounds.v0.9`](generic-bounds.tsv) table is the
machine-readable authority for every active bound's spelling, subject set,
capability contract, and enum-payload eligibility; adding a bound requires one
complete atomic registry row.

After a value path, `<...>` is a generic application only when its matching
`>` is followed by `(`, `.`, `[`, `)`, `]`, `,`, `}`, or end of file;
otherwise comparison parsing wins. Within an already committed generic list,
`>>` and `>>=` split contextually into the required closing `>` tokens and any
remainder, so `Outer<Inner<u8>>` needs no separating whitespace.

Every instantiation is keyed by semantic declaration identity plus its complete
ordered concrete type arguments (and an empty value-argument tuple in v0.9).
Revisiting the same canonical key closes a legitimate recursive cycle. A
strictly growing instantiation chain is rejected with a deterministic
root-to-demand trace. A compiler safety budget is a distinct resource failure
and reports that same canonical trace; it is not the semantic termination rule.

### v0.9 Named Conversions, Addresses, and Slices

This section is the current source and semantic authority for conversions,
addresses, memory access, address offsets, and slices. The released v0.8
snapshot below remains useful background, but its categorized conversions,
typed-memory access, typed-address arithmetic, runtime address-of and endian
primitives, colon ranges, and raw descriptor constructors are not accepted
v0.9 alternatives.

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

The predecessor colon-range, raw-descriptor-constructor, typed-memory,
categorized-conversion, typed-address-arithmetic, runtime address-of, and
endian-primitive spelling classes are removed and rejected in v0.9.

## Released v0.8 Syntax Snapshot

> The remainder of this chapter preserves the released v0.8 exposition and
> remains authoritative for type semantics that do not conflict with the
> current section. Its punctuation-led declarations, `[dynamic]T`, typed
> `Type { ... }` struct literals, brace array literals, `as.<category>`,
> `T@[address]`, typed-address arithmetic, `%addr_of`, endian primitives, colon
> slices, raw slice descriptors, and related examples are historical v0.8
> syntax, not accepted alternatives in v0.9. The current v0.9 forms above take
> precedence wherever wording or examples conflict.

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
counter : u64 = 0
temperature : f32 = 21.5
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
addr : @u64 = 0x4000

color : [f32:4]

buf : [8]u8

s : []u8       // slice of u8 — carries base address and length
```

---

## 1.4.1 Type System: Conversions and Promotions

Wyst is **strictly typed**. There are no implicit numeric conversions
between distinct numeric scalar types, no implicit signed/unsigned mixing,
and no implicit narrowing. Every conversion that crosses a type boundary is
expressed with the `as` operator. Wyst accepts an expression only when
every binary operator has operands of the same concrete type.

This chapter defines the complete conversion model: untyped constants,
the `as` operator, mixed-signedness rules, `bool` semantics, raw bit-pattern
work with unsigned integers and `bitstruct`, endian-typed integers, address
types, and the boolean of the model ("does this code compile, and if not
why").

---

### Untyped Integer Constants

Every integer literal (`42`, `0x1000`, `0b101`, `1 << 5` where all operands
are literals) has the special type **`untyped_int`** until it is bound to a
context that requires a concrete type. `untyped_int` is not a runtime type;
no `untyped_int` value ever appears in a register. It exists only during
semantic analysis as a placeholder pending coercion.

When an `untyped_int` is bound to a concrete integer type, the compiler
checks the literal value against the target type's range:

- If the value is representable, the conversion succeeds.
- If the value is not representable, compilation fails with a diagnostic
  that names the literal, the target type, and the representable range.

<!-- wyst-contract: historical-v0.8 -->
```wyst
counter : u8 = 256 // compile error: 256 does not fit in u8 (max 255)
counter : u8 = 255 // OK
counter : u8 = -1 // compile error: -1 not representable in u8
flag : i8 = 200 // compile error: 200 > 127 (i8 max)
flag : i8 = 127 // OK
```

Constant-folded expressions are evaluated at arbitrary precision before the
range check. `(1 << 5) | (1 << 3)` is `40_untyped_int`, which fits in
`u8`, `u32`, `u64`, `i8`, `i32`, etc.

#### Default Type When No Context Demands One

If an integer literal appears in a position with no contextual target type
— for example, the right-hand side of a `:=` or `::=` declaration with no
annotation — the compiler picks **`i64`** as the default and emits the
binding at that type:

<!-- wyst-contract: historical-v0.8 -->
```wyst
counter := 0            // counter : i64 (default)
counter := 0 as.numeric u32 // counter : u32 (explicit conversion)
counter : u32 = 0       // counter : u32 (explicit annotation)
LIMIT ::= 16            // LIMIT :: i64 = 16 (inferred constant)
MASK ::= 1 << 5         // MASK :: i64 = 32 (inferred constant)
s := "hello"            // s : string (literal has concrete type)
b := true               // b : bool (literal has concrete type)
bad := u64              // compile error: type name is not a value
```

If the contextless value is in the high-bit `u64` mask range
`0x8000_0000_0000_0000..0xFFFF_FFFF_FFFF_FFFF`, defaulting to `i64` binds the
same 64-bit pattern as a negative two's-complement `i64` and emits warning
`W0202`. This keeps the default deterministic while making likely mask mistakes
visible:

<!-- wyst-contract: historical-v0.8 -->
```wyst
MASK ::= 1 << 63 // warning[W0202], MASK :: i64 = -9223372036854775808
ALL ::= 0xFFFF_FFFF_FFFF_FFFF // warning[W0202], ALL :: i64 = -1
MASK_U :: u64 = 1 << 63 // OK: explicit unsigned mask, no warning
ALL_U :: u64 = 0xFFFF_FFFF_FFFF_FFFF
```

Contextless integer constants outside the signed `i64` range that are not in
that high-bit `u64` mask range remain compile errors. Write an explicit target
type or categorized conversion when the intended type is not the default.

Typed numeric literal suffixes (`0_u8`, `1.0_f32`, etc.) are not Wyst syntax.
Use an annotation or categorized `as.<category>` conversion when a specific
type is required.

The `:=` and `::=` forms infer from value expressions only. `::=` additionally
requires a constant expression. Bare built-in type names and user-declared
type names are type-context forms, not runtime values.

#### Untyped Floating Literals

Floating-point literals (`3.14`, `1.0e6`, `1e6`) follow the same model with type
`untyped_float`. Decimal exponent forms may appear with or without a decimal
point. Hexadecimal floating-point literals such as `0x1.fp3` are not accepted.
The default when no context demands one is `f64`. Literal binding is available
in constant declarations, but floating-point arithmetic is not part of the
current compile-time constant evaluator. Use a literal or an explicitly typed
value today; arithmetic in constant contexts is future work:

<!-- wyst-contract: historical-v0.8 -->
```wyst
GAIN ::= 0.5 + 0.25
```

---

### The `as.<category>` Operators

Explicit value conversions are written as `value as.<category> Type`. Plain
expression-level `value as Type` is rejected; `as` without a category remains
only the import-alias keyword in module import syntax. The category is part of
the source contract and names the conversion's risk profile:

| Syntax | Conversion category | Meaning |
| ------ | ------------------- | ------- |
| `as.widen` | widening | integer widening with the same signedness; zero-extend for unsigned, sign-extend for signed |
| `as.truncate` | truncation | integer narrowing or untyped-integer binding that discards high bits |
| `as.signedness` | signedness reinterpretation | same-width signed/unsigned integer reinterpretation |
| `as.numeric` | numeric conversion | other integer/bool numeric conversions, including bool/integer and representable untyped integer constants |
| `as.bits` | removed predecessor syntax | use `bitcast<T>(value)` for the exact-backing `bitstruct` boundary |
| `as.address` | integer/address conversion | data address, function pointer, and raw `u64` address-bit extraction or construction where permitted |
| `as.lens` | address-lens change | retargeting `@T` to `@U` while keeping the same volatility/MMIO qualifier set |
| `as.qualifier` | volatility/MMIO qualifier change | adding or stripping `@volatile` or `@mmio` intent on an address type |
| `as.float` | floating-point conversion | any conversion involving `f32`, `f64`, or an untyped floating literal |

Dangerous and lossy conversions are therefore greppable: truncation uses
`as.truncate`, raw address crossings use `as.address`, qualifier changes use
`as.qualifier`, bit reinterpretation uses `as.bits`, and floating conversion
uses `as.float`. Diagnostics and reports name these exact categories.

<!-- wyst-contract: historical-v0.8 -->
```wyst
small : u8  = 5
big   := small as.widen u64
```

The complete conversion table is below. A cell value names the required
category for `value as.<category> TargetType`; a value of `—` means the
conversion is not defined (compile error). The diagonal is identity and may be
written with the category the checker assigns to that type family, but identity
conversions are normally unnecessary.

#### Integer ↔ Integer

| Source ↓ \ Target →             | `u8`/`i8`         | `u16`/`i16`         | `u32`/`i32`     | `u64`/`i64`     |
| ------------------------------- | ----------------- | ------------------- | --------------- | --------------- |
| narrower unsigned               | truncate (mod 2ⁿ) | widen (zero-extend) | widen           | widen           |
| narrower signed                 | truncate          | widen (sign-extend) | widen           | widen           |
| wider unsigned                  | truncate          | truncate            | truncate        | identity        |
| wider signed                    | truncate          | truncate            | truncate        | identity        |
| same-width different signedness | bit-reinterpret   | bit-reinterpret     | bit-reinterpret | bit-reinterpret |

All integer conversions are bit-level and never trap. Truncation
discards high bits; zero-extension fills high bits with zero; sign-extension
fills high bits with the sign bit. Same-width signed↔unsigned is a
no-op reinterpretation.

#### Float ↔ Float

| Source ↓ \ Target → | `f32`                 | `f64`         |
| ------------------- | --------------------- | ------------- |
| `f32`               | identity              | widen (exact) |
| `f64`               | round-to-nearest-even | identity      |

Float widening (`f32 as.float f64`) is exact. Float narrowing (`f64 as.float f32`)
applies round-to-nearest-even (the IEEE 754 default rounding mode). No
trap.

#### Float ↔ Integer

`f as.float I` (float to integer) and `i as.float F` (integer to float) are
both legal. Float-to-integer truncates toward zero. Integer-to-float rounds to
nearest representable value (which may lose precision for `u64`/`i64` values
above 2⁵³).

Float-to-integer when the source is out-of-range, `NaN`, or `±Inf` is
`Target-defined`: the selected architecture's conversion instruction supplies
the result. On ARM64, `fcvtzs`/`fcvtzu` saturate. The compiler emits the
instruction directly and does not insert checks.

#### `bool` ↔ Integer

There is **no implicit conversion** between `bool` and integers. Use
`as.numeric` explicitly when needed:

<!-- wyst-contract: historical-v0.8 -->
```wyst
flag : bool = true
n := flag as.numeric u8     // 1
m := false as.numeric u8    // 0

raw : u32 = 1
b := raw as.numeric bool    // true if raw != 0, false if raw == 0
```

A non-zero integer `as.numeric bool` is `true`; zero `as.numeric bool` is
`false`. A `bool as.numeric` integer conversion produces 1 for `true` and 0
for `false`.

#### Address ↔ Integer

| Source ↓ \ Target → | `@T` / `@volatile T` / `@mmio T`                                           | `u64`           |
| ------------------- | -------------------------------------------------------------------------- | --------------- |
| `@T`                | identity, or retargeting with `as.lens @U`; qualifier changes use `as.qualifier @volatile U` or `as.qualifier @mmio U` | `as.address u64` |
| `@volatile T`       | identity, or retargeting with `as.lens @volatile U`; qualifier changes use `as.qualifier @U` / `as.qualifier @mmio U` | `as.address u64` |
| `@mmio T`           | identity, or retargeting with `as.lens @mmio U`; qualifier changes use `as.qualifier @U` / `as.qualifier @volatile U` | `as.address u64` |
| `u64`               | `as.address @T`, `as.address @volatile T`, or `as.address @mmio T` for any `T` (no check) | identity |

`@T` and `u64` have the same machine representation. `as.address` between them
is a zero-cost reinterpretation. Runtime values do not convert implicitly in
either direction.

Address constants get one ergonomic exception: an integer constant expression
may bind directly when the expected type is explicit `@T`, `@volatile T`, or
`@mmio T`.
The expected address type can come from an annotation or from a typed parameter
position. This is still a compile-time address binding, not a runtime coercion:

<!-- wyst-contract: historical-v0.8 -->
```wyst
UART0_BASE :: u64 = 0x0900_0000
UARTDR :: @mmio u32 = UART0_BASE + 0x00
UARTFR :: @mmio u32 = UART0_BASE + 0x18
```

`UART0_BASE` is a `u64`, so the `+ 0x18` expression above is ordinary numeric
byte arithmetic before the constant is bound to `@mmio u32`. Once a value
has type `@mmio u32`, plain `+` uses `u32` element offsets instead.

Runtime integer values still require `as.address` for integer-to-address conversion.
Even though `#addr_of(x)` returns a value usable as both `@T` and `u64`, only
one type is selected at the site (from context or annotation), and the other
requires an explicit conversion.

Changing among `@T`, `@volatile T`, and `@mmio T` changes the access-site
contract and MMIO intent; it does not prove that the two address values cannot
alias or that a page table maps the address as ARM Device memory. See
[chapter-09-memory-model.md](chapter-09-memory-model.md) for the corresponding
aliasing and reordering rules.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

UARTDR :: @mmio u32 = 0x0900_0000

identity_addr :: (addr : @u8) -> @u8 {
  return addr
}

literal_contexts :: () -> @u8 {
  local : @u8 = 0x4000
  return identity_addr(0x5000) + (local as.address u64 - local as.address u64)
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

from_runtime_value :: (raw : u64) -> @u8 {
  return raw
}
```

Conversion between `@T` and `@U` for different element types `T ≠ U` is
explicit-only. To re-type a region (e.g., view a `@u8` buffer as `@u32`),
write the retargeting cast at the point where the memory lens changes:

<!-- wyst-contract: historical-v0.8 -->
```wyst
bytes := 0x4000 as.address @u8
words := bytes as.lens @u32
```

Adding or stripping volatility or MMIO intent is also explicit-only:

<!-- wyst-contract: historical-v0.8 -->
```wyst
device : @mmio u32 = 0x0900_0018
plain := device as.qualifier @u32
volatile_only := device as.qualifier @volatile u32

ram : @u32 = 0x8000_0000
volatile_view := ram as.qualifier @volatile u32
mmio_intent_view := ram as.qualifier @mmio u32
```

Implicit assignment, call-argument binding, comparison, and typed memory access
never retarget an address or change its volatile/MMIO-intent qualifier. This
makes the type punning and access-intent boundary visible at the source level
without requiring a noisy integer round-trip. A cast alone does not perform a
load or store and does not introduce `volatile_access` or `mmio` effects; those
effects arise only when a memory access occurs through the qualified address.

#### Identities

`x as.<category> T` where `T` is already the type of `x` is allowed when the
category matches the type family and is a no-op. It is occasionally useful for
documenting intent at a call site.

#### What Conversion Does Not Do

- Categorized conversion never traps and never branches at runtime.
  Out-of-range float-to-integer conversion is `Target-defined` as described
  above.
- Conversion never invokes a user-defined conversion. Wyst has no operator
  overloading and no conversion operator.
- Conversion does not work between unrelated structured types (`struct A` to
  `struct B` is a compile error even if their layouts match — go via
  memory: `u64@[addr_a as.address u64]` etc.).

---

### Implicit Conversion Rules (There Are None)

Wyst has **no implicit numeric conversions**. The following are all
compile errors:

<!-- wyst-contract: historical-v0.8 -->
```wyst
a : u8  = 5
b : u64 = 10
sum := a + b               // compile error: u8 + u64

x : i32 = -1
y : u32 = 1
cmp := x < y               // compile error: i32 < u32

flag : bool = true
n    : u8   = 0
sum := flag + n            // compile error: bool + u8

addr : @u8 = 0x4000
n    : u64 = addr          // compile error: @u8 cannot be assigned to u64
```

To make these compile, write the conversion explicitly:

<!-- wyst-contract: historical-v0.8 -->
```wyst
sum := (a as.widen u64) + b              // OK
cmp := x < (y as.signedness i32)         // OK (but see Mixed-Signedness Comparison below)
sum := (flag as.numeric u8) + n          // OK
n   := addr as.address u64               // OK
```

The compiler points to the operator (or assignment) that lacks a common
type, names both types involved, and suggests the canonical categorized form.

---

### Mixed-Signedness Comparison

`i32 < u32` is the most-asked-about C question for a reason: there is no
correct silent answer. Wyst rejects it. The two paths are:

- **Cast the unsigned side to signed (widen first if needed):** safe when
  the unsigned value is known to fit in the signed range.
- **Cast the signed side to unsigned:** safe when the signed value is known
  to be non-negative.

<!-- wyst-contract: historical-v0.8 -->
```wyst
x : i32 = -1
y : u32 = 1

x < y                     // compile error

x < (y as.signedness i32)            // OK: converted y == 1; expression == true
(x as.signedness u32) < y            // OK: converted x == 0xFFFF_FFFF; expression == false
```

The compiler will not pick one for you. The two answers differ; making the
choice explicit is the point.

The same rule applies to `==`, `!=`, `<=`, `>=`, `>`. Arithmetic operators
(`+`, `-`, `*`, `/`, `%`, `<<`, `>>`, bitwise) also require matching
signedness and width.

---

### `bool` is a Distinct Type

`bool` is a scalar primitive type with exactly two values, `true` and
`false`. It is **not** an integer.

`bool` has size 1 and alignment 1 in memory. Stores write byte `0` for `false`
and byte `1` for `true`. Loading a `bool` byte canonicalizes the value: zero
becomes `false`, any nonzero byte becomes `true`. In AArch64 general-purpose
registers, `bool` occupies the normal 64-bit `xN` argument/result slot and is
represented as canonical `0` or `1`. Codegen may produce that value with a
`wN` write because AArch64 zero-extends `wN` writes into the corresponding
`xN`.

- The condition of `if`, `while`, and the predicates of `&&`/`||` must be
  of type `bool`. `if u32_val { ... }` is a compile error; write
  `if u32_val != 0 { ... }`.
- The result of `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`, `!` is `bool`.
- Bitwise operators (`&`, `|`, `^`, `&^`, `<<`, `>>`, `~`) are not defined
  on `bool`. Use logical operators for boolean combination.
- `!x` requires `x : bool`. To "logically negate" an integer, write
  `x == 0`.

The unary `!` operator in `chapter-07-operators.md` is defined only on `bool`. The
mention of `!x` lowering to `cmp/cset` in the ARM64 lowering table refers
to the lowering of `(integer_expr != 0)`, which evaluates to `bool` and
may then be combined with `!`. The compiler does not silently coerce
integers to `bool` for `!`.

---

### Raw Bit Patterns

Wyst has no separate `b8`/`b16`/`b32`/`b64` bit-vector scalar family. Raw bit
patterns use unsigned integers (`u8`, `u16`, `u32`, `u64`). Named hardware or
wire-layout fields use `bitstruct` over an unsigned integer backing type.

Unsigned integers support both arithmetic and bitwise operators. The type
system does not try to prove whether a particular `u32` is a count, an
address-sized value, a mask, or a register image. Use names, constants, and
`bitstruct` declarations to make that intent explicit at the source level.

<!-- wyst-contract: historical-v0.8 -->
```wyst
UARTFR_TXFF :: u32 = 1 << 5
UARTFR_RXFE :: u32 = 1 << 4

status := u32@[UARTFR]
tx_full := (status & UARTFR_TXFF) != 0
rx_empty := (status & UARTFR_RXFE) != 0
```

For structured register values, prefer `bitstruct`:

<!-- wyst-contract: sketch -->
```wyst
bitstruct UartFrBits: u32 {
    TXFF: bool at 5
    RXFE: bool at 4
}

const flags: UartFrBits = bitcast<UartFrBits>(UARTFR.load())
const tx_full: bool = flags.TXFF
```

---

### Endian-Aware Loads and Stores

Wyst has no endian-suffixed scalar primitive family. Byte order is explicit at
the memory access boundary through typed runtime primitives:

<!-- wyst-contract: historical-v0.8 -->
```wyst
magic := %load_be<u32>(packet)            // big-endian bytes -> host-order u32
count := %load_le<u16>(packet + 4)        // little-endian bytes -> host-order u16

%store_be<u32>(packet + 8, magic)
%store_le<u16>(packet + 12, count)
```

Rules:

- `%load_be<T>(addr)` and `%load_le<T>(addr)` load bytes from `addr` and
  return an ordinary host-order integer `T`.
- `%store_be<T>(addr, value)` and `%store_le<T>(addr, value)` store an
  ordinary host-order integer `value` using the requested byte order.
- `T` must be a 16-, 32-, or 64-bit signed or unsigned integer scalar.
  `u8` and `i8` are rejected because byte order has no meaning for a single
  byte.
- The grammar still accepts `u8` and `i8` as primitive integer type arguments
  in endian primitive syntax. Semantic analysis rejects those 8-bit type
  arguments and reports the diagnostic on the type argument.
- `addr` may be a raw address integer (`u64`) or an address type such as
  `@u8`, `@u32`, `@volatile u8`, or `@mmio u8`. Endian primitives treat the operand as a
  byte address; the primitive width comes from `T`, not from the address lens.
- The result is not an endian wrapper. Arithmetic, comparison, and bitwise
  operations use the ordinary rules for `T` immediately.
- On little-endian ARM64, big-endian primitives lower to load/store plus
  `rev` as needed. Little-endian primitives usually lower to plain
  native-endian load/store.

<!-- wyst-contract: historical-v0.8 -->
```wyst
buf : [4]u8 = { 0x12, 0x34, 0x56, 0x78 }

first := %load_be<u16>(#addr_of(buf))       // first == 0x1234
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

read_byte :: (packet : @u8) -> u8 {
  return %load_be<u8>(packet)
}
```

---

### Address Types — `@T`, `@volatile T`, and `@mmio T`

`@T` is the type of an address whose target is interpreted as `T`. The
specification of `@volatile T` and `@mmio T` is in
[chapter-09-memory-model.md §1.3 and §1.3.1](chapter-09-memory-model.md).
Type-system rules:

- `@T` and `u64` have the same machine representation. Runtime conversion is
  by `as.address` in either direction; no implicit conversion exists for
  runtime values. An integer constant expression may bind to an explicit
  address context without a conversion.
- `@T`, `@volatile T`, `@mmio T`, `@U`, `@volatile U`, and `@mmio U` are
  distinct address lenses. Changing only the lens is explicit with
  `as.lens`. Changing volatility or MMIO intent is explicit with
  `as.qualifier`.
  Assignments, function calls, comparisons, and `type[address]` memory access
  do not retarget addresses or change qualifiers implicitly. A cast to
  `@volatile T` or `@mmio T` records an address-intent assertion, but it is not
  a load or store and introduces no access effect until the resulting address is
  read or written. Casts that strip volatility or MMIO intent are explicit and
  produce warnings so the boundary is greppable in reviews.
- `#addr_of(symbol)` returns a symbol-sourced address. For non-function
  symbols, the type is selected by explicit context (annotation,
  operand-position expectation, or categorized conversion); inferred bindings such as
  `p := #addr_of(word)` are rejected. The operand must resolve to a
  compile-time symbol such as a global, function, label, exception vector, or
  fixed-array/global storage symbol. A module constant has no address unless
  `#[section(".name")]` materializes it; type declarations and unsectioned
  constants are not linkable `#addr_of` operands. Function symbols have one natural
  function-pointer type, so `cb := #addr_of(handler)` may infer that type.
- For fixed-array storage, `#addr_of(array)` may bind to the element lens
  (`@T` for `[N]T`), the whole-array lens (`@[N]T`), or `u64` when an explicit
  context asks for that type. A bare inferred binding such as
  `p := #addr_of(array)` is rejected because it would otherwise have to choose
  a default lens.
- `%addr_of(local)` materializes the runtime address of stack-local storage.
  It is not a compile-time form, never introduces a relocation, and is illegal
  in `#naked` code because it requires a compiler-owned stack frame. The result
  is valid only for the containing function's active stack frame; returning it,
  storing it into longer-lived storage, or passing it through an ordinary
  function call is rejected. It may be passed to a direct function call only
  when the matching address parameter is marked `#noescape`.
- `%addr_of(local)` follows the same explicit-lens rule as non-function
  `#addr_of(symbol)`: it does not choose a default address lens in an inferred
  binding. Scalar stack storage may bind to `@T` in an explicit address context.
  Fixed-array stack storage may bind to the element lens `@T` or the whole-array
  lens `@[N]T` in an explicit address context. Inferred bindings such as
  `p := %addr_of(word)` or `p := %addr_of(local_array)` are rejected; write an
  annotation or cast. Converting the runtime address to `u64` also requires an
  explicit `as.address u64`.
- `@T` arithmetic (`p + offset`, `offset + p`, `p - offset`) has exactly one
  source meaning: **element offsets**. This is the `element_offset(p,
  element_count)` operation. The integer offset is multiplied by `#size_of(T)`
  before the address is advanced. `@u8` remains byte-stepped because
  `#size_of(u8) == 1`.
- Raw byte arithmetic is a distinct `byte_offset(p, byte_count)` operation.
  Spell it by changing the lens before the addition, `(p as.lens @u8) + bytes`, or
  by doing explicit numeric arithmetic, `((p as.address u64) + bytes) as.address @T`. The cast
  back to `@T` is the point where the program asserts that the byte result is
  suitable for that typed access lens.
- Struct-field addressing is a distinct `field_addr(p, T.field)` operation.
  Spell it with a byte lens and `#field_offset`: `((p as.lens @u8) +
  #field_offset(T, field)) as.lens @FieldType`. `#field_offset` is always measured
  in bytes and is never an element count.
- Do not pre-multiply the offset by `#size_of(T)` before applying `+`; that
  scales twice. Write `p + i` for element `i`. The checker rejects obvious
  double-scaled forms such as `p + i * #size_of(T)` when `p` already has an
  address lens whose element type is `T`.
- The qualifiers of address arithmetic come from the static address operand
  that produces the result. `@volatile T + integer` produces `@volatile T`,
  `@mmio T + integer` produces `@mmio T`, and `@T + integer` produces `@T`.
- If an integer offset expression was produced from an address with `as.address u64`,
  its source address qualifiers must match the address operand's qualifiers.
  Mixed volatility or MMIO intent in address arithmetic is a compile error.
  Cast one address to the intended qualifier before converting it to `u64`:
  `(plain as.qualifier @volatile T) as.address u64`,
  `(plain as.qualifier @mmio T) as.address u64`, or
  `(device as.qualifier @T) as.address u64`.
- Array-address lenses are the one contextual access rule: for `p : @[N]T`,
  `T@[p]` accesses the first element and `p + offset` produces `@T`, scaling
  the offset by `#size_of(T)`. The explicit `@[N]T` lens preserves the storage
  shape; arithmetic and element memory access step into the element lens.
- The offset may be any integer scalar type. Signed offsets use their signed
  value; unsigned offsets use their unsigned value. Scaling happens before the
  byte address calculation; the source offset type itself does not change in
  the type system.
- Runtime address arithmetic wraps modulo `2^64` after scaling. Conceptually,
  the compiler sign-extends signed offsets or zero-extends unsigned offsets to
  the 64-bit address width, computes `byte_delta = offset * #size_of(T)` with
  two's-complement wrapping, then adds or subtracts that byte delta from the
  base address bits with two's-complement wrapping. Constant symbol addends are
  kept as signed byte addends until relocation emission; the final materialized
  address is still a 64-bit address value.
- Address arithmetic does not prove or repair alignment. A value of type `@T`
  states the access lens the program intends to use. Loads, stores, atomics,
  vector operations, MMIO, and packed-field checks use the alignment required by
  that access operation. If the numeric address is misaligned, behavior is the
  target architecture's behavior for that access; volatile or MMIO-intent
  packed aggregate accesses that cannot satisfy the required natural alignment
  are rejected before lowering.
- Arithmetic on two `@T` values is not defined. `p + q` and `p - q` are
  compile errors. Use `(p as.address u64) - (q as.address u64)` when numeric byte distance is
  intentional.
- `@T + integer` is `@T`; `integer + @T` is `@T`; `@T - integer` is `@T`.
- Arithmetic on address-derived integers with different address qualifiers is
  not defined. `(device as.address u64) - (plain as.address u64)` is a compile
  error when `device : @mmio T` and `plain : @T`; write
  `((device as.qualifier @T) as.address u64) - (plain as.address u64)` or
  `(device as.address u64) - ((plain as.qualifier @mmio T) as.address u64)` to make
  the intended result qualifier explicit.
- Function pointer types such as `@(u64) -> u64` are code addresses, not data
  address lenses. They support calls, same-type `==`/`!=`, equality/inequality
  with the untyped integer constant `0`, explicit `as.address u64` extraction, and
  explicit `#trusted_cast<@(args) -> ret>(addr)` construction from a raw `u64`
  address. They do not support address arithmetic, ordered comparisons, nonzero
  integer comparisons, raw integer-to-function-pointer `as.address` conversions, or
  `type[address]` memory access.
- `@T` comparisons are defined for the same address lens. `==` and `!=` test
  address equality. `<`, `<=`, `>`, and `>=` use unsigned numeric address
  ordering, which keeps address-walking loops typed as pointers instead of
  raw integers. Untyped integer constants may bind to the address lens for
  equality checks, which keeps `addr == 0` available as the conventional
  sentinel test. Ordered comparisons against integer literals remain compile
  errors; convert both sides to `u64` with `as.address` when comparing against raw integer values.
  Comparing addresses of different element types (`@u8 == @u32`) is also a
  compile error; retarget explicitly or compare `as.address u64` values.
- There is no `null`. `@T = 0` is a legal value. `if addr == 0 { ... }`
  is the canonical check for "address is the conventional unmapped
  sentinel." _Accessing_ address 0 is `Architectural fault or trap`: it may
  data-abort when address 0 is unmapped, or complete only if the active target
  mapping deliberately makes that address accessible.

#### Address Arithmetic

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

advance :: (base : @u8, offset : u64) -> @u8 {
  return base + offset
}

advance_small :: (base : @u8, offset : u16) -> @u8 {
  return base + offset
}

advance_signed_prefix :: (offset : i8, base : @u8) -> @u8 {
  return offset + base
}

retreat :: (cursor : @u8, offset : i32) -> @u8 {
  return cursor - offset
}

distance :: (base : @u8, cursor : @u8) -> u64 {
  return cursor as.address u64 - base as.address u64
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

bad_distance :: (base : @u8, cursor : @u8) -> u64 {
  return cursor - base
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

bad_offset :: (base : @u8, flag : bool) -> @u8 {
  return base + flag
}
```

#### Address Equality and Ordering

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

same_addr :: (a : @u8, b : @u8) -> bool {
  return a == b
}

is_zero :: (addr : @u8) -> bool {
  return addr == 0
}

before :: (a : @u8, b : @u8) -> bool {
  return a < b
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

bad_lens :: (a : @u8, b : @u32) -> bool {
  return a < b
}
```

#### Symbol Address Contexts

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

word : u64 = 0
bytes : [4]u8 = 0
words : [4]u64 = 0
word_addr : @u64 = #addr_of(word)
word_raw : u64 = #addr_of(word)
raw_addr : u64 = #addr_of(bytes)
byte_addr : @u8 = #addr_of(bytes)
whole_bytes : @[4]u8 = #addr_of(bytes)
whole_words : @[4]u64 = #addr_of(words)

main :: () -> u64 {
  inferred_from_cast := #addr_of(word) as.address @u64
  first := u8@[whole_bytes]
  third := u8@[whole_bytes + 2]
  word := u64@[whole_words + 2]
  return word_addr as.address u64 + word_raw + raw_addr + byte_addr as.address u64 + inferred_from_cast as.address u64 + first as.widen u64 + third as.widen u64 + word
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

buf : [4]u8 = 0

bad :: () -> u64 {
  ptr := #addr_of(buf)
  return ptr
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

word : u64 = 0

bad :: () -> u64 {
  ptr := #addr_of(word)
  return ptr
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

main :: () -> u64 {
  buf : [4]u8 = 0
  bytes : @u8 = %addr_of(buf)
  whole : @[4]u8 = %addr_of(buf)
  casted := %addr_of(buf) as.lens @u8
  return u8@[bytes] as.widen u64 + u8@[whole + 2] as.widen u64 + u8@[casted] as.widen u64
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

bad :: () -> u64 {
  word : u64 = 0
  ptr := %addr_of(word)
  return u64@[ptr]
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

bad :: () -> u8 {
  buf : [4]u8 = 0
  ptr := %addr_of(buf)
  return u8@[ptr]
}
```

#### Explicit Address Retargeting

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

buf : [8]u8 = 0

read_word :: () -> u32 {
  bytes : @u8 = #addr_of(buf)
  return u32@[bytes as.lens @u32]
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

buf : [8]u8 = 0

read_word :: () -> u32 {
  bytes : @u8 = #addr_of(buf)
  return u32@[bytes]
}
```

#### Explicit Address-Qualifier Changes

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

UARTFR :: @mmio u32 = 0x0900_0018
RAM_WORD :: @u32 = 0x8000_0000

peek :: (addr : @u32) -> u32 {
  return u32@[addr]
}

poll :: (addr : @volatile u32) -> u32 {
  return u32@[addr]
}

read_reg :: (addr : @mmio u32) -> u32 {
  return u32@[addr]
}

explicit_boundary :: () -> u32 {
  volatile_view := RAM_WORD as.qualifier @volatile u32
  device_view := RAM_WORD as.qualifier @mmio u32
  return poll(volatile_view) + read_reg(device_view)
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

UARTFR :: @mmio u32 = 0x0900_0018

peek :: (addr : @u32) -> u32 {
  return u32@[addr]
}

bad_strip :: () -> u32 {
  return peek(UARTFR)
}
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

RAM_WORD :: @u32 = 0x8000_0000

poll :: (addr : @volatile u32) -> u32 {
  return u32@[addr]
}

bad_add :: () -> u32 {
  return poll(RAM_WORD)
}
```

#### `@T = 0` Example

<!-- wyst-contract: historical-v0.8 -->
```wyst
addr : @u8 = 0                  // OK: 0 is a valid address value
if addr == 0 {
    return                       // OK: address comparison
}
val := u8@[addr]                  // OK in the type system; hardware aborts
```

Programs that need a sentinel for "no valid address" use `0` by
convention. The compiler does not synthesize one and does not branch on
"this address is null" without an explicit comparison.

#### Symbol-Sourced vs Computed Addresses

Wyst distinguishes two kinds of `@T` value by **how the address is sourced**.
The distinction is invisible at runtime but load-bearing for the integrated
linker: among source address expressions, only the symbol-sourced kind emits an
address-materialization relocation. Direct calls, direct symbol branches,
object references, veneers, future jump tables, and address-bearing
instructions are separate relocation origins owned by
[chapter-16-object-format.md](chapter-16-object-format.md).

| Form                                                                    | Source kind                          | Relocatable?  | What the linker does                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------- |
| `#addr_of(name)`                                                        | Symbol-sourced                       | **Yes**       | Emits an `adrp`+`add` page-pair relocation against `name`                                            |
| `(#addr_of(name) as.address @T) + N` (constant element count `N`)                | Symbol-sourced with addend           | **Yes**       | One relocation against `name` with byte addend `N * #size_of(T)` folded in                           |
| `((#addr_of(name) as.address @u8) + B) as.lens @T` (constant byte count `B`)     | Symbol-sourced with byte addend      | **Yes**       | One relocation against `name` with byte addend `B` folded in                                         |
| `((#addr_of(name) as.address u64) + B) as.address @T` (constant byte count `B`)  | Integer constant address             | No            | Numeric byte arithmetic first; no relocation is retained after the explicit integer computation      |
| `(#addr_of(name) as.address @T) + i` (runtime element count `i`)                 | Symbol-sourced base + runtime offset | **Base only** | Page-pair relocation for `name`; the runtime offset is scaled by `#size_of(T)` before the address add |
| `%addr_of(local)`                                                       | Stack-frame address                  | No            | Emits ordinary stack-relative address materialization; no symbol reference exists                    |
| `0x0900_0000` in explicit `@T` context, or annotated `BASE + N`         | Integer constant address             | No            | Compile-time-known absolute value; no relocation needed                                              |
| `base + i`, `ptr as.lens @u32`, `%mrs(...)`, any other runtime-computed `@T` | Runtime-computed                     | No            | No relocation; the address is whatever the typed address computation evaluates to at runtime          |

**Rule:** `#addr_of(name)` is the only source address expression form that
introduces a symbol-sourced address value. `%addr_of(local)` produces a real
address value, but it is a stack-frame computation, not a linkable symbol.
Every other `@T` value is either a literal address or arithmetic that the
compiler treats as ordinary integer math against a runtime value.

**Consequence:** Wyst does not have the C / C++ ambiguity about whether a
pointer constant is a "symbol address" or a "magic integer that happens to
equal an address." The syntax tells you. A reader, the compiler, and the
linker all agree on whether a given expression introduces a relocation.

**Constant-offset folding.** `(#addr_of(uart_regs) as.address @uart_regs) + 1` (where
the `1` is a compile-time element count) emits exactly one page-pair relocation
with `#size_of(uart_regs)` as the ELF addend field. Relocation addends are
always measured in bytes, even when the source expression used an element
count. For raw byte offsets, use a byte lens such as
`((#addr_of(uart_regs) as.address @u8) + 0x18) as.lens @u32` or explicit numeric arithmetic
such as `((#addr_of(uart_regs) as.address u64) + 0x18) as.address @u32`.

**Runtime-offset arithmetic.** `(#addr_of(buf) as.address @T) + i` (where `i` is a
runtime value) emits one page-pair relocation for `buf`'s base address into a
register, then runtime arithmetic to scale `i` by `#size_of(T)` and combine it
with the base address. The relocation is attached only to the symbol-base
materialization, not to the addition.

**Binding a `#addr_of` result.** Once a value of type `@T` is bound to a
runtime local such as `p : @u64 = #addr_of(buf)`, the local is just an address
value. Later arithmetic such as `p + 1` advances by `#size_of(u64)`, but it
does not fold into a relocation addend. Each visible `#addr_of(name)`
expression is its own relocation site; storing the result does not propagate
that property.

The full link-side discipline — which ELF relocation types, how the
integrated linker resolves them, what the section layout looks like — is in
[chapter-16-object-format.md §6](chapter-16-object-format.md).

---

### Worked Cases

The following cases exercise the conversion-and-promotion rules. Each
either compiles or errors with a documented reason.

<!-- wyst-contract: historical-v0.8 -->
```wyst
counter : u8 = 256                // ERROR: 256 not representable in u8 (max 255)

i32_val : i32 = -1
u32_val : u32 = 1
flag := i32_val < u32_val         // ERROR: i32 < u32; cast one side explicitly

cond : u32 = 7
if cond { ... }                   // ERROR: if requires bool; write `if cond != 0 { ... }`

addr : @u8 = 0                    // OK: 0 is a legal address; no null sentinel

addr_u64 : u64 = addr             // ERROR: no implicit @u8 -> u64
addr_u64 = addr as.address u64    // OK

packet : @u8 = 0x4000
wire_len := %load_be<u16>(packet)           // OK: host-order u16 result
total := (wire_len as.widen u32) + u32_val  // OK
byte_orderless : u8 = %load_be<u8>(packet)  // ERROR: endian load of 8-bit value
```

---

### Design Rationale

| Choice                               | Reason                                                                       |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| No implicit numeric conversion       | Mixed-width / mixed-signedness bugs are silent in C; Wyst makes them loud     |
| `as` for every cross-type conversion | One mechanism; no second-guessing what the compiler will do                  |
| Untyped integer literals             | Range-checked at the bind site; high-bit `i64` defaults warn before wrapping |
| `bool` is not an integer             | The `if u32 { ... }` C pattern is a class of bug; the type system rejects it |
| Raw bit patterns use `uN`            | Avoids a parallel scalar family; `bitstruct` carries named layout intent   |
| Endian-aware memory primitives       | Byte order is visible exactly where bytes cross between memory and values    |
| `@T ≠ u64` at runtime                | Addresses keep element-stepped arithmetic and equality distinct from numeric ordering |
| No `null`                            | Avoids a magic value the language must specify everywhere; `0` works         |

---

### Tradeoffs

- **More categorized conversions in real code.** Mixed-type expressions cost a few extra
  keystrokes. The alternative — silent coercion — is the bug class the
  type system is designed to prevent.
- **No promotion to a common arithmetic type.** `u8 + u8` produces `u8`,
  not `u32`. Programs that need wider arithmetic widen the operands
  explicitly. This matches what the hardware does and what the user
  intended.
- **`bool` is genuinely separate.** `arr[flag]` cannot work; write
  `arr[flag as.numeric u64]`. This is verbose for rare patterns and prevents the
  common `arr[expr]` C-idiom bug where `expr` evaluates to `bool`.

---

## 1.5 Arrays and Indexing

### External Arrays

When an array base address comes from outside (parameter, global, loaded value):

<!-- wyst-contract: historical-v0.8 -->
```wyst
base = @u64@[buffer]

x = u64@[base + 0]

y = u64@[base + 1]

u64@[base + 2] = x + y
```

Lowering:

```asm
ldr x0, [xbuf]
ldr x1, [xbuf, #8]
str x2, [xbuf, #16]
```

---

## 1.5.1 Array Definitions, Literals, and Indexing

### Array Literals

Array literals use **braces** `{}` to avoid collision with the `type[address]` memory access syntax:

<!-- wyst-contract: historical-v0.8 -->
```wyst
{5, 10, 15}           // array literal, element type inferred from context
{5 as.numeric u8, 10, 15} // explicit: array of u8
```

Braces are already used for blocks and struct bodies, but a comma-separated list of homogeneous values in expression position is unambiguously an array literal.

### Declaring a Local Array

Stack-allocated fixed-size arrays use the `[N]T` type notation — count before element type:

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [3]u8 = {5, 10, 15}
```

The canonical source spelling is `[N]T` with no space; the formatter emits
that form for fixed arrays and slices (`[]T`). Dynamic arrays format as the
explicitly imported generic application `DynamicArray<T>`.

| Part          | Meaning                                         |
| ------------- | ----------------------------------------------- |
| `arr`         | variable name for the array's storage           |
| `[3]u8`       | type: array of 3 u8 elements (3 bytes on stack) |
| `{5, 10, 15}` | initializer literal                             |

`[N]T` is unambiguous in all parse positions. A non-empty bracketed prefix
such as `[number]` never begins a Wyst expression; expressions normally start
with names, literals, or unary operators. The one bracket-prefixed expression
form is the explicit raw slice constructor `[]T{data = ..., len = ...}`.
The parser resolves `[number]type` as an array type regardless of surrounding
context; no context-sensitivity is required.

This also makes array types visually distinct from SIMD vector types:

| Notation   | Meaning                                  |
| ---------- | ---------------------------------------- |
| `[3]u8`    | stack array: 3 u8 elements, 3 bytes      |
| `[u8:16]`  | SIMD vector: 16 u8 lanes in one register |
| `u8@[addr]` | load: read u8 from address `addr`        |

`N` must be a **compile-time constant**. No variable-length arrays.

A string literal may initialize a fixed byte array whose element type is
`u8`. The literal is decoded first, then copied into the first bytes of the
array; if the decoded byte length is less than `N`, the remaining bytes are
zero-filled. A decoded literal longer than `N` is a compile error that reports
the array capacity, decoded byte length, and literal. This rule applies only to
string-literal initializers for `[N]u8`; brace array literals, non-`u8` arrays,
and the `string` type keep their existing behavior.

<!-- wyst-contract: historical-v0.8 -->
```wyst
module_name :: [16]u8 = "uart_driver_v1" // two trailing zero bytes emitted
magic :: [4]u8 = "WYST" // exact fit
```

### Array Elements and Memory Loads

Loading a single element from a fixed array uses postfix index syntax:

<!-- wyst-contract: sketch -->
```wyst
val = arr[i]
```

The index is an element index, not a byte offset. This is separate from the
`type[address]` memory-load syntax. A fixed-array name is an array storage
value; it is not itself an address expression and does not implicitly decay to
`@T` in assignments, calls, memory-load address positions, or arithmetic.

If the index is known at compile time, it must be in bounds for the fixed
array. Runtime indices remain unchecked and lower to direct address
calculation:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: () -> u8 {
  arr : [4]u8 = {1, 2, 3, 4}
  return arr[4]
}
```

To use the address-level memory-load form, materialize the base address
explicitly. For symbol-backed storage, use `#addr_of`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [4]u64 = {10, 20, 30, 40}

base : @u64 = #addr_of(arr)
val = u64@[base + i]
```

For stack-local storage inside the current function, use `%addr_of`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: () -> u64 {
  word : u64 = 10
  base : @u64 = %addr_of(word)
  return u64@[base]
}
```

The non-decay rule is enforced even when the destination type is visibly an
address:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

buf : [4]u8 = 0

_start :: () {
  ptr : @u8 = buf
}
```

So the two forms are intentionally different:

| Form              | Meaning                                 | Offset unit       |
| ----------------- | --------------------------------------- | ----------------- |
| `arr[i]`          | fixed-array element access              | elements          |
| `s[i]`            | slice element access                    | elements          |
| `u64@[base + off]` | memory load through an explicit address | elements of base  |
| `#addr_of(arr)`   | produce an address for symbol storage   | no load by itself |
| `%addr_of(arr)`   | produce an address for stack storage    | no load by itself |

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

buf : [4]u64 = 0

_start :: () -> u64 {
  first := buf[0]
  base := #addr_of(buf) as.address @u64
  same := u64@[base + 0]
  return first + same
}
```

Loading the **entire vector** at once (e.g. into a SIMD register) uses
the vector type as the load prefix, reusing the `[T:N]` SIMD vector type
from [chapter-09-memory-model.md §1.3.1](chapter-09-memory-model.md) / [chapter-12-simd.md](chapter-12-simd.md):

<!-- wyst-contract: historical-v0.8 -->
```wyst
v = [u8:16]@[ptr]      // load 16 u8s at once into a SIMD register (ldr q0, [xN])
w = [f32:4]@[ptr]      // load 4 f32 lanes  (ldr q0, [xN])
```

The pattern mirrors scalar loads: just as `u32@[addr]` produces a `u32`,
`[T:N]@[addr]` produces a `[T:N]` vector value. The result type is exactly
the syntactic prefix.

The four forms are fully unambiguous by syntax alone:

| Form          | Position        | Meaning                                         |
| ------------- | --------------- | ----------------------------------------------- |
| `T@[addr]`     | expression      | scalar load — read one `T` from `addr`          |
| `[T:N]@[addr]` | expression      | vector load — read `N` lanes of `T` from `addr` |
| `[N]T`        | type annotation | array type — `N` `T`s laid out in memory        |
| `[T:N]`       | type annotation | vector type — `N` lanes of `T` in one register  |

Angle brackets (`<...>`) are used by Wyst's locked generic syntax (see §1.13
below) and by comparison operators in expressions. No non-generic type form
uses angle brackets.

### Accessing by Index

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [3]u8 = {5, 10, 15}

first  = arr[0]    // first element: 5
second = arr[1]    // second element: 10
third  = arr[2]    // third element: 15
```

This is array indexing, not pointer arithmetic. The compiler uses the array's
element type to compute the byte address of the selected element.

### Element Stride

When using `@T` address arithmetic, offsets are **element offsets**. The
compiler scales the offset by `#size_of(T)` before computing the byte address:

<!-- wyst-contract: historical-v0.8 -->
```wyst
bytes : [4]u8  = {1, 2, 3, 4}
words : [2]u64 = {100, 200}

a = bytes[1]          // element index 1
b = words[1]          // element index 1

word_base : @u64 = #addr_of(words)
c = u64@[word_base + 1]  // element offset 1; byte offset 8
```

The `@T` type records the memory-access lens and element size for source-level
arithmetic:

| Element Type | Size | Index `i` offset   |
| ------------ | ---- | ------------------ |
| `@u8`        | 1    | `i` bytes          |
| `@u16`       | 2    | `i * 2` bytes      |
| `@u32`       | 4    | `i * 4` bytes      |
| `@u64`       | 8    | `i * 8` bytes      |

When raw byte arithmetic is intended, use a byte lens or numeric arithmetic:
`(word_base as.lens @u8) + 8` or `((word_base as.address u64) + 8) as.address @u64`.

### Global Arrays

A top-level fixed array is still a `[N]T` storage symbol. Its name does not
evaluate to an address, even if the linker eventually places the storage in
read-only memory. Address-level access uses `#addr_of` just like other
symbol-backed storage:

<!-- wyst-contract: historical-v0.8 -->
```wyst
TABLE : [5]u32 = 0

read_table :: () -> u32 {
  base : @u32 = #addr_of(TABLE)
  return u32@[base + 3]
}
```

Any const-array literal syntax that places initialized data directly in
`.rodata` must preserve this rule: the array name denotes storage, not a
silently decayed pointer. Use `#addr_of(TABLE)` for address-only access and
`TABLE[:]` when length should travel with the address.

A stack-local fixed array follows the same non-decay rule, but its address is
not a symbol relocation site. Its address-level form is
`%addr_of(local_array)` in an explicit address context.

### Lowering

#### Stack Array

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [3]u8 = {5, 10, 15}
x = arr[0]
```

```asm
strb wzr, [sp, #-4]    // allocate 3 bytes (rounded)
strb w5,  [sp, #0]     // arr[0] = 5
strb w10, [sp, #1]     // arr[1] = 10
strb w15, [sp, #2]     // arr[2] = 15
ldrb w0, [sp, #0]      // x = arr[0]
```

#### Global Array

<!-- wyst-contract: historical-v0.8 -->
```wyst
TABLE : [3]u32 = 0

read_table :: () -> u32 {
  base : @u32 = #addr_of(TABLE)
  return u32@[base + 1]
}
```

```asm
adrp  x0, TABLE
ldr   w0, [x0, #:lo12:TABLE + 4]   // TABLE[1] — integrated linker resolves TABLE address
```

The `adrp` + offset pattern is emitted by the compiler when accessing a
const array by address. Relocation annotations are handled internally; they
do not appear in Wyst source.

### Element-Wise Operators

For `[T:N]` types that fit within a single ARM64 SIMD register (`N * sizeof(T) <= 16`),
the standard arithmetic and bitwise operators work element-wise. Operators map
to fixed ARM64 SIMD instruction sequences — no hidden loops, no unrolling
decisions.

<!-- wyst-contract: historical-v0.8 -->
```wyst
a : [f32:4] = {1.0, 2.0, 3.0, 4.0}
b : [f32:4] = {5.0, 6.0, 7.0, 8.0}

c := a + b    // [6.0, 8.0, 10.0, 12.0] — fadd v0.4s, v1.4s, v2.4s
d := a * b    // [5.0, 12.0, 21.0, 32.0] — fmul v0.4s, v1.4s, v2.4s
```

Integer element-wise:

<!-- wyst-contract: historical-v0.8 -->
```wyst
x : [u8:16] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16}
y : [u8:16] = {1, 1, 1, 1, 1, 1, 1, 1, 1,  1,  1,  1,  1,  1,  1,  1}

z := x + y    // add v0.16b, v1.16b, v2.16b
w := x & y    // and v0.16b, v1.16b, v2.16b
```

The full set of element-wise operators:

| Operator | Float vectors | Integer vectors | Notes                        |
| -------- | ------------- | --------------- | ---------------------------- |
| `+`      | yes           | yes             |                              |
| `-`      | yes           | yes             |                              |
| `*`      | yes           | yes             | integer lanes below 64 bits  |
| `/`      | yes           | no              | no ARM64 integer SIMD divide |
| `&`      | no            | yes             |                              |
| `\|`     | no            | yes             |                              |
| `^`      | no            | yes             |                              |
| `&^`     | no            | yes             | AND-NOT; lowers to `bic`     |
| `<<`     | no            | yes             |                              |
| `>>`     | no            | yes             | count negation plus shift    |

Compound assignment forms (`+=`, `-=`, `*=`, etc.) are defined for all
element-wise operators. `a += b` is exactly `a = a + b`, element-wise.

**Constraint: register width only.** Element-wise operators are only defined
for `[T:N]` where `N * sizeof(T) <= 16`. This guarantees explicit register
lowering. For larger arrays, there is no element-wise operator — write the loop
explicitly so the iteration cost is visible in the source.

Valid element-wise types:

| Type      | Bytes | ARM64 arrangement |
| --------- | ----- | ----------------- |
| `[u8:16]` | 16    | `.16b`            |
| `[u16:8]` | 16    | `.8h`             |
| `[u32:4]` | 16    | `.4s`             |
| `[u64:2]` | 16    | `.2d`             |
| `[f32:4]` | 16    | `.4s`             |
| `[f64:2]` | 16    | `.2d`             |
| `[u8:8]`  | 8     | `.8b`             |
| `[u16:4]` | 8     | `.4h`             |
| `[u32:2]` | 8     | `.2s`             |
| `[f32:2]` | 8     | `.2s`             |

Signed variants (`i8`, `i16`, `i32`, `i64`) are valid for `+`, `-`, and the
bitwise operators; `*` is valid for signed integer lanes below 64 bits. The
signed/unsigned distinction affects `>>` (arithmetic vs logical shift). Vector
comparison result-mask semantics are reserved until specified explicitly.

### #len()

`#len(arr)` returns the element count of a fixed array as a compile-time
constant `u64`. It is resolved entirely at compile time — no runtime cost,
no code emitted.

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [8]u64 = {0, 1, 2, 3, 4, 5, 6, 7}
n ::= #len(arr) // n == 8 — local compile-time constant
```

The operand must be a storage path — a name or field path whose type is `[N]T`.
Forms such as `#len(make_array())`, `#len(arr[:])`, and `#len({1, 2, 3})` are
rejected so `#len` never looks like it evaluates a runtime expression.

`#len()` is most useful in generic code or when the array size comes from a
named constant and you want to avoid repeating it:

<!-- wyst-contract: historical-v0.8 -->
```wyst
CAPACITY :: 64

buf : [CAPACITY]u8

i : u64 = 0
loop {
    if i >= #len(buf) { break }
    u8@[#addr_of(buf) + i] = 0
    i += 1
}
```

For slices, use the explicit runtime field `s.len`. `#len` is fixed-array-only.

### Arrays as Function Parameters

Arrays do not implicitly decay to `@T` when passed to functions. Passing a
fixed array across a call boundary must say whether the callee receives an
address only or a length-carrying slice.

For a symbol-backed address-only parameter, write `#addr_of(arr)`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [4]u64 = {10, 20, 30, 40}

sum :: (data : @u64, count : u64) -> u64 {
  total : u64 = 0

  for i in 0 ..< count {
    total += u64@[data + i]
  }

  return total
}

main :: () {
  result = sum(#addr_of(arr), 4) // explicit address-only call
}
```

For a length-carrying parameter, use a slice (`[]T`):

<!-- wyst-contract: historical-v0.8 -->
```wyst
sum_slice :: (s : []u64) -> u64 {
  total : u64 = 0
  i : u64 = 0

  loop {
    if i >= s.len {
      break
    }
    total += s[i]
    i += 1
  }

  return total
}

arr : [4]u64 = {10, 20, 30, 40}

main :: () {
  result = sum_slice(arr[:]) // explicit whole-array slice
}
```

A bare array argument such as `sum(arr, 4)` or `sum_slice(arr)` is rejected.
The diagnostic suggests `#addr_of(arr)` for `@T` parameters and `arr[:]` for
`[]T` parameters. By-value `[N]T` parameters are outside this surface; their
ABI parameter/return rules must be explicit before that surface can exist.

For stack-local scalar/object storage, an address-only parameter must opt into
the non-escaping contract:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

fill :: (out : @u64 #noescape) {
  u64@[out] = 42
}

main :: () -> u64 {
  value : u64 = 0
  fill(%addr_of(value))
  return value
}
```

### Design Rationale

| Choice                                | Reason                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `{}` for literals                     | `[]` is taken by `type[address]` load syntax                                                           |
| `[N]T` type notation                  | Non-empty bracketed prefixes stay type-only; the raw slice constructor uses distinct `[]T{...}` syntax |
| Count before type                     | Visually distinct from SIMD `[T:N]`; unambiguous at a glance                                           |
| Element-scaled address arithmetic     | `@T + i` steps by elements; cast to `@u8` or `u64` when byte arithmetic is intended                    |
| Explicit call conversion              | Symbol-backed address calls use `#addr_of(arr)`; length-carrying calls use `arr[:]`                    |
| Element-wise ops: register-width only | Single-instruction lowering guaranteed; no hidden loop decisions                                       |
| Constant fixed-array bounds           | Obvious out-of-bounds element indices are compile-time errors                                          |
| `#len()` compile-time                 | Zero cost; no code emitted for fixed arrays                                                            |
| No runtime length in `[N]T`           | Matches hardware reality; use `[]T` slice if length must travel with data                              |
| Top-level storage stays `[N]T`        | Address materialization stays explicit through `#addr_of` or `%addr_of`                                |

### Tradeoffs

- **No runtime bounds checking** — `arr[i]` where `i` is runtime-computed is unchecked, though constant out-of-bounds indices such as `arr[3]` on `[3]u8` are rejected. Slice element access follows the same obvious-error rule when both the index and the slice descriptor length are known at compile time. Address-level forms such as `u8@[#addr_of(arr) + 100]` are unchecked. Wyst exposes machine semantics, not safety abstractions.
- **No heap arrays** — `[N]T` is stack or rodata only. Dynamic allocation requires external runtime support.
- **No multidimensional arrays** — `[3][4]u8` is not defined. Use flat arrays with manual index computation or nested structs.
- **Element-wise ops limited to 16 bytes** — `[32]f32 + [32]f32` is not defined. The loop is explicit.

---

## 1.5.2 Slices

A **slice** is a fat pointer: a base address paired with a length. It is the
standard way to pass an array of runtime-determined size across a function
boundary without losing the length.

### Type

`[]T` is the slice type for element type `T`. It is structurally equivalent to:

<!-- wyst-contract: historical-v0.8 -->
```wyst
struct { data : @T, len : u64 }
```

but is a first-class type with dedicated construction and slicing syntax. The
two fields are always named `.data` and `.len`.

### Creating a Slice

**From a fixed array using slice syntax:**

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr : [8]u8 = {1, 2, 3, 4, 5, 6, 7, 8}

s := arr[2:5]    // []u8 — elements 2, 3, 4; s.data = address(arr) + 2, s.len = 3
```

`arr[lo:hi]` computes `{ data: address(arr) + lo, len: hi - lo }`.
The address source is `#addr_of(arr)` for symbol-backed arrays and
`%addr_of(arr)` for stack-local arrays. The `@T` address lens scales `lo` by
the element size:

<!-- wyst-contract: historical-v0.8 -->
```wyst
words : [4]u64 = {10, 20, 30, 40}

s := words[1:3]  // []u64 — s.data = address(words) + one u64 element, s.len = 2
```

Omitting either bound uses the natural limit:

<!-- wyst-contract: historical-v0.8 -->
```wyst
arr[2:]      // from element 2 to end: len = #len(arr) - 2
arr[:5]      // from start to element 5: len = 5
arr[:]       // whole array as a slice
```

Slice bounds may be any integer scalar type:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: (lo : u32, hi : i16) -> u64 {
  arr : [8]u8 = 0
  s : []u8 = arr[lo:hi]
  t : []u8 = s[0 as.numeric u8:hi]
  return t.len
}
```

For fixed arrays, slice bounds known at compile time must be within
`0..=#len(arr)`, and a fully constant range must have `start <= end`. Runtime
bounds remain unchecked:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: () {
  arr : [4]u8 = {1, 2, 3, 4}
  bad := arr[2:5]
}
```

**Reslicing an existing slice:**

<!-- wyst-contract: historical-v0.8 -->
```wyst
t := s[1:3]   // narrower view into s — s.data + 1*stride, len = 2
```

**From an address and length directly:**

<!-- wyst-contract: historical-v0.8 -->
```wyst
base : @u8 = 0x4000
n : u32 = 64
s : []u8 = []u8{data = base, len = n} // 64 bytes starting at 0x4000
zero : []u8 = []u8{data = 0 as.address @u8, len = 0}
```

This form is intentionally explicit: the `[]u8` prefix names the slice lens,
the `data` field must have type `@u8`, and the `len` field must have type
an integer scalar. The stored `.len` field is still normalized to `u64`.
Braces alone remain fixed-array literals; `{base, 64}` is not a slice.
Direct raw slice construction is allowed in constant and global initializers
when `data` is a compile-time address value and `len` is a constant
non-negative integer expression:

<!-- wyst-contract: historical-v0.8 -->
```wyst
buf : [4]u8 = 0
view : []u8 = []u8{data = #addr_of(buf), len = 4}
empty :: []u8 = []u8{data = 0 as.address @u8, len = 0}
```

Constant negative lengths are rejected, while runtime signed length values
remain unchecked:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: () {
  base : @u8 = 0x4000
  s : []u8 = []u8{data = base, len = -1}
}
```

Integer expressions are not implicitly accepted for `data`. Cast the address
explicitly so the lens is visible:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: () {
  s : []u8 = []u8{data = 0, len = 0}
}
```

Runtime address producers such as `%addr_of(local)` are not constant address
values and cannot appear in global slice initializers.

Slice `.data` and `.len` fields are read-only projections. To retarget or
resize a slice variable, assign a whole new slice value:

<!-- wyst-contract: historical-v0.8 -->
```wyst
s = []u8{data = new_base, len = new_len}
s = s[1:]
```

### Accessing Elements

Slices support element indexing:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

_start :: () -> u64 {
  arr : [4]u64 = {10, 20, 30, 40}
  s : []u64 = arr[:]

  val : u64 = s[1] // load element 1
  s[2] = val // store element 2

  return s[2]
}
```

Like fixed-array indexing, the index is an element index. `s[i]` lowers through
the slice's `.data` field and uses typed address arithmetic to step by
elements. `.data` remains available when raw byte-address work should be
spelled directly; cast it to `@u8` before byte stepping:

<!-- wyst-contract: historical-v0.8 -->
```wyst
byte_offset : u64 = i * #size_of(u64)
addr := (s.data as.lens @u8) + byte_offset
val  := u64@[addr as.lens @u64]
```

If the compiler knows the slice descriptor's `.len` value and the element index
is also a compile-time constant, the index must be in range. This catches obvious
descriptor-length mistakes without inserting a runtime branch:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

main :: () -> u64 {
  arr : [4]u64 = {10, 20, 30, 40}
  s : []u64 = arr[1:3]
  return s[2]
}
```

Known slice lengths come from fixed-array slice expressions such as `arr[:]` and
`arr[lo:hi]` when the resulting descriptor length is constant, from raw slice
constructors with a constant `len`, and from reslices whose `hi - lo` length is
constant.

### .len

`s.len` reads the slice's runtime length field. It is explicit field access,
not a counted operation, and it is not assignable on its own.

<!-- wyst-contract: historical-v0.8 -->
```wyst
s : []u64 = ...

i : u64 = 0
loop {
    if i >= s.len { break }
    total += s[i]
    i += 1
}
```

### Comparing Slices

Slices support same-type descriptor equality:

<!-- wyst-contract: historical-v0.8 -->
```wyst
same_view : bool = left == right
different_view : bool = left != right
```

This compares the slice view itself, not the memory contents:

<!-- wyst-contract: sketch -->
```wyst
left.data == right.data && left.len == right.len
```

There is no element-wise comparison, no ordered comparison, and no equality
comparison with integer zero. Write those intentions explicitly with `.data`,
`.len`, or a loop/helper that reads memory.

### No Runtime Bounds Checking

Wyst does not runtime-bounds-check slice accesses. Except for the compile-time
diagnostic above when both `i` and the descriptor length are known constants,
`s[i]` where `i >= s.len` produces a hardware read at whatever address
`s.data + i * stride` resolves to. The length field exists for the programmer's
use, not for the compiler to silently branch on. If you need a bounds check,
write it:

<!-- wyst-contract: sketch -->
```wyst
if i < s.len {
    val = s[i]
}
```

The check is visible, the branch is explicit, and the cost is clear.

### Passing to Functions

Slices are the idiomatic way to pass variable-length arrays to functions:

<!-- wyst-contract: historical-v0.8 -->
```wyst
sum :: (s : []u64) -> u64 {
  total : u64 = 0
  i : u64 = 0

  loop {
    if i >= s.len {
      break
    }
    total += s[i]
    i += 1
  }

  return total
}

main :: () {
  arr : [4]u64 = {10, 20, 30, 40}
  result = sum(arr[:]) // whole array as []u64
  partial = sum(arr[1:3]) // elements 1 and 2
}
```

### Lowering

A `[]T` value occupies two registers:

```text
xN     — .data field (@T base address)
xN+1   — .len field (u64 element count)
```

When passed as a function argument, `xN` and `xN+1` are the next two
available argument registers. When returned, `x0` and `x1`.

Slice construction `arr[lo:hi]` lowers to two arithmetic operations:

```asm
add  xD, xarr, #lo*stride    // .data = base + lo * sizeof(T)
mov  xE, #(hi - lo)          // .len  = hi - lo
```

Source bounds can use any integer scalar type; the stored `.len` field is
still normalized to `u64`.

No allocation occurs. A slice is a view into existing memory.

### Design Rationale

| Choice                            | Reason                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `[]T` syntax                      | `[N]T` is array, `[]T` is slice — removal of count signals runtime length                       |
| `.data` and `.len` fields         | Explicit; matches the struct model already in the docs                                          |
| Read-only slice fields            | Retargeting changes the slice value as a whole, not one projection at a time                    |
| `s[i]` element access             | Matches fixed-array indexing while preserving explicit construction and no hidden bounds checks |
| `s == t` descriptor equality      | Cheap two-word view comparison; no hidden memory loop                                           |
| No runtime bounds checking        | Consistent with Wyst's no-hidden-branching principle                                             |
| Any integer scalar bounds/lengths | Matches address arithmetic offset policy; slice `.len` remains `u64`                            |
| Constant array-slice bounds       | Obvious invalid ranges fail before lowering                                                     |
| Constant known slice indices      | Obvious descriptor-length mistakes fail before lowering                                         |
| `[]T{data, len}` raw construction | Direct views from raw addresses are explicit about both element lens and length                 |
| `arr[lo:hi]` is two ops           | No allocation; a slice is a view, not a copy                                                    |
| `s.len` reads `.len`              | Transparent; no hidden state                                                                    |

---

## 1.5.3 Dynamic Array Descriptors

`DynamicArray<T>` is the explicitly imported dynamic array descriptor whose
element type is `T`. The annotation itself does not allocate and does not imply a
global allocator or mandatory runtime. A value must be initialized through an
explicit standard-library-shaped API that names its storage source and policy.
The bootstrap library surface uses concrete monomorphic wrapper names such as
`dyn_array_init_Token`, and accepts the narrow checked source spelling
`dyn_array_init<T>(arena, capacity = ..., growth = ...)` for arena-backed
initialization. That spelling deterministically reports a typed wrapper
instance; there is no hidden runtime type erasure in the descriptor.

The descriptor contract must make these facts visible:

- base data address;
- current element length;
- element capacity;
- storage identity, such as arena, fixed buffer, pool, or target/runtime source;
- growth policy and failure behavior;
- movement or address-stability policy.

Normal Wyst code reads descriptor state through dot projections: `arr.data`,
`arr.len`, `arr.capacity`, `arr.storage_identity`, `arr.growth_policy`,
`arr.failure_policy`, and `arr.movement_policy`. These projections are
read-only indefinitely. They are not assignment targets, and Wyst does not add a
parallel typed getter API for descriptor state.

Dynamic arrays support direct element indexing with `arr[i]`. The index may be
any integer scalar expression. Indexing is unchecked and lowers through
`arr.data + i`; typed address arithmetic scales `i` by `#size_of(T)`, and the
compiler does not compare `i` against
`arr.len` or `arr.capacity`. By contract, `arr[i]` names an initialized element
slot and is valid only when `i < arr.len`; capacity-only storage must use the
explicit allocate-slot, initialize-slot, and commit-slot operation path.

Dynamic arrays also support slicing to produce a non-owning `[]T` view over
initialized elements. `arr[:]` lowers to `[]T{data = arr.data, len = arr.len}`.
Range forms follow the same unchecked arithmetic as slice reslicing:
`arr[lo:hi]` produces `data = arr.data + lo` and `len = hi - lo`;
`arr[lo:]` uses `arr.len` as the end bound; `arr[:hi]` starts at zero. The
compiler does not compare range bounds against `arr.len` or `arr.capacity`.
There is no implicit `DynamicArray<T>` to `[]T` conversion in assignments, calls, or
other typed binding contexts. Passing initialized dynamic-array elements to a
slice parameter must use the explicit view expression `arr[:]`.

Dynamic arrays support same-type descriptor equality with `==` and `!=`. This
compares descriptor state only: `.data`, `.len`, `.capacity`,
`.storage_identity`, `.growth_policy`, `.failure_policy`, and
`.movement_policy`. There is no element-wise comparison, no ordered comparison,
and no equality comparison with integer zero. Use explicit field comparisons or
loops/helpers when the intended question is about storage identity, current
length, capacity, or element contents.

Repeated operations use typed wrappers once construction has made the storage
contract explicit. Descriptor-state reads use dot projections, not getter
wrappers. The compiler recognizes operation shapes for push-by-value,
push-from-address, reserve-only, allocate-slot, initialize-slot, and
commit-slot paths, including the dot-syntax forms `arr.push(value)`,
`arr.push_from_address(ptr)`, `arr.reserve(capacity = ..., growth = ...)`,
`arr.alloc_slot()`, `arr.init_slot(slot)`, and `arr.commit_slot(slot)` for a
local, global, or aggregate-field `DynamicArray<T>` descriptor storage path. These
mutating forms require assignable descriptor storage; temporaries and constants
are rejected.

Named arguments appear only on `reserve` and the `dyn_array_init<T>(...)`
initializer. Labels are load-bearing — the compiler checks them — but
position-independent: `arr.reserve(growth = 2, capacity = 32)` and
`arr.reserve(capacity = 32, growth = 2)` are equivalent. Labels must match
the canonical names; misspelled, unknown, or duplicate labels are rejected.
The other dot-syntax forms (`push`, `push_from_address`, `init_slot`,
`commit_slot`) take positional arguments only — adding a label to a
positional call is a compile error.

These calls lower through typed wrappers into a shared byte-storage core, but
the report surface preserves the typed provenance. `wync explain storage`
identifies the descriptor annotation, typed wrapper, byte-storage operation,
storage source, copy or in-place initialization behavior, growth path, failure
path, movement policy, and address-stability policy.

---

## 1.6 Structs

A struct is a named aggregate of typed fields with a fixed memory layout.

Example:

<!-- wyst-contract: sketch -->
```wyst
// `string` is built in with this representation:
// { data : @u8, len : u64 }
```

Field access:

<!-- wyst-contract: sketch -->
```wyst
msg.len
```

Lowering:

<!-- wyst-contract: historical-v0.8 -->
```wyst
len_addr : @u64 = ((%addr_of(msg) as.lens @u8) + #field_offset(string, len)) as.lens @u64
u64@[len_addr]
```

---

### Layout

Struct layout is fully determined by the field declarations. The rules below
are exhaustive — no compiler heuristic, no platform-dependent reordering, no
optional padding choices. A reader of the struct declaration can compute the
offset of every field, the struct's size, and the struct's alignment
mechanically.

#### Field Order

Fields are laid out in **declaration order**, lowest offset first. The compiler
never reorders fields.

#### Natural Alignment

Scalar primitives and built-in field forms have natural alignment:

| Type                | Size (bytes) | Alignment |
| ------------------- | ------------ | --------- |
| `bool`, `u8`, `i8`  | 1            | 1         |
| `u16`, `i16`        | 2            | 2         |
| `u32`, `i32`, `f32` | 4            | 4         |
| `u64`, `i64`, `f64` | 8            | 8         |
| `@T`, `@volatile T`, `@mmio T` | 8            | 8         |
| `[T:N]` (vector)    | sizeof(T)·N  | 16        |
| `string`            | 16           | 8         |
| `[]T`               | 16           | 8         |
| `DynamicArray<T>`   | 56           | 8         |

For an aggregate type (struct or fixed-size array):

- A struct's alignment is the maximum alignment of its fields. An empty struct
  has alignment 1.
- A fixed-size array `[N]T`'s alignment is the alignment of `T`.

#### Padding

Padding is inserted **before** a field exactly when the field's offset under
strict declaration-order packing would not satisfy its alignment requirement.
The minimum number of padding bytes is inserted to reach the next aligned
offset. Padding bytes have unspecified values; reads of padding through a
field projection are not possible (padding is not addressable as a named
field).

After the last field, **trailing padding** is inserted to round the total
struct size up to a multiple of the struct's alignment. Trailing padding
ensures that an array `[N]S` places every element on a correctly aligned
boundary.

#### `#size_of` and `#align_of`

In Wyst source, `#size_of(T)` and `#align_of(T)` are compile-time queries.
In the layout formulas below, `size_of(T)` and `align_of(T)` are mathematical
shorthand for those source forms.

For a struct `S` with fields `f₁ : T₁ … fₙ : Tₙ`:

```
align_of(S)  =  max(align_of(Tᵢ))     for i in 1..n
                (1 if S is empty)

offset(f₁)   =  0
offset(fᵢ)   =  ⌈ (offset(fᵢ₋₁) + size_of(Tᵢ₋₁)) / align_of(Tᵢ) ⌉ · align_of(Tᵢ)

size_of(S)   =  ⌈ (offset(fₙ) + size_of(Tₙ)) / align_of(S) ⌉ · align_of(S)
                (0 if S is empty)
```

For a fixed-size array `[N]T`:

```
align_of([N]T) = align_of(T)
size_of([N]T)  = size_of(T) · N
```

(Array elements are always tightly packed — `size_of(T)` already includes any
trailing padding `T` itself requires, so adjacent elements are correctly
aligned.)

#### Worked Examples

<!-- wyst-contract: historical-v0.8 -->
```wyst
ab :: struct {
  a : u8 // offset 0, size 1
  b : u64 // offset 8 (7 bytes of padding), size 8
}
// align_of(ab) = 8
// size_of(ab)  = 16  (no trailing padding needed; already a multiple of 8)
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
abc :: struct {
  a : u8 // offset 0,  size 1
  b : u64 // offset 8,  size 8  (7 bytes pre-padding)
  c : u16 // offset 16, size 2
}
// align_of(abc) = 8
// size_of(abc)  = 24  (6 bytes of trailing padding to reach next 8-multiple)
```

<!-- wyst-contract: historical-v0.8 -->
```wyst
uart_regs :: struct {
  dr : u32 // 0x00
  rsr : u32 // 0x04
  _pad0 : [4]u32 // 0x08–0x17  (explicit reserved space)
  fr : u32 // 0x18
}

// align_of(uart_regs) = 4
// size_of(uart_regs)  = 0x1c
#static_assert(#size_of(uart_regs) == 0x1c, "uart_regs layout mismatch")
```

Note that the example above uses an explicit `_pad0 : [4]u32` to model
reserved register space. The compiler will never insert four `u32`s of
implicit padding to "skip" reserved registers — only the minimum needed to
satisfy the next field's alignment.

---

### `#packed` Structs

A struct declared with `#packed` has alignment 1 and no inter-field or trailing
padding. Every field occupies its `size_of` bytes at the next consecutive
offset, regardless of natural alignment.

<!-- wyst-contract: historical-v0.8 -->
```wyst
header :: #packed struct {
  magic : u32 // offset 0, size 4
  version : u8 // offset 4, size 1
  flags : u16 // offset 5, size 2  (would normally be at offset 6)
  length : u32 // offset 7, size 4  (would normally be at offset 8 or 12)
}
// align_of(header) = 1
// size_of(header)  = 11
```

A `#packed` struct is read via plain byte-wise loads. The compiler may use
unaligned ARM64 loads where the architecture permits, but never on volatile or
MMIO-intent memory:

- A `#packed` struct whose address is `@volatile` or `@mmio` is rejected at the
  declaration site of the access (`T@[addr]` where `addr` has type
  `@volatile T` or `@mmio T` and `T` is `#packed`), because volatile/MMIO
  accesses require an emitted access at the typed width and MMIO protocols
  usually require natural alignment.
- A `#packed` struct field of type `@volatile U` or `@mmio U` (a qualified pointer
  stored inside a packed aggregate) is allowed — the pointer itself is just
  bytes; only dereferencing it must satisfy alignment.

`#packed` does not change byte order. Use `%load_be<T>`, `%load_le<T>`,
`%store_be<T>`, and `%store_le<T>` at the byte-addressed access sites for
wire-format fields.

---

### Layout Determinism

Two structs declared with identical field-type sequences in the same order
have identical layouts. The compiler may not reorder, deduplicate, or
otherwise transform struct layout based on optimization level, target
microarchitecture, or any other context. The size-of and offset-of formulas
above are the definition of layout, not a description of one possible
implementation.

### Data Layout Transformation: Non-Goal

Automatic AoS (Array of Structs) to SoA (Struct of Arrays) transformation
is **not a Wyst feature and will not be added**. AoS↔SoA conversion changes
the address arithmetic that reaches every field access, violating two core
Wyst guarantees:

1. **Reproducibility** — the same source must produce the same address layout.
   AoS↔SoA changes layout based on access patterns, which are optimization
   context.
2. **Address-arithmetic transparency** — `base + i * stride + offset` must
   be visible in the source. AoS↔SoA rewrites stride and offset behind the
   programmer's back.

Programs that need SoA layout should declare it explicitly:

<!-- wyst-contract: historical-v0.8 -->
```wyst
// AoS (default) — each particle is contiguous
particle :: struct {
    x : f32
    y : f32
    z : f32
    mass : f32
}
particles : [1024]particle

// SoA — each field is contiguous (programmer's choice)
particle_soa :: struct {
    x    : [1024]f32
    y    : [1024]f32
    z    : [1024]f32
    mass : [1024]f32
}
```

### `#repr(field_order: preserve)`

<!-- wyst-contract: historical-v0.8 -->
```wyst
#repr(field_order: preserve)
my_struct :: struct {
    a : u8
    b : u64
    c : u16
}
```

`#repr(field_order: preserve)` is the default behavior — fields are laid out
in declaration order with natural alignment padding. It exists as an explicit
annotation for documentation purposes, making the programmer's intent clear
when layout is load-bearing (e.g. ABI-compatible structs, hardware register
blocks).

`#repr(field_order: preserve)` is the only specified `#repr` spelling. The
`#repr` form is an explicit spelling for the active layout rule; no alternate
keys, values, or field-order strategies are specified.

### `#field_offset(T, field)`

<!-- wyst-contract: historical-v0.8 -->
```wyst
off :: u64 = #field_offset(uart_regs, fr) // byte offset of field 'fr' in uart_regs
```

`#field_offset(T, field)` is a compile-time query returning the byte
offset of a named field within struct type `T`. It is analogous to C's
`offsetof()`.

**Result type:** `u64` (compile-time constant).

**Legal contexts:** same as `size_of` and `align_of` — `#static_assert`,
constant declarations, array sizes, `#align` arguments, arithmetic in
constant expressions.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#static_assert(#field_offset(uart_regs, fr) == 0x18,
               "fr must be at offset 0x18 per PL011 spec")

// Manual field access via a byte lens (when pointer arithmetic is needed)
fr_addr : @u32 = ((base as.lens @u8) + #field_offset(uart_regs, fr)) as.lens @u32
fr_val := u32@[fr_addr]
```

`#field_offset` is useful for:

- Hardware register layout assertions
- Manual serialization where offset arithmetic is explicit
- Cross-language ABI verification

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
returning, and address-taking. The predecessor `bitfield` bound is removed.

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
not alter the existing raw `@mmio T` address type or restore the removed
`T@[address]` access form.

---

## 1.6.3 Enums

`enum` declares a sum type — a value that is exactly one of a fixed set
of named variants. Variants may carry a payload. A discriminator (tag)
identifies which variant a value currently holds.

Enums subsume two distinct features other languages call out separately:
plain "C-style enums" (variants with no payload — just named tag values)
and "tagged unions" (variants with payloads). Both are special cases of
the single `enum` construct. The payload surface supports zero or one
payload-word value per variant.

`union` is not a Wyst keyword. Untagged-overlay use cases that other
languages spell as `union` are covered by `bitstruct` for register
shapes and by explicit `as`-conversion between a struct type and a
backing integer for the rare byte-reinterpretation case.

---

### Declaration

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Plain enum — payload-less variants.
Direction :: enum: u8 {
  North = 0
  East = 1
  South = 2
  West = 3
}

// Sum-type enum — allowed for zero or one payload-word value per variant.
Message :: enum: u16 {
  Quit // tag = 0, no payload
  Write(@u8) // tag = 1, payload is one @u8
  Custom(u32) // tag = 2, payload is one u32
}

// Tuple payloads are outside the enum payload model:
// Move(u32, u32)
// Color(u8, u8, u8)
// Tag values default to 0, 1, 2, ... starting from the previous
// explicit value + 1. Explicit values may be mixed with implicit:
Errno :: enum: u32 {
  Ok = 0
  NotFound = 2
  PermissionDenied // = 3
  IoError // = 4
  Custom(u32) // = 5
}
```

| Element                    | Meaning                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `: u8` / `: u16` / etc.    | Discriminator width. Optional; defaults to smallest unsigned int that holds `variant_count - 1`. |
| `VariantName`              | Payload-less variant. Tag = (previous tag) + 1 or 0 if first.                                    |
| `VariantName = N`          | Explicit tag value. Subsequent implicit values continue from `N + 1`.                            |
| `VariantName(T)`           | Single-element payload of type `T`.                                                              |
| `VariantName(T1, T2, ...)` | Tuple payload; outside the enum payload model.                                                   |

Duplicate tag values are a compile error.

---

### Layout

Wyst has exactly one enum representation rule. The presence of any payload
variant selects the payload enum representation for the whole enum type.

| Enum shape | Tag type and size | Tag values | Payload offset | Payload storage size | Alignment | Total size | Padding bytes |
| ---------- | ----------------- | ---------- | -------------- | -------------------- | --------- | ---------- | ------------- |
| Payload-less enum | The declared unsigned discriminator type, or the smallest unsigned integer type that contains all variant values. Its size is `size_of(tag_type)`. | Explicit and implicit values are non-negative, unique, and must fit in `tag_type`. | not applicable | 0 | `align_of(tag_type)` | `size_of(tag_type)` | none beyond the tag type itself |
| Payload enum | The same declared-or-inferred discriminator type. The tag is stored in the first native word at byte offset 0; bytes `0..size_of(tag_type)` contain the tag value. | Same as payload-less enums. | offset 8 | one native word, exactly 8 bytes | 8 | 16 | bytes `size_of(tag_type)..8` are tag-word padding; bytes after the active payload value inside the payload word are payload-word padding |

Payload enum variants may carry zero or one payload-word value: `bool`,
integer scalars, address types, function-pointer types, or `bitstruct` types.
`f32`, `f64`, structures, arrays, slices, dynamic arrays, tuples, and nested
enum values are not payload-word values. A payload-bearing variant stores its
payload at offset 8 using the payload type's normal byte width and byte order.
A payload-less variant in a payload enum has no active payload value; the
entire payload word is inactive storage.

Padding bytes, inactive payload bytes, and bytes in a payload word outside the
active payload type are not source-level values. A raw read of those bytes
observes `Indeterminate bits` as defined by the behavior taxonomy. Enum
equality compares only the tag and, when both values have the same active
payload-bearing variant, the active payload value; it never compares padding or
inactive payload bytes.

All integer fields in the representation use the target's data endianness. On
the current ARM64 targets this means little-endian tag and integer-payload
bytes. Endianness does not change offsets, total size, alignment, tag values,
or ABI classification.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module enum_layout_contract

Plain :: enum: u16 {
  A
  B = 9
}

Message :: enum: u16 {
  Quit
  Write(@u8)
  Custom(u32)
}

#static_assert(#size_of(Plain) == 2, "Plain is represented by its tag")
#static_assert(#align_of(Plain) == 2, "Plain alignment is tag alignment")
#static_assert(#size_of(Message) == 16, "payload enum is two native words")
#static_assert(#align_of(Message) == 8, "payload enum alignment is one native word")
```

Wyst does not define `#repr(C)` or other explicit layout
overrides on enums. Layout is determined by the rules above. Programmers
who need a specific binary shape (FFI, hardware descriptor, on-wire
format) should declare a struct and convert explicitly via `as`.

---

### Construction

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Payload-less:
d : Direction = Direction.North
// With payload:
w : Message = Message.Write(buf_ptr)
c : Message = Message.Custom(10)

// Recursive (via @ indirection):
Tree :: enum: u8 {
  Leaf
  Node(@Tree)
}

left : Tree = Tree.Leaf
t : Tree = Tree.Node(#addr_of(left))
```

A non-`@`-indirected self-reference is a compile error because the
payload would have infinite size:

<!-- wyst-contract: historical-v0.8 -->
```wyst
Bad :: enum: u8 {
  Recurse(Bad) // compile error: #size_of(Bad) depends on #size_of(Bad)
}
```

---

### Tag Extraction

<!-- wyst-contract: historical-v0.8 -->
```wyst
#tag_of(EnumName.Variant)             // compile-time constant — usable in #static_assert
%tag_of(enum_value)                   // runtime tag projection
```

`#tag_of` is the compile-time spelling for obtaining a variant discriminator as
an integer from a variant path. `%tag_of` is the runtime spelling for projecting
the active discriminator from an enum value. The result type is the enum's
declared discriminator type.

<!-- wyst-contract: historical-v0.8 -->
```wyst
#static_assert(#tag_of(Errno.NotFound) == 2, "Errno.NotFound must remain 2 for ABI compat")

tag := %tag_of(errno)
```

`%tag_of` is a pure projection. It performs no runtime validity check, reads no
payload bytes, and does not branch on variants; it only exposes the tag already
present in the enum representation. Payload-less enums typically lower to the
stored discriminator value. Payload-carrying enums lower to extraction of the
tag field at offset 0.

The `as` operator does not convert between enums and integers; that would
discard the payload silently. Use `#tag_of` for compile-time variant metadata
and `%tag_of` for runtime enum values.

There is no inverse built-in — constructing an enum from a raw tag
integer plus a payload would let the programmer claim "this is the Move
variant" while the payload bytes are arbitrary. Use the variant
constructors instead.

---

### Reading Variants

See [chapter-08-functions.md §2.5](chapter-08-functions.md) for the full grammar of `switch`
and `is`. In summary:

<!-- wyst-contract: historical-v0.8 -->
```wyst
// Exhaustive: every variant must be handled or an `else:` clause present.
switch irq {
    case Timer:        handle_timer()
    case Uart, Virtio: handle_io_irq()
    else:              handle_unknown_irq()
}

// Non-exhaustive opt-out:
#partial switch irq {
    case Timer:        handle_timer()
    // Uart, Virtio, and Spurious are intentionally ignored
}

// Payload binding in an exhaustive switch:
switch m {
    case Quit: handle_quit()
    case Write(ptr): handle_write(ptr)
    case Custom(code): handle_custom(code)
}

// Shared payload binding for variants with the same payload type:
switch event {
    case Uart(vector), Virtio(vector): handle_irq(vector)
    case Timer: handle_timer()
    case Spurious: handle_spurious()
}

// Single-variant test + bind:
if m is Custom(code) {
    handle_custom(code)
}
```

Cases do not fall through. Multi-line case bodies use normal blocks, and
`break` remains loop-only.

Pattern bindings are immutable within the body — `case Custom(code): code = 5`
is a compile error. To produce a mutable local, rebind via `=` to a new name.

Patterns are not nested: `case Color(r, g, b)` is outside the syntax, and
`case Color(Pixel(r, g, b))` is not. To destructure deeper, write a
nested `switch` or `is` in the body.

---

### Recursive Enums and Indirection

Self-referential enums require `@T` indirection, exactly as the address
discipline requires for any structure that might otherwise have unbounded
size. The `@` makes the indirection visible and forces the programmer to
manage the storage:

<!-- wyst-contract: historical-v0.8 -->
```wyst
List :: enum: u8 {
  Nil
  Cons(@List)
}

build_list :: () {
  n2 : List = List.Nil
  n1 : List = List.Cons(%addr_of(n2))
}
```

---

### ARM64 Lowering

Payload-less enum values lower as their discriminator integer. Payload enums
in the first payload slice lower as a native two-register pair: discriminator
word followed by payload word. The compiler:

- Materializes the tag at the declared discriminator width
- Lowers `switch` to a deterministic `cmp`/`b.eq` chain over the tag
- Binds single-word payload values inside the matching `switch` arm
- Lowers `==`/`!=` to a tag compare plus an active-payload compare only when
  the matched variant carries a payload
- Lowers `%tag_of(value)` to extraction of the tag-typed integer at offset 0
- Future `is` lowers to a single tag compare + conditional branch

Payload memory for inactive variants has no valid source-level meaning. Reading
a payload field of a variant other than the currently-active one is a compile
error in `switch`/`is` patterns (the type system rules it out) and is an
unchecked invalid-payload read if expressed through raw address manipulation.
That raw read observes `Indeterminate bits`. The compiler must not exploit it
as C-style undefined behavior or treat the value as optimizer poison.

---

### Design Rationale

| Choice                                        | Reason                                                                                                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One construct for plain-enum and tagged-union | They are the same feature mathematically; folding them avoids a second keyword with overlapping semantics.                                                                 |
| Discriminator at offset 0                     | Predictable layout for tag extraction and for ABI inspection.                                                                                                              |
| No `as` between enum and integer              | Would silently discard payload state. Explicit tag extraction keeps the projection visible.                                                                                |
| No `from-integer` construction                | Would let the programmer assert a variant tag with arbitrary payload bytes; the tag/payload pairing would not be a checked invariant.                                      |
| Exhaustive `switch` by default                | Catches missed cases — the primary failure mode for tag-discriminate code. `#partial` opt-out matches the directive style elsewhere in the language.                       |
| `if m is V(p) { ... }` shorthand              | The "check one variant and use the payload" pattern is too common to require a full `switch`. Reads naturally.                                                             |
| Pattern bindings immutable                    | The binding is a view onto the payload; mutating it would be ambiguous (does it modify the enum value or a local copy?). Explicit `=` to a new name removes the ambiguity. |
| No nested patterns                            | Complexity is high relative to ergonomic value. Sequential `switch`/`is` covers every case.                                                                                |
| Recursive enums via `@T` only                 | Matches Wyst's general address discipline — visible indirection, programmer-managed storage.                                                                                |
| No `#repr(C)` overrides                       | FFI / hardware shapes should use struct + `as`; co-opting enum for those use cases compromises the rules above.                                                            |

---

## 1.7 Strings

Runtime `string` values produced from string literals live in `.rodata`.
When a string literal initializes `[N]u8`, the decoded bytes are embedded in
that fixed array's storage and zero-filled as described in the fixed-array
section.

Example:

<!-- wyst-contract: historical-v0.8 -->
```wyst
msg :: "Hello\n"
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
ch : u8 = 'A' // 0x41
newline : u8 = '\n' // 0x0a
null_byte : u8 = '\0' // 0x00
```

Character literals support the escape sequences `\\`, `\'`, `\0`, `\n`,
`\r`, `\t`, and `\xHH`. They are compile-time constants and follow the same
constant-folding rules as integer literals.

The value is the ASCII byte for a direct character or the explicit byte named
by an escape sequence. Direct non-ASCII characters are rejected rather than
truncated; use string literals for UTF-8 text.

Because the type is `u8`, character literals participate in the normal
type system with no implicit widening:

<!-- wyst-contract: historical-v0.8 -->
```wyst
uart_write :: (byte : u8) { /* ... */ }
uart_write('h')              // OK: 'h' is u8
wide := 'A' as.widen u64    // explicit widen required
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
UART0_BASE :: u64 = 0x09_00_00_00
UART_CLOCK ::= 24_000_000
UARTDR :: u64 = UART0_BASE + 0x00
TXFF :: u32 = 1 << 5
```

Forward top-level references are valid when acyclic:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

FIRST :: u64 = SECOND + 1
SECOND :: u64 = THIRD + 1
THIRD :: u64 = 40
#static_assert(FIRST == 42, "forward constants")
```

Cycles are rejected:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

A :: u64 = B
B :: u64 = A
```

Compile-time evaluation is part of the core language.

---

## 1.9 Numeric Literals and Digit Separators

Numeric literals support `_` as a digit separator to improve readability:

<!-- wyst-contract: historical-v0.8 -->
```wyst
UART0_BASE :: u64 = 0x09_00_00_00
PAGE_SIZE :: u64 = 4_096
MASK :: u64 = 0xFFFF_FFFF
COUNT :: u64 = 1_000_000
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
val : f64 = 3_141_592.653_589
big : f64 = 1e6
```

---

## 1.10 Comments

Single-line comments use `//`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
x = u64@[addr]     // load from address
```

Multi-line comments use `/* ... */`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
/*
 * This block waits for the UART transmit
 * FIFO to drain before writing a byte.
 * UARTFR is declared `@mmio u32` elsewhere.
 */
while u32@[UARTFR] & TXFF != 0 {
    %nop()
}
```

Rules:

- `//` comments extend to end of line
- `/* ... */` comments span arbitrary lines
- `/* ... */` cannot be nested
- `/* ... */` may appear anywhere whitespace is allowed

---

## 1.11 Multiline String Literals

Multiline strings use triple-quotes `""" ... """`:

<!-- wyst-contract: historical-v0.8 -->
```wyst
banner :: """\
Wyst Bootloader
Target: RPi3 (ARM64)
Compiled: 2024-01-15\
"""
```

Rules:

- Opening `"""` is followed by `\` to suppress the first newline
- Closing `\` before `"""` suppresses the trailing newline
- Without `\` on the opening or closing line, the newline is included
- Standard escape sequences (`\n`, `\t`, `\\`, `\"`) work inside
- The string is stored in `.rodata` with exact byte content

Examples:

<!-- wyst-contract: historical-v0.8 -->
```wyst
# includes surrounding newlines
with_newlines :: """\nHello\nWorld\n"""

# no surrounding newlines (trimmed)
trimmed :: """\
Hello\nWorld\
"""

# single-line use is also valid
simple :: """just a string"""
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
html :: string = #dedent """\
    <html>
      <head></head>
      <body>
        <p>Hello</p>
      </body>
    </html>\
"""
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
// & binds before != — parentheses not needed
// (UARTFR is `@mmio u32`, so u32@[UARTFR] is a volatile MMIO-intent load)
u32@[UARTFR] & TXFF != 0             // (u32@[UARTFR] & TXFF) != 0

// left-to-right at equal precedence
x / y * z                           // (x / y) * z
a + b - c                           // (a + b) - c
a << b >> c                         // (a << b) >> c

// bit manipulation
x &^ mask                           // clear bits: a & (~mask)
x | (1 << n)                        // set bit n
(x >> 4) & 0xF                      // extract nibble
x ^ y                               // toggle bits in x that are set in y
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

DEBUG :: bool = true
PREFIX :: string = #if DEBUG {
  "DBG: "
} #else {
  ""
}
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
PREFIX :: string = #if DEBUG {
  "DBG: "
} #else {
  ""
}
```

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

#### Hardware layout contracts

<!-- wyst-contract: historical-v0.8 -->
```wyst
uart_regs :: struct {
  dr : u32 // +0x00  data register
  rsr : u32 // +0x04  receive status
  _pad0 : u64 // +0x08
  _pad1 : u64 // +0x10
  fr : u32 // +0x18  flag register
}

#static_assert(#size_of(uart_regs) == 0x1c, "uart_regs must match PL011 register map")
#static_assert(#align_of(uart_regs) == 4, "uart_regs must be 4-byte aligned")
```

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

#### DTB compatibility

<!-- wyst-contract: historical-v0.8 -->
```wyst
// struct shared with C firmware — must match C layout exactly
fdt_header :: struct {
  magic : u32
  totalsize : u32
  off_dt_struct : u32
  off_dt_strings : u32
  off_mem_rsvmap : u32
  version : u32
  last_comp_ver : u32
  boot_cpuid_phys : u32
  size_dt_strings : u32
  size_dt_struct : u32
}

#static_assert(#size_of(fdt_header) == 40, "fdt_header must match DTB spec (10 x u32)")
```

---

### Placement

`#static_assert` may appear at:

- module scope — checked when the module is compiled
- inside a function body — checked at the function definition during semantic
  checking, even if the function is unreachable or marked `#inline`
- inside a `bitstruct` or `struct` declaration — checked when the
  type is resolved

Statement-level `#if` expansion happens before function-body semantic checking,
so `#static_assert` is evaluated only in the selected branch.

<!-- wyst-contract: historical-v0.8 -->
```wyst
// module scope — always checked
#static_assert(#size_of(u64) == 8, "u64 must be 8 bytes")

#inline
helper :: () {
    // checked at this definition, even if helper has no call sites
    #static_assert(#size_of(@u8) == 8, "pointer must be 64-bit")
}

process :: (buf : @u8, len : u64) {
    // function scope — checked at this definition
    #static_assert(#size_of(@u8) == 8, "pointer must be 64-bit")
    ...
}
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
swap<T>(left : @T, right : @T)

Box<T> :: struct {
    value : T
}

Result<T: payload_word, E: payload_word> :: enum : u8 {
    Ok(T)
    Err(E)
}
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
add_one<T: integer> :: (value : T) -> T {
  return value + 1
}
```

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
| `payload_word`     | `bool`, integer scalar types, pointer types, function-pointer types, and nominal `bitstruct` types | equality, inequality, storage, passing, returning, address-taking, and use as a generic enum payload |

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

Generic enum payloads are also a bounded capability. A payload variant that
stores a type parameter directly, such as `Ok(T)`, must declare `T:
payload_word` or a narrower payload-compatible bound: `integer`,
`unsigned_integer`, `signed_integer`, `address`, or `bitstruct`. The broader
`scalar` and `numeric` bounds are not payload-compatible because they include
floating-point types. Violations are rejected at the generic declaration or at
the instantiation boundary:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module generic_enum_payload_reject

Error :: struct {
  code : u64
}

Result<T: payload_word, E: payload_word> :: enum: u8 {
  Ok(T)
  Err(E)
}

bad : Result<[]u8, Error> = 0
```

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

The implemented generic model above is the normative type-parameter surface.
The patterns below remain useful when a problem does not need a generic
declaration: manual monomorphization, `bitstruct` declarations, address-lens
code, and external code generation. `#if` is included here as the compile-time
selection rule, not as a type-value mechanism.

#### Manual Monomorphization

Write one function per concrete type. For small, frequently-monomorphic
operations (swap, min, max, byte-reverse), this is the path of least
resistance.

<!-- wyst-contract: historical-v0.8 -->
```wyst
swap_u32 :: (a : @u32, b : @u32) {
  tmp := u32@[a]
  u32@[a] = u32@[b]
  u32@[b] = tmp
}

swap_u64 :: (a : @u64, b : @u64) {
  tmp := u64@[a]
  u64@[a] = u64@[b]
  u64@[b] = tmp
}
```

This is exactly what monomorphization would produce. The cost is
hand-maintenance when you add a new type.

#### `#if` Over Same-Typed Compile-Time Variation

When compile-time conditionals are used for variation, they pick between two
same-typed values or same-signature implementations based on a build-time
constant:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module boot

USE_WIDE_COUNTERS :: bool = true
COUNTER_MAX :: u64 = #if USE_WIDE_COUNTERS {
  0xFFFF_FFFF_FFFF_FFFF
} #else {
  0xFFFF_FFFF
}
```

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

<!-- wyst-contract: historical-v0.8 -->
```wyst
zero_words :: (start : @u64, count : u64) {
    i : u64 = 0
    while i < count {
        u64@[start + i] = 0
        i += 1
    }
}

// Caller chooses what each word means by casting the address.
zero_words(#addr_of(buffer) as.address @u64, 16)
```

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
