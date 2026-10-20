# @omne-harness/tool-cordis-contract

[中文](README_ZH.md)

The Cordis service definitions of Tool. The `./cordis` entry exports 17 abstract Service classes and the concrete instance directory `ToolInstancesService`, 18 Service classes in all. It also exports the 18 service keys, the `Context` augmentation and the `tool-cordis-contract/call-changed` event augmentation. The `./testing` entry exports the registration-semantics suite of `ToolInstancesService.register` and a non-durable register service that conforms to it. The root entry exports no values.

## Responsibility and status

This package is the only owner of the Tool service definitions. It exists as a separate package because its install closure contains `@deepseek-ai/cordis`, and the pure contract package `@omne-harness/tool-contract` must not. The definitions are implemented. `ToolInstancesService.register` answers `unavailable` and `ToolInstancesService.connect` answers `unsupported` until the instance directory implements them. No provider in this package. The registration suite is ready before the registration is: the real directory runs the same suite when the instance directory implements `register`. The suite and its double prove the registration semantics of the clause only. They do not prove the real service, and they do not run under real Cordis.

## Support range

The checkout scope and the cross-package table are in [the group support range](../README.md#支持范围). This section states the part of this package. The verification scope tells what the tests check. It does not tell that behavior outside the tests holds.

| Tier | State in this package | Entry | Verification scope |
| --- | --- | --- | --- |
| Public types exported | Exported: 17 abstract Service classes and the concrete class `ToolInstancesService`, 18 in all, the 18 service keys, the `Context` augmentation, the `tool-cordis-contract/call-changed` event augmentation and the registration types | `./cordis`. The root entry exports no values | `tests/public-entry.spec.ts` and `tests/cordis-entry.spec.ts` check each key against its class, the import graph and the manifest. They load the definitions under real Cordis 4.0.4 |
| Pure contract functions implemented | None. The package has no contract function | None | None |
| Independent execution implemented | None | None | None |
| Runtime paths implemented | None. The package has no runtime. The one concrete service, `ToolInstancesService`, answers the named failures above | None | Tests cover only the named failures of `ToolInstancesService` |
| Hosts and providers not yet delivered | The instance directory behind `ToolInstancesService`. The provider plugins of Tool itself, which live in `./cordis` of `tool-host-local`. Providers of other domains belong to their owners. The registration semantics under real Cordis | None | None |

The `./testing` entry delivers the registration-semantics suite and a non-durable register service. Both run only against each other and against violating variants. The real-implementation cross-check is pending: it needs the implementation of the instance directory and a real Cordis assembly.

## Usage

A Cordis plugin that provides or consumes a Tool service imports the definition from `@omne-harness/tool-cordis-contract/cordis` and the types from `@omne-harness/tool-contract`. A provider extends the abstract class and does not provide the key again. Code that does not use Cordis depends only on `@omne-harness/tool-contract`. An implementation of `register` takes `toolRegistrationConformance` from `@omne-harness/tool-cordis-contract/testing`. It writes a fixture factory that returns the register service, a tenant, the authority evidence and the control handles it can give (`asFiber`, `endFiber`, `refuseCheck`, `listing`, `checkedAgainst`, `renewedAuthority`, and `otherTenant` with `otherAuthority` for the cases of two tenants), and it registers each case in its own test framework. The case type, `NotApplicable` and `runConformanceCase` are those of `@omne-harness/tool-contract/testing`. A case whose handle is missing reports not applicable, and that is not a pass.

## Contracts

Behavior belongs to the [contract SPEC](../tool-contract/SPEC.md). The service table, dependency classes, registration protocol and event rules belong to [docs/cordis.md](docs/cordis.md). Source navigation is in [docs/public-api.md](docs/public-api.md).

## Design

Two modules. [src/cordis.ts](src/cordis.ts) is the `./cordis` entry. [src/testing.ts](src/testing.ts) is the `./testing` entry: the suite, the double and the fixture. It imports the types of `./cordis` only as types, so it loads no Cordis at run time. Each key constant comes from the `static provide` of exactly one class. The package depends on `tool-contract` for types and on no Tool implementation. Dependency direction: `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`.

## Configuration and operation

No configuration. The package holds no state and starts no resource. Lifecycle belongs to the plugins that extend the definitions.

## Verification

The fast tier is `pnpm turbo run test:fast --filter=@omne-harness/tool-cordis-contract`. The slow tier is `pnpm turbo run test:slow --filter=@omne-harness/tool-cordis-contract`. turbo builds the package and its dependencies first, then runs the tests of the tier. The tests check each key against its class, the import graph of `./cordis`, the manifest, and the definitions under real Cordis 4.0.4. `tests/registration-conformance.spec.ts` proves the registration suite. The suite passes on the conforming double. Each of its 20 cases fails under a register service with one rule broken. Each assertion that carries a rule of its own has a violating variant. The compiler guards the assertions that only narrow a type. The table that maps each assertion to its violating variants is in [tests/README](tests/README.md#断言与违约变体的对应). Tests cover only the named failures of `ToolInstancesService`, which returns only named failures for now.

## Maintenance

A change to a Service, key or event changes every plugin that extends or listens to it: `tool-host-local` and the Cordis pages of the consumers and the integration page. Keep [docs/cordis.md](docs/cordis.md) and the key table test in step with the source.

ToolRuntimeService projects the ordinary invoke and the queries, commands, instances, content and catalog interfaces. Its source of truth is ToolRuntime in tool-contract. Trusted admission and responses remain on ToolCommandsService. This service definition adds no provider or lifecycle guarantee.
