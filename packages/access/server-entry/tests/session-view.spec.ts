// The pure projection (SPEC「会话诊断投影」) against doubles of the four sources: the Run skeleton
// comes from Session alone, each `call.bound` branch resolves through its owner, every refusal of a
// source is a gap, counts stay right past the limits, and no free text of a source reaches the view.
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { FinishIntent } from '@omne-harness/agent-contract'
import type { ActingForTenantPrincipal } from '@omne-harness/identity'
import type { JsonValue } from '@omne-harness/json-text'
import { tenantCodec } from '@omne-harness/legal-identity'
import type { DispatchRecord, ModelDiagnosticsPage, Lookup } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { SessionRunAttempts } from '@omne-harness/public-contract'
import type {
  ConsumptionId,
  HistoryEntry,
  HistoryPage,
  ProducedResult,
  ProducerFact,
  ProducerRef,
  SessionFailure,
  SessionHistory,
} from '@omne-harness/session-contract'
import type { DiagnosticPage, ToolLookup } from '@omne-harness/tool-contract'
import {
  createDiagnosticsCursors,
  projectSessionDiagnostics,
  type DiagnosticPorts,
} from '../src/session-view/index.ts'
import { collectRuns } from '../src/session-view/project.ts'
import type { CallAccount } from '../src/session-view/sources.ts'

type P = ActingForTenantPrincipal
type Fail<T> = Promise<Outcome<T, { kind: string }>>

const parsedTenant = tenantCodec.parse(
  JSON.stringify({
    organization: 'org_00000000000000000000000000',
    account: 'acc_00000000000000000000000000',
  }),
)
if (!parsedTenant.ok) throw new Error('fixture tenant did not parse')
const tenant = parsedTenant.value
const principal = { kind: 'acting-for-tenant', tenant } as unknown as P
const access = { principal, tenant, session: 'a'.repeat(64) as never }
const evidence = (record: string) => ({ owner: 'fixture', record, revision: '1', digest: 'd' })
const adoption = { owner: 'fixture', name: 'thing', revision: '1', digest: 'sha256:thing' }

/** The kinds the RFC table lists; a deployment discloses a subset of them. */
const ALL_KINDS = [
  'run.started',
  'run.attempt-started',
  'run.attempt-released',
  'run.attempt-exited',
  'control.requested',
  'control.progress',
  'run.terminal',
  'call.bound',
  'call.execution-fact',
  'message.user',
  'message.assistant',
  'message.tool',
  'message.tool_internal',
  'message.system_reminder',
  'message.compaction',
]

function tree(value: unknown): JsonValue {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(tree) }
  return {
    kind: 'object',
    entries: Object.entries(value as object).map(([key, item]) => ({ key, value: tree(item) })),
  }
}

function entry(id: string, kind: string, payload: unknown): HistoryEntry {
  return {
    id: id as never,
    revision: '1' as never,
    kind,
    schema: adoption,
    payload: tree(payload),
    origin: { owner: 'session', via: null, source: evidence(id) },
  }
}

const started = (id: string, run: string, execution = `exec-${run}`) =>
  entry(id, 'run.started', {
    run,
    execution,
    entry: 'interactive',
    first: 'in-1',
    predecessor: null,
    adoption,
  })
const attempt = (id: string, run: string, ordinal: string) =>
  entry(id, 'run.attempt-started', {
    run,
    attempt: `${run}#${ordinal}`,
    ordinal,
    instance: { owner: 'agent', id: 'i' },
    reason: 'start',
  })
const bound = (id: string, kind: 'model' | 'tool', reference: string, purpose = 'main') =>
  entry(id, 'call.bound', {
    consumption: `c-${id}`,
    binding: {
      producer: { kind, call: `call-of-${reference}` },
      action: 'SECRET-ACTION-ARGUMENTS',
      consumer: { owner: 'agent', id: 'x' },
      request: evidence('SECRET-REQUEST'),
      initiatingAttempt: null,
    },
    reference,
    purpose,
    kind,
  })
const terminal = (
  id: string,
  run: string,
  outcome: 'completed' | 'failed' | 'cancelled',
  record: string | null = null,
) =>
  entry(id, 'run.terminal', {
    terminal: { run, outcome, evidence: evidence('t') },
    sequence: null,
    cause: record === null ? null : evidence(record),
    disposition: null,
    bounded: null,
  })
const message = (id: string, role: string, text: string) =>
  entry(id, `message.${role}`, { message: { role, blocks: [{ kind: 'text', text }] } })

type HistoryDouble = Pick<SessionHistory<P>, 'begin' | 'next'> &
  Readonly<{ begins: unknown[]; nextCalls: number }>

/** Pages the entries backward from `from` (exclusive), `perPage` entries at a time, over a fixed upper. */
function historyOf(entries: readonly HistoryEntry[], perPage = 2, upper = '9'): HistoryDouble {
  const begins: unknown[] = []
  const page = (start: number): HistoryPage => {
    const slice = entries.slice(Math.max(0, start - perPage + 1), start + 1).reverse()
    const end = start - slice.length
    return {
      source: 'double',
      interpreter: adoption,
      upper: upper as never,
      entries: slice,
      scannedThrough: `pos:${end}`,
      next: end >= 0 ? `cursor:${end}` : null,
      exhausted: end < 0,
      annotations: [],
    }
  }
  const double = {
    begins,
    nextCalls: 0,
    async begin(input) {
      begins.push({ kinds: input.kinds, from: input.from, direction: input.direction })
      const at =
        input.from === null
          ? entries.length - 1
          : entries.findIndex(item => item.id === input.from) - 1
      return succeed(page(at))
    },
    async next(input) {
      double.nextCalls += 1
      return succeed(page(Number(input.cursor.slice('cursor:'.length))))
    },
  } as HistoryDouble & { nextCalls: number }
  return double
}

type Writes = { writes: number }

/** The dispatch records of a call; without an entry for the call, the records are empty. */
type DispatchRecords = Record<
  string,
  Outcome<readonly DispatchRecord[], { kind: string }> | 'throw'
>

function modelDouble(
  lookups: Record<string, Outcome<Lookup, { kind: string }> | 'throw'>,
  pages: Record<string, Outcome<ModelDiagnosticsPage, { kind: string }>> = {},
  records: DispatchRecords = {},
) {
  const calls = {
    writes: 0,
    inspected: [] as string[],
    listed: [] as string[],
    dispatched: [] as string[],
  }
  const modelCalls = {
    inspect: async (input: { reference: string }) => {
      calls.inspected.push(input.reference)
      const answer = lookups[input.reference]
      if (answer === 'throw') throw new Error('model exploded')
      return answer ?? fail({ kind: 'invalid', field: 'reference', reason: 'unknown' })
    },
    dispatches: async (input: { call: string }) => {
      calls.dispatched.push(input.call)
      const answer = records[input.call]
      if (answer === 'throw') throw new Error('model exploded')
      return answer ?? succeed([])
    },
    admit: async () => {
      calls.writes += 1
      return fail({ kind: 'denied', action: 'admit' })
    },
    cancel: async () => {
      calls.writes += 1
      return fail({ kind: 'denied', action: 'cancel' })
    },
  }
  const modelDiagnostics = {
    list: async (input: { call: string }) => {
      calls.listed.push(input.call)
      return pages[input.call] ?? fail({ kind: 'denied', action: 'list' })
    },
  }
  return { calls, modelCalls: modelCalls as never, modelDiagnostics: modelDiagnostics as never }
}

function toolDouble(
  lookups: Record<string, Outcome<ToolLookup, { kind: string }> | 'throw'>,
  accounts: Record<string, Outcome<CallAccount, { kind: string }>> = {},
  /** The first diagnostics page of a call; without an entry for the call, the page is empty. */
  diagnostics: Record<string, Outcome<DiagnosticPage, { kind: string }>> = {},
) {
  const calls: Writes & { looked: string[]; diagnosed: unknown[] } = {
    writes: 0,
    looked: [],
    diagnosed: [],
  }
  const toolQueries = {
    lookup: async (input: { reference: string }) => {
      calls.looked.push(input.reference)
      const answer = lookups[input.reference]
      if (answer === 'throw') throw new Error('tool exploded')
      return answer ?? fail({ kind: 'invalid', field: 'reference', reason: 'unknown' })
    },
    account: async (input: { reference: string }) =>
      accounts[input.reference] ?? fail({ kind: 'denied', action: 'account' }),
    readDiagnostics: async (input: { reference: string; after: string | null }) => {
      calls.diagnosed.push({ reference: input.reference, after: input.after })
      return diagnostics[input.reference] ?? succeed({ entries: [], next: null })
    },
    control: async () => {
      calls.writes += 1
      return { kind: 'rejected' }
    },
    releaseDelivery: async () => {
      calls.writes += 1
      return { kind: 'rejected' }
    },
  }
  return { calls, toolQueries: toolQueries as never }
}

function agentDouble(answers: Record<string, Outcome<FinishIntent | null, { kind: string }>>) {
  const reads: string[] = []
  return {
    reads,
    agentJournal: {
      readFinish: async (input: { execution: string }): Fail<FinishIntent | null> => {
        reads.push(input.execution)
        return answers[input.execution] ?? fail({ kind: 'denied', action: 'readFinish' })
      },
    } as never,
  }
}

function intent(failure: unknown, conclusion: unknown = { kind: 'fail', cause: evidence('c') }) {
  return {
    candidate: 'op-f1',
    conclusion,
    inputWatermark: evidence('w'),
    obligations: null,
    beforeTerminal: null,
    failure,
  } as unknown as FinishIntent
}

const settledCall = (call: string): Outcome<Lookup, never> =>
  succeed({
    kind: 'found',
    state: {
      call,
      revision: '1',
      consumer: { owner: 'agent', id: 'x' },
      control: { kind: 'none' },
      custody: { kind: 'producer' },
      phase: 'settled',
      settlement: {
        version: 'v1',
        termination: { kind: 'completed', reason: 'stop' },
        cursor: '0',
        source: evidence('s'),
      },
    },
  } as never)

const dispatchPage = (
  outcome: unknown,
  coverage: 'complete-through-snapshot' | 'expired-prefix' = 'complete-through-snapshot',
): Outcome<ModelDiagnosticsPage, never> =>
  succeed({
    entries: [
      {
        id: 'diag-1',
        call: 'c',
        dispatch: 'd1',
        revision: '2',
        adapter: adoption,
        send: 'sent',
        firstContent: 'none-proven',
        outcome,
        timing: {
          materialize: { kind: 'unknown' },
          sendToFirstContent: { kind: 'unknown' },
          execution: { kind: 'unknown' },
        },
      },
    ],
    next: null,
    snapshot: evidence('snap'),
    retention: adoption,
    coverage,
  } as never)

const settledTool = (
  call: string,
  diagnostic = 'SECRET-TOOL-DIAGNOSTIC',
): Outcome<ToolLookup, never> =>
  succeed({
    kind: 'found',
    state: {
      call,
      revision: '1',
      source: evidence('s'),
      foreground: null,
      effect: { kind: 'none' },
      execution: { kind: 'none' },
      timing: {},
      queue: { kind: 'none' },
      controls: [],
      delivery: null,
      supplements: [],
      phase: 'settled',
      wait: { kind: 'none' },
      result: 'r1',
      relation: 'foreground',
      terminal: { kind: 'failed', cause: 'executor', diagnostic },
    },
  } as never)

const toolAccount = (): Outcome<CallAccount, never> =>
  succeed<CallAccount>({
    subject: { kind: 'tool_execution', id: 'tool-1' },
    usage: [{ name: 'cpu_ms', unit: 'ms', state: 'known', lexeme: '40' }],
    cost: [{ source: 'supplier', unit: 'USD', state: 'unknown' }],
    trimmed: { state: 'unknown', unit: 'byte' },
    place: 'SECRET-PLACE',
    duration: { state: 'unknown' },
    receipt: 'received',
    revision: '1',
  })

const modelAccount = (): CallAccount => ({
  subject: { kind: 'model_call', id: 'c1' },
  usage: [{ name: 'input_tokens', unit: 'token', state: 'known', lexeme: '120' }],
  cost: [{ source: 'supplier', unit: 'USD', state: 'provisional', lexeme: '0.002' }],
  trimmed: { state: 'unknown', unit: 'byte' },
  place: 'SECRET-MODEL-PLACE',
  duration: '900',
  receipt: 'received',
  revision: '1',
})

/** A dispatch record with only what the projection reads: the identity and the account. */
const dispatchRecord = (dispatch: string, account: CallAccount | null): DispatchRecord =>
  ({
    dispatch,
    supplier: { owner: 'fixture', id: 's' },
    intent: 'op',
    send: 'started',
    firstContent: 'observed',
    terminal: null,
    account,
    materialization: null,
  }) as never

/** An attempts page with one pending entry per dispatch identity. */
const attemptsPage = (dispatches: readonly string[]): Outcome<ModelDiagnosticsPage, never> =>
  succeed({
    entries: dispatches.map(dispatch => ({
      id: `diag-${dispatch}`,
      call: 'c',
      dispatch,
      revision: '2',
      adapter: adoption,
      send: 'sent',
      firstContent: 'none-proven',
      outcome: { kind: 'pending' },
      timing: {
        materialize: { kind: 'unknown' },
        sendToFirstContent: { kind: 'unknown' },
        execution: { kind: 'unknown' },
      },
    })),
    next: null,
    snapshot: evidence('snap'),
    retention: adoption,
    coverage: 'complete-through-snapshot',
  } as never)

const noAttempts: SessionRunAttempts = {
  started: '0',
  released: { ended: '0', bounded: '0', cancelled: '0', released: '0', superseded: '0' },
  exited: '0',
}

/**
 * The stored payload of a `call.execution-fact` (Session `entries.ts`): the producer fact, with the
 * consumption and result at the top only on the observation path.
 */
type ExecutionFactPayload = Readonly<{
  fact: ProducerFact
  consumption?: ConsumptionId
  result?: ProducedResult | null
}>
const factEntry = (id: string, payload: ExecutionFactPayload) =>
  entry(id, 'call.execution-fact', payload)
const factSource = evidence('SECRET-FACT')
const consumptionOf = (id: string) => `c-${id}` as ConsumptionId
/** The producer `bound(id, kind, reference)` registers. */
const producerOf = (kind: 'model' | 'tool', reference: string): ProducerRef => ({
  kind,
  call: `call-of-${reference}`,
})
/** The observation path (`projection.ts`): an `execution` with the consumption at the top. */
const observedFact = (id: string, consumption: ConsumptionId, producer: ProducerRef) =>
  factEntry(id, {
    fact: { kind: 'execution', producer, source: factSource },
    consumption,
    result: null,
  })
/** A received `release` (`decide-receive.ts`): the consumption sits in the fact. */
const releaseFact = (id: string, consumption: ConsumptionId, producer: ProducerRef) =>
  factEntry(id, {
    fact: {
      kind: 'release',
      consumption,
      result: { producer, version: '1', delivery: null, source: evidence('result') },
      source: factSource,
    },
  })
/** A received `execution` (`decide-receive.ts`): only the producer, no consumption. */
const receivedFact = (id: string, producer: ProducerRef) =>
  factEntry(id, { fact: { kind: 'execution', producer, source: factSource } })

type Options = Readonly<{
  entries: readonly HistoryEntry[]
  ports: DiagnosticPorts<P>
  kinds?: readonly string[]
  maxRuns?: number
  maxCallsPerRun?: number
  run?: string | null
  from?: string | null
  perPage?: number
}>

async function project(options: Options) {
  const history = historyOf(options.entries, options.perPage)
  const result = await projectSessionDiagnostics({
    access,
    history,
    ports: options.ports,
    kinds: options.kinds ?? ALL_KINDS,
    limits: { maxRuns: options.maxRuns ?? 10, maxCallsPerRun: options.maxCallsPerRun ?? 10 },
    run: options.run ?? null,
    pageBytes: 4096,
    from: (options.from ?? null) as never,
  })
  if (result.kind !== 'page') throw new Error(`expected a page, got ${result.kind}`)
  return { ...result.page, history }
}

const completedRun = [
  started('e1', 'r1'),
  attempt('e2', 'r1', '1'),
  bound('e3', 'model', 'm1'),
  bound('e4', 'tool', 't1', 'action'),
  message('e5', 'user', 'SECRET-USER-TEXT'),
  message('e6', 'assistant', 'SECRET-ASSISTANT-TEXT'),
  message('e7', 'assistant', 'more'),
  terminal('e8', 'r1', 'completed'),
]

describe('the Run skeleton and the call branches', () => {
  it('takes the Run skeleton from Session alone and resolves the Model and Tool branches of call.bound', async () => {
    const model = modelDouble(
      { m1: settledCall('c1') },
      { c1: dispatchPage({ kind: 'completed', reason: 'stop' }) },
      { c1: succeed([dispatchRecord('d1', modelAccount())]) },
    )
    const diagnostics = succeed({
      entries: [{ operation: 'op-1', phase: 'start', code: 'spawned', evidence: evidence('x') }],
      next: null,
    } as never) as Outcome<DiagnosticPage, never>
    const tool = toolDouble(
      { t1: settledTool('tool-1') },
      { t1: toolAccount() },
      { t1: diagnostics },
    )
    const agent = agentDouble({})
    const page = await project({
      entries: completedRun,
      ports: { ...model, ...tool, ...agent },
    })
    expect(page.runs).toHaveLength(1)
    const run = page.runs[0]!
    expect(run).toMatchObject({
      run: 'r1',
      entry: 'interactive',
      execution: 'exec-r1',
      started: { position: 'e1', at: { kind: 'unknown' } },
      attempts: { ...noAttempts, started: '1' },
      controls: [],
      terminal: { outcome: 'completed', cause: { record: null, structured: { kind: 'none' } } },
      calls: { registered: '2', projected: '2' },
      messages: [
        { kind: 'message.user', count: '1' },
        { kind: 'message.assistant', count: '2' },
      ],
      facts: [],
    })
    expect(run.modelCalls).toEqual([
      {
        reference: 'm1',
        purpose: 'main',
        call: { kind: 'found', call: 'c1', phase: 'settled' },
        dispatches: [
          {
            dispatch: 'd1',
            revision: '2',
            adapter: adoption,
            send: 'sent',
            firstContent: 'none-proven',
            outcome: { kind: 'completed', reason: 'stop' },
            timing: {
              materialize: { kind: 'unknown' },
              sendToFirstContent: { kind: 'unknown' },
              execution: { kind: 'unknown' },
            },
            account: {
              kind: 'account',
              usage: [{ name: 'input_tokens', unit: 'token', state: 'known', lexeme: '120' }],
              cost: [{ source: 'supplier', unit: 'USD', state: 'provisional', lexeme: '0.002' }],
              duration: { kind: 'known', value: '900' },
              receipt: 'received',
            },
          },
        ],
        coverage: 'complete-through-snapshot',
        facts: [],
      },
    ])
    expect(run.toolCalls).toEqual([
      {
        reference: 't1',
        state: {
          kind: 'found',
          call: 'tool-1',
          phase: 'settled',
          relation: 'foreground',
          terminal: { kind: 'failed', cause: 'executor' },
        },
        account: {
          kind: 'account',
          usage: [{ name: 'cpu_ms', unit: 'ms', state: 'known', lexeme: '40' }],
          cost: [{ source: 'supplier', unit: 'USD', state: 'unknown', lexeme: null }],
          duration: { kind: 'unknown' },
          receipt: 'received',
        },
        facts: [],
        diagnostics: [{ operation: 'op-1', phase: 'start', code: 'spawned' }],
      },
    ])
    expect(page.gaps).toEqual([])
    expect(page.upper).toBe('9')
    expect(page.exhausted).toBe(true)
    expect(page.continueFrom).toBeNull()
    // A completed Run reads no finish from Agent.
    expect(agent.reads).toEqual([])
    expect(model.calls.listed).toEqual(['c1'])
    expect(model.calls.dispatched).toEqual(['c1'])
    expect(tool.calls.diagnosed).toEqual([{ reference: 't1', after: null }])
    expect(JSON.stringify(page)).not.toContain('SECRET-MODEL-PLACE')
  })

  it('reads the registration shape of call.bound that a live Run writes', async () => {
    // The shape of a live session log (2026-11-05 smoke): the producer sits under
    // registration.binding, with no top-level kind or reference.
    const registered = entry('e3', 'call.bound', {
      consumption: 'c-e3',
      registration: {
        binding: {
          action: 'step-1/main',
          consumer: {
            owner: '@omne-harness/agent',
            position: 'I3',
            purpose: 'main',
            work: 'exec-r1/step-1',
          },
          initiatingAttempt: 'r1#1',
          producer: { call: 'm1', kind: 'model' },
          request: evidence('SECRET-REQUEST'),
        },
      },
      association: null,
    })
    const model = modelDouble(
      { m1: settledCall('c1') },
      { c1: dispatchPage({ kind: 'completed', reason: 'stop' }) },
    )
    const page = await project({
      entries: [
        started('e1', 'r1'),
        attempt('e2', 'r1', '1'),
        registered,
        terminal('e8', 'r1', 'completed'),
      ],
      ports: { ...model, ...toolDouble({}, {}), ...agentDouble({}) },
    })
    const run = page.runs[0]!
    expect(run.calls).toEqual({ registered: '1', projected: '1' })
    expect(run.modelCalls).toMatchObject([
      { reference: 'm1', purpose: 'main', call: { kind: 'found', call: 'c1', phase: 'settled' } },
    ])
    expect(model.calls.listed).toEqual(['c1'])
  })

  it('counts the tool-intent registration and the association of one consumption as one Tool call', async () => {
    // What a live Run writes for one Tool call (`entries.ts` encodeEntry, `frontier-state.ts`
    // consequenceKind): first the intent, with `kind: 'tool'` and no producer, then the association
    // under the same consumption, with the producer.
    const consumer = { owner: '@omne-harness/agent', position: 'I3', purpose: 'action', work: 'w' }
    const intentRegistered = entry('e3', 'call.bound', {
      consumption: 'c-tool-1',
      registration: {
        kind: 'tool-intent',
        action: 'step-1/action',
        consumer,
        request: evidence('SECRET-REQUEST'),
        initiatingAttempt: 'r1#1',
        purpose: 'action',
      },
      association: null,
      kind: 'tool',
    })
    const associated = entry('e4', 'call.bound', {
      consumption: 'c-tool-1',
      registration: {
        kind: 'associated',
        purpose: 'action',
        binding: {
          action: 'step-1/action',
          consumer,
          request: evidence('SECRET-REQUEST'),
          initiatingAttempt: 'r1#1',
          producer: { kind: 'tool', call: 't1' },
        },
      },
      association: evidence('association'),
      kind: 'tool',
    })
    const tool = toolDouble({ t1: settledTool('tool-1') }, { t1: toolAccount() })
    const page = await project({
      entries: [
        started('e1', 'r1'),
        attempt('e2', 'r1', '1'),
        intentRegistered,
        associated,
        terminal('e5', 'r1', 'completed'),
      ],
      ports: { ...tool, ...modelDouble({}) },
      maxCallsPerRun: 1,
    })
    const run = page.runs[0]!
    expect(run.calls).toEqual({ registered: '1', projected: '1' })
    expect(run.toolCalls).toHaveLength(1)
    expect(run.toolCalls[0]).toMatchObject({
      reference: 't1',
      state: { kind: 'found', call: 'tool-1', phase: 'settled' },
      account: { kind: 'account' },
    })
    expect(page.gaps).toEqual([])
    expect(tool.calls.looked).toEqual(['t1'])
  })

  it('keeps a tool-intent that was never associated as one registered call without a reference', async () => {
    const intentOnly = entry('e2', 'call.bound', {
      consumption: 'c-tool-2',
      registration: {
        kind: 'tool-intent',
        action: 'step-1/action',
        consumer: { owner: '@omne-harness/agent', position: 'I3', purpose: 'action', work: 'w' },
        request: evidence('SECRET-REQUEST'),
        initiatingAttempt: 'r1#1',
        purpose: 'action',
      },
      association: null,
      kind: 'tool',
    })
    const tool = toolDouble({})
    const page = await project({ entries: [started('e1', 'r1'), intentOnly], ports: { ...tool } })
    const run = page.runs[0]!
    expect(run.calls).toEqual({ registered: '1', projected: '1' })
    expect(run.toolCalls).toEqual([
      {
        reference: 'e2',
        state: { kind: 'unknown', reason: 'not-recorded' },
        account: { kind: 'unknown', reason: 'not-recorded' },
        facts: [],
        diagnostics: { kind: 'unknown', reason: 'not-recorded' },
      },
    ])
    expect(page.gaps).toEqual([{ source: 'tool', subject: 'e2', reason: 'not-recorded' }])
    expect(tool.calls.looked).toEqual([])
    expect(tool.calls.diagnosed).toEqual([])
  })

  it('skips what the skeleton does not read: an unknown terminal outcome, a call.bound without a kind, a release outside the five reasons', async () => {
    const entries = [
      entry('e1', 'run.started', { run: 'r1', execution: 'exec-r1', entry: 'dispatch' }),
      attempt('e2', 'r1', '1'),
      entry('e3', 'run.attempt-released', { run: 'r1', attempt: 'r1#1', reason: 'evaporated' }),
      entry('e4', 'run.attempt-released', { run: 'r1', attempt: 'r1#1' }),
      entry('e5', 'call.bound', { consumption: 'c-x', registration: {}, association: null }),
      entry('e6', 'control.requested', {
        progress: { target: { kind: 'run' }, intent: { kind: 'interrupt' }, state: 'committed' },
      }),
      entry('e7', 'control.progress', { progress: {} }),
      entry('e8', 'run.terminal', { terminal: { run: 'r1', outcome: 'exploded' }, cause: null }),
    ]
    const page = await project({ entries, ports: {} })
    const run = page.runs[0]!
    expect(run.entry).toBe('dispatch')
    expect(run.attempts).toEqual({ ...noAttempts, started: '1' })
    expect(run.terminal).toBeNull()
    expect(run.calls).toEqual({ registered: '0', projected: '0' })
    expect(run.controls).toEqual([
      { position: 'e6', kind: 'requested', target: 'run', intent: 'interrupt', state: 'committed' },
      { position: 'e7', kind: 'progress', target: null, intent: null, state: null },
    ])
    expect(run.messages).toEqual([])
    expect(page.gaps).toEqual([])
  })

  it('writes the model-refused cause as kind and failure kind, and an unaccepted reference as unknown not-accepted', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'model', 'm2'),
      terminal('e3', 'r1', 'failed', 'model-refused: capacity'),
    ]
    const model = modelDouble({ m2: succeed({ kind: 'not-accepted', operation: 'op' }) as never })
    const agent = agentDouble({
      'exec-r1': succeed(
        intent({
          kind: 'model-refused',
          call: 'c2',
          failure: { kind: 'capacity', required: { tokens: '1' } },
          step: null,
          at: '0',
          source: evidence('f'),
        }),
      ),
    })
    const page = await project({ entries, ports: { ...model, ...agent } })
    const run = page.runs[0]!
    expect(run.terminal).toEqual({
      outcome: 'failed',
      cause: {
        record: 'model-refused: capacity',
        structured: { kind: 'model-refused', failure: 'capacity' },
      },
    })
    expect(run.modelCalls[0]).toMatchObject({
      reference: 'm2',
      call: { kind: 'unknown', reason: 'not-accepted' },
      dispatches: [],
      coverage: 'unknown',
    })
    expect(page.gaps).toContainEqual({ source: 'model', subject: 'm2', reason: 'not-accepted' })
    expect(model.calls.listed).toEqual([])
  })

  it('writes the no-reply cause with cause and upstreamStatus, agreeing with the dispatch outcome of the same call', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'model', 'm3'),
      terminal('e3', 'r1', 'failed', 'no-reply'),
    ]
    const fault = {
      cause: 'upstream-unavailable',
      diagnostic: 'in-band-error',
      upstreamStatus: '504',
    }
    const model = modelDouble(
      { m3: settledCall('c3') },
      {
        c3: dispatchPage({ kind: 'failed', cause: 'upstream-unavailable', upstreamStatus: '504' }),
      },
    )
    const agent = agentDouble({
      'exec-r1': succeed(
        intent({
          kind: 'no-reply',
          call: 'c3',
          result: {
            producer: { kind: 'model', call: 'c3' },
            version: 'v',
            delivery: null,
            source: evidence('r'),
          },
          fault,
          step: null,
          at: '0',
          source: evidence('f'),
        }),
      ),
    })
    const page = await project({ entries, ports: { ...model, ...agent } })
    const run = page.runs[0]!
    const structured = run.terminal?.cause.structured
    expect(structured).toEqual({
      kind: 'no-reply',
      cause: 'upstream-unavailable',
      upstreamStatus: '504',
    })
    const dispatch = run.modelCalls[0]!.dispatches[0]!
    expect(dispatch.outcome).toEqual({
      kind: 'failed',
      cause: 'upstream-unavailable',
      upstreamStatus: '504',
    })
    if (structured?.kind !== 'no-reply' || dispatch.outcome.kind !== 'failed')
      throw new Error('shape')
    expect(dispatch.outcome.cause).toBe(structured.cause)
    expect(dispatch.outcome.upstreamStatus).toBe(structured.upstreamStatus)
    expect(JSON.stringify(page)).not.toContain('in-band-error')
  })

  it('reads the finish of a cancelled Run and writes no-failure with the conclusion', async () => {
    const entries = [started('e1', 'r1'), terminal('e2', 'r1', 'cancelled', 'cancelled by user')]
    const agent = agentDouble({
      'exec-r1': succeed(intent(null, { kind: 'cancelled', cause: evidence('x') })),
    })
    const page = await project({ entries, ports: { ...agent } })
    expect(page.runs[0]!.terminal?.cause.structured).toEqual({
      kind: 'no-failure',
      conclusion: 'cancelled',
    })
    expect(agent.reads).toEqual(['exec-r1'])
  })
})

describe('gaps', () => {
  it('turns unsupported, unavailable and denied answers into gaps and leaves the other sources intact', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'model', 'm-denied'),
      bound('e3', 'tool', 't-unavailable', 'action'),
      terminal('e4', 'r1', 'failed', 'x'),
    ]
    const model = modelDouble({ 'm-denied': fail({ kind: 'denied', action: 'inspect' }) })
    const tool = toolDouble(
      {
        't-unavailable': fail({
          kind: 'unavailable',
          dependency: 'store',
          diagnostic: 'SECRET-DIAG',
        }),
      },
      { 't-unavailable': toolAccount() },
    )
    const agent = agentDouble({ 'exec-r1': fail({ kind: 'unsupported' }) })
    const page = await project({ entries, ports: { ...model, ...tool, ...agent } })
    expect(page.gaps).toEqual([
      { source: 'agent', subject: 'exec-r1', reason: 'unsupported' },
      { source: 'model', subject: 'm-denied', reason: 'denied' },
      { source: 'tool', subject: 't-unavailable', reason: 'unavailable' },
    ])
    const run = page.runs[0]!
    expect(run.terminal?.cause.structured).toEqual({ kind: 'unknown', reason: 'unsupported' })
    expect(run.modelCalls[0]!.call).toEqual({ kind: 'unknown', reason: 'denied' })
    expect(run.toolCalls[0]!.state).toEqual({ kind: 'unknown', reason: 'unavailable' })
    // The account of the same Tool call still resolves: a gap of one read does not change another.
    expect(run.toolCalls[0]!.account).toMatchObject({ kind: 'account', receipt: 'received' })
    expect(JSON.stringify(page)).not.toContain('SECRET-DIAG')
  })

  describe('every failure of an owner has its gap reason', () => {
    const required = { tokens: '1' }
    it.each([
      [{ kind: 'invalid', field: 'reference', reason: 'not a reference' }, 'not-found'],
      [{ kind: 'invalid', field: 'tenant', reason: 'x' }, 'unavailable'],
      [{ kind: 'capacity', required }, 'unavailable'],
      [{ kind: 'conflict', operation: 'op', revision: '1' }, 'unavailable'],
      [{ kind: 'commit-unknown', operation: 'op' }, 'unavailable'],
      [{ kind: 'stale-instance', instance: 'i' }, 'unavailable'],
      [{ kind: 'handoff-invalid', reason: 'x' }, 'unavailable'],
      [{ kind: 'not-settled' }, 'not-recorded'],
    ] as const)('Model inspect %j -> %s', async (failure, reason) => {
      const entries = [started('e1', 'r1'), bound('e2', 'model', 'm1')]
      const model = modelDouble({ m1: fail(failure) })
      const page = await project({ entries, ports: { ...model } })
      expect(page.runs[0]!.modelCalls[0]!.call).toEqual({ kind: 'unknown', reason })
      expect(page.gaps).toEqual([{ source: 'model', subject: 'm1', reason }])
      expect(model.calls.listed).toEqual([])
    })

    it.each([
      [{ kind: 'invalid', field: 'call', reason: 'not a call' }, 'not-found'],
      [{ kind: 'invalid', field: 'limit', reason: 'above the deployment bound' }, 'unavailable'],
      [{ kind: 'not-settled' }, 'not-recorded'],
    ] as const)('Model diagnostics list %j -> %s', async (failure, reason) => {
      const entries = [started('e1', 'r1'), bound('e2', 'model', 'm1')]
      const model = modelDouble({ m1: settledCall('c1') }, { c1: fail(failure) })
      const page = await project({ entries, ports: { ...model } })
      expect(page.runs[0]!.modelCalls[0]).toMatchObject({
        call: { kind: 'found', call: 'c1' },
        dispatches: [],
        coverage: 'unknown',
      })
      expect(page.gaps).toEqual([{ source: 'model', subject: 'm1', reason }])
    })

    it.each([
      [{ kind: 'invalid', field: 'reference', reason: 'not a reference' }, 'not-found'],
      [{ kind: 'invalid-cursor', reason: 'x' }, 'unavailable'],
      [{ kind: 'stale-revision', current: '2' }, 'unavailable'],
      [{ kind: 'stale-instance', instance: 'i' }, 'unavailable'],
      [{ kind: 'conflict', operation: 'op' }, 'unavailable'],
      [{ kind: 'commit-unknown', operation: 'op' }, 'unavailable'],
      [{ kind: 'not-settled' }, 'not-recorded'],
    ] as const)('Tool lookup, account and readDiagnostics %j -> %s', async (failure, reason) => {
      const entries = [started('e1', 'r1'), bound('e2', 'tool', 't1', 'action')]
      const tool = toolDouble({ t1: fail(failure) }, { t1: fail(failure) }, { t1: fail(failure) })
      const page = await project({ entries, ports: { ...tool } })
      expect(page.runs[0]!.toolCalls[0]).toMatchObject({
        state: { kind: 'unknown', reason },
        account: { kind: 'unknown', reason },
        diagnostics: { kind: 'unknown', reason },
      })
      expect(page.gaps).toEqual([{ source: 'tool', subject: 't1', reason }])
    })

    it.each([
      [{ kind: 'invalid', field: 'execution', reason: 'not an execution' }, 'not-found'],
      [{ kind: 'invalid', field: 'tenant', reason: 'x' }, 'unavailable'],
      [{ kind: 'stale-advance' }, 'unavailable'],
      [{ kind: 'not-ready' }, 'unavailable'],
      [{ kind: 'terminal' }, 'unavailable'],
      [{ kind: 'busy' }, 'unavailable'],
      [{ kind: 'changed' }, 'unavailable'],
      [{ kind: 'commit-unknown', operation: 'op' }, 'unavailable'],
      [{ kind: 'conflict', operation: 'op' }, 'unavailable'],
    ] as const)('Agent readFinish %j -> %s', async (failure, reason) => {
      const entries = [started('e1', 'r1'), terminal('e2', 'r1', 'failed', 'x')]
      const agent = agentDouble({ 'exec-r1': fail(failure) })
      const page = await project({ entries, ports: { ...agent } })
      expect(page.runs[0]!.terminal?.cause.structured).toEqual({ kind: 'unknown', reason })
      expect(page.gaps).toEqual([{ source: 'agent', subject: 'exec-r1', reason }])
    })
  })

  it('turns a throwing source into an unavailable gap without failing the page', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'model', 'm-throw'),
      bound('e3', 'tool', 't-throw', 'action'),
    ]
    const model = modelDouble({ 'm-throw': 'throw' })
    const tool = toolDouble({ 't-throw': 'throw' }, { 't-throw': toolAccount() })
    const page = await project({ entries, ports: { ...model, ...tool } })
    expect(page.gaps).toEqual([
      { source: 'model', subject: 'm-throw', reason: 'unavailable' },
      { source: 'tool', subject: 't-throw', reason: 'unavailable' },
    ])
    expect(page.runs[0]!.terminal).toBeNull()
  })

  it.each([
    ['no agent port', {}],
    ['an agent port without readFinish', { agentJournal: {} as never }],
  ])('writes an unknown cause with reason unsupported given %s', async (_name, ports) => {
    const entries = [started('e1', 'r1'), terminal('e2', 'r1', 'failed', 'x')]
    const page = await project({ entries, ports })
    expect(page.runs[0]!.terminal?.cause.structured).toEqual({
      kind: 'unknown',
      reason: 'unsupported',
    })
    expect(page.gaps).toEqual([{ source: 'agent', subject: 'exec-r1', reason: 'unsupported' }])
  })

  it('writes unsupported gaps for the Model and Tool branches when their ports are absent', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'model', 'm1'),
      bound('e3', 'tool', 't1', 'action'),
    ]
    const page = await project({ entries, ports: {} })
    expect(page.runs[0]!.modelCalls[0]!.call).toEqual({ kind: 'unknown', reason: 'unsupported' })
    expect(page.runs[0]!.toolCalls[0]!).toMatchObject({
      state: { kind: 'unknown', reason: 'unsupported' },
      account: { kind: 'unknown', reason: 'unsupported' },
      diagnostics: { kind: 'unknown', reason: 'unsupported' },
    })
    expect(page.gaps).toEqual([
      { source: 'model', subject: 'm1', reason: 'unsupported' },
      { source: 'tool', subject: 't1', reason: 'unsupported' },
    ])
  })

  it('records an expired diagnostics prefix as a retention-expired gap and keeps the entries', async () => {
    const entries = [started('e1', 'r1'), bound('e2', 'model', 'm1')]
    const model = modelDouble(
      { m1: settledCall('c1') },
      { c1: dispatchPage({ kind: 'interrupted' }, 'expired-prefix') },
    )
    const page = await project({ entries, ports: { ...model } })
    expect(page.runs[0]!.modelCalls[0]).toMatchObject({ coverage: 'expired-prefix' })
    expect(page.runs[0]!.modelCalls[0]!.dispatches).toHaveLength(1)
    expect(page.gaps).toEqual([{ source: 'model', subject: 'm1', reason: 'retention-expired' }])
  })

  it('counts the calls past maxCallsPerRun and records the Run as truncated', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'model', 'm1'),
      bound('e3', 'tool', 't1', 'action'),
      bound('e4', 'model', 'm2'),
      bound('e5', 'model', 'm3'),
    ]
    const model = modelDouble({
      m1: settledCall('c1'),
      m2: settledCall('c2'),
      m3: settledCall('c3'),
    })
    const tool = toolDouble({ t1: settledTool('tool-1') })
    const page = await project({ entries, ports: { ...model, ...tool }, maxCallsPerRun: 2 })
    const run = page.runs[0]!
    expect(run.calls).toEqual({ registered: '4', projected: '2' })
    expect(run.modelCalls.map(call => call.reference)).toEqual(['m1'])
    expect(run.toolCalls.map(call => call.reference)).toEqual(['t1'])
    expect(model.calls.inspected).toEqual(['m1'])
    expect(page.gaps).toContainEqual({ source: 'session', subject: 'r1', reason: 'truncated' })
  })

  it('records a kind the deployment does not disclose as not-disclosed and asks Session only for the disclosed kinds', async () => {
    const kinds = ALL_KINDS.filter(
      kind => kind !== 'call.execution-fact' && kind !== 'message.tool',
    )
    const page = await project({ entries: [started('e1', 'r1')], ports: {}, kinds })
    expect(page.gaps).toEqual([
      { source: 'session', subject: 'call.execution-fact', reason: 'not-disclosed' },
      { source: 'session', subject: 'message.tool', reason: 'not-disclosed' },
    ])
    expect(page.history.begins[0]).toMatchObject({ kinds, from: null, direction: 'backward' })
  })
})

describe('what never reaches the view', () => {
  it('carries no fault diagnostic, message body, tool argument or account place', async () => {
    const entries = [...completedRun.slice(0, 7), terminal('e8', 'r1', 'failed', 'no-reply')]
    const fault = {
      cause: 'stream-lost',
      diagnostic: 'SECRET-FAULT-DIAGNOSTIC',
      upstreamStatus: null,
    }
    const model = modelDouble(
      { m1: settledCall('c1') },
      { c1: dispatchPage({ kind: 'failed', cause: 'stream-lost', upstreamStatus: null }) },
    )
    const tool = toolDouble({ t1: settledTool('tool-1') }, { t1: toolAccount() })
    const agent = agentDouble({
      'exec-r1': succeed(
        intent({
          kind: 'no-reply',
          call: 'c1',
          result: {
            producer: { kind: 'model', call: 'c1' },
            version: 'v',
            delivery: null,
            source: evidence('r'),
          },
          fault,
          step: null,
          at: '0',
          source: evidence('f'),
        }),
      ),
    })
    const page = await project({ entries, ports: { ...model, ...tool, ...agent } })
    const text = JSON.stringify({ runs: page.runs, gaps: page.gaps })
    for (const secret of [
      'SECRET-FAULT-DIAGNOSTIC',
      'SECRET-USER-TEXT',
      'SECRET-ASSISTANT-TEXT',
      'SECRET-ACTION-ARGUMENTS',
      'SECRET-REQUEST',
      'SECRET-TOOL-DIAGNOSTIC',
      'SECRET-PLACE',
    ])
      expect(text, secret).not.toContain(secret)
    expect(page.runs[0]!.terminal?.cause.structured).toEqual({
      kind: 'no-reply',
      cause: 'stream-lost',
      upstreamStatus: null,
    })
  })
})

describe('paging', () => {
  const threeRuns = [
    started('e1', 'r1'),
    terminal('e2', 'r1', 'completed'),
    started('e3', 'r2'),
    terminal('e4', 'r2', 'completed'),
    started('e5', 'r3'),
    attempt('e6', 'r3', '1'),
  ]

  it('lists Runs newest first, at most maxRuns per page, and continues from the oldest Run started', async () => {
    const first = await project({ entries: threeRuns, ports: {}, maxRuns: 2, perPage: 2 })
    expect(first.runs.map(run => run.run)).toEqual(['r3', 'r2'])
    expect(first.runs[0]!.terminal).toBeNull()
    expect(first.exhausted).toBe(false)
    expect(first.continueFrom).toBe('e3')
    expect(first.scannedThrough).toBe('e3')
    const second = await project({ entries: threeRuns, ports: {}, maxRuns: 2, from: 'e3' })
    expect(second.runs.map(run => run.run)).toEqual(['r1'])
    expect(second.exhausted).toBe(true)
    expect(second.continueFrom).toBeNull()
    expect(second.history.begins[0]).toMatchObject({ from: 'e3', direction: 'backward' })
  })

  it('reads one Run when asked for it and reports the scan exhausted at that Run', async () => {
    const page = await project({ entries: threeRuns, ports: {}, run: 'r2', perPage: 1 })
    expect(page.runs.map(run => run.run)).toEqual(['r2'])
    expect(page.exhausted).toBe(true)
    expect(page.continueFrom).toBeNull()
  })

  it('answers an empty page that is exhausted when the Run does not exist', async () => {
    const page = await project({ entries: threeRuns, ports: {}, run: 'r9' })
    expect(page.runs).toEqual([])
    expect(page.exhausted).toBe(true)
  })

  it('passes a Session failure through unchanged', async () => {
    const history = {
      begin: async (): Promise<Outcome<HistoryPage, SessionFailure>> =>
        fail({ kind: 'denied', action: 'history.begin' }),
      next: async (): Promise<Outcome<HistoryPage, SessionFailure>> =>
        fail({ kind: 'unsupported' }),
    }
    const result = await projectSessionDiagnostics({
      access,
      history,
      ports: {},
      kinds: ALL_KINDS,
      limits: { maxRuns: 1, maxCallsPerRun: 1 },
      run: null,
      pageBytes: 10,
      from: null,
    })
    expect(result).toEqual({
      kind: 'failure',
      failure: { kind: 'denied', action: 'history.begin' },
    })
  })
})

describe('read only', () => {
  it('calls no write interface of Model or Tool while projecting', async () => {
    const model = modelDouble({ m1: settledCall('c1') }, { c1: dispatchPage({ kind: 'pending' }) })
    const tool = toolDouble({ t1: settledTool('tool-1') }, { t1: toolAccount() })
    await project({ entries: completedRun, ports: { ...model, ...tool } })
    expect(model.calls.writes).toBe(0)
    expect(tool.calls.writes).toBe(0)
  })
})

describe('the values the owners give', () => {
  it('writes a finish Agent has not recorded as unknown not-recorded, with the gap', async () => {
    const entries = [started('e1', 'r1'), terminal('e2', 'r1', 'failed', 'x')]
    const agent = agentDouble({ 'exec-r1': succeed(null) })
    const page = await project({ entries, ports: { ...agent } })
    expect(page.runs[0]!.terminal?.cause.structured).toEqual({
      kind: 'unknown',
      reason: 'not-recorded',
    })
    expect(page.gaps).toEqual([{ source: 'agent', subject: 'exec-r1', reason: 'not-recorded' }])
  })

  it.each([
    [
      {
        kind: 'node-failed',
        node: 'E4',
        category: 'invariant',
        failureKind: 'unavailable',
        diagnostic: 'secret raw exception',
      },
      { kind: 'node-failed', node: 'E4', category: 'invariant', failureKind: 'unavailable' },
    ],
    [
      { kind: 'cannot-fit', reason: 'after-compaction' },
      { kind: 'cannot-fit', reason: 'after-compaction' },
    ],
    [
      { kind: 'cannot-fit', reason: 'elsewhere' },
      { kind: 'cannot-fit', reason: { kind: 'unknown', reason: 'unsupported' } },
    ],
    [{ kind: 'guard', diagnostic: 'private-failure-text' }, { kind: 'guard' }],
    [
      { kind: 'request-rejected', diagnostic: 'private-failure-text' },
      { kind: 'request-rejected' },
    ],
    [
      { kind: 'compaction-invalid', diagnostic: 'private-failure-text' },
      { kind: 'compaction-invalid' },
    ],
    [
      { kind: 'message-rejected', diagnostic: 'private-failure-text' },
      { kind: 'message-rejected' },
    ],
    [{ kind: 'extension-stop', diagnostic: 'private-failure-text' }, { kind: 'extension-stop' }],
    [
      { kind: 'model-refused', call: 'c1', failure: { kind: 'exotic' } },
      { kind: 'model-refused', failure: { kind: 'unknown', reason: 'unsupported' } },
    ],
    [
      { kind: 'model-refused', call: 'c1', failure: { kind: 'denied', action: 'admit' } },
      { kind: 'model-refused', failure: 'denied' },
    ],
    [
      { kind: 'no-reply', call: 'c1' },
      { kind: 'no-reply', cause: null, upstreamStatus: null },
    ],
  ])('writes the closed fields of the failure %j as %j', async (failure, structured) => {
    const entries = [started('e1', 'r1'), terminal('e2', 'r1', 'failed', 'x')]
    const agent = agentDouble({ 'exec-r1': succeed(intent(failure)) })
    const page = await project({ entries, ports: { ...agent } })
    expect(page.runs[0]!.terminal?.cause.structured).toEqual(structured)
    expect(page.gaps).toEqual([])
  })

  it('writes a model registration without a producer as unknown not-recorded with purpose unknown, and takes the registration purpose over the consumer purpose', async () => {
    const bare = entry('e2', 'call.bound', {
      consumption: 'c-bare',
      registration: { binding: {} },
      association: null,
      kind: 'model',
    })
    const compaction = entry('e3', 'call.bound', {
      consumption: 'c-compaction',
      registration: {
        kind: 'associated',
        purpose: 'compaction',
        binding: { consumer: { purpose: 'main' }, producer: { kind: 'model', call: 'm1' } },
      },
      association: evidence('a'),
      kind: 'model',
    })
    const model = modelDouble({ m1: settledCall('c1') }, { c1: dispatchPage({ kind: 'pending' }) })
    const page = await project({
      entries: [started('e1', 'r1'), bare, compaction],
      ports: { ...model },
    })
    expect(page.runs[0]!.calls).toEqual({ registered: '2', projected: '2' })
    expect(page.runs[0]!.modelCalls).toMatchObject([
      {
        reference: 'e2',
        purpose: 'unknown',
        call: { kind: 'unknown', reason: 'not-recorded' },
        dispatches: [],
        coverage: 'unknown',
      },
      { reference: 'm1', purpose: 'compaction', call: { kind: 'found', call: 'c1' } },
    ])
    expect(page.gaps).toContainEqual({ source: 'model', subject: 'e2', reason: 'not-recorded' })
    expect(model.calls.inspected).toEqual(['m1'])
  })

  it('reads a dispatch page with more pages as a truncated gap and keeps the known timing', async () => {
    const timing = {
      materialize: { kind: 'known', milliseconds: '12' },
      sendToFirstContent: { kind: 'unknown' },
      execution: { kind: 'known', milliseconds: '1500' },
    }
    const page1: Outcome<ModelDiagnosticsPage, never> = succeed({
      entries: [
        {
          id: 'diag-1',
          call: 'c',
          dispatch: 'd1',
          revision: '2',
          adapter: adoption,
          send: 'sent',
          firstContent: 'observed',
          outcome: { kind: 'completed', reason: 'stop' },
          timing,
        },
      ],
      next: 'more',
      snapshot: evidence('snap'),
      retention: adoption,
      coverage: 'complete-through-snapshot',
    } as never)
    const model = modelDouble({ m1: settledCall('c1') }, { c1: page1 })
    const page = await project({
      entries: [started('e1', 'r1'), bound('e2', 'model', 'm1')],
      ports: { ...model },
    })
    expect(page.runs[0]!.modelCalls[0]!.dispatches).toEqual([
      expect.objectContaining({ dispatch: 'd1', send: 'sent', firstContent: 'observed', timing }),
    ])
    expect(page.gaps).toEqual([{ source: 'model', subject: 'm1', reason: 'truncated' }])
  })

  it('lists no attempts when only the inspect port is present: the call resolves, the dispatches are an unsupported gap', async () => {
    const { modelCalls } = modelDouble({ m1: settledCall('c1') })
    const page = await project({
      entries: [started('e1', 'r1'), bound('e2', 'model', 'm1')],
      ports: { modelCalls },
    })
    expect(page.runs[0]!.modelCalls[0]).toMatchObject({
      call: { kind: 'found', call: 'c1' },
      dispatches: [],
      coverage: 'unknown',
    })
    expect(page.gaps).toEqual([{ source: 'model', subject: 'm1', reason: 'unsupported' }])
  })

  const toolState = (call: string, patch: Record<string, unknown>) =>
    succeed({
      kind: 'found',
      state: {
        call,
        revision: '1',
        source: evidence('s'),
        foreground: null,
        effect: { kind: 'none' },
        execution: { kind: 'none' },
        timing: {},
        queue: { kind: 'none' },
        controls: [],
        delivery: null,
        supplements: [],
        phase: 'settled',
        wait: { kind: 'none' },
        result: 'r1',
        relation: 'background',
        terminal: null,
        ...patch,
      },
    } as never) as Outcome<ToolLookup, never>

  it('writes the Tool states: running without a terminal, a terminal only once settled, a completed terminal without a cause, a call Tool did not accept, and an account Tool refused', async () => {
    const entries = [
      started('e1', 'r1'),
      bound('e2', 'tool', 't-running', 'action'),
      bound('e3', 'tool', 't-early', 'action'),
      bound('e4', 'tool', 't-done', 'action'),
      bound('e5', 'tool', 't-refused', 'action'),
    ]
    const tool = toolDouble(
      {
        't-running': toolState('tool-r', { phase: 'running' }),
        't-early': toolState('tool-e', {
          phase: 'running',
          terminal: { kind: 'failed', cause: 'executor', diagnostic: 'SECRET' },
        }),
        't-done': toolState('tool-d', { terminal: { kind: 'completed' } }),
        't-refused': succeed({ kind: 'not-accepted', operation: 'op' }) as never,
      },
      { 't-early': toolAccount(), 't-done': toolAccount(), 't-refused': toolAccount() },
    )
    const page = await project({ entries, ports: { ...tool } })
    expect(page.runs[0]!.toolCalls.map(call => call.state)).toEqual([
      { kind: 'found', call: 'tool-r', phase: 'running', relation: 'background', terminal: null },
      { kind: 'found', call: 'tool-e', phase: 'running', relation: 'background', terminal: null },
      {
        kind: 'found',
        call: 'tool-d',
        phase: 'settled',
        relation: 'background',
        terminal: { kind: 'completed', cause: null },
      },
      { kind: 'unknown', reason: 'not-accepted' },
    ])
    expect(page.runs[0]!.toolCalls[0]!.account).toEqual({ kind: 'unknown', reason: 'denied' })
    expect(page.gaps).toEqual([
      { source: 'tool', subject: 't-running', reason: 'denied' },
      { source: 'tool', subject: 't-refused', reason: 'not-accepted' },
    ])
    expect(JSON.stringify(page)).not.toContain('SECRET')
  })

  it('shows the account items as the owner states them: a lexeme only outside the unknown state, the duration when given', async () => {
    const account = succeed({
      subject: { kind: 'tool_execution', id: 'tool-1' },
      usage: [
        { name: 'cpu_ms', unit: 'ms', state: 'provisional', lexeme: '40' },
        { name: 'mem', unit: 'By', state: 'unknown', lexeme: '7' },
      ],
      cost: [{ source: 'supplier', unit: 'USD', state: 'known', lexeme: '0.1' }],
      trimmed: { state: 'unknown', unit: 'byte' },
      place: 'SECRET-PLACE',
      duration: '1500',
      receipt: 'late',
      revision: '1',
    } as never) as Outcome<CallAccount, never>
    const tool = toolDouble({ t1: settledTool('tool-1') }, { t1: account })
    const page = await project({
      entries: [started('e1', 'r1'), bound('e2', 'tool', 't1', 'action')],
      ports: { ...tool },
    })
    expect(page.runs[0]!.toolCalls[0]!.account).toEqual({
      kind: 'account',
      usage: [
        { name: 'cpu_ms', unit: 'ms', state: 'provisional', lexeme: '40' },
        { name: 'mem', unit: 'By', state: 'unknown', lexeme: null },
      ],
      cost: [{ source: 'supplier', unit: 'USD', state: 'known', lexeme: '0.1' }],
      duration: { kind: 'known', value: '1500' },
      receipt: 'late',
    })
    expect(JSON.stringify(page)).not.toContain('SECRET-PLACE')
  })
})

describe('the attempt counts and the execution facts of a Run', () => {
  it('counts attempt-started, attempt-released by reason and attempt-exited, whatever their order in the log', async () => {
    const released = (id: string, reason: string) =>
      entry(id, 'run.attempt-released', { run: 'r1', attempt: 'r1#1', reason })
    const exited = (id: string) => entry(id, 'run.attempt-exited', { advance: { kind: 'x' } })
    const entries = [
      started('e1', 'r1'),
      exited('e2'),
      released('e3', 'bounded'),
      attempt('e4', 'r1', '1'),
      released('e5', 'ended'),
      attempt('e6', 'r1', '2'),
      released('e7', 'bounded'),
      released('e8', 'superseded'),
      exited('e9'),
      attempt('e10', 'r1', '3'),
    ]
    const page = await project({ entries, ports: {} })
    expect(page.runs[0]!.attempts).toEqual({
      started: '3',
      released: { ended: '1', bounded: '2', cancelled: '0', released: '0', superseded: '1' },
      exited: '2',
    })
  })

  it('counts call.execution-fact by fact.kind and gives each fact to the projected call it names: the consumption at the top, in the fact, or else the producer', async () => {
    const m1 = producerOf('model', 'm1')
    const t1 = producerOf('tool', 't1')
    // The live registration shape: the producer sits under registration.binding.
    const m3 = { kind: 'model', call: 'm3' } as const
    const entries = [
      started('e1', 'r1'),
      // Before the call.bound it names: log order does not decide the owner.
      observedFact('e2', consumptionOf('e3'), m1),
      bound('e3', 'model', 'm1'),
      bound('e4', 'tool', 't1', 'action'),
      entry('e5', 'call.bound', {
        consumption: 'c-e5',
        registration: { binding: { consumer: { purpose: 'main' }, producer: m3 } },
        association: null,
      }),
      releaseFact('e6', consumptionOf('e4'), t1),
      receivedFact('e7', t1),
      receivedFact('e8', m1),
      receivedFact('e9', m3),
      // All the Run's: an unknown consumption in the fact; the producer of a call past
      // maxCallsPerRun; the consumption of that call; a producer of another kind with the same
      // call text; and a consumption that names no projected call, whose producer is m1's.
      releaseFact('e10', consumptionOf('nobody'), t1),
      bound('e11', 'model', 'm2'),
      receivedFact('e12', producerOf('model', 'm2')),
      observedFact('e13', consumptionOf('e11'), producerOf('model', 'm2')),
      receivedFact('e14', { kind: 'tool', call: m1.call }),
      observedFact('e15', consumptionOf('nobody'), m1),
      // No fact.kind: nothing to count under.
      entry('e16', 'call.execution-fact', { fact: { producer: {} }, consumption: 'c-e3' }),
    ]
    const model = modelDouble({
      m1: settledCall('c1'),
      m2: settledCall('c2'),
      m3: settledCall('c3'),
    })
    const tool = toolDouble({ t1: settledTool('tool-1') }, { t1: toolAccount() })
    const page = await project({ entries, ports: { ...model, ...tool }, maxCallsPerRun: 3 })
    const run = page.runs[0]!
    expect(run.modelCalls.map(call => [call.reference, call.facts])).toEqual([
      ['m1', [{ kind: 'execution', count: '2' }]],
      ['m3', [{ kind: 'execution', count: '1' }]],
    ])
    expect(run.toolCalls.map(call => [call.reference, call.facts])).toEqual([
      [
        't1',
        [
          { kind: 'release', count: '1' },
          { kind: 'execution', count: '1' },
        ],
      ],
    ])
    expect(run.facts).toEqual([
      { kind: 'release', count: '1' },
      { kind: 'execution', count: '4' },
    ])
    expect(JSON.stringify(page)).not.toContain('SECRET-FACT')
  })
})

describe('the account of each dispatch', () => {
  const twoAttempts = { m1: settledCall('c1') }

  it('takes the account from the dispatch record of the same identity: given, not recorded, or not listed', async () => {
    const model = modelDouble(
      twoAttempts,
      { c1: attemptsPage(['d1', 'd2', 'd3']) },
      { c1: succeed([dispatchRecord('d2', null), dispatchRecord('d1', modelAccount())]) },
    )
    const page = await project({
      entries: [started('e1', 'r1'), bound('e2', 'model', 'm1')],
      ports: { ...model },
    })
    const dispatches = page.runs[0]!.modelCalls[0]!.dispatches
    expect(dispatches.map(dispatch => [dispatch.dispatch, dispatch.account])).toEqual([
      [
        'd1',
        expect.objectContaining({ kind: 'account', duration: { kind: 'known', value: '900' } }),
      ],
      ['d2', { kind: 'unknown', reason: 'not-recorded' }],
      ['d3', { kind: 'unknown', reason: 'not-found' }],
    ])
    expect(page.gaps).toEqual([])
    expect(model.calls.dispatched).toEqual(['c1'])
  })

  it.each([
    ['refused', fail({ kind: 'denied', action: 'dispatches' }), 'denied'],
    ['throwing', 'throw', 'unavailable'],
  ] as const)(
    'writes every account unknown and one gap of the call when the dispatch read is %s',
    async (_name, records, reason) => {
      const model = modelDouble(twoAttempts, { c1: attemptsPage(['d1', 'd2']) }, { c1: records })
      const page = await project({
        entries: [started('e1', 'r1'), bound('e2', 'model', 'm1')],
        ports: { ...model },
      })
      const call = page.runs[0]!.modelCalls[0]!
      expect(call.call).toEqual({ kind: 'found', call: 'c1', phase: 'settled' })
      expect(call.dispatches.map(dispatch => dispatch.account)).toEqual([
        { kind: 'unknown', reason },
        { kind: 'unknown', reason },
      ])
      expect(page.gaps).toEqual([{ source: 'model', subject: 'm1', reason }])
    },
  )

  it('reads no dispatch record when no attempt was listed', async () => {
    const model = modelDouble(
      { m1: settledCall('c1'), m2: settledCall('c2') },
      { c1: attemptsPage([]), c2: fail({ kind: 'denied', action: 'list' }) },
    )
    const page = await project({
      entries: [started('e1', 'r1'), bound('e2', 'model', 'm1'), bound('e3', 'model', 'm2')],
      ports: { ...model },
    })
    expect(page.runs[0]!.modelCalls.map(call => call.dispatches)).toEqual([[], []])
    expect(model.calls.dispatched).toEqual([])
  })
})

describe('the diagnostics of a Tool call', () => {
  const oneTool = [started('e1', 'r1'), bound('e2', 'tool', 't1', 'action')]

  it('writes unknown unsupported, not an empty array, with the gap, when Tool does not serve diagnostics', async () => {
    const tool = toolDouble(
      { t1: settledTool('tool-1') },
      { t1: toolAccount() },
      { t1: fail({ kind: 'unsupported' }) },
    )
    const page = await project({ entries: oneTool, ports: { ...tool } })
    const call = page.runs[0]!.toolCalls[0]!
    expect(Array.isArray(call.diagnostics)).toBe(false)
    expect(call.diagnostics).toEqual({ kind: 'unknown', reason: 'unsupported' })
    expect(call.state).toMatchObject({ kind: 'found', call: 'tool-1' })
    expect(call.account).toMatchObject({ kind: 'account' })
    expect(page.gaps).toEqual([{ source: 'tool', subject: 't1', reason: 'unsupported' }])
    expect(tool.calls.diagnosed).toEqual([{ reference: 't1', after: null }])
  })

  it('writes the entries of the first page without their evidence, and a next page as a truncated gap it does not read', async () => {
    const tool = toolDouble(
      { t1: settledTool('tool-1') },
      { t1: toolAccount() },
      {
        t1: succeed({
          entries: [
            { operation: 'op-1', phase: 'start', code: 'spawned', evidence: evidence('SECRET-EV') },
            { operation: 'op-1', phase: 'end', code: 'exit-1', evidence: evidence('SECRET-EV') },
          ],
          next: 'page-2',
        } as never) as Outcome<DiagnosticPage, never>,
      },
    )
    const page = await project({ entries: oneTool, ports: { ...tool } })
    expect(page.runs[0]!.toolCalls[0]!.diagnostics).toEqual([
      { operation: 'op-1', phase: 'start', code: 'spawned' },
      { operation: 'op-1', phase: 'end', code: 'exit-1' },
    ])
    expect(page.gaps).toEqual([{ source: 'tool', subject: 't1', reason: 'truncated' }])
    expect(tool.calls.diagnosed).toHaveLength(1)
    expect(JSON.stringify(page)).not.toContain('SECRET-EV')
  })

  it('keeps the state and the account when only the diagnostics read is refused', async () => {
    const tool = toolDouble(
      { t1: settledTool('tool-1') },
      { t1: toolAccount() },
      { t1: fail({ kind: 'denied', action: 'readDiagnostics' }) },
    )
    const page = await project({ entries: oneTool, ports: { ...tool } })
    expect(page.runs[0]!.toolCalls[0]).toMatchObject({
      state: { kind: 'found' },
      account: { kind: 'account' },
      diagnostics: { kind: 'unknown', reason: 'denied' },
    })
    expect(page.gaps).toEqual([{ source: 'tool', subject: 't1', reason: 'denied' }])
  })
})

describe('the call registrations of a Run', () => {
  it('keeps two registrations without a consumption as two calls', async () => {
    const without = (id: string, reference: string) =>
      entry(id, 'call.bound', {
        binding: { producer: { kind: 'model', call: `call-of-${reference}` } },
        reference,
        purpose: 'main',
        kind: 'model',
      })
    const page = await project({
      entries: [started('e1', 'r1'), without('e2', 'm1'), without('e3', 'm2')],
      ports: {},
    })
    expect(page.runs[0]!.calls).toEqual({ registered: '2', projected: '2' })
    expect(page.runs[0]!.modelCalls.map(call => call.reference)).toEqual(['m1', 'm2'])
  })

  it('takes the values of the entry with the producer whichever of the two comes first', async () => {
    const consumer = { owner: '@omne-harness/agent', position: 'I3', purpose: 'action', work: 'w' }
    const associated = entry('e2', 'call.bound', {
      consumption: 'c-1',
      registration: {
        kind: 'associated',
        purpose: 'action',
        binding: { action: 'a', consumer, producer: { kind: 'tool', call: 't1' } },
      },
      association: evidence('association'),
      kind: 'tool',
    })
    const intentRegistered = entry('e3', 'call.bound', {
      consumption: 'c-1',
      registration: { kind: 'tool-intent', action: 'a', consumer, purpose: 'action' },
      association: null,
      kind: 'tool',
    })
    const tool = toolDouble({ t1: settledTool('tool-1') }, { t1: toolAccount() })
    const page = await project({
      entries: [started('e1', 'r1'), associated, intentRegistered],
      ports: { ...tool },
    })
    expect(page.runs[0]!.calls).toEqual({ registered: '1', projected: '1' })
    expect(page.runs[0]!.toolCalls).toMatchObject([{ reference: 't1', state: { kind: 'found' } }])
    expect(tool.calls.looked).toEqual(['t1'])
  })

  it('writes only the closed fields of a failed dispatch outcome', async () => {
    const model = modelDouble(
      { m1: settledCall('c1') },
      {
        c1: dispatchPage({
          kind: 'failed',
          cause: 'stream-lost',
          upstreamStatus: null,
          diagnostic: 'SECRET-OUTCOME-DIAGNOSTIC',
        }),
      },
    )
    const page = await project({
      entries: [started('e1', 'r1'), bound('e2', 'model', 'm1')],
      ports: { ...model },
    })
    expect(page.runs[0]!.modelCalls[0]!.dispatches[0]!.outcome).toEqual({
      kind: 'failed',
      cause: 'stream-lost',
      upstreamStatus: null,
    })
    expect(JSON.stringify(page)).not.toContain('SECRET-OUTCOME-DIAGNOSTIC')
  })
})

describe('the Run collector', () => {
  it('stops at the requested Run, defaults what run.started lacks, and takes no entry after it stopped', () => {
    const collector = collectRuns({ run: 'r1', maxRuns: 10 })
    expect(collector.feed(message('e5', 'user', 'x'))).toBe(false)
    expect(collector.feed(entry('e4', 'run.started', { run: 'r2' }))).toBe(false)
    expect(collector.feed(entry('e3', 'run.started', { run: 'r1' }))).toBe(true)
    expect(collector.stoppedAt()).toBe('e3')
    expect(collector.feed(entry('e2', 'run.started', { run: 'r0' }))).toBe(true)
    expect(collector.feed(message('e1', 'user', 'y'))).toBe(true)
    expect(collector.runs().map(run => ({ ...run, messages: [...run.messages] }))).toEqual([
      {
        run: 'r1',
        execution: 'unknown',
        entry: 'interactive',
        position: 'e3',
        attempts: {
          started: 0,
          released: { ended: 0, bounded: 0, cancelled: 0, released: 0, superseded: 0 },
          exited: 0,
        },
        controls: [],
        terminal: null,
        calls: [],
        messages: [],
        facts: [],
      },
    ])
  })

  it('reads no page past the requested Run', async () => {
    const entries = [
      started('e1', 'r1'),
      message('e2', 'user', 'a'),
      started('e3', 'r2'),
      message('e4', 'user', 'b'),
    ]
    const page = await project({ entries, ports: {}, run: 'r2', perPage: 1 })
    expect(page.runs.map(run => run.run)).toEqual(['r2'])
    expect(page.history.nextCalls).toBe(1)
  })
})

describe('the cursor', () => {
  const binding = { tenant: 'tenant-a', session: 's-1' }
  const state = { from: 'e9', run: null, pageBytes: 1, upper: 'r12' }
  const key = Uint8Array.from({ length: 32 }, (_, index) => index + 1)
  const DOMAIN = 'omne-harness/server-entry/session-diagnostics-cursor/v1\u0000'
  /** Seals any payload the way the entry does, so a test can hand in a well-signed payload of its choice. */
  const sealed = (payload: unknown): string => {
    const text = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
    return `${text}.${createHmac('sha256', key).update(DOMAIN).update(text).digest('base64url')}`
  }

  it('opens what it sealed, in the documented form: the payload, a dot, and the HMAC over the domain tag and the payload', () => {
    const cursors = createDiagnosticsCursors(key)
    expect(cursors.open(binding, cursors.seal(binding, state))).toEqual(state)
    const filtered = { ...state, run: 'r7', pageBytes: 4096 }
    expect(cursors.open(binding, cursors.seal(binding, filtered))).toEqual(filtered)
    expect(cursors.seal(binding, state)).toBe(sealed({ ...binding, ...state }))
  })

  it('answers undefined for a tampered payload, a MAC of another length, another key, and a text that is not two parts', () => {
    const cursors = createDiagnosticsCursors(key)
    const cursor = cursors.seal(binding, state)
    const [text, mac] = cursor.split('.') as [string, string]
    const middle = Math.floor(text.length / 2)
    const flipped = `${text.slice(0, middle)}${text[middle] === 'A' ? 'B' : 'A'}${text.slice(middle + 1)}`
    expect(cursors.open(binding, `${flipped}.${mac}`)).toBeUndefined()
    expect(cursors.open(binding, `${text}.AAAA`)).toBeUndefined()
    expect(cursors.open(binding, `${text}.`)).toBeUndefined()
    expect(createDiagnosticsCursors().open(binding, cursor)).toBeUndefined()
    expect(cursors.open(binding, text)).toBeUndefined()
    expect(cursors.open(binding, `${cursor}.extra`)).toBeUndefined()
    expect(cursors.open(binding, '')).toBeUndefined()
  })

  it('answers undefined for a well-signed payload of another tenant or session, one that is not an object, or one that is not JSON', () => {
    const cursors = createDiagnosticsCursors(key)
    const payload = { ...binding, ...state }
    expect(cursors.open({ ...binding, tenant: 'tenant-b' }, sealed(payload))).toBeUndefined()
    expect(cursors.open({ ...binding, session: 's-2' }, sealed(payload))).toBeUndefined()
    for (const other of [null, 'text', 7, [binding.tenant, binding.session]])
      expect(cursors.open(binding, sealed(other)), JSON.stringify(other)).toBeUndefined()
    const text = Buffer.from('{not json', 'utf8').toString('base64url')
    const mac = createHmac('sha256', key).update(DOMAIN).update(text).digest('base64url')
    expect(cursors.open(binding, `${text}.${mac}`)).toBeUndefined()
  })

  it.each([
    ['from', { from: 7 }],
    ['from', { from: undefined }],
    ['upper', { upper: null }],
    ['run', { run: 3 }],
    ['pageBytes', { pageBytes: '1' }],
    ['pageBytes', { pageBytes: 0 }],
    ['pageBytes', { pageBytes: 1.5 }],
    ['pageBytes', { pageBytes: Number.MAX_SAFE_INTEGER + 2 }],
  ])('refuses a well-signed payload whose %s is malformed: %j', (_field, patch) => {
    const cursors = createDiagnosticsCursors(key)
    expect(cursors.open(binding, sealed({ ...binding, ...state, ...patch }))).toBeUndefined()
  })
})
