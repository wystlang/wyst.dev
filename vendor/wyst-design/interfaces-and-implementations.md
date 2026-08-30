---
title: "Interfaces and Implementations"
group: reference
section: language
order: 125
summary: "Nominal compile-time operation constraints, explicit implementations, conformance, and erasure."
---

# Interfaces and Implementations

Wyst static interfaces name callable requirements that generic code can use.
They are nominal, constraint-only, and erased before typed IR. An
implementation explicitly maps each requirement to an ordinary Wyst function
for one concrete nominal type.

[Type System](type-system.md) defines generic parameters and compiler-proved
abilities. [Functions and Control Flow](functions-and-control-flow.md) defines
ordinary functions, callable contracts, and calls. [Modules and Symbol
Boundaries](modules-and-symbol-boundaries.md) defines imports and visibility.

## Static interface declarations

<!-- wyst-contract: fmt -->
```wyst
module kernel.terminal

pub interface Terminal: copyable_discardable {
  initialize: fn(Self) -> must_observe bool accesses(mut parameter(0)) effects(
    mmio,
    volatile_access,
  ) trusts(platform_contract)
  write_byte: fn(Self, u8) -> must_observe bool accesses(mut parameter(0)) effects(
    mmio,
    volatile_access,
  ) trusts(platform_contract)
}
```

A static interface declares exactly one compiler-proved **carrier ability**.
Every implementation subject must already satisfy that ability. An
implementation cannot declare or derive an ability proof.

Each operation is a name and one Native callable requirement. `Self` is a
contextual compiler binder in that requirement. It must occur exactly once as
the complete type of parameter zero; it cannot be nested in another type or
appear in a result. There are no static operations.

Requirements use positional parameters and the ordinary callable-type contract
syntax. The parameter mode and `accesses` are independent facts. In the example,
an unmarked `Self` has read/copy parameter semantics while
`accesses(mut parameter(0))` describes possible mutation through authority
carried by that value.

An omitted requirement effect bound has the callable-type meaning
`effects(all)`. A no-effect requirement must say `effects(none)`. An omitted
trust bound means `trusts(none)`.

Static-interface requirements do not admit register placement, `requires`,
`ensures`, interactive protocols, `extern`, or `naked`. A requirement is not a
bodyless native function declaration.

## Implementation declarations

<!-- wyst-contract: fmt -->
```wyst
module drivers.pl011.terminal

import kernel.terminal { Terminal }

opaque struct Binding {
  base: u64
}

fn initialize_terminal(binding: Binding) -> must_observe bool {
  return binding.base != 0
}

fn write_terminal_byte(binding: Binding, byte: u8) -> must_observe bool {
  return binding.base != 0 && byte != 0
}

impl Terminal for Binding {
  initialize = initialize_terminal
  write_byte = write_terminal_byte
}
```

An `impl` maps every interface operation exactly once. It cannot omit an
operation or name an operation absent from the interface. The right-hand side
is an ordinary declaration identity, not a function-pointer expression or
runtime value.

The subject must be one concrete, nongeneric Wyst struct, opaque struct, enum,
or nominal carrier. Primitive, tuple, array, callable, address, register-map,
and generic-application subjects are not admitted.

The implementation must be declared in the subject type's owning module. There
is exactly one implementation for an interface identity and subject identity
across all module parts, semantic module interfaces, archives, and final-link
inputs. Import scope never selects among implementations. Wyst has no blanket,
conditional, negative, overlapping, or specialized implementations.

An `impl` has no `pub` modifier. It is externally consumable only when its
interface and subject are public. A mapped function may remain source-private;
the compiler retains it as an authenticated hidden dependency and emits a
deterministic hidden bridge when another module materializes a call.

A mapping target must be an ordinary, nongeneric, body-bearing Native Wyst
function. It cannot be `extern`, `naked`, interactive, register-placed, or carry
`requires` or `ensures` clauses.

## Interface constraints

<!-- wyst-contract: fmt -->
```wyst
module kernel.output

import kernel.terminal { Terminal }

pub fn emit<T: Terminal>(
  terminal: T,
  byte: u8,
) -> must_observe bool
  effects(mmio, volatile_access)
  trusts(platform_contract)
{
  return Terminal.write_byte(terminal, byte)
}
```

Each generic parameter has at most one constraint: either one built-in ability
or one static interface. An interface constraint entails its carrier ability,
so `T: Terminal` also proves `T: copyable_discardable` in the example. Wyst
does not provide constraint intersections or interface inheritance.

An interface-qualified call has the form
`Interface.operation(subject, arguments...)`. Calls are positional. Parameter
zero must be the directly constrained generic parameter, and its declared
interface constraint must match the qualifier. Receiver-dot syntax and
implicit method lookup are not part of static interfaces.

The compiler authenticates a generic body using the requirement contracts,
not an implementation selected for a later concrete use. A generic declared
`effects(none)` therefore cannot call a requirement whose ceiling admits MMIO,
even if one concrete mapping happens to be pure. The same rule applies to
trust, observation, returned-view provenance, storage, and concurrency.

## Callable conformance

After substituting the subject type for `Self`, each mapped function must be
assignable to its requirement under the ordinary callable compatibility rules.
Conformance includes:

- calling convention, parameter modes, `noescape`, result shape and mode,
  observation policy, and returned-view sources;
- effects, structural trust, access declarations, and authority;
- storage preservation, initialization, and provenance guarantees; and
- concurrency accesses, exclusions, and transitions.

The implementation's effective effects and trust requirements must be subsets
of the requirement ceilings. Its storage and concurrency guarantees must imply
the requirement guarantees. The compiler reports the first incompatible
callable dimension.

A body-bearing mapped function may use ordinary effect and trust inference.
Conformance uses its authenticated effective contract; the compiler does not
inject source claims into that function.

## Selection and erasure

For each concrete generic materialization, the substituted subject type selects
the unique implementation. The compiler rewrites every interface-qualified
call to its mapped ordinary declaration before ordinary semantic checking and
typed IR construction.

Consequently, a static interface has no runtime object representation, value
type, IR type, interface-call IR operation, vtable, witness, lookup table,
metadata argument, hidden context, runtime branch, or machine ABI entity. The
selected target is an ordinary direct call and remains eligible for inlining
and dead-code removal. Per-subject code-size duplication follows Wyst's existing
generic materialization model.

A static interface is not a value, field type, parameter type, result type,
type argument, cast target, or addressable callable. Function pointers and
explicit callable-plus-context records remain the representation for
runtime-selected behavior.

Runtime configuration does not require runtime dispatch. One concrete binding
may contain a DTB-selected address, clock, interrupt, or device identity. A
runtime choice among different retained driver implementations instead needs
an explicit enum and branch or an explicit callable bundle.

## Separate compilation

A **semantic module interface** is the authenticated WYSTIF metadata for one
compiled module. It is distinct from a source-language static interface.

WYSTIF records carry public static-interface identities, carrier abilities,
ordered callable requirements, implementation mappings and conformance,
generic interface constraints, hidden mapping targets, and semantic digests.
Revision 12 also carries each public nominal operation as a structural module,
owner declaration, leaf, and canonical identity. This record authenticates
associated and receiver calls without making the operation a static-interface
requirement.
The `.wystlib` companion indexes interface providers and transports the paired
module products used for source-less generic materialization.

Changing a requirement or mapping invalidates its semantic digest, dependent
generic materializations, reachability, and paired native objects. Generic
instance identity remains the declaration plus concrete type arguments because
global coherence makes those arguments select exactly one implementation; the
selected implementation digest is still a materialization dependency.

## Current static-interface boundary

Static interfaces do not add interface values, dynamic dispatch, methods,
structural conformance, default implementations, inline implementation bodies,
associated items, inheritance, multiple constraints, generic interfaces or
operations, generic implementations, derivation, operator overloading, or
implementation specialization.

Nominal receiver lookup does not search static interfaces. Generic and
interface-parameter receivers must use the explicit
`Interface.operation(subject, ...)` form authorized by a generic constraint.

None of those features is implied by the `interface` or `impl` syntax described
here.
