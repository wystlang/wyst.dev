---
title: "Documentation Example Contracts"
group: contributor
order: 900
summary: "Documentation example markers and their test coverage."
---

# Documentation Example Contracts

This contributor reference defines Wyst examples in the language and compiler reference.

## Markers

The reference uses only these markers:

| Marker | Meaning |
| --- | --- |
| `<!-- wyst-contract: fmt -->` | The block is one complete source file in canonical format. |
| `<!-- wyst-contract: check-pass -->` | The block is one complete source file that `wync check` must accept. |
| `<!-- wyst-contract: check-fail -->` | The block is one complete source file that `wync check` must reject. |

Put the marker immediately before the opening `wyst` fence.
Do not put a blank line between the marker and the fence.

Use exactly this shape:

````text
<!-- wyst-contract: check-pass -->
```wyst
module example

fn identity(value: u64) -> u64 {
  return value
}
```
````

Each block must contain a `module` declaration.
Keep each block independent from other manual blocks.

Use `check-pass` for accepted compiler behavior.
Use `check-fail` for a compiler diagnostic.
Use `fmt` only for a complete formatting example.

The reference does not use unchecked example modes.
Use a `text` fence for incomplete syntax fragments.

## Test enforcement

The documentation contract test scans top-level Markdown files in `design/`.
It first enforces these structural rules:

- Each `wyst` fence has an immediately preceding recognized marker.
- Each marker has the exact comment shape.
- Each reader-facing reference topic with Wyst blocks has one checked marker.
- A checked marker is `fmt`, `check-pass`, or `check-fail`.

The test then executes every contract. For `fmt`, it writes the block to a
temporary source file and requires `wync fmt --check` to succeed. For
`check-pass` and `check-fail`, it creates a temporary static-library project
for `qemu-virt-aarch64-el2` and runs `wync check`. A `check-pass` block must
succeed. A `check-fail` block must fail and emit an error diagnostic.

The storage-preservation example test has additional executable checks.
It requires seven numbered examples.
It permits only `check-pass` and `check-fail` blocks in that file.

For each storage-preservation block, the test uses the same temporary-project
profile. It uses `debug .none`, `unwind .none`, and `frame_pointers .minimal`.

The test also checks selected diagnostics and storage reports.

## Author validation

Run each changed checked block with the profile required by its topic.
Do not infer successful compilation from the marker scan.

Run `wync fmt --check` for every changed `fmt` block.
Check that a `check-fail` block fails for its documented reason.

Keep target-specific examples with their required `#target` declaration.
Keep artifact-specific examples with a stated project profile.
