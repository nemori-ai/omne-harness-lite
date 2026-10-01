import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CASES = [
    ("rt6", "runs-rev2", "FinalPlan", None, 49),
    ("rt6", "runs-rev2", "FinalPlan_Public", None, 43),
    ("rt6", "runs", "PendingReply", None, 8),
    ("rt6", "runs", "RetryHistory", None, 42),
    ("rt6", "runs-rev2", "FinalPlan_NoCheck", "CheckedBeforeEffects", None),
    ("rt6", "runs-rev2", "FinalPlan_Mutable", "SameFixedPlan", None),
    ("rt6", "runs-rev2", "FinalPlan_UnknownExceeded", "UnknownNotExceeded", None),
    ("rt6", "runs", "PendingReply_Default", "NoInventedDisposition", None),
    ("rt6", "runs", "PendingReply_DropFacts", "CompleteHandoff", None),
    ("rt6", "runs", "RetryHistory_DispatchCount", "CountsOwnConclusions", None),
    ("runner4", "runs", "FailureHistory", None, 4306),
    ("runner4", "runs", "mixed-model-call", "CallAssociation", None),
    ("runner4", "runs", "lost-retry-history", "LosslessHistory", None),
    ("runner4", "runs", "return-before-conclusion", "WriteBeforeReturn", None),
    ("runner4", "runs", "reevaluate-concluded", "ReplayNoReevaluation", None),
]


def assess(code, timed_out, stdout, stderr, invariant, distinct):
    if timed_out or stderr.strip() or "Parsing or semantic analysis failed" in stdout:
        raise ValueError("timeout, stderr, or parse failure")
    errors = re.findall(r"^Error: (.*)$", stdout, re.MULTILINE)
    states = re.search(r"(\d+) states generated, (\d+) distinct states found, (\d+) states left on queue", stdout)
    if not states or "Finished in " not in stdout:
        raise ValueError("missing TLC completion and state count")
    if invariant is None:
        if code != 0 or errors or "Model checking completed. No error has been found." not in stdout:
            raise ValueError("positive configuration did not complete cleanly")
        if int(states.group(2)) != distinct or int(states.group(3)) != 0:
            raise ValueError("positive state count or queue differs")
    elif code != 12 or errors != [f"Invariant {invariant} is violated.", "The behavior up to this point is:"]:
        raise ValueError("negative configuration did not hit its designated invariant")
    return {"exit_code": code, "target_invariant": invariant, "states_generated": int(states.group(1)), "distinct_states": int(states.group(2)), "states_left": int(states.group(3))}


def verify_hashes(path):
    manifest = json.loads(path.read_text())
    source_dir = path.parent / ("input-rev2" if path.name.startswith("input-rev2") else "input")
    for name, expected in manifest["files"].items():
        actual = hashlib.sha256((source_dir / name).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"frozen input changed: {source_dir / name}")


def main():
    # These sentinels must be rejected before judging real evidence.
    bad = "1 states generated, 1 distinct states found, 0 states left on queue\nFinished in 00s"
    for code, output, invariant in [(0, bad, None), (12, "Error: Invariant Wrong is violated.\nError: The behavior up to this point is:\n" + bad, "Expected")]:
        try:
            assess(code, False, output, "", invariant, 1 if invariant is None else None)
        except ValueError:
            continue
        raise AssertionError("receipt checker accepted a representative false success")
    for name in ["rt6/input-sha256.json", "rt6/input-rev2-sha256.json", "runner4/input-sha256.json"]:
        verify_hashes(ROOT / name)
    results = []
    for family, run_group, name, invariant, distinct in CASES:
        case = ROOT / family / run_group / name
        result = json.loads((case / "exit.json").read_text())
        checked = assess(result["exit_code"], result["timed_out"], (case / "stdout.log").read_text(), (case / "stderr.log").read_text(), invariant, distinct)
        checked.update({"family": family, "configuration": name, "run_directory": str(case.relative_to(ROOT)), "command": json.loads((case / "command.json").read_text())["argv"], "elapsed_seconds": result["elapsed_seconds"], "status": "pass"})
        results.append(checked)
    old = ROOT / "rt6/runs/FinalPlan"
    old_exit = json.loads((old / "exit.json").read_text())["exit_code"]
    old_output = (old / "stdout.log").read_text()
    if old_exit != 150 or "Precedence conflict" not in old_output:
        raise ValueError("initial parse-failure evidence missing")
    receipt = {"tool": "TLC2 2026.09.12.025210 (rev 867aefb)", "jar_sha256": json.loads((ROOT / "rt6/environment.json").read_text())["jar"]["sha256"], "positive_count": 5, "negative_count": 10, "initial_failure": {"family": "rt6", "configuration": "FinalPlan", "exit_code": 150, "reason": "parse precedence conflict in initial candidate", "run_directory": "rt6/runs/FinalPlan"}, "checker_sentinels": "missing success marker and wrong invariant rejected", "cases": results}
    (ROOT / "RESULT.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"PASS: {len(results)} cases, 3 frozen input manifests, initial failure preserved, false-success sentinels rejected")


if __name__ == "__main__":
    main()
