#!/usr/bin/env python3
"""Validate published versions, offline schemas/examples and declared formal tasks."""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import urljoin, urldefrag

from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

from doc_support import (FORMATS, checked_path, digest, format_errors, frontmatter,
                         load_json, markdown_links, local_target, validate_link)

DRAFT = "https://json-schema.org/draft/2020-12/schema"
CATEGORIES = {"data": "data", "capability": "capabilities", "composition": "compositions"}


def acceptance(root, value):
    path = validate_link(root / "_repository_root.md", value, root, local_required=True)
    if not path.is_file() or not any(path.is_relative_to(root / "docs" / area)
                                     for area in ("decisions", "proposals")):
        raise ValueError("acceptance must point to a decision or proposal")
    # Version pages inherit proposal status from their topic entry.
    owner = path
    data = frontmatter(owner)
    while not data and owner.parent != root / "docs":
        entry = owner.parent / "README.md"
        data = frontmatter(entry) if entry.is_file() else {}
        owner = owner.parent
    if data.get("status") not in {"accepted", "partially-accepted", "superseded"}:
        raise ValueError(f"acceptance source has no accepted scope: {value}")


def check_catalog(root, errors):
    catalog = load_json(root / "spec/catalog.json")
    problems = format_errors("catalog.schema.json", catalog)
    errors.extend(problems)
    if problems:
        return {}, []
    frozen = load_json(root / "spec/frozen.json")
    problems = format_errors("frozen.schema.json", frozen)
    errors.extend(problems)
    if problems:
        return {}, []
    registered, ids, version_paths = {}, set(), set()
    for contract in catalog["contracts"]:
        identity = contract["id"]
        if identity in ids:
            errors.append(f"duplicate contract id: {identity}")
        ids.add(identity)
        category, name = identity.split(".", 1)
        seen = set()
        for version in contract["versions"]:
            number = version["version"]
            if number in seen:
                errors.append(f"duplicate contract version: {identity}@{number}")
            seen.add(number)
            expected = f"spec/{CATEGORIES[category]}/{name}/v{number}/contract.md"
            if version["path"] != expected:
                errors.append(f"catalog path is not canonical: {version['path']} (expected {expected})")
                continue
            path = checked_path(root, expected)
            version_paths.add(path.parent)
            if not path.is_file():
                errors.append(f"catalog path missing: {expected}")
            if not (path.parent.parent / "README.md").is_file():
                errors.append(f"contract entry missing: {path.parent.parent.relative_to(root)}/README.md")
            try:
                acceptance(root, version["acceptance"])
            except ValueError as error:
                errors.append(f"{identity}@{number}: {error}")
            for file in path.parent.rglob("*"):
                if not file.is_file():
                    continue
                registered[file.resolve()] = version
                rel = file.relative_to(root).as_posix()
                if frozen["files"].get(rel) != digest(file):
                    errors.append(f"published file is not frozen or changed: {rel}")
        current = contract["current_version"]
        matches = [v for v in contract["versions"] if v["version"] == current]
        if current is not None and (len(matches) != 1 or matches[0]["status"] != "accepted"):
            errors.append(f"current version is not uniquely accepted: {identity}@{current}")
    for category in CATEGORIES.values():
        for directory in (root / "spec" / category).glob("*/v*"):
            if directory.is_dir() and directory.resolve() not in version_paths:
                errors.append(f"unregistered formal version: {directory.relative_to(root)}")
    for relative in frozen["files"]:
        if checked_path(root, relative) not in registered:
            errors.append(f"frozen file has no catalog version: {relative}")
    # contract.md contains normative dependency links; supporting research is linked from
    # mutable entry/verification pages, so prose does not silently import candidate policy.
    for path, version in registered.items():
        if path.name != "contract.md":
            continue
        for raw in markdown_links(path):
            target, fragment = local_target(path, raw, root)
            if target is None:
                continue
            if target in registered:
                if version["status"] == "accepted" and registered[target]["status"] == "withdrawn":
                    errors.append(f"formal dependency is withdrawn: {path.relative_to(root)} -> {raw}")
            elif any(target.is_relative_to(root / area) for area in
                     ("docs/proposals", "spec/archive", "spec/data", "spec/capabilities", "spec/compositions")):
                errors.append(f"formal dependency is not an exact published version: {path.relative_to(root)} -> {raw}")
    return registered, catalog["contracts"]


def check_schemas(root, registered, errors):
    paths = {path for path in registered if path.name == "schema.json" or path.name.endswith(".schema.json")}
    for area in (root / "docs/proposals", root / "docs/evaluation/formats", FORMATS):
        paths.update(p for p in area.rglob("*.json") if p.name == "schema.json" or p.name.endswith(".schema.json"))
    registry, schemas, identities = Registry(), {}, {}
    for path in sorted(paths):
        schema = load_json(path)
        Draft202012Validator.check_schema(schema)
        if not isinstance(schema, dict) or schema.get("$schema") != DRAFT or not isinstance(schema.get("$id"), str):
            errors.append(f"schema must declare Draft 2020-12 and $id: {path}")
            continue
        base = urljoin(path.resolve().as_uri(), schema["$id"])
        if base in identities:
            errors.append(f"duplicate schema $id: {base}")
        identities[base] = path
        resource = Resource.from_contents(schema, default_specification=DRAFT202012)
        schemas[path] = (schema, base, resource)
        registry = registry.with_resource(base, resource).with_resource(path.resolve().as_uri(), resource)
    registry = registry.crawl()

    def refs(resource, base, source):
        local = urljoin(base, resource.id() or "")
        node = resource.contents
        if isinstance(node, dict):
            for keyword in ("$ref", "$dynamicRef"):
                if keyword not in node:
                    continue
                try:
                    resolved = registry.resolver(local).lookup(node[keyword])
                    target_uri = urldefrag(urljoin(local, node[keyword]))[0]
                    if source in registered:
                        target = identities.get(target_uri)
                        if target is not None and target not in registered:
                            errors.append(f"formal schema depends on a candidate/tool schema: {source} -> {node[keyword]}")
                        elif target in registered and registered[source]["status"] == "accepted" and registered[target]["status"] == "withdrawn":
                            errors.append(f"formal schema depends on withdrawn schema: {source} -> {node[keyword]}")
                except Exception as error:
                    errors.append(f"unresolved {keyword} in {source}: {node[keyword]} ({error})")
        for child in resource.subresources():
            refs(child, local, source)

    for path, (schema, base, resource) in schemas.items():
        # Passing the document retrieval URI avoids applying relative root $id twice.
        refs(resource, path.resolve().as_uri(), path)
        example = path.with_name("example.json" if path.name == "schema.json" else path.name.replace(".schema.json", ".example.json"))
        if example.is_file():
            try:
                validator = Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())
                for error in validator.iter_errors(load_json(example)):
                    errors.append(f"schema example invalid {example}: {error.message}")
            except Exception as error:
                errors.append(f"schema example unresolved {example}: {error}")
    return len(paths)


def check_formal(root, registered, errors):
    data = load_json(root / "spec/formal-tasks.json")
    problems = format_errors("formal-tasks.schema.json", data)
    errors.extend(problems)
    if problems:
        return 0
    covered, ids = set(), set()
    for task in data["tasks"]:
        if task["id"] in ids:
            errors.append(f"duplicate formal task: {task['id']}")
        ids.add(task["id"])
        artifacts = [checked_path(root, item) for item in task["artifacts"]]
        for path in artifacts:
            if not path.is_file():
                errors.append(f"formal task artifact missing: {path}")
        extension = {"tla": ".tla", "alloy": ".als"}[task["kind"]]
        if not any(p.suffix == extension for p in artifacts):
            errors.append(f"formal task has no {extension} model: {task['id']}")
        covered.update(artifacts)
        command = [os.path.expandvars(part) for part in task["command"]]
        if any(re.search(r"\$\{?[A-Za-z_]", part) for part in command):
            errors.append(f"formal task environment variable is unset: {task['id']}")
        if not shutil.which(command[0]):
            errors.append(f"formal task tool missing: {task['id']} -> {command[0]}")
        if errors:
            continue
        try:
            result = subprocess.run(command, cwd=root, text=True, capture_output=True,
                                    timeout=task.get("timeout_seconds", 60))
            print(f"FORMAL {task['id']}: exit={result.returncode}; command={command}")
            print(result.stdout + result.stderr)
            if result.returncode:
                errors.append(f"formal task failed: {task['id']} (exit {result.returncode})")
        except (OSError, subprocess.TimeoutExpired) as error:
            errors.append(f"formal task not completed: {task['id']}: {error}")
    for path in registered:
        if path.suffix in {".tla", ".als"} and path not in covered:
            errors.append(f"formal model has no declared task: {path.relative_to(root)}")
    if not data["tasks"]:
        print("UNCOVERED: no TLA+/Alloy execution tasks declared; behavior/structure model coverage is absent.")
    return len(data["tasks"])


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args(argv)
    root, errors = args.root.resolve(), []
    try:
        registered, contracts = check_catalog(root, errors)
        schemas = check_schemas(root, registered, errors)
        tasks = check_formal(root, registered, errors)
        print(f"INFO: catalog contracts={len(contracts)}; schemas={schemas}; formal tasks={tasks}.")
    except (OSError, ValueError, TypeError, SchemaError) as error:
        errors.append(str(error))
    for error in errors:
        print(f"ERROR: {error}")
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
