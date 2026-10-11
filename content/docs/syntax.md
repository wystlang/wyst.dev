---
title: Syntax
summary: The grammar of Wyst on one page.
---

This page gives the full grammar of Wyst. The grammar has some forms that
the compiler does not implement now, such as `match` and `interface`.
[Status](/docs/status/) lists them. The pages of the
[Language tour](/docs/modules/) give the meaning of each form.

The grammar is a parsing expression grammar: `/` is an ordered choice,
`?` is optional, `*` is zero or more, and `+` is one or more.

## Words

Twenty keywords are reserved:

```text
import  pub  fn  struct  enum  interface  const  var
if  else  for  break  continue  return  match  goto
mut  xfer  linear  asm
```

No other word is reserved. A declaration, an import, a parameter, and a
local cannot take a builtin name, but a field and an argument can.
Attribute names, register names, register access kinds, and assembly
operand kinds are ordinary names. `in` and `at` have a meaning only in the
positions below. [Keywords and builtins](/docs/words/) lists each word.

## Lexical forms

```text
Name     <- [A-Za-z_] [A-Za-z0-9_]*     // not a keyword; '_' alone discards
VName    <- Name / [0-9] [0-9_]* [A-Za-z] [A-Za-z0-9_]*   // a variant name, such as 16K
Integer  <- [0-9] [0-9_]* / '0x' [0-9A-Fa-f_]+ / '0b' [01_]+
String   <- '"' (char / '\' [nrt0\\"] / '\x' hex hex)* '"'
Comment  <- '//' to the end of the line
Register <- an A64 register name from the A64 tables
List(A)  <- A (',' A)* ','?
```

There is no `;`. A newline ends a statement or a body entry, but not after
a binary operator, `,`, `.`, `(`, `[`, or `{`. A newline directly inside
`(...)` or `[...]` has no effect. In a `{...}` body, `,` also ends an
entry. `<` and `>` around type arguments are not operators.

A token of digits and then a letter, such as `16K`, is a variant name. It
is valid only after `.` and as a variant of an enum.

The body of an `asm` block is not Wyst. Each line of the body, up to the
first `}`, is one assembly line, and `//` starts a comment. A line cannot
have `{`.

## Files and declarations

```text
File       <- Import* Item*
Import     <- 'import' Name? Path
Path       <- Name ('.' Name)*
Item       <- Attrs? 'pub'? (Fn / Struct / Enum / Interface / Const / Var)
            / 'static_assert' '(' Expr ')'
Attrs      <- '#[' List(Name ('(' List(Expr) ')')?) ']'

Fn         <- 'fn' (Name '.')? Name TypeParams? Params ('->' Type)? Block
TypeParams <- '<' List(Name (':' Path)?) '>'
Params     <- '(' List(Param)? ')'
Param      <- Name ':' ('mut' / 'xfer')? Type ('in' Register)?

Struct     <- 'linear'? 'struct' Name TypeParams? (':' Type)? '{' Field* '}'
Field      <- Name ':' Name Type 'at' Expr ('{' Bits* '}')?   // register map
            / Bits                                         // #[bits]
            / Name ':' Type
Bits       <- Name ':' Type 'at' Expr ('..=' Expr)? ('=' Expr)?
Enum       <- 'linear'? 'enum' Name TypeParams? (':' Type)? '{' Variant* '}'
Variant    <- VName ('(' List(Type) ')')? ('=' Expr)?
Interface  <- 'interface' Name '{' ('fn' Name Params ('->' Type)?)* '}'
Const      <- 'const' Name (':' Type)? ('=' Expr)?
            / 'const' Name ':' Name Type '{' Bits* '}'          // #[sysreg]
Var        <- 'var' Name (':' Type)? '=' Expr
```

A file is a module. An item that starts with the builtin name
`static_assert` checks a constant and declares nothing. The register map
form of `Field` is valid only in a `#[register_map] struct`; its second
name is `readonly`, `writeonly`, or `readwrite`. The `Bits` form of
`Field` and the `:` type of a struct are valid only in a `#[bits] struct`.
Only a `#[mmio(address)]` or `#[sysreg]` `const` has no initializer.

## Types

```text
Type <- '@' Type                            // address
      / '[' ']' Type                        // slice
      / '[' Expr ']' Type                   // array
      / Path ('<' List(Type) '>')?
```

## Statements

```text
Block   <- '{' Stmt* '}'
Stmt    <- (Name ':')? (Bind / If / For / Match / Jump / Assign
                        / Expr ('else' Block)?)
Bind    <- ('const' / 'var') Name (':' Type ('in' Register)?)? '=' Expr
           ('else' Block)?
If      <- 'if' Expr Block ('else' (If / Block))?
For     <- 'for' (Name 'in' Expr (('..<' / '..=') Expr)? / Expr)? Block
Match   <- 'match' Expr '{' (List(Pattern) Block)* '}'
Pattern <- '.' VName ('(' List(Pattern) ')')? / Name
Jump    <- 'break' / 'continue' / 'return' Expr? / 'goto' Name
Assign  <- Expr ('=' / '+=' / '-=' / '*=' / '/=' / '%=' / '&=' / '|='
                 / '^=' / '<<=' / '>>=') Expr
```

## Expressions

```text
Expr    <- Unary (BinOp Unary)*
Unary   <- ('-' / '!' / '~' / '@' / 'xfer')* Postfix
Postfix <- Primary ('.' Name / Call / '[' Expr ']' / Slice / '?')*
Call    <- '(' List((Name '=')? 'mut'? Expr)? ')'
Slice   <- '[' Expr? '..<' Expr ']' / '[' Expr '..' ']'
Primary <- Integer / String / Name / '.' VName / '(' Expr ')'
         / '{' (Name '=' Expr)* '}' / '[' List(Expr)? ']'
         / If / Match / Asm

Asm     <- 'asm' ('(' List(AsmArg) ')')? ('->' AsmOut)? '{' line* '}'
AsmArg  <- 'scratch'? Name (':' Type)? ('in' Register)? ('=' Expr)?
AsmOut  <- AsmArg / '(' List(AsmArg) ')'
```

[Operators](/docs/operators/#precedence) gives the precedence of `BinOp`.
`.V` names a variant of the type that the context expects. `{f = v}` builds
a value of the type that the context expects, or gives the entries of a
vector table. A struct literal cannot be the direct condition of `if`,
`for`, or `match`.

## Limits

Expressions, blocks, and type arguments nest at most 128 levels deep. The
tree of an expression is at most 128 levels high: an operator, a field, an
index, a call, an `asm` block, and a struct literal are each one level
above their parts. The compiler recurses for each level, so the limit
keeps deep input from overflowing its stack.
