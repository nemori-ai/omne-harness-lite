// The command handler pipeline (SPEC CP-01 steps 1 to 6, VM-01): recall, the early refusal, the
// material owners, the `changed` retry and its limit, unknown outcomes and the notice.
import { afterEach, describe, expect, it } from 'vitest'
import { fail } from '@omne-harness/operation-result'
import type { SessionFailure, StartedRun } from '@omne-harness/session-contract'
import {
  creation,
  operationId,
  ordinaryInput,
  succeeded,
} from '@omne-harness/session-contract/testing'
import { memoryBackend } from './fixtures/backends.ts'
import { harness, type Harness, type HarnessOptions } from './fixtures/harness.ts'

const open: Harness[] = []
afterEach(async () => {
  for (const h of open.splice(0)) await h.close()
})

async function service(options: Partial<HarnessOptions> = {}): Promise<Harness> {
  const h = await harness({ backend: memoryBackend, ...options })
  open.push(h)
  return h
}

function failureOf(answer: unknown): SessionFailure {
  expect(answer, JSON.stringify(answer)).toHaveProperty('failure')
  return (answer as { failure: SessionFailure }).failure
}

const candidate = creation().definition.candidate

async function startRun(h: Harness, name = 'start'): Promise<StartedRun> {
  return succeeded(
    await h.faces('coordinator').work.startRun({
      ...h.access(),
      operation: operationId(name),
      entry: 'interactive',
      candidate,
      instance: { owner: 'agent', id: 'instance-1' },
    }),
    'startRun',
  )
}

function finishRun(h: Harness, started: StartedRun, expected: string, name = 'finish') {
  return h.faces('coordinator').work.finishRun({
    ...h.access(),
    operation: operationId(name),
    run: started.advance.run,
    expected: expected as never,
    bounded: {
      kind: 'admission-rejected',
      input: started.first,
      rejection: started.receipt.source,
    },
  })
}

/** Moves the tail through the public port before every commit of the face operation. */
function moveTailBeforeEachCommit(h: Harness): () => number {
  let moves = 0
  h.view.onCommit(async (_input, next) => {
    moves += 1
    succeeded(
      await h.backend.transactions.commit({
        access: h.access(),
        command: {
          kind: 'accept',
          input: {
            tenant: h.access().tenant,
            session: h.access().session,
            operation: operationId(`accept-concurrent-${String(moves)}`),
            value: ordinaryInput(`concurrent-${String(moves)}`),
          },
        },
        guards: [],
      }),
      'concurrent accept',
    )
    return next()
  })
  return () => moves
}

describe('step 1: recall of a held operation', () => {
  it('the same operation and input recalls the original receipt with no material and no notice', async () => {
    const h = await service()
    await h.create()
    const first = await h.accept('one')
    const asked = h.identity.controls.asked().length
    const notices = h.notifier.controls.notifications().length
    h.view.reset()
    const again = succeeded(
      await h.faces('intake').work.accept({
        ...h.access(),
        operation: operationId('accept-one'),
        value: ordinaryInput('one'),
      }),
      'recall',
    )
    expect(again).toEqual({ ...first, recovered: true })
    expect(h.view.calls().map(call => call.method)).toEqual(['queryOperation', 'commit'])
    expect(h.identity.controls.asked().length).toBe(asked)
    expect(h.notifier.controls.notifications().length).toBe(notices)
  })

  it('the same operation with another input is a conflict and commits nothing', async () => {
    const h = await service()
    await h.create()
    await h.accept('one')
    const before = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    const answer = await h.faces('intake').work.accept({
      ...h.access(),
      operation: operationId('accept-one'),
      value: ordinaryInput('two'),
    })
    expect(failureOf(answer)).toEqual({ kind: 'conflict', operation: operationId('accept-one') })
    const after = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(after.revision).toBe(before.revision)
  })
})

describe('step 3: a refusal that the snapshot decides', () => {
  it('a second startRun on an active Run is run-active before any material is prepared or committed', async () => {
    const h = await service()
    await h.create()
    await h.accept('input-1')
    await startRun(h)
    const asked = h.identity.controls.asked().length
    h.view.reset()
    const second = await h.faces('coordinator').work.startRun({
      ...h.access(),
      operation: operationId('start-again'),
      entry: 'interactive',
      candidate,
      instance: { owner: 'agent', id: 'instance-1' },
    })
    expect(failureOf(second)).toEqual({ kind: 'run-active' })
    expect(h.identity.controls.asked().length).toBe(asked)
    expect(h.view.calls().map(call => call.method)).toEqual(['queryOperation', 'readWork'])
  })

  it('a refusal that needs material is left to the commit: startRun without the login confirmation is login-required', async () => {
    const h = await service()
    await h.create()
    await h.accept('input-1')
    h.baseEvidence.controls.loginEntry(false)
    const answer = await h.faces('coordinator').work.startRun({
      ...h.access(),
      operation: operationId('start'),
      entry: 'interactive',
      candidate,
      instance: { owner: 'agent', id: 'instance-1' },
    })
    expect(failureOf(answer)).toEqual({ kind: 'login-required' })
    expect(h.view.calls().map(call => call.method)).toContain('commit')
  })
})

describe('step 4: material owners', () => {
  it('a refusing identity bridge is passed on with its own owner, and nothing is committed', async () => {
    const h = await service()
    await h.create()
    h.identity.controls.script('unavailable')
    h.view.reset()
    const answer = await h.faces('intake').work.accept({
      ...h.access(),
      operation: operationId('accept-x'),
      value: ordinaryInput('x'),
    })
    expect(failureOf(answer)).toMatchObject({ kind: 'unavailable', owner: 'identity' })
    expect(h.view.calls().map(call => call.method)).not.toContain('commit')
  })

  it('a throwing bridge answers unavailable of its service key, never a success', async () => {
    const h = await service()
    await h.create()
    h.setIdentityThrows(true)
    const answer = await h.faces('intake').work.accept({
      ...h.access(),
      operation: operationId('accept-x'),
      value: ordinaryInput('x'),
    })
    expect(failureOf(answer)).toMatchObject({ kind: 'unavailable', owner: 'sessionIdentity' })
  })

  it('the evidence bridge is asked only by the commands that need it: a down bridge refuses startRun, not accept', async () => {
    const h = await service()
    await h.create()
    h.baseEvidence.controls.unavailable(true)
    const before = h.evidence.calls()
    await h.accept('input-1')
    expect(h.evidence.calls()).toBe(before)
    const answer = await h.faces('coordinator').work.startRun({
      ...h.access(),
      operation: operationId('start'),
      entry: 'interactive',
      candidate,
      instance: { owner: 'agent', id: 'instance-1' },
    })
    expect(failureOf(answer)).toMatchObject({ kind: 'unavailable', owner: 'evidence' })
  })

  it('accept of an ordinary input needs the slot list: absent is unavailable, a non-empty list is not orchestrated, empty runs no slot', async () => {
    const h = await service({ admission: null })
    await h.create()
    const accept = (name: string) =>
      h.faces('intake').work.accept({
        ...h.access(),
        operation: operationId(name),
        value: ordinaryInput(name),
      })
    expect(failureOf(await accept('a'))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
    })
    h.setAdmission([
      {
        name: 'slot',
        run: () => Promise.reject(new Error('not called')),
      },
    ])
    expect(failureOf(await accept('b'))).toMatchObject({
      kind: 'unavailable',
      owner: 'sessionAdmission',
    })
    h.setAdmission([])
    expect(await accept('c')).toHaveProperty('ok')
    const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(snapshot.pending).toHaveLength(1)
  })
})

describe('step 5: the commit', () => {
  it('a stale expected of the caller answers changed with no commit, and no redo takes it over', async () => {
    const h = await service({ policy: { command: { retriesOnChanged: 2 } } })
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    const stale = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    // Another writer moves the tail before the caller acts on its old revision.
    await h.accept('input-2')
    const current = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(current.revision).not.toBe(stale.revision)
    h.view.reset()
    const answer = await finishRun(h, started, stale.revision)
    expect(failureOf(answer)).toEqual({ kind: 'changed', revision: current.revision })
    expect(h.view.calls().filter(call => call.method === 'commit')).toHaveLength(0)
    expect(h.view.calls().filter(call => call.method === 'readWork')).toHaveLength(1)
    const after = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(after.revision).toBe(current.revision)
    expect(after.run.kind).toBe('active')
  })

  it('the revision the caller holds is committed as it is: a tail moved after the read reaches the caller as changed, with no redo', async () => {
    const h = await service({ policy: { command: { retriesOnChanged: 2 } } })
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    const moves = moveTailBeforeEachCommit(h)
    h.view.reset()
    const answer = await finishRun(h, started, snapshot.revision)
    expect(failureOf(answer)).toMatchObject({ kind: 'changed' })
    expect(moves()).toBe(1)
    expect(h.view.calls().filter(call => call.method === 'readWork')).toHaveLength(1)
    expect(h.view.calls().filter(call => call.method === 'commit')).toHaveLength(1)
    const after = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(after.run.kind).toBe('active')
  })

  it('the revision the caller holds commits as before', async () => {
    const h = await service()
    await h.create()
    await h.accept('input-1')
    const started = await startRun(h)
    const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    expect(await finishRun(h, started, snapshot.revision)).toHaveProperty('ok')
  })

  it('a command without a caller expected is redone on changed at most command.retriesOnChanged times, then changed reaches the caller', async () => {
    const h = await service({ policy: { command: { retriesOnChanged: 2 } } })
    await h.create()
    await h.accept('input-1')
    await startRun(h)
    const snapshot = succeeded(await h.backend.transactions.readWork(h.access()), 'read')
    if (snapshot.run.kind !== 'active') throw new Error('the run is not active')
    const { execution } = snapshot.run.execution
    h.view.onCommit(() =>
      Promise.resolve(fail({ kind: 'changed' as const, revision: '1' as never })),
    )
    h.view.reset()
    const asked = h.checks.count()
    const answer = await h.faces('coordinator').work.commitDerived({
      ...h.access(),
      operation: operationId('compact'),
      participation: {
        execution,
        operation: 'compact',
        joint: 'context-transition',
        written: '1',
        handover: h.baseEvidence,
      },
      judgment: h.baseEvidence,
      value: { kind: 'compaction' },
    } as never)
    expect(failureOf(answer)).toMatchObject({ kind: 'changed' })
    const methods = h.view.calls().map(call => call.method)
    expect(methods.filter(method => method === 'commit')).toHaveLength(3)
    // Every redo reads the authoritative snapshot again through the same view, and no redo asks
    // for a second access decision.
    expect(methods.filter(method => method === 'readWork')).toHaveLength(3)
    expect(h.checks.count() - asked).toBe(1)
  })

  it('a command without expected never meets changed: a moved tail is decided again inside the commit', async () => {
    const h = await service()
    await h.create()
    moveTailBeforeEachCommit(h)
    h.view.reset()
    succeeded(
      await h.faces('intake').work.accept({
        ...h.access(),
        operation: operationId('accept-x'),
        value: ordinaryInput('x'),
      }),
      'accept',
    )
    expect(h.view.calls().filter(call => call.method === 'commit')).toHaveLength(1)
  })

  it('commit-unknown is passed on as it is, with no notice', async () => {
    const h = await service()
    await h.create()
    const notices = h.notifier.controls.notifications().length
    h.view.onCommit(async (input, next) => {
      await next()
      return fail({ kind: 'commit-unknown' as const, operation: input.command.input.operation })
    })
    const answer = await h.faces('intake').work.accept({
      ...h.access(),
      operation: operationId('accept-x'),
      value: ordinaryInput('x'),
    })
    expect(failureOf(answer)).toEqual({
      kind: 'commit-unknown',
      operation: operationId('accept-x'),
    })
    expect(h.notifier.controls.notifications().length).toBe(notices)
  })

  it('a commit that throws leaves the outcome unknown', async () => {
    const h = await service()
    await h.create()
    h.view.onCommit(() => Promise.reject(new Error('connection lost')))
    const answer = await h.faces('intake').work.accept({
      ...h.access(),
      operation: operationId('accept-x'),
      value: ordinaryInput('x'),
    })
    expect(failureOf(answer)).toEqual({
      kind: 'commit-unknown',
      operation: operationId('accept-x'),
    })
  })

  it('stopCall of a Tool target is unsupported, with no lookup and no material (contract 控制与模型选择)', async () => {
    const h = await service()
    await h.create()
    const asked = h.identity.controls.asked().length
    h.view.reset()
    const answer = await h.faces('intake').work.stopCall({
      ...h.access(),
      operation: operationId('stop-tool'),
      producer: { kind: 'tool', call: 'call-1' } as never,
    })
    expect(failureOf(answer)).toEqual({ kind: 'unsupported' })
    expect(h.view.calls().map(call => call.method)).toEqual(['commit'])
    expect(h.identity.controls.asked().length).toBe(asked)
  })
})

describe('step 6: the notice after a durable commit', () => {
  it('carries the tenant, session, revision, source and the event kinds of that commit', async () => {
    const h = await service()
    const created = await h.create()
    const accepted = await h.accept('one')
    await new Promise(resolve => setImmediate(resolve))
    const notices = h.notifier.controls.notifications()
    expect(notices.map(notice => notice.revision)).toEqual([created.revision, accepted.revision])
    const last = notices.at(-1)
    expect(last?.source).toEqual(accepted.source)
    expect(last?.kinds).toContain('intake.routed')
    expect(last?.session).toBe(h.access().session)
  })

  it('an absent notifier changes no answer', async () => {
    const h = await service({ notifier: false })
    await h.create()
    expect((await h.accept('one')).recovered).toBe(false)
    expect(h.notifier.controls.notifications()).toEqual([])
  })

  it('a notifier that fails changes no answer', async () => {
    const h = await service()
    await h.create()
    h.notifier.committed = () => Promise.reject(new Error('bus down'))
    expect((await h.accept('one')).recovered).toBe(false)
  })
})

describe('close', () => {
  it('after close every face answers unavailable of session, and nothing reaches the store', async () => {
    const h = await service()
    await h.create()
    await h.instance.close()
    h.view.reset()
    const before = h.checks.count()
    expect(failureOf(await h.faces('coordinator').work.readWork(h.access()))).toMatchObject({
      kind: 'unavailable',
      owner: 'session',
    })
    expect(
      failureOf(
        await h.faces('intake').work.accept({
          ...h.access(),
          operation: operationId('accept-late'),
          value: ordinaryInput('late'),
        }),
      ),
    ).toMatchObject({ kind: 'unavailable', owner: 'session' })
    expect(h.checks.count()).toBe(before)
    expect(h.view.calls()).toEqual([])
  })
})
