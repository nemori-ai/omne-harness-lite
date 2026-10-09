"""Shared Markdown headings for current design projections."""
from __future__ import annotations

import re

HEADING_RE = re.compile(r"^#{1,6}\s+(.+?)\s*$")


def github_anchor(text: str) -> str:
    # 标题里的链接按显示文字计入锚点，URL 不计：`## [记录与上下文](terms/x.md)` 的锚点是
    # `记录与上下文`。不先解析就会把路径里的字符一起算进去，得到根本不存在的锚点。
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[`*_~]", "", text.strip().lower())
    text = re.sub(r"[^\w\-\s\u4e00-\u9fff]", "", text)
    # 每个空白各生成一个连字符，不合并：GitHub 就是这么做的。
    # `UL-x · 中文 · English` 去掉 `·` 后留下两个空格，锚点因此是 `--`，用 `\s+` 会算成 `-`。
    return re.sub(r"\s", "-", text)

