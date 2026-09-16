"""Reproduce bounded J message checks; no provider implementation is exercised."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[4]
FORMAL = ROOT / ".meta_harness/design/spec/capabilities/message-stream/v1/formal"
CASES = {
    "Safety": None,
    "Progress": None,
    "ReceiptCursorMutation": "AtomicCoverage",
    "StaleSnapshotMutation": "SnapshotCAS",
    "StaleAsOfMutation": "SnapshotCAS",
    "StaleActiveMutation": "ActiveGeneration",
    "ReopenTerminalMutation": "TerminalDominates",
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--java", type=pathlib.Path, required=True)
    parser.add_argument("--jar", type=pathlib.Path, required=True)
    args = parser.parse_args()
    inputs = [FORMAL / "JointProjectionRecovery.tla"] + list(FORMAL.glob("JointProjectionRecovery*.cfg"))
    inputs += [ROOT / (".meta_harness/design/spec/capabilities/" + name + "/v1/contract.md")
               for name in ("message-stream", "session", "model-execution", "media-content")]
    inputs += [ROOT / (".meta_harness/design/decisions/" + name + "/decision.md")
               for name in ("e-message-stream-hooks", "e-message-recovery-protocol")]
    inputs += [pathlib.Path(__file__).resolve()]
    report = {
        "baseline_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "inputs": {str(p.relative_to(ROOT)): digest(p) for p in sorted(inputs)},
        "tools": {"java": {"path": str(args.java), "sha256": digest(args.java)},
                  "tla2tools": {"path": str(args.jar), "sha256": digest(args.jar)}},
        "java_version": subprocess.run([str(args.java), "-version"], capture_output=True, text=True).stderr,
        "runs": [],
    }
    (HERE / "raw").mkdir(exist_ok=True)
    for case, expected in CASES.items():
        command = [str(args.java), "-Xmx2g", "-cp", str(args.jar), "tlc2.TLC",
                   "-noGenerateSpecTE", "-workers", "2", "-metadir", str(ROOT / "tmp/j-message" / case),
                   "-config", "JointProjectionRecovery" + case + ".cfg",
                   "JointProjectionRecovery.tla"]
        result = subprocess.run(command, cwd=FORMAL, capture_output=True, text=True)
        output = result.stdout + result.stderr
        log = HERE / "raw" / (case + ".log")
        log.write_text(output)
        passed = (result.returncode == 0 and "No error has been found" in output) if expected is None else (
            result.returncode != 0 and "Invariant " + expected + " is violated" in output)
        report["runs"].append({"case": case, "command": command, "cwd": str(FORMAL),
                              "expected_violation": expected, "exit_code": result.returncode,
                              "matched_expectation": passed, "log": str(log.relative_to(HERE)),
                              "sha256": digest(log),
                              "state_counts": re.findall(r"\d+ states generated,.*", output)})
        print(case, passed, flush=True)
    (HERE / "run-report.json").write_text(json.dumps(report, indent=2) + "\n")
    if not all(run["matched_expectation"] for run in report["runs"]):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
