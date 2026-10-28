#!/usr/bin/env python3
"""Run bounded TLC checks and retain exact inputs and raw output."""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent
EXPECTED_JAR_SHA256 = "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88"
CASES = (
    ("Transfer", "transfer-positive", None),
    ("Transfer", "transfer-early-activation", "ActivationRequiresDurability"),
    ("Transfer", "transfer-second-destination", "UniqueCustody"),
    ("Transfer", "transfer-retry-truncation", "GrowthPreserved"),
    ("Transfer", "transfer-source-resume", "SourceNeverResumes"),
    ("Intent", "intent-fresh", None),
    ("Intent", "intent-imported", None),
    ("Intent", "intent-repost", "AtMostOnePost"),
    ("Intent", "intent-early-post", "DurableIntentBeforePost"),
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verdict(output, returncode, expected, timed_out=False):
    violations = re.findall(r"Invariant ([A-Za-z0-9_]+) is violated\.", output)
    counts = re.findall(
        r"([\d,]+) states generated, ([\d,]+) distinct states found, ([\d,]+) states left on queue\.",
        output,
    )
    metrics = None
    if counts:
        metrics = dict(zip(("generated", "distinct", "queued"),
                           (int(v.replace(",", "")) for v in counts[-1])))
    depth = re.findall(r"The depth of the complete state graph search is (\d+)\.", output)
    if metrics is not None and depth:
        metrics["depth"] = int(depth[-1])
    finished = "Finished in " in output
    if timed_out:
        passed = False
    elif expected is None:
        passed = (returncode == 0 and finished and not violations and metrics is not None
                  and metrics["generated"] > 0 and metrics["distinct"] > 0
                  and metrics["queued"] == 0
                  and "Model checking completed. No error has been found." in output)
    else:
        passed = (returncode == 12 and finished and violations == [expected]
                  and "The behavior up to this point is:" in output
                  and re.search(r"^(?:State )?1: <Initial predicate>", output, re.MULTILINE) is not None
                  and metrics is not None and metrics["distinct"] > 0)
    return {"passed": bool(passed), "expected_invariant": expected,
            "observed_invariants": violations, "metrics": metrics,
            "timed_out": timed_out, "returncode": returncode}


def action_coverage(output):
    return {name: {"distinct_successors": int(distinct), "generated_successors": int(generated)}
            for name, distinct, generated in re.findall(
                r"<([A-Za-z0-9_]+) line [^\n]+ of module [A-Za-z0-9_]+(?: \([0-9 ]+\))?>: (\d+):(\d+)", output)}


def source_manifest(env):
    repo = Path(subprocess.check_output(
        ["git", "-C", str(ROOT), "rev-parse", "--show-toplevel"],
        env=env, text=True, timeout=10).strip())
    paths = [
        "tools/dev-flow/src/delivery/SPEC.md",
        "tools/dev-flow/src/delivery/collaboration-producer-state.ts",
        "tools/dev-flow/src/delivery/collaboration-bootstrap.ts",
        "tools/dev-flow/src/delivery/collaboration-installation.ts",
        "tools/dev-flow/src/delivery/line-state-journal.ts",
        "tools/dev-flow/src/integration/prepare-delivery-facts.ts",
    ]
    return {"repository": str(repo),
            "head": subprocess.check_output(["git", "-C", str(repo), "rev-parse", "HEAD"],
                                            env=env, text=True, timeout=10).strip(),
            "sha256": {name: sha256(repo / name) for name in paths},
            "scope": "Records the evaluated source version; does not prove implementation conformance"}


def parser_selftest():
    good = ("Model checking completed. No error has been found.\n"
            "12 states generated, 7 distinct states found, 0 states left on queue.\n"
            "The depth of the complete state graph search is 5.\nFinished in 1s")
    negative = ("Error: Invariant NamedProperty is violated.\n"
                "The behavior up to this point is:\nState 1: <Initial predicate>\n"
                "12 states generated, 7 distinct states found, 2 states left on queue.\n"
                "Finished in 1s")
    checks = {
        "positive_completion": verdict(good, 0, None)["passed"],
        "negative_named_failure": verdict(negative, 12, "NamedProperty")["passed"],
        "reject_exit_only": not verdict("", 0, None)["passed"],
        "reject_incomplete_search": not verdict(good.replace("0 states left", "2 states left"), 0, None)["passed"],
        "reject_wrong_invariant": not verdict(negative, 12, "OtherProperty")["passed"],
        "reject_parse_error": not verdict("Parse error.\nFinished in 1s", 1, "NamedProperty")["passed"],
        "reject_missing_trace": not verdict(negative.replace("State 1:", ""), 12, "NamedProperty")["passed"],
        "tool_mode_trace": verdict(negative.replace("State 1:", "1:"), 12, "NamedProperty")["passed"],
        "reject_wrong_exit": not verdict(negative, 1, "NamedProperty")["passed"],
        "reject_positive_timeout": not verdict(good, 0, None, True)["passed"],
        "reject_negative_timeout": not verdict(negative, 12, "NamedProperty", True)["passed"],
        "coverage_with_let_coordinates": action_coverage(
            "<Post line 1, col 1 to line 1, col 4 of module Intent (2 3 4 5)>: 0:7")
            == {"Post": {"distinct_successors": 0, "generated_successors": 7}},
        "coverage_without_let": action_coverage(
            "<RetryCompleted line 1, col 1 to line 1, col 14 of module Transfer>: 0:9")
            == {"RetryCompleted": {"distinct_successors": 0, "generated_successors": 9}},
    }
    assert all(checks.values()), checks
    return checks


def run_case(model, case, expected, out, jar, java, timeout, env):
    folder = out / case
    folder.mkdir()
    temporary = folder / "tmp"
    temporary.mkdir()
    cmd = [java, "-Djava.io.tmpdir=" + str(temporary), "-Xmx512m", "-XX:+UseParallelGC", "-cp", str(jar), "tlc2.TLC",
           "-tool", "-workers", "1", "-seed", "1", "-fp", "0",
           "-coverage", "1", "-metadir", str(folder / "states"),
           "-config", str(out / "inputs" / (case + ".cfg")),
           str(out / "inputs" / (model + ".tla"))]
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    tick = time.monotonic()
    proc = subprocess.Popen(cmd, cwd=folder, env={**env, "TMPDIR": str(temporary)}, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(proc.pid, signal.SIGKILL)
        stdout, stderr = proc.communicate()
    except BaseException:
        os.killpg(proc.pid, signal.SIGKILL)
        proc.communicate()
        raise
    result = verdict(stdout + "\n" + stderr, proc.returncode, expected, timed_out)
    coverage = action_coverage(stdout)
    required = (() if expected is not None else
                ("CopyLink", "CopyDir", "RetireLink", "RetireDir", "ActiveLink", "ActiveDir",
                 "Bootstrap", "RetryCompleted", "AppendGeneration", "Crash", "Restart", "ProbeRetiredSource")
                if model == "Transfer" else
                ("CreateExclusive", "CreateConflict", "SyncFile", "SyncDirectory", "Post",
                 "VerifyFailedPredecessor", "Observe", "Crash", "Restart"))
    result["action_coverage"] = coverage
    result["required_actions"] = list(required)
    result["action_coverage_passed"] = all(
        coverage.get(name, {}).get("generated_successors", 0) > 0 for name in required)
    result["passed"] = result["passed"] and result["action_coverage_passed"]
    result.update({"model": model, "case": case, "command": cmd,
                   "started_utc": started, "elapsed_seconds": round(time.monotonic() - tick, 3),
                   "timeout_seconds": timeout, "pid": proc.pid, "child_reaped": proc.poll() is not None})
    (folder / "stdout.log").write_text(stdout)
    (folder / "stderr.log").write_text(stderr)
    (folder / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="New task tmp directory, absolute or relative to the calling directory")
    parser.add_argument("--timeout", type=float, default=55)
    parser.add_argument("--case", action="append", choices=[c[1] for c in CASES])
    args = parser.parse_args()
    if not 0 < args.timeout <= 60:
        parser.error("timeout must be in (0, 60]")
    out = Path(args.output).resolve()
    out.mkdir(parents=True, exist_ok=False)
    env = {key: value for key, value in os.environ.items()
           if key not in {"JAVA_TOOL_OPTIONS", "_JAVA_OPTIONS", "JDK_JAVA_OPTIONS", "CLASSPATH", "FORCE_COLOR"}
           and not key.startswith("TURBO_")}
    env.update({"NO_COLOR": "1", "TERM": "dumb", "LC_ALL": "C", "LANG": "C", "TZ": "UTC"})
    jar_setting = os.environ.get("TLA2TOOLS_JAR")
    if not jar_setting:
        raise RuntimeError("TLA2TOOLS_JAR is required; use the project formal-tool environment")
    jar = Path(jar_setting).resolve()
    java = shutil.which(os.environ.get("JAVA_BIN", "java"))
    if java is None or not jar.is_file():
        raise RuntimeError("Java or TLA2TOOLS_JAR is unavailable")
    actual_hash = sha256(jar)
    if actual_hash != EXPECTED_JAR_SHA256:
        raise RuntimeError(f"TLC JAR hash mismatch: {actual_hash}")
    java_version = subprocess.run([java, "-version"], env=env, capture_output=True,
                                  text=True, timeout=10, check=True)
    (out / "java-version.log").write_text(java_version.stdout + java_version.stderr)
    inputs = out / "inputs"
    inputs.mkdir()
    files = [ROOT / "Transfer.tla", ROOT / "Intent.tla", Path(__file__).resolve()]
    files.extend(ROOT.glob("*.cfg"))
    if (ROOT / "README.md").is_file():
        files.append(ROOT / "README.md")
    for file in files:
        shutil.copyfile(file, inputs / file.name)
    selected = [c for c in CASES if args.case is None or c[1] in args.case]
    source_before = source_manifest(env)
    (out / "source-manifest.json").write_text(json.dumps(source_before, indent=2) + "\n")
    summary = {"scope": "Finite safety model checks; no implementation refinement or physical-power-loss proof",
               "tool": {"java": java, "jar": str(jar), "jar_sha256": actual_hash},
               "input_sha256": {file.name: sha256(inputs / file.name) for file in files},
               "source_manifest_sha256": sha256(out / "source-manifest.json"),
               "environment": {k: env[k] for k in ("NO_COLOR", "TERM", "LC_ALL", "LANG", "TZ")},
               "parser_selftest": parser_selftest(), "results": []}
    for model, case, expected in selected:
        result = run_case(model, case, expected, out, jar, java, args.timeout, env)
        summary["results"].append(result)
        (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        print(json.dumps({k: result[k] for k in ("case", "passed", "metrics", "elapsed_seconds", "observed_invariants", "timed_out")}), flush=True)
        if not result["passed"]:
            return 1
    source_after = source_manifest(env)
    (out / "source-manifest-after.json").write_text(json.dumps(source_after, indent=2) + "\n")
    summary["source_unchanged"] = source_before == source_after
    summary["passed"] = (summary["source_unchanged"]
                         and all(result["passed"] for result in summary["results"]))
    summary["all_children_reaped"] = all(result["child_reaped"] for result in summary["results"])
    (out / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
