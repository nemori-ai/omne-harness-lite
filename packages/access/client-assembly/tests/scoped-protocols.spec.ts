import { Context } from '@deepseek-ai/cordis'
import { ask, list } from '@omne-harness/dynamis'
import { DynamisService } from '@omne-harness/dynamis-cordis/cordis'
import { accessProtocol, type AvailabilityFrame } from '@omne-harness/public-contract'
import type { CallReport, CallRequest, Transport } from '@omne-harness/sdk/core'
import { afterEach, describe, expect, it } from 'vitest'
import { CONNECTION_PROTOCOLS_POINT, type ServedProtocol } from '@omne-harness/client-assembly'
import {
  connectionPlugin,
  type LoginState,
  type LoginStateSource,
} from '@omne-harness/client-assembly/cordis'
import { fakeTransport, settle } from './support/fake-transport.ts'
import { ACCESS } from './support/notes.ts'

const limits = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}

type Tree = Parameters<typeof accessProtocol.operations.scoped.outcomes.succeeded.write>[0]
type Told = Tree['protocols'][number]['contract']

/** A plain value as the tree the json leaf carries. */
function treeOf(value: unknown): Told {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(treeOf) }
  const entries = Object.entries(value as object).map(([key, each]) => ({
    key,
    value: treeOf(each),
  }))
  return { kind: 'object', entries }
}

const contractOf = (name: string, result: string = 'text') => ({
  name,
  major: 1,
  operations: {
    look: {
      effect: 'read',
      limit: 'small',
      body: { kind: 'object', fields: {} },
      result: { kind: result },
    },
  },
})

const answered = (...contracts: ReturnType<typeof contractOf>[]): CallReport => {
  const body = {
    protocols: contracts.map(each => ({ name: each.name, major: 1, contract: treeOf(each) })),
  }
  const written = accessProtocol.operations.scoped.outcomes.succeeded.write(body, limits)
  if (!written.ok) throw new Error('an answer outside access/v1')
  return { kind: 'answered', outcome: 'succeeded', body: written.value }
}

const UNREADABLE: CallReport = {
  kind: 'answered',
  outcome: 'basis-unavailable',
  body: { kind: 'object', entries: [] },
}

const snapshot = (revision: number, scoped?: number): AvailabilityFrame => ({
  kind: 'snapshot',
  revision,
  protocols: [{ ...ACCESS, revision: 3 }],
  conflicts: [],
  ...(scoped !== undefined && { scoped }),
})

type Answer = CallReport | Readonly<{ held: Promise<CallReport> }>

const roots: Context[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await root.fiber.dispose()
})

async function world(initial: LoginState = 'signed-in') {
  const fake = fakeTransport()
  const answers: Answer[] = []
  const reads: CallRequest[] = []
  const sent: CallRequest[] = []
  const transport: Transport = {
    async call(request) {
      if (request.protocol.name === 'access' && request.operation === 'scoped') {
        reads.push(request)
        const next = answers.shift() ?? answered()
        return 'held' in next ? next.held : next
      }
      sent.push(request)
      return { kind: 'answered', outcome: 'succeeded', body: { kind: 'string', value: 'sunny' } }
    },
    observe: request => fake.transport.observe(request),
  }
  let state = initial
  const listeners = new Set<(state: LoginState) => void>()
  const login: LoginStateSource = {
    state: () => state,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const waits: number[] = []
  const root = new Context()
  roots.push(root)
  await root.plugin(DynamisService)
  const connection = root.plugin(
    connectionPlugin({
      transport,
      login,
      backoff: { delayMs: attempt => 100 * (attempt + 1) },
      sleep: async ms => {
        waits.push(ms)
      },
    }),
  )
  await connection
  await settle()
  const keys = () => {
    const read = list(root.dynamis.registry(), CONNECTION_PROTOCOLS_POINT, null, [])
    if (read.kind !== 'read') throw new Error(`the point is ${read.kind}`)
    return read.items.map(item => item.entry.key).sort()
  }
  const client = (key: string) => {
    const answer = ask<ServedProtocol>(root.dynamis.registry(), CONNECTION_PROTOCOLS_POINT, key, [])
    return answer.kind === 'one'
      ? (answer.entry.item.client as Record<string, Function>)
      : undefined
  }
  return {
    answers,
    reads,
    sent,
    waits,
    keys,
    client,
    async push(frame: AvailabilityFrame) {
      fake.push(frame)
      await settle()
    },
    async reconnect() {
      fake.breakStream()
      await settle()
    },
    async unplug() {
      await connection.dispose()
      await settle()
    },
    async sign(next: LoginState) {
      state = next
      for (const listener of Array.from(listeners)) listener(next)
      await settle()
    },
  }
}

describe('the connection grows the clients of the protocols of the tenant its login acts for (AC-11)', () => {
  it('signed in, reads scoped once and puts each protocol at the layer of the whole deployment; a call goes out under its name', async () => {
    const t = await world('signed-out')
    t.answers.push(answered(contractOf('weather')))
    await t.sign('signed-in')
    expect(t.reads).toHaveLength(1)
    expect(t.keys()).toEqual(['weather/v1'])
    const answer = await t.client('weather/v1')!['look']!({})
    expect(answer).toEqual({ outcome: 'succeeded', body: 'sunny' })
    expect(t.sent.map(each => `${each.protocol.name}/${each.operation}`)).toEqual(['weather/look'])
  })

  it('reads again when the server tells the protocols of tenants changed; what is gone is taken, what is new is put', async () => {
    const t = await world()
    await t.push(snapshot(1, 0))
    t.answers.push(answered(contractOf('notes')))
    await t.push(snapshot(2, 1))
    expect(t.keys()).toEqual(['notes/v1'])
    t.answers.push(answered(contractOf('weather')))
    await t.push({ kind: 'change', revision: 3, added: [], removed: [], conflicts: [], scoped: 2 })
    expect(t.keys()).toEqual(['weather/v1'])
  })

  it('a protocol whose contract changed is put again with the new contract', async () => {
    const t = await world()
    await t.push(snapshot(1, 0))
    t.answers.push(answered(contractOf('weather')))
    await t.push(snapshot(2, 1))
    const before = t.client('weather/v1')
    t.answers.push(answered(contractOf('weather', 'count')))
    await t.push(snapshot(3, 2))
    expect(t.keys()).toEqual(['weather/v1'])
    expect(t.client('weather/v1')).not.toBe(before)
  })

  it('a read that cannot be read leaves what is put, and reads again later, waiting longer each time', async () => {
    const t = await world('signed-out')
    t.answers.push(answered(contractOf('weather')))
    await t.sign('signed-in')
    let release!: (report: CallReport) => void
    t.answers.push(UNREADABLE, UNREADABLE, { held: new Promise(resolve => (release = resolve)) })
    await t.push(snapshot(1, 5))
    expect(t.keys()).toEqual(['weather/v1'])
    expect(t.waits).toEqual([100, 200])
    release(answered(contractOf('notes')))
    await settle()
    expect(t.keys()).toEqual(['notes/v1'])
  })

  it('a change told while a read is on its way: what the read told is put, then it reads once more', async () => {
    const t = await world('signed-out')
    let release!: (report: CallReport) => void
    t.answers.push({ held: new Promise(resolve => (release = resolve)) })
    await t.sign('signed-in')
    t.answers.push(answered(contractOf('notes')))
    await t.push(snapshot(1, 1))
    release(answered(contractOf('weather')))
    await settle()
    expect(t.reads).toHaveLength(2)
    expect(t.keys()).toEqual(['notes/v1'])
  })

  it('signed out, every protocol of the tenant is taken; a read still on its way puts nothing', async () => {
    const t = await world('signed-out')
    t.answers.push(answered(contractOf('weather')))
    await t.sign('signed-in')
    const held = t.client('weather/v1')!
    let release!: (report: CallReport) => void
    t.answers.push({ held: new Promise(resolve => (release = resolve)) })
    await t.push(snapshot(1, 1))
    await t.sign('signed-out')
    release(answered(contractOf('notes')))
    await settle()
    expect(t.keys()).toEqual([])
    expect(await held['look']!({})).toEqual({ outcome: 'unavailable' })
  })

  it("a new login while one is followed takes the last one's protocols and reads for the new one", async () => {
    const t = await world('signed-out')
    t.answers.push(answered(contractOf('weather')))
    await t.sign('signed-in')
    let release!: (report: CallReport) => void
    t.answers.push({ held: new Promise(resolve => (release = resolve)) })
    await t.sign('signed-in')
    expect(t.keys()).toEqual([])
    release(answered(contractOf('notes')))
    await settle()
    expect(t.keys()).toEqual(['notes/v1'])
  })

  it('a new subscription to the availability reads again, though its count is the one told before: the server may have started over', async () => {
    const t = await world()
    await t.push(snapshot(1, 4))
    await t.reconnect()
    t.answers.push(answered(contractOf('weather')))
    await t.push(snapshot(1, 4))
    expect(t.keys()).toEqual(['weather/v1'])
  })

  it('unplugged, the point goes and every client it put refuses; a read on its way puts nothing; nothing reads after', async () => {
    const t = await world('signed-out')
    t.answers.push(answered(contractOf('weather')))
    await t.sign('signed-in')
    const held = t.client('weather/v1')!
    let release!: (report: CallReport) => void
    t.answers.push({ held: new Promise(resolve => (release = resolve)) })
    await t.push(snapshot(1, 1))
    const reads = t.reads.length
    await t.unplug()
    release(answered(contractOf('notes')))
    await settle()
    expect(() => t.keys()).toThrow('the point is unavailable')
    expect(await held['look']!({})).toEqual({ outcome: 'unavailable' })
    await t.push(snapshot(2, 2))
    await t.sign('signed-in')
    expect(t.reads).toHaveLength(reads)
  })

  it('signed out, it does not read, whatever the server tells', async () => {
    const t = await world('signed-out')
    await t.push(snapshot(1, 3))
    expect(t.reads).toHaveLength(0)
    expect(t.keys()).toEqual([])
  })
})
