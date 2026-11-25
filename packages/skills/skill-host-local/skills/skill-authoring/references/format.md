# The format of a Skill

## The folder

```text
<name>/
  SKILL.md              required
  references/*.md       optional: material the body points to
  scripts/*             optional: programs run with Shell
  .omne/skill.json      optional: the tools the Skill needs
```

- Paths are relative to the folder. A path that leads outside it is refused.
- Files and folders whose names begin with a dot are left out of the package, except `.omne`.
- At most 200 files, at most 1 MiB in one file, and at most 8 MiB in all.

## SKILL.md

```markdown
---
name: weekly-report
description: Write the weekly report from the notes of the week. Use when asked for a weekly report, a week summary or a status update.
---

# Writing the weekly report

1. Run scripts/collect.mjs with Shell. It prints the notes of the last seven days.
...
```

The frontmatter is YAML between two `---` lines.

| Field | Required | Rule |
| --- | --- | --- |
| `name` | yes | Lower-case letters and digits, in words joined by single hyphens, 1 to 64 characters. It is the name you publish under. |
| `description` | yes | Text of 1 to 16384 characters. Keep it under 1024: a longer one is kept but flagged, and search shows only its first 1024 characters. |

The open Agent Skills format allows more fields, such as `license` and `metadata`. Leave them out unless the user asks for them.

## .omne/skill.json

```json
{ "formatVersion": 1, "dependencies": [{ "category": "tool", "name": "Shell" }] }
```

- `formatVersion` is `1`.
- `dependencies` lists each tool that the steps of the Skill use, by its name as Tools shows it.
- The file has no other fields.

## Refusals

A refused publish says `code: detail`. The code is first.

| Code | Means | Do |
| --- | --- | --- |
| `manifest-missing` | The folder has no `SKILL.md` at its root. | Add it, or give the right `dir`. |
| `name-mismatch` | The `name` in the frontmatter differs from the name you publish under. | Make them the same. |
| `malformed` | The frontmatter or `.omne/skill.json` breaks a rule above. The detail names the rule. | Fix what the detail names. |
| `declaration-format-unsupported` | `formatVersion` is not `1`. | Write `1`. |
| `tool-ref-invalid` | A dependency is not a tool reference. | Write `{ "category": "tool", "name": "<tool>" }`. |
| `outside-package` | A path leads outside the folder. | Keep every file inside the folder. |
| `bad-path` | A file name cannot be a package path. | Rename the file. |
| over a limit | The folder is over the files, file size or total size limit. | Move large data out of the Skill, or split the Skill. |
| `irreplaceable-official` | The deployment brings a Skill of this name that cannot be replaced. | Choose another name. |
