# SwarmForge six-pack

The `six-pack` branch is the full pack-only workflow. It gives specification,
implementation, cleanup, architecture, mutation hardening, and final QA to six
separate agents.

The repository's master branch is named
[`main`](https://github.com/unclebob/swarm-forge/tree/main). Read its
[README](https://github.com/unclebob/swarm-forge/blob/main/README.md) for
prerequisites, installation of `get-swarm-forge`, and the shared runtime model.
This README covers only the six-pack's structure and operation.

## Structure

This branch contributes the pack-owned half of an installation:

```text
swarm
swarmforge/
  swarmforge.conf
  constitution.prompt
  constitution/
    articles/
      project.prompt
      local-engineering.prompt
      local-workflow.prompt
  roles/
    specifier.prompt
    coder.prompt
    cleaner.prompt
    architect.prompt
    hardender.prompt
    QA.prompt
```

`get-swarm-forge six-pack` combines those files with the runtime scripts and
shared constitution articles from `main`. Generated transport state lives in
`.swarmforge/`; generated role checkouts live in `.worktrees/`.

## Configuration

The branch's [`swarmforge/swarmforge.conf`](swarmforge/swarmforge.conf) is the
authority for the active agents, worktrees, receive modes, and propagation.

| Role | Default backend | Working directory | Receive mode | Propagation |
|---|---|---|---|---|
| `specifier` | Codex | project root (`master`) | task | forward only |
| `coder` | Grok | `.worktrees/coder` | task | forward only |
| `cleaner` | Grok | `.worktrees/cleaner` | batch | back one |
| `architect` | Grok | `.worktrees/architect` | batch | back all |
| `hardender` | Codex | `.worktrees/hardender` | batch | forward only |
| `QA` | Grok | `.worktrees/QA` | batch | back all |

`master` means the main project checkout on its current branch; the branch does
not need to be named `master`.

Each non-comment line uses the shared pack form:

```text
window[-invisible] <role> <backend> <worktree> [task|batch] [forward-only|back-one|back-all] [backend arguments...]
```

File order defines the forward route. Omitted receive and propagation fields
mean `task` and `forward-only`. The four downstream quality roles select batch
mode; cleaner propagates back one, architect and QA propagate back to all
earlier roles, and the two Codex roles receive `--yolo`.

## Constitution

[`swarmforge/constitution.prompt`](swarmforge/constitution.prompt) is the
instruction entry point and takes precedence over its articles. Installation
combines three shared articles from `main` with three six-pack articles:

| Source | Article | Purpose in this pack |
|---|---|---|
| `main` | `engineering.prompt` | Shared language, TDD, acceptance-pipeline, tooling, and verification law. |
| `main` | `workflow.prompt` | Shared worktree, commit, scratch-file, and failure rules. |
| `main` | `handoffs.prompt` | Shared durable handoff and merge protocol. |
| `six-pack` | [`project.prompt`](swarmforge/constitution/articles/project.prompt) | Declares the six-role shape, local state locations, handoff style, and ownership boundary. |
| `six-pack` | [`local-engineering.prompt`](swarmforge/constitution/articles/local-engineering.prompt) | Requires non-specifier agents to verify unit and acceptance behavior and the final quality roles to run available property tests. |
| `six-pack` | [`local-workflow.prompt`](swarmforge/constitution/articles/local-workflow.prompt) | Defines how earlier roles process QA's merge-only terminal handbacks without restarting the pipeline. |

Every project agent reads all six articles before its role prompt. The local
articles specialize the full pipeline while the common engineering and handoff
rules remain owned and documented by `main`.

## Roles

| Prompt | Ownership |
|---|---|
| [`specifier.prompt`](swarmforge/roles/specifier.prompt) | Writes deterministic Gherkin plus headed end-to-end QA procedures and submits them for dashboard approval. |
| [`coder.prompt`](swarmforge/roles/coder.prompt) | Builds the acceptance pipeline and implements approved behavior with TDD, unit tests, and generated acceptance tests. |
| [`cleaner.prompt`](swarmforge/roles/cleaner.prompt) | Performs local behavior-preserving cleanup, coverage, CRAP and DRY analysis, and module-responsibility checks. |
| [`architect.prompt`](swarmforge/roles/architect.prompt) | Owns boundaries, dependency direction, structural corrections, and property-test support. |
| [`hardender.prompt`](swarmforge/roles/hardender.prompt) | Owns language and Gherkin mutation hardening, CRAP and DRY gates, and robustness work. |
| [`QA.prompt`](swarmforge/roles/QA.prompt) | Turns QA procedures into executable UI-level checks, performs independent final verification, and makes only narrow fixes found through QA. |

Configuration establishes topology and propagation; the constitution governs
the entire project; role prompts assign exclusive artifacts, checks, and
handoffs.

## Workflow

```text
New Task → specifier → approval → coder → cleaner → architect → hardender → QA → Done
```

Because the specifier is the project-root role, its forward handoff is held in
**Attention** for operator approval before delivery to the coder. Later
handoffs move the board automatically. Cleaner and architect results propagate
back to earlier roles as configured. QA's terminal result propagates to all
earlier roles and moves the card to Done.

Batch mode lets the four downstream quality roles process compatible queued
handoffs together while keeping specification and implementation task-focused.

## Runtime components and generated state

The branch owns no runtime implementation. `get-swarm-forge` installs the
launcher, configuration, constitution entry point, local articles, and role
prompts from this branch, then adds the shared scripts and articles from
`main`.

At startup the composed runtime creates the five non-master worktrees, mirrors
managed instructions and helpers into them, starts six tmux sessions, and
starts the handoff daemon and dashboard. `.swarmforge/` contains generated
role/session maps, handoff queues, board cards, approvals, daemon state, and
pane metadata. `.worktrees/coder`, `.worktrees/cleaner`,
`.worktrees/architect`, `.worktrees/hardender`, and `.worktrees/QA` are
generated git checkouts, not policy or configuration sources.

## Install and run

From the existing project that should receive the pack:

```sh
get-swarm-forge six-pack
./swarm
```

The installer copies shared infrastructure from `main` and this branch's pack
definition into the current directory. `./swarm` starts the configured agents,
handoff daemon, and local dashboard. The default roles are invisible tmux
sessions; open their live panes from the dashboard.

Use **New Task** to give work to the specifier. The board follows the configured
role order, **Attention** handles the specification gate and clarifications,
and **Teardown** stops the swarm without deleting the project.

For durable handoff format, audit, retry, and merge details, see the
[`main` handoff protocol](https://github.com/unclebob/swarm-forge/blob/main/swarmforge/handoff-protocol.md).

## Changing this branch

- Change `swarmforge/swarmforge.conf` to change the six active roles, their
  backends, worktrees, or queue behavior.
- Change `swarmforge/roles/` to change the division of work.
- Keep six-pack additions in `project.prompt` or `local-*.prompt` articles.
- Put common runtime, dashboard, terminal, installer, or shared constitution
  changes on `main`, not here.
