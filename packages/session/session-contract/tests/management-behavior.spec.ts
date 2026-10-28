import { describe, expect, it } from 'vitest'
import { judgeMessage } from '@omne-harness/message'
import {
  decide,
  reduce,
  judgeCompletion,
  type IdleObservation,
  type BatchId,
  type ConsumptionId,
  type SessionRevision,
  type EntryId,
} from '@omne-harness/session-contract'
import {
  adoption,
  creation,
  createMemorySessionTransactions,
  memoryAccess,
  evidence,
  operationId,
  inputId,
  ordinaryInput,
  succeeded,
  refused,
  sessionId,
} from '@omne-harness/session-contract/testing'
import { scene, open, participation } from './scene.ts'

const binding = {
  producer: { kind: 'model', call: 'model-call' },
  action: 'action',
  consumer: { owner: 'session', work: 'work', position: 'position', purpose: 'action' },
  request: evidence('request'),
  initiatingAttempt: null,
} as const
const result = {
  producer: binding.producer,
  version: '1',
  delivery: null,
  source: evidence('result'),
}

async function processed() {
  const s = await open()
  const { run, advance } = await s.active()
  succeeded(
    await s.commit({
      kind: 'receive',
      input: {
        ...s.base,
        operation: operationId('hand'),
        fact: {
          kind: 'input-handover',
          execution: run.execution.execution,
          input: inputId('first'),
          result: { kind: 'accepted', receipt: evidence('hand') },
        },
      },
    }),
    'hand',
  )
  const consumption = 'model-consumption' as ConsumptionId
  succeeded(
    await s.port.controls.project(
      {
        ...s.base,
        run: run.run,
        execution: run.execution.execution,
        revision: '2',
        sequence: '1',
        source: evidence('taken'),
        consequences: [
          {
            kind: 'input-taken',
            batch: {
              id: 'batch' as BatchId,
              ordered: [inputId('first')],
              watermark: evidence('watermark'),
            },
          },
          {
            kind: 'call',
            consumption,
            binding: { ...binding, initiatingAttempt: advance.attempt },
          },
        ],
      },
      operationId('read-call'),
    ),
    'project',
  )
  succeeded(
    await s.commit({
      kind: 'completeConsumption',
      input: {
        ...s.base,
        operation: operationId('processed'),
        participation: participation(run.execution.execution, 'processed'),
        completion: {
          consumption,
          result,
          completion: evidence('processed'),
        },
      },
    }),
    'processed',
  )
  return { ...s, consumption }
}

describe('management and derived history behavior', () => {
  it('environment mode writes its setting in the same batch and keeps other modes independent', async () => {
    const s = scene()
    await s.create()
    const before = await s.read()
    succeeded(
      await s.commit({
        kind: 'change',
        input: {
          ...s.base,
          operation: operationId('environment'),
          declaration: {
            kind: 'environment-mode',
            value: adoption('sandbox'),
            setting: evidence('setting'),
            authorization: evidence('human'),
          },
        },
      }),
      'change',
    )
    const after = await s.read()
    const rows = s.port.controls
      .entriesOf(s.base.tenant, s.base.session)
      .filter(row => row.revision === after.revision)
    expect(rows.map(row => row.kind)).toEqual([
      'session.mode-changed',
      'session.declaration-adopted',
    ])
    expect(after.revisions.declarations).toBe(String(BigInt(before.revisions.declarations) + 1n))
    expect(after.changes).toHaveLength(1)
    expect(after.creation).toEqual(before.creation)
  })
  it('interrupt admits urgent work but does not claim the Run has stopped; agent-exit does not release advance', async () => {
    const s = await open()
    const before = await s.active()
    succeeded(
      await s.commit({
        kind: 'interrupt',
        input: {
          ...s.base,
          operation: operationId('interrupt'),
          run: before.run.run,
          urgent: ordinaryInput('urgent'),
          decision: evidence('human'),
        },
      }),
      'interrupt',
    )
    expect(await s.read()).toMatchObject({
      pending: ['first', 'urgent'],
      run: { kind: 'active', advance: before.advance },
      controls: [{ state: 'propagating' }],
    })
    succeeded(
      await s.commit({
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId('exit'),
          fact: { kind: 'agent-exit', advance: before.advance, source: evidence('exit') },
        },
      }),
      'exit',
    )
    expect((await s.active()).advance).toEqual(before.advance)
  })
  it('execution and account facts retain the original producer without claiming release', async () => {
    const s = await processed()
    for (const kind of ['execution', 'account'] as const) {
      succeeded(
        await s.commit({
          kind: 'receive',
          input: {
            ...s.base,
            operation: operationId(kind),
            fact: { kind, producer: binding.producer, source: evidence(kind) },
          },
        }),
        kind,
      )
    }
    expect((await s.read()).consumptions[0]?.results[0]?.release).toBe('pending')
    expect(
      refused(
        await s.commit({
          kind: 'receive',
          input: {
            ...s.base,
            operation: operationId('unknown-producer'),
            fact: {
              kind: 'account',
              producer: { kind: 'model', call: 'unknown' },
              source: evidence('account'),
            },
          },
        }),
        'unknown',
      ).kind,
    ).toBe('invalid')
  })
  it('a cascade reply removes only the matching saved child task', async () => {
    const s = scene()
    await s.create()
    const snapshot = { ...(await s.read()), children: [sessionId('child-1'), sessionId('child-2')] }
    const command = {
      kind: 'control',
      input: { ...s.base, operation: operationId('archive'), intent: { kind: 'archive' } },
    } as const
    const decision = decide(snapshot, command, [], null, { compaction: null })
    if (decision.kind !== 'entries') throw new Error('archive refused')
    const archived = reduce(snapshot, {
      revision: String(BigInt(snapshot.revision) + 1n) as SessionRevision,
      entries: decision.entries.map((row, i) => ({
        ...row,
        id: String(i + 100) as EntryId,
        revision: String(BigInt(snapshot.revision) + 1n) as SessionRevision,
      })),
    })
    if (archived.kind !== 'reduced') throw new Error('archive quarantined')
    const task = archived.snapshot.tasks.find(item => item.kind === 'cascade')
    if (task?.kind !== 'cascade') throw new Error('missing cascade')
    const received = decide(
      archived.snapshot,
      {
        kind: 'receive',
        input: {
          ...s.base,
          operation: operationId('cascade-reply'),
          fact: {
            kind: 'cascade',
            child: task.child,
            childOperation: task.childOperation,
            source: evidence('child-confirmed'),
          },
        },
      },
      [],
      null,
      { compaction: null },
    )
    if (received.kind !== 'entries') throw new Error('cascade refused')
    const revision = String(BigInt(archived.snapshot.revision) + 1n) as SessionRevision
    const reconciled = reduce(archived.snapshot, {
      revision,
      entries: received.entries.map((row, i) => ({
        ...row,
        id: String(i + 200) as EntryId,
        revision,
      })),
    })
    if (reconciled.kind !== 'reduced') throw new Error('cascade quarantined')
    expect(reconciled.snapshot.tasks.filter(item => item.kind === 'cascade')).toMatchObject([
      { child: 'child-2' },
    ])
  })
  it('confirmed continuous idle can archive, while stale evidence cannot', async () => {
    const s = scene()
    await s.create()
    succeeded(
      await s.commit({
        kind: 'configureAutoArchive',
        input: {
          ...s.base,
          operation: operationId('policy'),
          policy: { kind: 'enabled', idleMs: '10' },
        },
      }),
      'policy',
    )
    const observation: IdleObservation = {
      kind: 'interval',
      started: '0',
      through: { at: '10', protocol: adoption('clock'), source: evidence('clock') },
      elapsedMs: '10',
      coverage: {
        own: evidence('own'),
        relations: evidence('relations'),
        children: [],
        calls: [],
        completeScope: evidence('scope'),
      },
      source: evidence('idle'),
    }
    succeeded(
      await s.commit({
        kind: 'recordIdle',
        input: {
          ...s.base,
          operation: operationId('idle'),
          expected: (await s.read()).revision,
          observation,
        },
      }),
      'idle',
    )
    expect(
      refused(
        await s.commit({
          kind: 'considerAutoArchive',
          input: { ...s.base, operation: operationId('stale'), idleEvidence: evidence('other') },
        }),
        'stale',
      ).kind,
    ).toBe('changed')
    const idle = (await s.read()).idle
    if (idle === null) throw new Error('idle missing')
    succeeded(
      await s.commit({
        kind: 'considerAutoArchive',
        input: { ...s.base, operation: operationId('due'), idleEvidence: idle.commit },
      }),
      'due',
    )
    expect((await s.read()).lifecycle).toBe('archived')
  })
  it('successive compactions change epoch without reviving summarized messages or losing a later suffix', async () => {
    const s = await processed()
    const { run } = await s.active()
    const original = succeeded(
      await s.port.history.readModelView({
        ...s.access,
        basis: null,
        after: null,
        pageBytes: 10000,
      }),
      'view',
    )
    if (original.kind !== 'page') throw new Error('page missing')
    const compact = async (name: string, through?: string) => {
      const history = s.port.controls.entriesOf(s.base.tenant, s.base.session)
      const candidate = judgeMessage({
        id: 'msg_abcdefghijklmnopqrstuv',
        role: 'compaction',
        blocks: [
          { kind: 'text', id: name, visibility: { toHuman: true, toModel: true }, text: name },
        ],
        covers: { from: history[0]?.id, to: through ?? history.at(-1)?.id },
        retained: [],
        derivation: evidence(name),
      })
      if (!('ok' in candidate) || candidate.ok.role !== 'compaction') throw new Error('bad message')
      return succeeded(
        await s.commit({
          kind: 'commitDerived',
          input: {
            ...s.base,
            operation: operationId(name),
            participation: participation(run.execution.execution, 'context-transition'),
            judgment: evidence(name),
            value: { kind: 'compaction', message: candidate.ok },
          },
        }),
        'compact',
      )
    }
    const through = s.port.controls.entriesOf(s.base.tenant, s.base.session).at(-1)?.id
    const reminder = judgeMessage({
      id: 'msg_abcdefghijklmnopqrstuv',
      role: 'system_reminder',
      blocks: [
        {
          kind: 'text',
          id: 'tail',
          text: 'later context',
          visibility: { toHuman: false, toModel: true },
        },
      ],
    })
    if (!('ok' in reminder)) throw new Error('reminder invalid')
    succeeded(
      await s.commit({
        kind: 'commitDerived',
        input: {
          ...s.base,
          operation: operationId('tail'),
          expected: (await s.read()).revision,
          value: { kind: 'context-reminder', message: reminder.ok, source: evidence('tail') },
        },
      }),
      'tail',
    )
    await compact('first-summary', through)
    expect(
      succeeded(
        await s.port.history.readModelView({
          ...s.access,
          basis: null,
          after: null,
          pageBytes: 10000,
        }),
        'tail view',
      ),
    ).toMatchObject({
      kind: 'page',
      rows: [{ message: { role: 'compaction' } }, { message: { role: 'system_reminder' } }],
    })
    expect(
      succeeded(
        await s.port.history.readModelView({
          ...s.access,
          basis: original.basis,
          after: null,
          pageBytes: 10000,
        }),
        'epoch',
      ),
    ).toMatchObject({ kind: 'epoch-changed' })
    await compact('second-summary')
    const view = succeeded(
      await s.port.history.readModelView({
        ...s.access,
        basis: null,
        after: null,
        pageBytes: 10000,
      }),
      'new view',
    )
    expect(view).toMatchObject({
      kind: 'page',
      rows: [{ message: { role: 'compaction', blocks: [{ text: 'second-summary' }] } }],
    })
  })
  it('a historical cancelled execution stays cancelled after its successor starts', async () => {
    const s = await open()
    const { run } = await s.active()
    succeeded(
      await s.commit({
        kind: 'control',
        input: {
          ...s.base,
          operation: operationId('cancel'),
          intent: { kind: 'cancel-run', run: run.run, urgency: 'graceful' },
        },
      }),
      'cancel',
    )
    await s.start('successor')
    expect(judgeCompletion(await s.read(), run.execution.execution).kind).toBe('cancelled')
    expect(judgeCompletion(await s.read(), 'never-bound').kind).toBe('allowed')
  })
})

it('failed initialization blocks start and freeze until the same required item becomes ready', async () => {
  const s = scene()
  const initial = creation({ requiredIdentities: [{ capability: 'login', name: 'account' }] })
  await s.create(initial)
  succeeded(
    await s.commit({
      kind: 'completeInitialization',
      input: {
        ...s.base,
        operation: operationId('init-failed'),
        result: {
          item: 'account',
          owner: 'login',
          result: { kind: 'failed', diagnostic: 'no login', recovery: evidence('recovery') },
        },
      },
    }),
    'failed',
  )
  await s.accept('first')
  expect((await s.read()).lifecycle).toBe('initializing')
  const start = {
    kind: 'startRun',
    input: {
      ...s.base,
      operation: operationId('start-after-failure'),
      entry: 'interactive',
      candidate: initial.definition.candidate,
      instance: { owner: 'agent', id: 'instance' },
    },
  } as const
  expect(refused(await s.commit(start), 'start').kind).toBe('not-ready')
  expect(
    refused(
      await s.commit({
        kind: 'freeze',
        input: {
          ...s.base,
          operation: operationId('freeze-init'),
          verdict: { cause: 'tool-shape-lost', evidence: evidence('shape') },
        },
      }),
      'freeze',
    ).kind,
  ).toBe('not-ready')
  succeeded(
    await s.commit({
      kind: 'completeInitialization',
      input: {
        ...s.base,
        operation: operationId('init-ready'),
        result: {
          item: 'account',
          owner: 'login',
          result: { kind: 'ready', evidence: evidence('ready') },
        },
      },
    }),
    'ready',
  )
  expect(await s.read()).toMatchObject({ lifecycle: 'dormant', tasks: [] })
  succeeded(await s.commit(start), 'recovered start')
  expect((await s.read()).lifecycle).toBe('active')
})

it('each history page and model-view read rechecks current authorization', async () => {
  let allowed = true
  const port = createMemorySessionTransactions<string>({ authorize: () => allowed })
  const access = memoryAccess('tester')
  succeeded(
    await port.commit({
      command: {
        kind: 'create',
        input: {
          tenant: access.tenant,
          session: access.session,
          operation: operationId('create'),
          creation: creation({ initial: ordinaryInput('first') }),
        },
      },
      guards: [],
    }),
    'create',
  )
  const page = succeeded(
    await port.history.begin({
      ...access,
      kinds: [],
      from: null,
      direction: 'forward',
      pageBytes: 1,
    }),
    'page',
  )
  if (page.next === null) throw new Error('cursor missing')
  const view = succeeded(
    await port.history.readModelView({ ...access, basis: null, after: null, pageBytes: 1000 }),
    'view',
  )
  if (view.kind !== 'page') throw new Error('view missing')
  allowed = false
  expect(
    refused(await port.history.next({ ...access, cursor: page.next }), 'revoked page').kind,
  ).toBe('denied')
  expect(
    refused(
      await port.history.readModelView({
        ...access,
        basis: view.basis,
        after: null,
        pageBytes: 1000,
      }),
      'revoked view',
    ).kind,
  ).toBe('denied')
})

it('a derived reminder is visible only at its committed revision', async () => {
  const s = scene()
  await s.create()
  const message = judgeMessage({
    id: 'msg_abcdefghijklmnopqrstuv',
    role: 'system_reminder',
    blocks: [
      {
        kind: 'text',
        id: 'text',
        text: 'updated context',
        visibility: { toHuman: false, toModel: true },
      },
    ],
  })
  if (!('ok' in message)) throw new Error('message invalid')
  const before = await s.read()
  succeeded(
    await s.commit({
      kind: 'commitDerived',
      input: {
        ...s.base,
        operation: operationId('reminder'),
        expected: before.revision,
        value: { kind: 'context-reminder', message: message.ok, source: evidence('context') },
      },
    }),
    'reminder',
  )
  expect(
    succeeded(
      await s.port.history.readModelView({
        ...s.access,
        basis: null,
        after: null,
        pageBytes: 10000,
      }),
      'view',
    ),
  ).toMatchObject({ kind: 'page', rows: [{ message: { role: 'system_reminder' } }] })
  expect(
    refused(
      await s.commit({
        kind: 'commitDerived',
        input: {
          ...s.base,
          operation: operationId('stale-reminder'),
          expected: before.revision,
          value: { kind: 'context-reminder', message: message.ok, source: evidence('context') },
        },
      }),
      'stale',
    ).kind,
  ).toBe('changed')
})
