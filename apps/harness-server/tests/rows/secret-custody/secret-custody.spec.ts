// `secret-custody` row: the settings-local secret vault as a row, over a real file in a temporary
// directory. The trusted table of the assembly page does not list the key yet, so these cases give
// the loader a visibility table of their own: it shows what the row provides to a row that may see
// the key, and that a row the table does not list cannot inject it (I-6).
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { fileURLToPath } from 'node:url'
import type { Context } from '@deepseek-ai/cordis'
import { MODEL_FACTORY_SECRET_KEY, modelCredentialBindingKey } from '@omne-harness/model-host-local'
import { MODEL_SEND } from '@omne-harness/model-contract/provider'
import { parseSecretText, type SecretBindingKey, type SecretText } from '@omne-harness/settings'
import { afterEach, describe, expect, it } from 'vitest'
import { localOperatorLayer } from '../../../src/local/operator-defaults.ts'
import { resolveLocations } from '../../../src/local/locations.ts'
import { tenantCredentialId } from '../../../src/model/tenant-credential.ts'
import { serveProfile } from '../../../src/profile.ts'
import { defineRow, rowDeclarationOf } from '../../../src/row.ts'
import {
  SettingsSecretCustodyService,
  secretCustodyConfig,
  secretCustodyRow,
  settingsSecretCustodyKey,
} from '../../../src/rows/secret-custody/index.ts'
import type { RowId } from '../../../src/types.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TENANT } from '../model/support.ts'

const FACTORY = 'synth-factory-sentinel-3b1c'
const TENANT_SECRET = 'synth-tenant-sentinel-8e2d'
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
function vaultPath(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'secret-custody-row-')))
  directories.push(directory)
  return join(directory, 'model-vault.json')
}

/** A vault file in the format the Model host wrote before custody moved to settings-local. */
function writeBaselineVault(path: string): void {
  const id = tenantCredentialId(TENANT)
  if (id === undefined) throw new Error('tenant credential id')
  writeFileSync(
    path,
    JSON.stringify({
      closed: false,
      factorySecret: FACTORY,
      bindings: [
        {
          id,
          tenant: { organization: TENANT.organization.text, account: TENANT.account.text },
          purpose: MODEL_SEND,
          secret: TENANT_SECRET,
          life: 'active',
          configuredAt: '2026-11-04T00:00:00Z',
        },
      ],
    }),
  )
}

function tenantKey(): SecretBindingKey {
  const id = tenantCredentialId(TENANT)
  if (id === undefined) throw new Error('tenant credential id')
  return modelCredentialBindingKey({ id, tenant: TENANT, purpose: MODEL_SEND })
}

function text(raw: string): SecretText {
  const parsed = parseSecretText(raw)
  if (!parsed.ok) throw new Error(`fixture secret ${parsed.reason}`)
  return parsed.value
}

const PROBE = 'secret-probe' as RowId
const plugins = { secretCustodyRow }

/** A probe row that injects the key; `capture` receives its context while the tree is up. */
function probeRow(capture: (ctx: Context) => void) {
  return defineRow({
    row: PROBE,
    implementation: 'real',
    manifest: { provides: [], injects: [settingsSecretCustodyKey], sameProviderGroup: null },
    lifecycle: { kind: 'none' },
    plugin: {
      name: 'secret-probe',
      inject: [settingsSecretCustodyKey],
      apply(ctx: Context) {
        capture(ctx)
      },
    },
  })
}

/** Runs the row with a probe under a visibility table of the test's choice. */
async function withRow<T>(
  path: string,
  visibility: ReadonlyMap<RowId, readonly string[]>,
  use: (service: SettingsSecretCustodyService) => T,
) {
  const stop = new AbortController()
  let ready: (ctx: Context) => void = () => {}
  const captured = new Promise<Context>(resolve => {
    ready = resolve
  })
  const running = serveOnce({
    distribution: {
      rows: [
        { id: 'secret-custody', plugin: 'secretCustodyRow', config: { path } },
        { id: PROBE, plugin: 'probe', config: {} },
      ],
    },
    plugins: { ...plugins, probe: probeRow(ready) },
    visibility,
    stopAfterStartup: false,
    stop: stop.signal,
    readinessTimeoutMs: 30_000,
    shutdownDeadlineMs: 10_000,
  })
  try {
    const ctx = await Promise.race([
      captured,
      running.then(run => {
        throw new Error(`the tree ended before the probe ran: ${JSON.stringify(run.stderr)}`)
      }),
    ])
    const service = ctx.get(settingsSecretCustodyKey) as SettingsSecretCustodyService
    const value = use(service)
    stop.abort('test done')
    return { value, run: await running }
  } catch (error) {
    stop.abort('test failed')
    await running.catch(() => undefined)
    throw error
  }
}

// The release trusted table (the entry objects need it) plus the two rows that may see the key.
const RELEASE_TABLE = serveProfile().visibility
const SEES_KEY: ReadonlyMap<RowId, readonly string[]> = new Map([
  ...RELEASE_TABLE,
  ['secret-custody' as RowId, [settingsSecretCustodyKey]],
  [PROBE, [settingsSecretCustodyKey]],
])

describe('the secret-custody row', () => {
  it('declares the trusted key, no inject and no shutdown phase', () => {
    expect(rowDeclarationOf(secretCustodyRow)).toEqual({
      row: 'secret-custody',
      implementation: 'real',
      manifest: {
        provides: ['settingsSecretCustody'],
        injects: [],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('serves the baseline vault file: the factory secret and the tenant credential, with no value on the read faces', async () => {
    const path = vaultPath()
    writeBaselineVault(path)
    const { value, run } = await withRow(path, SEES_KEY, service => {
      expect(service).toBeInstanceOf(SettingsSecretCustodyService)
      return {
        factory: service.describe(MODEL_FACTORY_SECRET_KEY),
        factoryValue: service.use(MODEL_FACTORY_SECRET_KEY),
        tenant: service.describe(tenantKey()),
        tenantValue: service.use(tenantKey()),
        listed: service.list({ layer: 'tenant', tenant: TENANT }, null, 10),
        other: service.use({ ...tenantKey(), purpose: 'setting' }),
      }
    })
    expect(run.state('secret-custody')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(value.factory).toMatchObject({ kind: 'bound', life: 'active', configuredAt: null })
    expect(value.factoryValue).toEqual({ kind: 'secret', value: FACTORY })
    expect(value.tenant).toMatchObject({ kind: 'bound', life: 'active' })
    expect(value.tenantValue).toEqual({ kind: 'secret', value: TENANT_SECRET })
    expect(value.other).toBe('missing')
    const shown = inspect([value.factory, value.tenant, value.listed], { depth: null })
    expect(shown).not.toContain(FACTORY)
    expect(shown).not.toContain(TENANT_SECRET)
    expect(run.result.exitCode).toBe(0)
  })

  it('writes through the management face into the same file the model credential plugin reads', async () => {
    const path = vaultPath()
    writeBaselineVault(path)
    const key: SecretBindingKey = {
      scope: { layer: 'tenant', tenant: TENANT },
      target: { owner: 'tool', key: 'Web/exa.apiKey' },
      purpose: 'setting',
    }
    const { value } = await withRow(path, SEES_KEY, service => ({
      written: service.bind(key, text('synth-setting-sentinel-5f0a'), null),
      shown: service.describe(key),
      removed: service.unbind(key),
      after: service.describe(key),
    }))
    expect(value).toEqual({
      written: 'written',
      shown: { kind: 'bound', life: 'active', configuredAt: null },
      removed: 'removed',
      after: { kind: 'unbound' },
    })
    // The file is now version 2 and still holds the Model bindings the baseline file had.
    const stored = JSON.parse(readFileSync(path, 'utf8')) as {
      version: number
      bindings: unknown[]
    }
    expect(stored.version).toBe(2)
    expect(stored.bindings).toHaveLength(2)
  })

  it('keeps the key trusted: a row the table does not list cannot inject it', async () => {
    const path = vaultPath()
    writeBaselineVault(path)
    const onlyProvider: ReadonlyMap<RowId, readonly string[]> = new Map([
      ...RELEASE_TABLE,
      ['secret-custody' as RowId, [settingsSecretCustodyKey]],
    ])
    await expect(withRow(path, onlyProvider, () => 0)).rejects.toThrow(
      /injects trusted name .{1,2}settingsSecretCustody.{1,2}, which it cannot see/,
    )
  })

  it('on a file that cannot be read it loads, reads unavailable, writes not-written, and leaves the bytes', async () => {
    const path = vaultPath()
    writeFileSync(path, '{not json')
    const { value, run } = await withRow(path, SEES_KEY, service => ({
      described: service.describe(MODEL_FACTORY_SECRET_KEY),
      used: service.use(MODEL_FACTORY_SECRET_KEY),
      written: service.bind(MODEL_FACTORY_SECRET_KEY, text('synth-new-sentinel-9c4b'), null),
    }))
    expect(run.state('secret-custody')).toMatchObject({ state: 'ACTIVE' })
    expect(value).toEqual({ described: 'unavailable', used: 'unavailable', written: 'not-written' })
    expect(readFileSync(path, 'utf8')).toBe('{not json')
  })

  it('refuses a configuration without a path or with a lock wait that is not a count', () => {
    const validate = secretCustodyConfig['~standard'].validate
    expect(validate({})).toHaveProperty('issues', [{ message: expect.stringMatching(/path/) }])
    expect(validate({ path: '' })).toHaveProperty('issues')
    expect(validate({ path: '/v', lockWaitMs: -1 })).toHaveProperty('issues', [
      { message: expect.stringMatching(/lockWaitMs/) },
    ])
    expect(validate({ path: '/v', lockWaitMs: 2000 })).toStrictEqual({
      value: { path: '/v', lockWaitMs: 2000 },
    })
    expect(validate({ path: '/v' })).toStrictEqual({ value: { path: '/v' } })
  })
})

describe('the operator layer of the local profile', () => {
  const memberDir = fileURLToPath(new URL('../../..', import.meta.url))
  const distribution = JSON.parse(
    readFileSync(join(memberDir, 'config', 'serve.distribution.json'), 'utf8'),
  ) as { rows: { id: string; plugin: string; config?: Record<string, unknown> }[] }

  function layerOver(rows: typeof distribution.rows) {
    const located = resolveLocations({
      platform: 'linux',
      env: { OMNE_SERVER_HOME: '/h' },
      home: '/u',
    })
    if (located.kind !== 'located') throw new Error('fixture')
    return localOperatorLayer({
      distribution: { ...distribution, rows },
      locations: located.locations,
      settings: {
        version: 1,
        port: 8965,
        workspace: '/h/ws',
        shell: '/bin/bash',
        shellEnvironment: {},
      },
      shutdownDeadlineMs: 10_000,
      platform: 'linux',
    })
  }

  it('names the vault path from the location resolution for the row, once the release lists it', () => {
    const withRow = layerOver([
      ...distribution.rows,
      { id: 'secret-custody', plugin: 'secretCustodyRow', config: {} },
    ])
    expect(withRow.ops.find(op => op.id === 'secret-custody')?.config).toEqual({
      path: '/h/state/model-vault.json',
    })
    expect(withRow.ops.find(op => op.id === 'model-credential')?.config).toEqual({
      path: '/h/state/model-vault.json',
    })
  })

  it('leaves the row out while the release does not list it, so the layer replaces no unknown row', () => {
    const without = layerOver(distribution.rows)
    expect(without.ops.find(op => op.id === 'secret-custody')).toBeUndefined()
  })
})
