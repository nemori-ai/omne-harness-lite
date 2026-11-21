"""Run this member's finite models and reject unrecognized tool outcomes.

The manifest models.json lists three kinds of runs. A case is a positive control: TLC must finish
without an error. A control is a negative control or the probe of an anti-theorem: TLC must
violate exactly the named invariant, or report a temporal violation when the name is `temporal`.
A mutation edits one valid action in a copy of its model (the text `old` must occur exactly once
and becomes `new`), checks only `invariant` under the constants of its base case, and must violate
it. The models in this directory are never changed. The exit code is 0 only when every run was
judged as expected.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone

COMPLETED = "Model checking completed. No error has been found."
VIOLATED = re.compile(r"Invariant (\w+) is violated")


def accepted(code, output, expected):
    if expected == "complete":
        return code == 0 and COMPLETED in output and not VIOLATED.findall(output)
    if expected == "temporal":
        return (code == 13 and "Temporal properties were violated" in output
                and ("Stuttering" in output or "Back to state" in output))
    return code == 12 and VIOLATED.findall(output) == [expected]


def self_test():
    examples = [
        (0, "", "complete", False),
        (0, COMPLETED, "complete", True),
        (1, COMPLETED, "complete", False),
        (12, "Invariant Wrong is violated.", "Required", False),
        (1, "Invariant Required is violated.", "Required", False),
        (12, "Invariant Required is violated.", "Required", True),
        (12, "Invariant Required is violated. Invariant Other is violated.", "Required", False),
        (13, "Temporal properties were violated", "temporal", False),
        (13, "Temporal properties were violated. State 2: Stuttering", "temporal", True),
        (1, "Parsing failed", "Required", False),
    ]
    for code, output, expected, verdict in examples:
        if accepted(code, output, expected) != verdict:
            raise RuntimeError("Tool outcome recognition self-test failed")
    return len(examples)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def mutant_config(base, invariant):
    """The constants of the base case, checking only `invariant`."""
    lines = base.read_text().splitlines()
    head = lines[:lines.index("INVARIANTS")]
    return "\n".join(head + ["INVARIANTS", f"  {invariant}"]) + "\n"


def runs_of(root, manifest, out):
    """Each run as (name, model, config, expected); a mutation writes its copy into `out`."""
    runs = []
    for case in manifest["cases"] + manifest.get("controls", []):
        model = root / case.get("model", manifest["model"])
        runs.append((case["name"], model, root / case["config"], case["expected"]))
    for mutation in manifest.get("mutations", []):
        base = next(c for c in manifest["cases"] if c["name"] == mutation["base"])
        model = root / base.get("model", manifest["model"])
        source = model.read_text()
        occurrences = source.count(mutation["old"])
        if occurrences != 1:
            raise RuntimeError(f"mutation {mutation['name']}: the text to change occurs "
                               f"{occurrences} times, not once; no model was checked")
        work = out / ("mutant-" + mutation["name"])
        work.mkdir()
        copy = work / model.name
        copy.write_text(source.replace(mutation["old"], mutation["new"]))
        config = work / Path(base["config"]).name
        config.write_text(mutant_config(root / base["config"], mutation["invariant"]))
        runs.append(("mutant-" + mutation["name"], copy, config, mutation["invariant"]))
    return runs


def main():
    count = self_test()
    if sys.argv[1:] == ["--self-test"]:
        print(f"{count} tool-outcome cases passed")
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
    runs = runs_of(root, manifest, out)
    inputs = sorted({root / "check.py", root / "models.json"}
                    | {path for _, model, config, _ in runs for path in (model, config)
                       if root in path.parents})
    record = {
        "scope": manifest["scope"], "createdAt": stamp,
        "sourceHead": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip(),
        "inputs": {str(p.relative_to(root)): digest(p) for p in inputs},
        "jarSha256": digest(jar), "runs": [],
    }
    version = subprocess.run([java, "-version"], capture_output=True, text=True, timeout=10, check=True)
    record["javaVersion"] = version.stdout + version.stderr
    limit = manifest["timeoutSeconds"]
    for name, model, config, expected in runs:
        states = out / (name + ".states")
        command = [java, "-Xmx2g", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC",
                   "-workers", str(manifest["workers"]), "-seed", "1", "-metadir", str(states),
                   "-config", str(config), str(model)]
        try:
            result = subprocess.run(command, cwd=model.parent, capture_output=True, text=True,
                                    timeout=limit,
                                    env={**os.environ, "NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C"})
            output = result.stdout + result.stderr
            code = result.returncode
        except subprocess.TimeoutExpired as error:
            output = f"TLC exceeded {limit} seconds; this run did not complete.\n" + str(error)
            code = 124
        shutil.rmtree(states, ignore_errors=True)
        log = out / (name + ".log")
        log.write_text(output)
        passed = accepted(code, output, expected)
        record["runs"].append({"name": name, "expected": expected, "exit": code, "passed": passed,
                               "command": command, "log": str(log)})
        (out / "results.json").write_text(json.dumps(record, indent=2) + "\n")
        print(name + (": passed" if passed else ": FAILED"), flush=True)
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
