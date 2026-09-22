#!/usr/bin/env python3
"""实现映射节点的对账。

核的是 `design/realization/{apps,packages}/<node>/` 每个节点的形状：kind 与目录名和
`bindings.yaml` 是否一致、assembly 才有 `architecture.md`、源码位置指向同名的包或应用、
交付面 PF 的 rev 有没有漂移、技术栈采用的状态与依据、契约坐标在不在 `registry/catalog.json` 里、
交付面还是 draft 时不得登记绑定，以及节点 markdown 里的相对链接能不能解析。

规矩的权威正文在 `design/realization/README.md` 与 `AGENTS.md`；本工具只兑现其中机器能判的那几条，
**不判断任何节点的内容对不对**——它查不出一条绑定的证据是否真能支持那条条款，
也查不出某条边少写了一侧。

只读 `--root` 指向的设计根，不从承载仓库发现 `apps/` 或 `packages/` 源码：工作区要能整体迁出。
YAML 用仓库开发依赖里已有的 PyYAML，只读 `node`、`kind`、`bindings` 三个顶层键。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urldefrag, urlparse

import yaml

# 「链接后面跟着（rev N）」是全链共用的一条写法，权威在 ubiquitous_language/conventions.md，
# 机器读法只有 domain_objects.py 里那一份；这里复用它，不另抄一遍正则。
from domain_objects import CITE_TOKEN_RE, REV_RE

AREAS = ("apps", "packages")
KINDS = ("provider", "assembly")
CATALOG = "registry/catalog.json"
DELIVERY_SECTION = "交付面与非目标"
STACK_SECTION = "技术栈采用"
COORDINATE_COLUMNS = ("契约坐标", "精确形状归谁")  # 「与其他应用的边」与「交互面」两张表里写坐标的那一列
ADOPTED, CANDIDATE = "已采用", "candidate"

SECTION_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
FIELD_RE = re.compile(r"^- ([^：:]+?)\s*[:：]\s*(.*)$")
LINK_RE = re.compile(r"\]\(([^)\s]+)\)")
SOURCE_PATH_RE = re.compile(r"\b(apps|packages)/([A-Za-z0-9][A-Za-z0-9._/-]*)")
COORDINATE_RE = re.compile(r"`([A-Za-z0-9][A-Za-z0-9.\-]*)/v(\d+)`")
PF_README_RE = re.compile(r"product/(PF-\d{3})[^/]*/README\.md$")
DECISION_RE = re.compile(r"^record/decisions/[^/]+/decision\.md$")
PROPOSAL_RE = re.compile(r"^record/proposals/[^/]+/.+$")
REVISION_RE = re.compile(r"\A---\n.*?^revision:\s*(\d+)\s*$.*?^---", re.S | re.M)
STATUS_RE = re.compile(r"^status:\s*(\S+)\s*$", re.M)
CELL_SPLIT_RE = re.compile(r"(?<!\\)\|")
SEPARATOR_RE = re.compile(r"^:?-{2,}:?$")


@dataclass
class Node:
    area: str
    path: Path
    kind: str = ""  # README 里读出来的；读不出时为空，形状与绑定的 kind 就无从比对
    delivery: list[str] = field(default_factory=list)  # 交付面引用到的 PF

    @property
    def name(self) -> str:
        return self.path.name


def cells(line: str) -> list[str]:
    """一行 Markdown 表格切成单元格；`\\|` 是单元格里的竖线，不是分隔符。"""
    text = line.strip()
    if text.startswith("|"):
        text = text[1:]
    if text.endswith("|") and not text.endswith("\\|"):
        text = text[:-1]
    return [part.replace("\\|", "|").strip() for part in CELL_SPLIT_RE.split(text)]


def cell(row: list[str], index: int) -> str:
    return row[index] if 0 <= index < len(row) else ""


def tables(lines: list[str], first_line: int):
    """连续的 `|` 行算一张表；产出 (表头单元格, [(行号, 单元格)])，对齐行不计入。"""
    block: list[tuple[int, list[str]]] = []

    def close():
        if len(block) >= 2:
            rows = [(number, row) for number, row in block[1:]
                    if not all(SEPARATOR_RE.match(part) for part in row if part)]
            yield block[0][1], rows

    for offset, line in enumerate(lines):
        if line.lstrip().startswith("|"):
            block.append((first_line + offset, cells(line)))
            continue
        yield from close()
        block = []
    yield from close()


def section(lines: list[str], title: str) -> tuple[int, list[str]] | None:
    """取标题正文与它的起始行号；到下一个同级或更高级标题为止。找不到返回 None。"""
    depth: int | None = None
    start = 0
    body: list[str] = []
    for number, line in enumerate(lines, 1):
        match = SECTION_RE.match(line)
        if match:
            if depth is None:
                if match.group(2).strip() == title:
                    depth, start = len(match.group(1)), number + 1
                continue
            if len(match.group(1)) <= depth:
                break
        if depth is not None:
            body.append(line)
    return (start, body) if depth is not None else None


def key_line(text: str, key: str) -> int:
    for number, line in enumerate(text.splitlines(), 1):
        if line.startswith(f"{key}:"):
            return number
    return 1


class Checker:
    def __init__(self, root: Path, *, stale: str = "fail") -> None:
        self.root = root.resolve()
        self.stale = stale
        self.errors: list[str] = []
        self.notes: list[str] = []
        self.nodes: list[Node] = []
        self.revisions: dict[str, int] = {}
        self.drafts: set[str] = set()  # front-matter 的 status 是 draft：那份产品正文还没被接受
        self._catalog: set[tuple[str, int]] | None = None

    def error(self, message: str) -> None:
        self.errors.append(message)

    def _stale(self, message: str) -> None:
        (self.errors if self.stale == "fail" else self.notes).append(message)

    def rel(self, path: Path) -> str:
        return str(path.relative_to(self.root))

    # ── 读入 ────────────────────────────────────────────────────────────
    def load(self) -> None:
        self._load_revisions()
        self._load_nodes()

    def _load_revisions(self) -> None:
        """产品 topic 的当前 rev 与 status，权威是各 topic README 的 front-matter；
        与 domain_objects.py 读的是同一处。缺 revision 由那个工具统一报，这里只在被引用时点名。"""
        for readme in sorted(self.root.glob("product/PF-*/README.md")):
            match = REVISION_RE.search(readme.read_text(encoding="utf-8"))
            if not match:
                continue
            topic = readme.parent.name[:6]
            self.revisions[topic] = int(match.group(1))
            status = STATUS_RE.search(match.group(0))
            if status and status.group(1) == "draft":
                self.drafts.add(topic)

    def _load_nodes(self) -> None:
        realization = self.root / "realization"
        if not realization.is_dir():
            self.error("realization/ 不存在——`--root` 要指向设计根")
            return
        for area in AREAS:
            directory = realization / area
            if not directory.is_dir():
                continue
            for path in sorted(directory.iterdir()):
                if path.is_dir() and not path.name.startswith("."):
                    self.nodes.append(Node(area, path))

    def catalog(self) -> set[tuple[str, int]]:
        """catalog 的稳定键是 (baseline_id, contract_id, version)；这里只按后两项判存在，
        节点写的坐标不带 baseline。"""
        if self._catalog is not None:
            return self._catalog
        self._catalog = set()
        path = self.root / CATALOG
        if not path.is_file():
            self.error(f"{CATALOG} 不存在，契约坐标无从核对")
            return self._catalog
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            self.error(f"{CATALOG}: 读不出来：{error}")
            return self._catalog
        for entry in data.get("contracts", []) if isinstance(data, dict) else []:
            coordinate = entry.get("coordinate", {}) if isinstance(entry, dict) else {}
            contract, version = coordinate.get("contract_id"), coordinate.get("version")
            if isinstance(contract, str) and isinstance(version, int):
                self._catalog.add((contract, version))
        return self._catalog

    # ── 对账 ────────────────────────────────────────────────────────────
    def check(self) -> None:
        self.load()
        for node in self.nodes:
            self.check_entry(node)
            self.check_architecture(node)
            self.check_bindings(node)
            self.check_links(node)

    def check_entry(self, node: Node) -> None:
        """README：kind、源码位置、交付面（仅 assembly）。"""
        path = node.path / "README.md"
        if not path.is_file():
            self.error(f"{self.rel(node.path)}: 节点缺 README.md")
            return
        fields: dict[str, tuple[int, str]] = {}
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            match = FIELD_RE.match(line)
            if match and match.group(1) not in fields:
                fields[match.group(1)] = (number, match.group(2).strip())

        found = fields.get("kind")
        if found is None:
            self.error(f"{self.rel(path)}: 没有「- kind：」行")
        else:
            number, raw = found
            value = raw.strip("`").strip()
            if value in KINDS:
                node.kind = value
            else:
                self.error(f"{self.rel(path)}:{number}: kind 写的是「{raw}」，只能是 provider 或 assembly")

        found = fields.get("源码位置")
        if found is None:
            self.error(f"{self.rel(path)}: 没有「- 源码位置：」行")
        else:
            number, raw = found
            match = SOURCE_PATH_RE.search(raw)
            if match is None:
                if "尚未建包" not in raw:
                    self.error(f"{self.rel(path)}:{number}: 源码位置写的是「{raw}」，"
                               f"要么是 {node.area}/{node.name}，要么写「尚未建包」")
            else:
                area, rest = match.group(1), match.group(2).rstrip("/")
                if area != node.area or rest.split("/")[-1] != node.name:
                    self.error(f"{self.rel(path)}:{number}: 源码位置是「{area}/{rest}」，"
                               f"节点在 realization/{node.area}/{node.name} 下——最后一段要与目录同名")

        if node.kind != "assembly":
            return
        found = fields.get("交付面")
        if found is None:
            self.error(f"{self.rel(path)}: assembly 节点没有「- 交付面：」行")
            return
        number, raw = found
        topics = self.cited(path, raw, number, "交付面")
        if not topics:
            self.error(f"{self.rel(path)}:{number}: 交付面没有指向 product/PF-*/README.md 的链接")
        node.delivery += [topic for topic in topics if topic not in node.delivery]

    def cited(self, source: Path, text: str, first_line: int, label: str) -> list[str]:
        """核对一段引用里的 rev：指向 PF README 的链接后面要跟着它那个 topic 的「（rev N）」。

        同一个 topic 连着的几条链接可以共用后面那一个；一个括号里并列几个 rev 的，
        按 topic 出现的次序配。与领域对象条目的「依据」同一条规矩。返回引用到的 topic。
        """
        topics: list[str] = []
        waiting: list[tuple[str, int]] = []  # 还没等到 rev 的 topic，按出现次序、不重复
        for match in CITE_TOKEN_RE.finditer(text):
            href, group = match.group(1), match.group(2)
            line = first_line + text.count("\n", 0, match.start())
            if href:
                target, _ = urldefrag(unquote(href))
                if urlparse(href).scheme or not target:
                    continue
                found = PF_README_RE.search((source.parent / target).resolve().as_posix())
                if found and found.group(1) not in [topic for topic, _ in waiting]:
                    waiting.append((found.group(1), line))
                continue
            if not waiting:
                continue
            revs = [int(rev) for rev in REV_RE.findall(group)]
            if len(revs) == 1:
                revs *= len(waiting)
            if len(revs) != len(waiting):
                self.error(f"{self.rel(source)}:{line}: {label}「（{group}）」前面是 {len(waiting)} 个 topic 的链接，"
                           f"却写了 {len(revs)} 个 rev，配不上对")
            for (topic, _), rev in zip(waiting, revs):
                topics.append(topic)
                current = self.revisions.get(topic)
                if current is None:
                    self.error(f"{self.rel(source)}:{line}: {label}引的 {topic} 没有 README front-matter 的 revision")
                elif current != rev:
                    self._stale(f"{self.rel(source)}:{line}: {label}标的是 {topic} rev {rev}，"
                                f"该 topic 现在是 rev {current}——复核后再改 rev")
            waiting = []
        for topic, line in waiting:
            topics.append(topic)
            self.error(f"{self.rel(source)}:{line}: {label}指向 {topic} 的链接后面没有「（rev N）」")
        return topics

    def check_architecture(self, node: Node) -> None:
        """architecture.md 只属于 assembly：交付面一节的 rev、技术栈采用表、契约坐标。"""
        path = node.path / "architecture.md"
        if node.kind == "provider":
            if path.is_file():
                self.error(f"{self.rel(path)}: provider 节点不该有 architecture.md——应用形状只属于 assembly")
            return
        if node.kind != "assembly":
            return  # kind 读不出来，形状无从判；缺 kind 已单独报过
        if not path.is_file():
            self.error(f"{self.rel(node.path)}: assembly 节点必须有 architecture.md")
            return
        lines = path.read_text(encoding="utf-8").splitlines()
        self.check_delivery(node, path, lines)
        self.check_stack(path, lines)
        self.check_coordinates(path, lines)

    def check_delivery(self, node: Node, path: Path, lines: list[str]) -> None:
        found = section(lines, DELIVERY_SECTION)
        if found is None:
            self.error(f"{self.rel(path)}: 没有「{DELIVERY_SECTION}」一节，交付面的 rev 无从核对")
            return
        start, body = found
        topics = self.cited(path, "\n".join(body), start, f"「{DELIVERY_SECTION}」")
        if not topics:
            self.error(f"{self.rel(path)}:{start}: 「{DELIVERY_SECTION}」没有指向 product/PF-*/README.md 的链接")
        node.delivery += [topic for topic in topics if topic not in node.delivery]

    def check_stack(self, path: Path, lines: list[str]) -> None:
        found = section(lines, STACK_SECTION)
        if found is None:
            self.error(f"{self.rel(path)}: 没有「{STACK_SECTION}」一节")
            return
        start, body = found
        checked = False
        for header, rows in tables(body, start):
            if "状态" not in header or "依据" not in header:
                continue
            checked = True
            for number, row in rows:
                status = cell(row, header.index("状态")).strip("`").strip()
                basis = cell(row, header.index("依据"))
                if not any(row):
                    continue
                if status == ADOPTED:
                    self.check_basis(path, number, basis, DECISION_RE,
                                     "「已采用」的依据要链到 record/decisions/<topic>/decision.md")
                elif status == CANDIDATE:
                    self.check_basis(path, number, basis, PROPOSAL_RE,
                                     "「candidate」的依据要链到 record/proposals/<topic>/ 下的文件")
                else:
                    self.error(f"{self.rel(path)}:{number}: 状态写的是「{status}」，只能是 {ADOPTED} 或 {CANDIDATE}")
        if not checked:
            self.error(f"{self.rel(path)}: 「{STACK_SECTION}」一节里没有带「状态」「依据」两列的表")

    def check_basis(self, path: Path, number: int, text: str, pattern: re.Pattern[str], expected: str) -> None:
        missing: list[str] = []
        for href in LINK_RE.findall(text):
            target, _ = urldefrag(unquote(href))
            if urlparse(href).scheme or not target:
                continue
            resolved = (path.parent / target).resolve()
            try:
                relative = resolved.relative_to(self.root).as_posix()
            except ValueError:
                continue
            if not pattern.match(relative):
                continue
            if resolved.is_file():
                return
            missing.append(relative)
        if missing:
            self.error(f"{self.rel(path)}:{number}: 依据链到 {missing[0]}，但这个文件不存在")
        else:
            self.error(f"{self.rel(path)}:{number}: {expected}，现在是「{text}」")

    def check_coordinates(self, path: Path, lines: list[str]) -> None:
        """写契约坐标的那些列：坐标要在 catalog 里；契约还没立的写「待立：<拟议名>」。"""
        for header, rows in tables(lines, 1):
            columns = [index for index, name in enumerate(header) if name in COORDINATE_COLUMNS]
            if not columns:
                continue
            for number, row in rows:
                if not any(row):
                    continue
                for column in columns:
                    value = cell(row, column)
                    coordinates = COORDINATE_RE.findall(value)
                    if not coordinates:
                        if "待立" not in value:
                            self.error(f"{self.rel(path)}:{number}: 「{header[column]}」写的是「{value}」，"
                                       "要么是反引号包住的 `contract_id/vN`，要么是「待立：<拟议名>」")
                        continue
                    for contract, version in coordinates:
                        if (contract, int(version)) not in self.catalog():
                            self.error(f"{self.rel(path)}:{number}: 契约坐标 `{contract}/v{version}` "
                                       f"不在 {CATALOG} 里")

    def check_bindings(self, node: Node) -> None:
        path = node.path / "bindings.yaml"
        if not path.is_file():
            self.error(f"{self.rel(node.path)}: 节点缺 bindings.yaml")
            return
        text = path.read_text(encoding="utf-8")
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError as error:
            self.error(f"{self.rel(path)}: YAML 解析失败：{str(error).splitlines()[0]}")
            return
        if not isinstance(data, dict):
            self.error(f"{self.rel(path)}:1: 顶层不是一张表")
            return

        if data.get("node") != node.name:
            self.error(f"{self.rel(path)}:{key_line(text, 'node')}: node 写的是「{data.get('node')}」，"
                       f"目录名是「{node.name}」")
        kind = data.get("kind")
        if kind not in KINDS:
            self.error(f"{self.rel(path)}:{key_line(text, 'kind')}: kind 写的是「{kind}」，"
                       "只能是 provider 或 assembly")
        elif node.kind and kind != node.kind:
            self.error(f"{self.rel(path)}:{key_line(text, 'kind')}: kind 写的是「{kind}」，"
                       f"README 里是「{node.kind}」")

        bindings = data.get("bindings")
        number = key_line(text, "bindings")
        if bindings is not None and not isinstance(bindings, list):
            self.error(f"{self.rel(path)}:{number}: bindings 不是列表")
            return
        drafts = [topic for topic in node.delivery if topic in self.drafts]
        if drafts and bindings:
            self.error(f"{self.rel(path)}:{number}: 交付面 {'、'.join(drafts)} 的 status 还是 draft，"
                       f"这个节点不得登记绑定，现在有 {len(bindings)} 条")

    def check_links(self, node: Node) -> None:
        """节点 markdown 里的本地相对链接要能解析；外链与纯锚点不查，锚点本身由 check_design.py 统一查。"""
        for path in sorted(node.path.rglob("*.md")):
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                for href in LINK_RE.findall(line):
                    if urlparse(href).scheme or href.startswith("//"):
                        continue
                    target, _ = urldefrag(unquote(href))
                    if not target:
                        continue
                    if not (path.parent / target).resolve().exists():
                        self.error(f"{self.rel(path)}:{number}: 链接解析不到：{href}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path,
                        help="设计根（含 realization/ product/ registry/）")
    parser.add_argument("--stale", choices=("fail", "warn", "report"), default="fail",
                        help="交付面 PF 的 rev 落后：判失败（缺省），或只列出来供本地迭代"
                             "（warn 与 report 同义，与 domain_objects.py 的开关对齐）")
    args = parser.parse_args(argv)

    checker = Checker(args.root, stale=args.stale)
    checker.check()
    for note in checker.notes:
        print(f"STALE: {note}")
    for error in checker.errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if checker.errors:
        print(f"FAIL: 实现映射节点对账发现 {len(checker.errors)} 处问题。", file=sys.stderr)
        return 1
    if not checker.nodes:
        print("PASS: realization/apps 与 realization/packages 下还没有节点，没有可对账的内容。")
        return 0
    counts = "、".join(f"{area} {sum(1 for node in checker.nodes if node.area == area)}" for area in AREAS)
    print(f"PASS: {len(checker.nodes)} 个实现映射节点（{counts}），对账一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
