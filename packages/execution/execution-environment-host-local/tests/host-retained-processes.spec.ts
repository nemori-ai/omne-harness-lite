// The retained-process index with a stub supervisor and a real temporary state directory: capacity
// per retention scope, the marker files, the listing by scope and tenant, the reading that settles
// an empty unit and leaves an unread one alone, the load after a restart, and the closure of a
// scope. Then the disposition itself with controllable ledgers: the rechecks around the commit
// (C5), the unknown commit and its resolution, and the reasons a domain is stopped instead.
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readlinkSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
import { scopeDigest, scopeReference } from '../src/host-scope.ts'
import { createRetainedTail } from '../src/retained-tail.ts'

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
  vi.useRealTimers()
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
  const reads: { unit: string; directory?: string | undefined }[] = []
  let stopAnswer: StopReading = { status: 'confirmed' }
  const supervision: RetainedSupervision = {
    bootId: async () => bootId,
    members: async input => {
      reads.push(input)
      return readings.get(input.unit) ?? { kind: 'unreadable' }
    },
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
    reads,
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
  options: {
    capacity?: number
    pollMs?: number
    join?: boolean
    supervision?: () => Promise<RetainedSupervision | undefined>
  } = {},
) {
  const facts: unknown[] = []
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: options.capacity ?? 8,
    pollMs: options.pollMs ?? 60_000,
    supervision: options.supervision ?? (async () => stub.supervision),
    diagnose: fact => facts.push(fact),
  })
  if (options.join !== false) index.join('generation-1')
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

it.skipIf(!existsSync('/proc/self/fd'))(
  'leaves no descriptor open after writing markers',
  async () => {
    const state = await stateDirectory()
    const f = await indexWith(state)
    const scope = scopeOf('scope-descriptors')
    for (let n = 0; n < 4; n++) expect((await handOver(f, scope)).handed.marker).toBe('written')
    // Other work in this process opens and closes descriptors too, so the count proves nothing.
    // Only a descriptor that points into this index's state directory is this index's.
    const targets = readdirSync('/proc/self/fd').flatMap(fd => {
      try {
        return [readlinkSync(join('/proc/self/fd', fd))]
      } catch {
        return []
      }
    })
    expect(targets.filter(target => target.startsWith(state))).toEqual([])
  },
)

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

/** A ledger whose `ended` reads the confirmed stops it recorded, as the retention scope's ledger does. */
function endingLedger(ended?: (key: string) => Promise<'confirmed' | 'none' | 'unavailable'>) {
  const stub = ledgerStub()
  const ledger: RetainedProcessLedger = {
    ...stub.ledger,
    ended:
      ended ??
      (async key =>
        stub.stopped.some(([k, status]) => k === key && status === 'confirmed')
          ? 'confirmed'
          : 'none'),
  }
  return { ledger, stopped: stub.stopped }
}

describe('stopping a retained process by its reference', () => {
  it('stops it only for its scope, tenant and generation, joins a repeated stop, then answers from the end fact', async () => {
    const f = await indexWith(await stateDirectory())
    const scope = scopeOf('scope-a')
    const ledger = endingLedger()
    const { key, handed } = await handOver(f, scope, tenant, ledger)
    const ref = handed.process
    expect(await f.index.stopRef(ref, scopeOf('scope-b'), tenant, ledger.ledger)).toBe('notFound')
    expect(await f.index.stopRef(ref, scope, otherTenant, ledger.ledger)).toBe('notFound')
    expect(
      await f.index.stopRef({ ...ref, generation: 'another' }, scope, tenant, ledger.ledger),
    ).toBe('notFound')
    expect(f.stub.stops).toEqual([])
    const both = await Promise.all([
      f.index.stopRef(ref, scope, tenant, ledger.ledger),
      f.index.stopRef(ref, scope, tenant, ledger.ledger),
    ])
    expect(both).toEqual(['confirmed', 'confirmed'])
    expect(f.stub.stops).toEqual([{ unit: unitOf(key), bootId }])
    expect(ledger.stopped).toEqual([[key, 'confirmed']])
    expect(await f.index.list(scope, tenant)).toEqual([])
    expect(await f.index.stopRef(ref, scope, tenant, ledger.ledger)).toBe('confirmed')
    expect(f.stub.stops).toHaveLength(1)
  })

  it('answers unconfirmed and keeps the process when the supervisor does not confirm', async () => {
    const f = await indexWith(await stateDirectory())
    const scope = scopeOf('scope-a')
    const ledger = endingLedger()
    const { key, handed } = await handOver(f, scope, tenant, ledger)
    f.stub.answerStops({ status: 'unconfirmed' })
    expect(await f.index.stopRef(handed.process, scope, tenant, ledger.ledger)).toBe('unconfirmed')
    expect(ledger.stopped).toEqual([[key, 'unconfirmed']])
    expect(await f.index.list(scope, tenant)).toMatchObject([{ state: 'stopping' }])
  })

  it('answers unavailable when the end fact cannot be read: no ended, a throw, or unavailable', async () => {
    const f = await indexWith(await stateDirectory())
    const scope = scopeOf('scope-a')
    const ref = { id: 'never-handed-over', generation: 'g' }
    const plain = ledgerStub()
    expect(await f.index.stopRef(ref, scope, tenant, plain.ledger)).toBe('unavailable')
    const throwing = endingLedger(async () => {
      throw new Error('state unreadable')
    })
    expect(await f.index.stopRef(ref, scope, tenant, throwing.ledger)).toBe('unavailable')
    const unreadable = endingLedger(async () => 'unavailable')
    expect(await f.index.stopRef(ref, scope, tenant, unreadable.ledger)).toBe('unavailable')
    expect(await f.index.stopRef(ref, scope, tenant, endingLedger().ledger)).toBe('notFound')
  })

  it('does not stop a reservation that is not handed over yet', async () => {
    const f = await indexWith(await stateDirectory())
    const scope = scopeOf('scope-a')
    const reservation = f.index.reserve(scope, tenant, 'reserved-key')
    if (typeof reservation === 'string') throw new Error('expected a reservation')
    const ref = { id: 'reserved-key', generation: '' }
    expect(await f.index.stopRef(ref, scope, tenant, endingLedger().ledger)).toBe('notFound')
    expect(f.stub.stops).toEqual([])
  })

  it('records the stop of a process loaded after a restart on the ledger the caller gives', async () => {
    const state = await stateDirectory()
    const stub = supervisor()
    const first = await indexWith(state, stub)
    const scope = scopeOf('scope-a')
    const { key, handed } = await handOver(first, scope)
    first.index.retire('generation-1')
    const second = await indexWith(state, stub)
    const ledger = endingLedger()
    expect(await second.index.stopRef(handed.process, scope, tenant, ledger.ledger)).toBe(
      'confirmed',
    )
    expect(ledger.stopped).toEqual([[key, 'confirmed']])
    second.index.retire('generation-1')
  })

  it('reads the tail of a retained process for its scope, tenant and generation only', async () => {
    const f = await indexWith(await stateDirectory())
    const scope = scopeOf('scope-a')
    const tail = createRetainedTail({ capacity: 16, savedFrom: { stdout: 5, stderr: 0 } })
    const key = randomUUID()
    const reservation = f.index.reserve(scope, tenant, key)
    if (typeof reservation === 'string') throw new Error('expected a reservation')
    f.stub.members(unitOf(key), [gatePid, 100])
    const { process } = await f.index.commit(reservation, {
      unit: unitOf(key),
      bootId,
      origin: originRef('call-1'),
      gatePid,
      members: 1,
      ledger: endingLedger().ledger,
      output: tail,
    })
    expect(await f.index.output(process, scope, tenant)).toEqual({ kind: 'none' })
    tail.append('stdout', new TextEncoder().encode('later'))
    expect(await f.index.output(process, scope, tenant, { stdout: 7 })).toMatchObject({
      kind: 'tail',
      streams: [{ stream: 'stdout', savedFrom: 5, start: 7, end: 10 }],
    })
    expect(await f.index.output(process, scopeOf('scope-b'), tenant)).toBe('notFound')
    expect(await f.index.output(process, scope, otherTenant)).toBe('notFound')
    expect(await f.index.output({ ...process, generation: 'x' }, scope, tenant)).toBe('notFound')
    expect(await f.index.stopRef(process, scope, tenant, endingLedger().ledger)).toBe('confirmed')
    expect(await f.index.output(process, scope, tenant)).toBe('notFound')
  })

  it('answers unavailable for a tail that was closed, until the process left the index', async () => {
    const f = await indexWith(await stateDirectory())
    const scope = scopeOf('scope-a')
    const tail = createRetainedTail({ capacity: 16, savedFrom: { stdout: 0, stderr: 0 } })
    tail.append('stdout', new TextEncoder().encode('kept'))
    const key = randomUUID()
    const reservation = f.index.reserve(scope, tenant, key)
    if (typeof reservation === 'string') throw new Error('expected a reservation')
    f.stub.members(unitOf(key), [gatePid, 100])
    const { process } = await f.index.commit(reservation, {
      unit: unitOf(key),
      bootId,
      origin: originRef('call-1'),
      gatePid,
      members: 1,
      ledger: endingLedger().ledger,
      output: tail,
    })
    expect(await f.index.output(process, scope, tenant)).toMatchObject({ kind: 'tail' })
    tail.close()
    expect(await f.index.output(process, scope, tenant)).toBe('unavailable')
    expect(await f.index.stopRef(process, scope, tenant, endingLedger().ledger)).toBe('confirmed')
    expect(await f.index.output(process, scope, tenant)).toBe('notFound')
  })

  it('answers unsupported when nothing is kept, and unavailable for one loaded after a restart', async () => {
    const state = await stateDirectory()
    const stub = supervisor()
    const first = await indexWith(state, stub)
    const scope = scopeOf('scope-a')
    const { handed } = await handOver(first, scope)
    expect(await first.index.output(handed.process, scope, tenant)).toEqual({
      kind: 'unsupported',
    })
    first.index.retire('generation-1')
    const second = await indexWith(state, stub)
    expect(await second.index.output(handed.process, scope, tenant)).toBe('unavailable')
    second.index.retire('generation-1')
  })

  it('answers unavailable, and asks no ledger, when the markers cannot be read', async () => {
    const state = await stateDirectory()
    await writeFile(join(state, 'retained-processes'), 'not a directory')
    const index = createRetainedProcessIndex({
      stateDirectory: state,
      provider: 'host-files',
      capacityPerScope: 8,
      pollMs: 60_000,
      supervision: async () => supervisor().supervision,
    })
    const asked: string[] = []
    const ledger = endingLedger(async key => {
      asked.push(key)
      return 'confirmed'
    })
    const ref = { id: 'k', generation: 'g' }
    expect(await index.stopRef(ref, scopeOf('scope-a'), tenant, ledger.ledger)).toBe('unavailable')
    expect(asked).toEqual([])
  })
})

// ---------------------------------------------------------------------------------------------
// The marker files a restart reads: what is accepted, what is discarded, what keeps the index unread

const scopeA = scopeOf('scope-a')
const tenantTextOf = (who: TenantId): string => {
  const encoded = tenantCodec.encode(who)
  if (!encoded.ok) throw new Error('tenant fixture did not encode')
  return encoded.value
}

/** A marker as the index writes it, for the file `<key>.json`. */
function markerOf(key: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    key,
    scope: scopeDigest(scopeA),
    tenant: tenantTextOf(tenant),
    unit: unitOf(key),
    bootId,
    origin: 'call-1',
    generation: 'generation-0',
    handedOverAtMs: 1,
    gatePid,
    ...over,
  }
}

async function writeMarkerFile(state: string, name: string, content: unknown): Promise<string> {
  const directory = join(state, 'retained-processes')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, name),
    typeof content === 'string' ? content : JSON.stringify(content),
  )
  return directory
}

const without = (marker: Record<string, unknown>, field: string) =>
  Object.fromEntries(Object.entries(marker).filter(([name]) => name !== field))

const textFields = ['key', 'scope', 'tenant', 'unit', 'bootId', 'origin', 'generation']
const invalidMarkers: [string, string][] = [
  ...textFields.flatMap((field): [string, string][] => [
    [`${field} missing`, JSON.stringify(without(markerOf('bad'), field))],
    [`${field} empty`, JSON.stringify(markerOf('bad', { [field]: '' }))],
    [`${field} a number`, JSON.stringify(markerOf('bad', { [field]: 7 }))],
  ]),
  ['version missing', JSON.stringify(without(markerOf('bad'), 'version'))],
  ['version 2', JSON.stringify(markerOf('bad', { version: 2 }))],
  ['version as text', JSON.stringify(markerOf('bad', { version: '1' }))],
  ['handedOverAtMs missing', JSON.stringify(without(markerOf('bad'), 'handedOverAtMs'))],
  ['handedOverAtMs as text', JSON.stringify(markerOf('bad', { handedOverAtMs: '1' }))],
  ['gatePid missing', JSON.stringify(without(markerOf('bad'), 'gatePid'))],
  ['gatePid fractional', JSON.stringify(markerOf('bad', { gatePid: 1.5 }))],
  ['gatePid as text', JSON.stringify(markerOf('bad', { gatePid: '4242' }))],
  ['gatePid beyond the safe integers', '{"version":1,"gatePid":1152921504606846976}'],
  ['marker of another file', JSON.stringify(markerOf('someone-else'))],
  ['JSON null', 'null'],
  ['JSON array', '[]'],
  ['JSON text', '"text"'],
  ['JSON number', '7'],
  ['JSON boolean', 'true'],
  ['truncated JSON', '{"version":1,'],
  ['empty file', ''],
]

it.each(invalidMarkers)(
  'discards a marker file that is not a marker of this version (%s) and still loads the others',
  async (_name, content) => {
    const state = await stateDirectory()
    const directory = await writeMarkerFile(state, 'bad.json', content)
    await writeMarkerFile(state, 'good.json', markerOf('good'))
    // Neither a leftover temporary file nor a foreign file is a marker: both are left alone.
    await writeFile(join(directory, '.good.1.tmp'), 'half written')
    await writeFile(join(directory, 'notes.txt'), '{}')
    const stub = supervisor()
    stub.members(unitOf('good'), [gatePid, 5, 6])
    const f = await indexWith(state, stub)
    expect(await f.index.list(scopeA, tenant)).toMatchObject([
      { process: { id: 'good' }, processes: 2 },
    ])
    expect(f.facts).toEqual([{ key: 'bad.json', unit: '', issue: 'discarded' }])
    expect((await readdir(directory)).sort()).toEqual(['.good.1.tmp', 'good.json', 'notes.txt'])
    // The marker discarded is not asked about: the supervisor was read for the good unit only.
    expect(stub.reads).toEqual([{ unit: unitOf('good') }, expect.anything()])
  },
)

it('loads a marker with a null gate and counts every member, one with a gate and counts the rest', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'a.json', markerOf('a', { gatePid: null }))
  await writeMarkerFile(state, 'b.json', markerOf('b', { gatePid: 7 }))
  await writeMarkerFile(state, 'c.json', markerOf('c', { gatePid: 0 }))
  const stub = supervisor()
  stub.members(unitOf('a'), [1, 2, 3])
  stub.members(unitOf('b'), [7, 8])
  stub.members(unitOf('c'), [0, 9])
  const f = await indexWith(state, stub)
  const listed = await f.index.list(scopeA, tenant)
  if (listed === 'unavailable') throw new Error('expected a list')
  expect(
    listed.map(item => [item.process.id, item.process.generation, item.processes]).sort(),
  ).toEqual([
    ['a', 'generation-0', 3],
    ['b', 'generation-0', 1],
    ['c', 'generation-0', 1],
  ])
  expect(f.facts).toEqual([])
  // The gate of a loaded marker stays out of the count when the unit holds nothing else.
  stub.members(unitOf('b'), [7])
  expect(await f.index.list(scopeA, tenant)).toMatchObject([
    { process: { id: 'a' } },
    { process: { id: 'c' } },
  ])
  expect(stub.stops).toEqual([{ unit: unitOf('b'), bootId }])
})

it('lists a loaded marker under its own scope and tenant only', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'mine.json', markerOf('mine'))
  await writeMarkerFile(
    state,
    'theirs.json',
    markerOf('theirs', { tenant: tenantTextOf(otherTenant) }),
  )
  await writeMarkerFile(
    state,
    'elsewhere.json',
    markerOf('elsewhere', { scope: scopeDigest(scopeOf('scope-b')) }),
  )
  const stub = supervisor()
  for (const key of ['mine', 'theirs', 'elsewhere']) stub.members(unitOf(key), [gatePid, 1])
  const f = await indexWith(state, stub)
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ process: { id: 'mine' } }])
  expect(await f.index.list(scopeA, otherTenant)).toMatchObject([{ process: { id: 'theirs' } }])
  expect(await f.index.list(scopeOf('scope-b'), tenant)).toMatchObject([
    { process: { id: 'elsewhere' } },
  ])
  expect(f.index.resources(scopeA).map(resource => resource.key)).toEqual(['mine', 'theirs'])
  expect(f.index.resources(scopeOf('scope-b')).map(resource => resource.key)).toEqual(['elsewhere'])
})

it('keeps a marker whose unit the supervisor answered for without a member list, with the members unknown', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.unreadable(unitOf('k1'))
  const f = await indexWith(state, stub)
  expect(await f.index.list(scopeA, tenant)).toMatchObject([
    { process: { id: 'k1' }, state: 'running', processes: 'unknown' },
  ])
  // No directory was read at the load: the reading asks the supervisor from the unit alone.
  expect(stub.reads).toEqual([{ unit: unitOf('k1') }, { unit: unitOf('k1'), directory: undefined }])
  // The reading that finally lists the members names the control group the next one starts from.
  stub.members(unitOf('k1'), [gatePid, 1, 2])
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ processes: 2 }])
  await f.index.list(scopeA, tenant)
  expect(stub.reads.at(-1)).toEqual({ unit: unitOf('k1'), directory: `/cgroup/${unitOf('k1')}` })
})

it('starts the next reading of a loaded unit from the control group the load found', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  const f = await indexWith(state, stub)
  await f.index.maintain()
  expect(stub.reads).toEqual([
    { unit: unitOf('k1') },
    { unit: unitOf('k1'), directory: `/cgroup/${unitOf('k1')}` },
  ])
})

it('does not discard what it could not read: an unreadable marker file, or an unknown boot, leaves the index unread and every marker in place', async () => {
  const state = await stateDirectory()
  const directory = await writeMarkerFile(state, 'good.json', markerOf('good'))
  await writeMarkerFile(state, 'bad.json', 'garbage')
  const stub = supervisor()
  stub.members(unitOf('good'), [gatePid, 1])
  // The boot cannot be read: nothing is judged against it.
  let boot: string | undefined
  const unknownBoot: RetainedSupervision = { ...stub.supervision, bootId: async () => boot }
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => unknownBoot,
  })
  expect(await index.ready()).toBe(false)
  expect(await readdir(directory)).toEqual(['bad.json', 'good.json'])
  // The same index reads again once the boot is known.
  boot = bootId
  expect(await index.ready()).toBe(true)
  expect(await readdir(directory)).toEqual(['good.json'])
  expect(await index.list(scopeA, tenant)).toMatchObject([{ process: { id: 'good' } }])
})

it('counts a failed load against nothing and retries it on the next call; a marker file it cannot open is never read as an empty unit', async context => {
  context.skip(process.getuid?.() === 0)
  const state = await stateDirectory()
  const directory = await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  let asked = 0
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 1,
    pollMs: 60_000,
    supervision: async () => {
      asked++
      return stub.supervision
    },
  })
  await chmod(join(directory, 'k1.json'), 0o000)
  try {
    expect(await index.ready()).toBe(false)
    expect(await index.list(scopeA, tenant)).toBe('unavailable')
    expect(index.reserve(scopeA, tenant, 'k2')).toBe('unavailable')
    expect(index.resources(scopeA)).toEqual([])
    expect(await index.closeScope(scopeA)).toEqual([])
    expect(
      await index.recover({
        key: 'k1',
        provider: 'host-files',
        reference: { kind: 'object', entries: [] },
      }),
    ).toBeUndefined()
  } finally {
    await chmod(join(directory, 'k1.json'), 0o644)
  }
  expect(await readdir(directory)).toEqual(['k1.json'])
  expect(stub.stops).toEqual([])
  // Each call after a failure reads again; one that succeeds is final and asks nothing more.
  expect(await index.ready()).toBe(true)
  const afterLoad = asked
  expect(await index.ready()).toBe(true)
  expect(asked).toBe(afterLoad)
  // The unit the marker names counts against the capacity of its scope.
  expect(index.reserve(scopeA, tenant, 'k2')).toBe('capacity')
})

it('reads the markers once for calls that arrive together', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  let boots = 0
  const counting: RetainedSupervision = {
    ...stub.supervision,
    bootId: async () => {
      boots++
      return bootId
    },
  }
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => counting,
  })
  expect(await Promise.all([index.ready(), index.ready(), index.list(scopeA, tenant)])).toEqual([
    true,
    true,
    expect.any(Array),
  ])
  expect(await index.ready()).toBe(true)
  expect(boots).toBe(1)
})

it('reads a directory with no markers as an empty index without asking the supervisor, and a missing one the same', async () => {
  let asked = 0
  const supervision = async () => {
    asked++
    return supervisor().supervision
  }
  const empty = await stateDirectory()
  await mkdir(join(empty, 'retained-processes'))
  await writeFile(join(empty, 'retained-processes', '.k1.2.tmp'), 'left over')
  const first = createRetainedProcessIndex({
    stateDirectory: empty,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision,
  })
  expect(await first.ready()).toBe(true)
  const second = createRetainedProcessIndex({
    stateDirectory: join(await stateDirectory(), 'not-created-yet'),
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision,
  })
  expect(await second.ready()).toBe(true)
  expect(asked).toBe(0)
  expect(typeof first.reserve(scopeA, tenant, 'k1')).toBe('object')
})

it('reports a marker it cannot delete as discarded, and discards it again at the next load', async context => {
  context.skip(process.getuid?.() === 0)
  const state = await stateDirectory()
  const directory = await writeMarkerFile(state, 'bad.json', 'garbage')
  await chmod(directory, 0o555)
  try {
    const f = await indexWith(state)
    expect(f.facts).toEqual([{ key: 'bad.json', unit: '', issue: 'discarded' }])
    expect(await readdir(directory)).toEqual(['bad.json'])
  } finally {
    await chmod(directory, 0o755)
  }
  const again = await indexWith(state)
  expect(again.facts).toEqual([{ key: 'bad.json', unit: '', issue: 'discarded' }])
  expect(await readdir(directory)).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// Reservations, the scopes and tenants an index keeps apart, and the stops it records

function reserveOrThrow(
  f: Awaited<ReturnType<typeof indexWith>>,
  scope: ScopeRef,
  key: string,
  who = tenant,
): RetainedReservation {
  const reservation = f.index.reserve(scope, who, key)
  if (typeof reservation === 'string') throw new Error(`expected a reservation: ${reservation}`)
  return reservation
}

const handoverOf = (key: string, ledger: RetainedProcessLedger) => ({
  unit: unitOf(key),
  bootId,
  origin: originRef('call-1'),
  gatePid,
  members: 2,
  ledger,
})

it('answers unavailable to a tenant that is not a parsed one, and takes no place for it', async () => {
  const f = await indexWith(await stateDirectory(), supervisor(), { capacity: 1 })
  // The same members without the mark that only parsing gives.
  const forged: TenantId = { ...tenant }
  expect(f.index.reserve(scopeA, forged, 'k1')).toBe('unavailable')
  expect(await f.index.list(scopeA, forged)).toBe('unavailable')
  expect(typeof f.index.reserve(scopeA, tenant, 'k2')).toBe('object')
})

it('keeps a reservation apart from the handed-over processes: it is not listed, not a resource, not stopped or recovered, and only a commit makes it one', async () => {
  const f = await indexWith(await stateDirectory(), supervisor(), { capacity: 3 })
  const reservation = reserveOrThrow(f, scopeA, 'k1')
  const held = await handOver(f, scopeA)
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ process: { id: held.key } }])
  expect(f.index.resources(scopeA).map(resource => resource.key)).toEqual([held.key])
  // Closing the scope stops what was handed over and leaves the place taken.
  expect(await f.index.closeScope(scopeA)).toEqual([])
  expect(f.stub.stops).toEqual([{ unit: unitOf(held.key), bootId }])
  expect(await f.index.stop('k1')).toBe('unconfirmed')
  expect(
    await f.index.recover({
      key: 'k1',
      provider: 'host-files',
      reference: { kind: 'object', entries: [] },
    }),
  ).toBeUndefined()
  expect(f.stub.stops).toHaveLength(1)
  const ledger = ledgerStub()
  f.stub.members(unitOf('k1'), [gatePid, 1])
  const handed = await f.index.commit(reservation, handoverOf('k1', ledger.ledger))
  expect(handed.process.id).toBe('k1')
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ process: { id: 'k1' } }])
})

it('gives a place back once, whatever the order: after an abort, after a commit, after the process left', async () => {
  const f = await indexWith(await stateDirectory(), supervisor(), { capacity: 1 })
  const first = reserveOrThrow(f, scopeA, 'k1')
  first.abort()
  expect(() => first.abort()).not.toThrow()
  const second = reserveOrThrow(f, scopeA, 'k2')
  f.stub.members(unitOf('k2'), [gatePid, 1])
  await f.index.commit(second, handoverOf('k2', ledgerStub().ledger))
  // A commit is not given back by the abort the integrator still holds.
  second.abort()
  expect(f.index.reserve(scopeA, tenant, 'k3')).toBe('capacity')
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ process: { id: 'k2' } }])
  // The process leaves the index: its reservation object aborting then changes nothing.
  expect(await f.index.stop('k2')).toBe('confirmed')
  expect(() => second.abort()).not.toThrow()
  expect(typeof f.index.reserve(scopeA, tenant, 'k3')).toBe('object')
})

it('refuses a commit without a live reservation: a given-back one, a committed one, one of nobody', async () => {
  const f = await indexWith(await stateDirectory())
  const message = 'a handover commit without a live reservation'
  const ledger = ledgerStub().ledger
  const aborted = reserveOrThrow(f, scopeA, 'k1')
  aborted.abort()
  await expect(f.index.commit(aborted, handoverOf('k1', ledger))).rejects.toThrow(message)
  expect(() => f.index.commitStopping(aborted, handoverOf('k1', ledger))).toThrow(message)
  const live = reserveOrThrow(f, scopeA, 'k2')
  f.stub.members(unitOf('k2'), [gatePid, 1])
  await f.index.commit(live, handoverOf('k2', ledger))
  await expect(f.index.commit(live, handoverOf('k2', ledger))).rejects.toThrow(message)
  expect(() => f.index.commitStopping(live, handoverOf('k2', ledger))).toThrow(message)
  await expect(
    f.index.commit({ key: 'nobody', abort: () => undefined }, handoverOf('nobody', ledger)),
  ).rejects.toThrow(message)
  // What was refused changed nothing for the live one.
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ process: { id: 'k2' } }])
})

it('keeps the processes of two tenants and two scopes apart, in the list, the resources and the closure', async () => {
  const f = await indexWith(await stateDirectory())
  const scopeB = scopeOf('scope-b')
  const mineInA = await handOver(f, scopeA, tenant)
  const theirsInA = await handOver(f, scopeA, otherTenant)
  const mineInB = await handOver(f, scopeB, tenant)
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ process: { id: mineInA.key } }])
  expect(await f.index.list(scopeA, otherTenant)).toMatchObject([
    { process: { id: theirsInA.key } },
  ])
  expect(await f.index.list(scopeB, otherTenant)).toEqual([])
  expect(f.index.resources(scopeA).map(resource => resource.key)).toEqual([
    mineInA.key,
    theirsInA.key,
  ])
  expect(f.index.resources(scopeB).map(resource => resource.key)).toEqual([mineInB.key])
  expect(await f.index.closeScope(scopeA)).toEqual([])
  expect(f.stub.stops.map(stop => stop.unit).sort()).toEqual(
    [unitOf(mineInA.key), unitOf(theirsInA.key)].sort(),
  )
  expect(mineInB.ledger.stopped).toEqual([])
  expect(await f.index.list(scopeB, tenant)).toMatchObject([{ process: { id: mineInB.key } }])
})

it('reads the units when it lists: the members now, and a unit that holds nothing else is settled instead of listed', async () => {
  const f = await indexWith(await stateDirectory())
  const { key, ledger } = await handOver(f, scopeA)
  f.stub.members(unitOf(key), [gatePid, 1, 2, 3])
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ processes: 3 }])
  f.stub.members(unitOf(key), [gatePid])
  expect(await f.index.list(scopeA, tenant)).toEqual([])
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(f.stub.stops).toEqual([{ unit: unitOf(key), bootId }])
})

it('lists what it holds, unread, while the supervisor cannot be had, and stops nothing', async () => {
  let current: RetainedSupervision | undefined
  const stub = supervisor()
  current = stub.supervision
  const f = await indexWith(await stateDirectory(), stub, { supervision: async () => current })
  const { key, ledger } = await handOver(f, scopeA)
  stub.members(unitOf(key), [gatePid])
  current = undefined
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ state: 'running', processes: 2 }])
  // The maintenance reports what it holds, as it cannot read any of it.
  expect(await f.index.maintain()).toBe(1)
  expect(stub.reads).toEqual([])
  // A stop that cannot be issued is not confirmed, and not recorded.
  expect(await f.index.stop(key)).toBe('unconfirmed')
  expect(ledger.stopped).toEqual([])
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ state: 'stopping' }])
  expect(await f.index.maintain()).toBe(1)
  // The supervisor is back: the maintenance stops it again and it leaves.
  current = stub.supervision
  expect(await f.index.maintain()).toBe(0)
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(await f.index.list(scopeA, tenant)).toEqual([])
})

it('does not read a unit that is being stopped, and counts it as stopping until the stop is confirmed', async () => {
  const f = await indexWith(await stateDirectory())
  const held = await handOver(f, scopeA)
  const quiet = await handOver(f, scopeA)
  f.stub.members(unitOf(quiet.key), [gatePid, 1, 2])
  expect(await f.index.maintain()).toBe(0)
  expect(f.stub.stops).toEqual([])
  f.stub.answerStops({ status: 'unconfirmed' })
  expect(await f.index.stop(held.key)).toBe('unconfirmed')
  f.stub.reads.length = 0
  expect(await f.index.maintain()).toBe(1)
  // The stopping one is stopped again, not read; the running one is read.
  expect(f.stub.stops.filter(stop => stop.unit === unitOf(held.key))).toHaveLength(2)
  expect(f.stub.reads.map(read => read.unit)).toEqual([unitOf(quiet.key)])
})

it('answers confirmed to a stop of a process it does not hold', async () => {
  const f = await indexWith(await stateDirectory())
  expect(await f.index.stop('never-held')).toBe('confirmed')
  expect(f.stub.stops).toEqual([])
})

it('keeps a stop the supervisor confirmed while the ledger could not record it, and settles it once the ledger can', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const recording = { mode: 'unavailable' as 'unavailable' | 'throws' | 'recorded' }
  const attempts: string[] = []
  const ledger: RetainedProcessLedger = {
    ...ledgerStub().ledger,
    stopped: async (key, status) => {
      attempts.push(`${key} ${status}`)
      if (recording.mode === 'throws') throw new Error('ledger down')
      return recording.mode === 'recorded' ? 'recorded' : 'unavailable'
    },
  }
  const { key } = await handOver(f, scopeA, tenant, { ledger, stopped: [] })
  const markerFile = join(state, 'retained-processes', `${key}.json`)
  for (const mode of ['unavailable', 'throws'] as const) {
    recording.mode = mode
    expect(await f.index.stop(key)).toBe('confirmed')
    // Confirmed is not recorded: the entry and its marker stay, and it is listed as stopping.
    expect(existsSync(markerFile)).toBe(true)
    expect(f.index.resources(scopeA).map(resource => resource.key)).toEqual([key])
    expect(await f.index.closeScope(scopeA)).toHaveLength(1)
    expect(await f.index.maintain()).toBe(1)
  }
  expect(attempts.length).toBeGreaterThanOrEqual(4)
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ state: 'stopping' }])
  recording.mode = 'recorded'
  expect(await f.index.maintain()).toBe(0)
  expect(attempts.at(-1)).toBe(`${key} confirmed`)
  expect(existsSync(markerFile)).toBe(false)
  expect(await f.index.list(scopeA, tenant)).toEqual([])
})

it('records the stops of a closed scope on the ledger the entry has, else the one the closure is given, else the last one an acquisition gave; with none, the stop still settles it', async () => {
  const state = await stateDirectory()
  const first = await indexWith(state)
  const own = await handOver(first, scopeA)
  const another = await handOver(first, scopeOf('scope-b'))
  const closing = ledgerStub()
  expect(await first.index.closeScope(scopeA, closing.ledger)).toEqual([])
  expect(own.ledger.stopped).toEqual([[own.key, 'confirmed']])
  expect(closing.stopped).toEqual([])
  expect(another.ledger.stopped).toEqual([])

  // After a restart the entries have no ledger of their own.
  const stub = supervisor()
  stub.members(unitOf(another.key), [gatePid, 1])
  await writeMarkerFile(state, 'k-view.json', markerOf('k-view', { scope: scopeDigest(scopeA) }))
  await writeMarkerFile(
    state,
    'k-none.json',
    markerOf('k-none', { scope: scopeDigest(scopeOf('scope-c')) }),
  )
  stub.members(unitOf('k-view'), [gatePid, 1])
  stub.members(unitOf('k-none'), [gatePid, 1])
  const third = await indexWith(state, stub)
  expect(third.index.resources(scopeA).map(resource => resource.key)).toEqual(['k-view'])
  const view = ledgerStub()
  third.index.watchClosure(new AbortController().signal, scopeA, view.ledger)
  expect(await third.index.closeScope(scopeA)).toEqual([])
  expect(view.stopped).toEqual([['k-view', 'confirmed']])
  // No ledger anywhere: the supervisor's confirmation settles the entry and removes its marker.
  expect(await third.index.closeScope(scopeOf('scope-c'))).toEqual([])
  expect(existsSync(join(state, 'retained-processes', 'k-none.json'))).toBe(false)
  expect(stub.stops.map(stop => stop.unit).sort()).toEqual([unitOf('k-none'), unitOf('k-view')])
})

it('closes a scope after waiting for the markers to be read', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => stub.supervision,
  })
  const ledger = ledgerStub()
  expect(await index.closeScope(scopeA, ledger.ledger)).toEqual([])
  expect(ledger.stopped).toEqual([['k1', 'confirmed']])
})

it('returns the resources of what the closure could not confirm', async () => {
  const f = await indexWith(await stateDirectory())
  const held = await handOver(f, scopeA)
  f.stub.answerStops({ status: 'unconfirmed' })
  const closed = await f.index.closeScope(scopeA)
  expect(closed).toEqual(f.index.resources(scopeA))
  expect(closed.map(resource => resource.key)).toEqual([held.key])
  expect(held.ledger.stopped).toEqual([[held.key, 'unconfirmed']])
})

it('waits for the stop a commit was given and counts an issued stop that failed as unconfirmed', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const key = randomUUID()
  const reservation = reserveOrThrow(f, scopeA, key)
  const ledger = ledgerStub()
  const stopping = await f.index.commitStopping(reservation, {
    ...handoverOf(key, ledger.ledger),
    issued: Promise.reject(new Error('the stop was lost')),
  })
  expect(stopping).toBe('unconfirmed')
  expect(ledger.stopped).toEqual([[key, 'unconfirmed']])
  expect(f.stub.stops).toEqual([])
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ state: 'stopping' }])
})

it('recovers only the resource it names: the same key with another unit or boot is not it, and what has not been read yet is read first', async () => {
  const state = await stateDirectory()
  const first = await indexWith(state)
  const { key } = await handOver(first, scopeA)
  const resource = first.index.resources(scopeA)[0]
  if (resource === undefined) throw new Error('expected a resource')
  const elsewhere: ManagedResource = {
    ...resource,
    reference: {
      kind: 'object',
      entries: [
        { key: 'unit', value: { kind: 'string', value: unitOf('other') } },
        { key: 'bootId', value: { kind: 'string', value: bootId } },
      ],
    },
  }
  const otherBoot: ManagedResource = {
    ...resource,
    reference: {
      kind: 'object',
      entries: [
        { key: 'unit', value: { kind: 'string', value: unitOf(key) } },
        { key: 'bootId', value: { kind: 'string', value: 'boot-2' } },
      ],
    },
  }
  expect(await first.index.recover(elsewhere)).toBeUndefined()
  expect(await first.index.recover(otherBoot)).toBeUndefined()
  expect(first.stub.stops).toEqual([])
  // A restarted index that has not read its markers reads them for the recovery.
  const stub = supervisor()
  stub.members(unitOf(key), [gatePid, 1])
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => stub.supervision,
  })
  expect(await index.recover(resource)).toBe('confirmed')
  expect(stub.stops).toEqual([{ unit: unitOf(key), bootId }])
  expect(await readdir(join(state, 'retained-processes'))).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// The closure of a scope when its signal aborts

function listeningTo(signal: AbortSignal) {
  return vi.spyOn(signal, 'addEventListener')
}

it('closes the scope when the signal aborts, with the ledger the acquisition gave, and no other scope', async () => {
  const f = await indexWith(await stateDirectory())
  const mine = await handOver(f, scopeA)
  const other = await handOver(f, scopeOf('scope-b'))
  const controller = new AbortController()
  f.index.watchClosure(controller.signal, scopeA, ledgerStub().ledger)
  expect(f.stub.stops).toEqual([])
  controller.abort()
  await vi.waitFor(() => expect(f.stub.stops).toEqual([{ unit: unitOf(mine.key), bootId }]))
  await vi.waitFor(() => expect(mine.ledger.stopped).toEqual([[mine.key, 'confirmed']]))
  expect(other.ledger.stopped).toEqual([])
  expect(await f.index.list(scopeOf('scope-b'), tenant)).toHaveLength(1)
})

it('listens once to a signal however many acquisitions give it, and records on the last ledger given for the scope', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  const f = await indexWith(state, stub)
  const controller = new AbortController()
  const listening = listeningTo(controller.signal)
  const early = ledgerStub()
  const late = ledgerStub()
  f.index.watchClosure(controller.signal, scopeA, early.ledger)
  f.index.watchClosure(controller.signal, scopeA, late.ledger)
  expect(listening.mock.calls.filter(([type]) => type === 'abort')).toHaveLength(1)
  // A second signal for another scope is a listener of its own.
  const otherSignal = new AbortController()
  const otherListening = listeningTo(otherSignal.signal)
  f.index.watchClosure(otherSignal.signal, scopeOf('scope-b'), early.ledger)
  expect(otherListening).toHaveBeenCalledTimes(1)
  controller.abort()
  await vi.waitFor(() => expect(late.stopped).toEqual([['k1', 'confirmed']]))
  expect(early.stopped).toEqual([])
  expect(stub.stops).toEqual([{ unit: unitOf('k1'), bootId }])
})

it('records the self-settlement of a process loaded after a restart on the view an acquisition gave for its scope, so a stop asked later answers confirmed', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  // Only the gate is left: the unit is empty and the maintenance settles it.
  stub.members(unitOf('k1'), [gatePid])
  const f = await indexWith(state, stub)
  const view = endingLedger()
  f.index.watchClosure(new AbortController().signal, scopeA, view.ledger)
  expect(await f.index.maintain()).toBe(0)
  expect(stub.stops).toEqual([{ unit: unitOf('k1'), bootId }])
  expect(view.stopped).toEqual([['k1', 'confirmed']])
  expect(await f.index.list(scopeA, tenant)).toEqual([])
  const ref = { id: 'k1', generation: 'generation-0' }
  expect(await f.index.stopRef(ref, scopeA, tenant, view.ledger)).toBe('confirmed')
})

it('closes the scope at once for a signal that has aborted, listens to nothing, and keeps the ledger for later closures', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  await writeMarkerFile(state, 'k2.json', markerOf('k2'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  stub.members(unitOf('k2'), [gatePid, 1])
  const f = await indexWith(state, stub)
  const aborted = AbortSignal.abort()
  const listening = listeningTo(aborted)
  const view = ledgerStub()
  f.index.watchClosure(aborted, scopeA, view.ledger)
  await vi.waitFor(() => expect(view.stopped.map(([key]) => key).sort()).toEqual(['k1', 'k2']))
  expect(listening).not.toHaveBeenCalled()
  expect(await f.index.list(scopeA, tenant)).toEqual([])
})

// ---------------------------------------------------------------------------------------------
// The marker file through the life of an entry

it('does not write again a marker it wrote, and leaves no temporary file behind', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const { key } = await handOver(f, scopeA)
  const directory = join(state, 'retained-processes')
  expect(await readdir(directory)).toEqual([`${key}.json`])
  await rm(join(directory, `${key}.json`))
  await f.index.maintain()
  expect(await readdir(directory)).toEqual([])
  expect(f.facts).toEqual([])
})

it('leaves no temporary file when the marker cannot be put in place, and says it was not written', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const key = randomUUID()
  const directory = join(state, 'retained-processes')
  // A non-empty directory holds the marker's name: the rename fails after the file was written.
  await mkdir(join(directory, `${key}.json`), { recursive: true })
  await writeFile(join(directory, `${key}.json`, 'occupant'), 'x')
  const reservation = reserveOrThrow(f, scopeA, key)
  f.stub.members(unitOf(key), [gatePid, 1])
  const handed = await f.index.commit(reservation, handoverOf(key, ledgerStub().ledger))
  expect(handed.marker).toBe('notWritten')
  expect(f.facts).toEqual([{ key, unit: unitOf(key), issue: 'notWritten' }])
  expect(await readdir(directory)).toEqual([`${key}.json`])
})

it('says a marker could not be removed when its stop is confirmed, and still lets the process go', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const { key, ledger } = await handOver(f, scopeA)
  const file = join(state, 'retained-processes', `${key}.json`)
  await rm(file)
  await mkdir(file)
  await writeFile(join(file, 'occupant'), 'x')
  expect(await f.index.stop(key)).toBe('confirmed')
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(f.facts).toEqual([{ key, unit: unitOf(key), issue: 'notRemoved' }])
  expect(await f.index.list(scopeA, tenant)).toEqual([])
})

it('has nothing to report when it removes the marker of a process whose marker was never written', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  await writeFile(join(state, 'retained-processes'), 'in the way')
  const { key } = await handOver(f, scopeA)
  expect(f.facts).toEqual([{ key, unit: unitOf(key), issue: 'notWritten' }])
  await rm(join(state, 'retained-processes'))
  await mkdir(join(state, 'retained-processes'))
  expect(await f.index.stop(key)).toBe('confirmed')
  expect(f.facts).toHaveLength(1)
  expect(await readdir(join(state, 'retained-processes'))).toEqual([])
})

it('removes the marker that lands after its process was settled by a closure of the scope', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const key = randomUUID()
  const reservation = reserveOrThrow(f, scopeA, key)
  f.stub.members(unitOf(key), [gatePid, 1])
  const ledger = ledgerStub()
  const committing = f.index.commit(reservation, handoverOf(key, ledger.ledger))
  expect(await f.index.closeScope(scopeA)).toEqual([])
  expect((await committing).marker).toBe('written')
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
  expect(await readdir(join(state, 'retained-processes'))).toEqual([])
})

it('does not let a throwing diagnostic sink change what the index answers', async () => {
  const state = await stateDirectory()
  const stub = supervisor()
  const index = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 8,
    pollMs: 60_000,
    supervision: async () => stub.supervision,
    diagnose: () => {
      throw new Error('sink down')
    },
  })
  await writeFile(join(state, 'retained-processes'), 'in the way')
  expect(await index.ready()).toBe(false)
  await rm(join(state, 'retained-processes'))
  await writeMarkerFile(state, 'bad.json', 'garbage')
  expect(await index.ready()).toBe(true)
  const key = randomUUID()
  const reservation = index.reserve(scopeA, tenant, key)
  if (typeof reservation === 'string') throw new Error('expected a reservation')
  await rm(join(state, 'retained-processes'), { recursive: true })
  await writeFile(join(state, 'retained-processes'), 'in the way')
  stub.members(unitOf(key), [gatePid, 1])
  const handed = await index.commit(reservation, handoverOf(key, ledgerStub().ledger))
  expect(handed.marker).toBe('notWritten')
})

// ---------------------------------------------------------------------------------------------
// The polling: it runs while a generation is joined and the index holds something to read

const pollMs = 1_000

/** Lets the timer fire and the readings it starts, which only wait on the supervisor stub, finish. */
async function elapse(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms)
}

it('reads the held units every pollMs while a generation is joined, and not before', async () => {
  vi.useFakeTimers()
  const f = await indexWith(await stateDirectory(), supervisor(), { pollMs })
  expect(vi.getTimerCount()).toBe(0)
  const { key } = await handOver(f, scopeA)
  expect(vi.getTimerCount()).toBe(1)
  await elapse(pollMs - 1)
  expect(f.stub.reads).toEqual([])
  await elapse(1)
  expect(f.stub.reads.map(read => read.unit)).toEqual([unitOf(key)])
  await elapse(pollMs)
  expect(f.stub.reads).toHaveLength(2)
  await elapse(pollMs)
  expect(f.stub.reads).toHaveLength(3)
  expect(vi.getTimerCount()).toBe(1)
})

it('does not hold the process open for the polling', async () => {
  vi.useFakeTimers()
  const timers = vi.spyOn(globalThis, 'setInterval')
  const f = await indexWith(await stateDirectory(), supervisor(), { pollMs })
  await handOver(f, scopeA)
  expect(timers).toHaveBeenCalledTimes(1)
  expect(timers.mock.calls[0]?.[1]).toBe(pollMs)
  expect(timers.mock.results[0]?.value.hasRef()).toBe(false)
})

it('settles a unit that holds only its gate from the polling alone', async () => {
  vi.useFakeTimers()
  const state = await stateDirectory()
  const f = await indexWith(state, supervisor(), { pollMs })
  const { key, ledger } = await handOver(f, scopeA)
  f.stub.members(unitOf(key), [gatePid])
  await elapse(pollMs)
  await vi.waitFor(() => expect(ledger.stopped).toEqual([[key, 'confirmed']]))
  await vi.waitFor(async () => expect(await readdir(join(state, 'retained-processes'))).toEqual([]))
  expect(f.stub.stops).toEqual([{ unit: unitOf(key), bootId }])
})

it('stops polling when the last generation retires, and polls again when one joins', async () => {
  vi.useFakeTimers()
  const f = await indexWith(await stateDirectory(), supervisor(), { pollMs })
  f.index.join('generation-2')
  await handOver(f, scopeA)
  f.index.retire('generation-1')
  expect(vi.getTimerCount()).toBe(1)
  await elapse(pollMs)
  expect(f.stub.reads).toHaveLength(1)
  f.index.retire('generation-2')
  expect(vi.getTimerCount()).toBe(0)
  await elapse(5 * pollMs)
  expect(f.stub.reads).toHaveLength(1)
  f.index.join('generation-3')
  expect(vi.getTimerCount()).toBe(1)
  await elapse(pollMs)
  expect(f.stub.reads).toHaveLength(2)
  // Joining again, or the same generation twice, does not add a second timer.
  f.index.join('generation-4')
  f.index.join('generation-3')
  expect(vi.getTimerCount()).toBe(1)
  await elapse(pollMs)
  expect(f.stub.reads).toHaveLength(3)
  // Retiring one of several keeps the polling; a generation never joined changes nothing.
  f.index.retire('generation-3')
  f.index.retire('never-joined')
  expect(vi.getTimerCount()).toBe(1)
  f.index.retire('generation-4')
  expect(vi.getTimerCount()).toBe(0)
})

it('does not poll before a generation has joined, and starts when one does', async () => {
  vi.useFakeTimers()
  const f = await indexWith(await stateDirectory(), supervisor(), { pollMs, join: false })
  await handOver(f, scopeA)
  expect(vi.getTimerCount()).toBe(0)
  await elapse(3 * pollMs)
  expect(f.stub.reads).toEqual([])
  f.index.join('generation-1')
  expect(vi.getTimerCount()).toBe(1)
  await elapse(pollMs)
  expect(f.stub.reads).toHaveLength(1)
})

it('starts no timer for an index that holds nothing, and asks the supervisor for nothing once it holds nothing again', async () => {
  vi.useFakeTimers()
  let asked = 0
  const stub = supervisor()
  const f = await indexWith(await stateDirectory(), stub, {
    pollMs,
    supervision: async () => {
      asked++
      return stub.supervision
    },
  })
  f.index.join('generation-2')
  await elapse(3 * pollMs)
  expect(vi.getTimerCount()).toBe(0)
  expect(asked).toBe(0)
  const { key } = await handOver(f, scopeA)
  expect(vi.getTimerCount()).toBe(1)
  stub.members(unitOf(key), [gatePid])
  await elapse(pollMs)
  await vi.waitFor(async () => expect(await f.index.list(scopeA, tenant)).toEqual([]))
  const before = asked
  await elapse(3 * pollMs)
  expect(asked).toBe(before)
})

it('polls the processes a restart found, and polls nothing when the restart found none to keep', async () => {
  vi.useFakeTimers()
  const kept = await stateDirectory()
  await writeMarkerFile(kept, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  const loaded = await indexWith(kept, stub, { pollMs })
  expect(vi.getTimerCount()).toBe(1)
  stub.reads.length = 0
  await elapse(pollMs)
  expect(stub.reads).toEqual([{ unit: unitOf('k1'), directory: `/cgroup/${unitOf('k1')}` }])
  loaded.index.retire('generation-1')

  const discarded = await stateDirectory()
  await writeMarkerFile(discarded, 'bad.json', 'garbage')
  const quiet = supervisor()
  const empty = await indexWith(discarded, quiet, { pollMs })
  expect(vi.getTimerCount()).toBe(0)
  expect(await empty.index.maintain()).toBe(0)
  expect(quiet.reads).toEqual([])
})

it('polls the process of a commit that was interrupted, stopping it again until the stop is confirmed', async () => {
  vi.useFakeTimers()
  const f = await indexWith(await stateDirectory(), supervisor(), { pollMs })
  const key = randomUUID()
  const reservation = reserveOrThrow(f, scopeA, key)
  f.stub.answerStops({ status: 'unconfirmed' })
  const ledger = ledgerStub()
  expect(await f.index.commitStopping(reservation, handoverOf(key, ledger.ledger))).toBe(
    'unconfirmed',
  )
  expect(vi.getTimerCount()).toBe(1)
  expect(f.stub.stops).toHaveLength(1)
  await elapse(pollMs)
  await vi.waitFor(() => expect(f.stub.stops).toHaveLength(2))
  f.stub.answerStops({ status: 'confirmed' })
  await vi.waitFor(() => expect(ledger.stopped.at(-1)).toEqual([key, 'confirmed']))
  expect(await f.index.list(scopeA, tenant)).toEqual([])
})

it('records the time of the handover from the wall clock, and a new generation for each handover', async () => {
  vi.useFakeTimers()
  vi.setSystemTime(1_700_000_000_000)
  const state = await stateDirectory()
  const f = await indexWith(state)
  const first = await handOver(f, scopeA)
  vi.setSystemTime(1_700_000_005_000)
  const second = await handOver(f, scopeA)
  expect(first.handed.process.generation).not.toBe(second.handed.process.generation)
  expect(first.handed.process.generation).not.toBe('')
  const listed = await f.index.list(scopeA, tenant)
  if (listed === 'unavailable') throw new Error('expected a list')
  expect(listed.map(item => [item.process.id, item.handedOverAtMs]).sort()).toEqual(
    [
      [first.key, 1_700_000_000_000],
      [second.key, 1_700_000_005_000],
    ].sort(),
  )
  const marker: unknown = JSON.parse(
    await readFile(join(state, 'retained-processes', `${second.key}.json`), 'utf8'),
  )
  expect(marker).toMatchObject({
    handedOverAtMs: 1_700_000_005_000,
    generation: second.handed.process.generation,
  })
})

it('retires the last generation of an index that holds nothing without trouble, and polls once it holds something again', async () => {
  vi.useFakeTimers()
  const f = await indexWith(await stateDirectory(), supervisor(), { pollMs })
  expect(() => f.index.retire('generation-1')).not.toThrow()
  expect(vi.getTimerCount()).toBe(0)
  f.index.join('generation-2')
  await handOver(f, scopeA)
  expect(vi.getTimerCount()).toBe(1)
})

// ---------------------------------------------------------------------------------------------
// What a marker carries, what a loaded entry knows before it is read again, and the reading itself

it('writes a null gate for a handover that had none, and reads every member of such a unit after a restart', async () => {
  const state = await stateDirectory()
  const f = await indexWith(state)
  const key = randomUUID()
  const reservation = reserveOrThrow(f, scopeA, key)
  f.stub.members(unitOf(key), [11, 12])
  await f.index.commit(reservation, {
    ...handoverOf(key, ledgerStub().ledger),
    gatePid: undefined,
    members: 2,
  })
  expect(
    JSON.parse(await readFile(join(state, 'retained-processes', `${key}.json`), 'utf8')),
  ).toMatchObject({
    gatePid: null,
  })
  const stub = supervisor()
  stub.members(unitOf(key), [11, 12])
  const second = await indexWith(state, stub)
  expect(await second.index.list(scopeA, tenant)).toMatchObject([{ processes: 2 }])
})

it('reads the marker text as UTF-8, and lists the handover time the marker records', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(
    state,
    'k1.json',
    markerOf('k1', { origin: 'appel-é-世界', handedOverAtMs: 1_234 }),
  )
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  const f = await indexWith(state, stub)
  expect(await f.index.list(scopeA, tenant)).toEqual([
    {
      process: { id: 'k1', generation: 'generation-0' },
      origin: 'appel-é-世界',
      handedOverAtMs: 1_234,
      state: 'running',
      processes: 1,
    },
  ])
})

it('does not write a loaded marker again: what the file says is the truth the index was started from', async () => {
  const state = await stateDirectory()
  const directory = await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1])
  const f = await indexWith(state, stub)
  await rm(join(directory, 'k1.json'))
  await f.index.maintain()
  expect(await readdir(directory)).toEqual([])
  expect(f.facts).toEqual([])
})

it('does not read a marker of a unit the supervisor could not answer for: the index stays unread, and reads again when it can', async () => {
  const state = await stateDirectory()
  const directory = await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  const f = createRetainedProcessIndex({
    stateDirectory: state,
    provider: 'host-files',
    capacityPerScope: 1,
    pollMs: 60_000,
    supervision: async () => stub.supervision,
  })
  // The tool itself failed: not a gone unit, not an empty one.
  expect(await f.ready()).toBe(false)
  expect(await f.list(scopeA, tenant)).toBe('unavailable')
  expect(f.reserve(scopeA, tenant, 'k2')).toBe('unavailable')
  expect(await readdir(directory)).toEqual(['k1.json'])
  expect(stub.stops).toEqual([])
  stub.members(unitOf('k1'), [gatePid])
  expect(await f.ready()).toBe(true)
  // A unit that holds only its gate is read as it is: settled by the next reading, not dropped here.
  expect(f.reserve(scopeA, tenant, 'k2')).toBe('capacity')
})

it('keeps what the load read about a unit while the supervisor cannot be had', async () => {
  const state = await stateDirectory()
  await writeMarkerFile(state, 'k1.json', markerOf('k1'))
  const stub = supervisor()
  stub.members(unitOf('k1'), [gatePid, 1, 2])
  let current: RetainedSupervision | undefined = stub.supervision
  const f = await indexWith(state, stub, { supervision: async () => current })
  current = undefined
  expect(await f.index.list(scopeA, tenant)).toMatchObject([
    { process: { id: 'k1' }, processes: 2 },
  ])
  expect(stub.reads).toHaveLength(1)
})

it('lists a unit the supervisor reports gone as stopping, with no members, while its stop is not confirmed', async () => {
  const f = await indexWith(await stateDirectory())
  const { key, ledger } = await handOver(f, scopeA)
  f.stub.gone(unitOf(key))
  f.stub.answerStops({ status: 'unconfirmed' })
  expect(await f.index.list(scopeA, tenant)).toMatchObject([{ state: 'stopping', processes: 0 }])
  expect(ledger.stopped).toEqual([[key, 'unconfirmed']])
})

it('shares one reading among maintenance calls that arrive together', async () => {
  const stub = supervisor()
  const gate = deferred<MembersReading>()
  const reads: string[] = []
  const slow: RetainedSupervision = {
    ...stub.supervision,
    members: input => {
      reads.push(input.unit)
      return gate.promise
    },
  }
  const f = await indexWith(await stateDirectory(), stub, { supervision: async () => slow })
  await handOver(f, scopeA)
  const first = f.index.maintain()
  const again = f.index.maintain()
  await vi.waitFor(() => expect(reads).toHaveLength(1))
  gate.resolve({ kind: 'members', pids: [gatePid, 1], directory: '/cgroup/x' })
  expect(await Promise.all([first, again])).toEqual([0, 0])
  expect(reads).toHaveLength(1)
  // Once the reading finished, the next call reads again.
  await f.index.maintain()
  expect(reads).toHaveLength(2)
})

it('reads the units it holds, and not a place that is only reserved', async () => {
  const f = await indexWith(await stateDirectory())
  const reservation = reserveOrThrow(f, scopeA, 'reserved-only')
  expect(await f.index.maintain()).toBe(0)
  expect(f.stub.reads).toEqual([])
  const held = await handOver(f, scopeA)
  await f.index.maintain()
  expect(f.stub.reads.map(read => read.unit)).toEqual([unitOf(held.key)])
  reservation.abort()
})

it('does not read a unit whose stop is in flight', async () => {
  const stub = supervisor()
  const stopGate = deferred<StopReading>()
  const slowStop: RetainedSupervision = { ...stub.supervision, stop: async () => stopGate.promise }
  const f = await indexWith(await stateDirectory(), stub, { supervision: async () => slowStop })
  const { key } = await handOver(f, scopeA)
  const stopping = f.index.stop(key)
  expect(await f.index.maintain()).toBe(1)
  expect(stub.reads).toEqual([])
  stopGate.resolve({ status: 'confirmed' })
  expect(await stopping).toBe('confirmed')
})

it('does not settle again a unit whose stop finished while its members were being read', async () => {
  const stub = supervisor()
  const gate = deferred<MembersReading>()
  let asked = false
  const slow: RetainedSupervision = {
    ...stub.supervision,
    members: () => {
      asked = true
      return gate.promise
    },
  }
  const f = await indexWith(await stateDirectory(), stub, { supervision: async () => slow })
  const { key, ledger } = await handOver(f, scopeA)
  const reading = f.index.maintain()
  await vi.waitFor(() => expect(asked).toBe(true))
  expect(await f.index.stop(key)).toBe('confirmed')
  gate.resolve({ kind: 'members', pids: [gatePid], directory: '/cgroup/x' })
  await reading
  expect(stub.stops).toHaveLength(1)
  expect(ledger.stopped).toEqual([[key, 'confirmed']])
})

it('does not recover a place that is only reserved, even by the resource it would have', async () => {
  const f = await indexWith(await stateDirectory())
  const reservation = reserveOrThrow(f, scopeA, 'k1')
  const placeholder: ManagedResource = {
    key: 'k1',
    provider: 'host-files',
    reference: scopeReference({ unit: '', bootId: '' }),
  }
  expect(await f.index.recover(placeholder)).toBeUndefined()
  expect(f.stub.stops).toEqual([])
  // It is still the reservation: it commits.
  f.stub.members(unitOf('k1'), [gatePid, 1])
  expect(
    (await f.index.commit(reservation, handoverOf('k1', ledgerStub().ledger))).process.id,
  ).toBe('k1')
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
