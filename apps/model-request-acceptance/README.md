# Model request acceptance application

`@omne-harness-lite/model-request-acceptance` is a local application assembly for the real authentication, model credential and explicit request preparation stages of model request acceptance. It combines the public account registration, password verification, login, organization membership, model directory and model replica APIs with one SQLite storage owner and Cordis context.

The public root exports `createAcceptanceApplication`, its configuration and result types, and the fixed base/stage fiber names. The returned application exposes `ready`, `register`, `authenticate`, `publishCredential`, `verifyCredential`, `readOfficialProfiles`, `prepareSession`, `status` and `close`. It keeps the storage, credential reader, replica owner and service context inside the application. `AcceptanceHooks` is a trusted fault-testing port; tenant input must never control it.

Startup completes every stage migration, waits for the six base fibers and the actual clock, and confirms the same storage upgrade guard. Directory management and the single model replica owner load after confirmation. The default `authentication` stage opens admission when all eight `STAGE_FIBERS` are active. Passing `{ stage: 'requestPreparation' }` as the second argument selects a fixed nine-fiber set (`REQUEST_PREPARATION_FIBERS`). That stage appends the session-tenancy migration before confirmation, then loads the actual `sessionTenancy` plugin after directory and lookup startup. Every operation rechecks the selected set and closing gate. A startup failure rejects `ready` with `AcceptanceStartupFailure`; its `cleanup` records incomplete cleanup and any remaining upgrade marker. A failure after confirmation preserves already committed migrations and manifest adoption.

Authentication returns an actual account, login state and current tenant. Every credential or preparation operation rechecks that login and effective membership. The trusted source callback supplies the account, tenant, reference and body together; a mismatched pair is rejected. Provider failure values and `stored: false` remain visible. `close()` stops new admission, drains admitted work, withdraws lookup before closing its borrowed replica, and closes the actual storage last. Repeated calls share one closing promise.

This assembly performs no model HTTP requests and provides no complete Session/Inbound product, model runtime thirteen-operation API, agent loop, OAuth flow, asset registry or full credential custodian. An empty manifest in the example is an explicit acceptance input, not a supported model catalog. Diagnostic events contain operation categories and correlation rather than passwords, key material, credential references or bodies; the synchronous diagnostic callback is not a durable audit sink.

`readOfficialProfiles(actor)` calls the real directory with the checked tenant and returns only official rows, preserving their complete `profile`, `updatedAt` and `adaptation`. A confirmed empty list differs from a named provider failure. `prepareSession(actor, session)` accepts the shared SessionRef representation, reads persistent ownership first, and seeds only a missing mapping through the restricted bootstrap entry in the same actual storage atomic unit. It reads back the held tenant before returning `{ session, tenant }`. Same-tenant repeats preserve the mapping; a different tenant receives a sanitized `UniqueViolation`. Unreadable ownership never authorizes a seed. Neither operation is admitted in the default authentication stage. A successful seed remains committed if the later read fails; identity verification and seed are separate commits.

`close()` drains admitted directory, holding-tenant and seed work before withdrawing the session reader and existing providers, then closes storage. The selected stage and migration prefix must remain consistent when reopening a deployment.

## Run through the public API

Use Node 24.18 or later in the Node 24 line. Supply an existing absolute deployment directory owned by the current OS user with mode `0700`. Provision `activation-private.pem`/`activation-public.pem` and `purge-private.pem`/`purge-public.pem` as matching Ed25519 PKCS8/SPKI pairs, and `model-key` as exactly 32 bytes. All five must be regular owner files with mode `0600`. The application checks these inputs and never generates or replaces keys. If `db.sqlite` already exists it must also be an owner regular file with mode `0600`.

Create owner-only `password` and `model-credential` files in that directory for this local example. Run this code once with the deployment directory as the first argument. A repeated registration is reported by the provider; use another explicit identifier for another scenario. Scrypt costs, retention, governance durations and the clock wait policy below are explicit example inputs that the deployment can change.

```ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import { isOk, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import { createAcceptanceApplication } from '@omne-harness-lite/model-request-acceptance'

const argument = process.argv[2]
if (argument === undefined) throw new Error('deployment directory argument required')
const directory = resolve(argument)
const ttl = parseOfferTtl(60_000)
const sourceRef = parseOpaqueIdentifier('local-readme-source', 'CredentialRef')
if (!isOk(ttl) || !isOk(sourceRef)) throw new Error('example configuration invalid')
const events: string[] = []
const app = createAcceptanceApplication(
  {
    runId: 'readme-local',
    databaseFile: join(directory, 'db.sqlite'),
    keys: {
      activationSigning: join(directory, 'activation-private.pem'),
      activationVerification: join(directory, 'activation-public.pem'),
      purgeSigning: join(directory, 'purge-private.pem'),
      purgeVerification: join(directory, 'purge-public.pem'),
      modelReplica: join(directory, 'model-key'),
    },
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: ttl.ok },
    governance: {
      invitationTtlDefault: ttl.ok,
      affiliationRequestTtlDefault: ttl.ok,
      teamCreationKeyRetention: ttl.ok,
    },
    officialManifest: { ordinal: 1, entries: [] },
    wait: { clockTimeoutMs: 15_000, pollMs: 10, monotonicNow: () => performance.now(), sleep },
  },
  {
    stage: 'requestPreparation',
    diagnostics: { record: event => events.push(`${event.event}:${event.phase}:${event.outcome}`) },
  },
)
let body: Buffer | undefined
try {
  await app.ready
  const password = (await readFile(join(directory, 'password'), 'utf8')).trimEnd()
  assert.equal(await app.register('readme-account', password), 'registered')
  const actor = await app.authenticate('readme-account', password)
  if (!('account' in actor)) throw new Error('actual authentication rejected')
  assert.deepEqual(await app.readOfficialProfiles(actor), [])
  assert.deepEqual(await app.prepareSession(actor, 'readme-session'), {
    session: 'readme-session', tenant: actor.tenant,
  })
  body = await readFile(join(directory, 'model-credential'))
  const pair = { account: actor.account, tenant: actor.tenant, sourceRef: sourceRef.ok, body }
  assert.deepEqual(await app.publishCredential(actor, async () => pair), { stored: true })
  assert.deepEqual(await app.verifyCredential(actor, body), { matches: true })
  assert.equal(app.status().diagnosticFailures, 0)
  console.log(
    JSON.stringify({ authenticated: true, stored: true, matched: true, events: events.length }),
  )
} finally {
  body?.fill(0)
  const closed = await app.close()
  assert.equal(closed.complete, true)
  assert.deepEqual(closed.unfinished, [])
}
```

The caller owns the source callback and diagnostic sink. Keep callbacks finite, handle their rejected promises, and inspect every returned rejection. Generic operation defects throw `AcceptanceOperationDefect`; known storage defects retain their storage error class with a sanitized message. `verifyCredential` returns only whether the current body matches and clears the returned replica bytes before completing.

## Develop and verify

From the repository root, after the public dependency packages are built:

```sh
pnpm --filter @omne-harness-lite/model-request-acceptance build
pnpm --filter @omne-harness-lite/model-request-acceptance typecheck
pnpm --filter @omne-harness-lite/model-request-acceptance test
```

Tests use real SQLite, Cordis fibers, scrypt, signing keys and deployment key files. They exercise startup ordering, a controlled old-order negative case, actual confirmation deletion/fsync failures, identity and source rejection, late stores, close interleavings, process crash/reopen and clock deadline failure. Preparation tests add real official row reads, persistent tenant ownership, identity rejection, provider unavailability, nine-fiber failure and close interleavings. Author evidence is not independent acceptance and does not close the separate symbol-permission gate or the complete model request runtime delivery.

The adopted scope is D074/D075/D076 with D092's exact app auth-bootstrap revision. Maintainers can navigate to the authoritative [application realization](../../.meta_harness/design/realization/apps/model-request-acceptance/README.md) and its verification obligations. This README describes how to consume the implementation; those accepted design inputs own its semantics.
