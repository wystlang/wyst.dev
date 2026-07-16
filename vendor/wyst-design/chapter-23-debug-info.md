---
title: "Chapter 23: Wyst Debug Information"
group: chapter
chapter: 23
order: 23
summary: "Debug information goals, DWARF sections, DIEs, locations, and determinism."
---

# Chapter 23: Wyst Debug Information

Debug information is divided into a required source floor and richer contracts
for emitted DWARF sections, variable locations, type DIEs, and inline
expansion.

> **Canonical scope.** The DWARF 5 format Wyst emits — section set, DIE
> vocabulary, location-list policy, calling-convention encoding, and the
> determinism contract. The source floor is described in §11.1.1; the rest of
> this chapter defines the full emission target for [appendix-a-ir.md §17](appendix-a-ir.md)'s
> source-location attributes. The section catalog overlaps with
> [chapter-16-object-format.md §3](chapter-16-object-format.md).

---

## Debug Information

Debug information — mappings from instruction addresses to source file, line
number, variable names, and types — is specified by this part. The
deterministic source floor defines the minimum source-location contract; richer
statement rows, variables, types, inline expansion DIEs, and location lists are
defined by the full contract below. The emission contract is pinned here so the IR's
location-attribute representation (see [appendix-a-ir.md §17](appendix-a-ir.md)) can be designed
against a fixed target.

---

## 11.1 Debug-Info Floors

The reserved section names (`.debug_info`, `.debug_line`, `.debug_str`,
`.debug_loc`, `.debug_abbrev`, `.debug_line_str`, `.debug_aranges` — see
[chapter-16-object-format.md §3](chapter-16-object-format.md)) are present in the canonical section
table. The source floor emits the deterministic symbol and source-location
subset; richer location lists and DIE payloads belong to the full contract.

### 11.1.1 Required Floors

The full DWARF contract below remains the canonical target. Two explicit
floors define what a binary may claim:

| Floor        | Required output                                                                                                                                                                                    | Claim allowed                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Symbol floor | Deterministic `.symtab` and `.strtab` entries for public and private function starts.                                                                                                              | Debugger-visible function names and address ranges. |
| Source floor | Symbol floor plus deterministic DWARF 5 `.debug_line`, `.debug_line_str`, `.debug_info`, `.debug_abbrev`, `.debug_str`, and `.debug_aranges` for compile units, subprograms, and source line rows. | Debugger-visible source locations.                  |

If an output claims source locations, it must implement the source floor. If
it implements only the symbol floor, notes must say
"function symbols" rather than "source locations." Variable location lists,
frame unwinding data, inline expansion DIEs, watch identity, trace manifests,
and remote trace transports are outside the source floor.

The source floor emits deterministic `.symtab`/`.strtab` function symbols and
non-`ALLOC` DWARF sections: `.debug_line_str`, `.debug_str`, `.debug_abbrev`,
`.debug_info`, `.debug_line`, and `.debug_aranges`. It emits one compile unit for
the source file, subprogram DIEs for emitted functions, file metadata, a text
address range, function-entry line rows, and backend source rows for emitted
values and terminators when machine-code offsets are available. Variable
locations, type DIEs, inline expansion DIEs, column-accurate stepping, and the
full statement-row policy are outside the source floor.

---

## 11.2 Format and Dialect

- **DWARF version:** strictly DWARF 5. No GNU extensions. No DWARF-4
  fallback. The `version` field of every `.debug_info` compilation-unit
  header is `5`.
- **DWARF format size:** 32-bit DWARF (4-byte section offsets, not the
  64-bit DWARF variant). Wyst binaries do not exceed 4 GiB of debug data;
  the 32-bit format halves the size of every section-relative reference.
- **Endianness:** little-endian, matching the AArch64 target.
- **Address size:** 8 bytes.
- **Segment selector size:** 0 (no segmentation on AArch64).

---

## 11.3 Section Set

The locked debug sections are:

| Section           | Purpose                                         | Required    |
| ----------------- | ----------------------------------------------- | ----------- |
| `.debug_info`     | Compilation-unit DIE tree                       | Always      |
| `.debug_abbrev`   | Abbreviation tables referenced by `.debug_info` | Always      |
| `.debug_line`     | Line-number program (PC → file:line:column)     | Always      |
| `.debug_line_str` | String table for `.debug_line` (DWARF-5 split)  | Always      |
| `.debug_str`      | String table for `.debug_info` DIEs             | Always      |
| `.debug_loc`      | Location lists for variables whose home changes | When needed |
| `.debug_aranges`  | Address-range table for fast PC → CU lookup     | Always      |

`.debug_aranges` adds ~16 bytes per compilation unit and is cheap
insurance for `wyst explain <addr>` and debugger PC lookups: O(log N)
range search instead of scanning every CU's `.debug_info`.

**Outside the source floor:**
`.debug_frame` / `.eh_frame` (call-frame information / CFI),
`.debug_macro`, `.debug_types` (type units / split DWARF),
`.debug_rnglists` and `.debug_loclists` in their offset-list-header forms
(the source-floor contract uses the inline forms in `.debug_loc`).

**CFI rationale for deferral:** AAPCS-Wyst already mandates a frame
record (`stp x29, x30, [sp, #-N]!`) in any non-leaf function (see
[chapter-15-abi-spec.md §3.3](chapter-15-abi-spec.md)). A future debug-build
mode will also mandate frame records in leaf functions. Backtraces can walk the
`x29` chain directly without consulting CFI whenever those frame records are
present. Wyst has no exceptions, so `.eh_frame` provides nothing Wyst needs.
Leaf functions that omit the frame record are the only current case CFI would
help. CFI may be added if optimized leaf prologues become useful.

---

## 11.4 DIE Vocabulary (Closed Set)

The compiler emits **only** the tags listed below. An emitted DIE that
does not appear in this table is a compiler bug.

| DWARF tag                   | Wyst source construct                                                              |
| --------------------------- | --------------------------------------------------------------------------------- |
| `DW_TAG_compile_unit`       | Per-source-file root; one per imported module                                     |
| `DW_TAG_subprogram`         | Function declaration (`name :: () {...}`) and `label` declarations              |
| `DW_TAG_inlined_subroutine` | One per `#inline` expansion site (see §11.7)                                      |
| `DW_TAG_lexical_block`      | `{ ... }` block introducing new bindings                                          |
| `DW_TAG_variable`           | Local or global named variable                                                    |
| `DW_TAG_formal_parameter`   | Function parameter                                                                |
| `DW_TAG_base_type`          | Scalars: `u8`/`u16`/`u32`/`u64`, `i8`/…/`i64`, `bool`, `f32`, `f64`               |
| `DW_TAG_pointer_type`       | `@T` (address type)                                                               |
| `DW_TAG_const_type`         | Immutable binding (`name :: T = ...`, `name ::= ...`)                             |
| `DW_TAG_volatile_type`      | `@volatile T` and the volatile access contract inside `@mmio T`                   |
| `DW_TAG_typedef`            | `type Name :: T` aliases                                                          |
| `DW_TAG_structure_type`     | `struct { ... }`                                                                  |
| `DW_TAG_member`             | Struct field and bitstruct bit-field member                                       |
| `DW_TAG_array_type`         | `[N]T`, `[T:N]`, `[]T` slice (slice modeled as struct of `data`+`len` — see §11.5) |
| `DW_TAG_subrange_type`      | Bound of an array DIE (`DW_AT_count = N`)                                         |
| `DW_TAG_enumeration_type`   | C-style `enum`                                                                    |
| `DW_TAG_enumerator`         | C-style enum variant                                                              |
| `DW_TAG_variant_part`       | Tagged-union `enum` discriminator                                                 |
| `DW_TAG_variant`            | Tagged-union `enum` payload variant                                               |
| `DW_TAG_subroutine_type`    | Function pointer type (`(args) -> ret`, `[aapcs] (args) -> ret`)                  |

No other tags. Specifically: no `DW_TAG_namespace` (Wyst has no nested
namespaces), no `DW_TAG_class_type`, no `DW_TAG_template_*`, no
`DW_TAG_imported_*` (the IR has already flattened imports per
[appendix-a-ir.md §3](appendix-a-ir.md)).

---

## 11.5 Attribute Encoding Rules

These are the non-obvious DWARF mappings — anywhere DWARF gives a choice
of attribute, Wyst picks one and uses only that form.

**Bitstruct fields.** Members of a `bitstruct Name: Backing` are emitted with
`DW_AT_data_bit_offset` + `DW_AT_bit_size` (DWARF 5 form). The deprecated
`DW_AT_bit_offset` is not used. The containing DIE is a
`DW_TAG_structure_type` whose `DW_AT_byte_size` is the backing
`size_of(Backing)`. The member's type is its declared carrier type.

**Slices.** A `[]T` slice is emitted as a `DW_TAG_structure_type` with two
members: `data : @T` (offset 0) and `len : u64` (offset 8), matching the
ABI layout. The struct's `DW_AT_name` is `"[]T"` with `T` substituted.

**Payload enums.** A Wyst `enum` with payload variants emits a
`DW_TAG_structure_type` named after the enum with byte size 16. It contains
`tag` at byte offset 0 with the enum's discriminator type. It also contains
`payload` at byte offset 8 with the shared payload word type. Debuggers must
use the source-level variant metadata to interpret which payload-word type is
active for a given tag; arbitrary aggregate, slice, floating-point, and nested
enum payloads are rejected by the language. Padding and inactive payload bytes
are not source-level values.
Payload-less enums emit a `DW_TAG_enumeration_type` with byte size equal to the
discriminator type.

**Address types.** `@T` emits `DW_TAG_pointer_type` with
`DW_AT_type` referencing the DIE for `T`. `@volatile T` and `@mmio T` add a
`DW_TAG_volatile_type` qualifier wrapping the `T` DIE before the pointer-type
DIE. The pointer DIE has `DW_AT_address_class = 0` (generic data). `@mmio T`
does not imply a DWARF address class or architectural Device-memory proof; MMIO
intent remains a Wyst source/report fact.

**Function-pointer calling convention.** `DW_TAG_subroutine_type`
carries `DW_AT_calling_convention = DW_CC_normal` for `[wyst]` (the
default) and `DW_AT_calling_convention = 0x50` for `[aapcs]`. Wyst reserves
`0x50` from the DWARF user extension range as `DW_CC_WYST_AAPCS64`.
The emitter also records an exact fallback/interoperability string in
`DW_AT_description`: `"wyst"` for the default convention and `"aapcs64"` for
`[aapcs]`. This is the one place Wyst diverges from strict standard DWARF;
the divergence is bounded to one attribute on one tag.

**`#addr_of` location.** A variable declared at module scope has its
location expressed as `DW_AT_location = DW_OP_addr <symbol>`, which the
emitter realizes via the same `ABS64` relocation already used for data
pointers ([chapter-16-object-format.md §5](chapter-16-object-format.md)).

---

## 11.6 Line Number Program

`.debug_line` emits a standard DWARF-5 line number program with:

- **One row per source statement.** `is_stmt` is set on the row that
  begins each statement, cleared on rows that continue one (e.g. lines
  emitted from operand evaluation).
- **No `op_index` games.** AArch64 has no VLIW packing; `op_index` is
  always 0 and the standard opcode `DW_LNS_set_op_index` is not used.
- **No views, no logical/actual columns.** The `view` extension is GNU,
  not DWARF 5. `.debug_line` rows are physical-PC rows only.
- **End-sequence at function boundaries.** Each `DW_TAG_subprogram` ends
  with `DW_LNE_end_sequence`; the program is restarted at the next
  function. No cross-function line ranges.

Line numbers use the lexical newline normalization from
[appendix-b-grammar.md §1.1](appendix-b-grammar.md): `\r\n`, `\n`, and `\r`
each advance the source line by exactly one, and `.debug_line` rows must use
those normalized logical line numbers while preserving byte-accurate source
spans elsewhere.

The file table uses the DWARF-5 `.debug_line_str` indirection: file names
are interned in `.debug_line_str` and referenced by offset, not stored
inline in `.debug_line`.

---

## 11.7 Inline Expansion

`#inline` expansions emit `DW_TAG_inlined_subroutine` DIEs. Each carries:

- `DW_AT_abstract_origin` → the `DW_TAG_subprogram` DIE of the inlined
  function (which is also emitted, as a "concrete out-of-line" copy if
  the function is also called normally, or as an abstract instance if
  every use is inlined).
- `DW_AT_low_pc` / `DW_AT_high_pc` covering the inlined code.
- `DW_AT_call_file` / `DW_AT_call_line` / `DW_AT_call_column` at the
  source site of the call expression.

This lets debuggers display "inlined from `foo()` at `bar.wyst:42`" in
backtraces and step through inlined code as if it were called. The cost
is one DIE per inline site. Since `#inline` is explicit in Wyst (see
[§2.7.1](#)), the user knows where these appear and the count is
bounded by the source.

Inlining a helper into a `vector_table` slot (see §2.7.1) emits the same DIEs;
debuggers see the inline tree as it actually was at emission time.

---

## 11.8 Location Lists

Variables whose storage location does not change across their lifetime
get a single `DW_AT_location` with one operation:

- Register-only: `DW_OP_reg<N>` for an unspilled SSA value, or for a
  `#pin(xN) var` that the allocator successfully pinned (see
  [appendix-a-ir.md §11](appendix-a-ir.md)).
- Stack-only: `DW_OP_fbreg <offset>` for a value that lives on the stack
  from entry to exit.

Variables that move between register and stack across their lifetime get
a `DW_AT_location` referencing a location list in `.debug_loc`. The list
is built from the register allocator's allocation ranges (per
[appendix-a-ir.md §11](appendix-a-ir.md)) and contains one entry per contiguous range with the
same storage. **No `DW_OP_piece`.** A single Wyst variable is not split across
multiple registers; location pieces are therefore outside the model.

Spilled values use `DW_OP_fbreg <offset>` where `<offset>` is the spill
slot's offset from the frame pointer (`x29`). Slot offsets are
deterministic per [appendix-a-ir.md §11.5](appendix-a-ir.md).

---

## 11.9 Determinism

Debug info is part of the bit-for-bit reproducibility contract
([chapter-01-language-design.md "Reproducibility Model"](chapter-01-language-design.md)).
Determinism rules:

- **DIE order:** source declaration order within a compilation unit.
  Type DIEs are emitted in first-use order (the order the type is first
  referenced by another DIE), not in source-declaration order, so that
  type DIEs precede the DIEs that reference them.
- **Abbreviation table:** abbreviations are added in first-use order;
  the abbreviation code assigned to a tag/attribute combination is the
  next integer at the point of first encounter.
- **String tables:** strings interned in first-encounter order. Identical
  strings are deduplicated.
- **Line program:** full-contract statement rows are in source-text order; no
  reordering by PC even when codegen has reordered basic blocks
  (`.debug_line`'s sequence model handles out-of-order PCs natively). The
  source floor emits backend rows in final function emission order.
- **`.debug_aranges`:** range tuples in compilation-unit order, matching
  the order CUs appear in `.debug_info`.

The same source input manifest, compiler version, build optimization mode,
target, and selected scheduling policies produce byte-identical debug sections.

---

## 11.10 Priority

Medium. Debug information is not required for correct operation of
firmware on target hardware. It is, however, a significant productivity
gap. Without it, diagnosing a crash on real hardware requires manual
correlation of register dumps against a disassembly listing, with no
visibility into Wyst variable names, types, or source locations. This
becomes painful quickly in any project of meaningful size.

Debug information should be available before Wyst is used for production
firmware development. The spec above is the design target.

---
