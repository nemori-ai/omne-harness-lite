# @omne-harness/identity-sql

[中文](README_ZH.md)

The persistent identity provider. Accounts, credentials, organizations, memberships, invitations and logins live in the system transaction domain `system.identity` of the SQL storage contract. A credential is kept as scrypt material only. This member implements the three operations, the standing read and the governance port of the [identity contract](../identity/SPEC.md) and ships a `./cordis` plugin.

## Responsibility and status

This member exists by the [DP-3 decision record](https://github.com/nemori-ai/omne-harness-lite/issues/978#issuecomment-6561478373). It is the persistent provider of identity SPEC ID-16 (tenant standing), ID-17 (register and activate, issue login, recognize login) and ID-18 (the governance port). Its consumer is the `identity` row of `apps/harness-server` (APP-4b), which reaches it through the three service keys `identityOperations`, `tenantStanding` and `identityGovernance` of `@omne-harness/identity/cordis`.

Implemented and verified: one-transaction registration, issue and recognition, the standing read, team creation, invitations and their dispositions, leaving, member removal and role change, the current tenant switch, login revocation and logout, the list of own valid logins, the idle deadline refresh, records that survive a restart, the upgrade from migration 001 to 002, the answers after `stop()`, the `./cordis` plugin. Not implemented: credential change, organization affiliation and pending registration (not in this stage). Pending confirmation: the personal organization uses `default-team` revision `'1'`, see [SPEC IS-02](SPEC.md#is-02).

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
  invitationTerms, // InvitationTermsSource
  scrypt: scrypt.module,
  decoyMaterial: /* the material of decoy.done */ '',
})
await sql.operations.registerAndActivate({ loginIdentifier: 'ada', credential: '...' })
sql.stop()
await scrypt.module.close()
```

The factory reads no wall clock, opens no scrypt module, registers nothing and closes nothing. The caller registers the combination first, and at the end calls `stop()` before it closes the scrypt module.

Cordis: `@omne-harness/identity-sql/cordis` exports `IdentitySqlPlugin`. It injects `storage` and `identityClock`. Its configuration is two login lifetimes, `maxLifetime` and `idlePeriod`, the access refresh granularity `accessRefreshGranularity`, and two invitation durations, `invitationDefaultDuration` and `invitationMaxDuration`, all `PT<seconds>S` texts. All five are required: without one, the fiber fails. The granularity must be shorter than `idlePeriod`: an access report within it of the last refresh writes nothing. `IDENTITY_SQL_DEFAULT_CONFIG` lists the first values for a deployment that passes them: logins of 30 days and 7 days idle, one refresh per hour at most, invitations of 7 days by default and 30 days at most. The plugin body opens scrypt, derives the decoy, registers the combination, builds the provider over the injected clock and provides five keys. See [docs/cordis.md](docs/cordis.md).

The application aggregates `identitySqlMaterials()` into its storage catalog. Without that, the participant and the read handlers are not available.

## Contracts

The public types are in `src/index.ts`, indexed in [docs/public-api.md](docs/public-api.md). The outcome types of the operations, the standing read and the governance port belong to the identity contract and are not copied here. The behavior of this member is in [SPEC.md](SPEC.md): records and combination (IS-01), one-transaction registration and input bounds (IS-02), secrets kept derived only (IS-03), issue (IS-04), recognition (IS-05), standing (IS-06), after stop (IS-07), after restart (IS-08), migration 002 and the upgrade (IS-09), governance writes and reads (IS-10, IS-11), revocation and the current selection (IS-12), organizations, invitations and lists (IS-13), the idle refresh (IS-14), the invitation durations (IS-15).

Errors: every outcome is a return value. Only a write whose result cannot be determined rejects the promise, with the error class `IdentitySqlResultUnknown`. Lifecycle and resource responsibilities are in the SPEC section on ownership, failure and lifecycle.

## Design

`src/provider.ts` holds the stop flag and the latest adopted clock reading and does the computations of the operations and the standing read that are not SQL. `src/governance.ts` is the governance port over the same instance's storage, clock and stop flag. The participant and the read handlers in `src/worker/` run statements and the record checks that must share a transaction with the write or the read. `src/materials.ts` defines the participant, the migration, the read handlers, the transaction domain and the combination version in one place. `src/cordis.ts` connects the factory to Cordis. The full design is in [docs/architecture.md](docs/architecture.md), [docs/flows.md](docs/flows.md) and [docs/object-model.md](docs/object-model.md).

## Configuration and operation

The configuration is the two login lifetimes and the two invitation durations, owned by the `identity` row of the assembly. The scrypt parameters are fixed to `SCRYPT_PROFILE`, a registered IC-14 deviation, see SPEC known limitation 3. Requirements: Node 24 or later, and a `storage` provider whose catalog holds the materials. The caller registers the combination and closes the storage. This member stops the provider and closes scrypt.

## Verification

In the member directory run `pnpm run build`, `pnpm run typecheck`, `NO_COLOR=1 pnpm exec vitest run --mode fast` and `NO_COLOR=1 pnpm exec vitest run --mode slow`. The tests import this member through `dist`, so build after a source change. The map from obligations to tests, the real dependencies and the uncovered parts are in [SPEC, composition and verification](SPEC.md#组合与验证) and [tests/README.md](tests/README.md).

## Maintenance

- Table shape: write a new migration module, never change the published bytes of `001-identity` or `002-governance`. `tests/public-entry.spec.ts` pins the 001 table names and statements in `schema.ts`. Update the table names in `src/worker/schema.ts`, the read table lists in `materials.ts` and [docs/object-model.md](docs/object-model.md).
- Read handler input or output: update the types in `schema.ts`, the parse functions in `provider.ts` and the tests.
- Outcome mapping: change the SPEC clause and the test first, then `provider.ts` or `governance.ts`.
- Governance checks: they are in `worker/participant.ts` and `worker/read-governance.ts`. The negative controls rewrite a `dist` copy by exact text, so update the anchors in `tests/fixtures/mutants.ts` when the checks change.
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

## Standing coordination

Pass `principalVerifier` and a trusted `destinationResolver` to use `reservations`. `governanceRecovery` resumes provider-owned membership operation identities exposed by unknown errors. Missing destination routes keep holds and mutation intents durable. See [IS-16](SPEC.md#is-16) for the protocol, recovery bounds and deployment requirements. The Cordis plugin provides `standingReservations` and `identityGovernanceRecovery`; it reads optional `principalVerifier` and `standingDestinationResolver` services on each use.
