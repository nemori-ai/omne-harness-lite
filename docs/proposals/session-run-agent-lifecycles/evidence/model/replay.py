"""Replay the bounded positive and deliberate negative TLC configurations for the
session-run-agent-lifecycles composition v1 (Lifecycles.tla) and the Session
Inbound evidence model (Inbound.tla, capability.session v1 SE-12..18)."""
import hashlib
import json
import os
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / "spec/catalog.json").exists())
JAVA = os.environ["JAVA_BIN"]
JAR = os.environ["TLA2TOOLS_JAR"]
WORKERS = os.environ.get("TLC_WORKERS", "4")
MODULE = "spec/compositions/session-run-agent-lifecycles/v1/Lifecycles.tla"


def run(r):
    ident = r["name"] + "-" + r["mutation"]
    cmd = [JAVA, "-Xmx4g", "-XX:+UseParallelGC", "-cp", JAR, "tlc2.TLC",
           "-noGenerateSpecTE", "-workers", WORKERS, "-metadir",
           "tmp/formal-runs/lifecycles-" + ident, "-config", r["config"], r["model"]]
    result = subprocess.run(cmd, cwd=ROOT, text=True, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, timeout=1800)
    log = HERE / (ident + ".log")
    log.write_text("\n".join(l for l in result.stdout.splitlines() if not l.startswith("Progress(")) + "\n")
    expected = r["expected"]
    if expected is None:
        ok = result.returncode == 0 and "No error has been found" in result.stdout
    else:
        ok = result.returncode in (12, 13) and (
            ("Invariant " + expected + " is violated" in result.stdout)
            or ("Temporal property " + expected + " was violated" in result.stdout)
            or ("Action property " + expected + " is violated" in result.stdout))
    stats = [l for l in result.stdout.splitlines() if "states generated" in l and "distinct" in l]
    return {**r, "command": cmd, "exit_code": result.returncode, "matched_expectation": ok,
            "states": stats[-1] if stats else None,
            "model_sha256": hashlib.sha256((ROOT / r["model"]).read_bytes()).hexdigest(),
            "module_sha256": hashlib.sha256((ROOT / r.get("module", MODULE)).read_bytes()).hexdigest(),
            "config_sha256": hashlib.sha256((ROOT / r["config"]).read_bytes()).hexdigest(),
            "log": str(log.relative_to(ROOT))}


results = [run(r) for r in json.loads((HERE / "run-plan.json").read_text())]
(HERE / "results.json").write_text(json.dumps({
    "java": JAVA, "jar_sha256": hashlib.sha256(Path(JAR).read_bytes()).hexdigest(),
    "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "runs": results}, indent=2, ensure_ascii=False) + "\n")
for result in results:
    print(result["name"], result["mutation"], result["exit_code"], result["matched_expectation"], result["states"])
raise SystemExit(0 if all(r["matched_expectation"] for r in results) else 1)
