---
name: write-agents-md
description: >
  Authoring and governance guidance for AGENTS.md files. Use when creating,
  revising, compressing, reviewing, or relocating an AGENTS.md; designing
  inherited prompt scopes; deciding whether content belongs in AGENTS.md versus
  a design doc, ADR, skill, developer guide, script, or CI gate; or reconciling
  overlap and contradictions between parent and child AGENTS.md files.
---

# Write AGENTS.md

Treat an `AGENTS.md` as persistent cognitive infrastructure, not a convenient
place for every useful rule. Give the agent the project's mind, map, taste,
hard boundaries, and routes to deeper knowledge. Assume a frontier model
already knows ordinary engineering technique.

## The Content Model

Keep three layers distinct:

- **Keep the way (`道`) resident**: project-specific mental models, maps,
  decision taste, and a few non-negotiable boundaries.
- **Load the rule (`法`) on demand**: domain contracts, local conventions,
  governance mechanisms, and task-specific constraints.
- **Externalize technique (`术`)**: generic best practice, commands, procedures,
  templates, field catalogs, checklists, and tool usage belong in skills,
  developer docs, scripts, or CI.

Admit a paragraph only when it has one of five jobs:

| Job | What it gives the agent | Authority relationship |
|---|---|---|
| **Mental model** | A durable way to see the system | Short projection of philosophy or architecture |
| **Map** | Where concepts, ownership, code, or knowledge live | Minimal projection of the current topology |
| **Taste** | A preferred direction when several designs could work | Traceable to design taste, an effective ADR, or stable design |
| **Red line** | A hard stop against a costly, cross-boundary error | Traceable to a normative owner |
| **Trigger** | When and where to load more specific knowledge | Owned by the prompt as navigation; never copies the target's body |

Move a paragraph out when it does not fit one of these jobs. Usefulness alone
does not justify permanent prompt cost.

## Decide What Deserves Residency

Keep content resident only when it is mostly:

- specific to this project and not reliably inferable from industry knowledge;
- relevant across multiple likely tasks beneath this directory;
- consequential to boundaries, ownership, safety, or long-term evolvability;
- difficult to enforce completely through code, types, tests, lint, or CI;
- stable enough to express in one or two memorable sentences.

Default these elsewhere:

| Content | Better home |
|---|---|
| Domain meaning, exact fields, invariants, current architecture | The owning design/spec/contract |
| Why a consequential decision was made | ADR |
| Reusable task procedure or judgment method | Skill |
| Commands and contributor mechanics | Developer guide or command help |
| Deterministic naming/import/generated-file checks | Script, lint, or CI |
| Templates and field-complete protocols | Template/reference owned by the mechanism |
| Counts, progress, dates, inventories | Generated/queryable status |
| Temporary plans and campaign state | The project's scratch-plan location |

Do not teach DDD, OOP, TDD, Python, REST, or other mature-model basics unless
the project deliberately deviates from the common meaning.

## Preserve Authority

Treat `AGENTS.md` as the owner of agent entry, orientation, navigation, and
escalation. Do not let it become the owner of business semantics.

- Link each taste and red line to one current normative source.
- Change the owner first and its prompt projection second.
- Let a child prompt refine local consequences; never let it reverse a parent
  mental model or red line.
- Apply path specificity only to working guidance. It does not make a nearer
  prompt authoritative over a business claim.
- If two normative sources conflict, stop prompt authoring and reconcile them.
  Never hide an unresolved project decision inside prompt wording.
- State when a sentence is a map or shorthand projection so readers do not
  mistake it for the full SSOT.

Use this derivation shape:

```text
normative owner
    └── short AGENTS projection
            └── narrower local refinement
```

## Design the Inheritance Chain

Before writing, identify every parent `AGENTS.md` inherited at the target path.
Judge the active chain as one prompt, not as isolated files.

- Put a principle at the highest scope where it is both true and useful.
- Put local topology and local red lines at the narrowest common parent that
  covers their consumers.
- Do not repeat a parent's rule to show importance. Translate only the local
  consequence, or link back.
- Let each level answer a different question:
  - root: What are we building, how do we see it, and what must never break?
  - area: How does this area embody the architecture, and where are its owners?
  - leaf: What is locally surprising, constrained, or easy to get wrong?
- Route a normal task to its owner in at most two navigation hops when practical.
- Say what can remain unread. Progressive disclosure needs a stopping rule, not
  only more links.

Do not use a universal line limit. Set a budget proportional to how often and
how broadly the file is inherited; roots need the strictest budget. When a
chain feels long, remove duplicated technique before compressing useful
mental models into cryptic prose.

## Author or Revise

1. **Read the inheritance chain and local owners.** Inspect parent prompts,
   current target content, child prompts affected by the change, and the
   normative sources behind every proposed taste or red line.
2. **Inventory before deleting.** Classify each existing section as resident
   mind/map/taste/red-line/trigger, on-demand rule, externalizable technique,
   generated status, or obsolete duplication.
3. **Resolve ownership gaps first.** If an operational table in `AGENTS.md` is
   the only surviving definition, move it to a proper owner or gate before
   removing it. Compression must not silently erase policy.
4. **Write the role sentence first.** State in one sentence what cognitive value
   this prompt adds beyond its parent. Reject sections that do not support it.
5. **Write maps and taste before routes.** Give enough orientation for the agent
   to choose the right route; a link table without a mental model is a search
   index, not a prompt.
6. **Make red lines sparse and memorable.** Keep only project-specific,
   high-blast-radius prohibitions. Link the why instead of reproducing it.
7. **Write decision triggers, not workflows.** Use “when deciding X, read Y
   because it owns Z.” Move execution steps to a skill or developer guide.
8. **Update the whole chain atomically.** Add a new child entry before removing
   the parent content it replaces. Repair inbound section references and child
   statements that cite the old layout.

Prefer plain, image-forming language. A good shorthand such as “blueprint is
the script, runtime is the performance” can preserve a boundary more
effectively than a dense responsibility table, provided it links to the owner
and does not distort it.

## Validate

Require all of the following.

### Cognitive Value

- The file's role is expressible in one sentence.
- Every paragraph passes the five-job admission gate.
- A representative agent can restate the correct mental model and decision
  direction without reading every linked document.
- Taste guides ambiguous choices without pretending to be an absolute rule.
- Red lines are few, hard, project-specific, and memorable.

### Authority Integrity

- Every taste and red line traces to a current owner.
- No sentence creates a second business SSOT.
- Parent and child prompts refine rather than contradict one another.
- Unresolved owner conflicts are surfaced, not papered over.
- Projections, evidence, tracking, and history do not masquerade as owners.

### Progressive Disclosure

- A representative task reaches its normative owner in at most two hops when
  practical.
- Unrelated procedures and catalogs stay unloaded.
- The prompt says when deeper reading is needed and when it can stop.
- The inherited prompt chain contains no material duplication.

### Maintenance Quality

- No manually maintained counts, completion snapshots, or dated inventory.
- No generic best-practice tutorial, command catalog, or long checklist.
- Mechanically enforceable rules point to automation instead of duplicating it.
- All relative links resolve.
- Inbound references to removed headings are updated.
- Every removed hard rule has a confirmed new owner or gate.

Use realistic task probes, not only prose review. Include at least:

- one ordinary local change that should remain lightweight;
- one boundary-changing task that must trigger deeper design;
- one apparent document/implementation conflict;
- one temptation to bypass a package or service boundary.

For each probe, verify the mental model expressed, owner reached, irrelevant
context avoided, and stopping point.

## Report the Result

Summarize:

- the role of each changed `AGENTS.md`;
- what stayed resident and why;
- what moved to owners, skills, docs, scripts, or CI;
- any unresolved source contradiction or ownership gap;
- the inherited-chain size and task-probe results.

Do not claim success from line-count reduction alone. The outcome is better
judgment at lower recurring context cost.
