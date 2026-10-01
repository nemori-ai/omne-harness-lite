"""A standing suite: the cases of one flow, as ``suites/<flow>/flow.json`` describes them."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

FORMAT = 1
FAMILIES = ("review",)
METRIC_KINDS = ("binary", "float", "judge")
LABEL_LIMIT = 14
SIGNOFFS = ("cases", "grading")


class SuiteError(ValueError):
    """The suite does not say what a run needs to know."""


@dataclass(frozen=True)
class Seed:
    id: str
    kind: str
    where: str
    truth: str
    op: dict[str, Any] | None = None
    check: str | None = None
    quote: str | None = None
    files: tuple[str, ...] = ()
    severity: str | None = None

    def fragments(self) -> list[str]:
        """The verbatim pieces of the material a real finding points at; each line of ``quote`` is one piece."""
        return [line for line in (self.quote or "").splitlines() if line.strip()]


@dataclass(frozen=True)
class Material:
    id: str
    target: str
    brief: Path
    tags: tuple[str, ...]
    prepare: tuple[dict[str, Any], ...]
    seeds: tuple[Seed, ...]
    contract: str | None = None
    known_issues: tuple[dict[str, str], ...] = ()
    base: str | None = None
    source: str | None = None

    def ops(self) -> list[dict[str, Any]]:
        return [*self.prepare, *[dict(seed.op, id=seed.id) for seed in self.seeds if seed.op]]


@dataclass(frozen=True)
class Flow:
    root: Path
    id: str
    version: int
    family: str
    role: str
    judgment: str
    criteria_page: str
    host: dict[str, Any]
    reps: int
    workspace: dict[str, Any]
    metrics: tuple[dict[str, Any], ...]
    materials: tuple[Material, ...]
    attach_design_review: bool = False
    signoffs: dict[str, dict[str, Any]] = field(default_factory=dict)

    def material(self, material_id: str) -> Material:
        for material in self.materials:
            if material.id == material_id:
                return material
        raise SuiteError(f"{self.id} has no material {material_id!r}")

    def base(self, material: Material) -> str:
        """The commit a material is taken from: its own when it is a historical snapshot, else the suite's."""
        return material.base or self.workspace["base"]

    def unsigned(self) -> list[str]:
        """Sign-offs still owed for this version of the suite."""
        return [name for name in SIGNOFFS if self.signoffs.get(name, {}).get("version") != self.version]

    def state(self) -> dict[str, Any]:
        """What the report builder reads as ``_state.json``."""
        return {"metrics": [dict(metric) for metric in self.metrics],
                "perf_fields": [{"id": "cost_usd", "label": "cost", "unit": "$"},
                                {"id": "latency_s", "label": "wall", "unit": "s"},
                                {"id": "tool_calls", "label": "tool calls"}]}

    def digest(self) -> str:
        """Content hash of every file of the suite; a row carries it so a result names its inputs."""
        digest = hashlib.sha256()
        for path in sorted(self.root.rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                digest.update(str(path.relative_to(self.root)).encode())
                digest.update(path.read_bytes())
        return digest.hexdigest()


def load(root: Path) -> Flow:
    root = Path(root)
    try:
        raw = json.loads((root / "flow.json").read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SuiteError(f"{root} has no flow.json") from error
    try:
        if raw["format"] != FORMAT:
            raise SuiteError(f"{root}: flow.json format {raw['format']} is not {FORMAT}")
        flow = Flow(
            root=root, id=raw["id"], version=raw["version"], family=raw["family"], role=raw["role"],
            judgment=raw["judgment"], criteria_page=raw["criteria_page"], host=raw["host"], reps=raw["reps"],
            workspace=raw["workspace"], metrics=tuple(raw["metrics"]),
            materials=tuple(_material(root, item) for item in raw["materials"]),
            attach_design_review=raw.get("attach_design_review", False), signoffs=raw.get("signoffs", {}))
    except KeyError as error:
        raise SuiteError(f"{root}: flow.json lacks {error}") from error
    _check(flow)
    return flow


def _material(root: Path, raw: dict[str, Any]) -> Material:
    seeds = tuple(Seed(id=seed["id"], kind=seed["kind"], where=seed["where"], truth=seed["truth"],
                       op=seed.get("op"), check=seed.get("check"), quote=seed.get("quote"),
                       files=tuple(seed.get("files", ())), severity=seed.get("severity")) for seed in raw["seeds"])
    return Material(id=raw["id"], target=raw["target"], brief=root / raw["brief"], tags=tuple(raw.get("tags", ())),
                    prepare=tuple(raw.get("prepare", ())), seeds=seeds, contract=raw.get("contract"),
                    known_issues=tuple(raw.get("known_issues", ())), base=raw.get("base"), source=raw.get("source"))


def _check(flow: Flow) -> None:
    if flow.id != flow.root.name:
        raise SuiteError(f"flow id {flow.id!r} must equal its directory name {flow.root.name!r}")
    if flow.family not in FAMILIES:
        raise SuiteError(f"{flow.id}: unknown family {flow.family!r}")
    if flow.reps < 1:
        raise SuiteError(f"{flow.id}: reps must be at least 1")
    for key in ("base", "material_paths", "material_excludes", "subject_paths"):
        if key not in flow.workspace:
            raise SuiteError(f"{flow.id}: workspace lacks {key!r}")
    if "claude-code" not in flow.host:
        raise SuiteError(f"{flow.id}: no claude-code host settings")
    metric_ids = [metric["id"] for metric in flow.metrics]
    if len(set(metric_ids)) != len(metric_ids):
        raise SuiteError(f"{flow.id}: duplicate metric ids")
    for metric in flow.metrics:
        if metric["kind"] not in METRIC_KINDS:
            raise SuiteError(f"{flow.id}: metric {metric['id']} has unknown kind {metric['kind']!r}")
        if len(metric.get("label", metric["id"])) > LABEL_LIMIT:
            raise SuiteError(f"{flow.id}: label of metric {metric['id']} is longer than {LABEL_LIMIT} characters")
    material_ids = [material.id for material in flow.materials]
    if len(set(material_ids)) != len(material_ids):
        raise SuiteError(f"{flow.id}: duplicate material ids")
    for material in flow.materials:
        if not material.brief.is_file():
            raise SuiteError(f"{flow.id}/{material.id}: brief {material.brief.name} does not exist")
        seed_ids = [seed.id for seed in material.seeds]
        if len(set(seed_ids)) != len(seed_ids):
            raise SuiteError(f"{flow.id}/{material.id}: duplicate seed ids")
        for seed in material.seeds:
            if seed.quote and not seed.files:
                raise SuiteError(f"{flow.id}/{material.id}.{seed.id}: a quoted finding names the files the quote is in")
        if flow.attach_design_review and not material.contract:
            raise SuiteError(f"{flow.id}/{material.id}: a flow that attaches the design review report "
                             f"needs the contract coordinate of each material")
