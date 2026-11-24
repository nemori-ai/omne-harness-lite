import type { AnswerOf, Principal } from '@omne-harness/access-cordis-contract'
import { createCanvas, createCanvasChanges, observed } from '@omne-harness/canvas'
import {
  createMemoryStore,
  fakeAuthority,
  fakeClock,
  fakeKinds,
  fakeMovers,
} from '@omne-harness/canvas/testing'
import { createCanvasContribution, type CanvasFace } from '@omne-harness/canvas-access'
import {
  tenantIdSchema,
  type CallContext,
  type CanvasChangeFeed,
  type TenantId,
} from '@omne-harness/canvas-contract'
import { canvasProtocol, type CanvasProtocol } from '@omne-harness/canvas-protocol'
import { readJsonText, writeJsonText, type JsonLimits } from '@omne-harness/json-text'

const limits: JsonLimits = {
  maxBytes: 100_000,
  maxDepth: 50,
  maxItems: 10_000,
  maxMembers: 100,
  maxStringLength: 10_000,
  maxNumberLength: 100,
}

const tenantText = (account: string) =>
  JSON.stringify({ organization: 'org_00000000000000000000000000', account })
export const TENANT = tenantText('acc_00000000000000000000000000')
export const OTHER = tenantText('acc_00000000000000000000000001')
export const SHEET = { width: 4800, height: 3200, grid: 8 }

export type Operations = CanvasProtocol['operations']
export type Name = keyof Operations
export const NAMES = Object.keys(canvasProtocol.operations) as Name[]

export const media = (ref: string) => ({ kind: 'media.object', ref })

/** One body of each operation that reads off the wire, the tenant left to the call. */
export const SAMPLES: Record<Name, Record<string, unknown>> = {
  look: { canvas: 'main' },
  'look-away': { canvas: 'main', limit: 10 },
  kinds: {},
  place: { canvas: 'main', reference: media('a'), at: { x: 0, y: 0 } },
  arrange: { canvas: 'main', items: [{ item: 'i1', top: true }] },
  take: { canvas: 'main', items: ['i1'] },
  pile: { canvas: 'main', pile: 'p1', items: ['i1'] },
  scatter: { canvas: 'main', pile: 'p1' },
  lock: { canvas: 'main', items: ['i1'], locked: true },
}
export const READS: readonly Name[] = ['look', 'look-away', 'kinds']
export const WRITES = NAMES.filter(name => !READS.includes(name))

function tree(value: unknown) {
  const read = readJsonText(JSON.stringify(value), limits)
  if (read.kind !== 'ok') throw new Error('sample is not JSON')
  return read.value
}

/** Reads a wire sample by the codec of the operation, as the entry does before it calls a handler. */
export function bodyOf(name: Name, sample: unknown) {
  const read = canvasProtocol.operations[name].body.read(tree(sample), limits)
  if (!read.ok) throw new Error(`${name} sample did not read`)
  return read.value as never
}

/** Writes an answer by the codec of its outcome: an answer the protocol cannot carry fails here. */
function wire<K extends Name>(name: K, answer: AnswerOf<Operations[K]>) {
  if (!('body' in answer)) return { outcome: answer.outcome }
  const codec = (canvasProtocol.operations[name].outcomes as Record<string, unknown>)[
    answer.outcome
  ] as { write(value: unknown, limits: JsonLimits): { ok: boolean; value?: never } }
  const written = codec.write(answer.body, limits)
  if (!written.ok || written.value === undefined) throw new Error(`${answer.outcome} did not write`)
  return { outcome: answer.outcome, body: JSON.parse(writeJsonText(written.value)) as unknown }
}

type LoginAnswer = 'acting' | 'denied' | 'basis-unavailable' | 'throws'

/** The real feed of the canvas, counting who listens and whether a subscription may fail once. */
function countedFeed(changes: CanvasChangeFeed) {
  const listening = new Set<object>()
  const subscribed: TenantId[] = []
  const released: object[] = []
  let broken = false
  return {
    listening,
    subscribed,
    released,
    breakNext() {
      broken = true
    },
    subscribe(tenant: TenantId, listener: Parameters<CanvasChangeFeed['subscribe']>[1]) {
      if (broken) {
        broken = false
        throw new Error('the feed is down')
      }
      const mine = {}
      listening.add(mine)
      subscribed.push(tenant)
      const leave = changes.subscribe(tenant, listener)
      return () => {
        released.push(mine)
        listening.delete(mine)
        leave()
      }
    },
  }
}

/** The contribution over the real canvas on a memory store that tells its changes, with the identity,
 * the face and the feed to be set. */
export function world() {
  const store = createMemoryStore()
  const reported: unknown[] = []
  const changes = createCanvasChanges(error => reported.push(error))
  const feed = countedFeed(changes)
  const authority = fakeAuthority()
  const kinds = fakeKinds()
  const config = {
    sheet: SHEET,
    limits: { placed: 200, away: 500, batch: 50 },
    size: { min: { width: 120, height: 64 }, max: { width: 900, height: 900 } },
    footprint: { width: 160, height: 80 },
    admitTimeoutMs: 5000,
  }
  const movers = fakeMovers()
  const clock = fakeClock()
  const written = observed(store, changes)
  const real = createCanvas({ store: written, authority, movers, kinds, clock, config })
  const state = {
    login: 'acting' as LoginAnswer,
    face: real as CanvasFace | undefined,
    feed: feed as CanvasChangeFeed | undefined,
    logins: [] as string[],
    contexts: [] as CallContext[],
  }
  const principal = { principal: 'issued' } as unknown as Principal
  const contribution = createCanvasContribution({
    principals: {
      async actingFor(_login, tenant) {
        state.logins.push(tenant)
        if (state.login === 'throws') throw new Error('identity is down')
        return state.login === 'acting' ? { ok: principal } : { refused: state.login }
      },
      contextOf(issued, tenant) {
        const ctx = { tenant: tenantIdSchema.parse(tenant), subject: issued }
        state.contexts.push(ctx)
        return ctx
      },
    },
    face: () => state.face,
    changes: () => state.feed,
  })
  const controller = new AbortController()
  const call = { principal: { login: 'l' }, messageId: 'm-1', signal: controller.signal }
  return {
    store,
    authority,
    kinds,
    movers,
    clock,
    changes,
    reported,
    feed,
    controller,
    state,
    principal,
    contribution,
    /** One call as the entry makes it: the body read off the wire, the answer written back to it. */
    async call(name: Name, sample: Record<string, unknown>) {
      const handler = contribution.operations[name] as (
        call: never,
        body: never,
      ) => Promise<AnswerOf<Operations[Name]>>
      const answer = await handler(call as never, bodyOf(name, { tenant: TENANT, ...sample }))
      return wire(name, answer)
    },
    /** Opens observe-changes for a tenant as the entry does, on this world's call. */
    observe(tenant = TENANT) {
      const open = canvasProtocol.observations['observe-changes'].open.read(
        tree({ tenant }),
        limits,
      )
      if (!open.ok) throw new Error('the opening value did not read')
      return contribution.observations['observe-changes'](
        { ...call, revision: 1 } as never,
        open.value,
      )
    },
  }
}
