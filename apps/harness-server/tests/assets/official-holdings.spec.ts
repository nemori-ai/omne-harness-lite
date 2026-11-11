// The official holdings (src/assets): a release tool's settings come from the category hook of its
// asset body, the holding is (asset reference, definition id), and two different assets of one name
// never reach each other's secret (I-9).
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseSecretText, type SettingsHolding } from '@omne-harness/settings'
import { createSecretVault } from '@omne-harness/settings-local/secrets'
import { afterEach, describe, expect, it } from 'vitest'
import {
  holdingKey,
  officialAssetRef,
  officialHolding,
  toolAsset,
} from '../../src/assets/official-holdings.ts'
import { releaseWebDefinition } from './support.ts'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function openVault() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'official-holdings-vault-')))
  directories.push(directory)
  const created = createSecretVault({ path: join(directory, 'vault.json') })
  if (created.kind !== 'open') throw new Error(`fixture vault ${created.kind}`)
  return created.vault
}

describe('officialHolding', () => {
  it('derives the Web setting exa.apiKey through the tool category hook, under the asset reference', async () => {
    const held = officialHolding(toolAsset(await releaseWebDefinition()))
    if (held.kind !== 'declared') throw new Error(`holding ${held.kind}`)
    expect(held.ref).toEqual({
      asset: { category: 'tool', name: 'Web' },
      holding: { providerId: officialAssetRef('tool', 'Web'), definitionId: 'Web' },
    })
    expect(held.definition.providerId).toBe('official/tool/Web')
    expect(held.definition.items).toEqual([
      expect.objectContaining({ id: 'exa.apiKey', sensitivity: 'secret' }),
    ])
  })

  it('declares nothing for a tool without settings', async () => {
    const web = await releaseWebDefinition()
    const plain = { ...web, declarations: { ...web.declarations, settings: null } }
    expect(officialHolding(toolAsset(plain))).toEqual({ kind: 'none' })
  })
})

describe('holdingKey', () => {
  it('keeps the secrets of two assets of one name apart', () => {
    const official: SettingsHolding = { providerId: 'official/tool/Web', definitionId: 'Web' }
    const other: SettingsHolding = { providerId: 'tenant-a/tool/Web', definitionId: 'Web' }
    const scope = { layer: 'official' } as const
    const officialKey = holdingKey(scope, official, 'exa.apiKey')
    const otherKey = holdingKey(scope, other, 'exa.apiKey')
    expect(officialKey.target).not.toEqual(otherKey.target)
    const vault = openVault()
    const secret = parseSecretText('test-secret')
    if (!secret.ok) throw new Error('fixture secret')
    expect(vault.bind(officialKey, secret.value, null)).toBe('written')
    expect(vault.use(otherKey)).toBe('missing')
    expect(vault.describe(otherKey)).toMatchObject({ kind: 'unbound' })
  })
})
