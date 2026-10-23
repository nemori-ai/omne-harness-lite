# M2 contract skeleton behavior

This private application consumes public contracts for B3. Its report belongs to this application. The report is not a shared protocol or a production API.

The adopted scope is [#684](https://github.com/nemori-ai/omne-harness-lite/issues/684#issuecomment-6376487324). [D7](https://github.com/nemori-ai/omne-harness-lite/issues/684#issuecomment-6376382075) selects this temporary consumer. The consumed governance delta is M1-PUBLIC-319-INTEGRATED-01629411. The execution baseline includes the subsequent #703 fixture correction.

## Report

`runContractSkeleton()` runs the fixed governance scenarios and the public Model conformance suite. `scenarios` records each `scenarioId`, execution status, expected comparison, and safe evidence label. An expected protocol refusal, `unmatched`, or business boundary passes a scenario only when the real result matches that scenario.

The fixed scenario registry is [scenarios.ts](src/scenarios.ts). G1 covers three request and response round trips. G2 covers duplicate versions, unsupported versions, unknown operations, extra fields, and a response correlation mismatch. G3 preserves `unknown`, `denied`, `not-visible`, `basis-unavailable`, missing and empty proofs, and the four supported stage refusals. Fixed responses are test input. They create no account, login, permission, organization, or tenant fact.

`checksPassed` describes the checks inside this invocation. Every required scenario must occur once, execute, and match its expectation. Every public `CONFORMANCE_OBLIGATIONS` entry must occur once and pass. Exceptions, cleanup failures, timeouts, missing or repeated entries, `fail`, and `not-applicable` make this value false. External Vitest results, independent reviews, and QA do not change this value.

`hops` contains one observation for each H01 through H08. Each observation records `hopId`, `publicEntry`, `responsibility`, `ownerCards`, `reason`, `state`, and `fragments`. A fragment has `fragmentId`, `status`, and `evidence`. Fragment status is `pass`, `fail`, or `not-applicable`. Whole hop state is `verified`, `gap`, or `failed`. Successful fragments do not prove a connected hop. H01, H02, and H06 retain gaps after their fragments pass.

`reason` points to the corresponding gap section below. [HOP_DEFINITIONS](src/path-report.ts) owns the short source and owner mapping. The report test checks the correspondence with this document. This page is the only detailed gap inventory.

The aggregator inserts a named gap for a missing hop. It retains repeated observations in `duplicateObservations`, emits a duplicate diagnostic, and marks the normalized hop failed. Both structural faults make `checksPassed` false and `fullPath` incomplete. The aggregator is a test seam. Main execution constructs observations from actual public calls.

`fullPath` is complete only when all eight unique hops are verified with nonempty evidence from connected public entries and all required fragments pass. Any gap, failed hop, missing required fragment, or structural fault keeps it incomplete. This edition always has the gaps below. A static type import cannot verify a hop.

## Public dependencies

The application calls the four codecs from [public-contract](../../packages/access/public-contract/SPEC.md). Identity values come from the parsers in [legal-identity](../../packages/common/legal-identity/README.md). Codec budgets use the public `JsonLimits` from [json-text](../../packages/common/json-text/README.md). The fixed login response uses `parseInstant` from [utc-instant](../../packages/common/utc-instant/README.md).

Model execution uses only `@omne-harness/model-contract/testing`, including `createScriptedConformanceSubject`, `checkModelProviderConformance`, and `CONFORMANCE_OBLIGATIONS`. The [Model specification](../../packages/model/model-contract/SPEC.md) owns the obligations and their limits. Its [public testing documentation](../../packages/model/model-contract/docs/public-api.md#符合性断言) explains optional hooks and `not-applicable`. The consumer checks each result because the suite's `ok` permits `not-applicable`.

Tests can supply a legal Model subject factory and a wait bound. They can replace only the fixed registration response bytes. Both seams still execute public functions. They cannot inject a business success callback or replace the main report with static observations.

## Resource lifetime and failure

Each conformance obligation obtains a fresh subject. The public suite owns iteration cleanup, bounded waits, subject disposal, and prepared and materialized transport closure. Its per-obligation result includes release failure. The consumer retains every result and requires every result to pass. The default wait bound is 500 ms for each suite operation. Tests use a 15 second outer timeout.

A failed governance scenario does not remove its hop or prevent independent Model checks. A Model exception or unavailable report remains a failed H06 fragment. Diagnostics contain fixed labels and obligation names. Credentials, proofs, raw provider errors, and response bodies do not enter the report.

The process contains no network service, database, SDK, real provider, or file state. Scripted evidence is not durable evidence. Local release does not prove that an external send was reversed. Test completion and process exit remain the runner's responsibility.

## H01

Creation and recognition belong to identity. Governance request and response codecs for `register-and-activate` and `create-organization` are available. The identity public entry has no corresponding business factory. Protocol fragments can pass, while actual creation stays a gap. [P1 #319](https://github.com/nemori-ai/omne-harness-lite/issues/319) supplies the pure protocol. [G1 #659](https://github.com/nemori-ai/omne-harness-lite/issues/659) tracks identity supply. These cards do not promise a production creation provider in this M1 scope.

## H02

Login and current standing belong to identity. The governance codecs and identity principal authority are public. A login service and the governance call into identity are absent. [G1 #659](https://github.com/nemori-ai/omne-harness-lite/issues/659) tracks identity supply, with B3 tracking consumption. Fixed login responses and successful protocol reading prove no actual login or authorization.

## H03

Access must project public session operations into Session. The public governance contract has no three session operations. The Session contract root exports no usable entry. [P0 #318](https://github.com/nemori-ai/omne-harness-lite/issues/318) and [P2 #685](https://github.com/nemori-ai/omne-harness-lite/issues/685) own public protocol work. [S1 #536](https://github.com/nemori-ai/omne-harness-lite/issues/536) and [S2 #680](https://github.com/nemori-ai/omne-harness-lite/issues/680) own Session supply. [N1 #677](https://github.com/nemori-ai/omne-harness-lite/issues/677) decides final placement.

## H04

Session coordinates the first request and Agent executes it. Session has no executable public entry. Agent exports `AgentRuntime` and `AgentExecutionHandle` types, but no testing factory for runtime progress. [S1 #536](https://github.com/nemori-ai/omne-harness-lite/issues/536), [S2 #680](https://github.com/nemori-ai/omne-harness-lite/issues/680), [A2 #672](https://github.com/nemori-ai/omne-harness-lite/issues/672), and [A3 #673](https://github.com/nemori-ai/omne-harness-lite/issues/673) own contract supply. Execution remains outside this consumer.

## H05

RQ assembles the request and Agent selects Model. Agent exports `RequestPreparation`, `ModelSelection`, and `ModelContextReader` types. RQ's root entry is empty. Model provides contracts and public testing, but this does not connect Agent or RQ. [RQ #676](https://github.com/nemori-ai/omne-harness-lite/issues/676), [A2 #672](https://github.com/nemori-ai/omne-harness-lite/issues/672), [A3 #673](https://github.com/nemori-ai/omne-harness-lite/issues/673), [M2 #682](https://github.com/nemori-ai/omne-harness-lite/issues/682), and [M5 #683](https://github.com/nemori-ai/omne-harness-lite/issues/683) own supply. The unintegrated RQ cold start candidate is not consumed.

## H06

Model produces results and account facts for an Agent consumer. The public scripted conformance subject, provider, and transport support an executable Model fragment. They provide no connected Agent receiver. [M2 #682](https://github.com/nemori-ai/omne-harness-lite/issues/682), [M5 #683](https://github.com/nemori-ai/omne-harness-lite/issues/683), and [A2 #672](https://github.com/nemori-ai/omne-harness-lite/issues/672) own the result and account handoff shapes. Scripted output proves neither real supplier output nor actual cost accounting.

## H07

Agent hands journal records to Session, which owns durable commit and recognition. Agent journal types are public. The Session specification states the responsibility, while its root has no executable entry. [A2 #672](https://github.com/nemori-ai/omne-harness-lite/issues/672), [A3 #673](https://github.com/nemori-ai/omne-harness-lite/issues/673), [S1 #536](https://github.com/nemori-ai/omne-harness-lite/issues/536), and [S2 #680](https://github.com/nemori-ai/omne-harness-lite/issues/680) own supply. Agent journal types cannot stand for a Session Journal or a durable receipt.

## H08

Session owns history projection and recovery. There is no public Session history implementation or testing entry to import. [S1 #536](https://github.com/nemori-ai/omne-harness-lite/issues/536), [S2 #680](https://github.com/nemori-ai/omne-harness-lite/issues/680), and [P2 #685](https://github.com/nemori-ai/omne-harness-lite/issues/685) own supply, with B3 tracking consumption. Model text cannot be labelled as a history reply.

## Maintenance and exit

B3 updates this consumer only after the supplying contract and integration delta are adopted. A new connection requires real public consumption and corresponding failure tests. No upstream private import or local business substitute closes a gap. Contract supply cards do not silently acquire responsibility for production implementation.

[N1 #677](https://github.com/nemori-ai/omne-harness-lite/issues/677) owns final placement. Migration preserves the consumer assertions, scripts, and report limits in the accepted destination. The same change removes the replaced temporary entry and updates application navigation and dependency closure. Full G1 acceptance remains separate from this consumer's checks.
