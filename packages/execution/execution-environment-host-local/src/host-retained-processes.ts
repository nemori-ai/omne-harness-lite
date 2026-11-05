// The index of the processes one-shot commands left behind and handed over to a retention scope.
// One index per state directory: the markers under `<stateDirectory>/retained-processes/` are the
// durable truth a restarted provider reads, the memory holds what this process reserved, handed
// over or is stopping. Capacity is counted per retention scope, reservations and stopping entries
// included, and never evicts. Every reading of a unit's members comes from the supervisor; a
// reading that fails is never an empty unit.
import { randomUUID } from 'node:crypto'
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  ManagedResource,
  OriginRef,
  RetainedProcessInformation,
  RetainedProcessLedger,
  RetainedProcessRef,
} from '@omne-harness/execution-environment-contract'
import {
  scopeDigest,
  scopeReference,
  type MembersReading,
  type ScopeCoordinate,
  type StopReading,
  type StopStatus,
} from './host-scope.ts'

/** The supervisor readings the index needs; the host provider binds them to `systemctl`. */
export type RetainedSupervision = Readonly<{
  bootId(): Promise<string | undefined>
  members(input: { unit: string; directory?: string | undefined }): Promise<MembersReading>
  stop(coordinate: ScopeCoordinate): Promise<StopReading>
}>

/** A fact about a marker file the index could not keep in step with the unit. */
export type RetainedMarkerFact = Readonly<{
  key: string
  unit: string
  issue: 'notWritten' | 'notRemoved' | 'discarded'
}>

export type RetainedProcessIndexInput = Readonly<{
  stateDirectory: string
  provider: string
  /** Retained processes one retention scope may hold, reservations and stopping ones included. */
  capacityPerScope: number
  /** Pause between two readings of the retained units' members. */
  pollMs: number
  /** The supervisor, when the platform prerequisites hold; otherwise nothing can be read or stopped. */
  supervision(): Promise<RetainedSupervision | undefined>
  diagnose?: ((fact: RetainedMarkerFact) => void) | undefined
}>

/** A place taken in a retention scope before the handover is committed. */
export type RetainedReservation = Readonly<{
  key: string
  /** Gives the place back; nothing was handed over. */
  abort(): void
}>

/** What the commit records about the handed-over domain. */
export type HandoverDetails = Readonly<{
  unit: string
  bootId: string
  origin: OriginRef
  /** The gate's process id, excluded from the member count; absent when the launcher had none. */
  gatePid: number | undefined
  /** The gate's reading at exit; null when it could not read. */
  members: number | null
  ledger: RetainedProcessLedger
}>

export type Handover = Readonly<{ process: RetainedProcessRef; marker: 'written' | 'notWritten' }>

/** A commit whose domain was interrupted meanwhile, with the stop the acquisition may have issued already. */
export type StoppingHandoverDetails = HandoverDetails &
  Readonly<{
    /** A stop of the unit already in flight; the index waits for its reading instead of issuing another. */
    issued?: Promise<StopReading> | undefined
  }>

export type RetainedProcessIndex = Readonly<{
  /** Loads the markers once; false when they cannot be read completely, which is not an empty index. */
  ready(): Promise<boolean>
  /** Takes a place synchronously; `unavailable` before the markers were read. */
  reserve(
    scope: ScopeRef,
    tenant: TenantId,
    key: string,
  ): RetainedReservation | 'capacity' | 'unavailable'
  /** The commit took effect: writes the marker and holds the domain as running. */
  commit(reservation: RetainedReservation, details: HandoverDetails): Promise<Handover>
  /**
   * The commit took effect, but the domain was stopped, released or its scope closed meanwhile:
   * the retention scope owns it, so the index holds it as stopping (synchronously: it keeps its
   * place and is listed), stops it or waits for the stop already issued, records the stop on
   * `details.ledger`, and lets it go once confirmed. The marker is written as for any handover, so
   * a stop not confirmed before a crash is listed again after it (as running: the marker does not
   * carry the stop).
   */
  commitStopping(
    reservation: RetainedReservation,
    details: StoppingHandoverDetails,
  ): Promise<StopStatus>
  /** The retained processes of `scope` and `tenant`, members read now; `unavailable` when unread. */
  list(
    scope: ScopeRef,
    tenant: TenantId,
  ): Promise<readonly RetainedProcessInformation[] | 'unavailable'>
  /** The managed resources of `scope` the index holds, after `ready()`. */
  resources(scope: ScopeRef): readonly ManagedResource[]
  /** Stops the domain of `key`, records the stop on its ledger, removes its marker once confirmed. */
  stop(key: string): Promise<StopStatus>
  /** Stops every retained process of `scope`; `ledger` records those loaded without one. */
  closeScope(scope: ScopeRef, ledger?: RetainedProcessLedger): Promise<readonly ManagedResource[]>
  /**
   * Closes `scope` when `signal` aborts. One listener per signal, however many acquisitions share
   * it; the latest ledger view given for the scope records the stops.
   */
  watchClosure(signal: AbortSignal, scope: ScopeRef, ledger: RetainedProcessLedger): void
  /** Stops the retained process a resource names; undefined when the index does not hold it. */
  recover(resource: ManagedResource): Promise<StopStatus | undefined>
  /** One reading of every retained unit: settles the empty ones, retries the stopping ones. */
  maintain(): Promise<number>
  /** A provider generation that reads members by this index; the polling runs while one is joined. */
  join(generation: string): void
  /** The generation no longer polls; the retained processes stay with their scopes. */
  retire(generation: string): void
}>

type Entry = {
  readonly key: string
  readonly scope: string
  readonly tenant: string
  unit: string
  bootId: string
  origin: OriginRef
  generation: string
  handedOverAtMs: number
  gatePid: number | undefined
  directory: string | undefined
  state: 'reserved' | 'running' | 'stopping'
  members: number | 'unknown'
  ledger: RetainedProcessLedger | undefined
  stopping: Promise<StopStatus> | undefined
  /**
   * The marker on disk: `written` or loaded; `notWritten` when the write failed and the
   * maintenance writes it again; `none` for a reservation, before the commit.
   */
  marker: 'written' | 'notWritten' | 'none'
}

const markerVersion = 1

type Marker = Readonly<{
  version: number
  key: string
  scope: string
  tenant: string
  unit: string
  bootId: string
  origin: string
  generation: string
  handedOverAtMs: number
  gatePid: number | null
}>

function isMarker(value: unknown): value is Marker {
  if (typeof value !== 'object' || value === null) return false
  const record: Record<string, unknown> = { ...value }
  const text = (name: string) => typeof record[name] === 'string' && record[name] !== ''
  return (
    record['version'] === markerVersion &&
    ['key', 'scope', 'tenant', 'unit', 'bootId', 'origin', 'generation'].every(text) &&
    typeof record['handedOverAtMs'] === 'number' &&
    (record['gatePid'] === null || Number.isSafeInteger(record['gatePid']))
  )
}

function tenantText(tenant: TenantId): string | undefined {
  const text = tenantCodec.encode(tenant)
  return text.ok ? text.value : undefined
}

/** The members other than the gate; the gate is counted out by its process id. */
function countOf(pids: readonly number[], gatePid: number | undefined): number {
  return pids.filter(pid => pid !== gatePid).length
}

export function createRetainedProcessIndex(input: RetainedProcessIndexInput): RetainedProcessIndex {
  const directory = join(input.stateDirectory, 'retained-processes')
  const entries = new Map<string, Entry>()
  const generations = new Set<string>()
  const watched = new WeakSet<AbortSignal>()
  /** The latest ledger view an acquisition gave for each scope digest. */
  const scopeLedgers = new Map<string, RetainedProcessLedger>()
  let loading: Promise<boolean> | undefined
  let loaded = false
  let timer: ReturnType<typeof setInterval> | undefined
  let ticking: Promise<number> | undefined

  const markerPath = (key: string) => join(directory, `${key}.json`)

  const diagnose = (fact: RetainedMarkerFact) => {
    try {
      input.diagnose?.(fact)
    } catch {
      /* A diagnostic sink never changes the result. */
    }
  }

  /** Writes the marker durably: a temporary file, fsync, rename, fsync of the directory. */
  const writeMarker = async (entry: Entry): Promise<boolean> => {
    const marker: Marker = {
      version: markerVersion,
      key: entry.key,
      scope: entry.scope,
      tenant: entry.tenant,
      unit: entry.unit,
      bootId: entry.bootId,
      origin: entry.origin,
      generation: entry.generation,
      handedOverAtMs: entry.handedOverAtMs,
      gatePid: entry.gatePid ?? null,
    }
    const temporary = join(directory, `.${entry.key}.${randomUUID()}.tmp`)
    try {
      await mkdir(directory, { recursive: true })
      await writeFile(temporary, JSON.stringify(marker), { flush: true })
      await rename(temporary, markerPath(entry.key))
      const handle = await open(directory, 'r')
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
      return true
    } catch {
      await rm(temporary, { force: true }).catch(() => undefined)
      diagnose({ key: entry.key, unit: entry.unit, issue: 'notWritten' })
      return false
    }
  }

  const removeMarker = async (entry: Entry): Promise<void> => {
    if (entry.marker === 'none') return
    try {
      await rm(markerPath(entry.key), { force: true })
    } catch {
      diagnose({ key: entry.key, unit: entry.unit, issue: 'notRemoved' })
    }
  }

  /**
   * Writes the marker of a handed-over entry. The marker stays from the commit until the entry left
   * the index (its stop confirmed and recorded), running or stopping alike; a write that lands after
   * the entry left is removed again.
   */
  const persist = async (entry: Entry): Promise<boolean> => {
    entry.marker = 'notWritten'
    if (!(await writeMarker(entry))) return false
    entry.marker = 'written'
    if (!entries.has(entry.key)) await removeMarker(entry)
    return true
  }

  /** Writes again a marker whose write failed, for an entry the index still holds. */
  const rewriteMarker = async (entry: Entry): Promise<void> => {
    if (entry.marker !== 'notWritten' || !entries.has(entry.key)) return
    await persist(entry)
  }

  const discardMarker = async (name: string, key: string, unit: string): Promise<void> => {
    try {
      await rm(join(directory, name), { force: true })
    } catch {
      /* The next load discards it again. */
    }
    diagnose({ key, unit, issue: 'discarded' })
  }

  /** Reads one marker file into an entry, or discards it: unreadable, another boot, or a gone unit. */
  const loadMarker = async (
    name: string,
    bootId: string,
    supervision: RetainedSupervision,
  ): Promise<Entry | 'discarded' | 'unreadable'> => {
    let text: string
    try {
      text = await readFile(join(directory, name), 'utf8')
    } catch {
      return 'unreadable'
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = undefined
    }
    // A file that is not a marker of this version is not a retained process: it is discarded.
    if (!isMarker(parsed) || `${parsed.key}.json` !== name) {
      await discardMarker(name, name, '')
      return 'discarded'
    }
    if (parsed.bootId !== bootId) {
      await discardMarker(name, parsed.key, parsed.unit)
      return 'discarded'
    }
    const reading = await supervision.members({ unit: parsed.unit })
    if (reading.kind === 'gone') {
      await discardMarker(name, parsed.key, parsed.unit)
      return 'discarded'
    }
    if (reading.kind === 'unreadable' && reading.show === undefined) return 'unreadable'
    const gatePid = parsed.gatePid ?? undefined
    return {
      key: parsed.key,
      scope: parsed.scope,
      tenant: parsed.tenant,
      unit: parsed.unit,
      bootId: parsed.bootId,
      origin: parsed.origin as OriginRef,
      generation: parsed.generation,
      handedOverAtMs: parsed.handedOverAtMs,
      gatePid,
      directory: reading.kind === 'members' ? reading.directory : undefined,
      state: 'running',
      members: reading.kind === 'members' ? countOf(reading.pids, gatePid) : 'unknown',
      ledger: undefined,
      stopping: undefined,
      marker: 'written',
    }
  }

  /** Loads every marker; any one that cannot be read makes the whole load incomplete. */
  const load = async (): Promise<boolean> => {
    let names: string[]
    try {
      names = (await readdir(directory)).filter(name => name.endsWith('.json'))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') names = []
      else return false
    }
    if (names.length === 0) return true
    const supervision = await input.supervision()
    const bootId = await supervision?.bootId()
    if (bootId === undefined || supervision === undefined) return false
    const read = await Promise.all(names.map(name => loadMarker(name, bootId, supervision)))
    if (read.includes('unreadable')) return false
    for (const entry of read)
      if (typeof entry !== 'string' && !entries.has(entry.key)) entries.set(entry.key, entry)
    return true
  }

  const ready = (): Promise<boolean> => {
    if (loaded) return Promise.resolve(true)
    loading ??= load()
      .then(complete => {
        loaded = complete
        if (complete) startPolling()
        return complete
      })
      .finally(() => {
        loading = undefined
      })
    return loading
  }

  const occupied = (scope: string) =>
    [...entries.values()].filter(entry => entry.scope === scope).length

  const resourceOf = (entry: Entry): ManagedResource => ({
    key: entry.key,
    provider: input.provider,
    reference: scopeReference({ unit: entry.unit, bootId: entry.bootId }),
  })

  const recordStop = async (entry: Entry, status: StopStatus): Promise<boolean> => {
    if (entry.ledger === undefined) return true
    try {
      return (await entry.ledger.stopped(entry.key, status)) === 'recorded'
    } catch {
      return false
    }
  }

  /** The stop of one unit, or the wait for the stop `issued` already; one in flight per entry. */
  const stop = (entry: Entry, issued?: Promise<StopReading>): Promise<StopStatus> => {
    entry.state = 'stopping'
    entry.stopping ??= (async () => {
      let reading: StopReading
      if (issued !== undefined) {
        reading = await issued.catch((): StopReading => ({ status: 'unconfirmed' }))
      } else {
        const supervision = await input.supervision()
        if (supervision === undefined) return 'unconfirmed'
        reading = await supervision.stop({ unit: entry.unit, bootId: entry.bootId })
      }
      const recorded = await recordStop(entry, reading.status)
      if (reading.status === 'confirmed' && recorded) {
        // Out of the index first: a marker write landing from now on removes itself.
        entries.delete(entry.key)
        await removeMarker(entry)
      }
      return reading.status
    })().finally(() => {
      entry.stopping = undefined
    })
    return entry.stopping
  }

  /** Reads one running unit; an empty one is stopped, a gone one settled, an unread one left alone. */
  const observe = async (entry: Entry, supervision: RetainedSupervision): Promise<void> => {
    if (entry.state !== 'running') return
    const reading = await supervision.members({ unit: entry.unit, directory: entry.directory })
    if (entry.state !== 'running') return
    if (reading.kind === 'unreadable') return
    if (reading.kind === 'gone') {
      entry.members = 0
      await stop(entry)
      return
    }
    entry.directory = reading.directory
    entry.members = countOf(reading.pids, entry.gatePid)
    if (entry.members === 0) await stop(entry)
  }

  const tick = async (): Promise<number> => {
    // Nothing held: asking for the supervisor would start the platform probe for no reading.
    if (entries.size === 0) return 0
    const supervision = await input.supervision()
    if (supervision === undefined) return entries.size
    await Promise.all(
      [...entries.values()].map(entry =>
        Promise.all([
          rewriteMarker(entry),
          entry.state === 'stopping' && entry.stopping === undefined
            ? stop(entry)
            : observe(entry, supervision),
        ]),
      ),
    )
    return [...entries.values()].filter(entry => entry.state === 'stopping').length
  }

  const maintain = (): Promise<number> => {
    ticking ??= tick().finally(() => {
      ticking = undefined
    })
    return ticking
  }

  /** Polls while a generation is joined and there is something to read. */
  const startPolling = () => {
    if (timer !== undefined || generations.size === 0 || entries.size === 0) return
    timer = setInterval(() => void maintain(), input.pollMs)
    timer.unref()
  }

  const stopPolling = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
  }

  const ofScope = (scope: ScopeRef) => {
    const digest = scopeDigest(scope)
    return [...entries.values()].filter(entry => entry.scope === digest)
  }

  /** The reserved entry of a commit that took effect, filled with what the handover recorded. */
  const committed = (reservation: RetainedReservation, details: HandoverDetails): Entry => {
    const entry = entries.get(reservation.key)
    if (entry === undefined || entry.state !== 'reserved')
      throw new Error('a handover commit without a live reservation')
    entry.unit = details.unit
    entry.bootId = details.bootId
    entry.origin = details.origin
    entry.generation = randomUUID()
    entry.handedOverAtMs =
      /* wall-clock: observation-time -- The handover time the contract reports, in epoch milliseconds. */ Date.now()
    entry.gatePid = details.gatePid
    entry.members = details.members ?? 'unknown'
    entry.ledger = details.ledger
    return entry
  }

  const closeScope = async (
    scope: ScopeRef,
    ledger?: RetainedProcessLedger,
  ): Promise<readonly ManagedResource[]> => {
    await ready()
    const own = ofScope(scope).filter(entry => entry.state !== 'reserved')
    const view = ledger ?? scopeLedgers.get(scopeDigest(scope))
    for (const entry of own) entry.ledger ??= view
    await Promise.all(own.map(entry => stop(entry)))
    return own.filter(entry => entries.has(entry.key)).map(resourceOf)
  }

  return Object.freeze({
    ready,
    reserve(scope, tenant, key) {
      if (!loaded) return 'unavailable'
      const digest = scopeDigest(scope)
      const owner = tenantText(tenant)
      if (owner === undefined) return 'unavailable'
      if (occupied(digest) >= input.capacityPerScope) return 'capacity'
      const entry: Entry = {
        key,
        scope: digest,
        tenant: owner,
        unit: '',
        bootId: '',
        origin: '' as OriginRef,
        generation: '',
        handedOverAtMs: 0,
        gatePid: undefined,
        directory: undefined,
        state: 'reserved',
        members: 'unknown',
        ledger: undefined,
        stopping: undefined,
        marker: 'none',
      }
      entries.set(key, entry)
      return Object.freeze({
        key,
        abort() {
          if (entries.get(key)?.state === 'reserved') entries.delete(key)
        },
      })
    },
    async commit(reservation, details) {
      const entry = committed(reservation, details)
      entry.state = 'running'
      const written = await persist(entry)
      startPolling()
      return {
        process: { id: entry.key, generation: entry.generation },
        marker: written ? 'written' : 'notWritten',
      }
    },
    commitStopping(reservation, details) {
      const entry = committed(reservation, details)
      const stopping = stop(entry, details.issued)
      // Durable like any handover: a stop not confirmed before a crash is found again after it.
      void persist(entry)
      startPolling()
      return stopping
    },
    async list(scope, tenant) {
      if (!(await ready())) return 'unavailable'
      const owner = tenantText(tenant)
      if (owner === undefined) return 'unavailable'
      const own = ofScope(scope).filter(
        entry => entry.tenant === owner && entry.state !== 'reserved',
      )
      const supervision = await input.supervision()
      if (supervision !== undefined)
        await Promise.all(own.map(entry => observe(entry, supervision)))
      return own
        .filter(entry => entries.has(entry.key))
        .map(entry => ({
          process: { id: entry.key, generation: entry.generation },
          origin: entry.origin,
          handedOverAtMs: entry.handedOverAtMs,
          state: entry.state === 'stopping' ? 'stopping' : 'running',
          processes: entry.members,
        }))
    },
    resources: scope =>
      ofScope(scope)
        .filter(entry => entry.state !== 'reserved')
        .map(resourceOf),
    async stop(key) {
      const entry = entries.get(key)
      if (entry === undefined) return 'confirmed'
      if (entry.state === 'reserved') return 'unconfirmed'
      return stop(entry)
    },
    closeScope,
    watchClosure(signal, scope, ledger) {
      scopeLedgers.set(scopeDigest(scope), ledger)
      if (signal.aborted) {
        void closeScope(scope)
        return
      }
      if (watched.has(signal)) return
      watched.add(signal)
      signal.addEventListener('abort', () => void closeScope(scope), { once: true })
    },
    async recover(resource) {
      await ready()
      const entry = entries.get(resource.key)
      if (entry === undefined || entry.state === 'reserved') return undefined
      if (JSON.stringify(resourceOf(entry)) !== JSON.stringify(resource)) return undefined
      return stop(entry)
    },
    maintain,
    join(generation) {
      generations.add(generation)
      startPolling()
    },
    retire(generation) {
      generations.delete(generation)
      if (generations.size === 0) stopPolling()
    },
  })
}
