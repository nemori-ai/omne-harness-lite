import type { AccessContribution } from '@omne-harness/access-cordis-contract'
import {
  complete,
  declare,
  empty,
  install,
  retire,
  type Instance,
  type Registry,
} from '@omne-harness/dynamis'
import { defineProtocol, ruleCodec, type ProtocolContract } from '@omne-harness/public-contract'
import { describe, expect, it } from 'vitest'
import { createAccessRegistry, type Entered } from '../src/registry/registry.ts'
import {
  busy,
  enter,
  entryOf,
  leave,
  noCalls,
  open,
  protocolsContract,
  type Calls,
  type ProtocolItem,
} from '../src/registry/table.ts'

const body = ruleCodec({ kind: 'object', fields: {} })
const contributionOf = (name: string): AccessContribution<ProtocolContract> =>
  ({
    protocol: defineProtocol({
      name,
      major: 1,
      operations: {
        read: {
          identity: 'none',
          effect: 'read',
          limit: 'small',
          body,
          outcomes: { succeeded: body },
        },
      },
      observations: { watch: { identity: 'none', open: body, frame: body, ends: ['gone'] } },
    }),
    operations: { read: async () => ({ outcome: 'succeeded', body: {} }) },
    observations: { watch: async () => ({ outcome: 'unavailable' }) },
  }) as unknown as AccessContribution<ProtocolContract>

const NAMES = ['alpha', 'beta', 'gamma']
const CONTRIBUTIONS = Object.fromEntries(NAMES.map(name => [name, contributionOf(name)]))
const MEMBERS = ['read', 'watch', 'nope']

type Random = () => number
function randomOf(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = state
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}
const below = (random: Random, limit: number): number => Math.floor(random() * limit)
const pick = <T>(random: Random, from: readonly T[]): T => from[below(random, from.length)] as T

/** One mount on both sides: the old take-down and whether it resolved; the new instance. */
type Mount = {
  name: string
  takeDown: () => Promise<void>
  oldGone: boolean
  instance: Instance
  item: ProtocolItem
  state: 'serving' | 'retiring' | 'gone'
}
type Flight = { old: Entered; call: string; mount: Mount }

class Sides {
  readonly old = createAccessRegistry()
  registry: Registry
  calls: Calls = noCalls
  readonly mounts: Mount[] = []
  flights: Flight[] = []
  minted = 0
  counts = { entered: 0, refused: 0, drainedLater: 0, remounted: 0 }

  constructor() {
    const host = install(empty, { fiber: 'entry', generation: 1 }, [declare(protocolsContract)])
    if (host.kind !== 'installed') throw new Error(host.detail)
    this.registry = host.registry
  }

  /** The new side takes a retiring instance away once nothing of its protocol runs. */
  private settle(mount: Mount): void {
    if (mount.state !== 'retiring' || busy(this.calls, mount.instance, `${mount.name}/v1`)) return
    const outcome = complete(this.registry, this.calls.ledger, mount.instance)
    if (outcome.kind !== 'withdrawn') throw new Error(`complete refused: ${outcome.reason}`)
    this.registry = outcome.registry
    mount.state = 'gone'
  }

  mount(name: string): void {
    const contribution = CONTRIBUTIONS[name] as AccessContribution<ProtocolContract>
    const takeDown = this.old.mount(contribution)
    this.minted += 1
    const instance = { fiber: `plugin-${this.minted}`, generation: 1 }
    const made = entryOf(contribution, instance)
    const outcome = install(this.registry, instance, [made])
    if (outcome.kind !== 'installed') throw new Error(outcome.detail)
    this.registry = outcome.registry
    if (this.mounts.some(held => held.name === name && held.state === 'retiring'))
      this.counts.remounted += 1
    this.mounts.push({
      name,
      takeDown,
      oldGone: false,
      instance,
      item: made.item,
      state: 'serving',
    })
  }

  unmount(mount: Mount): void {
    void mount.takeDown().then(() => {
      mount.oldGone = true
    })
    this.registry = retire(this.registry, mount.instance)
    mount.item.controller.abort()
    mount.state = 'retiring'
    if (busy(this.calls, mount.instance, `${mount.name}/v1`)) this.counts.drainedLater += 1
    this.settle(mount)
  }

  enter(name: string, member: string): void {
    const old = this.old.enter({ name, major: 1 }, member)
    const next = enter(this.registry, this.calls, `${name}/v1`, member)
    const refusal = this.old.mounts({ name, major: 1 }) ? 'not-offered' : 'not-mounted'
    expect(next.kind).toBe(old === undefined ? refusal : 'entered')
    if (old === undefined || next.kind !== 'entered') return void (this.counts.refused += 1)
    const mount = this.mounts.find(held => held.item === next.item)
    if (mount === undefined) throw new Error('entered an item nobody mounted')
    expect(next.member.kind).toBe(old.member.kind)
    expect(next.item.revision).toBe(old.revision)
    this.calls = next.calls
    this.flights.push({ old, call: next.call, mount })
    this.counts.entered += 1
  }

  leave(flight: Flight): void {
    flight.old.leave()
    this.calls = leave(this.calls, flight.call)
    this.flights = this.flights.filter(other => other !== flight)
    this.settle(flight.mount)
  }

  /** The three things the two sides must agree on after every step. */
  compare(): void {
    const subscription = this.old.subscribe(() => undefined)
    subscription.unsubscribe()
    const oldOpen = subscription.protocols.map(key => `${key.name}/v${key.major}`).sort()
    const now = open(this.registry)
    expect(now.protocols.map(protocol => protocol.key).sort()).toEqual(oldOpen)
    expect(now.conflicts).toEqual([])
    for (const mount of this.mounts) expect(mount.state === 'gone').toBe(mount.oldGone)
    for (const flight of this.flights)
      expect(flight.mount.item.controller.signal.aborted).toBe(flight.old.signal.aborted)
    expect(this.calls.ledger.calls).toHaveLength(this.flights.length)
  }
}

function step(random: Random, sides: Sides): void {
  const action = below(random, 10)
  const name = pick(random, NAMES)
  const live = sides.mounts.filter(mount => mount.state === 'serving')
  if (action <= 1) {
    if (!sides.old.mounts({ name, major: 1 })) sides.mount(name)
  } else if (action === 2) {
    if (live.length > 0) sides.unmount(pick(random, live))
  } else if (action <= 6) {
    sides.enter(name, pick(random, MEMBERS))
  } else if (sides.flights.length > 0) {
    sides.leave(pick(random, sides.flights))
  }
}

describe('新旧两张登记表在随机历史上逐步对照（C4）', () => {
  it.each([21, 22, 23, 24, 25, 26, 27, 28])(
    '种子 %i：进不进得去、对外可用的集合、撤完的时刻，每一步都一致',
    async seed => {
      const random = randomOf(seed)
      const sides = new Sides()
      for (let index = 0; index < 1500; index += 1) {
        step(random, sides)
        await Promise.resolve()
        await Promise.resolve()
        sides.compare()
      }
      const { entered, refused, drainedLater, remounted } = sides.counts
      console.log(
        `seed ${seed}: 1500 steps, mounts ${sides.mounts.length}, entered ${entered}, refused ${refused}, withdrawn with calls in flight ${drainedLater}, mounted again while the old one drained ${remounted}`,
      )
      expect(Math.min(entered, refused, drainedLater, remounted)).toBeGreaterThan(0)
    },
  )
})

describe('两处有意的不同', () => {
  it('同一份协议挂第二次：旧表当场抛错、先挂的照常；新表两份都在，这份协议答冲突，撤一份另一份服务', () => {
    const sides = new Sides()
    sides.mount('alpha')
    const contribution = CONTRIBUTIONS['alpha'] as AccessContribution<ProtocolContract>
    expect(() => sides.old.mount(contribution)).toThrow('already mounted')
    expect(sides.old.enter({ name: 'alpha', major: 1 }, 'read')).toBeDefined()

    const second = { fiber: 'plugin-x', generation: 1 }
    const both = install(sides.registry, second, [entryOf(contribution, second)])
    if (both.kind !== 'installed') throw new Error(both.detail)
    const first = (sides.mounts[0] as Mount).instance
    expect(enter(both.registry, noCalls, 'alpha/v1', 'read')).toEqual({
      kind: 'conflict',
      by: [first, second],
    })
    expect(enter(both.registry, noCalls, 'beta/v1', 'read')).toEqual({ kind: 'not-mounted' })
    const one = enter(retire(both.registry, first), noCalls, 'alpha/v1', 'read')
    expect(one.kind === 'entered' && one.instance).toEqual(second)
  })

  it('挂上的那一刻：旧表立刻可用；新表里条目装上登记表才可用，装上是接入插件就绪的时刻', () => {
    const sides = new Sides()
    const contribution = CONTRIBUTIONS['alpha'] as AccessContribution<ProtocolContract>
    sides.old.mount(contribution)
    expect(sides.old.enter({ name: 'alpha', major: 1 }, 'read')).toBeDefined()
    expect(enter(sides.registry, noCalls, 'alpha/v1', 'read')).toEqual({ kind: 'not-mounted' })
  })
})
