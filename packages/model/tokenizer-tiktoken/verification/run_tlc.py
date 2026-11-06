#!/usr/bin/env python3
"""Run one member-owned model suite with bounded TLC resources and exact verdicts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time


def verdict(returncode, output, expected):
    if expected == "pass":
        return returncode == 0 and "Model checking completed. No error has been found." in output
    return returncode == 12 and re.search(
        rf"^Error: Invariant {re.escape(expected)} is violated\.$", output, re.MULTILINE
    ) is not None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_manifest(source):
    manifest = [line.split() for line in (source / "expect.txt").read_text().splitlines() if line.strip()]
    if not manifest:
        raise ValueError("expect.txt must contain at least one configuration")
    if any(len(row) != 2 or Path(row[0]).name != row[0] for row in manifest):
        raise ValueError("expect.txt requires one local cfg filename and one verdict per line")
    names = [row[0] for row in manifest]
    if len(names) != len(set(names)) or set(names) != {p.name for p in source.glob("*.cfg")}:
        raise ValueError("expect.txt must name each cfg exactly once")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--jar", default=os.environ.get("TLA2TOOLS_JAR"))
    args = parser.parse_args()
    if not args.jar or not Path(args.jar).is_file():
        parser.error("Set TLA2TOOLS_JAR or pass --jar with the installed tla2tools JAR")
    source = args.model.resolve(strict=True)
    modules = list(source.glob("*.tla"))
    if len(modules) != 1:
        parser.error("The model directory must contain exactly one TLA module")
    try:
        manifest = read_manifest(source)
    except ValueError as error:
        parser.error(str(error))
    java = shutil.which("java")
    if java is None:
        parser.error("Java is unavailable")
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    env = dict(os.environ, LC_ALL="C", NO_COLOR="1")
    version = subprocess.run([java, "-version"], capture_output=True, text=True, env=env, check=False)
    (output / "java-version.txt").write_text(version.stdout + version.stderr)
    inputs = [*source.glob("*.tla"), *source.glob("*.cfg"), source / "expect.txt"]
    evidence = {"inputs": {p.name: digest(p) for p in sorted(inputs)},
                "runnerSha256": digest(Path(__file__)), "jar": str(Path(args.jar).resolve()),
                "jarSha256": digest(Path(args.jar)), "java": java,
                "heapMiB": 768, "workers": 1, "timeoutSeconds": 120, "runs": []}
    for cfg, expected in manifest:
        command = [java, "-Xmx768m", "-cp", str(Path(args.jar).resolve()), "tlc2.TLC",
                   "-workers", "1", "-metadir", str(output / (cfg + ".states")),
                   "-config", str(source / cfg), str(modules[0])]
        start = time.monotonic()
        try:
            run = subprocess.run(command, capture_output=True, text=True, timeout=120,
                                 env=env, cwd=source, check=False)
            code, log = run.returncode, run.stdout + run.stderr
        except subprocess.TimeoutExpired as error:
            code = 124
            log = (error.stdout or b"").decode() + (error.stderr or b"").decode() + "\nTLC TIMEOUT\n"
        (output / (cfg + ".log")).write_text(log)
        passed = verdict(code, log, expected)
        row = {"cfg": cfg, "expected": expected, "returncode": code, "passed": passed,
               "seconds": round(time.monotonic() - start, 3), "command": command,
               "states": re.findall(r"[\d,]+ states generated, [\d,]+ distinct states found[^\n]*", log)[-1:]}
        evidence["runs"].append(row)
        (output / "summary.json").write_text(json.dumps(evidence, indent=2) + "\n")
        print(f"{cfg}: expected={expected} rc={code} {'PASS' if passed else 'FAIL'}", flush=True)
    return 0 if all(row["passed"] for row in evidence["runs"]) else 1


if __name__ == "__main__":
    raise SystemExit(main())
