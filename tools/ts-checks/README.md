# ts-checks

Structural checks for this repository's TypeScript product sources and trusted application assemblies. Each rule names the contract or realization obligation it checks and has passing fixtures plus deliberate violations. This is a private workspace development tool; it is not a runtime plugin or a security sandbox.

[中文说明 and the existing rule catalogue](README_ZH.md)

## Run and consume

Use the repository's locked Node and pnpm versions. The normal command scans `packages/`, `apps/` and `examples/`, then runs repository rules over actual execution modules in `packages/`, `apps/`, `examples/`, `tools/` and `scripts/`:

```sh
pnpm --filter @omne-harness-lite/identity-values build
pnpm --filter @omne-harness-lite/ts-checks build
pnpm --filter @omne-harness-lite/ts-checks typecheck
pnpm --filter @omne-harness-lite/ts-checks test
pnpm run lint:rules
```

The CLI exits 1 on violations and prints their rule, source path and line. A successful scan of an absent consumer supplies no evidence about that consumer. The CLI's repository scan uses this tool's checkout; explicit CLI arguments choose additional package roots, not an arbitrary replacement repository. The repository collector normalizes its root before reading configurations, so a trailing slash does not change root `tsconfig` alias resolution.

| Built module | Public surface |
| --- | --- |
| `dist/index.js` | `Rule`, `SourceFile`, `Violation`, `collectSources`, `runRules`, `RULES`, individually exported rules and configured rule factories |
| `dist/repository.js` | `collectRepositorySources(root)` and `REPOSITORY_RULES`; collects repository paths and TypeScript-resolved configured module aliases |
| `dist/cli.js` | CLI used by the workspace's `lint:rules` command |

`SourceFile` contains a path and source text, plus optional `resolvedModules` supplied by the repository collector. Rules can inspect a supplied source batch without loading or executing product modules. Package rules usually expect paths relative to `packages/`; repository rules expect repository paths. The model credential rule also normalizes the corresponding package-root and app-root paths.

For a fixture stored beside this README after building:

```ts
import assert from 'node:assert/strict'
import { modelCredentialBoundary, type SourceFile } from './dist/index.js'

const source: SourceFile = {
  path: 'examples/model-invocation-minimal-demo/src/bootstrap.ts',
  text: `
    import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads';
    import { createModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica';
    import { localCredentialLookupPlugin } from '@omne-harness-lite/model-profile-directory/plugin';
    export function createAcceptanceApplication() {
      let replica;
      async function start() {
        const reader = createCredentialBindingReader(storage);
        replica = await createModelReplicaCustodian({ readCredentialBindingIn: reader });
        ctx.plugin(localCredentialLookupPlugin, { readBoundReplicaIn: replica.readBoundReplicaIn });
      }
      function publishCredential() { return replica.storeBoundReplica(input); }
      async function closeResources() { await replica.close(); }
    }
  `,
}
assert.deepEqual(modelCredentialBoundary.check([source]), [])
const violation = { ...source, text: source.text.replace(
  'const reader = createCredentialBindingReader(storage);',
  'const reader = createCredentialBindingReader(storage); const thunk = () => reader; const illicit = thunk(); await illicit(unit, tenant);',
) }
assert(modelCredentialBoundary.check([violation]).some(v => v.message.includes('binding-reader execution')))
```

These strings are static checker fixtures. They do not establish a real storage, identity or credential source. Repository collection can be consumed independently:

```ts
import assert from 'node:assert/strict'
import { runRules } from './dist/index.js'
import { REPOSITORY_RULES } from './dist/repository.js'

const violations = runRules([{
  path: 'packages/model/example/src/runtime.ts',
  text: "import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory/tx-reads';",
}], REPOSITORY_RULES)
assert(violations.some(v => v.rule === 'model-credential-boundary'))
```

## Evaluation publication boundary

`evaluation-publication-boundary` permits static imports of the public EIS publication entry in its component owner, the trusted acceptance bootstrap/tests, and the exact `packages/model/model-request-runtime/tests/session-selection-fixture.ts` fixture. That fixture constructs real SQL/governance/EIS sources for selection tests. The permission does not extend to runtime product sources or adjacent test files; re-exports, dynamic forwarding and private publication imports remain rejected. Run its focused positive and negative checks with `pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/evaluation-publication-boundary.spec.ts`.

## Model credential boundary

`model-credential-boundary` implements the static portion of [D-075](../../.meta_harness/design/record/decisions/model-credential-source-projection/decision.md), directory v3 V3-10 and CCL revision 2 MCR-V7, with [D-092](../../.meta_harness/design/record/decisions/model-auth-bootstrap-adoption/decision.md)'s app ownership. It is in `REPOSITORY_RULES`, not a package-wide permission list.

| Value or operation | Permitted use |
| --- | --- |
| Directory binding-reader factory | Directory owns the implementation; exact `bootstrap.ts` / `createAcceptanceApplication` / `start` constructs and transfers the reader to the CCL factory |
| Returned binding reader | Directory `plugin.ts` / `localCredentialLookupPlugin` and CCL `model-replica.ts` execute it; bootstrap does not execute or return it |
| CCL component factory | Exact app `start` has one construction site; lookup borrows the read closure |
| `storeBoundReplica` | App `publishCredential`, with origin and actor verification provided by the real assembly |
| `readBoundReplicaIn` | App `start` only passes it as lookup configuration; P1r and the CCL component execute it |
| Component `close` | App `closeResources` and the owning CCL implementation; borrowers cannot receive it |

The checker follows same-file lexical declarations, assignment aliases, named/namespace imports, ordinary destructuring, literal computed members and bounded aggregate aliases. Local expression-body arrow results retain recognized capability provenance when called; restricted returns fail closed for both expression and block bodies. Recognized restricted values may not escape through unknown arguments, constructors, return/export, callback results, object assignment or rendering. Non-literal member access on such a value fails. Ordinary arrow results remain valid, and unrelated `close` methods are not matched merely by name. Product test paths are excluded; negative fixtures use actual product paths. The dedicated CLI regression uses the built `dist/` artifact, so build the tool before running its tests.

The static scope is deliberately explicit: this tool does not interpret arbitrary JavaScript, infer unannotated cross-file values, prove source-pair authenticity, common-unit transaction ordering, runtime singleton behavior, reflection isolation or actual cleanup. Resolved import aliases identify providers; they do not grant new consumer permissions. The example assembly's final frozen source must still pass the integrated scan and independent joint acceptance. Tool self-tests cannot close MCR-V7 or the whole P3 stage.

Existing pure-core, tenancy, entry and repository rules are described in the [Chinese catalogue](README_ZH.md). Add a focused rule with its accepted source clause, positive and deliberate negative fixtures, and coverage limits; register package rules in `RULES` or repository rules in `REPOSITORY_RULES` according to the paths and resolution they require.

## Current core schema imports

`core-pure-imports` uses an exact public-subpath list, including `model-profile/schema/v3` and `asset-model/schema/connector/v2`. Consumers still need an approved package dependency. Frozen schemas required by current contracts remain available; retired model execution entry points, adjacent private paths, and unknown versions are rejected. The response and loop schema graphs include their explicitly adopted dependencies.

Run `pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/core-rules.spec.ts` for the positive and negative boundary checks.
