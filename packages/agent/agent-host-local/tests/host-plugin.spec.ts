// The `agent-host` plugin on real Cordis 4.0.4 (docs/cordis.md "装载", "换代"): it loads with every
// injected service present and provides its five faces on one fiber; it stays PENDING, provides
// nothing and builds nothing while any one is absent; a wrong configuration fails the fiber before
// the body runs; a new provider of an injected service runs the body again, so the old faces and
// the registrations of the old instances end and a later acquire builds a new instance.
import { afterEach, describe, expect, it } from 'vitest'
import { agentHostConfig } from '../src/host-config.ts'
import {
  INJECTED,
  PROVIDED,
  caller,
  hostConfig,
  ok,
  openWorld,
  serve,
  slotOf,
  turns,
  type World,
} from './host-support.ts'

// `FiberState` is a const enum of Cordis, so its members are not values to import: 0 is PENDING,
// 2 is ACTIVE and 3 is FAILED in Cordis 4.0.4.
const PENDING = 0
const ACTIVE = 2
const FAILED = 3

const opened: World[] = []
afterEach(async () => {
  for (const world of opened.splice(0)) await world.dispose()
})

async function world(options: Parameters<typeof openWorld>[0] = {}): Promise<World> {
  const made = await openWorld(options)
  opened.push(made)
  return made
}

describe('loading', () => {
  it('provides the five faces on the plugin fiber once every injected service is present', async () => {
    const host = await world()
    expect(host.host.state).toBe(ACTIVE)
    for (const key of PROVIDED) expect(host.root.get(key), key).toBeDefined()
  })

  it.each(INJECTED)('stays PENDING and provides nothing while %s is absent', async key => {
    const host = await world({ omit: key })
    expect(host.host.state).toBe(PENDING)
    for (const provided of PROVIDED) expect(host.root.get(provided), provided).toBeUndefined()
    expect(host.controls.access.check.calls).toHaveLength(0)
  })

  it('loads when the absent service arrives', async () => {
    const host = await world({ omit: 'agentClock' })
    expect(host.host.state).toBe(PENDING)
    await serve(host.root, 'agentClock', host.controls.clock.port)
    await host.host
    expect(host.host.state).toBe(ACTIVE)
    ok(await host.provision.acquire(slotOf('a')))
  })

  it.each([
    ['instanceIdleMs that is zero', { ...hostConfig, instanceIdleMs: 0 }],
    ['an unknown coordination mode', { ...hostConfig, coordination: 'shared' }],
    ['a joint commit kind twice', { ...hostConfig, jointCommits: ['message', 'message'] }],
    ['a loop guard policy without a digest', { ...hostConfig, loopGuardPolicy: { owner: 'a' } }],
    ['an unknown field', { ...hostConfig, tenant: 'org' }],
    ['no configuration', undefined],
  ])('fails the fiber and provides nothing for %s', async (_name, config) => {
    const host = await world({ config })
    await expect(host.host).rejects.toThrow()
    expect(host.host.state).toBe(FAILED)
    for (const provided of PROVIDED) expect(host.root.get(provided), provided).toBeUndefined()
  })

  it('takes the configuration of the candidate row', () => {
    const answer = agentHostConfig['~standard'].validate(hostConfig)
    expect(answer).toEqual({ value: hostConfig })
  })
})

describe('a new provider of an injected service', () => {
  it('runs the body again: new faces, the old registrations end, a new instance follows', async () => {
    const host = await world()
    const before = host.root.get('agentInstanceProvision')
    const { instance } = ok(await host.provision.acquire(slotOf('a')))
    await host.fibers.agentClock?.dispose()
    expect(host.root.get('agentInstanceProvision')).toBeUndefined()
    await turns()
    expect(host.retired).toEqual([
      expect.objectContaining({ instance, reason: 'contributor-removed' }),
    ])
    await serve(host.root, 'agentClock', host.controls.clock.port)
    await turns()
    expect(host.host.state).toBe(ACTIVE)
    const after = host.root.get('agentInstanceProvision')
    expect(after).toBeDefined()
    expect(after).not.toBe(before)
    expect(await host.directory.resolve({ ...caller('a'), instance })).toEqual({
      failure: { kind: 'denied', action: 'resolve' },
    })
    const next = ok(await host.provision.acquire(slotOf('a')))
    expect(next.instance).not.toBe(instance)
  })

  it('ends the idle time with the plugin: no reclaim runs after the body ends', async () => {
    const host = await world({ factory: 'duties' })
    ok(await host.provision.acquire(slotOf('a')))
    await turns()
    expect(host.controls.clock.pending()).toHaveLength(1)
    await host.host.dispose()
    expect(host.controls.clock.pending()).toHaveLength(0)
    host.advance(120_000)
    await turns()
    expect(host.quiesced).toEqual([])
  })
})
