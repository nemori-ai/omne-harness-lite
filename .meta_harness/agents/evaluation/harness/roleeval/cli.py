"""Command line of the role evaluations.

  verify SUITE                     build every material's copy, seed it, check the seeds took; no model is called
  inputs SUITE                     every case in full, as markdown, for the cases sign-off
  run SUITE --variant V            run the role on every (material, rep) not yet recorded; this is the paid step
  import-run SUITE --variant V …   take over one run an earlier experiment recorded, as an episode
  grade SUITE --variant V …        turn recorded episodes into scored rows
  summary SUITE                    scores with intervals, failures by class, spend
  report SUITE --builder PATH      build report.html with the report builder of the claude-api skill

Episodes and results go to <main checkout>/tmp/role-evals/<flow>/ unless --out says otherwise.
"""
from __future__ import annotations

import argparse
import dataclasses
import hashlib
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from . import claude_host, grading, judge, review, stats, workspace
from .store import VariantStore
from .suite import Flow, Material, SuiteError, load

HARNESS = Path(__file__).resolve().parent
META = HARNESS.parents[3]
REPO = META.parent
WORK_ENV = "ROLEEVAL_WORK"
BUILDER_ENV = "ROLEEVAL_REPORT_BUILDER"
KNOWN_VERDICTS = {"real": "成立", "artefact": "评估手段带来的", "unverified": "未核实", "out-of-kind": "属于另一种判断",
                  "rejected": "当时被驳回"}


class Refused(RuntimeError):
    """The command would produce a result that could not be trusted, so it does nothing."""


def main_checkout(repo: Path) -> Path:
    common = Path(workspace.git(repo, "rev-parse", "--git-common-dir"))
    return (common if common.is_absolute() else repo / common).resolve().parent


def flow_dir(flow: Flow, out: Path | None) -> Path:
    return out if out else main_checkout(REPO) / "tmp" / "role-evals" / flow.id


def work_root(arg: Path | None) -> Path:
    root = arg or Path(os.environ.get(WORK_ENV) or Path.home() / ".cache" / "role-evals" / "work")
    root.mkdir(parents=True, exist_ok=True)
    inside = subprocess.run(["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"],
                            capture_output=True, text=True)
    if inside.returncode == 0:
        # A copy inside a checkout would inherit that checkout's instruction files through its parent directories.
        raise Refused(f"work root {root} is inside a git work tree; choose one outside with --work or {WORK_ENV}")
    return root


def episode_dir(out: Path, variant: str, material: str, rep: int) -> Path:
    return out / variant / "episodes" / f"{material}_rep{rep}"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def prepare(flow: Flow, material: Material, dest: Path) -> None:
    settings = flow.workspace
    workspace.build(REPO, dest, base=flow.base(material), material_paths=settings["material_paths"],
                    material_excludes=settings["material_excludes"], subject_paths=settings["subject_paths"])
    workspace.apply(dest, material.ops(), suite=flow.root)
    workspace.commit(dest)


def guarded_paths(flow: Flow) -> list[str]:
    """What has to be committed for the recorded commit to say what ran."""
    relative = [str(path.relative_to(REPO)) for path in (flow.root, HARNESS, META / "agents" / "roles")]
    return [*flow.workspace["subject_paths"], *relative]


# --- verify -------------------------------------------------------------------------------------------------

def verify(flow: Flow, work: Path) -> list[str]:
    """Problems that would make a run meaningless; empty when the suite is runnable."""
    problems = []
    for material in flow.materials:
        base = flow.base(material)
        if not workspace.is_ancestor(REPO, base):
            problems.append(f"{material.id}: base {base} is not an ancestor of HEAD; pin a commit that stays reachable")
            continue
        dest = work / f"verify-{flow.id}-{material.id}-{os.getpid()}"
        try:
            workspace.build(REPO, dest, base=base, material_paths=flow.workspace["material_paths"],
                            material_excludes=flow.workspace["material_excludes"],
                            subject_paths=flow.workspace["subject_paths"])
            clean = workspace.tree_hash(dest)
            workspace.apply(dest, material.ops(), suite=flow.root)
            if material.ops() and workspace.tree_hash(dest) == clean:
                problems.append(f"{material.id}: preparing the material changed nothing")
            if "{WORKDIR}" not in material.brief.read_text(encoding="utf-8"):
                problems.append(f"{material.id}: brief does not say where the copy is ({{WORKDIR}})")
            for seed in material.seeds:
                texts = [(dest / path).read_text(encoding="utf-8") for path in seed.files if (dest / path).is_file()]
                for fragment in seed.fragments():
                    if not any(fragment in text for text in texts):
                        problems.append(f"{material.id}.{seed.id}: the material does not contain {fragment[:50]!r}")
            if flow.attach_design_review:
                report = review.design_review_report(REPO, dest, material.contract)
                found = report.split("## 未能判定")[0]
                for seed in material.seeds:
                    if seed.check and f"[{seed.check}]" not in found:
                        problems.append(f"{material.id}.{seed.id}: the design review report does not raise "
                                        f"[{seed.check}] on the seeded copy")
        except (workspace.WorkspaceError, RuntimeError) as error:
            problems.append(f"{material.id}: {error}")
        finally:
            shutil.rmtree(dest, ignore_errors=True)
    return problems


# --- inputs -------------------------------------------------------------------------------------------------

def fenced(text: str) -> str:
    longest, run = 2, 0
    for char in text:
        run = run + 1 if char == "`" else 0
        longest = max(longest, run)
    fence = "`" * (longest + 1)
    return f"{fence}\n{text.rstrip()}\n{fence}"


def inputs(flow: Flow) -> str:
    seeds = sum(len(material.seeds) for material in flow.materials)
    host = flow.host["claude-code"]
    lines = [
        f"# 用例一览：{flow.id}（第 {flow.version} 版）", "",
        f"角色 `{flow.role}` 做「{flow.judgment}」判断；{host['model']}，{host['effort']}；"
        f"每份材料跑 {flow.reps} 次。", "",
        f"共 {len(flow.materials)} 份材料、{seeds} 处应当被报出的问题。", "",
        "| 材料 | 标签 | 应报出 | 已知的原有问题 | 取自提交 | 待审对象 |", "|---|---|---|---|---|---|",
    ]
    for material in flow.materials:
        lines.append(f"| `{material.id}` | {'、'.join(material.tags) or '—'} | {len(material.seeds)} | "
                     f"{len(material.known_issues)} | `{flow.base(material)[:9]}` | {material.target} |")
    for material in flow.materials:
        lines += ["", f"## `{material.id}`", "", f"待审对象：{material.target}"]
        if material.source:
            lines += ["", f"来源：{material.source}"]
        lines += ["", "### 简报（逐字）", "", fenced(material.brief.read_text(encoding="utf-8"))]
        if flow.attach_design_review:
            lines += ["", "运行时在简报末尾另附设计评审报告在该副本上的原始输出。"]
        if material.prepare:
            lines += ["", "### 送审之前对材料做的处理", ""]
            for op in material.prepare:
                lines.append(f"- `{json.dumps(op, ensure_ascii=False)}`")
                if op["op"] == "copy":
                    lines += ["", f"  `{op['from']}` 全文：", "",
                              fenced((flow.root / op["from"]).read_text(encoding="utf-8")), ""]
        lines += ["", f"### 应当被报出的问题（{len(material.seeds)} 处）" if material.seeds
                  else "### 应当被报出的问题：无（对照材料，不种入）"]
        for seed in material.seeds:
            lines += ["", f"#### `{material.id}.{seed.id}`　{seed.kind}　{seed.where}", "",
                      f"应当被报出的问题：{seed.truth}"]
            op = seed.op or {}
            if op.get("op") == "replace":
                lines += ["", f"文件 `{op['file']}`，原文：", "", fenced(op["find"]), "", "种入后：", "",
                          fenced(op["replace"])]
            elif op:
                lines += ["", f"种入操作：`{json.dumps(op, ensure_ascii=False)}`"]
            else:
                lines += ["", "材料里本来就有（不是种入的）。"]
                if seed.quote:
                    lines += ["", "原文：", "", fenced(seed.quote)]
            if seed.severity:
                lines += ["", f"当时定的严重度：{seed.severity}"]
        if material.known_issues:
            lines += ["", "### 已知的原有问题（不计抓到率；报出来不算新的阻断）", ""]
            lines += [f"- `{issue['id']}`（{KNOWN_VERDICTS.get(issue.get('verdict'), '未分类')}）{issue['what']}"
                      for issue in material.known_issues]
    return "\n".join(lines) + "\n"


# --- run ----------------------------------------------------------------------------------------------------

def compile_definition(flow: Flow, out: Path, variant: str) -> Path:
    """Compile the role from its source at this commit and freeze it as the ``--agents`` file of the variant."""
    staging = out / variant / "agents" / "staging"
    shutil.rmtree(staging, ignore_errors=True)
    done = subprocess.run(
        [sys.executable, str(META / "tooling/src/compile_agents.py"), "--source", str(META / "agents"),
         "--output", str(staging), "--host", "claude-code"],
        env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), capture_output=True, text=True)
    if done.returncode != 0:
        raise Refused(f"could not compile the roles:\n{done.stdout}{done.stderr}")
    host = flow.host["claude-code"]
    entry = claude_host.definition(staging / ".claude" / "agents" / f"{flow.role}.md",
                                   model=host["model"], tools=host["allowed"])
    frozen = out / variant / "agents" / f"{flow.role}.json"
    text = json.dumps(entry, ensure_ascii=False, indent=1)
    if frozen.exists() and frozen.read_text(encoding="utf-8") != text:
        raise Refused(f"{frozen} was frozen from a different role definition; a variant holds one definition - "
                      f"use a new variant directory")
    frozen.write_text(text, encoding="utf-8")
    shutil.rmtree(staging, ignore_errors=True)
    return frozen


def run_one(flow: Flow, material: Material, rep: int, *, variant: str, out: Path, work: Path, agents: Path,
            provenance: dict[str, Any], keep: bool, store: VariantStore, lock: threading.Lock) -> str:
    host = flow.host["claude-code"]
    evidence = episode_dir(out, variant, material.id, rep)
    attempt = work / f"{flow.id}-{variant}-{material.id}-rep{rep}-{int(time.time())}"
    dest = attempt / "workspace"
    try:
        prepare(flow, material, dest)
        before = workspace.tree_hash(dest)
        brief_text = review.brief(flow, material, dest, repo=REPO)
        command = claude_host.command(agents, flow.role, model=host["model"], effort=host["effort"],
                                      allowed=host["allowed"], disallowed=host["disallowed"],
                                      permission_mode=host["permission_mode"], budget_usd=host["budget_usd"])
        episode = claude_host.run(command, cwd=dest, brief=brief_text, wall_seconds=host["wall_seconds"],
                                  evidence=evidence)
        unchanged = workspace.tree_hash(dest) == before
    except (workspace.WorkspaceError, RuntimeError, OSError) as error:
        with lock:
            store.record_error(material.id, rep, "harness", str(error), evidence=str(evidence))
        return f"{material.id} rep {rep}: harness error - {error}"
    finally:
        if not keep:
            shutil.rmtree(attempt, ignore_errors=True)
    failure = episode.failure(host["model"])
    if failure:
        # The attempt keeps its evidence under a name that frees the (material, rep) slot for a resume.
        parked = evidence.with_name(f"{evidence.name}.failed-{int(time.time())}")
        evidence.rename(parked)
        with lock:
            store.record_error(material.id, rep, failure[0], failure[1], model=episode.model,
                               usage=episode.usage or None, cost_usd=episode.cost_usd, evidence=str(parked))
        return f"{material.id} rep {rep}: {failure[0]} - {failure[1]}"
    (evidence / "final.md").write_text(episode.final, encoding="utf-8")
    record = episode_record(flow, material, rep, variant, episode, unchanged=unchanged, provenance={
        **provenance, "agent_sha": sha256(agents), "brief_sha": sha256(evidence / "brief.md"),
        "trajectory_sha": sha256(evidence / "trajectory.jsonl")})
    (evidence / "episode.json").write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    return f"{material.id} rep {rep}: recorded, {episode.wall_seconds:.0f}s, ${episode.cost_usd}"


def episode_record(flow: Flow, material: Material, rep: int, variant: str, episode: claude_host.Episode, *,
                   unchanged: bool, provenance: dict[str, Any]) -> dict[str, Any]:
    host = flow.host["claude-code"]
    observed = review.observe(flow, episode, unchanged=unchanged, allowed=host["allowed"])
    return {
        "flow": flow.id, "material": material.id, "rep": rep, "variant": variant, "role": flow.role,
        "requested_model": host["model"], "effort": host["effort"], "model": episode.model,
        "models_observed": episode.models_observed, "usage": episode.usage, "cost_usd": episode.cost_usd,
        "stop_reason": episode.stop_reason, "truncated": episode.truncated(), "tool_calls": episode.tool_calls,
        "tool_names": episode.tool_names, "wall_seconds": episode.wall_seconds, "api_seconds": episode.api_seconds,
        "observations": {metric: list(value) for metric, value in observed.items()},
        "provenance": {"suite_version": flow.version, "suite_sha": flow.digest(), "base": flow.base(material),
                       **provenance},
    }


def run(flow: Flow, *, variant: str, out: Path, work: Path, reps: int | None, only: list[str] | None,
        parallel: int, allow_dirty: bool, keep: bool, overrides: dict[str, str] | None = None) -> int:
    if overrides:
        # A variant that changes the model or the effort says so on the command line; the suite keeps the default.
        flow = dataclasses.replace(flow, host={**flow.host, "claude-code": {**flow.host["claude-code"], **overrides}})
    unsigned = flow.unsigned()
    if unsigned:
        raise Refused(f"{flow.id} v{flow.version} has no sign-off on: {', '.join(unsigned)}. "
                      f"A paid run waits for both; record them under 'signoffs' in flow.json.")
    changes = workspace.dirty(REPO, guarded_paths(flow))
    if changes and not allow_dirty:
        raise Refused("uncommitted changes in what is under test or in the suite:\n  " + "\n  ".join(changes))
    problems = verify(flow, work)
    if problems:
        raise Refused("the suite does not verify:\n  " + "\n  ".join(problems))
    store = VariantStore(out, variant)
    out.mkdir(parents=True, exist_ok=True)
    (out / "_state.json").write_text(json.dumps(flow.state(), ensure_ascii=False, indent=1), encoding="utf-8")
    agents = compile_definition(flow, out, variant)
    provenance = {"harness_commit": workspace.head(REPO), "dirty": bool(changes)}
    materials = [flow.material(name) for name in only] if only else list(flow.materials)
    todo = [(material, rep) for material in materials for rep in range(reps or flow.reps)
            if not (episode_dir(out, variant, material.id, rep) / "episode.json").exists()]
    print(f"{flow.id} {variant}: {len(todo)} episodes to run")
    lock = threading.Lock()
    with ThreadPoolExecutor(max_workers=parallel) as pool:
        futures = [pool.submit(run_one, flow, material, rep, variant=variant, out=out, work=work, agents=agents,
                               provenance=provenance, keep=keep, store=store, lock=lock) for material, rep in todo]
        for future in futures:
            print(future.result(), flush=True)
    return 0


# --- import -------------------------------------------------------------------------------------------------

def import_run(flow: Flow, *, variant: str, out: Path, material: Material, rep: int, source: Path) -> None:
    """Take over a run an earlier experiment recorded. Nothing is run; the old record says what it was."""
    evidence = episode_dir(out, variant, material.id, rep)
    if (evidence / "episode.json").exists():
        raise Refused(f"{evidence} is already recorded")
    old = json.loads((source / "run.json").read_text(encoding="utf-8"))
    evidence.mkdir(parents=True, exist_ok=True)
    for name in ("brief.md", "trajectory.jsonl"):
        shutil.copyfile(source / name, evidence / name)
    episode = claude_host.parse(evidence / "trajectory.jsonl", brief=(evidence / "brief.md").read_text("utf-8"))
    episode.wall_seconds = old["wall_ms"] / 1000
    episode.timed_out = old["timed_out"]
    failure = episode.failure(old["model_id"])
    if failure:
        raise Refused(f"{source} is not a scorable run: {failure}")
    (evidence / "final.md").write_text(episode.final, encoding="utf-8")
    record = episode_record(flow, material, rep, variant, episode, unchanged=old["workspace_unchanged"], provenance={
        "harness_commit": "imported", "dirty": False, "imported_from": str(source),
        "agent_sha": old["agents_definition_sha256"], "brief_sha": sha256(evidence / "brief.md"),
        "trajectory_sha": sha256(evidence / "trajectory.jsonl")})
    record["requested_model"], record["effort"] = old["model_id"], old["effort"]
    (evidence / "episode.json").write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
    out.mkdir(parents=True, exist_ok=True)
    (out / "_state.json").write_text(json.dumps(flow.state(), ensure_ascii=False, indent=1), encoding="utf-8")


# --- grade --------------------------------------------------------------------------------------------------

def grade(flow: Flow, *, variant: str, out: Path, labels: Path | None = None, judge_model: str | None = None,
          judge_effort: str = "high", work: Path | None = None) -> int:
    """Score every recorded episode that has no rows yet, from a person's labels or with the model judge."""
    if (labels is None) == (judge_model is None):
        raise Refused("grade with exactly one of --labels or --judge-model")
    store = VariantStore(out, variant)
    done = store.done()
    graded = 0
    for evidence in sorted((out / variant / "episodes").glob("*/episode.json")):
        record = json.loads(evidence.read_text(encoding="utf-8"))
        material, rep = flow.material(record["material"]), record["rep"]
        if (material.id, rep) in done:
            continue
        brief_text = (evidence.parent / "brief.md").read_text(encoding="utf-8")
        extra: dict[str, Any] = {}
        try:
            if labels is not None:
                verdict = grading.from_labels(labels, material, rep)
            else:
                verdict, results = judge.judge(
                    flow, material, (evidence.parent / "final.md").read_text(encoding="utf-8"), model=judge_model,
                    effort=judge_effort, cwd=work, evidence=evidence.parent / "judge.json")
                extra = judge.spend(results)
        except grading.GraderError as error:
            failed = judge.spend(getattr(error, "results", []))
            store.record_error(material.id, rep, "grader", str(error), model=failed["judge_model"],
                               usage=failed["judge_usage"], cost_usd=failed["judge_cost_usd"],
                               evidence=str(evidence.parent))
            print(f"{material.id} rep {rep}: not graded - {error}")
            continue
        record["provenance"]["evidence"] = str(evidence.parent.relative_to(out))
        turns = claude_host.parse(evidence.parent / "trajectory.jsonl", brief=brief_text).turns
        rows = review.rows(flow, material, rep, record, verdict, brief_text=brief_text)
        rows[-1].update(extra)
        store.record_episode(rows, turns)
        graded += 1
    print(f"{flow.id} {variant}: graded {graded} episodes")
    return 0


# --- summary ------------------------------------------------------------------------------------------------

def summary(flow: Flow, out: Path) -> str:
    variants = sorted((path.name for path in out.iterdir() if (path / "results.jsonl").is_file()),
                      key=lambda name: (name != "baseline", int(name[1:]) if name[1:].isdigit() else 0))
    if not variants:
        return f"{flow.id}: nothing recorded under {out}\n"
    lines = [f"{flow.id} (suite v{flow.version}) - {out}"]
    reference = VariantStore(out, variants[0]).rows()
    for variant in variants:
        store = VariantStore(out, variant)
        rows, errors = store.rows(), store.error_rows()
        runs = [row for row in rows if row["meta"].get("unit") == "run"]
        truncated = sum(1 for row in runs if row["status"] != "ok")
        by_class: dict[str, int] = {}
        for error in errors:
            by_class[error["failure_class"]] = by_class.get(error["failure_class"], 0) + 1
        # Role spend comes from every recorded episode, graded or not, plus the attempts that failed;
        # judge spend from the scored rows plus the grading attempts that failed.
        episodes = [json.loads(path.read_text(encoding="utf-8"))
                    for path in sorted((out / variant / "episodes").glob("*/episode.json"))]
        role_spend = (sum(episode.get("cost_usd") or 0 for episode in episodes)
                      + sum(error.get("cost_usd") or 0 for error in errors if error["failure_class"] != "grader"))
        judge_spend = (sum(row.get("judge_cost_usd") or 0 for row in runs)
                       + sum(error.get("cost_usd") or 0 for error in errors if error["failure_class"] == "grader"))
        models = sorted({row["model"] for row in rows})
        lines += ["", f"{variant}: {len(episodes)} episodes recorded, {len(runs)} scored, {truncated} truncated, "
                      f"{len(errors)} failed attempts {by_class or ''} - role ${role_spend:.2f}, "
                      f"judge ${judge_spend:.2f} - {', '.join(models)}"]
        for metric in flow.metrics:
            binary = metric["kind"] == "binary"
            score = stats.score(rows, metric["id"], binary=binary)
            if score is None:
                lines.append(f"  {metric['id']:<15} not measured")
                continue
            if binary:
                shown = f"{score.mean:6.1%}  [{score.lo:.1%}, {score.hi:.1%}]"
            elif score.cases < 2:
                shown = f"{score.mean:6.2f}  [no interval from one case]"
            else:
                shown = f"{score.mean:6.2f}  [{score.lo:.2f}, {score.hi:.2f}]"
            line = f"  {metric['id']:<15} {shown}  over {score.cases} cases, {score.observations} observations"
            if variant != variants[0]:
                delta = stats.paired_delta(reference, rows, metric["id"])
                if delta:
                    line += (f"  | vs {variants[0]}: {delta.mean:+.3f} [{delta.lo:+.3f}, {delta.hi:+.3f}] "
                             f"{'clears noise' if delta.significant else 'within noise'} ({delta.cases} paired)")
            lines.append(line)
    primary = next((metric for metric in flow.metrics if metric["kind"] == "binary"), flow.metrics[0])
    cases = len(stats.case_means(reference, primary["id"]))
    lines += ["", f"noise floor on {primary['id']}: about ±{stats.noise_floor(cases):.0%} with {cases} cases; "
                  f"a smaller change cannot be told from run-to-run variation",
              "seeds of one material are judged on the same report, so they are not independent: "
              "the intervals above are narrower than the truth when materials are few"]
    return "\n".join(lines) + "\n"


# --- entry --------------------------------------------------------------------------------------------------

def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(prog="roleeval", description=__doc__,
                                   formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = root.add_subparsers(dest="command", required=True)

    def add(name: str) -> argparse.ArgumentParser:
        command = commands.add_parser(name)
        command.add_argument("suite", type=Path, help="suite directory, e.g. .meta_harness/agents/evaluation/suites/<flow>")
        command.add_argument("--out", type=Path, help="flow directory for episodes and results")
        return command

    add("verify").add_argument("--work", type=Path)
    add("inputs").add_argument("--write", type=Path, help="write the markdown here instead of printing it")
    running = add("run")
    running.add_argument("--variant", required=True)
    running.add_argument("--work", type=Path)
    running.add_argument("--reps", type=int)
    running.add_argument("--model", help="run this variant on another model than the suite's default")
    running.add_argument("--effort", help="run this variant at another effort than the suite's default")
    running.add_argument("--material", action="append")
    running.add_argument("--parallel", type=int, default=1)
    running.add_argument("--allow-dirty", action="store_true")
    running.add_argument("--keep-workspaces", action="store_true")
    importing = add("import-run")
    importing.add_argument("--variant", required=True)
    importing.add_argument("--material", required=True)
    importing.add_argument("--rep", type=int, required=True)
    importing.add_argument("--from", dest="source", type=Path, required=True)
    grading_ = add("grade")
    grading_.add_argument("--variant", required=True)
    grading_.add_argument("--labels", type=Path, help="verdicts a person wrote down")
    grading_.add_argument("--judge-model", help="grade with the model judge on this model; these calls are paid")
    grading_.add_argument("--judge-effort", default="high")
    grading_.add_argument("--work", type=Path)
    add("summary")
    add("report").add_argument("--builder", type=Path)
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        flow = load(args.suite.resolve())
        out = flow_dir(flow, args.out.resolve() if args.out else None)
        if args.command == "verify":
            problems = verify(flow, work_root(args.work))
            print("\n".join(problems) if problems else f"{flow.id}: {len(flow.materials)} materials verify")
            return 1 if problems else 0
        if args.command == "inputs":
            text = inputs(flow)
            if args.write:
                args.write.parent.mkdir(parents=True, exist_ok=True)
                args.write.write_text(text, encoding="utf-8")
            else:
                print(text, end="")
            return 0
        if args.command == "run":
            return run(flow, variant=args.variant, out=out, work=work_root(args.work), reps=args.reps,
                       only=args.material, parallel=args.parallel, allow_dirty=args.allow_dirty,
                       keep=args.keep_workspaces,
                       overrides={key: value for key, value in (("model", args.model), ("effort", args.effort)) if value})
        if args.command == "import-run":
            import_run(flow, variant=args.variant, out=out, material=flow.material(args.material), rep=args.rep,
                       source=args.source.resolve())
            return 0
        if args.command == "grade":
            if args.judge_model and "grading" in flow.unsigned():
                raise Refused(f"{flow.id} v{flow.version} has no sign-off on the grading method; "
                              f"the model judge waits for it")
            return grade(flow, variant=args.variant, out=out, labels=args.labels.resolve() if args.labels else None,
                         judge_model=args.judge_model, judge_effort=args.judge_effort,
                         work=work_root(args.work) if args.judge_model else None)
        if args.command == "summary":
            print(summary(flow, out), end="")
            return 0
        builder = args.builder or (Path(os.environ[BUILDER_ENV]) if os.environ.get(BUILDER_ENV) else None)
        if not builder or not builder.is_file():
            raise Refused(f"give the report builder of the claude-api skill with --builder or {BUILDER_ENV} "
                          f"(<skill directory>/shared/evals/report/build-report-lite.mjs); "
                          f"'summary' prints the same scores without it")
        return subprocess.run(["node", str(builder), str(out)]).returncode
    except (Refused, SuiteError) as error:
        print(f"roleeval: {error}", file=sys.stderr)
        return 2
