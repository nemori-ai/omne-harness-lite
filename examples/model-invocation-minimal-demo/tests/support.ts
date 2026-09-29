import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as sleep } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import {
  generateHandoffKeyPair,
  isOk,
  parseOpaqueIdentifier,
} from '@omne-harness-lite/identity-values'
import type { CredentialRef } from '@omne-harness-lite/asset-model'
import type { Duration } from '@omne-harness-lite/offer-expiry'
import type { DemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { openDemoDiagnosticAssembly } from '../src/diagnostic-assembly.ts'
import { createDemoDiagnosticConfig, ensureDemoDiagnosticParent } from '../src/demo.ts'
import { parseOfferTtl } from '@omne-harness-lite/offer-expiry'
import {
  createAcceptanceApplication,
  type AcceptanceConfig,
  type AcceptanceEvent,
  type AcceptanceHooks,
  type AuthenticatedActor,
} from '../src/index.ts'

export const PASSWORD = 'password-sentinel-a9!'
export const BODY = Buffer.from('model-body-sentinel-c7!')
export function ref(value: string): CredentialRef {
  const parsed = parseOpaqueIdentifier(value, 'CredentialRef')
  if (!isOk(parsed)) throw new Error('fixture reference invalid')
  return parsed.ok
}
export function duration(ms: number): Duration {
  const parsed = parseOfferTtl(ms)
  if (!isOk(parsed)) throw new Error('fixture duration invalid')
  return parsed.ok
}
export function latch() {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>(r => {
    resolve = r
  })
  return { promise, resolve }
}
export async function deployment(label: string): Promise<AcceptanceConfig> {
  const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../tmp/model-request-runtime/m1-session-preparation/test-runs',
  )
  await mkdir(root, { recursive: true, mode: 0o700 })
  const path = await mkdtemp(join(root, `${label}-`))
  const activation = generateHandoffKeyPair(),
    purge = generateHandoffKeyPair()
  const keys = {
    activationSigning: join(path, 'activation-private.pem'),
    activationVerification: join(path, 'activation-public.pem'),
    purgeSigning: join(path, 'purge-private.pem'),
    purgeVerification: join(path, 'purge-public.pem'),
    modelReplica: join(path, 'model-key'),
  }
  for (const [file, bytes] of [
    [keys.activationSigning, activation.privateKeyPem],
    [keys.activationVerification, activation.publicKeyPem],
    [keys.purgeSigning, purge.privateKeyPem],
    [keys.purgeVerification, purge.publicKeyPem],
    [keys.modelReplica, randomBytes(32)],
  ] as const)
    await writeFile(file, bytes, { mode: 0o600, flag: 'wx' })
  return {
    runId: label,
    databaseFile: join(path, 'db.sqlite'),
    keys,
    credentials: { cost: 1024, blockSize: 8, parallelization: 1, saltBytes: 16, keyBytes: 32 },
    identity: { credentialPolicy: { minLength: 8 }, unactivatedRetention: duration(60_000) },
    governance: {
      invitationTtlDefault: duration(60_000),
      affiliationRequestTtlDefault: duration(60_000),
      teamCreationKeyRetention: duration(60_000),
    },
    officialManifest: { ordinal: 1, entries: [] },
    wait: {
      clockTimeoutMs: 15_000,
      pollMs: 10,
      monotonicNow: () => Number(process.hrtime.bigint()) / 1_000_000,
      sleep,
    },
  }
}
export function persisted(file: string) {
  const db = new DatabaseSync(file, { readOnly: true })
  try {
    const counts = Object.fromEntries(
      [
        'account',
        'login_state',
        'organization',
        'membership',
        'model_credential_binding',
        'credential_custodian_replica',
      ].map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n]),
    )
    const manifest = db
      .prepare('SELECT ordinal_json FROM model_manifest_state WHERE id=1')
      .get()?.ordinal_json
    return { counts, manifest }
  } finally {
    db.close()
  }
}
export function noBusinessBeforeConfirmation(state: ReturnType<typeof persisted>): void {
  assert.equal(state.manifest, '0', 'positive manifest ordinal adopted before guard confirmation')
  assert.deepEqual(
    Object.values(state.counts),
    [0, 0, 0, 0, 0, 0],
    'identity/binding/replica business write before guard confirmation',
  )
}
export async function evidence(label: string, value: unknown): Promise<void> {
  const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../tmp/model-request-runtime/m1-session-preparation/scenarios',
  )
  await mkdir(root, { recursive: true, mode: 0o700 })
  await writeFile(
    join(root, `${label}.json`),
    JSON.stringify({ pid: process.pid, label, value }, null, 2),
    { mode: 0o600 },
  )
}
export async function fixture(label: string, hooks?: AcceptanceHooks) {
  const config = await deployment(label)
  const events: AcceptanceEvent[] = []
  const app = createAcceptanceApplication(config, {
    diagnostics: { record: event => events.push(event) },
    ...(hooks === undefined ? {} : { hooks }),
  })
  await app.ready
  return { config, events, app }
}
export async function actor(
  app: ReturnType<typeof createAcceptanceApplication>,
  identifier = 'alice',
): Promise<AuthenticatedActor> {
  const result = await app.register(identifier, PASSWORD)
  if (result !== 'registered')
    throw new Error(
      `actual registration failed: ${typeof result === 'string' ? result : result.failure}`,
    )
  const identity = await app.authenticate(identifier, PASSWORD)
  if (!('account' in identity)) throw new Error('actual authentication failed')
  return identity
}

/** Real journal owner and P-2 activation for test callers using a verified actor. */
export async function activateModelFixture(
  app: ReturnType<typeof createAcceptanceApplication>,
  authenticated: AuthenticatedActor,
  config: AcceptanceConfig,
): Promise<DemoDiagnosticAssembly> {
  if (config.modelRequest === undefined) throw new Error('model request deployment required')
  const directory = dirname(config.databaseFile)
  await ensureDemoDiagnosticParent(directory)
  const diagnostics = await openDemoDiagnosticAssembly(
    createDemoDiagnosticConfig(
      directory,
      authenticated.tenant,
      config.modelRequest.transport.retirement,
    ),
  )
  const activated = await app.activateModelRequest(
    authenticated,
    diagnostics.tenant,
    diagnostics.transports,
  )
  if (!('activated' in activated)) {
    const cleanup = await diagnostics.closeAfterBusiness(() => app.close())
    if (!cleanup.complete) throw new Error('model fixture startup cleanup incomplete')
    throw new Error('model fixture activation rejected')
  }
  return diagnostics
}
