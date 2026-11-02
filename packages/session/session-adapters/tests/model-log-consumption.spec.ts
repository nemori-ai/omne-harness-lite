// AD-05 on real Cordis 4.0.4: the Model log consumption plugin. Session and the Agent Journal are
// the `./testing` memory provider of this member; the plugin reaches them only through the four
// injected services. What is checked: a Model `received` entry of the same Journal becomes one
// entries-channel Session batch (`call.execution-fact`, `account.linked` when an account was
// reported, and the progress row), read as `coordinator`; a second read commits nothing; a lost
// reply is recognized under the original operation; entries absent, a missing or untrusted
// material and a binding that disagrees with Session fail without a commit; an entry whose call
// Session has not bound waits; another tenant is denied; a failed commit keeps the Agent facts and
// the progress; the plugin is pending while a dependency is absent and answers unavailable after it
// stops, also to a call that was waiting when it stopped.
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeActionId,
  type AgentJournal,
  type AgentMaterials,
  type Material,
  type PendingCall,
  type ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
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
import { createSessionModelLogConsumptionPlugin } from '../src/cordis/model-log-consumption.ts'
import { evidence, ok, operation, operationId, scene } from './fixtures/common-journal.ts'

// --- the Model material of the Agent result receiver (Agent J02 item 11) -------------------------

/** The adoption the Agent result receiver writes its Model facts material under. */
const SCHEMA = {
  owner: 'agent',
  name: 'received-model-delivery',
  revision: '1',
  digest: 'agent:received-model-delivery/1',
}
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

function textOf(tenant: TenantId): string {
  const encoded = tenantCodec.encode(tenant)
  if (!encoded.ok) throw new Error('fixture: tenant')
  return encoded.value
}

/** The full Model delivery that the receiver kept for one `received` draft. */
function deliveryOf(draft: Draft): Record<string, unknown> {
  const { delivery } = draft
  if (delivery.producer !== 'model') throw new Error('fixture: a Model entry')
  return 'accounts' in delivery
    ? {
        kind: 'result',
        key: delivery.key,
        consumer: draft.consumer,
        settlement: {
          version: delivery.key.result,
          termination: { kind: 'completed' },
          cursor: { kind: 'end' },
          source: evidence('settlement'),
        },
        parts: [],
        accounts: delivery.accounts,
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

// --- the scene -----------------------------------------------------------------------------------

/**
 * One session with an open execution that waits on one Model call. With `bind`, Session has
 * interpreted the waiting event, so it holds the call's producer binding.
 */
async function modelScene(name: string, bind = true) {
  const s = await scene(name)
  const result = sampleReceivedModelResult(s.access.tenant, name)
  if (result.delivery.producer !== 'model') throw new Error('fixture: a Model entry')
  const pending: Extract<PendingCall, { kind: 'model' }> = {
    kind: 'model',
    purpose: 'main',
    action: ok(decodeActionId('action')),
    reference: result.delivery.key.reference,
    consumption: result.consumption,
    position: result.consumer,
    fixed: evidence('request'),
  }
  const waits = [{ kind: 'producer' as const, pending }]
  ok(
    await s.view.journal.commit({
      ...s.access,
      execution: s.execution,
      operation: operation('pending'),
      authority: s.opened.authority,
      expected: s.opened.receipt.revision,
      checkpoint: { ...s.checkpoint, calls: [pending] },
      state: { kind: 'waiting', waits },
      events: [{ kind: 'waiting', waits }],
      effects: [{ pending, action: pending.action, authority: s.opened.authority }],
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
  return { ...s, name, result, bindCall }
}
type ModelScene = Awaited<ReturnType<typeof modelScene>>

/** The Agent result receiver saves one Model delivery: entry, material and saved in one commit. */
async function receive(s: ModelScene, entry: ReceivedEntry, label: string) {
  const { material: _material, ...draft } = entry
  const received = s.view.received
  if (received === null) throw new Error('fixture: the provider serves received commits')
  return ok(
    await received.commit({
      ...s.access,
      execution: s.execution,
      operation: operation(`receive-${label}`),
      entry: draft,
      material: materialOf(s.access.tenant, draft),
    }),
  )
}

/** The Session rows that the entries channel wrote, by kind. */
function entriesKinds(s: ModelScene): string[] {
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

/**
 * A real Cordis root with the four dependencies of AD-05 over the scene's memory provider, and the
 * plugin. `wraps` replace one dependency call; `mount` limits the dependencies that are present.
 */
async function assembled(
  s: ModelScene,
  wraps: Wraps = {},
  mountOnly: readonly (typeof ALL)[number][] = ALL,
) {
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
  const consumption = createSessionModelLogConsumptionPlugin<string>({
    // The assembly issues the coordinator principal of a session; the scene has one principal.
    coordinator: async () => succeed(s.access.principal),
  })
  const plugin = await mount(ctx, consumption.plugin)
  const target = { tenant: s.access.tenant, session: s.access.session, execution: s.execution }
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

async function mount(ctx: Context, plugin: Parameters<Context['plugin']>[0]) {
  const fiber = await ctx.plugin(plugin)
  disposers.push(() => fiber.dispose())
  return fiber
}

function progressOf(s: ModelScene) {
  return s.backend.transactions
    .readWork(s.access)
    .then(work => ok(work).entriesProgress?.find(item => item.channel === 'model-received'))
}

// --- interpretation ------------------------------------------------------------------------------

describe('a Model received entry becomes one entries-channel Session batch', () => {
  it('a result with a reported account: the execution fact, the account link and the progress, read as coordinator', async () => {
    const s = await modelScene('result')
    await receive(s, s.result, 'result')
    const f = await assembled(s)

    const answer = ok(await f.consume())

    expect(answer.committed).toBe(true)
    expect(answer.waiting).toBe(0)
    expect(answer.progress?.through).toBe('1')
    expect(entriesKinds(s)).toEqual([
      'call.execution-fact',
      'account.linked',
      'entries.interpreted',
    ])
    expect(await progressOf(s)).toMatchObject({ through: '1', execution: s.execution })
    // One batch, keyed by the producer's delivery key, with the Agent entry's material as source.
    expect(f.commits).toHaveLength(1)
    const [item] = f.commits[0]!.observation.items
    const stored = ok(await s.view.journal.load({ ...s.access, execution: s.execution })).entries
    expect(item?.fact).toEqual(stored?.find(entry => entry.kind === 'received')?.material)
    expect(item?.interpretation.map(part => part.kind)).toEqual(['execution', 'account'])
    expect(item?.interpretation[0]).toMatchObject({
      producer: { kind: 'model', call: s.result.delivery.key.reference },
    })
    // Every read of `session` went through the coordinator class.
    expect(f.callers.length).toBeGreaterThan(0)
    expect(
      f.callers.every(caller => (caller as { caller?: unknown }).caller === 'coordinator'),
    ).toBe(true)
  })

  it('a result without a reported account gives no account link: no report is not zero', async () => {
    const s = await modelScene('no-account')
    const result = s.result
    if (result.delivery.producer !== 'model' || !('accounts' in result.delivery))
      throw new Error('fixture: a Model result')
    const unreported: ReceivedEntry = {
      ...result,
      delivery: {
        ...result.delivery,
        accounts: result.delivery.accounts.map(item => ({ ...item, account: null })),
      },
    }
    await receive(s, unreported, 'unreported')
    const f = await assembled(s)

    ok(await f.consume())

    expect(entriesKinds(s)).toEqual(['call.execution-fact', 'entries.interpreted'])
  })

  it('an account delivery after the result is the next item of the channel and links the account', async () => {
    const s = await modelScene('account')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    ok(await f.consume())
    await receive(s, sampleReceivedModelAccount(s.access.tenant, s.name, '1'), 'account')

    const answer = ok(await f.consume())

    expect(answer).toMatchObject({ committed: true, progress: { through: '2' } })
    expect(f.commits[1]?.observation).toMatchObject({ after: '1', through: '2' })
    expect(f.commits[1]?.start).toMatchObject({ kind: 'saved', progress: { through: '1' } })
    expect(entriesKinds(s).slice(3)).toEqual(['account.linked', 'entries.interpreted'])
  })
})

describe('reading again', () => {
  it('commits nothing, reads no material and answers the saved progress', async () => {
    const s = await modelScene('again')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    const first = ok(await f.consume())
    const materials = f.reads.material

    const second = ok(await f.consume())

    expect(second).toEqual({ progress: first.progress, committed: false, waiting: 0 })
    expect(f.commits).toHaveLength(1)
    expect(f.reads.material).toBe(materials)
  })

  it('a lost reply of the commit is recognized under the same operation; Session holds one batch', async () => {
    const s = await modelScene('lost-reply')
    await receive(s, s.result, 'result')
    let lose = true
    const f = await assembled(s, {
      commitEntries: async input => {
        const answer = await s.backend.transactions.commitEntries(input)
        if (lose && 'ok' in answer) {
          lose = false
          return fail({ kind: 'commit-unknown', operation: input.observation.operation })
        }
        return answer
      },
    })

    const answer = ok(await f.consume())

    expect(answer).toMatchObject({ committed: true, progress: { through: '1' } })
    expect(f.commits).toHaveLength(2)
    expect(f.commits[1]).toEqual(f.commits[0])
    expect(entriesKinds(s).filter(kind => kind === 'entries.interpreted')).toHaveLength(1)
  })

  it('another commit that moved the channel first: the plugin reads the progress again and goes on', async () => {
    const s = await modelScene('changed')
    await receive(s, s.result, 'result')
    let refuse = true
    const f = await assembled(s, {
      commitEntries: async input => {
        if (refuse) {
          refuse = false
          return fail({ kind: 'changed', revision: '0' as never })
        }
        return s.backend.transactions.commitEntries(input)
      },
    })

    const answer = ok(await f.consume())

    expect(answer).toMatchObject({ committed: true, progress: { through: '1' } })
    expect(f.reads.work).toBe(2)
  })
})

describe('failures stay failures and commit nothing', () => {
  it('a Journal load without entries answers unavailable, not an empty channel', async () => {
    const s = await modelScene('no-entries')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      load: async input => {
        const loaded = await s.view.journal.load(input)
        if ('failure' in loaded) return loaded
        const { entries: _entries, ...rest } = loaded.ok
        return succeed(rest)
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a material that cannot be read answers its failure', async () => {
    const s = await modelScene('lost-material')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      read: async () => fail({ kind: 'unavailable', owner: 'materials', diagnostic: 'gone' }),
    })

    expect(await f.consume()).toEqual({
      failure: { kind: 'unavailable', owner: 'materials', diagnostic: 'gone' },
    })
    expect(f.commits).toHaveLength(0)
  })

  it.each([
    [
      'another schema',
      (m: Material<ContentBlock>) => ({ ...m, schema: { ...SCHEMA, revision: '2' } }),
    ],
    ['no value', () => ({ kind: 'facts', schema: SCHEMA, value: { kind: 'null' } })],
    [
      'no delivery',
      (_m: Material<ContentBlock>, s: ModelScene, draft: Draft) =>
        materialOf(s.access.tenant, draft, value => ({ tenant: value.tenant })),
    ],
    [
      'another result version of the same call',
      (_m: Material<ContentBlock>, s: ModelScene, draft: Draft) =>
        materialOf(s.access.tenant, draft, value => {
          // Key and settlement agree with each other, so only the comparison with the entry fails.
          const delivery = value.delivery as Record<string, unknown>
          const settlement = delivery.settlement as Record<string, unknown>
          const key = { ...(delivery.key as object), result: 'mrver_other' }
          return {
            ...value,
            delivery: { ...delivery, key, settlement: { ...settlement, version: 'mrver_other' } },
          }
        }),
    ],
    [
      'another consumer',
      (_m: Material<ContentBlock>, s: ModelScene, draft: Draft) =>
        materialOf(s.access.tenant, draft, value => ({
          ...value,
          delivery: { ...(value.delivery as object), consumer: { ...draft.consumer, work: 'w' } },
        })),
    ],
    [
      'a settlement of another version',
      (_m: Material<ContentBlock>, s: ModelScene, draft: Draft) =>
        materialOf(s.access.tenant, draft, value => {
          const delivery = value.delivery as Record<string, unknown>
          const settlement = delivery.settlement as Record<string, unknown>
          return {
            ...value,
            delivery: { ...delivery, settlement: { ...settlement, version: 'x' } },
          }
        }),
    ],
    [
      'other account snapshots',
      (_m: Material<ContentBlock>, s: ModelScene, draft: Draft) =>
        materialOf(s.access.tenant, draft, value => ({
          ...value,
          delivery: { ...(value.delivery as object), accounts: [] },
        })),
    ],
  ] as const)('a material with %s is not trusted: invalid', async (_name, change) => {
    const s = await modelScene(`material-${_name.replaceAll(' ', '-')}`)
    await receive(s, s.result, 'result')
    const { material: _material, ...draft } = s.result
    const f = await assembled(s, {
      read: async input => {
        const read = await s.view.materials.read(input)
        return 'failure' in read
          ? read
          : succeed(change(read.ok, s, draft) as Material<ContentBlock>)
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'invalid' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a consumption that is not the one Session bound to the call: invalid', async () => {
    const s = await modelScene('other-consumption')
    await receive(s, s.result, 'result')
    const other = sampleReceivedModelResult(s.access.tenant, 'elsewhere').consumption
    const f = await assembled(s, {
      load: async input => {
        const loaded = await s.view.journal.load(input)
        if ('failure' in loaded || loaded.ok.entries === undefined) return loaded
        return succeed({
          ...loaded.ok,
          entries: loaded.ok.entries.map(entry =>
            entry.kind === 'received' ? { ...entry, consumption: other } : entry,
          ),
        })
      },
    })

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'invalid', field: 'entries[0].consumption' },
    })
    expect(f.commits).toHaveLength(0)
  })

  it('a consumer that is not the one Session bound to the call: invalid', async () => {
    const s = await modelScene('other-consumer')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      load: async input => {
        const loaded = await s.view.journal.load(input)
        if ('failure' in loaded || loaded.ok.entries === undefined) return loaded
        return succeed({
          ...loaded.ok,
          entries: loaded.ok.entries.map(entry =>
            entry.kind === 'received'
              ? { ...entry, consumer: { ...entry.consumer, position: 'elsewhere' } }
              : entry,
          ),
        })
      },
    })

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'invalid', field: 'entries[0].consumer' },
    })
    expect(f.commits).toHaveLength(0)
  })

  it('a saved progress past the Model entries of the Journal answers unavailable', async () => {
    const s = await modelScene('progress-ahead')
    await receive(s, s.result, 'result')
    let strip = false
    const f = await assembled(s, {
      load: async input => {
        const loaded = await s.view.journal.load(input)
        if (!strip || 'failure' in loaded) return loaded
        return succeed({ ...loaded.ok, entries: [] })
      },
    })
    ok(await f.consume())
    strip = true

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(1)
  })

  it.each([
    [{ kind: 'denied', action: 'load' } as const, { kind: 'denied', action: 'load' }],
    [{ kind: 'not-ready' } as const, { kind: 'unavailable', owner: 'agent-journal' }],
  ])('a Journal load answering %o answers %o', async (answer, expected) => {
    const s = await modelScene(`load-${answer.kind}`)
    const f = await assembled(s, { load: async () => fail(answer) })

    expect(await f.consume()).toMatchObject({ failure: expected })
    expect(f.commits).toHaveLength(0)
  })

  it('a commit that throws is unknown under its operation, not a plain failure', async () => {
    const s = await modelScene('commit-throws')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      commitEntries: async () => {
        throw new Error('the storage connection broke')
      },
    })

    const answer = await f.consume()

    expect(answer).toEqual({
      failure: { kind: 'commit-unknown', operation: f.commits[0]?.observation.operation },
    })
  })

  it('a dependency that throws before the commit answers unavailable', async () => {
    const s = await modelScene('read-throws')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      read: async () => {
        throw new Error('the material store broke')
      },
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a failed commit keeps the Agent facts and the progress; the next read commits', async () => {
    const s = await modelScene('commit-fails')
    await receive(s, s.result, 'result')
    let refuse = true
    const f = await assembled(s, {
      commitEntries: async input => {
        if (refuse) {
          refuse = false
          return fail({ kind: 'unavailable', owner: 'session-storage', diagnostic: 'down' })
        }
        return s.backend.transactions.commitEntries(input)
      },
    })
    const agent = ok(await s.view.journal.load({ ...s.access, execution: s.execution }))

    expect(await f.consume()).toEqual({
      failure: { kind: 'unavailable', owner: 'session-storage', diagnostic: 'down' },
    })
    expect(ok(await s.view.journal.load({ ...s.access, execution: s.execution }))).toEqual(agent)
    expect(await progressOf(s)).toBeUndefined()

    expect(ok(await f.consume())).toMatchObject({ committed: true, progress: { through: '1' } })
  })

  it('an execution that Session never recorded answers unavailable', async () => {
    const s = await modelScene('unknown-execution')
    await receive(s, s.result, 'result')
    const f = await assembled(s)

    expect(await f.consume({ execution: 'not-this-session' as typeof s.execution })).toMatchObject({
      failure: { kind: 'unavailable', owner: 'session-history' },
    })
    expect(f.reads.load).toBe(0)
  })
})

describe('an entry whose call Session has not bound', () => {
  it('waits: nothing is committed, and once Session binds the call the next read commits it', async () => {
    const s = await modelScene('unbound', false)
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
    const s = await modelScene('tenant')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    const other = memoryOtherAccess('intruder', s.access.session)

    const answer = await f.consume({ tenant: other.tenant })

    expect(answer).toMatchObject({ failure: { kind: 'denied' } })
    expect(f.reads.load).toBe(0)
    expect(f.commits).toHaveLength(0)
  })

  it('an entry whose call names another tenant is denied, not committed', async () => {
    const s = await modelScene('foreign-call')
    await receive(s, s.result, 'result')
    const foreign = sampleReceivedModelResult(memoryOtherAccess('x', 'y').tenant, s.name)
    const f = await assembled(s, {
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
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'denied' } })
    expect(f.commits).toHaveLength(0)
  })

  it('a material kept for another tenant is denied', async () => {
    const s = await modelScene('foreign-material')
    await receive(s, s.result, 'result')
    const { material: _material, ...draft } = s.result
    const f = await assembled(s, {
      read: async () =>
        succeed(
          materialOf(s.access.tenant, draft, value => ({
            ...value,
            tenant: textOf(memoryOtherAccess('x', 'y').tenant),
          })),
        ),
    })

    expect(await f.consume()).toMatchObject({ failure: { kind: 'denied' } })
    expect(f.commits).toHaveLength(0)
  })
})

// --- Cordis --------------------------------------------------------------------------------------

describe('loading and stopping on real Cordis 4.0.4', () => {
  it.each(ALL)('stays pending while %s is absent, and works once it arrives', async missing => {
    const s = await modelScene(`absent-${missing}`)
    await receive(s, s.result, 'result')
    const f = await assembled(
      s,
      {},
      ALL.filter(name => name !== missing),
    )

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.reads).toEqual({ work: 0, load: 0, material: 0 })

    await mount(f.ctx, f.services[missing])
    expect(ok(await f.consume())).toMatchObject({ committed: true })
  })

  it('after it stops, a call answers unavailable and reads nothing', async () => {
    const s = await modelScene('stopped')
    await receive(s, s.result, 'result')
    const f = await assembled(s)
    await f.plugin.dispose()

    expect(await f.consume()).toMatchObject({ failure: { kind: 'unavailable' } })
    expect(f.reads).toEqual({ work: 0, load: 0, material: 0 })
  })

  it('a call waiting on a read when the plugin stops answers unavailable and commits nothing', async () => {
    const s = await modelScene('stop-in-flight')
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
      read: async input => {
        reached()
        await held
        return s.view.materials.read(input)
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
})
