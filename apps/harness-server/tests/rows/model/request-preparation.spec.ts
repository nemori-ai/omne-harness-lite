import { modelTokenizersRow } from '../../../src/rows/model-tokenizers/index.ts'
import { LOCAL_TOKENIZERS } from '../../../src/local/operator-defaults.ts'
// `model-request-preparation` row: the model-host-local preparation plugin over the real OpenAI
// family. The row injects `modelCommands`, and the real `model-records` row has no member yet, so the
// tests load a named stand-in row of that name (support.ts). A lease without a lineage never reads
// it. The profile comes from the real `model-profiles` row; the family, its tokenizer and its rules
// are the real ones. No network is involved. The credential layer of each supplier comes from the
// real `model-credential` row over the real `secret-custody` row and a vault file in a temporary
// directory, seeded with the OpenRouter keys the release provider body declares.
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { parseSecretText, type SecretScope } from '@omne-harness/settings'
import { createSecretVault } from '@omne-harness/settings-local/secrets'
import { providerCredentialKey, releaseProvider } from '../../../src/assets/model-providers.ts'
import { modelCredentialRow } from '../../../src/rows/model-credential/index.ts'
import { secretCustodyRow } from '../../../src/rows/secret-custody/index.ts'
import type { AssembledModelInput, ModelProfile } from '@omne-harness/model-contract'
import {
  ModelPreparationResourcesService,
  ModelRequestPreparationService,
} from '@omne-harness/model-cordis-contract/cordis'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelProfilesRow } from '../../../src/rows/model-profiles/index.ts'
import { modelRequestPreparationRow } from '../../../src/rows/model-request-preparation/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TENANT, commandsStandIn, withLiveRows } from './support.ts'

const ADOPTION = {
  owner: 'harness-server-test',
  name: 'preparation',
  revision: '1',
  digest: '0'.repeat(64),
}
const count = 65_536
const config = {
  maxCitedCalls: 8,
  openai: {
    maxSerializedBytes: 4 * 1024 * 1024,
    limits: {
      toolArguments: {
        maxBytes: count,
        maxDepth: 32,
        maxItems: 1_024,
        maxMembers: 256,
        maxStringLength: count,
        maxNumberLength: 64,
      },
      maxReasoningText: count,
    },
    margin: { percent: '10', source: ADOPTION },
  },
}
const profilesConfig = {
  retryPolicy: ADOPTION,
  compactionTriggerPercent: '80',
  updatedAt: '2026-11-02T00:00:00Z',
}
const plugins = {
  modelTokenizersRow,
  modelProfilesRow,
  modelRequestPreparationRow,
  commandsStandIn,
  modelCredentialRow,
  secretCustodyRow,
}
const directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-preparation-row-')))
afterAll(() => rmSync(directory, { recursive: true, force: true }))
let vaults = 0
const OFFICIAL_SECRET = 'synth-official-secret'
const TENANT_SECRET = 'synth-tenant-secret'

function apiKey(scope: SecretScope) {
  const provider = releaseProvider('openrouter')
  if (provider === undefined) throw new Error('the release holds no openrouter provider')
  return providerCredentialKey(provider, scope, 'apiKey')
}
function secret(raw: string) {
  const parsed = parseSecretText(raw)
  if (!parsed.ok) throw new Error('fixture secret')
  return parsed.value
}

/**
 * A fresh vault that holds the official key, and the tenant's own key in `tenant` life when given.
 */
function vaultPath(tenant?: 'active' | 'unreadable'): string {
  vaults += 1
  const path = join(directory, `vault-${vaults}.json`)
  const tenantKey = apiKey({ layer: 'tenant', tenant: TENANT })
  const created = createSecretVault({
    path,
    seed: [
      { key: apiKey({ layer: 'official' }), secret: secret(OFFICIAL_SECRET), configuredAt: null },
      ...(tenant === undefined
        ? []
        : [{ key: tenantKey, secret: secret(TENANT_SECRET), configuredAt: null }]),
    ],
  })
  if (created.kind !== 'open') throw new Error(`test vault: ${created.kind}`)
  if (tenant === 'unreadable')
    created.vault.revise(bindings =>
      bindings.map(record =>
        JSON.stringify(record.key.target) === JSON.stringify(tenantKey.target) &&
        record.key.scope.layer === 'tenant'
          ? { ...record, life: 'unreadable' as const }
          : record,
      ),
    )
  created.vault.close()
  return path
}
/** The model credential row and the custody row it reads, over the vault at `path`. */
function credentialRows(path: string) {
  return [
    { id: 'model-credential', plugin: 'modelCredentialRow', config: {} },
    { id: 'secret-custody', plugin: 'secretCustodyRow', config: { path } },
  ]
}
const withoutCredentials = <R extends { id: string }>(over: readonly R[]): R[] =>
  over.filter(row => row.id !== 'model-credential' && row.id !== 'secret-custody')
const rows = [
  { id: 'model-tokenizers', plugin: 'modelTokenizersRow', config: LOCAL_TOKENIZERS },
  { id: 'model-records', plugin: 'commandsStandIn', config: {} },
  { id: 'model-profiles', plugin: 'modelProfilesRow', config: profilesConfig },
  { id: 'model-request-preparation', plugin: 'modelRequestPreparationRow', config },
  ...credentialRows(vaultPath()),
]
const probe = ['modelProfiles', 'modelRequestPreparation', 'modelPreparationResources']
const REQUIRED = {
  modalities: ['text'] as ['text'],
  source: { owner: 'test', record: 'required', revision: '1', digest: '1'.repeat(64) },
}
const ACCESS = { principal: Object.freeze({ subject: 'test' }), tenant: TENANT }

async function profileOf(ctx: { get(name: string): unknown }): Promise<ModelProfile> {
  const profiles = ctx.get('modelProfiles') as ModelProfilesLike
  const resolved = await profiles.resolve({
    ...ACCESS,
    route: 'openai/gpt-5.6-sol',
    required: REQUIRED,
  })
  if (!('ok' in resolved) || resolved.ok.kind !== 'resolved')
    throw new Error('profile did not resolve')
  return resolved.ok.profile
}
type ModelProfilesLike = {
  resolve(
    input: unknown,
  ): Promise<
    { ok: { kind: 'resolved'; profile: ModelProfile } | { kind: 'absent' } } | { failure: unknown }
  >
}

describe('the model-request-preparation row', () => {
  it('declares the formal key, the commands inject and no shutdown phase', () => {
    expect(rowDeclarationOf(modelRequestPreparationRow)).toEqual({
      row: 'model-request-preparation',
      implementation: 'real',
      manifest: {
        provides: ['modelRequestPreparation'],
        injects: ['modelCommands', 'modelTokenizers'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('is ACTIVE and provides the preparation service and the metering leases', async () => {
    const { value, run } = await withLiveRows({ rows, plugins, probe }, ctx => ({
      prepare: ctx.get('modelRequestPreparation') instanceof ModelRequestPreparationService,
      leases: ctx.get('modelPreparationResources') instanceof ModelPreparationResourcesService,
    }))
    expect(value).toEqual({ prepare: true, leases: true })
    expect(run.state('model-request-preparation')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(run.result.exitCode).toBe(0)
  })

  it('gives a lease over the real OpenAI family for an official profile and takes it back', async () => {
    const { value } = await withLiveRows({ rows, plugins, probe }, async ctx => {
      const profile = await profileOf(ctx)
      const leases = ctx.get(
        'modelPreparationResources',
      ) as ModelPreparationResourcesService<unknown>
      const leased = await leases.acquire({ ...ACCESS, profile })
      if (!('ok' in leased)) return { leased, suppliers: null, released: null, expected: [] }
      const suppliers = leased.ok.bindings.map(binding => binding.supplier)
      const released = await leased.ok.release()
      return { leased: null, suppliers, released, expected: profile.definition.suppliers }
    })
    if (value.suppliers === null) throw new Error(`lease refused: ${JSON.stringify(value.leased)}`)
    expect(value.suppliers.map(supplier => supplier.credential)).toEqual(
      value.suppliers.map(() => ({ layer: 'official' })),
    )
    expect(value.suppliers.map(supplier => [supplier.provider, supplier.model])).toEqual(
      value.expected.map(supplier => [supplier.provider, supplier.model]),
    )
    expect(value.released).toEqual({})
  })

  it('prepares a fixed request for a text input and keeps the profile adoption', async () => {
    const { value } = await withLiveRows({ rows, plugins, probe }, async ctx => {
      const profile = await profileOf(ctx)
      const assembled: AssembledModelInput = {
        system: [],
        // Ids and blocks are branded types that `prepare` judges itself, so the literal is cast.
        messages: [
          {
            id: `msg_${'u1'.padEnd(22, '0')}`,
            role: 'user',
            blocks: [
              {
                kind: 'text',
                id: 'b-u1',
                visibility: { toHuman: true, toModel: true },
                text: 'hello',
              },
            ],
          },
        ] as unknown as AssembledModelInput['messages'],
        tools: [],
        toolChoice: 'none',
        parameters: [],
        // The family accepts only the representation its profile declares.
        representation: profile.definition.representation,
        source: ADOPTION,
      }
      const preparation = ctx.get(
        'modelRequestPreparation',
      ) as ModelRequestPreparationService<unknown>
      return {
        profile,
        prepared: await preparation.prepare({ ...ACCESS, profile, required: REQUIRED, assembled }),
      }
    })
    if (!('ok' in value.prepared))
      throw new Error(`prepare refused: ${JSON.stringify(value.prepared)}`)
    expect(value.prepared.ok.profile).toEqual(value.profile.adoption)
    expect(value.prepared.ok.messages).toHaveLength(1)
    expect(value.prepared.ok.suppliers[0]?.credential).toEqual({ layer: 'official' })
  })

  /** The credential completion of the suppliers of one lease, over the given rows. */
  async function leaseCredentials(over: typeof rows) {
    const { value } = await withLiveRows({ rows: over, plugins, probe }, async ctx => {
      const profile = await profileOf(ctx)
      const leases = ctx.get(
        'modelPreparationResources',
      ) as ModelPreparationResourcesService<unknown>
      const leased = await leases.acquire({ ...ACCESS, profile })
      if (!('ok' in leased)) return { failure: leased.failure }
      const credentials = leased.ok.bindings.map(binding => binding.supplier.credential)
      await leased.ok.release()
      return { credentials }
    })
    return value
  }

  it('fixes the tenant layer when the tenant set its own key', async () => {
    const value = await leaseCredentials([
      ...withoutCredentials(rows),
      ...credentialRows(vaultPath('active')),
    ])
    expect(value).toMatchObject({ credentials: [{ layer: 'tenant' }] })
    expect(JSON.stringify(value)).not.toContain(TENANT_SECRET)
  })

  it('an unreadable tenant key refuses the lease: nothing falls back to the official key', async () => {
    const value = await leaseCredentials([
      ...withoutCredentials(rows),
      ...credentialRows(vaultPath('unreadable')),
    ])
    expect(value).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-unreadable',
      },
    })
  })

  it('a vault that cannot be read refuses the lease instead of picking a layer', async () => {
    vaults += 1
    const path = join(directory, `vault-${vaults}.json`)
    writeFileSync(path, 'not-json')
    const value = await leaseCredentials([...withoutCredentials(rows), ...credentialRows(path)])
    expect(value).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-custody-unavailable',
      },
    })
  })

  it('without the credential row the lease is refused, never completed with a layer', async () => {
    const value = await leaseCredentials(rows.filter(row => row.id !== 'model-credential'))
    expect(value).toEqual({
      failure: {
        kind: 'unavailable',
        dependency: 'model-credential',
        diagnostic: 'credential-custody-absent',
      },
    })
  })

  it('stays PENDING without modelCommands and names the missing key', async () => {
    const run = await serveOnce({
      distribution: { rows: rows.filter(row => row.id !== 'model-records') },
      plugins,
    })
    expect(run.result.exitCode).toBe(4)
    expect(run.state('model-request-preparation')).toMatchObject({
      state: 'PENDING',
      missing: ['modelCommands'],
    })
  })

  it('stays PENDING without the shared tokenizer provider', async () => {
    const run = await serveOnce({
      distribution: { rows: rows.filter(row => row.id !== 'model-tokenizers') },
      plugins,
    })
    expect(run.result.exitCode, JSON.stringify(run.stderr)).toBe(4)
    expect(run.state('model-request-preparation')).toMatchObject({
      state: 'PENDING',
      missing: ['modelTokenizers'],
    })
  })

  it('does not start when a configured bound is missing', async () => {
    const { maxCitedCalls: _omitted, ...incomplete } = config
    const run = await serveOnce({
      distribution: {
        rows: rows.map(row =>
          row.id === 'model-request-preparation' ? { ...row, config: incomplete } : row,
        ),
      },
      plugins,
    })
    expect(run.result.exitCode).not.toBe(0)
    expect(run.state('model-request-preparation')?.['state']).not.toBe('ACTIVE')
  })
})
