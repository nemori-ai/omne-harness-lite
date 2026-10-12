from __future__ import annotations

import hashlib
import os
import re
import unicodedata
from functools import lru_cache
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

from markdown_it import MarkdownIt

PARSER = MarkdownIt().enable("table")
# Parse every URI so the local boundary can reject file links instead of hiding them as text.
PARSER.validateLink = lambda value: True


def repository_root(start: Path | None = None) -> Path:
    """Discover the inspected checkout from cwd, never from the installed package."""
    directory = (start or Path.cwd()).resolve()
    for candidate in (directory, *directory.parents):
        if (candidate / ".meta_harness").is_dir() and (candidate / "docs").is_dir():
            return candidate
    raise ValueError("cannot locate repository: run inside the checkout or pass --root")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_markdown(text: str):
    text = re.sub(r"\A---\r?\n.*?\r?\n---(?:\r?\n|$)",
                  lambda match: "\n" * match.group().count("\n"), text, count=1, flags=re.S)
    return PARSER.parse(text)


def tokens(path: Path):
    return parse_markdown(path.read_text(encoding="utf-8"))


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


def navigation_path(root: Path, path: Path) -> Path:
    root = root.resolve()
    target = path.resolve()
    if not target.is_relative_to(root):
        raise ValueError(f"link escapes checkout: {path}")
    for candidate in (path, target):
        if not candidate.is_relative_to(root):
            raise ValueError(f"link escapes checkout: {path}")
        parts = candidate.relative_to(root).parts
        if "record" in parts:
            raise ValueError(f"process record is not a current owner: {path}")
        if any(part in {"tmp", ".worktrees", ".git", "node_modules", ".venv"} for part in parts):
            raise ValueError(f"temporary/process source: {path}")
    return path


def local_target(source: Path, value: str, root: Path, *, resolve=True):
    if any(unicodedata.category(char) == "Cc" for char in value) or "\\" in value:
        raise ValueError(f"invalid local URI: {value!r}")
    parts = urlsplit(value)
    if parts.scheme.lower() == "file":
        raise ValueError(f"file URI is not a local document link: {value}")
    if parts.scheme or parts.netloc:
        return None, None
    if re.search(r"%(?![0-9a-fA-F]{2})", value):
        raise ValueError(f"invalid percent encoding: {value}")
    raw, fragment, query = (unquote(part, errors="strict") for part in (parts.path, parts.fragment, parts.query))
    if any(unicodedata.category(char) == "Cc" or char == "\\" for char in raw + fragment + query):
        raise ValueError(f"invalid decoded local URI: {value}")
    if raw.startswith("/"):
        raise ValueError(f"use repository-relative links: {value}")
    # abspath removes dot components but retains the symlink identity for input guards.
    original = source.resolve().parent / raw if raw else source.resolve()
    target = Path(os.path.abspath(original))
    if original.resolve() != target.resolve():
        raise ValueError(f"ambiguous symlink traversal: {value}")
    if not target.resolve().is_relative_to(root.resolve()):
        raise ValueError(f"link escapes checkout: {value}")
    return target.resolve() if resolve else target, fragment


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
