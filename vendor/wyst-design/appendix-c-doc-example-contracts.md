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
  example.

When a language feature changes syntax, examples in the same chapter change
with it. Plain `wyst` fences without a preceding contract comment are not
allowed in design docs.

Each design chapter that contains Wyst source fences must keep at least one
checked contract (`fmt`, `check-pass`, or `check-fail`) for current compiler
behavior. Use `sketch` only for fragments, pseudocode, or examples that rely
on features outside the current checker. Use `future` only for syntax that is
future-version normative in [source-of-truth.md](source-of-truth.md) and is
expected not to compile yet.

## Checked Examples

This formatting example is a language contract:

<!-- wyst-contract: fmt -->
```wyst
#module boot

// comments are preserved by the formatter
#noreturn
_start :: () {
  loop {
    %wfe()
  }
}
```

This source is expected to pass frontend checking with the default documentation
layout:

<!-- wyst-contract: check-pass -->
```wyst
#module boot

#noreturn
_start :: () {
  loop {
    %wfe()
  }
}
```

This source is expected to fail semantic checking:

<!-- wyst-contract: check-fail -->
```wyst
#module boot

_start :: () {
  value : u64 = true
}
```

This is a syntax sketch:

<!-- wyst-contract: sketch -->
```wyst
#module sketch.generics

identity<T> :: (value : T) -> T {
  return value
}
```
