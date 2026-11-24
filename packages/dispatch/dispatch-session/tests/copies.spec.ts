import { describe, expect, it } from 'vitest'
import type { SessionRef } from '@omne-harness/dispatch-contract'
import {
  forkPointText,
  sourceRequestIdentities,
  type ForkPoint,
} from '@omne-harness/session-contract'
import { DISPATCH_SOURCES, createContextCopies } from '../src/index.ts'
import { LEGAL_TENANT, OTHER_TENANT, PARENT, TENANT, dispatchOf, world } from './world.ts'

const ASKING = 'msg_asking-1'

const POINT: ForkPoint = { epoch: 'key/epoch:0', upper: '3', position: '44' }
const read = (value: unknown) => ({ kind: 'read', value })

function copies(answer: unknown) {
  const w = world()
  const asked: unknown[] = []
  Object.assign(w.port, {
    forkPoint: async (input: unknown) => {
      asked.push(input)
      if (answer instanceof Error) throw answer
      return answer
    },
  })
  return { ...w, asked, copies: createContextCopies(w.port) }
}

describe('the moment of a spawn', () => {
  it('is the point Session names for the dispatching session, handed on as one text', async () => {
    const c = copies(read(POINT))
    expect(await c.copies.moment(TENANT, PARENT, ASKING)).toEqual(
      read({ kind: 'moment', moment: forkPointText(POINT) }),
    )
    expect(c.asked).toEqual([{ tenant: LEGAL_TENANT, session: PARENT, asking: ASKING }])
  })

  it('is none without asking Session when no model step made the call', async () => {
    const c = copies(read(POINT))
    expect(await c.copies.moment(TENANT, PARENT, null)).toEqual(read({ kind: 'none' }))
    expect(c.asked).toEqual([])
  })

  it('is none when the session names no point, and for a tenant text that is no tenant without asking', async () => {
    expect(await copies(read(null)).copies.moment(TENANT, PARENT, ASKING)).toEqual(
      read({ kind: 'none' }),
    )
    const stranger = copies(read(POINT))
    expect(await stranger.copies.moment(OTHER_TENANT, PARENT, ASKING)).toEqual(
      read({ kind: 'none' }),
    )
    expect(stranger.asked).toEqual([])
  })

  it.each([
    ['the point cannot be read', { kind: 'unavailable' }],
    ['the read is thrown', new Error('down')],
  ])('is unreadable when %s', async (_name, answer) => {
    expect(await copies(answer).copies.moment(TENANT, PARENT, ASKING)).toEqual({
      kind: 'unavailable',
    })
  })
})

describe('the session of a spawn', () => {
  const spawned = (context: string | null = forkPointText(POINT)) =>
    dispatchOf({ mode: 'spawn', context, instruction: 'Check the word.', expectation: null })
  const create = async (dispatch = spawned()) => {
    const c = copies(read(POINT))
    const identities = sourceRequestIdentities({
      tenant: LEGAL_TENANT,
      source: DISPATCH_SOURCES.instruction,
      request: dispatch.id,
    })
    const created = await c.sessions.create(TENANT, {
      session: identities.session as unknown as SessionRef,
      dispatch,
      permission: 'never',
    })
    type Made = {
      creation: {
        standing: { fork?: unknown; initial: { message: { blocks: [{ text: string }] } } }
      }
    }
    const [call] = c.made('create') as [Made?]
    return {
      ...c,
      created,
      standing: call?.creation.standing,
      input: call?.creation.standing.initial.message.blocks[0].text,
    }
  }

  it('is forked from the dispatching session at the moment of the dispatch, and reads no view to be made', async () => {
    const { created, standing, asked, calls } = await create()
    expect(created).toEqual({ kind: 'created' })
    expect(standing?.fork).toEqual({ source: PARENT, point: POINT })
    expect(asked).toEqual([])
    expect(calls.map(call => call.name)).toEqual(['work', 'modes', 'create'])
  })

  it('starts from the work alone: the conversation is in its prefix, not in its input', async () => {
    const { input } = await create()
    expect(input).toContain('This session is forked from the dispatching session')
    expect(input?.endsWith('Work:\nCheck the word.')).toBe(true)
    expect(input).not.toContain('copy of the conversation')
    expect(Buffer.byteLength(input ?? '')).toBeLessThan(2000)
  })

  it.each([
    ['holds no moment', null],
    ['holds a moment that does not read back', '["key/epoch:0","3"]'],
    ['holds a moment that is no such text', 'moment-1'],
  ])('creates nothing for a spawn that %s', async (_name, context) => {
    const { created, made } = await create(spawned(context))
    expect(created).toEqual({
      kind: 'failed',
      detail: 'the spawn has no moment to fork its session at',
    })
    expect(made('create')).toEqual([])
  })

  it('gives the session of a delegate and of a handoff no source and no word of a fork', async () => {
    for (const mode of ['delegate', 'handoff'] as const) {
      const plain = await create(dispatchOf({ mode, context: forkPointText(POINT) }))
      expect(plain.created).toEqual({ kind: 'created' })
      expect(plain.standing).not.toHaveProperty('fork')
      expect(plain.input).not.toContain('forked')
    }
  })

  it('answers what Session says of a point that does not hold, and does not know while Session cannot say', async () => {
    const refused = copies(read(POINT))
    refused.script.create = {
      failure: { kind: 'invalid', field: 'creation.fork.point', reason: 'not-a-boundary' },
    }
    const session = sourceRequestIdentities({
      tenant: LEGAL_TENANT,
      source: DISPATCH_SOURCES.instruction,
      request: spawned().id,
    }).session as unknown as SessionRef
    const toCreate = { session, dispatch: spawned(), permission: 'never' } as const
    expect(await refused.sessions.create(TENANT, toCreate)).toEqual({
      kind: 'failed',
      detail: 'invalid: creation.fork.point: not-a-boundary',
    })
    refused.script.create = { failure: { kind: 'unavailable', owner: 'o', diagnostic: 'd' } }
    expect(await refused.sessions.create(TENANT, toCreate)).toEqual({ kind: 'unknown' })
  })
})
