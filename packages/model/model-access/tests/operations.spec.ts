import { describe, expect, it } from 'vitest'
import { createModelAccessContribution, type SessionRequirement } from '@omne-harness/model-access'
import type { ModalityRequirement } from '@omne-harness/model-contract'
import { createWorld, fixtureLogin, loginIdentity, REQUIRED, resolved } from './fixtures/world.ts'

const ALICE = fixtureLogin('a')
const signal = new AbortController().signal

function assembled() {
  const world = createWorld()
  const contribution = createModelAccessContribution({
    profiles: world.profiles,
    principals: world.principals,
    settings: { required: REQUIRED },
  })
  const list = () =>
    contribution.operations['list-models'](
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
      { tenant: ALICE.tenant },
    )
  return { world, list }
}

describe('list-models asks whether the login may act for the tenant, first', () => {
  it.each(['denied', 'basis-unavailable'] as const)(
    'answers %s as identity does, and does not ask Model',
    async refusal => {
      const { world, list } = assembled()
      world.state.acting = refusal
      expect(await list()).toEqual({ outcome: refusal })
      expect(world.asked).toEqual([{ login: 'login-a', tenant: ALICE.tenantText }])
      expect(world.listed).toEqual([])
    },
  )

  it('answers basis-unavailable when identity throws, and does not ask Model', async () => {
    const { world, list } = assembled()
    world.state.acting = 'throw'
    expect(await list()).toEqual({ outcome: 'basis-unavailable' })
    expect(world.listed).toEqual([])
  })
})

describe('list-models takes the profiles of Model at each call', () => {
  it('answers basis-unavailable while Model is not there', async () => {
    const { world, list } = assembled()
    world.state.present = false
    expect(await list()).toEqual({ outcome: 'basis-unavailable' })
    world.state.present = true
    expect((await list()).outcome).toBe('succeeded')
  })

  it('asks as the principal of the tenant, with no selection and the configured requirement', async () => {
    const { world, list } = assembled()
    await list()
    expect(world.listed).toEqual([
      { principal: world.principal, tenant: ALICE.tenant, selected: null, required: REQUIRED },
    ])
  })
})

describe('what Model answers becomes an outcome of the protocol', () => {
  it('lists each resolved profile with whether it can be selected, why not, and its credential', async () => {
    const { world, list } = assembled()
    world.state.listing = [
      resolved('anthropic/claude-sonnet-5', {}, { low: 'low', medium: 'medium', high: 'high' }),
      resolved('openai/gpt-6-astra', { credential: 'missing' }),
      resolved('locked', { selectable: false, reasons: ['locked', 'scope'] }),
      resolved('unread', { credential: 'unreadable' }),
      resolved('down', { credential: 'unavailable' }),
    ]
    const io = { enabled: true, reasoningEfforts: [], input: ['text', 'image'], output: ['text'] }
    expect(await list()).toEqual({
      outcome: 'succeeded',
      body: {
        models: [
          {
            route: 'anthropic/claude-sonnet-5',
            selectable: true,
            reasons: [],
            credential: 'available',
            ...io,
            reasoningEfforts: ['low', 'medium', 'high'],
          },
          {
            route: 'openai/gpt-6-astra',
            selectable: true,
            reasons: [],
            credential: 'missing',
            ...io,
          },
          {
            route: 'locked',
            selectable: false,
            reasons: ['locked', 'scope'],
            credential: 'available',
            ...io,
          },
          { route: 'unread', selectable: true, reasons: [], credential: 'unknown', ...io },
          { route: 'down', selectable: true, reasons: [], credential: 'unknown', ...io },
        ],
      },
    })
  })

  it('marks a model the tenant has turned off as not enabled, with no reason, and carries a default effort', async () => {
    const { world, list } = assembled()
    world.state.listing = [
      resolved('off', { selectable: false, reasons: ['not-enabled'] }),
      resolved('on', { defaultReasoningEffort: 'high' }, { high: 'high' }),
    ]
    const answer = await list()
    expect(answer.outcome === 'succeeded' && answer.body.models).toMatchObject([
      { route: 'off', selectable: false, reasons: [], enabled: false },
      { route: 'on', selectable: true, enabled: true, defaultReasoningEffort: 'high' },
    ])
    expect(answer.outcome === 'succeeded' && answer.body.models[0]).not.toHaveProperty(
      'defaultReasoningEffort',
    )
  })

  it('leaves out a name that resolves to no profile', async () => {
    const { world, list } = assembled()
    world.state.listing = [{ kind: 'absent', reason: 'withdrawn' }, resolved('kept')]
    const answer = await list()
    expect(answer.outcome === 'succeeded' && answer.body.models.map(model => model.route)).toEqual([
      'kept',
    ])
  })

  it('answers an empty list as an empty list', async () => {
    const { world, list } = assembled()
    world.state.listing = []
    expect(await list()).toEqual({ outcome: 'succeeded', body: { models: [] } })
  })

  it('answers denied when Model denies the read', async () => {
    const { world, list } = assembled()
    world.state.listing = { kind: 'denied', action: 'profiles.list' }
    expect(await list()).toEqual({ outcome: 'denied' })
  })

  it.each([
    ['is unavailable', { kind: 'unavailable', dependency: 'source', diagnostic: 'down' }],
    ['finds the request invalid', { kind: 'invalid', field: 'required', reason: 'empty' }],
  ] as const)('answers basis-unavailable when Model %s', async (_name, failure) => {
    const { world, list } = assembled()
    world.state.listing = failure
    expect(await list()).toEqual({ outcome: 'basis-unavailable' })
  })

  it('answers basis-unavailable when Model throws: a read that failed is not an empty list', async () => {
    const { world, list } = assembled()
    world.state.listing = 'throw'
    expect(await list()).toEqual({ outcome: 'basis-unavailable' })
  })
})

describe('list-models for a session judges as selecting a model in that session does', () => {
  const SESSION = '0123456789abcdef'.repeat(4)
  const PICTURES: ModalityRequirement = {
    modalities: ['text', 'image'],
    source: { owner: 'test', record: 'select-model', revision: '1', digest: '0'.repeat(64) },
  }
  const twenty = Array.from({ length: 20 }, (_, at) => ({ message: 'msg_1', block: `blk_${at}` }))

  function forSession(answer: SessionRequirement | null | 'throw' | 'absent') {
    const world = createWorld()
    const seen: unknown[] = []
    const sessions = {
      async of(at: unknown) {
        seen.push(at)
        if (answer === 'throw') throw new Error('history down')
        return answer === 'absent' ? null : answer
      },
    }
    const contribution = createModelAccessContribution({
      profiles: world.profiles,
      principals: world.principals,
      settings: { required: REQUIRED },
      ...(answer === 'absent' ? {} : { sessions: () => sessions }),
    })
    const list = () =>
      contribution.operations['list-models'](
        { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
        { tenant: ALICE.tenant, session: SESSION } as never,
      )
    return { world, seen, list }
  }

  it('lists with the requirement of the session; a model stopped by it names at most 16 of the blocks', async () => {
    const { world, seen, list } = forSession({ required: PICTURES, unmetBy: () => twenty })
    world.state.listing = [
      resolved('text-only', { selectable: false, reasons: ['modality'] }),
      resolved('locked', { selectable: false, reasons: ['locked'] }),
      resolved('anthropic/claude-sonnet-5'),
    ]
    const answer = await list()
    expect(seen).toEqual([{ tenant: ALICE.tenant, session: SESSION }])
    expect(world.listed.map(call => call.required)).toEqual([PICTURES])
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    const named = answer.body.models.map(model => [model.route, model.blocks?.length])
    expect(named).toEqual([
      ['text-only', 16],
      ['locked', undefined],
      ['anthropic/claude-sonnet-5', undefined],
    ])
    expect(answer.body.models[0]?.blocks?.[0]).toEqual({ message: 'msg_1', block: 'blk_0' })
  })

  it('without a session in the body, does not ask for one; a model stopped by modality names no block', async () => {
    const world = createWorld()
    world.state.listing = [resolved('text-only', { selectable: false, reasons: ['modality'] })]
    const seen: unknown[] = []
    const contribution = createModelAccessContribution({
      profiles: world.profiles,
      principals: world.principals,
      settings: { required: REQUIRED },
      sessions: () => ({
        of: async at => (seen.push(at), { required: PICTURES, unmetBy: () => twenty }),
      }),
    })
    const answer = await contribution.operations['list-models'](
      { principal: loginIdentity(ALICE), messageId: 'm-1', signal },
      { tenant: ALICE.tenant },
    )
    expect(seen).toEqual([])
    expect(world.listed.map(call => call.required)).toEqual([REQUIRED])
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    expect('blocks' in answer.body.models[0]!).toBe(false)
  })

  it('names no block when the definition takes every block, though it was stopped by modality', async () => {
    const { world, list } = forSession({ required: PICTURES, unmetBy: () => [] })
    world.state.listing = [resolved('text-only', { selectable: false, reasons: ['modality'] })]
    const answer = await list()
    if (answer.outcome !== 'succeeded') throw new Error(answer.outcome)
    expect('blocks' in answer.body.models[0]!).toBe(false)
  })

  it.each([
    ['cannot be read', null],
    ['throws', 'throw'],
    ['is not wired', 'absent'],
  ] as const)(
    'answers basis-unavailable when the history %s, and does not ask Model',
    async (_name, answer) => {
      const { world, list } = forSession(answer)
      expect(await list()).toEqual({ outcome: 'basis-unavailable' })
      expect(world.listed).toEqual([])
    },
  )
})
