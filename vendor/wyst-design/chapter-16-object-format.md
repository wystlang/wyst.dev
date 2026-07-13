---
title: "Chapter 16: Wyst Object Format"
group: chapter
chapter: 16
order: 16
summary: "Emitted artifacts, ELF sections, symbols, relocations, deterministic output, and object-format boundaries."
---

# Chapter 16: Wyst Object Format

> **Canonical scope:** binary output format, section catalog, symbol table, relocation vocabulary.
> **Cross-references:** [chapter-06-types.md](chapter-06-types.md), [chapter-08-functions.md](chapter-08-functions.md), [chapter-09-memory-model.md](chapter-09-memory-model.md), [chapter-04-modules.md](chapter-04-modules.md), [chapter-05-boot.md](chapter-05-boot.md), [chapter-01-language-design.md](chapter-01-language-design.md) (Reproducibility Model, ABI Strategy), and [appendix-b-grammar.md](appendix-b-grammar.md).

Object format describes emitted artifacts, not source syntax. It builds on
modules, layout declarations, boot entry, and ABI classification.

Wyst's integrated compiler reads a set of source modules and emits a single
binary image in the current implemented artifact mode. There is no separate
assembler, no separate linker, and no intermediate object files written to disk
for the implemented `ET_EXEC` mode. Relocatable object files are a
future-version normative R8 surface (`wyst.language.v0.8` target 32) and do not
override the current single-image rules until Chapter 16 is updated for that
artifact mode.

---

## 1. Scope and Goals

For the implemented `ET_EXEC` artifact mode, the Wyst compiler is
**whole-program, single-pass with respect to its output**:

- The compiler ingests every source module named explicitly or discovered from
  the project/root import closure in one invocation (see
  [chapter-04-modules.md](chapter-04-modules.md)).
- All cross-module symbol resolution, layout, relocation, and image
  construction happen inside that one invocation.
- No per-module relocatable `.o` files are written to disk in the current
  implemented mode. `wync -c` / `--emit-object` is reserved for the R8
  relocatable-object milestone.
- No external `ld` is invoked.
- No `ar` archive format is defined.

The output of a successful compilation is exactly one **ELF64
little-endian AArch64 executable**.

```text
wync src/boot/hello.wyst src/runtime/uart.wyst src/boot/layout.wyst -o kernel.elf
```

`kernel.elf` is a complete, statically linked image. It has no dependencies on
a dynamic loader, no GOT, no PLT, no `DT_NEEDED` entries.

---

## 2. Output Format

### 2.1 ELF Discipline

The output is ELF64 (`EI_CLASS = ELFCLASS64`), little-endian
(`EI_DATA = ELFDATA2LSB`), AArch64 (`e_machine = EM_AARCH64 = 183`), executable
(`e_type = ET_EXEC`).

Position-independent executable output (`ET_DYN` with PIE semantics) is **not
supported**. All addresses are resolved to absolute values at compile time,
driven by the layout module's `#entry`, `#region`, and `#section` constraints.

### 2.2 ELF Header

| Field                 | Value                                                        |
| --------------------- | ------------------------------------------------------------ |
| `e_ident[EI_MAG]`     | `0x7F 'E' 'L' 'F'`                                           |
| `e_ident[EI_CLASS]`   | `ELFCLASS64` (2)                                             |
| `e_ident[EI_DATA]`    | `ELFDATA2LSB` (1)                                            |
| `e_ident[EI_VERSION]` | `EV_CURRENT` (1)                                             |
| `e_ident[EI_OSABI]`   | `ELFOSABI_NONE` (0) — bare-metal default                     |
| `e_type`              | `ET_EXEC` (2)                                                |
| `e_machine`           | `EM_AARCH64` (183)                                           |
| `e_entry`             | absolute address of the layout module's `#entry` symbol      |
| `e_flags`             | `0` — no AArch64-specific ABI flags defined by this contract |

### 2.3 Program Headers

The compiler emits one `PT_LOAD` segment per contiguous run of sections that
share load attributes (executable, writable, readable). Section-to-segment
mapping is deterministic and driven by the layout module:

- A run of executable sections (`.text`, `.wyst.vectors.*`) → one
  `PT_LOAD` with `p_flags = PF_R | PF_X`.
- A run of read-only data (`.rodata`) → one `PT_LOAD` with `p_flags = PF_R`.
- Non-`ALLOC` debug sections (`.debug_*`) are present only in the section
  table and are not mapped into a `PT_LOAD` segment.
- A run of read-write initialized data (`.data`) → one `PT_LOAD` with
  `p_flags = PF_R | PF_W`.
- A `.bss`-style zero-initialized run → one `PT_LOAD` with
  `p_flags = PF_R | PF_W` and `p_filesz < p_memsz`.

`PT_NOTE`, `PT_TLS`, `PT_GNU_STACK`, and `PT_GNU_EH_FRAME` are outside the
base image model.

### 2.4 Section Headers

A full section header table is emitted to support `readelf`, `objdump`, GDB,
and `gdb-multiarch` workflows. Section header content is informational; the
ELF program headers are authoritative for loading.

---

## 3. Section Catalog

Section names are **canonical**. The compiler emits its built-in artifacts
into the section names listed below; the layout module places those sections
but **cannot rename them**. User-defined section attributes (per Phase 6.3)
may add additional sections alongside this set; they cannot collide with
canonical names.

| Section               | Contents                                             | Flags         |
| --------------------- | ---------------------------------------------------- | ------------- | ---------- | ------- |
| `.text`               | Function bodies (default) and code from labels       | `ALLOC        | EXECINSTR` |
| `.rodata`             | Compile-time constants, string literals, jump tables | `ALLOC`       |
| `.initcalls`          | Kernel initcall metadata entries                     | `ALLOC`       |
| `.data`               | Initialized mutable globals                          | `ALLOC        | WRITE`     |
| `.bss`                | Zero-initialized mutable globals                     | `ALLOC        | WRITE      | NOBITS` |
| `.percpu`             | `#percpu` master images (template per CPU)           | `ALLOC        | WRITE`     |
| `.tls`                | `#tls` master images (template per thread)           | `ALLOC        | WRITE      | TLS`    |
| `.wyst.vectors.<name>` | One section per `#exception_vector` declaration      | `ALLOC        | EXECINSTR` |
| `.debug_info`         | DWARF 5 compilation unit DIE tree                    | (non-`ALLOC`) |
| `.debug_abbrev`       | DWARF 5 abbreviation tables for `.debug_info`        | (non-`ALLOC`) |
| `.debug_line`         | DWARF 5 line number program                          | (non-`ALLOC`) |
| `.debug_line_str`     | DWARF 5 line-program string table (file names)       | (non-`ALLOC`) |
| `.debug_str`          | DWARF 5 string table for `.debug_info`               | (non-`ALLOC`) |
| `.debug_loc`          | DWARF 5 location lists                               | (non-`ALLOC`) |
| `.debug_aranges`      | DWARF 5 PC → compilation-unit range table            | (non-`ALLOC`) |
| `.symtab`             | Symbol table (see §4)                                | (non-`ALLOC`) |
| `.strtab`             | Symbol name strings                                  | (non-`ALLOC`) |
| `.shstrtab`           | Section header name strings                          | (non-`ALLOC`) |

`.wyst.vectors.<name>` is named after the declaration: an
`#exception_vector` declared `el1_vectors :: #exception_vector { ... }`
emits to `.wyst.vectors.el1_vectors`. Each such section carries the 2KB
alignment dictated by §10.2.

`.percpu` and `.tls` master images are the bytes the runtime allocator copies
per CPU / per thread at bring-up. They are placed once in the image; the
runtime is responsible for replication. See §7 for the access lowering.

---

## 4. Symbol Table

The `.symtab` includes one entry per:

- public top-level declaration (function, label, constant, mutable
  global, type — types emit no payload but contribute symbols for tooling).
- Layout module export (`__text_start`, `__bss_end`, etc.).
- Compiler-created initcall metadata symbols named as specified in §4.3.
- Section start symbol (synthesized: `_section.text_start`, etc., for
  debugger convenience). These are local symbols.
- Function and label body starts (private and public alike), to enable
  source/debug lookup. Private functions and labels get `STB_LOCAL`.

### 4.1 Binding

| Binding      | When emitted                                                 |
| ------------ | ------------------------------------------------------------ |
| `STB_LOCAL`  | Private declarations (no `pub`), synthesized symbols     |
| `STB_GLOBAL` | public declarations, compiler-created initcall metadata |
| `STB_WEAK`   | **Not used.** `#weak` is outside the symbol model.           |

### 4.2 Type

| Symbol kind           | `st_type`                                                                  |
| --------------------- | -------------------------------------------------------------------------- |
| Function              | `STT_FUNC`                                                                 |
| Mutable global        | `STT_OBJECT`                                                               |
| Constant in `.rodata` | `STT_OBJECT`                                                               |
| Initcall metadata     | `STT_OBJECT`                                                               |
| Label (§2.4)          | `STT_NOTYPE` — executable text symbol, but not a callable function symbol |
| Section start         | `STT_NOTYPE`                                                               |
| Layout export         | `STT_NOTYPE`                                                               |

A label symbol's section index points at an executable text section and its
size covers the emitted label body. Tools must not infer function-call
prologue, epilogue, or return semantics from a label symbol; source-level
`goto` legality comes from the Wyst symbol kind, not from ELF `STT_FUNC`.

`STT_TLS` is **not** used. `#tls` and `#percpu` symbols are emitted as
ordinary `STT_OBJECT` whose value is the offset within `.tls` / `.percpu`;
access goes through the intrinsic-generated `mrs` + `add` sequence, not
through ELF TLS relocations.

### 4.3 Mangling

Wyst does not mangle ordinary monomorphic declarations. The symbol name
written to `.symtab` is exactly the declaration name from the source. Module
names do **not** appear in the ordinary declaration symbol: a function `init`
exported by module `runtime.uart` is the symbol `init`. Cross-module collisions
on public names are a compile error at import resolution (see
[chapter-04-modules.md](chapter-04-modules.md)), so the ordinary declaration
symbol table can afford to be flat.

Compiler-created initcall metadata symbols are an explicit exception. Every
`#initcall(order)` function emits one 16-byte `.initcalls` entry and one
metadata symbol whose value is the address of that entry and whose size is 16:

```text
InitcallSymbol = "__initcall_" OrderHex "_" QualifiedFunction
OrderHex       = 16 lowercase hexadecimal digits for the `u64` order
QualifiedFunction = PathComponent ("__" PathComponent)* "__" FunctionComponent
```

`QualifiedFunction` uses the source module path components followed by the
function name. Each component is encoded as ASCII alphanumeric bytes unchanged,
`_` as `_u`, and any other byte as `_x` plus two lowercase hexadecimal digits.
The module separator `.` is structural and becomes the `__` component separator,
not an encoded byte. For example, `early_console_init :: () #initcall(10)` in
module `drivers.uart` emits:

```text
__initcall_000000000000000a_drivers__uart__early_uconsole_uinit
```

Concrete generic instantiations are the other mandatory encoding exception.
Every implementation must write the same `.symtab` name for the same generic
declaration and canonical concrete type-argument tuple in Wyst's current
type-parameter-only generic model:

```text
GenericSymbol = DeclarationName "__wg" Arity "__" TypeComponent
                ("__" TypeComponent)*
Arity         = decimal count of type arguments
```

Examples:

| Source-facing instantiation | ELF symbol name              |
| --------------------------- | ---------------------------- |
| `identity<u64>`             | `identity__wg1__u64`         |
| `Pair<u64, bool>`           | `Pair__wg2__u64__bool`       |
| `wrap<Box<u64>>`            | `wrap__wg1__Box__wg1__u64`   |
| `same<Mode>`                | `same__wg1__t_Mode`          |

The marker `__wg` is reserved for compiler-generated generic instantiation
symbols. Source top-level declarations must not contain `__wg`, including
names such as `swap__wg1__u64`, because those names occupy the generated
symbol namespace.

Type components use this canonical ASCII encoding:

| Type argument shape                 | Type component                                    |
| ----------------------------------- | ------------------------------------------------- |
| Built-in scalar type                | The built-in spelling, such as `u64`, `bool`      |
| Monomorphic nominal type            | `t_` plus the escaped canonical declaration name  |
| Concrete generic nominal type       | That type's own `GenericSymbol`                   |
| Pointer `@T`                        | `ptr_` plus `T`'s component                       |
| Volatile pointer `@volatile T`      | `vptr_` plus `T`'s component                      |
| Slice `[]T`                         | `slice_` plus `T`'s component                     |
| Dynamic array `[dynamic]T`          | `dyn_` plus `T`'s component                       |
| Fixed array `[N]T`                  | `array_` plus escaped `N`, `_`, then `T`          |
| Vector `[T:N]`                      | `vec_` plus escaped `N`, `_`, then `T`            |
| Tuple `(name: T, ...)`              | `tuple` plus arity, then escaped field/type pairs |
| Function pointer `@(A, B) -> R`     | `fn` plus arity, parameters, and optional return  |
| Calling-convention function pointer | `fn_` plus escaped convention before the arity    |

Escaping leaves ASCII letters and digits unchanged, writes `_` as `_u`, `.`
as `_m`, and writes any other byte as `_xHH` using lowercase hexadecimal.
Imported exported type names first canonicalize to their declaring type name
before component encoding, so `flags.Mode` and the same type reached through
an import alias do not produce distinct ABI symbols.

The language-level canonical instantiation key also reserves a value-argument
list, which is empty in the current model because generic value parameters are
not part of Wyst. Any future feature that enables non-empty generic value
arguments must extend this public symbol encoding before it can expose such
instantiations in emitted artifacts.

This decision keeps `readelf -s kernel.elf` legible for normal source names
while still making generic instantiations stable for linkers, debuggers, and
out-of-tree tooling. Longer generic names increase `.strtab` size, but they do
not duplicate machine code beyond the monomorphizations already required by
the source program and do not add runtime-loaded data by themselves.

---

## 5. Relocation Vocabulary

Because the compiler is whole-program single-pass, **no relocations are
serialized to disk**. The output ELF has no `.rela.*` sections.

The relocation types below are the **internal** alphabet used during the
final link phase, between code generation and image write-out. They are
enumerated here so that:

- The IR specification (Phase 5.2) can reference them precisely.
- An external tool (linker, disassembler, debugger) that ever needs to
  inspect partially-linked Wyst output knows the closed set it might see.
- The relocation-origin discipline (§6) can name every source of patchable
  symbol, object, section, string, or future table references.

| Internal name  | ELF type code (AArch64 spec)          | Lowered from                                                                                  |
| -------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- |
| `ADR_PG_HI21`  | `R_AARCH64_ADR_PREL_PG_HI21` (275)    | `adrp xN, sym` (high 21 bits of page-relative offset)                                         |
| `ADD_LO12`     | `R_AARCH64_ADD_ABS_LO12_NC` (277)     | `add xN, xN, :lo12:sym` (low 12 bits, no overflow check)                                      |
| `LDST8_LO12`   | `R_AARCH64_LDST8_ABS_LO12_NC` (278)   | byte load/store with `:lo12:` offset                                                          |
| `LDST16_LO12`  | `R_AARCH64_LDST16_ABS_LO12_NC` (284)  | halfword load/store                                                                           |
| `LDST32_LO12`  | `R_AARCH64_LDST32_ABS_LO12_NC` (285)  | word load/store                                                                               |
| `LDST64_LO12`  | `R_AARCH64_LDST64_ABS_LO12_NC` (286)  | doubleword load/store                                                                         |
| `LDST128_LO12` | `R_AARCH64_LDST128_ABS_LO12_NC` (299) | 128-bit load/store (NEON, `ldp`/`stp`)                                                        |
| `CALL26`       | `R_AARCH64_CALL26` (283)              | `bl sym` direct call                                                                          |
| `JUMP26`       | `R_AARCH64_JUMP26` (282)              | `b sym` unconditional branch (`goto`)                                                         |
| `CONDBR19`     | `R_AARCH64_CONDBR19` (280)            | `b.<cond> sym` (intra-function only — rarely needs relocation)                                |
| `ABS64`        | `R_AARCH64_ABS64` (257)               | 64-bit absolute pointer in `.data` / `.rodata` (function pointers, `#addr_of` stored as data) |
| `PREL32`       | `R_AARCH64_PREL32` (261)              | DWARF section-relative references                                                             |

**Out of scope** (reserved slots for future object-format extensions):

- `R_AARCH64_GOT_*` family — no GOT in static linking.
- `R_AARCH64_TLSGD_*`, `R_AARCH64_TLSDESC_*` — no dynamic TLS.
- `R_AARCH64_TLSLE_*` — `#tls` uses direct `TPIDR_EL0` + offset, computed
  by the compiler from `#start(.tls)`; see §7.
- `R_AARCH64_TLSIE_*` — initial-exec model not used.
- `R_AARCH64_COPY`, `R_AARCH64_GLOB_DAT`, `R_AARCH64_JUMP_SLOT` — dynamic linker only.

If future Wyst versions add dynamic linking, the GOT family slots in here
without breaking the static-only contract.

### 5.1 Page-Pair Discipline

Every code-to-data and code-to-code reference longer than ±128 MB uses the
`ADR_PG_HI21` + `ADD_LO12` page pair. Sub-±128 MB code-to-code calls use
`CALL26` or `JUMP26` directly. The choice is determined at codegen time
based on final-placement distance, which is known because the compiler is
whole-program.

The compiler synthesizes deterministic veneers for direct symbol `CALL26` and
`JUMP26` branches whose targets are outside the architectural branch range
after final placement. Each far direct symbol branch gets one veneer after the
source text chunk; the original branch targets that near veneer, and the veneer
materializes the final target address through the existing `ADR_PG_HI21` +
`ADD_LO12` relocation path before `br x16`.
Out-of-range local backend `B26`, `CBNZ19`, and future `CONDBR19` forms still
emit hard errors until their own veneer policies are designed.

The compiler does not use literal pools for integer constants. Integer constants are
materialized deterministically with `movz` plus `movk` lanes from low to high,
omitting lanes that are zero. Symbol addresses use the page-pair discipline
above.

This means the spec **does not** define a `R_AARCH64_LDR_*` GOT-load encoding
for `#addr_of` — the load is always materialized as an `adrp` + `add` (or
`adrp` + `ldr` with `LDST*_LO12`) pair against the absolute symbol address.

---

## 6. Relocation Origins and Address-Expression Emission

Every relocation-producing operation has an explicit origin before final image
write-out. Current static `ET_EXEC` builds resolve these origins internally and
do not serialize `.rela.*` sections, but the compiler still keeps the origin
kind visible until the writer patches the emitted bytes.

| Origin | Produced by | Internal patch/relocation behavior |
| --- | --- | --- |
| Direct calls | IR `call` with a symbol callee | Emits a direct `CALL26` branch when in range; otherwise emits a deterministic veneer that materializes the target address with `ADR_PG_HI21` + `ADD_LO12`. |
| Direct symbol branches | IR `goto` / tail control transfer to a label or function symbol | Emits a direct `JUMP26` branch when in range; otherwise emits a deterministic veneer that materializes the target address with `ADR_PG_HI21` + `ADD_LO12`. |
| Symbol materialization | IR `addr_of`, string-address materialization, and symbol-base materialization for constant-address `gep` | Emits `ADR_PG_HI21` + `ADD_LO12` page-pair patches in text, with byte addends folded only for constant offsets. |
| Object references | Global `ConstIr::Address`, slice/string descriptors, per-CPU/TLS current-instance references, and per-instance offset values | Emits `ABS64` data patches or compiler-owned per-instance offset patches; the static image still avoids dynamic ELF TLS relocations. |
| Jump tables | Future explicit jump-table lowering records | Table entries are relocation origins. Current `switch-dispatch` mode does not emit jump tables or serialized jump-table relocations. |
| Address-bearing instructions | Checked inline assembly memory/address operands and future load/store address forms that carry a symbol target | Use the same address-materialization or low-12 load/store relocation records as ordinary compiler-generated instructions. |

`#addr_of(symbol)` (§7.1 of [chapter-05-boot.md](chapter-05-boot.md)) is the
only language-level address expression that introduces a symbol-sourced address
value. That narrower rule does not make `#addr_of` the only
relocation-producing origin in the compiler. `%addr_of(local)` materializes a
stack-frame address at runtime and therefore does not participate in relocation
emission. Every other address expression in Wyst is either a literal
(`0x0900_0000`) or computed at runtime from values whose provenance the
compiler cannot trace.

The integrated linker uses the address-expression distinction directly:

| Expression form                                                    | Relocation behavior                                                                                                                         |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `#addr_of(sym)` in an expression                                   | Codegen emits `adrp` + `add` against `sym`. Linker resolves at final placement.                                                             |
| `(#addr_of(sym) as.address @T) + N` (constant element count `N`)    | One page-pair relocation against `sym`; the byte addend is `N * #size_of(T)` folded into the `ADD_LO12` immediate (or into the `ABS64` slot when stored to data). |
| `((#addr_of(sym) as.address @u8) + B) as.lens @T` (constant byte count `B`) | One page-pair relocation against `sym`; the byte addend is exactly `B`.                                                                      |
| `(#addr_of(sym) as.address @T) + i` (runtime element count `i`)     | Page-pair relocation for `sym`'s base only; runtime code scales `i` by `#size_of(T)` before the plain `add`, with no relocation on that add. |
| `#addr_of(sym)` in a constant initializer for a global             | Codegen emits an `ABS64` slot in `.data` / `.rodata`. Linker writes the resolved `sym + addend` into that slot.                             |
| `[]T{data = #addr_of(sym), len = N}` in a global initializer       | Codegen emits a 16-byte slice pair: an `ABS64` relocation in the `data` slot and a constant `u64` length.                                   |
| `%addr_of(local)`                                                  | No relocation. Codegen emits ordinary stack-relative address materialization.                                                               |
| Integer literal conversion `0x40000000 as.address @T`              | No relocation. The address is the literal.                                                                                                  |
| Computed `@T` (`base + i`, `ptr as.lens @u32`, `%mrs(TPIDR_EL1) as.address @T`) | No relocation. The address is a runtime value.                                                                                              |

Global enum initializers are persisted using the representation in
[chapter-06-types.md §1.6.2](chapter-06-types.md). A payload-less enum writes
only the discriminator type's bytes. A payload enum writes 16 bytes: the tag
word at offset 0 and the payload word at offset 8. If the active variant has no
payload, the payload word is non-semantic inactive storage; the current writer
zero-fills it as part of ordinary deterministic data emission, but programs
must not rely on those bytes as a source-level value.

Plain `+` in source has exactly one meaning for typed addresses: element
offsets. Do not multiply `N` or `i` by `#size_of(T)` before adding to `@T`;
that creates a relocation addend or runtime offset scaled twice, and the
checker rejects the obvious `p + i * #size_of(T)` form. Relocation addends are
always measured in bytes. Byte addends must be spelled with an `@u8` lens or
with explicit `u64` arithmetic before casting back to the desired address type.

**Consequence:** Wyst does not have the C/C++ problem of "is this pointer a
relocatable symbol reference or an integer?" For address expressions, the
syntax tells the compiler whether it is materializing a symbol-sourced address
or ordinary address arithmetic. Direct calls, direct symbol branches, object
references, veneers, future jump tables, and address-bearing instructions are
separate relocation origins with separate patch records.

This is the contract that lets the integrated linker avoid carrying a full
relocation table to disk: every relocation site is a direct lowering of an
explicit IR node or lowering patch that names the target symbol, object,
string, section, or future jump-table entry, fully resolved before write-out.
Do not describe `#addr_of` or IR `addr_of` as the only relocation-producing
operation; it is only the source address-expression form that creates a
symbol-sourced address value.

See Phase 5.4 for the cross-link from [chapter-06-types.md §1.4.1](chapter-06-types.md) (Address
Types).

---

## 7. Per-CPU and Thread-Local Lowering

The intrinsics in [chapter-11-intrinsics.md §1.3.7](chapter-11-intrinsics.md) are lowered without using
ELF TLS relocations. The mechanism:

1. The compiler computes `#percpu_offset_of(var)` and
   `#tls_offset_of(var)` at compile time, as integers in the
   `.percpu` / `.tls` section.
   These integers are final image layout facts: deterministic for one
   complete build input, but not stable across source, import-order,
   alignment, or layout-policy changes. The compiler emits warning
   `W0203` when source asks for one explicitly.
2. Access lowers to `mrs xT, TPIDR_EL1` (or `TPIDR_EL0`) + `add xN, xT,
#offset` — the immediate offset is filled in by codegen, not by an ELF
   relocation.
3. Section sizes are exported as ordinary symbols (`__percpu_size`,
   `__tls_size`) for the runtime allocator to size per-CPU / per-thread
   blocks.
4. The runtime is responsible for setting `TPIDR_EL1` / `TPIDR_EL0` to the
   base of each CPU's / thread's instance before any access.

This decision keeps the static-only contract intact and avoids dragging in
the ELF TLS model (`PT_TLS`, `R_AARCH64_TLSLE_*`, `__tls_get_addr`) which
exists for dynamic loaders Wyst doesn't have. If a future Wyst version adds
dynamic linking, an opt-in ELF TLS lowering can be added per
`#target(... features = (elf-tls))`.

---

## 8. Sections from User Declarations

User code places a declaration in a custom section with the
`#section(.name)` attribute:

This source-level section request is checked against the layout. Under the
default documentation layout, `.modinfo` is intentionally absent, so this
contract fails until a layout declares the section:

<!-- wyst-contract: check-fail -->
```wyst
#module object_demo

#section(.modinfo)
modinfo :: [4]u8 = "abcd"
```

<!-- wyst-contract: sketch -->
```wyst
#section(.init.text) bring_up_uart :: () { ... }
#section(.modinfo)   uart_modinfo :: [16]u8 = "uart_pl011_v1"
```

The full semantics — legal placements, section-name constraints,
flag derivation, bookend synthesis, cross-module aggregation — are
specified in [chapter-04-modules.md](chapter-04-modules.md) under "Custom Sections from User
Declarations". The rules relevant to the object format are:

- **Reserved names:** all section names listed in §3 (`.text`,
  `.rodata`, `.data`, `.bss`, `.percpu`, `.tls`, the `.debug_*` family,
  `.symtab`, `.strtab`, `.shstrtab`) and any name starting with `.wyst.`
  are reserved. User code cannot target them with `#section(...)` —
  canonical sections are written by _omitting_ the attribute.
- **Flags are derived** from the declaration kind (function → `ALLOC |
EXECINSTR`; constant → `ALLOC`; mutable initialized → `ALLOC | WRITE`;
  mutable uninitialized → `ALLOC | WRITE | NOBITS`). The ELF section
  header's `sh_flags` is computed from this derivation, not from a
  user-supplied flag list.
- **Bookend symbols** `__<section>_start` / `__<section>_end` are
  auto-synthesized with `STB_LOCAL` for every used custom section.
  Dots in the section name become underscores; the leading dot is
  dropped. Layout-module exports referencing the same range override
  these.
- **Concatenation order** is source-declaration order within a module,
  then deterministic module-import order across modules, matching the
  determinism contract in §11.

---

## 9. Out of Scope

These are explicit non-features of the object format. Each has a
documented path if needed.

| Feature                                         | Boundary                 | Future path                                                                                            |
| ----------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Per-module `.o` relocatable output              | Outside implemented base image model | Future-version normative for R8 target 32 as `wync -c` / `--emit-object`; would serialize the §5 relocation vocabulary into `.rela.*` sections |
| Dynamic linking (`ld.so`, `PT_INTERP`)          | Outside base image model | Requires GOT/PLT relocations, `R_AARCH64_GLOB_DAT`, `R_AARCH64_JUMP_SLOT`, dynamic symbol table        |
| Position-independent executables (`ET_DYN`)     | Outside base image model | Base output lowers against absolute addresses                                                          |
| Shared objects (`.so`)                          | Outside base image model | Same dependency on dynamic linking                                                                     |
| COMDAT / section groups                         | Outside base image model | `#inline` is the only deduplication mechanism; multiply-defined exports are a hard error               |
| `#weak` symbols, `#hidden` visibility           | Outside symbol model     | Could add `STB_WEAK` and `STV_HIDDEN` once language semantics are defined                              |
| `init_array` / `fini_array`                     | Outside base image model | Wyst has no implicit static constructors; the layout module's `#entry` is the only entry point          |
| Exception unwinding (`.eh_frame`, `.ARM.exidx`) | Outside base image model | Wyst has no exceptions in the language sense; `#exception_vector` is hardware-level only                |
| ar archives, static libraries                   | Outside base image model | The compiler reads source modules directly                                                             |
| Mach-O, PE, COFF output                         | Outside base image model | See §11.                                                                                               |

---

## 10. Determinism

Object format output is **bit-for-bit reproducible** under the
reproducibility contract (`chapter-01-language-design.md`, Reproducibility Model):
same compiler version, same build optimization mode, same target, same
`#schedule` modes, and the same source input manifest produce byte-identical
ELF output.

Specific determinism requirements:

- Section order is determined by the layout module (`in` / `after`
  constraints), then by declaration order within a section. There is no
  topological-sort tie-break dependent on hashtable iteration.
- Symbol table order is: layout exports, then user `pub` symbols in
  module-then-declaration order, then private functions in
  module-then-declaration order. Module order is the compiler source input
  order: explicit multi-file builds use command-line source order, while
  project and explicit-root import-closure builds use the canonical traversal
  from [chapter-03-project-builds.md](chapter-03-project-builds.md).
  Declaration order is source-text order.
- The `.shstrtab` and `.strtab` are emitted in symbol-table order (no
  string-pool deduplication that depends on hash order). String
  deduplication is allowed only when it's an exact prefix-suffix sharing
  computed deterministically.
- No timestamps. The ELF header's `e_ident[EI_VERSION]` is the only field
  derived from "build state"; everything else is content-derived.

---

## 11. Future Object Formats

ELF64 is the base object format. Mach-O (Darwin) and PE (Windows / UEFI) are
plausible future targets — both have AArch64 variants and both are well-
documented. The §5 relocation vocabulary maps cleanly to each:

- Mach-O: `ARM64_RELOC_PAGE21`, `ARM64_RELOC_PAGEOFF12`, `ARM64_RELOC_BRANCH26`,
  `ARM64_RELOC_UNSIGNED`.
- PE (COFF): `IMAGE_REL_ARM64_PAGEBASE_REL21`, `IMAGE_REL_ARM64_PAGEOFFSET_12A`,
  `IMAGE_REL_ARM64_BRANCH26`, `IMAGE_REL_ARM64_ADDR64`.

Adding a new format does **not** require changes to the language, the IR, or
the relocation vocabulary — it requires only a new writer module that maps
§5's internal types to the foreign format's codes. The single-pass
whole-program model is preserved: the writer is the last stage.

No commitment to a release date for non-ELF formats. Listed here so that
section naming, generic-symbol encoding, and ABI choices are not made in ways
that would prevent a future port.

---

## 12. Cross-References

| Topic                                             | Canonical location                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------ |
| Module model and import resolution                | [chapter-04-modules.md](chapter-04-modules.md)                           |
| Layout module syntax                              | [chapter-04-modules.md](chapter-04-modules.md) ("Layout")                |
| Exception vector sections (alignment, slot rules) | [chapter-14-exception-vectors.md §10.2](chapter-14-exception-vectors.md) |
| `#percpu` / `#tls` access lowering                | [chapter-11-intrinsics.md §1.3.7](chapter-11-intrinsics.md)              |
| `#addr_of` semantics                              | [chapter-06-types.md §1.4.1](chapter-06-types.md); this document §6      |
| ABI (calling convention, register usage)          | `chapter-15-abi-spec.md`                                                 |
| Reproducibility contract                          | `chapter-01-language-design.md`, "Reproducibility Model"                 |
| IR ↔ object-format interaction                    | `appendix-a-ir.md` (Phase 5.2)                                           |
| DWARF emission (dialect, DIE set, determinism)    | [chapter-23-debug-info.md](chapter-23-debug-info.md)                     |
