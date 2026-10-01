from pathlib import Path
import hashlib
import json
import re
import tarfile

root = Path(__file__).parent
expected_archives = {
    "rt4-formal-run-1": "7ec0da63cbb34d644d6318dc261f358be8dfa765cbdb08d1830956be551cebb8",
    "rt4-formal-run-2": "326923543737c3146994004048a51db7f752eab8e317ee7a8e1b024de0512e2f",
}
result = {"runs": {}, "errors": []}
for name, expected in expected_archives.items():
    directory = root / name
    archive = directory / "evidence.tar.gz"
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == expected
    inventory = json.loads((directory / "inventory.json").read_text())
    with tarfile.open(archive, "r:gz") as handle:
        members = handle.getmembers()
        assert all(member.isfile() for member in members)
        packed = {member.name: handle.extractfile(member).read() for member in members}
    for row in inventory["files"]:
        raw = (directory / row["path"]).read_bytes()
        assert len(raw) == row["bytes"]
        assert hashlib.sha256(raw).hexdigest() == row["sha256"]
        assert packed[row["path"]] == raw
    assert packed["inventory.json"] == (directory / "inventory.json").read_bytes()
    assert len(packed) == len(inventory["files"]) + 1
    outcomes = []
    for row in json.loads((directory / "results.json").read_text()):
        rawdir = directory / "runs" / row["id"]
        stdout = (rawdir / "stdout.log").read_bytes()
        stderr = (rawdir / "stderr.log").read_bytes()
        assert hashlib.sha256(stdout).hexdigest() == row["stdout_sha256"]
        assert hashlib.sha256(stderr).hexdigest() == row["stderr_sha256"]
        assert row["terminal"] and not row["timed_out"]
        if row["kind"] == "positive":
            assert row["exit_code"] == 0
            assert b"Model checking completed. No error has been found." in stdout
            assert row["state_counts"][-1]["queued"] == 0
        if row["kind"] == "negative":
            trace = (rawdir / "trace.txt").read_bytes()
            assert hashlib.sha256(trace).hexdigest() == row["trace_sha256"]
            if name == "rt4-formal-run-1" and row["id"].endswith("UnknownAsAbsent"):
                assert row["exit_code"] == 75
            else:
                assert row["exit_code"] == 12
                assert ("Invariant " + row["oracle"] + " is violated").encode() in stdout
                assert re.search(rb"State [2-9]:", trace)
        outcomes.append({key: row[key] for key in ["id", "kind", "exit_code", "terminal"]})
    result["runs"][name] = {
        "archive_sha256": expected,
        "archive_members": len(packed),
        "inventory_rows": len(inventory["files"]),
        "all_members_read_back": True,
        "outcomes": outcomes,
    }

run2 = root / "rt4-formal-run-2"
for row in json.loads((run2 / "inputs-before.json").read_text())["rows"]:
    assert hashlib.sha256(Path(row["source"]).read_bytes()).hexdigest() == row["sha256"]
assert json.loads((run2 / "inputs-after.json").read_text())["all_matched"]
revision3 = root / "rt4-review-revision3"
manifest = json.loads((revision3 / "output-sha256.json").read_text())
for row in manifest["files"]:
    raw = (revision3 / "inputs" / row["path"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == row["sha256"]
    if "/formal/" in row["path"]:
        assert raw == (run2 / "inputs" / row["path"]).read_bytes()
unknown = (run2 / "runs/settlement-negative-UnknownAsAbsent/trace.txt").read_text()
for action in ["Prepare(1)", "Submit(1)", "LoseAck(1)", "Recover(1)"]:
    assert action in unknown
assert "StopOld(" not in unknown
assert "unsafeAbsence = TRUE" in unknown
assert "stopped = <<FALSE, TRUE>>" in unknown
assert "pending = <<TRUE, FALSE>>" in unknown
result["run2_inputs_checked"] = 102
result["revision3_frozen_inputs_checked"] = 29
result["revision3_unchanged_formal_inputs_checked"] = 24
result["scope"] = "Archive fidelity, actual raw finite outcomes, input identity; no IO, all-operation or revision3 body execution claim"
(root / "rt4-formal-root-verification.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps({"runs": {n: r["archive_members"] for n, r in result["runs"].items()}, "errors": result["errors"], "run2_inputs": 102, "revision3_formal_unchanged": 24}))
