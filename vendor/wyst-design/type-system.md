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
| `string` | Byte-string descriptor | 16 bytes | 8 bytes |

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

An unbound integer expression defaults to `i64`. Its value must fit in `i64`.

An unbound floating-point expression defaults to `f64`.

Integer literals can use decimal, binary, octal, or hexadecimal notation.

The prefixes are `0b`, `0o`, and `0x`. An underscore can separate digits.

Floating-point literals use decimal notation. They can include a decimal point or an exponent.

Character literals contain one byte. Use an escape for a non-ASCII byte.

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

### Fixed arrays

`[N]T` contains exactly `N` adjacent elements of type `T`.

Its alignment is the element alignment. Its size is `N` times the element size.

The length must be a compile-time value.

The compiler accepts `[_]T` only on a direct `const` or `var` binding.

The initializer must be a direct array literal.

For `[_]u8`, the initializer can also be a byte-string literal.

In these positions, `_` means the initializer element count.

`[value; N]` is a fixed-array repeat literal. `N` must be a compile-time
`u64`, must match the contextual fixed-array length, and currently cannot
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

The `data` field has type `@T`. The `len` field has type `u64`.

The `data` field starts at byte 0. The `len` field starts at byte 8.

A slice has size 16 and alignment 8.

Indexing accesses one element. Slicing creates another view.

Slice equality compares the `data` and `len` fields. It does not compare elements.

See [Memory Model](memory-model.md) for bounds and access rules.

### Strings

`string` is a two-word byte descriptor.

The `data` field has type `@u8`. The `len` field has type `u64`.

A string literal produces a `string` value unless an array context applies.

A string literal can initialize `[N]u8`. The compiler rejects more than `N` decoded bytes.

The compiler fills unused array bytes with zero.

`[_]u8` infers the decoded byte count from the string literal.

## Nominal scalar types

`type Name: Carrier` declares a distinct nominal scalar type.

The carrier must be a primitive integer or floating-point type.

The nominal type has the carrier size, alignment, and representation.

Two declarations with the same carrier still define different types.

An integer nominal scalar provides `MIN` and `MAX` compile-time members.

A compatible numeric literal can bind directly to a nominal scalar.

Operators preserve the nominal type. They do not mix different nominal types.

Use `bitcast<T>` to cross between a nominal scalar and its exact carrier.

<!-- wyst-contract: check-pass -->
```wyst
module manual.nominal_types

type Sequence: u64

const FIRST: Sequence = 1

fn next(value: Sequence) -> Sequence {
  return value + 1
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

Use `Name.Variant` for a payload-free variant.

Use `Name.Variant(arguments)` for a payload variant.

Use `.Variant` when an enum type is already expected.

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

Functions, structs, and enums can declare type parameters.

Each type parameter can have one optional constraint: either one built-in bound
or one static interface. Static interfaces and their carrier-ability rule are
defined in [Interfaces and Implementations](interfaces-and-implementations.md).

Generic type applications and explicit function applications must provide every
type argument. A direct generic function call may omit the entire list when
every type argument is uniquely recoverable by structurally matching the
call's statically known argument types against the function's parameter types.
Matching follows direct type-parameter occurrences and occurrences nested in
nominal generic carriers, pointers, fixed arrays, slices,
tuples, and vectors. Callable-signature inference is not part of this rule.

Inference does not use a call's result context, guess types for uncontextualized
literals, derive types from bounds, accept partial type-argument lists, or
provide default type arguments. If argument types do not determine one complete
list, write that list explicitly.

The closed bound set is:

| Bound | Admitted types |
|---|---|
| `integer` | Primitive integer types |
| `unsigned_integer` | Primitive unsigned integer types |
| `signed_integer` | Primitive signed integer types |
| `float` | Primitive floating-point types |
| `numeric` | Primitive integer or floating-point types |
| `scalar` | `bool` or a primitive numeric type |
| `address` | Typed addresses or function pointers |
| `bitstruct` | Declared bitstruct types |
| `payload_word` | `bool`, primitive integers, addresses, function pointers, or bitstructs |
| `fixed_layout_movable` | Fixed-layout values with ordinary move semantics |
| `copyable_discardable` | Fixed-layout values that permit copying and discarding |

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
| `bitcast<T>` | Cross an exact nominal carrier or bitstruct backing boundary |
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

## Compile-time type queries

`#size_of(T)` returns the type size in bytes.

`#align_of(T)` returns the type alignment in bytes.

`#field_offset(T, field)` returns a declared field offset in bytes.

These queries require a complete compile-time layout.

`#static_assert(condition, "message")` requires a compile-time `bool` value.

The compiler reports the supplied message when the condition is false.

`#if` selects one compile-time branch. The compiler checks only the selected branch.

An expression-form `#if` requires `else`. Each branch must contain one expression.
