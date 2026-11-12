"""Run this member's finite models and reject unrecognized tool outcomes."""
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
    if expected == "temporal":
        return (code == 13 and "Temporal properties were violated" in output
                and ("Stuttering" in output or "Back to state" in output))
    return code == 12 and f"Invariant {expected} is violated." in output


def self_test():
    examples = [
        (0, "", "complete", False),
        (0, "Model checking completed. No error has been found.", "complete", True),
        (1, "Model checking completed. No error has been found.", "complete", False),
        (12, "Invariant Wrong is violated.", "Required", False),
        (1, "Invariant Required is violated.", "Required", False),
        (12, "Invariant Required is violated.", "Required", True),
        (13, "Temporal properties were violated", "temporal", False),
        (13, "Temporal properties were violated. State 2: Stuttering", "temporal", True),
        (1, "Parsing failed", "Required", False),
    ]
    for code, output, expected, verdict in examples:
        if accepted(code, output, expected) != verdict:
            raise RuntimeError("Tool outcome recognition self-test failed")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    self_test()
    if sys.argv[1:] == ["--self-test"]:
        print("9 tool-outcome cases passed")
        return 0
    if sys.argv[1:]:
        raise RuntimeError("Usage: check.py [--self-test]")
    root = Path(__file__).resolve().parent
    repo = root.parents[3]
    manifest = json.loads((root / "models.json").read_text())
    jar = Path(os.environ.get("TLA2TOOLS_JAR", ""))
    java = os.environ.get("JAVA_BIN", "java")
    if not jar.is_file():
        raise RuntimeError("TLA2TOOLS_JAR must name an existing JAR; no model was checked")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + str(os.getpid())
    out = repo / "tmp" / "formal" / manifest["member"] / stamp
    out.mkdir(parents=True)
    inputs = [root / "check.py", root / "models.json", root / manifest["model"]]
    inputs += [root / c["config"] for c in manifest["cases"]]
    inputs += [root / c["model"] for c in manifest["cases"] if "model" in c]
    record = {
        "scope": manifest["scope"], "createdAt": stamp,
        "sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "inputs": {str(p.relative_to(root)): digest(p) for p in inputs},
        "jarSha256": digest(jar), "cases": [],
    }
    version = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=10, check=True)
    record["javaVersion"] = version.stdout + version.stderr
    for case in manifest["cases"]:
        command = [java, "-Xmx512m", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC",
                   "-workers", "1", "-seed", "1", "-metadir", str(out / case["name"]),
                   "-config", str(root / case["config"]), str(root / case.get("model", manifest["model"]))]
        try:
            result = subprocess.run(command, cwd=root, capture_output=True, text=True,
                                    timeout=60, env={**os.environ, "NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C"})
            output = result.stdout + result.stderr
            code = result.returncode
        except subprocess.TimeoutExpired as error:
            output = "TLC exceeded 60 seconds; this case did not complete.\n" + str(error)
            code = 124
        log = out / (case["name"] + ".log")
        log.write_text(output)
        passed = accepted(code, output, case["expected"])
        record["cases"].append({**case, "exit": code, "passed": passed, "command": command, "log": str(log)})
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
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
