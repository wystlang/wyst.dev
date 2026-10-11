---
title: ELF output
summary: The one static AArch64 executable that the compiler writes.
---

The compiler writes one static AArch64 executable in ELF64 format. The
layout file gives each section its address and alignment. The writer does
not choose addresses.

## The file

- The header is 64-bit, little-endian, `ET_EXEC`, and `EM_AARCH64`, with
  OS ABI 0 and flags 0. The entry is the address of the layout `entry`.
- The program headers follow the header. Each section with a memory size
  larger than zero gets one `PT_LOAD`. Its physical address is its virtual
  address, and its alignment is 0x1000. Code is read and execute. Read-only
  data is read. Data and bss are read and write.
- Each section has a file offset that is congruent to its address modulo
  0x1000, because `PT_LOAD` requires it. Bss uses no file bytes. All gaps
  are zero bytes.
- After the loaded bytes come `.symtab`, `.strtab`, `.shstrtab`, and the
  section header table.

## Symbols

The symbol table holds the null symbol, the local symbols, and then the
global symbols, each group in input order. A layout symbol has no section,
so it is absolute (`SHN_ABS`). [Using the compiler](/docs/compiler/#symbols)
gives the names.

## Not in the file

The file has no relocations, because the compiler resolves every address
before it writes the file. It has no dynamic linking, position-independent
code, thread-local storage, notes, debug data, or unwind tables.

## Determinism

The output depends only on the input. The writer uses no maps, no clock,
and no paths, and its string tables keep insertion order. Thus two builds
of the same source files and layout file give byte-identical files.
