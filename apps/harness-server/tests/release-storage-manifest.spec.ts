import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compositeManifestDigest } from '../src/rows/session-storage/composite.ts'
import { storageCatalog } from '../src/rows/storage/catalog.ts'

const release = JSON.parse(
  readFileSync(new URL('../config/serve.distribution.json', import.meta.url), 'utf8'),
) as { rows: { id: string; config: { manifestDigest?: string } }[] }

describe('the release commits under the registered storage combination', () => {
  it.each(['session-handoff', 'agent-journal'])('%s uses the current material manifest', id => {
    const manifest = compositeManifestDigest(storageCatalog())
    if (manifest.kind !== 'manifest') throw new Error(manifest.diagnostic)
    const row = release.rows.find(row => row.id === id)
    expect(row).toBeDefined()
    expect(row?.config.manifestDigest).toBe(manifest.digest)
  })
})
