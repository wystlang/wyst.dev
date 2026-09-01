---
title: "Type System"
group: reference
section: language
order: 120
summary: "Primitive types, typed addresses, containers, declarations, generics, and explicit conversions."
---

# Type System

> **Canonical scope.** This reference defines the Wyst type forms and explicit conversions.
> [Operators and Evaluation](operators-and-evaluation.md) defines operators.
> [Functions and Control Flow](functions-and-control-flow.md) defines callable contracts.
> [Memory Model](memory-model.md) defines memory access.

Wyst uses static types. A declaration gives each stored value a complete type.

The compiler does not apply general implicit conversions. Numeric literals can bind to an expected compatible type.

## Primitive types

Wyst provides these primitive value types:

| Type | Meaning | Size | Alignment |
|---|---|---:|---:|
| `bool` | Boolean value | 1 byte | 1 byte |
| `u1` through `u64` | Unsigned integer with the named value width | 1, 2, 4, or 8 bytes | Same as size |
| `i2` through `i64` | Signed two's-complement integer with the named value width | 1, 2, 4, or 8 bytes | Same as size |
| `f32`, `f64` | Floating-point value | 4 or 8 bytes | Same as size |
| `string` | Valid UTF-8 view descriptor | 16 bytes | 8 bytes |

An integer literal has no concrete type before contextual binding.

The digits in an integer type name are its exact value width. Spellings are
canonical decimal without leading zeroes. `u0`, `i0`, `i1`, widths above 64,
and spellings such as `u06` are invalid. `bool` and `u1` are distinct types:
`bool` supports logical operations, while `u1` is an integer with values 0 and
1. Use `numeric<T>` to convert between them.

Standalone exact-width integers use the smallest 1-, 2-, 4-, or 8-byte storage
carrier that can hold the value width. For example, `u6` has size and alignment
1, `i17` has size and alignment 4, and `u33` has size and alignment 8. Structs
and arrays use those rounded layouts; they do not implicitly bit-pack adjacent
integer values. In memory and constant data, unused carrier bits are zero for
unsigned types and sign extension for signed types.

Every integer type provides exact typed `MIN` and `MAX` compile-time members.

An unbound integer expression defaults to `i64`. A nonnegative value that fits
in `u64` but not `i64` keeps its 64-bit pattern, becomes the corresponding
negative `i64` value, and emits W0202. Every other value must fit in `i64`.

An unbound floating-point expression defaults to `f64`.

Integer literals can use decimal, binary, octal, or hexadecimal notation.

The prefixes are `0b`, `0o`, and `0x`. An underscore can separate digits.

Floating-point literals use decimal notation. They can include a decimal point or an exponent.

Character literals contain one byte. Use an escape for a non-ASCII byte.

## Byte quantities

A byte quantity is an exact compile-time value with type `ByteLength`.
It has a number with one case-sensitive unit attached to it.

| Units | Multipliers |
|---|---:|
| `B`, `kB`, `MB`, `GB`, `TB`, `PB`, `EB` | 1 and powers of 1,000 |
| `KiB`, `MiB`, `GiB`, `TiB`, `PiB`, `EiB` | Powers of 1,024 |

An integer magnitude can use decimal, binary, octal, or hexadecimal notation.
A fractional magnitude must use decimal notation and must equal a whole number of bytes.
For example, `1.5MiB`, `1.234MB`, and `0x10MiB` are valid.
`1.234MiB` is invalid because it does not equal a whole number of bytes.
Exponent notation is not valid before a byte unit.

The lexer uses the longest valid numeric token. For example, `0x10B` is one
hexadecimal integer, not a byte quantity. Use a decimal magnitude or a unit
that does not continue the hexadecimal token.

The unit is contextual. A unit spelling can remain an identifier where it does not
follow a number. Wyst has no unit aliases and no bit units. `KB` is invalid.

Byte quantities are valid where the language contract measures bytes. These positions
include `ByteLength` constants and constant arithmetic, fixed `u8` array lengths,
layout region sizes and alignments, declaration and field alignment attributes, and
`#[frame(max_bytes = ...)]`. They are not general integer values. An address, an index,
a `u64` value, a non-`u8` array length, and `#[frame(max_spills = ...)]` do not accept a
byte quantity. `#size_of` returns `ByteLength`, and `#align_of` returns
`Alignment`.

## Frequencies

A frequency is an exact compile-time value with type `Frequency`. It has a
number with one case-sensitive unit attached to it.

| Units | Multipliers |
|---|---:|
| `Hz`, `kHz`, `MHz`, `GHz` | 1 and powers of 1,000 |

An integer magnitude can use decimal, binary, octal, or hexadecimal notation.
A fractional magnitude must use decimal notation and must equal a whole number
of hertz. For example, `24MHz`, `62.5MHz`, and `0x10MHz` are valid. `0.1Hz` is
invalid. Exponent notation is not valid before a frequency unit.

The unit is contextual. A unit spelling can remain an identifier where it does
not follow a number. Wyst has no frequency-unit aliases.

Frequency literals bind only to `Frequency`. They do not bind to an integer or
another numeric nominal type. Use an explicit representation crossing for a
hardware interface that stores a frequency as an integer.

## Built-in type forms

| Form | Name | Description |
|---|---|---|
| `@T` | typed address | Address with an element lens of `T` |
| `@volatile T` | volatile typed address | Typed address for volatile access |
| `@mmio T` | MMIO typed address | Volatile typed address with MMIO intent |
| `[N]T` | fixed array | `N` adjacent values of type `T` |
| `[T:N]` | vector | `N` SIMD lanes of type `T` |
| `[]T` | slice | Descriptor for a contiguous view of `T` values |
| `fn(...) -> T` | function pointer | Native callable value |
| `extern "C" fn(...) -> T` | C function pointer | C callable value |
| `(name: T, other: U)` | named tuple | Named multi-result value |

`never` is valid only as a callable result type. It has no stored value.
A value result permits terminal and diverging paths, but each normal return
must supply the declared value. A `never` result promises that no normal return
is possible.
A valid `return`, `fail`, `cancel`, `break`, `continue`, or context-valid `goto` path in a value
expression is terminal. It is compatible with each live result type. It
supplies no value, resource state, or typed-storage state to the live join.

See [Functions and Control Flow](functions-and-control-flow.md) for callable parameters, results, effects, and trust bounds.

### Typed addresses

A typed address records an element lens and access qualifiers.

`@mmio T` also has volatile access semantics.

Typed addresses occupy eight bytes and have eight-byte alignment.

The `+` and `-` operators do not accept typed addresses.

Use `byte_offset`, `element_offset`, or `field_addr` for address derivation.

Use `relens<T>` to change only the element lens.

Use `qualify<T>` to change only the volatile or MMIO qualifiers.

One conversion cannot change the lens and qualifiers together.

Memory operations and address validity rules are in [Memory Model](memory-model.md).

A callable can return an address or slice payload whose storage authority
comes from one parameter. The `from source on .Variant` contract makes that
relation available only after nominal enum refinement. It changes no stored
type layout. [Functions and Control Flow](functions-and-control-flow.md)
defines the source form.

### Fixed arrays

`[N]T` contains exactly `N` adjacent elements of type `T`.
`N` can be a byte quantity only when `T` is `u8`.

Its alignment is the element alignment. Its size is `N` times the element size.

The length must be a compile-time value.

The compiler accepts `[_]T` only on a direct `const` or `var` binding.

The initializer must be a direct array literal.

For `[_]u8`, the initializer can also be a byte-string literal.

In these positions, `_` means the initializer element count.

`[value; N]` is a fixed-array repeat literal. `N` must be a compile-time
`u64`. It can be a `ByteLength` only when the contextual element type is `u8`.
The count must match the contextual fixed-array length and currently cannot
exceed 1,048,576 elements. The compiler evaluates `value` once and copies it
into all `N` elements, so the element type must be copyable. Repeat syntax does
not construct SIMD vectors.

An index expression reads or writes one element. A slice expression creates a slice view.

The slice forms are `values[..]`, `values[..<end]`, `values[start..]`, and `values[start..<end]`.

### Vectors

`[T:N]` contains `N` SIMD lanes of the same primitive numeric type.

The complete vector size must be 8 or 16 bytes. The vector alignment is 16 bytes.

The compiler accepts these integer shapes:

- `[u8:8]`, `[i8:8]`, `[u8:16]`, and `[i8:16]`
- `[u16:4]`, `[i16:4]`, `[u16:8]`, and `[i16:8]`
- `[u32:2]`, `[i32:2]`, `[u32:4]`, and `[i32:4]`
- `[u64:2]` and `[i64:2]`

The compiler accepts `[f32:2]`, `[f32:4]`, and `[f64:2]`.

See [SIMD](simd.md) for vector operations and lowering.

### Slices

`[]T` is a two-word descriptor. It does not own its elements.

A slice is a positional view of one exact backing-storage range. Its validity
proves access to that range, not collection membership or logical element
identity. After a storage-preserving sequenced edit changes the range's
contents, a later slice read observes the new contents at the same positions.

The `data` field has type `@T`. The `len` field has type `u64`.

The `data` field starts at byte 0. The `len` field starts at byte 8.

A slice has size 16 and alignment 8.

Indexing accesses one element. Slicing creates another view.

`values[?index]` is a forwarding checked subscript. For fixed arrays and
slices, it accepts an unsigned primitive index, a contextual nonnegative
literal, or the corresponding nominal index type. It checks the captured
length and forwards `core.checked.IndexFailure` through the lexical authentic
`Result`. Its success value has the same element place type and access
authority as `values[index]`.

`values[?lower..<upper]`, `values[?lower..]`, and `values[?..<upper]` check a
captured fixed-array or slice descriptor and forward
`core.checked.SliceFailure`. Their success value is `[]T` with provenance from
the captured base. The bound types follow the checked-index rules. Wyst does
not provide `values[?..]` or a trapping subscript shorthand.

The sealed `core.checked.element<T>` and `core.checked.subslice<T>` functions
expose the same checked behavior for callers that match the `Result` locally.
Their success payload keeps the exact source provenance and access authority.

Slice equality compares the `data` and `len` fields. It does not compare elements.

See [Memory Model](memory-model.md) for bounds and access rules.

### Strings

`string` is a two-word read-only view descriptor whose complete byte range is
valid UTF-8. Raw or externally supplied bytes remain `[]u8` until
`core.text.from_bytes` validates them. Safe public source has no unchecked
byte-to-string constructor.

The `data` field has type `@u8`. The `len` field has type `u64`.

A string literal produces a `string` value unless an array context applies.
The compiler rejects a literal whose decoded bytes are not valid UTF-8.

A string literal can initialize `[N]u8`. The compiler rejects more than `N` decoded bytes.

The compiler fills unused array bytes with zero.

`[_]u8` infers the decoded byte count from the string literal.

`value[?lower..<upper]`, `value[?lower..]`, and `value[?..<upper]` use byte
offsets. They check range order, byte bounds, and both UTF-8 boundaries before
they return a `string` view from `value`. They forward
`core.text.TextSliceFailure` through the lexical authentic `Result`. A UTF-8
boundary is byte offset zero, the string byte length, or the first byte of one
encoded Unicode scalar value.

Wyst does not provide `string[?index]` or `string[?..]`. One byte is not
generally one character, and this revision does not define scalar-value or
grapheme indexing.

### Staged scan result types

The exact bundled `core.scan.read` declaration has a closed compiler rule. Its
type argument must be a concrete named tuple with at least two fields. Every
field label must be unique, every field must be fixed-layout movable, and every
field type must have one supported built-in scan parser. This rule is not a
reusable generic bound and does not add a `named_tuple` capability.

The compile-time template must capture every tuple field exactly once. The
field type and optional specifier select the parser. Schema errors are
compile-time diagnostics. A successful `Result` carries string-field
provenance from the input.

## Nominal carrier types

`type Name: Carrier` declares a distinct nominal carrier type.

## Nominal operation owners

`fn Owner.operation(...)` associates one operation leaf with one exact nominal
type identity. Valid owners are local concrete nongeneric structs, enums,
nominal carrier types, bitstructs, and register-map types. An imported type,
type alias, primitive, address, generic owner instance, or static-interface
parameter cannot own a declaration. A public operation cannot expose a private
owner.

Parameter zero named `self` must have the explicit exact owner type. Its normal
parameter mode defines receiver behavior. Read `self` retains a readable
value, `mut self` needs an addressable mutable place, and `var self` consumes an
explicitly transferred value. Receiver lookup uses the static nominal identity
only. It does not change references, dereference addresses, convert values, or
select an interface implementation.

The carrier must be a primitive integer or floating-point type.

The nominal type has the exact carrier size, alignment, and representation. It
does not add a field or an aggregate layer.

Two declarations with the same carrier still define different types.

Plain nominal carriers support `==` and `!=` between values of the same type.
They do not bind numeric literals implicitly. They do not provide arithmetic,
bitwise, shift, ordering, unary numeric, `MIN`, or `MAX` operations.

`numeric type Name: Carrier` opts in to the carrier's numeric operations,
literal binding, and compile-time limits. Each operation preserves the nominal
type. Operations do not mix different nominal types.

Use `bitcast<T>` to cross explicitly between a nominal type and its exact
carrier. `opaque type` prevents this representation crossing outside the
declaring module. The declaring module can publish named construction and
projection functions when callers need controlled access.

`opaque numeric type` combines controlled representation access with numeric
behavior.

<!-- wyst-contract: check-pass -->
```wyst
module manual.nominal_types

type Sequence: u64
numeric type Distance: u64

const FIRST: Sequence = bitcast<Sequence>(numeric<u64>(1))
const ONE_METER: Distance = 1

fn same(left: Sequence, right: Sequence) -> bool {
  return left == right
}

fn add(left: Distance, right: Distance) -> Distance {
  return left + right
}
```

## Struct types

`struct` declares named fields in declaration order.

<!-- wyst-contract: check-pass -->
```wyst
module manual.struct_types

struct Pair<T: copyable_discardable> {
  left: T
  right: T
}

fn duplicate(value: u64) -> Pair<u64> {
  return {left = value, right = value}
}
```

A struct literal needs an expected struct type.

The literal must initialize every field exactly once.

The written field order can differ from the declaration order.

The compiler evaluates field expressions once, in written order.

The layout follows declaration order. Normal structs include required field padding.

`#[align(N)]` on a field increases that field's required alignment.

`packed struct` removes field padding and sets struct alignment to one byte.

A packed struct cannot contain atomic storage requiring greater alignment.

## Enum types

`enum` declares at least one variant. A variant can have a payload.

An optional unsigned integer after `:` sets the tag type.

Without it, the compiler selects the smallest unsigned primitive that fits all tags.

Implicit tag values start at zero and increase by one.

Explicit tag values must be nonnegative, unique, and representable by the tag type.

A payload must have fixed layout and ordinary move semantics.

`Variant(from Source)` declares one direct forwarding relation from `Source`
to the containing enum. A marked variant has exactly one inhabited,
fixed-layout movable payload. One concrete source type can name at most one
marked variant. Generic enums are checked again after substitution, so a
materialization that makes two source types equal is invalid.

The marker does not change layout, ABI, effects, trust, or abilities. It is
public semantic metadata for a public non-opaque enum. An opaque enum exposes
the relation only in its owner module. Forwarding does not follow a chain of
marked variants.

Use `Name.Variant` for a payload-free variant.

Use `Name.Variant(arguments)` for a payload variant.

Use `.Variant` when an enum type is already expected.

Expected typing also applies to payload constructors such as `.Ok(value)` and
`.Error(.Read(problem))`. A payload constructor without a complete expected
enum type is invalid.

The `.tag` projection reads the runtime tag.

`#tag_of(Name.Variant)` returns the compile-time tag value.

<!-- wyst-contract: check-pass -->
```wyst
module manual.enum_types

enum Reply: u8 {
  ready = 1
  value(u64) = 2
}

const READY: Reply = Reply.ready

fn wrap(value: u64) -> Reply {
  return Reply.value(value)
}
```

## Bitstruct types

`bitstruct` declares named fields within an unsigned integer backing type.

The backing type must be `u8`, `u16`, `u32`, or `u64`.

A field can use `bool`, an exact-width integer type, or a payload-free enum type.

`at N` assigns one bit. Only a `bool` field can use this form.

`at A..=B` assigns an inclusive bit range.

Field ranges must be compile-time values, disjoint, and inside the backing width.

An integer field's type width must equal its declared bit width. A payload-free
enum field's tag width must equal its declared bit width. This makes reads and
writes use the field's exact type without an implicit narrowing boundary.

An enum field must define every bit pattern available in its range.

A literal must initialize every declared field exactly once.

Unassigned backing bits are zero after construction.

A field write must have the field's exact type, or be a literal representable by
that type. Convert a wider runtime value explicitly with `truncate<FieldType>`.

Use `bitcast<T>` to cross between a bitstruct and its exact backing type.

<!-- wyst-contract: check-pass -->
```wyst
module manual.bitstruct_types

bitstruct Control: u32 {
  enabled: bool at 0
  count: u3 at 8..=10
}

const RESET: Control = {enabled = true, count = 5}
```

## Register-map instance types

`register_map Name` declares a nominal type for authenticated placements of
one MMIO register schema. A placed register-map `mmio` declaration denotes a
value of that type; the type does not denote one ambient placement.

A register-map instance value has size eight and alignment eight. Its runtime
representation is the selected base address. The compiler separately retains
the finite set of authenticated placement origins that may have produced the
value. This authority is semantic evidence and adds no runtime tag or hidden
storage.

Register-map instance values have fixed layout and ordinary move, copy, and
discard abilities. They can be used as Native-ABI parameters and results and
stored in locals, module storage, arrays, tuples, structs, and enums whose
ordinary ability rules admit them. They can satisfy
`fixed_layout_movable` and `copyable_discardable` generic bounds. Passing or
copying one retains the caller's authority; it does not transfer exclusive
ownership of the complete peripheral.

Register-map instance types provide no arithmetic, ordering, equality, numeric
conversion, address conversion, struct literal, or bitcast construction. A
value can originate only from an authenticated placed declaration or from
another value that already carries a matching origin. Consequently, an
integer, typed address, scalar `mmio` declaration, or incompatible register-map
instance cannot become one of these values.

Register-map instance values are Wyst semantic capabilities. They cannot cross
an `extern "C"` boundary or an untyped native symbol boundary. Public Wyst
declarations preserve their nominal map identity, placement origins, and
target requirements through semantic module interfaces and static linking.

## Resource modifiers

A struct or enum can declare `no_copy`, `must_account`, or `must_resolve`.

`no_copy` disables implicit copies. Use `xfer` for an explicit transfer.

`must_account` also requires each live value to leave every path through an explicit terminal action.

Transfer, return, structural adoption, or `discard(xfer value)` can satisfy that obligation.

`must_resolve` also rejects `discard`. Use `resolve(xfer value)` in the declaration's module.

`opaque` prevents other modules from constructing values or accessing internal fields and variants.

`agent_local` propagates a restriction on cross-agent transfer.

The resource properties propagate through fields, enum payloads, and fixed arrays.

See [Functions and Control Flow](functions-and-control-flow.md) for parameter and result transfer rules.

## Storage wrapper types

`MaybeUninit<T>` reserves storage with the size and alignment of `T`.

It does not provide an ordinary value of `T` before initialization is proven.

Use the initialization operations in [Semantic Operations and Hardware Declarations](semantic-operations.md).

`atomic<T>` reserves atomic storage with the element's size and alignment.

Atomic operations require supported element types, orders, and natural alignment.

Compare-exchange operations return the value named `observed` with a success result.

See [Memory Model](memory-model.md#atomic-storage) for the atomic operation contracts.

## Generic declarations

Functions, structs, and enums can declare type parameters. A function can
declare one final heterogeneous type pack with `Name...`; structs and enums
cannot declare packs.

Each type parameter can have one optional constraint: either one built-in bound
or one static interface. Static interfaces and their carrier-ability rule are
defined in [Interfaces and Implementations](interfaces-and-implementations.md).

Associate a type pack with the final value parameter `args: Args...`. Pack
arguments evaluate exactly once from left to right. Bare identifiers carry
their source name as an optional compile-time label; `label = expression`
supplies an explicit label. Packs and labels have no runtime representation.

Generic type applications and explicit function applications must provide every
type argument. A direct generic function call may omit the entire list when
every type argument is uniquely recoverable by structurally matching the
call's statically known argument types against the function's parameter types.
Matching follows direct type-parameter occurrences and occurrences nested in
nominal generic carriers, pointers, fixed arrays, slices,
tuples, and vectors. Callable-signature inference is not part of this rule.

The compiler infers the complete type pack from the associated final value
pack. Explicit type-pack applications are not supported.

Inference does not use a call's result context, guess types for uncontextualized
literals, derive types from bounds, accept partial type-argument lists, or
provide default type arguments. If argument types do not determine one complete
list, write that list explicitly.

The closed bound set is:

| Bound | Admitted types |
|---|---|
| `integer` | Primitive integers and integer-backed numeric nominal types |
| `unsigned_integer` | Primitive unsigned integers and unsigned-integer-backed numeric nominal types |
| `signed_integer` | Primitive signed integers and signed-integer-backed numeric nominal types |
| `float` | Primitive floats and float-backed numeric nominal types |
| `numeric` | Primitive numeric types and numeric nominal types |
| `scalar` | `bool`, primitive numeric types, or nominal carrier types |
| `address` | Typed addresses or function pointers |
| `bitstruct` | Declared bitstruct types |
| `payload_word` | `bool`, primitive integers, integer-backed nominal carriers, addresses, function pointers, or bitstructs |
| `fixed_layout_movable` | Fixed-layout values with ordinary move semantics |
| `copyable_discardable` | Fixed-layout values that permit copying and discarding |

The `integer`, `unsigned_integer`, and `signed_integer` bounds guarantee
`T.MIN` and `T.MAX`. Each member is a compile-time constant with exact type
`T`. A nominal type satisfies these bounds only when it has the `numeric`
modifier. Other bounds and unbound type parameters do not provide these
members.

All listed bounds prove fixed layout and ordinary move semantics.

All except `fixed_layout_movable` also prove copying and discarding.

Register-map instance values satisfy `fixed_layout_movable` and
`copyable_discardable`. A generic parameter constrained only by either bound
can carry such a value, but cannot project registers because the bound does not
identify a register-map schema.

A static-interface constraint is nominal and entails the interface's one
built-in carrier ability. It does not add an interface value type or allow a
user implementation to prove a built-in ability. Constraint intersections and
interface inheritance are not supported.

## Explicit conversions

Write a conversion as `name<Target>(value)`.

The conversion name must match the source and target categories.

| Conversion | Rule |
|---|---|
| `widen<T>` | Convert to a wider integer with the same signedness |
| `truncate<T>` | Convert to a narrower integer |
| `signcast<T>` | Change signedness without changing width |
| `numeric<T>` | Perform an integer conversion not covered above, or convert between integers and `bool` |
| `bitcast<T>` | Cross an exposed exact nominal carrier or bitstruct backing boundary |
| `floatcast<T>` | Convert between integer and floating-point categories, or between float widths |
| `saturate<T>` | Clamp during same-signedness integer narrowing |
| `address<T>` | Cross between `u64` and a typed address, or convert an address to `u64` |
| `relens<T>` | Change only a typed address element lens |
| `qualify<T>` | Change only typed address qualifiers |

`address<T>` also accepts a representable untyped integer when `T` is a typed address.

It converts a function pointer to `u64`. It does not create a function pointer.

Use `trusted_callable<T>` to create a function pointer from an integer.

`saturate<T>` accepts only concrete integer source and target types.

It requires a narrower target with the same signedness.

The compiler rejects identity conversions and conversion-category mismatches.

A module cannot use `bitcast` to cross an opaque nominal carrier boundary that
another module owns.

A checked generic integer conversion can become an identity after specialization.
The compiler erases that specialized conversion. It still checks the category
of each nonidentity specialization.

## Compile-time queries and required evaluation

`#size_of(T)` returns the type size as `core.quantities.ByteLength`.

`#align_of(T)` returns the type alignment as `core.quantities.Alignment`.

`#field_offset(T, field)` returns a declared field offset as
`core.quantities.ByteOffset`.

These queries require a complete compile-time layout and remain compile-time
constants. Use `alignment_bytes` and explicit representation conversions when
raw integer or ABI arithmetic is required. The domain types add no runtime
wrapper.

`#static_assert(condition, "message")` requires a compile-time `bool` value.

The compiler reports the supplied message when the condition is false.

`#if` selects one compile-time branch. The compiler checks only the selected branch.

An expression-form `#if` requires `else`. Each branch must contain one expression.

`#eval(function())` requires the compiler to execute an ordinary Wyst function
and materialize its result as an immutable module constant. The constant must
have an explicit type. The call must be direct, have no arguments, and appear
as the complete initializer.

The selected function must have an executable verified-IR body, an empty
effect bound and proof, `trusts(none)`, and no interactive protocol. Its result
must contain only closed value data. Integers, Booleans, floats, fixed arrays,
vectors, tuples, ordinary structs, nominal carriers, and bitstructs are
closed value data when their elements are also closed. Addresses, strings,
slices, function pointers, register maps, atomic storage, and `MaybeUninit`
are not valid results.

<!-- wyst-contract: check-pass -->
```wyst
module generated_table

fn make_table() -> [4]u32 effects(none) {
  return [3, 5, 8, 13]
}

const TABLE: [4]u32 = #eval(make_table())
```

The compiler first verifies provisional IR, executes the selected function in
deterministic reference state, rebuilds IR with the returned constant, and
verifies the final IR. It then executes the function again. The two results
must match. This check rejects dependencies between `#eval` constants.

Any non-return completion, unsupported operation, resource-limit failure, or
materialization failure is a compile error. The compiler never emits the call
as runtime work. A `#eval` result is not available to earlier `#if`, type-layout,
or `#static_assert` evaluation.
