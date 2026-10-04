# Adversarial review — Uncle Bob assembly-line plugin v1

Date: 2026-08-24. Reviewer: Subagent E. Tests passing (64) are not taken as workflow fidelity.

Sources: `research/operating-principles.md`, `research/interview-core.md` §4, `research/twitter-year.md` Must-build / Do-not-build-yet, `docs/design.md`. Code: `src/`, `tests/`, `assets/skills/`, `fixtures/`, `package.json`, `cordis.patch.yml`, `README.md`.

Only issues with a file and a line of code. Passing unit tests that never exercise the production path are called out as such.

---

## Verdict

The director is a real TypeScript FSM over fresh `spawn` children. That part is faithful. Three host gates were not: CRAP never measured coverage, the Hardener could waive its own survivors, and the architecture checker went green if the rules file was emptied.

**Orchestrator 2026-08-24 follow-up:** C1, C2, C3, M1, M2 are fixed. `pnpm test` is 70 passing. Bundle layer `# == uncle-bob-harness` appears in `dsh --profile uncle-bob --dump-config` after `dsh plugin add`. Remaining majors (M3–M8) are deferred past the human demo unless they block FizzBuzz.

---

## Critical

### C1. CRAP gate never collects coverage

**File:** `src/gates/crap.ts` (`runCrapGate`)

```ts
const complexity = maps?.complexity ?? analyzeTsComplexity(input.cwd)
const coverage = maps?.coverage ?? new Map<string, number>()
```

The production call (`src/gates/index.ts` Cleaner and `src/gates/independent-rerun.ts`) never passes `maps`. `parseIstanbulCoverage` is dead on that path. There is no `NODE_V8_COVERAGE`, no `vitest --coverage`, no Istanbul JSON. Every function is scored at `cov = 0`.

`CRAP(cc, 0) = cc² + cc`. With cap 8:

| cc | score | gate |
|---|---|---|
| 1 | 2 | PASS |
| 2 | 6 | PASS |
| 3 | 12 | FAIL |

A typical FizzBuzz (`if %15 / %3 / %5`, cc≈4) scores 20 and cannot pass until the Cleaner splits it into cc≤2 functions. Coverage never enters the score, so adding tests does not help CRAP.

**Why it betrays:** CRAP is coverage × complexity (UB-06-20–22; design §8). Twitter 2026-08-06: run deterministic coverage/CC tools; do not skip them. Twitter 2026-08-21: ignoring coverage is “adolescent carelessness.” Twitter Wumpus: forcing tiny functions is the failure mode of overdone CRAP. Cap 8 with real `cov=1` would let cc=4 through (score 4); cap 8 with fake `cov=0` is a hidden CRAP-below-3 splitter.

**Tests:** `tests/gates/crap.spec.ts` only feeds synthetic maps / walks cc. It never calls `runCrapGate` without maps. The hole is invisible to the 64 passing tests.

**Fix:** In `runCrapGate` without `maps`, run the unit command with V8/Istanbul coverage (design §8), parse with `parseIstanbulCoverage`, join. Missing coverage for an executable function stays `cov=0` (fail closed). Add a keyless test: `fixtures/gates/crap-pass` with `cov=1` synthetic vs production empty-map, and a well-covered cc=4 function that must PASS only when coverage is actually loaded.

---

### C2. Hardener can write and then pass on its own mutation waivers

**Files:** `src/gates/mutation.ts` (`loadWaivers`, `classifySurvivors`); `src/config.ts` (`mutationWaiverPath: '.uncle-bob/mutation-waivers.json'`); `src/gates/tamper.ts` (protected surfaces omit the waiver file)

The host loads whatever JSON sits at `cwd/.uncle-bob/mutation-waivers.json` at gate time. Missing file → no waivers. The Hardener has a writeable workspace. Tamper fingerprints gitignore, vitest, stryker, architecture, cucumber — not the waiver file. Independent rerun calls the same `runMutationGate`, so a self-written waiver still PASSes as `ADAPTED`.

The Hardener prompt/skill say “you cannot approve your own waiver.” That is prompt-only control (UB-08).

**Why it betrays:** Interview §4: “The same Agent both creating a quality exception and approving it” must not be built. Design §6 Hardener: “Equivalent mutants require a committed waiver file the host reads; you cannot approve your own waiver.” Waivers are an adaptation; the target remains kill-all (UB-10-17–19).

**Tests:** `tests/gates/mutation.spec.ts` classifies a pre-baked waiver in-process. No test that a waiver appearing after story START is illegal.

**Fix:** Snapshot the waiver file at START. Honor only `(mutantId, reason, adaptation: true)` tuples present in that snapshot. New or edited waivers → unexplained survivors → FAIL. Fingerprint the waiver path in tamper. Optional: require the file to exist in git at START; a Hardener-created file is never committed.

---

### C3. Architecture checker is vacuously green if rules are deleted; tamper only looks for `["*"]`

**Files:** `src/gates/architecture.ts` (unmapped files skipped); `src/gates/tamper.ts` (`architectureAllowsAll`)

```ts
if (fromModule === undefined) continue
```

```ts
return loaded.modules.some(mod => mod.mayDependOn.includes('*'))
```

`{ "modules": [], "forbidCycles": true }` loads, maps nothing, reports PASS. Tamper only FAILs when a changed rules file contains `mayDependOn: ["*"]`. Empty `modules`, listing every module name, or `externalAllow: [""]` (`name.startsWith("")` is always true in `isAllowedExternal`) all disable the spec without matching the `*` heuristic.

**Why it betrays:** UB-11-14: every submission fails if it violates the spec. Forbidden: repair by deleting the rule. Lock independent-rerun: fail if architecture is allow-all. Design tamper table names `mayDependOn` widened to `["*"]` as the example, not the only weakening.

**Tests:** `tests/gates/architecture.spec.ts` has pass/fail/missing-file. No empty-modules, no `*`, no `externalAllow: [""]`. `tests/gates/tamper.spec.ts` covers coverage exclude and stryker ignore — not architecture.

**Fix:** Fingerprint `architecture.rules.json` at START. Any change that adds an edge, adds `*`, empties `modules`, drops `forbidCycles`, or widens `externalAllow` is `POST_RUN_TAMPERING`. Treat a file that matches no module as FAIL (unmapped product code), not skip. Test all three weakenings.

---

## Major

### M1. Child `status !== 'complete'` skips the host gate

**Files:** `src/fsm.ts` (`CHILD_SETTLED`); `src/spawn.ts` (`childStatusFromResult`)

`status: 'complete'` correctly runs the host gate (not treated as PASS). Any other child status (`blocked`, `failed`, `missing-structured`) goes to `retryOrBlock` and **does not** `runGate`.

Specifier that honestly writes `blockers.md` and reports `blocked` never hits the gherkin gate that would halt on open blockers. The director retries the Specifier until budget, then `"retry budget exhausted … child blocked"`. QA `failed` because the product is wrong is routed to Coder without a product-diff or QA command result.

**Why it betrays:** PASS is a tool result (UB-09-04/05; lock control plane). Design: “GATE still runs even if report.status === 'complete'.” The inverse is missing: the child’s sentence still decides whether the tool runs. Cousin of red-flag 4.

**Fix:** Always `runGate` after dispose, including `blocked`/`failed`/`missing-structured`. Use child status only as extra evidence in the gate JSON. Specifier `blockers.md` non-empty remains host BLOCKED.

---

### M2. Missing Specifier artifacts are BLOCKED (no retry)

**File:** `src/gates/gherkin-parse.ts`

Missing `acceptance.feature` or `qa.md` → `verdict: 'BLOCKED'`. FSM `GATE BLOCKED` halts immediately. A first Specifier that returns `complete` without writing files dies with no retry. Design table: missing/parse problems are FAIL → re-spawn Specifier; BLOCKED is unresolved product policy / missing tools.

**Fix:** Missing or empty artifacts → FAIL (retry). Keep BLOCKED for non-empty `blockers.md` and missing `@cucumber/gherkin`.

---

### M3. Every QA FAIL routes to Coder and does not restore last-green

**Files:** `src/fsm.ts` (`retryOrBlock` `routeToCoder: event.stage === 'qa'`); `src/gates/qa.ts`; `src/director.ts` (`restoreGreen` only on spin)

QA touching `src/` FAILs (good) then FSM spawns Coder on the already-patched tree. QA that only forgot `tests/qa` files also routes to Coder instead of retrying QA. `restoreGreen` is not a command on QA FAIL.

**Why it betrays:** QA must not own product-code fixes (UB-10-21; lock table). Routing to Coder is the adaptation for *behavior* failure, not for “QA did not do QA” or “QA already wrote the fix.”

**Fix:** Classify QA outcomes: `src/` diff → `restoreGreen` then FAIL-retry QA (or BLOCKED). Missing `tests/qa` / empty `qa-report.md` / illegal imports → retry QA. QA command non-zero with clean `src/` → route to Coder.

---

### M4. Specifier Gherkin / `qa.md` are not frozen after PASS

**Files:** artifact table in design vs no fingerprint in `src/gates/unit-acceptance.ts`, `src/gates/tamper.ts`

`copyAcceptanceFeature` copies whatever is currently at `{artifactDir}/acceptance.feature` into `tests/acceptance/` at Coder-gate time. Coder/Cleaner/Hardener can rewrite Specifier Gherkin to match the code. `qa.md` is likewise writable. Tamper does not fingerprint those artifacts.

**Why it betrays:** Three streams; tests harder to change than code (Twitter 2026-08-03/08/12). A behavior change should need more than one stream. Coder already owns unit tests; if Coder also owns Gherkin, two of three streams are one agent.

**Fix:** Hash `acceptance.feature` and `qa.md` at Specifier PASS. Later stages FAIL (`POST_RUN_TAMPERING`) if they change. Independent rerun re-checks.

---

### M5. Mutation does not lock Gherkin

**Files:** `fixtures/fizzbuzz/stryker.config.json` (`testRunner: vitest`); default `mutationCommand: ['npx', 'stryker', 'run']`; cucumber is a separate `acceptanceCommand`

Stryker’s vitest runner will not execute `acceptance.feature`. Mutation-lock is unit-only.

**Why it betrays:** Twitter: mutation-lock unit **and** Gherkin. Design restates it.

**Fix:** Point Stryker at a runner that includes cucumber (or run cucumber inside the mutator’s test command). Fail the mutation gate if acceptance files are excluded. Document the fixture wiring.

---

### M6. Diagnostic child can write the worktree after restore

**Files:** `src/fsm.ts` (spin → `restoreGreen` then `spawn diagnostic`); `src/spawn.ts` (same tools as writers); `src/prompts.ts` (`PERSONA_DIAGNOSTIC` / `USER_DIAGNOSTIC` say “do not edit”)

No tool deny for write; no post-diagnostic diff. Restore happens *before* the diagnostic spawn, so edits persist into the blocked halt.

**Why it betrays:** UB-07-04 / lock: stop, restore last green, shrink context. The restore is undone by an ungoverned writer. Prompt is not a control plane.

**Fix:** Deny write tools on diagnostic (`toolFilter.deny` plus a write allow-list of none), or snapshot after restore and FAIL-closed revert if the tree moved. Still halt blocked.

---

### M7. Fixture vitest include is `*.spec.ts`; prompts say `tests/`

**Files:** `fixtures/fizzbuzz/vitest.config.ts`; `src/prompts.ts` (`USER_CODER`, `USER_QA`); `src/config.ts` (`qaCommand: ['npx', 'vitest', 'run', 'tests/qa']`)

```ts
include: ['tests/**/*.spec.ts'],
```

Coder is told to put unit tests under `tests/`. QA is told to write `tests/qa/`. Models commonly emit `*.test.ts`. Those files will not match include. `vitest run tests/qa` still filters through include. Empty run → FAIL → M3 sends it to Coder.

**Why it betrays:** Not a Bob quote; it is “likely wrong in a real DSH session” on the shipped demo cwd.

**Fix:** `include: ['tests/**/*.{spec,test}.ts']` and/or tell Coder/QA the exact glob in the user prompt. Add a fixture smoke that a `tests/qa/*.test.ts` file is collected.

---

### M8. One-writer lock is per agent id, not per workspace cwd

**File:** `src/director.ts` (`sessionKey` = `String(agent.id)`; `stories` map)

Two parent sessions on `fixtures/fizzbuzz` can run two assembly lines on one worktree. Twitter 2026-08-21: parallel writers on one tree failed. Lock: no `parallel()` writers on one worktree.

**Fix:** Lock on resolved `cwd` (and optionally git worktree), not only `agent.id`. Second start on a busy cwd → BLOCKED.

---

### M9. Independent-rerun / production CRAP / waiver-tamper paths are untested

**Files:** no `tests/gates/independent-rerun.spec.ts`; `tests/gates/crap.spec.ts`; `tests/gates/mutation.spec.ts`; `tests/gates/tamper.spec.ts`

Story 8 in `docs/design.md` asked for independent rerun + tamper. Tamper covers two heuristics. There is no test that `runIndependentRerunGate` composes unit+crap+architecture+mutation+qa+tamper, no dropped-test FAIL, no waiver-after-START FAIL, no `runCrapGate` without synthetic maps.

**Why it betrays:** Red-flag 19. The 64 tests are real, but they do not fail-close the locks that matter.

**Fix:** Table-driven tamper (empty architecture, waiver create, dropped `tests/*.spec.ts`, coverage `include: []`). One `runCrapGate(fixture)` without `maps` that FAILs until coverage is collected (C1).

---

## Minor

### m1. Cleaner prompt re-encodes the CRAP formula

**File:** `src/prompts.ts` (`USER_CLEANER`)

Design §6 intro: “Do not encode CRAP formula, coverage math, or architecture graphs in prose.” The same section’s Cleaner template then prints the formula. Implementation copied the template. Skills stay short and say “the host computes CRAP.” Compounded by C1: the agent is taught `cc^2 * (1-cov)^3 + cc` while the host never supplies `cov`.

**Fix:** After C1, drop the formula from the prompt; point at `gates/latest.json` only.

### m2. QA illegal-import walk misses dynamic `import()`

**File:** `src/gates/qa.ts` (`qaIllegalImports` only `ImportDeclaration`)

Architecture gate *does* walk `import()`. QA can black-box-fail by `await import('../../src/impl.ts')`.

**Fix:** Same import walk as `architecture.ts`.

### m3. Coverage-exclude tamper is a 200-character regex

**File:** `src/gates/tamper.ts` (`coverageExcludesSrc`)

`include: []` / `include: ['lib']` / `vite.config.ts` are not FAIL. Only `vitest.config.ts` and `package.json` are fingerprinted.

**Fix:** Parse the actual vitest config; treat “src no longer in coverage include” as tamper.

### m4. `skills.get` falls back to the first skill

**File:** `src/skills-provider.ts`

Unknown candidate → `SKILLS[0]` (gherkin). A worker that asked for `mutation-gaps` could be fed Specifier text.

**Fix:** Throw if `candidate.name` is not in `SKILLS`.

---

## Nits

- `src/entry-first-message.ts` is a re-export of `park.ts`. Harmless.
- `director.renderReport` appends the ADAPTED waiver sentence whenever Hardener PASSed, even with zero waivers. The “if any” wording saves it from lying.
- `peerDependenciesMeta` marks every DSH peer optional; load still fails without them. Install noise only.

---

## What is faithful

- **Director is TypeScript, not a parent procedure.** `/story`, first-message hold, and `uncle_bob_story` all call `Director.start`. Headless does not wait for the parent to remember a tool (`startOnFirstUserMessage: true`, `createPreStepHandler` holds the waterfall, empty-enter / reject, stderr pulse).
- **Fresh children.** `requireFreshProvider` rejects `inheritsParentContext`. `start` + `dispose()` in `finally`. No `startContinuable`. No five `dsh-agent-presets`. Personas are per-spawn strings.
- **Child `complete` is not PASS.** Host gates run on complete; unit/acceptance/gherkin/architecture/QA-src-diff/mutation-survivors exist as code.
- **One sequential line.** No packs, no `parallel()`, no squad, no agent-edited prompts. `childToolDeny` includes `subagent`, `ralph`, `workflow`, `uncle_bob_story`.
- **CRAP cap 8, not &lt;4.** Formula labeled adaptation in gate JSON. Not attributed to Bob in README.
- **Specifier must not implement / QA must not patch `src/`** — gates exist and are unit-tested (they fail to *restore* and *retry* correctly; see M2/M3).
- **Park waterfall.** `next()` when not intercepting; subagent children (`origin === 'subagent'` / `parentSession`) are skipped so writers can run. Hold-without-`next` on first-message is the locked headless park.
- **No custom `SessionEventMap`.** Progress lives in `.uncle-bob/story-*/`. DSH resume is not poisoned.
- **Skills are short and not the control plane.** Six files, each ≤40 lines, `userInvocable: false`. No 5–10 page TDD/Clean Code essay.
- **FizzBuzz fixture is a stub.** `src/index.ts` throws `not implemented`. Cucumber steps are scaffolding only.
- **Bundle shape.** Out-of-tree `dsh.bundle.patch`, insert-only `cordis.patch.yml`, no `packages/` fork, no `agent-loop` change.

---

## Red-flag scorecard (20)

| # | Flag | Result |
|---|---|---|
| 1 | Parent LLM is the director | **Clear** — FSM + first-message / `/story` |
| 2 | Immortal personas / inherited chat | **Clear** |
| 3 | Long prompts / skills re-encoding TDD as prose | **Clear** (skills); Cleaner formula is m1 |
| 4 | Child `status: complete` treated as PASS | **Partial** — complete runs gates; non-complete skips them (M1) |
| 5 | Model computes coverage/CRAP/mutation | **Clear** as a prompt; host simply **does not run coverage** (C1) |
| 6 | Parallel writers on one worktree | **Partial** — no `parallel()`; lock is per agent not cwd (M8) |
| 7 | Agent edits another agent’s prompt | **Clear** |
| 8 | CRAP&lt;4 shipped; formula attributed to Bob | **Clear** as written; C1 *behaves* like overdone CRAP |
| 9 | Gate softening | **Hit** — C1, C2, C3 |
| 10 | Same agent creates and approves a mutation waiver | **Hit** — C2 |
| 11 | QA patching `src/` | **Partial** — detected, not reverted (M3) |
| 12 | Specifier implementing `src/` | **Partial** — cannot PASS with src dirty; missing files BLOCKED (M2) |
| 13 | Custom SessionEventMap | **Clear** |
| 14 | Five immortal presets | **Clear** |
| 15 | Packs / squad parallel writers | **Clear** |
| 16 | `agent/pre-step` drops `next()` when it should call it | **Clear** |
| 17 | Headless depends on parent remembering a procedure | **Clear** if pre-step claimed text is `type: 'text'` |
| 18 | Skills &gt; ~40 lines / user-invocable control essays | **Clear** |
| 19 | Tests only happy-path | **Hit** — 64 tests miss C1–C3 production paths (M9) |
| 20 | Fixture already contains FizzBuzz | **Clear** |

---

## Counts

| Severity | Count |
|---|---|
| critical | 3 |
| major | 9 |
| minor | 4 |
| nit | 3 |
