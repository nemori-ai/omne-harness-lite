#!/usr/bin/env python3
"""Check documentation references and the metadata that gives decisions authority.

This checks parseable evidence and structure.  It deliberately does not claim to
prove that a causal explanation is sufficient.
"""
from __future__ import annotations

import argparse, hashlib, json, re, subprocess, sys
from pathlib import Path

import yaml

ROOTS = ("README.md", "AGENTS.md", "docs", "spec", ".agents")
LINK = re.compile(r"(?<!!)\[[^]]*\]\(([^)]+)\)")
HEADING = re.compile(r"^#{1,6}\s+(.+?)\s*#*\s*$")

def root_path(value: str | None) -> Path:
    return Path(value).resolve() if value else Path(__file__).resolve().parents[2]

def markdown_without_fences(text: str) -> str:
    return re.sub(r"^```.*?^```[ \t]*$", "", text, flags=re.M | re.S)

def anchor(value: str) -> str:
    value = re.sub(r"`([^`]*)`", r"\1", value).strip().lower()
    value = re.sub(r"[^\w\- ]", "", value, flags=re.UNICODE)
    return re.sub(r"[ ]+", "-", value)

def headings(path: Path) -> set[str]:
    return {anchor(m.group(1)) for m in map(HEADING.match, path.read_text(encoding="utf-8").splitlines()) if m}

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
    for path in files:
        text = markdown_without_fences(path.read_text(encoding="utf-8"))
        for raw in LINK.findall(text):
            target, fragment = local_target(path, raw, root)
            if target is None: continue
            if not target.exists(): errors.append(f"broken link: {path.relative_to(root)} -> {raw}"); continue
            if fragment and target.suffix.lower() == ".md" and anchor(fragment) not in headings(target):
                errors.append(f"broken anchor: {path.relative_to(root)} -> {raw}")
    decisions = root / "docs/decisions"
    if decisions.exists():
        seen = set()
        for path in decisions.glob("D-*.md"):
            data = read_frontmatter(path) or {}
            required = ("kind", "id", "status", "scope", "date", "sources", "acceptance", "supersedes")
            if any(k not in data for k in required) or data.get("kind") != "decision": errors.append(f"invalid decision metadata: {path.relative_to(root)}"); continue
            if data["id"] in seen: errors.append(f"duplicate decision id: {data['id']}")
            seen.add(data["id"])
            if data["status"] == "accepted":
                sources = data["sources"] if isinstance(data["sources"], list) else []
                resolved = [local_target(path, str(x), root)[0] for x in sources]
                if not any(x and x.exists() and ("/docs/proposals/" in str(x) or "/docs/research/" in str(x)) for x in resolved): errors.append(f"accepted decision has no proposal/research source: {data['id']}")
            for item in data.get("supersedes", []):
                if not isinstance(item, dict) or not item.get("id") or not item.get("scope"): errors.append(f"invalid supersedes entry: {data['id']}")
            if data.get("supersedes"):
                basis = data.get("change_basis") or {}
                for key in ("observation", "causal_explanation", "reproduction", "verification"):
                    if not basis.get(key): errors.append(f"superseding decision lacks change_basis.{key}: {data['id']}")
                for key in ("reproduction", "verification"):
                    target, _ = local_target(path, str(basis.get(key, "")), root)
                    if not target or not target.exists(): errors.append(f"unparseable change_basis.{key}: {data['id']}")
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
