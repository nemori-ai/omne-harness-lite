# Orchestrator lock — Uncle Bob DSH plugin v1

Date: 2026-08-24. Sources: `interview-core.md` (interview), `twitter-year.md` (Twitter). This file is the product decision record. Later agents do not reopen these choices without a new User Story.

## Acceptance (human-approved)

In DeepSeek Harness **web** profile, a human submits one User Story and sees short-lived children run **Specifier → Coder → Cleaner → Hardener → QA**. Each stage leaves executable gate evidence. Headless repeats the same pipeline. Skills, CRAP, mutation, and architecture checks exist to serve this pipeline; they are not a second product.

## v1 topology

Interview assembly line for **one** story. Twitter 2026-08-21: six in an assembly line worked; six parallel writers failed.

**Not v1:** packs (2/4/6), squad-of-parallel-writers, agent-to-agent debate, one agent editing another’s prompt, delete-then-mutate, CRAP&lt;4 as an agent gate, the 2026-08-04 role zoo (scrapped 2026-08-19), drop-in swarm-forge.

## Control plane

| Layer | Mechanism | Not |
|---|---|---|
| Director | TypeScript finite state machine in the plugin. Advances on **tool PASS**, not on model “done”. | A parent LLM following a procedure. A long workflow-script if/else. Growing AGENTS.md |
| Workers | Fresh `spawn` subagent per stage, `inheritsParentContext: false`, destroyed after handoff | Immortal personas, inherited chat |
| Handoff | Workspace artifacts + structured stage report | Agent chatter, prompt mutation |
| Gates | Host-side deterministic commands the plugin **runs** (via subprocess/tools). Agents may call the same tools inside their stage; the director still re-runs the gate and owns PASS | “Tell the model to compute coverage” |
| Human | Hawk on process, gate output, architecture, spot-check. No line-by-line review | Human as the quality bottleneck |

DSH workflow scripts can spawn children but cannot run host gates. Do not put the director in `workflowEngine` unless a host gate hook exists. Closest in-tree template: `dsh-tool-ralph` (fresh children, structured handoff, parent parks). Difference: named stages + host gates between them.

## Pipeline contract

Artifact root: `<workspace>/.uncle-bob/story-<id>/` (implementation may rename; keep one root).

| Stage | Tiny prompt owns | Must write | Director gate (host) | On FAIL |
|---|---|---|---|---|
| Specifier | One story. Emit Gherkin + QA markdown. Do not code. Block on missing product policy | `acceptance.feature`, `qa.md` | Files exist, Gherkin parses, unresolved blockers fail-closed | Re-spawn Specifier with gate log. Budget then `blocked` |
| Coder | Make Gherkin + unit tests pass. Failing tests first is instruction, not a keystroke police. Mess is expected | Product code, unit tests | Unit + acceptance PASS | Re-spawn Coder |
| Cleaner | CRAP + static refactor. Preserve behavior. Fix illegal deps by inversion/interfaces | Refactored tree | Tests still PASS. CRAP(cc, cov) ≤ **8** (inclusive). Architecture checker green | Re-spawn Cleaner |
| Hardener | Kill surviving mutants | Stronger tests | Mutation: no unexplained survivors | Re-spawn Hardener |
| QA | Black-box UI/public interface from `qa.md`. Do not patch product code | Executable QA script + report | QA PASS on built candidate | Report back; director routes to Coder (not QA editing product) |

After QA: independent rerun of **all** gates on the candidate tree. Fail if any gate was weakened (coverage filters, mutation exclude, architecture allow-all, ignore-file cheating).

**CRAP formula (adaptation, not Bob’s words):** `CRAP(cc, cov) = cc² * (1 - cov)³ + cc` with `cov` in 0..1. Fail a function when score **> 8**. Do not ship &lt;4 for agents (Twitter Wumpus: 4 overdoes it, does not improve design).

**Mutation (adaptation):** TypeScript default StrykerJS when the workspace is TS. Equivalent mutants: fail-closed unless a committed waiver file exists; waivers are labeled adaptation. Target remains kill-all.

**TDD:** Coder prompt says write a failing test then production code. Do not fail the stage for finishing a function then testing it.

**Three streams:** unit tests in code, Gherkin, QA markdown/UI. A behavior change should need more than one stream. Mutation-lock unit + Gherkin.

## How a story enters DSH

The director is not optional model advice.

1. **Web:** human command `/story <text>` starts the FSM with no parent model turn (`ctx.commands`). Children are visible in the existing subagent UI.
2. **Headless / any adapter without commands:** the bundle’s plugin, on the first admitted user message of a session (or an explicit tool), starts the same FSM. Do not rely on the parent model remembering to call a tool.
3. A model-facing `uncle_bob_story` tool is allowed as a second entry so a normal parent can delegate; it must invoke the **same** TypeScript FSM.

Park or reject the parent model loop while the FSM owns the story (Ralph/subagent-control pattern).

## Skills

Ship short capability skills as a bundled skill directory (DSH `bundledSkillDir` or a badge-style provider). Reuse text from `/Users/lkc/.agents/skills/uncle-bob-agent-workflow/.worktrees/capability-skill-collection/skills/` where it matches. Skills are optional loaders for workers, not the control plane. Keep each skill short (Lost in the Middle).

## What this repo is

Out-of-tree **bundle** at `/Users/lkc/Code/uncle-bob-harness`:

- `package.json` with `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`
- Patch inserts the director plugin into a profile stacked on `web` (and a headless-capable composition for repeatable runs)
- Install: `pnpm dsh plugin --profile uncle-bob add /Users/lkc/Code/uncle-bob-harness` from the harness checkout
- Do not fork `packages/` inside deepseek-harness. Do not change `agent-loop`

## First demo story (what the human will type)

Against a tiny TypeScript fixture workspace shipped with this repo (`fixtures/fizzbuzz` or equivalent):

> Implement FizzBuzz for n=1..100. Multiples of 3 → Fizz, 5 → Buzz, both → FizzBuzz, else the number. Public function `fizzBuzz(n: number): string`.

The human watches five children and five gate reports. Headless runs the same fixture.

## Deferred

Junior apprenticeship, architecture viewer UI, packs, pairing, apprenticeship, bilingual docs beyond a short README, in-tree DSH PR.
