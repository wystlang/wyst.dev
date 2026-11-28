---
title: Layout files
summary: The file that puts the entry, the sections, and the symbols at addresses in memory.
---

A layout file tells the build where each section goes in memory. It is not
Wyst source. `wync build` reads it with the `--layout` option. The layout
is a separate file, as `go.mod` is, because the target and not the source
decides the addresses.

## Format

Each line has one declaration. `//` starts a comment. An integer is decimal
or hexadecimal with `0x`, and `_` can separate its digits.

```layout
// The QEMU virt board loads the program at the start of RAM.
entry hello._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0008_0000
section .text:   code   in ram align 16
section .rodata: rodata in ram after .text align 16
section .data:   data   in ram after .rodata align 8
section .bss:    bss    in ram after .data align 16
symbol __stack_top: u64 = 0x4010_0000
symbol __bss_start: u64 = start(.bss)
symbol __bss_end:   u64 = end(.bss)
```

| Declaration | Meaning |
| --- | --- |
| `entry m.f at A` | Function `f` of module `m` is the ELF entry. It must be at address `A`. There is one entry. Each part of `m.f` is a name, as in an import. |
| `region r: readwrite at A size N` | Memory from `A` to `A + N`. A region is `readonly` or `readwrite`. |
| `section s: k in r align N` | A section of kind `code`, `rodata`, `data`, or `bss` in region `r`. `N` is a power of two, and at least 4 for a `code` section. |
| `section s: k in r after t align N` | The section starts at the end of the earlier section `t`, in the same region. |
| `functions m in s` | Each function of each module whose path starts with `m.` goes in the `code` section `s`. See [Function sections](#function-sections). |
| `symbol n: u64 = v` | A `u64` name that each function can read. `v` is an integer, `start(s)`, `end(s)`, or `@m.f`, the address of function `f` of module `m`. See [Function symbols](#function-symbols). |
| `stack N` | Each stack of the build has `N` bytes. There is at most one `stack`. |

A line can name only a region or a section that an earlier line declares.
Thus a region comes before its sections, and a section comes before each
`after`, `functions` line, `start(s)`, or `end(s)` that names it.

`A`, `N`, and an integer `v` are integers. Each of them can also be
`m.name`, a `pub` integer constant of module `m` of the build. Thus the
layout and the source use one value, such as the size of a page:

```text
entry kernel.boot._start at kernel.boot.image_start
region ram: readwrite at kernel.boot.image_start size kernel.boot.image_size
section .text: code in ram align kernel.frames.size
stack kernel.stack_size
```

`m` is a module path, as in an import. The module must be in the build:
the entry module, the module of a [function symbol](#function-symbols),
or a module that a module of the build imports. Else
the error is ``module `kernel.frames` is not in the build``. The compiler
gives the value after it checks the source, and then checks the line: an
alignment is a power of two. A layout file has no operators, so the
source computes a value in a constant, such as `kernel.boot.image_start`,
and the layout names it.

## Placement

- A section without `after` starts at the start of its region. The build
  aligns the start of each section up to its alignment.
- Each instruction is 4 bytes, so a `code` section needs an alignment of
  at least 4.
- Each section must fit in its region and must not overlap another
  section. A `data` or `bss` section must be in a `readwrite` region.
- For `wync build --raw`, all sections must be in one region, so that the
  [raw image](/docs/elf-output/#raw-image) holds no gap between two
  regions.
- The entry function is first in its section, so that section must start
  at the entry address. The boot starts the entry at EL1 or at EL2, so the
  entry is not in `.el0`, as [Function sections](#function-sections)
  gives.

## Which section holds what

| Section | Holds | Rule |
| --- | --- | --- |
| `.text` | Functions | A `code` section. |
| `.rodata` | String literals, each one its `u64` length and then its bytes | A `rodata` section, with an alignment of at least 8. |
| `.data` | Module variables | A `data` section, with an alignment of at least the largest variable. |
| `.vectors` | The exception vector table | A `code` section, with an alignment of at least 0x800. |
| `.name` | The functions of a line `functions m in .name`, and the functions with `#[section(.name)]` | A `code` section other than `.vectors`. |

The other sections stay empty. The build always needs `.text`. It needs
another section only when the program puts something in it.

## Function sections

The line `functions m in s` puts the code of each function of each module
whose path starts with `m.` in the section `s`, in place of `.text`. `m`
is a module path, as in an import, and `s` is a `code` section other than
`.vectors`. Thus `functions drivers in .el0` puts the code of
`drivers.display` and of `drivers.serial.uart` in `.el0`, but not the code
of a module `drivers`.
`#[section]` on a function wins over the line, as
[Sections](/docs/boot-and-exceptions/#sections) gives. An inline function
has no code of its own, but it has the section of its module, as the line
gives, and the EL of that section, as
[Assembly](/docs/assembly/#asm-blocks) gives. The kernel puts the code of
its EL0 modules in `.el0` in this way, with one line for each topic but
`kernel`, so that its page tables let EL0 execute only these pages.

```wyst drivers/serial/uart.wyst
pub fn start() -> never {
  for {}
}
```

With this layout:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
section .el0: code in ram after .text align 16
functions drivers in .el0
symbol __stack_top: u64 = 0x4009_0000
```

the code of `_start` goes in `.text`, and the code of
`drivers.serial.uart.start` in `.el0`. `_start` goes to it with `eret`,
because no call crosses the boundary of `.el0`, as [Calls between
sections](#calls-between-sections) gives:

```wyst
import drivers.serial.uart

#[naked]
pub fn _start() -> never {
  asm(entry in x0 = @uart.start) -> never {
    msr elr_el1, x0
    eret
  }
}
```

A module that two lines match is an error at the second line:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
section .el0: code in ram after .text align 16
section .serial: code in ram after .el0 align 16
functions drivers in .el0
functions drivers.serial in .serial
symbol __stack_top: u64 = 0x4009_0000
```

```wyst fails
import drivers.serial.uart

#[naked]
pub fn _start() -> never {
  asm(entry in x0 = @uart.start) -> never {
    msr elr_el1, x0
    eret
  }
}
```

```text
check.layout:7:1: error: a second `functions` line for module `drivers.serial.uart`
```

A line that matches no module of the build is also an error, such as
``no module of the build has a path that starts with `drivers.` ``, because
with a wrong path the code stays in `.text` with no other error.

The section of a function gives each rule of EL0 for it, not its module.
The code of a function of `.el0` runs only at EL0, so it makes no address
of memory from an integer, as
[Points of trust](/docs/addresses/#points-of-trust) gives, and it is not
the entry of the layout, an entry of the vector table, or an `#[el2]`
function, as [Sections](/docs/boot-and-exceptions/#sections) gives. A
function that `#[section]` puts in another section has the rules of that
section, also in a module of `.el0`. An entry of the layout in `.el0` is an
error at the line `entry`:

```layout check
entry drivers.serial.uart.start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .el0: code in ram align 16
section .text: code in ram after .el0 align 16
functions drivers in .el0
```

```wyst fails
import drivers.serial.uart
```

```text
check.layout:1:1: error: the entry `drivers.serial.uart.start` is in `.el0`
```

## Calls between sections

A function can call a function of another section, but no call crosses
the boundary of `.el0`. A function of `.el0` calls only functions of
`.el0`, also inline ones, and a function of another section does not call
a function of `.el0`. EL0 cannot read the code of another section, and
EL1 cannot execute `.el0`, so such a call would fault when it runs. The
body of an inline function is in the code of each caller, and the
compiler checks it at the EL of its own section, so the call keeps the
body at that EL. With the layout of
[Function sections](#function-sections):

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
section .el0: code in ram after .text align 16
functions drivers in .el0
symbol __stack_top: u64 = 0x4009_0000
```

```wyst fails
import drivers.serial.uart

#[naked]
pub fn _start() -> never {
  asm(top in x0 = __stack_top) {
    add sp, x0, #0
  }

  uart.start()
}
```

```text
main.wyst:9:8: error: `main._start` of `.text` calls `drivers.serial.uart.start` of `.el0`, but only a function of `.el0` can call a function of `.el0`
```

`@f` is not a call, so code of EL1 starts a thread at a function of
`.el0` with `@f`, as `_start` does above. A layout without a section
`.el0` has no such boundary.

## Function symbols

`symbol n: u64 = @m.f` gives `n` the address of the code of function `f`
of module `m`. Each part of `m.f` is a name, as in an import. Thus the
layout can select a function that no source names: two layouts can build
two images from one root file, each with its own first function. The
kernel layout has `symbol __root: u64 = @system.root.start`, the entry of
its first domain, and no module of the kernel imports `system.root`.

- The build reads module `m`, as it reads the module of the entry, and
  each module that `m` imports. No module has to import `m`.
- `f` is a `pub` function with the rules of `@f` in the source: it is
  naked, or it has no parameters and returns `never`, because a CPU or a
  thread starts at the address with no call. An inline function has no
  code of its own, so it has no address.
- The build generates the code of `f` and of each function that `f` can
  reach, as for `@f`. The code goes in the section of `f`, which can be
  `.el0`: the code that reads the symbol makes no call.
- When `f` is not naked, it starts on a new stack, so the line `stack`
  gives the size of its stack, as [Stacks](#stacks) gives.

With this layout, no module imports `drivers.serial.uart`, and the build
reads it for `__task`:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
section .el0: code in ram after .text align 16
functions drivers in .el0
symbol __task: u64 = @drivers.serial.uart.start
```

```wyst
#[naked]
pub fn _start() -> never {
  asm(entry in x0 = __task) -> never {
    msr elr_el1, x0
    eret
  }
}
```

The error is at the value of the line `symbol`: a module path that names
no file, a function that the module does not declare, a function that is
not `pub`, an inline function, and a function that is not naked and that
has a parameter or can return. This layout names a function that
`drivers.serial.uart` does not declare:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
symbol __task: u64 = @drivers.serial.uart.stop
```

```wyst fails
#[naked]
pub fn _start() -> never {
  for {}
}
```

```text
check.layout:4:22: error: module `drivers.serial.uart` has no function `stop`
```

## Address constants

The build fails when a byte of the memory of an
[address constant](/docs/addresses/#address-constants) is in a region of
the layout. Thus an address constant is never code or read-only data of the
image. With this layout:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
```

the memory of `own` is in the region `ram`:

```wyst fails
struct State {
  count: u64
}

const state: u64 = 0x4008_8000
const own: @var State = bitcast(state)

#[naked]
pub fn _start() -> never {
  for {}
}
```

```text
main.wyst:6:25: error: the memory of address constant `own` is in region `ram` of the layout
```

The build does not check the first value of a module variable, or an
address in a constant table.

## Stacks

`stack N` gives the size of each stack of the build, in bytes. A function
starts on a new stack when a naked function calls it after it sets `sp`,
or when a function that is not naked or a
[function symbol](#function-symbols) takes its address, so that a thread
can start there. The build fails when such a function can use more than
`N` bytes with its calls, as [the stack](/docs/boot-and-exceptions/#the-size-of-the-stack)
gives. A layout without `stack` has no such check.

With this layout:

```layout check
entry main._start at 0x4008_0000
region ram: readwrite at 0x4008_0000 size 0x0001_0000
section .text: code in ram align 16
section .data: data in ram after .text align 8
symbol __stack_top: u64 = 0x4009_0000
stack 32
```

the calls from `run` can use 48 bytes, so the build fails:

```wyst fails
var ticks: u64 = 0

#[naked]
pub fn _start() -> never {
  asm(top in x0 = __stack_top) {
    add sp, x0, #0
  }

  run()
}

fn run() -> never {
  for {
    count()
  }
}

fn count() {
  const before = ticks
  tick()
  ticks = before + 1
}

fn tick() {
  bump()
}

fn bump() {
  ticks += 1
}
```

```text
main.wyst:9:3: error: `main.run` starts on a new stack of 32 bytes, but it can use 48 bytes with its calls, in these frames: `main.run` 0, `main.count` 32, `main.tick` 16, `main.bump` 0
```

`run` returns `never`, so it saves no register. `count` saves `x29`,
`x30`, and `x19`, which keeps `before` during the call, and `tick` saves
`x29` and `x30`. The frames are a multiple of 16 bytes, because `sp` stays
16-byte aligned.

## Symbols

Each layout symbol becomes an absolute global symbol of the ELF file. A
function reads a symbol by its name, as `__stack_top` in
[Hello, world!](/docs/hello-world/). The compiler computes each operation
on a symbol with an integer value. A symbol of the start or the end of a
section, or of the address of a function, uses an address that the code
computes when it runs.

A module `const` or `var` cannot use a layout symbol. The checker computes
these values, and the layout is not part of the language.
