import {
  pluginCategoryDisplay,
  skinCategoryDisplay,
  skinSkinsPoint,
} from '@omne-harness/plugin-host-local'
import { readManifest } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'

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

it.each([
  ['plugin', pluginCategoryDisplay.authoring],
  ['skin', skinCategoryDisplay.authoring],
])('the text of the category %s has no empty line: each line says one thing', (_, text) => {
  for (const line of (text ?? '').split('\n')) expect(line.trim()).not.toBe('')
})

it('stays short: it is read in full on every help', () => {
  expect(lines.length).toBeLessThanOrEqual(6)
  expect(new TextEncoder().encode(authoring).length).toBeLessThanOrEqual(1200)
})

describe('the text on how a skin is written', () => {
  const skin = skinCategoryDisplay.authoring ?? ''

  it('names each layer a skin can change, and where to find the names of each', () => {
    for (const point of [
      'shell.tokens',
      'shell.part-style',
      'shell.part-render',
      'shell.icon',
      'shell.piece',
    ])
      expect(skin, point).toContain(point)
    expect(skin).toContain('OmneExtensionPoints show')
  })

  it('says how to hold both themes and how to carry and point at images', () => {
    for (const word of ['light-dark(', 'file(path)', 'files.url(path)', '.webp', '.svg'])
      expect(skin, word).toContain(word)
  })

  it('the point of the skins held says, to a reader of the tree of points, that its keys and items are skins', () => {
    expect(skinSkinsPoint.key).toMatch(/skin/u)
    expect(skinSkinsPoint.summary).toMatch(/skins held/u)
  })

  it('ends with what to check before it is done', () => {
    expect(skin.split('\n').at(-1)).toMatch(/^Before you finish/u)
  })

  it('stays short: it is read in full on every help of the category', () => {
    expect(skin.split('\n').length).toBeLessThanOrEqual(8)
    expect(new TextEncoder().encode(skin).length).toBeLessThanOrEqual(1400)
  })
})
