import { afterEach, describe, expect, it } from 'vitest'
import {
  sourceRequestIdentities,
  type IntakeSubject,
  type SessionFailure,
} from '@omne-harness/session-contract'
import {
  TESTING_SOURCES,
  TESTING_SYSTEM_COMPONENT,
  creation,
  evidence,
  operationId,
  ordinaryInput,
  succeeded,
  testingDerivedInputs,
  testingInputSources,
} from '@omne-harness/session-contract/testing'
import { memoryBackendWith } from './fixtures/backends.ts'
import { harness, TENANT_A } from './fixtures/harness.ts'

type Harness = Awaited<ReturnType<typeof harness>>
const open: Harness[] = []
afterEach(async () => {
  await Promise.all(open.splice(0).map(h => h.close()))
})

const MEMBER: IntakeSubject = { kind: 'member' }
const SYSTEM: IntakeSubject = { kind: 'system', component: TESTING_SYSTEM_COMPONENT }

// The backend admits strictly: an input needs the subject kind the access check gives.
async function service() {
  const registry = testingInputSources()
  let registered = true
  const h = await harness({
    backend: memoryBackendWith({
      subjects: 'strict',
      sources: { lookup: name => (registered ? registry.lookup(name) : { kind: 'absent' }) },
      derived: testingDerivedInputs(registry),
    }),
  })
  open.push(h)
  const allowedAs = (subject: IntakeSubject | null) =>
    h.checks.script({
      kind: 'allowed',
      evidence: evidence('access/intake'),
      ...(subject === null ? {} : { subject }),
    })
  const accept = (name: string, value = ordinaryInput(name), operation = `accept-${name}`) =>
    h.faces('intake').work.accept({ ...h.access(), operation: operationId(operation), value })
  const work = async () => succeeded(await h.backend.transactions.readWork(h.access()), 'read')
  return {
    h,
    work,
    allowedAs,
    accept,
    withdrawSources: () => {
      registered = false
    },
  }
}

function failureOf(answer: unknown): SessionFailure {
  expect(answer, JSON.stringify(answer)).toHaveProperty('failure')
  return (answer as { failure: SessionFailure }).failure
}

const reminder = (name: string, source = TESTING_SOURCES.system) => {
  const input = ordinaryInput(name)
  return {
    ...input,
    source,
    message: { ...input.message, role: 'system_reminder' },
  } as typeof input
}

describe('an intake needs the subject kind of the access decision (SE-28, SE-31)', () => {
  it('a source that accepts the member, sent by a system subject, is refused and writes nothing', async () => {
    const s = await service()
    await s.h.create()
    s.allowedAs(SYSTEM)
    expect(failureOf(await s.accept('as-person'))).toEqual({
      kind: 'invalid',
      field: 'value.source',
      reason: 'subject-not-accepted',
    })
    expect((await s.work()).pending).toEqual([])
  })

  it('a decision that names no subject kind admits no input: the answer is unavailable', async () => {
    const s = await service()
    await s.h.create()
    s.allowedAs(null)
    expect(failureOf(await s.accept('no-subject'))).toMatchObject({
      kind: 'unavailable',
      owner: 'session-intake',
    })
    expect((await s.work()).pending).toEqual([])
  })

  it('a system subject sends a system reminder through its own source, and never a user message', async () => {
    const s = await service()
    await s.h.create()
    s.allowedAs(SYSTEM)
    const forged = { ...ordinaryInput('forged'), source: TESTING_SOURCES.system }
    expect(failureOf(await s.accept('forged', forged))).toMatchObject({
      kind: 'invalid',
      field: 'value.message.role',
    })
    s.allowedAs(SYSTEM)
    succeeded(await s.accept('system-1', reminder('system-1')), 'a system input')
    expect((await s.work()).pending).toHaveLength(1)
  })

  it('the initial input of a creation needs the subject kind as well', async () => {
    const s = await service()
    const create = () =>
      s.h.faces('intake').management.create({
        ...s.h.access(),
        operation: operationId('create-with-initial'),
        creation: creation({ initial: ordinaryInput('initial') }),
      })
    s.allowedAs(null)
    expect(failureOf(await create())).toMatchObject({ kind: 'unavailable' })
    s.allowedAs(MEMBER)
    succeeded(await create(), 'create with an initial input')
    expect((await s.work()).pending).toEqual(['initial'])
  })
})

describe('a source that is withdrawn leaves what was accepted (SE-29)', () => {
  it('a new input is unavailable, the accepted request is recalled, and the pending input still starts a Run', async () => {
    const s = await service()
    await s.h.create()
    s.allowedAs(MEMBER)
    const first = succeeded(await s.accept('kept'), 'accept')
    s.withdrawSources()
    s.allowedAs(MEMBER)
    expect(failureOf(await s.accept('new'))).toMatchObject({
      kind: 'unavailable',
      owner: 'session-intake',
    })
    s.allowedAs(MEMBER)
    const again = succeeded(await s.accept('kept'), 'the same request again')
    expect(again).toMatchObject({ operation: first.operation, recovered: true })
    expect((await s.work()).pending).toEqual(['kept'])
    const started = succeeded(
      await s.h.faces('coordinator').work.startRun({
        ...s.h.access(),
        operation: operationId('start'),
        entry: 'interactive',
        candidate: creation().definition.candidate,
        instance: { owner: 'agent', id: 'instance-1' },
      }),
      'startRun',
    )
    expect(started.initial).toEqual(['kept'])
  })

  it('recall comes before the source is looked at: the registry is not asked for an accepted request', async () => {
    const s = await service()
    await s.h.create()
    s.allowedAs(MEMBER)
    succeeded(await s.accept('kept'), 'accept')
    s.withdrawSources()
    // No subject either: a recall needs neither the source nor the subject kind.
    s.allowedAs(null)
    expect(succeeded(await s.accept('kept'), 'recall')).toMatchObject({ recovered: true })
  })
})

describe('another domain creates a session and sends inputs with the same operations (SE-32, I-12)', () => {
  const request = (name: string) =>
    sourceRequestIdentities({ tenant: TENANT_A, source: TESTING_SOURCES.system, request: name })

  async function creator() {
    const s = await service()
    const ids = request('job-7/run-1')
    const initial = { ...reminder('seed'), input: ids.input }
    const create = () => {
      s.allowedAs(SYSTEM)
      return s.h.faces('intake').management.create({
        ...s.h.access(ids.session),
        operation: ids.create,
        creation: creation({ initial }),
      })
    }
    const work = async () =>
      succeeded(await s.h.backend.transactions.readWork(s.h.access(ids.session)), 'read')
    return { ...s, ids, create, work }
  }

  it('the same request identity gives the same session and one input, the second time as a recall', async () => {
    const c = await creator()
    const first = succeeded(await c.create(), 'create')
    const again = succeeded(await c.create(), 'the same request again')
    expect(first.receipt.recovered).toBe(false)
    expect(again.receipt).toEqual({ ...first.receipt, recovered: true })
    const work = await c.work()
    expect(work.session).toBe(c.ids.session)
    expect(work.pending).toEqual([c.ids.input])
  })

  it('the session and its initial input stand in one commit: one revision holds both', async () => {
    const c = await creator()
    const created = succeeded(await c.create(), 'create')
    const work = await c.work()
    expect(work.revision).toBe(created.receipt.revision)
    expect(work.pending).toEqual([c.ids.input])
  })

  it('a commit that does not land leaves neither the session nor the input', async () => {
    const c = await creator()
    c.h.view.onCommit(async () => ({
      failure: { kind: 'unavailable', owner: 'store', diagnostic: 'down' },
    }))
    expect(failureOf(await c.create())).toMatchObject({ kind: 'unavailable' })
    c.h.view.onCommit(null)
    expect(await c.h.backend.transactions.readWork(c.h.access(c.ids.session))).toMatchObject({
      failure: { kind: 'denied' },
    })
    succeeded(await c.create(), 'the request again')
    expect((await c.work()).pending).toEqual([c.ids.input])
  })

  it('an input to an archived session is refused: it is not queued and the session is not restored', async () => {
    const s = await service()
    await s.h.create()
    succeeded(
      await s.h.faces('maintainer').work.control({
        ...s.h.access(),
        operation: operationId('archive'),
        intent: { kind: 'archive' },
      }),
      'archive',
    )
    const ids = sourceRequestIdentities({
      tenant: TENANT_A,
      source: TESTING_SOURCES.system,
      request: 'note-1',
      session: s.h.access().session,
    })
    s.allowedAs(SYSTEM)
    const sent = await s.h.faces('intake').work.accept({
      ...s.h.access(),
      operation: ids.accept,
      value: { ...reminder('note'), input: ids.input },
    })
    expect(failureOf(sent)).toEqual({ kind: 'archived' })
    const work = await s.work()
    expect(work.lifecycle).toBe('archived')
    expect(work.pending).toEqual([])
  })
})
