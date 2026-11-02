"""Run the bounded same-log protocol models and verify the expected TLC outcomes."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

CASES = {
    "positive-race": None,
    "positive-head": None,
    "positive-boundaries": None,
    "positive-executions": None,
    "positive-recovery": None,
    "negative-split-agent": "AtomicVisibility",
    "negative-split-session": "AtomicVisibility",
    "negative-forget-operation": "AtMostOnce",
    "negative-unknown-recommit": "RecoveryStable",
    "negative-replay-sequence": "NoRepeatedEffects",
    "negative-skip-head": "LegalCommit",
    "negative-skip-tenant": "LegalCommit",
    "negative-skip-view": "LegalCommit",
    "negative-skip-root": "LegalCommit",
    "witness-recovery": "NoRecoveryWitness",
    "witness-late-commit": "NoLateCommitWitness",
    "witness-changed": "NoChangedWitness",
    "witness-replayed-fact": "NoReplayWitness",
    "witness-distinct-head": "NoDistinctHeadWitness",
}
SOURCE = Path(__file__).resolve().parent
STATS = re.compile(
    r"([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue"
)
VIOLATION = re.compile(r"Error: Invariant (\w+) is violated\.")
COMPLETE = "Model checking completed. No error has been found."
REMOTE = """
import os, pathlib, subprocess, sys, tarfile, tempfile
with tempfile.TemporaryDirectory(prefix="omne-log-commit-") as work:
    with tarfile.open(fileobj=sys.stdin.buffer, mode="r|") as archive:
        archive.extractall(work, filter="data")
    os.chdir(work)
    result = subprocess.run([sys.executable, "run-models.py", "--backend", "native",
                             "--emit-json", *sys.argv[1:]], check=False)
    sys.exit(result.returncode)
"""


def classify(exit_code: int | None, output: str, expected: str | None) -> dict:
    matches = STATS.findall(output)
    stats = None
    if matches:
        generated, distinct, queued = (int(value.replace(",", "")) for value in matches[-1])
        stats = {"generated": generated, "distinct": distinct, "queued": queued}
    violation = VIOLATION.search(output)
    actual = violation.group(1) if violation else None
    complete = COMPLETE in output
    if expected is None:
        passed = exit_code == 0 and complete and stats is not None and stats["queued"] == 0
    else:
        passed = (
            exit_code == 12
            and actual == expected
            and "Error: The behavior up to this point is:" in output
            and stats is not None
            and not complete
        )
    return {"passed": passed, "expected_violation": expected, "actual_violation": actual,
            "states": stats, "exit_code": exit_code}


def self_test() -> None:
    stats = "12 states generated, 7 distinct states found, 0 states left on queue."
    good = COMPLETE + "\n" + stats
    bad = ("Error: Invariant AtMostOnce is violated.\n"
           "Error: The behavior up to this point is:\n" + stats)
    assert classify(0, good, None)["passed"]
    assert classify(12, bad, "AtMostOnce")["passed"]
    assert not classify(0, "finished", None)["passed"]
    assert not classify(12, bad, "LegalCommit")["passed"]
    assert not classify(1, bad, "AtMostOnce")["passed"]
    assert not classify(12, "Error: Parsing or semantic analysis failed.", "AtMostOnce")["passed"]
    assert not classify(None, bad, "AtMostOnce")["passed"]
    assert not classify(0, COMPLETE + "\n12 states generated, 7 distinct states found, 1 states left on queue.", None)["passed"]
    print("8 result-classification checks passed")


def model_files() -> list[Path]:
    return sorted([SOURCE / "LogCommit.tla", *SOURCE.glob("cfg/*.cfg")])


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def invoke(command: list[str], cwd: Path, timeout: int) -> tuple[int | None, str, float]:
    started = time.monotonic()
    env = {**os.environ, "NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C.UTF-8"}
    try:
        result = subprocess.run(command, cwd=cwd, env=env, capture_output=True,
                                text=True, encoding="utf-8", errors="replace", timeout=timeout)
        return result.returncode, result.stdout + result.stderr, time.monotonic() - started
    except subprocess.TimeoutExpired as error:
        chunks = [chunk.decode("utf-8", errors="replace") if isinstance(chunk, bytes) else chunk or ""
                  for chunk in (error.stdout, error.stderr)]
        return None, "".join(chunks) + "\nRUNNER TIMEOUT\n", time.monotonic() - started


def execute_native(args: argparse.Namespace, selected: list[str]) -> dict:
    java = ["java", f"-Xmx{args.heap_mb}m", "-XX:+UseSerialGC", "-cp", args.jar]
    version_code, version, _ = invoke(["java", "-version"], SOURCE, 30)
    if version_code != 0:
        raise RuntimeError("java -version failed: " + version)
    rows = []
    with tempfile.TemporaryDirectory(prefix="omne-log-commit-native-") as directory:
        work = Path(directory)
        (work / "cfg").mkdir()
        for path in model_files():
            shutil.copyfile(path, work / path.relative_to(SOURCE))
        if args.parse_only:
            command = [*java, "tla2sany.SANY", "LogCommit.tla"]
            code, output, elapsed = invoke(command, work, args.timeout)
            passed = code == 0 and "Semantic processing of module LogCommit" in output
            passed = passed and not re.search(r"(?i)error|fatal", output)
            rows.append({"case": "parse", "passed": passed, "exit_code": code,
                         "seconds": elapsed, "command": command, "output": output})
        else:
            for name in selected:
                command = [*java, "tlc2.TLC", "-workers", str(args.workers), "-fp", "0",
                           "-seed", "1", "-cleanup", "-config", f"cfg/{name}.cfg",
                           "LogCommit.tla"]
                code, output, elapsed = invoke(command, work, args.timeout)
                rows.append({"case": name, **classify(code, output, CASES[name]),
                             "seconds": elapsed, "command": command, "output": output})
    return {"schema": 1, "completed_at": datetime.now(timezone.utc).isoformat(),
            "platform": sys.platform, "python": sys.version,
            "java": version.strip(), "jar": args.jar, "jar_sha256": sha256(Path(args.jar)),
            "workers": args.workers, "heap_mb": args.heap_mb, "timeout_seconds": args.timeout,
            "sources": {str(path.relative_to(SOURCE)).replace("\\", "/"): sha256(path)
                        for path in model_files()},
            "runner_sha256": sha256(SOURCE / "run-models.py"),
            "results": rows, "passed": all(row["passed"] for row in rows)}


def execute_wsl(args: argparse.Namespace, selected: list[str]) -> dict:
    archive_bytes = io.BytesIO()
    with tarfile.open(fileobj=archive_bytes, mode="w") as archive:
        for path in [*model_files(), SOURCE / "run-models.py"]:
            archive.add(path, arcname=path.relative_to(SOURCE).as_posix())
    forwarded = ["--jar", args.jar, "--workers", str(args.workers),
                 "--heap-mb", str(args.heap_mb), "--timeout", str(args.timeout)]
    if args.parse_only:
        forwarded.append("--parse-only")
    for name in selected:
        forwarded.extend(["--case", name])
    # Positional arguments avoid shell interpolation of paths, case names, and Python source.
    command = ["wsl.exe", "-d", args.distro, "--exec", "bash", "-l", "-c",
               'export OMNE_TEST_SLOT_DIR=/mnt/c/Users/ALIENWARE/AppData/Local/Temp/omne-test-slots-ALIENWARE; exec python3 -c "$1" "${@:2}"',
               "log-commit", REMOTE, *forwarded]
    result = subprocess.run(command, input=archive_bytes.getvalue(), capture_output=True,
                            timeout=(len(selected) + 1) * args.timeout + 120, check=False)
    output = result.stdout.decode("utf-8", errors="replace")
    try:
        summary = json.loads(output)
    except json.JSONDecodeError as error:
        raise RuntimeError("WSL did not return result JSON:\n" + output +
                           result.stderr.decode("utf-8", errors="replace")) from error
    expected_exit = 0 if summary["passed"] else 1
    if result.returncode != expected_exit:
        raise RuntimeError(f"WSL exited {result.returncode}, expected {expected_exit}")
    summary["transport"] = {"distro": args.distro, "exit_code": result.returncode,
                            "staging": "independent WSL /tmp directory, removed on exit"}
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend", choices=["wsl", "native"],
                        default="wsl" if os.name == "nt" else "native")
    parser.add_argument("--distro", default="Ubuntu-24.04")
    parser.add_argument("--jar", default="/opt/tlaplus/tla2tools.jar")
    parser.add_argument("--workers", type=int, default=1)
    parser.add_argument("--heap-mb", type=int, default=1024)
    parser.add_argument("--timeout", type=int, default=120,
                        help="maximum seconds for each TLC invocation")
    parser.add_argument("--case", action="append", choices=sorted(CASES))
    parser.add_argument("--output", type=Path,
                        help="write summary.json and raw logs to this evidence directory")
    parser.add_argument("--parse-only", action="store_true", help="run SANY without state exploration")
    parser.add_argument("--self-test", action="store_true", help="check result classification without Java")
    parser.add_argument("--emit-json", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.workers < 1 or args.heap_mb < 128 or args.timeout < 1:
        parser.error("workers and timeout must be positive, heap-mb must be at least 128")
    selected = args.case or sorted(CASES)
    summary = execute_wsl(args, selected) if args.backend == "wsl" else execute_native(args, selected)
    if args.emit_json:
        print(json.dumps(summary, ensure_ascii=False))
    else:
        if args.output:
            args.output.mkdir(parents=True, exist_ok=True)
            for row in summary["results"]:
                (args.output / f'{row["case"]}.log').write_text(row["output"], encoding="utf-8")
            (args.output / "summary.json").write_text(
                json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        for row in summary["results"]:
            print(f'{row["case"]}: {"PASS" if row["passed"] else "FAIL"} '
                  f'exit={row["exit_code"]} states={row.get("states")} seconds={row["seconds"]:.3f}')
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        print(f"Model runner failed: {error}", file=sys.stderr)
        raise SystemExit(2)
