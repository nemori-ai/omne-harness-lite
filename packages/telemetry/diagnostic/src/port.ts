import type {
  AdmitInput,
  AdmitResult,
  CallerCause,
  Correlation,
  DiagnosticBounds,
  DiagnosticCloseReport,
  DiagnosticPort,
  DiagnosticPortOptions,
  ExportedRecord,
  ExportStatus,
  FailureChain,
  ReadResult,
} from './types.ts'

const SECRET_KEYS = new Set(['secret', 'token', 'authorization'])

type StoredRecord = {
  id: string
  chain: FailureChain
  correlation: Correlation
  bytes: number
  exportStatus: ExportStatus
}

export function createDiagnosticPort(options: DiagnosticPortOptions): DiagnosticPort {
  const bounds = parseBounds(options.bounds)
  const closeDeadlineMs = parseDeadline(options.closeDeadlineMs)
  const sink = options.sink
  const records = new Map<string, StoredRecord>()
  const queue: string[] = []
  let inFlight = 0
  let accepting = true
  let sequence = 0
  let closePromise: Promise<DiagnosticCloseReport> | null = null
  let closeResolve: ((report: DiagnosticCloseReport) => void) | null = null
  let closeTimer: ReturnType<typeof setTimeout> | null = null
  const abort = new AbortController()

  function admit(input: AdmitInput): AdmitResult {
    if (!accepting) return { status: 'rejected', reason: 'closed' }
    const correlation = parseCorrelation(input.correlation)
    const chain = redactChain(parseCallerChain(input.chain))
    const bytes = sink === null ? measure(chain, correlation) : reservedBytes(chain, correlation)
    const room = reserve(bytes)
    if (room !== 'ready') return { status: 'rejected', reason: room }
    if (sink !== null && inFlight >= bounds.maxInFlight) {
      return { status: 'rejected', reason: 'in_flight_full' }
    }
    releaseFinished(bytes)
    const id = nextId()
    if (sink === null) {
      records.set(id, { id, chain, correlation, bytes, exportStatus: 'gap' })
      return { status: 'gap', reason: 'sink_absent', id }
    }
    records.set(id, { id, chain, correlation, bytes, exportStatus: 'queued' })
    queue.push(id)
    pump()
    return { status: 'accepted', id }
  }

  function read(input: { readonly tenant: string; readonly id: string }): ReadResult {
    if (input.tenant.length === 0) throw new TypeError('tenant is required')
    const record = records.get(input.id)
    if (!record) return { status: 'absent' }
    if (record.correlation.tenant !== input.tenant) return { status: 'denied' }
    return {
      status: 'visible',
      exportStatus: record.exportStatus,
      chain: copyChain(record.chain),
    }
  }

  function close(): Promise<DiagnosticCloseReport> {
    if (closePromise) return closePromise
    accepting = false
    closePromise = new Promise(resolve => {
      closeResolve = resolve
      closeTimer = setTimeout(() => {
        abort.abort()
        settleClose(true)
      }, closeDeadlineMs)
      pump()
      settleClose(false)
    })
    return closePromise
  }

  function settleClose(forced: boolean): void {
    if (!closeResolve) return
    if (!forced && (queue.length > 0 || inFlight > 0)) return
    const resolve = closeResolve
    closeResolve = null
    if (closeTimer) clearTimeout(closeTimer)
    resolve(finishClose())
  }

  function finishClose(): DiagnosticCloseReport {
    const unfinished: string[] = []
    const exportFailed: string[] = []
    let exported = 0
    let dropped = 0
    let failed = 0
    let last: StoredRecord | null = null
    for (const record of records.values()) {
      last = record
      if (record.exportStatus === 'queued' || record.exportStatus === 'exporting') {
        record.exportStatus = 'closed_unexported'
        record.chain = appendExport(record.chain, CLOSED_UNEXPORTED_SUMMARY)
        record.bytes = measure(record.chain, record.correlation)
        unfinished.push(record.id)
      } else if (record.exportStatus === 'exported') {
        exported += 1
      } else if (record.exportStatus === 'export_failed') {
        failed += 1
        exportFailed.push(record.id)
      }
    }
    queue.length = 0
    const lastRecord = last
      ? last.exportStatus === 'exported'
        ? { kind: 'handed-off' as const, id: last.id }
        : { kind: 'unhanded' as const, id: last.id }
      : { kind: 'none' as const }
    const flush =
      unfinished.length > 0
        ? { kind: 'deadline' as const }
        : { kind: 'counted' as const, exported, dropped, failed }
    const transport =
      unfinished.length > 0 ? { kind: 'deadline' as const } : { kind: 'unconfirmed' as const }
    return { status: 'closed', unfinished, exportFailed, lastRecord, flush, transport }
  }

  function pump(): void {
    if (sink === null) return
    const active = sink
    while (queue.length > 0 && inFlight < bounds.maxInFlight) {
      const id = queue.shift()
      if (id === undefined) continue
      const record = records.get(id)
      if (!record || record.exportStatus !== 'queued') continue
      beginExport(active, record)
    }
  }

  function beginExport(active: NonNullable<typeof sink>, record: StoredRecord): void {
    record.exportStatus = 'exporting'
    inFlight += 1
    let pending: Promise<void>
    try {
      pending = Promise.resolve(active.export(exportView(record), abort.signal))
    } catch {
      noteExportFailure(record)
      inFlight -= 1
      return
    }
    void pending.then(
      () => {
        if (record.exportStatus === 'exporting') record.exportStatus = 'exported'
      },
      () => {
        noteExportFailure(record)
      },
    ).finally(() => {
      inFlight -= 1
      pump()
      settleClose(false)
    })
  }

  function noteExportFailure(record: StoredRecord): void {
    if (abort.signal.aborted) return
    if (record.exportStatus !== 'exporting') return
    record.exportStatus = 'export_failed'
    record.chain = appendExport(record.chain, EXPORT_FAILED_SUMMARY)
    record.bytes = measure(record.chain, record.correlation)
  }

  function reserve(bytes: number): 'ready' | 'queue_full' | 'bytes_full' {
    if (bytes > bounds.maxExportBytes) return 'bytes_full'
    const finished = finishedBytes()
    let count = records.size
    let total = byteTotal()
    let index = 0
    while (count + 1 > bounds.maxQueue || total + bytes > bounds.maxExportBytes) {
      const next = finished[index]
      if (next === undefined) {
        return count + 1 > bounds.maxQueue ? 'queue_full' : 'bytes_full'
      }
      count -= 1
      total -= next
      index += 1
    }
    return 'ready'
  }

  function releaseFinished(bytes: number): void {
    while (records.size + 1 > bounds.maxQueue || byteTotal() + bytes > bounds.maxExportBytes) {
      const id = oldestFinishedId()
      if (id === undefined) return
      records.delete(id)
    }
  }

  function finishedBytes(): number[] {
    const sizes: number[] = []
    for (const record of records.values()) {
      if (isFinished(record.exportStatus)) sizes.push(record.bytes)
    }
    return sizes
  }

  function oldestFinishedId(): string | undefined {
    for (const [id, record] of records) {
      if (isFinished(record.exportStatus)) return id
    }
    return undefined
  }

  function byteTotal(): number {
    let total = 0
    for (const record of records.values()) total += record.bytes
    return total
  }

  function nextId(): string {
    sequence += 1
    return `d${sequence}`
  }

  return { bounds, admit, read, close }
}

const EXPORT_FAILED_SUMMARY = 'export failed'
const CLOSED_UNEXPORTED_SUMMARY = 'closed before export finished'

function isFinished(status: ExportStatus): boolean {
  return status === 'exported' || status === 'export_failed'
}

function reservedBytes(chain: FailureChain, correlation: Correlation): number {
  return Math.max(
    measure(appendExport(chain, EXPORT_FAILED_SUMMARY), correlation),
    measure(appendExport(chain, CLOSED_UNEXPORTED_SUMMARY), correlation),
  )
}

const MAX_TIMEOUT_MS = 2_147_483_647

function parseBounds(bounds: DiagnosticBounds): DiagnosticBounds {
  for (const key of ['profile', 'os', 'node', 'load'] as const) {
    if (bounds[key].length === 0) throw new TypeError(`${key} is required`)
  }
  if (bounds.overLimit !== 'reject') {
    throw new TypeError('this member executes overLimit reject only')
  }
  for (const key of ['maxQueue', 'maxExportBytes', 'maxInFlight'] as const) {
    const value = bounds[key]
    if (!Number.isInteger(value) || value <= 0) {
      throw new TypeError(`${key} must be a positive integer`)
    }
  }
  return {
    profile: bounds.profile,
    os: bounds.os,
    node: bounds.node,
    load: bounds.load,
    overLimit: 'reject',
    maxQueue: bounds.maxQueue,
    maxExportBytes: bounds.maxExportBytes,
    maxInFlight: bounds.maxInFlight,
  }
}

function parseDeadline(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_TIMEOUT_MS) {
    throw new TypeError('closeDeadlineMs must be an integer from 0 through 2147483647')
  }
  return value
}

function parseCorrelation(value: Correlation): Correlation {
  if (value.tenant.length === 0) throw new TypeError('tenant is required')
  const next: {
    tenant: string
    work?: string
    attempt?: string
    instance?: string
    generation?: string
  } = { tenant: value.tenant }
  for (const key of ['work', 'attempt', 'instance', 'generation'] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (field.length === 0) throw new TypeError(`${key} must be a non-empty string`)
    next[key] = field
  }
  return next
}

function parseCallerChain(chain: AdmitInput['chain']): FailureChain {
  const copied: CallerCause[] = []
  chain.causes.forEach((cause, index) => {
    if (cause.role !== 'origin' && cause.role !== 'attached') {
      throw new TypeError('caller cause must be attached')
    }
    if (index === 0 && cause.role !== 'origin') {
      throw new TypeError('chain must start with one origin')
    }
    if (index > 0 && cause.role !== 'attached') {
      throw new TypeError('caller cause must be attached')
    }
    if (cause.summary.length === 0) throw new TypeError('cause summary is required')
    copied.push(copyCallerCause(cause))
  })
  const [origin, ...rest] = copied
  if (origin === undefined || origin.role !== 'origin') {
    throw new TypeError('chain must start with one origin')
  }
  return { causes: [origin, ...rest] }
}

function copyCallerCause(cause: CallerCause): CallerCause {
  if (!cause.detail) return { role: cause.role, summary: cause.summary }
  return { role: cause.role, summary: cause.summary, detail: { ...cause.detail } }
}

function redactChain(chain: FailureChain): FailureChain {
  return {
    causes: chain.causes.map(cause => {
      if (cause.role === 'export' || !cause.detail) {
        return { role: cause.role, summary: cause.summary }
      }
      const detail: Record<string, string> = {}
      for (const [key, value] of Object.entries(cause.detail)) {
        if (SECRET_KEYS.has(key)) continue
        detail[key] = value
      }
      return { role: cause.role, summary: cause.summary, detail }
    }),
  }
}

function copyChain(chain: FailureChain): FailureChain {
  return {
    causes: chain.causes.map(cause => {
      if (cause.role === 'export' || !cause.detail) {
        return { role: cause.role, summary: cause.summary }
      }
      return { role: cause.role, summary: cause.summary, detail: { ...cause.detail } }
    }),
  }
}

function appendExport(chain: FailureChain, summary: string): FailureChain {
  return { causes: [...copyChain(chain).causes, { role: 'export', summary }] }
}

function measure(chain: FailureChain, correlation: Correlation): number {
  return Buffer.byteLength(JSON.stringify({ chain, correlation }), 'utf8')
}

function exportView(record: StoredRecord): ExportedRecord {
  return {
    id: record.id,
    chain: copyChain(record.chain),
    correlation: { ...record.correlation },
    bytes: record.bytes,
  }
}
