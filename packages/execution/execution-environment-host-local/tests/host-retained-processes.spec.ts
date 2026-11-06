// The retained-process index with a stub supervisor and a real temporary state directory: capacity
// per retention scope, the marker files, the listing by scope and tenant, the reading that settles
// an empty unit and leaves an unread one alone, the load after a restart, and the closure of a
// scope. Then the disposition itself with controllable ledgers: the rechecks around the commit
// (C5), the unknown commit and its resolution, and the reasons a domain is stopped instead.
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import {
  originRef,
  type ManagedResource,
  type RetainedProcessLedger,
} from '@omne-harness/execution-environment-contract'
import {
  decideDisposition,
  resolveUnknownHandover,
  type CustodyBinding,
} from '../src/host-command.ts'
import {
  createRetainedProcessIndex,
  type RetainedReservation,
  type RetainedSupervision,
} from '../src/host-retained-processes.ts'
import type { MembersReading, ScopeCoordinate, StopReading } from '../src/host-scope.ts'
import { scopeDigest } from '../src/host-scope.ts'

function tenantOf(account: string): TenantId {
  const parsed = tenantCodec.parse(
    JSON.stringify({ organization: 'org_0123456789abcdefghjkmnpqrs', account }),
  )
  if (!parsed.ok) throw new Error('tenant fixture did not parse')
  return parsed.value
}
const tenant = tenantOf('acc_0123456789abcdefghjkmnpqrs')
const otherTenant = tenantOf('acc_zzzzzzzzzzzzzzzzzzzzzzzzzz')

type ScopeRef = Parameters<ReturnType<typeof createRetainedProcessIndex>['reserve']>[0]
function scopeOf(text: string): ScopeRef {
  function isScopeText(value: string): value is ScopeRef['ref'] {
    return value.length > 0
  }
  if (!isScopeText(text)) throw new TypeError('empty scope')
  return { ref: text }
}

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function stateDirectory(): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'omne-retained-index-')))
  roots.push(root)
  return root
}

const bootId = 'boot-1'
const gatePid = 4242

/** A supervisor stub: the members of each unit are what the test sets; stops are recorded. */
function supervisor() {
  const readings = new Map<string, MembersReading>()
  const stops: ScopeCoordinate[] = []
  let stopAnswer: StopReading = { status: 'confirmed' }
  const supervision: RetainedSupervision = {
    bootId: async () => bootId,
    members: async ({ unit }) => readings.get(unit) ?? { kind: 'unreadable' },
    stop: async coordinate => {
      stops.push(coordinate)
      if (stopAnswer.status === 'confirmed')
        readings.set(coordinate.unit, {
          kind: 'gone',
          show: { loadState: 'not-found', activeState: 'inactive' },
        })
      return stopAnswer
    },
  }
  return {
    supervision,
    stops,
    members(unit: string, pids: readonly number[]) {
      readings.set(unit, { kind: 'members', pids, directory: `/cgroup/${unit}` })
    },
    unreadable(unit: string) {
      readings.set(unit, {
        kind: 'unreadable',
        show: { loadState: 'loaded', activeState: 'active' },
      })
    },
    gone(unit: string) {
      readings.set(unit, {
        kind: 'gone',
        show: { loadState: 'not-found', activeState: 'inactive' },
      })
    },
    answerStops(answer: StopReading) {
      stopAnswer = answer
    },
  }
}

function ledgerStub() {
  const stopped: [string, 'confirmed' | 'unconfirmed'][] = []
  const ledger: RetainedProcessLedger = {
    closed: new AbortController().signal,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    stopped: async (key, status) => {
      stopped.push([key, status])
      return 'recorded'
    },
  }
  return { ledger, stopped }
}

async function indexWith(
  state: string,
  stub = supervisor(),
  options: { capacity?: number; supervision?: RetainedSupervision | undefined } = {},
) {
  const facts: unknown[] = []
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: options.capacity ?? 8,
    pollMs: 60_000,
    supervision: async () => ('supervision' in options ? options.supervision : stub.supervision),
    diagnose: fact => facts.push(fact),
  })
  index.join('generation-1')
  expect(await index.ready()).toBe(true)
  return { index, stub, facts }
}

function unitOf(key: string) {
  return `omne-host-${key}.scope`
}

async function handOver(
  f: Awaited<ReturnType<typeof indexWith>>,
  scope: ScopeRef,
  who = tenant,
  ledger = ledgerStub(),
) {
  const key = randomUUID()
  const reservation = f.index.reserve(scope, who, key)
  if (typeof reservation === 'string') throw new Error(`expected a reservation: ${reservation}`)
  f.stub.members(unitOf(key), [gatePid, 100, 101])
  const handed = await f.index.commit(reservation, {
    unit: unitOf(key),
    bootId,
    origin: originRef('call-1'),
    gatePid,
    members: 2,
    ledger: ledger.ledger,
  })
  return { key, handed, ledger }
}

it('counts reservations and stopping entries against the scope capacity, and never evicts', async () => {
  const f = await indexWith(await stateDirectory(), supervisor(), { capacity: 2 })
  const scope = scopeOf('scope-a')
  const first = f.index.reserve(scope, tenant, 'k1')
  const second = f.index.reserve(scope, tenant, 'k2')
  expect(typeof first).toBe('object')
  expect(typeof second).toBe('object')
  expect(f.index.reserve(scope, tenant, 'k3')).toBe('capacity')
  // Another scope has its own count.
  expect(typeof f.index.reserve(scopeOf('scope-b'), tenant, 'k4')).toBe('object')
  if (typeof first === 'string' || typeof second === 'string') throw new Error('unreachable')
  first.abort()
  expect(typeof f.index.reserve(scope, tenant, 'k5')).toBe('object')
  // A stopping entry whose stop is not confirmed still occupies its place.
  f.stub.answerStops({ status: 'unconfirmed' })
  const handed = await handOver(f, scopeOf('scope-c'), tenant)
  const other = f.index.reserve(scopeOf('scope-c'), tenant, 'k6')
  expect(typeof other).toBe('object')
  expect(await f.index.stop(handed.key)).toBe('unconfirmed')
  expect(f.index.reserve(scopeOf('scope-c'), tenant, 'k7')).toBe('capacity')
  expect(await f.index.list(scopeOf('scope-c'), tenant)).toMatchObject([{ state: 'stopping' }])
})

it('does not ask for the supervisor when it holds nothing, so an idle maintenance starts no probe', async () => {
  let asked = 0
  const index = createRetainedProcessIndex({
    stateDirectory: await stateDirectory(),
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => {
      asked++
      return supervisor().supervision
    },
  })
  index.join('generation-1')
  expect(await index.ready()).toBe(true)
  expect(await index.maintain()).toBe(0)
  expect(asked).toBe(0)
})

it('answers unavailable to a reservation before the markers were read', async () => {
  const stub = supervisor()
  const index = createRetainedProcessIndex({
    stateDirectory: await stateDirectory(),
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => stub.supervision,
  })
  expect(index.reserve(scopeOf('scope-a'), tenant, 'k1')).toBe('unavailable')
})

it.skipIf(!existsSync('/dev/fd'))('leaves no descriptor open after writing markers', async () => {
  const f = await indexWith(await stateDirectory())
  const scope = scopeOf('scope-descriptors')
  const descriptors = () => readdirSync('/dev/fd').length
  const before = descriptors()
  for (let n = 0; n < 4; n++) expect((await handOver(f, scope)).handed.marker).toBe('written')
  expect(descriptors()).toBeLessThan(before + 4)
})

it('writes the marker on commit with the fields a restart needs, and lists by scope and tenant only', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const scope = scopeOf('scope-a')
  const { key, handed } = await handOver(f, scope)
  expect(handed).toEqual({
    process: { id: key, generation: expect.stringMatching(/^[0-9a-f-]{36}$/u) },
    marker: 'written',
  })
  const marker: unknown = JSON.parse(
    await readFile(join(state, 'retained-processes', `${key}.json`), 'utf8'),
  )
  expect(marker).toEqual({
    version: 1,
    key,
    scope: scopeDigest(scope),
    tenant: tenantCodec.encode(tenant).ok
      ? (tenantCodec.encode(tenant) as { value: string }).value
      : '',
    unit: unitOf(key),
    bootId,
    origin: 'call-1',
    generation: handed.process.generation,
    handedOverAtMs: expect.any(Number),
    gatePid,
  })
  expect(await f.index.list(scope, tenant)).toEqual([
    {
      process: handed.process,
      origin: 'call-1',
      handedOverAtMs: expect.any(Number),
      state: 'running',
      processes: 2,
    },
  ])
  expect(await f.index.list(scope, otherTenant)).toEqual([])
  expect(await f.index.list(scopeOf('scope-b'), tenant)).toEqual([])
  expect(f.index.resources(scope)).toEqual([
    {
      key,
      provider: 'host-files',
      reference: {
        kind: 'object',
        entries: [
          { key: 'unit', value: { kind: 'string', value: unitOf(key) } },
          { key: 'bootId', value: { kind: 'string', value: bootId } },
        ],
      },
    },
  ])
})

it('settles a unit that only holds the gate: stops it, records the stop, removes the marker; an unread unit is left alone', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const scope = scopeOf('scope-a')
  const { key, ledger } = await handOver(f, scope)
  f.stub.unreadable(unitOf(key))
  expect(await f.index.maintain()).toBe(0)
  expect(f.stub.stops).toEqual([])
  expect(await f.index.list(scope, tenant)).toMatchObject([{ state: 'running', processes: 2 }])
  f.stub.members(unitOf(key), [gatePid])
  await f.index.maintain()
  expect(f.stub.stops).toEqual([{ unit: unitOf(key), bootId }])
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(await readdir(join(state, 'retained-processes'))).toEqual([])
  expect(await f.index.list(scope, tenant)).toEqual([])
  // A unit the supervisor reports gone settles the same way.
  const second = await handOver(f, scope)
  f.stub.gone(unitOf(second.key))
  await f.index.maintain()
  expect(second.ledger.stopped).toEqual([[second.key, 'confirmed']])
})

it('loads the markers after a restart: another boot and a gone unit are discarded, the rest are listed with members read now', async () => {
  const state = await stateDirectory()
  const first = await indexWith(state)
  const scope = scopeOf('scope-a')
  const kept = await handOver(first, scope)
  const gone = await handOver(first, scope)
  const stale = await handOver(first, scope)
  const directory = join(state, 'retained-processes')
  const staleMarker = JSON.parse(await readFile(join(directory, `${stale.key}.json`), 'utf8'))
  await writeFile(
    join(directory, `${stale.key}.json`),
    JSON.stringify({ ...staleMarker, bootId: 'boot-0' }),
  )
  await writeFile(join(directory, 'garbage.json'), '{')
  const stub = supervisor()
  stub.members(unitOf(kept.key), [gatePid, 7])
  stub.gone(unitOf(gone.key))
  const second = await indexWith(state, stub)
  expect(await second.index.list(scope, tenant)).toEqual([
    {
      process: kept.handed.process,
      origin: 'call-1',
      handedOverAtMs: expect.any(Number),
      state: 'running',
      processes: 1,
    },
  ])
  expect((await readdir(directory)).sort()).toEqual([`${kept.key}.json`])
  expect(second.facts).toEqual(
    expect.arrayContaining([
      { key: gone.key, unit: unitOf(gone.key), issue: 'discarded' },
      { key: stale.key, unit: unitOf(stale.key), issue: 'discarded' },
    ]),
  )
  // A loaded entry has no ledger; the closure of its scope records on the ledger it is given.
  const closer = ledgerStub()
  expect(await second.index.closeScope(scope, closer.ledger)).toEqual([])
  expect(stub.stops).toEqual([{ unit: unitOf(kept.key), bootId }])
  expect(closer.stopped).toEqual([[kept.key, 'confirmed']])
  expect(await readdir(directory)).toEqual([])
})

it('answers unavailable, not an empty list, when the markers cannot be read, and counts no capacity', async () => {
  const state = await stateDirectory()
  await writeFile(join(state, 'retained-processes'), 'not a directory')
  const stub = supervisor()
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => stub.supervision,
  })
  expect(await index.ready()).toBe(false)
  expect(await index.list(scopeOf('scope-a'), tenant)).toBe('unavailable')
  expect(index.reserve(scopeOf('scope-a'), tenant, 'k1')).toBe('unavailable')
  // A marker whose unit the supervisor cannot be asked about keeps the index unread as well.
  const readable = await stateDirectory()
  await mkdir(join(readable, 'retained-processes'))
  await writeFile(
    join(readable, 'retained-processes', 'k2.json'),
    JSON.stringify({
      version: 1,
      key: 'k2',
      scope: scopeDigest(scopeOf('scope-a')),
      tenant: 't',
      unit: unitOf('k2'),
      bootId,
      origin: 'call-1',
      generation: 'g',
      handedOverAtMs: 1,
      gatePid: null,
    }),
  )
  const unasked = createRetainedProcessIndex({
    stateDirectory: readable,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => undefined,
  })
  expect(await unasked.ready()).toBe(false)
  expect(await unasked.list(scopeOf('scope-a'), tenant)).toBe('unavailable')
})

it('N3: rewrites a marker that could not be written on the next maintenance, and a new index then loads it', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const scope = scopeOf('scope-a')
  // The marker directory is taken by a file: the write at commit fails.
  await writeFile(join(state, 'retained-processes'), 'in the way')
  const { key, handed } = await handOver(f, scope)
  expect(handed.marker).toBe('notWritten')
  expect(f.facts).toEqual([{ key, unit: unitOf(key), issue: 'notWritten' }])
  // Still in the way: the maintenance tries again and diagnoses again.
  await f.index.maintain()
  expect(f.facts).toHaveLength(2)
  await rm(join(state, 'retained-processes'))
  await f.index.maintain()
  expect(await readdir(join(state, 'retained-processes'))).toEqual([`${key}.json`])
  // Written: the next maintenance does not write it again.
  const written = await readFile(join(state, 'retained-processes', `${key}.json`), 'utf8')
  await f.index.maintain()
  expect(await readFile(join(state, 'retained-processes', `${key}.json`), 'utf8')).toBe(written)
  expect(f.facts).toHaveLength(2)
  const stub = supervisor()
  stub.members(unitOf(key), [gatePid, 7])
  const second = await indexWith(state, stub)
  expect(await second.index.list(scope, tenant)).toMatchObject([
    { process: handed.process, state: 'running', processes: 1 },
  ])
})

it('N2: a handover committed for an interrupted domain is held as stopping: it counts, it is listed, it leaves once the stop is confirmed and recorded', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state, supervisor(), { capacity: 1 })
  const scope = scopeOf('scope-a')
  const key = randomUUID()
  const reservation = f.index.reserve(scope, tenant, key)
  if (typeof reservation === 'string') throw new Error(`expected a reservation: ${reservation}`)
  const ledger = ledgerStub()
  f.stub.answerStops({ status: 'unconfirmed' })
  const stopping = f.index.commitStopping(reservation, {
    unit: unitOf(key),
    bootId,
    origin: originRef('call-1'),
    gatePid,
    members: 2,
    ledger: ledger.ledger,
  })
  // Synchronously the place is taken and the reservation can no longer be given back.
  reservation.abort()
  expect(f.index.reserve(scope, tenant, 'another')).toBe('capacity')
  expect(await f.index.list(scope, tenant)).toMatchObject([
    { process: { id: key }, origin: 'call-1', state: 'stopping', processes: 2 },
  ])
  expect(await stopping).toBe('unconfirmed')
  expect(f.stub.stops).toEqual([{ unit: unitOf(key), bootId }])
  expect(ledger.stopped).toEqual([[key, 'unconfirmed']])
  // The marker stays until the stop is confirmed: a restart now still lists the domain and counts it.
  await vi.waitFor(async () =>
    expect(await readdir(join(state, 'retained-processes'))).toEqual([`${key}.json`]),
  )
  const restarted = supervisor()
  restarted.members(unitOf(key), [gatePid, 100])
  const second = await indexWith(state, restarted, { capacity: 1 })
  expect(await second.index.list(scope, tenant)).toMatchObject([{ process: { id: key } }])
  expect(second.index.reserve(scope, tenant, 'another')).toBe('capacity')
  // Unconfirmed: the maintenance stops it again until the supervisor confirms.
  f.stub.answerStops({ status: 'confirmed' })
  expect(await f.index.maintain()).toBe(0)
  expect(f.stub.stops).toHaveLength(2)
  expect(ledger.stopped).toEqual([
    [key, 'unconfirmed'],
    [key, 'confirmed'],
  ])
  expect(await f.index.list(scope, tenant)).toEqual([])
  expect(await readdir(join(state, 'retained-processes'))).toEqual([])
  expect(typeof f.index.reserve(scope, tenant, 'another')).toBe('object')
})

it('keeps the marker of a domain whose stop began while the marker was written and is not confirmed', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state, supervisor(), { capacity: 1 })
  const scope = scopeOf('scope-a')
  const ledger = ledgerStub()
  f.stub.answerStops({ status: 'unconfirmed' })
  const key = randomUUID()
  const reservation = f.index.reserve(scope, tenant, key)
  if (typeof reservation === 'string') throw new Error(`expected a reservation: ${reservation}`)
  f.stub.members(unitOf(key), [gatePid, 100])
  const committing = f.index.commit(reservation, {
    unit: unitOf(key),
    bootId,
    origin: originRef('call-1'),
    gatePid,
    members: 1,
    ledger: ledger.ledger,
  })
  // The scope closes while the marker write is in flight, and the supervisor does not confirm.
  expect(await f.index.closeScope(scope, ledger.ledger)).toHaveLength(1)
  expect((await committing).marker).toBe('written')
  expect(await readdir(join(state, 'retained-processes'))).toEqual([`${key}.json`])
  const restarted = supervisor()
  restarted.members(unitOf(key), [gatePid, 100])
  const second = await indexWith(state, restarted, { capacity: 1 })
  expect(second.index.resources(scope)).toHaveLength(1)
  expect(second.index.reserve(scope, tenant, 'another')).toBe('capacity')
})

it('rewrites the marker of a stopping domain that could not be written, while its stop is not confirmed', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const scope = scopeOf('scope-a')
  await writeFile(join(state, 'retained-processes'), 'in the way')
  f.stub.answerStops({ status: 'unconfirmed' })
  const key = randomUUID()
  const reservation = f.index.reserve(scope, tenant, key)
  if (typeof reservation === 'string') throw new Error(`expected a reservation: ${reservation}`)
  const ledger = ledgerStub()
  const stopping = f.index.commitStopping(reservation, {
    unit: unitOf(key),
    bootId,
    origin: originRef('call-1'),
    gatePid,
    members: 1,
    ledger: ledger.ledger,
  })
  expect(await stopping).toBe('unconfirmed')
  await vi.waitFor(() => expect(f.facts).toEqual([{ key, unit: unitOf(key), issue: 'notWritten' }]))
  await rm(join(state, 'retained-processes'))
  await f.index.maintain()
  expect(await readdir(join(state, 'retained-processes'))).toEqual([`${key}.json`])
})

it('N2: a stop the acquisition already issued is the one the index waits for, recorded once', async () => {
  const f = await indexWith(await stateDirectory())
  const scope = scopeOf('scope-a')
  const key = randomUUID()
  const reservation = f.index.reserve(scope, tenant, key)
  if (typeof reservation === 'string') throw new Error(`expected a reservation: ${reservation}`)
  const ledger = ledgerStub()
  const issued = deferred<StopReading>()
  const stopping = f.index.commitStopping(reservation, {
    unit: unitOf(key),
    bootId,
    origin: originRef('call-1'),
    gatePid,
    members: null,
    ledger: ledger.ledger,
    issued: issued.promise,
  })
  expect(await f.index.list(scope, tenant)).toMatchObject([
    { state: 'stopping', processes: 'unknown' },
  ])
  // Another stop and the maintenance join the one in flight.
  const again = f.index.stop(key)
  await f.index.maintain()
  expect(f.stub.stops).toEqual([])
  issued.resolve({ status: 'confirmed' })
  expect(await stopping).toBe('confirmed')
  expect(await again).toBe('confirmed')
  expect(f.stub.stops).toEqual([])
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(await f.index.list(scope, tenant)).toEqual([])
})

it('recovers a retained process by its resource, and answers undefined for one it does not hold', async () => {
  const f = await indexWith(await stateDirectory())
  const scope = scopeOf('scope-a')
  const { key, ledger } = await handOver(f, scope)
  const resource = f.index.resources(scope)[0]
  if (resource === undefined) throw new Error('expected a resource')
  const foreign: ManagedResource = { ...resource, key: 'other' }
  expect(await f.index.recover(foreign)).toBeUndefined()
  expect(await f.index.recover({ ...resource, provider: 'elsewhere' })).toBeUndefined()
  expect(await f.index.recover(resource)).toBe('confirmed')
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(await f.index.stop(key)).toBe('confirmed')
})

// ---------------------------------------------------------------------------------------------
// The disposition

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void }
function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: Error) => void = () => undefined
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function binding(
  overrides: Partial<CustodyBinding> & { closed?: () => boolean } = {},
  aborted: string[] = [],
): CustodyBinding & { reservation: RetainedReservation } {
  const reservation: RetainedReservation = {
    key: 'k1',
    abort: () => {
      aborted.push('k1')
    },
  }
  return {
    reservation,
    closed: () => false,
    reserve: () => reservation,
    plan: async () => 'recorded',
    adopt: async () => 'confirmed',
    ...overrides,
  }
}

const far = () => performance.now() + 10_000

it('C5: a stop or release while the commit is in flight makes a confirmed commit an interrupted one, and before it aborts the reservation', async () => {
  const adopt = deferred<'confirmed' | 'closed' | 'unavailable'>()
  let interrupted = false
  const aborted: string[] = []
  const b = binding({ adopt: () => adopt.promise }, aborted)
  const deciding = decideDisposition({
    members: 1,
    binding: b,
    deadline: far(),
    interrupted: () => interrupted,
  })
  await new Promise(resolve => setTimeout(resolve, 10))
  interrupted = true
  adopt.resolve('confirmed')
  expect(await deciding).toEqual({ kind: 'retainedInterrupted', reservation: b.reservation })
  // The scope closing during the commit is read the same way.
  let closed = false
  const late = deferred<'confirmed' | 'closed' | 'unavailable'>()
  const c = binding({ adopt: () => late.promise, closed: () => closed })
  const closing = decideDisposition({
    members: null,
    binding: c,
    deadline: far(),
    interrupted: () => false,
  })
  await new Promise(resolve => setTimeout(resolve, 10))
  closed = true
  late.resolve('confirmed')
  expect(await closing).toEqual({ kind: 'retainedInterrupted', reservation: c.reservation })
  // Interrupted before the commit: the reservation is given back and `adopt` is never asked.
  const adopts: string[] = []
  const before = binding(
    {
      plan: async () => 'recorded',
      adopt: async () => {
        adopts.push('asked')
        return 'confirmed'
      },
    },
    aborted,
  )
  let stop = false
  const decided = decideDisposition({
    members: 1,
    binding: {
      ...before,
      plan: async () => {
        stop = true
        return 'recorded'
      },
    },
    deadline: far(),
    interrupted: () => stop,
  })
  expect(await decided).toEqual({ kind: 'stop', residue: { kind: 'stopping', reason: 'closed' } })
  expect(adopts).toEqual([])
  expect(aborted).toEqual(['k1'])
})

it('reads an unknown commit as unknown and keeps the reservation; asking again settles it either way', async () => {
  const aborted: string[] = []
  const throwing = binding({ adopt: async () => Promise.reject(new Error('lost')) }, aborted)
  const unknown = await decideDisposition({
    members: 1,
    binding: throwing,
    deadline: far(),
    interrupted: () => false,
  })
  expect(unknown).toEqual({ kind: 'unknown', reservation: throwing.reservation })
  const unavailable = binding({ adopt: async () => 'unavailable' })
  expect(
    await decideDisposition({
      members: 1,
      binding: unavailable,
      deadline: far(),
      interrupted: () => false,
    }),
  ).toMatchObject({ kind: 'unknown' })
  const never = binding({ adopt: () => new Promise(() => undefined) })
  expect(
    await decideDisposition({
      members: 1,
      binding: never,
      deadline: performance.now() + 20,
      interrupted: () => false,
    }),
  ).toMatchObject({ kind: 'unknown' })
  expect(aborted).toEqual([])
  // The same reservation, asked again.
  expect(
    await resolveUnknownHandover({
      binding: binding({ adopt: async () => 'confirmed' }),
      reservation: throwing.reservation,
      deadline: far(),
      interrupted: () => false,
    }),
  ).toEqual({ kind: 'retained', reservation: throwing.reservation })
  expect(
    await resolveUnknownHandover({
      binding: binding({ adopt: async () => 'closed' }),
      reservation: throwing.reservation,
      deadline: far(),
      interrupted: () => false,
    }),
  ).toEqual({ kind: 'stop', residue: { kind: 'stopping', reason: 'closed' } })
  expect(aborted).toEqual(['k1'])
})

it('stops with the reason of the first condition that fails, in the order of the contract', async () => {
  const decide = (input: Parameters<typeof decideDisposition>[0]) => decideDisposition(input)
  const open = { deadline: far(), interrupted: () => false }
  expect(await decide({ members: 0, binding: 'unbound', ...open })).toEqual({
    kind: 'stop',
    residue: { kind: 'none' },
  })
  expect(await decide({ members: 3, binding: 'policy', ...open })).toEqual({
    kind: 'stop',
    residue: { kind: 'stopping', reason: 'policy' },
  })
  expect(await decide({ members: null, binding: 'unbound', ...open })).toEqual({
    kind: 'stop',
    residue: { kind: 'stopping', reason: 'unbound' },
  })
  expect(
    await decide({ members: 1, binding: binding({ closed: () => true }), ...open }),
  ).toMatchObject({ residue: { reason: 'closed' } })
  expect(
    await decide({ members: 1, binding: binding({ reserve: () => 'capacity' }), ...open }),
  ).toMatchObject({ residue: { reason: 'capacity' } })
  expect(
    await decide({ members: 1, binding: binding({ reserve: () => 'unavailable' }), ...open }),
  ).toMatchObject({ residue: { reason: 'policy' } })
  const aborted: string[] = []
  expect(
    await decide({
      members: 1,
      binding: binding({ plan: async () => 'closed' }, aborted),
      ...open,
    }),
  ).toMatchObject({ residue: { reason: 'closed' } })
  expect(
    await decide({
      members: 1,
      binding: binding({ plan: async () => 'conflict' }, aborted),
      ...open,
    }),
  ).toMatchObject({ residue: { reason: 'unbound' } })
  expect(
    await decide({
      members: 1,
      binding: binding({ plan: async () => Promise.reject(new Error('down')) }, aborted),
      ...open,
    }),
  ).toMatchObject({ residue: { reason: 'unbound' } })
  expect(aborted).toEqual(['k1', 'k1', 'k1'])
  const b = binding()
  expect(await decide({ members: 1, binding: b, ...open })).toEqual({
    kind: 'retained',
    reservation: b.reservation,
  })
})
