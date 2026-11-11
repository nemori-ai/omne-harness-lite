"""Run the governance models; a tool error is never a passing negative control."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone


def accepted(code, output, expected):
    if expected == "complete":
        return code == 0 and "Model checking completed. No error has been found." in output
    if expected.startswith("temporal:"):
        return code == 13 and "Temporal properties were violated." in output
    return code == 12 and f"Invariant {expected} is violated." in output


def main():
    cases = [(0, "", "complete", False),
             (0, "Model checking completed. No error has been found.", "complete", True),
             (12, "Invariant Required is violated.", "Required", True),
             (12, "Invariant Other is violated.", "Required", False),
             (1, "Invariant Required is violated.", "Required", False),
             (13, "Temporal properties were violated.", "temporal:Progress", True),
             (1, "Temporal properties were violated.", "temporal:Progress", False)]
    assert all(accepted(c, o, e) == wanted for c, o, e, wanted in cases)
    if sys.argv[1:] == ["--self-test"]:
        print("7 outcome-recognition cases passed")
        return 0
    selection = set()
    if sys.argv[1:]:
        if sys.argv[1] != "--models" or len(sys.argv) < 3:
            raise ValueError("Usage: check.py [--self-test | --models ModelName ...]")
        selection = set(sys.argv[2:])
    root = Path(__file__).resolve().parent
    repo = root.parents[3]
    jar = Path(os.environ.get("TLA2TOOLS_JAR", ""))
    if not jar.is_file():
        raise ValueError("TLA2TOOLS_JAR must point to an existing JAR; no model ran")
    java = os.environ.get("JAVA_BIN", "java")
    manifest = json.loads((root / "models.json").read_text())
    known = {Path(c["model"]).stem for c in manifest["cases"]}
    if selection - known:
        raise ValueError("Unknown model selection: " + ", ".join(sorted(selection - known)))
    selected_cases = [c for c in manifest["cases"]
                      if not selection or Path(c["model"]).stem in selection]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + str(os.getpid())
    out = repo / "tmp/formal/governance" / stamp
    out.mkdir(parents=True)
    inputs = [root / "check.py", root / "models.json"]
    inputs.extend(root / name for name in sorted({c["model"] for c in selected_cases}))
    inputs.extend(root / c["config"] for c in selected_cases)
    record = {"scope": manifest["scope"], "createdAt": stamp,
              "sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
              "inputs": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
              "jarSha256": hashlib.sha256(jar.read_bytes()).hexdigest(),
              "selectedModels": sorted(selection or known), "cases": []}
    version = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=10, check=True)
    record["javaVersion"] = version.stdout + version.stderr
    for case in selected_cases:
        if case["expected"].startswith("temporal:"):
            property_name = case["expected"].split(":", 1)[1]
            config_lines = (root / case["config"]).read_text().splitlines()
            if config_lines != ["SPECIFICATION Spec", next(line for line in config_lines if line.startswith("CONSTANT ")), "PROPERTY " + property_name]:
                raise ValueError("Temporal negative must name its single configured property")
        command = [java, "-Xmx512m", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC",
                   "-workers", "1", "-seed", "1", "-metadir", str(out / case["name"]),
                   "-config", str(root / case["config"]), str(root / case["model"])]
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=45,
                                env={**os.environ, "NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C"})
        if any(hashlib.sha256(p.read_bytes()).hexdigest() != record["inputs"][str(p.relative_to(root))]
               for p in inputs):
            raise ValueError("Verification inputs changed during the run; rerun the affected models")
        output = result.stdout + result.stderr
        log = out / (case["name"] + ".log")
        log.write_text(output)
        passed = accepted(result.returncode, output, case["expected"])
        record["cases"].append({**case, "exit": result.returncode, "passed": passed,
                                "command": command, "log": str(log)})
        (out / "results.json").write_text(json.dumps(record, indent=2) + "\n")
        print(case["name"] + (": passed" if passed else ": FAILED"), flush=True)
        if not passed:
            print(out / "results.json")
            return 1
    print(out / "results.json")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
