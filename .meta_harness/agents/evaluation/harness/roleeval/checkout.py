"""A run's copy when the suite's workspace is a whole installed checkout, and what such a run may not reach.

The copy is taken from a template (see ``workspace.template``), then made into the material: the
family removes what would give the answer away and puts its own changes in, and the result is
committed as a baseline. With ``commit: delivery`` the seeds go in after the baseline as an
implementer's delivery commit, and the member is rebuilt.

A role on such a copy has a shell. The repository it came from holds the answers - the original
implementation, the hidden tests, the seed lists - so a run has to be dispatched from a session whose
working directory is outside every checkout of it, and its tool calls may not name the main checkout
or the templates.
"""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from typing import Callable

from . import workspace
from .suite import Flow, Material

PLACEHOLDER = re.compile(r"\{[A-Z_]+\}")
SECTION = re.compile(r"^@@([A-Z_]+)\n", flags=re.M)
TEMPLATE_NEEDLE = workspace.TEMPLATES


class BriefError(ValueError):
    """A brief would reach the role with a placeholder nobody filled."""


def fill(text: str, values: dict[str, str], *, keep: tuple[str, ...] = ()) -> str:
    """Put the values into a brief; a placeholder left over means the brief is not what the role should get.

    ``keep`` names placeholders that stay as they are, for showing a brief before any run fills them.
    """
    for key, value in values.items():
        if key not in keep:
            text = text.replace("{%s}" % key, value)
    left = sorted({name for name in PLACEHOLDER.findall(text) if name[1:-1] not in keep})
    if left:
        raise BriefError(f"unfilled placeholders: {left}")
    return text


def run_id(material: Material, rep: int) -> str:
    return f"{material.id.lower()}-r{rep}"


def framed_brief(flow: Flow, material: Material, *, workdir: str, rep: int, keep: tuple[str, ...] = ()) -> str:
    """The flow's frame with the task's ``@@SECTION``s filled in, then the run's own values; nothing may be left
    unfilled except what ``keep`` names."""
    parts = SECTION.split(material.brief.read_text(encoding="utf-8"))
    values = {name: body.strip() for name, body in zip(parts[1::2], parts[2::2])}
    values.update({"TASK_ID": material.id, "RUN_ID": run_id(material, rep), "ROLE": flow.role, "WORKDIR": workdir})
    if flow.brief_frame is None:
        raise BriefError(f"{flow.id} has no brief_frame to fill the task into")
    return fill(flow.brief_frame.read_text(encoding="utf-8"), values, keep=keep)


def remove_answers(flow: Flow, material: Material, dest: Path) -> None:
    """Take away what gives a module's tests or its implementation away: the member's build output, the hidden tests."""
    shutil.rmtree(dest / flow.oracle["member"] / "dist", ignore_errors=True)
    for relative in material.task["hidden_tests"]:
        (dest / relative).unlink()


def answers_left(flow: Flow, material: Material, dest: Path) -> list[str]:
    """What ``remove_answers`` should have taken away and is still in the copy."""
    left = [f"{material.id}: hidden test {relative} is in the copy"
            for relative in material.task["hidden_tests"] if (dest / relative).exists()]
    if (dest / flow.oracle["member"] / "dist").exists():
        left.append(f"{material.id}: {flow.oracle['member']}/dist is in the copy")
    return left


def template(flow: Flow, material: Material, *, repo: Path, work: Path) -> Path:
    settings = flow.workspace
    return workspace.template(repo, work, flow_id=flow.id, base=flow.base(material), excludes=settings["excludes"],
                              setup=settings["setup"], inputs=settings.get("inputs", []))


def rebuild(flow: Flow, dest: Path) -> None:
    """Rebuild the member after the material was changed; a build that fails makes the material unusable."""
    ran = workspace.run(flow.workspace["rebuild"], dest / str(flow.member()))
    if not ran.ok:
        raise workspace.WorkspaceError(f"rebuilding {flow.member()} exited {ran.code}:\n{ran.output[-4000:]}")


def build(flow: Flow, material: Material, dest: Path, *, source: Path,
          before_baseline: Callable[[Path], dict[str, str]] | None = None) -> dict[str, str]:
    """Copy the template, make it the material, commit it; return the commits a brief or a judgment names.

    ``before_baseline`` is the family's own preparation, run on the copy before anything is committed.
    """
    settings = flow.workspace
    workspace.checkout(source, dest, linked=settings["linked"], drop=settings["drop"])
    facts: dict[str, str] = dict(before_baseline(dest)) if before_baseline else {}
    if settings["commit"] == "single":
        workspace.apply(dest, material.ops(), suite=flow.root)
        facts["baseline"] = facts["head"] = workspace.baseline(dest)
        return facts
    facts["baseline"] = workspace.baseline(dest)
    workspace.apply(dest, material.ops(), suite=flow.root)
    delivery = settings["delivery"]
    facts["head"] = workspace.deliver(dest, subject=delivery["subject"], trailers=delivery["trailers"],
                                      author=delivery["author"])
    rebuild(flow, dest)
    return facts


def dispatched_inside(cwd: str | None, main: Path) -> str | None:
    """Why a run whose session started in ``cwd`` could reach the answers; None when it could not."""
    if not cwd:
        return "the transcript does not say where the session ran, so it cannot be shown to be outside the repository"
    root = str(main.resolve())
    if cwd == root or cwd.startswith(root + "/") or _within_on_windows(cwd, root):
        return (f"dispatched from {cwd}, inside a checkout of the repository: the answers are within reach of a "
                f"relative path")
    return None


def _within_on_windows(cwd: str, root: str) -> bool:
    """On Windows, whether ``cwd`` is ``root`` or under it however it is written: either separator, either case.

    The check above compares text with "/" as the separator, and a Windows session directory is written with "\\".
    """
    if os.name != "nt":
        return False
    seen, top = os.path.normcase(os.path.abspath(cwd)), os.path.normcase(root)
    return seen == top or seen.startswith(top.rstrip(os.sep) + os.sep)


def forbidden(main: Path) -> list[str]:
    """What a tool call on a checkout copy may not name: the main checkout (and its worktrees), the templates.

    On Windows the role's shell is Git Bash, which also names the checkout as ``/d/...``; that spelling is added.
    (Either separator and either case are matched by ``claude_host``.)
    """
    root = main.resolve()
    return [str(root), TEMPLATE_NEEDLE, *git_bash_spelling(root)]


def git_bash_spelling(path: Path) -> list[str]:
    """How Git Bash writes an absolute Windows path (``/d/...``), when there is such a spelling; nothing elsewhere."""
    if os.name != "nt" or len(path.drive) != 2 or path.drive[1] != ":":
        return []
    return [f"/{path.drive[0].lower()}{path.as_posix()[2:]}"]
