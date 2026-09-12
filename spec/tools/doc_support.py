"""Shared local document parsing for repository checks; never fetch remote resources."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from markdown_it import MarkdownIt

PARSER = MarkdownIt().enable("table")
FORMATS = Path(__file__).resolve().parent / "formats"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frontmatter(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.match(r"\A---\r?\n(.*?)\r?\n---(?:\r?\n|$)", text, re.S)
    data = yaml.safe_load(match[1]) if match else {}
    if not isinstance(data, dict):
        raise ValueError(f"front matter must be a mapping: {path}")
    if isinstance(data.get("date"), date):
        data["date"] = data["date"].isoformat()
    return data


def tokens(path: Path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"\A---\r?\n.*?\r?\n---(?:\r?\n|$)", "", text, count=1, flags=re.S)
    return PARSER.parse(text)


def slug(text: str) -> str:
    return re.sub(r"[^\w\- ]", "", text.lower()).replace(" ", "-")


def headings(path: Path) -> set[str]:
    parsed = tokens(path)
    result = set()
    for index, token in enumerate(parsed[:-1]):
        if token.type != "heading_open":
            continue
        content = "".join(child.content for child in parsed[index + 1].children or []
                          if child.type in {"text", "code_inline", "image"})
        base = slug(content)
        name, suffix = base, 0
        while name in result:
            suffix += 1
            name = f"{base}-{suffix}"
        result.add(name)
    return result


def markdown_links(path: Path):
    for token in tokens(path):
        for child in token.children or []:
            if child.type in {"link_open", "image"}:
                yield child.attrGet("href" if child.type == "link_open" else "src")


def local_target(source: Path, value: str, root: Path):
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return None, None
    raw = unquote(parts.path)
    if raw.startswith("/"):
        raise ValueError(f"use repository-relative links: {value}")
    target = (source.parent / raw).resolve() if raw else source.resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f"link escapes checkout: {value}")
    return target, unquote(parts.fragment)


def validate_link(source: Path, value: str, root: Path, *, local_required=False):
    target, fragment = local_target(source, value, root)
    if target is None:
        if local_required:
            raise ValueError(f"local evidence link required: {value}")
        return None
    if not target.exists():
        raise ValueError(f"broken link: {value}")
    if fragment and target.suffix == ".md" and fragment not in headings(target):
        raise ValueError(f"broken anchor: {value}")
    return target


def checked_path(root: Path, relative: str) -> Path:
    if Path(relative).is_absolute():
        raise ValueError(f"repository-relative path required: {relative}")
    target = (root / relative).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f"path escapes checkout: {relative}")
    return target


def format_errors(name: str, value) -> list[str]:
    schema = load_json(FORMATS / name)
    Draft202012Validator.check_schema(schema)
    return [f"{name} {error.json_path}: {error.message}"
            for error in Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(value)]
