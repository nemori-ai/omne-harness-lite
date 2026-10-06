"""Shared local document parsing for repository checks; never fetch remote resources."""
from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from markdown_it import MarkdownIt

PARSER = MarkdownIt().enable("table")
FORMATS = Path(__file__).resolve().parent / "formats"


def repository_root(start: Path | None = None) -> Path:
    """Discover the inspected checkout from cwd, never from the installed package."""
    directory = (start or Path.cwd()).resolve()
    for candidate in (directory, *directory.parents):
        if (candidate / ".meta_harness").is_dir() and (candidate / "docs").is_dir():
            return candidate
    raise ValueError("cannot locate repository: run inside the checkout or pass --root")


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


class _ExplicitAnchors(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.anchors: set[str] = set()

    def handle_starttag(self, tag, attrs) -> None:
        if tag == "a":
            self.anchors.update(value for name, value in attrs
                                if name in {"id", "name"} and value is not None)


@lru_cache(maxsize=None)
def headings(path: Path) -> set[str]:
    # 每条带锚点的链接都要查目标文件的标题集；一份上千行的契约被引用上千次时，
    # 不缓存就是把它解析上千遍。一次检查运行内文件不变，按路径缓存即可。
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
    # 只读真正的HTML token；代码示例里的同形文字不是链接目标。
    explicit = _ExplicitAnchors()
    for token in parsed:
        if token.type == "html_block":
            explicit.feed(token.content)
        for child in token.children or []:
            if child.type == "html_inline":
                explicit.feed(child.content)
    result.update(explicit.anchors)
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
