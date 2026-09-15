# Execution repository and evidence context

**Read when:** creating, checking, integrating or retiring a worktree.
**Return when:** paths, baseline, checks, authority and preservation needs are explicit.

## Select the execution repository

The design workspace, this installed skill, and the source repository can be in
different locations. Take the execution repository from the task or an explicit
provider/assembly mapping; do not infer it from a parent directory, current shell
location or the repository carrying .meta_harness.

Record the main checkout, declared primary branch, current task/HUB/spoke path and
branch, baseline revision, worktree container and permitted write scope. Verify
Git metadata inside that selected repository before changing it. Use a task-supplied
path or its own declared conventions; missing data does not authorize guessing.

The adopted container belongs to the main checkout. HUBs and spokes share that
container; never nest another container in a linked worktree. The examples use
.worktrees and main for readability, not as evidence of another repository's policy.

## Setup and checks

Select the execution checkout's declared toolchain, bootstrap and check entrypoints
from its actual configuration or task-provided development instructions. This skill
does not assume Python, uv, a Makefile or a particular product language.

Checks must resolve the sources under the checkout being tested. If its toolchain
uses per-checkout environments, prepare that environment; never reuse another tree's
environment in a way that imports stale sources. Compare inherited failures when a
behavior change needs a baseline. Documentation-only work needs relevant document
checks, not unrelated product suites.

## Evidence and delivery

Each integration check identifies the integrated revision, environment, configuration
and covered properties. Reuse prior evidence only when those inputs and the required
scope still match; changed composition, upstream requirements or missing coverage
requires the affected check. A spoke result does not establish HUB integration.

Take review, commit, push, merge and cleanup permissions from the current task and
the selected repository's adopted delivery rules. Existing authorization persists;
this skill adds no release or publication authority and no extra approval round.

Before retirement, separate reconstructible caches from unique reports, reproducers,
ignored drafts, logs and recovery notes. Locate active users of the tree and its
environment. Preserve needed assets outside the retiring tree, verify readable
content/hash correspondence, and repair recovery references before deleting it.

Use the explicitly agreed evidence location. Temporary task evidence may use the
main checkout's task scratch area when that convention applies; ignored storage is
not durable backup. Lasting observations, choices and verification belong to their
design owners. In a declared .meta_harness workspace, use design/ family README
entries to select the owner; do not turn every task log into permanent design.

Unknown preservation or active-consumer status defers removal, not unrelated work.
Source changes remain on the task branch under its authorization; do not use stash
as an untracked substitute for a recoverable handoff.

Return to [discipline](../SKILL.md) or the [fan-out walkthrough](fanout_playbook.md).
