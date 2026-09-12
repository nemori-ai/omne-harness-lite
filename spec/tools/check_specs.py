#!/usr/bin/env python3
"""Validate the accepted specification catalogue and candidate JSON Schema offline."""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path
from jsonschema import Draft202012Validator, FormatChecker
from jsonschema.exceptions import SchemaError
from referencing import Registry, Resource

def root_path(value): return Path(value).resolve() if value else Path(__file__).resolve().parents[2]
def load(path): return json.loads(path.read_text(encoding="utf-8"))
def main(argv=None):
    parser=argparse.ArgumentParser(); parser.add_argument("--root"); args=parser.parse_args(argv); root=root_path(args.root); errors=[]
    catalog=load(root/"spec/catalog.json")
    if catalog.get("catalog_version") != 1 or not isinstance(catalog.get("contracts"), list): errors.append("invalid spec/catalog.json")
    identities=set()
    for contract in catalog.get("contracts", []):
        cid=contract.get("id"); versions=contract.get("versions", []); current=contract.get("current_version")
        if not isinstance(cid,str) or not cid.startswith(("data.","capability.","composition.")): errors.append(f"invalid contract id: {cid}")
        numbers=[]; by_number={}
        for version in versions:
            number=version.get("version"); numbers.append(number); key=(cid,number)
            by_number[number] = version
            if key in identities: errors.append(f"duplicate contract version: {cid}@{number}")
            identities.add(key)
            if not isinstance(number,int) or number < 1 or version.get("status") not in ("accepted","superseded","withdrawn"): errors.append(f"invalid version: {cid}@{number}")
            path=root/version.get("path","")
            if not path.is_file(): errors.append(f"catalog path missing: {version.get('path')}")
            acceptance=root/version.get("acceptance", "").split("#", 1)[0]
            if not acceptance.is_file(): errors.append(f"catalog acceptance missing: {version.get('acceptance')}")
        if current is not None and (current not in numbers or sum(n==current for n in numbers)!=1): errors.append(f"invalid current_version: {cid}")
        if current is not None and by_number.get(current, {}).get("status") != "accepted": errors.append(f"current version is not accepted: {cid}@{current}")
    registry=Registry()
    schema_paths=list((root/"spec/proposals").rglob("*.schema.json")) if (root/"spec/proposals").exists() else []
    schemas={}
    for path in schema_paths:
        try:
            schema=load(path); Draft202012Validator.check_schema(schema)
            if "$id" not in schema: errors.append(f"candidate schema lacks $id: {path.relative_to(root)}")
            else: schemas[path]=schema; registry=registry.with_resource(schema["$id"], Resource.from_contents(schema))
        except (json.JSONDecodeError, SchemaError) as exc: errors.append(f"invalid candidate schema {path.relative_to(root)}: {exc}")
    for path,schema in schemas.items():
        example=path.with_name(path.name.replace(".schema.json", ".example.json"))
        if not example.is_file(): continue
        try:
            validator=Draft202012Validator(schema, registry=registry, format_checker=FormatChecker())
            for error in sorted(validator.iter_errors(load(example)), key=str): errors.append(f"candidate example invalid {example.relative_to(root)}: {error.message}")
        except Exception as exc: errors.append(f"candidate example could not be resolved {example.relative_to(root)}: {exc}")
    for error in errors: print(f"ERROR: {error}")
    print(f"INFO: checked {len(catalog.get('contracts', []))} catalog contracts and {len(schema_paths)} candidate schemas offline.")
    print("INFO: no TLA+ or Alloy model execution is declared by this repository; that coverage is absent, not passed.")
    return 1 if errors else 0
if __name__ == "__main__": raise SystemExit(main())
