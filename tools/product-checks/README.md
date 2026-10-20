# product-checks

[中文说明 and the rule catalogue](README_ZH.md)

Structural checks for this repository's TypeScript product sources and trusted application assemblies. Each rule names its public contract or system constraint and has passing fixtures plus deliberate violations. The rules hard-code this repository's product paths and contracts, so this member is not published to npm. Pull requests that change them pass the repository toolchain gate. The rule engine, source collection, commit attribution and acceptance lock come from [@omne-harness/repo-toolchain](../repo-toolchain/README.md).

## Long-lived product scenarios

`pnpm run acceptance:scenarios` reads current product topics and coverage declarations independently of Issues. It reports execution and acceptance as unknown when evidence is absent. Topics without numbered scenarios remain explicitly uncovered. The [product contract](../repo-toolchain/src/product/SPEC.md) defines discovery and failure behavior.

## Run and consume

Use Node.js >=24.0.0 and the repository's pinned pnpm version. The normal command scans `packages/`, `apps/` and `examples/`, then runs repository rules over actual execution modules in `packages/`, `apps/`, `examples/`, `tools/` and `scripts/`:

```sh
pnpm --filter @omne-harness/identity-values build
pnpm --filter @omne-harness/product-checks build
pnpm --filter @omne-harness/product-checks typecheck
pnpm --filter @omne-harness/product-checks test
pnpm run lint:rules
```

The CLI exits 1 on violations and prints their rule, source path and line. A successful scan of an absent consumer supplies no evidence about that consumer. The CLI's repository scan uses this tool's checkout; explicit CLI arguments choose additional package roots, not an arbitrary replacement repository. The repository collector normalizes its root before reading configurations, so a trailing slash does not change root `tsconfig` alias resolution. A relative `extends` is read as a file. A package-name `extends` resolves with Node rules from the directory of that configuration, so the collector reads the installed copy that the lockfile pins. If it does not resolve, the collector stops with an error.

| Built module          | Public surface                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `dist/rules/index.js` | `RULES`, individually exported rules and configured rule factories                                                                   |
| `dist/repository.js`  | `collectRepositorySources(root)` and `REPOSITORY_RULES`; collects repository paths and TypeScript-resolved configured module aliases |
| `dist/cli.js`         | CLI used by the workspace's `lint:rules` command                                                                                     |

`Rule`, `SourceFile`, `Violation`, `collectSources` and `runRules(files, rules)` come from `@omne-harness/repo-toolchain`.

`SourceFile` contains a path and source text, plus optional `resolvedModules` supplied by the repository collector. Rules can inspect a supplied source batch without loading or executing product modules. Package rules usually expect paths relative to `packages/`; repository rules expect repository paths. The model credential rule also normalizes the corresponding package-root and app-root paths.

For a fixture stored beside this README after building:

```ts
import assert from 'node:assert/strict'
import type { SourceFile } from '@omne-harness/repo-toolchain'
import { modelCredentialBoundary } from './dist/rules/index.js'

const source: SourceFile = {
  path: 'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  text: `
    import { createCredentialBindingReader } from '@omne-harness/model-profile-directory-local/tx-reads';
    import { createModelReplicaCustodian } from '@omne-harness/credential-custodian-local/model-replica';
    import { localCredentialLookupPlugin } from '@omne-harness/model-profile-directory-local/cordis';
    import { ReplicaReader } from './assembly-inputs.ts';
    export function createAcceptanceApplication() {
      let replica;
      async function start() {
        const reader = createCredentialBindingReader(storage);
        replica = await createModelReplicaCustodian({ readCredentialBindingIn: reader });
        new ReplicaReader(ctx, { readIn: replica.readBoundReplicaIn });
        ctx.plugin(localCredentialLookupPlugin, { mode: 'localCredentialOnly' });
      }
      function publishCredential() { return replica.storeBoundReplica(input); }
      async function closeResources() { await replica.close(); }
    }
  `,
}
assert.deepEqual(modelCredentialBoundary.check([source]), [])
const violation = {
  ...source,
  text: source.text.replace(
    'const reader = createCredentialBindingReader(storage);',
    'const reader = createCredentialBindingReader(storage); const thunk = () => reader; const illicit = thunk(); await illicit(unit, tenant);',
  ),
}
assert(
  modelCredentialBoundary
    .check([violation])
    .some(v => v.message.includes('binding-reader execution')),
)
```

These strings are static checker fixtures. They do not establish a real storage, identity or credential source. Repository collection can be consumed independently:

```ts
import assert from 'node:assert/strict'
import { runRules } from '@omne-harness/repo-toolchain'
import { REPOSITORY_RULES } from './dist/repository.js'

const violations = runRules(
  [
    {
      path: 'packages/model/example/src/runtime.ts',
      text: "import { createCredentialBindingReader } from '@omne-harness/model-profile-directory-local/tx-reads';",
    },
  ],
  REPOSITORY_RULES,
)
assert(violations.some(v => v.rule === 'model-credential-boundary'))
```

## Evaluation publication boundary

`evaluation-publication-boundary` permits static imports of the public EIS publication entry in its component owner, the trusted acceptance bootstrap/tests, and the exact `packages/model/model-request-runtime-local/tests/session-selection-fixture.ts` fixture. That fixture constructs real SQL/governance/EIS sources for selection tests. The permission does not extend to runtime product sources or adjacent test files; re-exports, dynamic forwarding and private publication imports remain rejected. Run its focused positive and negative checks with `pnpm --filter @omne-harness/repo-toolchain exec vitest run tests/evaluation-publication-boundary.spec.ts`.

## Model credential boundary

`model-credential-boundary` implements the static portion of D-075, directory v3 V3-10 and CCL revision 2 MCR-V7, with D-092's app ownership. It is in `REPOSITORY_RULES`, not a package-wide permission list.

| Value or operation               | Permitted use                                                                                                                                            |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Directory binding-reader factory | Directory owns the implementation; exact `bootstrap.ts` / `createAcceptanceApplication` / `start` constructs and transfers the reader to the CCL factory |
| Returned binding reader          | Directory `cordis.ts` / `localCredentialLookupPlugin` and CCL `model-replica.ts` execute it; bootstrap does not execute or return it                     |
| CCL component factory            | Exact app `start` has one construction site; lookup borrows the read closure                                                                             |
| `storeBoundReplica`              | App `publishCredential`, with origin and actor verification provided by the real assembly                                                                |
| `readBoundReplicaIn`             | App `start` lends only the read method through `ReplicaReader`; lookup consumes the definition service, and CCL retains its own method                   |
| Component `close`                | App `closeResources` and the owning CCL implementation; borrowers cannot receive it                                                                      |

The checker follows same-file lexical declarations, assignment aliases, named/namespace imports, ordinary destructuring, literal computed members and bounded aggregate aliases. Local expression-body arrow results retain recognized capability provenance when called; restricted returns fail closed for both expression and block bodies. Recognized restricted values may not escape through unknown arguments, constructors, return/export, callback results, object assignment or rendering. Non-literal member access on such a value fails. Ordinary arrow results remain valid, and unrelated `close` methods are not matched merely by name. Product test paths are excluded; negative fixtures use actual product paths. The dedicated CLI regression uses the built `dist/` artifact, so build the tool before running its tests.

The static scope is deliberately explicit: this tool does not interpret arbitrary JavaScript, infer unannotated cross-file values, prove source-pair authenticity, common-unit transaction ordering, runtime singleton behavior, reflection isolation or actual cleanup. Resolved import aliases identify providers; they do not grant new consumer permissions. The example assembly's final frozen source must still pass the integrated scan and independent joint acceptance. Tool self-tests cannot close MCR-V7 or the whole P3 stage.

Existing pure-core, tenancy, entry and repository rules are described in the [Chinese catalogue](README_ZH.md). Add a focused rule with its accepted source clause, positive and deliberate negative fixtures, and coverage limits; register package rules in `RULES` or repository rules in `REPOSITORY_RULES` according to the paths and resolution they require.

## Current core schema imports

`core-pure-imports` permits the adopted `immutable` value collections only at `core/model-request-runtime/src/model-log-history.ts`. Adjacent files, other core members, and private library subpaths remain rejected.

`core-pure-imports` uses an exact public-subpath list, including `model-profile/schema/v3` and `asset-model/schema/connector/v2`. Consumers still need an approved package dependency. Frozen schemas required by current contracts remain available; retired model execution entry points, adjacent private paths, and unknown versions are rejected. The response and loop schema graphs include their explicitly adopted dependencies.

Run `pnpm --filter @omne-harness/product-checks exec vitest run tests/core-rules.spec.ts` for the positive and negative boundary checks.

The exact `packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts` fixture may also use public EIS publication to establish real immutable history for D106 R7 acceptance. Neighboring runner tests and all runner product sources remain forbidden. The history rule allows runner product sources to import reader types only; runner tests may construct the real reader. No factory re-export or production publication authority is granted.

## Test temporary directories

`test-temp-physical-path` is in `REPOSITORY_RULES`. Its source is Issue #560 C5 and the test boundary section of [the verification guide](../../docs/verification.md#包级测试责任与边界), which owns the convention and the reason. On macOS the default `tmpdir()` is below the `/var` symbolic link, and git, vitest and pytest report the resolved `/private/var` path.

The rule scans test code and fixtures in `packages/`, `apps/` and `tools/`. It scans `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` files. It parses JavaScript files with JavaScript syntax. It reports a `mkdtempSync` or `mkdtemp` call when the first argument comes from `tmpdir()` or `process.env.TMPDIR` and the created directory is not resolved. The call passes when it is the first argument of `realpathSync`, `realpath` or `realpathSync.native`, or when the argument resolves `tmpdir()` first. The rule rejects a later separate `realpathSync(dir)` statement, because the unresolved path stays in scope. The rule also rejects callback `mkdtemp` and `.then(realpath)` chains. It does not cover tests in `scripts/` or `examples/`, `.tsx` or `.jsx` files, values from other modules, reassignment, or a renamed `require` destructuring of `mkdtemp`. The [Chinese catalogue](README_ZH.md#测试临时目录的物理路径) lists the details.

## Independence from archived implementations

The engineering tools do not load the archived `packages.0.0.1.legacy/` or
`apps.0.0.1.legacy/` trees. Rule tests own minimal source strings and mutate
those strings to test rejection. These fixtures test the checker, not the
behavior of an archived product.

`no-legacy-dependency` checks package manifests, workspace membership, imports,
and TypeScript-resolved module aliases. Test files retain the import check.
They also reject archived paths passed to file readers, `URL`, `join`, or
`resolve`. The path check follows local variable initializers within enclosing
blocks and follows explicitly selected fields of local object literals. Only the
path argument of a file reader is checked. Destructured bindings stop lookup in
outer scopes, and callback bodies are not treated as path arguments. Plain strings supplied as deliberately
invalid checker input remain allowed. The check does not prove arbitrary dynamic
paths, reassignment, indirect calls, or cross-module data flow. Run the tools
without the archived directories to test the actual dependency chain.

To reproduce that isolation from the repository root, use a disposable directory
outside the checkout. The copy has no Git metadata, dependencies, build output,
Python environment, or archived implementations:

```sh
isolated=$(mktemp -d)
rsync -a --exclude=.git --exclude=.worktrees --exclude=tmp \
  --exclude=node_modules --exclude=dist --exclude=.venv \
  --exclude=packages.0.0.1.legacy --exclude=apps.0.0.1.legacy ./ "$isolated/"
pnpm --dir "$isolated" install --frozen-lockfile --ignore-scripts
pnpm --dir "$isolated" --filter '@omne-harness/product-checks...' run build
pnpm --dir "$isolated" --filter @omne-harness/product-checks typecheck
pnpm --dir "$isolated" --filter @omne-harness/product-checks test
```

Run `pnpm run check:docs` separately in the checkout that retains the reference
material. Historical documentation links are not executable dependencies.
Report every failed command, including failures that also occur at the task
baseline. These checks do not publish a branch or record an integration. The
confirmer of a trunk PR writes the commands that ran and their results in the
confirmation note. The [integration rules](../../docs/engineering/integration.md#检查责任)
own this duty.

## Commit attribution audit baseline

After `lint:rules` runs the repo-toolchain `commit-attribution` rule, it filters the result with [`commit-attribution-baseline.json`](commit-attribution-baseline.json). The filter skips only the "agent listed as co-author" lines in the exact commits that the file lists by full 40-character SHA. An agent author or committer, or a "generated with" line, is still reported. Commits outside the list are checked as usual.

Each entry has the full SHA and a reason. The file refers to one named decision ([decision on #356](https://github.com/nemori-ai/omne-harness-lite/issues/356#issuecomment-6214198516)). A malformed file is an error, not an empty list. The file is on the repository toolchain gate path, so a new entry needs a confirmation. The assertion that the reachable history has no author-style attribution outside the baseline is in `tests/attribution-baseline.spec.ts`.
