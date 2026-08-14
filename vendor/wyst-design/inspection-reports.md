---
title: "Compiler Inspection Reports"
group: reference
section: tools
order: 630
summary: "Current commands for lowering, effects, storage, layout, resources, and reference execution reports."
---

# Compiler Inspection Reports

`wync explain` provides six compiler inspection reports.
These reports describe one selected project artifact.

Diagnostic-code explanations are in
[Diagnostic Explanations and Source Actions](diagnostic-explanations.md).

## Common Command Rules

Each report accepts a project directory or its `wyst.project` file.
Each report accepts `--artifact NAME`.
Without this option, the command selects the default artifact.

Each report accepts `--format text|json`.
The default is `text`.
The report goes to stdout.
Diagnostics go to stderr.

Inspection commands do not write the selected project artifact.
They can compile intermediate products in memory to construct the report.

## Lowering Report

Use this command:

```sh
wync explain lowering PROJECT \
  [--artifact NAME] \
  [--function NAME] \
  [--format text|json]
```

The report selects one lowered function.
`--function` requests that function by name.

The report includes these principal facts:

- the selected target and source graph;
- the callable identity and typed IR;
- typed-IR operand and control-flow structure;
- type layouts, ABI locations, value homes, and frame composition;
- direct calls, effects, atomics, and checked-assembly allocation;
- machine instructions and their source or generated origins; and
- relocations, symbols, function bytes, and artifact text bytes.

For a final-link artifact, addresses use the linked ELF placement.
For a static library, the report uses the owning `ET_REL` object.
Object reports use object-local offsets and relocation records.
Final addresses are unavailable for these object reports.

The report does not provide hardware timing, cache state, branch prediction, or measured performance.
For closed final artifacts, its call facts distinguish source-indirect calls
that were statically bound from indirect transfers that remain at runtime.

## Effects Report

Use this command:

```sh
wync explain effects PROJECT \
  [--artifact NAME] \
  [--function NAME] \
  [--format text|json]
```

Without `--function`, the report includes all checked functions.
With `--function`, it includes only the named function.

The report includes declared bounds, direct effects, transitive effects, and their dependency paths.
It also includes effect sites, call sites, authority sites, and selected target facts.
Direct, external, resolved-indirect, and unresolved-indirect calls remain distinct.

The report does not provide runtime frequency, target timing, or cache state.

## Storage Report

Use this command:

```sh
wync explain storage PROJECT \
  [--artifact NAME] \
  [--format text|json]
```

The report includes the selected target, source graph, and compiler storage vocabulary.
It lists authenticated `core.storage` operations.
It can also list accepted storage-preservation proof facts.

The report does not infer storage meaning from an ordinary function name.
It does not report runtime allocation behavior or machine cost.

## Layout Report

Use this command:

```sh
wync explain layout PROJECT \
  [--artifact NAME] \
  [--format text|json]
```

The report uses the checked concrete structure-layout facts.
For each structure, it includes size, alignment, stride, useful extent, and padding.
It also includes field offsets, sizes, alignments, and preceding padding.

For an unconstrained structure, the report can include a reordered candidate.
The candidate includes its complete field order and exact byte reduction.
A positive reduction is a size fact, not a runtime performance guarantee.

Generic structures without concrete arguments have no fabricated layout row.

## Resources Report

Use this command:

```sh
wync explain resources PROJECT \
  [--artifact NAME] \
  [--format text|json]
```

The JSON schema name is `wync.explain.resources.v1`.
The report applies to the complete selected artifact.

It includes these principal groups:

- semantic module interfaces;
- the artifact reference graph;
- resumable and affine-verifier facts;
- stack roots; and
- per-function IR, ABI, frame, allocation, instruction, and expansion counts.

The report distinguishes retained and eliminated artifact work.
It does not provide hardware timing, cache state, branch prediction, or counterfactual inline estimates.

## Reference Execution Report

Use this command:

```sh
wync explain execution PROJECT \
  [--artifact NAME] \
  --function NAME \
  [--input scenario.json] \
  [--format text|json]
```

The command compiles and authenticates verified typed IR.
It then executes the named function in deterministic reference state.
It does not execute lowered machine code.

A module-qualified function name also participates in source discovery. Use
that form when the function's module is not imported by the artifact root.

The report includes the completion class, return value, step count, and trace events.
It also includes consumed environment events, generic instances, and reference addresses.
Runtime completions are report results, including traps, faults, resource exhaustion, and unsupported operations.

The scenario is a version `1` JSON object.
It can provide arguments, memory, indeterminate bytes, environment results, and execution limits.
It can set `recordTrace` to `false` for a corpus that does not inspect events.
The default is `true`.

The default execution limits are:

- `steps`: 1,000,000;
- `callDepth`: 256;
- `memoryBytes`: 67,108,864; and
- `traceEvents`: 1,000,000.

A scenario can replace these limits with positive values.
The CLI rejects a scenario file larger than 8,388,608 bytes.
The underlying scenario JSON parser also has a 16 MiB input limit.
It rejects JSON nesting after 128 levels.

Checked assembly has no reference-execution instruction semantics.
An execution that reaches them completes as `unsupported`.

`#eval` uses the same verified-IR execution semantics with empty scenario
state and trace recording disabled. It uses the default step, call-depth, and
memory limits. Only a normal returned closed value can become constant data.
