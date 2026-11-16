import { randomUUID } from 'node:crypto'
import { closeSync, fsyncSync, openSync } from 'node:fs'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { ScopeRef } from '@omne-harness/runtime-context-contract'
import type {
  ManagedResource,
  OriginRef,
  RetainedOutput,
  RetainedOutputFrom,
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
import type { RetainedTail } from './retained-tail.ts'

export type RetainedSupervision = Readonly<{
  bootId(): Promise<string | undefined>
  members(input: { unit: string; directory?: string | undefined }): Promise<MembersReading>
  stop(coordinate: ScopeCoordinate): Promise<StopReading>
}>

export type RetainedMarkerFact = Readonly<{
  key: string
  unit: string
  issue: 'notWritten' | 'notRemoved' | 'discarded'
}>

export type RetainedProcessIndexInput = Readonly<{
  stateDirectory: string
  provider: string
  capacityPerScope: number
  pollMs: number
  supervision(): Promise<RetainedSupervision | undefined>
  diagnose?: ((fact: RetainedMarkerFact) => void) | undefined
}>

export type RetainedReservation = Readonly<{
  key: string
  abort(): void
}>

export type HandoverDetails = Readonly<{
  unit: string
  bootId: string
  origin: OriginRef
  gatePid: number | undefined
  members: number | null
  ledger: RetainedProcessLedger
  output?: RetainedTail | 'unsupported'
}>

export type Handover = Readonly<{ process: RetainedProcessRef; marker: 'written' | 'notWritten' }>

export type StoppingHandoverDetails = HandoverDetails &
  Readonly<{
    issued?: Promise<StopReading> | undefined
  }>

export type RetainedProcessIndex = Readonly<{
  ready(): Promise<boolean>
  /** Takes a place synchronously; `unavailable` before the markers were read. */
  reserve(
    scope: ScopeRef,
    tenant: TenantId,
    key: string,
  ): RetainedReservation | 'capacity' | 'unavailable'
  commit(reservation: RetainedReservation, details: HandoverDetails): Promise<Handover>
  commitStopping(
    reservation: RetainedReservation,
    details: StoppingHandoverDetails,
  ): Promise<StopStatus>
  list(
    scope: ScopeRef,
    tenant: TenantId,
  ): Promise<readonly RetainedProcessInformation[] | 'unavailable'>
  resources(scope: ScopeRef): readonly ManagedResource[]
  stop(key: string): Promise<StopStatus>
  stopRef(
    ref: RetainedProcessRef,
    scope: ScopeRef,
    tenant: TenantId,
    ledger: RetainedProcessLedger,
  ): Promise<StopStatus | 'notFound' | 'unavailable'>
  output(
    ref: RetainedProcessRef,
    scope: ScopeRef,
    tenant: TenantId,
    from?: RetainedOutputFrom,
  ): Promise<RetainedOutput | 'notFound' | 'unavailable'>
  closeScope(scope: ScopeRef, ledger?: RetainedProcessLedger): Promise<readonly ManagedResource[]>
  watchClosure(signal: AbortSignal, scope: ScopeRef, ledger: RetainedProcessLedger): void
  recover(resource: ManagedResource): Promise<StopStatus | undefined>
  mayHold(key: string): Promise<boolean>
  maintain(): Promise<number>
  join(generation: string): void
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
  output: RetainedTail | 'unsupported' | 'unavailable'
  stopping: Promise<StopStatus> | undefined
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

function countOf(pids: readonly number[], gatePid: number | undefined): number {
  return pids.filter(pid => pid !== gatePid).length
}

export function createRetainedProcessIndex(input: RetainedProcessIndexInput): RetainedProcessIndex {
  const directory = join(input.stateDirectory, 'retained-processes')
  const entries = new Map<string, Entry>()
  const generations = new Set<string>()
  const watched = new WeakSet<AbortSignal>()
  const scopeLedgers = new Map<string, RetainedProcessLedger>()
  let loading: Promise<boolean> | undefined
  let loaded = false
  let timer: ReturnType<typeof setInterval> | undefined
  let ticking: Promise<number> | undefined

  const markerPath = (key: string) => join(directory, `${key}.json`)

  const diagnose = (fact: RetainedMarkerFact) => {
    try {
      input.diagnose?.(fact)
    } catch {}
  }

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
      syncDirectory(directory)
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

  const persist = async (entry: Entry): Promise<boolean> => {
    entry.marker = 'notWritten'
    if (!(await writeMarker(entry))) return false
    entry.marker = 'written'
    if (!entries.has(entry.key)) await removeMarker(entry)
    return true
  }

  const rewriteMarker = async (entry: Entry): Promise<void> => {
    if (entry.marker !== 'notWritten' || !entries.has(entry.key)) return
    await persist(entry)
  }

  const discardMarker = async (name: string, key: string, unit: string): Promise<void> => {
    try {
      await rm(join(directory, name), { force: true })
    } catch {}
    diagnose({ key, unit, issue: 'discarded' })
  }

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
      output: 'unavailable',
      stopping: undefined,
      marker: 'written',
    }
  }

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
    const ledger = entry.ledger ?? scopeLedgers.get(entry.scope)
    if (ledger === undefined) return true
    try {
      return (await ledger.stopped(entry.key, status)) === 'recorded'
    } catch {
      return false
    }
  }

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
        entries.delete(entry.key)
        await removeMarker(entry)
      }
      return reading.status
    })().finally(() => {
      entry.stopping = undefined
    })
    return entry.stopping
  }

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
    entry.output = details.output ?? 'unsupported'
    return entry
  }

  const held = (
    ref: RetainedProcessRef,
    scope: ScopeRef,
    tenant: TenantId,
  ): Entry | undefined | 'unavailable' => {
    const owner = tenantText(tenant)
    if (owner === undefined) return 'unavailable'
    const entry = entries.get(ref.id)
    return entry !== undefined &&
      entry.state !== 'reserved' &&
      entry.scope === scopeDigest(scope) &&
      entry.tenant === owner &&
      entry.generation === ref.generation
      ? entry
      : undefined
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
        output: 'unsupported',
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
    async output(ref, scope, tenant, from) {
      if (!(await ready())) return 'unavailable'
      const entry = held(ref, scope, tenant)
      if (entry === 'unavailable' || entry === undefined) return entry ?? 'notFound'
      if (entry.output === 'unavailable') return 'unavailable'
      if (entry.output === 'unsupported') return { kind: 'unsupported' }
      // A closed tail observes its streams no longer: its readings would go stale, as after a restart.
      if (entry.output.closed()) return 'unavailable'
      return entry.output.read(from)
    },
    async stopRef(ref, scope, tenant, ledger) {
      if (!(await ready())) return 'unavailable'
      const entry = held(ref, scope, tenant)
      if (entry === 'unavailable') return 'unavailable'
      if (entry !== undefined) {
        // A process loaded after a restart has no ledger; the caller's view of its scope records it.
        entry.ledger ??= ledger
        return stop(entry)
      }
      if (ledger.ended === undefined) return 'unavailable'
      try {
        const ended = await ledger.ended(ref.id)
        return ended === 'confirmed' ? 'confirmed' : ended === 'none' ? 'notFound' : 'unavailable'
      } catch {
        return 'unavailable'
      }
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
    async mayHold(key) {
      return !(await ready()) || entries.has(key)
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

/** Flushes the directory after the rename, so the marker's name survives a host crash. Windows opens
 *  no directory as a file and NTFS journals the rename, so nothing is flushed there. */
function syncDirectory(directory: string): void {
  if (process.platform === 'win32') return
  const descriptor = openSync(directory, 'r')
  try {
    fsyncSync(descriptor)
  } finally {
    closeSync(descriptor)
  }
}
