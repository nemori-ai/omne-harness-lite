# @omne-harness/request-context-contract

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

The pure contract member of Request Context. Variant: `module`.

## Responsibility and status

This package owns the protocol for the derived computation of one model request input. It defines the seven input groups, the request candidate, coverage evidence, the fit verdict, and representation choices. It also defines the compaction plan and its steps, the six-layer layout, and the snapshot anchor rule. It also defines the types of the history source port and the policy ports. It defines eight single pure operations and three compaction plan operations.

Every fact that the package reads belongs to another owner. The package owns no facts, sends no request, fixes no adoption, and writes no history. It knows only generic roles: coordinator, history holder, integrator, contributor, and caller.

Status: contract member, `draft`. The [SPEC](SPEC.md) states which parts come from technical acceptance and which parts come from the product text, revision 4.

- Implemented: nothing. `src/index.ts` is an empty export. The root entry has no types and no runtime values.
- Not implemented: all value types, all pure operations, the port types, and the contract constants. The [API page](docs/public-api.md#随实现切片进入的导出) lists them.
- Not verified: every behavior clause in the SPEC. The package has no runtime implementation. It makes no claim about tenant isolation, durability after power loss, model compatibility, or performance.

No package depends on this package now. The adapter on the coordinator side does not exist yet. See the [usage page](docs/context.md#现在的真实消费者).

## Usage

The package has one entry: `@omne-harness/request-context-contract`. The entry exports no names now. After the operations arrive, a caller uses them in this order:

1. Prepare the seven input groups and the construction dependencies. Call `assemble`.
2. If the result is a candidate, give it to Model for preparation and fix it. Pass the coverage evidence back as "adopted" in the next assembly.
3. If the result is "needs compaction", call `planCompaction` and `deriveStep`. Run each step and keep the progress. After you and the history holder commit the compaction transition, call `resume`.
4. If the result is "cannot fit", the failure goes back to the caller.

The [object model](docs/object-model.md#调用方怎样使用) gives the pseudocode. The [usage page](docs/context.md#使用方式) gives the independent path and the hosted path.

Independent use needs only this package. It needs no coordinator, no history holder, and no Cordis. The package has no `./cordis` entry. Cordis integration lives in other members of the group. See the [Cordis page](docs/cordis.md).

## Contracts

- `src/index.ts` owns the public shapes. It is empty now.
- The [SPEC](SPEC.md) owns behavior beyond the types: clauses RQ-01 to RQ-11, layout rules R1 to R9, and history source rules H1 to H5.
- The [API page](docs/public-api.md) indexes the exports.
- The [object model](docs/object-model.md) owns identity, owners, and lifecycle of each object.

One assembly has exactly four outcomes: candidate that still passes the extension position, candidate that can be fixed, needs compaction, and cannot fit. Failures have three classes: not permitted, invalid, and unavailable. A result can also be unknown. An unknown limit is not a failure. A fixed part that exceeds the limit gives the outcome "cannot fit". It is not a failure. The compaction transition and the final request record are two joint commits. Neither happens inside this package. The package gives only the material. It holds no resources and has nothing to dispose.

## Design

The root entry contains ten modules. The first five are input and candidate values, projection, prompt assembly, declaration projection, and placement. The other five are representation choice, budget verdict, assembly and coverage, plan and steps, and history source and policy ports. Dependencies between them go one way. The outside dependencies are the public values of model-contract, tool-contract, content-block, message, and runtime-context-contract. They join `package.json` with the implementation. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the six protocol flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

The package has no configuration, needs no environment, and reads no resources at run time. The compaction policy and the representation policy have configuration items, listed in [RQ-06](SPEC.md#rq-06-压缩共同结果与保护边界). Their defaults are only initial values. [request-context](../request-context/README.md) owns the numbers.

The caller supplies the seven input groups and the construction dependencies. The dependencies are a `HistorySource` implementation, the Model metering port, the Model converter result port, and the two policy implementations. The caller also fixes the final request, runs the compaction steps, keeps the plan progress, and commits the compaction transition together with the history holder. Access to data that the system hosts still follows the original source contract.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context-contract
```

In this directory, run `pnpm typecheck` for the type check. The current test checks only that the root entry has no runtime exports. See [tests/](tests/README.md). No test covers the [verification obligations](SPEC.md#rq-11-持续验证与未覆盖) in the SPEC yet. A passing structure check does not prove behavior.

## Maintenance

- When a public export changes, update the SPEC, the [API page](docs/public-api.md), the [src index](src/index.md), and the export test.
- A change can affect the input groups, the four outcomes, the three failure classes, the layer order, or the prefix break reasons. Then update the dependents in the group: request-context-cordis-contract, request-context, and request-context-cordis. Also update the adapter on the coordinator side. See the [field mapping](docs/context.md#字段对应).
- A new compaction policy or representation policy is a new implementation of a policy port. This package does not change.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types, RQ-01 to RQ-11
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons
├── flows.md              Protocol flows F-RQ01 to F-RQ06
├── object-model.md       Objects, lifecycle, and states
├── public-api.md         Export entry and definition index
├── context.md            Independent use, neighbor handoff, field mapping, position
└── cordis.md             Why Cordis integration does not apply
src/                      Public definitions, only an empty index.ts now
tests/                    Continuous tests, fixtures/ is empty now
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
