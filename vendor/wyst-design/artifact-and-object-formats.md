---
title: "Artifact and Object Formats"
group: reference
section: binary-interfaces
order: 420
summary: "Static AArch64 ELF executables, static libraries, sections, symbols, and relocations."
---

# Artifact and Object Formats

The compiler produces two binary artifact forms:

- a static AArch64 ELF executable;
- a GNU static archive with a Wyst companion file.

The compiler does not provide a standalone object-output command.
It does not produce shared objects or position-independent executables.

Type layout is in [Type System](type-system.md).
Module linkage is in [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md).
Entry selection and section placement are in
[Named Layouts and Placement](named-layouts-and-placement.md).
Target entry validation is in [Entry Contracts](entry-contracts.md).
Debug sections are in [Debug and Unwind Information](debug-and-unwind.md).

## Artifact forms

### Executable artifacts

The `executable`, `benchmark`, and `fixture` manifest forms produce one static
ELF executable.
The selected layout supplies the entry and allocated-section placement.

The final executable has these ELF properties:

| ELF field | Value |
| --- | --- |
| Class | `ELFCLASS64` |
| Data encoding | Little-endian |
| Type | `ET_EXEC` |
| Machine | `EM_AARCH64` (`183`) |
| OS ABI | `ELFOSABI_NONE` |
| AArch64 flags | `0` |
| Entry | Selected layout entry address |

The executable contains program headers and a complete section-header table.
Allocated sections are in `PT_LOAD` segments.
Segment permissions follow the section permissions.
Debug, symbol, and string tables are not loaded.

The final executable contains no relocation section.
The compiler resolves all final addresses before it writes the file.

### Static-library artifacts

`static_library` produces two files:

- a deterministic GNU archive;
- a Wyst semantic companion file.

The manifest must give both output paths.
A static library does not accept an entry, runner, or layout clause.

```text
static_library widgets for "qemu-virt-aarch64-el2" {
  root widgets
  output "build/libwidgets.a"
  companion "build/libwidgets.wystlib"
  debug .full
  unwind .tables
  frame_pointers .all
}
```

Each archive member is an AArch64 ELF relocatable object.
The companion file stores the matching Wyst semantic interfaces and indexes.
The compiler pairs each object with one interface digest.

The archive contains indexes for these identities:

- module;
- declaration;
- generic definition;
- native symbol.

Member names use the module name plus `.o`.
The compiler sorts members before it writes the archive.
The compiler rejects duplicate normalized member names.
Thin archives are not accepted.

An executable manifest cannot name an external object or archive input.
It also cannot consume a produced static library as a linker input.

## Final executable sections

The compiler uses these built-in allocated sections:

| Section | Contents | ELF properties |
| --- | --- | --- |
| `.text` | Functions and labels | `ALLOC`, `EXECINSTR` |
| `.rodata` | Constants and strings | `ALLOC` |
| `.initcalls` | Initcall records | `ALLOC` |
| `.data` | Initialized mutable globals | `ALLOC`, `WRITE` |
| `.percpu` | Per-CPU initialization template | `ALLOC`, `WRITE` |
| `.bss` | Zero-initialized mutable globals | `ALLOC`, `WRITE`, `NOBITS` |
| `.wyst.vectors.<name>` | One exception vector table | `ALLOC`, `EXECINSTR` |

These compiler-owned sections are not allocated:

- `.wyst.hardening`, when hardening is enabled;
- selected `.debug_*` sections;
- `.eh_frame`, when unwind tables are enabled;
- `.symtab`;
- `.strtab`;
- `.shstrtab`.

[AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md)
defines the size and alignment of `.wyst.vectors.<name>`.
Source cannot rename or realign a vector section.

The compiler does not emit `.tls` or `PT_TLS`.
It does not emit a GOT, PLT, or dynamic-link section.


## Symbols

The compiler writes `.symtab`, `.strtab`, and `.shstrtab`.
Symbols use these bindings:

| Binding | Use |
| --- | --- |
| `STB_LOCAL` | Object-local declarations, layout symbols, and per-CPU offsets |
| `STB_GLOBAL` | Strong explicit exports and required cross-module definitions |
| `STB_WEAK` | Weak explicit exports |

Functions use `STT_FUNC`.
Data objects use `STT_OBJECT`.
Labels and layout symbols use `STT_NOTYPE`.
The compiler does not emit `STT_TLS`.

`pub` controls Wyst visibility.
It does not create an ELF export by itself.
An explicit `export` creates the external symbol.
An export alias uses the requested external spelling.

The compiler gives generated generic instances deterministic symbol names.
The same concrete type arguments produce the same name.

## Relocatable objects

A static-library member has these ELF properties:

| ELF field | Value |
| --- | --- |
| Class | `ELFCLASS64` |
| Data encoding | Little-endian |
| Type | `ET_REL` |
| Machine | `EM_AARCH64` (`183`) |
| Entry | `0` |
| Program headers | None |

Relocatable objects use `SHT_RELA` sections.
The compiler rejects `SHT_REL`.
The writer does not use extended section numbering.

Each relocatable object also contains:

- `.wyst.interface`, with the 32-byte interface digest;
- `.wyst.reloc`, with Wyst relocation records;
- `.symtab` and `.strtab`;
- `.shstrtab`.

Debug and unwind sections follow the artifact policy.
Address-bearing debug and unwind records use relocations.

## Emitted relocations

The backend emits this relocation subset in Wyst relocatable objects:

| Code | ELF relocation | Use |
| ---: | --- | --- |
| 257 | `R_AARCH64_ABS64` | 64-bit data, debug, unwind, and initcall addresses |
| 264 | `R_AARCH64_MOVW_UABS_G0_NC` | Absolute bits 0 through 15 |
| 266 | `R_AARCH64_MOVW_UABS_G1_NC` | Absolute bits 16 through 31 |
| 268 | `R_AARCH64_MOVW_UABS_G2_NC` | Absolute bits 32 through 47 |
| 269 | `R_AARCH64_MOVW_UABS_G3` | Absolute bits 48 through 63 |
| 275 | `R_AARCH64_ADR_PREL_PG_HI21` | Page address |
| 277 | `R_AARCH64_ADD_ABS_LO12_NC` | Low 12 address bits |
| 282 | `R_AARCH64_JUMP26` | Direct branch |
| 283 | `R_AARCH64_CALL26` | Direct call |

An `ADRP` and low-12 `ADD` pair share one pair identity.
The compiler rejects a missing or mismatched pair.

Checked assembly can emit only its admitted fixup types.
Checked fixups can prohibit relaxation.
The compiler rejects an unsupported checked-assembly relocation.

Per-CPU access patches use `.wyst.reloc` records.
They are not ordinary ELF TLS relocations.

The relocation catalog contains more accepted AArch64 codes than this table.
Those catalog entries are not all emitted by Wyst code generation.

## Veneers and range checks

The compiler can create a veneer for an ordinary out-of-range `CALL26` or
`JUMP26` edge.
The veneer uses `x16` and an `ADRP` plus `ADD` address pair.

The compiler does not relax checked-assembly fixups that prohibit relaxation.
It does not place a veneer in a fixed exception-vector slot.
It rejects an edge when no admitted placement or veneer can encode the range.

The compiler checks relocation addends, offsets, and final values for overflow.
It rejects a relocation that cannot fit its encoded field.

## Link boundary

The executable build checks each compiler-produced object and its semantic
interface before final placement.
It requires one compatible target and hardening identity across the closure.

Symbol resolution uses these rules:

- one strong definition wins;
- multiple strong definitions are an error;
- when no strong definition exists, one weak definition wins;
- an unresolved required symbol is an error;
- symbol visibility must agree with the selected provider.

The executable build accepts only the module products from the current Wyst
build plan.
There is no manifest clause for a foreign object, archive, linker script, or
shared library.

The compiler rejects TLS, COMDAT groups, thin archives, dynamic relocations,
and non-AArch64 object formats at this boundary.

## Deterministic output

The compiler orders modules, archive members, sections, symbols, relocations,
and strings with stable keys.
It writes zero padding where ELF padding has no instruction meaning.
Vector slots use authenticated AArch64 `nop` padding instead.

Source paths in debug information use reproducible normalized paths.
Archive timestamps and host file metadata do not select output content.
