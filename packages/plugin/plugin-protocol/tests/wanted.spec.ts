import { describe, expect, it } from 'vitest'
import { wantedOf, type Offered, type PluginManifest } from '@omne-harness/plugin-protocol'

const manifest = (name: string, sides: Partial<PluginManifest> = {}): PluginManifest => ({
  schema: 1,
  name,
  summary: `${name}.`,
  ...sides,
})
const data = (key: string) => ({ point: 'shell.tokens', key, data: { tokens: {} } })
const offered = (version: string, value: PluginManifest): Offered => ({
  version,
  manifest: value,
  files: [{ path: 'plugin.json', digest: version }],
})

describe('what one side is to load, of what a source offers', () => {
  const both = offered(
    'v1',
    manifest('both', {
      client: { members: [data('a')] },
      server: { needs: ['extensions'], members: [data('b')] },
    }),
  )
  const clientOnly = offered('v2', manifest('alpha', { client: { members: [data('c')] } }))
  const serverOnly = offered('v3', manifest('zeta', { server: { members: [data('d')] } }))
  const neither = offered('v4', manifest('empty'))

  it('is each plugin that has that side, with the members and needs of that side, by name', () => {
    expect(wantedOf([serverOnly, both, clientOnly, neither], 'client')).toEqual([
      { name: 'alpha', version: 'v2', members: [data('c')], needs: [], files: clientOnly.files },
      { name: 'both', version: 'v1', members: [data('a')], needs: [], files: both.files },
    ])
    expect(wantedOf([serverOnly, both, clientOnly, neither], 'server')).toEqual([
      {
        name: 'both',
        version: 'v1',
        members: [data('b')],
        needs: ['extensions'],
        files: both.files,
      },
      { name: 'zeta', version: 'v3', members: [data('d')], needs: [], files: serverOnly.files },
    ])
  })

  it('does not depend on the order of what is offered, and is nothing of nothing', () => {
    const one = wantedOf([both, clientOnly], 'client')
    expect(wantedOf([clientOnly, both], 'client')).toEqual(one)
    expect(wantedOf([], 'client')).toEqual([])
  })

  it('carries the kind a manifest writes, and none for one that writes none', () => {
    const skin = offered('v5', manifest('sea', { kind: 'skin', client: { members: [data('s')] } }))
    expect(wantedOf([skin, clientOnly], 'client')).toEqual([
      { name: 'alpha', version: 'v2', members: [data('c')], needs: [], files: clientOnly.files },
      {
        name: 'sea',
        version: 'v5',
        kind: 'skin',
        members: [data('s')],
        needs: [],
        files: skin.files,
      },
    ])
    expect('kind' in wantedOf([clientOnly], 'client')[0]!).toBe(false)
    expect(wantedOf([skin], 'server')).toEqual([])
  })

  it('leaves out a name offered twice: neither is loaded', () => {
    const again = offered('v9', manifest('both', { client: { members: [data('z')] } }))
    expect(wantedOf([both, again, clientOnly], 'client').map(each => each.name)).toEqual(['alpha'])
  })
})
