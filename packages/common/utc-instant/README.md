# @omne-harness/utc-instant

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft module package. Issue #244 owns the behavior.

## Responsibility and status

This member owns UTC instants, SI durations, and `compareInstants`. The location `packages/common/utc-instant` is the adopted target from the common-group README.

Implemented today: the RFC-0003 package files, the module variant, and an empty public entry. Pending: parsing, encoding, exact comparison, and the leap-second table. Those belong to #244. This package does not provide a persistent business clock, a `Date.now` default, a database, or a legacy import. Comparison must not go through `Date` or `Number` once #244 implements it.

## Usage

There is no working call yet. `src/index.ts` exports nothing. Dependencies are empty. The package has no Cordis entry.

`package.json` `files` publishes `dist` only. `build` deletes `dist` before `tsc`. `tsconfig.build.json` sets `erasableSyntaxOnly`. The source-condition export is absent because that condition name is not decided.

## Contracts

The behavior owner is the common-group README and the accepted #221 decision. This README does not copy the leap-second rules. `P1D` is not a duration. A civil date, a time zone plan, and a business deadline stay different values. #244 implements the contract and records the leap-second data version.

## Design

No internal modules yet. Wall clock, monotonic clock, and business clock remain three read ports. This package does not implement those ports.

## Configuration and operation

This package reads no environment variable and does not wait on a wall clock. Leap-second data, when #244 adds it, is an owned resource of this member, with a source, a version, and an expiry.

## Verification

Applicable tests are unit tests, contract tests from the public entry, a check of the leap-second source once that resource exists, and an independent-consumption check. Integration tests and end-to-end journey tests do not apply. This package does not prove a persistent clock or a physical clock.

No test file is in this draft. An assertion with nothing to observe would not count as those tests. #244 adds the tests with the implementation. Run `pnpm test` and `pnpm build` from this directory once that work exists.

## Maintenance

Named consumers are `packages/identity/identity` and `packages/tool/tool`. Business deadlines and lease recovery stay with their owners. A change to `compareInstants` changes #244 and those consumers together.
默认测试责任是单元和契约。`tests/public-entry.spec.ts` 从包名核对当前公开导出。集成测试和端到端测试不适用：本包还没有具体存储、应用服务或关键用户旅程。
