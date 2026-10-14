# @omne-harness/json-text

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft module package. Issue #242 owns the behavior.

## Responsibility and status

This member is the common JSON text reader. The accepted contract is the architecture section "公共 JSON 文本读取". The leaf name `json-text` was chosen on this branch because #242 had not fixed a name and forbade guessing one from a legacy directory.

Implemented today: the RFC-0003 package files, the module variant, and an empty public entry. Pending: `readJsonBytes`, `readJsonText`, budgets, and failure results. Those belong to #242. This package does not import Cordis, identity, time, or either legacy tree.

## Usage

There is no working call yet. `src/index.ts` exports nothing. Dependencies are empty. The package has no Cordis entry.

`package.json` `files` publishes `dist` only. `build` deletes `dist` before `tsc`. `tsconfig.build.json` sets `erasableSyntaxOnly`. The source-condition export is absent because that condition name is not decided.

## Contracts

The behavior owner is the architecture section linked from `packages/common/README.md`. This README does not copy the signature or the failure list. #242 implements that contract. A successful read does not mean an object exists or that the caller is allowed to use it.

## Design

No internal modules yet. The reader stays a pure function. Field codecs stay with the shape owner and run only after a successful read.

## Configuration and operation

`limits` has no default. This package reads no environment variable and does not create a clock, a database, or a process.

## Verification

Applicable tests are unit tests, contract tests from the public entry, and an independent-consumption check. Integration tests and end-to-end journey tests do not apply. This package has no storage, service, or user journey.

No test file is in this draft. An assertion with nothing to observe would not count as those tests. #242 adds the tests with the implementation. Run `pnpm test` and `pnpm build` from this directory once that work exists.

## Maintenance

Consumers are later configuration readers, protocol decoders, and persistence readers. They are not implemented in this package. A change to the public read result changes #242 and those consumers together.
默认测试责任是单元和契约。`tests/public-entry.spec.ts` 从包名核对当前公开导出。集成测试和端到端测试不适用：本包还没有具体存储、应用服务或关键用户旅程。
