#!/usr/bin/env python3
"""领域对象的对账与总表生成。

对账的是三家之间的对应关系：统一语言词条（形态、出处 rev）、领域对象条目（依据 rev）、
产品 topic（当前 rev）。规矩的权威正文在 design/domain_objects/conventions.md；
本工具只兑现其中「机器查的」那一张表，不判断任何条目的内容对不对。
"""
from __future__ import annotations

import argparse
import math
import os
import re
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import TypedDict
from urllib.parse import unquote, urldefrag

import yaml

from omne_harness_lite_spec_tools.doc_support import headings

from markdown_support import HEADING_RE, github_anchor

MORPHS = ("对象", "变体", "属性", "规则", "过程", "视图", "状态", "位置", "总称", "未定")
OBJECT_FIELDS = ("宿主", "身份", "生灭", "依据")
PENDING_FIELDS = ("现象", "牵涉", "谁来裁", "闭合条件")
VIEW = "views/domain-object-map.md"
STAMP = "- 生成时间："

TERM_RE = re.compile(r"^### (UL-[a-z0-9-]+) · (.+?) · (.+?)\s*$")
CARD_RE = re.compile(r"^### (UL-[a-z0-9-]+) · (.+?)\s*$")
FIELD_RE = re.compile(r"^- \*\*(.+?)\*\*[:：]\s*(.*)$")
LINK_RE = re.compile(r"\[([^\]]*)\]\(([^)\s]+)\)")
# 一段引用按次序切成两种记号：一条链接，或一个写着 rev 的全角括号「（rev 6）」「（rev 6 / rev 2）」
CITE_TOKEN_RE = re.compile(r"\[[^\]]*\]\(([^)\s]+)\)|（([^（）]*\brev\s*\d+[^（）]*)）")
REV_RE = re.compile(r"\brev\s*(\d+)")
INDEX_ROW_RE =re.compile(r"^\| \[(UL-[a-z0-9-]+)\]\(([^)#]+)#([^)]+)\) \| (.+?) \| (.+?) \|")


class ProductMetadata(TypedDict):
    id: str
    revision: int
    status: str


class ProductMetadataLoader(yaml.SafeLoader):
    """Read YAML safely, with YAML 1.2 core scalar types used by the TS reader."""


# Keep resolver changes local: the shared SafeLoader retains its original behavior.
ProductMetadataLoader.yaml_implicit_resolvers = {
    first: [(tag, pattern) for tag, pattern in resolvers
            if tag not in {"tag:yaml.org,2002:bool", "tag:yaml.org,2002:int",
                           "tag:yaml.org,2002:float", "tag:yaml.org,2002:timestamp",
                           "tag:yaml.org,2002:merge", "tag:yaml.org,2002:value"}]
    for first, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}
ProductMetadataLoader.add_implicit_resolver("tag:yaml.org,2002:bool",
    re.compile(r"^(?:true|True|TRUE|false|False|FALSE)$"), list("tTfF"))
ProductMetadataLoader.add_implicit_resolver("tag:yaml.org,2002:int",
    re.compile(r"^(?:[-+]?[0-9]+|0o[0-7]+|0x[0-9a-fA-F]+)$"), list("-+0123456789"))
ProductMetadataLoader.add_implicit_resolver("tag:yaml.org,2002:float",
    re.compile(r"^(?:[-+]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][-+]?[0-9]+)?"
               r"|[-+]?\.(?:inf|Inf|INF)|\.(?:nan|NaN|NAN))$"), list("-+0123456789."))


def _product_integer(loader: yaml.SafeLoader, node: yaml.ScalarNode) -> int:
    value = loader.construct_scalar(node)
    return int(value[2:], 8 if value.startswith("0o") else 16) if value.startswith(("0o", "0x")) else int(value, 10)


def _product_mapping(loader: yaml.SafeLoader, node: yaml.MappingNode, deep: bool = False) -> dict:
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if not isinstance(key, str):
            raise ValueError("front-matter 的映射键必须是字符串")
        if key in result:
            raise ValueError(f"front-matter 的 {key} 重复")
        result[key] = loader.construct_object(value_node, deep=deep)
    return result


ProductMetadataLoader.add_constructor("tag:yaml.org,2002:int", _product_integer)
ProductMetadataLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _product_mapping)


@dataclass
class Term:
    id: str
    zh: str
    en: str
    path: Path
    anchor: str
    volume: str
    fields: dict[str, str] = field(default_factory=dict)
    morph: str = ""
    parent: str | None = None


@dataclass
class Card:
    id: str
    zh: str
    anchor: str
    fields: dict[str, str] = field(default_factory=dict)


def sections(path: Path, heading: re.Pattern[str]):
    """按给定的三级标题切条目，收集每条下面的 `- **字段**：值`（值可续行）。"""
    current, name = None, None
    for line in path.read_text(encoding="utf-8").splitlines():
        match = heading.match(line)
        if match:
            current = (match, {})
            name = None
            yield current
            continue
        if current is None:
            continue
        if HEADING_RE.match(line):
            current, name = None, None
            continue
        found = FIELD_RE.match(line)
        if found:
            name = found.group(1)
            current[1][name] = found.group(2).strip()
        elif name and line.startswith("  ") and line.strip():
            current[1][name] += " " + line.strip()
        elif not line.strip():
            name = None


class Reconciler:
    def __init__(self, root: Path, *, stale: str = "fail") -> None:
        self.root = root.resolve()
        self.stale = stale
        self.errors: list[str] = []
        self.notes: list[str] = []
        self.terms: dict[str, Term] = {}
        self.by_anchor: dict[tuple[Path, str], str] = {}
        self.volumes: list[tuple[str, str]] = []  # (文件名, 卷标题)
        self.revisions: dict[str, int] = {}
        self.drafts: set[str] = set()  # front-matter 的 status 为 draft 的 topic：那份产品正文还没被接受
        self.topic_dirs: dict[str, Path] = {}
        self.sealed_revisions: dict[str, int] = {}
        self.sealed_dirs: dict[str, Path] = {}
        self.sealed_citations: set[str] = set()
        self._anchors: dict[Path, set[str]] = {}
        self.cards: dict[str, Card] = {}
        self.pending: list[tuple[str, dict[str, str]]] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def rel(self, path: Path) -> str:
        return str(path.relative_to(self.root))

    # ── 读入 ────────────────────────────────────────────────────────────
    def load(self) -> None:
        self._load_revisions()
        self._load_terms()
        self._load_cards()
        self._load_pending()

    def _metadata(self, readme: Path) -> ProductMetadata | None:
        text = readme.read_text(encoding="utf-8")
        front = re.match(r"\A---\r?\n(.*?)^---[ \t]*\r?$", text, re.S | re.M)
        if front is None:
            self.error(f"{self.rel(readme)}: 缺 front-matter")
            return None
        try:
            fields = yaml.load(front.group(1), Loader=ProductMetadataLoader)
        except (yaml.YAMLError, ValueError) as error:
            self.error(f"{self.rel(readme)}: front-matter YAML 无效：{error}")
            return None
        if not isinstance(fields, dict):
            self.error(f"{self.rel(readme)}: front-matter 必须是映射对象")
            return None
        valid = True
        for name in ("id", "revision", "status"):
            if name not in fields or fields[name] is None:
                self.error(f"{self.rel(readme)}: front-matter 里没有 {name}")
                valid = False
        identity, revision, status = (fields.get(name) for name in ("id", "revision", "status"))
        if not isinstance(identity, str) or not identity:
            self.error(f"{self.rel(readme)}: id 必须是非空字符串")
            valid = False
        if (type(revision) not in (int, float) or revision < 1 or revision > 2**53 - 1
                or not math.isfinite(revision) or int(revision) != revision):
            self.error(f"{self.rel(readme)}: revision 必须是正整数（安全数值）")
            valid = False
        if not isinstance(status, str) or not status.strip():
            self.error(f"{self.rel(readme)}: status 必须是非空状态名称")
            valid = False
        if not valid:
            return None
        return ProductMetadata(id=identity, revision=int(revision), status=status)

    def _load_revisions(self) -> None:
        self._load_product_root("product", sealed=False)
        self._load_product_root("product.0.0.1.legacy", sealed=True)
        if not self.topic_dirs:
            self.error("product/: zero-current-input，没有可对账的当前 PD topic")

    def _load_product_root(self, name: str, *, sealed: bool) -> None:
        base = self.root / name
        if sealed and not base.exists() and not base.is_symlink():
            return
        if not base.is_dir() or base.resolve() != base:
            self.error(f"{name}/: 产品根不存在或越界别名")
            return
        revisions = self.sealed_revisions if sealed else self.revisions
        directories = self.sealed_dirs if sealed else self.topic_dirs
        seen: set[str] = set()
        for directory in sorted(base.iterdir()):
            if directory.name.startswith("."):
                continue
            if directory.is_symlink():
                self.error(f"{self.rel(directory)}: topic 目录是越界或别名链接")
                continue
            if not directory.is_dir():
                continue
            if not sealed and directory.name.endswith(".legacy"):
                continue
            if sealed and not directory.name.startswith("PF-"):
                continue
            if directory.resolve() != directory:
                self.error(f"{self.rel(directory)}: topic 目录是越界或别名链接")
                continue
            readme = directory / "README.md"
            if not readme.is_file() or readme.resolve() != readme:
                self.error(f"{self.rel(readme)}: README 不存在或越界别名")
                continue
            fields = self._metadata(readme)
            if fields is None:
                continue
            topic = fields["id"]
            if topic in seen:
                self.error(f"{self.rel(readme)}: topic id {topic} 重复")
                continue
            seen.add(topic)
            expected = re.match(r"^(PF-\d{3})(?:-|$)", directory.name) if sealed else None
            valid_id = (expected is not None and topic == expected.group(1)) if sealed else (
                re.fullmatch(r"PD-[a-z0-9]+(?:-[a-z0-9]+)*", topic) is not None
                and topic == f"PD-{directory.name}")
            if not valid_id:
                self.error(f"{self.rel(readme)}: id {topic} 与 topic slug 不一致")
                continue
            target = directory / "design.md"
            if not target.is_file() or target.resolve() != target:
                self.error(f"{self.rel(target)}: 产品正文不存在或越界别名")
                continue
            flows = directory / "flows.md"
            if flows.is_symlink() or (flows.exists() and not flows.is_file()):
                self.error(f"{self.rel(flows)}: 产品正文不是文件或是越界别名")
                continue
            current = int(fields["revision"])
            directories[topic] = directory
            revisions[topic] = current
            if not sealed and fields["status"] == "draft":
                self.drafts.add(topic)
            stated = self._header_rev(target.read_text(encoding="utf-8").splitlines())
            if stated is not None and stated != current:
                self.error(f"{self.rel(target)}: 写的是 rev {stated}，而 README front-matter 是 rev {current}"
                           "（以 front-matter 为准）")

    def _product_reference(self, source: Path, href: str, where: str | None = None) -> tuple[str, bool] | None:
        target, fragment = urldefrag(unquote(href))
        lexical = Path(os.path.abspath(source.parent / target))
        for name, directories, sealed in (("product", self.topic_dirs, False),
                                         ("product.0.0.1.legacy", self.sealed_dirs, True)):
            base = self.root / name
            if not lexical.is_relative_to(base):
                continue
            parts = lexical.relative_to(base).parts
            if len(parts) != 2 or parts[1] not in ("design.md", "flows.md"):
                return None
            topic = next((uid for uid, directory in directories.items() if directory == lexical.parent), None)
            problem = None
            if lexical.resolve() != lexical:
                problem = "引用目标是越界或别名链接"
            elif topic is None:
                problem = "引用的 topic 没有有效 README 元数据"
            elif not lexical.is_file():
                problem = "引用文件不存在"
            elif fragment:
                if lexical not in self._anchors:
                    self._anchors[lexical] = headings.__wrapped__(lexical)
                if fragment not in self._anchors[lexical]:
                    problem = f"引用锚点 #{fragment} 不存在"
            if problem:
                if where is not None:
                    self.error(f"{where}: {href} {problem}")
                return None
            return topic, sealed
        return None

    @staticmethod
    def _header_rev(lines: list[str]) -> int | None:
        for line in lines[1:8]:
            if line.startswith("#"):
                break
            match = re.search(r"\brev\s*(\d+)", line)
            if match:
                return int(match.group(1))
        return None

    def _load_terms(self) -> None:
        language = self.root / "ubiquitous_language"
        for path in sorted((language / "terms").glob("*.md")):
            title = next((m.group(1) for m in map(HEADING_RE.match, path.read_text(encoding="utf-8").splitlines())
                          if m), path.stem)
            self.volumes.append((path.name, title))
            for match, fields in sections(path, TERM_RE):
                term = Term(match.group(1), match.group(2), match.group(3), path,
                            github_anchor(match.group(0)[4:]), path.name, fields)
                if term.id in self.terms:
                    self.error(f"{self.rel(path)}: 词条 {term.id} 重复")
                self.terms[term.id] = term
                self.by_anchor[(path.resolve(), term.anchor)] = term.id
        for term in self.terms.values():
            self._morph(term)
        self._index(language / "index.md")

    def _morph(self, term: Term) -> None:
        raw = term.fields.get("形态")
        where = f"{self.rel(term.path)} {term.id}"
        if raw is None:
            self.error(f"{where}: 缺「形态」字段")
            return
        match = re.match(r"(\S+?)(?:（(.*)）)?$", raw)
        if not match or match.group(1) not in MORPHS:
            self.error(f"{where}: 形态「{raw}」不在取值表里")
            return
        term.morph = match.group(1)
        if term.morph != "变体":
            return
        link = LINK_RE.search(match.group(2) or "")
        parent = self._term_of(term.path, link.group(2)) if link else None
        if parent is None:
            if "无词条" not in (match.group(2) or ""):
                self.error(f"{where}: 变体的「父」没有指向一个词条")
            return
        term.parent = parent

    def _term_of(self, source: Path, href: str) -> str | None:
        target, fragment = urldefrag(unquote(href))
        path = (source.parent / target).resolve() if target else source.resolve()
        return self.by_anchor.get((path, github_anchor(fragment)))

    def _index(self, index: Path) -> None:
        if not index.is_file():
            self.error("ubiquitous_language/index.md 不存在")
            return
        seen = set()
        for number, line in enumerate(index.read_text(encoding="utf-8").splitlines(), 1):
            match = INDEX_ROW_RE.match(line)
            if not match:
                continue
            uid, target, anchor, zh, en = (part.strip() for part in match.groups())
            seen.add(uid)
            term = self.terms.get(uid)
            where = f"ubiquitous_language/index.md:{number}"
            if term is None:
                # 同一行的锚点若指向一个真实词条，说明是 ID 写岔了，把那一条点出来
                actual = self.by_anchor.get(((index.parent / target).resolve(), github_anchor(unquote(anchor))))
                hint = f"；这一行的链接指向的是 {actual}" if actual else ""
                self.error(f"{where}: 索引里的 {uid} 在分卷里找不到{hint}")
                continue
            if (index.parent / target).resolve() != term.path.resolve() or github_anchor(unquote(anchor)) != term.anchor:
                self.error(f"{where}: {uid} 的链接与分卷里的标题对不上")
            if (zh, en) != (term.zh, term.en):
                self.error(f"{where}: {uid} 的名字是「{zh} · {en}」，分卷里是「{term.zh} · {term.en}」")
        for uid in sorted(set(self.terms) - seen):
            self.error(f"ubiquitous_language/index.md: 分卷里的 {uid} 没有登记进索引")

    def _load_cards(self) -> None:
        path = self.root / "domain_objects/objects.md"
        if not path.is_file():
            self.error("domain_objects/objects.md 不存在")
            return
        for match, fields in sections(path, CARD_RE):
            card = Card(match.group(1), match.group(2), github_anchor(match.group(0)[4:]), fields)
            if card.id in self.cards:
                self.error(f"domain_objects/objects.md: 条目 {card.id} 重复")
            self.cards[card.id] = card

    def _load_pending(self) -> None:
        path = self.root / "domain_objects/pending.md"
        if not path.is_file():
            self.error("domain_objects/pending.md 不存在")
            return
        self.pending = [(match.group(1), fields) for match, fields in
                        sections(path, re.compile(r"^### (.+?)\s*$"))]

    # ── 对账 ────────────────────────────────────────────────────────────
    def reconcile(self) -> None:
        objects = {uid for uid, term in self.terms.items() if term.morph == "对象"}
        for uid in sorted(objects - set(self.cards)):
            self.error(f"{uid}「{self.terms[uid].zh}」形态为对象，domain_objects/objects.md 却没有它的条目")
        for uid, card in sorted(self.cards.items()):
            term = self.terms.get(uid)
            if term is None:
                self.error(f"domain_objects/objects.md {uid}: 没有这个词条——先立词条，立不了的进 pending.md")
                continue
            if term.morph != "对象":
                self.error(f"domain_objects/objects.md {uid}: 词条形态是「{term.morph or '缺'}」，不该有对象条目")
            if card.zh != term.zh:
                self.error(f"domain_objects/objects.md {uid}: 标题写「{card.zh}」，词条叫「{term.zh}」")
            for name in OBJECT_FIELDS:
                if not card.fields.get(name):
                    self.error(f"domain_objects/objects.md {uid}: 缺「{name}」")
            self._cited(f"domain_objects/objects.md {uid}「依据」", self.root / "domain_objects/objects.md",
                        card.fields.get("依据", ""), strict=True)
        for uid, term in sorted(self.terms.items()):
            if term.morph == "变体" and term.parent and self.root_object(uid) is None:
                self.error(f"{uid}: 顺着「父」往上找不到一个形态为对象的词条")
            self._cited(f"{self.rel(term.path)} {term.id}「出处」", term.path, term.fields.get("出处", ""), strict=False)
        self._undecided()
        for name, fields in self.pending:
            for required in PENDING_FIELDS:
                if not fields.get(required):
                    self.error(f"domain_objects/pending.md「{name}」: 缺「{required}」")
            self._cited(f"domain_objects/pending.md「{name}」牵涉", self.root / "domain_objects/pending.md",
                        fields.get("牵涉", ""), strict=False)

    def root_object(self, uid: str) -> str | None:
        """变体可以是变体的变体（插队 → 控制指令 → 入站到达）；顺着「父」走到第一个对象为止。"""
        seen: set[str] = set()
        while uid not in seen:
            seen.add(uid)
            term = self.terms[uid]
            if term.morph == "对象":
                return uid
            if term.morph != "变体" or not term.parent:
                return None
            uid = term.parent
        return None

    def _undecided(self) -> None:
        texts = {name: (self.root / name).read_text(encoding="utf-8").lower()
                 for name in ("domain_objects/pending.md", "ubiquitous_language/conflicts.md")
                 if (self.root / name).is_file()}
        for uid, term in sorted(self.terms.items()):
            if term.morph != "未定":
                continue
            for name, text in texts.items():
                if uid.lower() not in text:
                    self.error(f"{uid}「{term.zh}」形态未定，{name} 却没有提到它")

    def _cited(self, where: str, source: Path, text: str, *, strict: bool) -> None:
        """核对一段引用里的 rev。词条「出处」、条目「依据」、待裁「牵涉」同一条规矩：

        指向产品正文的链接，后面要跟着它那个 topic 的「（rev N）」。同一个 topic 连着的几条链接
        可以共用后面那一个；一个括号里并列几个 rev 的，按 topic 出现的次序配。
        strict 时每条链接都必须指向产品正文，且至少有一条。
        """
        waiting: list[tuple[str, bool]] = []
        cited = False
        for href, group in CITE_TOKEN_RE.findall(text):
            if href:
                reference = self._product_reference(source, href, where)
                if reference is None:
                    if strict:
                        self.error(f"{where}: {href} 不是某个 topic 的 design.md 或 flows.md 有效出处")
                elif reference not in waiting:
                    waiting.append(reference)
                continue
            if not waiting:
                continue
            revs = [int(rev) for rev in REV_RE.findall(group)]
            if len(revs) == 1:
                revs *= len(waiting)
            if len(revs) != len(waiting):
                self.error(f"{where}:「（{group}）」前面是 {len(waiting)} 个 topic 的链接，却写了 {len(revs)} 个 rev，配不上对")
            for (topic, sealed), rev in zip(waiting, revs):
                cited = True
                current = (self.sealed_revisions if sealed else self.revisions).get(topic)
                if sealed:
                    self.sealed_citations.add(topic)
                if sealed and current != rev:
                    self.error(f"{where}: sealed provenance {topic} 标的是 rev {rev}，封存修订是 rev {current}")
                elif current is not None and current != rev:
                    self._stale(f"{where}: 标的是 {topic} rev {rev}，该 topic 现在是 rev {current}——复核后再改 rev")
            waiting = []
        if waiting:
            self.error(f"{where}: 指向 {'、'.join(topic for topic, _ in waiting)} 的链接后面没有「（rev N）」")
        elif strict and not cited:
            self.error(f"{where}: 至少要有一条指向产品正文、带 rev 的依据")

    def _stale(self, message: str) -> None:
        (self.errors if self.stale == "fail" else self.notes).append(message)

    # ── 总表 ────────────────────────────────────────────────────────────
    def backlinks(self) -> dict[str, set[str]]:
        """产品正文里指向词条的链接：谁还在讲这个对象。"""
        found: dict[str, set[str]] = {}
        for topic, directory in self.topic_dirs.items():
            for name in ("design.md", "flows.md"):
                path = directory / name
                if not path.is_file() or path.resolve() != path:
                    continue
                for _, href in LINK_RE.findall(path.read_text(encoding="utf-8")):
                    if "ubiquitous_language/terms/" not in href:
                        continue
                    uid = self._term_of(path, href)
                    if uid:
                        found.setdefault(uid, set()).add(topic)
        return found

    def render(self) -> str:
        links = self.backlinks()
        up = "../domain_objects/objects.md"

        def card_link(uid: str) -> str:
            card = self.cards.get(uid)
            return f"[{self.terms[uid].zh}]({up}#{card.anchor})" if card else self.terms[uid].zh

        def term_link(term: Term) -> str:
            return f"[{term.id}](../ubiquitous_language/terms/{term.path.name}#{term.anchor})"

        def hoist(text: str) -> str:  # 条目内的站内链接，搬到 views/ 下要补上文件名
            return re.sub(r"\]\(#", f"]({up}#", text).replace("|", "\\|")

        def definers(card: Card | None) -> list[str]:
            topics: list[str] = []
            for _, href in LINK_RE.findall(card.fields.get("依据", "") if card else ""):
                reference = self._product_reference(self.root / "domain_objects/objects.md", href)
                if reference and reference[0] not in topics:
                    topics.append(reference[0])
            return topics

        children: dict[str, list[Term]] = {}
        for term in self.terms.values():
            owner = self.root_object(term.id) if term.morph == "变体" else None
            if owner:
                children.setdefault(owner, []).append(term)

        objects = [term for term in self.terms.values() if term.morph == "对象"]
        out = ["# 领域对象地图", "",
               "> **这一页由生成器产出，没有人手写，也没有人手改；不得引为依据。**",
               "> 要引用，引[领域对象条目](../domain_objects/objects.md)、"
               "[统一语言词条](../ubiquitous_language/index.md)或它们指向的产品正文。",
               "",
               "- derived-from：`ubiquitous_language/terms/*.md`（形态、变体的父）· `domain_objects/objects.md` · "
               "`domain_objects/pending.md` · `product/*/{README,design,flows}.md`（当前 PD rev、反链）· `product.0.0.1.legacy/PF-*/{README,design,flows}.md`（sealed provenance，不是当前采用）",
               f"{STAMP}{date.today().isoformat()}",
               "- 生成：`python tooling/src/domain_objects.py --root design --write`",
               "",
               f"对象 **{len(objects)}** 个，变体 **{sum(len(v) for v in children.values())}** 个，"
               f"形态未定的词条 **{sum(1 for t in self.terms.values() if t.morph == '未定')}** 个，"
               f"待裁 **{len(self.pending)}** 项。", "",
               "**按统一语言的分卷排**——分卷「按它回答什么问题」，是全链里唯一不随对象重新分解而搬家的维度。"
               "这不是能力边界，也不是限界上下文；那是系统架构设计的事。", "",
               "「依据所在」「还有谁在讲」里标着**（草稿）**的 topic，front-matter 的 `status` 还是 `draft`——"
               "**那份产品正文尚未被接受**，建在它上面的对象骨架随时可能跟着变。", ""]

        def mark(topic: str, short: bool = False) -> str:
            return ((topic[3:] if short else topic) + ("（sealed provenance）" if topic in self.sealed_dirs else "")
                    + ("（草稿）" if topic in self.drafts else ""))

        for filename, title in self.volumes:
            rows = [term for term in objects if term.volume == filename]
            if not rows:
                continue
            out += [f"## {title}", "", "| 对象 | 词条 | 宿主 | 变体 | 依据所在 | 还有谁在讲 |", "|---|---|---|---|---|---|"]
            for term in rows:
                card = self.cards.get(term.id)
                own = definers(card)
                others = sorted((links.get(term.id, set()) | set(own[1:])) - set(own[:1]))
                variants = "、".join(child.zh for child in children.get(term.id, [])) or "—"
                out.append(f"| {card_link(term.id)} | {term_link(term)} | "
                           f"{hoist(card.fields.get('宿主', '—')) if card else '—'} | {variants} | "
                           f"{mark(own[0]) if own else '—'} | {' '.join(mark(t, short=True) for t in others) or '—'} |")
            out.append("")

        hosted: dict[str, list[str]] = {}
        for uid, card in self.cards.items():
            for _, href in LINK_RE.findall(card.fields.get("宿主", "")):
                host = next((other for other, c in self.cards.items() if href == f"#{c.anchor}"), None)
                if host and uid in self.terms:
                    hosted.setdefault(host, []).append(uid)
        out += ["## 谁寄宿在谁身上", "",
                "从各条目「宿主」里的链接倒排出来。会换宿主的对象会出现在不止一行。", "",
                "| 宿主 | 寄宿在它身上的 |", "|---|---|"]
        for host in sorted(hosted, key=lambda h: -len(hosted[h])):
            out.append(f"| {card_link(host)} | {'、'.join(card_link(uid) for uid in hosted[host])} |")

        out += ["", "## 还悬着的", "", "### 形态未定的词条", ""]
        undecided = [term for term in self.terms.values() if term.morph == "未定"]
        out += [f"- {term_link(term)}「{term.zh}」" for term in undecided] or ["无。"]
        out += ["", "### 待裁", "",
                "全文在 [pending.md](../domain_objects/pending.md)。", "", "| 待裁项 | 谁来裁 |", "|---|---|"]
        for name, fields in self.pending:
            anchor = github_anchor(name)
            out.append(f"| [{name}](../domain_objects/pending.md#{anchor}) | "
                       f"{hoist(fields.get('谁来裁', '—')).replace('](objects.md', f']({up}')} |")
        quiet = [term for term in objects if not links.get(term.id)]
        out += ["", "### 没有任何产品正文链接到的对象词条", "",
                "产品正文提到它却没有链到词条，「还有谁在讲」那一列就是空的——这一列的空，多半是链接稀疏，不是没人讲。", ""]
        out += ["、".join(f"{term.zh}" for term in quiet) + "。" if quiet else "无。", ""]
        return "\n".join(out)


def same_but_stamp(left: str, right: str) -> bool:
    strip = lambda text: [line for line in text.splitlines() if not line.startswith(STAMP)]  # noqa: E731
    return strip(left) == strip(right)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="设计根（含 ubiquitous_language/ product/ domain_objects/）")
    parser.add_argument("--write", action="store_true", help=f"重新生成 {VIEW}；缺省只核对它是不是最新")
    parser.add_argument("--stale", choices=("fail", "report"), default="fail",
                        help="rev 落后的出处与依据：判失败（缺省），或只列出来供本地迭代")
    args = parser.parse_args(argv)

    reconciler = Reconciler(args.root, stale=args.stale)
    reconciler.load()
    reconciler.reconcile()
    view = reconciler.root / VIEW
    if not reconciler.errors:
        rendered = reconciler.render()
        if args.write:
            if not (view.is_file() and same_but_stamp(view.read_text(encoding="utf-8"), rendered)):
                view.write_text(rendered, encoding="utf-8")
                print(f"WROTE: {VIEW}")
        elif not view.is_file() or not same_but_stamp(view.read_text(encoding="utf-8"), rendered):
            reconciler.error(f"{VIEW} 不是最新的——运行 --write 重新生成")
    if reconciler.sealed_citations:
        print("SEALED PROVENANCE: " + "、".join(sorted(reconciler.sealed_citations))
              + "（只核出处，不是当前 PD 采用）")
    for note in reconciler.notes:
        print(f"STALE: {note}")
    for error in reconciler.errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if reconciler.errors:
        print(f"FAIL: 领域对象对账发现 {len(reconciler.errors)} 处问题。", file=sys.stderr)
        return 1
    print(f"PASS: {len(reconciler.terms)} 个词条、{len(reconciler.cards)} 条对象条目、"
          f"{len(reconciler.pending)} 项待裁、{len(reconciler.revisions)} 个当前 PD，对账一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
