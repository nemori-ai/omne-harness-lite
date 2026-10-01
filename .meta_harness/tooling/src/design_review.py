#!/usr/bin/env python3
"""设计评审报告：对契约做确定性的机械核对，并给出契约依赖图上的结构读数。

只读，不是门禁：报出问题时退出码仍为 0；只有用法错误、清单或配置读不了才非零。
报出的每一条都是「按机械判据成立」，不等于契约有错——由评审者逐条判断。
语义上的判断（一句话有没有两种读法、同名不同义……）不做，见 NOT_COVERED。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from bisect import bisect_right
from dataclasses import asdict, dataclass, field
from fractions import Fraction
from json.decoder import scanstring
from pathlib import Path
from typing import Any, Iterable, Iterator
from urllib.parse import unquote, urldefrag

from design_validation import Invalid, github_anchor, load_json, require_list, require_object, require_text
from domain_objects import Reconciler

CONFIG_PATH = Path(__file__).resolve().parents[1] / "design-review.config.json"

CHECKS = ("bare-clause-ref", "analysis-id-in-contract", "stale-product-rev", "dependency-clause-missing",
          "covers-target-missing", "unregistered-file", "nine-items", "open-failure-set")

NOT_COVERED = (
    "一句话有没有两种读法",
    "同名不同义",
    "用词是不是统一语言的词条",
    "状态词有没有混用",
    "业务选择对不对",
    "Schema 与正文在语义上是否一致",
    "带坐标的条款引用（如 data.x/v1#S-7）在目标契约里是否存在；正文引用的坐标是否与 catalog 依赖一致",
    "写在简称后的条款号（如「RT12 S-5」「EC S-34」）指向哪份契约：工具不解析简称，这类归「未能判定」",
    "产品依据与 covers 指向的产品小节，内容上是否真的支持那条契约条款",
)

CLAUSE_HEADING_RE = re.compile(r"^#{1,6}\s+(?:\*\*)?S-(\d+)(?!\d)")
HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
CLAUSE_REF_RE = re.compile(r"(?<![A-Za-z0-9_\-.])S-(\d+)(?!\d)")
ANALYSIS_ID_RE = re.compile(r"(?<![A-Za-z0-9_\-])(INV|SAF|LIV)-\d+(?!\d)")
LINK_RE = re.compile(r"\[((?:[^\[\]]|\[[^\]]*\])*)\]\(([^)\s]*)\)")
# 最内层的链接：`[外层 [`#S-53`](别的文件) …](#本文件)` 里，S-53 归内层那条
INNER_LINK_RE = re.compile(r"\[([^\[\]]*)\]\(([^)\s]*)\)")
# 契约身份写在正文里：`data.x`、`capability.x/v2`、`composition.x` v3、`data.x · v1`
CONTRACT_MENTION_RE = re.compile(
    r"\b((?:data|capability|composition)\.[a-z0-9][a-z0-9-]*)`?(?:\s*(?:/|·)?\s*v(\d+))?")
SENTENCE_BREAK_RE = re.compile(r"[。！？]")
LIST_ITEM_RE = re.compile(r"^\s*(?:>\s*)*(?:[-*+]|\d+[.)])\s")
# 条款号前紧挨着的拉丁词是简称（runtime7、EC、MS8）；「EC S-34/S-59」「EC S-55～S-59」里后面几个也归它。工具不解析简称
_ALIAS = r"(?<![A-Za-z0-9_.\-])([A-Za-z][A-Za-z0-9._-]*)[\s`*#]*"
ALIAS_BEFORE_RE = re.compile(_ALIAS + r"(?:S-\d+[\s`*#]*(?:[/／、,，～~]|和|与|及)[\s`*#]*)*$")
ALIAS_PAIR_RE = re.compile(_ALIAS + r"S-\d+")
LOCAL_BEFORE_RE = re.compile(r"(本契约|本版|本节)[\s`*#的第]*$")
PRODUCT_REV_RE = re.compile(r"PF-(\d{3})\s*rev\s*(\d+)(\s*[～~–-]\s*\d+)?")
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫"
OPEN_ITEM_RE = re.compile(r"^(?:其他|其它)(?:错误|失败|情形|情况|原因|值)?$|^等等?$|^etc\.?$|^…+$|^\.{3}$", re.I)
OPEN_TAIL_RE = re.compile(r"(?:`|\s)\s*(?:等等?|etc\.?|…+|\.{3})$", re.I)
ITEM_SPLIT_RE = re.compile(r"[·、,，；;/]")


class ReportError(Exception):
    """清单或配置读不了：报告无从产出，非零退出。"""


class UsageError(Exception):
    """命令行参数不合用（例如 --contract 给的坐标不在 catalog 里）。"""


@dataclass(frozen=True)
class Config:
    unstable_dependency_margin: Fraction
    fan_top: int


@dataclass
class Finding:
    check: str
    status: str  # finding | undetermined
    coordinate: str
    path: str
    line: int
    message: str


@dataclass
class Dependency:
    target: str  # 坐标标签 contract_id/vN
    clauses: list[str]
    index: int  # 在 owner 的 dependencies 里的下标，用来定位行号
    legacy: bool  # 坐标属于旧谱系 baseline，不在当前 catalog 里


@dataclass
class Contract:
    label: str
    contract_id: str
    version: int
    family: str
    status: str
    path: str
    resources: list[str]
    index: int
    dependencies: list[Dependency] = field(default_factory=list)


@dataclass
class ContractText:
    lines: list[str]
    fenced: list[bool]
    defined: set[int]


# ── 读入 ────────────────────────────────────────────────────────────────────
def load_config(path: Path) -> Config:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise ReportError(f"配置文件不存在：{path}") from error
    except json.JSONDecodeError as error:
        raise ReportError(f"配置文件不是合法 JSON：{path}:{error.lineno}:{error.colno}: {error.msg}") from error
    if not isinstance(raw, dict):
        raise ReportError(f"配置文件顶层必须是对象：{path}")
    expected = {"unstableDependencyMargin", "fanTop"}
    if set(raw) != expected:
        raise ReportError(f"配置文件的键必须恰为 {sorted(expected)}，实际是 {sorted(raw)}：{path}")
    margin, top = raw["unstableDependencyMargin"], raw["fanTop"]
    if isinstance(margin, bool) or not isinstance(margin, (int, float)) or not 0 <= margin < 1:
        raise ReportError(f"unstableDependencyMargin 必须是 [0, 1) 里的数，实际是 {margin!r}：{path}")
    if isinstance(top, bool) or not isinstance(top, int) or top < 1:
        raise ReportError(f"fanTop 必须是正整数，实际是 {top!r}：{path}")
    # 用十进制写法转分数，阈值比较不受二进制浮点误差影响
    return Config(Fraction(repr(margin)), top)


def json_lines(text: str) -> dict[tuple[Any, ...], int]:
    """每个 JSON 值起始处的行号，键是从根到它的路径（对象键或数组下标）。

    标准库的 json 不给位置；清单里的发现要能指回行号，这里只扫一遍文本记位置，
    值本身仍以 json.loads 的结果为准。
    """
    starts = [0] + [index + 1 for index, char in enumerate(text) if char == "\n"]
    positions: dict[tuple[Any, ...], int] = {}
    number = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null")

    def skip(pos: int) -> int:
        while pos < len(text) and text[pos] in " \t\r\n":
            pos += 1
        return pos

    def value(pos: int, path: tuple[Any, ...]) -> int:
        pos = skip(pos)
        positions[path] = bisect_right(starts, pos)
        char = text[pos]
        if char == "{":
            pos = skip(pos + 1)
            if text[pos] == "}":
                return pos + 1
            while True:
                key, pos = scanstring(text, skip(pos) + 1)
                pos = skip(pos) + 1  # 冒号
                pos = skip(value(pos, path + (key,)))
                if text[pos] == "}":
                    return pos + 1
                pos += 1  # 逗号
        if char == "[":
            pos = skip(pos + 1)
            if text[pos] == "]":
                return pos + 1
            index = 0
            while True:
                pos = skip(value(pos, path + (index,)))
                index += 1
                if text[pos] == "]":
                    return pos + 1
                pos += 1
        if char == '"':
            return scanstring(text, pos + 1)[1]
        match = number.match(text, pos)
        if match is None:
            raise ReportError(f"无法定位 JSON 值的位置（第 {positions[path]} 行）")
        return match.end()

    value(0, ())
    return positions


def read_manifest(root: Path, name: str) -> tuple[Any, dict[tuple[Any, ...], int]]:
    path = root / "registry" / name
    try:
        data = load_json(path)
    except Invalid as error:
        raise ReportError(str(error)) from error
    return data, json_lines(path.read_text(encoding="utf-8"))


def label_of(contract_id: str, version: int) -> str:
    return f"{contract_id}/v{version}"


def load_catalog(root: Path) -> tuple[dict[str, Contract], dict[tuple[Any, ...], int]]:
    data, lines = read_manifest(root, "catalog.json")
    try:
        catalog = require_object(data, "catalog.json")
        baseline = require_text(catalog.get("baseline_id"), "catalog.json.baseline_id")
        contracts: dict[str, Contract] = {}
        raw_items = require_list(catalog.get("contracts"), "catalog.json.contracts")
        for index, raw in enumerate(raw_items):
            where = f"catalog.json.contracts[{index}]"
            item = require_object(raw, where)
            coordinate = require_object(item.get("coordinate"), f"{where}.coordinate")
            label = label_of(require_text(coordinate.get("contract_id"), f"{where}.coordinate.contract_id"),
                             _version(coordinate.get("version"), f"{where}.coordinate.version"))
            contracts[label] = Contract(
                label, coordinate["contract_id"], coordinate["version"],
                require_text(item.get("family"), f"{where}.family"),
                require_text(item.get("status"), f"{where}.status"),
                require_text(item.get("contract_path"), f"{where}.contract_path"),
                [require_text(r, f"{where}.resources[]") for r in require_list(item.get("resources"), f"{where}.resources")],
                index)
        for index, raw in enumerate(raw_items):
            owner = contracts[label_of(raw["coordinate"]["contract_id"], raw["coordinate"]["version"])]
            for dindex, raw_dep in enumerate(require_list(raw.get("dependencies"), f"{owner.label}.dependencies")):
                where = f"catalog.json.contracts[{index}].dependencies[{dindex}]"
                dep = require_object(raw_dep, where)
                coordinate = require_object(dep.get("coordinate"), f"{where}.coordinate")
                target = label_of(require_text(coordinate.get("contract_id"), f"{where}.coordinate.contract_id"),
                                  _version(coordinate.get("version"), f"{where}.coordinate.version"))
                clauses = [require_text(c, f"{where}.clauses[]") for c in require_list(dep.get("clauses"), f"{where}.clauses")]
                owner.dependencies.append(Dependency(target, clauses, dindex, coordinate.get("baseline_id") != baseline))
    except Invalid as error:
        raise ReportError(f"catalog.json 读不了：{error}") from error
    return contracts, lines


def _version(value: Any, where: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value < 1:
        raise Invalid(f"{where} must be a positive integer")
    return value


def read_text(path: Path) -> ContractText | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, UnicodeDecodeError):
        return None
    fenced, inside = [], False
    defined: set[int] = set()
    for line in lines:
        if FENCE_RE.match(line):
            fenced.append(True)
            inside = not inside
            continue
        fenced.append(inside)
        match = CLAUSE_HEADING_RE.match(line) if not inside else None
        if match:
            defined.add(int(match.group(1)))
    return ContractText(lines, fenced, defined)


def describe_defined(defined: set[int]) -> str:
    if not defined:
        return "没有定义任何条款"
    top = max(defined)
    if defined == set(range(1, top + 1)):
        return f"只定义了 S-1～S-{top}"
    return f"定义了 {len(defined)} 条（最大 S-{top}，中间有空号）"


# ── 逐份核对：正文 ──────────────────────────────────────────────────────────
class Review:
    def __init__(self, root: Path, contracts: dict[str, Contract], scope: list[str], include_frozen: bool) -> None:
        """scope 为空表示没给 --contract：逐份核对 catalog 里的全部坐标。"""
        self.root = root
        self.contracts = contracts
        self.scoped = bool(scope)
        self.scope = scope or list(contracts)
        self.include_frozen = include_frozen
        self.findings: list[Finding] = []
        self._texts: dict[str, ContractText | None] = {}
        # catalog 里的 topic 名单独写出来（`model-request-runtime/v3`、`account-identity`）也认作写出了契约
        topics = sorted({c.contract_id.split(".", 1)[-1] for c in contracts.values()}, key=len, reverse=True)
        self.topic_re = re.compile(
            r"(?<![A-Za-z0-9_.\-/])(" + "|".join(map(re.escape, topics)) + r")`?(?:\s*/\s*v(\d+))?(?![A-Za-z0-9_\-])"
        ) if topics else None

    def add(self, check: str, status: str, contract: str, path: str, line: int, message: str) -> None:
        self.findings.append(Finding(check, status, contract, path, line, message))

    def text(self, label: str) -> ContractText | None:
        if label not in self._texts:
            self._texts[label] = read_text(self.root / self.contracts[label].path)
        return self._texts[label]

    def run(self, catalog_lines: dict[tuple[Any, ...], int]) -> None:
        for label in self.scope:
            contract = self.contracts[label]
            text = self.text(label)
            if text is None:
                self.add("bare-clause-ref", "undetermined", label, contract.path, 1, "契约正文读不到（文件缺失或不是 UTF-8）")
                continue
            self.bare_clause_refs(contract, text)
            self.analysis_ids(contract, text)
            if contract.family in ("capabilities", "compositions"):
                self.nine_items(contract, text)
            self.unregistered_files(contract, catalog_lines)
        self.stale_product_revs()
        self.dependency_clauses(catalog_lines)
        self.covers_targets()

    # bare-clause-ref ---------------------------------------------------------
    def bare_clause_refs(self, contract: Contract, text: ContractText) -> None:
        """「带坐标」按句子认：同一句里写出了别的契约（身份文字或指向它正文的链接），句中的条款号就有了归属。

        句子在段落里切（一段可以折成几行），表格一行算一句，标题自成一句；「同上」行沿用上一行的契约。
        这样同一句里先写 `data.x/v1#S-7`、分号后再说「S-7 的……」不算裸引用；跨句才需要读者回头找的算。
        """
        if not text.defined:
            self.add("bare-clause-ref", "undetermined", contract.label, contract.path, 1,
                     "正文里没有以「S-n」开头的标题，认不出本契约定义了哪些条款")
            return
        here = (self.root / contract.path).resolve()
        bare: dict[int, list[str]] = {}
        alias: dict[int, list[tuple[str, str, str]]] = {}  # (理由, 细节, 条款号)
        fenced: dict[int, list[str]] = {}
        previous_row_mentioned = False
        for unit in text_units(text):
            mentioned = False
            if unit.kind == "row":
                ditto = any(cell == "同上" for cell in split_cells(unit.text))
                mentioned = self._mentions_other(contract, unit.text, here) or (ditto and previous_row_mentioned)
            previous_row_mentioned = mentioned
            links = [(m.start(1), m.end(1), m.start(2), m.end(2), m.group(2))
                     for m in INNER_LINK_RE.finditer(unit.text)]
            for match in CLAUSE_REF_RE.finditer(unit.text):
                verdict = self._classify(contract, text, unit, match, links, here, mentioned)
                if verdict is None:
                    continue
                token, number = match.group(0), unit.line_at(match.start())
                if verdict[0] == "bare":
                    bare.setdefault(number, []).append(token)
                elif verdict[0] == "fenced":
                    fenced.setdefault(number, []).append(token)
                else:
                    alias.setdefault(number, []).append((verdict[0], verdict[1], token))
        for number, tokens in sorted(bare.items()):
            self.add("bare-clause-ref", "finding", contract.label, contract.path, number,
                     f"引了 {'、'.join(_unique(tokens))}，同一句里没有坐标、也不是指向别的文件的链接；"
                     f"本契约{describe_defined(text.defined)}")
        for number, reasons in sorted(alias.items()):
            self.add("bare-clause-ref", "undetermined", contract.label, contract.path, number,
                     f"{describe_context(reasons)}；本契约没有这些条款，工具不判断它们指向哪份契约")
        for number, tokens in sorted(fenced.items()):
            self.add("bare-clause-ref", "undetermined", contract.label, contract.path, number,
                     f"代码块里出现 {'、'.join(_unique(tokens))}，本契约没有这条；代码块里的引用工具不判断")

    def _classify(self, contract: Contract, text: ContractText, unit: Unit, match: re.Match[str],
                  links: list[tuple[int, int, int, int, str]], here: Path,
                  row_mentioned: bool) -> tuple[str, str] | None:
        """一处条款号该怎样报：None 不报；("bare"|"fenced"|未能判定的理由, 细节)。"""
        position, clause = match.start(), int(match.group(1))
        if any(start <= position < end for _, _, start, end, _ in links):
            return None  # 在链接地址里
        if unit.kind == "heading" and position == unit.clause_heading_at:
            return None  # 标题开头的那个是定义本身
        if clause in text.defined:
            return None
        if unit.fenced:
            return "fenced", ""
        link = next((l for l in links if l[0] <= position < l[1]), None)
        if link is not None:
            target = urldefrag(unquote(link[4]))[0]
            if target and (here.parent / target).resolve() != here:
                return None  # 指向别的文件的链接文字
            return "bare", ""  # 指向本文件，却没有这条
        if LOCAL_BEFORE_RE.search(unit.text[:position]):
            return "bare", ""  # 明说是本契约的
        return self._context(contract, unit, position, here, row_mentioned)

    def _context(self, contract: Contract, unit: Unit, position: int, here: Path,
                 row_mentioned: bool) -> tuple[str, str] | None:
        """一个本契约没有的条款号，它的上下文给没给出别的契约。

        None：给了，不报；("bare", "")：没给，成立；其余是「未能判定」的 (理由, 细节)。
        """
        before = unit.text[:position]
        if unit.kind == "row" and row_mentioned:
            return None
        start, end = sentence_bounds(unit.text, position)
        if self._mentions_other(contract, unit.text[start:end], here):
            return None
        # `#S-n` 是本仓库「上文那份契约的条款」的写法：同一段里前面已写出别的契约，就归它
        if before.endswith("#") and self._mentions_other(contract, before, here):
            return None
        found = ALIAS_BEFORE_RE.search(before)
        if found:
            return "alias", found.group(1)
        found = ALIAS_PAIR_RE.search(unit.text[start:end])
        if found:
            return "sentence-alias", found.group(1)
        if unit.heading and self._mentions_other(contract, unit.heading, here):
            return "heading", unit.heading.strip("# ")
        return "bare", ""

    def _mentions_other(self, contract: Contract, part: str, here: Path) -> bool:
        """这一段里有没有写出别的契约：契约身份或 topic 名，或指向别的契约正文的链接。"""
        for match in CONTRACT_MENTION_RE.finditer(part):
            version = match.group(2)
            if match.group(1) != contract.contract_id or (version and int(version) != contract.version):
                return True
        own_topic = contract.contract_id.split(".", 1)[-1]
        for match in self.topic_re.finditer(part) if self.topic_re else ():
            version = match.group(2)
            if match.group(1) != own_topic or (version and int(version) != contract.version):
                return True
        spec = self.root / "spec"
        for match in INNER_LINK_RE.finditer(part):
            target = urldefrag(unquote(match.group(2)))[0]
            if not target or not target.endswith("contract.md"):
                continue
            resolved = (here.parent / target).resolve()
            if resolved != here and resolved.is_relative_to(spec):
                return True
        return False

    # analysis-id-in-contract -------------------------------------------------
    def analysis_ids(self, contract: Contract, text: ContractText) -> None:
        for number, line in enumerate(text.lines, 1):
            found = _unique(m.group(0) for m in ANALYSIS_ID_RE.finditer(line))
            if not found:
                continue
            listed = "、".join(found)
            if text.fenced[number - 1] or line.lstrip().startswith(">"):
                where = "代码块" if text.fenced[number - 1] else "引用块"
                self.add("analysis-id-in-contract", "undetermined", contract.label, contract.path, number,
                         f"{where}里出现分析阶段编号 {listed}，可能是作为反例引用，工具不判断")
            else:
                self.add("analysis-id-in-contract", "finding", contract.label, contract.path, number,
                         f"正文里出现分析阶段编号 {listed}；它们只在那次分析产物内有效，契约条款应改用 S- 编号")

    # nine-items / open-failure-set ------------------------------------------
    def nine_items(self, contract: Contract, text: ContractText) -> None:
        tables = list(markdown_tables(text))
        definitions = [t for t in tables if t.header[:2] == ["#", "写什么"] and len(t.header) == 2 and t.markers]
        operations = [t for t in tables if t.header == ["#", "内容"] and t.markers]
        if not definitions:
            mentioned = any("九件事" in line for line in text.lines)
            reason = (f"有 {len(operations)} 张「# | 内容」操作表，但" if operations
                      else "正文提到「九件事」，但" if mentioned else "")
            self.add("nine-items", "undetermined", contract.label, contract.path, 1,
                     f"{reason}没有「# | 写什么」形式的九件事定义表，不判")
            return
        required = definitions[0].markers
        if any(t.markers != required for t in definitions[1:]):
            self.add("nine-items", "undetermined", contract.label, contract.path, definitions[1].line,
                     "有不止一张九件事定义表且要求的项不同，不判")
            return
        failure = next((marker for marker, content in definitions[0].rows if "失败" in content), None)
        for table in tables:
            if table in definitions or table in operations or not table.header or table.header[0] != "#":
                continue
            if set(required) <= set(table.markers):
                self.add("nine-items", "undetermined", contract.label, contract.path, table.line,
                         f"带 {required[0]}～{required[-1]} 的表头是「{' | '.join(table.header)}」，"
                         "不是「# | 内容」两列格式，不判")
        for table in operations:
            self._operation(contract, table, required, failure)
        if failure is None:
            self.add("open-failure-set", "undetermined", contract.label, contract.path, definitions[0].line,
                     "九件事定义表里没有一项写着「失败」，认不出哪一格是失败集合")

    def _operation(self, contract: Contract, table: Table, required: list[str], failure: str | None) -> None:
        """一张「# | 内容」操作表：定义表要求的项是否逐项有内容，失败集合那一格是否闭合。"""
        name = table.heading or "（无标题）"
        cells = dict(table.rows)
        missing = [m for m in required if m not in cells]
        empty = [m for m in required if m in cells and not _visible(cells[m])]
        dashed = [m for m in required if m in cells and _visible(cells[m]) in ("—", "-", "–", "——")]
        if missing or empty:
            parts = ([f"缺 {''.join(missing)} 行"] if missing else []) + ([f"{''.join(empty)} 为空"] if empty else [])
            self.add("nine-items", "finding", contract.label, contract.path, table.line,
                     f"「{name}」的操作表{'，'.join(parts)}；定义表要求 {''.join(required)}")
        if dashed:
            self.add("nine-items", "undetermined", contract.label, contract.path, table.line,
                     f"「{name}」的 {''.join(dashed)} 只写了破折号，算不算有内容工具不判断")
        if failure is None or failure not in cells:
            return
        verdict, last = open_tail(cells[failure])
        if verdict == "open":
            self.add("open-failure-set", "finding", contract.label, contract.path, table.row_lines[failure],
                     f"「{name}」的失败集合（{failure}）以「{last}」收尾，是开放式的；期望闭合枚举")
        elif verdict == "unsure":
            self.add("open-failure-set", "undetermined", contract.label, contract.path, table.row_lines[failure],
                     f"「{name}」的失败集合（{failure}）最后一项是「{last}」，以「其他」开头但不只是「其他」，"
                     "是否开放工具不判断")

    # unregistered-file -------------------------------------------------------
    def unregistered_files(self, contract: Contract, catalog_lines: dict[tuple[Any, ...], int]) -> None:
        directory = self.root / Path(contract.path).parent
        if not directory.is_dir():
            return
        registered = set(contract.resources)
        line = catalog_lines.get(("contracts", contract.index, "resources"), 1)
        for path in sorted(p for p in directory.rglob("*") if p.is_file()):
            relative = path.relative_to(self.root).as_posix()
            if relative not in registered:
                self.add("unregistered-file", "finding", contract.label, "registry/catalog.json", line,
                         f"版本目录里的 {relative} 不在 resources 里")

    # stale-product-rev -------------------------------------------------------
    def stale_product_revs(self) -> None:
        targets = [l for l in self.scope if self.include_frozen or self.contracts[l].status == "candidate"]
        if not targets:
            return
        reconciler = Reconciler(self.root)
        # 产品 topic 的当前 rev 以 README front-matter 为准，读法与领域对象对账是同一份
        reconciler._load_revisions()
        revisions = reconciler.revisions
        frozen = self._frozen_paths()
        for label in targets:
            contract = self.contracts[label]
            text = self.text(label)
            if text is None:
                continue
            stated = product_basis(text)
            if not stated:
                self.add("stale-product-rev", "undetermined", label, contract.path, 1,
                         "没找到「产品依据」后面写的 PF-nnn rev k")
                continue
            note = ""
            if contract.status != "candidate":
                note = ("；已冻结，不能原地改" if contract.path in frozen else f"；状态 {contract.status}")
            for topic, rev, number, ranged in stated:
                current = revisions.get(topic)
                if ranged:
                    self.add("stale-product-rev", "undetermined", label, contract.path, number,
                             f"产品依据写的是 {topic} 的一个 rev 区间，工具不判断取哪一个")
                elif current is None:
                    self.add("stale-product-rev", "undetermined", label, contract.path, number,
                             f"产品依据写 {topic} rev {rev}，但读不到该 topic README front-matter 的 revision")
                elif current != rev:
                    self.add("stale-product-rev", "finding", label, contract.path, number,
                             f"产品依据写 {topic} rev {rev}，该 topic 当前是 rev {current}{note}")

    def _frozen_paths(self) -> set[str]:
        path = self.root / "registry" / "frozen.json"
        if not path.is_file():
            return set()
        try:
            files = require_object(load_json(path), "frozen.json").get("files", {})
        except Invalid as error:
            raise ReportError(f"frozen.json 读不了：{error}") from error
        return set(files) if isinstance(files, dict) else set()

    # dependency-clause-missing -----------------------------------------------
    def dependency_clauses(self, catalog_lines: dict[tuple[Any, ...], int]) -> None:
        scope = set(self.scope)
        for owner in self.contracts.values():
            for dep in owner.dependencies:
                if owner.label not in scope and dep.target not in scope:
                    continue
                line = catalog_lines.get(("contracts", owner.index, "dependencies", dep.index), 1)
                if dep.legacy or dep.target not in self.contracts:
                    self.add("dependency-clause-missing", "undetermined", owner.label, "registry/catalog.json", line,
                             f"依赖 {dep.target} 不在当前 catalog（旧谱系或未登记），读不到它的条款")
                    continue
                text = self.text(dep.target)
                if text is None or not text.defined:
                    self.add("dependency-clause-missing", "undetermined", owner.label, "registry/catalog.json", line,
                             f"认不出 {dep.target} 定义了哪些条款（正文读不到或没有「S-n」标题）")
                    continue
                for cindex, clause in enumerate(dep.clauses):
                    match = re.fullmatch(r"S-(\d+)", clause)
                    where = catalog_lines.get(("contracts", owner.index, "dependencies", dep.index, "clauses", cindex), line)
                    if match is None:
                        self.add("dependency-clause-missing", "undetermined", owner.label, "registry/catalog.json",
                                 where, f"依赖 {dep.target} 消费的「{clause}」不是 S-n 形式，不判")
                    elif int(match.group(1)) not in text.defined:
                        self.add("dependency-clause-missing", "finding", owner.label, "registry/catalog.json", where,
                                 f"依赖声明消费 {dep.target} 的 {clause}，目标契约{describe_defined(text.defined)}")

    # covers-target-missing ---------------------------------------------------
    def covers_targets(self) -> None:
        path = self.root / "registry" / "covers.json"
        if not path.is_file():
            return
        data, lines = read_manifest(self.root, "covers.json")
        try:
            covers = require_list(require_object(data, "covers.json").get("covers"), "covers.json.covers")
        except Invalid as error:
            raise ReportError(f"covers.json 读不了：{error}") from error
        scope = set(self.scope)
        anchors: dict[Path, set[str] | None] = {}
        for index, raw in enumerate(covers):
            try:
                cover = require_object(raw, f"covers[{index}]")
                target = require_object(cover.get("target"), f"covers[{index}].target")
                requirement = require_object(cover.get("requirement"), f"covers[{index}].requirement")
                label = label_of(require_text(target.get("contract_id"), "contract_id"),
                                 _version(target.get("version"), "version"))
            except Invalid as error:
                raise ReportError(f"covers.json 第 {index} 项读不了：{error}") from error
            line = lines.get(("covers", index), 1)
            if label not in self.contracts:
                if not self.scoped:  # 不在 catalog 的坐标不涉及任何给定坐标，只在未给 --contract 时报
                    self.add("covers-target-missing", "finding", label, "registry/covers.json", line,
                             f"覆盖指向的坐标 {label} 不在 catalog 里")
                continue
            if label not in scope:
                continue
            text = self.text(label)
            for cindex, clause in enumerate(target.get("clauses") or []):
                where = lines.get(("covers", index, "target", "clauses", cindex), line)
                match = re.fullmatch(r"S-(\d+)", str(clause))
                if text is None or not text.defined:
                    self.add("covers-target-missing", "undetermined", label, "registry/covers.json", where,
                             f"认不出 {label} 定义了哪些条款，{clause} 不判")
                elif match is None:
                    self.add("covers-target-missing", "undetermined", label, "registry/covers.json", where,
                             f"覆盖目标「{clause}」不是 S-n 形式，不判")
                elif int(match.group(1)) not in text.defined:
                    self.add("covers-target-missing", "finding", label, "registry/covers.json", where,
                             f"覆盖指向 {label} 的 {clause}，目标契约{describe_defined(text.defined)}")
            self._requirement(label, requirement, lines.get(("covers", index, "requirement", "clause"), line), anchors)

    def _requirement(self, label: str, requirement: dict[str, Any], line: int,
                     anchors: dict[Path, set[str] | None]) -> None:
        topic, clause = requirement.get("topic"), requirement.get("clause")
        if not isinstance(topic, str) or not isinstance(clause, str) or "/" in topic:
            self.add("covers-target-missing", "undetermined", label, "registry/covers.json", line,
                     f"需求条款写法不是「topic + 文件#小节」：{topic!r} {clause!r}，不判")
            return
        name, fragment = urldefrag(clause)
        path = self.root / "product" / topic / name
        if path not in anchors:
            anchors[path] = markdown_anchors(path)
        found = anchors[path]
        if found is None:
            self.add("covers-target-missing", "finding", label, "registry/covers.json", line,
                     f"需求条款 {topic}/{clause} 指向的文件不存在")
        elif fragment and github_anchor(unquote(fragment)) not in found and unquote(fragment) not in found:
            self.add("covers-target-missing", "finding", label, "registry/covers.json", line,
                     f"需求条款 {topic}/{clause} 指向的小节在 {name} 里不存在")


@dataclass
class Unit:
    """认坐标的上下文单位：一个段落（可折成几行）、一行表格、一个标题或代码块里的一行。"""
    kind: str  # paragraph | row | heading | fenced
    text: str
    first_line: int
    heading: str  # 所在小节的标题行
    clause_heading_at: int | None = None

    @property
    def fenced(self) -> bool:
        return self.kind == "fenced"

    def line_at(self, position: int) -> int:
        return self.first_line + self.text.count("\n", 0, position)


def text_units(text: ContractText) -> Iterator[Unit]:
    paragraph: list[str] = []
    start = 0
    section = ""

    def flush() -> Iterator[Unit]:
        if paragraph:
            yield Unit("paragraph", "\n".join(paragraph), start, section)

    for number, line in enumerate(text.lines, 1):
        if text.fenced[number - 1]:
            yield from flush()
            paragraph = []
            yield Unit("fenced", line, number, section)
            continue
        heading = HEADING_RE.match(line)
        if not line.strip() or line.lstrip().startswith("|") or heading:
            yield from flush()
            paragraph = []
            if heading:
                section = line
                clause = CLAUSE_HEADING_RE.match(line)
                yield Unit("heading", line, number, "", clause.start(1) - 2 if clause else None)
            elif line.strip():
                yield Unit("row", line, number, section)
            continue
        if paragraph and LIST_ITEM_RE.match(line):
            yield from flush()
            paragraph = []
        if not paragraph:
            start = number
        paragraph.append(line)
    yield from flush()


def sentence_bounds(text: str, position: int) -> tuple[int, int]:
    """position 所在的那一句：句号、问号、叹号之间（分号不断句）。"""
    start = max((m.end() for m in SENTENCE_BREAK_RE.finditer(text, 0, position)), default=0)
    after = SENTENCE_BREAK_RE.search(text, position)
    return start, after.start() if after else len(text)


@dataclass
class Table:
    line: int
    header: list[str]
    rows: list[tuple[str, str]]  # (首列标记, 第二列内容)
    row_lines: dict[str, int]
    heading: str

    @property
    def markers(self) -> list[str]:
        return [marker for marker, _ in self.rows if marker]


def split_cells(line: str) -> list[str]:
    text = line.strip()
    if text.startswith("|"):
        text = text[1:]
    if text.endswith("|") and not text.endswith("\\|"):
        text = text[:-1]
    return [part.replace("\\|", "|").strip() for part in re.split(r"(?<!\\)\|", text)]


def markdown_tables(text: ContractText) -> Iterator[Table]:
    """连续的 `|` 行算一张表；只收首列是圈号（①…）的行，表外最近的标题记为它的名字。"""
    heading = ""
    block: list[tuple[int, str]] = []

    def close() -> Iterator[Table]:
        if len(block) < 3:
            return
        rows, row_lines = [], {}
        for number, line in block[2:]:
            cells = split_cells(line)
            marker = _visible(cells[0]) if cells else ""
            if marker and marker[0] in CIRCLED:
                rows.append((marker, cells[1] if len(cells) > 1 else ""))
                row_lines.setdefault(marker, number)
        yield Table(block[0][0], split_cells(block[0][1]), rows, row_lines, heading)

    for number, line in enumerate(text.lines, 1):
        if not text.fenced[number - 1] and line.lstrip().startswith("|"):
            block.append((number, line))
            continue
        yield from close()
        block = []
        match = HEADING_RE.match(line)
        if match and not text.fenced[number - 1]:
            heading = match.group(2)
    yield from close()


def _visible(text: str) -> str:
    return re.sub(r"[*`\s]", "", text)


def open_tail(cell: str) -> tuple[str, str]:
    """失败集合那一格怎样收尾：("open", 那一项)、("unsure", 那一项) 或 ("closed", "")。

    只看第一个句号之前的列举；之后是说明文字（如「没有『其他』」），不算。
    """
    text = LINK_RE.sub(lambda m: m.group(1), cell).replace("**", "")
    listed = text.split("。", 1)[0].strip()
    tail = OPEN_TAIL_RE.search(listed)
    if tail:
        return "open", tail.group(0).strip(" `")
    items = [item.strip(" `（）()") for item in ITEM_SPLIT_RE.split(listed)]
    items = [item for item in items if item]
    if not items:
        return "closed", ""
    if OPEN_ITEM_RE.match(items[-1]):
        return "open", items[-1]
    if items[-1].startswith(("其他", "其它")):
        return "unsure", items[-1]
    return "closed", ""


def product_basis(text: ContractText) -> list[tuple[str, int, int, bool]]:
    """「产品依据」那一句里的 PF-nnn rev k；括号里的补充说明（例如「由 rev 16 对到 rev 19」）不算。"""
    found: list[tuple[str, int, int, bool]] = []
    seen: set[tuple[str, int]] = set()
    for number, line in enumerate(text.lines, 1):
        if text.fenced[number - 1] or "产品依据" not in line:
            continue
        sentence = line[line.index("产品依据"):].split("。", 1)[0]
        sentence = LINK_RE.sub(lambda m: m.group(1), sentence).replace("**", "").replace("`", "")
        sentence = strip_parentheticals(sentence)
        for match in PRODUCT_REV_RE.finditer(sentence):
            key = (f"PF-{match.group(1)}", int(match.group(2)))
            if key in seen:
                continue
            seen.add(key)
            found.append((key[0], key[1], number, bool(match.group(3))))
    return found


def strip_parentheticals(text: str) -> str:
    previous = None
    while previous != text:
        previous = text
        text = re.sub(r"（[^（）]*）|\([^()]*\)", "", text)
    return text


def markdown_anchors(path: Path) -> set[str] | None:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (FileNotFoundError, UnicodeDecodeError, IsADirectoryError):
        return None
    anchors: set[str] = set()
    counts: dict[str, int] = {}
    inside = False
    for line in lines:
        if FENCE_RE.match(line):
            inside = not inside
            continue
        match = HEADING_RE.match(line) if not inside else None
        if match:
            anchor = github_anchor(match.group(2))
            # GitHub 给重名标题依次加 -1、-2
            anchors.add(anchor if anchor not in counts else f"{anchor}-{counts[anchor]}")
            counts[anchor] = counts.get(anchor, 0) + 1
        for explicit in re.findall(r'<a\s+(?:name|id)="([^"]+)"', line):
            anchors.add(explicit)
    return anchors


def describe_context(reasons: list[tuple[str, str, str]]) -> str:
    """把一行里归「未能判定」的条款号按理由合成一句。"""
    parts = []
    by_alias = _unique(f"{detail} {token}" for kind, detail, token in reasons if kind == "alias")
    if by_alias:
        parts.append(f"「{'」「'.join(by_alias)}」的条款号前是简称，不是 catalog 坐标")
    for kind, template in (("sentence-alias", "{tokens} 所在的句子里有简称「{detail}」引条款，可能指同一份契约"),
                           ("heading", "{tokens} 所在小节的标题写的是别的契约（{detail}），可能指它")):
        for detail in _unique(d for k, d, _ in reasons if k == kind):
            tokens = "、".join(_unique(t for k, d, t in reasons if k == kind and d == detail))
            parts.append(template.format(tokens=tokens, detail=detail))
    return "；".join(parts)


def _unique(items: Iterable[str]) -> list[str]:
    return list(dict.fromkeys(items))


# ── 依赖图 ──────────────────────────────────────────────────────────────────
def dependency_graph(contracts: dict[str, Contract], config: Config) -> dict[str, Any]:
    edges = {label: _unique(d.target for d in c.dependencies if not d.legacy and d.target in contracts)
             for label, c in contracts.items()}
    incoming = {label: 0 for label in contracts}
    for targets in edges.values():
        for target in targets:
            incoming[target] += 1

    def instability(label: str) -> Fraction | None:
        total = incoming[label] + len(edges[label])
        return Fraction(len(edges[label]), total) if total else None

    order = list(contracts)
    cycles = [sorted(component, key=order.index) for component in strongly_connected(order, edges)
              if len(component) > 1 or component[0] in edges[component[0]]]
    unstable = []
    for source in order:
        for target in edges[source]:
            left, right = instability(source), instability(target)
            if left is not None and right is not None and right - left > config.unstable_dependency_margin:
                unstable.append({"from": source, "to": target,
                                 "from_instability": _ratio(left), "to_instability": _ratio(right)})
    fan = sorted(order, key=lambda label: (-(incoming[label] + len(edges[label])), order.index(label)))
    return {
        "cycles": cycles,
        "unstable_dependencies": unstable,
        "fan": [{"coordinate": label, "in": incoming[label], "out": len(edges[label]),
                 "instability": _ratio(instability(label))} for label in fan[:config.fan_top]],
    }


def _ratio(value: Fraction | None) -> float | None:
    return None if value is None else round(float(value), 4)


def strongly_connected(order: list[str], edges: dict[str, list[str]]) -> list[list[str]]:
    """Tarjan 强连通分量，迭代写法，避免深依赖链撞上递归深度。"""
    index: dict[str, int] = {}
    low: dict[str, int] = {}
    stack: list[str] = []
    on_stack: set[str] = set()
    components: list[list[str]] = []
    counter = 0
    for root in order:
        if root in index:
            continue
        work = [(root, iter(edges[root]))]
        index[root] = low[root] = counter
        counter += 1
        stack.append(root)
        on_stack.add(root)
        while work:
            node, children = work[-1]
            child = next(children, None)
            if child is not None:
                if child not in index:
                    index[child] = low[child] = counter
                    counter += 1
                    stack.append(child)
                    on_stack.add(child)
                    work.append((child, iter(edges[child])))
                elif child in on_stack:
                    low[node] = min(low[node], index[child])
                continue
            work.pop()
            if work:
                parent = work[-1][0]
                low[parent] = min(low[parent], low[node])
            if low[node] == index[node]:
                component = []
                while True:
                    member = stack.pop()
                    on_stack.discard(member)
                    component.append(member)
                    if member == node:
                        break
                components.append(component)
    return components


# ── 输出 ────────────────────────────────────────────────────────────────────
def build_report(root: Path, contract_args: list[str], include_frozen: bool, config: Config) -> dict[str, Any]:
    root = root.resolve()
    contracts, catalog_lines = load_catalog(root)
    scope = []
    for raw in contract_args:
        if raw not in contracts:
            raise UsageError(f"--contract {raw}：catalog 里没有这个坐标（写法是 <contract_id>/v<N>）")
        scope.append(raw)
    review = Review(root, contracts, _unique(scope), include_frozen)
    review.run(catalog_lines)
    order = {name: position for position, name in enumerate(CHECKS)}
    findings = sorted(review.findings, key=lambda f: (order[f.check], f.path, f.line, f.coordinate, f.message))
    graph = dependency_graph(contracts, config)
    graph_lines = {label: catalog_lines.get(("contracts", c.index), 1) for label, c in contracts.items()}
    return {"scope": review.scope, "findings": [asdict(f) for f in findings], "graph": graph,
            "not_covered": list(NOT_COVERED), "_graph_lines": graph_lines}


def render_text(report: dict[str, Any], config: Config) -> str:
    def line_of(f: dict[str, Any]) -> str:
        return f"[{f['check']}] {f['path']}:{f['line']}  {f['coordinate']}  {f['message']}"

    found = [f for f in report["findings"] if f["status"] == "finding"]
    undetermined = [f for f in report["findings"] if f["status"] == "undetermined"]
    graph, at = report["graph"], report["_graph_lines"]
    graph_out = []
    for cycle in graph["cycles"]:
        graph_out.append(f"[dependency-cycle] registry/catalog.json:{at[cycle[0]]}  {cycle[0]}  "
                         f"这些坐标互相依赖成环：{' → '.join(cycle)}")
    for edge in graph["unstable_dependencies"]:
        graph_out.append(f"[unstable-dependency] registry/catalog.json:{at[edge['from']]}  {edge['from']}  "
                         f"依赖更不稳定的 {edge['to']}：I={edge['from_instability']} → I={edge['to_instability']}，"
                         f"差超过阈值 {float(config.unstable_dependency_margin)}")
    for item in graph["fan"]:
        graph_out.append(f"[fan] registry/catalog.json:{at[item['coordinate']]}  {item['coordinate']}  "
                         f"入 {item['in']} · 出 {item['out']} · I={item['instability']}")
    scope = report["scope"]
    out = [f"设计评审报告（只读，不是门禁）：逐份核对 {len(scope)} 个坐标；依赖图按全部 catalog 计算", ""]
    for title, lines in (("成立的问题", [line_of(f) for f in found]),
                         ("未能判定", [line_of(f) for f in undetermined]),
                         ("依赖图", graph_out),
                         ("未覆盖", [f"- {item}" for item in report["not_covered"]])):
        out += [f"## {title}（{len(lines)}）", ""] + (lines or ["无。"]) + [""]
    return "\n".join(out)


def main(argv: list[str] | None = None, *, config_path: Path = CONFIG_PATH) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, type=Path, help="设计根（含 registry/ spec/ product/）")
    parser.add_argument("--contract", action="append", default=[], metavar="<contract_id>/v<N>",
                        help="只逐份核对这些坐标；可重复。缺省核对 catalog 里的全部坐标")
    parser.add_argument("--include-frozen", action="store_true",
                        help="stale-product-rev 也看非 candidate 的坐标（缺省只看 candidate）")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args(argv)
    if not (args.root / "registry").is_dir():
        parser.error(f"--root {args.root} 下没有 registry/，不是设计根")
    try:
        config = load_config(config_path)
        report = build_report(args.root, args.contract, args.include_frozen, config)
    except UsageError as error:
        parser.error(str(error))
    except ReportError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    if args.format == "json":
        public = {key: value for key, value in report.items() if not key.startswith("_")}
        print(json.dumps(public, ensure_ascii=False, indent=2))
    else:
        print(render_text(report, config))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
