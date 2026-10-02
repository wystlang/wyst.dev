use crate::common;
use common::WyncCommand;

fn prepared() -> &'static wync::reference_execution::PreparedExecutionProject {
    static PROJECT: std::sync::OnceLock<wync::reference_execution::PreparedExecutionProject> =
        std::sync::OnceLock::new();
    PROJECT.get_or_init(|| {
        wync::reference_execution::prepare_project(
            &wync::reference_execution::ExecutionProjectRequest {
                project: common::fixture("ring-buffer"),
                artifact: None,
            },
        )
        .expect("RingBuffer fixture must prepare")
    })
}

#[test]
fn ring_buffer_sequence_and_backing_contracts() {
    for function in [
        "zero_capacity",
        "one_capacity",
        "wrap_and_linearize",
        "attach_and_reuse",
        "view_mutation",
        "repeated_wrap_model",
        "aggregate_values",
    ] {
        let report = prepared()
            .execute(function, None)
            .expect("fixture execution");
        assert_eq!(
            report.completion,
            wync::reference_execution::Completion::Returned,
            "{function}: {}",
            report.render_text()
        );
        assert_eq!(report.return_value.as_deref(), Some("u64:0x0"));
    }
}

#[test]
fn ring_buffer_rejects_invalid_authority_and_initialization() {
    let prefix = r#"module boot
#target(arch = arm64-v8a, cpu = generic, el = 2)
import core.storage { RingBuffer, RingBufferSpans, ring_buffer_front, ring_buffer_spans,
  ring_buffer_clear, ring_buffer_close, ring_buffer_push_back, ring_buffer_linearize }
fn _start() -> never { loop {} }
fn impossible() -> never { loop { } }
"#;
    let cases = [
        (
            "front_after_clear",
            r#"fn reject(ring: mut RingBuffer<u64>) -> u64 {
  const view = match ring_buffer_front<u64>(mut ring) { .Some(value) { xfer value } .None { impossible() } }
  ring_buffer_clear<u64>(mut ring)
  return view.load()
}"#,
            "borrow",
        ),
        (
            "spans_after_push",
            r#"fn reject(ring: mut RingBuffer<u64>) -> u64 {
  const spans = ring_buffer_spans<u64>(mut ring)
  match ring_buffer_push_back<u64>(mut ring, 7) { .Ok(_) .Error(_) }
  return spans.first[0]
}"#,
            "borrow",
        ),
        (
            "spans_after_close",
            r#"fn reject(ring: var RingBuffer<u64>) -> u64 {
  const spans = ring_buffer_spans<u64>(mut ring)
  ring_buffer_close<u64>(xfer ring)
  return spans.second[0]
}"#,
            "borrow",
        ),
        (
            "backing_alias",
            r#"fn reject(backing: mut []u64) {
  var ring = RingBuffer.attach<u64>(mut backing)
  backing[0] = 9
  ring_buffer_clear<u64>(mut ring)
  ring_buffer_close<u64>(xfer ring)
}"#,
            "borrow",
        ),
        (
            "overlap_linearize",
            r#"fn reject(backing: mut []u64) {
  var ring = RingBuffer.attach<u64>(mut backing)
  match ring_buffer_linearize<u64>(ring, mut backing) { .Ok(_) .Error(_) }
  ring_buffer_close<u64>(xfer ring)
}"#,
            "borrow",
        ),
        (
            "overlapping_views",
            r#"fn reject(ring: mut RingBuffer<u64>) -> u64 {
  const view = match ring_buffer_front<u64>(mut ring) { .Some(value) { xfer value } .None { impossible() } }
  const spans = ring_buffer_spans<u64>(mut ring)
  return view.load() + spans.first.len
}"#,
            "borrow",
        ),
        (
            "forge",
            r#"fn reject(backing: []u64) -> RingBuffer<u64> from backing {
  return {backing = backing, head = 0, len = 999}
}"#,
            "opaque",
        ),
        (
            "raw_backing",
            r#"fn reject() {
  var backing = uninit<[4]u64>()
  var initialized = backing.read()
  var storage = initialized[0 ..< 4]
  var ring = RingBuffer.attach<u64>(mut storage)
  ring_buffer_close<u64>(xfer ring)
}"#,
            "initial",
        ),
        (
            "resource",
            r#"must_account struct Owned { value: u64 }
fn reject(ring: mut RingBuffer<Owned>) {}"#,
            "copyable_discardable",
        ),
        (
            "scoped_payload",
            r#"fn reject(ring: mut RingBuffer<@u64>) {
  var local: u64 = 7
  match ring_buffer_push_back<@u64>(mut ring, addr_of(local)) { .Ok(_) .Error(_) }
}"#,
            "resource loan",
        ),
        (
            "unaccounted",
            "fn reject(ring: var RingBuffer<u64>) {}",
            "owned terminal obligations remain unresolved",
        ),
        (
            "capacity_generic",
            "fn reject(ring: mut RingBuffer<u64, 4>) {}",
            "type",
        ),
    ];
    for (name, body, expected) in cases {
        let path = common::temp_output(&format!("ring-buffer-{name}")).with_extension("wyst");
        std::fs::write(&path, format!("{prefix}{body}\n")).unwrap();
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

#[test]
fn ring_buffer_import_supplies_its_unit_result_dependency() {
    let path = common::temp_output("ring-buffer-unit-dependency").with_extension("wyst");
    std::fs::write(
        &path,
        r#"module boot
#target(arch = arm64-v8a, cpu = generic, el = 2)
import core.storage { RingBuffer, ring_buffer_push_back }
fn _start() -> never { loop {} }
fn insert(ring: mut noescape RingBuffer<u64>) {
  match ring_buffer_push_back<u64>(mut ring, 7) { .Ok(_) .Error(_) }
}
"#,
    )
    .unwrap();
    let output = WyncCommand::new()
        .arg("check")
        .arg(&path)
        .arg("--layout")
        .arg(common::fixture("common/layouts/qemu-virt-aarch64-el2.wyst"))
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    std::fs::remove_file(path).unwrap();
}

#[test]
fn ring_buffer_builds_native_library() {
    let project = common::staged_fixture("ring-buffer");
    let output = WyncCommand::new()
        .arg("build")
        .arg(&project)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let artifacts = ["build/libring_buffer.a", "build/libring_buffer.wystlib"];
    let before = artifacts.map(|path| std::fs::read(project.join(path)).unwrap());
    let explain = || {
        let output = WyncCommand::new()
            .arg("explain")
            .arg("storage")
            .arg(&project)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        output.stdout
    };
    let report = explain();
    assert_eq!(report, explain());
    let text = String::from_utf8(report).unwrap();
    for operation in [
        "attach-ring-buffer",
        "overwrite-ring-buffer",
        "linearize-ring-buffer",
    ] {
        assert!(text.contains(operation), "missing {operation}: {text}");
    }
    for (path, bytes) in artifacts.iter().zip(&before) {
        assert_eq!(&std::fs::read(project.join(path)).unwrap(), bytes);
    }
    let rebuild = WyncCommand::new()
        .arg("build")
        .arg(&project)
        .output()
        .unwrap();
    assert!(
        rebuild.status.success(),
        "{}",
        String::from_utf8_lossy(&rebuild.stderr)
    );
    for (path, bytes) in artifacts.iter().zip(&before) {
        assert_eq!(&std::fs::read(project.join(path)).unwrap(), bytes);
    }
    std::fs::remove_dir_all(project).unwrap();
}
