from __future__ import annotations

from pathlib import Path

from .doc_support import headings, local_target
from .documentation_inputs import Inputs, load
from .documentation_inventory import observe
from .documentation_markdown import parse, section_excerpt, sections


def role_context(root: Path, role_id: str) -> dict:
    root = root.resolve()
    if not root.is_dir():
        raise ValueError(f"context root is not a directory: {root}")
    inputs = Inputs(root)
    documents, _ = load(inputs, ["docs/documentation.json"], selected_document_ids={"docs#README"})
    selected = [document for document in documents if document["id"] == "docs#README"
                and document["owner"]["id"] == "project-documentation"
                and document["owner"]["kind"] == "project" and document["path"] == "docs/README.md"]
    if len(selected) != 1:
        raise ValueError("unique project-documentation/project docs#README at docs/README.md required")
    document = selected[0]
    section = next((item for item in document["requiredSections"] if item["id"] == role_id), None)
    if section is None:
        raise ValueError(f"unknown registered role: {role_id}")
    rows = observe(document, inputs)
    if any(row["status"] == "error" for row in rows):
        raise ValueError(next(row["reason"] for row in rows if row["status"] == "error"))
    row = next(row for row in rows if row["identity"]["section"] == role_id)
    text = inputs.read(document["path"])
    parsed = parse(text) if text is not None else []
    excerpt = section_excerpt(text, parsed, section["anchor"]) if text is not None else None
    span = sections(parsed).get(section["anchor"]) if excerpt is not None else None
    references = []
    headings.cache_clear()
    selected_tokens = parsed[span[0] - 3:span[1]] if span else []
    for token in selected_tokens:
        for child in token.children or []:
            if child.type not in {"link_open", "image"}:
                continue
            href = child.attrGet("href" if child.type == "link_open" else "src")
            target, fragment = local_target(root / document["path"], href, root, resolve=False)
            relative = target.relative_to(root).as_posix() if target is not None else None
            if target is not None:
                data = inputs.read_bytes(relative, navigation=True)
                if data is None:
                    raise ValueError(f"broken local link: {href}")
                if target.suffix.lower() == ".md":
                    data.decode("utf-8")
                    if fragment and fragment not in headings(target):
                        raise ValueError(f"missing Markdown anchor: {href}")
            references.append({"href": href, "path": relative, "fragment": fragment})
    inputs.verify()
    return {
        "kind": "documentation-role-context",
        "identity": {"ownerId": document["owner"]["id"], "documentId": document["id"],
                     "sectionId": role_id, "anchor": section["anchor"]},
        "scope": {key: document[key] for key in ("path", "registry", "basis", "applicability",
                  "visibility", "required", "inspectionProfile", "expectationSource")},
        "structure": {key: row[key] for key in ("status", "reason", "physicalObservation", "dependencyMissing")},
        "excerpt": excerpt, "directReferences": references,
        "inputs": sorted(inputs.files.values(), key=lambda item: item["path"]),
        "limitations": ["Only the selected section and direct references are read; references are not expanded recursively.",
                        "Structure and basis do not establish support, adoption, implementation or acceptance."],
    }
