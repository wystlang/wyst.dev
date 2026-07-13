---
title: "Chapter 22: Generated Manifest"
group: chapter
chapter: 22
order: 22
summary: "Generated/build manifest provenance, declared inputs, host/tool facts, and artifact facts."
---

# Chapter 22: Generated Manifest

`wync generated-manifest <project-dir|path/to/wyst.project> --out
<manifest.json>` emits a deterministic JSON manifest for the resolved project
build configuration and the already-emitted project artifact, if present.

The generated manifest records build provenance: what source and layout inputs
were declared, what host/tool facts were observed, and what artifact facts were
available after the build.

The schema is `wync.generatedManifest.v0` in the `wync.reports.v0` report
schema bundle. It covers one
build-configuration artifact: the resolved project build described by
`wyst.project`. The command is a reporting step, not a build step. It writes only
the requested manifest file and does not rebuild or rewrite the project output.

The manifest records:

- declared inputs: `wyst.project`, layout, source roots in manifest order, and
  discovered source modules in canonical import-closure traversal order with
  byte counts and FNV-1a fingerprints;
- source-map status for compiler source spans;
- provenance and freshness for the generated build-configuration artifact;
- target fact provenance, including a target-sensitive `buildIdentity`,
  explicit profile/custom project facts, source requirements, selected
  scheduling modes, permitted analysis defaults, and unverified assumptions;
- cache-purity/freshness status, including `not-used` and `current-run`;
- observed host/tool facts: `wync` version, host OS, host architecture, host
  family, target profile, and optimization mode;
- emitted artifact facts for the manifest-owned ELF path, including existence,
  ELF class, machine, entry address, source-map status, provenance, and
  freshness.

The command intentionally avoids timestamps, absolute host paths, command-line
output paths, environment-dependent discovery, path-sensitive debug-data hashes,
and retained cache state. Two identical project builds followed by two
generated-manifest runs must produce byte-identical manifests.

The `buildIdentity` value is a deterministic local fingerprint over the
resolved target display, optimization mode, ordered target facts, and selected
scheduling modes, including implicit `schedule.default`. It is not a
cryptographic hash, but changing an explicit target fact or selected schedule
mode changes this identity so reports cannot hide byte-affecting build
selection changes.
