# @omne-harness/identity-sql

[中文](README_ZH.md)

The persistent identity provider. Accounts, credentials, personal organizations, memberships and logins live in the system transaction domain `system.identity` of the SQL storage contract. A credential is kept as scrypt material only. This member implements the three operations and the standing read of the [identity contract](../identity/SPEC.md) and ships a `./cordis` plugin.

## Responsibility and status

This member exists by the [DP-3 decision record](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6561478373). It is the persistent provider of identity SPEC ID-16 (tenant standing) and ID-17 (register and activate, issue login, recognize login). Its consumer is the `identity` row of `apps/harness-server` (APP-4b), which reaches it through the two service keys `identityOperations` and `tenantStanding` of `@omne-harness/identity/cordis`.

Implemented and verified: one-transaction registration, issue and recognition, the standing read, records that survive a restart, the answers after `stop()`, the `./cordis` plugin. Not implemented: tenant switch, logout, revocation, invitations, credential change and pending registration (not in M2). Pending confirmation: the personal organization uses `default-team` revision `'1'`, see [SPEC IS-02](SPEC.md#is-02).

## Usage

Independent use:

```ts
import { openScrypt, SCRYPT_PROFILE } from '@omne-harness/scrypt'
import {
  createIdentitySql,
  identitySqlMaterials,
  identitySqlRegistration,
} from '@omne-harness/identity-sql'

// storage is a SqlStorage whose catalog holds the materials of identitySqlMaterials().
await storage.registerCombination(identitySqlRegistration())
const scrypt = openScrypt(SCRYPT_PROFILE)
if (!scrypt.ok) throw new Error(scrypt.code)
const decoy = scrypt.module.derive('<random secret>', () => ({ ok: true }))
const sql = createIdentitySql({
  storage,
  clock, // IdentityClock
  terms, // LoginTermsSource
  scrypt: scrypt.module,
  decoyMaterial: /* the material of decoy.done */ '',
})
await sql.operations.registerAndActivate({ loginIdentifier: 'ada', credential: '...' })
sql.stop()
await scrypt.module.close()
```

The factory reads no wall clock, opens no scrypt module, registers nothing and closes nothing. The caller registers the combination first, and at the end calls `stop()` before it closes the scrypt module.

Cordis: `@omne-harness/identity-sql/cordis` exports `IdentitySqlPlugin`. It injects `storage` only. Its configuration is `{ maxLifetime, idlePeriod }`, two `PT<seconds>S` texts, with `IDENTITY_SQL_DEFAULT_CONFIG` (30 days and 7 days) as the first value. The plugin body opens scrypt, derives the decoy, registers the combination, builds the provider over the system clock and provides the two keys. See [docs/cordis.md](docs/cordis.md).

The application aggregates `identitySqlMaterials()` into its storage catalog. Without that, the participant and the read handlers are not available.

## Contracts

The public types are in `src/index.ts`, indexed in [docs/public-api.md](docs/public-api.md). The outcome types of the operations and of the standing read belong to the identity contract and are not copied here. The behavior of this member is in [SPEC.md](SPEC.md): records and combination (IS-01), one-transaction registration and input bounds (IS-02), secrets kept derived only (IS-03), issue (IS-04), recognition (IS-05), standing (IS-06), after stop (IS-07), after restart (IS-08).

Errors: every outcome is a return value. Only a write whose result cannot be determined rejects the promise, with the error class `IdentitySqlResultUnknown`. Lifecycle and resource responsibilities are in the SPEC section on ownership, failure and lifecycle.

## Design

`src/provider.ts` holds the stop flag and the latest adopted clock reading and does every computation that is not SQL. The participant and the read handlers in `src/worker/` only run statements. `src/materials.ts` defines the participant, the migration, the read handlers, the transaction domain and the combination version in one place. `src/cordis.ts` connects the factory to Cordis. The full design is in [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The configuration is the two lifetimes, owned by the `identity` row of the assembly. The scrypt parameters are fixed to `SCRYPT_PROFILE`, a registered IC-14 deviation, see SPEC known limitation 3. Requirements: Node 24 or later, and a `storage` provider whose catalog holds the materials. The caller registers the combination and closes the storage. This member stops the provider and closes scrypt.

## Verification

In the member directory run `pnpm run build`, `pnpm run typecheck`, `NO_COLOR=1 pnpm exec vitest run --mode fast` and `NO_COLOR=1 pnpm exec vitest run --mode slow`. The tests import this member through `dist`, so build after a source change. The map from obligations to tests, the real dependencies and the uncovered parts are in [SPEC, composition and verification](SPEC.md#组合与验证) and [tests/README.md](tests/README.md).

## Maintenance

- Table shape: write a new migration module, never change the bytes of `001-identity`. Update the table names in `src/worker/schema.ts`, the read table lists in `materials.ts` and [docs/object-model.md](docs/object-model.md).
- Read handler input or output: update the types in `schema.ts`, the parse functions in `provider.ts` and the tests.
- Outcome mapping: change the SPEC clause and the test first, then `provider.ts`.
- Configuration fields: update `config.ts`, the Standard Schema in `cordis.ts`, the application row and the assembly page.
- Upgrade of identity, sql-contract or scrypt: run every test and check the SPEC table of consumed promises.

## Directory structure and documentation roles

```text
README.md, README_ZH.md   Entry: purpose, status, and this map
index.md                  Reading paths through the package
SPEC.md                   Behavior beyond the public types
documentation.json        Documentation registration
docs/                     Internal design, public use, and integration
├── architecture.md       Modules, state and resource ownership, mechanisms
├── flows.md              Registration, issue, recognition and standing flows
├── object-model.md       Tables, rows and the provider objects
├── public-api.md         Public boundary and definition index
├── context.md            Consumer use and position in the system
└── cordis.md             Plugin, IC conformance table and disposal
src/                      Factory, configuration, materials, plugin; worker/ holds the participant, the migration and the read handlers
tests/                    Continuous tests; fixtures/ holds the real sqlite-provider fixture and the child process script
schema/                   Not applicable: no external schema
verification/             Not applicable: no formal model or proof
adr/                      Not applicable: decisions are in the DP-3 record and the SPEC
examples/                 Not applicable: the example is in "Usage" above
resources/                Not applicable: no non-source resource
acceptance/               Reserved for the independent acceptance owner, no scenario yet
```

Each directory has README.md for its role and index.md for navigation. See [index.md](index.md) for reading paths.
