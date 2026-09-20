#!/usr/bin/env python3
"""Document migration check only; no product, runtime, or mechanism test."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[6]
BASE = "7af250ee19df1077a5143cac817558caa959a392"
SHARED = "docs/proposals/core-capabilities/implementation/shared-interfaces.md"
JSONL = "packages/storage/jsonl/design.md"
ADMISSION = "packages/coordination/admission/design.md"
EVIDENCE = "docs/proposals/core-capabilities/implementation/evidence/p1-provider-mapping/"
OLD_EVIDENCE = "docs/proposals/core-capabilities/implementation/evidence/p0-shared-interfaces/"
LOCK_EVIDENCE = "docs/proposals/core-capabilities/implementation/evidence/p0-lock-probe/"

def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def source_bytes(path):
    return git("show", f"{BASE}:{path}")

original_bytes = source_bytes(SHARED)
original = original_bytes.decode()
lines = original.splitlines(keepends=True)
current = {
    SHARED: (ROOT / SHARED).read_text(),
    JSONL: (ROOT / JSONL).read_text(),
    ADMISSION: (ROOT / ADMISSION).read_text(),
}
imports = '''import type { OpaqueId, OperationRef } from "@omne-harness-lite/work-data";
import type {
  Position, Receipt, UseBinding, PreparedCommit, CommitResult, CommittedReceipt,
  Watermark, RecordPreparation, PreparedOperation, CloseResult, RecordWriter,
} from "@omne-harness-lite/records";
import type { Diagnostics } from "@omne-harness-lite/diagnostics";

'''
# Only presentation/import adjustments listed here are permitted.
normalized = dict(current)
assert normalized[ADMISSION].count(imports) == 1
normalized[ADMISSION] = normalized[ADMISSION].replace(imports, "")
normalized[JSONL] = normalized[JSONL].replace(
    "## 结果何时占用 operation 身份", "### 结果何时占用 operation 身份"
).replace("系统 principalId 按共享 records 边界的编码", "系统 principalId 按上述编码")

moves = [
    ("jsonl_factory", 422, 422, JSONL),
    ("consumer_preparation", 425, 434, ADMISSION),
    ("writer_preparation_and_submission", 436, 459, JSONL),
    ("operation_results", 475, 512, JSONL),
    ("reader_prefix_and_lookup", 528, 546, JSONL),
    ("admission_gate_views_exact_use_and_example", 550, 802, ADMISSION),
    ("epoch_lock_acquire_recovery_close", 829, 913, JSONL),
    ("admission_counterexamples", 971, 982, ADMISSION),
    ("jsonl_r3_r5_counterexamples", 983, 986, JSONL),
    ("coordinator_close", 988, 992, ADMISSION),
]
retained = [
    ("dto_and_schema_section", 68, 246, SHARED),
    ("records_types_without_moved_factory", 247, 420, SHARED),
    ("operation_identity", 461, 474, SHARED),
    ("batch_and_business_record_boundary", 514, 527, SHARED),
    ("codec_shape_and_meaning", 803, 827, SHARED),
    ("literal_golden_samples", 915, 959, SHARED),
    ("p0_boundary", 994, 999, SHARED),
    ("historical_checks_and_review", 1003, len(lines), SHARED),
]
results = []
for category, segments in (("moved", moves), ("retained", retained)):
    for name, start, end, destination in segments:
        expected = "".join(lines[start - 1:end]).rstrip("\n")
        assert expected in normalized[destination], f"content missing/changed: {name}"
        if category == "moved":
            assert expected not in current[SHARED], f"duplicate current text: {name}"
        results.append({
            "category": category, "name": name, "source_lines": [start, end],
            "destination": destination, "content_sha256": sha(expected.encode()),
            "status": "identical_after_listed_presentation_adjustments",
        })

evidence = []
for prefix in (OLD_EVIDENCE, LOCK_EVIDENCE):
    paths = git("ls-tree", "-r", "--name-only", BASE, "--", prefix).decode().splitlines()
    for path in paths:
        before = source_bytes(path)
        after = (ROOT / path).read_bytes()
        assert before == after, f"old evidence changed: {path}"
        evidence.append({"path": path, "sha256": sha(after), "bytes": len(after)})

protected = [
    "spec/catalog.json", "spec/frozen.json",
    "packages/storage/records/src/index.ts", "packages/storage/records/README.md",
    "packages/core/work-data/src/index.ts", "packages/core/work-data/README.md",
]
protected_results = []
for path in protected:
    after = (ROOT / path).read_bytes()
    assert source_bytes(path) == after, f"protected source changed: {path}"
    protected_results.append({"path": path, "sha256": sha(after)})

changed = set(git("diff", "--name-only", BASE, "--").decode().splitlines())
changed.update(git("ls-files", "--others", "--exclude-standard").decode().splitlines())
assert all(p in (SHARED, JSONL, ADMISSION) or p.startswith(EVIDENCE) for p in changed), sorted(changed)
assert git("branch", "--show-current").decode().strip() == "design/dsh-p1-provider-mapping"
result = {
    "kind": "documentation_migration_check",
    "baseline": BASE,
    "head_at_check": git("rev-parse", "HEAD").decode().strip(),
    "source_path": SHARED, "source_sha256": sha(original_bytes),
    "python": sys.version,
    "presentation_adjustments": [
        "admission adds public type imports; existing declarations unchanged",
        "operation-result heading moves from level 3 to level 2",
        "JSONL epoch paragraph makes the original shared Principal encoding reference explicit",
    ],
    "segments": results, "unchanged_evidence": evidence,
    "unchanged_public_sources_and_registry": protected_results,
    "scope_paths": sorted(changed),
    "product_tests_run": False,
    "new_mechanism_probes_run": False,
}
print(json.dumps(result, ensure_ascii=False, indent=2))
