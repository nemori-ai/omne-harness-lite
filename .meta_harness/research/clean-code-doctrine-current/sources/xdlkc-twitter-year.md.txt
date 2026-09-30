# Uncle Bob / Twitter, last year — refinements to the interview

Pulled dump: `research/twitter-raw.md` (2026-08-24). Account @unclebobmartin. Window 2025-08-24 → 2026-08-24. **Not exhaustive.** Every claim below is **Twitter** unless labeled **Uncle Bob / Interview** (coverage IDs) or **Implementation adaptation**.

Optional GitHub (not tweets): [swarm-forge](https://github.com/unclebob/swarm-forge) README (main, 2026-08-23); [squad branch](https://github.com/unclebob/swarm-forge/tree/squad); [negative-test-experiment](https://github.com/unclebob/negative-test-experiment) (Hunt the Wumpus, 8 independent writes).

This file **refines** the interview skill. It does not replace it.

---

## 1. What Twitter adds

These are load-bearing for a coding harness and were not said in the interview, or were said only as a later, different claim.

**Assembly line vs parallel writers.** **Twitter** 2026-08-21: one agent is faster; two is faster still; six in an *assembly line* worked; six *running in parallel* did not. Breaking a problem into independent stories implemented by a non-collaborating squad “does not end well.” Failure modes: agents “don’t know enough about what each other is doing,” so they “create inappropriate interfaces, double up on functionality, create independent test access,” then “the horrible cascade of merges.” Subagents “work ok,” but a group of subagents tends to “leave all the writing to one, while the others are readers.” A squad of many writers assembling N stories in parallel is a *different* problem. “If only we could get the agents to pair…”

**No honking; artifacts and narrow interfaces, not discussion.** **Twitter** 2026-08-21: he *has* fast, reliable agent-to-agent messages; that is “not the issue.” Collaboration needs discussion and compromise; he does not want “a gaggle of agents honking at each other like a flock of geese.” 2026-08-23: he does not want “a lot of chatter”; he fears the “fixed point” problem and token burn. Preference: “focussed work units that are independent of each other and who build components the communicate through a narrow focussed interface.”

**Prompt-fixing is off-limits.** **Twitter** 2026-08-21: “having one agent fix another agent's prompt is spooky.”

**Executable FSM, not a prompted procedure.** **Twitter** 2026-08-06: do not tell an agent to follow a procedure or a long if/else chain; “It will lose track of them.” Direct actions with an “executable finite state machine.” 2026-08-04: squad roles (analysts, reviewers, gherkin authors, QA authors, implementers, cleaners, code reviewers, hardeners, QA testers, architects, senior implementers) on a *fixed* workflow from themes → stories → gherkin/QA → code/unit/acceptance → cleaned → hardened → QA’d → architecture, “described by a static FSM.” Agents built the FSM, a simulator, jittered delays/failures, monte-carlo. “The agents never would have thought of that kind of testing regime.” 2026-08-19: he then *scrapped* a “highly elaborate” squad scheme as “unworkable” for a simpler one.

**Never ask the agent to calculate quality.** **Twitter** 2026-08-06: do not tell an agent to calculate coverage or cyclomatic complexity; run deterministic tools. Do not tell agents to mutate code and check survivors; run a deterministic mutator.

**Three test streams as an honesty lock.** **Twitter** 2026-08-03/08/12: unit tests (code), Gherkin acceptance, QA procedures (markdown, UI). Mutation-lock the first two “to tightly lock them into the existing code.” Make tests harder to change than code. To deviate, the agent would have to modify more than one source. Without unit tests: too many regressions. Without acceptance: agents lose UI vs business-rules separation. Without QA: software that works at the API but not at the UI. 2026-08-12: “Let the agents write them. You spot check them.”

**CRAP can be overdone; mutation is not a better Wumpus.** **Twitter** 2026-08-17/18 (Wumpus, eight writes from empty; four testing disciplines × CRAP-below-4 on/off; same 25 acceptance cases): “TDD and bundling have a positive effect on the structure of the code.” “CRAP analysis can be overdone (eg 4).” CRAP split functions, added tests, raised coverage, made programs harder to read, “did not improve design.” Mutation wrote a second suite aimed at operators, “not a different Wumpus.” Acceptance never distinguished any of this. 2026-08-17: TDD tests are intentional/“positive”; mutation tests are reactions to gaps/“negative.” Question: is a wholly negative suite an advantage? 2026-08-18 takeaway: the tests from mutation were “not significantly different to justify the premise that negative tests are superior to intentional positive tests.” 2026-08-16: Justin’s idea — TDD a module, *delete all tests*, then mutate until mutants die — is an experiment, not a concluded method. 2026-08-21 still: “CRAP and MUTATE usually improve the tests considerably” (tests, not design).

**Swarm-forge is a template.** **Twitter** 2026-08-23: “Don't look at swarm-forge as a drop-in product that you can use. Look at it (and the many other harnesses out there) as templates that you can customize… tuned to you, not to me.” 2026-08-12: squad branch “still in progress, but early results are promising.” GitHub README (not Twitter): runnable topologies live on `two-pack` / `four-pack` / `six-pack`; `main` is documentary; fork via archive, not consume as a product.

**Packs + supervisor are later than the interview.** **Twitter** 2026-08-22: six-packs “do a pretty good job”; a squad might be packs on independent issues plus a supervisor that “designs the interfaces between them, integrates, and runs integration tests. Hmmm.” 2026-08-23: squad leader divides the project, assigns packs, designs interfaces; “The trick is going to be keeping those interfaces narrow and focussed so that the packs do not step on each other.” This is *after* the interview assembly line and *after* the 2026-08-19 scrap of the elaborate squad. GitHub squad.conf (not Twitter): persistent squad-leader + short-lived workers from role-templates, concurrent caps (e.g. 3 implementers, singleton hardener/QA/architect).

**Sprint size.** **Twitter** 2026-08-08: an Agile project that uses AI “will have to shrink their Sprint size to one day (or less)” to keep the feedback cycle meaningful.

**Prompt cannot produce good code.** **Twitter** 2026-08-10: “I wish it were possible to prompt good code -- but that's not the way the models work.”

**Coverage as default, not luxury.** **Twitter** 2026-08-21: before AI, high meaningful coverage was too laborious for most projects. AI “trivializes the labor.” The question is no longer relative necessity; “it's tantamount to adolescent carelessness to ignore it.”

**Human disengagement, then hawk.** **Twitter** 2026-04-14: do not review agent code; measure coverage, dependency structure, CC, module sizes, mutation; “Humans are slow at code. To get productivity we humans need to disengage from code and manage from a higher level.” 2026-07-23: “not read any of the code” is how he takes advantage of productivity; surround agents with “extreme constraints.” 2026-08-17: not classic line-by-line; spot-check; mostly review tool output (quality, coverage, conformance). 2026-08-18: “Testing is not sufficient. You need to remain situationally aware… watching the process and probing the artifacts… spot check some of the code and look carefully at the architecture using appropriate visualization tools. In short, I watch it like a hawk.” 2026-08-19: “a lot of hard, focussed work” even though he “barely look[s] at the code.”

**2025 human-pilot TDD vs later disengagement.** **Twitter** 2025-06-25: AI is “moderately helpful with TDD”; TDD is “double entry bookkeeping”; “The human must be the pilot of both sides. Tests must not be derived from code, and code must not be derived from tests.” By 2026-04 he is disengaging from the code itself.

**Functions not as small for agents.** **Twitter** 2026-08-12: useful rules include intense coverage, three strands of tests, “Small well named functions (although not as small for agents as for humans.),” well partitioned modules, dependency structure, human spot checks.

**Research use of agents.** **Twitter** 2026-08-21: every started agent is in an equivalent state, so they can compare approaches “without the vagaries of human variability and human memory.”

---

## 2. What Twitter confirms

Interview pipeline and gates still hold; Twitter restates them in production language.

| Interview (do not re-extract) | Twitter restatement |
|---|---|
| Short-lived single-purpose agents; one User Story; sequential Specifier → Coder → Cleaner → Hardener → QA (**UB-10-05…21**) | 2026-08-21: six in an *assembly line* worked. 2026-08-04: fixed workflow, static FSM. |
| Compress the prompt; put rules in deterministic tools; Lost in the Middle (**UB-08-11…15**) | 2026-08-06: tools not prompted calculation; FSM not if/else. 2026-08-10: you cannot prompt good code. |
| Mess compounds; agents spin on a ball of mud (**UB-07-02…07**) | 2026-08-12: ball of mud → “spin and thrash”; clean partitioned project → “changes all day long.” |
| CRAP + mutation as the 2000s tools that agents can finally afford (**UB-06-20…54**) | 2026-02-26: mutation is “just one more Claude agent working down a list.” 2026-03-13: Crap below 8, high-90s coverage, split files with >50 mutation sites. |
| Do not require line-by-line human TDD of agents; keep quality values (**UB-13-09…15**) | 2026-07-30: “TDD is a human discipline. I don't expect agents to follow it” because they have “better and bigger short term memories.” Enforce via coverage, CRAP, mutation. |
| Architecture as executable policy; viewer + dependency rules (**UB-11-07…15**) | 2026-08-11/17/18: CRAP, MUTATE, DRY, architecture visualization, tool output constrain agents. |
| One story, inspect architecture, refactor, feedback (**UB-14-14…17**) | 2026-08-08: sprint ≤ one day. 2025-07-17: plan *and* react; “If you don’t plan, you die. If you don’t react, you die.” |
| Do not line-review; outer verification (**UB-06-56…60**) | 2026-04-14 / 2026-07-24: tools enforce cleanliness so he does not review the code. |
| Parallelize only independent work; do not multi-write one worktree (skill, from **UB-10-02…03**) | 2026-08-21: parallel *writers* fail; assembly line is the working topology. |

---

## 3. Tensions / chronology

| Date | Claim | vs interview |
|---|---|---|
| 2025-06-25 | **Twitter:** human must pilot both sides of TDD (double-entry); tests ↛ code and code ↛ tests. | **Interview UB-13-10…12:** do not impose human TDD choreography on agents; a whole function then tests is allowed. Earlier Twitter is *more* human-in-the-loop than the interview. |
| 2026-03-13 | **Twitter:** campaign “kept Crap below 8”; high-90s coverage; split files with >50 mutation sites. | **Interview UB-13-04…06:** human CRAP <4; agent 6; *considering* 8. March campaign treats 8 as the operating cap. |
| 2026-04-14 | **Twitter:** do not review agent code; disengage; manage from metrics. | **Interview UB-06-56…60:** same direction — environment so he need not review. Not a contradiction yet. |
| 2026-07-23/24 | **Twitter:** “not read any of the code”; extreme constraints. | Same as April; productivity argument is explicit. |
| 2026-07-30 | **Twitter:** “I don't expect agents to follow [tight TDD]”; they have bigger short-term memory. | **Confirms interview UB-13-09…14.** |
| 2026-08-03/08/12 | **Twitter:** three streams; mutation-lock unit+Gherkin; “write failing tests first… They do this tolerably well -- just like people.” | **Tension with 2026-07-30 and interview:** he still *tells* them failing-tests-first, and reports they do it “tolerably,” while also saying not to expect the tight loop. Do not flatten this. **Implementation adaptation:** ask for red tests first as a role instruction; do not police keystroke order; lock quality with gates. |
| 2026-08-04 | **Twitter:** elaborate squad FSM, simulator, monte-carlo. | Interview pipeline is five sequential roles, not this role zoo. Later scrapped (08-19). |
| 2026-08-06 | **Twitter:** executable FSM; never prompt the metric. | Refines interview tools: the *director* of stages should be executable, not a long prompt. |
| 2026-08-08 | **Twitter:** AI Agile sprint ≤ one day. | Interview: one User Story, no six-month plan. Twitter names a calendar bound. |
| 2026-08-10 | **Twitter:** cannot prompt good code. | Stronger than Lost in the Middle (**UB-08**): not just long prompts fail; prompting quality itself is the wrong mechanism. |
| 2026-08-12 | **Twitter:** squad branch promising; functions “not as small for agents as for humans.” | **Confirms interview UB-13-02…05** (agents hold more complexity). CRAP-for-agents looser than for humans. |
| 2026-08-16–18 | **Twitter + experiment repo:** CRAP-below-4 overdone; CRAP did not improve design; negative mutation suite ≠ better product; Justin delete-then-mutate is an idea. | **Interview UB-13-04** still cites human <4. Wumpus says forcing 4 wrecks cleanliness. **Interview UB-10-17…19** still wants mutants dead. Wumpus says mutation improves *operator tests*, not design or a different Wumpus. Keep both: mutation as a *test-gap* tool, not a design tool, and do not ship CRAP<4 as a v1 gate. |
| 2026-08-17 vs 06-56 | **Twitter:** “watch it like a hawk” (process, artifacts, architecture viz, some code). | **Interview UB-06-56** and **Twitter** April/July: do not review code. Same person, two postures. Resolve as: no line-by-line *code* review; yes hawk on *process, tools, architecture, spot-checks*. |
| 2026-08-19 | **Twitter:** elaborate squad unworkable; scrap for simpler. Hard focussed work; barely looks at code. | Do not treat 08-04 FSM zoo as current. |
| 2026-08-21 | **Twitter:** assembly line of ~6 works; parallel writers fail; subagent readers vs many-writers unsolved; honking/fixed-point; prompt-fixing spooky; high coverage now “adolescent carelessness” to ignore; CRAP+MUTATE usually improve *tests*. | Interview never ran the parallel-writers experiment. Coverage claim is new moral weight, not a new tool. |
| 2026-08-22/23 | **Twitter:** six/4/2-packs as workers; supervisor designs interfaces, integrates, runs integration tests. Swarm-forge is a template. | **Later than the interview.** Packs are a *hypothesis* (“Hmmm,” “current plan,” “the trick is going to be”). **Implementation adaptation:** v1 implements the interview assembly line (one story, sequential roles, gates). Packs/squad-of-packs are v2+ *if* Bob’s own simpler scheme stabilizes. |

---

## 4. Do-not-build-yet

Ideas Bob is still experimenting with, just scrapped, or explicitly failed a trial. Building them into v1 would freeze an unsolved problem.

1. **Squad of parallel writers** on N stories. **Twitter** 2026-08-21: “very bad results.” Merges, duplicate interfaces, independent test access. Subagents that all write are not the same as subagents that read. Unsolved: pairing.
2. **Six-packs / 4-packs / 2-packs as the product topology, plus a supervisor that designs interfaces and runs integration tests.** **Twitter** 2026-08-22/23 is “current plan” / “Hmmm,” days after scrapping an elaborate squad (08-19). GitHub pack branches exist; they are templates, not a concluded product. **Implementation adaptation:** do not implement packs in v1.
3. **One agent fixing another agent’s prompt.** **Twitter** 2026-08-21: “spooky.” Keep prompts human-owned and short.
4. **Delete-all-tests-then-mutate** (Justin, **Twitter** 2026-08-16). Experiment, no result in the dump.
5. **Negative-test superiority** as a design rule. **Twitter** 2026-08-18: Wumpus did not justify it. Mutation still belongs as a *gap* tool, not as a replacement for intentional tests.
6. **CRAP-below-4 as a hard agent gate.** **Twitter** 2026-08-18: “can be overdone (eg 4)”; did not improve design; hurt readability. Conflicts with shipping interview human<4 onto agents.
7. **Elaborate squad FSM with simulator / monte-carlo / large role zoo.** **Twitter** 2026-08-04 built it; 2026-08-19 scrapped it. A *small* executable director of the assembly line is in Must-build; the zoo is not.
8. **Agent–agent chatter as collaboration.** He has the channel (**Twitter** 2026-08-21) and refuses to use it for discussion. GitHub handoffs are typed artifacts (`git_handoff` / short `note`), not debate.
9. **Drop-in consumption of swarm-forge.** **Twitter** 2026-08-23: fork and retune; do not use as a product.

---

## 5. Must-build-now

Stable enough for plugin v1. These refine the interview; they do not replace it.

1. **Sequential assembly line for one story.** Specifier (Gherkin + QA steps) → Coder (unit tests + code until Gherkin passes) → Cleaner (CRAP/DRY/static) → Hardener (mutation) → QA (executable UI/interface). Fresh, narrow, short-lived role per stage. Destroy after handoff. **Twitter** 2026-08-21: this is the topology that worked. **Interview UB-10** is the role list.
2. **Executable director, tiny prompts.** A real state machine (or equivalent) advances stages on *command PASS*, not on the agent’s “done.” Do not prompt a long if/else. **Twitter** 2026-08-06. Keep role prompts to role, story, artifacts, exact gate commands, file boundary.
3. **Handoff by artifacts and narrow interfaces.** Commits, reports, Gherkin, QA markdown, gate output. No inherited chat, no honking, no prompt-editing between agents.
4. **Deterministic tools the agent *runs*, never *computes*.** Coverage, CRAP, mutation, DRY, dependency/architecture check. **Twitter** 2026-08-06/11. Independent full-gate rerun on the candidate commit (interview integration checkpoint).
5. **Three test streams, tests harder to change than code.** Unit in code, Gherkin, QA in markdown/UI. Mutation-lock unit + Gherkin. A behavior change should require touching more than one stream. **Twitter** 2026-08-03/08/12.
6. **CRAP cap in the interview’s agent band, not 4.** **Implementation adaptation:** v1 gate near **6–8**, matching **UB-13-05/06** and the 2026-03 “Crap below 8” campaign. Do not ship <4. Treat CRAP as a *complexity/coverage* pressure, not a design improver (**Twitter** 2026-08-18).
7. **Mutation as test-gap pressure, target no survivors**, with equivalent-mutant policy labeled as adaptation (**UB-10-17…19**). Do not expect mutation to invent a better product (**Twitter** Wumpus).
8. **High meaningful coverage is the default.** Ignoring it is, in his 2026-08-21 phrase, “adolescent carelessness.” Combine coverage with mutation; coverage alone is not the lock.
9. **Partitioned modules and executable dependency rules.** Ball of mud → spin. Clean modules → agents keep working. Architecture viewer + fail-on-illegal-dependency (**UB-11**, **Twitter** 2026-08-12). Functions well named; not as small as for humans.
10. **Human: hawk on process, not lines.** Spot-check code; watch the FSM; read tool output; inspect architecture. No classic line-by-line review. Story/sprint size: **one day or less**.
11. **TDD instruction without TDD police.** Tell the coder “failing tests first, then production code” (**Twitter** 2026-08-12); do not fail the run for writing a whole function then tests (**Interview UB-13-11/12**, **Twitter** 2026-07-30). Quality is the gates.
12. **Treat swarm-forge as a template to steal patterns from**, not a dependency.

**v1 vs later split (explicit).** v1 = interview assembly line + Twitter’s anti-chatter, anti-parallel-writers, three-stream lock, executable director, CRAP~8, hawk-on-process. Later (only if still wanted after Bob’s simpler scheme settles) = packs as workers, squad leader as interface designer/integrator, maybe bounded parallel *packs* on *narrow* interfaces — never N writers on one story.

---

## 6. Coverage note

The dump is a curated year window, not a complete @unclebobmartin archive. Gaps:

- **Missing months:** almost nothing 2025-08 → 2026-01; nothing 2026-05–06; 2026-02 and 2026-04 are single posts. Replies, quote-tweets, and full threads are mostly absent.
- **No live fetch.** This file does not claim tweets beyond `twitter-raw.md`.
- **Interview date** is not pinned against the tweet timeline; treat 2026-07–08 Twitter as *after* the interview’s TDD/CRAP discussion unless proven otherwise.
- **Wumpus** is one small game, eight runs; do not generalize “CRAP never helps design” past that trial, but do not ignore it when choosing a v1 threshold.
- **swarm-forge** README/branches move independently of tweets; pack cockpit and squad.conf may have changed after 2026-08-23.
- **Not extracted here (out of harness scope):** YAGNI vs hammock (2025-07-17), bankrbot warning on the README, backend CLI names in squad.conf.
- **Not in the dump:** whether the 2026-08-19 “simpler scheme” *is* the 08-22 packs plan, or a third thing; whether pairing was ever tried; results of Justin’s delete-then-mutate idea.
