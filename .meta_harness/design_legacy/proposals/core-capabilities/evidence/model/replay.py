"""Replay the bounded positive and deliberate negative TLC configurations."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / "spec/catalog.json").exists())
JAVA = os.environ["JAVA_BIN"]
JAR = os.environ["TLA2TOOLS_JAR"]


def run(r):
    ident = r["name"] + "-" + r["mutation"]
    cmd = [JAVA, "-Xmx1g", "-XX:+UseParallelGC", "-cp", JAR, "tlc2.TLC",
           "-noGenerateSpecTE", "-workers", "1", "-metadir",
           "tmp/formal-runs/core-" + ident, "-config", r["config"], r["model"]]
    result = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=120)
    log = HERE / (ident + ".log")
    log.write_text(result.stdout)
    expected = r["expected"]
    if expected is None:
        ok = result.returncode == 0 and "No error has been found" in result.stdout
    elif expected == "IndependentProgress":
        ok = result.returncode == 13 and (
            "Temporal property IndependentProgress was violated" in result.stdout)
    else:
        ok = result.returncode == 12 and (
            "Invariant " + expected + " is violated" in result.stdout)
    return {**r, "command": cmd, "exit_code": result.returncode,
            "matched_expectation": ok,
            "model_sha256": hashlib.sha256((ROOT / r["model"]).read_bytes()).hexdigest(),
            "config_sha256": hashlib.sha256((ROOT / r["config"]).read_bytes()).hexdigest(),
            "log": str(log.relative_to(ROOT))}


with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    results = list(pool.map(run, json.loads((HERE / "run-plan.json").read_text())))
(HERE / "results.json").write_text(json.dumps({
    "java": JAVA, "jar_sha256": hashlib.sha256(Path(JAR).read_bytes()).hexdigest(),
    "runs": results}, indent=2) + "\n")
for result in results:
    print(result["name"], result["mutation"], result["exit_code"], result["matched_expectation"])
raise SystemExit(0 if all(r["matched_expectation"] for r in results) else 1)
