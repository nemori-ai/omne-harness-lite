#!/usr/bin/env python3
"""Check documentation references and the metadata that gives decisions authority.

This checks parseable evidence and structure.  It deliberately does not claim to
prove that a causal explanation is sufficient.
"""
from __future__ import annotations

import argparse, hashlib, json, re, subprocess, sys
from pathlib import Path

import yaml
from markdown_it import MarkdownIt

ROOTS = ("README.md", "AGENTS.md", "docs", "spec", ".agents")

def root_path(value: str | None) -> Path:
    return Path(value).resolve() if value else Path(__file__).resolve().parents[2]

def anchor(value: str) -> str:
    value = re.sub(r"`([^`]*)`", r"\1", value).strip().lower()
    value = re.sub(r"[^\w\- ]", "", value, flags=re.UNICODE)
    return re.sub(r"[ ]+", "-", value)

def headings(path: Path) -> set[str]:
    return {anchor(token.content) for token in MarkdownIt().parse(path.read_text(encoding="utf-8")) if token.type == "heading_open"}

def markdown_links(path: Path):
    for token in MarkdownIt().parse(path.read_text(encoding="utf-8")):
        if token.type != "inline" or not token.children: continue
        for child in token.children:
            if child.type == "link_open":
                href = dict(child.attrs or {}).get("href")
                if href: yield href

def local_target(source: Path, target: str, root: Path) -> tuple[Path | None, str | None]:
    target = target.strip().strip("<>")
    if not target or target.startswith(("#", "mailto:", "http:", "https:")):
        return None, None
    path_part, sep, fragment = target.partition("#")
    candidate = (source.parent / path_part).resolve() if path_part else source
    try: candidate.relative_to(root)
    except ValueError: return None, None
    return candidate, fragment if sep else None

def read_frontmatter(path: Path):
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"): return None
    end = text.find("\n---", 4)
    if end < 0: return None
    return yaml.safe_load(text[4:end])

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def git_file(root: Path, ref: str, rel: str) -> bytes | None:
    run = subprocess.run(["git", "-C", str(root), "show", f"{ref}:{rel}"], capture_output=True)
    return run.stdout if run.returncode == 0 else None

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root")
    parser.add_argument("--baseline", help="git ref whose frozen manifest is authoritative")
    args = parser.parse_args(argv); root = root_path(args.root); errors: list[str] = []
    files: list[Path] = []
    for name in ROOTS:
        path = root / name
        if path.is_file() and path.suffix == ".md": files.append(path)
        elif path.is_dir(): files += list(path.rglob("*.md"))
    files = [path for path in files if "spec/archive/" not in path.relative_to(root).as_posix()]
    for path in files:
        for raw in markdown_links(path):
            target, fragment = local_target(path, raw, root)
            if target is None: continue
            if not target.exists(): errors.append(f"broken link: {path.relative_to(root)} -> {raw}"); continue
            if fragment and target.suffix.lower() == ".md" and anchor(fragment) not in headings(target):
                errors.append(f"broken anchor: {path.relative_to(root)} -> {raw}")
    decisions = root / "docs/decisions"
    if decisions.exists():
        seen = set(); graph = {}
        for path in decisions.glob("D-*.md"):
            data = read_frontmatter(path) or {}
            required = ("kind", "id", "status", "scope", "date", "sources", "acceptance", "supersedes")
            if any(k not in data for k in required) or data.get("kind") != "decision" or data.get("status") not in ("accepted", "superseded", "withdrawn") or not isinstance(data.get("id"), str) or not re.fullmatch(r"D-[0-9]{3,}", data["id"]) or not isinstance(data.get("scope"), str) or not data["scope"].strip() or not isinstance(data.get("date"), __import__("datetime").date) or not isinstance(data.get("acceptance"), str) or not data["acceptance"].strip(): errors.append(f"invalid decision metadata: {path.relative_to(root)}"); continue
            if data["id"] in seen: errors.append(f"duplicate decision id: {data['id']}")
            seen.add(data["id"])
            sources = data["sources"] if isinstance(data["sources"], list) else []
            resolved = [local_target(path, str(x), root)[0] for x in sources]
            if not any(x and x.exists() and ("/docs/proposals/" in str(x) or "/docs/research/" in str(x)) for x in resolved): errors.append(f"decision has no proposal/research source: {data['id']}")
            acceptance, fragment = local_target(path, data["acceptance"], root)
            if not acceptance or not acceptance.is_file() or (fragment and anchor(fragment) not in headings(acceptance)): errors.append(f"invalid decision acceptance: {data['id']}")
            for item in data.get("supersedes", []):
                if not isinstance(item, dict) or not item.get("id") or not item.get("scope"): errors.append(f"invalid supersedes entry: {data['id']}")
                elif item["id"] == data["id"]: errors.append(f"decision self-supersedes: {data['id']}")
            graph[data["id"]] = [item.get("id") for item in data.get("supersedes", []) if isinstance(item, dict) and item.get("id")]
            if data.get("supersedes"):
                basis = data.get("change_basis") or {}
                for key in ("observation", "causal_explanation", "reproduction", "verification"):
                    if not basis.get(key): errors.append(f"superseding decision lacks change_basis.{key}: {data['id']}")
                for key in ("reproduction", "verification"):
                    target, _ = local_target(path, str(basis.get(key, "")), root)
                    if not target or not target.exists(): errors.append(f"unparseable change_basis.{key}: {data['id']}")
        for source, targets in graph.items():
            for target in targets:
                if target not in graph: errors.append(f"supersedes unknown decision: {source} -> {target}")
        def reaches(start, node, visited):
            if node == start: return True
            return any(reaches(start, next_node, visited | {node}) for next_node in graph.get(node, []) if next_node not in visited)
        for source, targets in graph.items():
            if any(reaches(source, target, {source}) for target in targets): errors.append(f"supersedes cycle: {source}")
    for skill in (root / ".agents/skills").glob("*/SKILL.md") if (root / ".agents/skills").exists() else []:
        mirror = root / ".claude/skills" / skill.relative_to(root / ".agents/skills")
        if not mirror.is_file() or mirror.read_bytes() != skill.read_bytes(): errors.append(f"skill mirror differs: {skill.relative_to(root)}")
    frozen = root / "spec/frozen.json"
    if frozen.is_file():
        manifest = json.loads(frozen.read_text())
        for rel, expected in manifest.get("files", {}).items():
            path = root / rel
            if not path.is_file() or sha256(path) != expected: errors.append(f"frozen file changed: {rel}")
        if args.baseline:
            data = git_file(root, args.baseline, "spec/frozen.json")
            if data is None: errors.append(f"baseline has no spec/frozen.json: {args.baseline}")
            else:
                for rel, expected in json.loads(data).get("files", {}).items():
                    path = root / rel
                    if not path.is_file() or sha256(path) != expected: errors.append(f"baseline frozen file changed: {rel}")
                    if rel not in manifest.get("files", {}): errors.append(f"baseline frozen entry removed: {rel}")
    elif args.baseline:
        errors.append("current spec/frozen.json is missing")
    archive = root / "spec/archive/ddd-models/manifest.json"
    if archive.is_file():
        manifest = json.loads(archive.read_text())
        archive_root = archive.parent
        if manifest.get("format") != 1 or not isinstance(manifest.get("files"), list): errors.append("invalid archive manifest")
        else:
            for item in manifest["files"]:
                path = archive_root / str(item.get("path", ""))
                if not path.is_file() or sha256(path) != item.get("sha256"):
                    errors.append(f"archived source hash mismatch: {item.get('path')}")
    for error in errors: print(f"ERROR: {error}")
    if errors: return 1
    print(f"PASS: checked {len(files)} Markdown files, decision evidence, skill mirrors, and frozen manifest.")
    print("NOTE: structural evidence checks do not prove causal reasoning is sufficient.")
    return 0

if __name__ == "__main__": raise SystemExit(main())
