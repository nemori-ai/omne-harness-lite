#!/usr/bin/env python3
"""故事卡的对账。

核的是 `design/product/PF-*/stories.md` 里每张卡的形状，以及卡与验收场景之间的对应：
卡号唯一且与所在 topic 的编号一致、每份 `stories.md` 有且只有一行「已发到」且它不小于文件里任何一张卡、
必填字段齐全、「覆盖场景」里的每条链接都指得到某个 topic `acceptance.md` 里一行带编号的场景、
一条场景至多属于一张卡、「前置」指到的卡存在且不成环、演示的每一步都写着应当看到什么、未就绪的卡写着缺什么。

规矩的权威正文在 `design/product/conventions.md`；本工具只兑现其中机器能判的那几条，
**不判断卡切得好不好**——它查不出一张卡是不是真的只证明一件事、演示能不能照着做出来、
顺序排得对不对；也看不到「已发到」有没有被改小（它只读眼前这一版，那由执行仓库对提交范围的检查来看）。
有 `stories.md` 的 topic 里没有被任何卡覆盖的带编号场景只列出来，不判失败：它们要么已经交付、卡退场了，要么还没切到。

只读 `--root` 指向的设计根。链接的锚点由 `check_sources.py` 对现行设计及公开拥有者统一查，这里不重复。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urldefrag

TOPIC_RE = re.compile(r"^PF-(\d{3})(?:-|$)")
CARD_ID = r"ST-(\d{3})-(\d{2})"
CARD_RE = re.compile(rf"^###\s+({CARD_ID})\s*·\s*(\S.*?)\s*$")
CARD_LIKE_RE = re.compile(r"^#{1,6}\s+ST-")
CARD_ID_RE = re.compile(rf"^{CARD_ID}$")
HIGH_WATER_RE = re.compile(r"^\*\*已发到\*\*\s*[:：]\s*(.*?)\s*$")
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
    def __init__(self, root: Path, source_observation: Path | None = None) -> None:
        self.root = root.resolve()
        self.errors: list[str] = []
        self.notes: list[str] = []
        self.cards: list[Card] = []
        # 每份 stories.md 里的「已发到」行：(行号, 写的值)。文件在这里就表示这个 topic 切过卡。
        self.high_water: dict[Path, list[tuple[int, str]]] = {}
        self._scenarios: dict[Path, dict[str, list[int]]] = {}
        self.source_aliases: dict[str, dict] = {}
        if source_observation is not None:
            self.load_observation(source_observation)

    def load_observation(self, path: Path) -> None:
        value = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(value, dict) or value.get("schemaVersion") != 1 or value.get("kind") != "current-source-observation":
            raise ValueError("unsupported source observation")
        checkout = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=self.root, text=True).strip()).resolve()
        head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=checkout, text=True).strip()
        if value.get("root") != str(checkout) or value.get("productRoot") != str((self.root / "product").resolve()) or value.get("head") != head:
            raise ValueError("source observation checkout, productRoot or HEAD is stale")
        roles = value.get("inputRoles")
        if not isinstance(roles, dict) or set(roles) != {"config", "cutovers", "capture"}:
            raise ValueError("source observation requires all input roles")

        def role_path(role: dict) -> str:
            filename = role.get("path")
            if not isinstance(filename, str) or not filename or not Path(filename).is_absolute() or str(Path(filename).resolve()) != filename:
                raise ValueError("invalid source input role path")
            return filename

        config, cutovers, capture = (roles[k] for k in ("config", "cutovers", "capture"))
        if not isinstance(config, dict) or set(config) != {"selection", "path"} or config["selection"] not in ("default", "explicit"):
            raise ValueError("invalid config input role")
        config_path = role_path(config)
        if config["selection"] == "default" and config_path != str((checkout / "docs/engineering/github-delivery.json").resolve()):
            raise ValueError("default config input role must use checkout path")
        if not isinstance(cutovers, dict) or set(cutovers) != {"path"} or role_path(cutovers) != str((checkout / "docs/engineering/source-cutovers.json").resolve()):
            raise ValueError("invalid cutovers input role")
        if not isinstance(capture, dict) or capture.get("kind") not in ("none", "file") or set(capture) != ({"kind"} if capture["kind"] == "none" else {"kind", "path"}):
            raise ValueError("invalid capture input role")
        required = {str(p.resolve()) for p in (self.root / "product").glob("PF-*/stories.md")}
        mandatory = set(required)
        required.update((config_path, cutovers["path"]))
        optional = {cutovers["path"]}
        if config["selection"] == "default":
            optional.add(config_path)
        if config["selection"] == "explicit":
            mandatory.add(config_path)
        if capture["kind"] == "file":
            required.add(role_path(capture))
            mandatory.add(capture["path"])
        optional.difference_update(mandatory)
        bindings = value.get("bindings")
        if not isinstance(bindings, list):
            raise ValueError("source observation bindings must be an array")
        seen: set[str] = set()
        for binding in bindings:
            if not isinstance(binding, dict) or set(binding) != {"path", "sha256"}:
                raise ValueError("invalid source binding")
            filename = role_path(binding)
            if filename in seen:
                raise ValueError("duplicate source binding path")
            seen.add(filename)
            file = Path(filename)
            expected = binding["sha256"]
            if expected is not None and (not isinstance(expected, str) or not re.fullmatch(r"[a-f0-9]{64}", expected)):
                raise ValueError("invalid source binding digest")
            actual = hashlib.sha256(file.read_bytes()).hexdigest() if file.exists() else None
            if expected != actual or (actual is None and filename not in optional):
                raise ValueError(f"source observation binding is stale: {filename}")
        if required != seen:
            raise ValueError("source observation bindings do not equal selected inputs")
        if not Path(config_path).exists() and value.get("dailyEnabled") is not False:
            raise ValueError("missing default config requires dailyEnabled false")
        aliases = value.get("aliases")
        if not isinstance(aliases, list) or not isinstance(value.get("cards"), list) or not isinstance(value.get("findings"), list):
            raise ValueError("invalid source observation arrays")
        if value.get("completeness") not in ("complete", "partial", "unknown") or not isinstance(value.get("dailyEnabled"), bool):
            raise ValueError("invalid source observation status")
        def check_identity(identity: object) -> dict:
            if not isinstance(identity, dict) or not all(isinstance(identity.get(k), str) and identity[k] for k in ("id", "url", "repository")):
                raise ValueError("invalid Issue identity")
            if type(identity.get("number")) is not int or identity["number"] < 1 or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", identity["repository"]):
                raise ValueError("invalid Issue repository or number")
            if identity["url"] != f"https://github.com/{identity['repository']}/issues/{identity['number']}":
                raise ValueError("Issue URL does not match repository and number")
            return identity

        seen_cards: set[tuple[str, str]] = set()
        for card in value["cards"]:
            if not isinstance(card, dict) or card.get("kind") not in ("legacy", "issue"):
                raise ValueError("invalid source card")
            if card["kind"] == "legacy":
                if not all(isinstance(card.get(k), str) for k in ("id", "path", "topic", "title")) or not CARD_ID_RE.fullmatch(card["id"]):
                    raise ValueError("invalid legacy card")
                key = ("legacy", card["id"])
                scenarios = card.get("scenarios")
            else:
                identity, read = card.get("identity"), card.get("read")
                identity = check_identity(identity)
                if not isinstance(card.get("aliases"), list):
                    raise ValueError("invalid Issue card aliases")
                old_ids: set[str] = set()
                for old in card["aliases"]:
                    if not isinstance(old, dict) or not isinstance(old.get("id"), str) or not CARD_ID_RE.fullmatch(old["id"]) or old["id"] in old_ids or type(old.get("productRevision")) is not int or old["productRevision"] < 1:
                        raise ValueError("invalid or duplicate Issue card alias")
                    old_ids.add(old["id"])
                key = ("issue", identity["id"])
                if not isinstance(read, dict) or read.get("kind") not in ("known", "unknown"):
                    raise ValueError("invalid Issue read")
                scenarios = []
                if read["kind"] == "known":
                    if not isinstance(read.get("title"), str) or type(read.get("revision")) is not int or read["revision"] < 1 or read.get("state") not in ("open", "closed") or not (read.get("stage") is None or isinstance(read["stage"], str)):
                        raise ValueError("invalid known Issue read")
                    scenarios = read.get("scenarios")
                elif not isinstance(read.get("reason"), str):
                    raise ValueError("invalid unknown Issue read")
            if key in seen_cards:
                raise ValueError("duplicate source card")
            seen_cards.add(key)
            if not isinstance(scenarios, list) or any(not isinstance(s, dict) or not isinstance(s.get("topic"), str) or not isinstance(s.get("id"), str) for s in scenarios):
                raise ValueError("invalid source scenarios")
        for alias in aliases:
            if not isinstance(alias, dict) or not isinstance(alias.get("id"), str) or not CARD_ID_RE.fullmatch(alias["id"]):
                raise ValueError("invalid source alias")
            identifier, resolution = alias["id"], alias.get("resolution")
            if identifier in self.source_aliases or not isinstance(resolution, dict):
                raise ValueError("duplicate or invalid source alias")
            kind = resolution.get("kind")
            if kind not in ("legacy", "issue", "unknown", "conflict"):
                raise ValueError("invalid source alias resolution")
            if kind == "issue":
                identity = resolution.get("identity")
                check_identity(identity)
                if not isinstance(resolution.get("observed"), bool):
                    raise ValueError("invalid Issue observation flag")
            if kind == "legacy" and (resolution.get("id") != identifier or not isinstance(resolution.get("path"), str)):
                raise ValueError("invalid legacy alias")
            if kind == "conflict" and not isinstance(resolution.get("sources"), list):
                raise ValueError("invalid conflict sources")
            if kind == "unknown" and not isinstance(resolution.get("reason"), str):
                raise ValueError("invalid unknown reason")
            self.source_aliases[identifier] = resolution
        has_issue = any(card["kind"] == "issue" for card in value["cards"]) or any(alias["resolution"]["kind"] == "issue" for alias in aliases)
        if capture["kind"] == "none" and (value["dailyEnabled"] or has_issue) and value["completeness"] != "unknown":
            raise ValueError("unread Issue sources require unknown completeness")
        for finding in value["findings"]:
            if not isinstance(finding, dict) or finding.get("category") not in ("deviation", "unknown", "uncovered") or not isinstance(finding.get("message"), str):
                raise ValueError("invalid source finding")
            if finding["category"] == "deviation":
                self.error(f"当前来源偏离: {finding['message']}")
            else:
                self.notes.append(f"当前来源 {finding['category']}: {finding['message']}")

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
        high_water = self.high_water.setdefault(path, [])
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.lstrip().startswith("```"):
                fenced = not fenced
                continue
            if fenced:
                continue
            matched = HIGH_WATER_RE.match(line)
            if matched:
                high_water.append((number, matched.group(1)))
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
        self.check_high_water()
        covered = self.check_scenarios()
        self.check_demos()
        self.check_readiness()
        self.check_prerequisites(by_id)
        self.report_uncovered(covered)

    def check_high_water(self) -> None:
        """「已发到」：有且只有一行，卡号属于这个 topic，文件里每张卡的序号都不超过它。"""
        for path, found in self.high_water.items():
            where = self.rel(path)
            if not found:
                self.error(f"{where}: 缺「已发到」一行；在文件开头写 `**已发到**：ST-<三位>-<两位>`，"
                           f"值是这个 topic 发出过的最大卡号")
                continue
            if len(found) > 1:
                lines = "、".join(str(number) for number, _ in found)
                self.error(f"{where}:{found[1][0]}: 「已发到」只能有一行，现在有 {len(found)} 行（第 {lines} 行）")
                continue
            number, value = found[0]
            matched = CARD_ID_RE.match(value)
            if not matched:
                self.error(f"{where}:{number}: 「已发到」的值要写成卡号 ST-<三位>-<两位>，现在是「{value}」")
                continue
            topic = TOPIC_RE.match(path.parent.name).group(1)
            if matched.group(1) != topic:
                self.error(f"{where}:{number}: 「已发到」{value} 的中间三位要等于所在 topic 的编号 {topic}")
                continue
            for card in self.cards:
                if card.path == path and int(card.id[7:9]) > int(matched.group(2)):
                    self.error(f"{where}:{card.line}: {card.id} 的序号超过了「已发到」{value}；"
                               f"发卡时要把「已发到」改到新卡号")

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
                    resolved = self.source_aliases.get(other)
                    if resolved is None or resolved["kind"] == "legacy":
                        self.error(f"{where}: {card.id} 的前置 {other} 不存在")
                    elif resolved["kind"] == "conflict":
                        self.error(f"{where}: {card.id} 的前置 {other} 当前来源冲突")
                    elif resolved["kind"] == "issue":
                        self.notes.append(f"{where}: {other} 定位到 {resolved['identity']['url']}；结果满足 unknown，跨源前置图不完整")
                    else:
                        self.notes.append(f"{where}: {other} 当前来源 unknown；跨源前置图不完整")
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
        for topic in sorted(path.parent.name for path in self.high_water):
            path = self.root / "product" / topic / "acceptance.md"
            if not path.is_file():
                continue
            loose = [identifier for identifier in self.scenarios(path) if (topic, identifier) not in covered]
            if loose:
                self.notes.append(f"{self.rel(path)}: {len(loose)} 条带编号的场景还不属于任何卡：{'、'.join(loose)}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="设计根（含 product/）")
    parser.add_argument("--source-observation", type=Path, help="本次当前来源投影")
    args = parser.parse_args(argv)

    try:
        checker = Checker(args.root, args.source_observation)
    except (ValueError, OSError, RuntimeError, subprocess.CalledProcessError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2
    checker.check()
    for note in checker.notes:
        print(f"NOTE: {note}")
    for error in checker.errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if checker.errors:
        print(f"FAIL: 故事卡对账发现 {len(checker.errors)} 处问题。", file=sys.stderr)
        return 1
    if not checker.high_water:
        print("PASS: product/ 下还没有故事卡，没有可对账的内容。")
        return 0
    if not checker.cards:
        print(f"PASS: {len(checker.high_water)} 个 topic 有 stories.md，眼下没有待交付的卡，对账一致。")
        return 0
    topics = len({card.topic for card in checker.cards})
    print(f"PASS: {len(checker.cards)} 张故事卡（{topics} 个 topic），对账一致。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
