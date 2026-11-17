"""Run the core token pool models and reject unrecognized tool outcomes."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

TIMEOUT_SECONDS = 1800


def accepted(code, output, expected):
    if expected == "complete":
        return code == 0 and "Model checking completed. No error has been found." in output
    if expected.startswith("temporal:"):
        # TLC does not name the violated temporal property; the case's config lists only that one.
        return (code == 13 and "Temporal properties were violated" in output
                and ("Stuttering" in output or "Back to state" in output))
    if expected.startswith("action:"):
        name = expected.split(":", 1)[1]
        return code == 13 and f"Action property {name} " in output and "is violated" in output
    return code == 12 and f"Invariant {expected} is violated." in output


def self_test():
    examples = [
        (0, "", "complete", False),
        (0, "Model checking completed. No error has been found.", "complete", True),
        (1, "Model checking completed. No error has been found.", "complete", False),
        (12, "Invariant P1 is violated.", "P2", False),
        (1, "Invariant P2 is violated.", "P2", False),
        (12, "Invariant P2 is violated.", "P2", True),
        (13, "Action property P4 of the specification is violated.", "action:P4", True),
        (13, "Action property P4 of the specification is violated.", "action:P5", False),
        (13, "Temporal properties were violated. Back to state 3", "temporal:P3", True),
        (13, "Temporal properties were violated.", "temporal:P3", False),
        (1, "Parsing failed", "P2", False),
    ]
    for code, output, expected, verdict in examples:
        if accepted(code, output, expected) != verdict:
            raise RuntimeError("Tool outcome recognition self-test failed")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    self_test()
    if sys.argv[1:] == ["--self-test"]:
        print("11 tool-outcome cases passed")
        return 0
    only = sys.argv[1:]
    root = Path(__file__).resolve().parent
    repo = root.parents[2]
    manifest = json.loads((root / "models.json").read_text())
    unknown = set(only) - {c["name"] for c in manifest["cases"]}
    if unknown:
        raise RuntimeError("Usage: check.py [--self-test | <case>...]; unknown: " + ", ".join(sorted(unknown)))
    jar = Path(os.environ.get("TLA2TOOLS_JAR", ""))
    java = os.environ.get("JAVA_BIN", "java")
    if not jar.is_file():
        raise RuntimeError("TLA2TOOLS_JAR must name an existing JAR; no model was checked")
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + str(os.getpid())
    out = repo / "tmp" / "formal" / manifest["member"] / stamp
    out.mkdir(parents=True)
    inputs = [root / "check.py", root / "models.json", root / manifest["model"]]
    inputs += [root / c["config"] for c in manifest["cases"]]
    record = {
        "scope": manifest["scope"], "createdAt": stamp,
        "sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "inputs": {str(p.relative_to(root)): digest(p) for p in inputs},
        "jarSha256": digest(jar), "cases": [],
    }
    version = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=10, check=True)
    record["javaVersion"] = version.stdout + version.stderr
    for case in manifest["cases"]:
        if only and case["name"] not in only:
            continue
        command = [java, "-Xmx1g", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC",
                   "-workers", "1", "-seed", "1", "-metadir", str(out / case["name"]),
                   "-config", str(root / case["config"]), str(root / manifest["model"])]
        try:
            result = subprocess.run(command, cwd=root, capture_output=True, text=True,
                                    timeout=TIMEOUT_SECONDS,
                                    env={**os.environ, "NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C"})
            output = result.stdout + result.stderr
            code = result.returncode
        except subprocess.TimeoutExpired as error:
            output = f"TLC exceeded {TIMEOUT_SECONDS} seconds; this case did not complete.\n" + str(error)
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
