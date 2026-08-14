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

## Public module groups

| Module | Current purpose |
| --- | --- |
| `core.collections` | `Option`, `Result`, query helpers, fallback helpers, and fatal extraction. |
| `core.outcomes` | Causal records, terminal outcomes, failure aggregation, and work or storage limits. |
| `core.quantities` | Nominal lengths, offsets, ranges, extents, addresses, counters, and generations. |
| `core.storage` | Caller-owned fixed buffers, arenas, explicit transitions, and accounting. |
| `core.strconv` | Integer byte-count and integer-to-byte conversion. |
| `core.fmt` | Bounded cursor-based ASCII, literal, and integer formatting. |

These groups permit whole-module, selective, and public imports. `core.checked`
is a compiler-owned private module for checked operation results. `core.arch`,
`core.environment`, `core.execution`, and `core.trap` expose restricted
compiler-authenticated operations through their documented import policies.

## `core.quantities`

The public nominal quantity types are:

- `ByteLength`, `ElementLength`, `ElementCapacity`, `ElementIndex`, and
  `ElementBoundary`;
- `ByteOffset`, `ElementOffset`, and `Alignment`;
- `PhysicalAddress`, `CounterSample`, `TickDuration`, `LogicalCpuId`, and
  `Generation`;
- `ByteRange`, `ElementRange`, `ByteExtent<A>`, `ElementExtent<A>`, and
  `PhysicalExtent`.

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

## `core.fmt`

`FormatCursor` attaches to caller-owned mutable bytes. `FormatCheckpoint`
records one position for rollback. `CapacityFailure`, `AsciiAppendFailure`, and
`RollbackFailure` report bounded write failures.

`IntegerSpec` combines `Prefix`, `IntegerPadding`, `Radix`, and `DigitCase`.
`DEFAULT_INTEGER_SPEC` selects decimal, lowercase digits, no prefix, and no
padding.

The public cursor functions are `cursor`, `cursor_written`, `cursor_remaining`,
`cursor_checkpoint`, `cursor_rollback`, `cursor_append_ascii`,
`cursor_append_literal`, and `cursor_append_integer`. Append operations return
the total written byte length. They leave the cursor within its attached
capacity and do not allocate.

## Storage API

[Storage and Allocation](storage-and-allocation.md) defines the current storage
model and transition groups. The exact public transition inventory is
[`core-storage-protocols.tsv`](catalogs/language/core-storage-protocols.tsv).
The compiler checks these functions as bundled Wyst source; it does not attach
semantics to unrelated user functions with similar names.
