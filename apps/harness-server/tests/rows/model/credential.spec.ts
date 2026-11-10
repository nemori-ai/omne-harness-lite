// `model-credential` row: the Model credential port over the `secret-custody` row, as a row. The
// vault is a real file in a temporary directory, built with the binding keys the release providers
// give: the official layer `setup` writes and a tenant layer the `settings` row writes.
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { decodeProviderName } from '@omne-harness/model-contract'
import { MODEL_SEND } from '@omne-harness/model-contract/provider'
import { ModelCredentialService } from '@omne-harness/model-cordis-contract/cordis'
import { parseSecretText, type SecretBindingKey, type SecretScope } from '@omne-harness/settings'
import { createSecretVault } from '@omne-harness/settings-local/secrets'
import { providerCredentialKey, releaseProvider } from '../../../src/assets/model-providers.ts'
import { rowDeclarationOf } from '../../../src/row.ts'
import { modelCredentialRow } from '../../../src/rows/model-credential/index.ts'
import { secretCustodyRow } from '../../../src/rows/secret-custody/index.ts'
import { serveOnce } from '../../fixtures/serve/harness.ts'
import { TENANT, withLiveRows } from './support.ts'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

const OFFICIAL = 'synth-official-secret'
const TENANT_SECRET = 'synth-tenant-secret'
const plugins = { modelCredentialRow, secretCustodyRow }
const ACCESS = { principal: 'principal-a', tenant: TENANT }

function openrouter() {
  const name = decodeProviderName('openrouter')
  if (!('ok' in name)) throw new Error('fixture provider')
  return name.ok
}

function apiKey(scope: SecretScope): SecretBindingKey {
  const provider = releaseProvider('openrouter')
  if (provider === undefined) throw new Error('the release holds no openrouter provider')
  return providerCredentialKey(provider, scope, 'apiKey')
}

/** A vault holding the official key and, when asked, the tenant's own key. */
function vaultWith(input: Readonly<{ tenant: boolean }>): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'model-credential-row-')))
  directories.push(directory)
  const path = join(directory, 'vault.json')
  const secret = (raw: string) => {
    const parsed = parseSecretText(raw)
    if (!parsed.ok) throw new Error('fixture secret')
    return parsed.value
  }
  const created = createSecretVault({
    path,
    seed: [
      { key: apiKey({ layer: 'official' }), secret: secret(OFFICIAL), configuredAt: null },
      ...(input.tenant
        ? [
            {
              key: apiKey({ layer: 'tenant', tenant: TENANT }),
              secret: secret(TENANT_SECRET),
              configuredAt: null,
            },
          ]
        : []),
    ],
  })
  if (created.kind !== 'open') throw new Error(`test vault: ${created.kind}`)
  created.vault.close()
  return path
}

const rowsOver = (path: string) => [
  { id: 'model-credential', plugin: 'modelCredentialRow' },
  { id: 'secret-custody', plugin: 'secretCustodyRow', config: { path } },
]

/** What the service answers for one profile kind: the layer, then the secrets of that layer. */
function answer(service: ModelCredentialService, official: boolean) {
  const provider = openrouter()
  const layer = service.layerOf({ provider, official, access: ACCESS })
  if (!('ok' in layer)) return { layer }
  return {
    layer,
    secrets: service.resolve({ provider, layer: layer.ok, purpose: MODEL_SEND, access: ACCESS }),
  }
}

describe('the model-credential row', () => {
  it('declares the formal key, injects the secret custody and has no shutdown phase', () => {
    expect(rowDeclarationOf(modelCredentialRow)).toEqual({
      row: 'model-credential',
      implementation: 'real',
      manifest: {
        provides: ['modelCredential'],
        injects: ['settingsSecretCustody'],
        phase: null,
        sameProviderGroup: null,
      },
      lifecycle: { kind: 'none' },
    })
  })

  it('serves the official key to an official profile and nothing to a tenant profile', async () => {
    const { value, run } = await withLiveRows(
      { rows: rowsOver(vaultWith({ tenant: false })), plugins, probe: ['modelCredential'] },
      ctx => {
        const service = ctx.get('modelCredential') as ModelCredentialService
        return { official: answer(service, true), tenantProfile: answer(service, false) }
      },
    )
    expect(run.state('model-credential')).toMatchObject({ state: 'ACTIVE', missing: [] })
    expect(value.official).toEqual({
      layer: { ok: { layer: 'official' } },
      secrets: { ok: new Map([['apiKey', OFFICIAL]]) },
    })
    expect(value.tenantProfile).toEqual({ layer: { failure: { kind: 'missing' } } })
  })

  it('serves the tenant its own key once it set one, for every profile', async () => {
    const { value } = await withLiveRows(
      { rows: rowsOver(vaultWith({ tenant: true })), plugins, probe: ['modelCredential'] },
      ctx => {
        const service = ctx.get('modelCredential') as ModelCredentialService
        return { official: answer(service, true), tenantProfile: answer(service, false) }
      },
    )
    const own = {
      layer: { ok: { layer: 'tenant' } },
      secrets: { ok: new Map([['apiKey', TENANT_SECRET]]) },
    }
    expect(value).toEqual({ official: own, tenantProfile: own })
  })

  it('provides the two credential operations only, without a management member', async () => {
    const { value } = await withLiveRows(
      { rows: rowsOver(vaultWith({ tenant: false })), plugins, probe: ['modelCredential'] },
      ctx => Object.keys(ctx.get('modelCredential') as object).toSorted(),
    )
    expect(value).toEqual(['ctx', 'layerOf', 'name', 'resolve'])
  })

  it('does not become active without the secret custody', async () => {
    const run = await serveOnce({
      distribution: {
        rows: [{ id: 'model-credential', plugin: 'modelCredentialRow', config: {} }],
      },
      plugins,
    })
    expect(run.state('model-credential')?.['state']).not.toBe('ACTIVE')
  })
})
