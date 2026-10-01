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

import re
from pathlib import Path
from typing import Callable

from . import workspace
from .suite import Flow, Material

PLACEHOLDER = re.compile(r"\{[A-Z_]+\}")
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


def template(flow: Flow, material: Material, *, repo: Path, work: Path) -> Path:
    settings = flow.workspace
    return workspace.template(repo, work, flow_id=flow.id, base=flow.base(material), excludes=settings["excludes"],
                              setup=settings["setup"])


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
    if cwd == root or cwd.startswith(root + "/"):
        return (f"dispatched from {cwd}, inside a checkout of the repository: the answers are within reach of a "
                f"relative path")
    return None


def forbidden(main: Path) -> list[str]:
    """What a tool call on a checkout copy may not name: the main checkout (and its worktrees), the templates."""
    return [str(main.resolve()), TEMPLATE_NEEDLE]
