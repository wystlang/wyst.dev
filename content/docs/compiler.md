---
title: Using the compiler
summary: wync build, module paths, errors, exit status, symbols, and byte-identical output.
---

## wync build

```sh
wync build <file.wyst> --layout <layout-file> -o <output.elf>
```

`wync build` reads the module `<file.wyst>`, each module that it imports,
and the layout file. It writes one static AArch64 ELF executable.
[Layout files](/docs/layout-files/) gives the format of the layout file.

## Module paths

The root directory is the directory of `<file.wyst>`, and the module path
of `<file.wyst>` is its name. This name must be a
[name](/docs/syntax/#lexical-forms) that is not a keyword, so
`my-mod.wyst` cannot be a module. `import a.b` names the module in
`<root>/a/b.wyst`, and its module path is `a.b`. Each name must be equal to
the name of the directory or the file, also in case. The exception is
`import runtime.semihost`: the compiler supplies this module, and it reads
no file for it.

For `wync build kernel/src/boot.wyst`, the root is `kernel/src/`:

```text
kernel/
  qemu_virt.layout
  src/
    boot.wyst        module boot
    cpus.wyst        module cpus
    el0/
      console.wyst   module el0.console
```

The build reads each module that `<file.wyst>` imports, directly or
indirectly. Imports can make a cycle.

## What the build makes

- The compiler checks every function. It generates code only for the
  functions that the entry or the exception vector table can reach,
  through calls and `@`.
- Each module variable goes in `.data`, with its natural alignment, in
  module and declaration order.
- The output depends only on the source files and the layout file. Two
  builds of the same input give byte-identical files. The file has no
  time, path, or build number in it.

## Errors

The build stops at the first error and prints one line to standard error:

- A source or layout error is `file:line:col: error: message`.
- A file system error or a file name error is `path: message`.
- An error that has no source position, such as a branch out of range at
  link time, is the message only.

The exit status is 0 for success, 1 for an error, and 2 for incorrect
arguments.

## Symbols

The ELF file has a symbol table, so a disassembler shows the names of the
functions:

- The symbol of a function is `module.function`, a function symbol.
- The symbol of a module variable is `module.var`, an object symbol.
- The symbol of the vector table is `module.name`, a function symbol of
  0x800 bytes.
- A `pub` item has a global symbol. The other items have local symbols.
- Each layout symbol is an absolute global symbol.

## Looking at the output

Any AArch64 disassembler reads the file. On macOS, `objdump` is part of
the Xcode command line tools:

```sh
objdump -d hello.elf
```

[Code generation](/docs/code-generation/) shows the machine code that each
construct gives, and [ELF output](/docs/elf-output/) describes the file.
