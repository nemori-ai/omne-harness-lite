import { describe, expect, it } from 'vitest'
import {
  decodeDispatchId,
  type ModelBlock,
  type ModelDispatchFactsQuery,
  type ResultVersion,
} from '@omne-harness/model-contract'
import {
  judgeFixedModelRequest,
  type CallAccountReport,
  type TransportFact,
  type WriteContext,
} from '@omne-harness/model-contract/provider'
import { createSqlModelDispatchFacts } from '@omne-harness/model-storage-sql'
import { packText } from '@omne-harness/sql-contract/worker'
import {
  callId,
  instanceId,
  lookup,
  opId,
  proof,
  REQUEST,
  sqlCommands,
  tenantOf,
  textOf,
  unbox,
} from './fixture.ts'

const A = tenantOf('a')
const B = tenantOf('b')
const T0 = '2026-11-19T08:00:00.000Z'
const COMPLETED = { kind: 'completed', reason: 'stop' } as const
const REPORT: CallAccountReport = {
  usage: [
    { name: 'input', state: 'known', lexeme: '400', unit: 'token' },
    { name: 'output', state: 'known', lexeme: '18', unit: 'token' },
  ],
  cost: [{ state: 'known', lexeme: '0.000123', unit: 'openrouter-credit', source: 'billable' }],
  trimmed: { state: 'unknown', unit: 'token' },
  place: 'facts-suite',
  duration: { state: 'unknown' },
  revision: '1',
}
const WINDOW = { tokens: '200000', compactionTriggerPercent: '80' }
const PROMPT_CANARY = 'SECRET-PROMPT-CANARY'
const REPLY_CANARY = 'SECRET-REPLY-CANARY'

const sealed = (text: string): ModelBlock =>
  ({
    kind: 'text',
    id: 'facts-reply',
    visibility: { toHuman: true, toModel: true },
    text,
  }) as ModelBlock

const reply = (text: string): TransportFact[] => [
  { kind: 'block-open', index: '0', mode: 'append', content: 'text' },
  { kind: 'block-delta', index: '0', delta: text },
  { kind: 'block-seal', index: '0', block: sealed(text) },
  { kind: 'account', event: 'usage', value: REPORT },
  { kind: 'ended', termination: COMPLETED },
]

function scene() {
  let now: string | null = T0
  const built = sqlCommands([A, B], {
    clock: {
      now: () => {
        if (now === null) throw new Error('the clock cannot be read')
        return now
      },
    },
  })
  const request = unbox(
    judgeFixedModelRequest({
      ...REQUEST,
      contextWindow: WINDOW,
      system: [
        {
          kind: 'text',
          id: 'facts-system',
          visibility: { toHuman: false, toModel: true },
          text: PROMPT_CANARY,
        },
      ],
    }),
  )
  const facts = createSqlModelDispatchFacts({
    storage: built.sqlite.storage,
    domains: lookup([textOf(A), textOf(B)], built.domain),
    authority: built.core.options.authority,
  })
  let serial = 0
  const next = (name: string) => opId(`${name}-${String((serial += 1))}`)

  async function dispatched(
    name: string,
    options: Readonly<{
      tenant?: typeof A
      work?: string
      at?: string | null
      clean?: boolean
    }> = {},
  ) {
    const tenant = options.tenant ?? A
    now = options.at === undefined ? T0 : options.at
    const call = callId(name)
    const admit = {
      ...built.core.admitOf(tenant, call, next('admit')),
      request,
      consumer: {
        owner: 'consumer',
        work: options.work ?? `${name}-run/execution`,
        position: 'p',
        purpose: 'main',
      },
    }
    const { commands } = built
    unbox(await commands.admit(admit))
    const access = { principal: admit.principal, tenant, call }
    const execution = unbox(
      await commands.claim({
        ...access,
        instance: instanceId(),
        operation: next('claim'),
        continuity: proof(call),
      }),
    )
    const write = async (): Promise<WriteContext> => ({
      ...execution,
      operation: next('write'),
      expected: unbox(await commands.loadRecovery(access)).state.revision,
    })
    const dispatch = unbox(decodeDispatchId(`mdisp_${name}`))
    const supplier = request.suppliers[0]
    unbox(
      await commands.prepareDispatch({
        ...(await write()),
        dispatch,
        supplier,
        policyDecision: null,
      }),
    )
    unbox(
      await commands.recordMaterialization({
        ...(await write()),
        dispatch,
        receipt: {
          supplier: supplier.adoption,
          representation: request.representation,
          payloadDigest: 'a'.repeat(64),
        },
        window: 'w-1',
      }),
    )
    unbox(await commands.recordSend({ ...(await write()), dispatch, state: 'started' }))
    unbox(
      await commands.preserve({
        ...(await write()),
        dispatch,
        window: 'w-1',
        facts: reply(REPLY_CANARY),
      }),
    )
    if (options.clean === true) {
      const result: ResultVersion = unbox(
        await commands.settle({ ...(await write()), termination: COMPLETED }),
      ).version
      unbox(
        await commands.handoff({
          ...access,
          operation: next('handoff'),
          result,
          evidence: { kind: 'processed', completion: proof(`${call}/${result}`, 'consumer') },
        }),
      )
      for (let step = 0; step < 16; step += 1) {
        const custody = unbox(
          await commands.advanceCleanup({ ...execution, operation: next('cleanup') }),
        )
        if (custody.kind === 'acknowledged' && custody.cleanup === 'released') break
      }
    }
    return { call, dispatch, principal: admit.principal }
  }

  const principalOf = (tenant: typeof A) =>
    built.core.admitOf(tenant, callId('x'), opId('x')).principal
  const query = (tenant: typeof A, fields: Partial<ModelDispatchFactsQuery> = {}) =>
    facts.list({
      principal: principalOf(tenant),
      tenant,
      range: null,
      consumer: null,
      order: 'ascending',
      after: null,
      limit: 10,
      ...fields,
    })
  return { dispatched, query, facts, principalOf, built }
}

describe('the dispatch facts of the Model records (C17)', () => {
  it('reads one fact per dispatch with its consumer, profile, window, moments, outcome and account, and no body', async () => {
    const s = scene()
    const { call, dispatch } = await s.dispatched('one')
    const page = unbox(await s.query(A))
    expect(page.undated).toBe(0)
    expect(page.next).toBeNull()
    expect(page.entries).toEqual([
      {
        call,
        dispatch,
        consumer: { owner: 'consumer', work: 'one-run/execution', position: 'p', purpose: 'main' },
        profile: REQUEST.profile,
        supplier: REQUEST.suppliers[0],
        contextWindow: WINDOW,
        instants: {
          prepared: T0,
          sent: T0,
          responseStarted: null,
          firstContent: null,
          ended: null,
        },
        send: 'sent',
        outcome: { kind: 'completed', reason: 'stop' },
        connectRetries: 0,
        account: expect.objectContaining({ usage: REPORT.usage, cost: REPORT.cost }),
      },
    ])
    const text = JSON.stringify(page)
    expect(text).not.toContain(PROMPT_CANARY)
    expect(text).not.toContain(REPLY_CANARY)
  })

  it('keeps the fact, its profile and its window after the call is cleaned up', async () => {
    const s = scene()
    await s.dispatched('cleaned', { clean: true })
    const [fact] = unbox(await s.query(A)).entries
    expect(fact?.profile).toEqual(REQUEST.profile)
    expect(fact?.contextWindow).toEqual(WINDOW)
    expect(fact?.outcome).toEqual({ kind: 'completed', reason: 'stop' })
  })

  it('answers another tenant as if there were no facts, and refuses a principal acting for another tenant', async () => {
    const s = scene()
    await s.dispatched('mine')
    await s.dispatched('theirs', { tenant: B })
    expect(unbox(await s.query(B)).entries.map(fact => fact.call)).toEqual([callId('theirs')])
    const empty = scene()
    expect(unbox(await empty.query(A))).toEqual({ entries: [], undated: 0, next: null })
    const crossed = await s.facts.list({
      principal: s.principalOf(A),
      tenant: B,
      range: null,
      consumer: null,
      order: 'ascending',
      after: null,
      limit: 10,
    })
    expect(crossed).toEqual({ failure: { kind: 'denied', action: 'read-account' } })
  })

  it('reads by prepared range, by consumer work and the works under it, in either order, page by page', async () => {
    const s = scene()
    await s.dispatched('early', { at: '2026-11-19T08:00:00Z', work: 'run-1/execution' })
    await s.dispatched('middle', { at: '2026-11-19T09:30:00.250Z', work: 'run-1/execution/step-2' })
    await s.dispatched('late', { at: '2026-11-19T11:00:00.000Z', work: 'run-2/execution' })
    await s.dispatched('other', { at: '2026-11-19T09:00:00.000Z', work: 'run-10/execution' })
    const calls = (page: { entries: readonly { call: string }[] }) => page.entries.map(e => e.call)
    expect(
      calls(
        unbox(
          await s.query(A, {
            range: { from: '2026-11-19T09:00:00Z', to: '2026-11-19T10:00:00.000Z' },
          }),
        ),
      ),
    ).toEqual([callId('other'), callId('middle')])
    expect(
      calls(
        unbox(await s.query(A, { consumer: { owner: 'consumer', works: ['run-1/execution'] } })),
      ),
    ).toEqual([callId('early'), callId('middle')])
    expect(
      calls(unbox(await s.query(A, { consumer: { owner: 'consumer', works: ['run-1'] } }))),
    ).toEqual([callId('early'), callId('middle')])
    expect(
      calls(unbox(await s.query(A, { consumer: { owner: 'someone', works: ['run-1'] } }))),
    ).toEqual([])
    const first = unbox(await s.query(A, { order: 'descending', limit: 3 }))
    expect(calls(first)).toEqual([callId('late'), callId('middle'), callId('other')])
    const second = unbox(await s.query(A, { order: 'descending', limit: 3, after: first.next }))
    expect(calls(second)).toEqual([callId('early')])
    expect(second.next).toBeNull()
  })

  it('counts a dispatch prepared while the clock could not be read as undated, in no range', async () => {
    const s = scene()
    await s.dispatched('dated')
    await s.dispatched('undated', { at: null })
    const all = unbox(await s.query(A))
    expect(all.entries.map(fact => fact.call)).toEqual([callId('dated')])
    expect(all.undated).toBe(1)
  })

  it('refuses a cursor of another query, a reversed range, a bad limit and an empty work list', async () => {
    const s = scene()
    await s.dispatched('a1')
    await s.dispatched('a2')
    const first = unbox(await s.query(A, { limit: 1 }))
    expect(await s.query(A, { limit: 1, order: 'descending', after: first.next })).toEqual({
      failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
    })
    expect(
      await s.query(A, { range: { from: '2026-11-19T10:00:00Z', to: '2026-11-19T09:00:00Z' } }),
    ).toEqual({ failure: { kind: 'invalid', field: 'range', reason: 'order' } })
    expect(await s.query(A, { limit: 0 })).toEqual({
      failure: { kind: 'invalid', field: 'limit', reason: 'out-of-range' },
    })
    expect(await s.query(A, { consumer: { owner: 'consumer', works: [] } })).toEqual({
      failure: { kind: 'invalid', field: 'consumer', reason: 'shape' },
    })
  })
})

describe('what the read face refuses, and what it answers when it cannot read', () => {
  it.each([
    ['an order it does not know', { order: 'sideways' }, 'order', 'value'],
    ['a limit over the page bound', { limit: 201 }, 'limit', 'out-of-range'],
    ['a limit that is not an integer', { limit: 1.5 }, 'limit', 'out-of-range'],
    ['a range end that is not an instant', { range: { from: T0, to: 'soon' } }, 'range', 'instant'],
    ['an empty owner', { consumer: { owner: '', works: ['w'] } }, 'consumer', 'shape'],
    ['an empty work', { consumer: { owner: 'consumer', works: ['w', ''] } }, 'consumer', 'shape'],
    [
      'more works than the bound',
      { consumer: { owner: 'consumer', works: Array.from({ length: 101 }, (_, at) => `w${at}`) } },
      'consumer',
      'shape',
    ],
  ])('refuses %s', async (_name, fields, field, reason) => {
    const s = scene()
    expect(await s.query(A, fields as Partial<ModelDispatchFactsQuery>)).toEqual({
      failure: { kind: 'invalid', field, reason },
    })
  })

  it('refuses a cursor that was changed, cut short or given another prefix', async () => {
    const s = scene()
    await s.dispatched('c1')
    await s.dispatched('c2')
    const next = unbox(await s.query(A, { limit: 1 })).next ?? ''
    const flipped = `${next.slice(0, -1)}${next.endsWith('A') ? 'B' : 'A'}`
    for (const after of [
      flipped,
      next.slice(0, 20),
      `x${next}`,
      `${next.slice(0, 5)}e30${next.slice(8)}`,
    ])
      expect(await s.query(A, { limit: 1, after })).toEqual({
        failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
      })
  })

  it('answers a tenant whose domain is not registered with an empty page', async () => {
    const s = scene()
    await s.dispatched('kept')
    const unregistered = createSqlModelDispatchFacts({
      storage: s.built.sqlite.storage,
      domains: lookup([], s.built.domain),
      authority: s.built.core.options.authority,
    })
    const page = await unregistered.list({
      principal: s.principalOf(A),
      tenant: A,
      range: null,
      consumer: null,
      order: 'ascending',
      after: null,
      limit: 10,
    })
    expect(page).toEqual({ ok: { entries: [], undated: 0, next: null } })
  })

  it('answers unavailable for a read the storage does not do, and for a damaged stored row', async () => {
    const s = scene()
    await s.dispatched('damaged')
    const refusing = createSqlModelDispatchFacts({
      storage: {
        ...s.built.sqlite.storage,
        read: request =>
          Promise.resolve({
            kind: 'unavailable',
            requestKey: request.requestKey,
            reason: 'down',
          } as never),
      },
      domains: lookup([textOf(A)], s.built.domain),
      authority: s.built.core.options.authority,
    })
    expect(
      await refusing.list({
        principal: s.principalOf(A),
        tenant: A,
        range: null,
        consumer: null,
        order: 'ascending',
        after: null,
        limit: 10,
      }),
    ).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'read model.dispatch-facts: down' },
    })
    for (const [column, value] of [
      ['profile', null],
      ['fact', packText(JSON.stringify({ call: 'mcall_other', dispatch: 'mdisp_damaged' }))],
      ['fact', packText('not json')],
      ['context_window', packText('not json')],
    ] as const) {
      const fresh = scene()
      await fresh.dispatched('damaged')
      fresh.built.sqlite.seed(fresh.built.domain, `UPDATE md_dispatch_fact SET ${column} = ?`, [
        value,
      ])
      expect(await fresh.query(A), column).toMatchObject({ failure: { kind: 'unavailable' } })
    }
  })
})
