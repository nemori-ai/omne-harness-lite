"""A standing suite: the cases of one flow, as ``suites/<flow>/flow.json`` describes them."""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

FORMAT = 1
# review: a role reports on a material and a judge reads the report. implement, acceptance and
# write-tests: the role changes or runs a checkout and a program reads the result when the run is recorded.
FAMILIES = ("review", "implement", "acceptance", "write-tests")
FRAMED = ("implement", "write-tests")
MUTANT_KEYS = ("id", "find", "replace")
JUDGED = ("review",)
WORKSPACE_KINDS = ("material", "checkout")
COMMIT_MODES = ("single", "delivery")
METRIC_KINDS = ("binary", "float", "judge")
LABEL_LIMIT = 14
SIGNOFFS = ("cases", "grading")
WORKSPACE_KEYS = {
    "material": ("subject_paths",),
    "checkout": ("base", "excludes", "setup", "linked", "drop", "commit"),
}


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
    edits: tuple[dict[str, Any], ...] = ()
    inside: str | None = None

    def fragments(self) -> list[str]:
        """The verbatim pieces of the material a real finding points at; each line of ``quote`` is one piece."""
        return [line for line in (self.quote or "").splitlines() if line.strip()]

    def changes(self) -> list[dict[str, Any]]:
        """Every edit this seed makes to the copy, in order: its one ``op`` or its several ``ops``."""
        return [dict(op, id=self.id) for op in ([self.op] if self.op else self.edits)]


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
    fixture: str | None = None
    required_inputs: tuple[str, ...] = ()
    base: str | None = None
    source: str | None = None
    paths: tuple[str, ...] = ()
    task: dict[str, Any] | None = None
    defects: tuple[dict[str, Any], ...] = ()
    expected: dict[str, Any] | None = None
    allowed_write: tuple[str, ...] = ()
    delivery_note: Path | None = None

    def ops(self) -> list[dict[str, Any]]:
        return [*self.prepare, *[change for seed in self.seeds for change in seed.changes()]]


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
    brief_frame: Path | None = None
    oracle: dict[str, Any] = field(default_factory=dict)
    criteria: tuple[str, ...] = ()
    checks: dict[str, Any] = field(default_factory=dict)

    @property
    def kind(self) -> str:
        """How a copy is made: from material and subject paths, or as a whole installed checkout."""
        return self.workspace.get("kind", "material")

    @property
    def judged(self) -> bool:
        """Whether a model judge scores a run; otherwise a program does, when the run is recorded."""
        return self.family in JUDGED

    def member(self) -> str | None:
        """The repository member a checkout flow is about; the rebuild runs there."""
        return self.workspace.get("member") or self.oracle.get("member")

    def material(self, material_id: str) -> Material:
        for material in self.materials:
            if material.id == material_id:
                return material
        raise SuiteError(f"{self.id} has no material {material_id!r}")

    def base(self, material: Material) -> str:
        """The commit a material is taken from: its own when it is a historical snapshot, else the suite's."""
        return f"fixture:{material.id}" if self.kind == "material" else material.base or self.workspace["base"]

    def fixture(self, material: Material) -> Path:
        if not material.fixture or Path(material.fixture).is_absolute():
            raise SuiteError(f"{self.id}/{material.id}: missing or invalid fixture path")
        path = (self.root / material.fixture).resolve()
        if not path.is_relative_to(self.root.resolve()) or not path.is_file():
            raise SuiteError(f"{self.id}/{material.id}: fixture is missing or outside suite root")
        return path

    def subject_paths(self) -> list[str]:
        """What a copy takes from the working tree; a checkout takes everything from its commit."""
        return list(self.workspace.get("subject_paths", ()))

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
        judged = raw["family"] in JUDGED
        oracle = raw.get("oracle", {})
        targets = _targets(root, oracle)
        flow = Flow(
            root=root, id=raw["id"], version=raw["version"], family=raw["family"], role=raw["role"],
            # Only a judged flow names a kind of judgment and the criteria page that goes with it.
            judgment=raw["judgment"] if judged else raw.get("judgment", ""),
            criteria_page=raw["criteria_page"] if judged else raw.get("criteria_page", ""),
            host=raw["host"], reps=raw["reps"], workspace=raw["workspace"], metrics=tuple(raw["metrics"]),
            materials=tuple(_material(root, item, judged=judged, targets=targets) for item in raw["materials"]),
            attach_design_review=raw.get("attach_design_review", False), signoffs=raw.get("signoffs", {}),
            brief_frame=root / raw["brief_frame"] if raw.get("brief_frame") else None, oracle=oracle,
            criteria=tuple(raw.get("criteria", ())), checks=raw.get("checks", {}))
    except KeyError as error:
        raise SuiteError(f"{root}: flow.json lacks {error}") from error
    _check(flow)
    return flow


def _targets(root: Path, oracle: dict[str, Any]) -> dict[str, list[str]]:
    """The tests each implement task's stub is known to break, kept beside flow.json."""
    if not oracle.get("target_tests"):
        return {}
    try:
        return json.loads((root / oracle["target_tests"]).read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise SuiteError(f"{root}: target test list {oracle['target_tests']} does not exist") from error


def _material(root: Path, raw: dict[str, Any], *, judged: bool, targets: dict[str, list[str]]) -> Material:
    required = raw.get("required_inputs", [])
    if not isinstance(required, list) or any(not isinstance(path, str) or not path.strip() for path in required):
        raise SuiteError(f"{root.name}/{raw['id']}: required_inputs must be a list of non-empty paths")
    # A judged material says what should be reported, even when that is nothing; the others have no seeds.
    seeds = tuple(Seed(id=seed["id"], kind=seed["kind"], where=seed["where"], truth=seed["truth"],
                       op=seed.get("op"), check=seed.get("check"), quote=seed.get("quote"),
                       files=tuple(seed.get("files", ())), severity=seed.get("severity"),
                       edits=tuple(seed.get("ops", ())), inside=seed.get("in"))
                  for seed in (raw["seeds"] if judged else raw.get("seeds", ())))
    task = raw.get("task")
    if task is not None:
        task = {**task, "target_tests": targets.get(raw["id"])}
    return Material(id=raw["id"], target=raw["target"], brief=root / raw["brief"], tags=tuple(raw.get("tags", ())),
                    prepare=tuple(raw.get("prepare", ())), seeds=seeds, contract=raw.get("contract"),
                    known_issues=tuple(raw.get("known_issues", ())), fixture=raw.get("fixture"),
                    required_inputs=tuple(raw.get("required_inputs", ())), base=raw.get("base"), source=raw.get("source"),
                    paths=tuple(raw.get("material_paths", ())), task=task, defects=tuple(raw.get("defects", ())),
                    expected=raw.get("expected"), allowed_write=tuple(raw.get("allowed_write", ())),
                    delivery_note=root / raw["delivery_note"] if raw.get("delivery_note") else None)


def _check(flow: Flow) -> None:
    if flow.id != flow.root.name:
        raise SuiteError(f"flow id {flow.id!r} must equal its directory name {flow.root.name!r}")
    if flow.family not in FAMILIES:
        raise SuiteError(f"{flow.id}: unknown family {flow.family!r}")
    if flow.reps < 1:
        raise SuiteError(f"{flow.id}: reps must be at least 1")
    if flow.kind not in WORKSPACE_KINDS:
        raise SuiteError(f"{flow.id}: unknown workspace kind {flow.kind!r}")
    for key in WORKSPACE_KEYS[flow.kind]:
        if key not in flow.workspace:
            raise SuiteError(f"{flow.id}: workspace lacks {key!r}")
    _check_family(flow)
    if flow.kind == "material" and any(key in flow.workspace for key in ("base", "source", "material_paths")):
        raise SuiteError(f"{flow.id}: historical material source protocol is retired")
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
        if flow.kind == "material":
            flow.fixture(material)
            if material.base or material.source or material.paths:
                raise SuiteError(f"{flow.id}/{material.id}: historical material source protocol is retired")
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


def _check_family(flow: Flow) -> None:
    """What each family and each kind of copy needs beyond the common fields."""
    where = flow.id
    if flow.kind == "checkout":
        if flow.workspace["commit"] not in COMMIT_MODES:
            raise SuiteError(f"{where}: workspace commit must be one of {COMMIT_MODES}")
        if not any(".meta_harness/agents/evaluation" == path for path in flow.workspace["excludes"]):
            raise SuiteError(f"{where}: a checkout excludes the evaluation directory, where the truth is")
        if flow.family == "review" and flow.workspace["commit"] != "delivery":
            raise SuiteError(f"{where}: a review on a checkout reviews a delivery commit")
        if flow.workspace["commit"] == "delivery":
            for key in ("delivery", "member", "rebuild"):
                if key not in flow.workspace:
                    raise SuiteError(f"{where}: a delivery commit needs workspace {key!r}")
    elif flow.family != "review":
        raise SuiteError(f"{where}: a {flow.family} flow works on a checkout")
    needs = {"implement": ("member", "tests_dir", "test", "typecheck", "format", "target_tests"),
             "acceptance": ("member", "tests_dir", "report_glob", "artefact", "ground_truth"),
             "write-tests": ("member", "tests_dir", "test", "typecheck")}.get(flow.family, ())
    for key in needs:
        if key not in flow.oracle:
            raise SuiteError(f"{where}: oracle lacks {key!r}")
    if flow.family in FRAMED and (flow.brief_frame is None or not flow.brief_frame.is_file()):
        raise SuiteError(f"{where}: a flow of the {flow.family} family fills its task briefs into a brief_frame")
    if flow.family == "write-tests":
        for material in flow.materials:
            _check_mutants(f"{where}/{material.id}", material.task or {})
    if flow.family == "implement":
        for material in flow.materials:
            task = material.task or {}
            for key in ("stub", "hidden_tests", "allowed_write"):
                if key not in task:
                    raise SuiteError(f"{where}/{material.id}: task lacks {key!r}")
            if not task["target_tests"]:
                raise SuiteError(f"{where}/{material.id}: {flow.oracle['target_tests']} has no entry for it")
            if not (flow.root / task["stub"]).is_dir():
                raise SuiteError(f"{where}/{material.id}: stub {task['stub']} does not exist")
    if flow.family == "acceptance":
        if not flow.criteria or "rebuild" not in flow.workspace:
            raise SuiteError(f"{where}: an acceptance flow lists its criteria and how to rebuild the artefact")
        if not (flow.root / flow.oracle["ground_truth"]).is_file():
            raise SuiteError(f"{where}: ground truth script {flow.oracle['ground_truth']} does not exist")
        for material in flow.materials:
            expected = material.expected or {}
            if ("verdict" in expected) == ("verdict_not" in expected) or "failing_criteria" not in expected:
                raise SuiteError(f"{where}/{material.id}: expected gives verdict or verdict_not, and failing_criteria")
            unknown = {*expected["failing_criteria"], *expected.get("either", ())} - set(flow.criteria)
            if unknown:
                raise SuiteError(f"{where}/{material.id}: criteria {sorted(unknown)} are not listed")
            if not material.allowed_write:
                raise SuiteError(f"{where}/{material.id}: allowed_write is the write scope the run is held to")
    for material in flow.materials:
        if material.delivery_note is not None and not material.delivery_note.is_file():
            raise SuiteError(f"{where}/{material.id}: delivery note {material.delivery_note.name} does not exist")


def _check_mutants(where: str, task: dict[str, Any]) -> None:
    """A write-tests task names the module, the tests taken away, the write scope and mutants that each change it."""
    for key in ("target", "hidden_tests", "allowed_write", "mutants"):
        if key not in task:
            raise SuiteError(f"{where}: task lacks {key!r}")
    if not task["mutants"]:
        raise SuiteError(f"{where}: a write-tests task holds the tests against at least one mutant")
    ids = []
    for mutant in task["mutants"]:
        missing = [key for key in MUTANT_KEYS if key not in mutant]
        if missing:
            raise SuiteError(f"{where}: a mutant lacks {missing}")
        if not mutant["find"] or mutant["find"] == mutant["replace"]:
            raise SuiteError(f"{where}.{mutant['id']}: a mutant replaces some text of the module with other text")
        ids.append(mutant["id"])
    if len(set(ids)) != len(ids):
        raise SuiteError(f"{where}: duplicate mutant ids")
