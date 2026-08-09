---
title: "Checked Assembly"
group: reference
section: memory-machine
order: 250
summary: "Typed assembly binders, admitted AArch64 source forms, stack clauses, effects, and control transfer."
---

# Checked Assembly

Checked `asm` uses typed signature binders and a physical instruction body.
The selected AArch64 source catalog defines accepted instruction lines.

[Functions and Control Flow](functions-and-control-flow.md) defines naked functions,
labels, and explicit register placement. [ABI Specification](abi.md) defines
boundary placement and register ownership.

<!-- wyst-contract: check-pass -->
```wyst
module functions.checked_asm

#target(arch = arm64-v8a, cpu = generic, el = 2)

fn identity(input: u64) -> u64 {
  return asm pure (
    value: u64 in x9 = input,
  ) -> value {
    nop
  }
}
```

The modifier order is `pure`, `align N`, then one stack clause.
The stack clauses are `preserves stack`, `establishes stack`, and `restores stack`.
`pure` cannot have an alignment or stack clause.
`pure` requires at least one normal value result.

An assembly signature can contain these parameter forms:

```text
name: Type in Register? = expression
name in Register? = expression
name: imm = constant_expression
name: symbol = declaration.path
scratch name: Type in Register?
```

Omit an empty parameter list.
The body uses binder names instead of surrounding source names.
A direct branch or call uses a `symbol` binder.
The compiler derives register and state effects from instruction rows.
There is no manual clobber list.

A bare result name ties the result to an ordinary input binder.
A typed result creates a fresh value.
Parenthesized results require at least two values.
Use `-> never` when the body has no normal exit.

A statement-only block must have a reachable normal exit.
A value block must establish each result on every normal exit.
An `asm -> never` block must not have a reachable normal exit.

The final instruction or local-label line must end with a newline before `}`.
The checker validates local branches, register use, instruction effects, and control transfer.
