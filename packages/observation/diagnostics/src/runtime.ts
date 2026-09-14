import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { chmod, lstat, mkdir, open, opendir } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ROOT_CONTEXT, SpanStatusCode, createContextKey, trace } from '@opentelemetry/api'
import type { Context, Span as ApiSpan, Tracer } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'
import { TracerProvider } from '@opentelemetry/sdk-trace'
import type { ReadableSpan, Span as SdkSpan, SpanProcessor } from '@opentelemetry/sdk-trace'
import pino from 'pino'
import { SonicBoom } from 'sonic-boom'
import type {
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticGap,
  DiagnosticGapReason,
  DiagnosticIdentity,
  DiagnosticPoint,
  Diagnostics,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticsOptions,
  LocalDiagnosticsResult,
} from './index.js'
import { projectEnd, projectIdentity, projectPoint, samePrincipal } from './projection.js'
import type { SafeIdentity, SafePoint } from './projection.js'

const levels = new Set(['debug', 'info', 'warn', 'error'])
const levelValue = { debug: 10, info: 20, warn: 30, error: 40 } as const
const diagnosticFile = /^diagnostic-(?:[0-9a-f]{16}-)?[0-9a-f]{16}\.jsonl$/u

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

type StartupFailure = Readonly<{
  code: string
  reason: 'retention_capacity' | 'write_unavailable'
}>

const invalidIdentity: SafeIdentity = Object.freeze({
  tenantId: null,
  principal: Object.freeze({ kind: 'system', systemId: 'diagnostics-invalid' }),
  causality: Object.freeze({}),
})

function validPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function validateOptions(options: LocalDiagnosticsOptions): string | undefined {
  if (options === null || typeof options !== 'object') return 'INVALID_OPTIONS'
  if (typeof options.instanceId !== 'string'
    || options.instanceId.length === 0
    || Buffer.byteLength(options.instanceId, 'utf8') > 256
    || /[\u0000-\u001f\u007f]/u.test(options.instanceId)) return 'INVALID_INSTANCE_ID'
  if (typeof options.sourceId !== 'string'
    || options.sourceId.length === 0
    || Buffer.byteLength(options.sourceId, 'utf8') > 256
    || /[\u0000-\u001f\u007f]/u.test(options.sourceId)) return 'INVALID_SOURCE_ID'
  if (typeof options.directory !== 'string' || !isAbsolute(options.directory)) return 'INVALID_DIRECTORY'
  if (!levels.has(options.level)) return 'INVALID_LEVEL'
  for (const key of [
    'maxRecordBytes',
    'maxActiveSpans',
    'maxBufferBytes',
    'maxFileBytes',
    'maxDirectoryBytes',
    'maxFiles',
  ] as const) {
    if (!validPositiveInteger(options[key])) return `INVALID_${key.replaceAll(/[A-Z]/g, value => `_${value}`).toUpperCase()}`
  }
  if (options.maxRecordBytes > options.maxBufferBytes || options.maxRecordBytes > options.maxFileBytes) {
    return 'INVALID_RECORD_CAPACITY'
  }
  if (options.maxFileBytes > options.maxDirectoryBytes) return 'INVALID_FILE_CAPACITY'
  return undefined
}

function fileName(options: LocalDiagnosticsOptions): string {
  const source = createHash('sha256').update(options.sourceId, 'utf8').digest('hex').slice(0, 16)
  return `diagnostic-${source}.jsonl`
}

function frozenStatus(runtime: LocalRuntime): DiagnosticStatus {
  const pendingIdleMs = runtime.pendingBytes > 0 && runtime.lastWriteProgressAt !== null
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
  private readonly configuredLevel: LocalDiagnosticsOptions['level']
  private readonly maxRecordBytes: number
  private readonly maxActiveSpans: number
  private readonly maxSourceBytes: number
  private readonly idPrefix: string
  private readonly stream: SonicBoom | null
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
  private acceptedSourceBytes = 0
  private outputAvailable = true
  private retentionReached = false
  private streamClosed = false
  private streamCloseStarted = false

  constructor(
    options: LocalDiagnosticsOptions,
    stream: SonicBoom | null,
    maxSourceBytes: number,
    failure?: StartupFailure,
    crashUnknown = false,
  ) {
    this.sourceId = options.sourceId
    this.configuredLevel = options.level
    this.maxRecordBytes = options.maxRecordBytes
    this.maxActiveSpans = options.maxActiveSpans
    this.maxSourceBytes = maxSourceBytes
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
      this.resource = 'released'
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
          if (this.retentionReached || this.acceptedSourceBytes + bytes > this.maxSourceBytes) {
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
              if (this.pendingBytes === 0) this.lastWriteProgressAt = null
              this.addGap('buffer_capacity', seq)
            } else {
              this.accepted += 1n
              this.acceptedSourceBytes += bytes
            }
            return writable
          } finally {
            stream.off('drop', onDrop)
          }
        },
      }
      this.logger = pino({
        base: null,
        timestamp: false,
        level: 'debug',
        formatters: { level: label => ({ level: label }) },
        redact: {
          paths: ['error', 'err', 'message', 'stack', 'body', 'secret', 'params', 'headers', 'url', 'query', 'target', 'rawArgs'],
          remove: true,
        },
      }, destination)
      stream.on('write', (bytes: number) => {
        this.writtenBytes += BigInt(bytes)
        this.pendingBytes = Math.max(0, this.pendingBytes - bytes)
        this.lastWriteProgressAt = this.pendingBytes === 0 ? null : performance.now()
      })
      stream.on('error', (error: NodeJS.ErrnoException) => {
        this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
        this.writeFailed = true
        this.outputAvailable = false
        this.lastErrorCode = typeof error.code === 'string' ? error.code : 'SONIC_ERROR'
        this.addGap('write_unavailable', null, 'unknown')
        try {
          this.streamCloseStarted = true
          stream.destroy()
        } catch {
          this.resource = 'unknown'
        }
      })
      stream.on('close', () => {
        this.streamClosed = true
        this.resource = 'released'
        this.pendingBytes = 0
        this.lastWriteProgressAt = null
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
      scope: (identity: DiagnosticIdentity, parent?: DiagnosticContext) => this.scope(identity, parent),
      current: () => this.current(),
      log: (context: DiagnosticContext, point: DiagnosticPoint) => this.log(context, point),
      startSpan: (context: DiagnosticContext, point: DiagnosticPoint) => this.startSpan(context, point),
      within: <T>(context: DiagnosticContext, body: () => T): T => this.within(context, body),
    })
  }

  private nextSeq(): bigint {
    this.attempted += 1n
    return this.attempted
  }

  gapSnapshot(): readonly DiagnosticGap[] {
    return [...this.gapState].map(([reason, gap]) => Object.freeze({
      reason,
      firstSeq: gap.firstSeq === null ? null : String(gap.firstSeq),
      lastSeq: gap.lastSeq === null ? null : String(gap.lastSeq),
      count: gap.count === null ? null : String(gap.count),
      quality: gap.quality,
    }))
  }

  private addGap(reason: DiagnosticGapReason, seq: bigint | null, quality: 'counted' | 'unknown' = 'counted'): void {
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
      if (parentContext === undefined
        || parentContext.identity.tenantId !== projected.value.tenantId
        || !samePrincipal(parentContext.identity.principal, projected.value.principal)) {
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
    return active !== null && typeof active === 'object' && this.contexts.has(active as DiagnosticContext)
      ? active as DiagnosticContext
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

  private startSpan(
    context: DiagnosticContext,
    point: DiagnosticPoint,
  ): DiagnosticSpan {
    const internal = this.contexts.get(context)
    const inert: DiagnosticSpan = Object.freeze({
      context: internal === undefined ? Object.freeze({}) as DiagnosticContext : context,
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
    const child = this.makeContext(internal.identity, trace.setSpan(internal.native, span))
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
        ended = true
        this.endSpan(spanContext.spanId, result)
      },
    })
  }

  private spanAttributes(identity: SafeIdentity, point: SafePoint): Readonly<Record<string, string | number>> {
    const attributes: Record<string, string | number> = {
      'diagnostic.component': point.component,
      'diagnostic.phase': point.phase,
      'diagnostic.code': point.code,
      'diagnostic.level': point.level,
      'diagnostic.tenant_id': identity.tenantId ?? 'system',
      'diagnostic.principal_kind': identity.principal.kind,
    }
    if (identity.principal.kind === 'user') attributes['diagnostic.user_id'] = identity.principal.user.userId
    else attributes['diagnostic.system_id'] = identity.principal.systemId
    if (identity.operation !== undefined) {
      attributes['diagnostic.operation_namespace'] = identity.operation.namespace
      attributes['diagnostic.operation_id'] = identity.operation.operationId
    }
    if (point.diagnosticId !== undefined) attributes['diagnostic.id'] = point.diagnosticId
    if (point.measures !== undefined) {
      for (const [key, value] of Object.entries(point.measures)) attributes[`diagnostic.measure.${key}`] = value
    }
    return attributes
  }

  private endSpan(spanId: string, result: DiagnosticEnd): void {
    const active = this.activeSpans.get(spanId)
    if (active === undefined) return
    const projected = projectEnd(result)
    if (projected.ok) {
      active.end = projected.value
      active.span.setAttribute('diagnostic.end.code', projected.value.code)
      active.span.setAttribute('diagnostic.outcome', projected.value.outcome)
      active.span.setStatus({
        code: projected.value.outcome === 'ok'
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
    const end = active.end ?? Object.freeze({ code: 'diagnostic.missing_end', outcome: 'failed' as const })
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
        ...(context.identity.operation === undefined ? {} : { operation: context.identity.operation }),
        causality: context.identity.causality,
        ...point,
        code: end.code,
        outcome: end.outcome,
        traceId: spanContext.traceId,
        spanId: spanContext.spanId,
        ...(span.parentSpanContext === undefined ? {} : { parentSpanId: span.parentSpanContext.spanId }),
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
        ...(context.identity.operation === undefined ? {} : { operation: context.identity.operation }),
        causality: context.identity.causality,
        ...point,
        ...(activeSpan === undefined ? {} : {
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
    this.closeTask ??= this.finishClose()
    let timer: NodeJS.Timeout | undefined
    const completed = await Promise.race([
      this.closeTask,
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
    try {
      await this.provider.forceFlush()
      await this.provider.shutdown()
    } catch {
      this.writeFailed = true
      this.lastErrorCode = 'OTEL_CLOSE_FAILED'
      return false
    }
    if (this.stream === null || this.streamClosed || this.resource === 'released') return true
    if (this.streamCloseStarted) {
      try {
        await once(this.stream, 'close')
        return true
      } catch {
        return false
      }
    }
    this.emitMarker('diagnostic.source_closed')
    const closed = once(this.stream, 'close')
    try {
      this.stream.end()
      await closed
      return true
    } catch {
      this.writeFailed = true
      this.lastErrorCode ??= 'SONIC_CLOSE_FAILED'
      return false
    }
  }
}

async function endedCleanly(path: string, size: number, maxRecordBytes: number): Promise<boolean> {
  if (size === 0) return false
  const handle = await open(path, 'r')
  try {
    const window = Math.min(size, maxRecordBytes + 1)
    const firstBuffer = Buffer.alloc(window)
    const firstRead = await handle.read(firstBuffer, 0, window, 0)
    const firstLine = firstBuffer.subarray(0, firstRead.bytesRead).toString('utf8').split('\n', 1)[0]
    const tailBuffer = Buffer.alloc(window)
    const tailRead = await handle.read(tailBuffer, 0, window, Math.max(0, size - window))
    const tail = tailBuffer.subarray(0, tailRead.bytesRead).toString('utf8').trimEnd()
    const lastLine = tail.slice(tail.lastIndexOf('\n') + 1)
    const first = JSON.parse(firstLine) as Record<string, unknown>
    const last = JSON.parse(lastLine) as Record<string, unknown>
    return first.formatVersion === 'omne-diagnostic/1'
      && first.code === 'diagnostic.source_started'
      && typeof first.sourceId === 'string'
      && last.formatVersion === 'omne-diagnostic/1'
      && last.sourceId === first.sourceId
      && last.code === 'diagnostic.source_closed'
  } catch {
    return false
  } finally {
    await handle.close()
  }
}

type DirectoryPreparation = Readonly<{
  maxSourceBytes: number
  crashUnknown: boolean
}>

async function prepareDirectory(
  directory: string,
  options: LocalDiagnosticsOptions,
): Promise<DirectoryPreparation | null> {
  let entries = 0
  let bytes = 0
  let crashUnknown = false
  const handle = await opendir(directory)
  try {
    for await (const entry of handle) {
      entries += 1
      if (entries >= options.maxFiles) return null
      try {
        const metadata = await lstat(join(directory, entry.name))
        bytes += metadata.size
        if (metadata.isFile()
          && diagnosticFile.test(entry.name)
          && !await endedCleanly(join(directory, entry.name), metadata.size, options.maxRecordBytes)) {
          crashUnknown = true
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw error
      }
      if (bytes >= options.maxDirectoryBytes) return null
    }
  } finally {
    await handle.close().catch(() => {})
  }
  const remaining = options.maxDirectoryBytes - bytes
  return remaining >= options.maxRecordBytes
    ? Object.freeze({ maxSourceBytes: Math.min(options.maxFileBytes, remaining), crashUnknown })
    : null
}

function startupFailure(error: unknown): StartupFailure {
  const code = error !== null && typeof error === 'object' && typeof (error as NodeJS.ErrnoException).code === 'string'
    ? (error as NodeJS.ErrnoException).code
    : undefined
  if (code === 'EEXIST') return Object.freeze({ code: 'SOURCE_EXISTS', reason: 'write_unavailable' })
  if (code === 'ENOSPC' || code === 'EDQUOT') {
    return Object.freeze({ code: 'RETENTION_CAPACITY', reason: 'retention_capacity' })
  }
  return Object.freeze({ code: code === undefined ? 'SOURCE_OPEN_FAILED' : `SOURCE_OPEN_${code}`, reason: 'write_unavailable' })
}

async function createStream(path: string, options: LocalDiagnosticsOptions): Promise<SonicBoom> {
  const reservation = await open(path, 'wx', 0o600)
  await reservation.close()
  await chmod(path, 0o600)
  const stream = new SonicBoom({
    dest: path,
    sync: false,
    minLength: 0,
    maxLength: options.maxBufferBytes,
    maxWrite: 16_384,
    fsync: false,
    append: true,
    mode: 0o600,
    retryEAGAIN: () => false,
  })
  await Promise.race([
    once(stream, 'ready'),
    once(stream, 'error').then(([error]) => Promise.reject(error)),
  ])
  return stream
}

export async function createLocalDiagnostics(
  options: LocalDiagnosticsOptions,
): Promise<LocalDiagnosticsResult> {
  const invalid = validateOptions(options)
  if (invalid !== undefined) return Object.freeze({ status: 'invalid', code: invalid })

  try {
    await mkdir(options.directory, { recursive: true, mode: 0o700 })
    await chmod(options.directory, 0o700)
    const preparation = await prepareDirectory(options.directory, options)
    if (preparation === null) {
      return Object.freeze({
        status: 'created',
        runtime: new LocalRuntime(options, null, 0, {
          code: 'RETENTION_CAPACITY',
          reason: 'retention_capacity',
        }),
      })
    }
    const stream = await createStream(join(options.directory, fileName(options)), options)
    return Object.freeze({
      status: 'created',
      runtime: new LocalRuntime(options, stream, preparation.maxSourceBytes, undefined, preparation.crashUnknown),
    })
  } catch (error) {
    return Object.freeze({
      status: 'created',
      runtime: new LocalRuntime(options, null, 0, startupFailure(error)),
    })
  }
}
