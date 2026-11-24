import { pluginCategoryDisplay } from '@omne-harness/plugin-host-local'
import { readManifest } from '@omne-harness/plugin-protocol'
import { expect, it } from 'vitest'

const authoring = pluginCategoryDisplay.authoring ?? ''
const lines = authoring.split('\n')

it('says how a plugin is written with a whole manifest to copy, and the manifest it gives is one the reader reads whole', () => {
  const written = lines.find(line => line.startsWith('{'))
  if (written === undefined) throw new Error('the text gives no manifest')
  const read = readManifest(written)
  expect(read).toMatchObject({ kind: 'read', unread: [] })
  expect(read.kind === 'read' && read.manifest.client?.members).toHaveLength(1)
})

it('names every field a manifest reads and the three ways a member is written', () => {
  for (const word of ['schema', 'name', 'summary', 'client', 'server'])
    expect(authoring, word).toContain(word)
  for (const way of ['data', 'module', 'export', 'directory']) expect(authoring, way).toContain(way)
  expect(authoring).toContain('OmneExtensionPoints show')
})

it('stays short: it is read in full on every help', () => {
  expect(lines.length).toBeLessThanOrEqual(6)
  expect(new TextEncoder().encode(authoring).length).toBeLessThanOrEqual(1200)
})
