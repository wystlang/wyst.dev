---
title: "Scheduling and Suspension"
group: reference
section: memory-machine
order: 240
summary: "Standard scheduling, source-ordered regions, and suspension boundaries."
---

# Scheduling and Suspension

Wyst has two compiler scheduling modes: `Standard` and `Source`.
The modes control instruction reordering.
They do not create a runtime scheduler.

Compiler scheduling order, execution-strand order, and cross-agent memory
publication are separate contracts. Compiler scheduling constrains motion of
emitted operations. An execution strand describes one sequential control-flow
instance. Cross-agent publication comes only from the atomic operations and
explicit barriers in [Memory Model](memory-model.md). Source order, strand
sequencing, or a suspension marker does not by itself publish memory between
execution agents.

## Standard Scheduling

Ordinary code uses `Standard` mode.
The ARM64 scheduler can reorder ready, pure SSA operations inside a basic block.
The scheduler preserves value and control dependencies.

These operations are scheduling barriers:

- calls;
- loads and stores;
- atomics;
- system-register operations;
- most checked assembly;
- hardening operations;
- effect boundaries; and
- phi operations.

The scheduler uses deterministic source and dependency order to resolve ties.
It does not use a target latency model.

## Source-Ordered Regions

Use `schedule source` to create a source-ordered region.

<!-- wyst-contract: check-pass -->
```wyst
module scheduling_demo

fn step(a: u64, b: u64) -> u64 {
  schedule source {
    const sum: u64 = a + b
    return sum
  }
}
```

Operations in a source-ordered region remain in source order.
The region also prevents operations from crossing its boundary.

Use `#[schedule(source)]` to apply the mode to a complete body.
The attribute is valid on a body-bearing Wyst `fn` or `label`.
The compiler rejects the attribute on other declarations.

A source-ordered region is a compiler boundary.
It emits no architectural memory barrier.
Use the explicit barrier operations from [Memory Model](memory-model.md)
when memory synchronization is required.

Source order does not fix register allocation or instruction count.
The backend can still emit required ABI and register-allocation instructions.

## Execution Suspension

`execution_suspension` is a closed effect.
The effect identifies a call or provider transfer that can suspend the current execution strand.

An execution strand is one sequential Wyst control-flow instance.
The term has no source value.
It does not create a task, thread, stack, or executor.

The compiler records a typed `strand_suspension_boundary` for a suspending transfer.
The boundary preserves effect and context checks through IR verification.
The boundary emits no instruction by itself.

The sealed operation `core.execution.suspension_point` identifies a provider boundary.
The compiler accepts the operation only beside an authenticated provider transfer.
It rejects missing, duplicate, separated, and unauthenticated markers.

The marker returns immediately and emits zero instructions.
It does not park, yield, switch context, or call an operating system.

The compiler rejects live exclusion authority across a suspension boundary.
It also rejects a live raw-storage loan across the boundary.
Current-context and `per_cpu` facts must be reacquired after the boundary.

The boundary does not provide these behaviors:

- stackless coroutines;
- continuation copying;
- asynchronous cancellation;
- preemption;
- fairness;
- task migration; or
- scheduler progress guarantees.

## Interactive Progress

Interactive progress is synchronous and same-strand.
The producer waits until the progress handler returns.

If a handler can suspend, its effect creates the usual suspension checks.
Progress does not otherwise create an execution suspension boundary.

[Outcomes, Progress, and Terminal Control](outcomes-and-progress.md) defines progress handlers and terminal outcomes.
[Intermediate Representation](intermediate-representation.md) defines the scheduling records in typed IR.
