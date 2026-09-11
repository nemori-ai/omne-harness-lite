---
name: worktree-discipline
description: >
  omne-harness-lite worktree discipline guidance. Use when creating, checking, operating inside, or cleaning up git worktrees for isolated development tasks.
---

# Worktree Discipline for omne-harness-lite

Worktrees are where OMNE's parallel development either composes into one clean
integration or silently contaminates the main checkout. This skill carries the
project's two operating modes — **Solo** (one task, one worktree) and **Fan-out** (a
HUB integration worktree dispatching parallel spokes) — and eight red lines, every one
of which was once violated at the cost of real rework. The red lines are the point;
the modes are the terrain they apply to.

## Project Conventions (fixed, not choices)

| Convention | Value |
|---|---|
| Location | `.claude/worktrees/<semantic-name>` — gitignored; never anywhere else |
| Naming | Semantic campaign / task names (`engram-ddd-phase2`, `harness-tenant`); spoke families share a prefix (`harness-th-*`) |
| Main checkout | **Stays on `main`, forever.** Feature branches exist only inside worktrees |
| Setup | Use the repository-specific setup documented by the task; do not assume an implementation language or environment |
| `git stash` | Forbidden, everywhere — worktrees exist so you never need it |

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

## Mode A — Solo

One well-bounded task, one worktree:

```bash
git worktree add .claude/worktrees/<name> -b <branch-name>
cd .claude/worktrees/<name>          # all subsequent paths are THIS tree's
./scripts/uv_sync_all.sh             # only if Python will be touched
```

Baseline: if the task touches Python, run a scoped test pass
(`./scripts/run_tests.sh --targets <pkg> ... > /tmp/<name>-baseline.log 2>&1`) so new
failures are distinguishable from inherited ones. Docs-only work skips setup and
baseline. Then the red lines below govern everything until merge.

## Mode B — Fan-out (HUB-and-spoke)

The project's signature topology for parallel campaigns. **Prerequisite: a
roadmap-level plan with an explicit wave structure** (implementation_planning
Altitude 2). Fan-out without a wave plan is flying blind — the topology mirrors the
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
test_driven_development Completion Gate. Spoke results alone never replace HUB
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
3. **Parallel spokes** — each spoke is a full Mode A citizen: own `.venv`, own paths,
   own baseline. Dispatch prompts for spoke workers MUST begin with `cd <spoke-path>`
   plus a branch verification step — dispatched agents have committed to `main`
   before.
4. **Merge-back** — as each spoke completes (or at the wave barrier), merge it into
   the HUB; the HUB runs an integration-level verification **after every merge-back**,
   not once at the end. Then apply **Retirement Before Removal** below: retire the
   spoke once its work and necessary evidence are preserved and its consumers have
   released it. Record any deferred retirement and its release condition.
5. **Campaign closure** — when all waves are merged and the HUB's final verification
   is green, close via the github-pr skill. Two shapes, chosen by coupling:
   **one consolidated PR from the HUB** when spokes share foundations or only make
   sense together; **per-spoke PRs** when spokes are genuinely independent and
   separately reviewable. Either way, a PR to `main` waits for human review.
   Closure ships the code together with the documents that describe that delivery.
   Independent formal engineering-knowledge corrections follow the github-pr skill's
   guidance on value, urgency, coupling, review, and applicable verification when
   deciding whether to use a separate PR. Temporary scheduling notes stay local;
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
   normally the main checkout's `docs/plans/` for local task evidence. Verify that
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

Each of these is a law because it was once broken. The cost column is real history,
not hypothesis.

1. **Write/Edit with worktree-absolute paths only.** Using main-checkout paths from a
   worktree session writes files into the main working tree — a 27-file design-doc
   batch once landed on `main` this way. After creating any file, run `git status` *in
   the worktree* to confirm where it landed.
2. **Run tests from the worktree's own `.venv`.** Invoking the main checkout's
   environment resolves the main checkout's (stale) sources — producing false greens
   that mask real failures.
3. **The main checkout never leaves `main`.** No `git checkout <branch>` in the
   primary path, ever; branches live and die in worktrees.
4. **Dispatched agents prove their position before working** — first action
   `cd <worktree>` + branch verification — **and the dispatcher independently verifies
   commit landing afterward** (`git -C <path> log --oneline`). Workers have claimed
   worktree commits that were actually on `main`.
5. **Post-merge retirement includes evidence and consumers.** After a PR merges,
   update local `main` and apply Retirement Before Removal. At fan-out merge-back,
   apply the same check to the spoke. Keep any tree still needed by an active consumer,
   unpreserved evidence, or the user; record why and when it can be released.
6. **Long-lived drafts live in the main checkout.** Gitignored files inside a worktree
   have no git protection — `worktree remove` vaporizes them. Backlogs, design notes,
   anything that outlives the branch goes in the main checkout's `docs/plans/`.
   Campaign roadmaps, scheduling charters and dispatch topology are orchestration
   artifacts of the same kind: they stay in `docs/plans/` or on the HUB branch and are
   never turned into a PR or filed under `omne_harness/delivery/` — that family owns
   value commitments and DoD, not session topology.
7. **No `git stash`.** Preserve source work on its worktree branch under the task's
   commit authorization. Legitimate ignored evidence need not become a source commit;
   preserve it under the retention rules above.
8. **A long-running HUB tracks `main`; it is not a frozen base.** Use the Mode B
   synchronization triggers and full pre-PR gate verification. A stale E13 HUB once caused a
   gatekeeper to report a false BLOCKER against standards already on `main` while new
   import-linter gates never exercised the campaign's directory moves.

## In Orchestrator Mode

A master orchestrator applies this skill **directly**: HUB setup, spoke creation,
merge-back, and post-merge cleanup are integration work — conducting, not playing.
One boundary against generic orchestration doctrine: a "single-committer / leaves
never commit" dispatch-hygiene rule (e.g. cc-master's) targets parallel agents sharing
ONE working tree, where concurrent `git commit` races the index. In Mode B every spoke
owns its worktree, so spoke workers committing inside their own tree is safe and is
this project's standing practice — red line 4 (prove position, verify landing) is the
control that makes it safe. What stays exclusively the orchestrator's: merging into
the HUB, integration verification, and anything that touches `main`.

## Boundaries & Siblings

- **`implementation_planning`** — authors the wave structure Mode B executes; the
  fan-out's prerequisite, not its product.
- **`test_driven_development`** — the loop running inside each spoke; red line 2 is
  where the two skills meet.
- **`github-pr`** — owns PR mechanics at campaign closure; this skill only decides the
  closure shape.
- **Native isolation tools** (`EnterWorktree`, Agent `isolation: "worktree"`) — prefer
  them when the harness offers them for ad-hoc single-agent isolation; Mode B's
  named-HUB topology is deliberate and stays under explicit `git worktree` control.
