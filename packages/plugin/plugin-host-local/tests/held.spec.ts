import { describe, expect, it } from 'vitest'
import {
  digestBytes,
  packageBody,
  readBodyText,
  type AssetLayerSource,
  type Candidate,
  type JsonValue,
  type PackageReader,
} from '@omne-harness/assets'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  createKeptContents,
  heldPlugins,
  listedPlugins,
  readHeldPart,
  type HeldPluginPorts,
} from '@omne-harness/plugin-host-local'

const encoder = new TextEncoder()
const LIMITS = {
  maxBytes: 100_000,
  maxDepth: 32,
  maxItems: 1000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 32,
}
const HEX = 'a'.repeat(64)
const versionOf = (letter: string): string => `sha256:${letter.repeat(64)}`

const manifestText = (name: string, sides: 'client' | 'server' | 'both' = 'client'): string =>
  JSON.stringify({
    schema: 1,
    name,
    summary: `The ${name} plugin.`,
    ...(sides !== 'server' && {
      client: {
        members: [{ point: 'shell.tokens', key: name, data: { '--omne-accent': 'green' } }],
      },
    }),
    ...(sides !== 'client' && {
      server: { members: [{ point: 'note.notes', key: name, data: {} }] },
    }),
  })

/** The body of a published version, as the assets keep it: the manifest with the file list beside it. */
function bodyOf(text: string, extra: readonly string[] = []): JsonValue {
  const read = readBodyText(text, LIMITS)
  if (read.kind !== 'ok') throw new Error(read.kind)
  const entries = ['plugin.json', ...extra].map(path => ({
    path,
    bytes: path === 'plugin.json' ? encoder.encode(text).length : 3,
    digest: digestBytes(encoder.encode(path)),
  }))
  const body = packageBody(read.value, { entries })
  if (!('ok' in body)) throw new Error(JSON.stringify(body))
  return body.ok
}

type Held = Readonly<{ name: string; candidate: Candidate; body?: JsonValue }>

const candidate = (name: string, letter = 'a', disabled = false): Candidate => ({
  asset: `holding/${name}`,
  version: versionOf(letter),
  disabled,
  immutable: false,
  replaceLocked: false,
})

function world(held: readonly Held[], over: Partial<AssetLayerSource> = {}) {
  const asked: string[] = []
  const tenantLayer: AssetLayerSource = {
    layer: 'tenant',
    async list({ category, after, limit }) {
      asked.push(`list ${category} ${String(after)} ${limit}`)
      const names = [...new Set(held.map(each => each.name))].sort()
      const start = after === null ? 0 : names.indexOf(after) + 1
      const page = names.slice(start, start + 2)
      const last = start + 2 >= names.length
      return {
        layer: 'tenant',
        state: 'read',
        page: {
          items: page.map(name => {
            const one = held.find(each => each.name === name)!.candidate
            return {
              capability: { category, name } as never,
              layer: 'tenant',
              asset: one.asset,
              version: one.version,
              selection: 'latest' as never,
              enabled: !one.disabled,
            }
          }),
          next: last ? null : (page.at(-1) ?? null),
          completeness: 'complete',
        },
      }
    },
    async candidates(capability) {
      return {
        layer: 'tenant',
        state: 'read',
        candidates: held.filter(each => each.name === capability.name).map(each => each.candidate),
      }
    },
    ...over,
  }
  const official: AssetLayerSource = {
    layer: 'official',
    list: async () => ({ layer: 'official', state: 'not-applicable' }),
    candidates: async () => ({ layer: 'official', state: 'read', candidates: [] }),
  }
  const ports: HeldPluginPorts = {
    sources: tenant => (tenant === 'alice' ? [official, tenantLayer] : undefined),
    async body(tenant, { asset, version }) {
      asked.push(`body ${tenant} ${asset}`)
      return held.find(each => each.candidate.asset === asset && each.candidate.version === version)
        ?.body
    },
  }
  return { ports, asked }
}

const tidy: Held = {
  name: 'tidy',
  candidate: candidate('tidy'),
  body: bodyOf(manifestText('tidy'), ['main.js']),
}

describe('the plugins a tenant holds', () => {
  it('gives each plugin the evaluation chooses: its name, a version fit for a path, its manifest and its files', async () => {
    const answer = await heldPlugins(world([tidy]).ports, 'alice')
    if (answer.kind !== 'read') throw new Error(answer.kind)
    expect(answer.plugins).toHaveLength(1)
    const [plugin] = answer.plugins
    expect(plugin).toMatchObject({
      name: 'tidy',
      version: HEX,
      held: { asset: 'holding/tidy', version: versionOf('a') },
    })
    expect(plugin!.manifest.client?.members[0]?.key).toBe('tidy')
    expect(JSON.parse(plugin!.manifestText)).toEqual(JSON.parse(manifestText('tidy')))
    expect(plugin!.files.map(file => [file.path, file.bytes])).toEqual([
      ['plugin.json', encoder.encode(manifestText('tidy')).length],
      ['main.js', 3],
    ])
    expect(plugin!.files[1]!.digest).toBe(digestBytes(encoder.encode('main.js')))
  })

  it('reads every page of the listing', async () => {
    const names = ['a-one', 'b-two', 'c-three', 'd-four', 'e-five']
    const held = names.map(name => ({
      name,
      candidate: candidate(name),
      body: bodyOf(manifestText(name)),
    }))
    const { ports, asked } = world(held)
    const answer = await heldPlugins(ports, 'alice')
    expect(answer.kind === 'read' && answer.plugins.map(each => each.name)).toEqual(names)
    expect(asked.filter(line => line.startsWith('list'))).toEqual([
      'list plugin null 100',
      'list plugin b-two 100',
      'list plugin d-four 100',
    ])
  })

  it('does not give a plugin that is disabled', async () => {
    const off: Held = { ...tidy, candidate: candidate('tidy', 'a', true) }
    expect(await heldPlugins(world([off]).ports, 'alice')).toEqual({ kind: 'read', plugins: [] })
  })

  it('gives a plugin whose side is only the server too: which side loads it is the reader to say', async () => {
    const server: Held = {
      name: 'notes',
      candidate: candidate('notes'),
      body: bodyOf(manifestText('notes', 'server')),
    }
    const answer = await heldPlugins(world([server]).ports, 'alice')
    expect(answer.kind === 'read' && answer.plugins.map(each => each.name)).toEqual(['notes'])
  })

  it('is unavailable when the layers of the tenant cannot be given', async () => {
    expect(await heldPlugins(world([tidy]).ports, 'bob')).toEqual({ kind: 'unavailable' })
  })

  it('is unavailable when the listing cannot be read, or is partial', async () => {
    const unread = world([tidy], { list: async () => ({ layer: 'tenant', state: 'unavailable' }) })
    expect(await heldPlugins(unread.ports, 'alice')).toEqual({ kind: 'unavailable' })
    const partial = world([tidy], {
      list: async () => ({
        layer: 'tenant',
        state: 'read',
        page: { items: [], next: null, completeness: 'partial' },
      }),
    })
    expect(await heldPlugins(partial.ports, 'alice')).toEqual({ kind: 'unavailable' })
  })

  it('is unavailable when a layer cannot give its candidates: what is loaded is not taken for gone', async () => {
    const { ports } = world([tidy], {
      candidates: async () => ({ layer: 'tenant', state: 'unavailable' }),
    })
    expect(await heldPlugins(ports, 'alice')).toEqual({ kind: 'unavailable' })
  })

  it('is unavailable when the body of the chosen version cannot be read', async () => {
    const { body: _, ...bodiless } = tidy
    expect(await heldPlugins(world([bodiless]).ports, 'alice')).toEqual({ kind: 'unavailable' })
  })

  it('leaves out a version whose body is not a manifest, and gives the others', async () => {
    const odd: Held = {
      name: 'odd',
      candidate: candidate('odd'),
      body: { kind: 'object', entries: [] },
    }
    const answer = await heldPlugins(world([odd, tidy]).ports, 'alice')
    expect(answer.kind === 'read' && answer.plugins.map(each => each.name)).toEqual(['tidy'])
  })

  it('leaves out a version whose name is not a digest: it cannot be written in a path', async () => {
    const odd: Held = { ...tidy, candidate: { ...tidy.candidate, version: 'sha256:../x' } }
    expect(await heldPlugins(world([odd]).ports, 'alice')).toEqual({ kind: 'read', plugins: [] })
  })
})

describe('every plugin a tenant holds, enabled or not', () => {
  it('gives each with its manifest and whether it is enabled', async () => {
    const off: Held = {
      name: 'quiet',
      candidate: candidate('quiet', 'c', true),
      body: bodyOf(manifestText('quiet')),
    }
    const answer = await listedPlugins(world([tidy, off]).ports, 'alice')
    if (answer.kind !== 'read') throw new Error(answer.kind)
    expect(answer.plugins.map(each => [each.name, each.enabled, each.manifest.name])).toEqual([
      ['quiet', false, 'quiet'],
      ['tidy', true, 'tidy'],
    ])
    expect(answer.plugins[1]?.held).toEqual({ asset: 'holding/tidy', version: versionOf('a') })
  })

  it('is unavailable when the layers, the listing or a body cannot be read', async () => {
    expect(await listedPlugins(world([tidy]).ports, 'bob')).toEqual({ kind: 'unavailable' })
    const unread = world([tidy], { list: async () => ({ layer: 'tenant', state: 'unavailable' }) })
    expect(await listedPlugins(unread.ports, 'alice')).toEqual({ kind: 'unavailable' })
    const { body: _, ...bodiless } = tidy
    expect(await listedPlugins(world([bodiless]).ports, 'alice')).toEqual({ kind: 'unavailable' })
  })

  it('leaves out one whose body is not a manifest', async () => {
    const odd: Held = {
      name: 'odd',
      candidate: candidate('odd'),
      body: { kind: 'object', entries: [] },
    }
    const answer = await listedPlugins(world([odd, tidy]).ports, 'alice')
    expect(answer.kind === 'read' && answer.plugins.map(each => each.name)).toEqual(['tidy'])
  })
})

describe('reading a part of a file of a held plugin', () => {
  const text = '0123456789'
  const file = { path: 'main.js', digest: digestBytes(encoder.encode(text)), bytes: 10 }
  const opened: string[] = []
  const reader: PackageReader = {
    manifest: async () => fail('unavailable'),
    async open(path, expected) {
      opened.push(`${path} ${expected}`)
      return path === 'main.js' ? succeed(encoder.encode(text)) : fail('entry-not-found')
    },
  }
  const decode = (part: Uint8Array): string => new TextDecoder().decode(part)

  it('gives the part asked for, where the next one starts, and the size of the whole', async () => {
    const first = await readHeldPart(reader, file, 0, 4)
    if (first.kind !== 'read') throw new Error(first.kind)
    expect([decode(first.part), first.next, first.bytes]).toEqual(['0123', 4, 10])
    expect(opened.at(-1)).toBe(`main.js ${file.digest}`)
    const last = await readHeldPart(reader, file, 8, 4)
    if (last.kind !== 'read') throw new Error(last.kind)
    expect([decode(last.part), last.next, last.bytes]).toEqual(['89', null, 10])
  })

  it('gives nothing more past the end', async () => {
    const past = await readHeldPart(reader, file, 10, 4)
    expect(past).toMatchObject({ kind: 'read', next: null, bytes: 10 })
    expect(past.kind === 'read' && past.part.length).toBe(0)
  })

  it('says the file is absent when the package does not have it', async () => {
    expect(await readHeldPart(reader, { ...file, path: 'gone.js' }, 0, 4)).toEqual({
      kind: 'absent',
      what: 'file',
    })
  })

  it('is unavailable when the package cannot be read', async () => {
    const broken: PackageReader = {
      manifest: async () => fail('unavailable'),
      open: async () => fail('material-unavailable'),
    }
    expect(await readHeldPart(broken, file, 0, 4)).toEqual({ kind: 'unavailable' })
  })
})

describe('the contents kept between the parts of a file', () => {
  const text = '0123456789'
  const file = { path: 'main.js', digest: digestBytes(encoder.encode(text)), bytes: 10 }

  it('cuts every part of a file from one opening of it', async () => {
    let opened = 0
    const reader: PackageReader = {
      manifest: async () => fail('unavailable'),
      open: async () => ((opened += 1), succeed(encoder.encode(text))),
    }
    const kept = createKeptContents(1000)
    const parts: string[] = []
    for (let offset: number | null = 0; offset !== null;) {
      const read = await readHeldPart(reader, file, offset, 3, kept)
      if (read.kind !== 'read') throw new Error(read.kind)
      parts.push(new TextDecoder().decode(read.part))
      offset = read.next
    }
    expect(parts).toEqual(['012', '345', '678', '9'])
    expect(opened).toBe(1)
  })

  it('keeps by digest, the last used longest, within its budget; a content over the budget is not kept', () => {
    const kept = createKeptContents(10)
    const bytes = (size: number): Uint8Array => new Uint8Array(size)
    kept.keep('a', bytes(4))
    kept.keep('b', bytes(4))
    expect(kept.get('a')?.byteLength).toBe(4)
    kept.keep('c', bytes(4))
    expect([kept.get('a'), kept.get('b'), kept.get('c')].map(each => each?.byteLength)).toEqual([
      4,
      undefined,
      4,
    ])
    kept.keep('huge', bytes(11))
    expect(kept.get('huge')).toBeUndefined()
    expect(kept.get('a')?.byteLength).toBe(4)
  })
})
