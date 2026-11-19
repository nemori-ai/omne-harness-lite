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
import { createSqlModelDispatchFacts, dispatchFactsHandler } from '@omne-harness/model-storage-sql'
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

function scene(window: typeof WINDOW | null = WINDOW) {
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
      ...(window === null ? {} : { contextWindow: window }),
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

type Scene = ReturnType<typeof scene>
type FaceOptions = Parameters<typeof createSqlModelDispatchFacts>[0]

/** Lists tenant A through a face whose collaborators the test may replace. */
function listOn(
  s: Scene,
  replaced: Partial<FaceOptions> = {},
  fields: Partial<ModelDispatchFactsQuery> = {},
) {
  return createSqlModelDispatchFacts({
    storage: s.built.sqlite.storage,
    domains: lookup([textOf(A), textOf(B)], s.built.domain),
    authority: s.built.core.options.authority,
    ...replaced,
  }).list({
    principal: s.principalOf(A),
    tenant: A,
    range: null,
    consumer: null,
    order: 'ascending',
    after: null,
    limit: 10,
    ...fields,
  })
}

const answering = (s: Scene, output: unknown): Partial<FaceOptions> => ({
  storage: {
    ...s.built.sqlite.storage,
    read: request =>
      Promise.resolve(
        (output instanceof Error
          ? { kind: 'unavailable', requestKey: request.requestKey, reason: output.message }
          : output === 'cancelled'
            ? { kind: 'cancelled', requestKey: request.requestKey }
            : { kind: 'read', requestKey: request.requestKey, output }) as never,
      ),
  },
})

const calls = (page: { entries: readonly { call: string }[] }) => page.entries.map(e => e.call)

const unavailable = (diagnostic: string) => ({
  kind: 'unavailable',
  dependency: expect.any(String),
  diagnostic,
})

describe('what the read face accepts at its bounds, and how it pages', () => {
  it('accepts a one-moment range, the largest page and the most works', async () => {
    const s = scene()
    const { call } = await s.dispatched('edge')
    expect(calls(unbox(await s.query(A, { range: { from: T0, to: T0 } })))).toEqual([call])
    expect(calls(unbox(await s.query(A, { limit: 200 })))).toEqual([call])
    const works = ['edge-run', ...Array.from({ length: 99 }, (_, at) => `w${at}`)]
    expect(calls(unbox(await s.query(A, { consumer: { owner: 'consumer', works } })))).toEqual([
      call,
    ])
  })

  it('pages in ascending order, and has no next page when the last page is exactly full', async () => {
    const s = scene()
    await s.dispatched('first', { at: '2026-11-19T08:00:00.000Z' })
    await s.dispatched('second', { at: '2026-11-19T08:01:00.000Z' })
    await s.dispatched('third', { at: '2026-11-19T08:02:00.000Z' })
    const first = unbox(await s.query(A, { limit: 2 }))
    expect(calls(first)).toEqual([callId('first'), callId('second')])
    expect(first.next).toMatch(/^mdfc_/u)
    const second = unbox(await s.query(A, { limit: 2, after: first.next }))
    expect(calls(second)).toEqual([callId('third')])
    expect(second.next).toBeNull()
    expect(unbox(await s.query(A, { limit: 3 })).next).toBeNull()
  })

  it('reads each work given with the works under it, and none that only sorts near it', async () => {
    const s = scene()
    await s.dispatched('one', { work: 'run-1/execution' })
    await s.dispatched('near', { work: 'run-1.x/execution' })
    await s.dispatched('two', { work: 'run-2/execution/step-1' })
    await s.dispatched('three', { work: 'run-3/execution' })
    const page = unbox(
      await s.query(A, { consumer: { owner: 'consumer', works: ['run-1', 'run-2'] } }),
    )
    expect(calls(page)).toEqual([callId('one'), callId('two')])
  })

  it('says no window for a request that carried none', async () => {
    const s = scene(null)
    await s.dispatched('bare')
    const [fact] = unbox(await s.query(A)).entries
    expect(fact?.contextWindow).toBeNull()
    expect(fact?.profile).toEqual(REQUEST.profile)
  })
})

describe('what the read face refuses, and what it answers when it cannot read', () => {
  it.each([
    ['an order it does not know', { order: 'sideways' }, 'order', 'value'],
    ['a limit over the page bound', { limit: 201 }, 'limit', 'out-of-range'],
    ['a limit that is not an integer', { limit: 1.5 }, 'limit', 'out-of-range'],
    ['a range end that is not an instant', { range: { from: T0, to: 'soon' } }, 'range', 'instant'],
    [
      'a range start that is not an instant',
      { range: { from: 'soon', to: T0 } },
      'range',
      'instant',
    ],
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
      `zzzz_${next.slice(5)}`,
      `${next.slice(0, 5)}e30${next.slice(8)}`,
    ])
      expect(await s.query(A, { limit: 1, after })).toEqual({
        failure: { kind: 'invalid', field: 'after', reason: 'cursor' },
      })
  })

  it('asks the authority for the account of the tenant, and passes on what it cannot decide', async () => {
    const s = scene()
    const asked: unknown[] = []
    const { authorize } = s.built.core.options.authority
    expect(
      await listOn(s, {
        authority: {
          authorize: (input: Parameters<typeof authorize>[0]) => {
            asked.push(input)
            return authorize(input)
          },
        },
      }),
    ).toEqual({ ok: { entries: [], undated: 0, next: null } })
    expect(asked).toEqual([
      expect.objectContaining({ action: 'read-account', resource: { kind: 'tenant' } }),
    ])
    const down = { kind: 'unavailable', diagnostic: 'identity down' }
    expect(
      await listOn(s, { authority: { authorize: () => ({ failure: down }) as never } }),
    ).toEqual({ failure: down })
  })

  it('answers an unregistered tenant domain with an empty page, and a lookup that fails as unavailable', async () => {
    const s = scene()
    await s.dispatched('kept')
    expect(await listOn(s, { domains: lookup([], s.built.domain) })).toEqual({
      ok: { entries: [], undated: 0, next: null },
    })
    const failing = {
      lookup: () => Promise.resolve({ kind: 'unavailable', diagnostic: 'registry down' } as const),
    }
    expect(await listOn(s, { domains: failing })).toEqual({
      failure: unavailable('tenant domain: registry down'),
    })
  })

  it.each([
    [new Error('down'), 'read model.dispatch-facts: down'],
    ['cancelled', 'read model.dispatch-facts: cancelled'],
    [null, 'stored dispatch fact read'],
    [{ undated: 0, rows: 'x' }, 'stored dispatch fact read'],
    [{ undated: 'x', rows: [] }, 'stored dispatch fact undated'],
    [{ undated: 1.5, rows: [] }, 'stored dispatch fact undated'],
    [{ undated: 0, rows: [1] }, 'stored dispatch fact row'],
  ])('answers unavailable for a read that gives %j', async (output, diagnostic) => {
    const s = scene()
    expect(await listOn(s, answering(s, output))).toEqual({ failure: unavailable(diagnostic) })
  })

  it('answers unavailable for a stored row whose position is not a moment and a row', async () => {
    const s = scene()
    const row = {
      rid: 1,
      call: 'c',
      dispatch: 'd',
      prepared: T0,
      profile: '{}',
      context_window: null,
      fact: JSON.stringify({ call: 'c', dispatch: 'd' }),
    }
    const page = (raw: object) => ({ undated: 0, rows: [raw] })
    expect(unbox(await listOn(s, answering(s, page(row)))).entries).toHaveLength(1)
    for (const damaged of [
      { ...row, prepared: 5 },
      { ...row, rid: 'x' },
    ])
      expect(await listOn(s, answering(s, page(damaged)))).toEqual({
        failure: unavailable(`stored dispatch fact position of ${textOf(A)}`),
      })
  })

  it.each([
    ['profile', null, 'profile'],
    ['profile', packText('1'), 'profile'],
    ['fact', packText(JSON.stringify({ call: 'mcall_other', dispatch: 'mdisp_damaged' })), 'fact'],
    ['fact', 'same call, another dispatch', 'fact'],
    ['fact', packText('not json'), 'fact'],
    ['context_window', packText('not json'), 'context_window'],
  ] as const)(
    'answers unavailable for a stored %s that is damaged',
    async (column, value, field) => {
      const s = scene()
      const { call } = await s.dispatched('damaged')
      const stored =
        value === 'same call, another dispatch'
          ? packText(JSON.stringify({ call, dispatch: 'mdisp_other' }))
          : value
      s.built.sqlite.seed(s.built.domain, `UPDATE md_dispatch_fact SET ${column} = ?`, [stored])
      expect(await s.query(A)).toEqual({
        failure: unavailable(`stored dispatch fact ${field}`),
      })
    },
  )

  it('fails a worker read whose input is not a query', () => {
    expect(dispatchFactsHandler.read(null, {} as never)).toEqual({
      kind: 'failed',
      diagnostic: 'invalid input',
    })
  })
})
