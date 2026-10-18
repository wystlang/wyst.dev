---
title: ELF output
summary: The static AArch64 executable or raw image that the compiler writes.
---

The compiler writes one static AArch64 executable in ELF64 format, or
with `wync build --raw`, the raw image of the same build. The layout file gives the alignment of each section. The build computes the
address of each section from the layout, as
[Layout files](/docs/layout-files/#placement) tells. The ELF writer does
not choose addresses.

## The file

- The header is 64-bit, little-endian, `ET_EXEC`, and `EM_AARCH64`, with
  OS ABI 0 and flags 0. The entry is the address of the layout `entry`.
- The program headers follow the header. Each section with a memory size
  larger than zero gets one `PT_LOAD`. Its physical address is its virtual
  address, and its alignment is 0x1000. Code is read and execute. Read-only
  data is read. Data is read and write.
- The compiler puts nothing in a `bss` section now. Thus a `bss` section
  gets an `SHT_NOBITS` header of size 0 and no `PT_LOAD`. A module
  variable with the value zero goes in `.data`.
- Each section has a file offset that is congruent to its address modulo
  0x1000, because `PT_LOAD` requires it. All gaps are zero bytes.
- After the loaded bytes come `.symtab`, `.strtab`, `.shstrtab`, and the
  section header table.
- The section headers are the null header, one header for each layout
  section in layout order (also for an empty section), and then the three
  tables.

## Symbols

The symbol table holds the null symbol, the local symbols, and then the
global symbols, each group in input order. A layout symbol has no section,
so it is absolute (`SHN_ABS`). [Using the compiler](/docs/compiler/#symbols)
gives the names.

## Not in the file

The file has no relocations, because the compiler resolves every address
before it writes the file. It is not a position-independent executable
(PIE). It has no dynamic linking, thread-local storage, notes, debug data,
or unwind tables.

## Raw image

A loader that copies an image to memory as it is, such as m1n1 on the
Mac Studio, takes the raw image.

- The raw image holds the bytes from the start of the first section to the
  end of the last. Only a section with a memory size larger than zero
  counts. All gaps are zero bytes.
- The raw image has no header and no symbols. The loader gives the entry
  address. m1n1 starts the image at its start plus 0x800, so the layout of
  an image for the Mac Studio puts the entry there.
- All sections of the layout must be in one region, so that the gap
  between two regions cannot make a file of many GiB. When the compiler
  cannot get the memory for the raw image, the build stops with an error.

## Determinism

The output depends only on the input. The writer uses no maps, no clock,
and no paths, and its string tables keep insertion order. Thus two builds
of the same source files and layout file give byte-identical files.
