"""Bounded Markdown structure inspection; no semantic acceptance inference."""
from __future__ import annotations

import re

from .doc_support import PARSER, slug

PLACEHOLDER = "<!-- documentation:placeholder -->"
PROFILES = {"prose-v1", "reference-v1"}
METHOD_VERSION = "markdown-inventory-1"


def parse(text: str):
    text = re.sub(r"\A---\r?\n.*?\r?\n---(?:\r?\n|$)", "", text, count=1, flags=re.S)
    return PARSER.parse(text)


def sections(tokens) -> dict[str, tuple[int, int]]:
    result, used, headings = {}, set(), []
    pending = []
    for index, token in enumerate(tokens):
        if token.type == "html_block":
            pending += re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)["\']\s*></a>', token.content)
        elif token.type == "inline":
            # CommonMark can attach a standalone anchor line to a preceding paragraph.
            pending += re.findall(r'^<a\s+(?:id|name)=["\']([^"\']+)["\']\s*></a>\s*$',
                                  token.content, flags=re.M)
        elif token.type == "heading_open":
            inline = tokens[index + 1]
            content = "".join(child.content for child in inline.children or []
                              if child.type in {"text", "code_inline", "image"})
            name, base, suffix = slug(content), slug(content), 0
            while name in used:
                suffix += 1
                name = f"{base}-{suffix}"
            used.add(name)
            headings.append((index, int(token.tag[1:]), [name, *pending]))
            pending = []
        elif token.type in {"paragraph_open", "fence", "code_block", "hr"}:
            pending = []
    for position, (start, level, names) in enumerate(headings):
        end = next((other for other, depth, _ in headings[position + 1:] if depth <= level), len(tokens))
        for name in names:
            result[name] = (start + 3, end)
    return result


def _toc(inline) -> bool:
    """Ignore link-only anchor lists used as an automatic table of contents."""
    children = inline.children or []
    links = [child for child in children if child.type == "link_open"]
    if not links or any(not (child.attrGet("href") or "").startswith("#") for child in links):
        return False
    depth = 0
    for child in children:
        if child.type == "link_open":
            depth += 1
        elif child.type == "link_close":
            depth -= 1
        elif depth == 0 and child.content.strip():
            return False
    return True


def inspect(tokens, profile: str, *, whole=False) -> str:
    if profile not in PROFILES:
        return "unknown"
    first_section = next((i for i, token in enumerate(tokens)
                          if token.type == "heading_open" and int(token.tag[1:]) > 1), len(tokens))
    markers = [i for i, token in enumerate(tokens)
               if token.type == "html_block" and PLACEHOLDER in token.content]
    if markers and (not whole or any(index < first_section for index in markers)):
        return "placeholder-only"
    body, unsupported, heading_depth = False, False, False
    for index, token in enumerate(tokens):
        if token.type == "heading_open":
            heading_depth = True
        elif token.type == "heading_close":
            heading_depth = False
        elif token.type == "inline" and not heading_depth:
            visible = "".join(child.content for child in token.children or []
                              if child.type in {"text", "code_inline", "image"})
            unsupported_inline = False
            for child in token.children or []:
                if child.type == "html_inline":
                    html = re.sub(r"<!--.*?-->", "", child.content, flags=re.S).strip()
                    html = re.sub(r'<a\s+(?:id|name)=["\'][^"\']+["\']\s*>|</a>', "", html).strip()
                    unsupported_inline |= bool(html)
            unsupported |= unsupported_inline
            if visible.strip() and not unsupported_inline and not _toc(token):
                # Marked individual sections remain gaps even if another section has a body.
                body = True
        elif token.type in {"fence", "code_block"} and token.content.strip():
            if profile == "reference-v1":
                body = True
            else:
                unsupported = True
        elif token.type == "html_block":
            content = re.sub(r"<!--.*?-->", "", token.content, flags=re.S).strip()
            content = re.sub(r'<a\s+(?:id|name)=["\'][^"\']+["\']\s*></a>', "", content).strip()
            unsupported |= bool(content)
    if body:
        return "inspectable"
    if unsupported:
        return "unknown"
    if markers:
        return "placeholder-only"
    return "empty-body"
