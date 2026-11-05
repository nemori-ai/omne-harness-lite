// The deployment enumeration of `session-storage` asks `systemActionAuthorization` of the
// `authorization` row on every call (R2-D245), so the operator's tightening of the built-in grant
// table reaches it. The cases load the real `storage`, `authorization` and `session-storage` rows
// on the release trusted table, with the real entry principal authority and the release scanner
// principal; `tenantStanding` is a contract double (the enumeration never reads it) and
// `identityClock` is a test clock that the case moves. Each case has a control in the same tree
// shape that must answer otherwise.
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, type Plugin } from '@deepseek-ai/cordis'
import type { ClockReading, IdentityClock, SystemPrincipal } from '@omne-harness/identity'
import {
  IdentityClockService,
  TenantStandingSourceService,
  identityClockKey,
  tenantStandingKey,
} from '@omne-harness/identity/cordis'
import type { TenantDomains } from '@omne-harness/sql-contract'
import { tenantDomainsKey } from '@omne-harness/sql-contract/cordis'
import { parseInstant } from '@omne-harness/utc-instant'
import { afterEach, describe, expect, test } from 'vitest'
import { cursorSigning } from '../../../src/entry/cursor-signing.ts'
import { principalIssuer, principalVerifier } from '../../../src/entry/principals.ts'
import { storageHost } from '../../../src/entry/storage-host.ts'
import { issueTenantDomainScanner } from '../../../src/entry/tenant-domain-scanner.ts'
import { LifecycleRegistry, S0AssemblyLifecycleService } from '../../../src/lifecycle.ts'
import { disposeTree, startTree, type EntryObject, type RowSpec } from '../../../src/loader.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow } from '../../../src/row.ts'
import { TENANT_DOMAIN_SCANNER_COMPONENT } from '../../../src/rows/authorization/grants.ts'
import { authorization } from '../../../src/rows/authorization/row.ts'
import { systemActionAuthorizationKey } from '../../../src/rows/authorization/system-action-service.ts'
import { prepareTenantDirectory } from '../../../src/rows/session-storage/initialize.ts'
import { sessionStorageRow } from '../../../src/rows/session-storage/index.ts'
import { storageRow } from '../../../src/rows/storage/index.ts'
import { monotonicClock } from '../../../src/shutdown.ts'
import { createTrust } from '../../../src/trust.ts'
import type { EntryEnv, EntryObjectModule, LifecyclePhase, RowId } from '../../../src/types.ts'
import { accessPolicyRow, allowAll, declared, providerConfig } from '../storage/fixtures/tree.ts'

const SCANNER_RECORD = `maintenance-grant/${TENANT_DOMAIN_SCANNER_COMPONENT}`
const END = '2027-01-01T00:00:00Z'

function instantOf(text: string) {
  const parsed = parseInstant(text)
  if (!parsed.ok) throw new Error(`fixture instant ${text} did not parse`)
  return parsed.value
}

/** A clock the case moves; the `authorization` row reads it on every end-time judgment. */
function testClock(initial: string) {
  let reading: ClockReading = { kind: 'read', instant: instantOf(initial) }
  let reads = 0
  const clock: IdentityClock = {
    now: () => {
      reads += 1
      return Promise.resolve(reading)
    },
  }
  return {
    clock,
    reads: () => reads,
    set(text: string) {
      reading = { kind: 'read', instant: instantOf(text) }
    },
    fail() {
      reading = { kind: 'unavailable', diagnostic: 'test clock is down' }
    },
  }
}

/** The `identity` row as a contract double: only the trusted `tenantStanding`, which no case reads. */
const standingRow = defineRow({
  row: 'identity',
  implementation: 'contract-double',
  manifest: { provides: [tenantStandingKey], injects: [], sameProviderGroup: null },
  lifecycle: { kind: 'none' },
  plugin: {
    name: 'standing-double',
    apply(ctx: Context) {
      new (class extends TenantStandingSourceService {
        readonly read = () => Promise.reject(new Error('tenantStanding is not asked'))
      })(ctx)
    },
  },
})

/** A root plugin that provides `systemActionAuthorization` under the plain name and allows all. */
const impostor: Plugin.Object = {
  name: 'system-action-impostor',
  apply(ctx: Context) {
    ctx.provide(systemActionAuthorizationKey, {
      check: () => Promise.resolve({ kind: 'allowed', basis: {}, evidence: {} }),
    })
  },
}

type Setup = Readonly<{
  /** `maintenanceGrants` of the real row; `null` loads a contract double that has no system key. */
  grants: Record<string, unknown> | null
  initial?: string
  withImpostor?: boolean
}>

const bases: string[] = []
const disposers: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
  for (const base of bases.splice(0)) rmSync(base, { recursive: true, force: true })
})

async function load(setup: Setup) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'grant-one-')))
  bases.push(base)
  const stateRoot = join(base, 'state')
  mkdirSync(stateRoot)
  const storageRoot = join(base, 'storage')
  const directoryFile = join(storageRoot, 'tenants.json')
  prepareTenantDirectory({ storageRoot, directoryFile })
  const time = testClock(setup.initial ?? '2026-06-01T00:00:00Z')
  const profile = serveProfile()
  const trust = createTrust(
    [...new Set([...profile.visibility.values()].flat())].map(name => ({
      id: name,
      names: [name],
    })),
    profile.visibility,
  )
  const authorizationSpec: RowSpec =
    setup.grants === null
      ? declared(accessPolicyRow(allowAll).plugin)
      : declared(authorization, { maintenanceGrants: setup.grants })
  const specs: RowSpec[] = [
    declared(storageRow, providerConfig(storageRoot)),
    declared(standingRow),
    authorizationSpec,
    declared(sessionStorageRow, {
      combinationVersion: 'session-composite/1',
      directoryFile,
      domainRule: 'organization-account/1',
    }),
  ]
  const root = new Context()
  const expected = new Map<RowId, LifecyclePhase>()
  for (const spec of specs)
    if (spec.manifest.phase !== null) expected.set(spec.row.id, spec.manifest.phase)
  await root.plugin(
    S0AssemblyLifecycleService,
    new LifecycleRegistry({ expected, clock: monotonicClock, requestStop: () => {} }),
  )
  if (setup.withImpostor === true) await root.plugin(impostor)
  const made = new Map<symbol, unknown>()
  const env: EntryEnv = {
    stateRoot,
    readTrusted: name => trust.contextForName(root, name),
    once: <T>(key: symbol, create: () => T): T => {
      if (!made.has(key)) made.set(key, create())
      return made.get(key) as T
    },
  }
  const clockEntry: EntryObjectModule = {
    name: identityClockKey,
    implementation: 'contract-double',
    install(scope: Context) {
      new (class extends IdentityClockService {
        readonly now = () => time.clock.now()
      })(scope)
    },
  }
  const modules: readonly EntryObjectModule[] = [
    storageHost,
    cursorSigning,
    principalVerifier,
    principalIssuer,
    clockEntry,
  ]
  const entryObjects: EntryObject[] = modules.map(module => ({
    name: module.name,
    implementation: module.implementation,
    registersFor: module.registersFor ?? [],
    install: scope => module.install(scope, env),
  }))
  const result = await startTree({
    root,
    trust,
    rows: specs,
    entryObjects,
    readinessTimeoutMs: 10_000,
    barrier: () => {},
  })
  disposers.push(async () => {
    if (result.kind === 'started') await disposeTree(root, result.rows)
    else await root.fiber.dispose()
  })
  if (result.kind !== 'started') throw new Error(`tree not started: ${JSON.stringify(result)}`)
  const scanner: SystemPrincipal = issueTenantDomainScanner(env)
  const domains = (): TenantDomains<unknown> => {
    const service = root.get(tenantDomainsKey) as TenantDomains<unknown> | undefined
    if (service === undefined) throw new Error('tenantDomains is not provided')
    return service
  }
  return {
    time,
    enumerate: () => domains().enumerate({ principal: scanner }),
    stopAuthorization: async () => {
      const row = result.rows.find(loaded => loaded.id === 'authorization')
      if (row === undefined) throw new Error('no authorization row')
      await row.fiber.dispose()
    },
    trustedAuthorization: () =>
      trust.contextForName(root, systemActionAuthorizationKey).get(systemActionAuthorizationKey),
  }
}

const READY = { kind: 'ready', entries: [] }

describe('session-storage enumerates tenants only as `systemActionAuthorization` allows', () => {
  test('control: the release table as built in lets the scanner enumerate', async () => {
    const tree = await load({ grants: {} })
    expect(await tree.enumerate()).toMatchObject(READY)
  })

  test('the operator revokes the scanner grant: the enumeration is denied', async () => {
    const tree = await load({ grants: { [SCANNER_RECORD]: { revoked: true } } })
    expect(await tree.enumerate()).toEqual({ kind: 'denied' })
  })

  test('an end time: allowed before it, denied once the clock reaches it, read on every call', async () => {
    const tree = await load({
      grants: { [SCANNER_RECORD]: { expiresAt: END } },
      initial: '2026-12-31T23:59:59Z',
    })
    const before = tree.time.reads()
    expect(await tree.enumerate()).toMatchObject(READY)
    expect(tree.time.reads()).toBe(before + 1)
    tree.time.set(END)
    expect(await tree.enumerate()).toEqual({ kind: 'denied' })
    tree.time.set('2026-12-31T00:00:00Z')
    expect(await tree.enumerate()).toMatchObject(READY)
    expect(tree.time.reads()).toBe(before + 3)
  })

  test('an end time and a clock that cannot answer: unavailable, not allowed', async () => {
    const tree = await load({ grants: { [SCANNER_RECORD]: { expiresAt: END } } })
    tree.time.fail()
    expect(await tree.enumerate()).toMatchObject({ kind: 'unavailable' })
    expect(await tree.enumerate()).not.toHaveProperty('entries')
  })

  test('no `systemActionAuthorization` in the tree: unavailable, not allowed', async () => {
    const tree = await load({ grants: null })
    const answer = await tree.enumerate()
    expect(answer).toEqual({
      kind: 'unavailable',
      diagnostic: 'systemActionAuthorization is not provided',
    })
  })

  test('a reference held past the stop of the authorization row answers unavailable', async () => {
    const tree = await load({ grants: {} })
    const held = tree.trustedAuthorization()
    expect(held).toBeDefined()
    await tree.stopAuthorization()
    const decision = await held?.check({
      principal: { kind: 'system', component: TENANT_DOMAIN_SCANNER_COMPONENT },
      scope: 'system',
      operation: { owner: 'tenant-domains', name: 'enumerate' },
      target: {
        kind: 'system',
        resource: { owner: 'tenant-domains', kind: 'registered-tenants', key: 'deployment' },
      },
      arguments: { digest: 'x' },
    } as never)
    expect(decision).toEqual({
      kind: 'unavailable',
      diagnostic: 'the authorization row has stopped',
    })
  })
})

describe('a root provider of the same name is not read', () => {
  test('with the scanner grant revoked, an allow-all impostor on the root does not let it through', async () => {
    const tree = await load({ grants: { [SCANNER_RECORD]: { revoked: true } }, withImpostor: true })
    expect(await tree.enumerate()).toEqual({ kind: 'denied' })
  })

  test('with no authorization row, the impostor does not stand in for it', async () => {
    const tree = await load({ grants: null, withImpostor: true })
    expect(await tree.enumerate()).toMatchObject({ kind: 'unavailable' })
  })
})
