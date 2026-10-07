---
name: prepare-pr
description: >
  Prepare or revise commit messages and pull request descriptions using the execution repository's conventions and templates. Use for report collection planning before implementation or for concise feature, docs, fix, and refactor descriptions. Select relevant examples and visual layouts. This skill does not implement the change or grant publication or merge permission.
metadata:
  version: '0.1.0'
---

# Prepare a Pull Request

Help a reviewer understand the final change, its evidence, and the questions that still need attention.
Use the execution repository's rules. Keep the result concise without removing conditions or unknowns.

## Inputs and Owners

Check the execution repository, task scope, BASE, and candidate state. Read that repository's
`CONTRIBUTING.md`, relevant development guidance, and selected `.github/` template.
The installation directory does not identify the execution repository. Do not derive its path from the depth of this skill.

Load `asd-ste100` by name before writing. It owns language rules. Keep its documented Chinese rules or applicable English mode.
This workflow keeps the required PR content when combined with that skill's rewrite behavior.
If a required skill or repository input is unavailable, report the missing input. Do not invent an alternative authority.

`CONTRIBUTING.md` owns delivery policy. Templates provide fields. This skill provides composition methods.
Read the current verification/tool documentation for report meanings. Do not copy a second rule set into the PR.

## When Work Starts

Use the repository's reporting conditions to identify required reports and collection points.
For applicable source changes, fix BASE and scope before collecting comparable data.
Capture the first runnable candidate and normal review points when the requested summary needs intermediate findings.
Keep raw data in the task's `tmp/`. Do not require a scan for every commit or create a permanent development ledger.

## When Preparing the Description

Read the final diff and actual reports. Select the primary result and the corresponding template/example:

| Result                            | Repository template | Read this example                           |
| --------------------------------- | ------------------- | ------------------------------------------- |
| New capability                    | `feature.md`        | [Feature](references/examples/feature.md)   |
| Documentation or guidance         | `docs.md`           | [Docs](references/examples/docs.md)         |
| Contract violation fixed          | `fix.md`            | [Fix](references/examples/fix.md)           |
| Structure or performance improved | `refactor.md`       | [Refactor](references/examples/refactor.md) |

Use the repository's short default template for other types. Read only the relevant example.
The examples illustrate composition. Their teaching data are not project evidence or mandatory output shapes.
Read [layout guidance](references/layout.md) when choosing tables, diagrams, screenshots, or folded details.

Write the concrete problem and final effect first. Add applicable boundaries, reports, demo steps, and review questions.
Use actual results and accessible links. Mark missing data as unknown or not executed, with its effect on review.
Keep intermediate observations separate from the final BASE→HEAD difference. Do not turn surviving mutants or high coverage into a correctness verdict.

Retain every required report and material gap when trimming the template. Remove unused headings, prompts, stale conclusions, and development narration.
Keep major red items visible outside folded details. A local artifact path needs a readable summary for reviewers who cannot access it.
Use precise paths, symbols, or clauses for review questions. Do not replace them with a general request to inspect the code.

## Commit and Delivery

Follow the repository's title, scope, breaking-change, attribution, and special-trailer rules.
Prepare the squash message from the final result. Preserve applicable trailers and accepted-card authority.
Do not concatenate intermediate messages, raw reports, or discussions into the squash body.

Write the completed body to the task's `tmp/`. Use it as the CLI body file when the user authorizes PR creation.
Do not submit an unfilled template or use commit history as the final description without inspecting it.
Existing authorization remains effective. This skill grants no new push, upload, message, or merge permission.

Check the actual presentation of tables, diagrams, folded details, links, and demo steps.
Distinguish a local/compose preview from the real PR. Update the body when the final diff or evidence changes.
Return the authorized deliverable and its relevant limits. Preparation alone does not establish implementation acceptance.
