import { createStandaloneRegistry, guestProtocol } from '@omne-harness/server-entry'
import { afterEach, describe, expect, it } from 'vitest'
import {
  AVAILABILITY_BACKLOG,
  FRAME_QUEUE_BYTES,
  GRACE_MS,
  OTHER_PROOF,
  PROOF,
  testIdentity,
} from './support/access-kit.ts'
import { send, startEntry, type Entry } from './support/entry.ts'
import { availabilitySource } from '../src/availability/availability.ts'
import { createStandaloneRegistry as createSrcStandalone } from '../src/registry/desk.ts'

const ACME = 'tenant-acme'
const BETA = 'tenant-beta'
const scopeOf = (tenant: string) => ['tenants', tenant]
const TEXT = { kind: 'text' } as const

/** A protocol of a tenant as its plugin writes it: one read that answers a text. */
function written(name: string) {
  return guestProtocol(
    {
      contract: {
        name,
        major: 1,
        operations: { look: { effect: 'read', limit: 'small', body: TEXT, result: TEXT } },
      },
      handlers: { look: async () => ({ outcome: 'succeeded', body: name }) },
    },
    { key: `${name}/v1`, bind: () => ({ ports: {}, close: () => undefined }) },
  )
}

let entry: Entry | undefined
afterEach(async () => {
  await entry?.stop()
  entry = undefined
})

async function world() {
  const registry = createStandaloneRegistry()
  const weather = written('weather')
  const notes = written('notes')
  registry.mount(weather.contribution, { scope: scopeOf(ACME), data: weather.data })
  registry.mount(notes.contribution, { scope: scopeOf(BETA), data: notes.data })
  registry.mount(written('shared').contribution)
  entry = await startEntry({
    access: {
      registry,
      identity: testIdentity().port,
      graceMs: GRACE_MS,
      frameQueueBytes: FRAME_QUEUE_BYTES,
      availabilityBacklog: AVAILABILITY_BACKLOG,
      tenantScope: scopeOf,
    },
  })
  const scoped = async (proof: string, tenant: string) =>
    send(entry!.port, '/api/access/v1/scoped', {
      headers: {
        authorization: `Bearer ${proof}`,
        'omne-acting-tenant': tenant,
        'omne-message-id': 'm-1',
        'omne-contract-revision': '3',
        'content-type': 'application/json',
      },
      body: '{}',
    })
  return { registry, weather, scoped }
}

describe('the protocols of the tenant a caller acts for (AC-9)', () => {
  it("two tenants each with a protocol: each reads only its own, with its contract as data; the deployment's are not in it", async () => {
    const t = await world()
    const acme = await t.scoped(PROOF, ACME)
    expect(acme.status).toBe(200)
    expect(acme.json).toEqual({
      outcome: 'succeeded',
      body: { protocols: [{ name: 'weather', major: 1, contract: t.weather.data }] },
    })
    const beta = await t.scoped(OTHER_PROOF, BETA)
    const told = beta.json as { body: { protocols: { name: string }[] } }
    expect(told.body.protocols.map(each => each.name)).toEqual(['notes'])
  })

  it('a caller that acts for no tenant is not answered: the read needs one', async () => {
    const t = await world()
    const reply = await t.scoped(PROOF, '')
    expect(reply.status).not.toBe(200)
  })
})

describe("the count of the changes of the tenants' protocols in the availability frames", () => {
  async function first(registry: ReturnType<typeof createSource>, revision: number) {
    const opened = await availabilitySource(registry, 4)(
      {
        principal: undefined as never,
        messageId: 'm-1',
        revision,
        signal: new AbortController().signal,
      },
      {},
    )
    if (opened.outcome !== 'succeeded') throw new Error(opened.outcome)
    const frames = opened.frames
    return { frames, next: async () => (await frames.next()).value }
  }
  const createSource = () => createSourceRegistry()

  it("a reader at revision 3 is told the count and is sent a snapshot when a tenant's protocol changes; a reader at revision 2 gets the frames it got before", async () => {
    const registry = createSource()
    const three = await first(registry, 3)
    const two = await first(registry, 2)
    expect(await three.next()).toMatchObject({ kind: 'snapshot', scoped: 0 })
    const before = await two.next()
    expect(before).not.toHaveProperty('scoped')
    const weather = written('weather')
    registry.mount(weather.contribution, { scope: scopeOf(ACME), data: weather.data })
    expect(await three.next()).toMatchObject({ kind: 'snapshot', scoped: 1 })
    registry.mount(written('shared').contribution)
    const after = await two.next()
    expect(after).toMatchObject({ kind: 'change', added: [{ name: 'shared' }] })
    expect(after).not.toHaveProperty('scoped')
  })
})

function createSourceRegistry() {
  return createSrcStandalone()
}
