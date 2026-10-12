from __future__ import annotations

import re

from .doc_support import _ExplicitAnchors, parse_markdown, slug

PLACEHOLDER = "<!-- documentation:placeholder -->"
PROFILES = {"prose-v1", "reference-v1"}
METHOD_VERSION = "markdown-inventory-1"


def parse(text: str):
    return parse_markdown(text)


def _anchors(token) -> list[str]:
    parser = _ExplicitAnchors()
    if token.type == "html_block":
        parser.feed(token.content)
    for child in token.children or []:
        if child.type == "html_inline":
            parser.feed(child.content)
    return sorted(parser.anchors)


def sections(tokens) -> dict[str, tuple[int, int]]:
    result, used, headings = {}, set(), []
    pending = []
    for index, token in enumerate(tokens):
        if token.type == "inline" and index > 0 and tokens[index - 1].type == "heading_open":
            continue
        if token.type in {"html_block", "inline"}:
            if token.type == "inline" and any(child.type in {"text", "code_inline", "image"}
                                               and child.content.strip() for child in token.children or []):
                pending = []
            pending += _anchors(token)
        elif token.type == "heading_open":
            inline = tokens[index + 1]
            content = "".join(child.content for child in inline.children or []
                              if child.type in {"text", "code_inline", "image"})
            name, base, suffix = slug(content), slug(content), 0
            while name in used:
                suffix += 1
                name = f"{base}-{suffix}"
            used.add(name)
            headings.append((index, int(token.tag[1:]), [name, *pending, *_anchors(inline)]))
            pending = []
        elif token.type in {"paragraph_open", "fence", "code_block", "hr"}:
            pending = []
    for position, (start, level, names) in enumerate(headings):
        end = next((other for other, depth, _ in headings[position + 1:] if depth <= level), len(tokens))
        for name in names:
            result[name] = (start + 3, end)
    return result


def section_excerpt(text: str, tokens, anchor: str) -> str | None:
    span = sections(tokens).get(anchor)
    if span is None:
        return None
    start, end = span
    if inspect(tokens[start:end], "prose-v1") == "empty-body":
        return None
    heading = tokens[start - 3]
    first = heading.map[0]
    last = tokens[end].map[0] if end < len(tokens) else len(text.splitlines())
    return "".join(text.splitlines(keepends=True)[first:last])


def _toc(inline) -> bool:
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
