import type {
  AdmitInput,
  AdmitResult,
  Correlation,
  DiagnosticBounds,
  DiagnosticCause,
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
  let closed = false
  let sequence = 0
  let pumping = false
  let closePromise: Promise<DiagnosticCloseReport> | null = null
  const abort = new AbortController()

  function admit(input: AdmitInput): AdmitResult {
    if (closed) return { status: 'rejected', reason: 'closed' }
    const correlation = parseCorrelation(input.correlation)
    const chain = redactChain(parseCallerChain(input.chain))
    const bytes = measure(chain)
    if (sink === null) {
      const id = nextId()
      records.set(id, { id, chain, correlation, bytes, exportStatus: 'gap' })
      return { status: 'gap', reason: 'sink_absent', id }
    }
    if (unfinishedCount() >= bounds.maxQueue) {
      return { status: 'rejected', reason: 'queue_full' }
    }
    const queuedBytes = unfinishedBytes()
    if (bytes > bounds.maxExportBytes || queuedBytes + bytes > bounds.maxExportBytes) {
      return { status: 'rejected', reason: 'bytes_full' }
    }
    if (inFlight >= bounds.maxInFlight) {
      return { status: 'rejected', reason: 'in_flight_full' }
    }
    const id = nextId()
    records.set(id, { id, chain, correlation, bytes, exportStatus: 'queued' })
    queue.push(id)
    void pump()
    return { status: 'accepted', id }
  }

  function read(input: { readonly tenant: string; readonly id: string }): ReadResult {
    if (input.tenant.length === 0) throw new TypeError('tenant is required')
    const record = records.get(input.id)
    if (!record) return { status: 'absent' }
    if (record.correlation.tenant !== input.tenant) return { status: 'denied' }
    return { status: 'visible', exportStatus: record.exportStatus, chain: record.chain }
  }

  function close(): Promise<DiagnosticCloseReport> {
    if (closePromise) return closePromise
    closed = true
    closePromise = new Promise(resolve => {
      const timer = setTimeout(() => {
        abort.abort()
        resolve(finishClose())
      }, closeDeadlineMs)
      timer.unref()
    })
    return closePromise
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
        record.chain = appendExport(record.chain, 'closed before export finished')
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

  async function pump(): Promise<void> {
    if (pumping || sink === null) return
    pumping = true
    try {
      while (!closed && queue.length > 0 && inFlight < bounds.maxInFlight) {
        const id = queue.shift()
        if (id === undefined) continue
        const record = records.get(id)
        if (!record || record.exportStatus !== 'queued') continue
        record.exportStatus = 'exporting'
        inFlight += 1
        try {
          await sink.export(exportView(record), abort.signal)
          if (record.exportStatus === 'exporting') record.exportStatus = 'exported'
        } catch {
          if (record.exportStatus === 'exporting') {
            record.exportStatus = 'export_failed'
            record.chain = appendExport(record.chain, 'export failed')
          }
        } finally {
          inFlight -= 1
        }
      }
    } finally {
      pumping = false
      if (!closed && queue.length > 0 && inFlight < bounds.maxInFlight) void pump()
    }
  }

  function unfinishedCount(): number {
    let count = 0
    for (const record of records.values()) {
      if (record.exportStatus === 'queued' || record.exportStatus === 'exporting') count += 1
    }
    return count
  }

  function unfinishedBytes(): number {
    let total = 0
    for (const record of records.values()) {
      if (record.exportStatus === 'queued' || record.exportStatus === 'exporting')
        total += record.bytes
    }
    return total
  }

  function nextId(): string {
    sequence += 1
    return `d${sequence}`
  }

  return { bounds, admit, read, close }
}

export function keepBusinessResult<T>(
  business: T,
  port: DiagnosticPort,
  input: AdmitInput,
): {
  readonly business: T
  readonly diagnostic: AdmitResult
} {
  return { business, diagnostic: port.admit(input) }
}

function parseBounds(bounds: DiagnosticBounds): DiagnosticBounds {
  for (const key of ['profile', 'os', 'node', 'load'] as const) {
    if (bounds[key].length === 0) throw new TypeError(`${key} is required`)
  }
  if (bounds.overLimit !== 'reject') {
    throw new TypeError('this member executes overLimit reject only')
  }
  for (const key of ['maxQueue', 'maxExportBytes', 'maxInFlight'] as const) {
    const value = bounds[key]
    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError(`${key} must be a finite positive number`)
    }
  }
  return bounds
}

function parseDeadline(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new TypeError('closeDeadlineMs must be a finite non-negative number')
  }
  return value
}

function parseCorrelation(value: Correlation): Correlation {
  if (value.tenant.length === 0) throw new TypeError('tenant is required')
  const correlation: Correlation = { tenant: value.tenant }
  return copyOptional(correlation, value)
}

function copyOptional(correlation: Correlation, value: Correlation): Correlation {
  const next: {
    tenant: string
    work?: string
    attempt?: string
    instance?: string
    generation?: string
  } = { tenant: correlation.tenant }
  for (const key of ['work', 'attempt', 'instance', 'generation'] as const) {
    const field = value[key]
    if (field === undefined) continue
    if (field.length === 0) throw new TypeError(`${key} must be a non-empty string`)
    next[key] = field
  }
  return next
}

function parseCallerChain(chain: FailureChain): FailureChain {
  const causes = chain.causes
  const first = causes[0]
  if (first === undefined || first.role !== 'origin') {
    throw new TypeError('chain must start with one origin')
  }
  let origins = 0
  const copied: DiagnosticCause[] = []
  for (const cause of causes) {
    if (cause.role === 'export') throw new TypeError('export cause is port-owned')
    if (cause.role === 'origin') origins += 1
    if (cause.summary.length === 0) throw new TypeError('cause summary is required')
    copied.push(copyCallerCause(cause))
  }
  if (origins !== 1) throw new TypeError('chain must start with one origin')
  return { causes: copied }
}

function copyCallerCause(cause: DiagnosticCause): DiagnosticCause {
  if (cause.role === 'export') throw new TypeError('export cause is port-owned')
  if (!cause.detail) return { role: cause.role, summary: cause.summary }
  return { role: cause.role, summary: cause.summary, detail: { ...cause.detail } }
}

function redactChain(chain: FailureChain): FailureChain {
  return {
    causes: chain.causes.map(cause => {
      if (cause.role === 'export' || !cause.detail) {
        return cause.role === 'export'
          ? { role: 'export', summary: cause.summary }
          : { role: cause.role, summary: cause.summary }
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

function appendExport(chain: FailureChain, summary: string): FailureChain {
  return { causes: [...chain.causes, { role: 'export', summary }] }
}

function measure(chain: FailureChain): number {
  return Buffer.byteLength(JSON.stringify(chain), 'utf8')
}

function exportView(record: StoredRecord): ExportedRecord {
  return {
    id: record.id,
    chain: record.chain,
    correlation: record.correlation,
    bytes: record.bytes,
  }
}
