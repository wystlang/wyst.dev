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
the grammar vocabulary but is not accepted source. The
feature-state registry in [source-of-truth.md](source-of-truth.md) decides
whether a parsed form is implemented, planned, experimental,
or reserved.

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

## Core Declaration Grammar

This section is the Wyst grammar authority for the
foundational declaration and expression surface. The
[syntax-word catalog](syntax-words.tsv) is the sole keyword, contextual-word,
and unshadowable-name table; this appendix does not maintain a second word
list. The closed [meta-operation catalog](meta-operation-catalog.tsv) owns the
exact 15 active `#` forms and their phase/type/target/relocation contracts. The
[declaration-attribute catalog](attribute-catalog.tsv) likewise owns
attribute activation and signatures.
Project manifests use the Chapter 13 artifact `verify code` grammar; that
manifest-only clause is not a source declaration.

### Lexical and statement boundary contract

```peg
IdentStart     <- [A-Za-z_]
IdentContinue  <- [A-Za-z0-9_]
RawIdentifier  <- IdentStart IdentContinue*
UserIdentifier <- !'_' RawIdentifier
Discard        <- '_'

RangePunctuation <- '..<' / '..=' / '..' // longest match in this order
```

A `UserIdentifier` must also pass the syntax-word catalog: reserved words are
keywords everywhere, contextual words are keywords only in their cataloged
positions, and unshadowable names cannot be rebound in their cataloged scopes.
Identifiers are case-sensitive ASCII and are not Unicode-normalized. Bare `_`
is only a discard and cannot be a declaration, parameter, field, module
component, or alias name. UTF-8 remains valid in comments and string contents.

Outside literals, comments, and checked-assembly instruction bodies, spaces,
tabs, and newlines are interchangeable. A source statement ends only when its
grammar production is complete. There is no newline termination, automatic
semicolon insertion, or continuation character, and `;` is invalid. Postfix
and infix parsing continues maximally across whitespace. Every comma-separated
list below permits exactly one optional trailing comma; leading and doubled
commas are invalid.

`..<`, `..=`, and `..` are indivisible punctuation, not expression operators
or first-class range values. Later owning grammar items admit them only in
their range positions. `$` and `?` are reserved tokens. `#` remains reserved
for authenticated compile-time, target, and layout operations. Wyst has
no prefix-`%` compiler-operation token or call production: every `%name(...)`
spelling is rejected uniformly before operation-name lookup. `%` remains an
ordinary arithmetic remainder token only where the expression grammar admits
that infix operator.

### Modules, imports, and declarations

```peg
CompilationUnit <- ModuleDecl ModuleItem*
ModuleDecl       <- 'module' ModulePath
ModulePath       <- UserIdentifier ('.' UserIdentifier)*

ModuleItem <- LayoutDecl / SymbolImportDecl / SymbolExportDecl / ImportDecl
            / TopLevelDecl / ActivatedSystemOrMetaItem

ImportDecl <- 'pub'? 'import' (ImportGroup / ImportItem)
ImportGroup <- '(' ImportItem (',' ImportItem)* ','? ')'
ImportItem <- ModulePath ImportSuffix?
ImportSuffix <- 'as' UserIdentifier / ImportSelectionList
ImportSelectionList <- '{' ImportSelection (',' ImportSelection)* ','? '}'
ImportSelection <- UserIdentifier ('as' UserIdentifier)?

SymbolImportDecl <- 'import' 'symbol' LinkerName 'as' UserIdentifier
                    ':' LinkerBoundaryType
SymbolExportDecl <- 'export' 'weak'? UserIdentifier
                    ('as' 'symbol' LinkerName)?
LinkerBoundaryType <- ExternCallableType / AddressType
ExternCallableType <- ExternConvention 'fn' '(' CallableParamList? ')'
                      ('->' CallableResult)? CallableEffects?
LinkerName <- StringLiteral

ItemPrefix <- AttributeGroup? 'pub'?
AttributeGroup <- '#[' Attribute (',' Attribute)* ','? ']'
Attribute <- UserIdentifier '(' AttributeArguments ')' / UserIdentifier
AttributeArguments <- AttributeArgument (',' AttributeArgument)* ','?
AttributeArgument <- UserIdentifier '=' ConstExpr
                   / SignatureAtom
                   / ConstExpr

TopLevelDecl <- FnDecl / ConstDecl / VarDecl / PerCpuVarDecl / LabelDecl
                / StructDecl / EnumDecl / BitstructDecl
                / RegisterMapDecl / MmioDecl / SystemRegisterDecl
                / VectorTableDecl / TrapFrameDecl

FnDecl <- ItemPrefix 'naked'? ExternConvention? 'fn' UserIdentifier
          GenericParams? '(' ParamList? ')' ('->' FunctionResult)?
          CallableEffects? Block
ExternConvention <- 'extern' '"C"'
ParamList <- Param (',' Param)* ','?
Param <- UserIdentifier ':' 'noescape'? Type RegisterPlacement?
FunctionResult <- NamedResultTuple / 'never' / ScalarResult
ScalarResult <- Type RegisterPlacement?
NamedResultTuple <- '(' NamedResult ',' NamedResult
                    (',' NamedResult)* ','? ')'
NamedResult <- UserIdentifier ':' Type

ConstDecl <- ItemPrefix 'const' UserIdentifier TypeAnnotation? '=' ConstExpr
VarDecl   <- ItemPrefix 'var' UserIdentifier TypeAnnotation? '=' ConstExpr
PerCpuVarDecl <- ItemPrefix 'per_cpu' 'var' UserIdentifier
                 ':' Type '=' ConstExpr
TypeAnnotation <- ':' Type
LabelDecl <- ItemPrefix 'naked'? 'label' UserIdentifier
             TrapFrameLabelClause? Block
TrapFrameLabelClause <- ('establishes' / 'restores') UserIdentifier

LayoutDecl <- 'layout' UserIdentifier '{' LayoutMember* '}'
LayoutMember <- LayoutEntry / LayoutRegion / LayoutSection / LayoutSymbol
LayoutEntry <- 'entry' SemanticDeclarationPath ('at' ConstExpr)?
SemanticDeclarationPath <- UserIdentifier '.'
                           (UserIdentifier '.')* LayoutDeclarationName
LayoutDeclarationName <- RawIdentifier
LayoutRegion <- 'region' UserIdentifier ':' LayoutRegionAccess
                'at' ConstExpr 'size' ConstExpr
LayoutRegionAccess <- 'readonly' / 'readwrite'
LayoutSection <- 'section' LayoutSectionName ':' LayoutSectionKind
                 LayoutSectionClause*
LayoutSectionName <- StringLiteral
LayoutSectionKind <- 'code' / 'rodata' / 'data' / 'bss'
LayoutSectionClause <- 'in' UserIdentifier
                     / 'after' LayoutSectionName
                     / 'align' ConstExpr
LayoutSymbol <- 'pub'? 'symbol' LayoutSymbolName ':' Type '=' LayoutSymbolExpr
LayoutSymbolName <- RawIdentifier
LayoutSymbolExpr <- ConstExpr
LayoutSectionQuery <- ('start' / 'end' / 'size')
                      '(' LayoutSectionName ','? ')'

StructDecl <- ItemPrefix 'packed'? 'struct' UserIdentifier GenericParams?
              '{' (StructField ','?)* '}'
StructField <- UserIdentifier ':' Type

TargetProfile <- UserIdentifier ('.' UserIdentifier)*

VectorTableDecl <- ItemPrefix 'vector_table' UserIdentifier ':' TargetProfile
                   '{' (VectorTableSlot ','?)* '}'
VectorTableSlot <- VectorSlotName VectorSlotBody
VectorSlotName <- UserIdentifier '.' UserIdentifier '.' UserIdentifier
VectorSlotBody <- '->' UserIdentifier / Block

TrapFrameDecl <- ItemPrefix 'trap_frame' UserIdentifier ':' TargetProfile
                 '{' (StructField ','?)* '}'

EnumDecl <- ItemPrefix 'enum' UserIdentifier GenericParams? (':' Type)?
            '{' (EnumVariant ','?)* '}'
EnumVariant <- UserIdentifier ('(' Type ')')?

BitstructDecl <- ItemPrefix 'bitstruct' UserIdentifier ':' UnsignedIntType
                 '{' (BitstructField ','?)* '}'
BitstructField <- UserIdentifier ':' Type 'at' BitLocation
BitLocation <- ConstExpr ('..=' ConstExpr)?
UnsignedIntType <- 'u8' / 'u16' / 'u32' / 'u64'

RegisterMapDecl <- ItemPrefix 'register_map' UserIdentifier
                   '{' (RegisterMapRegister ','?)* '}'
RegisterMapRegister <- UserIdentifier ':' HardwareAccess UnsignedIntType
                       'at' ConstExpr HardwareFieldBlock?

MmioDecl <- ItemPrefix 'mmio' UserIdentifier ':' MmioTarget 'at' ConstExpr
MmioTarget <- HardwareAccess Type / QualifiedTypeName

SystemRegisterDecl <- CatalogSystemRegisterDecl / EncodedSystemRegisterDecl
CatalogSystemRegisterDecl
    <- ItemPrefix 'system_register' UserIdentifier ':' HardwareAccess 'u64'
       HardwareFieldBlock
EncodedSystemRegisterDecl
    <- ItemPrefix 'system_register' UserIdentifier ':' HardwareAccess 'u64'
       'at' SystemRegisterEncoding HardwareFieldBlock?

HardwareAccess <- 'readonly' / 'writeonly' / 'readwrite'
HardwareFieldBlock <- '{' (HardwareFieldEntry ','?)* '}'
HardwareFieldEntry <- HardwareReservedRegion / HardwareField
HardwareField <- UserIdentifier ':' HardwareAccess? Type 'at' BitLocation
                 HardwareResetPolicy? HardwareReadPolicy? HardwareWritePolicy?
HardwareResetPolicy <- 'reset' ConstExpr
HardwareReadPolicy <- 'read_clears' / 'read_sets'
HardwareWritePolicy
    <- 'write_ignored'
     / 'write_one_clears' / 'write_one_sets' / 'write_one_toggles'
     / 'write_zero_clears' / 'write_zero_sets' / 'write_zero_toggles'
HardwareReservedRegion <- 'reserved' 'at' BitLocation ReservedBitPolicy
ReservedBitPolicy <- 'one' / 'preserve'

SystemRegisterEncoding
    <- 'S' CanonicalDecimal '_' CanonicalDecimal
       '_C' CanonicalDecimal '_C' CanonicalDecimal '_' CanonicalDecimal
CanonicalDecimal <- '0' / [1-9] [0-9]*

CallableType <- ExternConvention? 'fn' '(' CallableParamList? ')'
                ('->' CallableResult)? CallableEffects?
CallableParamList <- CallableParam (',' CallableParam)* ','?
CallableParam <- 'noescape'? Type RegisterPlacement?
CallableResult <- 'never' / ScalarResult
CallableEffects <- 'effects' '(' ('none' / 'all' / EffectList) ')'
RegisterPlacement <- 'in' RegisterName

PerCpuTargetArgument <- 'per_cpu' '=' 'single_instance_tpidr_el1'
```

`symbol` is contextual only after `import` and after an export alias's `as`;
`weak` is contextual only immediately after `export`. A linker name is a
single-line UTF-8 string whose decoded bytes are nonempty and contain no NUL.
An imported function has a complete `extern "C" fn(...)` callable type; an
imported data symbol has an address type. `import weak symbol ...`, `pub import
symbol ...`, and `pub export ...` are rejected. Ordinary module imports never
name linker symbols.

An export without an alias uses the local declaration's spelling. Each export
declaration is an independent mapping, so one Wyst declaration may have
multiple strong or weak external aliases. `pub` and `pub import` affect only
Wyst source visibility and never add, remove, rename, or weaken an external
symbol.

`LayoutDecl` is valid only in the selected layout module. Until the named
artifact manifest grammar can select one block explicitly, that selected file
contains exactly one layout declaration, and that declaration contains
exactly one `LayoutEntry`. `pub` and declaration attributes cannot prefix the
layout itself or its entry, region, or section members; only `LayoutSymbol`
admits `pub`. Wyst layout input otherwise admits only its module
declaration and applicable target, requirement, or deny policy; ordinary
source declarations cannot be siblings of the layout block. The word `layout`
is contextual only when it begins this
top-level production; it remains an ordinary module-path component, so the
canonical `module boot.layout` declaration is valid. A
`SemanticDeclarationPath` is a module-qualified declaration
identity with its final component resolved as the declaration name, never an
import alias or linker symbol. `LayoutDeclarationName` and `LayoutSymbolName`
admit conventional leading-underscore spellings such as `_start` and
`__text_start`; bare `_` remains a discard and every reserved or unshadowable
catalog name remains unavailable for rebinding. The optional `at` expression
is one hard `u64` placement constraint.

A `LayoutSectionName` must decode to valid UTF-8 matching
`\.[A-Za-z0-9_.]+`; it is never an identifier or dotted-name token.
Region/section declarations and clause operands are resolved within the same
layout block. A section has exactly one kind. It may carry zero or more
placement/alignment clauses; identical repeated clauses normalize, distinct
`after` clauses all remain dependency edges, and conflicting `in` or `align`
clauses are semantic errors. Omitted alignment uses the section-kind default.

`LayoutSectionQuery` is recognized only while parsing a `LayoutSymbolExpr`.
The unshadowable `start` and `end` forms return `@u8`; contextual `size`
returns `u64`. Every query names a section declared in the same layout block.
Outside that initializer context these spellings do not create layout-query
AST. The symbol's explicit type must match its initializer. Numeric address
bits from `start` or `end` require the ordinary explicit
`address<u64>(...)` conversion; there is no implicit pointer/integer coercion.
Layout-symbol values depend on final placement and therefore cannot enter
ordinary constant evaluation or compile-time selection.

`CallableType` is a `Type` alternative. Its parameters have no names. The fixed
declaration-prefix order is one attribute group, `pub`, the compatible hard
modifier or storage class, external convention, declaration keyword, then
name. Thus only `fn`/`label` admit `naked`, only ordinary `struct` admits
`packed`, and only module `var` admits `per_cpu`. Reordering, duplication,
meaningless combinations, unknown attributes, and inactive catalog rows are
errors. Attribute groups are non-empty; flag attributes omit parentheses;
positional arguments precede named arguments; attributes and named keys are
unique.

`vector_table` and `trap_frame` are reserved declaration introducers.
`TargetProfile` supplies only the dotted source shape; Chapter 14 owns its
closed authenticated selector sets and target compatibility. The current
vector selectors are exactly `aarch64.el1`, `aarch64.el2`, and
`aarch64.el3`; the current trap-frame selector is exactly `aarch64`.

A vector slot has exactly three dotted source components followed by either
one arrow target or one block. Semantic profile validation owns the exact
component spellings, required count, order, slot budgets, and terminal-flow
rules. The arrow target is one label identifier. The arrow is contextual to a
slot and does not introduce a general statement or expression form.

`TrapFrameLabelClause` is contextual immediately after a label name.
`establishes` and `restores` remain ordinary identifiers outside that slot.
Semantic analysis admits the clause only on `naked label`, requires the named
type to be a compatible nominal `trap_frame`, and cross-checks the first
checked-assembly statement as specified by Chapter 14. A `trap_frame`
declaration has no generic-parameter or `packed` branch; its visible fields
are structurally parsed like fields but its complete layout is target-owned.

`noescape` occurs immediately before an address parameter's type. A
`RegisterPlacement` occurs only after a declaration parameter type, callable
parameter type, one scalar result type, or the explicit type of a local mutable
`var`. It is not grammar on module `var`/`const`, fields, whole callable types,
named multi-results, or `never`. `never` is a complete return type only and is
not a general named type or binding name.

Address types include the exact `@T`, `@volatile T`, and `@mmio T` forms.

`PerCpuTargetArgument` is optional and unique within the existing `#target(...)`
named-argument list. Before the general per-CPU model is activated, it is the
only selection that enables reachable `per_cpu` access; its semantic facts and
EL1+ constraint are defined in Chapters 8 and 11. Recognition of `per_cpu` as
that named key does not permit it in any other expression position.

`register_map`, `mmio`, and `system_register` are contextual declaration
introducers only in their registered top-level slots. Hardware access and
policy words are likewise contextual only within their productions. All remain
ordinary identifiers elsewhere. A map register uses one unsigned backing and
may omit its field block; omission does not suppress its nominal snapshot type.
A placed-map target must resolve to a `register_map`. A standalone scalar target
is distinguished by its leading access mode and is restricted semantically to
a target-supported single-access scalar.

A catalog system-register declaration requires a field block, using `{}` when
fieldless. An encoded declaration may omit its field block; omission is the
canonical fieldless spelling. `SystemRegisterEncoding` is one indivisible
contextual shape after `at`. Semantic analysis enforces the respective 2-, 3-,
4-, 4-, and 3-bit component widths and requires an exact active authenticated
target-extension row. Lowercase letters, leading-zero decimal components,
strings, expressions, missing components, and alternate separators do not match
this production.

Hardware field suffixes have the only order admitted by the production: reset,
read policy, then write policy, with at most one of each class. Reserved regions
have no source field name or accessor. `access(...)` is not a production and
the globally reserved word `device` has no active declaration production.

The active declaration attributes are exactly `#[align(N)]`,
`#[section("NAME")]`, `#[inline]`, `#[init(order = N)]`,
`#[frame(...)]`, `#[deny_effects(...)]`, `#[cache_isolated]`, and
`#[schedule(source)]`. Their subjects, signatures,
conflicts, formatter order, target-fact requirements, and behavior come only
from the declaration-attribute catalog.

The meta-operation terminal is catalog closed:

```peg
MetaOperation <- '#addr_of' / '#align_of' / '#cache_line_width' / '#dedent'
               / '#else' / '#field_offset' / '#if' / '#len'
               / '#percpu_offset_of' / '#requires' / '#size_of'
               / '#static_assert' / '#tag_of' / '#target'
```

No other `#`-prefixed name is an accepted operation. Every source file uses
this grammar. Every other `#` name is ordinary invalid syntax before semantic
analysis.

An import without `as` or selections binds its final path component as the
qualifier. Selective imports bind only selected public names. Wildcards are not
grammar. An import group is a non-empty comma-separated list of module import
items with one optional trailing comma. It preserves entry order and desugars
to the same imports as standalone declarations; it creates no scope,
namespace, or source-graph boundary. The optional leading `pub` belongs to the
whole declaration: on `pub import (...)` it applies public re-export visibility
uniformly to every entry. `pub` is not part of `ImportItem`, so a group cannot
mix visibilities and per-entry `pub` is invalid; use separate groups or
standalone declarations. Linker symbol imports cannot appear as entries. The
sealed `core` package adds semantic restrictions described in Chapter 4;
recognizing an import production does not authenticate or activate a sealed
member.

### Expressions and constant expressions

Expressions use an explicit precedence ladder. Comparison and `is` are
non-associative; every other binary level is left-associative.

```peg
Expr <- OrExpr
OrExpr <- AndExpr ('||' AndExpr)*
AndExpr <- CompareExpr ('&&' CompareExpr)*
CompareExpr <- IsExpr (CompareOp IsExpr)?
CompareOp <- '==' / '!=' / '<=' / '>=' / '<' / '>'
IsExpr <- BitOrExpr ('is' EnumPattern)?
EnumPattern <- VariantPattern
BitOrExpr <- BitXorExpr ('|' BitXorExpr)*
BitXorExpr <- BitAndExpr ('^' BitAndExpr)*
BitAndExpr <- ShiftExpr (('&^' / '&') ShiftExpr)*
ShiftExpr <- AddExpr (('<<' / '>>') AddExpr)*
AddExpr <- MulExpr (('+' / '-') MulExpr)*
MulExpr <- UnaryExpr (('*' / '/' / '%%' / '%') UnaryExpr)*
UnaryExpr <- ('+' / '-' / '~' / '!') UnaryExpr / PostfixExpr
PostfixExpr <- PrimaryExpr PostfixSuffix*
PostfixSuffix
    <- '(' CallArgList? ')'
     / '[' Expr ']'
     / SliceSubscript
     / '.' UserIdentifier
PrimaryExpr
    <- MatchExpr
     / NamedConversion
     / AddressOperation
     / AtomicConstructor
     / MaybeUninitConstructor
     / Literal
     / QualifiedPath
     / '(' Expr ')'

QualifiedPath <- UserIdentifier ('.' UserIdentifier)*
Literal <- IntegerLiteral / FloatLiteral / StringLiteral
         / CharacterLiteral / 'true' / 'false'
```

Compile-time evaluation uses the same operator order over its restricted
operand set:

```peg
ConstExpr <- ConstOrExpr
ConstOrExpr <- ConstAndExpr ('||' ConstAndExpr)*
ConstAndExpr <- ConstCompareExpr ('&&' ConstCompareExpr)*
ConstCompareExpr <- ConstBitOrExpr (CompareOp ConstBitOrExpr)?
ConstBitOrExpr <- ConstBitXorExpr ('|' ConstBitXorExpr)*
ConstBitXorExpr <- ConstBitAndExpr ('^' ConstBitAndExpr)*
ConstBitAndExpr <- ConstShiftExpr (('&^' / '&') ConstShiftExpr)*
ConstShiftExpr <- ConstAddExpr (('<<' / '>>') ConstAddExpr)*
ConstAddExpr <- ConstMulExpr (('+' / '-') ConstMulExpr)*
ConstMulExpr <- ConstUnaryExpr (('*' / '/' / '%%' / '%') ConstUnaryExpr)*
ConstUnaryExpr <- ('+' / '-' / '~' / '!') ConstUnaryExpr / ConstPrimaryExpr
ConstPrimaryExpr
    <- Literal
     / QualifiedPath
     / RegisteredConstOperation
     / '(' ConstExpr ')'
```

`RegisteredConstOperation` is one cataloged meta-operation whose phase and
result permit constant evaluation. Grammar recognition never grants a
meta-operation that authority.

```peg
EffectList <- EffectName (',' EffectName)* ','?
EffectName <- 'sysreg' / 'trap' / 'exception_return' / 'cache_maintenance'
            / 'tlb_maintenance' / 'atomic' / 'cpu_event' / 'cpu_halt'
            / 'interrupt_mask' / 'volatile_access' / 'mmio' / 'barrier'
            / 'fp_state' / 'perf_counter'
            / 'execution_suspension'
```

### Bindings, returns, calls, and enum matching

```peg
Statement <- BindingStmt / TupleAssignStmt / AssignStmt / ReturnStmt
           / MatchStmt / IfStmt / WhileStmt / LoopStmt / ForStmt
           / ScheduleStmt
           / CheckedAsm
           / OtherStructuredStmt / CallStmt

BindingStmt <- LocalConstDecl / LocalVarDecl / TupleBindingDecl
LocalConstDecl <- 'const' UserIdentifier TypeAnnotation? '=' Expr
LocalVarDecl <- 'var' UserIdentifier
                (':' Type RegisterPlacement?)? '=' Expr
TupleBindingDecl <- ('const' / 'var') TupleBinding '=' Expr
TupleBinding <- '(' BindingName ',' BindingName
                (',' BindingName)* ','? ')'
BindingName <- UserIdentifier / Discard

TupleAssignStmt <- '(' AssignName ',' AssignName
                   (',' AssignName)* ','? ')' '=' Expr
AssignName <- UserIdentifier / Discard

ReturnStmt <- 'return' Expr / 'return' &'}'

WhileStmt <- 'while' Expr Block
LoopStmt <- 'loop' Block
ForStmt <- 'for' UserIdentifier 'in' Expr '..<' Expr Block
ScheduleStmt <- 'schedule' 'source' Block

CallArgList <- CallArg (',' CallArg)* ','?
CallArg <- UserIdentifier '=' Expr / Expr
CallStmt <- CallableExpr '(' CallArgList? ')'

MatchStmt <- 'match' Expr '{' MatchArm* MatchElse? '}'
MatchExpr <- 'match' Expr '{' MatchExprArm+ MatchElseExpr? '}'
MatchArm <- VariantPattern (',' VariantPattern)* Block
VariantPattern <- '.' UserIdentifier
                  ('(' PatternBinding (',' PatternBinding)* ','? ')')?
PatternBinding <- UserIdentifier / Discard
MatchElse <- 'else' Block
MatchExprArm <- VariantPattern (',' VariantPattern)* ValueBlock
MatchElseExpr <- 'else' ValueBlock
ValueBlock <- '{' Statement* Expr '}'

IsPattern <- Expr 'is' VariantPattern
Block <- '{' Statement* '}'
```

Every binding requires an initializer. `const` is immutable, `var` is mutable,
and omission of `TypeAnnotation` requires one unambiguous initializer type.
An `in register` local placement requires the explicit `: Type` branch and is
therefore unavailable on inferred or tuple bindings.
Tuple bindings introduce at least two names/discards. Tuple assignment binds
nothing, requires existing mutable targets, evaluates its right side once, and
updates targets simultaneously. Bare comma assignment forms are invalid.

A valueless `return` is valid only immediately before the closing `}` of its
body; otherwise `return` consumes an expression across whitespace. An
expression statement must be a direct, indirect, method, or authenticated
compiler-operation call. Qualified compiler operations use the ordinary
`CallableExpr` path-and-call grammar; sealed-import resolution authenticates
their catalog identity after parsing. Unused arithmetic, aggregate, address,
or other value expressions are invalid statements.

Positional call arguments precede labeled arguments. Labels apply only to a
statically resolved direct Wyst declaration and are matched against its
parameter names; indirect calls are positional. Semantic analysis requires
every parameter exactly once and evaluates arguments left-to-right in written
order before parameter placement.

### Signature-style checked assembly

```peg
CheckedAsm <- 'asm' AsmPure? AsmAlign? AsmStackClause?
              AsmParameterList? AsmResultClause? AsmBody
CheckedAsmPrimary <- CheckedAsm

AsmPure <- 'pure'
AsmAlign <- 'align' ConstExpr
AsmStackClause <- ('preserves' / 'establishes' / 'restores') 'stack'

AsmParameterList <- '(' AsmParameter (',' AsmParameter)* ','? ')'
AsmParameter <- AsmScratch / AsmImmediate / AsmSymbol / AsmInput
AsmInput <- UserIdentifier (':' Type)? RegisterPlacement? '=' Expr
AsmImmediate <- UserIdentifier ':' 'imm' '=' ConstExpr
AsmSymbol <- UserIdentifier ':' 'symbol' '=' AsmSymbolPath
AsmSymbolPath <- UserIdentifier ('.' UserIdentifier)*
AsmScratch <- 'scratch' UserIdentifier ':' Type RegisterPlacement?

AsmResultClause <- '->' ('never' / AsmValueResult / AsmResultTuple)
AsmResultTuple <- '(' AsmValueResult ',' AsmValueResult
                  (',' AsmValueResult)* ','? ')'
AsmValueResult <- UserIdentifier (':' Type RegisterPlacement?)?

AsmBody <- '{' AsmPhysicalLine* '}'
AsmPhysicalLine <- AsmIgnoredLine / AsmLabelLine / AsmInstructionLine
AsmIgnoredLine <- HorizontalSpace* LineEnd
AsmLabelLine <- HorizontalSpace* UserIdentifier ':'
                HorizontalSpace* LineEnd
AsmInstructionLine <- HorizontalSpace* ActiveA64Instruction
                      HorizontalSpace* LineEnd
HorizontalSpace <- (' ' / '\t')*
LineEnd <- '\r\n' / '\n' / '\r'

ActiveA64Instruction
    <- target-profile production generated from active A64 source-form catalog rows
```

Modifiers have the exact order shown. A present parameter list is non-empty.
`pure` cannot be combined with alignment or a stack clause. `AsmValueResult`
without `: Type` is the bare tied-result form and cannot add a placement.
Parenthesized results contain at least two values. Statement-only `asm` omits a
result. `CheckedAsmPrimary` is a language primary-expression alternative
and requires a value result or `-> never`.

The instruction body is the parsed generated A64 target sublanguage, not an
opaque text token. Ordinary comments are removed under the lexical rules while their
physical line endings remain available to this production. Its final label or
instruction line ends with a newline before `}`; labels occupy their own line,
and every other non-comment line must match exactly one active generated
instruction production. Body identifiers resolve only to signature binders,
block-local labels, or catalog-owned target tokens; symbol dependencies use
`: symbol = path`. The body uses binder names directly. There are no named
sections, constraint calls, manual clobber/effect lists, physical-register
operands, directional labels, or `{operand}` interpolation.

`match` accepts enums only and evaluates the scrutinee once. Arms require brace
bodies. A payload variant binds one name or explicitly discards it; alternatives
in one arm bind the same names and types. `MatchElse`, when present, is final.
Without it, arms are exhaustive. There are no colon, arrow, guard,
nested-pattern, wildcard-arm, fallthrough, or match-expression forms.

### Aggregate literals and explicit type-only generics

```peg
expected-struct-literal <- '{' (field-init (',' field-init)* ','?)? '}'
field-init <- UserIdentifier '=' Expr
array-or-vector-literal <- '[' Expr (',' Expr)* ','? ']'
multi-result-expr <- '(' Expr ',' Expr (',' Expr)* ','? ')'
expected-payload-free-variant <- '.' UserIdentifier

GenericParams <- '<' GenericParam (',' GenericParam)* ','? '>'
GenericParam <- UserIdentifier (':' CatalogedBound)?
GenericArgs <- '<' Type (',' Type)* ','? '>'
GenericNamedType <- QualifiedTypeName GenericArgs?
GenericValueApplication <- ValuePath GenericArgs
```

`expected-struct-literal` is valid only when a complete aggregate type comes
from an annotation, assignment target, direct-call parameter, or return type.
Fields use `=`, appear exactly once, and evaluate in written order. A nominal
type prefix, colon-valued fields, shorthand fields, unknown/duplicate/missing
fields, brace array literals, and type-prefixed construction are invalid.
Arrays and vectors use brackets; named multi-results use parentheses.
`expected-payload-free-variant` likewise requires an expected enum type; a payload
variant uses its enum constructor.

Generic parameter lists occur only on `fn`, `struct`, and `enum`. Parameter and
argument lists are non-empty. Applications require a complete explicit list of
full type arguments; Wyst has no inference, defaults, value parameters,
aliases, user-defined bounds, traits, or turbofish. After a value path, a
matching generic `>` commits only when followed by `(`, `.`, `[`, `)`, `]`,
`,`, `}`, or end of file. Within an already committed generic list, `>>` and
`>>=` split contextually into closing `>` tokens and any remaining token.
Outside that context they retain longest-match operator meaning.

Generic instantiation uses the canonical identity and deterministic
termination contract in Chapter 6 and the semantic database; grammar
recognition never authorizes a second expansion key or depth cutoff.

### Semantic operations, named conversions, address and hardware operations, and slice ranges

Qualified architecture and environment operations have no special lexical or
call production. `cpu.wfe()`, `cache.data.zero_block(address)`, an aliased
`mem.load_pair_non_temporal(address)`, and `semihost.call(operation, parameter)`
all parse through the ordinary qualified-path, postfix, and call productions.
Semantic import resolution authenticates the category binding and looks up the
stable identity in [`semantic-operation-catalog.tsv`](semantic-operation-catalog.tsv).
An alias changes only the compile-time namespace binding, never that identity.

The following productions are compiler-owned expression forms once their
registered syntactic and semantic positions commit. Named-conversion callees,
the bare `fma` operation, and the generic `uninit<T>` constructor are
unshadowable and commit before ordinary generic application or call
resolution. Contextual address, hardware, vector, enum, and `MaybeUninit`
members remain ordinary identifiers outside an authenticated receiver
position.

```peg
NamedConversion
    <- TypedConversion
     / TruncateBitsConversion

TypedConversion
    <- ConversionName '<' Type '>' '(' Expr ','? ')'
ConversionName
    <- 'widen'
     / 'truncate'
     / 'signcast'
     / 'numeric'
     / 'bitcast'
     / 'address'
     / 'relens'
     / 'qualify'
     / 'floatcast'
     / 'saturate'

TruncateBitsConversion
    <- 'truncate_bits' '(' Expr ',' Expr ','? ')'

AddressOperation
    <- 'byte_offset' '(' Expr ',' Expr ','? ')'
     / 'element_offset' '(' Expr ',' Expr ','? ')'
     / 'field_addr' '(' Expr ',' TypeFieldSelector ','? ')'
     / 'addr_of' '(' UserIdentifier ','? ')'
TypeFieldSelector <- QualifiedTypeName '.' UserIdentifier

AddressMethod
    <- Expr '.' 'load' '(' ')'
     / Expr '.' 'store' '(' Expr ','? ')'
     / Expr '.' 'load' '<' EndianIntType '>'
       '(' 'endian' '=' EndianSelector ','? ')'
     / Expr '.' 'store' '<' EndianIntType '>'
       '(' Expr ',' 'endian' '=' EndianSelector ','? ')'
     / Expr '.' 'slice' '(' 'elements' '=' Expr ','? ')'

AtomicStorageType <- 'atomic' '<' AtomicElementType '>'
AtomicAddressType <- '@' AtomicStorageType
AtomicElementType
    <- 'bool' / 'u8' / 'u16' / 'u32' / 'u64'
     / 'i8' / 'i16' / 'i32' / 'i64' / '@' Type
AtomicConstructor <- 'atomic' '<' AtomicElementType '>'
                     '(' Expr ','? ')'
AtomicMethodCall <- Expr '.' AtomicMethodName '(' CallArgList? ')'
AtomicOrder <- '.' ('relaxed' / 'acquire' / 'release' / 'acq_rel' / 'seq_cst')
AtomicMethodName
    <- 'load' / 'store' / 'exchange' / 'compare_exchange'
     / 'fetch_add' / 'fetch_sub' / 'fetch_and' / 'fetch_or' / 'fetch_xor'
     / 'test_and_set_bit' / 'test_and_clear_bit'

MaybeUninitConstructor <- 'uninit' '<' Type '>' '(' ')'
MaybeUninitMethod
    <- Expr '.' 'write' '(' Expr ','? ')'
     / Expr '.' 'read' '(' ')'
     / Expr '.' 'read_uninit' '(' ')'
     / Expr '.' 'assume_init' '(' ')'

HardwareMethod
    <- Expr '.' 'read' '(' ')'
     / Expr '.' 'write' '(' HardwareNamedArgList ')'
     / Expr '.' 'write' '(' Expr ','? ')'
     / Expr '.' 'modify' '(' HardwareNamedArgList ')'
HardwareNamedArgList
    <- HardwareNamedArg (',' HardwareNamedArg)* ','?
HardwareNamedArg <- UserIdentifier '=' Expr

EndianIntType <- 'u16' / 'i16' / 'u32' / 'i32' / 'u64' / 'i64'
EndianSelector <- '.' ('big' / 'little')

SliceSubscript
    <- '[' '..' ']'
     / '[' Expr '..<' Expr ']'
     / '[' '..<' Expr ']'
     / '[' Expr '..' ']'
```

`TypedConversion` always requires exactly one explicit type argument and one
value argument. `truncate_bits` deliberately has no type argument and requires
its width expression in the second positional slot. `checked<T>(value)` is a
reserved, rejected lookalike and does not enter `NamedConversion`.

`AtomicOrder` uses dot-prefixed `acq_rel`.

`AddressMethod` is shown recursively for compactness; an implementation parses
it through the ordinary left-associative postfix chain, then authenticates the
compiler-owned member name and exact call shape. The ordinary `load` and
`store` forms have no type arguments. The endian forms require the explicit
closed integer type and exact `endian = .big|.little` label. The raw-slice form
requires the exact `elements` label. Semantic receiver restrictions are in
Chapter 6; grammar recognition never makes these user-overloadable methods.

`HardwareMethod` is likewise parsed through the ordinary left-associative
postfix chain and authenticated from the receiver's resolved hardware
declaration. Named and positional branches are disjoint: a named write or
modify has one or more unique labels, while a raw write has exactly one
positional expression. A read has no arguments. Raw and named arguments cannot
mix. These methods are not user-overloadable merely because their contextual
names remain ordinary identifiers outside the registered hardware-method
position. Receiver and arguments evaluate once in written order before the
declared access.

`AtomicStorageType`, `AtomicConstructor`, `AtomicMethodName`, method arities,
element classes, result types, and each method's legal `AtomicOrder` subset are
generated from [`atomic-matrix.json`](atomic-matrix.json); the compact
productions above show their lexical shape, not a second semantic table.
`atomic<T>(value)` requires exactly one explicit element type and one
positional value and is consumed only as the direct initializer of new atomic
storage. The constructor and `atomic` type name are unshadowable. The receiver
and value operands of a method evaluate once in written order.

`MaybeUninit<T>` is a compiler-owned generic storage type and
`MaybeUninitConstructor` requires exactly one explicit type and no value
arguments. The four `MaybeUninitMethod` names authenticate only on a
`MaybeUninit<T>` receiver and have the complete whole-object state contract in
Chapter 11. The ordinary postfix grammar also parses vector `.abs()`/`.sqrt()`
and enum `.tag`; receiver typing authenticates those members. No such member
name is globally reserved merely because it is compiler-owned on that receiver.

`SliceSubscript` is a postfix suffix only. `..<` requires both bounds when the
start is present and always requires an end; `..` denotes omitted start and/or
end only in this production. These punctuation tokens never enter ordinary
binary-expression precedence and never produce a first-class range value.

The contextual word `at` occurs only in an owning declarative placement
production. It is not a prefix, infix, postfix, conversion, address, or memory
access expression operator.

The parser accepts only the forms in this grammar. Atomic storage uses an
explicit `atomic<T>` binding or `@atomic<T>` address and a dot-prefixed order
from the matrix.

`per_cpu var` has no address-taking or whole-copy grammar extension; direct
name/field/element use is constrained semantically by Chapter 8, and
`#percpu_offset_of(binding)` remains the sole offset query. No TLS declaration
or callable/storage type exists in Wyst.

## Outcome and cleanup grammar

```ebnf
operation-decl = "operation" ident generic-params? params operation-protocol effects-clause block? ;
operation-protocol = "{" success-member progress-member? failure-member? cancelled-member? "}" ;
success-member = "success" "(" type ")" ;
progress-member = "progress" "(" type ")" effects-clause ;
failure-member = "failure" "(" type ")" ;
cancelled-member = "cancelled" "(" type ")" ;
operation-expression = direct-call "with" "{" handler-arm+ "}" | direct-call "?" ;
handler-arm = transition "(" binding ")" block | "forward" ("progress" | "failure" | "cancelled") ;
defer-statement = "defer" block ;
terminal-statement = "report" expression | "fail" expression | "cancel" expression ;
match-expression = "match" expression "{" expression-match-arm+ "}" ;
```

Members occur only in the shown canonical order. `?` is postfix punctuation
only on a direct operation call. Expression-match arms use the existing
shallow enum patterns and blocks whose final expression is the arm value.
`#fatal_trap(expression)` is the sole fatal meta-operation spelling.
