---
title: Installation
summary: Build the compiler, install QEMU, and set up your editor.
---

You need three things: the compiler, `wync`; QEMU, to run programs; and an
editor that formats Wyst files on save.

## The compiler

`wync` is a Rust program. Its source is in the `wystlang/wyst` repository,
which is private now. The repository pins the Rust toolchain in
`rust-toolchain.toml`, and `rustup` installs that toolchain on the first
build.

In a checkout of the repository, build the compiler:

```sh
cargo build --release --locked --manifest-path wync/Cargo.toml
```

The executable is `wync/target/release/wync`. Put it on your `PATH`, then
run it with no arguments. It prints its usage and stops with status 2:

```text
usage: wync build <file.wyst> --layout <layout-file> [--raw] -o <output>
       wync fmt [<path>...]
       wync fmt --check <path>...
```

`wync` has no other dependencies. It does not use LLVM, an assembler, or a
linker.

## QEMU

QEMU runs the programs on its `virt` board. On macOS, install it with
Homebrew:

```sh
brew install qemu
```

The compiler tests pass with QEMU 11.1.2. Pin the version that works for
you with `brew pin qemu`, and upgrade it as a separate step.
[Running on QEMU](/docs/qemu/) gives the command line.

## Your editor

`wync fmt` gives each file one standard form, as `gofmt` does. It has no
style options and no configuration file. With no path, it reads standard
input and writes standard output, so an editor can run it on save. For
example, in Zed or Gram:

```json
{
  "languages": {
    "Wyst": {
      "formatter": { "external": { "command": "wync", "arguments": ["fmt"] } },
      "format_on_save": "on"
    }
  }
}
```

A Wyst extension for Gram and Zed gives syntax highlighting for `.wyst` and
`.layout` files. It is not public now.
[Formatting](/docs/formatting/) describes the form that `wync fmt` gives.
