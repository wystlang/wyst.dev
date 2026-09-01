---
title: "Bundled Core Library"
group: reference
section: language
order: 165
summary: "Current sealed core modules, import policies, types, and functions."
---

# Bundled Core Library

Wyst bundles sealed core modules with the compiler. Their source is ordinary
checked Wyst source. Importing a core module does not add a runtime, allocate
memory, or start hidden initialization.

The exact machine-readable inventory is
[`sealed-core.tsv`](catalogs/language/sealed-core.tsv). Every public declaration
below has the `implemented` state in that inventory and exists in the bundled
source.

The compiler authenticates the inventory before it binds a bundled module.
Each catalog declaration must match one public source declaration by namespace,
source part, name, kind, and generic arity. A missing, extra, duplicate,
renamed, moved, or wrong-kind declaration fails the build.

Each declaration row has a `v1` surface digest. Its canonical input includes
the public declaration form, generic bounds, types, modifiers, contracts,
effects, trust, concurrency, and attributes. Aggregate input also includes
ordered fields or variants, carriers, and discriminants. Constant input
includes its type and canonical value expression. The digest excludes bodies,
private declarations, comments, whitespace, and source spans.

A digest mismatch reports the expected and actual digest. This report supports
a reviewed catalog update without accepting the changed surface.

## Public module groups

| Module | Current purpose |
| --- | --- |
| `core.collections` | `Option`, `Result`, authenticated forwarding, and fatal Result extraction. |
| `core.outcomes` | Causal records, terminal outcomes, failure aggregation, and work or storage limits. |
| `core.quantities` | Nominal lengths, offsets, ranges, extents, addresses, counters, and generations. |
| `core.storage` | Caller-owned fixed buffers, arenas, explicit transitions, and accounting. |
| `core.strconv` | Integer byte-count and integer-to-byte conversion. |
| `core.bytes` | Exact byte comparison and search. |
| `core.text` | Valid UTF-8 construction, checked slicing, comparison, and search. |
| `core.scan` | Scalar, cursor, and staged fixed-record scanning. |
| `core.fmt` | Bounded formatting into caller storage. |

These groups permit whole-module, selective, and public imports. `core.checked`
is a compiler-owned private module for checked operation results. `core.arch`,
`core.environment`, `core.execution`, and `core.trap` expose restricted
compiler-authenticated operations through their documented import policies.

## `core.collections`

`Option<T>` and `Result<T, E>` are ordinary sealed generic enums. Contextual
constructors such as `.Ok(value)` and `.Error(problem)` work when the complete
enum type is expected.

Only a materialization whose authenticated declaration identity is
`core.collections.Result` participates in stored `?` forwarding. A user enum
with `Ok` and `Error` variants is not a Result. Stored forwarding returns the
complete `.Error` payload unchanged or wraps it once through a declared
`Variant(from E)`. It does not allocate, add an effect, or use an interactive
failure outcome.

Only an authenticated `core.collections.Option` materialization participates
in absence forwarding. `.Some` continues with its payload and `.None` returns
the lexical authentic Option absence. The inner and outer payload types can
differ.

The collection module does not provide the former Option and Result inspection
or fallback helpers. Use `match` for local policy and postfix `?` for lexical
forwarding. `expect_or_trap` remains the explicit fatal Result extraction
policy.

## `core.outcomes`

`CausalIdentity` is an opaque nominal carrier. Use `causal_identity` and
`causal_identity_value` for its explicit public representation boundary.
`CausalOrdinal` and `WorkUnits` are numeric nominal types. `StorageAddress` is
a plain nominal carrier.

The remaining declarations define causal records, terminal results, bounded
failure aggregation, and exact failure details.

## `core.quantities`

The public numeric quantity types are:

- `ByteLength`, `Frequency`, `ElementLength`, `ElementCapacity`, `ByteOffset`,
  `ElementOffset`, and `TickDuration`.

These types bind literals and provide the numeric operations of their carriers.

The public identity and position carrier types are `ElementIndex`,
`ElementBoundary`, `PhysicalAddress`, `CounterSample`, `LogicalCpuId`, and
`Generation`. They provide nominal separation and same-type equality. Code
must use an explicit checked operation or representation crossing for numeric
work.

The public structured quantity types are:

- `Alignment`;
- `ByteRange`, `ElementRange`, `ByteExtent<A>`, `ElementExtent<A>`, and
  `PhysicalExtent`.

`Alignment`, the ranges, and the extents are opaque structs with named public
projection functions.

The public projection functions are `alignment_bytes`, `byte_range_lower`,
`byte_range_upper`, `element_range_lower`, `element_range_upper`,
`byte_extent_base`, `byte_extent_length`, `element_extent_base`,
`element_extent_length`, `physical_extent_base`, and `physical_extent_length`.
All are effect-free.

## `core.strconv`

`DigitCase` selects lowercase or uppercase alphabetic digits. `Radix` selects
binary, octal, decimal, or hexadecimal conversion. `IntegerWriteFailure`
reports the exact required capacity.

The public functions are:

- `integer_required<T: integer>` returns the bytes required for one value.
- `integer_max_bytes<T: integer>` returns the maximum bytes for one integer type.
- `try_write_integer<T: integer>` writes into caller storage or returns
  `IntegerWriteFailure`.
- `write_integer<T: integer>` writes when the destination has at least 65 bytes.

These functions are effect-free and do not allocate.

## `core.bytes` and `core.text`

`core.bytes` operates on raw `[]u8` views. It provides `equal`, `starts_with`,
`ends_with`, `find`, and `find_byte`. `find` and `find_byte` return the first
matching byte offset. An empty needle matches at offset zero.

`core.text.from_bytes` validates a complete byte view as UTF-8 and returns a
`string` view of the same storage. `Utf8Failure` reports the first invalid byte
offset and a compact reason. `TextSliceFailure` distinguishes a reversed
range, an out-of-bounds byte offset, and an invalid lower or upper UTF-8
boundary.

The text content functions are `equal`, `starts_with`, `ends_with`, and
`find`. They are byte-exact. They do not normalize Unicode, fold case, or use a
locale. Search uses a deterministic left-to-right scan with linear candidate
progress and a worst-case cost proportional to the input length multiplied by
the needle length. All byte and text operations are effect-free and allocate
nothing.

## `core.scan`

`integer<T>` parses one complete integer in a selected `Radix`. It accepts an
optional minus sign only for signed types. It rejects a plus sign, radix
prefix, whitespace, invalid digit, trailing input, and overflow. `boolean`
accepts only the complete lowercase spellings `true` and `false`.

`ScanCursor` is an opaque, discardable, `no_copy` string view plus a byte
offset. `ScanCursor.open`, `offset`, `remaining`, `expect`, `integer`,
`boolean`, `take_until`, and `finish` support explicit protocol parsing. A
failing operation does not change the cursor offset. `take_until` stops before
the first exact nonempty delimiter. `finish` requires complete input
consumption.

`read<Record>(input, comptime template)` defines a staged fixed-record scan.
`Record` must be a concrete named tuple with at least two fields. Supported
fields are `string`, `bool`, built-in integers, and integer-backed numeric
nominal types. Each field must occur exactly once. String and Boolean fields
accept the default or `:s` and `:b` specifiers. Integers accept the default
decimal form or `:b`, `:o`, `:d`, `:x`, and `:X`. Doubled braces spell literal
braces. Adjacent captures are invalid because they have no literal boundary.

The scan consumes the complete input. A string capture ends at the first
following literal and remains a view of the input. The compiler materializes a
fixed typed function for each scan schema; runtime code contains no template,
field-name table, parser descriptor, allocator, or indirect dispatch.

## `core.fmt`

`FormatCursor` attaches to caller-owned mutable bytes. `FormatCheckpoint`
records one position for rollback. `CapacityFailure`, `AsciiAppendFailure`, and
`RollbackFailure` report bounded write failures. `FormatFailure` reports a
required-length overflow or insufficient capacity for one composed write.
`AsciiAppendFailure.InsufficientCapacity` accepts direct forwarding from
`CapacityFailure`.

`IntegerSpec` combines `Prefix`, `IntegerPadding`, `Radix`, and `DigitCase`.
`DEFAULT_INTEGER_SPEC` selects decimal, lowercase digits, no prefix, and no
padding.

The public cursor functions are `cursor`, `cursor_written`, `cursor_remaining`,
`cursor_checkpoint`, `cursor_rollback`, `cursor_append_ascii`,
`cursor_append_literal`, `cursor_append_integer`, `cursor_written_bytes`, and
`cursor_written_string`.
Append operations return the total written byte length. They leave the cursor
within its attached capacity and do not allocate. `cursor_written_bytes`
returns the exact written prefix of the cursor backing storage.
`cursor_written_string` validates the same prefix as UTF-8 and returns a view
of the same storage.

`write<Args...>` accepts a compile-time template and a final heterogeneous
value pack. It supports strings, integers, Booleans, ordinary and volatile
typed addresses, named or positional placeholders, integer radix and width
options, and escaped braces. A Boolean uses the default form and writes `true`
or `false`. An address requires `:p` and writes lowercase, fixed-width
hexadecimal with a `0x` prefix. MMIO address formatting remains invalid because
it would erase authenticated mapping intent. Named and positional placeholders
cannot be mixed. Bare identifier arguments supply their names; use
`label = expression` to name another expression.

`write` computes the exact complete length before it modifies the cursor or
the backing bytes. It writes only when the full record fits. The specialized
runtime function has fixed parameters and contains no template parser, pack
descriptor, allocation, or indirect formatting dispatch.

## Storage API

[Storage and Allocation](storage-and-allocation.md) defines the current storage
model and transition groups. The exact public transition inventory is
[`core-storage-protocols.tsv`](catalogs/language/core-storage-protocols.tsv).
The compiler checks these functions as bundled Wyst source; it does not attach
semantics to unrelated user functions with similar names.

The public owner-qualified storage transitions are `FixedBuffer.attach`,
`FixedBuffer.reserve`, `DestinationReservation.initialize_value`,
`InitializedDestination.finish`, `WrittenRegion.view`, `Arena.attach`,
`Arena.allocate_value`, `Arena.checkpoint`, `Arena.rewind`, `Arena.detach`, and
`Arena.abandon_storage`. These identities replace their former flat spellings.
No compatibility aliases exist.
