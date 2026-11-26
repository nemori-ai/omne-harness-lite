import {
  serverInstall,
  type ServerEntry,
  type ServerInstallPorts,
  type ServerPoint,
} from '@omne-harness/plugin-host-local'
import { memberDigest, type Member, type Wanted } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'

const SCOPE = ['tenant', 'alice'] as const
const DATA: ServerPoint = { kind: 'takes', takes: 'data', when: 'running' }
const CODE: ServerPoint = { kind: 'takes', takes: 'code', when: 'running' }
const POINTS: Readonly<Record<string, ServerPoint>> = {
  'notes.labels': DATA,
  'notes.greeters': CODE,
  'notes.pages': { kind: 'takes', takes: 'data', when: 'build' },
  'skill.skills': { kind: 'category', place: directory => ({ within: directory }) },
}
const FILES = [{ path: 'greet.js', digest: 'sha256:g' }]
const LABEL: Member = { point: 'notes.labels', key: 'urgent', data: { colour: 'red' } }
const GREETER: Member = {
  point: 'notes.greeters',
  key: 'hello',
  module: 'greet.js',
  export: 'make',
}

const wanted = (...members: Member[]): Wanted => ({
  name: 'tidy',
  version: 'v1',
  members,
  needs: [],
  files: FILES,
})
const BOUND = { ports: {}, close: () => undefined }

function world(over: Partial<ServerInstallPorts> = {}) {
  const placed: (readonly ServerEntry[])[] = []
  const removed: number[] = []
  const loaded: string[] = []
  const ports: ServerInstallPorts = {
    scope: SCOPE,
    point: name => POINTS[name],
    guestForm: point => (point === 'notes.greeters' ? made => ({ greet: made }) : undefined),
    needs: () => ({ kind: 'adopted', bind: () => BOUND }),
    load: async file => {
      loaded.push(`${file.path} ${file.digest}`)
      return { make: () => 'hello' }
    },
    async put(entries) {
      placed.push(entries)
      const at = placed.length
      return () => void removed.push(at)
    },
    ...over,
  }
  return { install: serverInstall(ports), placed, removed, loaded }
}

const reasonOf = async (w: ReturnType<typeof world>, ...members: Member[]) => {
  const outcome = await w.install(wanted(...members))
  return outcome.kind === 'failed' ? outcome.reason : outcome.kind
}

describe('the members a plugin writes for the server, put by the loader', () => {
  it('puts a member of data as one entry in the scope of the tenant that holds the plugin, and takes it back', async () => {
    const w = world()
    const ranked: Member = { point: 'notes.labels', key: 'later', id: 'b', rank: 3, data: 7 }
    const outcome = await w.install(wanted(LABEL, ranked))
    expect(w.placed).toEqual([
      [
        {
          point: 'notes.labels',
          key: 'urgent',
          id: '',
          scope: SCOPE,
          rank: 0,
          digest: memberDigest(LABEL, FILES),
          item: { colour: 'red' },
        },
        {
          point: 'notes.labels',
          key: 'later',
          id: 'b',
          rank: 3,
          scope: SCOPE,
          digest: memberDigest(ranked, FILES),
          item: 7,
        },
      ],
    ])
    if (outcome.kind !== 'installed') throw new Error(JSON.stringify(outcome))
    expect(w.removed).toEqual([])
    outcome.remove()
    expect(w.removed).toEqual([1])
  })

  it('loads the file of a member of code as it is listed, hands its export the ports alone, and puts what the point makes of it', async () => {
    const seen: unknown[] = []
    const w = world({
      load: async () => ({
        make(this: unknown, ...given: unknown[]) {
          seen.push(this, given.length, Object.keys(given[0] as object), Object.isFrozen(given[0]))
          return 'made'
        },
      }),
    })
    expect((await w.install(wanted(GREETER))).kind).toBe('installed')
    expect(seen).toEqual([undefined, 1, ['ports'], true])
    expect(w.placed[0]?.[0]).toMatchObject({
      point: 'notes.greeters',
      key: 'hello',
      scope: SCOPE,
      item: { greet: 'made' },
    })
  })

  it('loads a file by the digest the package lists for it', async () => {
    const w = world()
    await w.install(wanted(GREETER))
    expect(w.loaded).toEqual(['greet.js sha256:g'])
  })

  it.each([
    [
      'data on a point that takes code',
      { point: 'notes.greeters', key: 'k', data: 1 },
      'member 1 (notes.greeters k): the point takes code; this member gives data',
    ],
    [
      'code on a point that takes data',
      { point: 'notes.labels', key: 'k', module: 'greet.js', export: 'make' },
      'member 1 (notes.labels k): the point takes data; this member gives code',
    ],
    [
      'a directory on a point that is not of a category',
      { point: 'notes.labels', key: 'k', directory: 'd' },
      'member 1 (notes.labels k): the point takes data; this member gives a directory',
    ],
    [
      'a point fixed when the application is built',
      { point: 'notes.pages', key: 'k', data: 1 },
      'member 1 (notes.pages k): the point is fixed when the application is built',
    ],
    [
      'data on the point of a category',
      { point: 'skill.skills', key: 'k', data: 1 },
      'member 1 (skill.skills k): the point of a category takes a directory; this member gives data',
    ],
    [
      'a file the package does not have',
      { point: 'notes.greeters', key: 'k', module: 'other.js', export: 'make' },
      'member 1 (notes.greeters k): the package has no file other.js',
    ],
  ] as const)('refuses %s, and puts nothing', async (_name, member, reason) => {
    const w = world()
    expect(await reasonOf(w, LABEL, member as Member)).toBe(reason.replace('member 1', 'member 2'))
    expect(w.placed).toEqual([])
  })

  it('puts a directory on the point of a category as the item that category makes of it', async () => {
    const w = world()
    const skill: Member = { point: 'skill.skills', key: 'notes', directory: 'skills/notes' }
    expect((await w.install(wanted(skill))).kind).toBe('installed')
    expect(w.placed).toEqual([
      [
        {
          point: 'skill.skills',
          key: 'notes',
          id: '',
          scope: SCOPE,
          rank: 0,
          digest: memberDigest(skill, FILES),
          item: { within: 'skills/notes' },
        },
      ],
    ])
  })

  it('a category that cannot make an item of the directory fails the plugin, with what it said', async () => {
    const w = world({
      point: name =>
        name === 'skill.skills'
          ? {
              kind: 'category',
              place: () => {
                throw new Error('skill is not there now')
              },
            }
          : POINTS[name],
    })
    expect(
      await reasonOf(w, { point: 'skill.skills', key: 'notes', directory: 'skills/notes' }),
    ).toBe('member 1 (skill.skills notes): skill is not there now')
    expect(w.placed).toEqual([])
  })

  it('refuses code for a point that takes no code from a plugin', async () => {
    const w = world({ guestForm: () => undefined })
    expect(await reasonOf(w, GREETER)).toBe(
      'member 1 (notes.greeters hello): the point takes no code from a plugin',
    )
    expect(w.loaded).toEqual([])
  })

  it('refuses two members at one place', async () => {
    const w = world()
    expect(await reasonOf(w, LABEL, { ...LABEL, data: 2 })).toBe(
      'member 2 (notes.labels urgent): another member of this plugin is at the same place',
    )
  })

  it.each([
    [
      'the file cannot be loaded',
      { load: async () => Promise.reject(new Error('syntax')) },
      'greet.js could not be loaded: syntax',
    ],
    [
      'the file exports no such function',
      { load: async () => ({ other: () => 1 }) },
      'greet.js exports no function named make',
    ],
    [
      'the export throws',
      {
        load: async () => ({
          make: () => {
            throw new Error('boom')
          },
        }),
      },
      'make threw: boom',
    ],
    [
      'the point cannot take what the export made',
      {
        guestForm: () => () => {
          throw new Error('not a greeter')
        },
      },
      'the point refused what make made: not a greeter',
    ],
  ] as const)('fails when %s, with the member and the reason', async (_name, over, reason) => {
    const w = world(over as Partial<ServerInstallPorts>)
    expect(await reasonOf(w, LABEL, GREETER)).toBe(`member 2 (notes.greeters hello): ${reason}`)
    expect(w.placed).toEqual([])
  })

  it('fails as a whole when the registry refuses what is put, with what it said', async () => {
    const w = world({
      put: async () => {
        throw new Error('held: another item is at notes.labels urgent')
      },
    })
    expect(await reasonOf(w, LABEL)).toBe(
      'the registry refused it: held: another item is at notes.labels urgent',
    )
  })

  it('pins the ports the plugin needs before anything: one that is not there fails the whole, and nothing is loaded or put', async () => {
    const asked: (readonly string[])[] = []
    const w = world({
      needs: names => (asked.push(names), { kind: 'missing', names: ['store'] }),
    })
    const outcome = await w.install({
      ...wanted(LABEL, GREETER),
      needs: ['notifications', 'store'],
    })
    expect(outcome).toEqual({ kind: 'waiting', lacks: ['port store'] })
    expect(asked).toEqual([['notifications', 'store']])
    expect(w.loaded).toEqual([])
    expect(w.placed).toEqual([])
  })

  it('hands the guest form the key of the member and the binder of the ports it pinned', async () => {
    const given: unknown[] = []
    const bind = (principal: unknown) => (given.push(principal), BOUND)
    const w = world({
      needs: () => ({ kind: 'adopted', bind }),
      guestForm: () => (made, context) => {
        given.push(made, context.key)
        given.push(context.bind('p-alice'))
        return 'item'
      },
    })
    expect((await w.install(wanted(GREETER))).kind).toBe('installed')
    expect(given).toEqual(['hello', 'hello', 'p-alice', BOUND])
  })

  it('a plugin that writes no member for the server is installed and puts nothing', async () => {
    const w = world()
    expect((await w.install(wanted())).kind).toBe('installed')
    expect(w.placed).toEqual([])
  })
})

describe('the two points of the server tree that the loading of plugins owns', () => {
  it('are declarations the registry takes, fixed when the application is built so a plugin can place neither a port nor a guest form; a port is an object that makes one, seen from the scope of a tenant', async () => {
    const { declare, empty, install } = await import('@omne-harness/dynamis')
    const { portsContract, guestFormsContract, PORTS_POINT, GUEST_FORMS_POINT } =
      await import('@omne-harness/plugin-host-local')
    const made = install(empty, { fiber: 'test', generation: 1 }, [
      declare(portsContract),
      declare(guestFormsContract),
    ])
    expect(made.kind).toBe('installed')
    if (made.kind !== 'installed') return
    const { ask } = await import('@omne-harness/dynamis')
    const lent = install(made.registry, { fiber: 'notification', generation: 1 }, [
      {
        point: PORTS_POINT,
        key: 'notifications',
        id: '',
        scope: [],
        rank: 0,
        digest: 'd',
        item: { make: () => ({}) },
      },
      {
        point: PORTS_POINT,
        key: 'bare',
        id: '',
        scope: [],
        rank: 0,
        digest: 'e',
        item: () => ({}),
      },
    ])
    if (lent.kind !== 'installed') throw new Error(lent.kind)
    expect(ask(lent.registry, PORTS_POINT, 'notifications', ['tenant', 'alice']).kind).toBe('one')
    expect(ask(lent.registry, PORTS_POINT, 'bare', ['tenant', 'alice']).kind).toBe('none')
    expect([portsContract.name, guestFormsContract.name]).toEqual([PORTS_POINT, GUEST_FORMS_POINT])
    expect([portsContract.binding, guestFormsContract.binding]).toEqual(['build', 'build'])
  })
})

describe('a plugin that lacks only what is not there now waits; anything else wrong is a failure', () => {
  const ABSENT: Member = { point: 'notes.none', key: 'k', data: 1 }
  const WRONG: Member = { point: 'notes.greeters', key: 'k', data: 1 }

  it('a member on a point that is not there now: it waits for the point, loads no code and puts nothing', async () => {
    const w = world()
    expect(await w.install(wanted(GREETER, ABSENT))).toEqual({
      kind: 'waiting',
      lacks: ['point notes.none'],
    })
    expect(w.loaded).toEqual([])
    expect(w.placed).toEqual([])
  })

  it('a port and a point both absent: it waits for both, each named once', async () => {
    const w = world({ needs: () => ({ kind: 'missing', names: ['store'] }) })
    const twice: Member = { point: 'notes.none', key: 'other', data: 2 }
    expect(await w.install({ ...wanted(ABSENT, twice), needs: ['store'] })).toEqual({
      kind: 'waiting',
      lacks: ['port store', 'point notes.none'],
    })
  })

  it('something absent and something wrong: it failed, with the wrong member as the reason', async () => {
    const w = world({ needs: () => ({ kind: 'missing', names: ['store'] }) })
    expect(await w.install({ ...wanted(ABSENT, WRONG), needs: ['store'] })).toEqual({
      kind: 'failed',
      reason: 'member 2 (notes.greeters k): the point takes code; this member gives data',
    })
  })
})

describe('the code of a plugin runs traced to it', () => {
  it('its file is loaded, its export is called and its form is given the scope the loader names', async () => {
    const order: string[] = []
    let depth = 0
    const within = <T>(run: () => T): T => {
      depth += 1
      try {
        return run()
      } finally {
        depth -= 1
      }
    }
    let given: { within?: unknown } = {}
    const w = world({
      within,
      load: async () => (
        order.push(`load ${String(depth)}`),
        { make: () => (order.push(`make ${String(depth)}`), 'hello') }
      ),
      guestForm: () => (made, context) => ((given = context), { greet: made }),
    })
    expect((await w.install(wanted(GREETER))).kind).toBe('installed')
    expect(order).toEqual(['load 1', 'make 1'])
    expect(given.within).toBeTypeOf('function')
  })

  it('without a scope from the loader, the form is given none', async () => {
    let given: object = {}
    const w = world({ guestForm: () => (made, context) => ((given = context), { greet: made }) })
    await w.install(wanted(GREETER))
    expect('within' in given).toBe(false)
  })
})
