#!/usr/bin/env python3
"""Run candidate cache controls serially, with TLC isolated from the checkout.

Model checking does not take a test slot (line rule of 2026-11-03): at most four workers and a
2 GiB heap, one configuration at a time.
"""

import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time


ROOT = Path(__file__).resolve().parent
MODULE = "CandidateCache"
MAX_WORKERS = 4
CASES = {
    "bad-publish-check": ("invariant", "NoStalePublication"),
    "bad-retire-clear": ("invariant", "Equivalence"),
    "bad-auth-hit": ("invariant", "Authorized"),
    "bad-gap": ("invariant", "Equivalence"),
    "bad-shared-key": ("invariant", "HitBelongsToPrincipal"),
    "bad-epoch": ("invariant", "Equivalence"),
    "bad-overwrite": ("invariant", "NoRegression"),
    "bad-skip-recheck": ("invariant", "RecheckedEligible"),
    "valid-pairs": ("positive", None),
    "valid-cache": ("positive", None),
}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cases", nargs="*", choices=tuple(CASES))
    parser.add_argument("--output", type=Path, help="Evidence root (under repository tmp on Windows)")
    parser.add_argument("--timeout", type=int, default=1200, help="Seconds per TLC configuration")
    parser.add_argument("--workers", type=int, default=1, help=f"TLC workers, at most {MAX_WORKERS}")
    parser.add_argument("--jar", default="/opt/tlaplus/tla2tools.jar")
    parser.add_argument("--distro", default="Ubuntu-24.04")
    parser.add_argument("--parse-only", action="store_true", help="Run SANY, without state exploration")
    parser.add_argument("--native", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--source-head", default="unknown", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if not 1 <= args.workers <= MAX_WORKERS:
        parser.error(f"--workers must be between 1 and {MAX_WORKERS}")
    return args


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def linux_path(path):
    text = path.resolve().as_posix()
    if not re.match(r"^[A-Za-z]:/", text):
        raise ValueError("WSL transport requires an absolute Windows drive path")
    return "/mnt/" + text[0].lower() + text[2:]


def sources():
    return [ROOT / f"{MODULE}.tla", ROOT / "run-models.py", *sorted(ROOT.glob("*.cfg"))]


def bridge(args):
    repo = ROOT.parents[4]
    output = (args.output or repo / "tmp/line-session-run/w2/M-CACHE/runs").resolve()
    if not output.is_relative_to(repo / "tmp"):
        raise ValueError("Evidence must stay inside this checkout's tmp directory")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        for source in sources():
            member = tar.gettarinfo(str(source), arcname=source.name)
            member.mtime = 0
            with source.open("rb") as contents:
                tar.addfile(member, contents)
    command = ["python3", "run-models.py", "--native", "--output", linux_path(output),
               "--timeout", str(args.timeout), "--workers", str(args.workers),
               "--jar", args.jar, "--source-head", head]
    if args.parse_only:
        command.append("--parse-only")
    command.extend(args.cases)
    script = "\n".join([
        "set -eu", "task_dir=$(mktemp -d /tmp/omne-candidate-cache.XXXXXXXX)",
        "trap 'rm -rf -- \"$task_dir\"' EXIT", "cd \"$task_dir\"", "tar -xf -",
        "export PYTHONUTF8=1", "unset UV_DEFAULT_INDEX", shlex.join(command),
    ])
    completed = subprocess.run(["wsl.exe", "-d", args.distro, "--exec", "bash", "-l", "-c", script],
                               input=archive.getvalue(), check=False)
    return completed.returncode


def validate_config(case, config):
    """Every safety control names exactly the invariant the runner expects to see violated."""
    kind, expected = CASES[case]
    lines = [line.split("\\*", 1)[0].strip() for line in config.splitlines()]
    declarations = [line for line in lines if re.match(r"INVARIANTS?\b", line)]
    if kind == "invariant" and declarations != [f"INVARIANT {expected}"]:
        raise ValueError(f"{case} requires exactly INVARIANT {expected}")
    if kind == "positive" and declarations != ["INVARIANTS"]:
        raise ValueError(f"{case} requires one INVARIANTS block")


def judge(case, code, output, timed_out=False):
    kind, property_name = CASES[case]
    if timed_out:
        return False
    if kind == "positive":
        return code == 0 and "Model checking completed. No error has been found." in output
    return (code == 12 and f"Invariant {property_name} is violated." in output
            and "The behavior up to this point is:" in output)


def run_case(args, case, folder, env):
    kind, property_name = CASES[case]
    command = ["java", "-Xmx2048m", "-XX:+UseParallelGC", "-cp", args.jar,
               "tlc2.TLC", "-workers", str(args.workers), "-seed", "787", "-fp", "0",
               "-config", f"{case}.cfg", "-metadir", str(ROOT / "states" / case), f"{MODULE}.tla"]
    start = dt.datetime.now(dt.timezone.utc).isoformat()
    tick = time.monotonic()
    timed_out = False
    with (folder / f"{case}.log").open("w", encoding="utf-8") as log:
        try:
            code = subprocess.run(command, cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT,
                                  timeout=args.timeout, check=False).returncode
        except subprocess.TimeoutExpired:
            code, timed_out = None, True
    output = (folder / f"{case}.log").read_text(encoding="utf-8")
    return {"case": case, "kind": kind, "property": property_name, "command": command,
            "startedAt": start, "seconds": round(time.monotonic() - tick, 3), "exitCode": code,
            "timedOut": timed_out, "passed": judge(case, code, output, timed_out),
            "tlcVersion": next((line for line in output.splitlines() if line.startswith("TLC2")), None),
            "statistics": re.findall(r"^.*states generated.*$", output, re.M),
            "depth": re.findall(r"^The depth.*$", output, re.M),
            "collisionEstimate": re.findall(r"^.*(?:optimistic|actual).*val.*$", output, re.M),
            "log": f"{case}.log"}


def native(args):
    if args.output is None:
        raise ValueError("--native requires --output")
    folder = args.output / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    folder.mkdir(parents=True)
    env = {**os.environ, "LC_ALL": "C", "TERM": "dumb", "NO_COLOR": "1"}
    inputs = sources()
    for source in inputs:
        shutil.copy2(source, folder / source.name)
    metadata = {"sourceHead": args.source_head, "inputSha256": {p.name: sha(p) for p in inputs},
                "jar": args.jar, "jarSha256": sha(Path(args.jar)), "cwd": str(ROOT),
                "javaVersion": subprocess.run(["java", "-version"], capture_output=True, text=True,
                                              check=True, env=env).stderr,
                "heapMiB": 2048,
                "workers": args.workers, "timeoutSeconds": args.timeout,
                "requestedCases": args.cases or list(CASES), "results": []}
    if args.parse_only:
        command = ["java", "-cp", args.jar, "tla2sany.SANY", f"{MODULE}.tla"]
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, env=env, check=False)
        output = result.stdout + result.stderr
        (folder / "sany.log").write_text(output, encoding="utf-8")
        passed = (result.returncode == 0 and f"Semantic processing of module {MODULE}" in output
                  and not re.search(r"(?i)error|aborted", output))
        metadata["parse"] = {"command": command, "exitCode": result.returncode, "passed": passed}
    else:
        for case in metadata["requestedCases"]:
            result = run_case(args, case, folder, env)
            metadata["results"].append(result)
            write_json(folder / "results.json", metadata)
            print(json.dumps(result), flush=True)
            if not result["passed"]:
                break
        passed = (len(metadata["results"]) == len(metadata["requestedCases"])
                  and all(result["passed"] for result in metadata["results"]))
    metadata["passed"] = passed
    write_json(folder / "results.json", metadata)
    print("Evidence: " + str(folder), flush=True)
    return 0 if passed else 1


def main():
    args = arguments()
    try:
        if not args.parse_only:
            for case in args.cases or CASES:
                validate_config(case, (ROOT / f"{case}.cfg").read_text(encoding="utf-8"))
        if os.name == "nt" and not args.native:
            return bridge(args)
        if not args.native:
            # Native callers also execute a copy, never create TLC state files in source.
            with tempfile.TemporaryDirectory(prefix="omne-candidate-cache-") as temporary:
                for source in sources():
                    shutil.copy2(source, temporary)
                return subprocess.run([sys.executable, str(Path(temporary) / "run-models.py"),
                                       "--native", *sys.argv[1:]], check=False).returncode
        return native(args)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Tool failure: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
