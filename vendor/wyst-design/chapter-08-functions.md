---
title: "Chapter 8: Wyst Functions, Control Flow, and Inline Assembly"
group: chapter
chapter: 8
order: 8
summary: "Declarations, functions, parameters, returns, control flow, labels, inline helpers, explicit register placement, and assembly escape hatches."
---

# Chapter 8: Wyst Functions, Control Flow, and Inline Assembly

> **Scope.** This chapter owns keyword-led declarations, callable identity,
> register placement, mandatory `#[inline]`, `per_cpu` storage, and structured
> control flow. Calling-convention rules live in
> [chapter-15-abi-spec.md](chapter-15-abi-spec.md); exception vectors live in
> [chapter-14-exception-vectors.md](chapter-14-exception-vectors.md).

The core contract covers declarations, parameters, return values, and
structured control flow. Explicit register placement, `naked`, and checked
`asm` are machine-level contracts whose ABI and target rules are defined
elsewhere.

---

## Declarations, Calls, and Enum Control Flow

Core declarations and stored bindings are keyword-led:

```text
fn name<T>(parameter: T) -> T { ... }
const name: T = value
var name: T = value
label name { ... }
struct Name { field: T }
enum Name { variant payload(T) }
bitstruct Name: u32 { FIELD: u8 at 0..=3 }
```

An optional declaration attribute group comes first, followed by `pub`, any
activated hard modifier or storage class, an activated external convention,
and then the declaration keyword. A declaration has at most one non-empty
`#[...]` group. The attribute catalog owns legal subjects, argument
forms, conflicts, and formatter order; unknown and inactive attributes are
errors rather than ignored annotations.

Every `const` and `var`, including a destructuring binding, has an explicit
initializer. `const` is immutable and `var` is mutable. Either may omit `: T`
only when its initializer determines one unambiguous type. A local `const` may
hold a runtime result. Module `const` initializers remain constant-phase;
module `var` initializers must be statically representable constants or
relocations. Neither form implies zero initialization or hidden startup code.

<!-- wyst-contract: fmt -->
```wyst
module functions.contract

fn identity(value: u64) -> u64 {
  return value
}
```

Functions use named declaration parameters and may return either one type or a
named tuple of at least two result fields:

<!-- wyst-contract: sketch -->
```wyst
fn divmod(a: u64, b: u64) -> (quotient: u64, remainder: u64) {
  return (a / b, a % b)
}

const (quotient, remainder) = divmod(7, 3)
var (x, _) = divmod(10, 4)
(x, remainder) = divmod(20, 6)
```

`const (...)` and `var (...)` give every introduced name that mutability; `_`
discards one position. A tuple assignment has no binding keyword, requires all
non-discard names to exist and be mutable, evaluates its right side once, and
updates every target simultaneously. Bare comma forms and mixed declaration
and assignment are errors. Tuples remain restricted to named multi-results and
their result storage: anonymous, nested, single-element, parameter, and
general-purpose tuple types are not part of Wyst.

Every call argument has one parser form: `expression` or `name = expression`.
Positional arguments precede labeled arguments. Labels on a statically resolved
direct Wyst call are its declaration parameter names and may reorder the
remaining parameters; indirect calls are positional only. Every required
parameter is supplied exactly once. Arguments evaluate once, left to right in
written order, before ABI placement, so duplicate, unknown, missing, and
positional-after-labeled arguments are errors. Public parameter names are part
of the Wyst source interface, but not ABI or symbol identity.

`match` is exhaustive and enum-only in statement or expression position:

<!-- wyst-contract: sketch -->
```wyst
match message {
  .quit {
    return
  }
  .write(packet) {
    send(packet)
  }
  .uart(value), .virtio(value) {
    trace(value)
  }
  else {}
}
```

The scrutinee is evaluated once. Each arm has one or more comma-separated
shallow `.variant`, `.variant(name)`, or `.variant(_)` patterns followed
directly by a required brace body. Alternatives bind the same names and types;
arms do not fall through, and `break` does not target a `match`. Without a
final `else`, the variants must be statically exhaustive. A final explicit
`else {}` deliberately accepts unlisted variants. In expression position each
reachable arm supplies a tail value of one exact common type; `never` is
compatible and ownership joins are exact. A partial-match opt-out is illegal.
There are no colon or arrow arms, wildcard arms, guards, or nested patterns. The same
shallow pattern is available in `if value is .variant(binding) { ... }`, with
the binding scoped to the successful branch.

## Callable Identity, Terminal Entries, and Storage Classes

This section is the sole source-semantic owner for
`language.callable-storage-contracts`. Chapters 9, 11, 15, and 16 and
Appendices A and B project this contract into memory ordering, target
lowering, ABI, object, IR, and grammar rules; they do not define alternate
source semantics.

The activated declaration-prefix order is exactly: one optional non-empty
attribute group, optional `pub`, one compatible hard modifier or storage
class, optional external convention, declaration keyword, then declaration
name. Thus `pub naked extern "C" fn`, `pub per_cpu var`, and `pub packed
struct` are ordered forms. `naked`, `per_cpu`, and `packed` are not attributes,
may not be duplicated, and are accepted only on `fn`/`label`, module `var`, and
`struct`, respectively.

<!-- wyst-contract: sketch -->
```wyst
import core.arch { cpu }

#[section(".text.boot")]
pub naked extern "C" fn boot_entry(arg: @u8 in x0) -> never {
  loop { cpu.wfe() }
}

var callback: extern "C" fn(noescape @u8 in x0, u64 in x1)
  -> i32 in x0 = c_callback

per_cpu var cpu_id: u64 = 0
packed struct Header { tag: u32 }

fn worker() {
  var state: u64 in x19 = 0
}
```

### Callable identity and register placement

A callable value type is `fn(...) -> ...` for the Wyst Native convention or
`extern "C" fn(...) -> ...` for AAPCS64. Its identity is the exact tuple of:

1. calling convention;
2. ordered parameter types;
3. the `noescape` bit on each parameter;
4. the optional `in register` placement on each parameter;
5. result type (including `never`); and
6. the optional `in register` placement on one scalar result.

Declaration parameter names are source-interface labels for direct calls only;
they never occur in a callable value type and are not identity. `pub` and
`naked` likewise are not callable identity. There is no implicit wrapper,
register shuffle, convention conversion, or other adaptation between unequal
callable identities. A direct declaration call may use its parameter labels;
every call through a callable value is positional.

A callable's `effects(...)` clause is its closed semantic upper bound. It is
preserved with callable values and imported interfaces independently of ABI
register identity. `effects(all)` includes the target-neutral
`execution_suspension` effect; an absent bodyless foreign bound is conservative
`all`, not `none`. Every direct or indirect call whose exact or conservative
bound contains that effect creates one typed `strand_suspension_boundary`
after left-to-right argument evaluation and immediately before transfer. Known
assignments must fit the destination bound, and arrays, fields, aggregates,
phis, parameters, results, inlining, and serialized summaries preserve it.
Chapter 13 owns the boundary ordering, context-stability liveness, migration,
and retained-task/activation identity rules.

`noescape` precedes an address parameter's type in both declarations and
callable value types. It is invalid on a non-address parameter and is part of
identity, not an advisory attribute. The callee may use the address only under
the checked non-escape rules: it may perform direct accesses or forward it to
another matching `noescape` parameter, but may not store, return, cast,
repackage, or otherwise expose the address.

The contextual `in` register-placement clause is legal only:

- after a declaration parameter type;
- after a callable-type parameter type;
- after one scalar result type; or
- after the type of a local mutable `var`.

It is invalid on module `var` or `const`, fields, types, a whole callable,
named multi-results, or `never`. Parameter and result placements are positional
ABI requirements and therefore callable identity. A local placement is a hard
storage requirement for that binding, not callable identity. The named target
register must be legal for the value class and width under Chapter 15, must not
conflict with another simultaneously required location, and must not name
target-reserved state. If allocation and preservation cannot satisfy the exact
request, compilation fails; the compiler does not silently choose another
register.

### `never`, labels, and `naked`

`never` is the bottom return type and is legal only as the complete result of
a function or callable value. It has no result register. A function declared
`-> never` must not reach the end of its body, and a call whose result is
`never` terminates its reachable source path.

A `label name { ... }` is an inherently nonreturning entry, not a callable
value. Every reachable path in a label must end in an explicit `goto`, an
architectural return/exception transfer, or a `never` call. Ordinary function
fallthrough remains legal only when the function has no value result; it is
always illegal for `never`.

`naked fn` and `naked label` are hard lowering forms. The compiler emits no
prologue, epilogue, compiler-owned frame, spill, callee-save, hidden argument
home, or return sequence. It diagnoses a body that would require any such
resource. `naked` changes lowering but not callable identity. It does not
narrow the legal value classes or register numbers for explicit parameter,
scalar-result, or local placements: GPR, scalar FP, and SIMD placements remain
legal when their complete ABI map is register-only. This includes more than
eight parameters when every final parameter location is explicitly assigned a
legal register. Any actual incoming stack location, register-class mismatch,
reserved register, spill, hidden save, or compiler-owned return remains a hard
error.

### Mandatory `#[inline]`

`#[inline]` is a hard expansion contract, not an optimization hint. It is
valid only on a non-`naked` Wyst `fn` with an available body. Every statically
resolved direct call is expanded before machine lowering in every profile;
failure to expand is a compile error, never permission to emit an ordinary
call. Expansion preserves left-to-right exactly-once argument evaluation,
control flow, effects, source/debug provenance, schedule regions, checked-asm
authority, and explicit-register constraints. Each expansion receives
deterministic, collision-free typed-IR identities.

The attribute conflicts with `align`, `init`, and the future `frame` contract,
and is rejected on foreign/import-only, naked, recursive, or bodyless
declarations. Expansion cycles, unavailable bodies, incompatible call-site
register/resource contracts, and compiler expansion-budget exhaustion are
distinct hard failures. Direct and mutual recursion are rejected before
lowering.

Address-taking, indirect calls, export, or `#[section("...")]` retain
one ordinary out-of-line definition for each demanded concrete function
identity. Those uses do not weaken direct-call expansion, and `#[inline]` is
not part of callable type identity. A generic attribute does not invent type
arguments: the rules apply independently only to concrete instantiations
demanded by ordinary reachability or another explicit artifact root.

### `per_cpu var`

`per_cpu` is legal only on a module-scope mutable `var` with an explicit
statically representable initializer under
`language.keyword-led-declarations-bindings`. The declaration defines one
natural-layout initialization-template entry: source type and layout, natural
alignment, initializer bytes and relocations, canonical storage-class/symbol
identity, deterministic template placement, and final byte offset in
the linked `.percpu` template. The template is semantically immutable. `pub`
controls Wyst source visibility only; it does not export a process address,
current-instance address, or raw template address.

A Wyst `per_cpu` declaration may raise its template-entry alignment with
`#[align(N)]`. Both the final template offset and every live-instance address
must then satisfy the maximum of the natural, explicit, and realization
alignment requirements. The selected realization must prove the corresponding
live-base and stride guarantees; `single_instance_tpidr_el1` guarantees only
16-byte base alignment, so a larger requirement is rejected there.
`#[cache_isolated]` additionally requires a selected realization that proves a
writable cacheable-Normal live placement, cache-line-aligned bases, and a
cache-line-rounded instance stride. Function-pointer values are scalar and may
carry static template relocations. Fixed arrays, structs, named tuples,
bitstructs, and statically representable string descriptors expose only their
direct scalar element/field projections. Vector storage is rejected until a
scalar lane-access contract exists; slice and dynamic-array descriptor storage
remains rejected. Payload-less enums use their scalar tag representation;
payload-bearing enums are rejected because Wyst has no direct scalar projection
for their whole aggregate stored value.

`#percpu_offset_of(binding)` is the only non-access projection. It produces a
`u64` byte offset from the start of the final linked `.percpu` template to the
binding, never a process or current-instance address. The offset is stable for
one complete build input but is not a source ABI across builds whose import
closure, declarations, types, alignment, or layout changes.

Source may directly read or write the current-core instance of a scalar,
field, or element. It may not apply ordinary or runtime address-of, export a
raw symbol address, construct an address to the instance or template, copy a
whole `per_cpu` aggregate, or use the template as live storage. Each direct
source access lowers independently to exactly:

1. one acquisition of the selected target's current-core base;
2. the binding's final linked byte offset plus any statically checked
   field/element offset; and
3. exactly the one type-appropriate operation requested by source.

Ordinary storage performs its normal typed load or store. Atomic storage is
accessible only through the `wyst.atomic-matrix.v1` methods once those methods
are active. A named bitstruct-field write is one logical type-appropriate source
operation: it uses one fresh base and one narrowly confined backing-word
`Load -> BitfieldInsert -> Store` read-modify-write sequence. The verifier
admits only that exact dataflow and no address escape or unrelated second use
(`callable_storage_confines_per_cpu_bitfield_reads_and_writes_to_one_live_base`).
Compound assignment is rejected because it would reuse one internal
current-instance address for both a load and a store; spell the read and write
as separate direct accesses so each obtains a fresh base. A base obtained for
one source access is not cached, hoisted, placed in a frame slot, or reused for
another access; each source access observes the target's current-core state
independently.

The selected target/runtime contract must state whether current-core access is
available, the base mechanism, its required alignment, every reserved register
or system-state assumption, and the realization kind. Lowering and inspection
reports expose those facts. Before the production multicore realization
milestone, the only access-enabling selection is:

<!-- wyst-contract: sketch -->
```wyst
#target(arch = arm64-v8a, el = 1,
        per_cpu = single_instance_tpidr_el1)
```

Its facts are `available`, base mechanism `MRS TPIDR_EL1`, minimum exception
level EL1, 16-byte live-base alignment, reserved system state `TPIDR_EL1`, and
realization `single-instance-test-runtime`. The runtime must install a
16-byte-aligned live single instance in `TPIDR_EL1` before any access. Without
that exact selection, every reachable `per_cpu` access is a hard target
diagnostic. The compiler never infers single-core operation from observed
hardware and never aliases the template itself as the live instance.

The current compiler emits only the immutable template and the requested access sequence.
It performs no instance replication, allocation, base installation, startup
copy, or implicit collapse to an ordinary global. Later runtime work may copy
the immutable template without changing its source, object, or offset semantics.
Wyst has no TLS storage class. Callable forms use `extern "C" fn(...)` and
`fn(...)`.

## 2.3 Explicit Register Placement

The contextual `in register` clause requires a scalar parameter, scalar result,
callable-type position, or local mutable `var` to occupy an exact target
register. It is a hard ABI or storage constraint, not an allocator hint. If the
constraint cannot be satisfied, compilation fails instead of choosing another
register or silently spilling the value.

Placement is not legal on module variables, constants, fields, types, a whole
callable, named multi-results, or `never`. Platform-reserved registers belong to
the target ABI and cannot be claimed by source declarations.

---

### Canonical Forms

Placement appears immediately after the placed type:

<!-- wyst-contract: check-pass -->
```wyst
module register_placement

fn entry(argument: u64 in x0) -> u64 in x1 {
  var state: u64 in x19 = argument
  return state
}

const callback: fn(u64 in x0) -> u64 in x1 = entry
```

A local `var` always has an initializer. There is no post-hoc placement
statement and no declaration-without-initializer alias form.

---

### Placing Local Variables

<!-- wyst-contract: check-pass -->
```wyst
module local_register_placement

fn setup() {
  var counter: u64 in x19 = 0
  for i in 0 ..< 100 {
    counter += 1
  }
}
```

`counter` occupies `x19` for the binding's lifetime. If `x19` is unavailable,
the declaration is rejected.

---

### Placing Function Parameters and Results

Parameter and result placements are callable identity. They are the canonical
way to receive firmware or hardware entry values and to define exact direct-call
boundaries:

<!-- wyst-contract: check-pass -->
```wyst
module boot

import core.arch { cpu }

fn decode(argument: u64 in x0) -> u64 in x6 {
  return argument + 1
}

fn firmware_entry(dtb: @u8 in x0) -> never {
  kernel_init(dtb)
}

fn kernel_init(dtb: @u8) -> never {
  loop {
    cpu.wfe()
  }
}
```

Callers must satisfy the declared locations. A callable value with different
parameter or result placements is a different type and is not implicitly
adapted.

---

### Non-Escaping Address Parameters

`noescape` precedes an address parameter type and marks a call-scoped borrow
that the callee must not retain or expose. It allows callers to pass
`addr_of(local)` without forcing the storage into a global:

<!-- wyst-contract: check-pass -->
```wyst
module boot

fn fill(out: noescape @u64) {
  out.store(42)
}

fn main() -> u64 {
  var value: u64 = 0
  fill(addr_of(value))
  return value
}
```

Inside the callee, `noescape` is a syntactic rule over the parameter value. A
`noescape` parameter may appear only as:

- the address operand of a direct memory access, including offset arithmetic in
  that address operand, vector loads/stores, endian loads/stores, atomic
  operations, prefetch, and cache-maintenance operations; or
- an argument to a call whose corresponding callable parameter is also marked
  `noescape`.

The parameter may not undergo any categorized conversion, be copied into a local binding,
tuple, aggregate, or slice value, be assigned to another local, be returned, be
stored through memory as a value, be passed to an ordinary or indirect call, be
observed as a condition or ordinary arithmetic/comparison value, or be exposed
through checked-`asm` parameter expressions or compiler-operation operands.
Violations are compile errors:

<!-- wyst-contract: check-fail -->
```wyst
module boot

fn bad(ptr: noescape @u64) -> @u64 {
  return ptr
}
```

`noescape` is a parameter contract and part of callable identity, not an
address qualifier or a general provenance model. Indirect calls accept a
stack-local address only when the callable type's corresponding parameter is
also `noescape`.

---

### Callee-Saved Local Placement (Prologue Ownership)

When a non-`naked` function places a local variable in a callee-saved register
(`x19`–`x28`), the function's prologue **always** saves that register,
and the epilogue **always** restores it. The save is unconditional: it does
not depend on liveness analysis, on whether the function makes calls, or on
how many paths through the body actually read the placed binding.

<!-- wyst-contract: check-pass -->
```wyst
module demo

fn setup() {
  var counter: u64 in x19 = 0
  // prologue emits: stp x19, ..., [sp, #-N]!
  // epilogue emits: ldp x19, ..., [sp], #N
  counter += 1
}
```

The placement is treated as "this function uses x19" for frame
construction. The rule is intentionally simple so that prologue shape can be
predicted by reading declarations only — without a liveness pass over the body.

A consequence: an `in x19` local that is never read still costs the frame slot
and the save/restore pair. If the placement is not load-bearing, drop it; do not
rely on the optimizer to remove the save.

This rule does not apply inside `naked` functions — see "Interaction with
`naked`" below.

---

### Caller-Saved Placement and Call Boundaries

When a local variable is placed in a caller-saved register (`x0`–`x17`),
the placement lasts for the binding's lifetime, and the caller-saved register is
clobbered across any `bl`/`blr`/`svc`/`hvc`/`smc`/`brk` call. If the pinned
binding is live across such a call, the program is rejected at compile time:

<!-- wyst-contract: fmt -->
```wyst
module demo

fn use(first: u64, second: u64) { }

fn work(handler: fn(u64) -> u64) {
  var state: u64 in x0 = 0xdead
  const result: u64 = handler(state)
  // compile error: `state` remains live across a call that clobbers x0
  use(state, result)
}
```

The compiler **does not** silently spill the placed variable around the call.
Doing so would violate the "this name lives in this register" contract —
between the save and restore, no register holds the value.

To make the program compile, narrow the placement's lifetime so it ends before the
call, or choose a callee-saved register:

<!-- wyst-contract: check-pass -->
```wyst
module demo

fn use(first: u64, second: u64) { }

fn work(handler: fn(u64) -> u64) {
  if true {
    var state: u64 in x0 = 0xdead
    // ... use state here ...
  }
  const result: u64 = handler(0)
  use(result, 0)
}

// or
fn preserved(handler: fn(u64) -> u64) {
  var state: u64 in x19 = 0xdead
  const result: u64 = handler(state)
  use(state, result)
}
```

Placed parameters follow the same rule: an `in x0` parameter that is read
after a call is rejected unless its value has been moved to a
callee-saved location first.

---

### Target-Reserved Registers

Source placement cannot name ARM64 state reserved by the target ABI:

| Register | Architectural role | Source `in register` result |
| -------- | ------------------ | --------------------------- |
| `x18` | platform register | compile error |
| `x29` / `fp` | frame pointer | compile error |
| `x30` / `lr` | link register | compile error |
| `sp` / `wsp` | stack pointer | compile error |
| `xzr` / `wzr` | zero register | compile error |

There is no source-level read-only alias declaration for `lr` or `x18`. A
local `var` requires an initializer, and reserved-register placement is
rejected before lowering. Code that needs architectural state must use an
authenticated system-register, hardware, trap-frame, or checked-assembly
contract whose generated row owns that state.

<!-- wyst-contract: check-fail -->
```wyst
module demo

fn bad_lr() -> u64 {
  var saved: u64 in x30 = 0
  return saved
}
```

<!-- wyst-contract: check-fail -->
```wyst
module demo

fn bad_platform() -> u64 {
  var platform: u64 in x18 = 0
  return platform
}
```

---

### Interaction with `naked`

`naked` suppresses the standard prologue and epilogue. That changes which
placements are legal inside the function:

| Placement form | In `naked`? | Reason |
| -------------- | ----------- | ------ |
| Parameter placement (`value: T in x0`) | allowed | It names entry state and requires no prologue. |
| Local placement in callee-saved `x19`–`x28` | compile error | No compiler-owned prologue may save the register. |
| Local placement in caller-saved `x0`–`x17` | allowed | The ordinary live-across-clobber rule still applies. |
| Any placement in `x18`, `x29`, `x30`/`lr`, `sp`, or a zero register | compile error | The state is target-reserved, independent of `naked`. |

Callee-saved local placement in `naked` code is a semantic error: silently
emitting a prologue would defeat `naked`, while omitting preservation would
corrupt the caller's state.

The current checked-assembly pack cannot save a callee-saved register from
a naked function: its `stp`/`ldp` and stack-transition source forms are
`known_unsupported`. A future pack may admit the pattern only when the
`preserves stack` verifier proves the complete incoming state at every normal
exit. Until then, source that needs this operation is rejected rather than
silently receiving a prologue or an opaque assembly escape.

---

### Conflict Rules

The compiler enforces explicit register placement strictly:

| Situation                                                         | Result            |
| ----------------------------------------------------------------- | ----------------- |
| Register is free at placement site | placement applied |
| Register is live and another placement already owns it | **compile error** |
| Two simultaneous placements request the same register | **compile error** |
| Placement on a module variable, constant, field, or type | **compile error** |
| Caller-saved placement live across a clobbering call or assembly block | **compile error** |
| Callee-saved local placement inside `naked` | **compile error** |
| Placement in `x18`, `x29`, `x30`/`lr`, `sp`, or a zero register | **compile error** |

The compiler never silently moves a placement, spills a placed binding around
a call, or inserts a prologue into a `naked` function. An unsatisfied placement
is always a compile error.

---

### Relationship to checked `asm`

An explicitly placed variable passed to a checked-`asm` input keeps its fixed
register. The input's fixed placement makes that relationship explicit, and a
bare tied result writes the same physical operand back to the source binding:

<!-- wyst-contract: sketch -->
```wyst
var val: u64 in x19 = 0

val = asm (
  v: u64 in x19 = val,
) -> v {
  nop
}

// val is still 0 and remained in x19 across the checked boundary
```

If two operands request conflicting homes, or derived instruction constraints
cannot satisfy a fixed placement, the block is rejected at compile time. There
are no manual constraint or clobber lists.

---

### Design Rationale

| Choice | Reason |
| ------ | ------ |
| `in register` at the type position | Keeps ABI and storage identity visible where the value is declared. |
| No post-hoc placement | Liveness windows follow lexical binding scopes. |
| Callee-saved placements always save in framed prologues | Prologue shape is predictable from declarations. |
| Caller-saved live-across-call is a hard error | Silent spilling would violate the exact-location contract. |
| Reserved architectural registers are rejected | Platform, frame, link, stack, and zero state remain owned by the ABI or authenticated operations. |
| Callee-saved local placements are illegal in `naked` | Silently adding a prologue would defeat `naked`. |
| Locals, parameters, and scalar results only | Module-wide register reservation would hide an ABI-wide side effect. |

---

## 2.4 Labels

Labels are bare code regions, declared at **module top level** with the
`label` type. They are not nested inside functions.

A label:

- has no parameters and no return value
- when declared `naked`, has no generated prologue, epilogue, or stack frame
- has no `return` (there is no caller to return to)
- must terminate with a `goto` or a call returning `never` — no fall-through
- is a top-level declaration with the same visibility rules as a function

`naked` labels exist for architectural entry points such as exception-vector
targets. They use the same raw stack discipline as `naked` functions: any
save area, stack switch, register preservation, and eventual `eret`/halt path
must be visible in source, normally through checked `asm`.

### Visibility and Cross-Module References

Labels follow the same `pub` / `import` machinery as functions. A label
declared without `pub` is module-private; with `pub`, it is visible
to modules that import it.

The integrated linker resolves the cross-module reference exactly as it
does for function calls (`R_AARCH64_JUMP26` for `goto`, see
[chapter-16-object-format.md](chapter-16-object-format.md)).
In the final ELF symbol table, source labels are executable text symbols but
not function symbols: they use `STT_NOTYPE` so external tools do not confuse
`goto` targets with callable functions that have ordinary prologue/epilogue
semantics.

### Why Labels Are Top-Level

Labels are not in-function constructs because the only legal way to enter
them is `goto`, and `goto` is bare-context only (see §2.5). There is no
in-function position where a label could be entered, so there is no
in-function position where one can be declared.

This also closes off the C-style `goto label;` foot-gun by construction:
the syntax does not exist.

---

## 2.5 Control Flow

### goto and function calls

<!-- wyst-contract: sketch -->
```wyst
goto label_name     // transfer to label, no return
fn_name(args)       // invoke function — statement position
fn_ptr(args)        // invoke function pointer — statement position
```

`goto` is a statement keyword. Function calls use the same postfix call
syntax in statement position and expression position.

#### Statement-Position Calls

A call expression may appear as a standalone statement:

<!-- wyst-contract: sketch -->
```wyst
init_uart()
clear_screen()
handler_table[i]()    // computed function-pointer call
```

If the callee returns a value, a statement-position call evaluates the call
and discards the result. An expression statement whose top-level expression
is not a call remains a compile error, so stray statements like `x + y` do
not silently do nothing.

#### Expression-Position Calls

The same syntax is used when the return value is consumed by an enclosing
expression:

#### Summary Table

| Position                                     | Form          | Rule                                      |
| -------------------------------------------- | ------------- | ----------------------------------------- |
| standalone statement, return value discarded | `f(args)`     | top-level expression must be a call       |
| right-hand side of assignment                | `x = f(args)` | ordinary expression type-checking applies |
| operand of an operator                       | `a + f(args)` | ordinary expression type-checking applies |
| argument to another call                     | `g(f(args))`  | ordinary expression type-checking applies |

The `call` word is not a keyword. `call f(args)` is invalid syntax
because it is two adjacent expressions, not a call form.

#### `goto` Scope Rules

`goto` is a **bare-context tail transfer**. It is legal only when the
current execution context has no live frame to abandon — i.e. when no
prologue has been emitted and no caller is waiting for a return value. In
practice that means `goto` is legal only inside:

- a `label` body (§2.4)
- a block-form `vector_table` slot (§10.2)
- a position in another target-defined bare construct

`goto` in an ordinary function body is a **compile error**, even if the
function has no live locals. The diagnostic suggests `return` (to exit) or
extracting the work into a `label`.

#### What `goto` Cannot Cross

| From                                                                             | To                                              | Result                                                                          |
| -------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `label` / `vector_table` slot                                                     | another `label`                                 | OK (same module)                                                                |
| `label` / `vector_table` slot                                                     | public label in an imported module              | OK                                                                              |
| `label` / `vector_table` slot                                                     | function name                                   | **compile error** — `goto` cannot enter a prologue; use a function call instead |
| function body                                                                    | any label                                       | **compile error** — `goto` cannot abandon a live frame                          |
| inside a structured construct (`if`, `while`, `loop`, `for`) within a `label` | label outside the construct                     | OK — the construct emits no frame; the `goto` is still a tail transfer          |
| any position with a pending function-call return                                 | any label                                       | **compile error** — would skip the return                                       |

If control flow has reached a point where a called function is expected to
return, that return cannot be skipped by a `goto`.

#### What `goto` Targets

The target is a bare identifier naming a `label`. The label must be in scope —
either declared in the module or imported. There is no
label literal, no computed `goto`, and no `goto *expr`. A `vector_table` arrow
uses the same target rule. Dispatch tables are built from callable values, not
label addresses.

#### `break` and `continue`

`break` and `continue` are structural control-flow statements inside
`loop`, `while`, and `for`. They are statement-position keywords with
no operands and produce no value.

<!-- wyst-contract: sketch -->
```wyst
break          // exit the innermost enclosing loop
continue       // jump to the header of the innermost enclosing loop
```

**Scope rule:** the innermost lexically enclosing loop receives the
transfer. A `break` or `continue` outside any loop is a compile error.

**No cross-function transfer:** `break` and `continue` cannot reach a
loop in an enclosing function. A function body that contains only an
inner loop cannot be exited via `break` (use `return`).

**No checked-`asm` interaction:** `break` and `continue` are not legal inside
an `asm` instruction body. Local checked branches target labels declared in
that body; a normal exit reaches the closing brace.

**No labels.** Wyst does not provide labeled `break`/`continue`. To exit a
nested loop:

- Pull the inner loop into a helper function and `return` from it, or
- Set a flag in the inner loop and check it in the outer-loop header.

This is a deliberate choice. Labels in Wyst are top-level declarations
(see §2.4); `break label` would either reuse that namespace (creating a
hazard where a `break` could jump to a non-loop label) or introduce a
new function-local identifier scope the language does not have.

**`continue` in `for`:** the immutable index advances by one and the
end-exclusive test runs before the next body entry, exactly as if control had
reached the loop body's closing brace.

**`loop` is not an expression** — `loop { ... }` produces no value, so
`break value` and `loop`-as-rvalue are not part of the language. Use a
mutable variable assigned before `break`:

#### ARM64 Lowering

`break` lowers to an unconditional branch to the instruction immediately
following the innermost loop's last instruction. `continue` lowers to an
unconditional branch to the loop's next-iteration target (the condition for
`while`, the increment-and-test edge for `for`, or the unconditional back-edge
for `loop`).

The compiler emits these as `b` instructions — no special handling and
no register state is preserved or restored at the branch point (a `break`
out of the middle of a basic block leaves all locals in whatever state
they were in; this is the same as falling through to the loop's end).

### If

<!-- wyst-contract: sketch -->
```wyst
if count == 0 {
    return
}
```

### If Expressions

<!-- wyst-contract: sketch -->
```wyst
value = if cond {
    10
} else {
    20
}
```

### Integer-Range `for`

The range is always end-exclusive and advances by one. Bounds are evaluated
once, left to right, before the first comparison. Both bounds have one
compatible integer type; an untyped integer literal adopts the other bound's
type. The index is immutable and has that same type. Wyst has no custom
step, iterator protocol, C-style `for`, or `do while` form.

### While

`while condition { ... }` evaluates the condition before every iteration and
executes the body while it is true. The loop may execute zero times.

### Infinite Loop

`loop { ... }` repeats until control reaches a `break` or another terminal
statement.

### `match` — Exhaustive Enum Discrimination

`match` is available in statement and expression position. Its scrutinee is
evaluated exactly once. Each arm begins with one or more shallow variants and
may bind every declared payload field. Alternatives in one arm use the same
binding names and exact field types. There is no fallthrough.

<!-- wyst-contract: sketch -->
```wyst
match message {
  .Quit {
    handle_quit()
  }
  .Write(data) {
    handle_write(data)
  }
  .Moved(x, y) {
    handle_move(x, y)
  }
}
```

Pattern bindings are immutable and scoped to the arm. Patterns are not nested;
inspect an enum-valued field with another `match` or `is` inside the arm. A
final `else` covers every remaining variant. Without `else`, all statically
reachable variants must appear exactly once.

Expression `match` requires a tail expression in every reachable arm, and all
tails have one exact common type; `never` is compatible with that type. Exact
ownership state must join at the result phi. An omitted expression arm cannot
manufacture a value.

<!-- wyst-contract: sketch -->
```wyst
const code: u64 = match message {
  .Quit { 0 }
  .Write(data) { data.len }
  .Moved(x, y) { widen<u64>(x) + widen<u64>(y) }
}
```

### `is` — Single-Variant Test and Bind

`is` tests one enum value against one variant pattern (the same shape as a
single-variant `case` pattern). When `is` appears as the direct condition of
an `if`, the pattern bindings are in scope within the `if`-true body and
immutable.

<!-- wyst-contract: sketch -->
```wyst
if m is Custom(code) {
    handle_custom(code)
}

if !(m is Quit) && (m is Write(_) || ready) {
    handle_active(m)
}
```

| Form                 | Meaning                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `m is Variant`       | True iff `m`'s tag is `Variant`. No bindings.                                                |
| `m is Variant(a)`    | True iff `m`'s tag is `Variant`; in the `if`-true body, `a` is bound to the payload element. |
| `m is Variant(a, b)` | True iff the tag matches; `a` and `b` bind the two declared payload fields in order.        |
| `m is Variant(_)`    | True iff `m`'s tag is `Variant`; payload explicitly discarded.                               |

#### Binding Scope

Bindings introduced by `is` are valid **only** in the `if`-true block.
They are not visible in the `else` block, after the `if`, or in a
compound condition's other clauses:

<!-- wyst-contract: sketch -->
```wyst
if m is Custom(code) {
    use(code)            // ok — bindings valid here
} else {
    use(code)            // compile error — binding not in scope
}
use(code)                // compile error — binding not in scope
```

`is` may appear inside boolean compounds only when it introduces no payload
binding. Use `_` to explicitly discard a payload. A binding such as
`m is Custom(code) && ready` is rejected because the binding's scope would be
ambiguous. Use a direct `if m is Custom(code)` or a `switch` instead.

#### Negation

Negated `is` patterns are allowed only when they introduce no payload binding.
No bindings are introduced by a negated `is` because the payload bindings would
be undefined if the test is false.

<!-- wyst-contract: sketch -->
```wyst
if !(m is Quit) {
    // m is some other variant — but the specific variant is unknown here
    process_active(m)
}

if !(m is Custom(code)) {    // compile error
    process_active(m)
}
```

#### `is` vs `match`

`is` is for "check one variant, do one thing." `match` is for "dispatch
on all variants." When more than one variant needs handling, prefer
`match` — it gets exhaustiveness checking; chained `if … is` does not.

---

## 2.9 Inline Assembly

`asm` is Wyst's checked escape hatch into explicit ARM64. The selected checked-assembly pack
admits 13 exact general-purpose source forms covering page-relative addresses,
local/direct branches, ordinary and exception returns, system-register moves,
and selected architectural hints. A target-structural-only pack separately
admits seven exact forms for target-owned stack and frame transitions; it does
not widen ordinary checked `asm`. Traps, cache and TLB maintenance,
exclusive-monitor pairs, and other load-bearing encodings remain
`known_unsupported` until a later profile activates their exact parser,
semantic, and allocation rows.

The bootstrap compiler intentionally treats the body as a checked mnemonic
subset, not as an embedded general-purpose assembler. Supported mnemonics have
direct encoder coverage and tests; unsupported instructions are compile-time
errors until their encoding and operand checks are added. This keeps
inline assembly auditable, deterministic, and aligned with Wyst's explicit
machine-semantics model.

Checked assembly is a statement or expression with a signature-style
header and a parsed instruction body:

<!-- wyst-contract: sketch -->
```wyst
fn preserve(input: u64) -> u64 {
  return asm pure (
    value: u64 in x0 = input,
  ) -> value {
    nop
  }
}
```

The ordered header is:

```text
asm [pure] [align N] [(preserves|establishes|restores) stack]
    [(parameters)] [-> result-or-never] {
  instruction lines
}
```

`pure`, `align`, and a stack clause occur only in that order. A present
parameter list is non-empty. `pure` cannot be combined with alignment or a
stack clause. The final instruction or label line ends with a newline before
the closing brace.

### Parameters and results

The parameter signature has four closed kinds; an ordinary input may spell its
type explicitly or let the exact initializer type be inferred:

| Form | Meaning |
| --- | --- |
| `name: T = expression` | typed input, evaluated once before the block |
| `name = expression` | input whose type is inferred from the expression |
| `name: imm = expression` | compile-time immediate |
| `name: symbol = declaration.path` | semantic Wyst code/data symbol dependency |
| `scratch name: T` | uninitialized block-local allocator resource |

An ordinary input or scratch may add `in register` after its type. A typed
result may likewise add a placement:

<!-- wyst-contract: sketch -->
```wyst
#target(arch = arm64-v8a, cpu = generic, el = 2)
fn read_status() -> u64 {
  return asm (
    scratch temporary: u64 in x9,
  ) -> result: u64 in x0 {
    mrs temporary, ELR_EL2
    mrs result, SPSR_EL2
  }
}
```

Results are `-> name: T`, a parenthesized list of at least two named typed
results, a bare tied result `-> input_name`, or `-> never`. A bare tied result
reuses the named input's type and physical operand and cannot declare another
placement. Scratch resources have no input initialization, output writeback,
stack object, or spill home.

Every fresh or tied value result must have canonical type-validity metadata
classified as `all_bit_patterns`: arbitrary register bits must already denote a
valid value of that type. Integers, floating-point values, compatible vectors,
and a `bitstruct` whose declaration owns an unsigned backing representation meet
that rule. `bool`, enum, address/provenance, callable, and other
validity-constrained types do not, even when a particular instruction is
expected to produce an in-range value; return an all-bit-pattern integer or
bitstruct representation and validate or convert it in ordinary Wyst. The same
declaration-owned metadata selects the natural register view. Typed IR carries
nominal bitstruct backing metadata, and the verifier authenticates its name and
backing against the module's normalized declaration before consuming either
the validity or register-view fact.

### Instruction-body namespace

Body identifiers resolve only to signature binders, block-local labels, or
catalog-owned target tokens. Outer Wyst values do not capture implicitly;
dependencies enter through the signature, and addressable declarations use a
`symbol` parameter. Binder names are used directly in instructions—there is no
`{operand}` interpolation or register-view prefix syntax. Catalog-owned postfix
views such as `value.w`, `scalar.d`, or `bytes.16b` select a compatible physical
view and are not casts.

Ordinary allocatable physical registers cannot appear directly in the body.
Request fixed placement once with `in x0`, `in v0`, or another generated-bank
register and use the semantic binder in every instruction. Special and implicit
architectural registers remain legal only in cataloged operand positions and
under the matching stack/state contract. Local labels are named identifiers;
numeric directional labels are invalid.

### Effects, control, and allocation

Instruction rows derive register uses/definitions, ties, early clobbers,
implicit state, memory behavior, effects, control flow, and allocation
constraints. There are no manual clobber, memory, effect, or opaque constraint
lists. Direct calls require `symbol` operands resolving to typed callables;
indirect calls require exact callable inputs. Branches target block-local labels
unless an instruction's catalog contract admits another semantic target.

Every direct-call row retains its complete ABI and architectural-resource
contract because every checked source instruction remains in the emitted word
sequence, including a row unreachable from the block entry. The checked local
CFG fixed point separately seals whether each call is reachable. Naked
pre-stack and link-register safety checks consume only that exact reachability;
IR verification rederives it from the retained typed instruction CFG rather
than trusting the sealed bit.

The selected checked-assembly pack does not expose an external tail-transfer contract.
Accordingly, `b` accepts a named block-local label but rejects a `symbol`
operand even when it resolves to code; accepting that form later requires an
exact target ABI/result/effect/terminal contract distinct from `bl`. An
ordinary `ret` is terminal to the local asm CFG, but it is a normal return from
the enclosing callable: it may terminate only a void-returning callable and is
rejected in architectural label/entry contexts, which have no caller-return
edge. It cannot establish either a `never` promise or a typed function result.
Exception returns, authenticated halt/
exception terminals, and calls whose callable contract is `never` retain their
separate terminal meanings.

The selected checked-assembly pack has no active indirect-call source form:
`blr` is recognized but rejected as known unsupported, so a raw integer or
address input cannot become a callable through checked assembly. Any future
profile that activates an indirect-call form remains gated by the exact
callable-input contract above.

Non-`pure` checked assembly is an indivisible full compiler fence. Hardware
ordering still requires the appropriate barrier instruction. A verified `pure`
block must be deterministic, acyclic, total, non-faulting, effect-free, and
normally returning; only then may ordinary pure-code optimization reorder,
common, or remove it.

The presence of `asm` is not a blanket register clobber or whole-bank
reservation. The allocator preserves only physical homes and architectural
resources required by derived block constraints and surrounding liveness. It
does not force unrelated automatic values to memory, disable caller-scratch
allocation, or add frame storage solely because the function contains a block.
Allocator support instructions, when required, stay outside the written body;
the body retains one emitted instruction for each checked source instruction.
The enclosing-function witness records every selected home, bank decision,
boundary transfer step, cycle temporary, preservation instruction, spill, and
frame resource. Its closed causal graph links those decisions to concrete
operand classes, placements, live ranges, interference/pressure, ABI or
architectural constraints, and allocation policy. Replay must reproduce both
the resources and the exact support-instruction sequence. Transitive roots
classify each resource as `introduced_by_asm`, `preexisting`, or `shared`;
paired block/control deltas are reported separately from that causal class.

### Local-control example

<!-- wyst-contract: sketch -->
```wyst
#target(arch = arm64-v8a, cpu = generic, el = 2)
fn read_saved_return_state() -> (pc: u64, status: u64) {
  return asm -> (
    pc: u64,
    status: u64,
  ) {
    b read
    unreachable:
      nop
    read:
      mrs pc, ELR_EL2
      mrs status, SPSR_EL2
  }
}
```

This example stays within the selected checked-assembly pack. Broader local
control-flow forms remain `known_unsupported` until a later support profile
activates their exact parser, semantic, and allocation rows.

## Live operation protocols

Chapter 26 defines `operation` as a nominal non-first-class synchronous
callable kind with canonical `success`, `progress`, `failure`, and `cancelled`
member order. `with` consumes one root call, non-success members are handled
exactly once, success defaults to identity, and forwarding is per-label and
exact. Recovery is an ordinary explicitly passed `noescape` typed decision
capability. Progress callbacks are synchronous, resume-only, zero-capture, and
checked against the protocol's concrete effect ceiling.
