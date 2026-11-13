# Package group template

This directory owns package-domain@2.0.0. It is a development resource and has no workspace package.

## Create and inspect

Run these commands from the repository root.

```sh
pnpm package:template create-domain --group example
pnpm package:template create-domain --group example --write
pnpm package:template scan --group example --check --json
```

Creation previews by default. The written tree contains `SPEC.md` only.
Existing targets, symlink parents and path escapes fail. Failure removes only files and directories claimed by this creation.
Use a trusted checkout without concurrent directory replacement. Creation runs no package code.

`SPEC.md` starts with the group name as its heading and a DOMAIN_TEMPLATE_DRAFT line.
It has six second-level sections in this order: 总体架构, 领域边界, 心智模型, 应然设计, 原则与约束, 不变式.
Each section carries one line that says what it holds. Replace the lines with content and remove the draft line.

## Scan

Version 2.0.0 requires `SPEC.md` and allows only `SPEC.md`, `AGENTS.md` and `CLAUDE.md` in the group root. Group members are delegated to their own scan.
A group that holds a root `README.md`, `README_ZH.md` or `documentation.json` is scanned by the 1.0.0 rules kept in `previousVersions`.
Those rules require `README.md` and `documentation.json`, allow the group `docs/` tree, and also allow `SPEC.md`.
A `SPEC.md` that still contains DOMAIN_TEMPLATE_DRAFT reports `draft`.
Default creation makes no docs directory, fake members, tests or adoption marker.
