use crate::common;
use common::WyncCommand;

#[test]
fn spsc_ring_sequences_close_batches_and_reset() {
    let project = wync::reference_execution::prepare_project(
        &wync::reference_execution::ExecutionProjectRequest {
            project: common::fixture("spsc-ring"),
            artifact: None,
        },
    )
    .expect("SPSC fixture must prepare");
    for function in [
        "lifecycle",
        "zero_capacity",
        "batches",
        "mismatched_reset",
        "attachment_bounds",
        "nominal_payload",
    ] {
        let report = project
            .execute(function, None)
            .expect("SPSC fixture must execute");
        assert_eq!(
            report.completion,
            wync::reference_execution::Completion::Returned,
            "{function}: {}",
            report.render_text()
        );
        assert_eq!(
            report.return_value.as_deref(),
            Some("u64:0x0"),
            "{function}: {}",
            report.render_text()
        );
    }
}

#[test]
fn spsc_ring_rejects_borrowed_payloads_and_duplicate_endpoints() {
    let cases = [
        ("address", "fn reject(value: SpscProducer<@u64>) {}", "unsigned_integer"),
        ("slice", "fn reject(value: SpscProducer<[]u64>) {}", "unsigned_integer"),
        ("local", "agent_local struct Local { value: u64 }\nfn reject(value: SpscProducer<Local>) {}", "unsigned_integer"),
        ("hidden_address", "struct Nested { value: @u64 }\nfn reject(value: SpscProducer<Nested>) {}", "unsigned_integer"),
        ("copy", "fn reject(value: SpscProducer<u64>) -> SpscProducer<u64> { return value }", "xfer"),
        ("forge", "fn reject() -> SpscProducer<u64> { return {base = 0, capacity = 4, generation = 1, cursor = 0} }", "opaque"),
        ("closed", "fn reject(value: var SpscProducer<u64>) { const ended = spsc_close_producer<u64>(xfer value)\n discard(spsc_try_push<u64>(mut value, 3)) }", "not writable"),
    ];
    for (name, body, expected) in cases {
        let path = common::temp_output(&format!("spsc-{name}")).with_extension("wyst");
        std::fs::write(&path, format!("module boot\nimport core.storage {{SpscProducer, spsc_close_producer, spsc_try_push}}\n{body}\n")).unwrap();
        let output = WyncCommand::new()
            .arg("check")
            .arg(&path)
            .arg("--layout")
            .arg(common::fixture("common/layouts/qemu-virt-aarch64-el2.wyst"))
            .output()
            .unwrap();
        let error = String::from_utf8_lossy(&output.stderr);
        assert!(
            !output.status.success() && error.contains(expected),
            "{name}: {error}"
        );
        std::fs::remove_file(path).unwrap();
    }
}
