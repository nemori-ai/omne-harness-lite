#!/usr/bin/env python3
"""统一语言对账。

对账的是统一语言词条（形态、变体的父、出处 rev）、索引与产品 topic（当前 rev）之间的对应关系。
规矩的权威正文在 design/ubiquitous_language/conventions.md；
本工具只兑现其中机器能查的部分，不判断任何词条的内容对不对。
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import TypedDict
from urllib.parse import unquote, urldefrag

import yaml

from omne_harness_lite_spec_tools.doc_support import headings

from markdown_support import HEADING_RE, github_anchor

MORPHS = ("对象", "变体", "属性", "规则", "过程", "视图", "状态", "位置", "总称", "未定")
SEALED_ROOT = "product.0.0.1.legacy"
SEALED_PATH = f".meta_harness/design/{SEALED_ROOT}"
SEALED_TABLE = "ubiquitous_language/sealed-revisions.json"
REPOSITORY = "https://github.com/nemori-ai/omne-harness-lite/blob/"

TERM_RE = re.compile(r"^### (UL-[a-z0-9-]+) · (.+?) · (.+?)\s*$")
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
    fields: dict[str, str] = field(default_factory=dict)
    morph: str = ""
    parent: str | None = None


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
        self.revisions: dict[str, int] = {}
        self.topic_dirs: dict[str, Path] = {}
        self.sealed_commit: str | None = None
        self.sealed_revisions: dict[str, int] = {}
        self.sealed_dirs: dict[str, str] = {}
        self.sealed_anchors: dict[str, set[str]] = {}
        self.sealed_citations: set[str] = set()
        self._anchors: dict[Path, set[str]] = {}

    def error(self, message: str) -> None:
        self.errors.append(message)

    def rel(self, path: Path) -> str:
        return str(path.relative_to(self.root))

    # ── 读入 ────────────────────────────────────────────────────────────
    def load(self) -> None:
        self._load_revisions()
        self._load_terms()

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
        self._load_product_root("product")
        self._load_sealed()
        if not self.topic_dirs:
            self.error("product/: zero-current-input，没有可对账的当前 PD topic")

    def _load_sealed(self) -> None:
        if (self.root / SEALED_ROOT).exists() or (self.root / SEALED_ROOT).is_symlink():
            self.error(f"{SEALED_ROOT}/: 封存的旧产品设计已出树，不得重新出现在工作树里；出处写成封存提交上的固定链接")
        path = self.root / SEALED_TABLE
        if not path.is_file():
            return

        def unique(pairs: list[tuple[str, object]]) -> dict:
            result = {}
            for key, value in pairs:
                if key in result:
                    raise ValueError(f"{key} 重复")
                result[key] = value
            return result

        try:
            table = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique)
        except ValueError as error:
            self.error(f"{SEALED_TABLE}: 不是有效 JSON：{error}")
            return
        if not isinstance(table, dict) or set(table) != {"commit", "root", "sealed_dirs", "sealed_revisions", "anchors"}:
            self.error(f"{SEALED_TABLE}: 字段必须是 commit、root、sealed_dirs、sealed_revisions、anchors")
            return
        commit, root, directories, revisions, anchors = (
            table[name] for name in ("commit", "root", "sealed_dirs", "sealed_revisions", "anchors"))
        if not isinstance(commit, str) or re.fullmatch(r"[0-9a-f]{40}", commit) is None:
            self.error(f"{SEALED_TABLE}: commit 必须是完整的提交号")
            return
        if root != SEALED_PATH:
            self.error(f"{SEALED_TABLE}: root 必须是 {SEALED_PATH}")
            return
        if not all(isinstance(item, dict) for item in (directories, revisions, anchors)):
            self.error(f"{SEALED_TABLE}: sealed_dirs、sealed_revisions、anchors 必须是映射对象")
            return
        self.sealed_commit = commit
        for name, files in anchors.items():
            if not isinstance(files, list) or not all(isinstance(anchor, str) for anchor in files):
                self.error(f"{SEALED_TABLE}: anchors 的 {name} 必须是字符串列表")
                continue
            self.sealed_anchors[name] = set(files)
        for topic in sorted(set(directories) | set(revisions)):
            directory, revision = directories.get(topic), revisions.get(topic)
            expected = re.match(r"^(PF-\d{3})(?:-|$)", directory) if isinstance(directory, str) else None
            if expected is None or expected.group(1) != topic or "/" in directory:
                self.error(f"{SEALED_TABLE}: id {topic} 与 topic slug 不一致")
                continue
            if type(revision) is not int or revision < 1:
                self.error(f"{SEALED_TABLE}: {topic} 的 revision 必须是正整数")
                continue
            self.sealed_dirs[topic] = directory
            self.sealed_revisions[topic] = revision

    def _load_product_root(self, name: str) -> None:
        base = self.root / name
        if not base.is_dir() or base.resolve() != base:
            self.error(f"{name}/: 产品根不存在或越界别名")
            return
        revisions = self.revisions
        directories = self.topic_dirs
        seen: set[str] = set()
        for directory in sorted(base.iterdir()):
            if directory.name.startswith("."):
                continue
            if directory.is_symlink():
                self.error(f"{self.rel(directory)}: topic 目录是越界或别名链接")
                continue
            if not directory.is_dir():
                continue
            if directory.name.endswith(".legacy"):
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
            if re.fullmatch(r"PD-[a-z0-9]+(?:-[a-z0-9]+)*", topic) is None or topic != f"PD-{directory.name}":
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
            stated = self._header_rev(target.read_text(encoding="utf-8").splitlines())
            if stated is not None and stated != current:
                self.error(f"{self.rel(target)}: 写的是 rev {stated}，而 README front-matter 是 rev {current}"
                           "（以 front-matter 为准）")

    def _product_reference(self, source: Path, href: str, where: str | None = None) -> tuple[str, bool] | None:
        target, fragment = urldefrag(unquote(href))
        if target.startswith(REPOSITORY):
            return self._sealed_reference(href, target[len(REPOSITORY):], fragment, where)
        lexical = Path(os.path.abspath(source.parent / target))
        base = self.root / "product"
        if not lexical.is_relative_to(base):
            return None
        parts = lexical.relative_to(base).parts
        if len(parts) != 2 or parts[1] not in ("design.md", "flows.md"):
            return None
        topic = next((uid for uid, directory in self.topic_dirs.items() if directory == lexical.parent), None)
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
        return topic, False

    def _sealed_reference(self, href: str, location: str, fragment: str, where: str | None) -> tuple[str, bool] | None:
        """封存提交上、封存根下某个 topic 的 design.md 或 flows.md 才算出处；别的提交、别的路径不算。"""
        commit, _, path = location.partition("/")
        if not path.startswith(f"{SEALED_PATH}/"):
            return None
        if self.sealed_commit is None:
            problem = f"指向封存的旧产品设计，但封存修订表 {SEALED_TABLE} 不存在或无效"
        elif commit != self.sealed_commit:
            return None
        else:
            parts = path[len(SEALED_PATH) + 1:].split("/")
            if len(parts) != 2 or parts[1] not in ("design.md", "flows.md"):
                return None
            topic = next((uid for uid, directory in self.sealed_dirs.items() if directory == parts[0]), None)
            anchors = self.sealed_anchors.get("/".join(parts))
            if topic is None:
                problem = "引用的 topic 不在封存修订表里"
            elif anchors is None:
                problem = "引用文件不存在"
            elif fragment and fragment not in anchors:
                problem = f"引用锚点 #{fragment} 不存在"
            else:
                return topic, True
        if where is not None:
            self.error(f"{where}: {href} {problem}")
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
            for match, fields in sections(path, TERM_RE):
                term = Term(match.group(1), match.group(2), match.group(3), path,
                            github_anchor(match.group(0)[4:]), fields)
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

    # ── 对账 ────────────────────────────────────────────────────────────
    def reconcile(self) -> None:
        for uid, term in sorted(self.terms.items()):
            if term.morph == "变体" and term.parent and self.root_object(uid) is None:
                self.error(f"{uid}: 顺着「父」往上找不到一个形态为对象的词条")
            self._cited(f"{self.rel(term.path)} {term.id}「出处」", term.path, term.fields.get("出处", ""), strict=False)
        self._undecided()

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
        path = self.root / "ubiquitous_language/conflicts.md"
        if not path.is_file():
            return
        text = path.read_text(encoding="utf-8").lower()
        for uid, term in sorted(self.terms.items()):
            if term.morph == "未定" and uid.lower() not in text:
                self.error(f"{uid}「{term.zh}」形态未定，ubiquitous_language/conflicts.md 却没有提到它")

    def _cited(self, where: str, source: Path, text: str, *, strict: bool) -> None:
        """核对一段引用里的 rev，比如词条「出处」：

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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="设计根（含 ubiquitous_language/ product/）")
    parser.add_argument("--stale", choices=("fail", "report"), default="fail",
                        help="rev 落后的出处：判失败（缺省），或只列出来供本地迭代")
    args = parser.parse_args(argv)

    reconciler = Reconciler(args.root, stale=args.stale)
    reconciler.load()
    reconciler.reconcile()
    if reconciler.sealed_citations:
        print("SEALED PROVENANCE: " + "、".join(sorted(reconciler.sealed_citations))
              + "（只核出处，不是当前 PD 采用）")
    for note in reconciler.notes:
        print(f"STALE: {note}")
    for error in reconciler.errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if reconciler.errors:
        print(f"FAIL: 统一语言对账发现 {len(reconciler.errors)} 处问题。", file=sys.stderr)
        return 1
    print(f"PASS: {len(reconciler.terms)} 个词条、{len(reconciler.revisions)} 个当前 PD，对账一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
