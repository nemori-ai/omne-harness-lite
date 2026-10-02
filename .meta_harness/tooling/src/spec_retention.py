#!/usr/bin/env python3
"""规格留版报告：每份契约在树里有几个版本目录，被取代的旧版各还被谁消费；最新版里哪些形式模型没有任务。

只读，不是门禁：报出多少旧版退出码都是 0；只有用法错误或登记读不了才非零。
「规格只留最新一版」落地之前，旧版目录是一笔要还的债；这份报告回答还剩多少、先迁谁最省事。
它数的是登记与链接里**写明了版本**的引用，不判断新旧条款在语义上是否等价，见 NOT_COVERED。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import unquote, urldefrag

from design_validation import Invalid, load_json, require_list, require_object, require_text

NOT_COVERED = (
    "旧条款与最新版的同号条款在语义上是否等价（能不能把引用直接改指最新版）",
    "数字最大的版本是不是这份契约唯一现行的一条线（并列的两条线会被算成一新一旧）",
    "正文里只写了路径或坐标文字、没有做成链接的引用；写成简称的引用（如 RT12、OG2）",
    "packages/、apps/、tools/ 里按版本路径读规格的代码与随包发布的 Schema 副本",
    "承载仓库里设计根以外的 Markdown（它们按规矩不链进设计根）",
)

VERSION_DIR_RE = re.compile(r"^spec/(data|capabilities|compositions)/([^/]+)/v(\d+)/")
BINDING_CLAUSE_RE = re.compile(r"^\s*-?\s*clause:\s*[\"']?([a-z]+\.[a-z0-9-]+)/v(\d+)#")
LINK_RE = re.compile(r"\]\(([^)\s]+)\)")
FENCE_RE = re.compile(r"^\s*(```|~~~)")
MODEL_SUFFIXES = (".tla", ".als")


class ReportError(Exception):
    """登记读不了：报告无从产出，非零退出。"""


@dataclass(frozen=True, order=True)
class Coordinate:
    contract_id: str
    version: int

    def label(self) -> str:
        return f"{self.contract_id}/v{self.version}"


@dataclass
class Consumers:
    """一个旧版目录还被谁消费。每一项都是「删掉这个目录之前要先处理的东西」。"""

    dependencies_from_latest: int = 0
    dependencies_from_old: int = 0
    covers: int = 0
    formal_tasks: int = 0
    binding_rows: int = 0
    links_from_latest_specs: int = 0
    links_from_other_specs: int = 0
    links_from_elsewhere: int = 0

    def total(self) -> int:
        return sum(asdict(self).values())

    def registered(self) -> int:
        """登记与绑定里的引用：这些不迁走，删目录会让检查失败或让绑定指向不存在的条款。"""
        return (self.dependencies_from_latest + self.dependencies_from_old + self.covers
                + self.formal_tasks + self.binding_rows)


@dataclass
class Version:
    coordinate: Coordinate
    directory: str
    latest: bool
    consumers: Consumers = field(default_factory=Consumers)


def _coordinate(value: Any, where: str) -> Coordinate:
    raw = require_object(value, where)
    version = raw.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise Invalid(f"{where}.version must be a positive integer")
    return Coordinate(require_text(raw.get("contract_id"), f"{where}.contract_id"), version)


def _version_directory(path: str) -> str | None:
    match = VERSION_DIR_RE.match(path)
    return match.group(0) if match else None


def load_versions(root: Path) -> dict[Coordinate, Version]:
    catalog = require_object(load_json(root / "registry/catalog.json"), "catalog")
    found: dict[Coordinate, str] = {}
    for index, raw in enumerate(require_list(catalog.get("contracts"), "catalog.contracts")):
        entry = require_object(raw, f"catalog.contracts[{index}]")
        coordinate = _coordinate(entry.get("coordinate"), f"catalog.contracts[{index}].coordinate")
        directory = _version_directory(require_text(entry.get("contract_path"),
                                                    f"catalog.contracts[{index}].contract_path"))
        if directory is None:
            raise Invalid(f"catalog.contracts[{index}].contract_path is not below a version directory")
        found[coordinate] = directory
    latest: dict[str, int] = {}
    for coordinate in found:
        latest[coordinate.contract_id] = max(latest.get(coordinate.contract_id, 0), coordinate.version)
    return {coordinate: Version(coordinate, directory, latest[coordinate.contract_id] == coordinate.version)
            for coordinate, directory in found.items()}


def count_dependencies(root: Path, versions: dict[Coordinate, Version]) -> None:
    catalog = load_json(root / "registry/catalog.json")
    for index, entry in enumerate(catalog["contracts"]):
        source = versions[_coordinate(entry["coordinate"], f"catalog.contracts[{index}].coordinate")]
        dependencies = require_list(entry.get("dependencies", []), f"catalog.contracts[{index}].dependencies")
        for position, raw in enumerate(dependencies):
            where = f"catalog.contracts[{index}].dependencies[{position}]"
            target = versions.get(_coordinate(require_object(raw, where).get("coordinate"), f"{where}.coordinate"))
            if target is None or target.latest:
                continue
            if source.latest:
                target.consumers.dependencies_from_latest += 1
            else:
                target.consumers.dependencies_from_old += 1


def count_covers(root: Path, versions: dict[Coordinate, Version]) -> None:
    path = root / "registry/covers.json"
    if not path.exists():
        return
    covers = require_object(load_json(path), "covers")
    for index, raw in enumerate(require_list(covers.get("covers"), "covers.covers")):
        target = versions.get(_coordinate(require_object(raw, f"covers.covers[{index}]").get("target"),
                                          f"covers.covers[{index}].target"))
        if target is not None and not target.latest:
            target.consumers.covers += 1


def task_artifacts(root: Path) -> list[tuple[str, list[str]]]:
    path = root / "registry/formal-tasks.json"
    if not path.exists():
        return []
    tasks = require_object(load_json(path), "formal-tasks")
    result = []
    for index, raw in enumerate(require_list(tasks.get("tasks"), "formal-tasks.tasks")):
        task = require_object(raw, f"formal-tasks.tasks[{index}]")
        artifacts = [require_text(item, f"formal-tasks.tasks[{index}].artifacts[]")
                     for item in require_list(task.get("artifacts"), f"formal-tasks.tasks[{index}].artifacts")]
        result.append((require_text(task.get("id"), f"formal-tasks.tasks[{index}].id"), artifacts))
    return result


def count_formal_tasks(tasks: list[tuple[str, list[str]]], by_directory: dict[str, Version]) -> None:
    for _task, artifacts in tasks:
        for directory in {_version_directory(artifact) for artifact in artifacts}:
            version = by_directory.get(directory) if directory else None
            if version is not None and not version.latest:
                version.consumers.formal_tasks += 1


def count_bindings(root: Path, versions: dict[Coordinate, Version]) -> None:
    realization = root / "realization"
    if not realization.is_dir():
        return
    for path in sorted(realization.rglob("bindings.yaml")):
        for line in path.read_text(encoding="utf-8").splitlines():
            match = BINDING_CLAUSE_RE.match(line)
            if not match:
                continue
            version = versions.get(Coordinate(match.group(1), int(match.group(2))))
            if version is not None and not version.latest:
                version.consumers.binding_rows += 1


def _links(text: str) -> Iterator[str]:
    fenced = False
    for line in text.splitlines():
        if FENCE_RE.match(line):
            fenced = not fenced
            continue
        if not fenced:
            yield from LINK_RE.findall(line)


def count_links(root: Path, by_directory: dict[str, Version]) -> None:
    resolved_root = root.resolve()
    for path in sorted(root.rglob("*.md")):
        relative = path.relative_to(root).as_posix()
        if "/.templates/" in f"/{relative}":
            continue
        own = _version_directory(relative)
        source = by_directory.get(own) if own else None
        for raw in _links(path.read_text(encoding="utf-8", errors="replace")):
            target, _fragment = urldefrag(raw)
            if not target or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target):
                continue
            try:
                destination = (path.parent / unquote(target)).resolve().relative_to(resolved_root).as_posix()
            except ValueError:
                continue
            directory = _version_directory(destination + ("/" if not destination.endswith("/") else ""))
            if directory is None or directory == own:
                continue
            version = by_directory.get(directory)
            if version is None or version.latest:
                continue
            if source is not None and source.latest:
                version.consumers.links_from_latest_specs += 1
            elif relative.startswith("spec/"):
                version.consumers.links_from_other_specs += 1
            else:
                version.consumers.links_from_elsewhere += 1


def unregistered_models(root: Path, versions: list[Version], tasks: list[tuple[str, list[str]]]) -> list[str]:
    registered = {artifact for _task, artifacts in tasks for artifact in artifacts}
    missing = []
    for version in versions:
        if not version.latest:
            continue
        directory = root / version.directory
        for path in sorted(directory.rglob("*")):
            relative = path.relative_to(root).as_posix()
            if path.is_file() and path.suffix in MODEL_SUFFIXES and relative not in registered:
                missing.append(relative)
    return sorted(missing)


def build_report(root: Path, only: list[str]) -> dict[str, Any]:
    try:
        versions = load_versions(root)
        by_directory = {version.directory: version for version in versions.values()}
        tasks = task_artifacts(root)
        count_dependencies(root, versions)
        count_covers(root, versions)
        count_formal_tasks(tasks, by_directory)
        count_bindings(root, versions)
        count_links(root, by_directory)
        unknown = sorted(set(only) - {coordinate.contract_id for coordinate in versions})
        if unknown:
            raise ReportError(f"catalog 里没有这些契约：{', '.join(unknown)}")
        selected = [version for version in versions.values() if not only or version.coordinate.contract_id in only]
        models = unregistered_models(root, selected, tasks)
    except (Invalid, KeyError, OSError) as error:
        raise ReportError(str(error)) from error
    old = sorted((version for version in selected if not version.latest),
                 key=lambda version: (version.consumers.registered(), version.consumers.total(), version.coordinate))
    contracts = {version.coordinate.contract_id for version in selected}
    with_old = {version.coordinate.contract_id for version in old}
    return {
        "contracts": len(contracts),
        "version_directories": len(selected),
        "old_version_directories": len(old),
        "contracts_with_old_versions": len(with_old),
        "old_versions": [{"coordinate": version.coordinate.label(), "directory": version.directory,
                          "latest": max(other.coordinate.version for other in versions.values()
                                        if other.coordinate.contract_id == version.coordinate.contract_id),
                          "consumers": asdict(version.consumers), "registered": version.consumers.registered(),
                          "total": version.consumers.total()} for version in old],
        "removable": [version.coordinate.label() for version in old if version.consumers.total() == 0],
        "latest_models_without_task": models,
        "not_covered": list(NOT_COVERED),
    }


COLUMNS = (("最新版依赖它", "dependencies_from_latest"), ("旧版依赖它", "dependencies_from_old"),
           ("覆盖登记", "covers"), ("形式任务", "formal_tasks"), ("绑定行", "binding_rows"),
           ("最新版规格里的链接", "links_from_latest_specs"), ("别的规格文件里的链接", "links_from_other_specs"),
           ("其余设计文档里的链接", "links_from_elsewhere"))


def render_text(report: dict[str, Any]) -> str:
    lines = [
        f"规格留版：{report['contracts']} 份契约、{report['version_directories']} 个版本目录，"
        f"其中旧版 {report['old_version_directories']} 个（分属 {report['contracts_with_old_versions']} 份契约）。",
        "终态是每份契约只留一版；下面每个旧版目录删掉之前，各列的引用都要先迁走。按登记里的引用从少到多排。",
        "",
        "| 旧版 | 最新 | " + " | ".join(label for label, _key in COLUMNS) + " |",
        "|---|---|" + "---|" * len(COLUMNS),
    ]
    for item in report["old_versions"]:
        lines.append(f"| `{item['coordinate']}` | v{item['latest']} | "
                     + " | ".join(str(item["consumers"][key]) for _label, key in COLUMNS) + " |")
    lines.append("")
    removable = report["removable"]
    lines.append("这里数到的引用为零、可以先删的旧版：" + ("、".join(removable) if removable else "没有。"))
    models = report["latest_models_without_task"]
    lines.append("")
    lines.append(f"最新版里没有任何形式任务引用的模型文件 {len(models)} 个" + ("：" if models else "。"))
    lines.extend(f"- {model}" for model in models)
    lines.append("")
    lines.append("没有数的：")
    lines.extend(f"- {item}" for item in report["not_covered"])
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--root", required=True, type=Path, help="设计根（含 registry/ spec/）")
    parser.add_argument("--contract", action="append", default=[], metavar="<contract_id>",
                        help="只看这些契约；可重复。缺省看 catalog 里的全部契约")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    args = parser.parse_args(argv)
    if not (args.root / "registry").is_dir():
        parser.error(f"--root {args.root} 下没有 registry/，不是设计根")
    try:
        report = build_report(args.root, args.contract)
    except ReportError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2) if args.format == "json" else render_text(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
