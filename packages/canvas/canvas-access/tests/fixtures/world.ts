import type { AnswerOf, Principal } from '@omne-harness/access-cordis-contract'
import { createCanvas } from '@omne-harness/canvas'
import {
  createMemoryStore,
  fakeAuthority,
  fakeKinds,
  fakeMovers,
} from '@omne-harness/canvas/testing'
import { createCanvasContribution, type CanvasFace } from '@omne-harness/canvas-access'
import { tenantIdSchema, type CallContext } from '@omne-harness/canvas-contract'
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

/** The contribution over the real canvas on a memory store, with the identity and the face to be set. */
export function world() {
  const store = createMemoryStore()
  const authority = fakeAuthority()
  const kinds = fakeKinds()
  const real = createCanvas({ store, authority, movers: fakeMovers(), kinds, sheet: SHEET })
  const state = {
    login: 'acting' as LoginAnswer,
    face: real as CanvasFace | undefined,
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
  })
  const call = { principal: { login: 'l' }, messageId: 'm-1', signal: new AbortController().signal }
  return {
    store,
    authority,
    kinds,
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
  }
}
