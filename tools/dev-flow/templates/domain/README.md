# Capability group template

This directory owns package-domain@1.0.0. It is a development resource and has no workspace package.
[Member documentation requirements](../../../../docs/member-documentation.md#能力组文档要求) own the required group content.

## Create and inspect

Run these commands from the repository root.

```sh
pnpm package:template create-domain --group example
pnpm package:template create-domain --group example --write
pnpm package:template scan --group example --check --json
uv run --locked omne-documentation inventory --root . --out tmp/documentation-inventory
```

Creation previews by default. The written tree contains README.md and documentation.json only.
Existing targets, symlink parents and path escapes fail. Failure removes only files and directories claimed by this creation.
Use a trusted checkout without concurrent directory replacement. Creation runs no package code.

README.md contains five Chinese sections with DOMAIN_TEMPLATE_DRAFT and documentation placeholders.
The registration uses bindings v2 with owner kind domain and ID package-domain:<group>.
Paths are relative to the repository root. The requirement source is docs/member-documentation.md.
The adopted basis refers to the requirement. It does not accept draft content.

## Optional topics and scan coverage

fragments/docs contains architecture, dependency, flow, verification and maintenance prompts.
Copy a fragment only for an actual reading task. Complete the text and register required files and sections.
Default creation makes no docs directory, fake members, tests or adoption marker.
The group root contains no package.json or executable verification resources. Link their actual member, application or tool owner.

manifest.json permits Markdown, SVG, PNG and WebP under docs. It also permits optional bilingual navigation and local agent instructions.
Unknown files, empty directories, links and special nodes fail. An unknown child directory must have a real package manifest.
Planning documents belong in a named topic under docs, even when a future member name is known. A README without a package manifest does not exempt a member directory from discovery. The domain scan has no planned-member category.
Real member directories belong to the package scanner. docs is reserved and cannot be a member name.

Explicit scan --group --check returns 1 for structural gaps or draft sentinels and 2 for invalid input.
The report names the current group template and current-template-only coverage. It does not certify adoption history.
An unselected package scan lists group observations without changing its package check exit policy.
--group and --member are mutually exclusive.

The TypeScript scanner checks layout and required files. Python owns bindings validation and documentation observations.
Inventory can return 0 while rows report gaps or unknown states. Inspect those rows.
Structure and inspectable prose do not prove content sufficiency, business behavior or acceptance.
