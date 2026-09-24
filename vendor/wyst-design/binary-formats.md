---
title: "Binary Formats"
group: reference
section: language
order: 170
summary: "Sequential wire schemas, dependent sizes, checked codec operations, and caller-provided storage."
---

# Binary formats

Implementation status: the sequential profile is being integrated. Release acceptance
remains pending the complete compiler, editor, native, and consumer gates.
This chapter owns the accepted contract. The experiment and grammar proposals are
historical evidence; they do not extend this contract.

A `binary` declaration describes a sequential wire format. The declaration is a
schema, not a native type or a memory overlay. The compiler checks the schema and
produces ordinary native value types and checked decode and encode operations.
The generated operations use the same verification rules as authored Wyst.

<!-- wyst-contract: check-pass -->
```wyst
module binary_samples

binary Samples {
  width: u8 where(width >= 1 && width <= 64)
  count: u16(endian = .big)
  values: [count]u64(
    bits = width,
    bit_order = .msb_first,
    pad_to = 1B,
    fill = 0,
  )
}
```

The order of fields is the wire order. A repeated field has a checked runtime
count. `[count]u64` in a schema does not create a native fixed array or a value
generic. A count may depend on captured schema parameters and earlier scalar
fields, including scalar fields of an earlier nonrepeated child.

## Declarations and scopes

A declaration has optional `pub`, a name, an optional parameter list, optional
predicates before its body, fields, and optional predicates after its body.
Schema parameters use `name: Carrier`. They do not accept native parameter
modes, `comptime`, `noescape`, packs, register placement, or type generics.
Attributes, effects, and return contracts are not schema declaration syntax.

A field has a name, a shape, one optional argument list, an optional fixed value,
and zero or more predicates, in that order. The argument list follows the whole
shape. Commas between fields are optional. Line breaks do not end a field.
The exact productions are in [Formal Grammar](formal-grammar.md).

`binary` and `where` are contextual words. `where` starts a predicate only when
followed by `(`. Names such as `where`, `bits`, `pad_to`, and `fill` remain valid
field names. The compiler rejects captured parameter names `pad_to` and `fill`,
which conflict with the common field arguments.

Before-body predicates can use captured parameters and visible constants. Field
arguments can also use earlier scalar fields. A field predicate can additionally
use that field's scalar value. After-body predicates can use all available scalar
fields. Later fields are not visible to earlier expressions. A child receives
only its explicit arguments; it cannot read its parent's scope.

<!-- wyst-contract: check-pass -->
```wyst
module binary_children

binary Window {
  lower: u32(endian = .little)
  upper: u32(endian = .little)
} where(upper >= lower)

binary RegEntry(address_cells: u32, size_cells: u32) {
  address_bits: bits(length = widen<u64>(address_cells) * 32, bit_order = .msb_first)
  length: bits(length = widen<u64>(size_cells) * 32, bit_order = .msb_first)
}

binary RegList(address_cells: u32, size_cells: u32, entries: u32)
  where(address_cells != 0 || size_cells != 0)
{
  values: [entries]RegEntry(address_cells = address_cells, size_cells = size_cells)
}
```

Shape expressions and predicates are checked, pure expressions. The accepted
subset contains integer and byte-quantity literals, booleans, visible constant
and scalar references, earlier scalar field paths, supported unary and binary
operators, and explicit widening conversions. It does not contain arbitrary
calls, indexing, address operations, mutation, aggregate construction, or type
queries. Arithmetic and conversion requirements remain explicit and checked. Division
in counts, widths, lengths, child shape arguments, and padding must be exact.
Fixed integer values and predicates use checked integer quotient division:
`field: u8 = 7 / 2` constrains the field to `3`. Overflow and zero divisors fail
in every context.

## Integer fields and opaque bits

Unsigned integer carriers range from `u1` through `u64`; signed carriers range
from `i2` through `i64`. A byte-mode field must have a width divisible by eight.
A single-byte field does not take an endian argument. A wider byte-mode field
requires `endian = .big` or `endian = .little`.

A bit-mode integer requires `bit_order = .msb_first` or `.lsb_first`. Its optional
`bits` argument selects a positive width no greater than the carrier width.
Signed values must fit that signed width. Endian and bit-order arguments select
separate modes and cannot be combined. A transition between bit orders, or from
bit mode to byte mode, requires a byte boundary.

`bits(length = count, bit_order = order)` describes an opaque logical bit
sequence. Its decoded storage is a caller-provided byte pool plus an explicit
logical bit count. The final byte's unused bits are zero after decode. Encode
ignores unused source bits and preserves output bits outside the encoded range.
This value is materialized storage; it is not a borrowed view of encoded input.

Primitive arguments are labeled. Child arguments may be positional and then
labeled. Unknown, duplicate, and inapplicable arguments are errors. A fixed
scalar value, such as `token: u32(endian = .big) = 3`, is a compile-time constraint:
decode validates it and encode emits it. It is not a default value.

## Whole-field padding

`pad_to` and `fill` must appear together. `pad_to` is a positive compile-time
`ByteLength`; `fill` is the literal `0` or `1`. The field must start at a byte
boundary. Padding extends the complete field extent to a multiple of `pad_to`.
It does not align the field against the enclosing record's origin.

<!-- wyst-contract: check-pass -->
```wyst
module binary_property

binary FdtProperty {
  token: u32(endian = .big) = 3
  length: u32(endian = .big)
  name_offset: u32(endian = .big)
  value: [length]u8(pad_to = 4B, fill = 0)
}
```

The `value` array is padded once. To pad each repeated element, put the padding
inside a child schema and repeat the child. Decode rejects an incorrect padding
bit. Predicates after a padded child run after its complete extent, so a late
predicate failure must preserve every destination pool.

## Generated native API

For schema `Name`, the compiler produces `NameValue`, `decode_Name`, and
`encode_Name`. It also produces `NameDestination` when the schema needs output
pools. These identities follow the schema's module visibility. A schema cannot
be used where a native type is required; use its generated native value type.

For `Samples`, the public shapes are equivalent to:

<!-- wyst-contract: check-pass -->
```wyst
module binary_native_values

struct SamplesDestination { values: []u64 }
struct SamplesValue {
  width: u8
  count: u16
  values: []u64
  consumed_bits: u64
}
```

The checked operation shapes are:

```text
fn decode_Samples(
  input: mut noescape []u8,
  start_bit: u64,
  input_bits: u64,
  work_limit: u64,
  destination: mut noescape SamplesDestination,
) -> Result<SamplesValue, core.binary.Failure> from destination on .Ok effects(none)

fn encode_Samples(
  value: mut noescape SamplesValue,
  start_bit: u64,
  output_bits: u64,
  work_limit: u64,
  output: mut noescape []u8,
) -> Result<u64, core.binary.Failure> effects(none)
```

The declarations above show signatures, not function definitions. Decode returns
the consumed bit count in the root value. Encode returns the number of bits
written. Positions are absolute bit offsets in the input or output slice; the
bit extent is measured from `start_bit` and can be smaller than the remaining
backing byte capacity.

Captured schema parameters appear in decode's parameter list after `work_limit`
and before `destination`, in declaration order. They also appear by their authored
names in `NameValue`; encode reads and rechecks those snapshots. A schema without
pools has no destination type or decode destination argument and returns no
borrowed storage relationship. Returned pool slices borrow only the caller's
destination storage. The input is not retained.

If a captured parameter conflicts with an actual decode envelope parameter or
starts with the generated local prefix `__wg_binary_`, its native call label becomes `schema_parameter_N`, where `N` is its zero-based
ordinal. The compiler appends `_` until the label avoids envelope names, all
authored parameter names, and earlier generated aliases. The snapshot field and
child argument label keep the authored name.

## Materialized pools and names

All variable storage comes from flat caller-provided pools. Repeated child
records use scalar descriptors and separate payload pools. Descriptors do not
contain slices. A nonrepeated child retains its nested scalar shape. Only the
root value has `consumed_bits`. An empty child needs no zero-sized descriptor,
but each repetition still consumes a work unit.

A unique pool leaf keeps its authored name. Colliding leaves use
`pool_values_`, `pool_descriptors_`, or `pool_bytes_`, followed by the length-prefixed
root and occurrence path. For example, the encoded path of `Rows.left.values` is
`4_Rows_4_left_6_values`. Name assignment considers all candidates together and
does not depend on traversal or insertion order.

A child descriptor prefers the root name followed by the child name when that
name is unique. Ambiguous or repeated child occurrences use `descriptor_` and the
encoded occurrence path. A descriptor with one payload pool uses `first`; one
with multiple pools uses `first_values_`, `first_descriptors_`, or `first_bytes_`
plus the encoded path. Opaque bit descriptors retain `first` and `bit_length`.
A direct scalar or captured count, including a widening of that scalar, reuses
its existing snapshot. Other opaque lengths have an explicit `bit_length`
field, with `bit_length_bytes_` plus the path when several computed lengths occur.

Authored names that conflict with required native fields such as `consumed_bits`,
descriptor `first`, fallback fields, or generated native declaration identities
are errors. The compiler does not silently rename authored fields.

## Failure and work contract

Both operations validate before writing. Every failure leaves all destination
pools or output bytes unchanged, including unused capacity and bits outside the
requested extent. Capacity, arithmetic, work, overlap, fixed-value, predicate,
and padding failures use the same checked result path.

`core.binary.Failure` identifies `Incomplete`, `Malformed`, `Arithmetic`, `Limit`,
`Capacity`, or `Overlap`, together with a field ID, flattened element ordinal,
and absolute bit offset. Field ID zero denotes the operation envelope. Source
locations on generated checks point back to the authored schema field or
predicate. Failure ordering is deterministic: envelope extent arithmetic precedes
extent checks, address-range arithmetic precedes overlap checks, and root work
precedes field traversal.

Fields follow declaration order. Within a field, expression arithmetic precedes
the field and element work charges, destination capacity, complete primitive
extent, decoded value and predicates, and whole-field padding. Record predicates
run at their declared boundaries. A repeated scalar field checks its full pool
count after the field charge and before the first primitive charge. Nested leaf
pools check cumulative capacity as each child count becomes known.

Primitive failures report the primitive's start, including incomplete input.
Invalid padding reports its first invalid bit. A padded field that starts off a
byte boundary reports the field start; this check still runs at the padding
boundary, after earlier field checks. Root repeated-field padding uses element
zero. Repeated-record leaf padding uses the cumulative leaf end ordinal;
scalar-child padding uses the child ordinal.

Encoding rejects both insufficient and excess source counts as `Malformed`;
`Capacity` identifies insufficient destination storage. Final checks for excess
nested source-pool data run after traversal, in pool declaration order, and
report the final bit cursor. An opaque pool reports the flattened schema
occurrence count, not the number of native bytes consumed.

Caller storage must satisfy the ordinary exclusive-loan rules and the runtime
range checks. Writable pools are disjoint from input bytes, other writable pools,
and live destination and input-slice descriptors. Writable encoded bytes are
disjoint from the value, its source pools, and the live output-slice descriptor.
The operations check complete supplied ranges, including spare capacity.

Work is explicitly bounded. The counter charges the root, fields, primitive
visits, logical bits, and padding. A successful preflight permits a second pass
with no additional traversal beyond the established bound. Empty repetitions
still cost work. No hidden allocation, unbounded index construction, unchecked
address operation, or additional trust is part of generated codecs.

## Compiler resource limits

The compiler bounds schema expansion separately from runtime codec work. A checked
schema graph has at most 100,000 projected expansion work units across its roots.
This count includes record, parameter, and field visits; expressions and reference
paths; copied failure paths; native pools; and pool-pair checks for both operations.
Shared child schemas are checked before their paths and native storage are expanded.
A runtime repetition count does not multiply this compiler work count.

Lowering has a separate limit of 100,000 generated node identities across the
module. Exceeding either limit produces E0254 and publishes no partially lowered
module. Schema and expression nesting must also fit the compiler's 64-level limit.
These limits apply to local and authenticated imported schemas. They do not change
runtime counts, output capacities, or the caller's `work_limit`.

## Scope limits

The sequential profile includes dependent counts and widths, nested and repeated
children, opaque bits, fixed scalar values, inline predicates, and whole-field
padding. It does not provide encoded borrowed views, implicit cursor state,
random-access offset graphs, generated protocol indexes, alternate or recursive
layouts, or automatic checksum and protocol validation.

An IPv4 schema can check authored length and header predicates. It does not
validate a checksum unless that operation is explicitly implemented outside the
schema. An FDT record schema does not establish tree token order or validate an
offset target. The caller remains responsible for those protocol rules.
