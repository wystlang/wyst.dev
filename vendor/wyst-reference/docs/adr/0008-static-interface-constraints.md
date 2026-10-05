---
status: accepted
---

# Keep interfaces nominal, static, and constraint-only

Wyst source-language interfaces are explicit nominal constraints over ordinary
callable contracts. An implementation maps every required operation to an
ordinary function in the implementing type's owner module. Concrete generic
materialization replaces each interface-qualified call with the selected direct
function call before typed IR.

An interface is not a value type and adds no runtime representation, vtable,
witness, hidden argument, indirect dispatch, or machine ABI rule. First-class
callables and explicit context records remain the mechanism for
runtime-selected behavior. Compiler-proved built-in abilities remain separate,
and each interface states the one carrier ability its implementing types must
already prove.

## Considered options

The callback-record pattern requires no language feature and remains appropriate
for runtime selection, but it duplicates callable contracts and gives
compile-time choices a runtime-shaped representation. Structural conformance
weakens explicit module contracts and makes source-less generic authentication
depend on each instantiation. A Rust-scale trait system, interface values,
methods, defaults, associated items, inheritance, blanket implementations, and
specialization solve problems not required by current Wyst consumers and create
substantially larger coherence and runtime models.

## Consequences

Static interfaces improve source expression and parametric checking without
replacing function pointers, callable records, opaque data, built-in abilities,
or callable effect, trust, access, storage, concurrency, and observation
contracts. Runtime data such as an admitted MMIO address can inhabit one
concrete implementation without requiring runtime dispatch.

Coherence, semantic-module-interface transport, private mapped dependencies,
generic cache invalidation, and callable-contract compatibility are part of the
implemented feature rather than deferred cleanup. WYSTIF and WYSTLIB transport
the authenticated declarations, mappings, typed constraints, hidden targets,
and selected-implementation dependencies required for source-less cross-module
materialization. The frontend erases qualified calls before typed IR, and the
editor uses distinct declaration and operation identities.

The normative rules are in [Interfaces and
Implementations](../../design/interfaces-and-implementations.md). Acceptance is
backed by parser and formatter coverage, local and cross-module conformance and
materialization tests, malformed semantic metadata rejection, direct-call IR
and AArch64 checks, and language-server navigation and completion tests.
