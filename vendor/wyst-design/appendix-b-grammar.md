---
title: "Appendix B: Wyst Formal Grammar"
group: appendix
appendix: "B"
order: 26
summary: "Formal grammar, lexical rules, parsing forms, reserved syntax, and conformance."
---

# Appendix B: Wyst Formal Grammar

## Appendix Scope

This is the formal parsing reference. It uses names and concepts from the
language contracts. Rules tagged as reserved describe syntax that belongs to
the grammar vocabulary but is not part of the current language surface. The
feature-state registry in [source-of-truth.md](source-of-truth.md) decides
whether a parsed form is implemented, future-version normative, experimental,
reserved, deprecated, or removed.

## Notation

The grammar is written as a **Parsing Expression Grammar** (PEG). Each rule
has the form `Name <- expression`. Operators:

| Form         | Meaning                                                             |
| ------------ | ------------------------------------------------------------------- |
| `A B`        | sequence — match A, then B                                          |
| `A / B`      | **ordered** choice — try A; if it fails, try B                      |
| `A?`         | zero or one A                                                       |
| `A*`         | zero or more A                                                      |
| `A+`         | one or more A                                                       |
| `&A`         | positive lookahead — succeeds if A matches, consumes nothing        |
| `!A`         | negative lookahead — succeeds if A does NOT match, consumes nothing |
| `[abc]`      | character class                                                     |
| `'...'`      | literal terminal                                                    |
| `(A B)`      | grouping                                                            |
| `// comment` | comment in this document, not in the grammar                        |

Ordered choice is the key disambiguation device. Where the prose says
"`[` followed by a digit is an array type", the grammar encodes the same
rule by trying `ArrayType` before any other `[`-prefixed production.

Comma-separated lists written with a final `','?` accept one optional trailing
comma. The trailing comma is semantically inert and does not create an empty
element; leading commas and doubled commas remain malformed list syntax.

Terminal text in single quotes is matched after whitespace/comment
skipping (see §Lexical). Identifiers and reserved words are
distinguished by a longest-match rule: `ifoo` is one identifier, not
`if` followed by `oo`.

Rules tagged as reserved describe forms kept in the reference grammar's
reserved syntax vocabulary.

---

## 1. Lexical Structure

Wyst source files are UTF-8. Lexical spans are byte offsets into that UTF-8
source text, and the lexer does not normalize Unicode text before tokenization.

### 1.1 Whitespace and Comments

```peg
Whitespace   <- (Space / Newline / Comment)*
Space        <- ' ' / '\t'
Newline      <- '\r\n' / '\n' / '\r'
Comment      <- LineComment / BlockComment
LineComment  <- '//' (!Newline .)*
BlockComment <- '/*' (!'*/' .)* '*/'              // not nestable
```

Whitespace separates tokens but is otherwise insignificant. Wyst has no
indentation-significant syntax.

For source coordinates, every `Newline` spelling advances the logical line by
exactly one. In particular, `'\r\n'` is one newline token and one source-line
advance, not two. Lexical spans remain byte offsets into the original UTF-8
source text; newline normalization affects only line/column mapping and
newline-sensitive grammar decisions such as line comments.

### 1.2 Identifiers and Keywords

```peg
Identifier   <- !Keyword IdentStart IdentCont*
IdentStart   <- [a-zA-Z_]
IdentCont    <- [a-zA-Z0-9_]

Keyword <- ( 'select'
           / 'goto' / 'return' / 'if' / 'else'
           / 'while' / 'loop' / 'repeat' / 'break' / 'continue'
           / 'struct' / 'bitfield' / 'label'
           / 'as' / 'pub' / 'true' / 'false'
           ) !IdentCont
```

`Keyword` matches only if the next character is not an `IdentCont`,
which prevents `loop` from matching the prefix of `loopback`.

`enum`, `switch`, `case`, and `is` are contextual syntax words in the grammar
below: they are parsed by exact identifier text in declaration, statement,
pattern, or expression positions rather than reserved by the lexer. They
remain unavailable as names in those specific syntactic positions.

Built-in type names such as `bool`, `string`, `u64`, and `f32` are not
lexer keywords. They are identifiers that resolve as built-in types in type
contexts.

Identifiers, keywords, directive names, and runtime primitive names are
intentionally ASCII-only. Non-ASCII text is valid in comments and string
literal contents, but not in user-defined names.

### 1.3 Directives, Compile-Time Forms, and Runtime Primitives

```peg
Directive        <- '#' DirectiveName
RuntimePrimitive <- '%' IdentStart IdentCont*

DirectiveName <- ( 'import' / 'module' / 'target' / 'requires'
                 / 'if' / 'else'
                 / 'static_assert' / 'align' / 'section' / 'region' / 'entry'
                 / 'naked' / 'noescape' / 'inline' / 'initcall' / 'noreturn'
                 / 'pin'
                 / 'weak' / 'hidden'                  // future-version normative — lexed for diagnostics, rejected today
                 / 'ventry' / 'exception_vector' / 'trap_frame' / 'packed'
                 / 'schedule' / 'asm'
                 / 'frame' / 'exact'
                 / 'acquire' / 'release'
                 / 'likely' / 'unlikely' / 'cold' / 'partial'
                 / 'shared'
                 / 'repr'
                 / 'size_of' / 'align_of' / 'field_offset'
                 / 'addr_of' / 'start' / 'end'
                 / 'cache_line_width' / 'tag_of'
                 / 'percpu_offset_of' / 'tls_offset_of'
                 / 'trusted_cast'
                 / 'deny'
                 / 'dedent'
                 / 'percpu' / 'tls'
                 ) !IdentCont
```

Directives, compile-time forms, and layout-time forms starting with `#` are
syntactically distinct from identifiers and cannot be shadowed by user names.
The `@` prefix is reserved for address types and address qualifiers.
Runtime-lowered compiler primitives use `%` (`%nop()`, `%mrs(...)`, etc.) and
cannot be shadowed by user names. The full runtime primitive table lives in
[chapter-11-intrinsics.md](chapter-11-intrinsics.md) (§1.3.2 through §1.3.7) and
[chapter-09-memory-model.md §1.3.1](chapter-09-memory-model.md) (`@volatile`
and `@mmio` address qualifiers).

`#weak` and `#hidden` are future-version normative for
`wyst.language.v0.8` target 33. The current compiler recognizes both spellings
for diagnostics and rejects them; Appendix B lists them only so tooling can
preserve the token and produce the version-gated diagnostic.

### 1.4 Numeric Literals

```peg
IntLiteral   <- HexLiteral / BinLiteral / OctLiteral / DecLiteral
HexLiteral   <- '0x' HexDigit ('_'? HexDigit)*
BinLiteral   <- '0b' BinDigit ('_'? BinDigit)*
OctLiteral   <- '0o' OctDigit ('_'? OctDigit)*
DecLiteral   <- DecDigit ('_'? DecDigit)*

HexDigit     <- [0-9a-fA-F]
BinDigit     <- [01]
OctDigit     <- [0-7]
DecDigit     <- [0-9]

FloatLiteral <- DecDigits '.' DecDigits Exponent?
              / DecDigits Exponent
DecDigits    <- DecDigit ('_'? DecDigit)*
Exponent     <- [eE] [+-]? DecDigits
```

`_` is a digit separator: legal between any two digits, illegal at the
start or end of a literal, illegal in runs of two or more. The parser
strips `_` after lexing. Decimal exponent-only forms such as `1e6` are
`FloatLiteral`s. Hexadecimal floating-point literals such as `0x1.fp3` are not
Wyst syntax. Type suffixes (`5_u8`, `1.0_f32`) are rejected. Use a type
annotation or categorized conversion instead.

### 1.5 String Literals

```peg
StringLiteral   <- SimpleString / MultilineString
SimpleString    <- '"' (StringChar / EscapeSeq)* '"'
StringChar      <- !('"' / '\\' / Newline) .
EscapeSeq       <- '\\' ( '"' / '\\' / 'n' / 't' / 'r' / '0' / 'x' HexDigit HexDigit )

MultilineString <- '"""' '\\'? (!('"""') (Newline / EscapeSeq / .))* '\\'? '"""'
```

A multi-line literal's first/last newline is suppressed by a trailing
`\` immediately before/after the delimiter (see [chapter-06-types.md §1.11](chapter-06-types.md)).
`#dedent "..."` is parsed as the directive
`#dedent` applied to a following multiline string and is handled at
constant-folding time.

String literal text is UTF-8 source text plus the listed escape sequences.
The runtime `string` value stores the exact resulting bytes; byte length,
code point counting, and grapheme handling are type/library concerns, not
lexer behavior.

In a typed initializer for `[N]u8`, a string literal initializes the fixed byte
array after escape processing: decoded length less than `N` is zero-filled,
decoded length equal to `N` is an exact fit, and decoded length greater than
`N` is rejected. This is semantic binding of an existing `StringLiteral`
expression, not a separate lexical form.

### 1.5.1 Character Literals

```peg
CharLiteral <- "'" (CharChar / CharEscape) "'"
CharChar    <- ASCIIChar - ("'" / '\\' / Newline)
ASCIIChar   <- [\x00-\x7f]
CharEscape  <- '\\' ( "'" / '\\' / 'n' / 't' / 'r' / '0' / 'x' HexDigit HexDigit )
```

A character literal is a single ASCII source character or escape sequence
enclosed in single quotes. It has type `u8`; its value is the ASCII byte for a
direct character, or the byte produced by the escape sequence. Direct
characters outside the ASCII range (`0x00`–`0x7F`) are rejected rather than
truncated. UTF-8 text belongs in string literals; non-ASCII bytes in character
literals must be written explicitly with `\xHH`.

Character literals share string escapes for backslash, control bytes, and
`\xHH` byte values, exclude `\"`, and add `\'`.

### 1.6 Punctuation and Operator Tokens

The following multi-character tokens are recognized greedily (longest
match wins). The lexer commits to the longest token at each position:

```text
::=  ::  :=  ->
==  !=  <=  >=  <<  >>  &&  ||
+=  -=  *=  /=  %=  %%=
&=  |=  ^=  <<=  >>=  &&=  ||=  &^=
&^  %%
..  ::
```

Single-character tokens: `+ - * / % & | ^ ~ ! < > = ( ) [ ] { } , . : ; ? @ #`.

The `#` token begins a directive or compile-time query token. Some directives
are only valid in statement or declaration positions, while compile-time query
forms such as `#size_of(T)` and `#len(arr)` are valid expressions. The `@`
token at the start of a type position begins an address type or address qualifier (`@T`,
`@volatile T`, `@mmio T`). The `%` token starts a runtime primitive in prefix expression
position and remains the remainder operator in infix expression position.

### 1.7 Boolean and Null Literals

```peg
BoolLiteral  <- 'true' !IdentCont / 'false' !IdentCont
```

`null` is **not** a literal in Wyst — see the type-system chapter
([chapter-06-types.md §1.4.1](chapter-06-types.md)) for the chosen treatment of address
zero.

---

## 2. Types

The type sublanguage is parsed by the `Type` rule. Types appear in
declarations, function signatures, struct fields, categorized conversions
(`as.<category> T`), and a few directives (`#static_assert(#size_of(T), ...)`).
The disambiguation
between `[N]T` (array type), `[T:N]` (vector type), `[]T` (slice type),
`[dynamic]T` (dynamic array descriptor type), and `T@[expr]`
(memory load expression) lives entirely in the lookahead encoded below.

```peg
Type
    <- SliceType                          // '[' ']'
     / DynamicArrayType                   // '[' 'dynamic' ']'
     / VectorType                         // '[' ident ':' integer
     / ArrayType                          // '[' digit-or-const, no ':'
     / FnPointerType                      // '@' '(' ...
     / AddressType                        // '@' Type, '@volatile' Type, or '@mmio' Type
     / TupleType                          // '(' field-list ')'   (return position only)
     / NamedType

ArrayType   <- '[' ConstExpr ']' Type                  // [3]u8, [16]u8
VectorType  <- '[' NamedType ':' ConstExpr ']'         // [u8:16], [f32:4]
SliceType   <- '[' ']' Type                            // []u64, []u8
DynamicArrayType <- '[' 'dynamic' ']' Type             // [dynamic]Token

GenericTypeParamList
    <- '<' GenericTypeParam (',' GenericTypeParam)* ','? '>' // type params; builtin/duplicate names rejected

GenericTypeArgList
    <- '<' Type (',' Type)* ','? '>'                   // type args; nesting allowed

FnPointerType
    <- '@' CallingConv? '(' ParamTypeList? ')' ('->' ReturnType)?

AddressType
    <- '@' 'mmio' Type                                 // @mmio T
     / '@' 'volatile' Type                             // @volatile T
     / '@' Type                                        // @T

TupleType   <- '(' NamedField (',' NamedField)* ','? ')' // for multi-return
NamedField  <- Identifier ':' Type

NamedType   <- Identifier ('.' Identifier)* GenericTypeArgList?
                                                        // module-qualified name OK; args bind to final name

CallingConv <- '[' Identifier ']'                      // [aapcs], etc.

ParamTypeList <- Type (',' Type)* ','?
ReturnType    <- Type / TupleType
```

`TupleType` is recognized by `Type` so diagnostics can point at the exact
shape, but semantic analysis currently accepts tuple types only as
multi-return values and related result storage. Tuple parameters in ordinary
functions or function pointer types are a future surface:

<!-- wyst-contract: future -->
```wyst
accept_pair :: (pair : (x: u64, y: u64)) { }
```

Wyst generics use angle-bracket type parameter and type argument lists.
Both list forms are non-empty; `Box<>` and `swap<>()` are rejected. The entries
in declaration `<...>` lists are type-parameter names; the entries in
instantiation `<...>` lists are full `Type` forms, so nested generic type
arguments such as `Pair<Box<u64>, Error>` are allowed. Generic instantiations
require explicit type arguments; Wyst does not infer omitted type arguments from
value arguments. Type argument arity is exact: no defaults and no omitted
arguments are supported. Type parameter lists may appear on function, struct,
and enum declarations. No casing convention is enforced, but built-in type
names such as `u32`, `bool`, and `string` cannot be type parameter names, and
duplicate parameter names such as `Pair<T, T>` are rejected. A declaration type
parameter may include one built-in compile-time capability bound:

```peg
GenericTypeParamList <- '<' GenericTypeParam (',' GenericTypeParam)* ','? '>'
GenericTypeParam     <- Identifier (':' GenericBound)?
GenericBound         <- 'integer'
                      / 'unsigned_integer'
                      / 'signed_integer'
                      / 'float'
                      / 'numeric'
                      / 'scalar'
                      / 'address'
                      / 'bitfield'
                      / 'payload_word'
```

The bound names are recognized only in generic bound position, not as global
keywords. User-defined bounds such as `T: Comparable` are not part of Wyst's
generic syntax. Compile-time value parameters such as `Foo<T, 4>` are outside
the model; fixed arrays continue to use `[N]T`.

**Disambiguation of `[`-prefixed forms in type position:**

The three array-bracket forms above are tried in order. They are
unambiguous by their first non-`[` token:

| First-token after `[`                                                | Production matched |
| -------------------------------------------------------------------- | ------------------ |
| digit, hex literal, `(`, or an identifier known to denote a constant | `ArrayType`        |
| `]`                                                                  | `SliceType`        |
| identifier followed by `:`                                           | `VectorType`       |

In a strict PEG, "known to denote a constant" is not available; instead
the parser tries `ArrayType` first and `VectorType` second, and lets the
constant-expression parser reject non-constant bracket contents:

```peg
ConstExpr <- ConstOrExpr
ConstOrExpr <- ConstAndExpr ('||' ConstAndExpr)*
ConstAndExpr <- ConstCompareExpr ('&&' ConstCompareExpr)*
ConstCompareExpr <- ConstBitOrExpr (CmpOp ConstBitOrExpr)?
ConstBitOrExpr <- ConstBitXorExpr ('|' ConstBitXorExpr)*
ConstBitXorExpr <- ConstBitAndExpr ('^' ConstBitAndExpr)*
ConstBitAndExpr <- ConstShiftExpr (('&^' / '&') ConstShiftExpr)*
ConstShiftExpr <- ConstAddExpr (('<<' / '>>') ConstAddExpr)*
ConstAddExpr <- ConstMulExpr (('+' / '-') ConstMulExpr)*
ConstMulExpr <- ConstUnaryExpr (('*' / '/' / '%%' / '%') ConstUnaryExpr)*
ConstUnaryExpr <- ('+' / '-' / '~' / '!') ConstUnaryExpr / ConstPrimaryExpr
ConstPrimaryExpr <- Literal
                  / CompileTimeForm
                  / BareName       // resolved to a visible `::`-bound constant in sema
                  / '(' ConstExpr ')'
```

The implementation parses the same expression syntax in const contexts and
then requires the resulting expression to be a deterministic compile-time or
layout-time value in the semantic phase. The grammar above is the
non-left-recursive subset that can be implemented directly for const-only
parsers; accepting the broader `Expr` syntax at parse time must not make
non-constant values legal in const contexts.

A bracket containing an identifier that turns out to be a _variable_
rather than a visible top-level or local `::`-bound constant is rejected as a
semantic error ("array length must be a compile-time constant",
[chapter-06-types.md §1.5.1](chapter-06-types.md)).

For top-level declarations, "visible" includes visible top-level constants
declared later in source order; the compiler evaluates those references only
if their dependency graph is acyclic. For block-scoped local constants,
"visible" remains lexical and excludes later local declarations.

---

## 3. Expressions

Expressions are parsed with a Pratt-style precedence climbing layered
over the PEG. The grammar below names each precedence level explicitly;
each level matches a single binary operator class.

### 3.1 Precedence Table

From lowest (parses outermost) to highest (parses innermost):

| Level | Operators                   | Associativity   |
| ----- | --------------------------- | --------------- |
| 1     | `\|\|`                      | left            |
| 2     | `&&`                        | left            |
| 3     | `==` `!=` `<` `<=` `>` `>=` | non-associative |
| 4     | `\|`                        | left            |
| 5     | `^`                         | left            |
| 6     | `&` `&^`                    | left            |
| 7     | `<<` `>>`                   | left            |
| 8     | `+` `-`                     | left            |
| 9     | `*` `/` `%` `%%`            | left            |
| 10    | `as`                        | left            |
| 11    | unary `+ - ~ !`             | prefix          |
| 12    | postfix `( )`, `[ ]`, `.`   | left            |

Level 3 is non-associative: `a < b < c` is a parse error.

### 3.2 Expression Rules

```peg
Expr        <- OrExpr
OrExpr      <- AndExpr ('||' AndExpr)*
AndExpr     <- CmpExpr ('&&' CmpExpr)*
CmpExpr     <- IsExpr (CmpOp IsExpr)?                  // non-associative
CmpOp       <- '==' / '!=' / '<=' / '>=' / '<' / '>'
IsExpr      <- BitOrExpr ('is' EnumPattern)?           // enum variant test, same precedence as comparison
EnumPattern <- (Identifier '.')? Identifier SwitchBindingList?
BitOrExpr   <- BitXorExpr ('|' BitXorExpr)*
BitXorExpr  <- BitAndExpr ('^' BitAndExpr)*
BitAndExpr  <- ShiftExpr (BitAndOp ShiftExpr)*
BitAndOp    <- '&^' / '&'
ShiftExpr   <- AddExpr (ShiftOp AddExpr)*
ShiftOp     <- '<<' / '>>'
AddExpr     <- MulExpr (AddOp MulExpr)*
AddOp       <- '+' / '-'
MulExpr     <- CastExpr (MulOp CastExpr)*
MulOp       <- '*' / '/' / '%%' / '%'
CastExpr    <- UnaryExpr ('as' '.' ConversionCategory Type)*
ConversionCategory
    <- 'widen'
     / 'truncate'
     / 'signedness'
     / 'numeric'
     / 'bits'
     / 'address'
     / 'lens'
     / 'qualifier'
     / 'float'
UnaryExpr   <- UnaryOp UnaryExpr / PostfixExpr
UnaryOp     <- '+' / '-' / '~' / '!'

PostfixExpr <- PrimaryExpr PostfixOp*
PostfixOp
    <- GenericTypeArgList                              // generic apply — f<T>, Result<T, E>
     / '(' ArgList? ')'                                // call (expression position)
     / '[' SliceOrIndex ']'                            // index or slice
     / '.' Identifier                                  // field access

ArgList     <- CallArg (',' CallArg)* ','?
CallArg     <- Identifier '=' Expr                     // labeled (load-bearing on `dyn_array_init` and `reserve`)
             / OrderArg                                // intrinsic-only trailing marker
             / Expr
OrderArg    <- 'order' ':' MemoryOrder                 // atomic intrinsics only — see §11
MemoryOrder <- 'relaxed' / 'acquire' / 'release' / 'acqrel' / 'seq_cst'
SliceOrIndex
    <- Expr ':' Expr?                                  // a[lo:hi]  or  a[lo:]
     / ':' Expr?                                       // a[:hi]    or  a[:]
     / Expr                                            // a[i] array/slice index

PrimaryExpr
    <- MemoryLoad                                      // T@[addr]  or  [T:N]@[addr]
     / SliceConstruct                                  // []T{data = addr, len = n}
     / CompileTimeIfExpr                               // #if cond { a } #else { b }
     / CompileTimeForm                                 // #size_of(T), #len(arr), #addr_of(sym), #start(.text)
     / RuntimePrimitiveCall                           // %name(args)
     / SelectCall                                      // select(cond, a, b)
     / IfExpr
     / ArrayLiteral                                    // {a, b, c}
     / StructLiteral                                   // S{f: v, ...}
     / TupleLiteral                                    // (a, b)
     / Literal
     / ParenExpr
     / BareName

Literal     <- IntLiteral / FloatLiteral / StringLiteral / CharLiteral / BoolLiteral
ParenExpr   <- '(' Expr ')'
BareName    <- Identifier ('.' Identifier)*           // module-qualified name OK

SliceConstruct
    <- '[' ']' Type '{' SliceConstructField (',' SliceConstructField)* ','? '}'
SliceConstructField
    <- 'data' '=' Expr
     / 'len' '=' Expr
```

`is` is implemented for enum variant tests. Direct `if value is Variant(name)`
conditions may introduce an immutable payload binding in the true block.
Payload bindings in compound boolean conditions and negated `is` patterns are
reserved/current-rejected; use a direct `if` or `switch` when a binding is
needed. Nested enum patterns and tuple payload patterns are also
reserved/current-rejected.

`<...>` after a value path is parsed as `GenericTypeArgList` only when the
matching `>` is followed by a valid generic-application follower: `(`, `{`,
`)`, `[`, `]`, `.`, `,`, `;`, `}`, or end of file. Otherwise `<` and `>` keep
their comparison-token roles. This lets `f<T>(x)` parse as a generic call while
`a < b > c` remains comparison syntax and is later rejected as a chained
comparison when applicable.

`SliceConstruct` requires exactly one `data` field and exactly one `len`
field. The fields may appear in either order. In constant/global initializer
contexts, `data` must be a compile-time address value and `len` must be a
constant non-negative integer expression.

### 3.3 Memory Loads (the `T@[addr]` family)

Memory loads use an explicit `@[` address marker so typed memory access is
syntactically distinct from array, slice, and dynamic-array indexing.

```peg
MemoryLoad
    <- ScalarLoad
     / VectorLoad

ScalarLoad
    <- ScalarLoadType '@' '[' Expr ']'                // u32@[addr]  /  Header@[addr]
ScalarLoadType
    <- PrimitiveIntType
     / 'f32' / 'f64'
     / NamedType                                       // user-declared struct/bitfield

VectorLoad
    <- '[' NamedType ':' ConstExpr ']' '@' '[' Expr ']' // [u8:16]@[addr]

PrimitiveIntType
    <- 'u8' / 'u16' / 'u32' / 'u64'
     / 'i8' / 'i16' / 'i32' / 'i64'
```

**Disambiguation between `ScalarLoad` and a name-followed-by-index:**

The `@[` token sequence is the syntactic boundary. `name[expr]` is always an
`Index` expression. `Name@[expr]` is parsed as `ScalarLoad` when the left side
matches `ScalarLoadType`; semantic analysis then resolves `Name` as a type and
rejects value names used in the type position. No symbol-classification
side-table is needed for parsing.

An identifier classified as a type is legal only in a type context or in
the type operands of `#size_of`, `#align_of`, and `#field_offset`. `#len`
takes a storage path and queries its fixed-array type; it does not make type
names into values. For example, `x := u64` and `x := MyStruct` are compile
errors unless `u64` or `MyStruct` names a value, which built-in types and
user-declared types do not.

**Disambiguation between `VectorLoad` and `VectorType`:**

A `VectorType` is `[T:N]` with nothing after it (used in declarations).
A `VectorLoad` is `[T:N]@[addr]`. The required `@[` after `[T:N]` is the
syntactic marker that makes the form an expression.

In _type_ position, only `VectorType` is tried — `VectorLoad` is not a
type.

### 3.4 Compile-Time/Layout-Time Forms and Runtime Primitive Calls

```peg
CompileTimeForm
    <- '#size_of' '(' Type ','? ')'
     / '#align_of' '(' Type ','? ')'
     / '#len' '(' StoragePath ','? ')'
     / '#field_offset' '(' Type ',' Identifier ','? ')'
     / '#addr_of' '(' BareName ','? ')'
     / '#start' '(' SectionName ','? ')'
     / '#end' '(' SectionName ','? ')'
     / '#cache_line_width' '(' ')'
     / '#tag_of' '(' Expr ','? ')'
     / '#percpu_offset_of' '(' Expr ','? ')'
     / '#tls_offset_of' '(' Expr ','? ')'
     / '#trusted_cast' '<' FnPointerType '>' '(' Expr ','? ')'

CompileTimeIfExpr
    <- '#if' Expr Block ('#else' (CompileTimeElseIfExpr / Block))?
CompileTimeElseIfExpr
    <- 'if' Expr Block ('#else' (CompileTimeElseIfExpr / Block))?

StoragePath
    <- BareName ('.' Identifier)*

RuntimePrimitiveCall
    <- '%addr_of' '(' BareName ','? ')'
     / '%tag_of' '(' Expr ','? ')'
     / EndianRuntimePrimitive '<' PrimitiveIntType '>' '(' ArgList? ')'
     / RuntimePrimitive '(' ArgList? ')'

EndianRuntimePrimitive
    <- '%load_be' / '%load_le' / '%store_be' / '%store_le'

SectionName
    <- '.' Identifier
```

The compiler maintains a fixed table of runtime primitive names and arities.
Calling an undeclared runtime primitive is a compile error. The full runtime
primitive table is specified in [chapter-11-intrinsics.md](chapter-11-intrinsics.md) (§1.3.2–§1.3.7).
`#start(section)` and `#end(section)` share the `CompileTimeForm` grammar arm
for syntax, but their values are layout-time constants resolved only after
final section placement.
Endian load/store primitives require the explicit type argument shown above;
the grammar intentionally accepts any `PrimitiveIntType` so parsing and editor
tooling can preserve the call shape. Semantic analysis rejects `u8`/`i8` and
reports the diagnostic on the type argument because byte order does not apply
to single-byte values.

### 3.5 Select (Branchless Conditional)

```peg
SelectCall
    <- 'select' '(' Expr ',' Expr ',' Expr ','? ')'
```

`select` is a keyword, not a runtime primitive (no `%` prefix). It takes exactly
three arguments: a `bool` condition, a true-arm expression, and a false-arm
expression. Both arms must have the same type. The result type equals the arm
type. See [chapter-07-operators.md](chapter-07-operators.md) for semantics and supported types.

### 3.6 If Expressions

```peg
IfExpr
    <- 'if' Expr Block 'else' Block                   // both branches required for expr form
```

An `IfExpr` requires an `else` branch. `if` without `else` is only legal
as a statement (§4).

### 3.7 Literals (Composite)

```peg
ArrayLiteral   <- '{' (Expr (',' Expr)* ','?)? '}'
StructLiteral  <- NamedType '{' (FieldInit (',' FieldInit)* ','?)? '}'
FieldInit      <- Identifier ':' Expr
TupleLiteral   <- '(' Expr ',' Expr (',' Expr)* ','? ')' // 2+ elements; (a) is ParenExpr
```

`{...}` is an array literal when its elements are homogeneous expressions
with no `field:` prefix; a `StructLiteral` requires the type name first
to disambiguate from a block.

A `StringLiteral` may also appear as the initializer expression for a typed
`[N]u8` declaration; semantic analysis expands it to the same byte array that
an explicitly zero-padded brace literal would produce.

### 3.8 Address-Of

`#addr_of(name)` is parsed by `CompileTimeForm` and is the only form that
takes a function, label, global, or other compile-time symbol name as an
address value. `%addr_of(name)` is parsed by `RuntimePrimitiveCall` and takes
a stack-local storage name, producing a stack-frame address with no relocation.
Bare function names and fixed-array names are not implicitly address-of'd
([chapter-08-functions.md §2.6](chapter-08-functions.md); [chapter-06-types.md §1.5.1](chapter-06-types.md)). For
non-function symbols, `#addr_of(symbol)` needs an explicit address or integer
context rather than defaulting the lens in an inferred binding. Stack-local
`%addr_of(local)` follows the same no-default-lens rule and needs an explicit
address context or cast.

---

## 4. Statements

```peg
Statement
    <- Block
     / IfStmt
     / WhileStmt
     / LoopStmt
     / RepeatStmt
     / SwitchStmt
     / BreakStmt
     / ContinueStmt
     / ReturnStmt
     / GotoStmt
     / AsmBlock
     / DirectiveStmt
     / Declaration
     / AssignStmt
     / ExprStmt

Block       <- '{' Statement* '}'
BranchHint  <- '#likely' / '#unlikely'
IfStmt      <- 'if' BranchHint? Expr Block ('else' (IfStmt / Block))?
WhileStmt   <- 'while' BranchHint? Expr Block
LoopStmt    <- 'loop' Block
RepeatStmt  <- 'repeat' Expr (',' Identifier)? Block
SwitchStmt  <- '#partial'? 'switch' Expr '{' SwitchArm* '}'
SwitchArm   <- SwitchCaseArm / SwitchElseArm
SwitchCaseArm
    <- 'case' SwitchVariant (',' SwitchVariant)* ','? ':' SwitchArmBody
SwitchElseArm
    <- 'else' ':' SwitchArmBody
SwitchVariant
    <- (Identifier '.')? Identifier SwitchBindingList?
SwitchBindingList
    <- '(' Identifier (',' Identifier)* ','? ')'
SwitchArmBody
    <- Block / Statement

BreakStmt   <- 'break'
ContinueStmt <- 'continue'
ReturnStmt  <- 'return' Expr?

GotoStmt    <- 'goto' BareName
```

`switch` is a statement, not an expression. `#partial` is legal only
immediately before `switch` and opts out of the exhaustiveness check
performed after parsing. `else` must be the final arm. A switch arm body
is either a braced block or one statement; use a block for multiple
statements. `SwitchVariant` accepts either an inferred variant name
(`case Ready:`) or an explicit enum-qualified name (`case State.Ready:`).
Bindings are shallow payload names; nested patterns are rejected by the
semantic enum rules.

### 4.1 Function Call Statement Form

A statement-position function call is an `ExprStmt` whose top-level postfix
expression ends in an argument list. Wyst has no `call` keyword.

```peg
ExprStmt <- Expr                       // semantically restricted
```

Statement-position call shapes:

```peg
f '(' ')'
f '(' x ',' y ')'
table '[' i ']' '(' ')'         // call through computed function pointer
```

An `ExprStmt` whose top-level expression is not a function call or runtime
primitive call is a semantic error. This keeps stray expression statements
like `x + y` illegal while allowing ordinary calls such as `init_uart()`.

### 4.2 Goto Statement Form

```peg
GotoStmt <- 'goto' BareName
```

`goto` takes only a bare label name (possibly module-qualified via the
`BareName` dotted form). It does not accept an expression, a computed
target, or a label literal. Scope rules (where `goto` is legal) are
specified in [chapter-08-functions.md §2.4](chapter-08-functions.md) / §2.5 and enforced after
parse:

- Legal inside the body of a `label` or `#ventry` slot.
- Illegal inside a function body (the diagnostic suggests `return`).
- Target must resolve to a `label` declaration visible by name (same
  module or `#import`ed module).

### 4.3 Declarations and Assignments

```peg
Declaration
    <- LocalDecl
     / ConstDecl
     / FnDecl
     / StructDecl
     / EnumDecl
     / BitfieldDecl
     / LabelDecl
     / GlobalDecl
     / ExceptionVectorDecl

LocalDecl
    <- Identifier ':' Type PinAttr? ('=' Expr)?              // x : u64 #pin(x19) = 0
     / Identifier ':=' Expr                                  // x := expr
     / Identifier '::' Type '=' ConstExpr                    // local constant
     / Identifier '::=' ConstExpr                            // inferred local constant
     / TupleBindingList ':=' Expr                            // _, ok := %cas(...)
     / Identifier ':' Type '=' Expr                          // x : u64 = 0

TupleBindingList <- Identifier (',' Identifier)+ ','?

ConstDecl   <- Identifier '::' Type '=' ConstExpr            // PI :: f64 = 3.14
             / Identifier '::=' ConstExpr                    // BASE ::= 0x4000

PinAttr     <- '#pin' '(' RegisterName ')'
NoEscapeAttr <- '#noescape'
RegisterName
    <- ('x' / 'w') [0-9]+                                    // x0..x30, w0..w30
     / ('v' / 'd' / 's') [0-9]+
     / 'sp' / 'lr' / 'fp'

AssignStmt
    <- AssignTarget AssignOp Expr
AssignTarget
    <- BareName ('.' Identifier)*                            // x  /  x.field
     / MemoryLoad                                            // u32@[addr]  (write form)
AssignOp
    <- '=' / '+=' / '-=' / '*=' / '/=' / '%=' / '%%='
     / '&=' / '|=' / '^=' / '&^=' / '<<=' / '>>='
     / '&&=' / '||='
```

When `MemoryLoad` appears on the left of `AssignStmt`, the parse is
identical to the read form; semantic analysis turns it into a store.
Field-path assignment is also semantic: slice projections `.data` and `.len`
are read-only, so changing either requires assigning a whole `[]T` value.

For typed `LocalDecl`, `GlobalDecl`, and typed `ConstDecl`, a `StringLiteral`
initializer is valid for `[N]u8` and is zero-filled to `N` bytes after escape
processing. Other array element types require ordinary expressions or brace
array literals.

`Identifier '::' Type '=' ConstExpr` and `Identifier '::=' ConstExpr` are
context-sensitive declaration forms: in statement position they introduce
block-scoped local constants; at top level they are `ConstDecl`.
Top-level `ConstDecl` references to other visible top-level constants are
source-order independent when acyclic; block-scoped local constants are
visible only after their declaration.

### 4.4 Tuple Destructuring

```peg
TupleDecl
    <- '(' Identifier (',' Identifier)+ ','? ')' '=' Expr
```

The RHS must produce a tuple type whose arity matches the LHS. Used
exclusively for multi-return function calls
([chapter-08-functions.md §2.2.1](chapter-08-functions.md)).

### 4.5 Directive Statements

A subset of directives are statements (they appear inside function or
label bodies). The full directive list above:

```peg
DirectiveStmt
    <- StaticAssert
     / CompileTimeIf
     / AcquireDirective                                      // legacy form — see §1.3.1
     / ReleaseDirective                                      // legacy form — see §1.3.1

StaticAssert
    <- '#static_assert' '(' Expr ',' StringLiteral ','? ')'
CompileTimeIf
    <- '#if' Expr Block ('#else' (CompileTimeElseIf / Block))?
CompileTimeElseIf
    <- 'if' Expr Block ('#else' (CompileTimeElseIf / Block))?

AcquireDirective <- '#acquire' MemoryLoad
ReleaseDirective <- '#release' AssignTarget '=' Expr
```

`CompileTimeIf` selects a compile-time branch. The same `#if` form is
implemented as a top-level item, as a statement, and as an expression.
Expression-valued `#if` requires an `#else` branch during semantic checking.
Compile-time checks use `#static_assert` and the query forms in §3.4.

Barriers are runtime primitives (`%dsb(domain)`, `%dmb(domain)`, `%isb()`,
`%compiler_barrier()`), not directives.

`#acquire` and `#release` remain valid per-access annotations for
explicit synchronization. There is no per-access `#volatile` directive:
per-access volatility was removed, so declare volatility at the
address-type level with `@volatile T` or MMIO intent with `@mmio T` (see
chapter-09 §1.3).

### 4.6 Inline Assembly Statement

```peg
AsmBlock
    <- '#asm' AsmOptions? '{' AsmSection* AsmBody '}'

AsmOptions
    <- '(' AsmOption (',' AsmOption)* ','? ')'
AsmOption
    <- 'pure'
     / 'sets_sp'                                             // #naked verifier
     / 'preserves_sp'                                        // #naked verifier
     / 'align' '(' ConstExpr ','? ')'
     / 'effects' ':' EffectSpec

EffectSpec
    <- 'none'                                                // no architectural effects
     / EffectList                                            // specific effect categories

AsmSection
    <- 'inputs'   '{' AsmOperandList? '}'
     / 'outputs'  '{' AsmOperandList? '}'
     / 'clobbers' '{' AsmClobberList? '}'
     / 'options'  '{' AsmOption (',' AsmOption)* ','? '}'
AsmBody
    <- 'body' '{' AsmInstruction* '}'

AsmOperandList <- AsmOperand (',' AsmOperand)* ','?
AsmOperand     <- Identifier '=' AsmConstraint
AsmConstraint
    <- ('gpr' / 'inout_gpr' / 'fp' / 'inout_fp' / 'imm' / 'mem') '(' Expr ','? ')'

AsmClobberList <- AsmClobber (',' AsmClobber)* ','?
AsmClobber
    <- RegisterName
     / 'memory'
     / 'cc'

AsmInstruction <- AsmInstrTextLine                           // raw assembly until newline
```

Sections must appear in the order `inputs`, `outputs`, `clobbers`,
`options`, `body` (the prose enforces this). The grammar uses ordered
choice on `AsmSection*` to surface a precise diagnostic for
out-of-order sections rather than failing the parse silently.

`AsmInstrTextLine` is a flat character stream until end-of-line, scanned
by a sublexer that recognizes operand references (`{name}`,
`{w:name}`, `{x:name}`) and otherwise passes the text through to
the assembler back-end verbatim.

---

## 5. Top-Level Declarations

```peg
File
    <- ModuleDecl
       ModuleDeny?                                           // module-level effect restriction
       ImportDecl*
       (TargetDecl / RequirementDecl)*                       // header metadata only
       TopLevelItem*

ModuleDecl   <- '#module' DottedName
ModuleDeny   <- '#deny' '(' EffectList ')'                   // applies to all functions in module
ImportDecl   <- '#import' (ImportBlock / ImportItem)
ImportBlock  <- '(' ImportItem+ ')'                         // one item per line, no commas
ImportItem   <- DottedName ('as' Identifier)? ImportSelect?
ImportSelect <- '{' ImportSelection (',' ImportSelection)* ','? '}'
ImportSelection <- Identifier ('as' Identifier)?
TargetDecl   <- '#target' '(' TargetAttrs ')'
RequirementDecl <- '#requires' '(' RequirementAttrs ')'

DottedName   <- Identifier ('.' Identifier)*
TargetAttrs  <- TargetAttr (',' TargetAttr)* ','?
TargetAttr   <- Identifier '=' TargetValue
RequirementAttrs <- RequirementAttr (',' RequirementAttr)* ','?
RequirementAttr  <- Identifier '=' TargetValue
TargetValue  <- IntegerLiteral
             / HyphenatedName
             / StringLiteral
             / '(' TargetValue (',' TargetValue)* ','? ')'     // tuple features
HyphenatedName <- Identifier ('-' Identifier)*

TopLevelItem
    <- ExportableDecl
     / RegionDecl                                            // layout module
     / SectionDecl                                           // layout module
     / EntryDecl                                             // layout module
     / StaticAssert
     / CompileTimeIf

ExportableDecl
    <- DeclAnnotation* Visibility? DeclItem

Visibility <- 'pub'

DeclAnnotation
    <- Annotation / AnnotationGroup

Annotation
    <- '#inline' / '#initcall' '(' ConstExpr ','? ')' / '#naked' / '#noreturn' / '#cold'
     / '#align' '(' ConstExpr ','? ')'
     / '#percpu' / '#tls'                                  // per-instance mutable global storage; see chapter-11-intrinsics.md
     / '#section' '(' DottedName ','? ')'                    // per-declaration section attribute; see chapter-04-modules.md "Custom Sections from User Declarations"
     / '#deny' '(' EffectList ')'                            // effect restriction; see chapter-01-language-design.md "Effect System"
     / '#frame' '(' FrameConstraintList ','? ')'              // post-lowering frame resource constraint; see chapter-01-language-design.md
     / '#exact' '(' ExactCodeConstraintList ','? ')'          // post-lowering exact-code artifact constraint; see chapter-13-scheduling.md
     / CallingConv                                           // [aapcs], etc.

AnnotationGroup
    <- '#[' GroupedAnnotation (',' GroupedAnnotation)* ','? ']'

GroupedAnnotation
    <- Identifier ('(' AnnotationArgList? ')')?

AnnotationArgList
    <- Expr (',' Expr)* ','?

EffectList <- EffectName (',' EffectName)* ','?
EffectName <- 'sysreg' / 'trap' / 'exception_return' / 'cache_maintenance'
            / 'tlb_maintenance' / 'atomic' / 'cpu_halt' / 'interrupt_mask'
            / 'volatile_access' / 'mmio' / 'barrier' / 'fp_state' / 'perf_counter'

FrameConstraintList <- FrameConstraint (',' FrameConstraint)* ','?
FrameConstraint <- 'max_bytes' '=' ConstExpr / 'max_spills' '=' ConstExpr

ExactCodeConstraintList <- ExactCodeConstraint (',' ExactCodeConstraint)* ','?
ExactCodeConstraint <- 'instructions' '=' ConstExpr
                     / 'families' '=' StringLiteral
                     / 'bytes' '=' StringLiteral
                     / 'registers' '=' StringLiteral
                     / 'prologue' '=' StringLiteral
                     / 'spills' '=' ConstExpr
                     / 'veneers' '=' ConstExpr
                     / 'section' '=' StringLiteral
                     / 'align' '=' ConstExpr

DeclItem
    <- FnDecl
     / LabelDecl
     / StructDecl
     / EnumDecl
     / BitfieldDecl
     / ConstDecl
     / GlobalDecl
     / ExceptionVectorDecl
```

`AnnotationGroup` is the grouped spelling for declaration annotations. The
group marker supplies the single `#`, so names inside the brackets are bare:
`#[naked, noreturn]`, not `#[#naked, #noreturn]`. `pub` is a `Visibility`
keyword and is never valid inside an annotation group. Parameter annotations
such as `#pin(x0)` and `#noescape` stay on the parameter and are not
`DeclAnnotation`s. The formatter sorts grouped declaration annotations with the
canonical order from [chapter-18-check-format-diagnostics.md](chapter-18-check-format-diagnostics.md).

### 5.1 Function Declaration

```peg
FnDecl
    <- Identifier GenericTypeParamList? '::' CallingConv? '(' ParamList? ')' ('->' ReturnType)? DeclAnnotation* Block
     / Identifier GenericTypeParamList? '::' CallingConv? '(' ParamList? ')' ('->' ReturnType)? DeclAnnotation*   // forward decl

ParamList
    <- Param (',' Param)* ','?
Param
    <- Identifier ':' Type (PinAttr / NoEscapeAttr)*
```

`#noescape` is valid only on address-typed parameters. It is not a type
qualifier and is not legal on local declarations.

Forward declarations (with no body block) are valid only for `[aapcs]`
declarations of foreign functions (`puts :: [aapcs] (s : @u8) -> i32`).
They do not declare Wyst-native functions, do not reserve same-module native
function names for later bodies, and cannot be generic. The body must be
supplied by an object/link-capable build mode, such as a linked library; see
[chapter-15-abi-spec.md](chapter-15-abi-spec.md). Current static-ELF output
may type-check these signatures but rejects calls to, or `#addr_of` uses of,
unresolved external declarations because it has no linker relocation target for
them.

### 5.2 Label Declaration

```peg
LabelDecl
    <- Identifier '::' 'label' DeclAnnotation* Block
```

A `label` body must terminate with `goto` or a `#noreturn` call (no
fall-through). `#naked` is legal on labels used as architectural entry targets;
the raw stack and register discipline is checked post-parse.

### 5.3 Struct and Bitfield Declarations

```peg
ReprAttr    <- '#repr' '(' 'field_order' ':' 'preserve' ','? ')'
TrapFrameAttr <- '#trap_frame' '(' Identifier ','? ')'
StructDecl
    <- Identifier GenericTypeParamList? '::' ReprAttr? TrapFrameAttr? '#packed'? 'struct' '{' StructField* '}'
StructField
    <- Identifier ':' Type AlignAttr?
AlignAttr   <- '#align' '(' ConstExpr ','? ')'

EnumDecl
    <- Identifier GenericTypeParamList? '::' 'enum' EnumTagType? '{' EnumVariant* '}'
EnumTagType
    <- ':' PrimitiveIntType
EnumVariant
    <- Identifier EnumPayload? ('=' ConstExpr)? (',' / ';')?
EnumPayload
    <- '(' Type (',' Type)* ','? ')'

BitfieldDecl
    <- Identifier '::' 'bitfield' '(' PrimitiveIntType ')' '{' BitfieldField* '}'
BitfieldField
    <- Identifier ':' 'bits' '(' ConstExpr ',' ConstExpr ','? ')'
```

Enum variants without explicit values receive increasing tag values after
parse. `EnumPayload` is parsed as a type list so diagnostics can point at
the precise payload shape; semantic analysis currently accepts zero or one
payload-word value per variant and rejects tuple payloads, structures, slices,
floating-point payloads, and nested enum payloads. Generic type parameters are
legal on enum declarations, but direct generic enum payload parameters must
declare a payload-compatible bound such as `payload_word`.

### 5.4 Global / Constant Declarations

```peg
GlobalDecl  <- Identifier ':' StorageAttr* Type '=' Expr
StorageAttr <- '#percpu' / '#tls' / '#shared'                // mutually exclusive; see §9.12
ConstDecl   <- Identifier '::' Type '=' ConstExpr            // immutable constant
             / Identifier '::=' ConstExpr                    // inferred immutable constant
```

`pub GlobalDecl` is the externally-visible mutable global form
([chapter-04-modules.md](chapter-04-modules.md)). `#shared` aligns and pads the variable to a full
cache line to prevent false sharing — see
[chapter-09-memory-model.md §9.12](chapter-09-memory-model.md).

### 5.5 Exception Vector Declaration

```peg
ExceptionVectorDecl
    <- Identifier '::' '#exception_vector' AlignAttr? '{' VEntrySlot* '}'
VEntrySlot
    <- Identifier ':' '#ventry' Block
```

The slot count is checked post-parse (must be exactly 16). Each slot's
body must fit in 128 bytes after lowering
([chapter-14-exception-vectors.md §10.2](chapter-14-exception-vectors.md)).
`#trap_frame(entry, T)` and `#trap_frame(restore, T)` are label attributes
checked after parsing; the grammar accepts them through the ordinary
declaration-attribute path, and semantic analysis enforces the ARM64
trap-frame shape in chapter 14.

### 5.6 Layout Module Declarations

These appear in modules tagged as layout modules (per
[chapter-04-modules.md](chapter-04-modules.md)):

```peg
RegionDecl
    <- '#region' Identifier ':' RegionAttrs
RegionAttrs
    <- RegionAttr (',' RegionAttr)* ','?
RegionAttr
    <- Identifier '=' '(' Identifier (',' Identifier)* ','? ')' // attrs = (readwrite, ...)
     / Identifier '=' Expr                                    // origin = 0x..., size = 0x...
     / Identifier                                             // bare named attr: readonly

SectionDecl
    <- '#section' DottedName ':' SectionAttrs
SectionAttrs
    <- SectionAttr (',' SectionAttr)* ','?
SectionAttr
    <- Identifier '=' Expr                                    // region = ram, align = 0x...

EntryDecl
    <- '#entry' Identifier 'at' Expr
```

`#region` and `#section` use a comma-separated attribute list with the
syntax `key = value`. The full attribute vocabulary is specified in
[chapter-04-modules.md](chapter-04-modules.md).

---

## 6. Disambiguation Summary

The following table consolidates every potentially ambiguous form in the
grammar and lists the rule that resolves it. Each row corresponds to a
case the prose specification flagged as needing clarification.

| Form                    | Position                 | Production                    | Resolved by                                                                                 |
| ----------------------- | ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------- |
| `[N]T`                  | type                     | `ArrayType`                   | first token after `[` is a literal/const                                                    |
| `[T:N]`                 | type                     | `VectorType`                  | first token after `[` is a type name + `:`                                                  |
| `[]T`                   | type                     | `SliceType`                   | `[` immediately followed by `]`                                                             |
| `[]T{data=...,len=...}` | expression               | `SliceConstruct`              | `[]` followed by type and constructor body                                                  |
| `[dynamic]T`            | type                     | `DynamicArrayType`            | `[` followed by reserved `dynamic]`                                                         |
| `T@[expr]`               | expression               | `ScalarLoad`                  | explicit `@[` address marker; leading `T` is semantically resolved as a type                |
| `[T:N]@[expr]`           | expression               | `VectorLoad`                  | explicit `@[` address marker after vector type                                              |
| `name[expr]`            | expression               | `Index` (postfix)             | leading `name` is value-classified; semantic base must be an array, slice, or dynamic array |
| `name[lo:hi]`           | expression               | `Slice` (postfix)             | semantic base must be an array, slice, or dynamic array                                     |
| `{a, b}`                | expression               | `ArrayLiteral`                | no leading type name, no `field:` syntax                                                    |
| `S{f: v}`               | expression               | `StructLiteral`               | leading type name followed by `{`                                                           |
| `{ stmts }`             | statement                | `Block`                       | statement position                                                                          |
| `(a, b)`                | expression               | `TupleLiteral` or `ParenExpr` | 2+ elements → tuple; 1 → paren                                                              |
| `(args) -> ret`         | type                     | `FnPointerType` (via `@`)     | bare form is rejected; needs `@` prefix                                                     |
| `f(x)`                  | statement                | `ExprStmt`                    | top-level expression must be a call                                                         |
| `x = f(y)`              | statement                | `AssignStmt` with `Expr` RHS  | `=` proves expression position                                                              |
| `goto name`             | statement (bare context) | `GotoStmt`                    | scope-checked post-parse                                                                    |
| `#asm { ... }`          | statement                | `AsmBlock`                    | `#asm` directive prefix                                                                     |
| `#dedent """..."""`     | expression               | directive-prefixed literal    | parsed as `#dedent` applied to literal                                                      |
| `select(a, b, c)`       | expression               | `SelectCall`                  | `select` is a keyword; tried before `BareName`                                              |

---

## 7. Reserved For Future Use

The following symbols and forms remain reserved for future use:

- `$` — reserved.
- `?` as a postfix operator — reserved (no assigned use; the token
  itself is recognized so future addition is non-breaking).

Angle brackets are not reserved tokens. They are active grammar syntax for
generic type parameter lists, generic type argument lists, and primitive type
arguments on endian runtime primitives.

The parser must emit a reserved-token diagnostic if any reserved symbol or
form appears in source.

`#weak` and `#hidden` are not reserved: they are future-version normative for
`wyst.language.v0.8` target 33. The current compiler recognizes both spellings
for diagnostics and rejects them until that target is implemented.

---

## 8. Conformance

Parser conformance is defined by this grammar, the prose rules in the chapters
that precede it, and the conflict order in
[source-of-truth.md](source-of-truth.md).

The shared grammar-derived syntax corpus lives at
`wync/tests/fixtures/syntax-corpus/manifest.tsv`. The manifest is consumed by
compiler parser tests
(`wync/src/parse/tests.rs::parses_shared_positive_syntax_corpus_from_grammar`
and
`wync/src/parse/tests.rs::rejects_shared_negative_syntax_corpus_from_grammar`),
formatter parse-tree preservation tests
(`wync/src/formatter/tests.rs::formatter_preserves_shared_positive_syntax_corpus_parse_tree`),
source-only compiler diagnostic checks
(`wync/tests/syntax_corpus.rs::compiler_check_corpus_negative_cases_emit_expected_diagnostics`),
and editor/syntax-tooling drift checks
(`wync/tests/syntax_corpus.rs::editor_and_syntax_tooling_cover_shared_syntax_corpus_tokens`).
The corpus must cover precedence, malformed directives, version gating, atomic
orders, generics, `is`, compile-time `#if`, MMIO constructs, and recovery
behavior; adding or changing any of those syntax surfaces requires updating the
manifest and the linked tests in the same change.
