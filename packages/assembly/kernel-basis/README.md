# @omne-harness/kernel-basis

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft cordis-module package.
## Responsibility and status

<!-- documentation:placeholder -->

Describe actual consumers, platforms, responsibility, and adoption basis. Separate implemented, pending, and unverified behavior.

## Usage

<!-- documentation:placeholder -->

Give a working example, dependencies, and initialization and disposal responsibilities. Distinguish independent use from Cordis integration. Check public exports, source value dependencies, generated declarations, runtime startup, and the installation closure separately. A ./cordis entry does not prove independent installation.

## Contracts

<!-- documentation:placeholder -->

Link public types, necessary validation, and the sole behavior owner. SPEC.md owns behavior beyond types. Identify error, lifecycle, and resource responsibilities without copying signatures or state machines.

## Design

<!-- documentation:placeholder -->

Describe internal modules, data flow, control flow, and invariant owners. Split complex mechanisms into pages for actual reading tasks.

## Configuration and operation

<!-- documentation:placeholder -->

Describe configuration owners, defaults, environment requirements, and explicit dependencies. State the caller and package responsibilities during operation.

## Verification

<!-- documentation:placeholder -->

List repeatable commands, properties, assumptions, and uncovered behavior. Add tests with actual assertions. Passing structure checks does not establish business behavior.

## Maintenance

<!-- documentation:placeholder -->

Identify consumers and checks that must change with public contracts, resources, or dependencies. Explain inapplicable information. Record named gaps for unknown information.
默认测试责任是单元和契约。`tests/public-entry.spec.ts` 从包名核对当前公开导出。集成测试和端到端测试不适用：本包还没有具体存储、应用服务或关键用户旅程。
