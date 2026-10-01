"""The review family: a role that changes nothing judges one material and returns a report.

One agent run is one episode, keyed by material. It yields one row per seeded
defect (was it reported) and one row for the run as a whole (stayed read-only,
named its criteria page, stayed inside the kind of judgment it was asked for).

On a ``material`` copy the reviewer only reads, and staying read-only is a content hash of the copy.
On a ``checkout`` copy with a delivery commit (implementation review) the reviewer runs the
repository's checks, which leave untracked output behind; there what it may not do is change a tracked
file or move HEAD off the delivery commit.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from . import checkout, workspace
from .claude_host import Episode
from .grading import Verdict
from .suite import Flow, Material

FIRST_PARAGRAPH_LIMIT = 600


def design_review_report(repo: Path, dest: Path, contract: str) -> str:
    """The mechanical report the dispatcher attaches, produced on the copy the role will read."""
    done = subprocess.run(
        [sys.executable, str(repo / ".meta_harness/tooling/src/design_review.py"),
         "--root", str(dest / ".meta_harness/design"), "--contract", contract],
        cwd=str(repo), env=dict(os.environ, PYTHONDONTWRITEBYTECODE="1"), capture_output=True, text=True)
    if done.returncode != 0:
        raise RuntimeError(f"design review report failed on {contract}:\n{done.stdout}{done.stderr}")
    return done.stdout


def brief(flow: Flow, material: Material, dest: Path, *, repo: Path) -> str:
    text = material.brief.read_text(encoding="utf-8").replace("{WORKDIR}", str(dest))
    if flow.attach_design_review:
        report = design_review_report(repo, dest, material.contract)
        text += f"\n## 设计评审报告（派发者在本检出上跑出的原始输出）\n\n```\n{report}```\n"
    return text


def delivery_brief(material: Material, dest: Path, facts: dict[str, str]) -> str:
    """The brief of a review of a delivery: where the copy is, its two commits, the implementer's note."""
    note = material.delivery_note.read_text(encoding="utf-8").strip() if material.delivery_note else ""
    return checkout.fill(material.brief.read_text(encoding="utf-8"), {
        "WORKDIR": str(dest), "BASE": facts["baseline"], "HEAD": facts["head"], "DELIVERY_NOTE": note})


def tracked_intact(dest: Path, delivery: str) -> tuple[int, str]:
    """Whether the reviewer left every tracked file and HEAD as the delivery had them; untracked output is fine."""
    if not (dest / ".git").is_dir():
        return (0, "工作副本不见了")
    changed = [line for line in workspace.git(dest, "status", "--porcelain").splitlines()
               if line.strip() and not line.startswith("??")]
    moved = workspace.head(dest) != delivery
    if not changed and not moved:
        return (1, "受版本管理的文件没有被改动，HEAD 仍是交付提交")
    return (0, "；".join([*(["HEAD 不再是交付提交"] if moved else []),
                         *([f"被改动的受版本管理文件：{'、'.join(changed)}"] if changed else [])]))


def observe_delivery(episode: Episode, dest: Path, delivery: str, *, allowed: list[str]) -> dict[str, tuple[int, str]]:
    """Run-level facts of a review on a checkout; the tools used outside the list are named, not scored."""
    value, why = tracked_intact(dest, delivery)
    outside = sorted({name for name in episode.tool_names if name not in allowed})
    if outside:
        why += f"（放行之外的工具：{'、'.join(outside)}）"
    return {"tracked_intact": (value, why)}


def verify_delivery(flow: Flow, material: Material, *, source: Path, work: Path, tag: str,
                    notes: list[str]) -> list[str]:
    """Build the delivery on a real copy and check the properties the seeds were chosen for.

    What was observed goes to ``notes``; what makes the material unusable is returned.
    """
    problems: list[str] = []
    where = work / f"verify-{flow.id}-{material.id}-{tag}"
    dest = where / "workspace"
    member = dest / str(flow.member())
    checks = flow.checks
    try:
        facts = checkout.build(flow, material, dest, source=source)
        commits = workspace.git(dest, "rev-list", "--count", "HEAD")
        if commits != "2":
            problems.append(f"{material.id}: the copy has {commits} commits, not a baseline and a delivery")
        notes.append(f"{material.id}: {commits} commits, every seed edit landed once, {flow.member()} rebuilt; "
                     f"delivery {workspace.git(dest, 'show', '--stat', '--format=%an <%ae> %s', 'HEAD')}")
        try:
            delivery_brief(material, dest, facts)
        except checkout.BriefError as error:
            problems.append(f"{material.id}: brief - {error}")
        if "member_test" in checks:
            tested = workspace.run(checks["member_test"], member, log=where / "member-test.log")
            if not tested.ok:
                problems.append(f"{material.id}: the member's own tests exit {tested.code} on the delivery; the seeds "
                                f"are meant to get past them:\n{tested.output[-2000:]}")
            summary = [line.strip() for line in tested.output.splitlines() if "Tests" in line or "Test Files" in line]
            notes.append(f"{material.id}: `{' '.join(checks['member_test'])}` exit {tested.code}; {' / '.join(summary)}")
        if "rules" in checks:
            ruled = workspace.run(checks["rules"]["run"], dest, log=where / "rules.log")
            if ruled.ok or checks["rules"]["fails_with"] not in ruled.output:
                problems.append(f"{material.id}: `{' '.join(checks['rules']['run'])}` exits {ruled.code} without "
                                f"reporting {checks['rules']['fails_with']!r}")
            reported = [line.strip() for line in ruled.output.splitlines() if checks["rules"]["fails_with"] in line]
            notes.append(f"{material.id}: `{' '.join(checks['rules']['run'])}` exit {ruled.code}; "
                         f"{' / '.join(reported[:3])}")
        if tracked_intact(dest, facts["head"])[0] != 1:
            problems.append(f"{material.id}: the checks changed tracked files of the delivery: "
                            f"{tracked_intact(dest, facts['head'])[1]}")
    except (workspace.WorkspaceError, OSError) as error:
        problems.append(f"{material.id}: {error}")
    finally:
        shutil.rmtree(where, ignore_errors=True)
    return problems


def observe(flow: Flow, episode: Episode, *, unchanged: bool, allowed: list[str]) -> dict[str, tuple[int, str]]:
    """Run-level facts read off the transcript and the copy; no judgment involved."""
    outside = sorted({name for name in episode.tool_names if name not in allowed})
    read_only = unchanged and not outside
    first = episode.final.strip().split("\n\n", 1)[0][:FIRST_PARAGRAPH_LIMIT]
    names_page = flow.criteria_page in first
    return {
        "read_only": (int(read_only),
                      "工作副本内容哈希不变，轨迹里只有放行的工具" if read_only
                      else f"工作副本{'未变' if unchanged else '被改动'}；放行之外的工具：{outside or '无'}"),
        "names_page": (int(names_page),
                       f"首段{'写明' if names_page else '没有写明'}判据页 {flow.criteria_page}"),
    }


def rows(flow: Flow, material: Material, rep: int, record: dict[str, Any], verdict: Verdict,
         *, brief_text: str) -> list[dict[str, Any]]:
    """Scored rows of one episode, from its record and the grader's verdict."""
    status = "truncated" if record["truncated"] else "ok"
    common = {
        "rep": rep, "status": status, "model": record["model"], "usage": record["usage"],
        "stop_reason": record["stop_reason"], "latency_s": record["wall_seconds"], "tool_calls": record["tool_calls"],
    }
    meta = {"episode": material.id, "flow": flow.id, "grader": verdict.grader, **record["provenance"]}
    out = []
    for seed in material.seeds:
        caught, why = verdict.seeds[seed.id]
        out.append({
            **common, "prompt_id": f"{material.id}.{seed.id}", "prompt": _seed_prompt(material, seed),
            "tags": [material.id, "seed", seed.kind, *material.tags],
            "grade": {} if status != "ok" else {"caught": caught},
            "explanation": {"caught": why}, "meta": {**meta, "unit": "seed"},
        })
    observed = record["observations"]
    run_grade = {metric: value for metric, (value, _) in {**observed, **verdict.run}.items()}
    run_why = {metric: why for metric, (_, why) in {**observed, **verdict.run}.items()}
    out.append({
        **common, "prompt_id": f"{material.id}.run", "prompt": brief_text,
        "tags": [material.id, "run", *material.tags],
        "grade": {} if status != "ok" else run_grade, "explanation": run_why,
        # Spend is counted once per episode, from this row; the seed rows repeat the same usage.
        "cost_usd": record["cost_usd"], "meta": {**meta, "unit": "run"},
    })
    return out


def _seed_prompt(material: Material, seed: Any) -> str:
    lines = [f"待审对象：{material.target}", f"位置：{seed.where}", f"应当被报出的问题：{seed.truth}"]
    op = seed.op or {}
    if op.get("op") == "replace":
        lines += ["", "原文：", op["find"], "", "种入后：", op["replace"]]
    elif op.get("op") == "catalog-add-clause":
        lines += ["", f"种入：在 catalog 对 {op['dependency']['contract_id']} v{op['dependency']['version']} "
                      f"的依赖声明里加上条款 {op['clause']}"]
    elif seed.edits:
        for edit in seed.edits:
            if edit["op"] == "replace":
                lines += ["", f"文件 {edit['file']}，原文：", edit["find"], "", "种入后：", edit["replace"]]
            else:
                lines += ["", f"文件 {edit['file']} 末尾追加：", edit["text"]]
    elif seed.inside:
        lines += ["", f"种在派发材料 {seed.inside} 里"]
    elif seed.quote:
        lines += ["", "材料里本来就有（不是种入的），原文：", seed.quote]
    else:
        lines += ["", "材料里本来就有（不是种入的）"]
    if seed.severity:
        lines.append(f"当时定的严重度：{seed.severity}")
    return "\n".join(lines)
