# @omne-harness/request-context-contract

[中文](README_ZH.md)

The pure contract member of Request Context. Variant: `module`.

## Responsibility and status

This package owns the protocol for the derived computation of one model request input. It defines the seven input groups, the request candidate, coverage evidence, the fit verdict, and representation choices. It also defines the compaction plan and its steps, the six-layer layout, and the snapshot anchor rule. It also defines the types of the history source port and the policy ports. It also defines the source set, the stable read of the seven groups, the account protocol, and the system recovery access (RQ-12 to RQ-15). It exports the stateless operation group factory `createAssemblyOperations` with four operations: `assemble`, `planCompaction`, `deriveStep`, and `resume`.

Every fact that the package reads belongs to another owner. The package owns no facts, sends no request, fixes no adoption, and writes no history. It knows only generic roles: coordinator, history holder, integrator, contributor, and caller.

Status: contract member, `draft`. The [SPEC](SPEC.md) states which parts come from technical acceptance and which parts come from the product text, revision 4.

- Implemented: the public types, `createAssemblyOperations` and the other stateless functions, closed results, schemas, ports, constants, and two required context blocks (`context.window-usage` has four states). [request-context](../request-context/README.md) implements the source registry and the account projection.
- Verification: public-entry inventory, pure behavior, the stable read of the seven groups, full metering with leases, source calls, decimal history, the incremental compaction window, and good/bad conformance cases.
- Not applicable: the clauses that depend on the #558 write-back. See the SPEC. They are checked again after the write-back.
- Production integration, durable storage, real model compatibility, and performance remain outside this contract member.

The implemented `request-context-cordis-contract` depends on this package. The adapter on the coordinator side does not exist yet. See the [usage page](docs/context.md#现在的真实消费者).

## Usage

The root entry is: `@omne-harness/request-context-contract`. The root exports `createAssemblyOperations` and the stateless functions. The `./testing` entry exports non-durable doubles and conformance cases. A caller uses the operations in this order:

1. Prepare the source set: six group readers, the narrow adopted source, the history source, the conversion results, the read eligibility, and the Model preparation resources. Bind it with `createAssemblyOperations`, or get the operation group from `assembly(target)` of a source registry. Call `assemble` with an `AssemblyCall`.
2. If the result is a candidate, give it to Model for preparation, fix it, and save the adopted fact. The narrow adopted source reads it back as "adopted" in the next assembly.
3. If the result is "needs compaction", call `planCompaction` and `deriveStep`. Run each step and keep the progress. After you and the history holder commit the compaction transition, call `resume` with the current access.
4. If the result is "cannot fit", the failure goes back to the caller.

The [object model](docs/object-model.md#调用方怎样使用) gives the pseudocode. The [usage page](docs/context.md#使用方式) gives the independent path and the hosted path.

Independent use needs only this package. It needs no coordinator, no history holder, and no Cordis. The package has no `./cordis` entry. Cordis integration lives in other members of the group. See the [Cordis page](docs/cordis.md).

## Contracts

- `src/index.ts` owns the public shapes. It exports the public types and pure operations.
- The [SPEC](SPEC.md) owns behavior beyond the types: clauses RQ-01 to RQ-15, layout rules R1 to R9, and history source rules H1 to H5.
- The [API page](docs/public-api.md) indexes the exports.
- The [object model](docs/object-model.md) owns identity, owners, and lifecycle of each object.

One assembly has exactly four outcomes: candidate that still passes the extension position, candidate that can be fixed, needs compaction, and cannot fit. Failures have three classes: not permitted, invalid, and unavailable. A result can also be unknown. An unknown limit is not a failure. A fixed part that exceeds the limit gives the outcome "cannot fit". It is not a failure. The compaction transition and the final request record are two joint commits. Neither happens inside this package. The package gives only the material. It holds no resources and has nothing to dispose.

## Design

The source separates value types, input validation, projection, prompt assembly, tool declarations, placement, representation, budgets, assembly phases, compaction planning and steps, and dependency ports. Dependencies between them go one way. The outside dependencies are the public values of model-contract, tool-contract, content-block, message, and runtime-context-contract. They are declared in `package.json`. The [architecture page](docs/architecture.md) explains the modules and the reasons. The [flows page](docs/flows.md) gives the six protocol flows. The [object model](docs/object-model.md) describes the objects.

## Configuration and operation

The package has no configuration, needs no environment, and reads no resources at run time. The compaction policy and the representation policy have configuration items, listed in [RQ-06](SPEC.md#rq-06-压缩共同结果与保护边界). Their defaults are only initial values. [request-context](../request-context/README.md) owns the numbers.

The caller supplies the source set and the two policy implementations. The source set has six group readers, the narrow adopted source, a `HistorySource` implementation, the RQ conversion result reader, the read eligibility, and the Model preparation resources. The caller also supplies a principal binding. The request bytes come from the materialized representation of the Model `rules.plan`. The package has no serializer port. The caller also fixes the final request, runs the compaction steps, keeps the plan progress, and commits the compaction transition together with the history holder. Access to data that the system hosts still follows the original source contract.

## Verification

From the repository root, run:

```sh
pnpm turbo run test --filter=@omne-harness/request-context-contract
```

In this directory, run `pnpm typecheck` for the type check. Tests cover the public inventory and pure operations. See [tests/](tests/README.md). The [obligation matrix](verification/rq11.md) distinguishes process checks from integration obligations. A passing structure check does not prove behavior.

## Maintenance

- When a public export changes, update the SPEC, the [API page](docs/public-api.md), the [src index](src/index.md), and the export test.
- A change can affect the input groups, the four outcomes, the three failure classes, the layer order, or the prefix break reasons. Then update the dependents in the group: request-context-cordis-contract, request-context, and request-context-cordis. Also update the adapter on the coordinator side. See the [field mapping](docs/context.md#字段对应).
- A new compaction policy or representation policy is a new implementation of a policy port. This package does not change.
- The [group page](../README.md) owns member relations and dependency direction. The responsible lead names the maintainer.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types, RQ-01 to RQ-15
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, dependencies, mechanisms and reasons
├── flows.md              Protocol flows F-RQ01 to F-RQ06
├── object-model.md       Objects, lifecycle, and states
├── public-api.md         Export entry and definition index
├── context.md            Independent use, neighbor handoff, field mapping, position
└── cordis.md             Why Cordis integration does not apply
src/                      Public definitions, Public types and pure operations
tests/                    Continuous tests, fixtures and negative conformance cases
schema/                   Empty, the package publishes no schema
verification/             models/ and proofs/, empty now
adr/                      Empty now
examples/                 Empty now
resources/                Empty now
acceptance/               Empty now, fixtures/ is also empty
```

Each directory has README.md for its role and current state, and index.md for navigation. See [index.md](index.md) for reading paths.
