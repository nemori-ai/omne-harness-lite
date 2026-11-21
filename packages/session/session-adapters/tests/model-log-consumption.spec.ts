import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it } from 'vitest'
import {
  decodeActionId,
  type AgentJournal,
  type AgentJournalEntries,
  type AgentMaterials,
  type Material,
  type PendingCall,
  type ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  sampleReceivedModelAccount,
  sampleReceivedModelResult,
} from '@omne-harness/agent-contract/testing'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed } from '@omne-harness/operation-result'
import type { WorkSnapshot } from '@omne-harness/session-contract'
import type { SessionFaces, SessionTransactionPort } from '@omne-harness/session-contract'
import { memoryOtherAccess } from '@omne-harness/session-contract/testing'
import {
  SessionService,
  sessionTransactionsKey,
} from '@omne-harness/session-cordis-contract/cordis'
import { createSessionModelLogConsumptionPlugin } from '../src/cordis/model-log-consumption.ts'
import { evidence, ok, operation, operationId, scene } from './fixtures/common-journal.ts'
import { SCHEMA, materialOf, type Draft } from './fixtures/model-delivery.ts'
import { textOf } from './fixtures/tool-delivery.ts'

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

function entriesKinds(s: ModelScene): string[] {
  return s.backend.controls
    .entriesOf(s.access.tenant, s.access.session)
    .filter(entry => entry.origin.via === 'same-log-entries')
    .map(entry => entry.kind)
}

type Wraps = Partial<{
  load: AgentJournal<string>['load']
  acknowledge: AgentJournal<string>['acknowledge']
  entries: AgentJournalEntries<string>['read']
  read: AgentMaterials<string, ContentBlock>['read']
  commitEntries: SessionTransactionPort<string>['commitEntries']
  /** What the work read answers, given what the store holds. */
  work: (snapshot: WorkSnapshot) => WorkSnapshot
  call: SessionTransactionPort<string>['readCall']
}>
const ALL = ['Session', 'Journal', 'Materials', 'Transactions'] as const

async function assembled(
  s: ModelScene,
  wraps: Wraps = {},
  mountOnly: readonly (typeof ALL)[number][] = ALL,
) {
  const ctx = new Context()
  const logged: { type: string; text: string }[] = []
  ctx.logger.exporter({
    levels: { default: 2 },
    export: message => logged.push({ type: message.type, text: String(message.args[0]) }),
  })
  const callers: unknown[] = []
  const commits: Parameters<SessionTransactionPort<string>['commitEntries']>[0][] = []
  const reads = { work: 0, load: 0, material: 0 }
  const work = {
    readWork: (access: Parameters<SessionTransactionPort<string>['readWork']>[0]) => {
      reads.work += 1
      return s.backend.transactions
        .readWork(access)
        .then(answer =>
          'ok' in answer && wraps.work !== undefined ? succeed(wraps.work(answer.ok)) : answer,
        )
    },
    readCall: (input: Parameters<SessionTransactionPort<string>['readCall']>[0]) =>
      (wraps.call ?? s.backend.transactions.readCall)(input),
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
    readonly acknowledge: AgentJournal<string>['acknowledge'] = input =>
      (wraps.acknowledge ?? s.view.journal.acknowledge)(input)
  }
  class Entries extends Service {
    constructor(scope: Context) {
      super(scope, agentJournalEntriesKey)
    }
    readonly read: AgentJournalEntries<string>['read'] = input =>
      (wraps.entries ?? s.view.entries.read)(input)
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
  await mount(ctx, Entries)
  const consumption = createSessionModelLogConsumptionPlugin<string>({
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
    logged,
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
    expect(f.commits).toHaveLength(1)
    const [item] = f.commits[0]!.observation.items
    const stored = ok(
      await s.view.entries.read({ ...s.access, execution: s.execution, after: null, limit: 100 }),
    ).items.map(listed => listed.entry)
    expect(item?.fact).toEqual(stored.find(entry => entry.kind === 'received')?.material)
    expect(item?.interpretation.map(part => part.kind)).toEqual(['execution', 'account'])
    expect(item?.interpretation[0]).toMatchObject({
      producer: { kind: 'model', call: s.result.delivery.key.reference },
    })
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

describe('after a commit', () => {
  // The Session as it reads once the Run ended and no call is held: it has received all.
  const receivedEverything = (snapshot: WorkSnapshot): WorkSnapshot => {
    if (snapshot.run.kind !== 'active') return snapshot
    const { run, execution } = snapshot.run
    return {
      ...snapshot,
      run: { kind: 'none' } as WorkSnapshot['run'],
      executions: [{ run, execution, terminal: {} as never }],
      consumptions: [],
    }
  }

  it('acknowledges the execution through the consumption position once the Session received all of it', async () => {
    const s = await modelScene('acknowledge')
    await receive(s, s.result, 'result')
    const acknowledged: string[] = []
    let through = ''
    const f = await assembled(s, {
      work: snapshot => {
        if (snapshot.run.kind === 'active') through = snapshot.run.execution.readThrough
        return receivedEverything(snapshot)
      },
      load: async input => {
        const loaded = await s.view.journal.load(input)
        return 'ok' in loaded
          ? succeed({
              ...loaded.ok,
              output: { emittedThrough: through, acknowledgedThrough: null },
            })
          : loaded
      },
      acknowledge: async input => {
        acknowledged.push(input.through)
        return fail({ kind: 'unavailable', owner: 'test', diagnostic: 'recorded only' })
      },
    })

    expect(ok(await f.consume()).committed).toBe(true)
    expect(acknowledged).toEqual([through])
    expect(ok(await f.consume()).committed).toBe(false)
    expect(acknowledged).toEqual([through])
  })
})

describe('a call that left the work snapshot', () => {
  // The snapshot the adapter reads holds no call: Session answers the binding of the producer by its own read.
  const left = (snapshot: WorkSnapshot): WorkSnapshot => ({
    ...snapshot,
    consumptions: [],
    callRegistrations: [],
  })

  it('its result and a later account delivery are still interpreted: the binding is asked from Session', async () => {
    const s = await modelScene('left')
    await receive(s, s.result, 'result')
    const f = await assembled(s, { work: left })
    expect(ok(await f.consume())).toMatchObject({ committed: true, progress: { through: '1' } })
    await receive(s, sampleReceivedModelAccount(s.access.tenant, s.name, '1'), 'account')
    expect(ok(await f.consume())).toMatchObject({ committed: true, progress: { through: '2' } })
    expect(entriesKinds(s).slice(3)).toEqual(['account.linked', 'entries.interpreted'])
  })

  it('a binding that Session cannot read answers its failure: the result is not taken for one of an unbound call', async () => {
    const s = await modelScene('unread')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      call: async () =>
        fail({ kind: 'unavailable', owner: 'session', diagnostic: 'the store is down' }),
    })
    expect(await f.consume()).toMatchObject({
      failure: { kind: 'unavailable', diagnostic: 'the store is down' },
    })
    expect(f.commits).toHaveLength(0)
  })
})

describe('trigger: the event of the Journal plugin wakes the consumption', () => {
  const settle = () => new Promise<void>(resolve => setTimeout(resolve, 50))
  const published = (f: Awaited<ReturnType<typeof assembled>>, s: ModelScene) =>
    f.ctx.parallel(
      'session-adapters/agent-published',
      s.access.tenant,
      s.access.session,
      s.execution,
    )

  it('a received write followed by the event is consumed once, with no call to consume', async () => {
    const s = await modelScene('trigger')
    const f = await assembled(s)
    await receive(s, s.result, 'trigger')
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(1)
    expect(await progressOf(s)).toMatchObject({ through: '1', execution: s.execution })
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(1)
  })

  it('a failure of the triggered consumption is logged when it appears and when it changes, not on every event', async () => {
    const s = await modelScene('trigger-warn')
    const wraps: Wraps = {
      entries: async () =>
        fail({ kind: 'unavailable', owner: 'agentJournalEntries', diagnostic: 'down' }),
    }
    const f = await assembled(s, wraps)
    const warned = () => f.logged.filter(line => line.type === 'warn').map(line => line.text)
    await receive(s, s.result, 'trigger-warn')
    await published(f, s)
    await published(f, s)
    await settle()
    expect(warned()).toEqual([`the consumption of ${s.execution} answered unavailable: down`])
    wraps.entries = async () =>
      fail({ kind: 'unavailable', owner: 'agentJournalEntries', diagnostic: 'gone' })
    await published(f, s)
    await settle()
    expect(warned()).toHaveLength(2)
    expect(warned()[1]).toContain('gone')
    delete wraps.entries
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(1)
    wraps.entries = async () =>
      fail({ kind: 'unavailable', owner: 'agentJournalEntries', diagnostic: 'down' })
    await published(f, s)
    await published(f, s)
    await settle()
    expect(warned()).toHaveLength(3)
  })

  it('a stopped plugin does not consume after the event', async () => {
    const s = await modelScene('trigger-stopped')
    const f = await assembled(s)
    await receive(s, s.result, 'trigger-stopped')
    await f.plugin.dispose()
    await published(f, s)
    await settle()
    expect(f.commits).toHaveLength(0)
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
    // Two rounds, and the read of acknowledgeReceived after the commit.
    expect(f.reads.work).toBe(3)
  })
})

describe('failures stay failures and commit nothing', () => {
  it('an entries read that fails answers unavailable, not an empty channel', async () => {
    const s = await modelScene('no-entries')
    await receive(s, s.result, 'result')
    const f = await assembled(s, {
      entries: async () =>
        fail({ kind: 'unavailable', owner: 'agentJournalEntries', diagnostic: 'down' }),
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
      entries: async input => {
        const read = await s.view.entries.read(input)
        if ('failure' in read) return read
        return succeed({
          ...read.ok,
          items: read.ok.items.map(({ sequence, entry }) => ({
            sequence,
            entry: entry.kind === 'received' ? { ...entry, consumption: other } : entry,
          })),
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
      entries: async input => {
        const read = await s.view.entries.read(input)
        if ('failure' in read) return read
        return succeed({
          ...read.ok,
          items: read.ok.items.map(({ sequence, entry }) => ({
            sequence,
            entry:
              entry.kind === 'received'
                ? { ...entry, consumer: { ...entry.consumer, position: 'elsewhere' } }
                : entry,
          })),
        })
      },
    })

    expect(await f.consume()).toMatchObject({
      failure: { kind: 'invalid', field: 'entries[0].consumer' },
    })
    expect(f.commits).toHaveLength(0)
  })

  it('a saved position the Journal does not hold answers unavailable', async () => {
    const s = await modelScene('progress-ahead')
    await receive(s, s.result, 'result')
    let ahead = false
    const f = await assembled(s, {
      entries: input => s.view.entries.read(ahead ? { ...input, after: '9' } : input),
    })
    ok(await f.consume())
    ahead = true

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

describe('a round reads only the entries after the saved position', () => {
  async function lastRoundReads(prefix: number) {
    const s = await modelScene(`position-${prefix}`)
    await receive(s, s.result, 'result')
    const read: number[] = []
    const f = await assembled(s, {
      entries: async input => {
        const page = await s.view.entries.read(input)
        if ('ok' in page) read.push(page.ok.items.length)
        return page
      },
    })
    ok(await f.consume())
    for (let at = 1; at <= prefix; at += 1) {
      await receive(s, sampleReceivedModelAccount(s.access.tenant, s.name, String(at)), `a${at}`)
      ok(await f.consume())
    }
    await receive(
      s,
      sampleReceivedModelAccount(s.access.tenant, s.name, String(prefix + 1)),
      'last',
    )
    read.length = 0
    const answer = ok(await f.consume())
    expect(answer).toMatchObject({ committed: true, progress: { through: String(prefix + 2) } })
    return read.reduce((sum, items) => sum + items, 0)
  }

  it('the entries read by one round stay the same at three history lengths', async () => {
    const tiers = [await lastRoundReads(4), await lastRoundReads(16), await lastRoundReads(48)]

    expect(tiers).toEqual([1, 1, 1])
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
