#!/usr/bin/env python3
"""Run the generation and handoff controls, with TLC evidence for each case."""

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
CASES = {
    "generation": ("Generation", None),
    "bad-generation-check": ("Generation", "RetiredNeverCurrent"),
    "bad-retirement": ("Generation", "RetiredNeverCurrent"),
    "witness-late-answer": ("Generation", "NoLateAnswer"),
    **{f"handoff-{name}": ("Handoff", None) for name in (
        "same", "payload-conflict", "ki-rebind", "h-rebind", "route-rebind",
        "cross-tenant", "independent",
    )},
    "bad-early-reply": ("Handoff", "RestartRetainsReplies"),
    "bad-partial-record": ("Handoff", "AtomicRecord"),
    "bad-ki-rebind": ("Handoff", "UniqueHandoff"),
    "bad-h-rebind": ("Handoff", "UniqueHandoff"),
    "bad-execution-rebind": ("Handoff", "UniqueExecutionRoute"),
    "bad-repeat-admission": ("Handoff", "AtMostOneAdmission"),
    "witness-recovery": ("Handoff", "NoRecoveredResult"),
}


def verdict(log, code, expected, timed_out=False):
    violated = re.findall(r"Invariant (\w+) is violated", log)
    complete = "Model checking completed. No error has been found." in log
    trace = "The behavior up to this point is:" in log
    if expected is None:
        passed = not timed_out and code == 0 and complete and not violated
    else:
        passed = not timed_out and code == 12 and violated == [expected] and trace
    return passed, violated


def self_test():
    assert set(CASES) == {path.stem for path in ROOT.glob("*.cfg")}
    good = "Model checking completed. No error has been found."
    bad = "Invariant AtomicRecord is violated.\nThe behavior up to this point is:"
    assert verdict(good, 0, None)[0]
    assert verdict(bad, 12, "AtomicRecord")[0]
    assert not verdict("", 0, None)[0]
    assert not verdict(good, 1, None)[0]
    assert not verdict(bad, 1, "AtomicRecord")[0]
    assert not verdict(bad, 12, "UniqueHandoff")[0]
    assert not verdict("Parse error", 12, "AtomicRecord")[0]
    assert not verdict(bad, 12, "AtomicRecord", timed_out=True)[0]
    assert not verdict("Invariant AtomicRecord is violated.", 12, "AtomicRecord")[0]
    print("Runner verdict checks passed.")


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_files():
    return sorted([*ROOT.glob("*.tla"), *ROOT.glob("*.cfg"), ROOT / "run-models.py"])


def run_case(args, case, folder, model_dir, env):
    module, expected = CASES[case]
    if args.syntax_only:
        command = ["java", "-cp", args.jar, "tla2sany.SANY", f"{module}.tla"]
    else:
        command = ["java", f"-Xmx{args.heap_mib}m", "-XX:+UseParallelGC", "-cp", args.jar,
                   "tlc2.TLC", "-workers", "1", "-seed", "502", "-fp", "0",
                   "-metadir", str(folder / "states"), "-config", f"{case}.cfg", f"{module}.tla"]
    started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    started = time.monotonic()
    timed_out = False
    with (folder / f"{case}.log").open("w", encoding="utf-8") as stream:
        try:
            code = subprocess.run(command, cwd=model_dir, env=env, stdout=stream,
                                  stderr=subprocess.STDOUT, timeout=args.timeout).returncode
        except subprocess.TimeoutExpired:
            code = None
            timed_out = True
    log = (folder / f"{case}.log").read_text(encoding="utf-8")
    passed, violated = verdict(log, code, expected, timed_out)
    if args.syntax_only:
        passed = code == 0 and "Semantic processing of module " + module in log and not re.search(
            r"\*\*\* Errors|Fatal errors|Parse Error|Semantic errors", log, re.I)
    return {
        "case": case, "kind": "syntax" if args.syntax_only else (
            "reachability" if case.startswith("witness-") else "negative" if expected else "positive"),
        "command": command, "exitCode": code, "timedOut": timed_out,
        "startedAt": started_at, "endedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "seconds": round(time.monotonic() - started, 3), "expectedInvariant": expected,
        "violatedInvariants": violated, "passed": passed,
        "tlcVersion": next((line for line in log.splitlines() if line.startswith("TLC2")), None),
        "statistics": re.findall(r"^.*states generated.*$", log, re.M),
        "depth": re.findall(r"^The depth.*$", log, re.M), "log": f"{case}.log",
    }


def run_native(args, output):
    env = {**os.environ, "LC_ALL": "C", "TERM": "dumb", "NO_COLOR": "1"}
    metadata = {
        "modelVersion": 1,
        "startedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceHead": args.source_head, "sourceHashes": {p.name: sha256(p) for p in source_files()},
        "jar": args.jar, "jarSha256": sha256(Path(args.jar)),
        "javaVersion": subprocess.run(["java", "-version"], env=env, capture_output=True,
                                      text=True, check=True).stderr,
        "workers": 1, "heapMiB": args.heap_mib, "timeoutSeconds": args.timeout,
        "slot": os.environ.get("OMNE_TEST_SLOT_HELD"), "requestedCases": args.cases, "results": [],
    }
    output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory(prefix="omne-generation-tlc-") as work:
        model_dir = Path(work)
        for path in source_files():
            shutil.copy2(path, model_dir / path.name)
            shutil.copy2(path, output / path.name)
        for case in args.cases:
            with tempfile.TemporaryDirectory(prefix="states-", dir=work) as state_dir:
                result = run_case(args, case, Path(state_dir), model_dir, env)
                shutil.copy2(Path(state_dir) / f"{case}.log", output / f"{case}.log")
            metadata["results"].append(result)
            (output / "results.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result), flush=True)
    return 0 if all(result["passed"] for result in metadata["results"]) else 1


def wsl_command(args, command, **kwargs):
    return subprocess.run(["wsl.exe", "-d", args.distribution, "--exec", "bash", "-l", "-c", command], **kwargs)


def run_wsl(args, output):
    remote = wsl_command(args, "mktemp -d /tmp/omne-generation-XXXXXXXX", capture_output=True,
                         text=True, check=True).stdout.strip()
    if not re.fullmatch(r"/tmp/omne-generation-[A-Za-z0-9]{8}", remote):
        raise RuntimeError(f"Unexpected WSL workspace: {remote!r}")
    try:
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode="w") as bundle:
            for path in source_files():
                bundle.add(path, arcname=path.name)
        wsl_command(args, "tar -xf - -C " + shlex.quote(remote), input=archive.getvalue(), check=True)
        command = ["python3", remote + "/run-models.py", "--backend", "native", "--jar", args.jar,
                   "--output", remote + "/results", "--timeout", str(args.timeout),
                   "--heap-mib", str(args.heap_mib), "--source-head", args.source_head]
        for case in args.cases:
            command.extend(["--case", case])
        if args.syntax_only:
            command.append("--syntax-only")
        env = " ".join([
            "export OMNE_TEST_SLOT_DIR=/mnt/c/Users/ALIENWARE/AppData/Local/Temp/omne-test-slots-ALIENWARE;",
            "export OMNE_TEST_SLOT_HELD=" + shlex.quote(os.environ.get("OMNE_TEST_SLOT_HELD", "")) + ";",
            "export PYTHONUTF8=1; unset UV_DEFAULT_INDEX;",
        ])
        code = wsl_command(args, env + " " + shlex.join(command)).returncode
        bundle = wsl_command(args, "tar -cf - -C " + shlex.quote(remote + "/results") + " .",
                             capture_output=True, check=True)
        output.mkdir(parents=True, exist_ok=False)
        with tarfile.open(fileobj=io.BytesIO(bundle.stdout), mode="r:") as archive:
            archive.extractall(output, filter="data")
        return code
    finally:
        wsl_command(args, "rm -rf -- " + shlex.quote(remote), check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", action="append", choices=CASES, dest="cases")
    parser.add_argument("--backend", choices=("wsl", "native"), default="wsl" if os.name == "nt" else "native")
    parser.add_argument("--distribution", default="Ubuntu-24.04")
    parser.add_argument("--jar", default="/opt/tlaplus/tla2tools.jar")
    parser.add_argument("--output", type=Path, help="New directory for logs, source snapshots, and results.json")
    parser.add_argument("--timeout", type=int, default=180, help="Seconds per case")
    parser.add_argument("--heap-mib", type=int, default=1024)
    parser.add_argument("--syntax-only", action="store_true", help="Run SANY only, without state exploration")
    parser.add_argument("--self-test", action="store_true", help="Check result classification without running Java")
    parser.add_argument("--source-head", default=None, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.timeout < 1 or args.heap_mib < 128:
        parser.error("timeout must be positive and heap-mib must be at least 128")
    if not args.syntax_only and not os.environ.get("OMNE_TEST_SLOT_HELD"):
        parser.error("Run through scripts/with-test-slot.mjs after receiving the TLC window")
    args.cases = args.cases or list(CASES)
    if args.source_head is None:
        args.source_head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    output = (args.output or ROOT.parents[4] / "tmp/line-session-run/w2/M-GENERATION" / stamp).resolve()
    if output.exists():
        parser.error("output directory must not already exist")
    code = run_wsl(args, output) if args.backend == "wsl" else run_native(args, output)
    print("Evidence: " + str(output), flush=True)
    return code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, subprocess.SubprocessError, tarfile.TarError, RuntimeError) as error:
        print(f"Model runner failed: {error}", file=sys.stderr)
        sys.exit(2)
