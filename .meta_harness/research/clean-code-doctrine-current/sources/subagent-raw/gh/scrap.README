# SCRAP

SCRAP is a structural quality analyzer for Speclj specs.

It is aimed at test code in the same way CRAP is aimed at production code. SCRAP does not use mutation results. It measures structural complexity, weak-spec smells, and the net pressure to extract duplicated test scaffolding.

Its overall goal is to guide an AI assistant in whether, where, and how to refactor a poorly structured spec file.

The output is a set of recommendations, not directives. An AI assistant should treat SCRAP as decision support, then confirm the recommendation against the actual structure and intent of the spec file before refactoring.

## Usage

Run SCRAP against the whole spec tree:

```bash
clj -M:scrap spec
```

Show the full metric dump for each file, block, and example:

```bash
clj -M:scrap spec --verbose
```

Emit machine-readable JSON instead of the text report:

```bash
clj -M:scrap spec --json
```

Write a sidecar baseline under `target/scrap/`:

```bash
clj -M:scrap spec --write-baseline
```

Compare the current report to an earlier baseline:

```bash
clj -M:scrap spec --compare target/scrap/spec.json
```

Run SCRAP against a specific file or directory:

```bash
clj -M:scrap spec/clj_mutate/core_spec.clj
clj -M:scrap spec/clj_mutate
```

If no path is provided, SCRAP defaults to `spec`.

## What It Checks

SCRAP includes structural validation for common Speclj mistakes:

- `(it)` inside `(it)`
- `(describe)` inside `(describe)` or `(context)`
- `(before)`, `(with-stubs)`, `(around)`, `(with)`, or `(context)` inside `(it)`
- unclosed forms
- parse errors

## What It Measures

Per `it` example:

- line count
- raw line count
- structural complexity
- complexity score
- assertion count
- branch count
- setup depth
- `with-redefs` count
- helper-call count
- helper-hidden line count
- whether the example is already table-driven
- temp-resource work
- SCRAP score
- smell labels

Per `describe` or `context` block:

- example count
- average SCRAP
- max SCRAP
- recommended extraction count
- extraction pressure score
- worst example

Per spec file:

- example count
- average SCRAP
- max SCRAP
- branching example count
- low-assertion example count
- zero-assertion example count
- `with-redefs` example count
- helper-hidden example count
- recommended extraction count
- extraction pressure score
- duplication score
- harmful duplication score
- effective duplication score
- setup duplication score
- assertion duplication score
- fixture duplication score
- literal duplication score
- arrange duplication score
- subject repetition score
- coverage-matrix candidate count
- case-matrix repetition count
- setup, assertion, literal, and arrange shape diversity
- average setup, assertion, fixture, literal, arrange, and subject similarity

## Fuzzy Duplication

Duplication is structural and fuzzy.

SCRAP parses forms and normalizes them before comparison:

- symbols become `sym`
- strings become `:string`
- numbers become `:number`
- booleans become `:boolean`
- collection shape is preserved

That means comments and whitespace do not matter, and examples can still match when:

- local variable names differ
- literal values differ
- setup or arrange scaffolding is structurally similar but not textually identical

SCRAP compares normalized feature sets with Jaccard similarity and treats examples as related when similarity is at least `0.5`.

It now splits repetition into separate channels:

- harmful duplication: repeated setup, assertion, fixture, or arrange scaffolding
- case-matrix repetition: repeated low-complexity examples that are likely coverage tables, even when they are written as many small sibling examples rather than one explicit loop
- subject repetition: repeated focus on the same production API, which is often fine and is not heavily penalized

SCRAP does not add raw duplication directly into the file score anymore. Instead, it turns fuzzy duplication matches into extraction candidates, estimates whether helper extraction would pay off, and only charges the positive net benefit:

- `F`: shared structural forms across a duplicate cluster
- `I`: number of repeated examples in the cluster
- `V`: variable points in the cluster
- `D_before = 0` when `F <= 3` or `V > 4`
- otherwise `D_before = (max(0, F - 3) * (I - 1)^1.5) / (V + 1)`
- helper cost is estimated from shared and variable structure
- extraction pressure is `max(0, D_before - D_after - H)`, with `D_after` currently treated as `0`

That means small repetitions, highly variable repetitions, and likely coverage matrices can still be visible in the diagnostics without increasing SCRAP pressure.

SCRAP’s complexity score now uses a saturating curve rather than quadratic growth. That means:

- complexity rises quickly from trivial to moderate examples
- very large or miscounted examples no longer explode into useless outlier scores
- smell penalties still add directly on top

## Output

By default, SCRAP reports guidance for an AI assistant:

- whether a file should be refactored
- whether the right move is `SPLIT`, `LOCAL`, or `STABLE`
- where the pressure is concentrated
- how to refactor it
- the worst examples in the file
- specific extraction recommendations with `it` names and line ranges when helper extraction appears net beneficial

With `--verbose`, SCRAP reports the full metric set:

- file-level summaries
- block-level summaries
- per-example metrics
- a global worst-examples list

With `--json`, SCRAP emits the same report structure as data.

With `--write-baseline`, SCRAP writes a sidecar baseline to `target/scrap/`.

With `--compare`, SCRAP attaches comparison data to each file report:

- verdict: `improved`, `worse`, `mixed`, or `unchanged`
- file-score delta
- average/max SCRAP deltas
- extraction-pressure delta
- harmful duplication delta
- case-matrix delta
- helper-hidden delta

If a refactor made the file structurally worse, the text report says so explicitly and recommends reverting or simplifying helper extraction.

SCRAP distinguishes between:

- harmful duplication: repeated setup, fixture, or arrange scaffolding detected structurally
- coverage-matrix repetition: many small, low-complexity examples with similar structure that are often better converted into table-driven checks

Only some harmful duplication becomes extraction pressure. The cutoff is intentional: a repeated fragment should only raise SCRAP when extracting it is likely to improve the tests after accounting for helper cost.

SCRAP also tracks helper-hidden complexity. If an example gets shorter only because setup moved into a spec-local helper, the helper body is still charged back to the example. That prevents helper extraction from looking like an automatic improvement.

That distinction exists so an AI assistant does not misread a block like option parsing or validation matrices as purely bad duplication.

The intended use is to find:

- large examples
- weakly asserted examples
- logic-heavy examples
- mocking-heavy examples
- repeated setup or arrange scaffolding that is actually worth extracting
- spec files or describe blocks that should be split

In practice, SCRAP is meant to answer three refactoring questions for an AI assistant:

- whether a spec file is poorly structured enough to justify refactoring
- where the worst structure is concentrated: file, block, or example
- how the refactor should proceed: split blocks, extract setup, reduce duplication, or simplify oversized examples

The default non-verbose report is optimized around those three questions. `--verbose` is the raw supporting data.

When SCRAP reports `coverage-matrix-candidates`, the intended interpretation for an AI assistant is:

- this repetition may be intentional test coverage
- prefer consolidating it into table-driven specs
- do not treat it as strong evidence that the underlying production logic or spec file structure is fundamentally broken

When SCRAP reports high `effective-duplication-score`, the intended interpretation is different:

- there are one or more duplicate clusters whose extraction appears net beneficial
- inspect the reported `it` names and line ranges first
- extract setup, extract helpers, or split the block/file only for those clusters

Recommendation lines are ranked by confidence:

- `HIGH`: directly actionable structural problems such as zero-assertion specs, oversized examples, or obvious coverage-matrix cases
- `MEDIUM`: likely cleanup opportunities such as harmful duplication or heavy mocking
- `LOW`: broader design suggestions such as splitting a file by responsibility

SCRAP can also report `STABLE`. That means the file is noisy enough to measure but not problematic enough to justify refactoring right now.

SCRAP also reports a `remediation-mode`:

- `STABLE`: leave the file alone
- `LOCAL`: keep the file intact and clean up individual examples, assertions, or repeated scaffolding
- `SPLIT`: the pressure is spread across enough hotspots that the first move should be splitting the spec file by responsibility before local cleanup

That distinction is important for an AI assistant. A `SPLIT` recommendation means:

- do not spend time polishing isolated examples first
- identify coherent describe/context groups
- split the file into narrower spec namespaces
- then rerun SCRAP on the resulting files for local cleanup guidance

A `LOCAL` recommendation means the opposite:

- keep the file together
- fix assertions, duplication, or oversized examples in place

SCRAP also reports an explicit AI actionability class:

- `LEAVE_ALONE`: do not change the file unless explicitly asked
- `AUTO_TABLE_DRIVE`: safe to consolidate repetitive low-complexity examples into table-driven checks
- `AUTO_REFACTOR`: safe to make local structural improvements such as stronger assertions, smaller examples, or extracted shared scaffolding
- `MANUAL_SPLIT`: do not do local cleanup first; split the file by responsibility and rerun SCRAP on the resulting files
- `REVIEW_FIRST`: the file is not stable, but the heuristic is not confident enough for unattended refactoring

This is the main AI-facing decision layer. It is intentionally narrower than the recommendation list:

- use `ai-actionability` to decide whether the assistant should act automatically
- use the `how:` recommendations to choose the specific refactoring move

In other words:

- `AUTO_TABLE_DRIVE` means an autonomous assistant can usually rewrite repetitive examples into a table safely
- `AUTO_REFACTOR` means an autonomous assistant can usually make local cleanup changes in place
- `MANUAL_SPLIT` means the assistant should reorganize the spec namespace before polishing examples
- `LEAVE_ALONE` means the assistant should stop unless the user explicitly wants cleanup anyway
- `REVIEW_FIRST` means the assistant should be conservative and inspect the file shape before changing code

## Baselines

SCRAP baselines are sidecar analysis artifacts, not source comments.

They live under `target/scrap/` because SCRAP scores are heuristic and tool-version dependent. Embedding them in spec files would create noisy diffs and stale source metadata.

The intended workflow is:

1. Run `clj -M:scrap spec/path --write-baseline`
2. Refactor the spec
3. Run `clj -M:scrap spec/path --compare target/scrap/...`
4. If the verdict is `worse`, inspect the helper-hidden and harmful-duplication deltas before keeping the refactor

If `extraction-pressure-delta` went up, the refactor likely introduced or preserved duplication that still looks worth extracting under the current heuristic.

In both cases, the recommendation is advisory. The assistant should inspect the file and decide whether the recommendation fits the real testing intent before changing code.
