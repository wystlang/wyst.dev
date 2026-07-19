---
title: "Appendix C: Wyst Documentation Example Contracts"
group: appendix
appendix: "C"
order: 27
summary: "Documentation example categories and normative example conventions."
---

# Appendix C: Wyst Documentation Example Contracts

## Example Scope

This appendix defines how manual examples claim language behavior and how
syntax sketches stay separate from normative examples.

Manual chapters may contain broad language sketches, but examples that claim
normative behavior use explicit contract comments immediately before a plain
`wyst` fence. Keeping the fence info string exactly `wyst` preserves Markdown
preview syntax highlighting in editors that do not split info-string tokens.

Use these contract modes:

- `<!-- wyst-contract: fmt -->`: the block is a complete source file and must already be
  in canonical `wync fmt` form.
- `<!-- wyst-contract: check-pass -->`: the block is a complete source file and must
  pass `wync check` with the documented default layout.
- `<!-- wyst-contract: check-fail -->`: the block is a complete source file and must
  fail `wync check` with a diagnostic.
- `<!-- wyst-contract: future -->`: the block shows future-version normative
  syntax that is not expected to compile yet. The feature must also have a row
  in [source-of-truth.md](source-of-truth.md).
- `<!-- wyst-contract: sketch -->`: the block is a syntax sketch rather than a normative
  example. A sketch may be incomplete, but every source spelling in it must be
  part of the current v0.9 grammar.
- `<!-- wyst-contract: historical-v0.8 -->`: the block is a read-only archival
  snapshot of source that used the v0.8 grammar. The harness requires at least
  one recognized predecessor spelling and never treats the block as accepted
  source. This mode is not a substitute for migrating a current example.

When a language feature changes syntax, examples in the same chapter change
with it. Plain `wyst` fences without a preceding contract comment are not
allowed in design docs.

Each design chapter that contains Wyst source fences must keep at least one
checked contract (`fmt`, `check-pass`, or `check-fail`) for current compiler
behavior. Use `sketch` only for fragments, pseudocode, or examples that rely
on features outside the current checker. Sketches still use current source
spellings. Use `future` only for syntax that is
future-version normative in [source-of-truth.md](source-of-truth.md) and is
expected not to compile yet. Use `historical-v0.8` only when the surrounding
text explicitly discusses an archival v0.8 design snapshot; current guidance
and examples are always migrated to v0.9.

## Checked Examples

This formatting example is a language contract:

<!-- wyst-contract: fmt -->
```wyst
module boot

import core.arch { cpu }

// comments are preserved by the formatter
fn _start() -> never {
  loop {
    cpu.wfe()
  }
}
```

This source is expected to pass frontend checking with the default documentation
layout:

<!-- wyst-contract: check-pass -->
```wyst
module boot

import core.arch { cpu }

fn _start() -> never {
  loop {
    cpu.wfe()
  }
}
```

This source is expected to fail semantic checking:

<!-- wyst-contract: check-fail -->
```wyst
module boot

fn _start() {
  const value: u64 = true
}
```

This is a syntax sketch:

<!-- wyst-contract: sketch -->
```wyst
module sketch.generics

fn identity<T>(value: T) -> T {
  return value
}
```

This read-only block records the predecessor spelling discussed by an archival
v0.8 note; it is not accepted by the current compiler:

<!-- wyst-contract: historical-v0.8 -->
```wyst
#module archive.boot

halt :: () #noreturn {
  loop {
    %wfe()
  }
}
```
