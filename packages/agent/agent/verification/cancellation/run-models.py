#!/usr/bin/env python3
"""Run cancellation controls serially, with TLC isolated from the checkout."""

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
    "bad-model-fence": ("invariant", "NoDispatchAfterConfirmation"),
    "bad-tool-fence": ("invariant", "NoDispatchAfterConfirmation"),
    "bad-interrupt": ("invariant", "SingleCallIsolation"),
    "bad-content": ("invariant", "RetainContent"),
    "bad-cost": ("invariant", "RetainCosts"),
    "bad-reception": ("temporal", "EventualReception"),
    "bad-finish": ("temporal", "EventualTermination"),
    "valid-mixed": ("positive", None),
    "valid-models": ("positive", None),
    "valid-no-response": ("positive", None),
}


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("cases", nargs="*", choices=tuple(CASES))
    parser.add_argument("--output", type=Path, help="Evidence root (under repository tmp on Windows)")
    parser.add_argument("--timeout", type=int, default=180, help="Seconds per TLC configuration")
    parser.add_argument("--jar", default="/opt/tlaplus/tla2tools.jar")
    parser.add_argument("--distro", default="Ubuntu-24.04")
    parser.add_argument("--parse-only", action="store_true", help="Run SANY, without state exploration")
    parser.add_argument("--native", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--source-head", default="unknown", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if not args.parse_only and not os.environ.get("OMNE_TEST_SLOT_HELD"):
        parser.error("Run through node scripts/with-test-slot.mjs; see README.md")
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


def bridge(args):
    repo = ROOT.parents[4]
    output = (args.output or repo / "tmp/line-session-run/w2/M-CANCEL/runs").resolve()
    if not output.is_relative_to(repo / "tmp"):
        raise ValueError("Evidence must stay inside this checkout's tmp directory")
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
    archive = io.BytesIO()
    with tarfile.open(fileobj=archive, mode="w") as tar:
        for source in [ROOT / "Cancellation.tla", ROOT / "run-models.py", *sorted(ROOT.glob("*.cfg"))]:
            member = tar.gettarinfo(str(source), arcname=source.name)
            member.mtime = 0
            with source.open("rb") as contents:
                tar.addfile(member, contents)
    command = ["python3", "run-models.py", "--native", "--output", linux_path(output),
               "--timeout", str(args.timeout), "--jar", args.jar, "--source-head", head]
    if args.parse_only:
        command.append("--parse-only")
    command.extend(args.cases)
    slot = shlex.quote(os.environ.get("OMNE_TEST_SLOT_HELD", ""))
    script = "\n".join([
        "set -eu", "task_dir=$(mktemp -d /tmp/omne-cancellation.XXXXXXXX)",
        "trap 'rm -rf -- \"$task_dir\"' EXIT", "cd \"$task_dir\"", "tar -xf -",
        f"export OMNE_TEST_SLOT_HELD={slot}",
        "export OMNE_TEST_SLOT_DIR=/mnt/c/Users/ALIENWARE/AppData/Local/Temp/omne-test-slots-ALIENWARE",
        "export PYTHONUTF8=1", "unset UV_DEFAULT_INDEX", shlex.join(command),
    ])
    completed = subprocess.run(["wsl.exe", "-d", args.distro, "--exec", "bash", "-l", "-c", script],
                               input=archive.getvalue(), check=False)
    return completed.returncode


def validate_config(case, config):
    kind, expected = CASES[case]
    if kind != "temporal":
        return
    lines = [line.split("\\*", 1)[0].strip() for line in config.splitlines()]
    declarations = [line for line in lines if re.match(r"PROPERT(?:Y|IES)\b", line)]
    if declarations != [f"PROPERTY {expected}"]:
        raise ValueError(f"{case} requires exactly PROPERTY {expected}")


def judge(case, code, output, timed_out=False):
    kind, property_name = CASES[case]
    if timed_out:
        return False
    if kind == "positive":
        return code == 0 and "Model checking completed. No error has been found." in output
    if kind == "invariant":
        return (code == 12 and f"Invariant {property_name} is violated." in output
                and "The behavior up to this point is:" in output)
    return (code == 13 and "Temporal properties were violated." in output
            and "The following behavior constitutes a counter-example:" in output)


def run_case(args, case, folder, env):
    kind, property_name = CASES[case]
    command = ["java", "-Xmx1024m", "-XX:+UseParallelGC", "-cp", args.jar,
               "tlc2.TLC", "-workers", "1", "-seed", "787", "-fp", "0",
               "-config", f"{case}.cfg", "-metadir", str(ROOT / "states" / case), "Cancellation.tla"]
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
    sources = [ROOT / "Cancellation.tla", ROOT / "run-models.py", *sorted(ROOT.glob("*.cfg"))]
    for source in sources:
        shutil.copy2(source, folder / source.name)
    metadata = {"sourceHead": args.source_head, "inputSha256": {p.name: sha(p) for p in sources},
                "jar": args.jar, "jarSha256": sha(Path(args.jar)), "cwd": str(ROOT),
                "javaVersion": subprocess.run(["java", "-version"], capture_output=True, text=True,
                                              check=True, env=env).stderr,
                "slot": os.environ.get("OMNE_TEST_SLOT_HELD"), "heapMiB": 1024, "workers": 1,
                "timeoutSeconds": args.timeout, "requestedCases": args.cases or list(CASES),
                "results": []}
    if args.parse_only:
        command = ["java", "-cp", args.jar, "tla2sany.SANY", "Cancellation.tla"]
        result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, env=env, check=False)
        output = result.stdout + result.stderr
        (folder / "sany.log").write_text(output, encoding="utf-8")
        passed = (result.returncode == 0 and "Semantic processing of module Cancellation" in output
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
            with tempfile.TemporaryDirectory(prefix="omne-cancellation-") as temporary:
                for source in [ROOT / "Cancellation.tla", ROOT / "run-models.py", *ROOT.glob("*.cfg")]:
                    shutil.copy2(source, temporary)
                return subprocess.run([sys.executable, str(Path(temporary) / "run-models.py"),
                                       "--native", *sys.argv[1:]], check=False).returncode
        return native(args)
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"Tool failure: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
