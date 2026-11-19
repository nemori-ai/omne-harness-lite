import { describe, expect, it } from 'vitest'
import {
  inputSourceName,
  type IntakeSubject,
  type SessionCommand,
} from '@omne-harness/session-contract'
import {
  TESTING_SOURCES,
  TESTING_SYSTEM_COMPONENT,
  createMemoryInitializationSource,
  createMemorySessionHistorySource,
  createMemorySessionTransactions,
  createPolicySessionAccessCheck,
  creation,
  evidence,
  refused,
  memoryAccess,
  operationId,
  ordinaryInput,
  succeeded,
  testingDerivedInputs,
  testingInputSources,
} from '@omne-harness/session-contract/testing'
import { decodeEntry, type SessionEntry } from '../src/entries.ts'
import { initializationGuards } from './initialization-fixture.ts'

const access = memoryAccess('sources-test')
const base = { tenant: access.tenant, session: access.session }
const SYSTEM: IntakeSubject = { kind: 'system', component: TESTING_SYSTEM_COMPONENT }
const MEMBER: IntakeSubject = { kind: 'member' }

type Initial = ReturnType<typeof ordinaryInput> | null

function reminderInput(name: string, source = TESTING_SOURCES.system) {
  const input = ordinaryInput(name)
  return {
    ...input,
    source,
    message: { ...input.message, role: 'system_reminder' },
  } as typeof input
}

async function scene(options: Readonly<{ initial?: Initial; maxPendingInputs?: number }> = {}) {
  const initialization = createMemoryInitializationSource()
  const registry = testingInputSources()
  let subject: IntakeSubject | undefined = MEMBER
  let sources: typeof registry | null = registry
  const port = createMemorySessionTransactions({
    initialization,
    history: createMemorySessionHistorySource(),
    accessCheck: createPolicySessionAccessCheck(() => ({
      kind: 'allowed',
      evidence: evidence('access'),
      ...(subject ? { subject } : {}),
    })),
    subjects: 'strict',
    intakeLimits: { maxPendingInputs: options.maxPendingInputs ?? 8, maxInputBytes: 4096 },
    sources: { lookup: name => (sources === null ? { kind: 'absent' } : sources.lookup(name)) },
    derived: testingDerivedInputs(registry),
  })
  const command = {
    kind: 'create',
    input: {
      ...base,
      operation: operationId('create'),
      creation: creation({ initial: options.initial ?? null }),
    },
  } satisfies SessionCommand
  const guards = initializationGuards(command, null)
  initialization.controls.register(command, guards[0]!)
  const prepared = succeeded(await initialization.prepare(command), 'prepare')
  const create = () => port.commit({ access, command, guards: prepared })
  const accept = (name: string, value = ordinaryInput(name)) =>
    port.commit({
      access,
      guards: [],
      command: { kind: 'accept', input: { ...base, operation: operationId(name), value } },
    })
  const rows = () => port.controls.entriesOf(base.tenant, base.session)
  const entries = (...kinds: readonly SessionEntry['kind'][]): SessionEntry[] =>
    rows()
      .filter(row => kinds.some(kind => kind === row.kind))
      .map(row => {
        const decoded = decodeEntry(row)
        if (!('ok' in decoded)) throw new Error(JSON.stringify(decoded))
        return decoded.ok
      })
  const routed = () => entries('intake.routed')
  return {
    port,
    create,
    accept,
    rows,
    entries,
    routed,
    registry,
    as: (next: IntakeSubject | undefined) => {
      subject = next
    },
    withdrawRegistry: () => {
      sources = null
    },
    read: async () => succeeded(await port.readWork(access), 'readWork'),
  }
}

describe('the values of an input are fixed by the writer from the source and the subject (SE-28)', () => {
  it("a member's input is a user message that wakes, enters by the login and counts", async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    succeeded(await s.accept('person-1'), 'accept')
    expect(s.routed()[0]).toMatchObject({
      source: {
        name: TESTING_SOURCES.person,
        label: 'Test person',
        role: 'user',
        wakes: true,
        entry: 'login',
        countsTowardCapacity: true,
      },
    })
    expect((await s.read()).pending).toHaveLength(1)
  })

  it("a system component's input is a system reminder that does not count against the pending inputs", async () => {
    const s = await scene({ maxPendingInputs: 1 })
    succeeded(await s.create(), 'create')
    s.as(SYSTEM)
    succeeded(await s.accept('system-1', reminderInput('system-1')), 'first')
    succeeded(await s.accept('system-2', reminderInput('system-2')), 'second: no capacity is used')
    expect(s.routed().map(entry => 'source' in entry && entry.source)).toMatchObject([
      { role: 'system_reminder', wakes: true, entry: 'trusted', countsTowardCapacity: false },
      { role: 'system_reminder', wakes: true, entry: 'trusted', countsTowardCapacity: false },
    ])
    expect(s.entries('message.system_reminder')).toHaveLength(2)
    s.as(MEMBER)
    succeeded(await s.accept('person-1'), 'the one pending slot is still free')
    expect(refused(await s.accept('person-2'), 'over the limit')).toMatchObject({ kind: 'limited' })
  })

  it('a system component cannot author a user message, by any declaration (SE-28)', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    s.as(SYSTEM)
    const forged = { ...ordinaryInput('forged'), source: TESTING_SOURCES.system }
    expect(refused(await s.accept('forged', forged), 'a user role from a system source')).toEqual({
      kind: 'invalid',
      field: 'value.message.role',
      reason: 'this source authors system_reminder messages only',
    })
    expect(
      refused(await s.accept('as-person', ordinaryInput('as-person')), 'the person source'),
    ).toEqual({
      kind: 'invalid',
      field: 'value.source',
      reason: 'subject-not-accepted',
    })
    expect(s.routed()).toEqual([])
    expect(s.entries('message.user')).toEqual([])
  })

  it('a member cannot send as a source that accepts a system component', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    const refusal = refused(await s.accept('m', reminderInput('m')), 'a member to a system source')
    expect(refusal).toMatchObject({ kind: 'invalid', reason: 'subject-not-accepted' })
  })

  it('a quiet source never wakes and takes no wake flag; a waking one takes none either', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    s.as(SYSTEM)
    succeeded(await s.accept('quiet', reminderInput('quiet', TESTING_SOURCES.quiet)), 'quiet')
    const snapshot = await s.read()
    expect(snapshot.quietInputs).toEqual(snapshot.pending)
    expect(snapshot.idle).not.toBeUndefined()
    const flagged = { ...reminderInput('flagged', TESTING_SOURCES.quiet), wake: true }
    expect(
      refused(await s.accept('flagged', flagged), 'a wake flag on a quiet source'),
    ).toMatchObject({
      kind: 'invalid',
      reason: 'wake-flag-not-allowed',
    })
    const asked = { ...reminderInput('asked', TESTING_SOURCES.outcome), wake: false }
    succeeded(await s.accept('asked', asked), 'a source that wakes as requested')
    expect((await s.read()).quietInputs).toHaveLength(2)
  })
})

describe('no terms, no intake: the answer is unavailable and nothing is written (SE-31, I-5)', () => {
  it('an access decision without a subject kind does not admit an input', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    s.as(undefined)
    expect(refused(await s.accept('no-subject'), 'no subject')).toEqual({
      kind: 'unavailable',
      owner: 'session-intake',
      diagnostic: 'the terms of this input are not available: subject-absent',
    })
    expect(s.routed()).toEqual([])
  })

  it('a source that is not registered, and a registry that is away, answer the same', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    const stray = { ...ordinaryInput('stray'), source: inputSourceName('test.unregistered') }
    const unregistered = refused(await s.accept('stray', stray), 'unregistered')
    s.withdrawRegistry()
    const away = refused(await s.accept('away'), 'registry away')
    expect(unregistered).toEqual(away)
    expect(away).toMatchObject({ kind: 'unavailable', owner: 'session-intake' })
    expect(s.routed()).toEqual([])
  })
})

describe('the values live in the log, not in the registry (SE-29)', () => {
  it('recalls an accepted input after its source is withdrawn, and refuses a new one', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    const first = succeeded(await s.accept('kept'), 'accept')
    s.withdrawRegistry()
    const again = succeeded(await s.accept('kept'), 'the same request, the source gone')
    expect(again).toMatchObject({ ...(first as object), recovered: true })
    expect(refused(await s.accept('new'), 'a new input')).toMatchObject({ kind: 'unavailable' })
    expect(s.routed()).toHaveLength(1)
    expect((await s.read()).pending).toHaveLength(1)
  })

  it('a different input under an accepted request identity is a conflict, the source gone or not', async () => {
    const s = await scene()
    succeeded(await s.create(), 'create')
    succeeded(await s.accept('kept'), 'accept')
    s.withdrawRegistry()
    const other = refused(await s.accept('kept', ordinaryInput('kept', 'other text')), 'changed')
    expect(other).toMatchObject({ kind: 'conflict' })
  })

  it('the initial input of a creation is admitted in the commit of the session and replays from the log', async () => {
    const s = await scene({ initial: ordinaryInput('initial') })
    succeeded(await s.create(), 'create')
    const snapshot = await s.read()
    expect(snapshot.pending).toEqual(['initial'])
    expect(s.routed()[0]).toMatchObject({
      input: 'initial',
      destination: 'next-run',
      run: null,
      source: { role: 'user', wakes: true },
    })
    s.withdrawRegistry()
    expect(succeeded(await s.create(), 'the same creation again')).toMatchObject({
      receipt: { recovered: true },
    })
  })

  it('a refused initial input names its place in the creation, and an urgent one its own', async () => {
    const refusedCreation = await scene({ initial: ordinaryInput('initial') })
    refusedCreation.as(SYSTEM)
    expect(refused(await refusedCreation.create(), 'create')).toEqual({
      kind: 'invalid',
      field: 'creation.initial.source',
      reason: 'subject-not-accepted',
    })
    expect(refusedCreation.rows()).toEqual([])
    const s = await scene()
    succeeded(await s.create(), 'create')
    s.as(SYSTEM)
    const urgent = await s.port.commit({
      access,
      guards: [],
      command: {
        kind: 'interrupt',
        input: {
          ...base,
          operation: operationId('urgent'),
          run: null,
          urgent: ordinaryInput('urgent'),
          decision: evidence('person'),
        },
      },
    })
    expect(refused(urgent, 'interrupt')).toEqual({
      kind: 'invalid',
      field: 'urgent.source',
      reason: 'subject-not-accepted',
    })
  })

  it('a creation whose initial input has no terms creates nothing', async () => {
    const s = await scene({ initial: ordinaryInput('initial') })
    s.withdrawRegistry()
    expect(refused(await s.create(), 'create')).toMatchObject({ kind: 'unavailable' })
    expect(s.rows()).toEqual([])
  })
})
