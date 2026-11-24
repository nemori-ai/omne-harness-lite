import { randomInt } from 'node:crypto'
import {
  CodemodeSandbox,
  type CodemodeHostCall,
  type CodemodeOutcome,
  type CodemodeResult,
  type CodemodeWasmModule,
} from '@earendil-works/pi-codemode'
import {
  isProgramEntry,
  isProgramFailureName,
  type FacilityResult,
  type ProgramAnswer,
  type ProgramLimitName,
  type ProgramLimits,
  type ProgramOutcome,
  type ProgramRun,
  type ProgramRunRequest,
} from '@omne-harness/execution-environment-contract'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import {
  HOST_CALL,
  isParseStack,
  prepareProgram,
  programLine,
  type PreparedProgram,
} from './source.ts'

export type ProgramEngine = Readonly<{
  wasm(): Promise<CodemodeWasmModule>
  workerUrl?: string | URL
  ceilings: ProgramLimits
  /** Execution domains that exist at the same time, counted until the thread has really exited. */
  domains: { active: number; readonly max: number }
}>

type Cause = ProgramLimitName | 'aborted'
type Refusal = Extract<FacilityResult<never>, { kind: 'rejected' }>['reason']
type Request = ProgramRunRequest<unknown>
type Ready = Extract<PreparedProgram, { kind: 'ready' }>

const elapsed = () =>
  /* wall-clock: operation-timing -- Count the time one execution domain runs against its limit. */ performance.now()
const instant = () =>
  /* wall-clock: observation-time -- The clock a program reads; it is not a fact of any domain. */ Date.now()

const readLimits = (bytes: number) => ({
  maxBytes: bytes,
  maxDepth: 256,
  maxItems: Number.MAX_SAFE_INTEGER,
  maxMembers: Number.MAX_SAFE_INTEGER,
  maxStringLength: bytes,
  maxNumberLength: 400,
})
const bytesOf = (text: string) => Buffer.byteLength(text, 'utf8')
const plain = (value: JsonValue): unknown => JSON.parse(writeJsonText(value))
const cut = (text: string, limit: number) =>
  bytesOf(text) <= limit ? text : Buffer.from(text, 'utf8').subarray(0, limit).toString('utf8')

function namesAreValid(request: Request): boolean {
  const roots = new Map<string, 'function' | 'object'>()
  for (const name of request.entries) {
    const [root = '', member] = name.split('.')
    const shape = member === undefined ? 'function' : 'object'
    if (!isProgramEntry(name) || (roots.has(root) && roots.get(root) !== shape)) return false
    roots.set(root, shape)
  }
  return (
    new Set(request.entries).size === request.entries.length &&
    new Set(request.failures).size === request.failures.length &&
    request.failures.every(name => isProgramFailureName(name) && !roots.has(name))
  )
}

function limitsAreValid(limits: ProgramLimits, ceilings: ProgramLimits): boolean {
  const names = ['computeMs', 'memoryBytes', 'outputBytes', 'calls'] as const
  return names.every(name => {
    const value = limits[name]
    return Number.isSafeInteger(value) && value > 0 && value <= ceilings[name]
  })
}

function failed(
  error: Extract<CodemodeResult, { ok: false }>['error'],
  head: number,
  console: string,
): ProgramOutcome {
  const engine = error.kind === 'sandbox' || error.name === 'InternalError'
  if (engine && error.message.includes('out of memory'))
    return { kind: 'exceeded', limit: 'memory', console }
  if (error.name === 'RangeError' && error.message.startsWith('script output exceeded'))
    return { kind: 'exceeded', limit: 'output', console }
  const line = programLine(error.stack, head)
  if (error.name === 'SyntaxError' && isParseStack(error.stack))
    return { kind: 'syntax', message: error.message, line }
  const name = error.kind === 'script' ? (error.name ?? 'Error') : 'InternalError'
  return { kind: 'threw', name, message: error.message, line, console }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}

function returned(value: unknown, console: string, limits: ProgramLimits): ProgramOutcome {
  const over: ProgramOutcome = {
    kind: 'exceeded',
    limit: 'output',
    console: cut(console, limits.outputBytes),
  }
  if (isRecord(value) && typeof value['bad'] === 'string')
    return { kind: 'invalid-output', path: value['bad'], console: over.console }
  if (!isRecord(value) || !('value' in value))
    return bytesOf(console) > limits.outputBytes ? over : { kind: 'returned', console }
  const text = JSON.stringify(value['value'])
  if (bytesOf(text) + bytesOf(console) > limits.outputBytes) return over
  const read = readJsonText(text, readLimits(limits.outputBytes))
  return read.kind === 'ok'
    ? { kind: 'returned', value: read.value, console }
    : { kind: 'invalid-output', path: '$ (nested too deeply)', console }
}

export function outcomeOf(
  result: CodemodeResult,
  cause: Cause | null,
  head: number,
  limits: ProgramLimits,
): ProgramOutcome {
  const full = result.output.flatMap(item => (item.type === 'text' ? [item.text] : [])).join('\n')
  const console = cut(full, limits.outputBytes)
  if (cause === 'aborted') return { kind: 'aborted', console }
  if (cause !== null) return { kind: 'exceeded', limit: cause, console }
  return result.ok ? returned(result.value, full, limits) : failed(result.error, head, console)
}

function answerOf(answer: ProgramAnswer, failures: readonly string[]): CodemodeOutcome {
  if (answer.kind === 'value') return { ok: true, value: plain(answer.value) }
  const properties: Record<string, unknown> = {}
  for (const { key, value } of answer.properties) properties[key] = plain(value)
  if (failures.includes(answer.name)) properties['__failure'] = answer.name
  return { ok: false, message: answer.message, properties }
}

/** Runs only between `resume` and `pause`: the time the domain waits for an answer is not on it. */
function computeClock(ms: number, expire: () => void) {
  let left = ms
  let mark = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    resume() {
      if (timer !== null) return
      mark = elapsed()
      timer = setTimeout(expire, Math.max(0, left))
    },
    pause() {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
      left -= elapsed() - mark
    },
  }
}

type Domain = Readonly<{ run: ProgramRun; booted: Promise<boolean> }>

function openDomain(request: Request, ready: Ready, engine: ProgramEngine): Domain {
  const { limits } = request
  let exited: Promise<void> | null = null
  const sandbox = new CodemodeSandbox({
    wasm: engine.wasm(),
    memoryLimitBytes: limits.memoryBytes,
    ...(engine.workerUrl === undefined ? {} : { workerUrl: engine.workerUrl }),
    acquireWorker: () => () => void engine.domains.active--,
    onWorkerStarted: done => void (exited = done),
  })
  const controller = new AbortController()
  const waiting = new Map<number, number>()
  const entries = new Set(request.entries)
  let cause: Cause | null = null
  let issued = 0
  let delivered = 0
  const end = (why: Cause) => {
    if (cause !== null || handle.finished) return
    cause = why
    controller.abort()
  }
  const tell = (event: () => void) => {
    try {
      event()
    } catch {
      end('aborted')
    }
  }
  const clock = computeClock(limits.computeMs, () => end('compute-time'))
  const deliver = (id: number, outcome: CodemodeOutcome) => {
    delivered++
    clock.resume()
    handle.deliver(delivered, instant(), id, outcome)
  }
  const onCall = (call: CodemodeHostCall) => {
    if (cause !== null) return
    const [entry, argument] = Array.isArray(call.args) ? call.args : []
    const read = readJsonText(JSON.stringify(argument ?? null), readLimits(limits.memoryBytes))
    if (typeof entry !== 'string' || !entries.has(entry) || read.kind !== 'ok') {
      deliver(call.id, { ok: false, message: `${String(entry)} cannot be called so` })
      return
    }
    if (issued >= limits.calls) {
      end('calls')
      return
    }
    const ordinal = ++issued
    waiting.set(ordinal, call.id)
    tell(() => request.onCall({ ordinal, entry, argument: read.value }))
  }
  let started: (value: boolean) => void = () => undefined
  const booted = new Promise<boolean>(resolve => void (started = resolve))
  const handle = sandbox.start(ready.code, {
    startedAt: instant(),
    seed: randomInt(0, 2 ** 32 - 1),
    signal: controller.signal,
    timeoutMs: Infinity,
    globals: [{ name: HOST_CALL, spread: true }],
    onStarted() {
      clock.resume()
      started(true)
    },
    onCall,
    onIdle(seq) {
      if (seq !== delivered || cause !== null) return
      clock.pause()
      tell(() => request.onIdle(issued))
    },
  })
  const outcome = handle.result.then(async result => {
    const why = cause
    clock.pause()
    started(false)
    await sandbox.close()
    if (exited === null) engine.domains.active--
    await exited
    return outcomeOf(result, why, ready.head, limits)
  })
  const run: ProgramRun = {
    outcome,
    answer(ordinal, answer) {
      const id = waiting.get(ordinal)
      if (id === undefined || handle.finished) return 'not-waiting'
      waiting.delete(ordinal)
      deliver(id, answerOf(answer, request.failures))
      return 'delivered'
    },
    abort: () => end('aborted'),
  }
  return { run, booted }
}

/** Runs one program in a new execution domain. The outcome is given only after the thread has exited. */
export async function startProgram(
  request: Request,
  engine: ProgramEngine,
): Promise<FacilityResult<ProgramRun>> {
  const { requestId } = request
  const refuse = (reason: Refusal) => ({ kind: 'rejected' as const, requestId, reason })
  if (!limitsAreValid(request.limits, engine.ceilings) || !namesAreValid(request))
    return refuse('invalidInput')
  const prepared = prepareProgram(request.source, request.entries, request.failures, request.input)
  if (prepared.kind === 'syntax') {
    const outcome = Promise.resolve(prepared)
    const run: ProgramRun = { outcome, answer: () => 'not-waiting', abort: () => undefined }
    return { kind: 'done', requestId, value: run }
  }
  if (engine.domains.active >= engine.domains.max) return refuse('capacity')
  engine.domains.active++
  const domain = openDomain(request, prepared, engine)
  if (await domain.booted) return { kind: 'done', requestId, value: domain.run }
  await domain.run.outcome
  return refuse('unavailable')
}
