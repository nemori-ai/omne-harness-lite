# ts-checks

Structural checks for this repository's TypeScript product sources and trusted application assemblies. Each rule names its public contract or system constraint and has passing fixtures plus deliberate violations. This is a private workspace development tool; it is not a runtime plugin or a security sandbox.

[中文说明 and the existing rule catalogue](README_ZH.md)

## Ordinary tasks and long-lived product scenarios

The [delivery observer](src/delivery/README.md) reads an explicit Issue capture and reports known facts, deviations, and unknowns. It does not authorize dispatch or acceptance. The formal configuration remains disabled. Each task uses the ordinary protocol to define its identity, result, scope, and acceptance responsibility.

`make scenario-status` reads current product topics and coverage declarations independently of Issues. It reports execution and acceptance as unknown when evidence is absent. Topics without numbered scenarios remain explicitly uncovered. The [product contract](src/product/SPEC.md) defines discovery and failure behavior.

`make design-check` checks current design sources, domain objects, and generated inputs. `make loop-health` reports trends, test timings, and Git history.

## Stop-hook revision reads

The Stop hook recalculates the merge base with `primaryBranch` on each invocation.
The global architecture reader resolves that base to a fixed commit and batches its selected source and intent blobs.
They use byte lengths for UTF-8 content and preserve literal paths, empty files and read failures.
No measurements persist across commits. Source ownership uses the longest member prefix and one inventory traversal.

Synchronizing the primary branch can remove delivered changes from the current difference.
For a task-wide report, run `make loop-status BASE=<task-start-commit>` with a fixed task anchor.
That explicit base does not change the automatic hook's base. The internal 40-second limit and host error protocol remain unchanged.

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
    import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads';
    import { createModelReplicaCustodian } from '@omne-harness-lite/credential-custodian-local/model-replica';
    import { localCredentialLookupPlugin } from '@omne-harness-lite/model-profile-directory-local/cordis';
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
  text: "import { createCredentialBindingReader } from '@omne-harness-lite/model-profile-directory-local/tx-reads';",
}], REPOSITORY_RULES)
assert(violations.some(v => v.rule === 'model-credential-boundary'))
```

## Evaluation publication boundary

`evaluation-publication-boundary` permits static imports of the public EIS publication entry in its component owner, the trusted acceptance bootstrap/tests, and the exact `packages/model/model-request-runtime-local/tests/session-selection-fixture.ts` fixture. That fixture constructs real SQL/governance/EIS sources for selection tests. The permission does not extend to runtime product sources or adjacent test files; re-exports, dynamic forwarding and private publication imports remain rejected. Run its focused positive and negative checks with `pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/evaluation-publication-boundary.spec.ts`.

## Model credential boundary

`model-credential-boundary` implements the static portion of D-075, directory v3 V3-10 and CCL revision 2 MCR-V7, with D-092's app ownership. It is in `REPOSITORY_RULES`, not a package-wide permission list.

| Value or operation | Permitted use |
| --- | --- |
| Directory binding-reader factory | Directory owns the implementation; exact `bootstrap.ts` / `createAcceptanceApplication` / `start` constructs and transfers the reader to the CCL factory |
| Returned binding reader | Directory `cordis.ts` / `localCredentialLookupPlugin` and CCL `model-replica.ts` execute it; bootstrap does not execute or return it |
| CCL component factory | Exact app `start` has one construction site; lookup borrows the read closure |
| `storeBoundReplica` | App `publishCredential`, with origin and actor verification provided by the real assembly |
| `readBoundReplicaIn` | App `start` lends only the read method through `ReplicaReader`; lookup consumes the definition service, and CCL retains its own method |
| Component `close` | App `closeResources` and the owning CCL implementation; borrowers cannot receive it |

The checker follows same-file lexical declarations, assignment aliases, named/namespace imports, ordinary destructuring, literal computed members and bounded aggregate aliases. Local expression-body arrow results retain recognized capability provenance when called; restricted returns fail closed for both expression and block bodies. Recognized restricted values may not escape through unknown arguments, constructors, return/export, callback results, object assignment or rendering. Non-literal member access on such a value fails. Ordinary arrow results remain valid, and unrelated `close` methods are not matched merely by name. Product test paths are excluded; negative fixtures use actual product paths. The dedicated CLI regression uses the built `dist/` artifact, so build the tool before running its tests.

The static scope is deliberately explicit: this tool does not interpret arbitrary JavaScript, infer unannotated cross-file values, prove source-pair authenticity, common-unit transaction ordering, runtime singleton behavior, reflection isolation or actual cleanup. Resolved import aliases identify providers; they do not grant new consumer permissions. The example assembly's final frozen source must still pass the integrated scan and independent joint acceptance. Tool self-tests cannot close MCR-V7 or the whole P3 stage.

Existing pure-core, tenancy, entry and repository rules are described in the [Chinese catalogue](README_ZH.md). Add a focused rule with its accepted source clause, positive and deliberate negative fixtures, and coverage limits; register package rules in `RULES` or repository rules in `REPOSITORY_RULES` according to the paths and resolution they require.

## Current core schema imports

`core-pure-imports` permits the adopted `immutable` value collections only at `core/model-request-runtime/src/model-log-history.ts`. Adjacent files, other core members, and private library subpaths remain rejected.

`core-pure-imports` uses an exact public-subpath list, including `model-profile/schema/v3` and `asset-model/schema/connector/v2`. Consumers still need an approved package dependency. Frozen schemas required by current contracts remain available; retired model execution entry points, adjacent private paths, and unknown versions are rejected. The response and loop schema graphs include their explicitly adopted dependencies.

Run `pnpm --filter @omne-harness-lite/ts-checks exec vitest run tests/core-rules.spec.ts` for the positive and negative boundary checks.

The exact `packages/agent-loop/loop-extension-runner-local/tests/runner-chain-support.ts` fixture may also use public EIS publication to establish real immutable history for D106 R7 acceptance. Neighboring runner tests and all runner product sources remain forbidden. The history rule allows runner product sources to import reader types only; runner tests may construct the real reader. No factory re-export or production publication authority is granted.

## Package scaffolding

The private `omne-package-template` CLI creates drafts and inventories exact template adoption. See the [template guide](templates/package/README.md) and [development entry](../../docs/development.md#创建和整改产品包). It reuses the architecture reader. Structural results do not accept business or lifecycle behavior.

The package template is typescript-package@2.0.0. Exact 1.0.0 rules remain available for older markers.
`service-contract` creation and structure scan no longer require `packages/core`.
`scan --json` reports judged edges on `dependencies`. `unknown` stays `unknown`.
`group-direction` still reports `unregistered-group` for `packages/access`, `packages/identity`, `packages/agent`, and `packages/assembly`.
This change does not edit that rule.
Registering those groups on the path table would leave a same-group import from `sdk` to `server-entry` legal until the two members form a cycle.
The later-implementer table and diagnostic shapes are in the [template guide](templates/package/README.md#later-implementers).
`create-domain --group <name>` previews a package-domain@1.0.0 documentation draft. Add --write to create it.
`scan --group <name> --check` checks group structure. It is mutually exclusive with --member.
See the [group template](templates/domain/README.md). Python documentation inventory separately checks bindings, sections and placeholders.

## Actual assembly observations

The clean loop reads complete current and BASE sources through `sensors.architecture`.
Global expectations belong to `docs/architecture/constraints.json`.
Each version discovers its own current or historical input. Duplicate owners and invalid source references fail.
Schema 2 source paths start at repository root. Referenced files and Markdown anchors are read at the same version.
IC-1 and IC-5 use adopted roles and actual public exports. Directory names grant no exception.
A missing current or BASE input remains unknown or no-data. Current deletion still reports its semantic change.
Changes to cited Markdown also trigger the hook. See the [conformance contract](src/arch/CONFORMANCE.md).
It reports static conformance separately from added, removed and changed assembly facts.
Fact counts are neutral. They have no thresholds or trend comparison.

Identity excludes source positions and uses JSON tuples, so delimiter names do not collide.
Metadata changes retain contract, owner and shape values before and after the change.
A dynamic injection remains unknown. A static fact that disappears does not prove runtime release.
A missing current expectation produces no-data and fails the enabled strict sensor.
No BASE means no difference reading. Neither case becomes zero.

The extractor does not prove lifecycle, authorization, isolation or shared commits.
Public services, member SPEC files and behavior verification own those obligations.
Tests cover source moves, injection additions, metadata changes, collisions, unknowns and missing inputs.
See [the full configuration and output description](README_ZH.md#实际装配与全局架构约束).

## GitHub delivery observation

The [delivery observer](src/delivery/README.md) reads an explicit configuration and capture. It reports card shape, phase waits, native dependency projections, stock and changes. It does not authorize dispatch or acceptance, and it does not infer current product support.
