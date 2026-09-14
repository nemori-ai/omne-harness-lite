import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { chmod, mkdir, open } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import pino from 'pino'
import { SonicBoom } from 'sonic-boom'
import type {
  DiagnosticClose,
  DiagnosticContext,
  DiagnosticEnd,
  DiagnosticIdentity,
  DiagnosticPoint,
  Diagnostics,
  DiagnosticsRuntime,
  DiagnosticSpan,
  DiagnosticStatus,
  LocalDiagnosticsOptions,
  LocalDiagnosticsResult,
} from './index.js'

const levels = new Set(['debug', 'info', 'warn', 'error'])
const emptyContext = Object.freeze({}) as DiagnosticContext

function validPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0
}

function validateOptions(options: LocalDiagnosticsOptions): string | undefined {
  if (options === null || typeof options !== 'object') return 'INVALID_OPTIONS'
  if (typeof options.instanceId !== 'string' || options.instanceId.length === 0) return 'INVALID_INSTANCE_ID'
  if (typeof options.sourceId !== 'string' || options.sourceId.length === 0) return 'INVALID_SOURCE_ID'
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
  const instance = createHash('sha256').update(options.instanceId, 'utf8').digest('hex').slice(0, 16)
  const source = createHash('sha256').update(options.sourceId, 'utf8').digest('hex').slice(0, 16)
  return `diagnostic-${instance}-${source}.jsonl`
}

function frozenStatus(runtime: LocalRuntime): DiagnosticStatus {
  return Object.freeze({
    sourceId: runtime.sourceId,
    phase: runtime.phase,
    attemptedThrough: String(runtime.attempted),
    acceptedCount: String(runtime.accepted),
    droppedCount: String(runtime.dropped),
    pendingBytes: runtime.pendingBytes,
    writtenBytes: String(runtime.writtenBytes),
    activeSpans: 0,
    writeProgress: runtime.writeFailed ? 'failed' : runtime.pendingBytes > 0 ? 'pending' : 'idle',
    pendingIdleMs: runtime.pendingBytes > 0 ? 0 : null,
    gaps: Object.freeze([]),
    lastErrorCode: runtime.lastErrorCode,
    resource: runtime.resource,
  })
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
  writeFailed = false
  lastErrorCode: string | null = null
  private readonly stream: SonicBoom
  private readonly logger: pino.Logger
  private closeTask: Promise<boolean> | undefined

  constructor(sourceId: string, stream: SonicBoom) {
    this.sourceId = sourceId
    this.stream = stream
    const destination = {
      write: (line: string): boolean => {
        const bytes = Buffer.byteLength(line, 'utf8')
        this.pendingBytes += bytes
        let dropped = false
        const onDrop = (): void => {
          dropped = true
        }
        stream.once('drop', onDrop)
        try {
          const writable = stream.write(line)
          if (dropped) {
            this.pendingBytes -= bytes
            this.dropped += 1n
          } else {
            this.accepted += 1n
          }
          return writable
        } finally {
          stream.off('drop', onDrop)
        }
      },
    }
    this.logger = pino({ base: null, timestamp: false }, destination)
    stream.on('write', (bytes: number) => {
      this.writtenBytes += BigInt(bytes)
      this.pendingBytes = Math.max(0, this.pendingBytes - bytes)
    })
    stream.on('error', (error: NodeJS.ErrnoException) => {
      this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
      this.writeFailed = true
      this.lastErrorCode = typeof error.code === 'string' ? error.code : 'SONIC_ERROR'
    })
    stream.on('close', () => {
      this.resource = 'released'
    })
    this.emitMarker('diagnostic.source_started')

    const inertSpan: DiagnosticSpan = Object.freeze({
      context: emptyContext,
      end(_result: DiagnosticEnd): void {},
    })
    this.diagnostics = Object.freeze({
      newId: () => `${sourceId}:${++this.attempted}`,
      scope: (_identity: DiagnosticIdentity, _parent?: DiagnosticContext) => emptyContext,
      current: () => null,
      log: (_context: DiagnosticContext, _point: DiagnosticPoint) => {},
      startSpan: (_context: DiagnosticContext, _point: DiagnosticPoint) => inertSpan,
      within: <T>(_context: DiagnosticContext, body: () => T): T => body(),
    })
  }

  private emitMarker(code: string): void {
    this.attempted += 1n
    try {
      this.logger.info({
        formatVersion: 'omne-diagnostic/1',
        sourceId: this.sourceId,
        seq: String(this.attempted),
        observedAt: new Date().toISOString(),
        component: 'diagnostics',
        phase: 'lifecycle',
        code,
      })
    } catch {
      this.phase = this.phase === 'closing' ? 'closing' : 'degraded'
      this.writeFailed = true
      this.lastErrorCode = 'PINO_WRITE_FAILED'
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
      return Object.freeze({ status: 'closed', state: this.inspect() })
    }
    return Object.freeze({ status: 'blocked', state: this.inspect() })
  }

  private async finishClose(): Promise<boolean> {
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

  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  await chmod(options.directory, 0o700)
  const stream = await createStream(join(options.directory, fileName(options)), options)
  return Object.freeze({ status: 'created', runtime: new LocalRuntime(options.sourceId, stream) })
}
