import {
  capabilityId,
  digestBytes,
  type CapabilityId,
  type PackageReader,
} from '@omne-harness/assets'
import {
  pluginEffect,
  type KnownPoint,
  type ListedPlugin,
  type PluginEffectPorts,
} from '@omne-harness/plugin-host-local'
import { readManifest } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'

const manifestText = (name: string, members: readonly unknown[]): string =>
  JSON.stringify({ schema: 1, name, summary: `The ${name} plugin.`, client: { members } })

function listed(name: string, members: readonly unknown[], enabled = true): ListedPlugin {
  const read = readManifest(manifestText(name, members))
  if (read.kind !== 'read') throw new Error(read.reason)
  return {
    name,
    enabled,
    manifest: read.manifest,
    held: { asset: `held/${name}`, version: `sha256:${'a'.repeat(64)}` },
  }
}

/** A directory not yet published, held in memory. */
function directory(files: Readonly<Record<string, string>>): PackageReader {
  const bytes = (path: string) => new TextEncoder().encode(files[path])
  return {
    manifest: async () => ({
      ok: {
        entries: Object.keys(files).map(path => ({
          path,
          bytes: bytes(path).length,
          digest: digestBytes(bytes(path)),
        })),
      },
    }),
    open: async path => (path in files ? { ok: bytes(path) } : { failure: 'entry-not-found' }),
  }
}

const SEND = { point: 'shell.part-style', key: 'session.composer.send', data: { base: {} } }
const STYLE: KnownPoint = { name: 'shell.part-style', side: 'client', takes: null, when: null }

const plugin = (name: string): CapabilityId => {
  const made = capabilityId('plugin', name)
  if (!made.ok) throw new Error('capability')
  return made.id
}

function world(over: Partial<PluginEffectPorts> = {}) {
  const asked: string[] = []
  const effect = pluginEffect({
    listed: async tenant => (asked.push(`listed ${tenant}`), { kind: 'read', plugins: [] }),
    serverPoints: () => [
      { name: 'skill.skills', side: 'server', takes: 'directory', when: 'running' },
    ],
    clients: tenant => (asked.push(`clients ${tenant}`), []),
    serverLoads: false,
    ...over,
  })
  return { effect, asked }
}

const client = (plugins: readonly { version: string; state: 'loaded' | 'failed' }[] = []) => ({
  client: 'desktop-1',
  points: [{ name: STYLE.name }],
  plugins: plugins.map(({ version, state }) => ({
    name: 'tidy',
    version,
    state,
    reason: state === 'failed' ? 'card.js threw' : null,
  })),
})

describe('what a change of a plugin would do', () => {
  const tidy = directory({ 'plugin.json': manifestText('tidy', [SEND]) })
  const publish = (from: PackageReader) =>
    ({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'publish',
      content: { kind: 'directory', from },
    }) as const

  it('reads the manifest of a directory not yet published, against the points a client told', async () => {
    const { effect, asked } = world({ clients: () => [client()] })
    expect(await effect.impact.of(publish(tidy))).toEqual({
      kind: 'changes',
      lines: [
        {
          mark: '+',
          of: null,
          point: 'shell.part-style',
          key: 'session.composer.send',
          says: '→ in effect',
        },
      ],
      loads: 'loads on: client. Server: nothing to load.',
      advice: null,
    })
    expect(asked).toEqual(['listed alice'])
  })

  it('takes what a client told of a point: how a member is written, when it may change, and the names its data may use', async () => {
    const told = {
      client: 'desktop-1',
      plugins: [],
      points: [
        {
          name: 'shell.part-style',
          contract: { item: { kind: 'pure' }, binding: 'run' },
        },
        {
          name: 'shell.tokens',
          contract: { item: { kind: 'data' }, binding: 'run' },
          dataKeys: [{ name: '--omne-accent' }],
        },
        { name: 'shell.pages', contract: { item: { kind: 'pure' }, binding: 'build' } },
      ],
    } as const
    const { effect } = world({ clients: () => [told] })
    const of = async (member: unknown) => {
      const from = directory({ 'plugin.json': manifestText('tidy', [member]) })
      const answer = await effect.impact.of(publish(from))
      return answer.kind === 'changes' ? answer.lines[0]?.says : answer.reason
    }
    expect(await of(SEND)).toContain('shell.part-style takes code; this member gives data')
    expect(await of({ point: 'shell.tokens', key: 'shell.app', data: { accent: 'g' } })).toContain(
      'accent is not a name this point takes. Nearest: --omne-accent.',
    )
    expect(
      await of({ point: 'shell.pages', key: 'reports', module: 'a.js', export: 'a' }),
    ).toContain('late: this point is fixed when the app is built')
  })

  it('says which fields of the manifest are not read, and where members go', async () => {
    const text = JSON.stringify({
      schema: 1,
      name: 'tidy',
      summary: 's',
      version: '1.0.0',
      members: [SEND],
    })
    const answer = await world().effect.impact.of(publish(directory({ 'plugin.json': text })))
    expect(answer.kind === 'changes' && answer.advice).toBe(
      'plugin.json has fields that are not read: members, version. A manifest reads schema, name, summary, client and server; members go under client or server.',
    )
  })

  it('says a client point is not known while no client is connected', async () => {
    const answer = await world().effect.impact.of(publish(tidy))
    expect(answer.kind === 'changes' && answer.lines[0]?.says).toContain(
      'no client is connected now',
    )
  })

  it.each([
    [
      'a manifest that cannot be read',
      directory({ 'plugin.json': '{"schema":1,"name":"Tidy"}' }),
      'plugin.json: the name "Tidy" is not lower-case letters, digits and hyphens',
    ],
    ['a directory without one', directory({ 'card.js': '' }), 'the directory has no plugin.json'],
  ])('says why for %s', async (_name, from, reason) => {
    expect(await world().effect.impact.of(publish(from))).toEqual({ kind: 'unavailable', reason })
  })

  it('says a plugin is published from a directory when given a body', async () => {
    const answer = await world().effect.impact.of({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'publish',
      content: { kind: 'data', body: { kind: 'null' } },
    })
    expect(answer).toEqual({
      kind: 'unavailable',
      reason: 'a plugin is published from a directory',
    })
  })

  it('takes the manifest of a held one from what the tenant holds; one it does not hold is said', async () => {
    const { effect } = world({
      listed: async () => ({ kind: 'read', plugins: [listed('tidy', [SEND])] }),
    })
    const held = await effect.impact.of({
      tenant: 'alice',
      capability: plugin('tidy'),
      change: 'disable',
    })
    expect(held.kind === 'changes' && held.lines.map(line => line.mark)).toEqual(['-'])
    expect(
      await effect.impact.of({ tenant: 'alice', capability: plugin('none'), change: 'remove' }),
    ).toEqual({ kind: 'unavailable', reason: 'the tenant holds no plugin named none' })
  })

  it('is unavailable when what the tenant holds cannot be read', async () => {
    const { effect } = world({ listed: async () => ({ kind: 'unavailable' }) })
    const reason = 'what the tenant holds cannot be read now'
    expect(
      await effect.impact.of({ tenant: 'alice', capability: plugin('tidy'), change: 'disable' }),
    ).toEqual({ kind: 'unavailable', reason })
    expect(await effect.placement.of({ tenant: 'alice', capability: plugin('tidy') })).toEqual({
      kind: 'unavailable',
      reason,
    })
  })
})

describe('where a held plugin is placed now', () => {
  const holding = {
    listed: async () => ({ kind: 'read', plugins: [listed('tidy', [SEND])] }) as const,
  }
  const placed = (over: Partial<PluginEffectPorts>) =>
    world({ ...holding, ...over }).effect.placement.of({
      tenant: 'alice',
      capability: plugin('tidy'),
    })

  it('is in effect where a client told it loaded the version the tenant holds', async () => {
    const version = 'a'.repeat(64)
    expect(await placed({ clients: () => [client([{ version, state: 'loaded' }])] })).toEqual({
      kind: 'placed',
      places: [
        {
          point: 'shell.part-style',
          key: 'session.composer.send',
          standing: 'in effect',
          says: '',
        },
      ],
      clients: [{ label: 'desktop-1, connected', says: 'loaded' }],
      advice: null,
    })
  })

  it('counts nothing a client told of another version', async () => {
    const version = 'b'.repeat(64)
    const stale = await placed({ clients: () => [client([{ version, state: 'loaded' }])] })
    expect(stale.kind === 'placed' && stale.clients).toEqual([
      { label: 'desktop-1, connected', says: 'not loaded yet' },
    ])
  })

  it('gives no clients when they cannot be read, and says one it does not hold', async () => {
    const unread = await placed({ clients: () => undefined })
    expect(unread.kind === 'placed' && unread.clients).toBeNull()
    expect(
      await world().effect.placement.of({ tenant: 'alice', capability: plugin('tidy') }),
    ).toEqual({ kind: 'unavailable', reason: 'the tenant holds no plugin named tidy' })
  })
})
