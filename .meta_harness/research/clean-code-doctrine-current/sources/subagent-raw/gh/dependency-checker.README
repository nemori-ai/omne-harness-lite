# Dependency Checker

Analyzes component boundaries and architecture health for Clojure projects.

## Usage in Your Project

### Clojure CLI

Add an alias to your `deps.edn`:

```clojure
{:aliases
 {:check-dependencies
  {:extra-deps {io.github.unclebob/dependency-checker {:git/tag "..." :git/sha "..."}}
   :main-opts ["-m" "dependency-checker.core"]}}}
```

### Babashka

Add a task to your `bb.edn`:

```clojure
{:tasks {check-dependencies {:doc "Run dependency checker"
                             :extra-deps {io.github.unclebob/dependency-checker {:git/tag "..." :git/sha "..."}}
                             :requires ([dependency-checker.core :as dc])
                             :task (apply dc/-main *command-line-args*)}}}}
```

Then run with `bb check-dependencies` (same arguments as below).

### Running

    clj -M:check-dependencies
    clj -M:check-dependencies dependency-checker.edn
    clj -M:check-dependencies dependency-checker.edn --source-path src
    clj -M:check-dependencies dependency-checker.edn --format edn
    clj -M:check-dependencies --no-color
    clj -M:check-dependencies --no-edges
    clj -M:check-dependencies --help

Use `--help` to print a usage summary to stdout. Use `--no-color` to disable ANSI color output. Use `--no-edges` to omit the Component Dependencies listing from the report.

Create or recreate starter config:

    clj -M:check-dependencies dependency-checker.edn --init
    clj -M:check-dependencies dependency-checker.edn --source-path src --force-init

## Working Directory Behavior

The checker resolves paths from the current working directory.

- Default config path `dependency-checker.edn` is resolved relative to the current working directory.
- Default source path is `src`, resolved relative to the current working directory unless you use an absolute path.

## Config File

Default config path is `dependency-checker.edn`.

### Component Discovery

Components are not configured manually.

The checker derives the component from the second namespace segment under the chosen source path:

```text
<source-path>/project_ns/component_ns/...
```

Examples:

- `src/sample_app/ui/view.clj` with namespace `sample-app.ui.view` belongs to component `:ui`
- `src/sample_app/game/rules.clj` with namespace `sample-app.game.rules` belongs to component `:game`

All dependencies from descendant namespaces roll up to their component. For example, every dependency from `sample-app.ui.*` contributes to component `:ui`.

### Allowed Dependencies

The `:allowed-dependencies` map declares which components each component may depend on. Any dependency not listed is a violation.

```clojure
{:allowed-dependencies
 {:ui [:game :player :state :config]
  :game [:player :state :config]
  :player [:state :config]
  :state [:config]
  :config []
  :test-infra :all}}
```

Use `:all` to allow a component to depend on anything (useful for test infrastructure).

Self-dependencies (a component depending on itself) are always allowed.

### Ignored Components

Use `:ignored-components` to exclude components completely from analysis. Ignored components do not appear in metrics, edges, violations, warnings, or cycles.

```clojure
{:ignored-components [:spec-runner]}
```

This is useful for support components that you do not want treated as part of the architectural policy surface.

### Forbidden Dependencies

Use `:forbidden-dependencies` to list component edges that are not allowed.

```clojure
{:forbidden-dependencies [[:ui :state]
                          [:game :config]]}
```

You can also use map form:

```clojure
{:forbidden-dependencies [{:from :ui :to :state}
                          {:from :game :to :config}]}
```

### Allowed Exceptions

Specific namespace-level edges can be exempted from violation reporting:

```clojure
{:allowed-exceptions [{:from-ns "sample.player.production"
                       :to-ns "sample.computer.production"}]}
```

Namespace exceptions are exact namespace names.

### Healthy Threshold

Controls how far from the main sequence a component can be before it is classified into the Zone of Pain or Zone of Uselessness.

```clojure
{:healthy-threshold 0.3}    ; default
```

A component is classified as:

- **healthy** when `A + I` is within the threshold of 1.0 (i.e., between `1 - threshold` and `1 + threshold`)
- **pain** when `A + I < 1 - threshold` (concrete and stable — hard to change)
- **useless** when `A + I > 1 + threshold` (abstract and unstable — dead abstractions)

Increase the threshold to be more lenient; decrease it to be stricter.

### Failure Flags

```clojure
{:fail-on-violations true   ; exit 1 if boundary violations found
 :fail-on-cycles true}      ; exit 1 if component cycles found
```

## Metrics

Reports per-component: fan-in, fan-out, instability, abstractness, distance from the main sequence, and zone classification. Zone labels are colorized in terminal output (red for pain, blue for useless, green for healthy), with intensity proportional to distance.

Fan-in/fan-out edges are derived from:

- `ns :require`, `ns :use`, `ns :import`
- Direct `(require ...)`
- Dynamic namespace lookup forms: `requiring-resolve`, `resolve`, `ns-resolve`, `find-ns`, `the-ns`

Dynamic lookup usage is emitted as warnings.

## Abstractness

A symbol counts as abstract only when it represents real indirection (`defprotocol`, `defmulti`). Config-only marking does not count.

## Starter Config

`--init` and `--force-init` infer `:allowed-dependencies` from observed component-to-component dependencies under the chosen source path.

Generated config includes the inferred `:allowed-dependencies` plus `:fail-on-cycles true` and `:fail-on-violations true`.

If you want to exclude support components such as `:spec-runner`, add `:ignored-components` manually after generation.

If an existing config uses legacy keys such as `:source-paths` or `:component-rules`, the checker exits with an error and recommends regenerating the file with `--force-init`.

## Example Project

```text
sample-app/
  deps.edn
  dependency-checker.edn
  src/
    sample_app/cli.clj
    sample_app/core/service.clj
    sample_app/core/repo.clj
```

```clojure
;; sample-app/dependency-checker.edn
{:allowed-dependencies {:cli [:core]
                        :core []}
 :ignored-components [:spec-runner]
 :fail-on-cycles true
 :fail-on-violations true}
```

Run from `sample-app/`:

    clj -M:check-dependencies

## Example Output

```text
Dependency Analysis
===================

Components: 2
Component edges: 1
Warnings: 0
Violations: 0
Cycles: 0

Component Metrics
-----------------
Component           FanIn  FanOut Instability    Abstract  Distance  Zone
:cli                    0       1       1.000       0.000     0.000  healthy
:core                   1       0       0.000       0.000     1.000  pain

Component Dependencies
----------------------
:cli -> :core
```

Zone labels are colorized in terminal output. Use `--no-color` for plain text.