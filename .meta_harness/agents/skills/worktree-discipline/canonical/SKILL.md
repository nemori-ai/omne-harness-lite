---
name: worktree-discipline
description: >
  Worktree isolation, integration and evidence-preserving retirement for an explicitly identified execution repository. Use when creating, checking, operating inside, or cleaning up git worktrees for isolated development tasks.
---

# Worktree Discipline

Use isolated checkouts to keep task changes, integration and evidence attached to
the right repository and branch. This skill preserves two operating modes: **Solo**
(one task, one worktree; the default) and **Fan-out** (a short-lived HUB integration
worktree with spokes, for parallel units that write disjoint members).
First resolve the [execution context](references/execution-context.md); the skill's
installation directory does not identify the repository whose code you may change.

## Resolve the adopted workspace conventions

| Convention | Value |
|---|---|
| Location | An explicit container under the execution repository's main checkout; examples use `.worktrees/` when that convention is adopted |
| Naming | Semantic campaign/task names; spoke families share a prefix |
| Main checkout | Stays on the declared primary branch; feature branches live in worktrees. Examples use `main` only when that is the actual primary branch |
| Setup | Use the execution repository's explicitly identified setup and checks; [context rules](references/execution-context.md#setup-and-checks) define how to select them |
| `git stash` | This workflow preserves source changes on explicit worktree branches rather than stashing them |

The worktree container belongs to the execution repository's main checkout, including for HUB
and spoke creation. Resolve that root explicitly when already inside a linked
worktree; do not create a nested `.worktrees/` in the HUB or spoke.

## Step 0 — Read Your Position

Before creating anything, determine where you stand:

```bash
git rev-parse --git-dir --git-common-dir   # differ → you are in a linked worktree
git branch --show-current
```

Three positions, three different correct moves:

| You are in… | The correct move |
|---|---|
| The main checkout (paths equal) | Create a worktree for the work; never edit here beyond gitignored scratch |
| A **HUB** worktree (integration branch) | This is *not* "already isolated, done" — a HUB is a launch pad. New parallel workstreams fork as spokes **from the HUB branch** |
| A **spoke** worktree | Work. Never nest another worktree inside |

The generic rule "already in a worktree → skip creation" is **wrong in fan-out
campaigns**: it reads the HUB as the destination when it is the hub of the wheel.
Position determines topology; topology comes from the plan.

## Choose the Mode — Solo Is the Default

Implementation proceeds one deliverable unit at a time (one story card, one plan
increment): a single writer, one worktree, and integration into the primary branch
before the next unit starts. At any moment a workspace member has at most one writer.
Parallel writers on shared ground cost more in merge and re-verification than they
save, and they hide which change broke what.

Choose Mode B only when the plan shows that the parallel units write disjoint members
and share no interface that is still being decided. Independent read-only work —
review, research, acceptance runs on an already delivered state — may always run
alongside. A unit that depends on a not-yet-integrated predecessor stacks its branch on
that predecessor in the same worktree and rebases once the predecessor lands; it does
not open a HUB.

When Mode B is used, keep the HUB short-lived: deliver it to the primary branch at each
wave barrier instead of carrying it to the end of a campaign. A HUB that has outlived
its wave is a signal to integrate, not to keep synchronizing.

## Mode A — Solo

One well-bounded task, one worktree:

```bash
git -C /path/to/main-checkout worktree add .worktrees/<name> -b <branch-name>
cd /path/to/main-checkout/.worktrees/<name>  # all subsequent paths are THIS tree's
# Run the setup selected for this checkout; do not infer Python or uv from this skill
```

Baseline: when behavior changes need comparison, run the relevant checks in this
checkout so inherited failures can be distinguished. Use the
[setup and check context](references/execution-context.md#setup-and-checks) and the owning member's
commands; ordinary document edits need document checks, not unrelated product tests.
Prepare the local tool environment when the selected checks require it.

## Mode B — Fan-out (HUB-and-spoke)

In this walkthrough, `main` denotes the explicitly selected primary branch; substitute
its actual name. The execution repository and container remain the ones selected above.

The topology for the cases that pass the test above. **Prerequisite: a
task plan with an explicit wave structure**. Fan-out without a wave plan is flying blind — the topology mirrors the
plan, never improvises it.

**Topology.** The HUB is an integration worktree on a campaign branch cut from
`main`. Spokes are per-task worktrees whose branches are cut **from the HUB branch,
never from `main`** — a spoke based on `main` silently misses every sibling already
merged back. Spoke names share the campaign prefix.

**Upstream synchronization.** Treat the long-running HUB as a tracked integration
line, not a one-time snapshot of `main`. Before dispatching each new spoke wave, and
whenever a relevant PR lands on `main`, merge current `main` into the HUB and verify
the campaign's integration gates. Campaign-authored specifications or gates landing
on `main` trigger an immediate back-merge; otherwise the campaign builds against a
standard its own HUB cannot see. Before dispatching a reviewer or gatekeeper, check
how far the HUB trails `main`; if it trails, synchronize first or state explicitly in
the task brief where the newer specification lives. Before opening the campaign PR,
merge current `main` once more and verify the full gate suite, including any gates
added on `main` since HUB creation.

Verification must cover the actual integrated contents, environment, configuration,
and full required scope. A still-applicable run on that same integrated state may
serve the next checkpoint after independent evidence checks under the
[evidence rules](references/execution-context.md#evidence-and-delivery). Spoke results alone never replace HUB
integration evidence; changed composition, upstream standards, or missing evidence
require the affected checks.

**Lifecycle.**

1. **HUB setup** — create the HUB worktree, land shared scaffolding (plan-mandated
   foundation work) as setup commits.
2. **Pilot shared uncertainty** — when spokes will reuse an unproven implementation
   pattern or verification setup, run a representative spoke through work, merge-back,
   and HUB verification before dispatching the spokes that depend on it. Resolve shared
   failures first. Independent tasks using established patterns can proceed without a
   serial pilot; identify the evidence and dependencies in the existing wave plan.
3. **Parallel spokes** — each spoke is a full Mode A citizen: own environment, own paths,
   own baseline. Dispatch prompts for spoke workers begin with `cd <spoke-path>`
   plus a branch verification step (red line 4).
4. **Merge-back** — as each spoke completes (or at the wave barrier), merge it into
   the HUB; the HUB runs an integration-level verification **after every merge-back**,
   not once at the end. Then apply **Retirement Before Removal** below: retire the
   spoke once its work and necessary evidence are preserved and its consumers have
   released it. Record any deferred retirement and its release condition.
5. **Wave delivery and closure** — when a wave is merged and the HUB's verification
   is green, prepare the delivery under the [declared delivery policy](references/execution-context.md#evidence-and-delivery). Two shapes, chosen by coupling:
   **one consolidated PR from the HUB** when spokes share foundations or only make
   sense together; **per-spoke PRs** when spokes are genuinely independent and
   separately reviewable. Either way, preserve the execution repository's actual review and merge requirements;
   skill activation does not grant commit, push or merge authority.
   Closure ships the code together with the documents that describe that delivery.
   Independent knowledge corrections follow the contribution guide's scope and
   evidence requirements when deciding whether to use a separate delivery. Temporary scheduling notes stay local;
   batch related changes where appropriate.

Command-level walkthrough: [fanout_playbook.md](references/fanout_playbook.md).

## Retirement Before Removal

A merged branch and clean `git status` protect neither unique ignored evidence nor
an active consumer of the checkout or its environment. Even removal without `--force`
can delete ignored files; non-force is not an evidence-preservation check. Before
removing a spoke or HUB:

1. Confirm the exact path/branch and where the required commits landed. Inspect
   uncommitted, untracked, and ignored task assets; `git status --short --ignored`
   and targeted `git ls-files --others --ignored --exclude-standard` can help locate
   them without dumping their contents. Distinguish rebuildable caches from unique
   reports, failure logs, frozen patches, reproduction scripts, and recovery notes.
2. Check known agents, tests, reviewers, and other callers using this tree or `.venv`.
   Git status does not establish that they have finished. Unknown or active use means
   defer removal of this tree until the consumer releases it.
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

Record a deferred tree's reason, consumer, and release condition in the existing
task/plan record. Resolve real resource pressure or downstream dependencies; deferred
retirement alone is not a wall before unrelated work. Remove safe-to-retire trees
promptly rather than stockpiling them. This is a local decision, not an automatic
cleanup service or a requirement to archive every cache.

## The Eight Red Lines

These safeguards address wrong-tree writes, stale checks, lost evidence and active
consumers.

1. **Write/Edit with worktree-absolute paths only.** Using main-checkout paths from a
   worktree session writes files into the main working tree. After creating any file,
   run `git status` *in the worktree* to confirm where it landed.
2. **Run checks with this worktree's toolchain and sources.** Python checks use its
   own `.venv`; future TS/JS members use this checkout's declared environment. Using
   the main checkout's environment can resolve stale sources and mask failures.
3. **The main checkout stays on its declared primary branch.** Feature-branch
   switches belong in worktrees, not in the primary checkout.
4. **Dispatched agents prove their position before working** — first action
   `cd <worktree>` + branch verification — **and the dispatcher independently verifies
   commit landing afterward** (`git -C <path> log --oneline`); a worker's claim is not
   evidence.
5. **Post-merge retirement includes evidence and consumers.** After a PR merges,
   update local `main` and apply Retirement Before Removal. At fan-out merge-back,
   apply the same check to the spoke. Keep any tree still needed by an active consumer,
   unpreserved evidence, or the user; record why and when it can be released.
6. **Needed drafts survive worktree retirement.** Gitignored files have no git
   protection. Preserve temporary plans, scheduling state and local evidence outside
   the retiring tree, normally under the main checkout's `tmp/<task>/`, with explicit
   retention needs. This is not durable archival storage. Research, proposals and
   required long-term evidence belong in their owning tracked materials under the
   [evidence ownership rules](references/execution-context.md#evidence-and-delivery); session topology
   alone is not a business contract or a reason to publish a proposal.
7. **No `git stash`.** Preserve source work on its worktree branch under the task's
   commit authorization. Legitimate ignored evidence need not become a source commit;
   preserve it under the retention rules above.
8. **A long-running HUB tracks `main`; it is not a frozen base.** Use the Mode B
   synchronization triggers and full pre-PR gate verification: a stale HUB makes
   reviewers judge against superseded standards and leaves gates added on `main`
   unexercised.

## In Orchestrator Mode

A master orchestrator applies this skill **directly**: HUB setup, spoke creation,
merge-back, and post-merge cleanup are integration work — conducting, not playing.
One boundary against generic orchestration doctrine: a "single-committer / leaves
never commit" dispatch-hygiene rule targets parallel agents sharing
ONE working tree, where concurrent `git commit` races the index. In Mode B every spoke
owns its worktree; when the task already authorizes commits, a spoke worker commits
there and follows red line 4 (prove position, verify landing). Worktree ownership does
not independently authorize commits. What stays exclusively the orchestrator's: merging into
the HUB, integration verification, and anything that touches `main`.

## Boundaries & Siblings

- **Task plan** — supplies the wave structure, owners and acceptance scope Mode B executes.
  New semantic questions return to the task's design authority; isolation does not resolve them.
- **[Execution context](references/execution-context.md)** — identifies setup, checks,
  delivery authority and evidence retention. This skill owns topology and retirement conditions.
- **Native isolation tools** (`EnterWorktree`, Agent `isolation: "worktree"`) — use
  them only when their destination and topology match the explicitly adopted execution
  repository convention. Otherwise use explicit `git worktree add`; Mode B's named-HUB
  topology remains under explicit `git worktree` control.
