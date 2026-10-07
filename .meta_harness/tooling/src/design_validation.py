"""Self-contained validation for a meta-harness design information tree.

The validator deliberately receives a design root.  It never discovers a product
repository or assumes that ``docs/`` and ``spec/`` exist beside the meta-harness.
Only Python's standard library is used so a copied workspace can run the checks
without importing the old repository-owned spec-tools package.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from typing import Any, Iterable
from source_links import ModuleSources

from urllib.parse import unquote, urldefrag, urljoin, urlparse


FORMAT = 1
ALLOWED_FAMILIES = {"data", "capabilities", "compositions"}
ALLOWED_STATUSES = {"candidate", "accepted", "superseded", "withdrawn"}
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)|!\[[^\]]*\]\(([^)]+)\)")
HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$")


class _ExplicitAnchors(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.anchors: set[str] = set()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self.anchors.update(value for name, value in attrs
                                if name in {"id", "name"} and value is not None)


def explicit_markdown_anchors(text: str) -> set[str]:
    """Read actual HTML anchors, excluding fenced, indented and inline code."""
    parser = _ExplicitAnchors()
    fence: tuple[str, int] | None = None
    lines: list[str] = []
    for line in text.splitlines():
        marker = re.match(r"^ {0,3}(`{3,}|~{3,})(.*)$", line)
        if fence is not None:
            if (marker and marker[1][0] == fence[0] and len(marker[1]) >= fence[1]
                    and not marker[2].strip()):
                fence = None
            continue
        if marker and (marker[1][0] != "`" or "`" not in marker[2]):
            fence = (marker[1][0], len(marker[1]))
            continue
        if line.startswith(("    ", "\t")):
            continue
        lines.append(line)
    # Code spans can cross lines; only an equal-length run closes a span.
    plain = re.sub(r"(?<!`)(`+)(?!`)(.*?)(?<!`)\1(?!`)", "", "\n".join(lines),
                   flags=re.S)
    plain = re.sub(r"(?<!\\)((?:\\\\)*)\\<", r"\1&lt;", plain)
    parser.feed(plain)
    parser.close()
    return parser.anchors


@dataclass(frozen=True, order=True)
class Coordinate:
    baseline_id: str
    contract_id: str
    version: int

    @classmethod
    def read(cls, value: Any, where: str) -> "Coordinate":
        obj = require_object(value, where)
        require_keys(obj, {"baseline_id", "contract_id", "version"}, where)
        baseline = require_text(obj.get("baseline_id"), f"{where}.baseline_id")
        contract = require_text(obj.get("contract_id"), f"{where}.contract_id")
        version = obj.get("version")
        if not isinstance(version, int) or isinstance(version, bool) or version < 1:
            raise Invalid(f"{where}.version must be a positive integer")
        return cls(baseline, contract, version)

    def label(self) -> str:
        return f"({self.baseline_id}, {self.contract_id}, {self.version})"


class Invalid(ValueError):
    """An input or design-tree validation failure."""


def require_object(value: Any, where: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise Invalid(f"{where} must be an object")
    return value


def require_list(value: Any, where: str) -> list[Any]:
    if not isinstance(value, list):
        raise Invalid(f"{where} must be an array")
    return value


def require_text(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise Invalid(f"{where} must be a non-empty string")
    return value


def require_keys(value: dict[str, Any], keys: set[str], where: str) -> None:
    missing = sorted(keys - value.keys())
    if missing:
        raise Invalid(f"{where} is missing required keys: {', '.join(missing)}")


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise Invalid(f"required manifest is missing: {path}") from error
    except json.JSONDecodeError as error:
        raise Invalid(f"invalid JSON in {path}:{error.lineno}:{error.colno}: {error.msg}") from error


def checked_path(root: Path, relative: Any, where: str) -> Path:
    raw = require_text(relative, where)
    pure = PurePosixPath(raw)
    if pure.is_absolute() or ".." in pure.parts or raw != pure.as_posix():
        raise Invalid(f"{where} must be a normalized path below the design root: {raw}")
    result = root.joinpath(*pure.parts)
    try:
        result.resolve(strict=False).relative_to(root.resolve())
    except ValueError as error:
        raise Invalid(f"{where} escapes the design root: {raw}") from error
    return result


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def expected_schema_id(namespace: str, baseline_id: str, family: str, topic: str,
                       version: int, resource: str) -> str:
    return f"{namespace}/{baseline_id}/spec/{family}/{topic}/v{version}/{resource}"


def walk_refs(node: Any, location: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(node, dict):
        for key, value in node.items():
            child = f"{location}.{key}"
            if key in {"$ref", "$dynamicRef"}:
                if not isinstance(value, str) or not value:
                    raise Invalid(f"{child} must be a non-empty string")
                yield child, value
            yield from walk_refs(value, child)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from walk_refs(value, f"{location}[{index}]")


def resolve_pointer(document: Any, fragment: str, where: str) -> None:
    if fragment == "":
        return
    decoded = unquote(fragment)
    if not decoded.startswith("/"):
        raise Invalid(f"{where} uses unsupported non-JSON-Pointer fragment: #{fragment}")
    current = document
    for raw in decoded[1:].split("/"):
        token = raw.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict) and token in current:
            current = current[token]
        elif isinstance(current, list) and token.isdigit() and int(token) < len(current):
            current = current[int(token)]
        else:
            raise Invalid(f"{where} has unresolved JSON Pointer token {token!r}: #{fragment}")


def github_anchor(text: str) -> str:
    # 标题里的链接按显示文字计入锚点，URL 不计：`## [记录与上下文](terms/x.md)` 的锚点是
    # `记录与上下文`。不先解析就会把路径里的字符一起算进去，得到根本不存在的锚点。
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[`*_~]", "", text.strip().lower())
    text = re.sub(r"[^\w\-\s\u4e00-\u9fff]", "", text)
    # \u6bcf\u4e2a\u7a7a\u767d\u5404\u751f\u6210\u4e00\u4e2a\u8fde\u5b57\u7b26\uff0c\u4e0d\u5408\u5e76\uff1aGitHub \u5c31\u662f\u8fd9\u4e48\u505a\u7684\u3002
    # `UL-x \u00b7 \u4e2d\u6587 \u00b7 English` \u53bb\u6389 `\u00b7` \u540e\u7559\u4e0b\u4e24\u4e2a\u7a7a\u683c\uff0c\u951a\u70b9\u56e0\u6b64\u662f `--`\uff0c\u7528 `\s+` \u4f1a\u7b97\u6210 `-`\u3002
    return re.sub(r"\s", "-", text)


class DesignValidator:
    def __init__(self, root: Path, *, previous_frozen: Path | None = None,
                 formal: str = "registered", gate: str = "internal",
                 source_root: Path | None = None) -> None:
        self.root = root.resolve()
        self.source_root = source_root
        # 清单可以直接放在设计根下，也可以集中在 registry/ 一区；两种布局都支持，
        # 因为它只改变清单的存放位置，不改变被登记资源的坐标——资源路径一律相对 root 解析。
        registry = self.root / "registry"
        self.manifests = registry if (registry / "baseline.json").is_file() else self.root
        self.previous_frozen = previous_frozen
        self.formal = formal
        self.gate = gate
        self.errors: list[str] = []
        self.notes: list[str] = []
        self.baseline_id = ""
        self.namespace = ""
        self.coordinates: dict[Coordinate, dict[str, Any]] = {}
        self.resource_paths: dict[Path, Coordinate] = {}
        self.schema_documents: dict[str, tuple[Path, Any]] = {}
        self.rebase_relations: dict[str, dict[str, Any]] = {}
        self.retired: set[tuple[str, str]] = set()
        self.retired_contract_ids: set[str] = set()
        self.legacy_baseline_ids: set[str] = set()
        self.version_policy: dict[str, Any] = {}
        self.consumer_observations: dict[str, dict[str, Any]] = {}

    def error(self, message: str) -> None:
        self.errors.append(message)

    def capture(self, label: str, action: Any) -> Any:
        try:
            return action()
        except (Invalid, OSError) as error:
            self.error(f"{label}: {error}")
            return None

    def validate(self) -> tuple[list[str], list[str]]:
        baseline = self.capture("baseline.json", lambda: load_json(self.manifests / "baseline.json"))
        if baseline is None or not self._baseline(baseline):
            return self.errors, self.notes
        # 重基清单只在从旧 baseline 接续时存在；全新 baseline 没有要接续的关系，
        # 缺它不是错误。存在则必须合法。
        rebase_path = self.manifests / "lineage.json"
        if rebase_path.is_file():
            rebase = self.capture("lineage.json", lambda: load_json(rebase_path))
            if rebase is not None:
                self._rebase(rebase)
        catalog = self.capture("catalog.json", lambda: load_json(self.manifests / "catalog.json"))
        if catalog is not None:
            self._catalog(catalog)
            self._rebase_targets()
        self._schemas()
        self._markdown()
        frozen = self.capture("frozen.json", lambda: load_json(self.manifests / "frozen.json"))
        if frozen is not None:
            self._frozen(frozen)
        tasks = self.capture("formal-tasks.json", lambda: load_json(self.manifests / "formal-tasks.json"))
        if tasks is not None:
            self._formal(tasks)
        return self.errors, self.notes

    def _baseline(self, raw: Any) -> bool:
        try:
            data = require_object(raw, "baseline.json")
            require_keys(data, {"format", "baseline_id", "schema_namespace",
                                "legacy_baseline_ids", "version_policy"}, "baseline.json")
            if data["format"] != FORMAT:
                raise Invalid(f"baseline.json.format must be {FORMAT}")
            self.baseline_id = require_text(data["baseline_id"], "baseline.json.baseline_id")
            namespace = require_text(data["schema_namespace"], "baseline.json.schema_namespace").rstrip("/")
            parsed = urlparse(namespace)
            if parsed.scheme != "https" or not parsed.netloc or parsed.query or parsed.fragment:
                raise Invalid("baseline.json.schema_namespace must be an absolute https URL without query/fragment")
            self.namespace = namespace
            policy = require_object(data["version_policy"], "baseline.json.version_policy")
            require_keys(policy, {"kind"}, "baseline.json.version_policy")
            if policy["kind"] == "initial-uniform":
                version = policy.get("version")
                if not isinstance(version, int) or isinstance(version, bool) or version < 1:
                    raise Invalid("baseline.json.version_policy.version must be a positive integer")
            elif policy["kind"] != "evolving":
                raise Invalid("baseline.json.version_policy.kind must be initial-uniform or evolving")
            self.version_policy = policy
            legacy = require_list(data["legacy_baseline_ids"], "baseline.json.legacy_baseline_ids")
            self.legacy_baseline_ids = {
                require_text(v, "baseline.json.legacy_baseline_ids[]") for v in legacy
            }
            if self.baseline_id in self.legacy_baseline_ids:
                raise Invalid("current baseline_id cannot also be a legacy baseline id")
            return True
        except Invalid as error:
            self.error(str(error))
            return False

    def _rebase(self, raw: Any) -> None:
        try:
            data = require_object(raw, "lineage.json")
            require_keys(data, {"format", "target_baseline_id", "relations", "retired_identities",
                                "consumer_observations"}, "lineage.json")
            if data["format"] != FORMAT:
                raise Invalid(f"lineage.json.format must be {FORMAT}")
            if data["target_baseline_id"] != self.baseline_id:
                raise Invalid("lineage.json.target_baseline_id differs from baseline.json")
            for index, raw_item in enumerate(require_list(data["retired_identities"],
                                                          "lineage.json.retired_identities")):
                where = f"lineage.json.retired_identities[{index}]"
                item = require_object(raw_item, where)
                require_keys(item, {"baseline_id", "contract_id", "reason"}, where)
                baseline = require_text(item["baseline_id"], f"{where}.baseline_id")
                contract = require_text(item["contract_id"], f"{where}.contract_id")
                require_text(item["reason"], f"{where}.reason")
                if baseline == self.baseline_id:
                    raise Invalid(f"{where} cannot retire an identity in the new baseline")
                if baseline not in self.legacy_baseline_ids:
                    raise Invalid(f"{where}.baseline_id is not declared as a legacy baseline")
                key = (baseline, contract)
                if key in self.retired:
                    raise Invalid(f"duplicate retired identity: {key}")
                self.retired.add(key)
                self.retired_contract_ids.add(contract)
            for index, raw_item in enumerate(require_list(data["relations"], "lineage.json.relations")):
                where = f"lineage.json.relations[{index}]"
                item = require_object(raw_item, where)
                require_keys(item, {"id", "source", "source_clauses", "disposition", "target",
                                    "target_clauses", "clause_mappings", "consumers",
                                    "current_bindings", "freeze_gate"}, where)
                identity = require_text(item["id"], f"{where}.id")
                if identity in self.rebase_relations:
                    raise Invalid(f"duplicate rebase relation id: {identity}")
                source = Coordinate.read(item["source"], f"{where}.source")
                if source.baseline_id not in self.legacy_baseline_ids:
                    raise Invalid(f"{where}.source must belong to a declared legacy baseline")
                disposition = item["disposition"]
                if disposition not in {"rebase", "retired", "historical"}:
                    raise Invalid(f"{where}.disposition is invalid: {disposition!r}")
                target = None if item["target"] is None else Coordinate.read(item["target"], f"{where}.target")
                source_clauses = self._clauses(item["source_clauses"], f"{where}.source_clauses")
                target_clauses = self._clauses(item["target_clauses"], f"{where}.target_clauses",
                                               allow_empty=target is None)
                mappings = require_list(item["clause_mappings"], f"{where}.clause_mappings")
                mapped_source: set[str] = set()
                mapped_target: set[str] = set()
                for map_index, raw_mapping in enumerate(mappings):
                    map_where = f"{where}.clause_mappings[{map_index}]"
                    mapping = require_object(raw_mapping, map_where)
                    require_keys(mapping, {"source", "target"}, map_where)
                    source_clause = require_text(mapping["source"], f"{map_where}.source")
                    target_clause = require_text(mapping["target"], f"{map_where}.target")
                    if source_clause not in source_clauses or target_clause not in target_clauses:
                        raise Invalid(f"{map_where} must use declared source/target clauses")
                    mapped_source.add(source_clause)
                    mapped_target.add(target_clause)
                consumers = require_list(item["consumers"], f"{where}.consumers")
                if any(not isinstance(value, str) or not value for value in consumers):
                    raise Invalid(f"{where}.consumers must contain non-empty consumer identities")
                if len(set(consumers)) != len(consumers):
                    raise Invalid(f"{where}.consumers contains duplicates")
                current_bindings = self._binding_list(item["current_bindings"],
                                                       f"{where}.release_evidence")
                gate = require_object(item["freeze_gate"], f"{where}.freeze_gate")
                require_keys(gate, {"blocked", "reason"}, f"{where}.freeze_gate")
                if not isinstance(gate["blocked"], bool):
                    raise Invalid(f"{where}.freeze_gate.blocked must be boolean")
                if gate["blocked"]:
                    require_text(gate["reason"], f"{where}.freeze_gate.reason")
                if disposition == "rebase" and (target is None or target.baseline_id != self.baseline_id):
                    raise Invalid(f"{where} rebase must target the current baseline")
                if disposition != "rebase" and target is not None:
                    raise Invalid(f"{where} {disposition} relation cannot have a target")
                if target is None and target_clauses:
                    raise Invalid(f"{where}.target_clauses must be empty when target is null")
                if disposition == "rebase" and (mapped_source != source_clauses or mapped_target != target_clauses):
                    raise Invalid(f"{where}.clause_mappings must cover every declared source and target clause")
                item["_source"] = source
                item["_target"] = target
                item["_source_clauses"] = source_clauses
                item["_target_clauses"] = target_clauses
                item["_current_bindings"] = current_bindings
                self.rebase_relations[identity] = item
            for index, raw_item in enumerate(require_list(data["consumer_observations"],
                                                          "lineage.json.consumer_observations")):
                where = f"lineage.json.consumer_observations[{index}]"
                item = require_object(raw_item, where)
                require_keys(item, {"consumer", "consumes", "status", "current_binding"}, where)
                consumer = require_text(item["consumer"], f"{where}.consumer")
                if consumer in self.consumer_observations:
                    raise Invalid(f"duplicate consumer observation: {consumer}")
                coordinate = Coordinate.read(item["consumes"], f"{where}.consumes")
                status = item["status"]
                if status not in {"observed-legacy", "current", "unknown"}:
                    raise Invalid(f"{where}.status is invalid: {status!r}")
                binding = self._current_binding(item["current_binding"], f"{where}.current_binding")
                if status == "observed-legacy" and coordinate.baseline_id == self.baseline_id:
                    raise Invalid(f"{where} labels a current-baseline coordinate as legacy")
                if status == "observed-legacy" and coordinate.baseline_id not in self.legacy_baseline_ids:
                    raise Invalid(f"{where} uses an undeclared legacy baseline")
                if status == "current" and coordinate.baseline_id != self.baseline_id:
                    raise Invalid(f"{where} labels a non-current coordinate as current")
                item["_coordinate"] = coordinate
                item["_current_binding"] = binding
                self.consumer_observations[consumer] = item
                if self.gate == "release" and status == "unknown":
                    raise Invalid(f"{where} is unknown and blocks the release gate")
        except Invalid as error:
            self.error(str(error))

    def _clauses(self, raw: Any, where: str, *, allow_empty: bool = False) -> set[str]:
        values = require_list(raw, where)
        if (not values and not allow_empty
                or any(not isinstance(value, str) or not value.strip() for value in values)):
            raise Invalid(f"{where} must contain non-empty clause identities")
        if len(set(values)) != len(values):
            raise Invalid(f"{where} contains duplicate clause identities")
        return set(values)

    def _current_binding(self, raw: Any, where: str) -> dict[str, Any]:
        binding = require_object(raw, where)
        require_keys(binding, {"owner_path"}, where)
        if set(binding) != {"owner_path"}:
            raise Invalid(f"{where} contains process/provenance fields")
        path = checked_path(self.root, binding["owner_path"], f"{where}.owner_path")
        relative = path.relative_to(self.root.resolve()).as_posix()
        if (not path.is_file() or not relative.startswith(
                ("spec/", "realization/", "product/", "architecture/", "basis/", "foundation/"))):
            raise Invalid(f"{where} must identify an existing current semantic owner")
        return binding

    def _binding_list(self, raw: Any, where: str) -> list[dict[str, Any]]:
        return [self._current_binding(item, f"{where}[{index}]")
                for index, item in enumerate(require_list(raw, where))]

    def _catalog(self, raw: Any) -> None:
        try:
            data = require_object(raw, "catalog.json")
            require_keys(data, {"format", "baseline_id", "contracts"}, "catalog.json")
            if data["format"] != FORMAT:
                raise Invalid(f"catalog.json.format must be {FORMAT}")
            if data["baseline_id"] != self.baseline_id:
                raise Invalid("catalog.json.baseline_id differs from baseline.json")
            for index, raw_item in enumerate(require_list(data["contracts"], "catalog.json.contracts")):
                where = f"catalog.json.contracts[{index}]"
                item = require_object(raw_item, where)
                require_keys(item, {"coordinate", "family", "topic", "status", "contract_path",
                                    "resources", "acceptance", "dependencies"}, where)
                coordinate = Coordinate.read(item["coordinate"], f"{where}.coordinate")
                if coordinate.baseline_id != self.baseline_id:
                    raise Invalid(f"{where} mixes baseline {coordinate.baseline_id!r} into current catalog")
                if (self.version_policy["kind"] == "initial-uniform"
                        and coordinate.version != self.version_policy["version"]):
                    raise Invalid(f"{where} must use initial migration version "
                                  f"{self.version_policy['version']}")
                if coordinate.contract_id in self.retired_contract_ids:
                    raise Invalid(f"retired contract identity was revived in the new baseline: "
                                  f"{coordinate.label()}")
                if coordinate in self.coordinates:
                    old = self.coordinates[coordinate]
                    raise Invalid(f"duplicate coordinate (same identity may hide different content): "
                                  f"{coordinate.label()} at {old['_where']} and {where}")
                family = item["family"]
                if family not in ALLOWED_FAMILIES:
                    raise Invalid(f"{where}.family is invalid: {family!r}")
                topic = require_text(item["topic"], f"{where}.topic")
                if "/" in topic or topic in {".", ".."}:
                    raise Invalid(f"{where}.topic must be one path segment")
                status = item["status"]
                if status not in ALLOWED_STATUSES:
                    raise Invalid(f"{where}.status is invalid: {status!r}")
                expected_dir = PurePosixPath("spec", family, topic, f"v{coordinate.version}")
                contract_path = checked_path(self.root, item["contract_path"], f"{where}.contract_path")
                if PurePosixPath(item["contract_path"]).parent != expected_dir:
                    raise Invalid(f"{where}.contract_path must be below {expected_dir.as_posix()}")
                if not contract_path.is_file():
                    raise Invalid(f"{where}.contract_path does not exist: {item['contract_path']}")
                resources = require_list(item["resources"], f"{where}.resources")
                resource_paths: list[Path] = []
                if item["contract_path"] not in resources:
                    raise Invalid(f"{where}.resources must include contract_path")
                for rindex, raw_path in enumerate(resources):
                    path_where = f"{where}.resources[{rindex}]"
                    path = checked_path(self.root, raw_path, path_where)
                    if not PurePosixPath(raw_path).is_relative_to(expected_dir):
                        raise Invalid(f"{path_where} must be below {expected_dir.as_posix()}")
                    if not path.is_file():
                        raise Invalid(f"{path_where} does not exist: {raw_path}")
                    if path in self.resource_paths:
                        raise Invalid(f"resource registered by two coordinates: {raw_path}")
                    self.resource_paths[path] = coordinate
                    resource_paths.append(path)
                acceptance = item["acceptance"]
                if status == "accepted":
                    if acceptance is None:
                        raise Invalid(f"{where}.acceptance is required for accepted contract")
                    self._acceptance(acceptance, item["contract_path"], f"{where}.acceptance")
                elif acceptance is not None:
                    raise Invalid(f"{where}.acceptance is only valid for an accepted contract")
                item["_where"] = where
                item["_paths"] = resource_paths
                self.coordinates[coordinate] = item
            for coordinate, item in self.coordinates.items():
                self._dependencies(coordinate, item)
        except Invalid as error:
            self.error(str(error))

    def _dependencies(self, owner: Coordinate, item: dict[str, Any]) -> None:
        where = item["_where"]
        try:
            seen: set[Coordinate] = set()
            for index, raw_dep in enumerate(require_list(item["dependencies"], f"{where}.dependencies")):
                dep_where = f"{where}.dependencies[{index}]"
                dep = require_object(raw_dep, dep_where)
                require_keys(dep, {"coordinate", "clauses", "rebase_relation"}, dep_where)
                coordinate = Coordinate.read(dep["coordinate"], f"{dep_where}.coordinate")
                clauses = require_list(dep["clauses"], f"{dep_where}.clauses")
                if not clauses or any(not isinstance(v, str) or not v.strip() for v in clauses):
                    raise Invalid(f"{dep_where}.clauses must contain non-empty clause identities")
                if coordinate in seen:
                    raise Invalid(f"duplicate dependency from {owner.label()} to {coordinate.label()}")
                seen.add(coordinate)
                relation_id = dep["rebase_relation"]
                if coordinate.baseline_id == self.baseline_id:
                    if relation_id is not None:
                        raise Invalid(f"{dep_where} current-baseline dependency cannot use rebase_relation")
                    if coordinate not in self.coordinates:
                        raise Invalid(f"{dep_where} has unknown exact coordinate: {coordinate.label()}")
                    if item["status"] == "accepted" and self.coordinates[coordinate]["status"] != "accepted":
                        raise Invalid(f"{dep_where} accepted contract depends on non-accepted coordinate: "
                                      f"{coordinate.label()}")
                    continue
                relation_id = require_text(relation_id, f"{dep_where}.rebase_relation")
                relation = self.rebase_relations.get(relation_id)
                if relation is None:
                    raise Invalid(f"{dep_where} has no explicit rebase relation: {relation_id}")
                if relation["_source"] != coordinate:
                    raise Invalid(f"{dep_where} coordinate differs from rebase relation source")
                if relation["freeze_gate"]["blocked"]:
                    raise Invalid(f"{dep_where} is blocked by freeze_gate {relation_id}: "
                                  f"{relation['freeze_gate']['reason']}")
                target = relation["_target"]
                if relation["disposition"] != "rebase" or target not in self.coordinates:
                    raise Invalid(f"{dep_where} relation {relation_id} does not resolve to a current coordinate")
                if item["status"] == "accepted" and self.coordinates[target]["status"] != "accepted":
                    raise Invalid(f"{dep_where} accepted legacy dependency maps to non-accepted target: "
                                  f"{target.label()}")
                if not set(clauses).issubset(relation["_source_clauses"]):
                    missing = sorted(set(clauses) - relation["_source_clauses"])
                    raise Invalid(f"{dep_where} clauses are outside relation {relation_id}: {missing}")
                if (coordinate.baseline_id, coordinate.contract_id) in self.retired:
                    raise Invalid(f"{dep_where} references retired identity {coordinate.label()}; "
                                  "map the consumed clauses to a live capability before acceptance")
        except Invalid as error:
            self.error(str(error))

    def _rebase_targets(self) -> None:
        for identity, relation in self.rebase_relations.items():
            target = relation["_target"]
            if (relation["disposition"] == "rebase"
                    and not relation["freeze_gate"]["blocked"]
                    and target not in self.coordinates):
                self.error(f"rebase relation {identity} has no exact target in catalog: {target.label()}")
            missing_consumers = sorted(set(relation["consumers"]) - self.consumer_observations.keys())
            if missing_consumers:
                self.error(f"rebase relation {identity} names consumers without observations: "
                           f"{', '.join(missing_consumers)}")
            for consumer in set(relation["consumers"]) & self.consumer_observations.keys():
                consumed = self.consumer_observations[consumer]["_coordinate"]
                if consumed not in {relation["_source"], relation["_target"]}:
                    self.error(f"rebase relation {identity} consumer {consumer} observes unrelated "
                               f"coordinate: {consumed.label()}")
            if self.gate == "release" and relation["freeze_gate"]["blocked"]:
                self.error(f"rebase relation {identity} is blocked at release: "
                           f"{relation['freeze_gate']['reason']}")
            if self.gate == "release" and not relation["_current_bindings"]:
                self.error(f"rebase relation {identity} has no current bindings")
        for consumer, observation in self.consumer_observations.items():
            coordinate = observation["_coordinate"]
            if observation["status"] == "current" and coordinate not in self.coordinates:
                self.error(f"verified-current consumer {consumer} has no exact catalog coordinate: "
                           f"{coordinate.label()}")

    def _acceptance(self, raw: Any, contract_path: str, where: str) -> None:
        data = require_object(raw, where)
        require_keys(data, {"scope_path", "scope_clauses"}, where)
        if set(data) != {"scope_path", "scope_clauses"}:
            raise Invalid(f"{where} contains process/provenance fields")
        if data["scope_path"] != contract_path:
            raise Invalid(f"{where}.scope_path must match this exact contract_path")
        scope = checked_path(self.root, data["scope_path"], f"{where}.scope_path")
        if not scope.is_file():
            raise Invalid(f"{where}.scope_path does not exist")
        self._clauses(data["scope_clauses"], f"{where}.scope_clauses")

    def _schemas(self) -> None:
        for path, coordinate in sorted(self.resource_paths.items()):
            if path.suffix != ".json" or not path.name.endswith("schema.json"):
                continue
            raw = self.capture(path.relative_to(self.root).as_posix(), lambda p=path: load_json(p))
            if raw is None:
                continue
            try:
                schema = require_object(raw, str(path.relative_to(self.root)))
                schema_id = require_text(schema.get("$id"), f"{path.relative_to(self.root)}.$id")
                relative = path.relative_to(self.root)
                _, family, topic, version, *resource_parts = relative.parts
                resource = "/".join(resource_parts)
                expected = expected_schema_id(self.namespace, self.baseline_id, family, topic,
                                              int(version[1:]), resource)
                if schema_id != expected:
                    raise Invalid(f"{relative} has wrong $id: expected {expected}, got {schema_id}")
                if schema_id in self.schema_documents:
                    other = self.schema_documents[schema_id][0]
                    raise Invalid(f"duplicate schema $id with potentially different content: "
                                  f"{other.relative_to(self.root)} and {relative}")
                self.schema_documents[schema_id] = (path, schema)
            except (Invalid, ValueError) as error:
                self.error(str(error))
        for schema_id, (path, schema) in sorted(self.schema_documents.items()):
            for location, reference in walk_refs(schema):
                try:
                    absolute, fragment = urldefrag(urljoin(schema_id, reference))
                    if absolute not in self.schema_documents:
                        raise Invalid(f"unresolved schema resource {absolute}")
                    target_path, document = self.schema_documents[absolute]
                    resolve_pointer(document, fragment,
                                    f"{path.relative_to(self.root)} {location} -> {target_path.relative_to(self.root)}")
                except Invalid as error:
                    self.error(f"{path.relative_to(self.root)} {location}={reference!r}: {error}")

    def _markdown(self) -> None:
        markdown = sorted(p for p in self.root.rglob("*.md") if ".templates" not in p.parts
                          and not p.is_relative_to(self.root / "record"))
        anchors: dict[Path, set[str]] = {}
        try:
            modules = ModuleSources(self.source_root)
        except (ValueError, OSError, TypeError) as error:
            self.error(f"source links: {error}")
            return
        workspace = self.root.parent if (self.root.name == "design" and
                                         self.root.parent.name == ".meta_harness") else None

        def anchors_for(path: Path) -> set[str]:
            if path in anchors:
                return anchors[path]
            found: set[str] = set()
            duplicates: dict[str, int] = {}
            for line in path.read_text(encoding="utf-8").splitlines():
                match = HEADING_RE.match(line)
                if match:
                    base = github_anchor(match.group(1))
                    count = duplicates.get(base, 0)
                    found.add(base if count == 0 else f"{base}-{count}")
                    duplicates[base] = count + 1
            found.update(explicit_markdown_anchors(path.read_text(encoding="utf-8")))
            anchors[path] = found
            return found

        def within(path: Path, root: Path) -> bool:
            try:
                path.relative_to(root)
                return True
            except ValueError:
                return False

        for path in markdown:
            text = path.read_text(encoding="utf-8")
            for match in LINK_RE.finditer(text):
                raw = (match.group(1) or match.group(2)).strip()
                if raw.startswith("<") and raw.endswith(">"):
                    raw = raw[1:-1]
                raw = raw.split(maxsplit=1)[0]
                parsed = urlparse(raw)
                if parsed.scheme or raw.startswith("//"):
                    continue
                target_raw, fragment = urldefrag(unquote(raw))
                target = path if not target_raw else (path.parent / target_raw)
                try:
                    resolved = target.resolve()
                except OSError:
                    self.error(f"{path.relative_to(self.root)}: link escapes design root: {raw}")
                    continue
                original = resolved
                if resolved.is_relative_to(self.root / "record"):
                    self.error(f"{path.relative_to(self.root)}: process record is not a current owner: {raw}")
                    continue
                try:
                    owned = modules.owns(resolved)
                except (ValueError, OSError) as error:
                    self.error(f"{path.relative_to(self.root)}: invalid module owner: {error}")
                    continue
                allowed = within(resolved, self.root) or owned
                if workspace is not None:
                    # design/ 是工作区的一区，不是自包含单元：它向 research/ 取事实、
                    # 向 agents/ 取方法。允许指向这些兄弟区，但仍禁止逃出工作区——
                    # 那才是「复制整个 .meta_harness 就能独立运行」真正要守住的边界。
                    allowed = (allowed or within(resolved, workspace / "agents") or
                               within(resolved, workspace / "research") or
                               resolved == workspace / "README.md" or
                               resolved == workspace / "AGENTS.md")
                if not allowed:
                    self.error(f"{path.relative_to(self.root)}: link escapes design root: {raw}")
                    continue
                if not resolved.is_file():
                    self.error(f"{path.relative_to(self.root)}: broken local link: {raw}")
                elif (fragment and original.suffix == ".md"
                      and unquote(fragment) not in anchors_for(resolved)
                      and github_anchor(unquote(fragment)) not in anchors_for(resolved)):
                    self.error(f"{path.relative_to(self.root)}: missing Markdown anchor: {raw}")

    def _frozen(self, raw: Any) -> None:
        try:
            data = require_object(raw, "frozen.json")
            require_keys(data, {"format", "baseline_id", "files"}, "frozen.json")
            if data["format"] != FORMAT or data["baseline_id"] != self.baseline_id:
                raise Invalid("frozen.json format/baseline_id differs from the active baseline")
            files = require_object(data["files"], "frozen.json.files")
            for relative, expected in files.items():
                path = checked_path(self.root, relative, f"frozen.json.files[{relative!r}]")
                if path not in self.resource_paths:
                    raise Invalid(f"frozen path is not a catalog resource: {relative}")
                require_text(expected, f"frozen.json.files[{relative!r}]")
                if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
                    raise Invalid(f"invalid SHA-256 in frozen.json: {relative}")
                if not path.is_file() or digest(path) != expected:
                    raise Invalid(f"frozen file changed: {relative}")
            if self.previous_frozen is not None:
                old = require_object(load_json(self.previous_frozen), str(self.previous_frozen))
                if old.get("baseline_id") != self.baseline_id:
                    raise Invalid("previous frozen manifest belongs to another baseline")
                old_files = require_object(old.get("files"), f"{self.previous_frozen}.files")
                for relative, expected in old_files.items():
                    if files.get(relative) != expected:
                        raise Invalid(f"previous frozen registration changed or was removed: {relative}")
                old_version_dirs = {
                    PurePosixPath(*PurePosixPath(relative).parts[:4])
                    for relative in old_files
                    if len(PurePosixPath(relative).parts) >= 5
                }
                additions_to_frozen_versions = sorted(
                    relative for relative in files
                    if (relative not in old_files
                        and PurePosixPath(*PurePosixPath(relative).parts[:4]) in old_version_dirs)
                )
                if additions_to_frozen_versions:
                    raise Invalid("resources were added to an already frozen version: " +
                                  ", ".join(additions_to_frozen_versions))
            accepted_resources = {
                path.relative_to(self.root).as_posix()
                for coordinate, item in self.coordinates.items()
                if item["status"] == "accepted"
                for path in item["_paths"]
            }
            missing = sorted(accepted_resources - files.keys())
            if missing:
                raise Invalid("accepted catalog resources are not frozen: " + ", ".join(missing))
        except Invalid as error:
            self.error(str(error))

    def _formal(self, raw: Any) -> None:
        try:
            data = require_object(raw, "formal-tasks.json")
            require_keys(data, {"format", "baseline_id", "tasks"}, "formal-tasks.json")
            if data["format"] != FORMAT or data["baseline_id"] != self.baseline_id:
                raise Invalid("formal-tasks.json format/baseline_id differs from the active baseline")
            seen: set[str] = set()
            tasks = require_list(data["tasks"], "formal-tasks.json.tasks")
            for index, raw_task in enumerate(tasks):
                where = f"formal-tasks.json.tasks[{index}]"
                task = require_object(raw_task, where)
                require_keys(task, {"id", "kind", "artifacts", "command"}, where)
                identity = require_text(task["id"], f"{where}.id")
                if identity in seen:
                    raise Invalid(f"duplicate formal task id: {identity}")
                seen.add(identity)
                if task["kind"] not in {"tla", "alloy"}:
                    raise Invalid(f"{where}.kind must be tla or alloy")
                artifacts = [checked_path(self.root, value, f"{where}.artifacts[]")
                             for value in require_list(task["artifacts"], f"{where}.artifacts")]
                if not artifacts or any(not p.is_file() for p in artifacts):
                    raise Invalid(f"{where}.artifacts must identify existing files")
                if any(p not in self.resource_paths for p in artifacts):
                    raise Invalid(f"{where}.artifacts must all be catalog resources")
                suffix = ".tla" if task["kind"] == "tla" else ".als"
                if not any(p.suffix == suffix for p in artifacts):
                    raise Invalid(f"{where} has no {suffix} model")
                command = require_list(task["command"], f"{where}.command")
                if not command or any(not isinstance(v, str) or not v for v in command):
                    raise Invalid(f"{where}.command must contain command arguments")
                if self.formal == "registered":
                    self.notes.append(f"FORMAL {identity}: registered; execution was not requested")
                elif self.formal == "skip":
                    self.notes.append(f"FORMAL {identity}: skipped by explicit --formal skip")
                else:
                    expanded = [os.path.expandvars(v) for v in command]
                    if any(re.search(r"\$\{?[A-Za-z_]", value) for value in expanded):
                        raise Invalid(f"formal task environment variable is unset: {identity}")
                    if not shutil.which(expanded[0]):
                        raise Invalid(f"formal task tool is missing: {identity} -> {expanded[0]}")
                    timeout = task.get("timeout_seconds", 60)
                    if not isinstance(timeout, int) or isinstance(timeout, bool) or timeout < 1:
                        raise Invalid(f"{where}.timeout_seconds must be a positive integer")
                    completed = subprocess.run(expanded, cwd=self.root, text=True,
                                               capture_output=True, timeout=timeout)
                    self.notes.append(f"FORMAL {identity}: executed; exit={completed.returncode}; "
                                      f"command={expanded!r}")
                    if completed.returncode:
                        detail = (completed.stdout + completed.stderr).strip()
                        raise Invalid(f"formal task failed: {identity} (exit {completed.returncode}): {detail}")
        except (Invalid, subprocess.TimeoutExpired) as error:
            self.error(str(error))
