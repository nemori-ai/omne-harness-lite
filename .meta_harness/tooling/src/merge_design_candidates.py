#!/usr/bin/env python3
"""Merge reviewed cumulative design candidates into one fail-closed manifest set."""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Callable


BASELINE_ID = "omne-harness-lite-design-2026-09-15"
SCHEMA_NAMESPACE = "https://omne-harness-lite.invalid/meta-harness"
LEGACY_BASELINE_ID = "omne-harness-lite-legacy-spec"
ALLOWED_COORDINATES = frozenset({
    "data.agent-runtime-identity@1",
    "data.core-work@1",
    "capability.live-agent@1",
    "capability.durable-records@1",
    "capability.engineering-observation@1",
    "capability.tenant-governance@1",
    "capability.action-authorization@1",
    "capability.account-identity@1",
    "capability.budget-accounting@1",
    "capability.session@1",
    "capability.run@1",
    "capability.run-driver@1",
    "capability.tools@1",
    "capability.human-decisions@1",
    "capability.command-input@1",
    "capability.model-execution@1",
    "capability.media-content@1",
    "capability.message-stream@1",
    "capability.external-hooks@1",
    "composition.agent-session-binding@1",
    "composition.core-work-coordination@1",
    "composition.account-registration@1",
    "composition.session-run-agent-lifecycles@1",
})
ALLOWED_RETIRED_IDENTITIES = frozenset({
    "capability.session-run",
    "proposal.outbound-stream",
})
MANIFESTS = ("catalog.json", "rebase-map.json", "frozen.json", "formal-tasks.json")


class MergeError(ValueError):
    pass


@dataclass(frozen=True)
class Candidate:
    label: str
    root: Path
    manifests: dict[str, dict[str, Any]]


def load_json(path: Path, where: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise MergeError(f"cannot read {where}: {error}") from error
    if not isinstance(value, dict) or value.get("format") != 1:
        raise MergeError(f"{where} must be a format=1 JSON object")
    return value


def relative_path(value: Any, where: str) -> str:
    if not isinstance(value, str) or not value:
        raise MergeError(f"{where} must be a non-empty relative path")
    pure = PurePosixPath(value)
    if pure.is_absolute() or ".." in pure.parts or pure.as_posix() != value:
        raise MergeError(f"{where} must be a normalized relative path: {value!r}")
    return value


def coordinate_key(raw: Any, where: str, *, expected_baseline: str = BASELINE_ID) -> str:
    if not isinstance(raw, dict):
        raise MergeError(f"{where} must be a coordinate object")
    required = {"baseline_id", "contract_id", "version"}
    if not required.issubset(raw):
        raise MergeError(f"{where} is missing coordinate fields")
    if raw["baseline_id"] != expected_baseline:
        raise MergeError(
            f"{where} crosses baseline: expected {expected_baseline!r}, got {raw['baseline_id']!r}"
        )
    if not isinstance(raw["contract_id"], str) or not raw["contract_id"]:
        raise MergeError(f"{where}.contract_id must be a non-empty string")
    if not isinstance(raw["version"], int) or raw["version"] != 1:
        raise MergeError(f"{where}.version must be the uniform target version 1")
    key = f"{raw['contract_id']}@{raw['version']}"
    if key not in ALLOWED_COORDINATES:
        raise MergeError(f"{where} is outside the fixed coordinate allowlist: {key}")
    return key


def read_candidate(label: str, root: Path) -> Candidate:
    if not label or any(c.isspace() for c in label):
        raise MergeError(f"candidate label must be non-empty and contain no whitespace: {label!r}")
    baseline = load_json(root / "baseline.json", f"{label}/baseline.json")
    expected = {
        "baseline_id": BASELINE_ID,
        "schema_namespace": SCHEMA_NAMESPACE,
        "legacy_baseline_ids": [LEGACY_BASELINE_ID],
        "version_policy": {"kind": "initial-uniform", "version": 1},
    }
    for key, value in expected.items():
        if baseline.get(key) != value:
            raise MergeError(f"{label}/baseline.json has unexpected {key}: {baseline.get(key)!r}")
    manifests = {name: load_json(root / name, f"{label}/{name}") for name in MANIFESTS}
    for name, field in (
        ("catalog.json", "baseline_id"),
        ("frozen.json", "baseline_id"),
        ("formal-tasks.json", "baseline_id"),
    ):
        if manifests[name].get(field) != BASELINE_ID:
            raise MergeError(f"{label}/{name} has a cross-baseline {field}")
    if manifests["rebase-map.json"].get("target_baseline_id") != BASELINE_ID:
        raise MergeError(f"{label}/rebase-map.json has a cross-baseline target")
    return Candidate(label, root.resolve(), manifests)


def merge_keyed(
    candidates: list[Candidate],
    *,
    manifest: str,
    field: str,
    key_fn: Callable[[dict[str, Any], str], str],
    replacement_section: str,
    replacements: dict[str, dict[str, str]],
) -> list[dict[str, Any]]:
    selected: dict[str, tuple[str, dict[str, Any]]] = {}
    order: list[str] = []
    allowed_replacements = replacements.get(replacement_section, {})
    if not isinstance(allowed_replacements, dict):
        raise MergeError(f"replacements.{replacement_section} must be an object")
    for candidate in candidates:
        items = candidate.manifests[manifest].get(field)
        if not isinstance(items, list):
            raise MergeError(f"{candidate.label}/{manifest}.{field} must be an array")
        local: set[str] = set()
        for index, item in enumerate(items):
            where = f"{candidate.label}/{manifest}.{field}[{index}]"
            if not isinstance(item, dict):
                raise MergeError(f"{where} must be an object")
            key = key_fn(item, where)
            if key in local:
                raise MergeError(f"duplicate {replacement_section} key inside {candidate.label}: {key}")
            local.add(key)
            if key not in selected:
                selected[key] = (candidate.label, copy.deepcopy(item))
                order.append(key)
                continue
            prior_label, prior = selected[key]
            if prior == item:
                continue
            chosen = allowed_replacements.get(key)
            if chosen is None:
                raise MergeError(
                    f"conflicting duplicate {replacement_section} key {key!r} from "
                    f"{prior_label!r} and {candidate.label!r}; declare an explicit replacement"
                )
            if chosen == candidate.label:
                selected[key] = (candidate.label, copy.deepcopy(item))
            elif chosen != prior_label:
                raise MergeError(
                    f"replacement for {replacement_section} {key!r} selects {chosen!r}, "
                    f"but the conflicting sources are {prior_label!r}/{candidate.label!r}"
                )
    unused = set(allowed_replacements) - set(selected)
    if unused:
        raise MergeError(f"unused {replacement_section} replacement keys: {', '.join(sorted(unused))}")
    return [selected[key][1] for key in order]


def contract_key(item: dict[str, Any], where: str) -> str:
    return coordinate_key(item.get("coordinate"), f"{where}.coordinate")


def relation_key(item: dict[str, Any], where: str) -> str:
    value = item.get("id")
    if not isinstance(value, str) or not value:
        raise MergeError(f"{where}.id must be a non-empty string")
    source = item.get("source")
    if not isinstance(source, dict) or source.get("baseline_id") != LEGACY_BASELINE_ID:
        raise MergeError(f"{where}.source must use the declared legacy baseline")
    coordinate_key(item.get("target"), f"{where}.target")
    return value


def consumer_key(item: dict[str, Any], where: str) -> str:
    value = item.get("id", item.get("consumer"))
    if not isinstance(value, str) or not value:
        raise MergeError(f"{where} needs a non-empty id or consumer identity")
    return value


def task_key(item: dict[str, Any], where: str) -> str:
    value = item.get("id")
    if not isinstance(value, str) or not value:
        raise MergeError(f"{where}.id must be a non-empty string")
    return value


def retired_identity_key(item: dict[str, Any], where: str) -> str:
    required = {"baseline_id", "contract_id", "reason"}
    if set(item) != required:
        raise MergeError(f"{where} must contain exactly baseline_id/contract_id/reason")
    if item["baseline_id"] != LEGACY_BASELINE_ID:
        raise MergeError(f"{where}.baseline_id must be the declared legacy baseline")
    contract_id = item["contract_id"]
    if not isinstance(contract_id, str) or not contract_id.strip():
        raise MergeError(f"{where}.contract_id must be a non-empty string")
    if not isinstance(item["reason"], str) or not item["reason"].strip():
        raise MergeError(f"{where}.reason must be a non-empty string")
    if contract_id not in ALLOWED_RETIRED_IDENTITIES:
        raise MergeError(f"retired identities outside allowlist: {contract_id}")
    return contract_id


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_replacements(path: Path | None) -> dict[str, dict[str, str]]:
    if path is None:
        return {}
    raw = load_json(path, "replacement plan")
    allowed = {"format", "contracts", "relations", "retired_identities", "consumer_observations", "tasks", "frozen_files"}
    unknown = set(raw) - allowed
    if unknown:
        raise MergeError(f"replacement plan has unknown fields: {', '.join(sorted(unknown))}")
    return {key: value for key, value in raw.items() if key != "format"}


def load_authorization(path: Path | None) -> tuple[dict[str, dict[str, str]], dict[str, str]]:
    if path is None:
        return {}, {}
    raw = load_json(path, "adoption authorization")
    if set(raw) != {"format", "accepted_coordinates", "frozen_files"}:
        raise MergeError("adoption authorization must contain exactly format/accepted_coordinates/frozen_files")
    accepted = raw["accepted_coordinates"]
    frozen = raw["frozen_files"]
    if not isinstance(accepted, dict):
        raise MergeError("accepted_coordinates must map coordinate keys to exact acceptance records")
    for key, value in accepted.items():
        if not isinstance(key, str) or not isinstance(value, dict) or set(value) != {"path", "sha256"}:
            raise MergeError("each accepted coordinate authorization needs exactly path/sha256")
        relative_path(value["path"], f"accepted_coordinates.{key}.path")
        if not isinstance(value["sha256"], str) or len(value["sha256"]) != 64:
            raise MergeError(f"accepted_coordinates.{key}.sha256 must be a SHA-256 string")
    if not isinstance(frozen, dict) or not all(
        isinstance(key, str) and isinstance(value, str) for key, value in frozen.items()
    ):
        raise MergeError("frozen_files must be a path-to-SHA-256 object")
    unknown = set(accepted) - ALLOWED_COORDINATES
    if unknown:
        raise MergeError(f"authorization contains coordinates outside allowlist: {', '.join(sorted(unknown))}")
    return accepted, frozen


def validate_and_render(
    design_root: Path,
    snapshot_id: str,
    candidates: list[Candidate],
    replacements: dict[str, dict[str, str]],
    accepted_authority: dict[str, dict[str, str]],
    frozen_authority: dict[str, str],
) -> dict[str, dict[str, Any]]:
    if not snapshot_id or snapshot_id.strip() != snapshot_id:
        raise MergeError("snapshot_id must be a non-empty final snapshot identifier")
    contracts = merge_keyed(
        candidates, manifest="catalog.json", field="contracts", key_fn=contract_key,
        replacement_section="contracts", replacements=replacements,
    )
    found = {contract_key(item, "merged catalog") for item in contracts}
    if found != ALLOWED_COORDINATES:
        missing = sorted(ALLOWED_COORDINATES - found)
        extra = sorted(found - ALLOWED_COORDINATES)
        raise MergeError(f"final coordinate allowlist mismatch; missing={missing}, extra={extra}")

    relations = merge_keyed(
        candidates, manifest="rebase-map.json", field="relations", key_fn=relation_key,
        replacement_section="relations", replacements=replacements,
    )
    consumers = merge_keyed(
        candidates, manifest="rebase-map.json", field="consumer_observations", key_fn=consumer_key,
        replacement_section="consumer_observations", replacements=replacements,
    )
    tasks = merge_keyed(
        candidates, manifest="formal-tasks.json", field="tasks", key_fn=task_key,
        replacement_section="tasks", replacements=replacements,
    )

    retired = merge_keyed(
        candidates, manifest="rebase-map.json", field="retired_identities",
        key_fn=retired_identity_key, replacement_section="retired_identities",
        replacements=replacements,
    )

    resource_owners: dict[str, str] = {}
    accepted_found: set[str] = set()
    for contract in contracts:
        key = contract_key(contract, "merged catalog")
        status = contract.get("status")
        authorization = accepted_authority.get(key)
        if status not in {"candidate", "accepted"}:
            raise MergeError(f"{key}.status must be candidate or accepted")
        if authorization is not None:
            acceptance = relative_path(authorization["path"], f"authorization.{key}.path")
            acceptance_file = design_root / acceptance
            if not acceptance_file.is_file() or sha256(acceptance_file) != authorization["sha256"]:
                raise MergeError(f"accepted coordinate has a missing or hash-mismatched acceptance record: {key}")
            if status == "accepted" and contract.get("acceptance") != acceptance:
                raise MergeError(f"accepted coordinate conflicts with its authorization record: {key}")
            contract["status"] = "accepted"
            contract["acceptance"] = acceptance
            accepted_found.add(key)
        elif status == "accepted":
            raise MergeError(f"accepted coordinate lacks explicit adoption authorization: {key}")
        for field in ("contract_path",):
            path = relative_path(contract.get(field), f"{key}.{field}")
            if not (design_root / path).is_file():
                raise MergeError(f"{key} references missing resource: {path}")
        dependencies = contract.get("dependencies")
        if not isinstance(dependencies, list):
            raise MergeError(f"{key}.dependencies must be an array")
        for index, dependency in enumerate(dependencies):
            if not isinstance(dependency, dict):
                raise MergeError(f"{key}.dependencies[{index}] must be an object")
            coordinate_key(
                dependency.get("coordinate"),
                f"{key}.dependencies[{index}].coordinate",
            )
        resources = contract.get("resources")
        if not isinstance(resources, list) or not resources:
            raise MergeError(f"{key}.resources must be a non-empty array")
        local: set[str] = set()
        for index, raw_path in enumerate(resources):
            path = relative_path(raw_path, f"{key}.resources[{index}]")
            if path in local:
                raise MergeError(f"duplicate resource path in {key}: {path}")
            local.add(path)
            if path in resource_owners and resource_owners[path] != key:
                raise MergeError(f"resource path belongs to multiple coordinates: {path}")
            resource_owners[path] = key
            if not (design_root / path).is_file():
                raise MergeError(f"{key} references missing resource: {path}")

    if accepted_found != set(accepted_authority):
        unused = sorted(set(accepted_authority) - accepted_found)
        raise MergeError(f"adoption authorization contains unused accepted coordinates: {unused}")

    input_frozen_files: dict[str, str] = {}
    frozen_replacements = replacements.get("frozen_files", {})
    for candidate in candidates:
        values = candidate.manifests["frozen.json"].get("files")
        if not isinstance(values, dict):
            raise MergeError(f"{candidate.label}/frozen.json.files must be an object")
        for raw_path, digest in values.items():
            path = relative_path(raw_path, f"{candidate.label}/frozen.json.files")
            if path in input_frozen_files and input_frozen_files[path] != digest:
                chosen = frozen_replacements.get(path)
                if chosen != candidate.label:
                    raise MergeError(f"conflicting duplicate frozen path without selected replacement: {path}")
            input_frozen_files[path] = digest
    for path, digest in input_frozen_files.items():
        if frozen_authority.get(path) != digest:
            raise MergeError(f"input frozen resource lacks exact adoption authorization: {path}")
    frozen_files = dict(frozen_authority)
    for path, digest in frozen_files.items():
        if path not in resource_owners:
            raise MergeError(f"frozen path is not owned by a catalog coordinate: {path}")
        if frozen_authority.get(path) != digest:
            raise MergeError(f"frozen resource lacks exact adoption authorization: {path}")
        full = design_root / path
        if not full.is_file() or sha256(full) != digest:
            raise MergeError(f"frozen resource is missing or hash-mismatched: {path}")
    expected_frozen = {
        path
        for path, owner in resource_owners.items()
        if owner in accepted_found
    }
    if set(frozen_files) != expected_frozen:
        missing = sorted(expected_frozen - set(frozen_files))
        extra = sorted(set(frozen_files) - expected_frozen)
        raise MergeError(f"accepted resource freeze set mismatch; missing={missing}, extra={extra}")

    for task in tasks:
        artifacts = task.get("artifacts")
        if not isinstance(artifacts, list) or not artifacts:
            raise MergeError(f"formal task {task['id']} needs non-empty artifacts")
        for index, raw_path in enumerate(artifacts):
            path = relative_path(raw_path, f"task {task['id']}.artifacts[{index}]")
            if not (design_root / path).is_file():
                raise MergeError(f"formal task {task['id']} references missing artifact: {path}")

    return {
        "baseline.json": {
            "format": 1,
            "baseline_id": BASELINE_ID,
            "snapshot_id": snapshot_id,
            "schema_namespace": SCHEMA_NAMESPACE,
            "legacy_baseline_ids": [LEGACY_BASELINE_ID],
            "version_policy": {"kind": "initial-uniform", "version": 1},
        },
        "catalog.json": {"format": 1, "baseline_id": BASELINE_ID, "contracts": contracts},
        "rebase-map.json": {
            "format": 1,
            "target_baseline_id": BASELINE_ID,
            "retired_identities": sorted(retired, key=lambda item: item["contract_id"]),
            "relations": relations,
            "consumer_observations": consumers,
        },
        "frozen.json": {"format": 1, "baseline_id": BASELINE_ID, "files": frozen_files},
        "formal-tasks.json": {"format": 1, "baseline_id": BASELINE_ID, "tasks": tasks},
    }


def parse_input(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("input must be LABEL=PATH")
    label, path = value.split("=", 1)
    if not label or not path:
        raise argparse.ArgumentTypeError("input must be LABEL=PATH")
    return label, Path(path)


def write_outputs(output: Path, rendered: dict[str, dict[str, Any]], check: bool) -> None:
    encoded = {name: json.dumps(value, ensure_ascii=False, indent=2).encode() + b"\n" for name, value in rendered.items()}
    if check:
        wrong = [name for name, content in encoded.items() if not (output / name).is_file() or (output / name).read_bytes() != content]
        if wrong:
            raise MergeError(f"generated manifests differ or are missing: {', '.join(wrong)}")
        return
    conflicts = [name for name, content in encoded.items() if (output / name).exists() and (not (output / name).is_file() or (output / name).read_bytes() != content)]
    if conflicts:
        raise MergeError(f"refusing to overwrite differing manifests: {', '.join(conflicts)}")
    output.mkdir(parents=True, exist_ok=True)
    for name, content in encoded.items():
        path = output / name
        if not path.exists():
            path.write_bytes(content)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--design-root", required=True, type=Path)
    parser.add_argument("--snapshot-id", required=True)
    parser.add_argument("--input", action="append", required=True, type=parse_input, metavar="LABEL=PATH")
    parser.add_argument("--replacements", type=Path)
    parser.add_argument("--adoption-authorization", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    try:
        labels = [label for label, _ in args.input]
        if len(labels) != len(set(labels)):
            raise MergeError("candidate labels must be unique")
        candidates = [read_candidate(label, path.resolve()) for label, path in args.input]
        replacements = load_replacements(args.replacements.resolve() if args.replacements else None)
        accepted, frozen = load_authorization(
            args.adoption_authorization.resolve() if args.adoption_authorization else None
        )
        rendered = validate_and_render(
            args.design_root.resolve(), args.snapshot_id, candidates, replacements, accepted, frozen
        )
        write_outputs(args.output.resolve(), rendered, args.check)
        print(f"PASS: merged {len(candidates)} candidate(s) into the fixed {len(ALLOWED_COORDINATES)}-coordinate baseline.")
        return 0
    except (OSError, MergeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
