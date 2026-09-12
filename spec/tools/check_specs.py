#!/usr/bin/env python3
"""Validate published contracts, candidate schemas, and declared formal tasks."""
from __future__ import annotations
import argparse, json, shutil, subprocess
from pathlib import Path
from urllib.parse import urljoin
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from referencing import Registry, Resource

def root_path(value): return Path(value).resolve() if value else Path(__file__).resolve().parents[2]
def load(path): return json.loads(path.read_text(encoding="utf-8"))

def check_refs(schema, base, registry, label, errors):
    def visit(node, uri):
        if isinstance(node, dict):
            local = urljoin(uri, node["$id"]) if isinstance(node.get("$id"), str) else uri
            if isinstance(node.get("$ref"), str):
                try: registry.resolver(local).lookup(node["$ref"])
                except Exception as exc: errors.append(f"unresolved $ref in {label}: {node['$ref']} ({exc})")
            for value in node.values(): visit(value, local)
        elif isinstance(node, list):
            for value in node: visit(value, uri)
    visit(schema, base)

def markdown_anchor(path, fragment):
    from markdown_it import MarkdownIt
    def slug(text): return "-".join("".join(c for c in text.lower() if c.isalnum() or c in " -_").split())
    return any(slug(token.content) == slug(fragment) for token in MarkdownIt().parse(path.read_text(encoding="utf-8")) if token.type == "heading_open")

def local_acceptance(root, value):
    path, _, fragment = value.partition("#"); candidate = (root / path).resolve()
    try: candidate.relative_to(root)
    except ValueError: return False
    return candidate.is_file() and candidate.suffix == ".md" and (not fragment or markdown_anchor(candidate, fragment))

def main(argv=None):
    parser=argparse.ArgumentParser(); parser.add_argument("--root"); args=parser.parse_args(argv); root=root_path(args.root); errors=[]
    formats=root/"spec/tools/formats"; catalog_schema=load(formats/"catalog.schema.json"); formal_schema=load(formats/"formal-tasks.schema.json")
    for path, schema in ((formats/"catalog.schema.json", catalog_schema), (formats/"formal-tasks.schema.json", formal_schema)):
        try: Draft202012Validator.check_schema(schema)
        except SchemaError as exc: errors.append(f"invalid tool format {path.relative_to(root)}: {exc}")
    catalog=load(root/"spec/catalog.json")
    for e in Draft202012Validator(catalog_schema).iter_errors(catalog): errors.append(f"catalog schema: {e.message}")
    frozen=load(root/"spec/frozen.json") if (root/"spec/frozen.json").is_file() else {"files": {}}
    identities=set()
    for contract in catalog.get("contracts", []):
        cid=contract.get("id"); versions=contract.get("versions", []); current=contract.get("current_version"); seen_versions=set()
        for version in versions:
            number=version.get("version"); key=(cid, number)
            if key in identities or number in seen_versions: errors.append(f"duplicate contract version: {cid}@{number}")
            identities.add(key); seen_versions.add(number)
            category={"data":"data", "capability":"capabilities", "composition":"compositions"}.get(str(cid).split(".",1)[0], "")
            expected=f"{category}/{str(cid).split('.',1)[1]}/v{number}/contract.md" if "." in str(cid) else ""
            if version.get("path") != expected: errors.append(f"catalog path is not canonical for {cid}@{number}: {version.get('path')}")
            path=root/version.get("path", "")
            if not path.is_file(): errors.append(f"catalog path missing: {version.get('path')}")
            if not local_acceptance(root, version.get("acceptance", "")): errors.append(f"catalog acceptance is not a valid Markdown anchor: {version.get('acceptance')}")
            if version.get("status") == "accepted" and path.is_file():
                for file in path.parent.rglob("*"):
                    if file.is_file() and file.relative_to(root).as_posix() not in frozen.get("files", {}): errors.append(f"published file is not frozen: {file.relative_to(root)}")
        if current is not None:
            matches=[v for v in versions if v.get("version")==current]
            if len(matches)!=1 or matches[0].get("status") != "accepted": errors.append(f"current version is not uniquely accepted: {cid}@{current}")
    candidates=[]
    for directory in (root/"docs/proposals", root/"docs/evaluation/formats"):
        if directory.exists(): candidates.extend(directory.rglob("*.schema.json"))
    schemas={}; registry=Registry()
    for path in candidates:
        try:
            schema=load(path); Draft202012Validator.check_schema(schema)
            if not isinstance(schema.get("$id"), str): errors.append(f"schema lacks $id: {path.relative_to(root)}"); continue
            schemas[path]=schema; resource=Resource.from_contents(schema)
            registry=registry.with_resource(schema["$id"], resource).with_resource(path.resolve().as_uri(), resource)
        except (json.JSONDecodeError, SchemaError) as exc: errors.append(f"invalid schema {path.relative_to(root)}: {exc}")
    for path, schema in schemas.items():
        check_refs(schema, schema["$id"], registry, str(path.relative_to(root)), errors)
        example=path.with_name(path.name.replace(".schema.json", ".example.json"))
        if example.is_file():
            try:
                validator=Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())
                for e in validator.iter_errors(load(example)): errors.append(f"schema example invalid {example.relative_to(root)}: {e.message}")
            except Exception as exc: errors.append(f"schema example unresolved {example.relative_to(root)}: {exc}")
    formal=load(root/"spec/formal-tasks.json")
    for e in Draft202012Validator(formal_schema).iter_errors(formal): errors.append(f"formal task manifest: {e.message}")
    task_ids=set()
    for task in formal.get("tasks", []):
        if task.get("id") in task_ids: errors.append(f"duplicate formal task: {task.get('id')}")
        task_ids.add(task.get("id"))
        for artifact in task.get("artifacts", []):
            if not (root/artifact).is_file(): errors.append(f"formal task artifact missing: {artifact}")
        command=task.get("command", []); executable=command[0] if command else ""
        if not shutil.which(executable): errors.append(f"formal task tool missing for {task.get('id')}: {executable}"); continue
        result=subprocess.run(command, cwd=root, text=True, capture_output=True)
        if result.returncode: errors.append(f"formal task failed: {task.get('id')} ({result.returncode})")
    for message in errors: print(f"ERROR: {message}")
    print(f"INFO: catalog contracts={len(catalog.get('contracts', []))}; candidate/evaluation schemas={len(candidates)}; formal tasks={len(formal.get('tasks', []))}.")
    return 1 if errors else 0
if __name__ == "__main__": raise SystemExit(main())
