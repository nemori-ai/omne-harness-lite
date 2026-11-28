import { describe, expect, it } from 'vitest'
import {
  pluginImpact,
  pluginPlacement,
  type KnownPoint,
  type PluginHeld,
} from '@omne-harness/plugin-host-local'
import { readManifest, type PluginManifest } from '@omne-harness/plugin-protocol'

function manifest(name: string, client: readonly unknown[], server?: readonly unknown[]) {
  const read = readManifest(
    JSON.stringify({
      schema: 1,
      name,
      summary: `The ${name} plugin.`,
      client: { members: client },
      ...(server !== undefined && { server: { members: server } }),
    }),
  )
  if (read.kind !== 'read') throw new Error(read.reason)
  return read.manifest
}

const SEND = { point: 'shell.part-style', key: 'session.composer.send', data: { base: {} } }
const ACCENT = { point: 'shell.tokens', key: 'shell.app', data: { '--omne-accent': 'green' } }
const CARD = { point: 'session.tool-call', key: 'Web', module: 'card.js', export: 'card' }

const POINTS: readonly KnownPoint[] = [
  { name: 'shell.part-style', side: 'client', takes: 'data', when: 'running' },
  { name: 'shell.tokens', side: 'client', takes: 'data', when: 'running' },
  { name: 'session.tool-call', side: 'client', takes: 'code', when: 'running' },
  { name: 'shell.pages', side: 'client', takes: 'code', when: 'build' },
  { name: 'shell.sidebar', side: 'client', takes: 'code', when: 'running' },
  { name: 'skill.skills', side: 'server', takes: 'directory', when: 'running' },
]

const held = (name: string, body: PluginManifest, enabled = true): PluginHeld => ({
  name,
  manifest: body,
  enabled,
})

const lines = (answer: ReturnType<typeof pluginImpact>): readonly string[] =>
  answer.lines.map(
    line =>
      `${line.mark} ${line.of === null ? '' : `${line.of}: `}${line.point} / ${line.key}   ${line.says}`,
  )

describe('what publishing a plugin would change', () => {
  it('a server member under a key the deployment holds with a lock would not load: the preview says who holds it', () => {
    const SERVER: readonly KnownPoint[] = [
      { name: 'access.protocols', side: 'server', takes: 'code', when: 'running' },
    ]
    const members = [
      { point: 'access.protocols', key: 'usage/v1', module: 'p.js', export: 'make' },
      { point: 'access.protocols', key: 'mine/v1', module: 'p.js', export: 'make' },
    ]
    const answer = pluginImpact({
      name: 'rival',
      change: 'publish',
      manifest: manifest('rival', [], members),
      held: [],
      points: SERVER,
      lockedBy: (point, key) =>
        point === 'access.protocols' && key === 'usage/v1' ? 'usage-access' : undefined,
    })
    expect(lines(answer)).toEqual([
      "! access.protocols / usage/v1   → locked by usage-access: the deployment holds this key and a tenant's member does not replace it. The plugin would not load.",
      '+ access.protocols / mine/v1   → in effect',
    ])
    expect(answer.advice).toBe('Leave this member out, or give it another key.')
    // A client member is not asked: the lock is of the server tree.
    const client = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [SEND]),
      held: [],
      points: POINTS,
      lockedBy: () => 'someone',
    })
    expect(lines(client)).toEqual(['+ shell.part-style / session.composer.send   → in effect'])
  })

  it('each member of a point that is there would be in effect; nothing else changes', () => {
    const answer = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [SEND, ACCENT]),
      held: [],
      points: POINTS,
    })
    expect(lines(answer)).toEqual([
      '+ shell.part-style / session.composer.send   → in effect',
      '+ shell.tokens / shell.app   → in effect',
    ])
    expect(answer.loads).toBe('loads on: client. Server: nothing to load.')
    expect(answer.advice).toBeNull()
  })

  it('a member on a key another enabled plugin of the tenant holds is a conflict, and so becomes the other', () => {
    const answer = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [SEND]),
      held: [held('round', manifest('round', [SEND])), held('off', manifest('off', [SEND]), false)],
      points: POINTS,
    })
    expect(lines(answer)).toEqual([
      '! shell.part-style / session.composer.send   → conflict with plugin round (same tenant). Neither would be in effect; the built-in would show.',
      '~ round: shell.part-style / session.composer.send   in effect → conflict',
    ])
    expect(answer.advice).toBe('Disable round first, or leave this member out.')
  })

  it('on a point that tells its items by id, items of two plugins under other ids are not a conflict; under one id they are', () => {
    const side = (id: string) => ({
      point: 'shell.sidebar',
      key: '',
      id,
      module: 's.js',
      export: 's',
    })
    const publishing = (theirs: string) =>
      pluginImpact({
        name: 'weather',
        change: 'publish',
        manifest: manifest('weather', [side('weather-now')]),
        held: [held('notes', manifest('notes', [side(theirs)]))],
        points: POINTS,
      })
    expect(publishing('notes-recent').lines).toEqual([
      {
        mark: '+',
        of: null,
        point: 'shell.sidebar',
        key: '',
        id: 'weather-now',
        says: '→ in effect',
      },
    ])
    expect(publishing('weather-now').lines.map(line => [line.mark, line.of, line.id])).toEqual([
      ['!', null, 'weather-now'],
      ['~', 'notes', 'weather-now'],
    ])
  })

  it('members of two plugins on one point under other keys are not a conflict', () => {
    const SUBMIT = { point: 'shell.part-style', key: 'session.composer.submit', data: { base: {} } }
    const answer = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [SEND]),
      held: [held('round', manifest('round', [SUBMIT]))],
      points: POINTS,
    })
    expect(lines(answer)).toEqual(['+ shell.part-style / session.composer.send   → in effect'])
  })

  it('a point that is not there now is said, with the nearest names that are', () => {
    const typo = { ...ACCENT, point: 'shell.token' }
    const answer = pluginImpact({
      name: 'green',
      change: 'publish',
      manifest: manifest('green', [typo]),
      held: [],
      points: POINTS,
    })
    expect(lines(answer)).toEqual([
      '! shell.token / shell.app   → shell.token is not a point now. Nearest: shell.tokens. It would not be placed.',
    ])
    expect(answer.advice).toBe(
      'OmneExtensionPoints find and tree list the points that are there now.',
    )
  })

  it('a member written the way its point does not take is said', () => {
    const wrong = {
      point: 'shell.part-style',
      key: 'session.composer.send',
      module: 'a.js',
      export: 'a',
    }
    const answer = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [wrong]),
      held: [],
      points: POINTS,
    })
    expect(lines(answer)).toEqual([
      '! shell.part-style / session.composer.send   → shell.part-style takes data; this member gives code. OmneExtensionPoints show shell.part-style says what a member must give.',
    ])
  })

  it('a point fixed when the app is built is late', () => {
    const page = { point: 'shell.pages', key: 'reports', module: 'a.js', export: 'a' }
    const answer = pluginImpact({
      name: 'reports',
      change: 'publish',
      manifest: manifest('reports', [page]),
      held: [],
      points: POINTS,
    })
    expect(lines(answer)).toEqual([
      '! shell.pages / reports   → late: this point is fixed when the app is built. It would not show.',
    ])
  })

  it('a closed point is closed, with the reason the loader gives, before what it takes or when it is fixed', () => {
    const gate = { point: 'shell.gate', key: '', module: 'a.js', export: 'a' }
    const closed: KnownPoint = {
      name: 'shell.gate',
      side: 'client',
      takes: 'code',
      when: 'build',
      closed: { why: 'no-tenant', note: 'Nobody is signed in here.' },
    }
    const answer = pluginImpact({
      name: 'gate',
      change: 'publish',
      manifest: manifest('gate', [gate]),
      held: [],
      points: [...POINTS, closed],
    })
    expect(lines(answer)).toEqual([
      '! shell.gate /    → the point is closed to plugins (no-tenant): Nobody is signed in here. It would not be in effect.',
    ])
  })

  it('says so when the points of a side are not known: no client is connected', () => {
    const answer = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [SEND]),
      held: [],
      points: POINTS.filter(point => point.side === 'server'),
      unknownSides: ['client'],
    })
    expect(lines(answer)).toEqual([
      '+ shell.part-style / session.composer.send   → placed when a client loads it; no client is connected now to say whether this point is there',
    ])
  })

  it('a new version of a held plugin: what it no longer writes goes away', () => {
    const answer = pluginImpact({
      name: 'pill',
      change: 'publish',
      manifest: manifest('pill', [SEND]),
      held: [held('pill', manifest('pill', [SEND, ACCENT]))],
      points: POINTS,
    })
    expect(lines(answer)).toEqual([
      '+ shell.part-style / session.composer.send   → in effect',
      '- shell.tokens / shell.app   → goes away: the new version does not write it',
    ])
  })

  it('a server member is said not to load: the server side does not load plugins', () => {
    const skill = { point: 'skill.skills', key: 'notes', directory: 'skills/notes' }
    const answer = pluginImpact({
      name: 'notes',
      change: 'publish',
      manifest: manifest('notes', [], [skill]),
      held: [],
      points: POINTS,
      serverLoads: false,
    })
    expect(lines(answer)).toEqual([
      '! skill.skills / notes   → not loaded: the server side does not load plugins in this build',
    ])
    expect(answer.loads).toBe('loads on: server.')
  })
})

describe('a point whose data may use only the names it lists', () => {
  const TOKENS: KnownPoint = {
    name: 'shell.tokens',
    side: 'client',
    takes: 'data',
    when: 'running',
    dataKeys: ['--omne-accent', '--omne-accent-strong', '--omne-surface'],
  }
  const impactOf = (data: unknown) =>
    lines(
      pluginImpact({
        name: 'green',
        change: 'publish',
        manifest: manifest('green', [{ point: 'shell.tokens', key: 'shell.app', data }]),
        held: [],
        points: [TOKENS],
      }),
    )

  it('a name it does not list is said before anything is published, with the nearest it does list', () => {
    expect(impactOf({ '--accent': 'green' })).toEqual([
      '! shell.tokens / shell.app   → --accent is not a name this point takes. Nearest: --omne-accent. OmneExtensionPoints show shell.tokens lists them. It would not be in effect.',
    ])
  })

  it('names it lists are in effect; one wrong name among them is the one said', () => {
    expect(impactOf({ '--omne-accent': 'green', '--omne-surface': 'white' })).toEqual([
      '+ shell.tokens / shell.app   → in effect',
    ])
    expect(impactOf({ '--omne-accent': 'green', colour: 'x' })[0]).toContain(
      'colour is not a name this point takes. OmneExtensionPoints show shell.tokens lists them.',
    )
  })

  it('data that is not an object is left to the point to judge', () => {
    expect(impactOf('green')).toEqual(['+ shell.tokens / shell.app   → in effect'])
  })
})

describe('what is near a name that is not there', () => {
  const impactOf = (point: string) =>
    lines(
      pluginImpact({
        name: 'x',
        change: 'publish',
        manifest: manifest('x', [{ point, key: 'k', data: {} }]),
        held: [],
        points: POINTS,
      }),
    )[0]

  it('names nothing when no point is near: a far name is not offered as what was meant', () => {
    expect(impactOf('reports.sections')).toBe(
      '! reports.sections / k   → reports.sections is not a point now. It would not be placed.',
    )
  })

  it('names the nearest, three at the most', () => {
    expect(impactOf('shell.token')).toContain('Nearest: shell.tokens.')
    expect(impactOf('shell.page')).toContain('Nearest: shell.pages.')
  })
})

describe('what disabling, removing or enabling a held plugin would change', () => {
  const round = held('round', manifest('round', [SEND]))

  it.each(['disable', 'remove'] as const)(
    '%s: its members go away, and what it was in conflict with comes back',
    change => {
      const answer = pluginImpact({
        name: 'pill',
        change,
        manifest: manifest('pill', [SEND, ACCENT]),
        held: [held('pill', manifest('pill', [SEND, ACCENT])), round],
        points: POINTS,
      })
      expect(lines(answer)).toEqual([
        '- shell.part-style / session.composer.send   → no longer in effect',
        '~ round: shell.part-style / session.composer.send   conflict → in effect',
        '- shell.tokens / shell.app   → no longer in effect; what it had replaced is back',
      ])
    },
  )

  it('enable: as publishing what it holds', () => {
    const answer = pluginImpact({
      name: 'pill',
      change: 'enable',
      manifest: manifest('pill', [SEND]),
      held: [held('pill', manifest('pill', [SEND]), false), round],
      points: POINTS,
    })
    expect(lines(answer)[0]).toBe(
      '! shell.part-style / session.composer.send   → conflict with plugin round (same tenant). Neither would be in effect; the built-in would show.',
    )
  })
})

describe('where a held plugin is placed now', () => {
  const pill = manifest('pill', [SEND, CARD])
  const loaded = { client: 'desktop-1', state: 'loaded', reason: null } as const

  it('is in effect where every connected client loaded it', () => {
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [loaded],
      server: null,
    })
    expect(answer.places).toEqual([
      {
        point: 'shell.part-style',
        key: 'session.composer.send',
        side: 'client',
        standing: 'in effect',
        says: '',
      },
      { point: 'session.tool-call', key: 'Web', side: 'client', standing: 'in effect', says: '' },
    ])
    expect(answer.clients).toEqual([{ label: 'desktop-1, connected', says: 'loaded' }])
    expect(answer.advice).toBeNull()
  })

  it('is not in effect where a client could not load it, with what the client said', () => {
    const failed = {
      client: 'desktop-1',
      state: 'failed',
      reason: 'card.js threw: TypeError',
    } as const
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [failed],
      server: null,
    })
    expect(answer.places.map(place => [place.standing, place.says])).toEqual([
      ['not in effect', 'the client could not load it'],
      ['not in effect', 'the client could not load it'],
    ])
    expect(answer.clients).toEqual([
      { label: 'desktop-1, connected', says: 'failed: card.js threw: TypeError' },
    ])
    expect(answer.advice).toBe('Fix the file and publish again, or disable it.')
  })

  it('is stopped where the app did not come up with it', () => {
    const stopped = { client: 'desktop-1', state: 'held', reason: null } as const
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [stopped],
      server: null,
    })
    expect(answer.clients).toEqual([
      {
        label: 'desktop-1, connected',
        says: 'stopped: the app did not come up twice in a row with this one wanted. It runs without it. Publish a new version, or disable it.',
      },
    ])
    expect(answer.places[0]?.standing).toBe('not in effect')
  })

  it('is in conflict with another enabled plugin of the tenant on the same key', () => {
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [held('round', manifest('round', [SEND]))],
      clients: [loaded],
      server: null,
    })
    expect(answer.places[0]).toEqual({
      point: 'shell.part-style',
      side: 'client',
      key: 'session.composer.send',
      standing: 'conflict',
      says: 'with plugin round; neither is in effect, the built-in shows',
    })
    expect(answer.places[1]?.standing).toBe('in effect')
  })

  it('tells the id of an item on a point that tells its items by id; pages of two plugins under other ids are both in effect', () => {
    const page = (id: string) => ({
      point: 'shell.sidebar',
      key: '',
      id,
      module: 's.js',
      export: 's',
    })
    const answer = pluginPlacement({
      name: 'weather',
      manifest: manifest('weather', [page('weather-now')]),
      enabled: true,
      held: [held('notes', manifest('notes', [page('notes-recent')]))],
      clients: [loaded],
      server: null,
    })
    expect(answer.places).toEqual([
      {
        point: 'shell.sidebar',
        key: '',
        id: 'weather-now',
        side: 'client',
        standing: 'in effect',
        says: '',
      },
    ])
  })

  it('is not known while no client is connected, and not in effect while it is disabled', () => {
    const none = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [],
      server: null,
    })
    expect(none.places[0]).toMatchObject({
      standing: 'not known',
      says: 'no client is connected to say',
    })
    expect(none.clients).toEqual([])
    const off = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: false,
      held: [],
      clients: [loaded],
      server: null,
    })
    expect(off.places[0]).toMatchObject({ standing: 'not in effect', says: 'it is disabled' })
  })

  it('is not in effect while a client waits for what it lacks, and says what the client waits for', () => {
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [{ client: 'desktop-1', state: 'waiting', reason: 'the point session.tool-call' }],
      server: null,
    })
    expect(answer.places.map(place => [place.standing, place.says])).toEqual([
      ['not in effect', 'the client waits for what it lacks'],
      ['not in effect', 'the client waits for what it lacks'],
    ])
    expect(answer.clients).toEqual([
      {
        label: 'desktop-1, connected',
        says: 'waits for the point session.tool-call: it loads by itself when that is there',
      },
    ])
    const told = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [{ client: 'desktop-1', state: 'waiting', reason: null }],
      server: null,
    })
    expect(told.clients?.[0]?.says).toBe(
      'waits for what it lacks: it loads by itself when that is there',
    )
    const one = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [{ client: 'desktop-1', state: 'waiting', reason: null }, loaded],
      server: null,
    })
    expect(one.places[0]?.standing).toBe('not in effect')
  })

  it('says a client that told nothing of it has not loaded it yet', () => {
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: [{ client: 'desktop-1', state: null, reason: null }],
      server: null,
    })
    expect(answer.clients).toEqual([{ label: 'desktop-1, connected', says: 'not loaded yet' }])
    expect(answer.places[0]?.standing).toBe('not known')
  })

  it('tells each place on the server from the server, and each place on a client from the clients', () => {
    const label = { point: 'notes.labels', key: 'urgent', data: 1 }
    const both = manifest('pill', [SEND], [label])
    const at = (state: 'loading' | 'loaded' | 'failed' | 'held' | null) =>
      pluginPlacement({
        name: 'pill',
        manifest: both,
        enabled: true,
        held: [],
        clients: [loaded],
        server: { state, reason: state === 'failed' ? 'labels.js threw: boom' : null },
      }).places.map(place => [place.point, place.standing, place.says])
    expect(at('loaded')).toEqual([
      ['shell.part-style', 'in effect', ''],
      ['notes.labels', 'in effect', ''],
    ])
    expect(at('failed')[1]).toEqual([
      'notes.labels',
      'not in effect',
      'the server could not load it: labels.js threw: boom',
    ])
    expect(at('held')[1]?.[2]).toBe(
      'the server stopped loading it: it went down twice in a row while loading it or in calls of it. Publish a new version, or disable it and enable it again.',
    )
    expect(at('loading')[1]?.slice(1)).toEqual(['not known', 'the server is loading it'])
    expect(at(null)[1]?.slice(1)).toEqual(['not known', 'the server has not loaded it yet'])
    expect(at('failed')[0]?.[1]).toBe('in effect')
  })

  it('clients are not known when they cannot be read', () => {
    const answer = pluginPlacement({
      name: 'pill',
      manifest: pill,
      enabled: true,
      held: [],
      clients: null,
      server: null,
    })
    expect(answer.clients).toBeNull()
    expect(answer.places[0]).toMatchObject({ standing: 'not known' })
  })
})
