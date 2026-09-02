---
status: accepted
---

# Add exact byte-quantity literals

Wyst accepts exact byte quantities as a number with an attached, case-sensitive
byte unit. Decimal units use powers of 1,000. Binary units use powers of 1,024.
The unit set is `B`, `kB`, `MB`, `GB`, `TB`, `PB`, `EB`, `KiB`, `MiB`, `GiB`,
`TiB`, `PiB`, and `EiB`.

An integer magnitude can use any supported integer base. A fractional magnitude
must use decimal notation. The compiler converts the source text without
floating-point arithmetic and rejects a value that does not equal a whole number
of bytes. A byte quantity has the nominal compile-time type `ByteLength`. It is
valid only where a language contract measures bytes.

Unit spellings are contextual, not reserved. The formatter attaches the unit
to the magnitude. An ordinary floating-point literal remains an untyped float.
Exponent notation is not valid in a byte quantity. Numeric tokens use the
longest valid match, so `0x10B` remains a hexadecimal integer.

## Considered options

Raw integer byte counts do not state whether a value uses decimal or binary
multipliers. Constants such as `MIB` improve names but do not give the compiler
a distinct byte-length type. General physical-unit syntax adds dimensions that
the kernel does not need. Whitespace makes a byte quantity look like two values
and makes size expressions less compact. The closed unit set keeps byte
quantities distinct from other numeric suffixes, which remain invalid.

## Consequences

Kernel limits and storage sizes can state their units in source. The compiler
can reject a byte quantity in an address, index, general integer value, or
non-byte array length. Existing identifiers with unit spellings remain valid.
Existing integer and floating-point source keeps its meaning.

The normative rules are in [Type System](../../design/type-system.md#byte-quantities)
and [Formal Grammar](../../design/formal-grammar.md#lexical-forms). Compiler,
formatter, semantic, layout, and editor tests cover the accepted syntax and the
rejection rules.
