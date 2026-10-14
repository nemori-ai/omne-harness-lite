# @omne-harness/legal-identity

PACKAGE_TEMPLATE_DRAFT
[中文](README_ZH.md)

Draft module package. Issue #243 owns the behavior.

## Responsibility and status

This member owns legal identity text, equality, tenant combination, and the single `IDENTITY_TYPE_NAMES` list. The location `packages/common/legal-identity` is the adopted target from the common-group README.

Implemented today: the RFC-0003 package files, the module variant, and `IDENTITY_TYPE_NAMES`. Pending: family parse, encode, equality, and `tenant()`. Those belong to #243. This package does not import the JSON reader, a database, Cordis, an identity service, or either legacy tree. A successful parse does not mean the object exists, the membership is valid, or the operation is allowed.

## Usage

`IDENTITY_TYPE_NAMES` is the only export. Parse and `tenant()` are not implemented. Dependencies are empty. The package has no Cordis entry.

`package.json` `files` publishes `dist` only. `build` deletes `dist` before `tsc`. `tsconfig.build.json` sets `erasableSyntaxOnly`. The source-condition export is absent because that condition name is not decided.

## Contracts

The behavior owner is the common-group README and the accepted #221 decision. This README does not copy the family grammar. #243 implements that contract. `LoginIdentifier` stays an account attribute and is not an identity type name.

## Design

No internal modules yet. Parsing is the only way to construct a legal value. A type assertion is not that path.

## Configuration and operation

This package reads no environment variable and does not create an account, a credential, a clock, or a process.

## Verification

Applicable tests are unit tests, contract tests from the public entry, and an independent-consumption check. Integration tests and end-to-end journey tests do not apply. This package has no storage, identity service, or user journey. Session and authorization tests stay with their owners.

No test file is in this draft. An assertion with nothing to observe would not count as those tests. #243 adds the tests with the implementation. Run `pnpm test` and `pnpm build` from this directory once that work exists.

## Maintenance

Named consumers are `packages/identity/identity`, `packages/session/session`, and the `identity-shapes` check in `tools/ts-checks`. The check imports `IDENTITY_TYPE_NAMES` from this package. Parse, encode, and `tenant()` stay with #243.

Applicable tests are the unit and contract check in `tests/identity-type-names.spec.ts`. It imports this package by name. Integration tests and end-to-end tests do not apply. This package has no storage, application service, or user journey.
