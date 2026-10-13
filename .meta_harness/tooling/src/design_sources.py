from __future__ import annotations

from pathlib import Path

from omne_harness_lite_spec_tools.doc_support import headings, local_target, markdown_links
from omne_harness_lite_spec_tools.documentation_inputs import Inputs, discover, load
from source_links import ModuleSources


def _sources(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*.md")
                  if not any(part.endswith(".legacy") for part in path.relative_to(root).parts[:-1])
                  and ".templates" not in path.relative_to(root).parts
                  and not path.is_relative_to(root / "record"))


def check_links(root: Path, source_root: Path | None = None) -> list[str]:
    root = root.resolve()
    errors: list[str] = []
    if not root.is_dir():
        return [f"design root is not a directory: {root}"]
    for name in ("spec", "realization", "registry"):
        retired = root / name
        if retired.exists() or retired.is_symlink():
            errors.append(f"retired design root exists: {name}")
    workspace = root.parent if root.name == "design" and root.parent.name == ".meta_harness" else None
    execution = source_root.resolve() if source_root is not None else None
    if execution is not None and execution / ".meta_harness/design" != root:
        return ["source-root must be the design root's execution checkout"]
    boundary = execution or (workspace.parent if workspace else root)
    inputs = Inputs(boundary)
    try:
        registries = discover(execution) if execution else []
        documents, _ = load(inputs, registries) if execution else ([], None)
        registered = {execution / document["path"] for document in documents}
        modules = ModuleSources(execution, inputs)
        paths = _sources(root)
        headings.cache_clear()
        for path in paths:
            label = f"{path.relative_to(root)}: "
            try:
                data = inputs.read_bytes(path.relative_to(boundary).as_posix(), navigation=True)
                if data is None:
                    raise ValueError(f"source disappeared during check: {path}")
                data.decode("utf-8")
                for value in markdown_links(path):
                    try:
                        target, fragment = local_target(path, value, boundary, resolve=False)
                        if target is None:
                            continue
                        actual = target.resolve()
                        allowed = actual.is_relative_to(root)
                        if workspace:
                            allowed |= any(actual.is_relative_to(workspace / name) for name in ("agents", "research"))
                            allowed |= actual in (workspace / "README.md", workspace / "AGENTS.md")
                        if execution:
                            allowed |= modules.origin(actual) is not None
                            if target.suffix.lower() == ".md":
                                allowed |= target in registered and target == actual
                            else:
                                allowed |= actual in {execution / "docs/engineering/github-delivery.json",
                                                      execution / "docs/architecture/constraints.json"}
                        if not allowed:
                            raise ValueError(f"link escapes design root: {value}")
                        data = inputs.read_bytes(target.relative_to(boundary).as_posix(), navigation=True)
                        if data is None:
                            raise ValueError(f"broken local link: {value}")
                        if target.suffix.lower() == ".md":
                            data.decode("utf-8")
                            if fragment and fragment not in headings(target):
                                raise ValueError(f"missing Markdown anchor: {value}")
                    except (ValueError, OSError, TypeError) as error:
                        errors.append(label + str(error))
            except (ValueError, OSError, TypeError) as error:
                errors.append(label + str(error))
        inputs.verify()
        if paths != _sources(root):
            raise ValueError("source discovery changed during check")
        if execution and registries != discover(execution):
            raise ValueError("registry discovery changed during check")
    except (ValueError, OSError, TypeError) as error:
        errors.append(f"source links: {error}")
    return errors
