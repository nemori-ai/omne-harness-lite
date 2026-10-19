# @omne-harness/model

[中文](README_ZH.md)

## Responsibility and status

This member owns the design of the reusable Model domain implementation. It has the judgment of credential presence and resolution. Local custody belongs to [model-host-local](../model-host-local/README.md). Hosted runs and the factory are not implemented. Credential references and resolution have four owners: the custody implementation is in [model-host-local](../model-host-local/README.md), the contract is in [model-contract](../model-contract/README.md), the judgment is in this member, and the run factory and other hosts are not implemented. The public values, operations, and provider protocols belong to [model-contract](../model-contract/README.md). The framework definitions belong to [model-cordis-contract](../model-cordis-contract/README.md). Design, implementation, and run verification are judged separately.

## Usage

A standalone program or a host that selects this implementation starts from [consumption and construction](docs/context.md). The design of executeModel, createModelRuntime, and the construction parameters is accepted. For their exact shapes, see the [public API design](docs/public-api.md). They are not yet usable as import examples.

## Contracts

The [implementation specification](SPEC.md) owns the behavior of a single standalone execution and of the construction configuration. The implementation must satisfy the [shared specification](../model-contract/SPEC.md). It must not reduce the identity, sending, custody, and recovery guarantees of that specification.

## Design

The [design index](docs/index.md) covers architecture, flows, internal objects, public entries, consumption, and Cordis assembly. The host assembly design is held in [docs/cordis.md](docs/cordis.md). It does not correspond to any export of this member. model-host-local implements only local credential custody.

## Configuration and operation

The constructor takes Commands, the sending fence, the retry policy, the instance host, and the clock explicitly. The application selects and owns the adapters that it needs. It does not take business parameters from a global Context. The target run implementation does not depend on Cordis. The package manifest does not declare Cordis, proper-lockfile, or model-cordis-contract. The package has only the root entry. It has no `./cordis` and no `./execute`. The command `pnpm --filter @omne-harness/model run install-closure` packs this member, installs it in isolation, resolves the entries, and runs a scenario. It writes a report to the path of `--out`. For the way to run it and its scope, see the [test description](tests/README.md#安装闭包). This page does not record run results. The package does not install all vendors or vocabularies automatically.

## Verification

Run `pnpm --filter @omne-harness/model typecheck`, `pnpm --filter @omne-harness/model test`, and `make docs-check`. The current tests cover the credential judgment (including rejection of every tenant that was not minted), the export set of the root entry, the fact that the old subpaths do not resolve, and the fact that the manifest has no Cordis-type dependency. The tests of custody, persistence, and the Cordis plugin are in model-host-local. They do not show that hosted runs, streaming, or result custody are implemented. For the shared protocol and the type consumption duties, see the [contract verification](../model-contract/verification/index.md).

## Maintenance

When you change the construction or an algorithm, update the [documentation registration](documentation.json), the real consumers, and the verification. For resource navigation, see the [package index](index.md). Resources that are not implemented keep their actual status.

## Boundary with model-contract

The domain contract belongs to the [contract entry](../model-contract/docs/public-api.md). This member maintains only the implementation functions and the construction shapes. The [shared SPEC](../model-contract/SPEC.md) records the shared business behavior. This member does not change its scope and does not reduce its guarantees.

## Directory structure and documentation roles

The skeleton follows [RFC-0007](../../../docs/rfcs/RFC-0007-source-packages-and-templates.md) and the template `typescript-package@3.0.0` (see the [generated tree](../../../docs/package-organization.md#完整生成树)). A directory that does not apply to this package states in its README why it does not apply. A directory that exists does not mean that the function is implemented.

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
package.json              Package manifest
docs/                     Six topics: architecture, flows, object-model, public-api, context, cordis
src/                      Public definitions, validation, and implementation
tests/                    Continuous tests; fixtures/ holds test inputs
schema/                   External schemas
verification/             models/ and proofs/
adr/                      Implementation decisions with continuing consumers
examples/                 Examples against the public entry
resources/                Non-source runtime resources
acceptance/               Independent acceptance; fixtures/ holds its inputs
```

Each fixed directory has a README and an index. The source, build, and test configuration follow the actual files. Build output and dependency directories are not part of the documentation skeleton.

| Entry | Documentation role |
| --- | --- |
| [Design](docs/index.md) | Architecture, flows, objects, interfaces, consumption, and assembly |
| [Source](src/index.md) | Actual public exports and internal code |
| [Tests](tests/index.md), [fixtures](tests/fixtures/index.md) | Executable assertions and fixed inputs |
| [Schema](schema/index.md) | External data formats and published identity |
| [Continuing verification](verification/index.md), [models](verification/models/index.md), [proofs](verification/proofs/index.md) | Properties, assumptions, conformance, and verification resources |
| [Design decisions](adr/index.md) | Implementation choices with continuing consumers |
| [Examples](examples/index.md) | Runnable consumption |
| [Runtime resources](resources/index.md) | Assets, sources, and loading responsibility |
| [Independent acceptance](acceptance/index.md) | Independent scenarios, environments, and criteria |

## Standalone consumption entry

For the implemented exports of the credential judgment, see the [public entry](docs/public-api.md#已实现的凭据入口). For the way to call them, see the [consumption guide](docs/context.md#独立消费入口). For the use of the local vault and the plugin, see [model-host-local](../model-host-local/docs/context.md). The credential judgment has behavior tests. The acceptance of other run designs does not mean that they are implemented.
