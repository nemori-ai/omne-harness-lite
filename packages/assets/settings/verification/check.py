"""Run the Settings protocol model; a tool error is never a passing negative control."""
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
    return code == 12 and f"Invariant {expected} is violated." in output


def main():
    cases = [(0, "", "complete", False),
             (0, "Model checking completed. No error has been found.", "complete", True),
             (12, "Invariant Required is violated.", "Required", True),
             (12, "Invariant Other is violated.", "Required", False),
             (1, "Invariant Required is violated.", "Required", False)]
    assert all(accepted(c, o, e) == wanted for c, o, e, wanted in cases)
    if sys.argv[1:] == ["--self-test"]:
        print("5 outcome-recognition cases passed")
        return 0
    if sys.argv[1:]:
        raise ValueError("Usage: check.py [--self-test]")
    root = Path(__file__).resolve().parent
    repo = root.parents[3]
    jar = Path(os.environ.get("TLA2TOOLS_JAR", ""))
    if not jar.is_file():
        raise ValueError("TLA2TOOLS_JAR must point to an existing JAR; no model ran")
    java = os.environ.get("JAVA_BIN", "java")
    manifest = json.loads((root / "models.json").read_text())
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + str(os.getpid())
    out = repo / "tmp/formal/settings" / stamp
    out.mkdir(parents=True)
    inputs = [root / "check.py", root / "models.json", root / manifest["model"]]
    inputs.extend(root / name for name in sorted({c["model"] for c in manifest["cases"] if "model" in c}))
    inputs.extend(root / c["config"] for c in manifest["cases"])
    record = {"scope": manifest["scope"], "createdAt": stamp,
              "sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
              "inputs": {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
              "jarSha256": hashlib.sha256(jar.read_bytes()).hexdigest(), "cases": []}
    version = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=10, check=True)
    record["javaVersion"] = version.stdout + version.stderr
    for case in manifest["cases"]:
        command = [java, "-Xmx512m", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC",
                   "-workers", "1", "-seed", "1", "-metadir", str(out / case["name"]),
                   "-config", str(root / case["config"]), str(root / case.get("model", manifest["model"]))]
        result = subprocess.run(command, cwd=root, capture_output=True, text=True, timeout=45,
                                env={**os.environ, "NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C"})
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
