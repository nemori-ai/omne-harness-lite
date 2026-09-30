# deintroverter

Static analyzer for Clojure and Speclj tests. Classifies each test as **extroverted**, **likely-extroverted**, **introverted**, or **questionable** based on whether assertions trace to the system under test (SUT).

An introverted test passes but does not ground its assertions in SUT behavior — for example, asserting on literals, test-local data, or `clojure.core` helpers without calling production code.

## Intended Use

Deintroverter is a tool for programmers to interrogate the structure of tests — to see which tests ground their assertions in production code and which do not. Run it when reviewing a test suite, exploring unfamiliar specs, or deciding where to strengthen coverage.

Use it **manually**: point it at paths, read the report, and follow up in the editor. It is not meant to be wired into CI gates, release checks, or other automated verification or hardening pipelines. Verdicts are heuristic (especially `:likely-extroverted` and `:conditional-assertion`); treat them as guidance for human judgment, not pass/fail criteria.

It works best on **unit tests** (spec/`_spec.clj` and test/`_test.clj` files that exercise production code directly). Skip **acceptance tests** and any supporting code for acceptance workflows — drivers, generated acceptance specs, fixtures, and helpers under `acceptance/` or `generated-acceptance-specs/`. Those layers orchestrate end-to-end behavior; deintroverter’s SUT-tracing model does not fit them well.

## Requirements

- [Babashka](https://babashka.org/)

## Usage

```bash
bb -m deintroverter.core [options] <paths...>
```

Or via the `bb.edn` task:

```bash
bb run deintroverter [options] <paths...>
```

### Examples

```bash
# Scan a project's spec directory
bb -m deintroverter.core --project-root ../my-app spec/

# Machine-readable report for agents
bb -m deintroverter.core --format edn --project-root ../my-app spec/

# Show extroverted tests too
bb -m deintroverter.core --verbose spec/
```

### Stack depth on large projects

Form walking and tracing use iterative stacks (not recursive descent), so most projects run on Babashka's default JVM stack. Very large single files or extreme nesting can still hit `StackOverflowError` — increase the stack size with `BB_JVM_OPTS`:

```bash
BB_JVM_OPTS="-Xss32m" bb -m deintroverter.core --project-root ../my-app spec/
```

Start with `32m`; if errors persist, try `64m`.

**Full-directory scans.** If a whole-directory scan still fails, scan subdirectories or individual files instead:

```bash
BB_JVM_OPTS="-Xss32m" bb -m deintroverter.core --project-root ../my-app spec/my_app/game_logic/
BB_JVM_OPTS="-Xss32m" bb -m deintroverter.core --project-root ../my-app spec/my_app/core_spec.clj
```

Each run is independent; combine the results manually or with a small wrapper script.

### Options

| Option | Description |
|--------|-------------|
| `-h`, `--help` | Print usage and exit |
| `--format edn` | Print structured EDN instead of human-readable lines |
| `--verbose` | Include extroverted and likely-extroverted tests in human output |
| `--project-root <path>` | Project root for `deps.edn` discovery and in-project namespace boundaries |
| `--sut-ns <namespace>` | Add a namespace to the SUT set |
| `--exclude-ns <namespace>` | Remove a namespace from the SUT set |

Paths may be files or directories. Directories are scanned recursively for `.clj`, `.cljs`, and `.cljc` files.

## Verdicts

| Verdict | Meaning |
|---------|---------|
| `:extroverted` | At least one assertion traces to the SUT (function call, var read, private var invoke, or value derived from a SUT-bound `let`) |
| `:likely-extroverted` | Unqualified call via `:refer :all` from a SUT namespace (heuristic; not proven) |
| `:conditional-assertion` | Assertions sit behind a conditional the analyzer could not fully flatten; see [Conditional assertions](#conditional-assertions) |
| `:cloistered` | No SUT reach, but the test body calls or references another test-layer namespace (`-spec`/`-test` suffix, or source under `test/` / `spec/`) |
| `:introverted` | No SUT reach and no reach into other test modules |
| `:questionable` | Analysis could not reach a confident verdict |

Likely-extroverted findings are hidden in default human output. Conditional-assertion findings are printed by default.

### Exit code

Always `0`. Use the report (human or EDN) for verdicts and parse errors.

## Output

### Human (default)

```
spec/my_app/core_spec.clj:42  (it adds totals)  :introverted
  reason: no-sut-assertion
spec/my_app/core_spec.clj:101  (it validates errors)  :conditional-assertion
  reason: would-be-extroverted
  cause: runtime when
```

By default, conditional-assertion, cloistered, introverted, and questionable tests are printed. Use `--verbose` to include extroverted and likely-extroverted tests.

### EDN (`--format edn`)

```clojure
{:project-root "..."
 :summary {:extroverted 42
           :likely-extroverted 0
           :conditional-assertion {:total 2
                                   :would-be-extroverted 1
                                   :no-sut-assertion 1
                                   :by-cause {:runtime-conditional 1
                                              :missing-doseq-guard 1}}
           :cloistered {:total 2 :reaches-test-module 2}
           :introverted {:total 3 :no-sut-assertion 3}
           :questionable {:total 17
                           :unknown-assertion-macro 14
                           :destructuring 3}
           :errors 0}
 :findings [{:file "..." :line 42 :test-name "..."
             :test-form :it :verdict :introverted
             :reason :no-sut-assertion
             :sut-namespaces #{my-app.core}
             :trace {:test-ns my-app.core-test
                      :requires #{my-app.core}
                      :refer-syms {calculate-total my-app.core}
                      :sut-namespaces #{my-app.core}
                      :assertions [{:asserted-form (calculate-total items)
                                    :calls-traced [{:sym calculate-total
                                                    :resolved-ns my-app.core
                                                    :level :proven}]
                                    :binding-origins []
                                    :verdict :extroverted
                                    :reason nil}]}}]
 :errors []}
```

The summary breaks introverted and questionable counts down by `:reason` so agents can triage without scanning every finding.

## SUT inference

Namespaces are treated as SUT when they are:

1. Inferred from the test namespace (`foo.bar-test` or `foo.bar-spec` → `foo.bar`)
2. Listed in the test file's `:require` clause
3. In the project (per `deps.edn` `:paths` plus `:extra-paths` from all `:aliases`) and not excluded

Excluded by default: `clojure.*`, common test libraries (Speclj, `clojure.test`, etc.), and external dependency namespaces.

Test-layer namespaces (for `:cloistered`) use the same path scan — e.g. a `spec/` tree declared only under `{:aliases {:spec {:extra-paths ["spec"]}}}` is indexed.

## What gets traced

The analyzer walks test bodies and traces asserted expressions to:

- Direct SUT function calls (including aliased and `:refer` names)
- Private function calls via `#'ns/fn` / `(var ns/fn)`
- Reads of SUT vars (e.g. `m/rules`)
- `let` bindings — including projections like `(:action command)` when `command` came from a SUT call
- Threading macros `->` and `->>` (desugared)

Transparent wrappers (`do`, `try`, `let`, `with-redefs`) are walked through to inner assertions. `doseq` and `dotimes` are flattened when safe — see [Conditional assertions](#conditional-assertions).

Unsupported forms are marked questionable: destructuring in `let`, anonymous fns in assertions, `as->` / `some->` / `cond->` in asserted values, and unrecognized assertion macros.

## Conditional assertions

A test is `:conditional-assertion` when every extroverted path runs through a conditional the analyzer cannot reduce to a single branch. These tests may still kill mutants in practice; the verdict means static analysis could not prove all branches assert against the SUT.

### Reasons (`:reason`)

| Reason | Meaning |
|--------|---------|
| `:would-be-extroverted` | Conditional branches that run would trace to the SUT |
| `:would-be-likely-extroverted` | Branches would be likely-extroverted (e.g. `:refer :all` heuristic) |
| `:no-sut-assertion` | Branches would be introverted |
| `:unknown-assertion-macro` / `:destructuring` | Branches would be questionable |

If the test also has an unconditional extroverted assertion, that wins and the test is `:extroverted`.

### Causes (`:conditional-cause`)

Reported when every conditional assertion shares the same cause. Human output prints it as `cause: …`; EDN uses `:conditional-cause` and `:conditional-context`.

| Cause | When | Typical outcome |
|-------|------|-----------------|
| `:runtime-conditional` | `when`, `if`, `cond`, `case`, etc. with a non-literal test or dispatch value | `:conditional-assertion` |
| `:partial-dispatch-if` | `if` where only one branch contains assertions | `:conditional-assertion` |
| `:missing-doseq-guard` | `doseq` over a runtime collection with no emptiness guard | `:conditional-assertion` |
| `:near-doseq-guard` | `doseq` over a runtime collection; a non-guard assertion references the collection | `:conditional-assertion` |
| `:non-flattenable-doseq` | `doseq` collection is not a literal vector (and no guard applies) | `:conditional-assertion` |
| `:runtime-dotimes` | `dotimes` count is not a literal integer ≤ 32 | `:conditional-assertion` |
| `:malformed-doseq` | Invalid `doseq` binding form | `:conditional-assertion` |

### Flattened to `:extroverted`

These conditionals are reduced so each reachable branch is analyzed independently:

| Form | Condition |
|------|-----------|
| `when` / `when-not` / `if` | Literal test (`true` / `false`) |
| `cond` | Literal tests; `:else` when no earlier test is `true` |
| `if` (dispatch) | Both branches contain assertions |
| `case` / `case+` | Dispatch value is a compile-time literal (inline or from bindings, e.g. a `doseq` table column) |
| `doseq` | Literal vector table, or runtime collection preceded by `(should (seq coll))`, `(should (not-empty coll))`, `(should-not (empty? coll))`, or `(should-be-nil coll)` |
| `dotimes` | Literal positive count ≤ 32 |

**Example:** a table-driven `doseq` that binds `expected` to `:missing-source` or `"error message"`, then `(case expected …)` — each row is flattened and the matching `case` branch is selected, so the test is `:extroverted`.

**Counter-example:** `(case x …)` where `x` is `(core/calculate-total items)` — dispatch is runtime, so the test stays `:conditional-assertion` with cause `:runtime-conditional`.

### Supported assertion macros

**clojure.test:** `is`, `are`

**Speclj:** `should`, `should=`, `should==`, `should>`, `should-not`, `should-be`, `should-not-be`, `should-be-nil`, `should-not-be-nil`, `should-contain`, `should-be-a`, `should-throw`, `should-not-throw`, `should-throw?`, `should-not-throw?`, `should-have-invoked`, `should-not-have-invoked` (stub macros trace the immediately preceding SUT call in the same body)

### Wiring heuristics (`:likely-extroverted`)

When static tracing cannot reach the asserted expression, these patterns may still promote to `:likely-extroverted`:

| Reason | Pattern |
|--------|---------|
| `:sut-side-effect-heuristic` | SUT call, then assertion on test-module state or an immediate side effect |
| `:sut-wiring-heuristic` | `with-redefs` stub does `reset!`/`swap!` on a `let`-bound atom, SUT runs in the same body, assertion on `@atom` |
| `:file-dependency` | SUT call in the same body, then assertion on filesystem/external read (`slurp`, `File.`, `Files/…`, `.exists`, etc.) |

## Development

```bash
bb test
```

Design spec and implementation plan: `docs/superpowers/specs/2026-06-18-deintroverter-design.md`