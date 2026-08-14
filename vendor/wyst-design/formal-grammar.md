---
title: "Formal Grammar"
group: appendix
order: 700
summary: "Compact grammar for the current Wyst source language."
---

# Formal Grammar

This appendix gives a compact grammar for Wyst source.
Semantic restrictions remain in the owning reference topics.

## Notation

The grammar uses these operators:

| Form | Meaning |
| --- | --- |
| `'text'` | literal source text |
| `A B` | sequence |
| `A / B` | ordered alternative |
| `A?` | zero or one `A` |
| `A*` | zero or more `A` |
| `A+` | one or more `A` |
| `(A B)` | grouped sequence |

`List(A)` means `A (',' A)* ','?`.
An optional final comma does not create an empty element.

The grammar omits whitespace and comments between tokens.
Wyst accepts Unicode whitespace, `//` comments, and non-nested `/* ... */` comments.

## Lexical forms

```peg
IdentStart  <- [A-Za-z_]
IdentRest   <- [A-Za-z0-9_]
Identifier  <- IdentStart IdentRest*
UserName    <- Identifier  // not '_' and not a reserved word or register
Discard     <- '_'
ModulePath  <- UserName ('.' UserName)*

DecimalInt  <- [0-9] ('_'? [0-9])*
HexInt      <- ('0x' / '0X') [0-9A-Fa-f] ('_'? [0-9A-Fa-f])*
OctalInt    <- ('0o' / '0O') [0-7] ('_'? [0-7])*
BinaryInt   <- ('0b' / '0B') [01] ('_'? [01])*
Integer     <- HexInt / OctalInt / BinaryInt / DecimalInt

Exponent    <- [eE] [+-]? DecimalInt
Float       <- DecimalInt '.' DecimalInt Exponent? / DecimalInt Exponent
String      <- a current single-line or multiline string literal
Char        <- a current byte character literal
NameLike    <- UserName / a contextual name accepted in this position
TargetValue <- a balanced target-value token sequence
GenericBound <- UserName

Range       <- '..<' / '..=' / '..'
```

Identifiers are case-sensitive ASCII.
String and comment contents can contain UTF-8.
Floating-point literals use decimal digits, a decimal point, or a decimal exponent.
The compiler rejects hexadecimal floating-point literals and numeric suffixes.
The syntax-word catalog defines reserved and contextual words.
The compiler rejects `;` and `$` in source.

Register tokens include these forms:

```peg
Register <- 'x' N30 / 'w' N30
          / 'v' N31 / 'b' N31 / 'h' N31
          / 's' N31 / 'd' N31 / 'q' N31
          / 'sp' / 'wsp' / 'lr' / 'fp'
          / 'xzr' / 'wzr' / 'ip0' / 'ip1'
N30      <- canonical decimal integer from 0 through 30
N31      <- canonical decimal integer from 0 through 31
```

Only a subset is valid after `in`.
[Functions and Control Flow](functions-and-control-flow.md#explicit-register-placement) defines that subset.

## Compilation units and imports

```peg
CompilationUnit <- Item*

Item <- ModuleDecl / TargetDecl / RequiresDecl / StaticAssertItem
      / CompileIfItem / ImportDecl / SymbolImport / SymbolExport
      / FunctionDecl / ConstDecl / VarDecl / PerCpuDecl / LabelDecl
      / InterfaceDecl / ImplDecl
      / TypeDecl / StructDecl / EnumDecl / BitstructDecl
      / RegisterMapDecl / MmioDecl / SystemRegisterDecl
      / VectorTableDecl / TrapFrameDecl / LayoutDecl

ModuleDecl   <- 'module' ModulePath
TargetDecl   <- '#target' '(' List(TargetArg) ')'
RequiresDecl <- '#requires' '(' List(TargetArg) ')'
TargetArg    <- NameLike '=' TargetValue

ImportDecl <- 'pub'? 'import' (ImportGroup / ImportItem)
ImportGroup <- '(' List(ImportItem) ')'
ImportItem  <- ModulePath ImportSuffix?
ImportSuffix <- 'as' UserName / '{' List(ImportSelection) '}'
ImportSelection <- UserName ('as' UserName)?

SymbolImport <- 'import' 'symbol' String 'as' UserName
                ':' LinkerBoundaryType
SymbolExport <- 'export' 'weak'? UserName TypeArguments?
                ('as' 'symbol' String)?
LinkerBoundaryType <- ExternCallableType / AddressType
ExternCallableType <- ExternConvention 'fn' '(' List(CallableParam)? ')'
                      CallableResult? ConcurrencyClause*
                      EffectClause? TrustClause?
```

`TargetValue` is the balanced token value owned by the target catalog.
Module-order and visibility rules are in [Modules and Symbol Boundaries](modules-and-symbol-boundaries.md).

## Attributes and declarations

```peg
AttributeGroup <- '#[' List(Attribute) ']'
Attribute      <- UserName / UserName '(' List(AttributeArg) ')'
AttributeArg   <- UserName '=' Expr / Expr

GenericParams <- '<' List(GenericParam) '>'
GenericParam  <- UserName (':' GenericConstraint)?
GenericConstraint <- GenericBound / InterfacePath
TypeArguments <- '<' List(Type) '>'

InterfacePath <- UserName ('.' UserName)*
InterfaceDecl <- 'pub'? 'interface' UserName ':' GenericBound
                 '{' InterfaceOperation* '}'
InterfaceOperation <- UserName ':' InterfaceRequirement
InterfaceRequirement <- 'fn' '(' 'Self' (',' List(CallableParam))? ')'
                        CallableResult? ConcurrencyClause*
                        EffectClause? TrustClause?
ImplDecl <- 'impl' InterfacePath 'for' QualifiedType
            '{' ImplBinding* '}'
ImplBinding <- UserName '=' InterfacePath

FunctionDecl <- AttributeGroup? 'pub'? 'naked'? ExternConvention?
                'fn' UserName GenericParams? Parameters FunctionResult?
                ContractClause* ConcurrencyClause* InteractiveProtocol?
                EffectClause? TrustClause? FunctionBody?
ExternConvention <- 'extern' '"C"'
FunctionBody <- Block

Parameters <- '(' List(Parameter)? ')'
Parameter  <- ParamMode? UserName ':' 'noescape'? Type RegisterPlacement?
ParamMode  <- 'mut' / 'var'

FunctionResult <- '->' Observation? ReturnMode? ResultType
                  RegisterPlacement? ReturnSources?
Observation <- 'must_observe'
ReturnMode  <- 'mut'
ResultType  <- Type / 'never'
ReturnSources <- 'from' UserName (',' UserName)*
RegisterPlacement <- 'in' Register

ContractClause <- RequiresClause / EnsuresClause
RequiresClause <- 'requires' '(' Expr (',' 'reason' '=' Expr)? ')'
EnsuresClause  <- 'ensures' '(' Expr ',' 'reason' '=' Expr ')'

EffectClause <- 'effects' '(' BoundNames ')'
TrustClause  <- 'trusts' '(' BoundNames ')'
BoundNames   <- 'none' / 'all' / List(UserName)

ConstDecl <- AttributeGroup? 'pub'? 'const' UserName TypeAnnotation? '=' Expr
VarDecl   <- AttributeGroup? 'pub'? 'var' UserName TypeAnnotation? '=' Expr
PerCpuDecl <- AttributeGroup? 'pub'? 'per_cpu' 'var' UserName
              TypeAnnotation? '=' Expr
TypeAnnotation <- ':' Type

LabelDecl <- AttributeGroup? 'pub'? 'naked'? 'label' UserName
             TrapFrameLabelClause? Block
TrapFrameLabelClause <- 'establishes' UserName ':' '@' UserName
                      / 'restores' UserName

TypeDecl <- AttributeGroup? 'pub'? 'type' UserName ':' Type
ResourceModifier <- 'no_copy' / 'must_account' / 'must_resolve'
                  / 'opaque' / 'agent_local'
StructDecl <- AttributeGroup? 'pub'? ResourceModifier* 'packed'?
              'struct' UserName GenericParams? StructBody
StructBody <- '{' (AttributeGroup? Field ','?)* '}'
Field      <- UserName ':' Type

EnumDecl <- AttributeGroup? 'pub'? ResourceModifier* 'enum' UserName
            GenericParams? (':' Type)? EnumBody
EnumBody  <- '{' (EnumVariant ','?)* '}'
EnumVariant <- UserName ('(' List(Type)? ')')? ('=' Expr)?

BitstructDecl <- AttributeGroup? 'pub'? 'bitstruct' UserName
                 ':' Type '{' (BitstructField ','?)* '}'
BitstructField <- UserName ':' Type 'at' Expr ('..=' Expr)?
```

The attribute catalog defines active attributes, subjects, arguments, and conflicts.
A declaration accepts at most one leading attribute group.

`InterfaceDecl` and `ImplDecl` do not accept attributes. `ImplDecl` does not
accept `pub`, generic parameters, inline method bodies, or compound subject
types. `Self` is a contextual compiler binder valid exactly as parameter 0 of
an interface requirement; it is not part of the ordinary `Type` production.
Each generic parameter has at most one constraint.

The complete nominal-resolution, conformance, and erasure rules are in
[Interfaces and Implementations](interfaces-and-implementations.md).

A native function requires a body.
An `extern "C" fn` can omit its body.
Contracts require a body-bearing, non-`naked` Wyst function.

## Interactive declarations and calls

```peg
InteractiveProtocol <- 'offers' HandlerBound? '{'
                       ProgressOffer? TerminalOffers? '}'
HandlerBound <- 'handler' '(' BoundNames ')'
ProgressOffer <- 'progress' '(' Type ')'
TerminalOffers <- 'terminal' '{' FailureOffer? CancelledOffer? '}'
FailureOffer   <- 'failure' '(' Type ')'
CancelledOffer <- 'cancelled' '(' Type ')'

HandleExpr <- 'handle' DirectCall '{' ProgressHandler? TerminalHandlers? '}'
ProgressHandler <- HandlerArm('progress')
TerminalHandlers <- 'terminal' '{'
                    HandlerArm('failure')? HandlerArm('cancelled')? '}'
HandlerArm(L) <- L '(' Binding ')' Block / 'forward' L
Binding <- UserName / Discard

ExactForwardExpr <- DirectCall '?'
```

Offers use canonical `progress`, then `terminal` order.
Terminal offers use canonical `failure`, then `cancelled` order.
The terminal group must not be empty.

`?` is active syntax.
Semantic checking limits `?` to exact failure forwarding.
[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) defines the protocol.

## Target structures

```peg
TargetProfile <- UserName ('.' UserName)*

VectorTableDecl <- AttributeGroup? 'pub'? 'vector_table' UserName
                   ':' TargetProfile '{' (VectorSlot ','?)* '}'
VectorSlot <- DottedSlotName ('->' UserName / Block)
DottedSlotName <- UserName ('.' UserName)+

TrapFrameDecl <- AttributeGroup? 'pub'? 'trap_frame' UserName
                 ':' TargetProfile StructBody
```

`vector_table` and `trap_frame` are active declarations.
The target profile defines valid slots and trap-frame fields.
[AArch64 Exception Vectors and Trap Frames](exception-vectors-and-trap-frames.md) gives those rules.

## Layout declarations

```peg
LayoutDecl <- 'layout' UserName '{' LayoutMember* '}'
LayoutMember <- LayoutEntry / LayoutRegion / LayoutSection / LayoutSymbol
LayoutEntry <- 'entry' ModulePath ('at' Expr)?
LayoutRegion <- 'region' UserName ':' ('readonly' / 'readwrite')
                'at' Expr 'size' Expr
LayoutSection <- 'section' String ':' ('code' / 'rodata' / 'data' / 'bss')
                 LayoutSectionClause*
LayoutSectionClause <- 'in' UserName / 'after' String / 'align' Expr
LayoutSymbol <- 'pub'? 'symbol' UserName ':' Type '=' Expr
```

A layout has exactly one entry.
[Named Layouts and Placement](named-layouts-and-placement.md) defines layout semantics.

## Hardware declarations

```peg
HardwareAccess <- 'readonly' / 'writeonly' / 'readwrite'

RegisterMapDecl <- AttributeGroup? 'pub'? 'register_map' UserName
                   '{' (MapRegister ','?)* '}'
MapRegister <- UserName ':' HardwareAccess Type 'at' Expr HardwareFields?

MmioDecl <- AttributeGroup? 'pub'? 'mmio' UserName ':' MmioTarget 'at' Expr
MmioTarget <- HardwareAccess Type / Type

SystemRegisterDecl <- AttributeGroup? 'pub'? 'system_register' UserName
                      ':' HardwareAccess Type
                      ('at' SystemRegisterEncoding)? HardwareFields?
SystemRegisterEncoding <- 'S' DecimalInt '_' DecimalInt
                          '_C' DecimalInt '_C' DecimalInt '_' DecimalInt

HardwareFields <- '{' (HardwareFieldEntry ','?)* '}'
HardwareFieldEntry <- HardwareField / ReservedField
HardwareField <- UserName ':' HardwareAccess? Type 'at' BitLocation
                 ResetPolicy? ReadPolicy? WritePolicy?
ReservedField <- 'reserved' 'at' BitLocation ('one' / 'preserve')
BitLocation <- Expr ('..=' Expr)?
ResetPolicy <- 'reset' Expr
ReadPolicy <- 'read_clears' / 'read_sets'
WritePolicy <- 'write_ignored'
             / 'write_one_clears' / 'write_one_sets' / 'write_one_toggles'
             / 'write_zero_clears' / 'write_zero_sets' / 'write_zero_toggles'
```

Catalog-named system registers require a field block.
Encoded system registers can omit an empty field block.
Hardware semantics are in [Semantic Operations and Hardware Declarations](semantic-operations.md).

`RegisterMapDecl` introduces its `UserName` into both the nominal type namespace
and the hardware-schema namespace. In `MmioDecl`, a `MmioTarget` resolving to a
register-map name declares a placed value of that nominal type; a target
beginning with `HardwareAccess` declares the existing scalar hardware object.
No additional expression production is required because placed declarations
are `NameExpr` values and register access uses ordinary `FieldSuffix` syntax.

## Types

```peg
Type <- CallableType / AddressType / SliceType / VectorType / ArrayType
      / NamedTupleType / AppliedType / QualifiedType / 'never'

AddressType <- '@' ('mmio' / 'volatile')? Type
SliceType   <- '[' ']' Type
ArrayType   <- '[' (Expr / '_') ']' Type
VectorType  <- '[' Type ':' Expr ']'
AppliedType <- QualifiedType TypeArguments
QualifiedType <- NameLike ('.' UserName)*

NamedTupleType <- '(' NamedTupleField ',' NamedTupleField
                  (',' NamedTupleField)* ','? ')'
NamedTupleField <- UserName ':' Type

CallableType <- ExternConvention? 'fn' '(' List(CallableParam)? ')'
                CallableResult? ConcurrencyClause* EffectClause? TrustClause?
CallableParam <- ParamMode? 'noescape'? Type RegisterPlacement?
CallableResult <- '->' Observation? ReturnMode? ResultType
                  RegisterPlacement? CallableReturnSources?
CallableReturnSources <- 'from' CallableReturnSource
                         (',' CallableReturnSource)*
CallableReturnSource <- 'parameter' '(' DecimalInt ')'
```

`NameLike` is an identifier or a contextual name accepted in that position.
[Type System](type-system.md) defines the available types.

## Statements

```peg
Block <- '{' Statement* '}'

Statement <- LocalDecl / TupleLocal / TupleAssignment / Assignment / IfStmt / WhileStmt
           / LoopStmt / ForStmt / MatchStmt / GuardStmt / ScheduleStmt
           / 'break' / 'continue' / DeferStmt / ReturnStmt
           / 'report' Expr / 'fail' Expr / 'cancel' Expr
           / 'goto' UserName / DiscardStmt / ResolveStmt
           / CheckedAsm / StackTransition / FrameTransition
           / StaticAssertStmt / CompileIfStmt / Expr

StackTransition <- 'establish' 'stack' 'from' Expr
FrameTransition <- 'establish' 'frame' / 'restore' 'frame'

LocalDecl <- ('const' / 'var') UserName TypeAnnotation?
             RegisterPlacement? '=' Expr
TupleLocal <- ('const' / 'var') '(' List(Binding) ')' '=' Expr
Assignment <- Expr AssignOperator Expr
TupleAssignment <- '(' List(Binding) ')' '=' Expr

AssignOperator <- '=' / '+=' / '-=' / '*=' / '/=' / '%=' / '%%='
               / '&=' / '&^=' / '|=' / '^=' / '<<=' / '>>='
               / '&&=' / '||='

IfStmt    <- 'if' (Expr / IsExpr) Block ('else' Block)?
WhileStmt <- AttributeGroup? 'while' Expr Block
LoopStmt  <- AttributeGroup? 'loop' Block
ForStmt   <- AttributeGroup? 'for' UserName 'in'
             (Expr '..<' Expr / Expr) Block

MatchStmt <- 'match' Expr '{' MatchArm* '}'
MatchArm  <- List(VariantPattern) Block?
VariantPattern <- '.' UserName ('(' List(Binding)? ')')?

GuardStmt <- 'guard' 'mut'? Expr
             ('by' Expr / 'against' ExclusionMechanism) Block
ScheduleStmt <- 'schedule' 'source' Block
DeferStmt <- 'defer' Block
ReturnStmt <- 'return' Expr?
DiscardStmt <- 'discard' '(' Expr ')'
ResolveStmt <- 'resolve' '(' Expr ')'

StaticAssertStmt <- '#static_assert' '(' Expr ',' String ','? ')'
CompileIfStmt <- '#if' Expr Block ('#else' (CompileIfStmtTail / Block))?
CompileIfStmtTail <- 'if' Expr Block ('#else' (CompileIfStmtTail / Block))?
CompileIfItem <- '#if' Expr ItemBlock ('#else' (CompileIfItemTail / ItemBlock))?
CompileIfItemTail <- 'if' Expr ItemBlock
                     ('#else' (CompileIfItemTail / ItemBlock))?
ItemBlock <- '{' Item* '}'
StaticAssertItem <- StaticAssertStmt

ConcurrencyClause <- StorageClause / AccessClause / UnderClause
                   / AcquireClause / ReleaseClause
                   / ExcludeClause / RestoreClause
StorageClause <- ('initializes' / 'unchanged' / 'preserves')
                 '(' Expr ')' ('from' Expr (',' Expr)*)? OutcomeClause?
OutcomeClause <- 'on' '.' UserName
AccessClause <- 'accesses' '(' 'mut'? Expr ')'
UnderClause  <- 'under' '(' (Expr / ExclusionMechanism) ')'
AcquireClause <- 'acquires' '(' Expr ')' ('when' Expr)?
ReleaseClause <- 'releases' '(' Expr ')'
ExcludeClause <- 'excludes' '(' ExclusionMechanism ')'
RestoreClause <- 'restores' '(' ExclusionMechanism ')'
ExclusionMechanism <- 'interrupts' '(' '.'? UserName ')' / 'preemption'
```

Only `var` locals can have register placement.
A placed local requires an explicit type.
Direct-value `for` syntax requires `#[unroll]`.

## Expressions

```peg
Expr <- PrefixExpr Postfix* BinaryTail*

PrefixExpr <- Literal / NameExpr / '(' Expr ')'
            / TupleExpr / ArrayLiteral / StructLiteral
            / UnaryExpr / IfExpr / MatchExpr / SelectExpr
            / HandleExpr / CheckedAsmExpr / MetaExpr / CompileIfExpr

UnaryExpr <- ('+' / '-' / '!' / '~' / 'xfer') Expr
Literal <- Integer / Float / String / Char / 'true' / 'false' / DotName
DotName <- '.' UserName
NameExpr <- NameLike ('.' UserName)*
DirectCall <- NameExpr TypeArguments? CallSuffix
TupleExpr <- '(' Expr ',' List(Expr) ')'
ArrayLiteral <- '[' (Expr ';' Expr / List(Expr))? ']'
StructLiteral <- '{' List(FieldInit)? '}'
FieldInit <- UserName '=' Expr

Postfix <- TypeArguments / CallSuffix / IndexSuffix / SliceSuffix
         / FieldSuffix / ExactForwardSuffix
CallSuffix <- '(' List(CallArg)? ')'
CallArg <- Expr / UserName '=' Expr
IndexSuffix <- '[' Expr ']'
SliceSuffix <- '[' (Expr? '..<' Expr / Expr? '..') ']'
FieldSuffix <- '.' UserName
ExactForwardSuffix <- '?'

IfExpr <- 'if' Expr Block 'else' Block
MatchExpr <- 'match' Expr '{' MatchArm* '}'
SelectExpr <- 'select' '(' Expr ',' Expr ',' Expr ','? ')'
IsExpr <- Expr 'is' VariantPattern
CompileIfExpr <- '#if' Expr Block ('#else' (CompileIfExprTail / Block))?
CompileIfExprTail <- 'if' Expr Block ('#else' (CompileIfExprTail / Block))?

MetaExpr <- '#addr_of' '(' Expr ','? ')'
          / '#align_of' '(' Type ','? ')'
          / '#cache_line_width' '(' ')'
          / '#dedent' MultilineString
          / '#eval' '(' DirectCall ','? ')'
          / '#field_offset' '(' Type ',' UserName ','? ')'
          / '#len' '(' Expr ','? ')'
          / '#link_value' '(' Expr ','? ')'
          / '#percpu_offset_of' '(' Expr ','? ')'
          / '#size_of' '(' Type ','? ')'
          / '#tag_of' '(' Expr ','? ')'
MultilineString <- a current multiline string literal

BinaryTail <- BinaryOperator Expr / 'is' VariantPattern
BinaryOperator <- '||' / '&&' / '==' / '!=' / '<' / '<=' / '>' / '>='
               / '|' / '^' / '&' / '&^' / '<<' / '>>'
               / '+' / '-' / '*' / '/' / '%' / '%%'
```

[Operators and Evaluation](operators-and-evaluation.md) defines precedence, types, and evaluation order.
Comparisons do not chain without parentheses.
Positional call arguments must precede labeled arguments.

## Checked assembly

```peg
CheckedAsm <- 'asm' 'retained'? AsmAlign? AsmParameters? AsmResult? AsmBody
CheckedAsmExpr <- CheckedAsm  // requires AsmResult

AsmAlign <- '#[' 'align' '(' Expr ')' ']'

AsmParameters <- '(' List(AsmParameter) ')'
AsmParameter <- AsmInput / AsmImmediate / AsmSymbol / AsmScratch
AsmInput <- UserName (':' Type)? RegisterPlacement? '=' Expr
AsmImmediate <- UserName ':' 'imm' '=' Expr
AsmSymbol <- UserName ':' 'symbol' '=' ModulePath
AsmScratch <- 'scratch' UserName ':' Type RegisterPlacement?

AsmResult <- '->' ('never' / AsmValueResult / AsmMultiResult)
AsmMultiResult <- '(' AsmValueResult ',' AsmValueResult
                  (',' AsmValueResult)* ','? ')'
AsmValueResult <- UserName / UserName ':' Type RegisterPlacement?

AsmBody <- '{' AsmPhysicalLine* '}'
```

The parameter list cannot be empty.
The final physical line must end before the closing brace line.
The target instruction catalog defines `AsmPhysicalLine`.
[Checked Assembly](checked-assembly.md) defines the checked contract.

## Meta-operations

The current `#` meta-operations are listed in the meta-operation catalog.

| Operation | Current source form |
| --- | --- |
| `#addr_of` | `#addr_of(expression)` |
| `#align_of` | `#align_of(Type)` |
| `#cache_line_width` | `#cache_line_width()` |
| `#dedent` | `#dedent` followed by one multiline string |
| `#else` | paired branch marker for `#if` |
| `#eval` | required evaluation of a direct zero-argument function call |
| `#field_offset` | `#field_offset(Type, field)` |
| `#if` | compile-time item, statement, or expression selection |
| `#len` | `#len(expression)` |
| `#link_value` | `#link_value(layout_symbol)` |
| `#percpu_offset_of` | `#percpu_offset_of(expression)` |
| `#requires` | module target requirement declaration |
| `#size_of` | `#size_of(Type)` |
| `#static_assert` | item or statement assertion with a message |
| `#tag_of` | `#tag_of(expression)` |
| `#target` | module target declaration |

Unknown `#name` forms are lexical errors outside checked assembly.
Inside checked assembly, `#name` can name an assembly immediate binder.
