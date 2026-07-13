---
title: "Chapter 24: Wyst Scale And Measurement"
group: chapter
chapter: 24
order: 24
summary: "Scale measurement, deterministic rebuild benchmarking, and non-goals."
---

# Chapter 24: Wyst Scale And Measurement

Wyst starts with a measurement contract before incremental behavior. The
benchmark surface is intentionally small: it measures project rebuilds and
requires repeated whole-project output to be
byte-for-byte stable.

Scale work starts with evidence, not cache machinery. The deterministic rebuild
benchmark defines the measurement boundary.

## Deterministic Rebuild Benchmark

Command:

```text
wync rebuild-benchmark <project-dir|path/to/wyst.project>
```

The command accepts the same project input forms as `wync build`. It reads
`wyst.project`, performs two project builds using the same manifest-owned
target, output path, and selected build optimization mode, reads the generated
ELF after each iteration, and fails if the bytes differ.

On success, stdout is JSON:

```json
{
	"schema": "wync.rebuildBenchmark.v0",
	"compilerVersion": "0.3.0",
	"workload": "project",
	"target": "qemu-virt-aarch64-el2",
	"optimization": "reproducible",
	"buildIdentity": "fnv1a64:0000000000000000",
	"targetFacts": {
		"buildIdentity": "fnv1a64:0000000000000000",
		"facts": [
			{
				"name": "arch",
				"value": "arm64-v8a",
				"provenance": "explicit-profile",
				"source": "profile:qemu-virt-aarch64-el2"
			}
		],
		"sourceRequirements": [],
		"analysisDefaults": [],
		"unverifiedAssumptions": []
	},
	"output": "build/kernel.elf",
	"sourceCount": 2,
	"layout": {
		"path": "layout.wyst",
		"fingerprint": "fnv1a64:0000000000000000"
	},
	"modules": [
		{
			"name": "boot",
			"path": "src/boot.wyst",
			"fingerprint": "fnv1a64:0000000000000000",
			"imports": ["drivers.uart"]
		},
		{
			"name": "drivers.uart",
			"path": "src/drivers/uart.wyst",
			"fingerprint": "fnv1a64:0000000000000000",
			"imports": []
		}
	],
	"iterations": [
		{ "index": 1, "elapsedMicros": 1000, "outputBytes": 4096 },
		{ "index": 2, "elapsedMicros": 900, "outputBytes": 4096 }
	],
	"byteIdentical": true
}
```

`optimization` records the build-level `--optimization` mode used for both
iterations. It is not a source `#schedule` mode and not an incremental-build
mode. `elapsedMicros` is an observation, not a pass/fail threshold. The
reproducibility check is the stable contract: byte-identical outputs are
required.

Module and layout fingerprints use a stable `fnv1a64:` prefix. They are not
cryptographic hashes; they are deterministic build-unit identifiers for local
change detection and incremental-checking analysis.
The `buildIdentity` field uses the same stable prefix for resolved target facts
and selected optimization mode, so target profile changes are visible even when
the benchmarked source files do not change.

## Non-Goals

- No persistent build cache.
- No incremental codegen.
- No performance threshold policy.
- No cross-machine benchmark comparison.
