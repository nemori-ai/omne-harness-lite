# Fan-out Playbook — Command-Level HUB Lifecycle

The Mode B walkthrough, command by command. `<campaign>` is the semantic campaign
name; `WT=/path/to/main-checkout/.worktrees` throughout. The main checkout
root is shared by the HUB and all spokes; never derive it from a linked worktree's
current directory. Every command shown runs against explicit
paths — never rely on "where the shell happens to be". Setup and check commands
follow the [development guide](../../../../docs/development.md); coverage and reuse
of evidence follow the [verification rules](../../../../docs/maintenance/verification.md).

## 1. HUB Setup

```bash
# From anywhere — paths are explicit
git -C /path/to/main-checkout worktree add .worktrees/<campaign> -b worktree-<campaign>
cd /path/to/main-checkout/.worktrees/<campaign>
uv sync --locked                              # HUB gets its own development environment

# Land plan-mandated foundation work as ordinary commits on the HUB branch
git add <files> && git commit -m "chore(<campaign>): HUB setup — <what>"
```

The HUB branch is the campaign's integration line. Its name (`worktree-<campaign>` or
a `feat/<campaign>` style name) is the base for every spoke.

## 2. Spoke Creation — fork from the HUB branch

```bash
HUB_BRANCH=$(git -C "$WT/<campaign>" branch --show-current)

# Spokes are created in the MAIN checkout's worktree dir, based on the HUB branch:
git -C /path/to/main-checkout worktree add \
    .worktrees/<campaign>-<spoke> -b <campaign>-<spoke> "$HUB_BRANCH"
```

**Never** `-b <spoke> main` — a spoke based on `main` is blind to every sibling
already merged into the HUB, and its merge-back will re-litigate the campaign's own
history.

If the wave plan identifies an unproven shared pattern or verification setup, run its
representative pilot through work → merge-back → HUB verification before the dependent
spokes fan out. Resolve shared failures first. Established patterns and independent
spokes do not need a pilot solely because they use Mode B; retain each spoke's setup
and verification and the HUB checks below.

## 3. Dispatching a Spoke Worker

The dispatch prompt's mandatory preamble (verbatim discipline, not paraphrase):

```
First actions, before any other work:
1. cd /abs/path/.worktrees/<campaign>-<spoke>
2. git branch --show-current   → MUST print <campaign>-<spoke>; if not, STOP and report
3. All file Writes/Edits use this worktree's absolute paths.
4. Checks use THIS checkout's declared tools and sources; current Python tools use its own .venv. Follow docs/development.md and preserve required output.
Deadline: commit partial work with a WIP marker if approaching it.
```

After the worker reports, the dispatcher independently verifies the landing:

```bash
git -C "$WT/<campaign>-<spoke>" log --oneline -5     # commits exist, on the right branch
git -C "$WT/<campaign>-<spoke>" status --short       # nothing stranded unstaged
git -C /path/to/main-checkout log --oneline -3     # main did NOT move
```

These checks do not show unique ignored assets or prove that consumers have finished.
Before any removal, apply SKILL.md's **Retirement Before Removal**: inspect the task's
ignored assets, preserve needed unique evidence outside the tree and verify it is
readable and content-matched, and confirm agents/checks/reviewers have released the
tree and its environment. Record unresolved conditions instead of forcing removal.
Non-force removal can delete ignored files too; these checks precede either form.

## 4. Merge-Back at Spoke Completion (or Wave Barrier)

```bash
cd "$WT/<campaign>"
git merge --no-ff <campaign>-<spoke>      # conflicts resolved HERE, in the HUB

# Current repository integration checks after merge-back; add member checks as implemented:
make check

# Only after Retirement Before Removal passes and cleanup is authorized:
git -C /path/to/main-checkout worktree remove .worktrees/<campaign>-<spoke>
git -C /path/to/main-checkout branch -d <campaign>-<spoke>
```

A wave barrier is this block executed for each spoke of the wave, then the go/no-go
decision against the roadmap's barrier acceptance gate. Removal can be deferred with
its reason and release condition; do not report a retained directory as deleted or
block unrelated work solely on that deferral. If a spoke fails verification:
the orchestrator arbitrates (re-dispatch with findings / amend in HUB / re-plan) —
the next wave does not launch over a red barrier.

## 5. Campaign Closure

```bash
cd "$WT/<campaign>"
make check
# Include any actual product-member checks required by the campaign plan.

git push -u origin "$HUB_BRANCH"
# Prepare the PR under CONTRIBUTING.md; PRs to main wait for human review.
```

The commands show the required verification scope. If the same integrated contents,
environment, configuration, and full scope already have applicable complete evidence,
independently check and cite it under the repository's verification rules.
Do not rerun solely because this is a new checkpoint; do run checks invalidated by
changes or needed for missing evidence. Spoke-only results do not prove integration.

Closure shape (decided in the roadmap, executed here): one consolidated PR from the
HUB when spokes share foundations; per-spoke PRs only when spokes were genuinely
independent — in which case each spoke pushes its own branch *before* retirement and
the HUB serves as verification ground rather than PR source.

## 6. Post-Merge Retirement (after the PR lands)

```bash
git -C /path/to/main-checkout pull                                  # main current
# Only after Retirement Before Removal passes and cleanup is authorized:
git -C /path/to/main-checkout worktree remove .worktrees/<campaign>
git -C /path/to/main-checkout branch -d "$HUB_BRANCH"
git -C /path/to/main-checkout remote prune origin
git -C /path/to/main-checkout worktree list                         # confirm clean
```

Use the same retirement conditions for the HUB as for spokes. A refusal is a reason
to inspect remaining contents, not to retry blindly with force. `--force` is reserved
for identified rebuildable leftovers whose disposal is authorized and which have no
consumer; preserve needed assets first. Record retained trees and their release
conditions. Keep independent work moving unless a real resource or dependency blocks it.

## Failure Modes Seen in the Wild

| Symptom | Root cause | Defense in this playbook |
|---|---|---|
| Spoke commits "missing" | Worker committed on `main` or wrong branch | §3 preamble line 2 + dispatcher verification |
| False-green spoke tests | Worker ran main checkout's `.venv` | §3 preamble line 4 |
| Files appear in main's `git status` | Worktree session wrote main-checkout paths | §3 preamble line 3; `git status` self-check after file creation |
| Merge-back conflict storm at campaign end | Spokes forked from `main`, or no per-merge verification | §2 fork-from-HUB; §4 verify every merge-back |
| "Failed" workflow whose work actually landed | Reporting layer error, not work error | §3 dispatcher verifies the tree, not the report |
| Disk bloat, stale state, or lost evidence | Unexamined leftovers or premature force removal | §4 and §6 retirement checks, recorded release conditions, prompt removal when safe |
