# M2 public contract consumer

[中文说明](README_ZH.md)

## Responsibility and status

`@omne-harness/m2-contract-skeleton` is a private, temporary B3 verification application. It executes governance codecs and public scripted Model conformance. It reports eight M2 hops with explicit gaps. Passing internal checks keeps `fullPath: 'incomplete'` in this edition.

The application has no production command or deployment role. Fixed protocol messages and scripted Model results are test inputs. [SPEC.md](SPEC.md) owns report behavior and the detailed [gap inventory](SPEC.md#h01).

## Usage

From the repository root, use the existing shared test slot. Build the declared dependency closure before tests.

```sh
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton... run build
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run typecheck
./scripts/with-test-slot.sh pnpm --filter @omne-harness/m2-contract-skeleton run test
```

`test:fast` selects fast cases. `test:slow` selects the bounded timeout case. `test` runs both tiers. A successful command with no selected cases is not evidence that this application's behavior passed.

The local test entry exports `runContractSkeleton()` from `src/index.ts`. It returns scenario results, hop observations, structural diagnostics, `checksPassed`, and `fullPath`. The entry has no standard output or durable write.

## Contracts

The application consumes [governance protocol](../../packages/access/public-contract/SPEC.md) and [Model testing](../../packages/model/model-contract/docs/public-api.md#符合性断言) through public package exports. Its direct dependencies also provide parsed legal identities, JSON budgets, and UTC instants. [Application behavior](SPEC.md#public-dependencies) describes the exact imports and test seams.

`checksPassed` describes only the fixed checks inside one invocation. External tests and QA retain separate verdicts. Whole hop state and fragment status have different meanings. Successful protocol or Model fragments cannot complete an unconnected business hop.

## Design

A fixed scenario registry detects missing, repeated, and unexecuted checks. A fixed hop table records public entries, responsibilities, owner cards, and links to the detailed gaps. The aggregator retains missing and duplicate diagnostics. Model consumption requires every public obligation once with status `pass`, including cleanup and abort obligations. `report.ok` alone is insufficient.

## Configuration and operation

Node.js 24 or later and the repository's frozen workspace dependencies are required. There is no environment configuration, network service, credential, database, or background process. Model conformance uses a 500 ms bound per operation. Tests set a 15 second outer limit and create independent subjects.

## Verification

The [tests](tests) exercise real codecs and the public scripted suite. They reject mismatched response correlation, missing or repeated hops and obligations, skipped hooks, exceptions, timeouts, and disposal failures. A report does not contain credentials, login proofs, response bodies, or raw provider errors.

These tests establish consumer behavior with controlled inputs. They do not establish real identity execution, durable Session storage, a real Model supplier, or a complete M2 deployment. Final runner discovery and independent acceptance belong to the repository delivery process.

## Maintenance

B3 consumes adopted upstream changes and keeps gaps visible in [SPEC.md](SPEC.md#h01). [N1 #677](https://github.com/nemori-ai/omne-harness-lite/issues/677) owns final placement. The [exit rules](SPEC.md#maintenance-and-exit) require preservation of consumer assertions and removal of the replaced temporary entry. Execution logs and independent review evidence remain in task `tmp/`.
