# @omne-harness/legal-identity

[中文](README_ZH.md)

Module package for legal identity values. It parses, encodes, and compares account, organization, login-state, workspace, tenant, and scope-layer identities. It also combines a parsed organization and a parsed account into a tenant. It publishes the acting scope, which says whose facts an action belongs to, and the one `Access<P>` definition that the contract members share.

## Responsibility and status

This member owns legal identity text, equality, tenant combination, and the single `IDENTITY_TYPE_NAMES` list. It also owns `ActingScope` and `Access<P>`. The location `packages/common/legal-identity` is the adopted target from the common-group README.

Issue #243 implemented the public entry with five codecs, five equality functions, `tenant()`, and `IDENTITY_TYPE_NAMES`. Issue #659 adds `ActingScope` with its constructors, codec and equality function, and `Access<P>` with its constructor. The basis is the 2026-10-23 decision record of #638 (two principal forms, one `Access<P>` definition, no expressible empty tenant). Issue #679 adds the `WorkspaceId` family with its codec and equality function. The basis is item J11 of the 2026-10-23 decision record of #638. The workspace domain owns the meaning of a workspace identity. This package owns its text form as the sixth legal identity family. The common-group README records this member as implemented. The exact text rules stay on this page.

A successful parse does not mean that the object exists, that the membership is valid, or that authorization allows the operation. Account registration, authentication, warrants, membership, roles, authorization, clocks, and session behavior stay with their owners. Workspace existence, participation, and association stay with the workspace contract. This package does not import the JSON reader, a database, Cordis, an identity service, or either legacy tree.

## Usage

Import the public entry by package name. Dependencies are empty. The package has no Cordis entry.

```ts
import { accountCodec, organizationCodec, tenant, tenantCodec } from '@omne-harness/legal-identity'

const account = accountCodec.parse('acc_abcdefghjkmnpqrstvwxyz2345')
const organization = organizationCodec.parse('org_abcdefghjkmnpqrstvwxyz2345')
if (!account.ok || !organization.ok) throw new Error('not a legal identity')

const pair = tenant(organization.value, account.value)
tenantCodec.encode(pair)
// { ok: true, value: '{"organization":"org_abcdefghjkmnpqrstvwxyz2345","account":"acc_abcdefghjkmnpqrstvwxyz2345"}' }
```

| Export | Use |
| --- | --- |
| `accountCodec`, `organizationCodec`, `loginStateCodec`, `workspaceCodec`, `tenantCodec`, `scopeLayerCodec` | Each codec is `{ parse, encode }` for one family |
| `accountEquals`, `organizationEquals`, `loginStateEquals`, `workspaceEquals`, `tenantEquals`, `scopeLayerEquals` | Compare two values of one family by value |
| `tenant(organization, account)` | Combine a parsed organization and a parsed account |
| `IDENTITY_TYPE_NAMES` | The six identity type names, for static checks |
| `ActingScope` | Whose facts an action belongs to: `{ kind: 'tenant', tenant }` or `{ kind: 'system' }` |
| `tenantScope(tenant)`, `systemScope()` | Build the two scopes. A tenant scope needs a parsed tenant |
| `actingScopeCodec`, `actingScopeEquals` | `{ parse, encode }` and value comparison for acting scopes |
| `Access<P>` | The access basis of one call: `Readonly<{ principal: P; tenant: TenantId }>`. The contract members re-export it |
| `access(principal, tenant)` | Build an access basis from a principal and a parsed tenant |

`package.json` `files` publishes `dist` only. The root export puts `source` before `types`. `source` points to `src/index.ts`, and `types` and `import` point to `dist`. [Package organization](../../../docs/package-organization.md) owns that shape. `build` deletes `dist` before `tsc`. `tsconfig.build.json` sets `erasableSyntaxOnly`.

## Contracts

The semantic source is the common-group README and the accepted #221 design. This section states the exact text forms and failure codes that this package implements. The group README lists `acc_`, `org_`, and `lgn_`. They come from the accepted #221 sketch. `wsp_` comes from the decision of #679. The group README does not list it yet.

Every `parse` and `encode` returns a result and does not throw. Success is `{ ok: true, value }`. Failure is `{ ok: false, error: { kind: 'identity-text-error', code } }`. Parse does not trim and does not fold case.

An atomic identity is a family prefix plus 26 characters from `0123456789abcdefghjkmnpqrstvwxyz`. The alphabet has no `i`, `l`, `o`, or `u`.

| Type | Prefix |
| --- | --- |
| `AccountId` | `acc_` |
| `OrganizationId` | `org_` |
| `LoginStateId` | `lgn_` |
| `WorkspaceId` | `wsp_` |

Atomic parse applies these checks in order. The first failed check gives the code.

1. A value that is not a string is `type`.
2. Empty text is `lexicon`.
3. A space, tab, or newline as the first or last character is `whitespace`.
4. Any character from `A` to `Z` is `case`.
5. Text that does not start with the family prefix is `family`. For example, `a` is `family`, and an account text parsed as an organization is `family`.
6. A body with the wrong length, or with a character outside the alphabet, is `lexicon`.

Tenant text is a JSON object with exactly the `organization` and `account` members.

1. Input that is not a string, text that is not JSON, `null`, an array, or another non-object is `type`.
2. A missing `organization` or `account` is `missing-member`.
3. Any other member, for example `role`, is `extra-member`.
4. Each member must be a legal text of its family. The atomic codes apply.

Tenant encode writes `organization` before `account`. For a duplicate key, `JSON.parse` keeps the last value. This package does not reject duplicate keys.

Scope layer text has one of two forms.

- `{"layer":"organization","organization":"<organization text>"}`
- `{"layer":"tenant","tenant":{"organization":"<organization text>","account":"<account text>"}}`

Scope layer parse applies these checks in order.

1. Input that is not a string, text that is not JSON, `null`, an array, or another non-object is `type`.
2. A missing `layer` is `missing-member`.
3. A `layer` value other than `organization` or `tenant` is `family`. This includes `session`, `workspace`, `account`, and `factoryDefault`.
4. The object must have exactly `layer` and the member with the same name as the layer. A missing member is `missing-member`. Any other member is `extra-member`.
5. An `organization` member follows the atomic rules. A `tenant` member follows the tenant text rules, so a tenant that is not an object is `type`.

Acting scope text has one of two forms.

- `{"kind":"system"}`
- `{"kind":"tenant","tenant":{"organization":"<organization text>","account":"<account text>"}}`

Acting scope parse applies these checks in order.

1. Input that is not a string, text that is not JSON, `null`, an array, or another non-object is `type`.
2. A missing `kind` is `missing-member`.
3. A `kind` value other than `system` or `tenant` is `family`.
4. A `system` object has exactly `kind`. A `tenant` object has exactly `kind` and `tenant`. A missing member is `missing-member`. Any other member is `extra-member`. A `system` object with a `tenant` member is `extra-member`.
5. A `tenant` member follows the tenant text rules.

There is no form with an empty or default tenant. The type has no third variant, and the system variant has no `tenant` member, so the type checker rejects `{ kind: 'tenant' }` and `{ kind: 'system', tenant }`.

`tenantScope()` throws `TypeError` unless its argument is a parsed tenant. `systemScope()` returns the one frozen system scope. `actingScopeEquals` is `true` for two system scopes, and for two tenant scopes whose tenants are equal by `tenantEquals`.

`Access<P>` is `Readonly<{ principal: P; tenant: TenantId }>`. `P` has no constraint: the assembly chooses the principal type, and this package does not judge it. `access()` throws `TypeError` unless `tenant` is a parsed tenant; it keeps the principal as given and freezes the result. A successful `access()` proves nothing about the principal. The verifier of the principal's owner does that.

`parse` and `tenant()` create the six identity families listed in `IDENTITY_TYPE_NAMES`. These values are frozen plain data with a `name` field. `ActingScope` values instead have a `kind` field and no `name` field. Their constructors are `actingScopeCodec.parse`, `tenantScope()` and `systemScope()`. A hand-built object such as `{ name: 'AccountId', text }` can still pass the type checker, because the accepted design has no compile-time brand. At run time, `encode` returns `type` for that object, and every equality function returns `false`. A value of a different family gets the same result.

`tenant()` throws `TypeError` unless its arguments are a parsed organization and a parsed account, in that order. It does not parse text and has no role parameter. A tenant holds no role, so a role change cannot change the tenant.

Two parses of one text give two objects. The equality function of that family returns `true` for them. `IDENTITY_TYPE_NAMES` is `AccountId`, `OrganizationId`, `LoginStateId`, `WorkspaceId`, `TenantId`, and `ScopeLayerIdentity`, in that order. `LoginIdentifier` is an account attribute. It is not an identity type name.

## Design

`src/index.ts` is the only module. `ACCOUNT_SPEC`, `ORGANIZATION_SPEC`, `LOGIN_STATE_SPEC`, and `WORKSPACE_SPEC` each hold `name` and `prefix`. `IDENTITY_SPECS` is those four rows, then the `TenantId` row, then the `ScopeLayerIdentity` row. Those last two rows hold only `name`. A row with `prefix` is atomic. `IDENTITY_TYPE_NAMES` comes from that table in row order, and the four atomic codecs read their prefix from their spec. A new atomic family is a new row, not a new prefix check.

A module-private `WeakSet` records each value that `parse` or `tenant()` returns. `encode`, the equality functions, and `tenant()` accept a value only if the set holds it and its `name` is the expected family. Each value is frozen before the set records it, so a recorded value cannot change its family or text. The `WeakSet` does not keep a value alive. #221 rejected a unique-symbol brand, so this record is the only mint check.

Tenant parse and scope-layer parse share one member check for JSON objects. A tenant layer parses its inner tenant with the tenant rules. `parseTenantValue` calls `mintTenant`. The scope-layer tenant branch calls `parseTenantValue`. `mintTenant` freezes the tenant and records it. It does not throw. `tenant()` rejects an argument that was not minted, then calls `mintTenant`.

## Configuration and operation

This package reads no environment variable and does not create an account, a credential, a clock, or a process.

The mint record belongs to one loaded copy of the module. A value does not keep its mint through JSON, a structured clone, a worker message, or another process. A second installed copy of the package does not accept values from the first copy. To move a value across one of those boundaries, send its encoded text and parse it on the other side.

## Verification

Applicable tests are unit tests and contract tests from the public entry. The tests import the package by name. That name resolves to `dist/index.js`, so the tests also check independent consumption of the build. Integration tests and end-to-end journey tests do not apply. This package has no storage, identity service, or user journey. Consumer and authorization tests stay with their owners.

| File | Covers |
| --- | --- |
| `tests/atomic-identity.spec.ts` | Round trip, `family`, `lexicon`, `case`, `whitespace`, reparse equality, and hand-built or wrong-family values |
| `tests/tenant.spec.ts` | `tenant()`, tenant text, `role`, missing members, non-object input, reparse equality, and a hand-built tenant |
| `tests/scope-layer.spec.ts` | Organization and tenant layers, rejected layer names, inner tenant rules, equality, and a hand-built layer |
| `tests/identity-type-names.spec.ts` | The name list and the absence of `LoginIdentifier` |
| `tests/codec-variance.spec-d.ts` | Assigning `accountCodec` to the account and organization union codec is a type error |

Run `pnpm turbo run test --filter=@omne-harness/legal-identity` from the repository root. turbo builds `dist` and then runs the tests. `pnpm test` in this directory does not build. Run `pnpm turbo run typecheck --filter=@omne-harness/legal-identity` to check the tests against the source types.

`tests/acting-scope.spec.ts` covers the two scopes, the text forms and their failure codes, equality, and a hand-built scope. `tests/acting-scope.spec-d.ts` checks that a tenant scope without a tenant, a system scope with a tenant, and a third kind are type errors. `tests/access.spec.ts` covers `access()` with a parsed and a hand-built tenant. `tests/access.spec-d.ts` checks that an access without a tenant is a type error and that the definition is exactly `Readonly<{ principal: P; tenant: TenantId }>`. `tests/public-entry.spec.ts` lists the exports, so a diff of that list shows what a change adds.

The tests do not cover a type-level ban on hand-built objects, because the accepted design allows them to typecheck. They do not cover duplicate JSON keys or two loaded copies of the package. `Access<P>` has no copies to compare: `agent-contract`, `tool-contract`, `model-contract`, `execution-environment-contract` and `request-context-contract` re-export the definition of this package.

## Maintenance

These consumers declare a dependency on this package in their package manifests: `agent-contract`, `agent-cordis-contract`, and `agent` in the agent group; `request-context-contract`, `runtime-context-contract`, and `runtime-context-cordis-contract` in the context group; `execution-environment-contract`, `execution-environment`, and `execution-environment-host-local` in the execution group; `model-contract`, `model-cordis-contract`, `model`, and `model-host-local` in the model group; `tool-contract` and `tool-cordis-contract` in the tool group; and the `identity-shapes` check in `tools/product-checks`. The check imports `IDENTITY_TYPE_NAMES` from this package. `packages/identity/identity` and `packages/identity/authorization` declare the dependency since #659. The design names `packages/session/session` as a user of this package, but its manifest does not declare the dependency. The contract members that wrote their own `Access<P>` (`agent-contract`, `tool-contract`, `execution-environment-contract`, `model-contract`, `request-context-contract`) are the consumers of the shared definition; their change to a re-export is their own delivery. #220 receives a `{ parse, encode }` pair and does not import a parser file. The consumers of `workspaceCodec` are `tool-contract` (`SourceLayer.workspace` and `FixedToolRequest.workspace`) and `session-contract` (the creation and the `workspace` change). The migration card is #837.

To add an atomic family, declare its spec constant, include that row in `IDENTITY_SPECS`, then add its type, codec, equality function, and tests. That change also changes `IDENTITY_TYPE_NAMES`, so synchronize the `identity-shapes` owner. A change to a prefix, the alphabet, a failure code, or the check order changes the public contract. Synchronize the named consumers and the common-group README before you change it.
