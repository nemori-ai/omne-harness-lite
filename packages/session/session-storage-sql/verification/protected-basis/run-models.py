#!/usr/bin/env python3
"""Runs the positive and the negative controls of SessionPermissionWrite.tla with TLC.

Usage: TLA2TOOLS_JAR=<tla2tools.jar> python3 run-models.py [<output-dir>]

A positive control passes when TLC exits 0 and reports a complete search. A negative control
passes only when TLC reports exactly the named invariant as violated. A tool error, a timeout or
another violated property is a failure. The exit code is 0 only when every control passed.
"""
import os
import pathlib
import re
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
MODEL = "SessionPermissionWrite.tla"
# configuration -> the invariant that must be violated; None means a complete search.
CASES = {
    "positive": None,
    "negative-blind": "AtMostOnce",
    "negative-unguarded": "CommitUsesCurrentFact",
    "negative-held": "SourceIsFresh",
    "negative-early": "ReplayIsRecognised",
    "negative-query": "ReplayIsRecognised",
    "negative-durable": "FailedResolutionIsNotDurable",
}


def main() -> int:
    jar = os.environ.get("TLA2TOOLS_JAR")
    if not jar or not pathlib.Path(jar).is_file():
        print("TLA2TOOLS_JAR does not name a file", file=sys.stderr)
        return 2
    present = sorted(path.stem for path in HERE.glob("*.cfg"))
    if present != sorted(CASES):
        print(f"case table and configurations differ: {present}", file=sys.stderr)
        return 2
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(tempfile.mkdtemp())
    out.mkdir(parents=True, exist_ok=True)
    failed = False
    for name, expected in CASES.items():
        command = ["java", "-Xmx512m", "-cp", jar, "tlc2.TLC", "-workers", "1", "-seed", "1",
                   "-metadir", str(out / f"meta-{name}"), "-config", f"{name}.cfg", MODEL]
        try:
            run = subprocess.run(command, cwd=HERE, capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            print(f"{name}: FAIL (timeout)")
            failed = True
            continue
        (out / f"{name}.log").write_text(run.stdout + run.stderr)
        violated = sorted(set(re.findall(r"Invariant (\w+) is violated", run.stdout)))
        if expected is None:
            passed = run.returncode == 0 and "No error has been found." in run.stdout
        else:
            passed = run.returncode == 12 and violated == [expected]
        states = re.findall(r"(\d[\d,]*) distinct states found", run.stdout)
        print(f"{name}: {'pass' if passed else 'FAIL'} expected={expected or 'complete'} "
              f"rc={run.returncode} distinct={states[-1] if states else '-'}")
        failed = failed or not passed
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
