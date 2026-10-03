---
name: worktree-discipline
description: >
  One session, one isolated git worktree: create it, work from inside it with a single writer, integrate it, and retire it without losing evidence. Use when creating, checking, operating inside, or cleaning up git worktrees for development tasks in an explicitly identified execution repository, and when asked to set up a HUB with spokes or to run parallel writers, which this skill declines with reasons.
---

# Worktree Discipline

A session works in **one** isolated worktree, on one branch, for one deliverable unit,
and integrates that unit into the primary branch before it starts the next. The session
stands inside that worktree while it writes. There is no HUB and there are no spokes.

First resolve the [execution context](references/execution-context.md); the skill's
installation directory does not identify the repository whose code you may change.

Load `asd-ste100` before you write plans, recovery notes, or evidence reports.
Follow its applicable writing rules.
Keep this skill's worktree boundaries, evidence requirements, and task permissions.

## Resolve the adopted workspace conventions

| Convention | Value |
|---|---|
| Location | An explicit container under the execution repository's main checkout; examples use `.worktrees/` when that convention is adopted |
| Naming | A semantic task name; the branch name follows the repository's branch rules |
| Main checkout | Stays on the declared primary branch; feature branches live in worktrees. Examples use `main` only when that is the actual primary branch |
| Setup | Use the execution repository's explicitly identified setup and checks; [context rules](references/execution-context.md#setup-and-checks) define how to select them |
| `git stash` | This workflow preserves source changes on the worktree's branch rather than stashing them |

The worktree container belongs to the main checkout. Resolve that root explicitly when
already inside a linked worktree; never create a container inside a worktree.

## Step 0 — Read Your Position

Before creating anything, determine where you stand:

```bash
git rev-parse --git-dir --git-common-dir   # differ → you are in a linked worktree
git branch --show-current
pwd
```

| You are in… | The correct move |
|---|---|
| The main checkout (paths equal) | Create one worktree for the unit and change into it. Never edit here beyond gitignored scratch |
| A linked worktree | This is the session's worktree. The same unit: continue. A different unit: integrate what is here first, or have the owner open another session for it. Never create a second worktree from inside this session |

## One Session, One Worktree

- **One unit at a time.** A unit is one story card or one plan increment: small enough
  to verify and integrate on its own. Finish it, integrate it into the primary branch,
  then start the next.
- **One writer at a time.** At any moment the worktree has exactly one writer — the
  session's main agent, or one write-capable agent it has handed a slice to.
- **A unit that depends on a not-yet-integrated predecessor** stacks its branch on that
  predecessor in this same worktree and takes in the primary branch once the predecessor
  lands. It does not get a second worktree.
- **What may run alongside:** read-only work — research, review, acceptance runs against
  an already delivered state. A check that needs a pristine checkout uses a disposable
  clone or detached copy with no working branch, removed when the check ends. That is a
  verification copy, not a second worktree.
- **Several unrelated units at the same time are several sessions.** The owner starts
  them; each has its own worktree and writes members no other session is writing. One
  session does not coordinate several worktrees on the owner's behalf.

## Create and Enter

```bash
git -C /path/to/main-checkout worktree add .worktrees/<name> -b <branch-name>
cd /path/to/main-checkout/.worktrees/<name>  # all subsequent paths are THIS tree's
pwd && git branch --show-current             # the session now stands in the worktree
# Run the setup selected for this checkout; do not infer Python or uv from this skill
```

The `cd` is part of creating the worktree, not a convenience. Host hooks and the
repository's sensors measure the checkout the session stands in; a session that stays
in the main checkout and writes into the worktree by path gets no feedback on what it
wrote. Where the host does not carry `cd` from one command to the next, start or resume
the session in the worktree, or set its working directory explicitly.

Baseline: when behavior changes need comparison, run the relevant checks in this
checkout so inherited failures can be distinguished. Use the
[setup and check context](references/execution-context.md#setup-and-checks) and the
owning member's commands; ordinary document edits need document checks, not unrelated
product tests.

## Handing a Slice to Another Agent

A write-capable agent the session dispatches works **in this same worktree**. It does
not get a worktree of its own: hosts start a dispatched agent in the dispatching
session's directory, and a tree the session does not stand in is outside its hooks and
sensors.

- Its brief names the worktree path and branch, and its first action is
  `cd <worktree>` plus a branch check.
- While it holds the slice, nobody else writes or commits on this branch — the main
  session included.
- When it reports back, the main session verifies where the commits landed
  (`git log --oneline`, `git status`) before relying on the report; a worker's claim is
  not evidence. Worktree access does not by itself authorize commits; the task does.
- Read-only agents (reviewers, researchers) may be dispatched in parallel.

## When Asked for a HUB, Spokes or Parallel Writers

Decline. Do not create an integration worktree with child worktrees, do not give
dispatched agents their own worktrees, and do not run several writers at once — also
when the person asking insists. This rule belongs to the repository owner: it changes
by changing this skill through the repository's normal review, not by repeating the
request in a session.

Say it once, plainly, covering three things:

1. **Why not.** Parallel writers cost more in merging and re-verification than they
   save, and they hide which change broke what. A writer in a tree the session does not
   stand in is outside the feedback loop: hooks and sensors do not see its changes.
   Multi-agent orchestration has been slower and worse than one agent working through
   the same stories in order. Give the dates and sources from
   [why one writer](references/why-one-writer.md).
2. **How strong the evidence is.** These are field reports and this repository's own
   observations, not controlled comparisons, and the most cited author changed position
   several times within a year. State that; do not present it as settled science.
3. **What to do instead.** Put the units in an order and deliver them one at a time,
   each integrated before the next. Run the read-only parts in parallel. If two units
   are truly unrelated and both urgent, the owner can open a second session for the
   second one.

Keep to facts, dates and the next step. No lecturing, no judgement of the person: the
aim is that they can act on the alternative, not that they feel corrected.

## Retirement Before Removal

A merged branch and clean `git status` protect neither unique ignored evidence nor
an active consumer of the checkout or its environment. Even removal without `--force`
can delete ignored files; non-force is not an evidence-preservation check. Before
removing a worktree:

1. Confirm the exact path/branch and where the required commits landed. Inspect
   uncommitted, untracked, and ignored task assets; `git status --short --ignored`
   and targeted `git ls-files --others --ignored --exclude-standard` can help locate
   them without dumping their contents. Distinguish rebuildable caches from unique
   reports, failure logs, frozen patches, reproduction scripts, and recovery notes.
2. Check known agents, tests, reviewers, and other callers using this tree or its
   environment. Git status does not establish that they have finished. Unknown or
   active use means defer removal of this tree until the consumer releases it.
3. Preserve needed unique assets in the agreed location outside the retiring tree,
   normally the main checkout's `tmp/<task>/` for temporary task evidence.
   Durable research or verification evidence belongs in its owning tracked material
   under the [evidence ownership rules](references/execution-context.md#evidence-and-delivery). Verify that
   the copy is readable and matches the original contents/hash, and update recovery
   references that would otherwise point into the removed tree. A path alone is not
   preservation. Keep the task's existing retention obligations; ignored local storage
   does not itself promise remote backup or authorize publication.
4. With those conditions satisfied and cleanup authorized, use
   `git worktree remove <exact-path>`, then `git branch -d <branch>` where the branch
   is also no longer needed. If removal refuses solely because identified,
   rebuildable leftovers remain, `--force` is permitted only when their disposal is
   covered by the existing authorization and no consumer needs them. Do not use
   force to bypass unknown contents, active use, or unpreserved work.

A session cannot remove the worktree it stands in. Leave it, say so, and name the one
command that removes it once the session has ended.

Record a deferred tree's reason, consumer, and release condition in the existing
task/plan record. Remove safe-to-retire trees promptly rather than stockpiling them.
This is a local decision, not an automatic cleanup service or a requirement to archive
every cache.

## The Seven Red Lines

These safeguards address wrong-tree writes, stale checks, lost evidence, active
consumers and feedback that looks at the wrong tree.

1. **One session, one worktree.** No second worktree for the same session, no worktree
   per dispatched agent, no HUB with spokes.
2. **The session works from inside its worktree.** Change into it right after creating
   it, confirm with `pwd` and `git branch --show-current` before the first edit, and stay
   until the unit is integrated. Use this tree's paths: a main-checkout path written from
   a worktree session lands in the main working tree. After creating a file, `git status`
   in the worktree confirms where it landed.
3. **One writer at a time, and landing is verified.** A dispatched writer proves its
   position first (`cd <worktree>` + branch check); the dispatcher does not write
   meanwhile and verifies the commits afterward.
4. **Run checks with this worktree's toolchain and sources.** Using another checkout's
   environment can resolve stale sources and mask failures.
5. **The main checkout stays on its declared primary branch.** Feature-branch switches
   belong in worktrees.
6. **A branch does not drift from the primary branch.** Integrate each unit as soon as
   it is verified. Before merge, take in the current primary branch. Compute the impact
   of the candidate commit relative to the integration baseline. Run the checks required
   by that scope, including the repository's common hard lines. Include relevant checks
   added on the primary branch since the worktree was cut. Record the baseline, candidate,
   scope, selection reasons, and results.
7. **Nothing needed is lost at retirement, and nothing is stashed.** Apply Retirement
   Before Removal after a merge: update the local primary branch, preserve unique
   ignored evidence outside the tree, keep a tree an active consumer still needs. No
   `git stash`: source work stays on the worktree's branch under the task's commit
   authorization.

## Boundaries & Siblings

- **Task plan** — supplies the units, their order and the acceptance scope. New semantic
  questions return to the task's design authority; isolation does not resolve them.
- **[Execution context](references/execution-context.md)** — identifies setup, checks,
  delivery authority and evidence retention. This skill owns topology and retirement
  conditions; activating it grants no commit, push or merge authority.
- **Native isolation tools** (`EnterWorktree`, Agent `isolation: "worktree"`) — use
  them only to place the session in its one worktree, and only when their destination
  matches the execution repository's adopted container. Do not use them to give
  dispatched agents separate worktrees. Otherwise use explicit `git worktree add`.
