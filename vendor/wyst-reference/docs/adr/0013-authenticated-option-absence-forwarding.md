---
status: accepted
---

# Add authenticated Option absence forwarding

Postfix `?` on an authentic `core.collections.Option<T>` creates two paths.
`.Some(value)` continues with `value`. `.None` returns
`core.collections.Option<U>.None` from the lexical function. `T` and `U` can
be different because the absence path has no payload. The operand is evaluated
once. The compiler authenticates the exact bundled `Option` declaration and
its `None` and `Some` variants in semantic checking and again in typed-IR
lowering. A same-shaped enum does not participate.

The absence path uses ordinary lexical return processing. It runs cleanup and
checks postconditions, storage outcomes, returned views, concurrency state,
and resource obligations. A stored affine option needs explicit transfer, as
in `(xfer pending)?`. `?` cannot escape deferred cleanup or a resume-only
handler. A direct interactive call keeps exact interactive failure forwarding
precedence. A returned stored option needs a second `?`.

## Considered options

A general `Try` protocol would add interface search and user-defined control
flow. Implicit conversion to `Result` would combine absence with error data.
An `else` or `orelse` form would add local recovery syntax. Shape-based
recognition would let lookalike enums acquire compiler control flow. These
options are outside the current design.

## Consequences

Semantic facts distinguish Option absence forwarding from exact interactive
failure forwarding and stored Result forwarding. Typed IR uses one enum-tag
dispatch and returns an authentic `None` on the absence edge. The former
Option and Result inspection and fallback helpers are removed.
`expect_or_trap` remains unchanged.
