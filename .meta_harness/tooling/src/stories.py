#!/usr/bin/env python3
"""故事卡的对账。

核的是 `design/product/PF-*/stories.md` 里每张卡的形状，以及卡与验收场景之间的对应：
卡号唯一且与所在 topic 的编号一致、必填字段齐全、「覆盖场景」里的每条链接都指得到某个 topic
`acceptance.md` 里一行带编号的场景、一条场景至多属于一张卡、「前置」指到的卡存在且不成环、
演示的每一步都写着应当看到什么、未就绪的卡写着缺什么。

规矩的权威正文在 `design/product/conventions.md`；本工具只兑现其中机器能判的那几条，
**不判断卡切得好不好**——它查不出一张卡是不是真的只证明一件事、演示能不能照着做出来、
顺序排得对不对。本 topic 里没有被任何卡覆盖的带编号场景只列出来，不判失败：远处的场景可以还没有卡。

只读 `--root` 指向的设计根。链接的锚点由 `check_design.py` 对设计根下全部 Markdown 统一查，这里不重复。
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urldefrag

TOPIC_RE = re.compile(r"^PF-(\d{3})(?:-|$)")
CARD_ID = r"ST-(\d{3})-(\d{2})"
CARD_RE = re.compile(rf"^###\s+({CARD_ID})\s*·\s*(\S.*?)\s*$")
CARD_LIKE_RE = re.compile(r"^#{1,6}\s+ST-")
HEADING_RE = re.compile(r"^#{1,6}\s")
FIELD_RE = re.compile(r"^- \*\*(.+?)\*\*\s*[:：]\s*(.*)$")
LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
PREREQUISITE_RE = re.compile(CARD_ID)
STEP_RE = re.compile(r"^\s+\d+[.、]\s*(.+)$")
SCENARIO_RE = re.compile(r"^[A-Z]{1,3}\d{1,3}[a-z]?$")
CELL_SPLIT_RE = re.compile(r"(?<!\\)\|")

FIELDS = ("价值", "覆盖场景", "演示", "不含", "前置", "就绪")
ARROW = "→"
READY, NOT_READY = "是", "否"


@dataclass
class Card:
    id: str
    topic: str  # 所在 topic 目录名
    path: Path
    line: int
    title: str
    fields: dict[str, tuple[int, list[str]]] = field(default_factory=dict)  # 字段名 → (行号, 各行文字)

    def text(self, name: str) -> str:
        return "\n".join(self.fields[name][1]) if name in self.fields else ""


def scenario_id(line: str) -> str | None:
    """表格行第一格里的场景编号；不是带编号的场景行就返回 None。"""
    if not line.lstrip().startswith("|"):
        return None
    cells = CELL_SPLIT_RE.split(line.strip().strip("|"))
    first = cells[0].strip().strip("*`").strip() if cells else ""
    return first if SCENARIO_RE.match(first) else None


class Checker:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.errors: list[str] = []
        self.notes: list[str] = []
        self.cards: list[Card] = []
        self._scenarios: dict[Path, dict[str, list[int]]] = {}

    def error(self, message: str) -> None:
        self.errors.append(message)

    def rel(self, path: Path) -> str:
        return str(path.relative_to(self.root))

    # ── 读入 ────────────────────────────────────────────────────────────
    def topics(self) -> list[Path]:
        product = self.root / "product"
        if not product.is_dir():
            self.error("product/ 不存在：--root 要指向设计根")
            return []
        return sorted(path for path in product.iterdir() if path.is_dir() and TOPIC_RE.match(path.name))

    def load(self) -> None:
        for topic in self.topics():
            path = topic / "stories.md"
            if path.is_file():
                self._load_cards(topic.name, path)

    def _load_cards(self, topic: str, path: Path) -> None:
        card: Card | None = None
        current: str | None = None
        fenced = False
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("```"):
                fenced = not fenced
                continue
            if fenced:
                continue
            if HEADING_RE.match(line):
                matched = CARD_RE.match(line)
                card, current = None, None
                if matched:
                    card = Card(id=matched.group(1), topic=topic, path=path, line=number, title=matched.group(4))
                    self.cards.append(card)
                elif CARD_LIKE_RE.match(line):
                    self.error(f"{self.rel(path)}:{number}: 卡的标题要写成「### ST-<topic 三位编号>-<两位序号> · 一句话」")
                continue
            if card is None:
                continue
            matched = FIELD_RE.match(line)
            if matched:
                current = matched.group(1).strip()
                if current in card.fields:
                    self.error(f"{self.rel(path)}:{number}: {card.id} 的「{current}」写了两次")
                card.fields[current] = (number, [matched.group(2)])
            elif current and line.strip():
                card.fields[current][1].append(line)

    def scenarios(self, path: Path) -> dict[str, list[int]]:
        """一份 acceptance.md 里带编号的场景行：编号 → 出现的行号。"""
        if path not in self._scenarios:
            found: dict[str, list[int]] = {}
            for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                identifier = scenario_id(line)
                if identifier:
                    found.setdefault(identifier, []).append(number)
            self._scenarios[path] = found
        return self._scenarios[path]

    # ── 检查 ────────────────────────────────────────────────────────────
    def check(self) -> None:
        self.load()
        by_id: dict[str, Card] = {}
        for card in self.cards:
            where = f"{self.rel(card.path)}:{card.line}"
            if card.id in by_id:
                first = by_id[card.id]
                self.error(f"{where}: 卡号 {card.id} 已在 {self.rel(first.path)}:{first.line} 用过")
            else:
                by_id[card.id] = card
            number = TOPIC_RE.match(card.topic).group(1)
            if card.id[3:6] != number:
                self.error(f"{where}: {card.id} 的中间三位要等于所在 topic 的编号 {number}")
            missing = [name for name in FIELDS if name not in card.fields or not card.text(name).strip()]
            if missing:
                self.error(f"{where}: {card.id} 缺必填字段：{'、'.join(missing)}（没有就写「无」）")
        covered = self.check_scenarios()
        self.check_demos()
        self.check_readiness()
        self.check_prerequisites(by_id)
        self.report_uncovered(covered)

    def check_scenarios(self) -> dict[tuple[str, str], Card]:
        covered: dict[tuple[str, str], Card] = {}
        for card in self.cards:
            if "覆盖场景" not in card.fields:
                continue
            line, _ = card.fields["覆盖场景"]
            where = f"{self.rel(card.path)}:{line}"
            links = LINK_RE.findall(card.text("覆盖场景"))
            if not links:
                self.error(f"{where}: {card.id} 的「覆盖场景」至少链接一条验收场景，链接文字写场景编号")
            for label, href in links:
                identifier = label.strip().strip("*`").strip()
                target, _ = urldefrag(unquote(href))
                path = (card.path.parent / target).resolve()
                topic = path.parent.name
                if path.name != "acceptance.md" or path.parent.parent != self.root / "product" \
                        or not TOPIC_RE.match(topic):
                    self.error(f"{where}: {card.id} 的场景「{label}」要链接到某个 topic 的 acceptance.md，现在指向 {href}")
                    continue
                if not path.is_file():
                    self.error(f"{where}: {card.id} 的场景「{label}」指向的 {self.rel(path)} 不存在")
                    continue
                lines = self.scenarios(path).get(identifier)
                if not lines:
                    self.error(f"{where}: {card.id} 引用的场景 {identifier} 在 {self.rel(path)} 里没有带这个编号的行；"
                               f"被卡引用的场景行第一格要写编号")
                    continue
                if len(lines) > 1:
                    self.error(f"{self.rel(path)}:{lines[1]}: 场景编号 {identifier} 重复"
                               f"（第 {'、'.join(map(str, lines))} 行），卡指不到唯一的一行")
                key = (topic, identifier)
                if key in covered and covered[key] is not card:
                    self.error(f"{where}: 场景 {topic} 的 {identifier} 已属于 {covered[key].id}，"
                               f"一条场景至多属于一张卡，不能再属于 {card.id}")
                covered.setdefault(key, card)
        return covered

    def check_demos(self) -> None:
        for card in self.cards:
            if "演示" not in card.fields:
                continue
            line, lines = card.fields["演示"]
            where = f"{self.rel(card.path)}:{line}"
            steps = [matched.group(1) for matched in map(STEP_RE.match, lines[1:]) if matched]
            if not steps:
                self.error(f"{where}: {card.id} 的「演示」至少写一步，每步一行、缩进编号")
            for index, step in enumerate(steps, 1):
                done, _, seen = step.partition(ARROW)
                if not done.strip() or not seen.strip():
                    self.error(f"{where}: {card.id} 演示第 {index} 步要写成「做什么 {ARROW} 应当看到什么」")

    def check_readiness(self) -> None:
        for card in self.cards:
            if "就绪" not in card.fields:
                continue
            line, _ = card.fields["就绪"]
            where = f"{self.rel(card.path)}:{line}"
            value = card.text("就绪").strip()
            if value.startswith(READY):
                continue
            if not value.startswith(NOT_READY):
                self.error(f"{where}: {card.id} 的「就绪」只写「{READY}」或「{NOT_READY}——缺什么」")
            elif not value[len(NOT_READY):].strip(" \t—-:：，,。"):
                self.error(f"{where}: {card.id} 未就绪，要写明缺什么")

    def check_prerequisites(self, by_id: dict[str, Card]) -> None:
        edges: dict[str, list[str]] = {}
        for card in self.cards:
            if "前置" not in card.fields or by_id.get(card.id) is not card:
                continue
            line, _ = card.fields["前置"]
            where = f"{self.rel(card.path)}:{line}"
            wanted = sorted({matched.group(0) for matched in PREREQUISITE_RE.finditer(card.text("前置"))})
            for other in wanted:
                if other == card.id:
                    self.error(f"{where}: {card.id} 把自己列成了前置")
                elif other not in by_id:
                    self.error(f"{where}: {card.id} 的前置 {other} 不存在")
            edges[card.id] = [other for other in wanted if other in by_id and other != card.id]
        state: dict[str, int] = {}
        reported: set[frozenset[str]] = set()

        def visit(node: str, trail: list[str]) -> None:
            state[node] = 1
            for other in edges.get(node, []):
                if state.get(other) == 1:
                    cycle = trail[trail.index(other):] + [other] if other in trail else [node, other]
                    if frozenset(cycle) not in reported:
                        reported.add(frozenset(cycle))
                        card = by_id[node]
                        self.error(f"{self.rel(card.path)}:{card.line}: 前置成环：{' → '.join(cycle)}")
                elif other not in state:
                    visit(other, trail + [other])
            state[node] = 2

        for node in sorted(edges):
            if node not in state:
                visit(node, [node])

    def report_uncovered(self, covered: dict[tuple[str, str], Card]) -> None:
        for topic in sorted({card.topic for card in self.cards}):
            path = self.root / "product" / topic / "acceptance.md"
            if not path.is_file():
                continue
            loose = [identifier for identifier in self.scenarios(path) if (topic, identifier) not in covered]
            if loose:
                self.notes.append(f"{self.rel(path)}: {len(loose)} 条带编号的场景还不属于任何卡：{'、'.join(loose)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="设计根（含 product/）")
    args = parser.parse_args(argv)

    checker = Checker(args.root)
    checker.check()
    for note in checker.notes:
        print(f"NOTE: {note}")
    for error in checker.errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if checker.errors:
        print(f"FAIL: 故事卡对账发现 {len(checker.errors)} 处问题。", file=sys.stderr)
        return 1
    if not checker.cards:
        print("PASS: product/ 下还没有故事卡，没有可对账的内容。")
        return 0
    topics = len({card.topic for card in checker.cards})
    print(f"PASS: {len(checker.cards)} 张故事卡（{topics} 个 topic），对账一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
