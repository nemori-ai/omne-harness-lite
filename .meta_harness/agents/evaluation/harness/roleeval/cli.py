"""Command line of the role evaluations.

Nothing here starts a model. A run of the role, and an answer of the judge, is a subagent that a
main session dispatches. The commands come in pairs around that dispatch: one writes what to hand
to the subagent, the other takes in the transcript the host kept of it
(``<session directory>/subagents/agent-<id>.jsonl``).

  verify SUITE                                    build every material's copy, seed it, check the seeds took;
                                                  for a program-judged flow, show the judgment tells known good from bad
  inputs SUITE                                    every case in full, as markdown, for the cases sign-off
  prepare SUITE --variant V --material M          build the copy and the brief for one run of the role
  record SUITE --variant V --material M --transcript T --dispatch MODE
                                                  take in that run: check the copy, the model, where it reached;
                                                  a program-judged flow is scored here, before the copy goes
  judge-brief SUITE --variant V --material M      write the judge's brief for a recorded run; print the prompt that points at it
  judge-record SUITE --variant V --material M --transcript T
                                                  check the judge's answer against the report; score the run
  grade SUITE --variant V --labels FILE           score recorded runs from verdicts a person wrote down
  calibrate-brief SUITE [--case ID]               write the judge's briefs for the calibration reports
  calibrate-record SUITE --case ID --transcript T check that answer and store it
  calibrate SUITE --judge-model M                 compare what is stored for that judge with the person's verdicts
  import-run SUITE --variant V …                  take over one run an earlier experiment recorded
  summary SUITE                                   scores with intervals, failures by class
  report SUITE                                    build report.html with the report builder kept beside this package

Episodes and results go to <main checkout>/tmp/role-evals/<flow>/ unless --out says otherwise.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from . import acceptance, calibration, checkout, claude_host, grading, implement, judge, review, stats, workspace, write_tests
from .store import VariantStore
from .suite import Flow, Material, SuiteError, load

# The families a program judges when a run is recorded; each module has prepare, verify, judge, scored and rows.
PROGRAM_JUDGED = {"implement": implement, "acceptance": acceptance, "write-tests": write_tests}

HARNESS = Path(__file__).resolve().parent
META = HARNESS.parents[3]
REPO = META.parent
WORK_ENV = "ROLEEVAL_WORK"
BUILDER = HARNESS.parent / "report" / "build-report-lite.mjs"
KNOWN_VERDICTS = {"real": "成立", "artefact": "评估手段带来的", "unverified": "未核实", "out-of-kind": "属于另一种判断",
                  "rejected": "当时被驳回"}
DISPATCH = ("registered", "inline")
# What a run must not reach: the truth lists, the calibration verdicts, earlier results.
OFF_LIMITS = ("evaluation/suites/", "calibration/cases.json", "tmp/role-evals")
ALIASES = {"claude-opus-5-5": "opus", "claude-fable-5-1": "fable", "claude-sonnet-5-5": "sonnet"}
INLINE = """你这一次担任的角色，完整定义在文件 {role} 里。开始之前先把它一次读完，把它当作你的系统指令照办。
你只能使用这几样工具：{tools}。

下面是派发给你的任务。

{brief}"""
RETRY = 3


def _squash(text: str) -> str:
    return re.sub(r"\s+", "", text)


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


def build_copy(flow: Flow, material: Material, dest: Path) -> None:
    settings = flow.workspace
    workspace.build(REPO, dest, base=flow.base(material), material_paths=flow.material_paths(material),
                    material_excludes=settings["material_excludes"], subject_paths=settings["subject_paths"])
    workspace.apply(dest, material.ops(), suite=flow.root)
    workspace.commit(dest)


def build_checkout(flow: Flow, material: Material, dest: Path, source: Path) -> dict[str, str]:
    """A checkout copy made into the material by its family; returns the commits and hashes the run refers to."""
    family = PROGRAM_JUDGED.get(flow.family)
    return checkout.build(flow, material, dest, source=source,
                          before_baseline=(lambda copy: family.prepare(flow, material, copy)) if family else None)


def checkout_brief(flow: Flow, material: Material, dest: Path, rep: int, facts: dict[str, str]) -> str:
    if flow.family in ("implement", "write-tests"):
        return checkout.framed_brief(flow, material, workdir=str(dest), rep=rep)
    if flow.family == "acceptance":
        return acceptance.brief(flow, material, workdir=str(dest), rep=rep)
    return review.delivery_brief(material, dest, facts)


def guarded_paths(flow: Flow) -> list[str]:
    """What has to be committed for the recorded commit to say what ran."""
    relative = [str(path.relative_to(REPO)) for path in (flow.root, HARNESS, META / "agents" / "roles")]
    return [*flow.subject_paths(), *relative]


# --- verify -------------------------------------------------------------------------------------------------

def verify(flow: Flow, work: Path, only: list[str] | None = None, notes: list[str] | None = None) -> list[str]:
    """Problems that would make a run meaningless; empty when the suite is runnable.

    For a checkout flow, what the checks observed on the real copies is added to ``notes``.
    """
    if flow.kind == "checkout":
        return verify_checkout(flow, work, only, [] if notes is None else notes)
    problems = []
    for material in flow.materials:
        if only and material.id not in only:
            continue
        base = flow.base(material)
        if not workspace.is_ancestor(REPO, base):
            problems.append(f"{material.id}: base {base} is not an ancestor of HEAD; pin a commit that stays reachable")
            continue
        dest = work / f"verify-{flow.id}-{material.id}-{os.getpid()}"
        try:
            workspace.build(REPO, dest, base=base, material_paths=flow.material_paths(material),
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


def verify_checkout(flow: Flow, work: Path, only: list[str] | None, notes: list[str]) -> list[str]:
    """On real copies: the material builds, its seeds land, and a program judgment tells known good from bad."""
    family = PROGRAM_JUDGED[flow.family].verify if flow.family in PROGRAM_JUDGED else review.verify_delivery
    problems = []
    for material in flow.materials:
        if only and material.id not in only:
            continue
        base = flow.base(material)
        if not workspace.is_ancestor(REPO, base):
            problems.append(f"{material.id}: base {base} is not an ancestor of HEAD; pin a commit that stays reachable")
            continue
        try:
            source = checkout.template(flow, material, repo=REPO, work=work)
        except workspace.WorkspaceError as error:
            problems.append(f"{material.id}: {error}")
            continue
        notes.append(f"{material.id}: template {source}")
        problems += family(flow, material, source=source, work=work, tag=str(os.getpid()), notes=notes)
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
    if flow.family == "implement":
        return inputs_implement(flow)
    if flow.family == "acceptance":
        return inputs_acceptance(flow)
    if flow.family == "write-tests":
        return inputs_write_tests(flow)
    seeds =sum(len(material.seeds) for material in flow.materials)
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
        if material.delivery_note:
            lines += ["", "运行时 `{BASE}` 换成副本里基线提交的哈希、`{HEAD}` 换成交付提交的哈希，"
                          "`{DELIVERY_NOTE}` 换成下面这份交付说明的全文。", "",
                      f"### 交付说明（{material.delivery_note.name}，逐字）", "",
                      fenced(material.delivery_note.read_text(encoding="utf-8"))]
        if flow.kind == "checkout":
            lines += ["", f"副本：提交 `{flow.base(material)}` 的整仓检出，去掉 "
                          f"{'、'.join(f'`{path}`' for path in flow.workspace['excludes'])}，装好依赖并构建；"
                          f"先提交基线，再把下面的种入作为一个交付提交（作者 `{flow.workspace['delivery']['author']}`，"
                          f"标题 `{flow.workspace['delivery']['subject']}`），然后在 `{flow.member()}` 里重新构建。"]
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
            elif seed.edits:
                for edit in seed.edits:
                    if edit["op"] == "replace":
                        lines += ["", f"文件 `{edit['file']}`，原文：", "", fenced(edit["find"]), "", "种入后：", "",
                                  fenced(edit["replace"])]
                    else:
                        lines += ["", f"文件 `{edit['file']}` 末尾追加：", "", fenced(edit["text"])]
            elif seed.inside:
                lines += ["", f"种在派发材料 `{seed.inside}` 里（见上面的全文），不改副本里的文件。"]
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


SHOWN = ("WORKDIR", "RUN_ID")      # placeholders a cases page leaves for the run to fill


def _checkout_header(flow: Flow, what: str) -> list[str]:
    host = flow.host["claude-code"]
    excludes = "、".join(f"`{path}`" for path in flow.workspace["excludes"])
    setup = "；".join("`" + " ".join(command) + "`" for command in flow.workspace["setup"])
    return [f"# 用例一览：{flow.id}（第 {flow.version} 版）", "",
            f"角色 `{flow.role}` {what}；{host['model']}，{host['effort']}；放行的工具 {'、'.join(host['allowed'])}；"
            f"每份材料跑 {flow.reps} 次。判定由程序在收录运行时做，没有判官。", "",
            f"副本：钉住的提交的整仓检出，去掉 {excludes}，依次跑 {setup}。"
            f"简报里 `{{WORKDIR}}` 换成副本路径，`{{RUN_ID}}` 换成「材料 id 小写-r次数」。"]


def inputs_implement(flow: Flow) -> str:
    lines = _checkout_header(flow, "在一份装好依赖的检出里补完一个模块")
    lines += ["", "| 材料 | 取自提交 | 桩文件 | 隐藏测试 | 写入范围 | 目标测试 |", "|---|---|---|---|---|---|"]
    for material in flow.materials:
        task = material.task or {}
        lines.append(f"| `{material.id}` | `{flow.base(material)[:9]}` | {len(implement.stub_files(flow, material))} | "
                     f"{len(task['hidden_tests'])} | {len(task['allowed_write'])} 项 | {len(task['target_tests'])} 条 |")
    for material in flow.materials:
        task = material.task or {}
        lines += ["", f"## `{material.id}`", "", f"任务：{material.target}", "",
                  "### 简报（任务简报填进框架之后的样子，逐字）", "",
                  fenced(checkout.framed_brief(flow, material, workdir="{WORKDIR}", rep=0, keep=SHOWN)), "",
                  "### 送审之前对副本做的处理", "",
                  f"- 删掉成员的构建产物 `{flow.oracle['member']}/dist/`",
                  *[f"- 删掉隐藏测试 `{path}`" for path in task["hidden_tests"]],
                  *[f"- 用桩 `{task['stub']}/{path}` 盖掉 `{path}`" for path in implement.stub_files(flow, material)],
                  "", "### 写入范围", "", *[f"- `{entry}`" for entry in task["allowed_write"]],
                  "", f"### 目标测试（桩在位时失败的 {len(task['target_tests'])} 条）", "",
                  *[f"- {name}" for name in task["target_tests"]]]
    return "\n".join(lines) + "\n"


def inputs_acceptance(flow: Flow) -> str:
    lines = _checkout_header(flow, "按给定的验收标准验一份构建好的交付")
    lines += ["", f"标准：{'、'.join(flow.criteria)}。真值脚本 `{flow.oracle['ground_truth']}`。", "",
              "| 材料 | 取自提交 | 缺陷 | 期望判决 | 应 fail 的标准 | 判 pass 或 fail 都算对 |", "|---|---|---|---|---|---|"]
    for material in flow.materials:
        expected = material.expected or {}
        verdict = (" 或 ".join(expected["verdict"]) if "verdict" in expected
                   else "不是 " + " 或 ".join(expected["verdict_not"]))
        lines.append(f"| `{material.id}` | `{flow.base(material)[:9]}` | {len(material.defects)} | {verdict} | "
                     f"{'、'.join(expected['failing_criteria']) or '无'} | {'、'.join(expected.get('either', ())) or '—'} |")
    for material in flow.materials:
        lines += ["", f"## `{material.id}`", "", f"材料：{material.target}", "", "### 简报（逐字）", "",
                  fenced(acceptance.brief(flow, material, workdir="{WORKDIR}", rep=0, keep=SHOWN)), "",
                  "### 送审之前对副本做的处理", "", f"- 删掉成员的测试 `{flow.oracle['member']}/{flow.oracle['tests_dir']}/`"]
        for defect in material.defects:
            lines += ["", f"#### 缺陷 `{defect['id']}`", "", f"文件 `{defect['file']}`，原文：", "", fenced(defect["find"]),
                      "", "改后：", "", fenced(defect["replace"])]
        if not material.defects:
            lines += ["- 不种缺陷（对照材料）"]
        lines += ["", f"- 然后在 `{flow.member()}` 里重新构建：`{' '.join(flow.workspace['rebuild'])}`",
                  "", "### 写入范围", "", *[f"- `{entry}`" for entry in material.allowed_write]]
    return "\n".join(lines) + "\n"


def inputs_write_tests(flow: Flow) -> str:
    lines = _checkout_header(flow, "为一个拿走了原有测试的模块写测试")
    lines += ["", "| 材料 | 取自提交 | 被测模块 | 拿走的原有测试 | 写入范围 | 变异体 |", "|---|---|---|---|---|---|"]
    for material in flow.materials:
        task = material.task or {}
        lines.append(f"| `{material.id}` | `{flow.base(material)[:9]}` | `{task['target']}` | {len(task['hidden_tests'])} | "
                     f"{len(task['allowed_write'])} 项 | {len(task['mutants'])} 个 |")
    for material in flow.materials:
        task = material.task or {}
        lines += ["", f"## `{material.id}`", "", f"任务：{material.target}", "",
                  "### 简报（任务简报填进框架之后的样子，逐字）", "",
                  fenced(checkout.framed_brief(flow, material, workdir="{WORKDIR}", rep=0, keep=SHOWN)), "",
                  "### 送审之前对副本做的处理", "",
                  f"- 删掉成员的构建产物 `{flow.oracle['member']}/dist/`",
                  *[f"- 删掉原有测试 `{path}`（判定器在 `verify` 里拿它当已知好的答案）" for path in task["hidden_tests"]],
                  "", "### 写入范围", "", *[f"- `{entry}`" for entry in task["allowed_write"]],
                  "", f"### 变异体（{len(task['mutants'])} 个，判定时逐个盖到 `{task['target']}` 上）"]
        for mutant in task["mutants"]:
            lines += ["", f"#### `{mutant['id']}`", "", "原文：", "", fenced(mutant["find"]), "", "变异后：", "",
                      fenced(mutant["replace"]) if mutant["replace"] else "（替换为空：删去这段原文）", "",
                      "逐字（JSON，含首尾空白与换行）：", "",
                      fenced(json.dumps({"find": mutant["find"], "replace": mutant["replace"]}, ensure_ascii=False))]
    return "\n".join(lines) + "\n"


# --- one run of the role: prepare, then record ----------------------------------------------------------------

def compile_definition(flow: Flow, out: Path, variant: str) -> Path:
    """Compile the role from its source at this commit and freeze it as the definition of the variant."""
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


def prepare(flow: Flow, material: Material, rep: int, *, variant: str, out: Path, work: Path, allow_dirty: bool,
            again: bool) -> str:
    """Build the copy and the brief of one run, and say how to dispatch it."""
    unsigned = flow.unsigned()
    if unsigned:
        raise Refused(f"{flow.id} v{flow.version} has no sign-off on: {', '.join(unsigned)}. "
                      f"A run waits for both; record them under 'signoffs' in flow.json.")
    changes = workspace.dirty(REPO, guarded_paths(flow))
    if changes and not allow_dirty:
        raise Refused("uncommitted changes in what is under test or in the suite:\n  " + "\n  ".join(changes))
    problems = verify(flow, work, only=[material.id])
    if problems:
        raise Refused("the material does not verify:\n  " + "\n  ".join(problems))
    evidence = episode_dir(out, variant, material.id, rep)
    if (evidence / "episode.json").exists():
        raise Refused(f"{evidence} is already recorded")
    pending = evidence / "pending.json"
    if pending.exists() and not again:
        raise Refused(f"{material.id} rep {rep} is already prepared and waits for its transcript; "
                      f"--again throws that copy away and builds a new one")
    out.mkdir(parents=True, exist_ok=True)
    (out / "_state.json").write_text(json.dumps(flow.state(), ensure_ascii=False, indent=1), encoding="utf-8")
    agents = compile_definition(flow, out, variant)
    attempt = work / f"{flow.id}-{variant}-{material.id}-rep{rep}"
    shutil.rmtree(attempt, ignore_errors=True)
    dest = attempt / "workspace"
    copy: dict[str, Any] = {}
    try:
        if flow.kind == "checkout":
            source = checkout.template(flow, material, repo=REPO, work=work)
            facts = build_checkout(flow, material, dest, source)
            brief_text = checkout_brief(flow, material, dest, rep, facts)
            copy = {"template": str(source), "facts": facts}
        else:
            build_copy(flow, material, dest)
            brief_text = review.brief(flow, material, dest, repo=REPO)
            copy = {"tree_hash": workspace.tree_hash(dest)}
    except (workspace.WorkspaceError, checkout.BriefError, RuntimeError, OSError) as error:
        shutil.rmtree(attempt, ignore_errors=True)
        raise Refused(f"could not prepare {material.id}: {error}") from error
    host = flow.host["claude-code"]
    # The role definition sits beside the copy, outside every checkout, for a dispatch that has to hand it over as a file.
    role = attempt / "role.md"
    role.write_text(json.loads(agents.read_text(encoding="utf-8"))[flow.role]["prompt"] + "\n", encoding="utf-8")
    evidence.mkdir(parents=True, exist_ok=True)
    (evidence / "brief.md").write_text(brief_text, encoding="utf-8")
    (evidence / "dispatch.inline.md").write_text(
        INLINE.format(tools="、".join(host["allowed"]), role=role, brief=brief_text), encoding="utf-8")
    pending.write_text(json.dumps({
        "workspace": str(dest), "role": str(role), **copy,
        "harness_commit": workspace.head(REPO), "dirty": bool(changes), "agent_sha": sha256(agents),
        "prepared_at": int(time.time()),
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    alias = ALIASES.get(host["model"], host["model"])
    precondition = [] if flow.kind != "checkout" else [
        f"PRECONDITION: dispatch from a session whose working directory is outside every checkout of this repository "
        f"(not under {main_checkout(REPO)}). The role has a shell and the answers are in the repository; a run whose "
        f"session started inside it, or whose tool calls name it or {checkout.TEMPLATE_NEEDLE}, is recorded as "
        f"contaminated and not scored."]
    return "\n".join([
        *precondition,
        f"{material.id} rep {rep}: prepared. Dispatch ONE subagent, then record its transcript.",
        f"  registered: subagent type `{flow.role}` (model {alias}); the prompt is the text of {evidence / 'brief.md'}",
        f"  inline:     a general-purpose subagent (model {alias}); the prompt is the text of "
        f"{evidence / 'dispatch.inline.md'}",
        f"  the role is to run on {host['model']} at {host['effort']}; the copy is {dest}",
    ])


def outside_copy(episode: claude_host.Episode, dest: Path, role: str | None) -> list[str]:
    """Absolute paths the run's tool calls named that are neither inside its copy nor its role definition."""
    named = {path for _, args in episode.tool_inputs for path in re.findall(r'"(/[^"\s]+)"', args)}
    return sorted(path for path in named if not path.startswith(str(dest)) and path != role)


def episode_record(flow: Flow, material: Material, rep: int, variant: str, episode: claude_host.Episode, *,
                   observed: dict[str, tuple[float, str]], provenance: dict[str, Any]) -> dict[str, Any]:
    host = flow.host["claude-code"]
    return {
        "flow": flow.id, "material": material.id, "rep": rep, "variant": variant, "role": flow.role,
        "requested_model": host["model"], "effort": host["effort"], "model": episode.model,
        "models_observed": episode.models_observed, "efforts_observed": episode.efforts_observed,
        "usage": episode.usage, "cost_usd": episode.cost_usd,
        "stop_reason": episode.stop_reason, "truncated": episode.truncated(), "tool_calls": episode.tool_calls,
        "tool_names": episode.tool_names, "wall_seconds": episode.wall_seconds, "api_seconds": episode.api_seconds,
        "observations": {metric: list(value) for metric, value in observed.items()},
        "provenance": {"suite_version": flow.version, "suite_sha": flow.digest(), "base": flow.base(material),
                       **provenance},
    }


def record(flow: Flow, material: Material, rep: int, *, variant: str, out: Path, transcript: Path, dispatch: str,
           tokens: int | None, keep: bool = False) -> str:
    """Take in the transcript of a prepared run. A run that may not be scored goes to the failure sidecar."""
    evidence = episode_dir(out, variant, material.id, rep)
    pending = evidence / "pending.json"
    if not pending.exists():
        raise Refused(f"{material.id} rep {rep} is not prepared; run 'prepare' first")
    prepared = json.loads(pending.read_text(encoding="utf-8"))
    brief_text = (evidence / "brief.md").read_text(encoding="utf-8")
    episode = claude_host.parse(transcript, brief=brief_text)
    if _squash(brief_text) not in _squash(episode.prompt):
        raise Refused(f"{transcript.name} is not a run of this brief: its prompt does not carry the brief word for word")
    handed = any(name == "Read" and json.loads(args).get("file_path") == prepared["role"]
                 for name, args in episode.tool_inputs)
    if dispatch == "inline" and not handed:
        raise Refused(f"{transcript.name} never read the role definition at {prepared['role']}; "
                      f"an inline dispatch hands the role over as that file")
    if dispatch == "registered" and prepared["role"] in episode.prompt:
        raise Refused(f"{transcript.name} was pointed at the role file; that is an inline dispatch")
    for other in (out / variant / "episodes").glob("*/episode.json"):
        earlier = json.loads(other.read_text(encoding="utf-8"))["provenance"].get("dispatch")
        if earlier and earlier != dispatch:
            raise Refused(f"this variant holds runs dispatched as '{earlier}'; a variant holds one way of "
                          f"dispatching - record '{dispatch}' runs in another variant")
    host = flow.host["claude-code"]
    dest = Path(prepared["workspace"])
    reached = episode.touched(list(OFF_LIMITS))
    if flow.kind == "checkout":
        main = main_checkout(REPO)
        reached += episode.asked(checkout.forbidden(main))
        inside = checkout.dispatched_inside(episode.cwd, main)
        if inside:
            reached.append(inside)
    failure = episode.failure(host["model"]) or (("contaminated", "; ".join(reached)) if reached else None)
    observed: dict[str, tuple[float, str]] = {}
    oracle: dict[str, Any] | None = None
    if not failure:
        # A program-judged flow is judged here, on the copy, before the copy is removed.
        try:
            observed, oracle = observe_run(flow, material, episode, dest, prepared, evidence)
        except (workspace.WorkspaceError, subprocess.CalledProcessError, OSError) as error:
            failure = ("grader", f"the program could not judge the copy: {error}")
    shutil.copyfile(transcript, evidence / "trajectory.jsonl")
    pending.unlink()
    if not keep:
        shutil.rmtree(dest.parent, ignore_errors=True)
    if failure:
        # The attempt keeps its evidence under a name that frees the (material, rep) slot for another run.
        parked = evidence.with_name(f"{evidence.name}.failed-{int(time.time())}")
        evidence.rename(parked)
        VariantStore(out, variant).record_error(material.id, rep, failure[0], failure[1], model=episode.model,
                                                usage=episode.usage or None, cost_usd=None, evidence=str(parked))
        return f"{material.id} rep {rep}: {failure[0]} - {failure[1]}"
    (evidence / "final.md").write_text(episode.final, encoding="utf-8")
    result = episode_record(flow, material, rep, variant, episode, observed=observed, provenance={
        "harness_commit": prepared["harness_commit"], "dirty": prepared["dirty"], "agent_sha": prepared["agent_sha"],
        "brief_sha": sha256(evidence / "brief.md"), "trajectory_sha": sha256(evidence / "trajectory.jsonl"),
        "dispatch": dispatch, "tokens_reported": tokens, "session_cwd": episode.cwd,
        "outside_copy": outside_copy(episode, dest, prepared["role"])})
    if oracle is not None:
        result["oracle"] = oracle
    (evidence / "episode.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    said = (f"{material.id} rep {rep}: recorded, {episode.wall_seconds or 0:.0f}s, {episode.tool_calls} tool calls, "
            f"model {episode.model}, effort {episode.efforts_observed or 'not recorded'}")
    if not flow.judged:
        result["provenance"]["evidence"] = str(evidence.relative_to(out))
        rows = PROGRAM_JUDGED[flow.family].rows(flow, material, rep, result, brief_text=brief_text)
        VariantStore(out, variant).record_episode(rows, episode.turns)
        said += f"; scored by the program: success {result['observations']['success'][0]}"
    return said


def observe_run(flow: Flow, material: Material, episode: claude_host.Episode, dest: Path, prepared: dict[str, Any],
                evidence: Path) -> tuple[dict[str, tuple[float, str]], dict[str, Any] | None]:
    """Run-level facts read off the copy, and for a program-judged flow the judgment itself."""
    allowed = flow.host["claude-code"]["allowed"]
    if flow.family == "implement":
        result = implement.judge(flow, material, dest, source=Path(prepared["template"]), evidence=evidence / "oracle")
        return implement.scored(result, episode, allowed), result
    if flow.family == "acceptance":
        result = acceptance.judge(flow, material, dest, evidence=evidence / "oracle",
                                  artefact=prepared["facts"]["artefact"])
        return acceptance.scored(result, episode, allowed), result
    if flow.family == "write-tests":
        result = write_tests.judge(flow, material, dest, source=Path(prepared["template"]), evidence=evidence / "oracle")
        return write_tests.scored(result, episode, allowed), result
    if flow.kind == "checkout":
        return review.observe_delivery(episode, dest, prepared["facts"]["head"], allowed=allowed), None
    unchanged = dest.is_dir() and workspace.tree_hash(dest) == prepared["tree_hash"]
    return review.observe(flow, episode, unchanged=unchanged, allowed=allowed), None


# --- import -------------------------------------------------------------------------------------------------

def import_run(flow: Flow, *, variant: str, out: Path, material: Material, rep: int, source: Path) -> None:
    """Take over a run an earlier experiment recorded. Nothing is run; the old record says what it was."""
    if not flow.judged or flow.kind != "material":
        raise Refused(f"{flow.id}: only runs of a review on material copies can be taken over")
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
    observed = review.observe(flow, episode, unchanged=old["workspace_unchanged"],
                              allowed=flow.host["claude-code"]["allowed"])
    result = episode_record(flow, material, rep, variant, episode, observed=observed, provenance={
        "harness_commit": "imported", "dirty": False, "imported_from": str(source), "dispatch": "headless",
        "agent_sha": old["agents_definition_sha256"], "brief_sha": sha256(evidence / "brief.md"),
        "trajectory_sha": sha256(evidence / "trajectory.jsonl")})
    result["requested_model"], result["effort"] = old["model_id"], old["effort"]
    (evidence / "episode.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    out.mkdir(parents=True, exist_ok=True)
    (out / "_state.json").write_text(json.dumps(flow.state(), ensure_ascii=False, indent=1), encoding="utf-8")


# --- scoring a recorded run -----------------------------------------------------------------------------------

def _score(flow: Flow, material: Material, rep: int, *, variant: str, out: Path, verdict: grading.Verdict,
           extra: dict[str, Any]) -> None:
    evidence = episode_dir(out, variant, material.id, rep)
    result = json.loads((evidence / "episode.json").read_text(encoding="utf-8"))
    result["provenance"]["evidence"] = str(evidence.relative_to(out))
    brief_text = (evidence / "brief.md").read_text(encoding="utf-8")
    turns = claude_host.parse(evidence / "trajectory.jsonl", brief=brief_text).turns
    rows = review.rows(flow, material, rep, result, verdict, brief_text=brief_text)
    rows[-1].update(extra)
    VariantStore(out, variant).record_episode(rows, turns)


def judged_only(flow: Flow) -> None:
    """A flow scored by a program has nothing for a judge or a person's labels to do."""
    if not flow.judged:
        raise Refused(f"{flow.id} is a {flow.family} flow: a program judges each run when 'record' takes it in, "
                      f"before its copy is removed; there is no judge to brief and nothing to grade by hand")


def grade(flow: Flow, *, variant: str, out: Path, labels: Path) -> int:
    """Score every recorded run that has no rows yet, from verdicts a person wrote down."""
    judged_only(flow)
    store = VariantStore(out, variant)
    done = store.done()
    graded = 0
    for evidence in sorted((out / variant / "episodes").glob("*/episode.json")):
        result = json.loads(evidence.read_text(encoding="utf-8"))
        material, rep = flow.material(result["material"]), result["rep"]
        if (material.id, rep) in done:
            continue
        try:
            verdict = grading.from_labels(labels, material, rep)
        except grading.GraderError as error:
            store.record_error(material.id, rep, "grader", str(error), evidence=str(evidence.parent))
            print(f"{material.id} rep {rep}: not graded - {error}")
            continue
        _score(flow, material, rep, variant=variant, out=out, verdict=verdict, extra={})
        graded += 1
    print(f"{flow.id} {variant}: graded {graded} episodes")
    return 0


def judge_brief(flow: Flow, material: Material, rep: int, *, variant: str, out: Path) -> str:
    """Write what a main session hands to the judge for one recorded run."""
    judged_only(flow)
    if "grading" in flow.unsigned():
        raise Refused(f"{flow.id} v{flow.version} has no sign-off on the grading method; the model judge waits for it")
    evidence = episode_dir(out, variant, material.id, rep)
    if not (evidence / "episode.json").exists():
        raise Refused(f"{material.id} rep {rep} has no recorded run to judge")
    path = evidence / "judge.brief.md"
    path.write_text(judge.brief(flow, material, (evidence / "final.md").read_text(encoding="utf-8")), encoding="utf-8")
    signed = flow.signoffs["grading"].get("judge", "any judge")
    return (f"{material.id} rep {rep}: dispatch ONE subagent ({signed}) whose whole prompt is:\n"
            f"{judge.pointer(path)}")


def judge_record(flow: Flow, material: Material, rep: int, *, variant: str, out: Path, transcript: Path) -> int:
    """Check a judge answer against the report and score the run; 3 means dispatch the judge again."""
    judged_only(flow)
    if "grading" in flow.unsigned():
        raise Refused(f"{flow.id} v{flow.version} has no sign-off on the grading method; the model judge waits for it")
    store = VariantStore(out, variant)
    if (material.id, rep) in store.done():
        raise Refused(f"{material.id} rep {rep} is already scored")
    evidence = episode_dir(out, variant, material.id, rep)
    path = evidence / "judge.brief.md"
    report = (evidence / "final.md").read_text(encoding="utf-8")
    if not path.exists() or path.read_text(encoding="utf-8") != judge.brief(flow, material, report):
        raise Refused(f"{material.id} rep {rep} has no judge brief under the rules as they now are; "
                      f"run 'judge-brief' first")
    answer = claude_host.parse(transcript, brief=judge.pointer(path))
    try:
        name = judge.read(answer, path, signed=flow.signoffs["grading"].get("judge"), judgment=flow.judgment)
    except judge.NotThisJudge as error:
        raise Refused(str(error)) from error
    log = evidence / "judge.attempts.json"
    attempts = json.loads(log.read_text(encoding="utf-8")) if log.exists() else []
    shutil.copyfile(transcript, evidence / f"judge.attempt{len(attempts)}.jsonl")
    try:
        verdict = judge.verdict(judge.parse_answer(answer.final), material, report, grader=name)
    except grading.GraderError as error:
        attempts.append(judge.attempt(answer, rejected=str(error)))
        log.write_text(json.dumps(attempts, ensure_ascii=False, indent=1), encoding="utf-8")
        if len(attempts) < judge.ATTEMPTS:
            print(f"{material.id} rep {rep}: the answer was thrown away - {error}. Dispatch the judge again.")
            return RETRY
        spent = judge.spend(attempts)
        store.record_error(material.id, rep, "grader", f"{len(attempts)} judge answers failed; last: {error}",
                           model=spent["judge_model"], usage=spent["judge_usage"], evidence=str(evidence))
        print(f"{material.id} rep {rep}: not graded - {len(attempts)} judge answers failed; last: {error}")
        return 1
    attempts.append(judge.attempt(answer))
    log.write_text(json.dumps(attempts, ensure_ascii=False, indent=1), encoding="utf-8")
    _score(flow, material, rep, variant=variant, out=out, verdict=verdict, extra=judge.spend(attempts))
    print(f"{material.id} rep {rep}: scored by {name}")
    return 0


# --- calibrate ----------------------------------------------------------------------------------------------

def calibration_case(flow: Flow, case_id: str) -> tuple[str, calibration.Case]:
    judged_only(flow)
    grader, cases = calibration.load(flow)
    for case in cases:
        if case.id == case_id:
            return grader, case
    raise Refused(f"{flow.id} has no calibration case {case_id}")


def calibrate_brief(flow: Flow, case_id: str | None, out: Path) -> str:
    """Write the judge briefs of one case, or of all, and say what to dispatch for each."""
    judged_only(flow)
    cases =[calibration_case(flow, case_id)[1]] if case_id else calibration.load(flow)[1]
    lines = ["Dispatch ONE subagent per case; its whole prompt is the line after the case id. Then record its transcript."]
    for case in cases:
        lines += [f"{case.id}:", judge.pointer(calibration.write_brief(flow, case, out))]
    return "\n".join(lines)


def calibrate_record(flow: Flow, case_id: str, out: Path, transcript: Path) -> int:
    _, case = calibration_case(flow, case_id)
    answer = claude_host.parse(transcript, brief=f"calibration case {case.id}")
    try:
        result = calibration.record(flow, case, answer, out=out, transcript=transcript)
    except judge.NotThisJudge as error:
        raise Refused(str(error)) from error
    except grading.GraderError as error:
        print(f"{case.id}: the answer was thrown away - {error}. Dispatch the judge again.")
        return RETRY
    print(f"{case.id}: {result['status']} by {result['grader']}")
    return 0 if result["status"] == "judged" else 1


def calibrate(flow: Flow, *, out: Path, model: str) -> int:
    """Print how the stored answers of one judge compare with the person's verdicts."""
    judged_only(flow)
    grader, cases = calibration.load(flow)
    where = calibration.directory(out, model, flow.judgment)
    text = calibration.render(flow, grader, cases, calibration.recorded(where), model=model)
    where.mkdir(parents=True, exist_ok=True)
    (where / "calibration.md").write_text(text, encoding="utf-8")
    print(text, end="")
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
        episodes = [json.loads(path.read_text(encoding="utf-8"))
                    for path in sorted((out / variant / "episodes").glob("*/episode.json"))]
        # A subagent run has no price; the host's token total, as the dispatcher reported it, stands in for one.
        tokens = sum(episode["provenance"].get("tokens_reported") or 0 for episode in episodes)
        minutes = sum(episode.get("wall_seconds") or 0 for episode in episodes) / 60
        dispatched = sorted({episode["provenance"].get("dispatch", "headless") for episode in episodes})
        judged = sum(row.get("judge_attempts") or 0 for row in runs)
        models = sorted({row["model"] for row in rows})
        lines += ["", f"{variant}: {len(episodes)} episodes recorded ({', '.join(dispatched)}), {len(runs)} scored, "
                      f"{truncated} truncated, {len(errors)} failed attempts {by_class or ''} - "
                      f"role {tokens} tokens reported, {minutes:.0f} min; judge answers {judged} - {', '.join(models)}"]
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
    together = ("the mutants of one material are judged with the same tests of the same run"
                if flow.family == "write-tests" else "seeds of one material are judged on the same report")
    lines += ["", f"noise floor on {primary['id']}: about ±{stats.noise_floor(cases):.0%} with {cases} cases; "
                  f"a smaller change cannot be told from run-to-run variation",
              f"{together}, so they are not independent: the intervals above are narrower than the truth when "
              f"materials are few"]
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

    def episode(name: str) -> argparse.ArgumentParser:
        command = add(name)
        command.add_argument("--variant", required=True)
        command.add_argument("--material", required=True)
        command.add_argument("--rep", type=int, default=0)
        return command

    add("verify").add_argument("--work", type=Path)
    add("inputs").add_argument("--write", type=Path, help="write the markdown here instead of printing it")
    preparing = episode("prepare")
    preparing.add_argument("--work", type=Path)
    preparing.add_argument("--allow-dirty", action="store_true")
    preparing.add_argument("--again", action="store_true", help="throw away a prepared copy and build a new one")
    recording = episode("record")
    recording.add_argument("--transcript", type=Path, required=True, help="the subagent transcript the host kept")
    recording.add_argument("--dispatch", choices=DISPATCH, required=True,
                           help="'registered': the role's own subagent type; 'inline': a general-purpose subagent "
                                "given the role definition in its prompt")
    recording.add_argument("--tokens", type=int, help="the token total the host reported for the subagent")
    recording.add_argument("--keep-workspace", action="store_true")
    episode("judge-brief")
    episode("judge-record").add_argument("--transcript", type=Path, required=True)
    importing = episode("import-run")
    importing.add_argument("--from", dest="source", type=Path, required=True)
    grading_ = add("grade")
    grading_.add_argument("--variant", required=True)
    grading_.add_argument("--labels", type=Path, required=True, help="verdicts a person wrote down")
    add("calibrate-brief").add_argument("--case", help="one case; all of them when left out")
    stored = add("calibrate-record")
    stored.add_argument("--case", required=True)
    stored.add_argument("--transcript", type=Path, required=True)
    add("calibrate").add_argument("--judge-model", required=True, help="full model id, e.g. claude-sonnet-5-5")
    add("summary")
    add("report").add_argument("--builder", type=Path, help="another builder than the one kept in the repository")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        flow = load(args.suite.resolve())
        out = flow_dir(flow, args.out.resolve() if args.out else None)
        if getattr(args, "transcript", None) and not args.transcript.is_file():
            raise Refused(f"no transcript at {args.transcript}")
        if args.command == "verify":
            notes: list[str] = []
            problems = verify(flow, work_root(args.work), notes=notes)
            print("\n".join([*notes, *problems] if problems else
                            [*notes, f"{flow.id}: {len(flow.materials)} materials verify"]))
            return 1 if problems else 0
        if args.command == "inputs":
            text = inputs(flow)
            if args.write:
                args.write.parent.mkdir(parents=True, exist_ok=True)
                args.write.write_text(text, encoding="utf-8")
            else:
                print(text, end="")
            return 0
        if args.command == "prepare":
            print(prepare(flow, flow.material(args.material), args.rep, variant=args.variant, out=out,
                          work=work_root(args.work), allow_dirty=args.allow_dirty, again=args.again))
            return 0
        if args.command == "record":
            print(record(flow, flow.material(args.material), args.rep, variant=args.variant, out=out,
                         transcript=args.transcript.resolve(), dispatch=args.dispatch, tokens=args.tokens,
                         keep=args.keep_workspace))
            return 0
        if args.command == "judge-brief":
            print(judge_brief(flow, flow.material(args.material), args.rep, variant=args.variant, out=out))
            return 0
        if args.command == "judge-record":
            return judge_record(flow, flow.material(args.material), args.rep, variant=args.variant, out=out,
                                transcript=args.transcript.resolve())
        if args.command == "import-run":
            import_run(flow, variant=args.variant, out=out, material=flow.material(args.material), rep=args.rep,
                       source=args.source.resolve())
            return 0
        if args.command == "grade":
            return grade(flow, variant=args.variant, out=out, labels=args.labels.resolve())
        if args.command == "calibrate-brief":
            print(calibrate_brief(flow, args.case, out))
            return 0
        if args.command == "calibrate-record":
            return calibrate_record(flow, args.case, out, args.transcript.resolve())
        if args.command == "calibrate":
            return calibrate(flow, out=out, model=args.judge_model)
        if args.command == "summary":
            print(summary(flow, out), end="")
            return 0
        builder = args.builder or BUILDER
        if not builder.is_file():
            raise Refused(f"no report builder at {builder}; 'summary' prints the same scores without it")
        if not shutil.which("node"):
            raise Refused("the report builder needs node on PATH; 'summary' prints the same scores without it")
        return subprocess.run(["node", str(builder), str(out)]).returncode
    except (Refused, SuiteError) as error:
        print(f"roleeval: {error}", file=sys.stderr)
        return 2
