// AD-06 on real Cordis 4.0.4: the Tool log consumption plugin. Session and the Agent Journal are the
// `./testing` memory provider of this member; the plugin reaches them only through the four injected
// services. What is checked: a Tool `received` entry of the same Journal becomes one entries-channel
// Session batch through `receive(execution)` and `receive(account)` (`call.execution-fact`,
// `account.linked` when an account was reported, and the progress row), read as `coordinator`; a
// second read commits nothing and a lost reply is recognized under the original operation; without
// an adopted reading of the Tool delivery material (TOOL-SETTLEMENT-SCHEMA) every Tool entry answers
// unavailable and nothing is committed; an unknown schema, a missing material, entries absent, a
// binding that disagrees with Session, a material of another kind or key, a result material without
// its complete settlement and a delivery that fails Tool's own check fail without a commit; two
// independent reads derive the same operation; a late result after a terminal Run is committed under
// the original binding and left to Session; an unbound call waits; another tenant is denied; Model
// entries are not this channel; a dependency that does not answer in the configured time is
// unavailable; the plugin is pending while a dependency is absent and answers unavailable after it
// stops, except after a commit-unknown, which stays commit-unknown.
//
// The reader of the Tool delivery material is a stand-in of this test: no Agent owner has adopted
// the facts schema of a received Tool delivery yet (AGENT-M06). It decodes the envelope that the
// Agent result receiver uses for Model deliveries, `{ tenant, delivery }`, under a test schema.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  AgentJournal,
  AgentMaterials,
  Material,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  sampleReceivedModelResult,
  sampleReceivedToolAccount,
} from '@omne-harness/agent-contract/testing'
import { agentJournalKey, agentMaterialsKey } from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed } from '@omne-harness/operation-result'
import type { SessionFaces, SessionTransactionPort } from '@omne-harness/session-contract'
import { memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  SessionService,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import type { ToolDelivery } from '@omne-harness/tool-contract'
import { decodeToolResultVersion } from '@omne-harness/tool-contract/provider'
import {
  createSessionToolLogConsumptionPlugin,
  type SessionToolLogConsumptionInput,
  type ToolDeliveryReader,
} from '../src/cordis/tool-log-consumption.ts'
import { evidence, ok, operation, operationId, scene } from './fixtures/common-journal.ts'
import { cancel } from './fixtures/progression.ts'
import { toolCall } from './fixtures/tool-call.ts'

// --- the Tool delivery material ------------------------------------------------------------------

/** The schema this test keeps its Tool delivery facts under; no owner has adopted one. */
const SCHEMA = { owner: 'test', name: 'tool-delivery', revision: '1', digest: 'test:tool-delivery' }
type Json = Extract<Material<ContentBlock>, { kind: 'facts' }>['value']
type Draft = Omit<ReceivedEntry, 'material'>

function json(value: unknown): Json {
  if (value === null) return { kind: 'null' }
  if (typeof value === 'string') return { kind: 'string', value }
  if (typeof value === 'boolean') return { kind: 'boolean', value }
  if (typeof value === 'number') return { kind: 'number', lexeme: String(value) }
  if (Array.isArray(value)) return { kind: 'array', items: value.map(json) }
  if (typeof value === 'object')
    return {
      kind: 'object',
      entries: Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, member]) => ({ key, value: json(member) })),
    }
  throw new Error(`fixture: no JSON for ${typeof value}`)
}

function plain(value: Json): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number':
      return value.lexeme
    case 'array':
      return value.items.map(plain)
    case 'object':
      return Object.fromEntries(value.entries.map(entry => [entry.key, plain(entry.value)]))
  }
}

function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture: tenant')
  return encoded.value
}

/** The full Tool delivery that the receiver kept for one `received` draft. */
function deliveryOf(draft: Draft): Record<string, unknown> {
  const { delivery } = draft
  if (delivery.producer !== 'tool') throw new Error('fixture: a Tool entry')
  return delivery.key.kind === 'result'
    ? {
        kind: 'result',
        key: delivery.key,
        consumer: draft.consumer,
        delivery: 'tdel_1',
        relation: 'original',
        terminal: { kind: 'completed' },
        actualTerminal: { kind: 'completed' },
        effect: { kind: 'occurred', evidence: evidence('tool-effect') },
        source: evidence('tool-result'),
        value: { kind: 'test-result' },
        account: delivery.account,
      }
    : { kind: 'account', key: delivery.key, consumer: draft.consumer, account: delivery.account }
}

function materialOf(
  tenant: TenantId,
  draft: Draft,
  change: (value: Record<string, unknown>) => Record<string, unknown> = value => value,
): Material<ContentBlock> {
  return {
    kind: 'facts',
    schema: SCHEMA,
    value: json(change({ tenant: textOf(tenant), delivery: deliveryOf(draft) })),
  }
}

/** The stand-in reading of the test schema: the envelope, or null for any other material. */
const reader: ToolDeliveryReader = material => {
  if (material.kind !== 'facts' || material.schema.digest !== SCHEMA.digest) return null
  const value = plain(material.value) as { tenant?: unknown; delivery?: unknown }
  if (typeof value.tenant !== 'string' || typeof value.delivery !== 'object') return null
  return { tenant: value.tenant, delivery: value.delivery as ToolDelivery<ContentBlock> }
}

// --- the scene -----------------------------------------------------------------------------------

/** A Tool result entry of the call of `account`, with the account the runtime completed, or null. */
function resultEntry(account: ReceivedEntry, reported = true): ReceivedEntry {
  if (account.delivery.producer !== 'tool' || account.delivery.key.kind !== 'account')
    throw new Error('fixture: a Tool account entry')
  return {
    ...account,
    delivery: {
      producer: 'tool',
      key: {
        kind: 'result',
        producer: 'tool',
        reference: account.delivery.key.reference,
        result: ok(decodeToolResultVersion('tres_1')),
      },
      account: reported ? account.delivery.account : null,
    },
  }
}

/**
 * One session with an open execution that waits on one Tool call. With `bind`, Session has
 * interpreted the waiting event, so it holds the call's producer binding.
 */
async function toolScene(name: string, bind = true) {
  const s = await scene(name)
  const tool = toolCall(s.access.tenant, name)
  const waits = [{ kind: 'producer' as const, pending: tool.pending }]
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, calls: [tool.pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [
        { pending: tool.pending, action: tool.pending.action, authority: s.opened.authority },
      ],
      caller: { kind: 'none' },
      replyAdmission: null,
      handoff: null,
      finish: null,
    }),
  )
  const bindCall = async () =>
    ok(
      await s.backend.controls.interpret({
        ...s.access,
        execution: s.execution,
        sequence: '1',
        operation: operationId('waiting'),
      }),
    )
  if (bind) await bindCall()
  return { ...s, name, account: tool.entry, result: resultEntry(tool.entry), bindCall }
}
type ToolScene = Awaited<ReturnType<typeof toolScene>>

/** The Agent result receiver saves one delivery: entry, material and saved in one commit. */
async function receive(
  s: ToolScene,
  entry: ReceivedEntry,
  label: string,
  material?: Material<ContentBlock>,
) {
  const { material: _material, ...draft } = entry
  const received = s.view.received
  if (received === null) throw new Error('fixture: the provider serves received commits')
  return ok(
    await received.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`receive-${label}`),
      entry: draft,
      material: material ?? materialOf(s.access.tenant, draft),
    }),
  )
}

/** The Session rows that the entries channel wrote, by kind. */
function entriesKinds(s: ToolScene): string[] {
  return s.backend.controls
    .entriesOf(s.access.tenant, s.access.session)
    .filter(entry => entry.origin.via === 'same-log-entries')
    .map(entry => entry.kind)
}

type Wraps = Partial<{
  load: AgentJournal<string>['load']
  read: AgentMaterials<string, ContentBlock>['read']
  commitEntries: SessionTransactionPort<string>['commitEntries']
}>
const ALL = ['Session', 'Journal', 'Materials', 'Transactions'] as const

type Options = Readonly<{
  wraps?: Wraps
  mountOnly?: readonly (typeof ALL)[number][]
  reader?: ToolDeliveryReader | null
  config?: Readonly<{ timeoutMs?: number; retryBackoffMs?: number }>
  /** The coordinator principal of the published-event trigger; without it the plugin has no trigger. */
  coordinator?: SessionToolLogConsumptionInput['coordinator']
}>

/**
 * A real Cordis root with the four dependencies of AD-06 over the scene's memory provider, and the
 * plugin. `wraps` replace one dependency call; `mountOnly` limits the dependencies that are present.
 */
async function assembled(s: ToolScene, options: Options = {}) {
  const { wraps = {}, mountOnly = ALL } = options
  const ctx = new Context()
  const callers: unknown[] = []
  const commits: Parameters<SessionTransactionPort<string>['commitEntries']>[0][] = []
  const reads = { work: 0, load: 0, material: 0 }
  const work = {
    readWork: (access: Parameters<SessionTransactionPort<string>['readWork']>[0]) => {
      reads.work += 1
      return s.backend.transactions.readWork(access)
    },
  }
  class Session extends SessionService<unknown> {
    get work(): SessionFaces<unknown>['work'] {
      callers.push(this[Service.resolveConfig]())
      return work as unknown as SessionFaces<unknown>['work']
    }
    readonly management = {} as SessionFaces<unknown>['management']
    readonly reconciliation = {} as SessionFaces<unknown>['reconciliation']
    readonly history = {} as SessionFaces<unknown>['history']
  }
  class Journal extends Service {
    constructor(scope: Context) {
      super(scope, agentJournalKey)
    }
    readonly load: AgentJournal<string>['load'] = input => {
      reads.load += 1
      return (wraps.load ?? s.view.journal.load)(input)
    }
  }
  class Materials extends Service {
    constructor(scope: Context) {
      super(scope, agentMaterialsKey)
    }
    readonly read: AgentMaterials<string, ContentBlock>['read'] = input => {
      reads.material += 1
      return (wraps.read ?? s.view.materials.read)(input)
    }
  }
  class Transactions extends Service {
    constructor(scope: Context) {
      super(scope, sessionTransactionsKey)
    }
    readonly commitEntries: SessionTransactionPort<string>['commitEntries'] = input => {
      commits.push(input)
      return (wraps.commitEntries ?? s.backend.transactions.commitEntries)(input)
    }
  }
  const services = { Session, Journal, Materials, Transactions } as const
  for (const name of mountOnly) await mount(ctx, services[name])
  const consumption = createSessionToolLogConsumptionPlugin({
    toolDeliveries: options.reader === undefined ? reader : options.reader,
    ...(options.coordinator === undefined ? {} : { coordinator: options.coordinator }),
  })
  const plugin = await mount(ctx, consumption.plugin, options.config ?? {})
  const target = {
    principal: s.access.principal as unknown,
    tenant: s.access.tenant,
    session: s.access.session,
    execution: s.execution,
  }
  return {
    ctx,
    services,
    callers,
    commits,
    reads,
    plugin,
    consume: (other: Partial<typeof target> = {}) => consumption.consume({ ...target, ...other }),
  }
}

const disposers: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const dispose of disposers.splice(0).reverse()) await dispose()
})

async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0], config?: unknown) {
  const fiber = await ctx.plugin(plugin, config)
  disposers.push(() => fiber.dispose())
  return fiber
}

function progressOf(s: ToolScene) {
  return s.backend.transactions
    .readWork(s.access)
    .then(work => ok(work).entriesProgress?.find(item => item.channel === 'tool-received'))
}

// --- interpretation ------------------------------------------------------------------------------

describe('a Tool received entry becomes one entries-channel Session batch', () => {
  it('a result with an account: receive(execution) and receive(account), and the progress, read as coordinator', async () => {
    const s = await toolScene('result')
    await receive(s, s.result, 'result')
    const f = await assembled(s)

    const answer = ok(await f.consume())

    expect(answer).toMatchObject({ committed: true, waiting: 0, progress: { through: '1' } })
    expect(entriesKinds(s)).toEqual([
      'call.execution-fact',
      'account.linked',
      'entries.interpreted',
    ])
    expect(await progressOf(s)).toMatchObject({ through: '1', execution: s.execution })
    expect(f.commits).toHaveLength(1)
    const observation = f.commits[0]!.observation
    expect(observation.channel).toBe('tool-received')
    const [item] = observation.items
    const stored = ok(await s.view.journal.load({ ...s.access, execution: s.execution })).entries
    expect(item?.fact).toEqual(stored?.find(entry => entry.kind === 'received')?.material)
    expect(item?.interpretation).toEqual([
      {
        kind: 'execution',
        producer: { kind: 'tool', call: s.account.delivery.key.reference },
        source: item?.fact,
      },
      {
        kind: 'account',
        producer: { kind: 'tool', call: s.account.delivery.key.reference },
        source: item?.fact,
      },
    ])
    expect(f.callers.length).toBeGreaterThan(0)
    expect(
      f.callers.every(caller => (caller as { caller?: unknown }).caller === 'coordinator'),
    ).toBe(true)
  })

  it('a result without an account gives no account link: no report is not zero', async () => {
    const s = await toolScene('no-account')
    await receive(s, resultEntry(s.account, false), 'unreported')
    const f = await assembled(s)

    ok(await f.consume())

    expect(entriesKinds(s)).toEqual(['call.execution-fact', 'entries.interpreted'])
  })

  it('an account delivery after the result is the next item and links the account', async () => {
    const s = await toolScene('account')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    ok(await f.consume())
    await receive(s, s.account, 'account')

    const answer = ok(await f.consume())

    expect(answer).toMatchObject({ committed: true, progress: { through: '2' } })
    expect(f.commits[1]?.observation).toMatchObject({ after: '1', through: '2' })
    expect(f.commits[1]?.start).toMatchObject({ kind: 'saved', progress: { through: '1' } })
    expect(entriesKinds(s).slice(3)).toEqual(['account.linked', 'entries.interpreted'])
  })

  it('Model entries of the same execution are not this channel', async () => {
    const s = await toolScene('model-entry')
    const f = await assembled(s, {
      wraps: {
        load: async input => {
          const loaded = await s.view.journal.load(input)
          if ('failure' in loaded) return loaded
          const model = sampleReceivedModelResult(s.access.tenant, s.name)
          return succeed({ ...loaded.ok, entries: [...(loaded.ok.entries ?? []), model] })
        },
      },
    })

    expect(ok(await f.consume())).toEqual({ progress: null, committed: false, waiting: 0 })
    expect(f.reads.material).toBe(0)
    expect(f.commits).toHaveLength(0)
  })
})

describe('reading again is recognized', () => {
  it('commits nothing, reads no material and answers the saved progress', async () => {
    const s = await toolScene('again')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    const first = ok(await f.consume())
    const materials = f.reads.material

    const second = ok(await f.consume())

    expect(second).toEqual({ progress: first.progress, committed: false, waiting: 0 })
    expect(f.commits).toHaveLength(1)
    expect(f.reads.material).toBe(materials)
    expect(entriesKinds(s).filter(kind => kind === 'entries.interpreted')).toHaveLength(1)
  })

  it('a lost reply of the commit is recognized under the same operation; Session holds one batch', async () => {
    const s = await toolScene('lost-reply')
    await receive(s, s.result, 'result')
    let lose = true
    const f = await assembled(s, {
      wraps: {
        commitEntries: async input => {
          const answer = await s.backend.transactions.commitEntries(input)
          if (lose && 'ok' in answer) {
            lose = false
            return fail({ kind: 'commit-unknown', operation: input.observation.operation })
          }
          return answer
        },
      },
    })

    const answer = ok(await f.consume())

    expect(answer).toMatchObject({ committed: true, progress: { through: '1' } })
    expect(f.commits).toHaveLength(2)
    expect(f.commits[1]).toEqual(f.commits[0])
    expect(f.commits[0]?.observation.operation).toMatch(/^ad06_[0-9a-f]{64}$/)
    expect(entriesKinds(s).filter(kind => kind === 'entries.interpreted')).toHaveLength(1)
  })

  it('another commit that moved the channel first: the plugin reads the progress again and goes on', async () => {
    const s = await toolScene('changed')
    await receive(s, s.result, 'result')
    let refuse = true
    const f = await assembled(s, {
      wraps: {
        commitEntries: async input => {
          if (refuse) {
            refuse = false
            return fail({ kind: 'changed', revision: '0' as never })
          }
          return s.backend.transactions.commitEntries(input)
        },
      },
    })

    expect(ok(await f.consume())).toMatchObject({ committed: true, progress: { through: '1' } })
    expect(f.reads.work).toBe(2)
  })
})

describe('TOOL-SETTLEMENT-SCHEMA: without an adopted reading of the material', () => {
  it('a Tool result answers unavailable, reads no material and commits nothing', async () => {
    const s = await toolScene('unadopted')
    await receive(s, s.result, 'result')
    const f = await assembled(s, { reader: null })

    expect(await f.consume()).toMatchObject({
      failure: {
        kind: 'unavailable',
        diagnostic: expect.stringContaining('TOOL-SETTLEMENT-SCHEMA'),
      },
    })
    expect(f.reads.material).toBe(0)
    expect(f.commits).toHaveLength(0)
    expect(await progressOf(s)).toBeUndefined()
  })

  it('a Tool account delivery answers unavailable as well', async () => {
    const s = await toolScene('unadopted-account')
    await receive(s, s.account, 'account')
    const f = await assembled(s, { reader: null })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(0)
  })
})

describe('failures stay failures and commit nothing', () => {
  it('a material of another schema is unavailable, never an execution fact', async () => {
    const s = await toolScene('unknown-schema')
    const { material: _material, ...draft } = s.result
    await receive(s, s.result, 'result', {
      kind: 'facts',
      schema: { ...SCHEMA, digest: 'test:other' },
      value: json({ tenant: textOf(s.access.tenant), delivery: deliveryOf(draft) }),
    })
    const f = await assembled(s)

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a material that cannot be read keeps its failure: denied stays denied, the rest is unavailable', async () => {
    const s = await toolScene('unreadable')
    await receive(s, s.result, 'result')
    const denied = await assembled(s, {
      wraps: { read: async () => fail({ kind: 'denied', action: 'materials.read' }) },
    })
    expect(await denied.consume()).toMatchObject({ failure: { kind: 'denied' } })
    const lost = await assembled(s, {
      wraps: {
        read: async () => fail({ kind: 'unavailable', owner: 'store', diagnostic: 'gone' }),
      },
    })
    expect(await lost.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect([...denied.commits, ...lost.commits]).toHaveLength(0)
  })

  it.each([
    // A well-formed key of another result version of the same call: only the key check tells it.
    [
      'key',
      (value: Record<string, unknown>) => {
        const { key } = value.delivery as { key: Record<string, unknown> }
        return withDelivery(value, {
          key: { ...key, result: ok(decodeToolResultVersion('tres_2')) },
        })
      },
    ],
    [
      'consumer',
      (value: Record<string, unknown>) =>
        withDelivery(value, { consumer: { owner: 'x', work: 'x', position: 'x', purpose: 'x' } }),
    ],
    ['account', (value: Record<string, unknown>) => withDelivery(value, { account: null })],
  ])('a material that holds another %s than the entry is invalid', async (_field, change) => {
    const s = await toolScene(`other-${_field}`)
    await receive(s, s.result, 'result')
    const { material: _material, ...draft } = s.result
    const f = await assembled(s, {
      wraps: { read: async () => succeed(materialOf(s.access.tenant, draft, change)) },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'invalid' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a material kept for another tenant is denied', async () => {
    const s = await toolScene('foreign-material')
    await receive(s, s.result, 'result')
    const { material: _material, ...draft } = s.result
    const f = await assembled(s, {
      wraps: {
        read: async () =>
          succeed(
            materialOf(s.access.tenant, draft, value => ({
              ...value,
              tenant: textOf(memoryOtherAccess('x', 'y').tenant),
            })),
          ),
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'denied' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a Journal load without entries answers unavailable, not an empty channel', async () => {
    const s = await toolScene('no-entries')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      wraps: {
        load: async input => {
          const loaded = await s.view.journal.load(input)
          if ('failure' in loaded) return loaded
          const { entries: _entries, ...rest } = loaded.ok
          return succeed(rest)
        },
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a binding of another consumption is invalid', async () => {
    const s = await toolScene('binding')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      wraps: {
        load: async input => {
          const loaded = await s.view.journal.load(input)
          if ('failure' in loaded || loaded.ok.entries === undefined) return loaded
          return succeed({
            ...loaded.ok,
            entries: loaded.ok.entries.map(entry =>
              entry.kind === 'received'
                ? { ...entry, consumption: 'other-consumption' as typeof entry.consumption }
                : entry,
            ),
          })
        },
      },
    })

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'invalid', field: expect.stringContaining('consumption') },
    })
    expect(f.commits).toHaveLength(0)
  })

  it('an execution no Run of the session started is unavailable and loads nothing', async () => {
    const s = await toolScene('foreign-execution')
    const f = await assembled(s)

    expect(await f.consume({ execution: 'not-this-session' as typeof s.execution })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-history' },
    })
    expect(f.reads.load).toBe(0)
  })

  it('a commit that throws is commit-unknown, and the progress does not move', async () => {
    const s = await toolScene('throws')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      wraps: {
        commitEntries: async () => {
          throw new Error('store went away')
        },
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'commit-unknown' } })
    expect(await progressOf(s)).toBeUndefined()
  })
})

function withDelivery(value: Record<string, unknown>, change: Record<string, unknown>) {
  return { ...value, delivery: { ...(value.delivery as Record<string, unknown>), ...change } }
}

/**
 * Wraps that show the plugin `entry` changed by `change`, both in the Journal load and in the
 * material it reads, so that only the plugin's own checks of the entry can refuse it.
 */
function changedEntry(
  s: ToolScene,
  entry: ReceivedEntry,
  change: (entry: ReceivedEntry) => ReceivedEntry,
): Wraps {
  const { material: _material, ...draft } = change(entry)
  return {
    load: async input => {
      const loaded = await s.view.journal.load(input)
      if ('failure' in loaded || loaded.ok.entries === undefined) return loaded
      return succeed({
        ...loaded.ok,
        entries: loaded.ok.entries.map(item =>
          item.kind === 'received' ? { ...change(item), material: item.material } : item,
        ),
      })
    },
    read: async () => succeed(materialOf(s.access.tenant, draft)),
  }
}

describe('the material check: what the entry does not name is never an execution fact', () => {
  it.each(['terminal', 'actualTerminal', 'effect'])(
    'a result material without %s holds no complete settlement: unavailable, nothing committed',
    async field => {
      const s = await toolScene(`unsettled-${field}`)
      const { material: _material, ...draft } = s.result
      await receive(
        s,
        s.result,
        'result',
        materialOf(s.access.tenant, draft, value => {
          const { [field]: _dropped, ...delivery } = value.delivery as Record<string, unknown>
          return { ...value, delivery }
        }),
      )
      const f = await assembled(s)

      expect(await f.consume()).toMatchObject({
        failure: { kind: 'unavailable', diagnostic: expect.stringContaining('settlement') },
      })
      expect(f.commits).toHaveLength(0)
      expect(entriesKinds(s)).toEqual([])
    },
  )

  it('an account entry whose material holds a settled result delivery is invalid', async () => {
    const s = await toolScene('other-kind')
    const { material: _material, ...draft } = s.account
    const { material: _result, ...resultDraft } = s.result
    const {
      key: _key,
      consumer: _consumer,
      account: _account,
      ...settled
    } = deliveryOf(resultDraft)
    await receive(
      s,
      s.account,
      'account',
      materialOf(s.access.tenant, draft, value => withDelivery(value, settled)),
    )
    const f = await assembled(s)

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'invalid', reason: 'the material holds another delivery kind' },
    })
    expect(f.commits).toHaveLength(0)
  })

  it('an entry whose consumer is not the one Session bound to the call is invalid, though its consumption is', async () => {
    const s = await toolScene('binding-consumer')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      wraps: changedEntry(s, s.result, entry => ({
        ...entry,
        consumer: { ...entry.consumer, position: 'pos-other' },
      })),
    })

    expect(await f.consume()).toEqual({
      failure: {
        kind: 'invalid',
        field: 'entries[0].consumer',
        reason: 'not the consumer Session bound to the call',
      },
    })
    expect(f.commits).toHaveLength(0)
  })

  it.each([
    [
      'an account of another call',
      'call-mismatch',
      (s: ToolScene) => s.result,
      (entry: ReceivedEntry): ReceivedEntry => {
        const { delivery } = entry
        if (delivery.producer !== 'tool' || delivery.account === null)
          throw new Error('fixture: a Tool delivery with an account')
        const subject = { ...delivery.account.subject, id: 'tcall_other' }
        return { ...entry, delivery: { ...delivery, account: { ...delivery.account, subject } } }
      },
    ],
    [
      'an account delivery whose key names another revision than its account',
      'revision-mismatch',
      (s: ToolScene) => s.account,
      (entry: ReceivedEntry): ReceivedEntry => {
        const { delivery } = entry
        if (delivery.producer !== 'tool' || delivery.key.kind !== 'account' || !delivery.account)
          throw new Error('fixture: a Tool account delivery')
        const key = { ...delivery.key, revision: '1' }
        return { ...entry, delivery: { producer: 'tool', key, account: delivery.account } }
      },
    ],
  ])('%s fails the Tool delivery check and is invalid', async (_case, reason, pick, change) => {
    const s = await toolScene(`judged-${reason}`)
    const entry = pick(s)
    await receive(s, entry, 'delivery')
    const f = await assembled(s, { wraps: changedEntry(s, entry, change) })

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'invalid', reason: expect.stringContaining(reason) },
    })
    expect(f.commits).toHaveLength(0)
  })
})

describe('the operation identity', () => {
  it('two independent reads of the same entries derive the same operation', async () => {
    const s = await toolScene('same-operation')
    await receive(s, s.result, 'result')
    const lost = await assembled(s, {
      wraps: {
        commitEntries: async () => {
          throw new Error('store went away')
        },
      },
    })
    expect(await lost.consume()).toMatchObject({ failure: { kind: 'commit-unknown' } })

    const next = await assembled(s)
    expect(ok(await next.consume())).toMatchObject({ committed: true })

    expect(next.commits[0]?.observation).not.toBe(lost.commits[0]?.observation)
    expect(next.commits[0]?.observation.operation).toBe(lost.commits[0]?.observation.operation)
  })
})

describe('a result that arrives after its Run is terminal (EC-08)', () => {
  it('is committed under the original consumption binding; what it means for the ended Run is Session’s', async () => {
    const s = await toolScene('late')
    const before = ok(await s.backend.transactions.readWork(s.access))
    if (before.run.kind !== 'active') throw new Error('fixture: an active Run')
    const run = before.run.run
    ok(await cancel(s))
    const { material: _material, ...draft } = s.result
    await receive(
      s,
      s.result,
      'late',
      materialOf(s.access.tenant, draft, value => withDelivery(value, { relation: 'late' })),
    )
    const f = await assembled(s)

    expect(ok(await f.consume())).toMatchObject({ committed: true, progress: { through: '1' } })

    const observation = f.commits[0]!.observation
    expect(observation.run).toBe(run)
    const call = { kind: 'tool', call: s.account.delivery.key.reference }
    expect(observation.items[0]?.interpretation).toMatchObject([
      { kind: 'execution', producer: call },
      { kind: 'account', producer: call },
    ])
    const after = ok(await s.backend.transactions.readWork(s.access))
    expect(after.run).toMatchObject({ kind: 'terminal', terminal: { run } })
    expect(after.consumptions.map(item => item.binding)).toEqual(
      before.consumptions.map(item => item.binding),
    )
    expect(entriesKinds(s)).toEqual([
      'call.execution-fact',
      'account.linked',
      'entries.interpreted',
    ])
  })
})

describe('an entry whose call Session has not bound', () => {
  it('waits: nothing is committed, and once Session binds the call the next read commits it', async () => {
    const s = await toolScene('unbound', false)
    await receive(s, s.result, 'result')
    const f = await assembled(s)

    expect(ok(await f.consume())).toEqual({ progress: null, committed: false, waiting: 1 })
    expect(f.commits).toHaveLength(0)

    await s.bindCall()
    expect(ok(await f.consume())).toMatchObject({ committed: true, waiting: 0 })
  })
})

describe('another tenant', () => {
  it('a target of another tenant is denied and reads no Agent record', async () => {
    const s = await toolScene('tenant')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    const other = memoryOtherAccess('intruder', s.access.session)

    expect(await f.consume({ tenant: other.tenant })).toMatchObject({
      failure: { kind: 'denied' },
    })
    expect(f.reads.load).toBe(0)
  })

  it('an entry whose call names another tenant is denied, not committed', async () => {
    const s = await toolScene('foreign-call')
    await receive(s, s.result, 'result')
    const foreign = sampleReceivedToolAccount(memoryOtherAccess('x', 'y').tenant, s.name)
    const f = await assembled(s, {
      wraps: {
        load: async input => {
          const loaded = await s.view.journal.load(input)
          if ('failure' in loaded || loaded.ok.entries === undefined) return loaded
          return succeed({
            ...loaded.ok,
            entries: loaded.ok.entries.map(entry =>
              entry.kind === 'received' ? { ...entry, delivery: foreign.delivery } : entry,
            ),
          })
        },
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'denied' } })
    expect(f.commits).toHaveLength(0)
  })
})

// --- configuration and Cordis --------------------------------------------------------------------

describe('the configured timeout', () => {
  it('a load that does not answer in time is unavailable and commits nothing', async () => {
    const s = await toolScene('timeout')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      config: { timeoutMs: 20 },
      wraps: { load: () => new Promise(() => {}) },
    })

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: expect.stringContaining('20 ms') },
    })
    expect(f.commits).toHaveLength(0)
  })

  it('a commit that does not answer in time is commit-unknown, not a plain failure', async () => {
    const s = await toolScene('commit-timeout')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      config: { timeoutMs: 20 },
      wraps: { commitEntries: () => new Promise(() => {}) },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'commit-unknown' } })
  })

  it('refuses a configuration that is not a positive timeout and a non-negative backoff', async () => {
    const plugin = createSessionToolLogConsumptionPlugin({ toolDeliveries: reader }).plugin
    const validate = plugin.Config['~standard'].validate
    expect(validate({ timeoutMs: 0 })).toMatchObject({ issues: [{ path: ['timeoutMs'] }] })
    expect(validate({ retryBackoffMs: -1 })).toMatchObject({
      issues: [{ path: ['retryBackoffMs'] }],
    })
    expect(validate(undefined)).toEqual({ value: {} })
    expect(validate({ timeoutMs: 5, retryBackoffMs: 0 })).toEqual({
      value: { timeoutMs: 5, retryBackoffMs: 0 },
    })
  })
})

describe('AD-06 trigger: the event of the Journal plugin wakes the consumption', () => {
  /** Lets the not-awaited dispatch of an event and the queued consumption finish. */
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))
  const coordinator = (s: ToolScene): SessionToolLogConsumptionInput['coordinator'] => {
    return async () => succeed(s.access.principal as unknown)
  }
  /** What the Journal plugin sends after a successful write; the memory Journal does not. */
  const published = (f: Awaited<ReturnType<typeof assembled>>, s: ToolScene) =>
    f.ctx.parallel(
      'session-adapters/agent-published',
      s.access.tenant,
      s.access.session,
      s.execution,
    )

  it('a received write followed by the event is consumed once, with no call to consume', async () => {
    const s = await toolScene('trigger')
    const f = await assembled(s, { coordinator: coordinator(s) })
    await receive(s, s.result, 'trigger')
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(1)
    expect(await progressOf(s)).toMatchObject({ through: '1', execution: s.execution })
    expect(entriesKinds(s)).toEqual(['call.execution-fact', 'account.linked', 'entries.interpreted'])
  })

  it('the same event again commits nothing more', async () => {
    const s = await toolScene('trigger-again')
    const f = await assembled(s, { coordinator: coordinator(s) })
    await receive(s, s.result, 'trigger-again')
    await published(f, s)
    await settle()
    await published(f, s)
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(1)
    expect(entriesKinds(s)).toHaveLength(3)
  })

  it('a stopped plugin does not consume after the event', async () => {
    const s = await toolScene('trigger-stopped')
    const f = await assembled(s, { coordinator: coordinator(s) })
    await receive(s, s.result, 'trigger-stopped')
    await f.plugin.dispose()
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(0)
  })

  it('an event whose work is under way when the plugin stops commits nothing', async () => {
    const s = await toolScene('trigger-in-flight')
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    let asked!: () => void
    const wasAsked = new Promise<void>(resolve => {
      asked = resolve
    })
    const f = await assembled(s, {
      coordinator: async () => {
        asked()
        await held
        return succeed(s.access.principal as unknown)
      },
    })
    await receive(s, s.result, 'trigger-in-flight')
    await published(f, s)
    await wasAsked
    await f.plugin.dispose()
    release()
    await settle()
    expect(f.commits).toHaveLength(0)
    expect(entriesKinds(s)).toEqual([])
  })

  it('a plugin given no coordinator has no trigger', async () => {
    const s = await toolScene('trigger-none')
    const f = await assembled(s)
    await receive(s, s.result, 'trigger-none')
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(0)
  })

  it('a coordinator that refuses the principal commits nothing and reads no Agent record', async () => {
    const s = await toolScene('trigger-refused')
    const f = await assembled(s, {
      coordinator: async () => fail({ kind: 'denied', action: 'coordinator-principal' }),
    })
    await receive(s, s.result, 'trigger-refused')
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(0)
    expect(f.reads).toEqual({ work: 0, load: 0, material: 0 })
  })
})

describe('loading and stopping on real Cordis 4.0.4', () => {
  it.each(ALL)('stays pending while %s is absent, and works once it arrives', async missing => {
    const s = await toolScene(`absent-${missing}`)
    await receive(s, s.result, 'result')
    const f = await assembled(s, { mountOnly: ALL.filter(name => name !== missing) })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.reads).toEqual({ work: 0, load: 0, material: 0 })

    await mount(f.ctx, f.services[missing])
    expect(ok(await f.consume())).toMatchObject({ committed: true })
  })

  it('after it stops, a call answers unavailable and reads nothing', async () => {
    const s = await toolScene('stopped')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    await f.plugin.dispose()

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.reads).toEqual({ work: 0, load: 0, material: 0 })
  })

  it('a call waiting on a read when the plugin stops answers unavailable and commits nothing', async () => {
    const s = await toolScene('stop-in-flight')
    await receive(s, s.result, 'result')
    let release!: () => void
    const held = new Promise<void>(resolve => {
      release = resolve
    })
    let reached!: () => void
    const reading = new Promise<void>(resolve => {
      reached = resolve
    })
    const f = await assembled(s, {
      wraps: {
        read: async input => {
          reached()
          await held
          return s.view.materials.read(input)
        },
      },
    })

    const answer = f.consume()
    await reading
    await f.plugin.dispose()
    release()

    expect(await answer).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(0)
    expect(await progressOf(s)).toBeUndefined()
  })

  it('stopping in the backoff after a commit-unknown answers commit-unknown: the commit may have landed', async () => {
    const s = await toolScene('stop-after-unknown')
    await receive(s, s.result, 'result')
    let stop!: () => Promise<unknown>
    const f = await assembled(s, {
      wraps: {
        // The commit lands, its reply is lost, and the plugin stops before it sends again.
        commitEntries: async input => {
          ok(await s.backend.transactions.commitEntries(input))
          await stop()
          return fail({ kind: 'commit-unknown', operation: input.observation.operation })
        },
      },
    })
    stop = () => f.plugin.dispose()

    const answer = await f.consume()

    expect(answer).toEqual({
      failure: { kind: 'commit-unknown', operation: f.commits[0]?.observation.operation },
    })
    expect(f.commits).toHaveLength(1)
    expect(await progressOf(s)).toMatchObject({ through: '1' })
  })
})
