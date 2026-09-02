# Machine-Readable Design Catalogs

This directory contains data consumed directly by the compiler, generators, or
editor tooling. These files define closed vocabularies and exact machine facts;
they are not documentation ledgers or test-evidence manifests.

- [`language/`](language/README.md) contains authored language, semantic,
  interface, and runtime catalogs.
- [`aarch64/`](aarch64/README.md) separates authored ARM64 inputs from generated
  compiler tables.

Human-readable language and compiler design remains in the parent `design/`
directory. Behavior is proved by Rust, JavaScript, fuzz, differential, and QEMU
tests rather than rows that point at other evidence rows.
