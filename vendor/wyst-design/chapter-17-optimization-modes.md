---
title: "Chapter 17: Wyst Build Optimization Modes"
group: chapter
chapter: 17
order: 17
summary: "Optimization modes and the boundary between explicit source behavior and compiler choices."
---

# Chapter 17: Wyst Build Optimization Modes

Wyst defines two build optimization modes, selected by `--optimization` or
the project manifest's `optimization = "..."` setting:

```text
--optimization reproducible
--optimization switch-dispatch
```

`reproducible` is also the default when no build optimization mode is supplied.
It is a direct lowering profile, not a general optimizer. It may perform only
the deterministic lowering work needed to produce the output image:

- compile-time constant evaluation already required by the language;
- syntax-to-IR lowering;
- deterministic instruction selection;
- deterministic register allocation;
- deterministic branch and symbol emission.

This includes local, source-shaped instruction selection improvements whose
inputs are already visible in the IR: folded memory offsets, logical-immediate
selection, branch-only condition fusion, direct use of call-result and argument
registers, deterministic caller-scratch register homes, and pair chunks for
eligible aggregate transfers. These choices are part of reproducible lowering,
not hidden global optimization passes: they do not change source-observable
effects, invent new control flow, infer aliasing contracts, or depend on
profile feedback.

Wyst rejects unknown build optimization modes. Additional non-default build
optimization modes must be explicit in the command or build profile, and must
document whether they preserve byte-for-byte reproducibility.
The selected build optimization mode is part of the reproducibility input
manifest described in
[chapter-01-language-design.md](chapter-01-language-design.md).

Build optimization modes are distinct from the source-level scheduling policy
described in [chapter-13-scheduling.md](chapter-13-scheduling.md).
Ordinary code uses `schedule.standard`; `schedule source { ... }` and
`#[schedule(source)]` introduce compiler-ordering boundaries. Neither surface
selects a build optimization mode.

## Semantic Boundary

Build optimization modes choose lowering strategy inside the already-defined
source semantics. They must not introduce hidden allocation, hidden cache
maintenance, weaker memory ordering, or source-observable behavior that was
not requested by the program or build profile.

## Mode Selection Boundary

Builds carry the selected build optimization mode into IR lowering. Explicit
root-file builds default to `reproducible` unless `--optimization` is supplied.
Project builds may name an `optimization = "..."` mode in `wyst.project`, and a
command-line `--optimization` value overrides that manifest setting for the
build. Non-default modes branch from that explicit boundary instead of changing
the default path in place.

## Relationship to Source Scheduling

`--optimization` and source scheduling are independent inputs at different levels:

- `--optimization` is a build-level lowering policy chosen by the command line
  or project manifest.
- `schedule source` is a source-level boundary that preserves source
  semantic-operation order inside one region.

A build optimization mode must respect every applicable source boundary.
For example, `--optimization switch-dispatch` may change enum-switch lowering,
but it must not move instructions across a `schedule source` boundary or
reinterpret `schedule.standard` as permission to change source meaning.

## `switch-dispatch`

`switch-dispatch` is an opt-in, deterministic mode for enum switch dispatch. It
replaces the default equality-value chain with an IR dispatch terminator
terminator that the ARM64 backend lowers as a linear compare/conditional-branch
sequence. It preserves source-order case testing, grouped-case targets,
exhaustive invalid defaults, and partial-switch fallthrough behavior.

For this selected build optimization mode, output is byte-for-byte
reproducible under the input catalog in
[chapter-01-language-design.md](chapter-01-language-design.md). It is not a
promise of optimal dispatch shape: no jump tables, dispatch tables, decision
trees, or target-tuned heuristics are part of this mode.

## Reproducible Switch Dispatch Baseline

In `reproducible`, enum dispatch still lowers through the direct deterministic
chain used before build optimization modes were named:

- the selector, or the payload enum tag field, is evaluated once before
  dispatch;
- cases are tested in source order with equality checks and branch
  terminators;
- grouped cases share the same `switch.case` block;
- exhaustive switches without `else` keep an unreachable `switch.invalid`
  default block;
- partial switches without `else` fall through to `switch.after`;
- no jump tables, dispatch tables, or decision trees are introduced by the
  default mode.

## Non-Goals

- No `fast`, `small`, or target-tuned build optimization mode.
- No hidden global optimization in default builds.
- No profile-guided optimization.
- No source scheduling semantics in this build optimization mode chapter.
