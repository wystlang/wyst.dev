---
title: "Optimization and Hardening"
group: reference
section: compiler
order: 510
summary: "The fixed optimizer, source-required expansion, scheduling, and AArch64 instruction selection."
---

# Optimization and Hardening

The compiler has one production optimization pipeline.
The pipeline is always active.
The command line and manifest have no optimization-level selector.

The optimizer changes only admitted typed-IR forms.
It does not infer new source permissions.

## 1. Optimization boundary

The compiler verifies typed IR before backend lowering.
An optimization must preserve the value type and observable behavior.

The optimizer preserves these operations and boundaries:

- volatile and MMIO access;
- atomic operations and orderings;
- barriers;
- checked assembly;
- calls and declared clobbers;
- traps and possible faults;
- cleanup and terminal control flow;
- storage and noescape authority;
- source-scheduled regions;
- explicit register placement;
- exported and address-taken identity.

The optimizer does not treat an effectful operation as a pure instruction.
It does not reconstruct a semantic operation from an instruction pattern.

## 2. Current typed-IR transformations

The production optimizer has this closed transformation set:

| Transformation | Required condition |
| --- | --- |
| `fold_constant` | Typed pure integer or Boolean operands have constant values. |
| `simplify_identity` | A typed algebraic identity preserves operand evaluation. |
| `fold_select` | The condition is constant, or both arms are identical. |
| `fold_phi` | All non-self inputs are the same typed value. |
| `scalar_replace_interactive_outcome` | A compiler-created outcome phi has compatible scalar components. |
| `fuse_interactive_tag_dispatch` | A closed constant-tag dispatch has exclusive predecessor edges. |
| `elide_dead_fixed_array` | A compiler-created fixed-array realization is pure and unused. |

### 2.1 Constant and identity folding

The optimizer folds typed integer and Boolean operations.
Integer folding uses the declared width and signedness.
It keeps the language rules for wrapping, shifts, division, and remainder.

The optimizer can remove these identity forms:

- unary plus;
- admitted typed binary identities;
- a same-type `bits`, `lens`, `qualifier`, or `signedness` cast;
- a select with a constant condition;
- a select with identical arms;
- a phi with identical non-self inputs.

The optimizer does not fold runtime floating-point arithmetic.
Floating-point state remains observable.

Equal symbolic addresses can compare equal at compile time.
Different symbolic addresses do not compare unequal at compile time.
Final placement can give different symbols the same address.

### 2.2 Interactive outcome transforms

The compiler can replace a compiler-created outcome projection with a scalar
phi.
Each incoming edge must construct the required outcome component.
The component types and predecessor edges must agree.

The compiler can fuse the resulting constant-tag switch into predecessor
edges.
The switch must have a closed tag set and exclusive predecessors.
Payload phis move to the selected handler block.

The compiler retains the ordinary aggregate or switch when a condition fails.
Source-created enum projections do not receive this special rule.

### 2.3 Fixed-array realization

Mandatory value expansion can leave an unused fixed-array construction.
The optimizer removes that construction only when it is pure and unused.
The optimizer does not apply general dead-code elimination to other values.

## 3. Source-required inlining

`#[inline]` requires expansion at each admitted direct call.
It is not a profitability hint.
The compiler does not select other functions for inlining.

<!-- wyst-contract: check-pass -->
```wyst
module inline_demo

#[inline]
fn increment(value: u64) -> u64 {
  return value + 1
}

fn answer() -> u64 {
  return increment(41)
}
```

The compiler evaluates call arguments once and from left to right.
The expanded parameters bind those evaluated values.
Returns join the caller at the original cleanup depth.

An inline function must have supported first-class parameter and result types.
An inline function cannot be `naked` or recursive.
The compiler rejects an inline call cycle.

A naked function, label, or vector slot can call an inline helper only when
the expanded helper is stackless for that context.

The compiler permits at most 4096 inline expansion records in one caller.
It reports an error when the expansion budget is exhausted.

An address-taken or exported inline function can retain an out-of-line body.
Inlining does not remove a required callable identity.

## 4. Source-required unrolling

`#[unroll]` requires loop expansion.
It is not a profitability hint.
The compiler does not unroll an unmarked loop.

### 4.1 Complete unrolling

Bare `#[unroll]` requires a compile-time iteration count.
The iterable can be a fixed array, a known-length slice, or a constant integer
range.

```text
#[unroll]
for index in 2 ..< 5 {
  visit(index)
}
```

This loop expands for `2`, `3`, and `4`, in that order.
The compiler preserves left-to-right evaluation of range bounds.

`break` and `continue` are not valid in complete unrolling.
A runtime range or runtime-length slice cannot use bare `#[unroll]`.

The optional constraints have these meanings:

| Argument | Rule |
| --- | --- |
| `iterations = N` | The known count must equal `N`. |
| `max_iterations = N` | The known count must not exceed `N`. |

These arguments must be constant `u64` values.
They do not provide a missing iteration-count proof.

### 4.2 Factor unrolling

`factor = N` requires a constant `u64` value of at least 2.
The compiler duplicates the body `N` times in each factor group.

```text
#[unroll(factor = 4, remainder = .guarded)]
for byte in view {
  write_byte(byte)
}
```

Finite iteration forms use one of these remainder rules:

| Rule | Behavior |
| --- | --- |
| No `remainder` | The compiler must prove divisibility by `factor`. |
| `.reject` | The compiler must prove divisibility by `factor`. |
| `.guarded` | The compiler tests the source condition before each lane. |
| `.scalar` | The compiler emits a factor loop and a scalar tail. |

A runtime range or runtime-length slice requires `.guarded` or `.scalar`.
The compiler does not execute a partial factor group speculatively.

A `while` loop accepts factor unrolling with `.guarded` behavior.
An unbounded `loop` accepts `factor` without a remainder argument.
Bare `#[unroll]` is not valid on `while` or `loop`.

`break` exits the source loop from any duplicated lane.
`continue` advances to the next logical source iteration.

The unroll expansion budget is 4096 iterations or duplicated lanes.
The compiler reports an error instead of selecting a smaller factor.

## 5. Reachability

Artifact construction retains the declarations that the selected roots reach.
The compiler removes declarations outside that closure from the artifact.

This closure operation can remove unused generic instances and function bodies.
It also removes their object contributions.
`pub` does not make native code a root by itself.

Debug information does not create a reachability root.
An export, entry, initcall, address use, or other retained reference can create
a root or edge.

Reachability is separate from the seven typed-IR transformations in Section 2.

## 6. AArch64 instruction selection

The AArch64 backend selects one admitted encoding for each lowered operation.
Instruction selection can use these local forms when their conditions hold:

- immediate arithmetic and comparisons;
- compare-with-zero branches;
- folded load and store addressing;
- register-offset byte loads;
- paired callee-register saves and restores;
- direct call-result register coalescing;
- zero-register stores;
- shorter constant materialization.

These forms are local backend choices.
They do not add general common-subexpression elimination or loop transforms.
The backend keeps the ordinary form when a condition does not hold.

The backend can create an ordinary call or branch veneer when
[Artifact and Object Formats](artifact-and-object-formats.md)
permits one.
It cannot insert a veneer into a fixed exception-vector slot.

## 7. Scheduling

The backend schedules pure SSA values inside `schedule.standard` regions.
It uses dependency rank and source position for deterministic ordering.

`schedule.source` preserves source order.
The scheduler does not use processor latency, profile data, or host timing.

[Scheduling and Suspension](scheduling-and-suspension.md) defines the scheduling barriers.

## 8. Hardening

Artifact hardening runs after ordinary optimization.
The current hardening operation checks address alignment.

An inserted hardening check is a scheduling barrier.
The optimizer does not move, combine, or remove an inserted check.
Checked assembly does not receive hardening instrumentation.

## 9. Current limits

The compiler does not implement these general optimization systems:

- heuristic inlining;
- heuristic unrolling;
- global value numbering;
- general common-subexpression elimination;
- loop-invariant code motion;
- automatic vectorization;
- profile-guided optimization;
- selectable speed or size levels;
- latency-based global scheduling;
- globally optimal register allocation.

Register allocation and ABI transfer rules are in [ABI Specification](abi.md)
and [Intermediate Representation](intermediate-representation.md).
