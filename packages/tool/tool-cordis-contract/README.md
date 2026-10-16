# @omne-harness/tool-cordis-contract

[中文](README_ZH.md)

The Cordis service definitions of Tool. The `./cordis` entry exports 18 abstract Service classes, the 18 service keys, the `Context` augmentation, the `tool-cordis-contract/call-changed` event augmentation and the concrete instance directory `ToolInstancesService`. The root entry exports no values.

## Responsibility and status

This package is the only owner of the Tool service definitions. It exists as a separate package because its install closure contains `@deepseek-ai/cordis`, and the pure contract package `@omne-harness/tool-contract` must not. The definitions are implemented. The registration and query operations of `ToolInstancesService` return named failures until ticket 13 implements them. No provider in this package.

## Usage

A Cordis plugin that provides or consumes a Tool service imports the definition from `@omne-harness/tool-cordis-contract/cordis` and the types from `@omne-harness/tool-contract`. A provider extends the abstract class and does not provide the key again. Code that does not use Cordis depends only on `@omne-harness/tool-contract`.

## Contracts

Behavior belongs to the [contract SPEC](../tool-contract/SPEC.md). The service table, dependency classes, registration protocol and event rules belong to [docs/cordis.md](docs/cordis.md). Source navigation is in [docs/public-api.md](docs/public-api.md).

## Design

One module, [src/cordis.ts](src/cordis.ts). Each key constant comes from the `static provide` of exactly one class. The package depends on `tool-contract` for types and on no Tool implementation. Dependency direction: `tool-host-local` → {`tool`, `tool-cordis-contract`} → `tool-contract`.

## Configuration and operation

No configuration. The package holds no state and starts no resource. Lifecycle belongs to the plugins that extend the definitions.

## Verification

`pnpm --filter @omne-harness/tool-cordis-contract test` builds the package and runs the tests. The tests check each key against its class, the import graph of `./cordis`, the manifest, and the definitions under real Cordis 4.0.4. They do not cover any provider behavior.

## Maintenance

A change to a Service, key or event changes every plugin that extends or listens to it: `tool-host-local` and the Cordis pages of Agent, Session and the integration page. Keep [docs/cordis.md](docs/cordis.md) and the key table test in step with the source.
