#!/usr/bin/env python3
"""Run an authorized Cursor probe and retain native receipts without grading model prose."""
from __future__ import annotations

import argparse
import json
import os
import signal
import subprocess
from pathlib import Path

from compile_agents import deliver
from cursor_projection import json_artifact
from projection import Artifact
from git_environment import repository_env


def observer() -> dict[Path, Artifact]:
    hooks = {}
    for event in ("preToolUse", "subagentStart", "subagentStop", "stop"):
        hooks[event] = [{"command": f'node "${{CURSOR_PLUGIN_ROOT}}/receipt.mjs" {event}'}]
    return {
        Path(".cursor-plugin/plugin.json"): json_artifact({"name": "omne-probe-observer", "version": "0.1.0", "hooks": "./hooks.json"}),
        Path("hooks.json"): json_artifact({"version": 1, "hooks": hooks}),
        Path("receipt.mjs"): Artifact(Path(__file__).with_name("cursor_receipt.mjs").read_bytes(), 0o644),
    }


def summarize(output: Path) -> dict:
    receipts = output / "hook-receipts.jsonl"
    records = [json.loads(line) for line in receipts.read_text(encoding="utf-8").splitlines()] if receipts.exists() else []
    starts = [record["payload"] for record in records if record["event"] == "subagentStart"]
    stops = [record["payload"] for record in records if record["event"] in {"subagentStop", "stop"}]
    return {"native_receipts": len(records), "subagent_start": starts, "stop": stops,
            "limits": "Selected subagent_model is native routing evidence, not proof of backend fallback or role quality. Read stream-json tool events for actual skill/reference reads and Task invocation."}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True, help="Fresh task evidence directory")
    parser.add_argument("--agent", default="agent")
    parser.add_argument("--model", required=True, help="Exact model from the target host catalog")
    parser.add_argument("--prompt-file", type=Path, required=True)
    parser.add_argument("--plugin-root", type=Path, help="Use plugin mode only when the same assets are not active in project view")
    parser.add_argument("--timeout", type=int, required=True, help="Process timeout in seconds")
    parser.add_argument("--run", action="store_true", help="Execute a real model request; omitted prepares the command only")
    args = parser.parse_args(argv)
    workspace, output = args.workspace.resolve(), args.output.absolute()
    if not workspace.is_dir() or args.timeout <= 0:
        parser.error("workspace must exist and timeout must be positive")
    if output.exists():
        parser.error("output must be a fresh directory")
    if args.plugin_root and (workspace / ".cursor/agents").exists():
        parser.error("plugin and project views must not expose the same assets simultaneously")
    prompt = args.prompt_file.read_text(encoding="utf-8")
    deliver(observer(), output / "observer")
    command = [args.agent, "--workspace", str(workspace), "--trust", "-p", "--output-format", "stream-json",
               "--model", args.model, "--plugin-dir", str(output / "observer")]
    if args.plugin_root:
        command += ["--plugin-dir", str(args.plugin_root.resolve())]
    command.append(prompt)
    source_root = Path(__file__).resolve().parents[3]
    metadata = {"command": command, "workspace": str(workspace), "requested_model": args.model,
                "source_revision": subprocess.check_output(["git", "-C", str(source_root), "rev-parse", "HEAD"], text=True, encoding="utf-8", env=repository_env(os.environ)).strip(),
                "source_dirty": bool(subprocess.check_output(["git", "-C", str(source_root), "status", "--porcelain"], text=True, encoding="utf-8", env=repository_env(os.environ))),
                "run": args.run}
    (output / "invocation.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    if not args.run:
        print(f"Prepared {output / 'invocation.json'}; no model request executed.")
        return 0
    env = {**repository_env(os.environ), "OMNE_CURSOR_PROBE_OUTPUT": str(output), "OMNE_METRICS_HOME": str(output / "loop")}
    version = subprocess.run([args.agent, "--version"], capture_output=True, text=True, timeout=args.timeout, env=env)
    (output / "host-version.txt").write_text(version.stdout + version.stderr, encoding="utf-8")
    try:
        with (output / "stdout.jsonl").open("w") as stdout, (output / "stderr.txt").open("w") as stderr:
            process = subprocess.Popen(command, env=env, cwd=workspace, stdout=stdout, stderr=stderr,
                                       start_new_session=True)
            try:
                metadata["exit_code"] = process.wait(timeout=args.timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise
    except subprocess.TimeoutExpired:
        metadata["timed_out"] = True
        metadata["exit_code"] = 124
    (output / "result.json").write_text(json.dumps({**metadata, **summarize(output)}, indent=2) + "\n", encoding="utf-8")
    print(f"Recorded native evidence in {output}; acceptance requires independent assertions.")
    return metadata["exit_code"]


if __name__ == "__main__":
    raise SystemExit(main())
