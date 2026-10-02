# Why one writer in one worktree

**Read when:** someone asks for a HUB with spokes, a worktree per agent, or several
writers at once, and you need the reasons with their dates and sources.
**Return when:** you can state why not, how strong the evidence is, and what to do instead.

Quote these with their dates. The positions below moved during 2026; an undated quote
will be wrong by the time it is read.

## The owner's rule

The repository owner decided on 2026-10-01 that implementation proceeds one card at a
time with a single writer per member, each unit integrated before the next, and that
long-lived integration branches are not kept. On 2026-10-02 the owner removed the
HUB-and-spoke mode from this skill altogether and asked that requests for it be declined
with reasons. That decision is the authority here; the material below is why it was made.

## What this repository observed (2026-10-02)

A session was asked to have a dispatched agent do a small task in a spoke worktree.

- The dispatched agent could not move into the spoke: the host starts a dispatched
  agent in the dispatching session's directory and refused to enter a worktree outside
  the host's own container.
- The repository's stop hook measures the checkout the session stands in. It did not
  see the change written into the spoke, so the agent got no reading on a function that
  was over the line. It noticed only because it chose to run the metrics by hand.
- In the same test, the session that worked from inside its single worktree was stopped
  once by the hook with the reading and accounted for it.

Earlier the same day, a session that stayed in the main checkout and wrote into a
worktree by path got no reading either. The feedback loop reaches a writer only when
the session stands in the tree it writes.

## What Robert C. Martin reported (dated, first-hand)

| Date | What he said | Source |
|---|---|---|
| 2026-08-21 | "Breaking a problem up into a bunch of independent stories that are implemented separately by a squad of agents that do not collaborate, does not end well." | https://x.com/unclebobmartin/status/2090814740276642173 |
| 2026-08-21 | "I've had good luck with six arranged in an assembly line. I've had very bad results with six running in parallel." | https://x.com/unclebobmartin/status/2090845662698987654 |
| 2026-09-12 | A task one agent finished in about 40 minutes took his multi-agent harness three or four hours, with a worse result: "apparently the harness is doing the damage. That's not what I expected." | https://x.com/unclebobmartin/status/2098744156709441896 |
| 2026-09-30 | "I'm using just one agent by the way" | https://x.com/unclebobmartin/status/2105262791217299790 |

What he did not take back: one story at a time; hand-offs through commits and structured
artifacts rather than chat; parallel writers "double up on functionality" and end in
"the horrible cascade of merges".

## How strong this is

- These are field reports from one practitioner and one day of this repository's own
  tests. Nobody here ran a controlled comparison of sequential against parallel writers
  on the same tasks.
- His position changed several times in 2026 — three agents in January, a six-role
  pipeline by June, an eleven-worker squad in August, a single agent from September —
  and on 2026-09-18 he called it "a work in progress".
- In August the sequential six-agent pipeline still worked for him; what failed was
  running writers in parallel. In September he dropped the pipeline as well.
- His setting is one person building small new projects. This repository is a
  multi-member monorepo with accepted contracts.
- Worktrees were not his criterion: his pipeline gave each agent its own worktree. The
  criterion is parallel writers. "One session, one worktree" is this repository's way of
  making a single writer and a reachable feedback loop the default.
- This repository deliberately differs from him in one respect: he stopped using
  reviewing agents too, while the owner keeps independent review and an acceptance gate.

In a declared `.meta_harness` workspace the dated research behind this table is the
topic `research/clean-code-doctrine-current`; read it there rather than quoting from
memory.

## What to offer instead

- Put the requested units in an order; deliver one, integrate it, start the next.
- Dispatch write work into the session's own worktree, one agent at a time.
- Run research, review and acceptance in parallel; they do not write.
- For two unrelated, urgent units, the owner opens a second session with its own
  worktree and disjoint members.

Return to [discipline](../SKILL.md).
