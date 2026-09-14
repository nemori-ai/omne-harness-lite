import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { close as closeFd, constants, fchmod, fstat, open as openFd } from 'node:fs'
import type { Dir } from 'node:fs'
import { chmod, lstat, mkdir, open as openFile, opendir, realpath } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ROOT_CONTEXT, SpanStatusCode, createContextKey, trace } from '@opentelemetry/api'
import type { Context, Span as ApiSpan, Tracer } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { TracerProvider } from '@opentelemetry/sdk-trace'
import type { ReadableSpan, Span as SdkSpan, SpanProcessor } from '@opentelemetry/sdk-trace'
import pino from 'pino'
import type { SonicBoom as SonicBoomType, SonicBoomOpts } from 'sonic-boom'
import type {
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticGap,
  DiagnosticGapReason,
  DiagnosticIdentity,
  DiagnosticPoint,
  DiagnosticDirectoryClose,
  DiagnosticDirectoryStatus,
  Diagnostics,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticSourceOptions,
  LocalDiagnosticSourceResult,
  LocalDiagnosticsDirectory,
  LocalDiagnosticsDirectoryOptions,
  LocalDiagnosticsDirectoryResult,
} from './index.js'
import { projectEnd, projectIdentity, projectPoint, samePrincipal } from './projection.js'
import type { SafeIdentity, SafePoint } from './projection.js'

const levels = new Set(['debug', 'info', 'warn', 'error'])
const systemErrorCodes = new Set([
  'EACCES',
  'EAGAIN',
  'EBADF',
  'EBUSY',
  'EDQUOT',
  'EEXIST',
  'EFBIG',
  'EINTR',
  'EIO',
  'EMFILE',
  'ENFILE',
  'ENOENT',
  'ENOSPC',
  'EPERM',
  'EROFS',
])
const levelValue = { debug: 10, info: 20, warn: 30, error: 40 } as const
const diagnosticFile = /^diagnostic-(?:[0-9a-f]{16}-)?[0-9a-f]{16}\.jsonl$/u
const SonicBoom = createRequire(import.meta.url)('sonic-boom') as new (
  options: SonicBoomOpts,
) => SonicBoomType
const fsExt = createRequire(import.meta.url)('fs-ext') as Readonly<{
  flock(
    descriptor: number,
    flags: 'exnb',
    callback: (error: NodeJS.ErrnoException | null) => void,
  ): void
}>
const lockFileName = '.diagnostics.lock'
const scanRecordBytes = 8 * 1_024 + 1

type InternalContext = Readonly<{
  identity: SafeIdentity
  native: Context
}>

type MutableGap = {
  firstSeq: bigint | null
  lastSeq: bigint | null
  count: bigint | null
  quality: 'counted' | 'unknown'
}

type ActiveSpan = {
  readonly span: ApiSpan
  readonly context: InternalContext
  readonly point: SafePoint
  end: DiagnosticEnd | null
}

function systemErrorCode(error: unknown): string | undefined {
  const code =
    error !== null &&
    typeof error === 'object' &&
    typeof (error as NodeJS.ErrnoException).code === 'string'
      ? (error as NodeJS.ErrnoException).code
      : undefined
  return code !== undefined && systemErrorCodes.has(code) ? code : undefined
}

type StartupFailure = Readonly<{
  code: string
  reason: 'retention_capacity' | 'write_unavailable'
}>

type RuntimeOptions = LocalDiagnosticSourceOptions & Readonly<{ directory: string }>

type SourceBudget = Readonly<{
  reserve(bytes: number): boolean
  release(bytes: number): void
  confirm(bytes: number): void
  closing(): void
  released(): void
  unknown(code: string): void
  finalize(): Promise<boolean>
}>

class StartupCleanupFailure extends Error {
  readonly cleanupUnknown: boolean
  readonly code: string | undefined

  constructor(cause: unknown, cleanupUnknown: boolean) {
    super('diagnostics source preparation failed')
    this.cleanupUnknown = cleanupUnknown
    this.code = systemErrorCode(cause)
  }
}

const invalidIdentity: SafeIdentity = Object.freeze({
  tenantId: null,
  principal: Object.freeze({ kind: 'system', systemId: 'diagnostics-invalid' }),
  causality: Object.freeze({}),
})

function validPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function validateOptions(options: RuntimeOptions): string | undefined {
  if (options === null || typeof options !== 'object') return 'INVALID_OPTIONS'
  if (
    typeof options.instanceId !== 'string' ||
    options.instanceId.length === 0 ||
    Buffer.byteLength(options.instanceId, 'utf8') > 256 ||
    /[\u0000-\u001f\u007f]/u.test(options.instanceId)
  )
    return 'INVALID_INSTANCE_ID'
  if (
    typeof options.sourceId !== 'string' ||
    options.sourceId.length === 0 ||
    Buffer.byteLength(options.sourceId, 'utf8') > 256 ||
    /[\u0000-\u001f\u007f]/u.test(options.sourceId)
  )
    return 'INVALID_SOURCE_ID'
  if (!levels.has(options.level)) return 'INVALID_LEVEL'
  for (const key of [
    'maxRecordBytes',
    'maxActiveSpans',
    'maxBufferBytes',
    'maxFileBytes',
  ] as const) {
    if (!validPositiveInteger(options[key]))
      return `INVALID_${key.replaceAll(/[A-Z]/g, value => `_${value}`).toUpperCase()}`
  }
  if (
    options.maxRecordBytes > options.maxBufferBytes ||
    options.maxRecordBytes > options.maxFileBytes
  ) {
    return 'INVALID_RECORD_CAPACITY'
  }
  return undefined
}

function fileName(options: LocalDiagnosticSourceOptions): string {
  const source = createHash('sha256').update(options.sourceId, 'utf8').digest('hex').slice(0, 16)
  return `diagnostic-${source}.jsonl`
}

function frozenStatus(runtime: LocalRuntime): DiagnosticStatus {
  const pendingIdleMs =
    runtime.pendingBytes > 0 && runtime.lastWriteProgressAt !== null
      ? Math.max(0, performance.now() - runtime.lastWriteProgressAt)
      : null
  return Object.freeze({
    sourceId: runtime.sourceId,
    phase: runtime.phase,
    attemptedThrough: String(runtime.attempted),
    acceptedCount: String(runtime.accepted),
    droppedCount: String(runtime.dropped),
    pendingBytes: runtime.pendingBytes,
    writtenBytes: String(runtime.writtenBytes),
    activeSpans: runtime.activeSpanCount,
    writeProgress: runtime.writeFailed
      ? 'failed'
      : pendingIdleMs !== null && pendingIdleMs >= 1_000
        ? 'stalled'
        : runtime.pendingBytes > 0
          ? 'pending'
          : 'idle',
    pendingIdleMs,
    gaps: Object.freeze(runtime.gapSnapshot()),
    lastErrorCode: runtime.lastErrorCode,
    resource: runtime.resource,
  })
}

class LocalSpanProcessor implements SpanProcessor {
  constructor(private readonly runtime: LocalRuntime) {}

  onStart(_span: SdkSpan, _parentContext: Context): void {}

  onEnd(span: ReadableSpan): void {
    this.runtime.finishSpan(span)
  }

  async forceFlush(): Promise<void> {}

  async shutdown(): Promise<void> {}
}

class LocalRuntime implements DiagnosticsRuntime {
  readonly diagnostics: Diagnostics
  readonly sourceId: string
  phase: DiagnosticStatus['phase'] = 'active'
  resource: DiagnosticStatus['resource'] = 'held'
  attempted = 0n
  accepted = 0n
  dropped = 0n
  pendingBytes = 0
  writtenBytes = 0n
  lastWriteProgressAt: number | null = null
  activeSpanCount = 0
  writeFailed = false
  lastErrorCode: string | null = null
  private readonly configuredLevel: LocalDiagnosticSourceOptions['level']
  private readonly maxRecordBytes: number
  private readonly maxActiveSpans: number
  private readonly idPrefix: string
  private readonly stream: SonicBoomType | null
  private readonly budget: SourceBudget
  private readonly logger: pino.Logger | null
  private readonly manager = new AsyncLocalStorageContextManager().enable()
  private readonly contextKey = createContextKey('omne-harness-lite diagnostics context')
  private readonly contexts = new WeakMap<DiagnosticContext, InternalContext>()
  private readonly gapState = new Map<DiagnosticGapReason, MutableGap>()
  private readonly provider: TracerProvider
  private readonly tracer: Tracer
  private readonly activeSpans = new Map<string, ActiveSpan>()
  private activeZeroWaiter: (() => void) | undefined
  private idCounter = 0n
  private emissionSeq: bigint | null = null
  private closeTask: Promise<boolean> | undefined
  private outputAvailable = true
  private retentionReached = false
  private streamClosed = false
  private streamCloseStarted = false
  private closeOutcomeUnknown = false
  private budgetFinalized = false
  private providerClosed = false
  private closeMarkerAttempted = false
  private gapRevision = 0n
  private reportedGapRevision = 0n
  private emittingGapSummary = false
  private gapSummaryAccepted = false
  private gapSummaryAttempts = 0n

  constructor(
    options: RuntimeOptions,
    stream: SonicBoomType | null,
    budget: SourceBudget,
    failure?: StartupFailure,
    crashUnknown = false,
    cleanupUnknown = false,
  ) {
    this.sourceId = options.sourceId
    this.configuredLevel = options.level
    this.maxRecordBytes = options.maxRecordBytes
    this.maxActiveSpans = options.maxActiveSpans
    this.budget = budget
    this.idPrefix = createHash('sha256')
      .update(options.instanceId, 'utf8')
      .update('\0')
      .update(options.sourceId, 'utf8')
      .digest('hex')
      .slice(0, 24)
    this.stream = stream
    if (stream === null) {
      this.logger = null
      this.phase = 'degraded'
      this.resource = cleanupUnknown ? 'unknown' : 'released'
      this.closeOutcomeUnknown = cleanupUnknown
      this.writeFailed = true
      this.outputAvailable = false
      this.lastErrorCode = failure?.code ?? 'SOURCE_OPEN_FAILED'
      this.addGap(failure?.reason ?? 'write_unavailable', this.nextSeq())
    } else {
      const destination = {
        write: (line: string): boolean => {
          const bytes = Buffer.byteLength(line, 'utf8')
          const seq = this.emissionSeq
          if (bytes > this.maxRecordBytes) {
            this.addGap('buffer_capacity', seq)
            return true
          }
          if (!this.outputAvailable) {
            this.addGap('write_unavailable', seq)
            return true
          }
          if (this.retentionReached || !this.budget.reserve(bytes)) {
            this.retentionReached = true
            this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
            this.lastErrorCode = 'RETENTION_CAPACITY'
            this.addGap('retention_capacity', seq)
            return true
          }
          this.pendingBytes += bytes
          this.lastWriteProgressAt ??= performance.now()
          let dropped = false
          const onDrop = (): void => {
            dropped = true
          }
          stream.once('drop', onDrop)
          try {
            const writable = stream.write(line)
            if (dropped) {
              this.pendingBytes -= bytes
              this.budget.release(bytes)
              if (this.pendingBytes === 0) this.lastWriteProgressAt = null
              this.addGap('buffer_capacity', seq)
            } else {
              this.accepted += 1n
              if (this.emittingGapSummary) this.gapSummaryAccepted = true
            }
            return writable
          } finally {
            stream.off('drop', onDrop)
          }
        },
      }
      this.logger = pino(
        {
          base: null,
          timestamp: false,
          level: 'debug',
          formatters: { level: label => ({ level: label }) },
          redact: {
            paths: [
              'error',
              'err',
              'message',
              'stack',
              'body',
              'secret',
              'params',
              'headers',
              'url',
              'query',
              'target',
              'rawArgs',
            ],
            remove: true,
          },
        },
        destination,
      )
      stream.on('write', (bytes: number) => {
        this.writtenBytes += BigInt(bytes)
        this.budget.confirm(bytes)
        this.pendingBytes = Math.max(0, this.pendingBytes - bytes)
        this.lastWriteProgressAt = this.pendingBytes === 0 ? null : performance.now()
      })
      stream.on('drain', () => {
        this.emitGapSummary()
      })
      stream.on('error', (error: NodeJS.ErrnoException) => {
        this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
        this.writeFailed = true
        this.outputAvailable = false
        this.lastErrorCode = systemErrorCode(error) ?? 'SONIC_ERROR'
        this.addGap('write_unavailable', null, 'unknown')
        if (this.streamCloseStarted) {
          this.resource = 'unknown'
          this.closeOutcomeUnknown = true
          this.budget.unknown('SOURCE_RELEASE_UNKNOWN')
          return
        }
        try {
          this.streamCloseStarted = true
          stream.destroy()
        } catch {
          this.resource = 'unknown'
          this.closeOutcomeUnknown = true
          this.budget.unknown('SOURCE_RELEASE_UNKNOWN')
        }
      })
      stream.on('close', () => {
        this.streamClosed = true
        this.resource = 'released'
        this.budget.released()
      })
    }
    this.provider = new TracerProvider({
      spanProcessors: [new LocalSpanProcessor(this)],
      spanLimits: {
        attributeCountLimit: 32,
        attributeValueLengthLimit: 256,
        eventCountLimit: 8,
        linkCountLimit: 4,
      },
    })
    this.tracer = this.provider.getTracer('@omne-harness-lite/diagnostics', '1')
    if (stream !== null) this.emitMarker('diagnostic.source_started')
    if (crashUnknown) this.addGap('crash_unknown', null, 'unknown')

    this.diagnostics = Object.freeze({
      newId: () => `diagnostic-${this.idPrefix}-${++this.idCounter}`,
      scope: (identity: DiagnosticIdentity, parent?: DiagnosticContext) =>
        this.scope(identity, parent),
      current: () => this.current(),
      log: (context: DiagnosticContext, point: DiagnosticPoint) => this.log(context, point),
      startSpan: (context: DiagnosticContext, point: DiagnosticPoint) =>
        this.startSpan(context, point),
      within: <T>(context: DiagnosticContext, body: () => T): T => this.within(context, body),
    })
  }

  private nextSeq(): bigint {
    this.attempted += 1n
    return this.attempted
  }

  gapSnapshot(): readonly DiagnosticGap[] {
    return [...this.gapState].map(([reason, gap]) =>
      Object.freeze({
        reason,
        firstSeq: gap.firstSeq === null ? null : String(gap.firstSeq),
        lastSeq: gap.lastSeq === null ? null : String(gap.lastSeq),
        count: gap.count === null ? null : String(gap.count),
        quality: gap.quality,
      }),
    )
  }

  private addGap(
    reason: DiagnosticGapReason,
    seq: bigint | null,
    quality: 'counted' | 'unknown' = 'counted',
  ): void {
    const existing = this.gapState.get(reason)
    if (existing === undefined) {
      this.gapState.set(reason, {
        firstSeq: seq,
        lastSeq: seq,
        count: quality === 'counted' ? 1n : null,
        quality,
      })
    } else {
      if (existing.firstSeq === null) existing.firstSeq = seq
      if (seq !== null) existing.lastSeq = seq
      if (existing.quality === 'counted' && quality === 'counted' && existing.count !== null) {
        existing.count += 1n
      } else {
        existing.quality = 'unknown'
        existing.count = null
      }
    }
    if (quality === 'counted') this.dropped += 1n
    this.gapRevision += 1n
  }

  private makeContext(identity: SafeIdentity, parent: Context): DiagnosticContext {
    const context = Object.freeze({}) as DiagnosticContext
    const native = parent.setValue(this.contextKey, context)
    this.contexts.set(context, Object.freeze({ identity, native }))
    return context
  }

  private scope(identity: DiagnosticIdentity, parent?: DiagnosticContext): DiagnosticContext {
    if (this.phase === 'closing' || this.phase === 'closed') {
      this.addGap('closing', this.nextSeq())
      return this.makeContext(invalidIdentity, ROOT_CONTEXT)
    }
    const projected = projectIdentity(identity)
    if (!projected.ok) {
      this.addGap('invalid_projection', this.nextSeq())
      return this.makeContext(invalidIdentity, ROOT_CONTEXT)
    }
    let nativeParent = ROOT_CONTEXT
    if (parent !== undefined) {
      const parentContext = this.contexts.get(parent)
      if (
        parentContext === undefined ||
        parentContext.identity.tenantId !== projected.value.tenantId ||
        !samePrincipal(parentContext.identity.principal, projected.value.principal)
      ) {
        this.addGap('invalid_projection', this.nextSeq())
      } else {
        nativeParent = parentContext.native
      }
    }
    return this.makeContext(projected.value, nativeParent)
  }

  private current(): DiagnosticContext | null {
    if (this.phase === 'closing' || this.phase === 'closed') return null
    const active = this.manager.active().getValue(this.contextKey)
    return active !== null &&
      typeof active === 'object' &&
      this.contexts.has(active as DiagnosticContext)
      ? (active as DiagnosticContext)
      : null
  }

  private within<T>(context: DiagnosticContext, body: () => T): T {
    if (this.phase === 'closing' || this.phase === 'closed') return body()
    const internal = this.contexts.get(context)
    if (internal === undefined) {
      this.addGap('invalid_projection', this.nextSeq())
      return body()
    }
    let bodyCalled = false
    try {
      return this.manager.with(internal.native, () => {
        bodyCalled = true
        return body()
      })
    } catch (error) {
      if (bodyCalled) throw error
      this.addGap('write_unavailable', this.nextSeq())
      return body()
    }
  }

  private log(context: DiagnosticContext, point: DiagnosticPoint): void {
    const seq = this.nextSeq()
    if (this.phase === 'closing' || this.phase === 'closed') {
      this.addGap('closing', seq)
      return
    }
    const internal = this.contexts.get(context)
    const projected = projectPoint(point)
    if (internal === undefined || !projected.ok) {
      this.addGap('invalid_projection', seq)
      return
    }
    if (levelValue[projected.value.level] < levelValue[this.configuredLevel]) {
      this.addGap('level_excluded', seq)
      return
    }
    this.emitPoint(seq, internal, projected.value)
  }

  private startSpan(context: DiagnosticContext, point: DiagnosticPoint): DiagnosticSpan {
    const internal = this.contexts.get(context)
    const inert: DiagnosticSpan = Object.freeze({
      context: internal === undefined ? (Object.freeze({}) as DiagnosticContext) : context,
      end(_result: DiagnosticEnd): void {},
    })
    if (this.phase === 'closing' || this.phase === 'closed') {
      this.addGap('closing', this.nextSeq())
      return inert
    }
    const projected = projectPoint(point)
    if (internal === undefined || !projected.ok) {
      this.addGap('invalid_projection', this.nextSeq())
      return inert
    }
    if (levelValue[projected.value.level] < levelValue[this.configuredLevel]) {
      this.addGap('level_excluded', this.nextSeq())
      return inert
    }
    if (this.activeSpans.size >= this.maxActiveSpans) {
      this.addGap('span_capacity', this.nextSeq())
      return inert
    }
    let span: ApiSpan
    try {
      span = this.tracer.startSpan(
        `${projected.value.component}.${projected.value.phase}`,
        { attributes: this.spanAttributes(internal.identity, projected.value) },
        internal.native,
      )
    } catch {
      this.addGap('write_unavailable', this.nextSeq())
      return inert
    }
    const spanContext = span.spanContext()
    const child = this.makeContext(
      internal.identity,
      trace.setSpanContext(internal.native, spanContext),
    )
    this.activeSpans.set(spanContext.spanId, {
      span,
      context: this.contexts.get(child)!,
      point: projected.value,
      end: null,
    })
    this.activeSpanCount = this.activeSpans.size
    let ended = false
    return Object.freeze({
      context: child,
      end: (result: DiagnosticEnd): void => {
        if (ended) return
        this.endSpan(spanContext.spanId, result)
        ended = true
      },
    })
  }

  private spanAttributes(
    identity: SafeIdentity,
    point: SafePoint,
  ): Readonly<Record<string, string | number>> {
    const attributes: Record<string, string | number> = {
      'diagnostic.component': point.component,
      'diagnostic.phase': point.phase,
      'diagnostic.code': point.code,
      'diagnostic.level': point.level,
      'diagnostic.tenant_id': identity.tenantId ?? 'system',
      'diagnostic.principal_kind': identity.principal.kind,
    }
    if (identity.principal.kind === 'user')
      attributes['diagnostic.user_id'] = identity.principal.user.userId
    else attributes['diagnostic.system_id'] = identity.principal.systemId
    if (identity.operation !== undefined) {
      attributes['diagnostic.operation_namespace'] = identity.operation.namespace
      attributes['diagnostic.operation_id'] = identity.operation.operationId
    }
    if (point.diagnosticId !== undefined) attributes['diagnostic.id'] = point.diagnosticId
    if (point.measures !== undefined) {
      for (const [key, value] of Object.entries(point.measures))
        attributes[`diagnostic.measure.${key}`] = value
    }
    return attributes
  }

  private endSpan(spanId: string, result: DiagnosticEnd): void {
    const active = this.activeSpans.get(spanId)
    if (active === undefined) return
    let projected: ReturnType<typeof projectEnd>
    try {
      projected = projectEnd(result)
    } catch {
      projected = Object.freeze({ ok: false })
    }
    if (projected.ok) {
      active.end = projected.value
      active.span.setAttribute('diagnostic.end.code', projected.value.code)
      active.span.setAttribute('diagnostic.outcome', projected.value.outcome)
      active.span.setStatus({
        code:
          projected.value.outcome === 'ok'
            ? SpanStatusCode.OK
            : projected.value.outcome === 'failed'
              ? SpanStatusCode.ERROR
              : SpanStatusCode.UNSET,
      })
    } else {
      this.addGap('invalid_projection', this.nextSeq())
      active.end = Object.freeze({ code: 'diagnostic.invalid_end', outcome: 'failed' })
      active.span.setStatus({ code: SpanStatusCode.ERROR })
    }
    try {
      active.span.end()
    } catch {
      this.activeSpans.delete(spanId)
      this.activeSpanCount = this.activeSpans.size
      this.addGap('write_unavailable', this.nextSeq())
      this.notifyActiveZero()
    }
  }

  finishSpan(span: ReadableSpan): void {
    const spanContext = span.spanContext()
    const active = this.activeSpans.get(spanContext.spanId)
    if (active === undefined) return
    this.activeSpans.delete(spanContext.spanId)
    this.activeSpanCount = this.activeSpans.size
    const end =
      active.end ?? Object.freeze({ code: 'diagnostic.missing_end', outcome: 'failed' as const })
    const seq = this.nextSeq()
    this.emitSpan(seq, active.context, active.point, end, span)
    this.notifyActiveZero()
  }

  private notifyActiveZero(): void {
    if (this.activeSpans.size !== 0 || this.activeZeroWaiter === undefined) return
    const resolve = this.activeZeroWaiter
    this.activeZeroWaiter = undefined
    resolve()
  }

  private emitSpan(
    seq: bigint,
    context: InternalContext,
    point: SafePoint,
    end: DiagnosticEnd,
    span: ReadableSpan,
  ): void {
    const spanContext = span.spanContext()
    if (this.logger === null) {
      this.addGap('write_unavailable', seq)
      return
    }
    try {
      this.emissionSeq = seq
      const record = {
        formatVersion: 'omne-diagnostic/1',
        sourceId: this.sourceId,
        seq: String(seq),
        observedAt: new Date().toISOString(),
        kind: 'span',
        tenantId: context.identity.tenantId,
        principal: context.identity.principal,
        ...(context.identity.operation === undefined
          ? {}
          : { operation: context.identity.operation }),
        causality: context.identity.causality,
        ...point,
        code: end.code,
        outcome: end.outcome,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        ...(span.parentSpanContext === undefined
          ? {}
          : { parentSpanId: span.parentSpanContext.spanId }),
      }
      if (point.level === 'debug') this.logger.debug(record)
      else if (point.level === 'info') this.logger.info(record)
      else if (point.level === 'warn') this.logger.warn(record)
      else this.logger.error(record)
    } catch {
      this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
      this.writeFailed = true
      this.lastErrorCode = 'PINO_WRITE_FAILED'
      this.addGap('write_unavailable', seq)
    } finally {
      this.emissionSeq = null
    }
  }

  private emitMarker(code: string): void {
    const seq = this.nextSeq()
    if (this.logger === null) {
      this.addGap('write_unavailable', seq)
      return
    }
    try {
      this.emissionSeq = seq
      this.logger.info({
        formatVersion: 'omne-diagnostic/1',
        sourceId: this.sourceId,
        seq: String(seq),
        observedAt: new Date().toISOString(),
        component: 'diagnostics',
        phase: 'lifecycle',
        code,
      })
    } catch {
      this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
      this.writeFailed = true
      this.lastErrorCode = 'PINO_WRITE_FAILED'
      this.addGap('write_unavailable', seq)
    } finally {
      this.emissionSeq = null
    }
  }

  private emitGapSummary(): void {
    if (
      this.logger === null ||
      this.emittingGapSummary ||
      this.gapRevision === this.reportedGapRevision ||
      !this.outputAvailable ||
      this.retentionReached ||
      this.phase === 'closed'
    ) {
      return
    }
    const revision = this.gapRevision
    const seq = this.nextSeq()
    this.gapSummaryAttempts += 1n
    this.emittingGapSummary = true
    this.gapSummaryAccepted = false
    try {
      this.emissionSeq = seq
      this.logger.warn({
        formatVersion: 'omne-diagnostic/1',
        sourceId: this.sourceId,
        seq: String(seq),
        observedAt: new Date().toISOString(),
        kind: 'gap',
        component: 'diagnostics',
        phase: 'gap',
        code: 'diagnostic.gap',
        gaps: this.gapSnapshot(),
      })
      if (this.gapSummaryAccepted) this.reportedGapRevision = revision
    } catch {
      this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
      this.writeFailed = true
      this.lastErrorCode = 'PINO_WRITE_FAILED'
      this.addGap('write_unavailable', seq)
    } finally {
      this.emissionSeq = null
      this.gapSummaryAccepted = false
      this.emittingGapSummary = false
    }
  }

  private emitPoint(seq: bigint, context: InternalContext, point: SafePoint): void {
    const activeSpan = trace.getSpan(context.native)?.spanContext()
    if (this.logger === null) {
      this.addGap('write_unavailable', seq)
      return
    }
    try {
      this.emissionSeq = seq
      const record = {
        formatVersion: 'omne-diagnostic/1',
        sourceId: this.sourceId,
        seq: String(seq),
        observedAt: new Date().toISOString(),
        kind: 'log',
        tenantId: context.identity.tenantId,
        principal: context.identity.principal,
        ...(context.identity.operation === undefined
          ? {}
          : { operation: context.identity.operation }),
        causality: context.identity.causality,
        ...point,
        ...(activeSpan === undefined
          ? {}
          : {
              traceId: activeSpan.traceId,
              spanId: activeSpan.spanId,
            }),
      }
      if (point.level === 'debug') this.logger.debug(record)
      else if (point.level === 'info') this.logger.info(record)
      else if (point.level === 'warn') this.logger.warn(record)
      else this.logger.error(record)
    } catch {
      this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
      this.writeFailed = true
      this.lastErrorCode = 'PINO_WRITE_FAILED'
      this.addGap('write_unavailable', seq)
    } finally {
      this.emissionSeq = null
    }
  }

  inspect(): DiagnosticStatus {
    return frozenStatus(this)
  }

  async close(options: Readonly<{ deadlineMs: number }>): Promise<DiagnosticClose> {
    if (!validPositiveInteger(options.deadlineMs)) {
      return Object.freeze({ status: 'blocked', state: this.inspect() })
    }
    if (this.phase === 'closed') return Object.freeze({ status: 'closed', state: this.inspect() })
    this.phase = 'closing'
    this.budget.closing()
    if (this.closeTask === undefined) {
      const task = this.finishClose()
      this.closeTask = task
      void task.then(completed => {
        if (!completed && this.closeTask === task) this.closeTask = undefined
      })
    }
    const closeTask = this.closeTask
    let timer: NodeJS.Timeout | undefined
    const completed = await Promise.race([
      closeTask,
      new Promise<false>(resolve => {
        timer = setTimeout(() => resolve(false), options.deadlineMs)
      }),
    ])
    if (timer !== undefined) clearTimeout(timer)
    if (completed && this.resource === 'released') {
      this.phase = 'closed'
      this.manager.disable()
      return Object.freeze({ status: 'closed', state: this.inspect() })
    }
    return Object.freeze({ status: 'blocked', state: this.inspect() })
  }

  private async finishClose(): Promise<boolean> {
    if (this.activeSpans.size > 0) {
      await new Promise<void>(resolve => {
        this.activeZeroWaiter = resolve
      })
    }
    if (!this.providerClosed) {
      try {
        await this.provider.forceFlush()
        await this.provider.shutdown()
        this.providerClosed = true
      } catch {
        this.writeFailed = true
        this.lastErrorCode = 'OTEL_CLOSE_FAILED'
        return false
      }
    }
    if (this.stream === null) {
      if (this.closeOutcomeUnknown || this.resource !== 'released') return false
      return this.finalizeBudget()
    }
    if (this.streamClosed || this.resource === 'released') return this.finalizeBudget()
    if (this.closeOutcomeUnknown) return false
    if (this.streamCloseStarted) {
      try {
        await once(this.stream, 'close')
        return this.finalizeBudget()
      } catch {
        this.closeOutcomeUnknown = true
        this.resource = 'unknown'
        this.budget.unknown('SOURCE_RELEASE_UNKNOWN')
        return false
      }
    }
    if (this.gapRevision !== this.reportedGapRevision) {
      const attemptsBeforeRecovery = this.gapSummaryAttempts
      if (this.pendingBytes > 0) {
        try {
          await once(this.stream, 'drain')
        } catch {
          return false
        }
      }
      if (this.gapSummaryAttempts === attemptsBeforeRecovery) this.emitGapSummary()
    }
    if (!this.closeMarkerAttempted) {
      this.closeMarkerAttempted = true
      this.emitMarker('diagnostic.source_closed')
    }
    const closed = once(this.stream, 'close')
    try {
      this.streamCloseStarted = true
      this.stream.end()
      await closed
      return this.finalizeBudget()
    } catch {
      this.writeFailed = true
      this.lastErrorCode ??= 'SONIC_CLOSE_FAILED'
      this.closeOutcomeUnknown = true
      this.resource = 'unknown'
      this.budget.unknown('SOURCE_RELEASE_UNKNOWN')
      return false
    }
  }

  private async finalizeBudget(): Promise<boolean> {
    if (this.budgetFinalized) return true
    try {
      if (!(await this.budget.finalize())) {
        this.lastErrorCode = 'SOURCE_FINAL_STAT_FAILED'
        return false
      }
      this.budgetFinalized = true
      this.pendingBytes = 0
      this.lastWriteProgressAt = null
      return true
    } catch {
      this.lastErrorCode = 'SOURCE_FINAL_STAT_FAILED'
      return false
    }
  }
}

type ScannedSource = Readonly<{
  sourceId: string | null
  clean: boolean
}>

type SourceEntry = {
  sourceId: string | null
  configKey: string | null
  phase: 'preparing' | 'live' | 'closing' | 'retained'
  chargedBytes: bigint
  reservedBytes: bigint
  resource: 'held' | 'released' | 'unknown'
  materialized: boolean
  path: string
  device: bigint | null
  inode: bigint | null
  maxFileBytes: bigint
  runtime: LocalRuntime | null
  preparation: Promise<LocalDiagnosticSourceResult> | null
}

class DirectoryFailure extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}

class ScanCleanupFailure extends Error {
  readonly code: string | undefined

  constructor(
    readonly handles: readonly (Dir | FileHandle)[],
    cause: unknown,
  ) {
    super('diagnostics scan cleanup result is unknown')
    this.code = systemErrorCode(cause)
  }
}

function validSourceId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    Buffer.byteLength(value, 'utf8') <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  )
}

async function scanSource(path: string, size: number, name: string): Promise<ScannedSource> {
  if (size === 0) return Object.freeze({ sourceId: null, clean: false })
  const handle = await openFile(path, 'r')
  let sourceId: string | null = null
  let clean = false
  try {
    const window = Math.min(size, scanRecordBytes)
    const firstBuffer = Buffer.alloc(window)
    const firstRead = await handle.read(firstBuffer, 0, window, 0)
    const firstText = firstBuffer.subarray(0, firstRead.bytesRead).toString('utf8')
    const newline = firstText.indexOf('\n')
    if (newline >= 0) {
      const first = JSON.parse(firstText.slice(0, newline)) as Record<string, unknown>
      if (
        first.formatVersion === 'omne-diagnostic/1' &&
        first.code === 'diagnostic.source_started' &&
        validSourceId(first.sourceId) &&
        name.endsWith(
          `${createHash('sha256').update(first.sourceId, 'utf8').digest('hex').slice(0, 16)}.jsonl`,
        )
      ) {
        sourceId = first.sourceId
      }
    }
    const tailBuffer = Buffer.alloc(window)
    const tailRead = await handle.read(tailBuffer, 0, window, Math.max(0, size - window))
    const tail = tailBuffer.subarray(0, tailRead.bytesRead).toString('utf8')
    const completeTail = tail.endsWith('\n') ? tail.slice(0, -1) : ''
    const lastLine = completeTail.slice(completeTail.lastIndexOf('\n') + 1)
    const last = JSON.parse(lastLine) as Record<string, unknown>
    clean =
      sourceId !== null &&
      last.formatVersion === 'omne-diagnostic/1' &&
      last.sourceId === sourceId &&
      last.code === 'diagnostic.source_closed'
  } catch {
    clean = false
  }
  try {
    await handle.close()
  } catch (error) {
    throw new ScanCleanupFailure([handle], error)
  }
  return Object.freeze({ sourceId, clean })
}

function validateDirectoryOptions(options: LocalDiagnosticsDirectoryOptions): string | undefined {
  if (options === null || typeof options !== 'object') return 'INVALID_OPTIONS'
  if (typeof options.directory !== 'string' || !isAbsolute(options.directory)) {
    return 'INVALID_DIRECTORY'
  }
  if (!validPositiveInteger(options.maxDirectoryBytes)) return 'INVALID_MAX_DIRECTORY_BYTES'
  if (!validPositiveInteger(options.maxFiles)) return 'INVALID_MAX_FILES'
  return undefined
}

function sourceConfigKey(options: LocalDiagnosticSourceOptions): string {
  return JSON.stringify([
    options.instanceId,
    options.sourceId,
    options.level,
    options.maxRecordBytes,
    options.maxActiveSpans,
    options.maxBufferBytes,
    options.maxFileBytes,
  ])
}

function sourceFailure(error: unknown): StartupFailure {
  const code = error instanceof StartupCleanupFailure ? error.code : systemErrorCode(error)
  if (code === 'EEXIST') {
    return Object.freeze({ code: 'SOURCE_EXISTS', reason: 'write_unavailable' })
  }
  if (code === 'ENOSPC' || code === 'EDQUOT') {
    return Object.freeze({ code: 'RETENTION_CAPACITY', reason: 'retention_capacity' })
  }
  return Object.freeze({
    code: code === undefined ? 'SOURCE_OPEN_FAILED' : `SOURCE_OPEN_${code}`,
    reason: 'write_unavailable',
  })
}

async function closeRawDescriptor(descriptor: number): Promise<boolean> {
  return new Promise(resolve => {
    closeFd(descriptor, error => resolve(error === null))
  })
}

async function sourceMetadata(descriptor: number): Promise<Readonly<{ dev: bigint; ino: bigint }>> {
  return new Promise((resolve, reject) => {
    fstat(descriptor, { bigint: true }, (error, stats) => {
      if (error !== null) reject(error)
      else resolve(Object.freeze({ dev: stats.dev, ino: stats.ino }))
    })
  })
}

async function createStream(
  path: string,
  options: LocalDiagnosticSourceOptions,
  materialized: () => void,
  opened: (metadata: Readonly<{ dev: bigint; ino: bigint }>) => void,
): Promise<SonicBoomType> {
  const descriptor = await new Promise<number>((resolve, reject) => {
    openFd(path, 'wx', 0o600, (error, fd) => {
      if (error !== null) reject(error)
      else resolve(fd)
    })
  })
  materialized()
  let metadata: Readonly<{ dev: bigint; ino: bigint }>
  try {
    metadata = await sourceMetadata(descriptor)
  } catch (error) {
    const released = await closeRawDescriptor(descriptor)
    throw new StartupCleanupFailure(error, !released)
  }
  opened(metadata)
  try {
    await new Promise<void>((resolve, reject) => {
      fchmod(descriptor, 0o600, error => {
        if (error !== null) reject(error)
        else resolve()
      })
    })
  } catch (error) {
    const released = await closeRawDescriptor(descriptor)
    throw new StartupCleanupFailure(error, !released)
  }
  try {
    return new SonicBoom({
      fd: descriptor,
      sync: false,
      minLength: 0,
      maxLength: options.maxBufferBytes,
      maxWrite: 16_384,
      fsync: false,
      retryEAGAIN: () => false,
    })
  } catch (error) {
    const released = await closeRawDescriptor(descriptor)
    throw new StartupCleanupFailure(error, !released)
  }
}

async function flockExclusive(descriptor: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fsExt.flock(descriptor, 'exnb', error => {
      if (error !== null) reject(error)
      else resolve()
    })
  })
}

class DirectoryOwner implements LocalDiagnosticsDirectory {
  private phase: DiagnosticDirectoryStatus['phase'] = 'preparing'
  private scan: DiagnosticDirectoryStatus['scan'] = 'incomplete'
  private lock: DiagnosticDirectoryStatus['lock'] = 'released'
  private lockResource: 'held' | 'released' | 'unknown' = 'held'
  private lastErrorCode: string | null = null
  private chargedBytes = 0n
  private reservedBytes = 0n
  private crashUnknown = false
  private scanCleanupUnknown = false
  private readonly retainedScanHandles: (Dir | FileHandle)[] = []
  private lockCloseTask: Promise<boolean> | null = null
  private readonly sources: SourceEntry[] = []

  constructor(
    private readonly options: LocalDiagnosticsDirectoryOptions,
    private readonly directory: string,
    private lockHandle: FileHandle | null,
  ) {}

  acquiredLock(): void {
    this.lock = 'held'
  }

  fail(code: string): void {
    this.lastErrorCode = code
    if (this.phase !== 'closing' && this.phase !== 'closed') this.phase = 'failed'
  }

  markScanCleanupUnknown(error: ScanCleanupFailure): void {
    this.scanCleanupUnknown = true
    this.retainedScanHandles.push(...error.handles)
    this.fail(error.code === undefined ? 'SCAN_RELEASE_UNKNOWN' : `SCAN_RELEASE_${error.code}`)
  }

  async scanDirectory(): Promise<void> {
    const directoryHandle = await opendir(this.directory)
    try {
      for (;;) {
        const entry = await directoryHandle.read()
        if (entry === null) break
        if (entry.name === lockFileName) continue
        if (!diagnosticFile.test(entry.name)) throw new DirectoryFailure('UNKNOWN_DIRECTORY_ENTRY')
        const path = join(this.directory, entry.name)
        const metadata = await lstat(path, { bigint: true })
        if (!metadata.isFile()) throw new DirectoryFailure('INVALID_SOURCE_FILE')
        if (this.sources.length >= this.options.maxFiles) {
          throw new DirectoryFailure('DIRECTORY_FILE_CAPACITY')
        }
        const size = metadata.size
        if (this.chargedBytes + size > BigInt(this.options.maxDirectoryBytes)) {
          throw new DirectoryFailure('DIRECTORY_BYTE_CAPACITY')
        }
        const scanned = await scanSource(path, Number(size), entry.name)
        if (
          scanned.sourceId !== null &&
          this.sources.some(candidate => candidate.sourceId === scanned.sourceId)
        ) {
          throw new DirectoryFailure('DUPLICATE_SOURCE')
        }
        this.chargedBytes += size
        this.sources.push({
          sourceId: scanned.sourceId,
          configKey: null,
          phase: 'retained',
          chargedBytes: size,
          reservedBytes: 0n,
          resource: 'released',
          materialized: true,
          path,
          device: metadata.dev,
          inode: metadata.ino,
          maxFileBytes: size,
          runtime: null,
          preparation: null,
        })
        if (!scanned.clean) this.crashUnknown = true
      }
      try {
        await directoryHandle.close()
      } catch (error) {
        throw new ScanCleanupFailure([directoryHandle], error)
      }
    } catch (error) {
      if (
        !(error instanceof ScanCleanupFailure) ||
        !error.handles.includes(directoryHandle)
      ) {
        try {
          await directoryHandle.close()
        } catch (closeError) {
          throw new ScanCleanupFailure(
            [
              ...(error instanceof ScanCleanupFailure ? error.handles : []),
              directoryHandle,
            ],
            closeError,
          )
        }
      }
      throw error
    }
    this.scan = 'complete'
    this.phase = 'active'
  }

  create(options: LocalDiagnosticSourceOptions): Promise<LocalDiagnosticSourceResult> {
    const runtimeOptions = { ...options, directory: this.directory }
    const invalid = validateOptions(runtimeOptions)
    if (invalid !== undefined)
      return Promise.resolve(Object.freeze({ status: 'invalid', code: invalid }))
    if (options.maxFileBytes > this.options.maxDirectoryBytes) {
      return Promise.resolve(Object.freeze({ status: 'invalid', code: 'INVALID_FILE_CAPACITY' }))
    }
    if (this.phase !== 'active') {
      return Promise.resolve(
        Object.freeze({
          status: 'unavailable',
          code:
            this.phase === 'closing' || this.phase === 'closed'
              ? 'DIRECTORY_CLOSING'
              : 'DIRECTORY_FAILED',
        }),
      )
    }
    const key = sourceConfigKey(options)
    const existing = this.sources.find(entry => entry.sourceId === options.sourceId)
    if (existing !== undefined) {
      if (existing.configKey === null) {
        return Promise.resolve(Object.freeze({ status: 'unavailable', code: 'SOURCE_EXISTS' }))
      }
      if (existing.configKey !== key) {
        return Promise.resolve(Object.freeze({ status: 'unavailable', code: 'SOURCE_CONFLICT' }))
      }
      if (existing.preparation !== null) return existing.preparation
      if (existing.runtime !== null) {
        return Promise.resolve(Object.freeze({ status: 'created', runtime: existing.runtime }))
      }
    }
    const materializedFiles = this.sources.filter(entry => entry.materialized).length
    const reservedFiles = this.sources.length - materializedFiles
    if (materializedFiles + reservedFiles >= this.options.maxFiles) {
      return Promise.resolve(Object.freeze({ status: 'unavailable', code: 'RETENTION_CAPACITY' }))
    }
    const entry: SourceEntry = {
      sourceId: options.sourceId,
      configKey: key,
      phase: 'preparing',
      chargedBytes: 0n,
      reservedBytes: 0n,
      resource: 'held',
      materialized: false,
      path: join(this.directory, fileName(options)),
      device: null,
      inode: null,
      maxFileBytes: BigInt(options.maxFileBytes),
      runtime: null,
      preparation: null,
    }
    this.sources.push(entry)
    const preparation = this.prepareSource(entry, runtimeOptions)
    entry.preparation = preparation
    return preparation
  }

  private async prepareSource(
    entry: SourceEntry,
    options: RuntimeOptions,
  ): Promise<LocalDiagnosticSourceResult> {
    const budget = this.sourceBudget(entry)
    try {
      const stream = await createStream(
        entry.path,
        options,
        () => {
          entry.materialized = true
        },
        metadata => {
          entry.device = metadata.dev
          entry.inode = metadata.ino
        },
      )
      entry.phase = 'live'
      const runtime = new LocalRuntime(options, stream, budget, undefined, this.crashUnknown)
      entry.runtime = runtime
      entry.preparation = null
      return Object.freeze({ status: 'created', runtime })
    } catch (error) {
      if (!entry.materialized) {
        const code = systemErrorCode(error)
        if (code === 'EEXIST') {
          this.fail('SOURCE_COLLISION')
          try {
            const metadata = await lstat(entry.path, { bigint: true })
            if (!metadata.isFile()) throw new DirectoryFailure('INVALID_SOURCE_FILE')
            entry.materialized = true
            entry.device = metadata.dev
            entry.inode = metadata.ino
            entry.chargedBytes = metadata.size
            this.chargedBytes += metadata.size
            entry.phase = 'retained'
            entry.resource = 'released'
            const runtime = new LocalRuntime(
              options,
              null,
              budget,
              sourceFailure(error),
              false,
              false,
            )
            entry.runtime = runtime
            entry.preparation = null
            return Object.freeze({ status: 'created', runtime })
          } catch {
            entry.materialized = true
            entry.phase = 'closing'
            entry.resource = 'unknown'
            this.fail('SOURCE_COLLISION_UNKNOWN')
            const runtime = new LocalRuntime(
              options,
              null,
              budget,
              sourceFailure(error),
              false,
              true,
            )
            entry.runtime = runtime
            entry.preparation = null
            return Object.freeze({ status: 'created', runtime })
          }
        }
        this.sources.splice(this.sources.indexOf(entry), 1)
        return Object.freeze({
          status: 'unavailable',
          code: code === undefined ? 'SOURCE_OPEN_FAILED' : `SOURCE_OPEN_${code}`,
        })
      }
      const cleanupUnknown = error instanceof StartupCleanupFailure && error.cleanupUnknown
      entry.phase = cleanupUnknown ? 'closing' : 'retained'
      entry.resource = cleanupUnknown ? 'unknown' : 'released'
      if (cleanupUnknown) this.fail('SOURCE_RELEASE_UNKNOWN')
      const runtime = new LocalRuntime(
        options,
        null,
        budget,
        sourceFailure(error),
        false,
        cleanupUnknown,
      )
      entry.runtime = runtime
      entry.preparation = null
      return Object.freeze({ status: 'created', runtime })
    }
  }

  private sourceBudget(entry: SourceEntry): SourceBudget {
    return Object.freeze({
      reserve: (bytes: number): boolean => {
        if (entry.resource !== 'held' || entry.phase === 'retained') return false
        const amount = BigInt(bytes)
        if (
          entry.chargedBytes + amount > entry.maxFileBytes ||
          this.chargedBytes + amount > BigInt(this.options.maxDirectoryBytes)
        ) {
          return false
        }
        entry.chargedBytes += amount
        entry.reservedBytes += amount
        this.chargedBytes += amount
        this.reservedBytes += amount
        return true
      },
      release: (bytes: number): void => {
        const amount = BigInt(bytes)
        const released = amount > entry.reservedBytes ? entry.reservedBytes : amount
        entry.reservedBytes -= released
        entry.chargedBytes -= released
        this.reservedBytes -= released
        this.chargedBytes -= released
      },
      confirm: (bytes: number): void => {
        const amount = BigInt(bytes)
        const confirmed = amount > entry.reservedBytes ? entry.reservedBytes : amount
        entry.reservedBytes -= confirmed
        this.reservedBytes -= confirmed
      },
      closing: (): void => {
        if (entry.phase === 'live') entry.phase = 'closing'
      },
      released: (): void => {
        entry.resource = 'released'
      },
      unknown: (code: string): void => {
        entry.resource = 'unknown'
        this.fail(code)
      },
      finalize: async (): Promise<boolean> => this.finalizeSource(entry),
    })
  }

  private async finalizeSource(entry: SourceEntry): Promise<boolean> {
    if (!entry.materialized) return entry.resource === 'released'
    if (entry.resource === 'unknown') return false
    let metadata: Awaited<ReturnType<typeof lstat>>
    try {
      metadata = await lstat(entry.path, { bigint: true })
    } catch (error) {
      this.lastErrorCode = systemErrorCode(error) ?? 'SOURCE_FINAL_STAT_FAILED'
      return false
    }
    if (
      !metadata.isFile() ||
      entry.device === null ||
      entry.inode === null ||
      metadata.dev !== entry.device ||
      metadata.ino !== entry.inode
    ) {
      entry.resource = 'unknown'
      this.fail('SOURCE_IDENTITY_CHANGED')
      return false
    }
    const previous = entry.chargedBytes
    const previousReserved = entry.reservedBytes
    entry.chargedBytes = metadata.size
    entry.reservedBytes = 0n
    entry.resource = 'released'
    entry.phase = 'retained'
    this.chargedBytes += metadata.size - previous
    this.reservedBytes -= previousReserved
    if (
      metadata.size > entry.maxFileBytes ||
      this.chargedBytes > BigInt(this.options.maxDirectoryBytes)
    ) {
      this.fail('RETENTION_CAPACITY')
    }
    return true
  }

  inspect(): DiagnosticDirectoryStatus {
    const materializedFiles = this.sources.filter(entry => entry.materialized).length
    const reservedFiles = this.sources.length - materializedFiles
    const resource =
      this.lockResource === 'unknown' ||
      this.scanCleanupUnknown ||
      this.sources.some(entry => entry.resource === 'unknown')
        ? 'unknown'
        : this.phase === 'closed' && this.lockResource === 'released'
          ? 'released'
          : 'held'
    return Object.freeze({
      phase: this.phase,
      lock: this.lock,
      scan: this.scan,
      chargedBytes: this.scan === 'complete' ? String(this.chargedBytes) : null,
      reservedBytes: String(this.reservedBytes),
      materializedFiles,
      reservedFiles,
      sources: Object.freeze(
        this.sources.map(entry =>
          Object.freeze({
            sourceId: entry.sourceId,
            phase: entry.phase,
            chargedBytes: String(entry.chargedBytes),
            reservedBytes: String(entry.reservedBytes),
            resource: entry.resource,
          }),
        ),
      ),
      lastErrorCode: this.lastErrorCode,
      resource,
    })
  }

  async close(options: Readonly<{ deadlineMs: number }>): Promise<DiagnosticDirectoryClose> {
    if (!validPositiveInteger(options.deadlineMs)) {
      return Object.freeze({ status: 'blocked', state: this.inspect() })
    }
    if (this.phase === 'closed') return Object.freeze({ status: 'closed', state: this.inspect() })
    if (this.phase !== 'closing') this.phase = 'closing'
    const deadline = performance.now() + options.deadlineMs
    const preparing = this.sources.flatMap(entry =>
      entry.preparation === null ? [] : [entry.preparation],
    )
    if (
      !(await settleBefore(
        Promise.all(preparing).then(() => true),
        deadline,
      ))
    ) {
      return Object.freeze({ status: 'blocked', state: this.inspect() })
    }
    for (const entry of this.sources) {
      if (entry.runtime === null) continue
      const remaining = Math.floor(deadline - performance.now())
      if (remaining <= 0) return Object.freeze({ status: 'blocked', state: this.inspect() })
      const result = await entry.runtime.close({ deadlineMs: remaining })
      if (result.status !== 'closed') {
        return Object.freeze({ status: 'blocked', state: this.inspect() })
      }
    }
    if (this.scanCleanupUnknown || this.sources.some(entry => entry.resource !== 'released')) {
      return Object.freeze({ status: 'blocked', state: this.inspect() })
    }
    if (this.lockHandle === null) {
      if (this.lockResource === 'released') {
        this.phase = 'closed'
        return Object.freeze({ status: 'closed', state: this.inspect() })
      }
      return Object.freeze({ status: 'blocked', state: this.inspect() })
    }
    if (this.lockCloseTask === null) {
      const handle = this.lockHandle
      this.lockHandle = null
      this.lockCloseTask = handle.close().then(
        () => {
          this.lock = 'released'
          this.lockResource = 'released'
          return true
        },
        error => {
          this.lock = this.lock === 'held' ? 'unknown' : 'released'
          this.lockResource = 'unknown'
          this.lastErrorCode = systemErrorCode(error) ?? 'RELEASE_UNKNOWN'
          return false
        },
      )
    }
    const released = await settleBefore(this.lockCloseTask, deadline)
    if (released) {
      this.phase = 'closed'
      return Object.freeze({ status: 'closed', state: this.inspect() })
    }
    return Object.freeze({ status: 'blocked', state: this.inspect() })
  }
}

async function settleBefore(task: Promise<boolean>, deadline: number): Promise<boolean> {
  const remaining = Math.max(0, deadline - performance.now())
  let timer: NodeJS.Timeout | undefined
  const result = await Promise.race([
    task,
    new Promise<false>(resolve => {
      timer = setTimeout(() => resolve(false), remaining)
    }),
  ])
  if (timer !== undefined) clearTimeout(timer)
  return result
}

async function closeFailedFactory(
  owner: DirectoryOwner,
  code: string,
): Promise<LocalDiagnosticsDirectoryResult> {
  owner.fail(code)
  const closed = await owner.close({ deadlineMs: 1_000 })
  return Object.freeze({
    status: 'unavailable',
    code,
    cleanup: closed.status === 'closed' ? null : owner,
  })
}

export async function createLocalDiagnosticsDirectory(
  options: LocalDiagnosticsDirectoryOptions,
): Promise<LocalDiagnosticsDirectoryResult> {
  const invalid = validateDirectoryOptions(options)
  if (invalid !== undefined) return Object.freeze({ status: 'invalid', code: invalid })
  let directory: string
  try {
    await mkdir(options.directory, { recursive: true, mode: 0o700 })
    await chmod(options.directory, 0o700)
    directory = await realpath(options.directory)
  } catch (error) {
    return Object.freeze({
      status: 'unavailable',
      code: systemErrorCode(error) ?? 'DIRECTORY_OPEN_FAILED',
      cleanup: null,
    })
  }
  const lockPath = join(directory, lockFileName)
  try {
    const existing = await lstat(lockPath, { bigint: true }).catch(error => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    })
    if (existing !== null && (!existing.isFile() || existing.isSymbolicLink())) {
      return Object.freeze({ status: 'unavailable', code: 'INVALID_LOCK_FILE', cleanup: null })
    }
  } catch (error) {
    return Object.freeze({
      status: 'unavailable',
      code: systemErrorCode(error) ?? 'LOCK_INSPECT_FAILED',
      cleanup: null,
    })
  }
  let lockHandle: FileHandle
  try {
    lockHandle = await openFile(
      lockPath,
      constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW,
      0o600,
    )
  } catch (error) {
    return Object.freeze({
      status: 'unavailable',
      code: systemErrorCode(error) ?? 'LOCK_OPEN_FAILED',
      cleanup: null,
    })
  }
  const owner = new DirectoryOwner(options, directory, lockHandle)
  try {
    await lockHandle.chmod(0o600)
    const [opened, linked] = await Promise.all([
      lockHandle.stat({ bigint: true }),
      lstat(lockPath, { bigint: true }),
    ])
    if (
      !opened.isFile() ||
      !linked.isFile() ||
      linked.isSymbolicLink() ||
      opened.size !== 0n ||
      linked.size !== 0n ||
      opened.dev !== linked.dev ||
      opened.ino !== linked.ino
    ) {
      return closeFailedFactory(owner, 'INVALID_LOCK_FILE')
    }
    await flockExclusive(lockHandle.fd)
    owner.acquiredLock()
    const linkedAfterLock = await lstat(lockPath, { bigint: true })
    if (
      !linkedAfterLock.isFile() ||
      linkedAfterLock.isSymbolicLink() ||
      linkedAfterLock.size !== 0n ||
      linkedAfterLock.dev !== opened.dev ||
      linkedAfterLock.ino !== opened.ino
    ) {
      return closeFailedFactory(owner, 'LOCK_IDENTITY_CHANGED')
    }
  } catch (error) {
    const code = systemErrorCode(error)
    return closeFailedFactory(
      owner,
      code === 'EAGAIN' || code === 'EBUSY' ? 'DIRECTORY_BUSY' : (code ?? 'LOCK_FAILED'),
    )
  }
  try {
    await owner.scanDirectory()
  } catch (error) {
    if (error instanceof ScanCleanupFailure) owner.markScanCleanupUnknown(error)
    const code =
      error instanceof DirectoryFailure ? error.code : (systemErrorCode(error) ?? 'SCAN_FAILED')
    return closeFailedFactory(owner, code)
  }
  return Object.freeze({ status: 'created', owner })
}
