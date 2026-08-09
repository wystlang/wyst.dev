---
title: "Debug and Unwind Information"
group: reference
section: compiler
order: 520
summary: "DWARF sections, debug entries, source lines, value locations, and unwind tables."
---

# Debug and Unwind Information

The AArch64 backend can emit DWARF debug information and `.eh_frame` unwind
tables.
Debug policy and unwind policy are separate artifact settings.

The object container is in [Artifact and Object Formats](artifact-and-object-formats.md).
Typed IR is in [Intermediate Representation](intermediate-representation.md).

## 1. Artifact policies

The `debug` manifest clause accepts these values:

| Policy | Emitted debug sections |
| --- | --- |
| `.none` | No `.debug_*` section |
| `.line_tables` | `.debug_line`, `.debug_line_str` |
| `.full` | `.debug_info`, `.debug_abbrev`, `.debug_line`, `.debug_line_str`, `.debug_str`, `.debug_loc`, `.debug_aranges` |

The compiler debug-policy default is `.full`.
A project artifact must state its debug policy.

The `unwind` manifest clause accepts `.none` or `.tables`.
The compiler unwind-policy default is `.none`.
`unwind .tables` emits `.eh_frame` independently of the debug policy.

The `frame_pointers` policy is also independent.
[ABI Specification](abi.md) defines `.minimal` and `.all` frame-pointer behavior.

## 2. DWARF format

The compiler emits DWARF 5 debug information.
It uses the DWARF32 unit-length form and 8-byte target addresses.
The byte order is little-endian.

The compilation unit uses these Wyst identifiers:

| Field | Value |
| --- | --- |
| `DW_AT_language` | `0x8000` (`DW_LANG_WYST`) |
| Normal calling convention | `DW_CC_normal` |
| AAPCS64 calling convention | `0x50` (`DW_CC_WYST_AAPCS64`) |

The Wyst language and AAPCS64 values are vendor extensions.
The producer name identifies `wync` without a compiler version.

The compiler emits `.debug_loc` location lists.
It does not emit the DWARF 5 `.debug_loclists` section.

## 3. Compilation units and declarations

The final executable contains one compilation unit for the built source
closure.
The unit gives its source name, compilation directory, producer, language,
address range, and line-table offset.

Full debug information can describe these entities:

- functions and labels;
- parameters and local variables;
- mutable globals and constants;
- base types and qualified types;
- addresses and function pointers;
- arrays and subranges;
- structs, fields, and bitfields;
- enums, variants, and payloads;
- lexical blocks;
- inline expansions;
- retained direct call sites.

Debug layout uses the same size, alignment, field offsets, and variant layout
as ABI lowering.
Debug types do not change the runtime representation.

An `extern "C"` callable uses the Wyst AAPCS64 calling-convention value.
A Native callable uses `DW_CC_normal`.

## 4. Functions and call sites

Each retained function with emitted code can have a `DW_TAG_subprogram` entry.
The entry contains the code range and source declaration location.
`pub` and export state determine the debugger-visible external flag.

Full debug information emits one `DW_TAG_inlined_subroutine` for each retained
source-required inline expansion.
The entry contains the physical range and the source call location.
Nested expansions refer to their inline parent.

Full debug information can emit `DW_TAG_call_site` for a retained direct call.
The entry contains the return PC and source call location.
It refers to the concrete callee when that callee has a debug entry.

The compiler does not claim complete call-site coverage.
Indirect calls do not name a concrete callee entry.
Calls removed by source-required inlining do not remain as physical call sites.

Compiler-generated interactive progress handlers use deterministic symbols.
The debugger can show a retained handler as an ordinary generated subprogram.
Debug information does not create a coroutine frame or exception runtime.

## 5. Source line tables

`.debug_line` uses a standard DWARF 5 line program.
`.debug_line_str` stores the referenced file and directory strings.

The compiler emits function-entry rows and retained backend source rows.
Rows are ordered by physical address.
Duplicate physical rows are removed.

A row identifies a source line.
The compiler does not guarantee one row for each source statement.
It does not guarantee a distinct column for each instruction.

The compiler normalizes source line endings for line calculation.
It supports `\n`, `\r\n`, and `\r` input.

Debug paths use reproducible normalized names.
The compiler does not embed the checkout's absolute path in reproducible
artifacts.

## 6. Variable locations

A debug variable can use one of these locations:

| Location | Meaning |
| --- | --- |
| Register | The value is in one AArch64 register. |
| Frame base | The value is in one stack slot. |
| Address | The value is at one final static address. |
| Location list | The value has different homes in different PC ranges. |
| Pieces | Aggregate components have separate homes. |
| None | No valid debugger location is available. |

An aggregate location can contain register pieces and frame-base pieces.
Padding can use an unavailable piece.
The debugger must not interpret padding as a source value.

`.debug_loc` stores contiguous PC ranges for a moving value.
The section can be empty when no value needs a location list.

Optimization can make a logical value unavailable.
The compiler then omits its location or uses `DebugLocation::None` internally.
The compiler does not promise reconstruction of every optimized value.

A `per_cpu` declaration has no fixed process address.
The compiler does not encode its `.percpu` template offset with `DW_OP_addr`.

## 7. Relocatable-object debug information

A `static_library` member can contain relocatable debug information.
The member uses `R_AARCH64_ABS64` for address-bearing debug records.

`.line_tables` emits relocatable line tables.
`.full` adds these records:

- one compile unit;
- subprogram ranges;
- supported global variables;
- retained direct call sites;
- retained inline expansions;
- address ranges.

The relocatable `.debug_loc` section is empty.
Relocatable full debug does not contain the final executable's complete local,
parameter, and type descriptions.

The final executable resolves all debug addresses.
It contains no debug relocation section.

## 8. Unwind tables

`unwind .tables` emits one `.eh_frame` common information entry.
It emits function information entries for eligible nonempty functions.

The unwind rows describe these frame changes:

- stack allocation and release;
- frame-pointer establishment;
- callee-saved register saves and restores;
- return-address location.

Naked functions do not receive compiler-generated unwind entries.
Exception-vector entries and naked trap-frame labels are unwind gaps.

Unwind tables support stack unwinding and backtraces.
They do not implement a Wyst language exception mechanism.

## 9. Current limits

The compiler does not emit these DWARF forms:

- split DWARF;
- `.debug_frame`;
- `.debug_macro`;
- `.debug_types`;
- `.debug_rnglists`;
- `.debug_loclists`;
- imported-module DIEs.

The compiler does not guarantee debugger display support for Wyst vendor
values.
The debugger must tolerate a value with no current location.

## 10. Deterministic output

The compiler orders debug entries, strings, inline entries, call sites, and
address ranges with stable keys.
The same canonical build inputs produce the same debug bytes.

Debug policy changes the selected sections.
Frame-pointer and scheduling policy can change locations and address ranges.
These policy changes can therefore change debug bytes.
