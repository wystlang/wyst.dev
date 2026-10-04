use crate::common;
use common::WyncCommand;

fn prepared() -> &'static wync::reference_execution::PreparedExecutionProject {
    static PROJECT: std::sync::OnceLock<wync::reference_execution::PreparedExecutionProject> =
        std::sync::OnceLock::new();
    PROJECT.get_or_init(|| {
        wync::reference_execution::prepare_project(
            &wync::reference_execution::ExecutionProjectRequest {
                project: common::fixture("slot-map"),
                artifact: None,
            },
        )
        .expect("SlotMap fixture must prepare")
    })
}

#[test]
fn slot_map_lifecycle_and_accounting() {
    for function in [
        "lifecycle",
        "foreign_and_reattached_handles",
        "attachment_rejection_preserves_backing",
        "zero_capacity_and_tail",
        "zero_capacity",
        "initialization_failure",
        "failed_initializer_preserves_backing",
        "iteration_observes_current_membership",
        "storage_policy_and_zero_sized_rejection",
        "detach_recovers_live_map",
        "aligned_aggregate",
    ] {
        let report = prepared()
            .execute(function, None)
            .expect("fixture must execute");
        assert_success(&report);
        if function == "initialization_failure" {
            for initializer in ["initialize_ok", "initialize_error"] {
                assert_eq!(
                    report
                        .events
                        .iter()
                        .filter(|event| {
                            event.kind == "call"
                                && event.operation == "enter"
                                && event.function.ends_with(initializer)
                        })
                        .count(),
                    1,
                    "capacity rejection must not run {initializer}"
                );
            }
        }
    }
}

fn assert_success(report: &wync::reference_execution::ExecutionReport) {
    assert_eq!(
        report.completion,
        wync::reference_execution::Completion::Returned,
        "{}",
        report.render_text()
    );
    let value = report.return_value.as_deref().expect("fixture must return");
    assert_eq!(
        u64::from_str_radix(value.strip_prefix("u64:0x").expect("u64 result"), 16).unwrap(),
        0,
        "{}",
        report.render_text()
    );
}

#[test]
fn slot_map_lease_does_not_repeat_handle_validation() {
    let report = prepared()
        .execute("lease_access", None)
        .expect("lease must execute");
    assert_success(&report);
    let validations = report
        .events
        .iter()
        .filter(|event| {
            event.kind == "call"
                && event.operation == "enter"
                && event.function.contains("slot_pool_validate")
        })
        .count();
    assert_eq!(
        validations, 1,
        "the single entry must authenticate the lease once"
    );
}

#[test]
fn slot_map_final_generation_retires_without_wraparound() {
    for function in ["generation_retirement", "generation_retirement_remove"] {
        let probe = prepared()
            .execute(function, None)
            .expect("seed boundary must execute");
        assert_eq!(
            probe.completion,
            wync::reference_execution::Completion::EnvironmentUnavailable
        );
        let backing = probe
            .reference_addresses
            .iter()
            .find(|(name, _, _)| name.ends_with("BACKING"))
            .expect("backing address")
            .1;
        let operation = probe
            .completion_detail
            .split('\'')
            .nth(1)
            .expect("missing scripted operation");
        let scenario = format!(
            r#"{{"version":1,"environment":[{{"operation":"{operation}","arguments":[],"memory":[{{"address":"0x{:x}","bytes":"feffffffffffffff"}}]}}]}}"#,
            backing + 8
        );
        let report = prepared()
            .execute(function, Some(&scenario))
            .expect("retirement must execute");
        assert_success(&report);
        assert_eq!(report.environment_consumed, 1);
    }
}

#[test]
fn slot_map_rejects_stale_authority_and_forgery() {
    let prefix = r#"module pool_rejection
import core.storage { SlotMap, SlotHandle, slot_map_view, slot_map_remove, slot_map_insert, slot_map_clear }
fn impossible() -> never { loop { } }
"#;
    let cases = [
        (
            "release",
            r#"fn reject(pool: mut SlotMap<u64>, slot: SlotHandle<u64>) -> u64 {
  const view = match slot_map_view<u64>(mut pool, slot) { .Ok(value) { value } .Error(_) { impossible() } }
  match slot_map_remove<u64>(mut pool, slot) { .Ok(_) .Error(_) { impossible() } }
  return view.load()
}"#,
            "borrow",
        ),
        (
            "reuse",
            r#"fn reject(pool: mut SlotMap<u64>, slot: SlotHandle<u64>) -> u64 {
  const view = match slot_map_view<u64>(mut pool, slot) { .Ok(value) { value } .Error(_) { impossible() } }
  match slot_map_insert<u64>(mut pool, 7) { .Ok(_) .Error(_) { impossible() } }
  return view.load()
}"#,
            "borrow",
        ),
        (
            "derived",
            r#"struct Carried { value: @u64 }
fn reject(pool: mut SlotMap<u64>, slot: SlotHandle<u64>) -> u64 {
  const view = match slot_map_view<u64>(mut pool, slot) { .Ok(value) { value } .Error(_) { impossible() } }
  const carried: Carried = {value = xfer view}
  match slot_map_remove<u64>(mut pool, slot) { .Ok(_) .Error(_) { impossible() } }
  return carried.value.load()
}"#,
            "borrow",
        ),
        (
            "transfer",
            r#"fn reject(pool: var SlotMap<u64>, slot: SlotHandle<u64>) -> u64 {
  const view = match slot_map_view<u64>(mut pool, slot) { .Ok(value) { value } .Error(_) { impossible() } }
  SlotMap.abandon_storage<u64>(xfer pool)
  return view.load()
}"#,
            "borrow",
        ),
        (
            "clear",
            r#"fn reject(pool: mut SlotMap<u64>, slot: SlotHandle<u64>) -> u64 {
  const view = match slot_map_view<u64>(mut pool, slot) { .Ok(value) { value } .Error(_) { impossible() } }
  slot_map_clear<u64>(mut pool)
  return view.load()
}"#,
            "borrow",
        ),
        (
            "raw_pool",
            r#"fn reject(map: mut SlotMap<u64>) { slot_map_insert<u64>(mut map.pool, 1) }"#,
            "opaque",
        ),
        (
            "forge",
            r#"fn reject() -> SlotHandle<u64> {
  return {identity = {bits = 0}, incarnation = 0, index = 0, generation = 1}
}"#,
            "opaque",
        ),
        (
            "wrong_type",
            r#"fn reject(pool: mut SlotMap<u64>, slot: SlotHandle<u32>) {
  match slot_map_remove<u64>(mut pool, slot) { .Ok(_) .Error(_) }
}"#,
            "type mismatch",
        ),
        (
            "resource",
            r#"must_account struct Owned { bits: u64 }
fn reject(pool: mut SlotMap<Owned>) {}
"#,
            "copyable_discardable",
        ),
        (
            "unaccounted",
            r#"fn reject(pool: var SlotMap<u64>) {}"#,
            "owned terminal obligations remain unresolved",
        ),
    ];
    for (name, body, expected) in cases {
        let path = common::temp_output(&format!("slot-map-{name}")).with_extension("wyst");
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
fn slot_map_builds_native_library() {
    let _ = prepared();
    let project = common::staged_fixture("slot-map");
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
    assert!(project.join("build/libslot_map.a").is_file());
    assert!(project.join("build/libslot_map.wystlib").is_file());
    std::fs::remove_dir_all(project).unwrap();
}
