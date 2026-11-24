import assert from 'node:assert/strict'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { readJsonText, writeJsonText, type JsonValue } from '@omne-harness/json-text'
import type {
  FacilityRequest,
  ProgramAnswer,
  ProgramCall,
  ProgramFacility,
  ProgramLimits,
  ProgramOutcome,
  ProgramRun,
} from '../index.ts'
import { bounded, type ConformanceCase } from './case.ts'

export type ProgramConformanceSubject = Readonly<{
  facility: ProgramFacility<unknown>
  request(): FacilityRequest<unknown>
  dispose?(): Promise<void>
}>
export type ProgramConformanceOptions = Readonly<{
  subject(): ProgramConformanceSubject | Promise<ProgramConformanceSubject>
  waitMs?: number
  /** The longest the event loop of the host may stall while a program misbehaves. */
  stallMs?: number
}>

const ENTRIES = ['Echo.say', 'Echo.fail', 'Twice'] as const
const LIMITS: ProgramLimits = {
  computeMs: 400,
  memoryBytes: 32 * 1024 * 1024,
  outputBytes: 64 * 1024,
  calls: 16,
}
const BUDGET = { maxBytes: 1 << 24, maxDepth: 64, maxItems: 1 << 16, maxMembers: 1 << 16 }
const READ = { ...BUDGET, maxStringLength: 1 << 24, maxNumberLength: 64 }

function json(value: unknown): JsonValue {
  const read = readJsonText(JSON.stringify(value), READ)
  assert.equal(read.kind, 'ok')
  if (read.kind !== 'ok') throw new assert.AssertionError({ message: 'not JSON' })
  return read.value
}
const elapsed = () =>
  /* wall-clock: operation-timing -- bound how long a runaway program may take to end */ performance.now()
const plain = (value: JsonValue | undefined): unknown =>
  value === undefined ? undefined : JSON.parse(writeJsonText(value))

type Started = Readonly<{ run: ProgramRun; calls: ProgramCall[]; idles: number[] }>
type Script = Readonly<{
  input?: unknown
  limits?: Partial<ProgramLimits>
  entries?: readonly string[]
  failures?: readonly string[]
  /** Answers each call when it arrives; `undefined` leaves the call waiting. */
  answer?(call: ProgramCall, run: ProgramRun): ProgramAnswer | undefined
  idle?(issued: number, started: Started): void
}>
const echo = (call: ProgramCall): ProgramAnswer => ({ kind: 'value', value: call.argument })
const denied = {
  kind: 'failure',
  name: 'ToolError',
  message: 'the path is outside the files scope',
  properties: [{ key: 'kind', value: { kind: 'string', value: 'denied' } }],
} as const satisfies ProgramAnswer

async function start(s: ProgramConformanceSubject, source: string, script: Script = {}) {
  const started: Started = { run: undefined as never, calls: [], idles: [] }
  const answer = script.answer ?? echo
  const result = await s.facility.run({
    ...s.request(),
    source,
    input: json(script.input ?? null),
    entries: script.entries ?? ENTRIES,
    failures: script.failures ?? ['ToolError'],
    limits: { ...LIMITS, ...script.limits },
    onCall(call) {
      started.calls.push(call)
      const given = answer(call, started.run)
      if (given !== undefined) started.run.answer(call.ordinal, given)
    },
    onIdle(issued) {
      started.idles.push(issued)
      script.idle?.(issued, started)
    },
  })
  if (result.kind === 'done') Object.assign(started, { run: result.value })
  return { result, started }
}
async function execute(s: ProgramConformanceSubject, source: string, script: Script = {}) {
  const { result, started } = await start(s, source, script)
  assert.equal(result.kind, 'done')
  return { outcome: await started.run.outcome, ...started }
}
function returned(outcome: ProgramOutcome): unknown {
  assert.equal(outcome.kind, 'returned', JSON.stringify(outcome))
  return outcome.kind === 'returned' ? plain(outcome.value) : undefined
}
function exceeded(outcome: ProgramOutcome): string {
  assert.equal(outcome.kind, 'exceeded', JSON.stringify(outcome))
  return outcome.kind === 'exceeded' ? outcome.limit : ''
}

async function checkReturns(s: ProgramConformanceSubject): Promise<void> {
  const doubled = await execute(s, 'console.log("n is", input.n)\nreturn input.n * 2', {
    input: { n: 21 },
  })
  assert.equal(returned(doubled.outcome), 42)
  assert.equal('console' in doubled.outcome && doubled.outcome.console, 'n is 21')
  const nothing = await execute(s, 'const unused = 1')
  assert.equal(nothing.outcome.kind, 'returned')
  assert.equal('value' in nothing.outcome, false)
}

async function checkCalls(s: ProgramConformanceSubject): Promise<void> {
  const source = `const a = await Echo.say({ text: "a" })
const b = await tools.Echo.say({ text: a.text + "b" })
const c = await Twice({ n: 2 })
return [a, b, c, typeof tools.Twice, Object.isFrozen(tools), Object.isFrozen(Echo)]`
  const { outcome, calls } = await execute(s, source)
  assert.deepEqual(returned(outcome), [
    { text: 'a' },
    { text: 'ab' },
    { n: 2 },
    'function',
    true,
    true,
  ])
  assert.deepEqual(
    calls.map(call => [call.ordinal, call.entry, plain(call.argument)]),
    [
      [1, 'Echo.say', { text: 'a' }],
      [2, 'Echo.say', { text: 'ab' }],
      [3, 'Twice', { n: 2 }],
    ],
  )
}

/** EX: calls made in one turn are all in flight before any is answered, and each gets its own answer. */
async function checkParallel(s: ProgramConformanceSubject): Promise<void> {
  const source = `const all = await Promise.all(["x", "y", "z"].map(text => Echo.say({ text })))
return all.map(one => one.text).join("")`
  let inFlight = 0
  const { outcome, calls, idles } = await execute(s, source, {
    answer: () => undefined,
    idle(issued, started) {
      if (issued !== 3 || inFlight !== 0) return
      inFlight = started.calls.length
      for (const call of [...started.calls].reverse()) started.run.answer(call.ordinal, echo(call))
    },
  })
  assert.equal(inFlight, 3)
  assert.equal(returned(outcome), 'xyz')
  assert.deepEqual(
    calls.map(call => [call.ordinal, plain(call.argument)]),
    [
      [1, { text: 'x' }],
      [2, { text: 'y' }],
      [3, { text: 'z' }],
    ],
  )
  assert.equal(idles[0], 3)
}

/** INV-EE10: nothing of the host is in reach, by name or through an entry. */
async function checkNoHost(s: ProgramConformanceSubject): Promise<void> {
  const source = `const names = ["process", "require", "module", "fetch", "setTimeout", "setInterval", "WebAssembly", "Buffer", "Deno", "Bun", "postMessage"]
const seen = names.filter(name => typeof globalThis[name] !== "undefined")
const viaFunction = Twice.constructor("return typeof process + typeof require + typeof fetch")()
const viaEntry = Object.getPrototypeOf(Twice).constructor("return typeof process")()
const given = await Twice({ n: 1 })
const viaValue = given.constructor.constructor("return typeof process")()
return { seen, viaFunction, viaEntry, viaValue, valueIsPlain: Object.getPrototypeOf(given) === Object.prototype }`
  const { outcome } = await execute(s, source)
  assert.deepEqual(returned(outcome), {
    seen: [],
    viaFunction: 'undefinedundefinedundefined',
    viaEntry: 'undefined',
    viaValue: 'undefined',
    valueIsPlain: true,
  })
}

async function checkFreshDomain(s: ProgramConformanceSubject): Promise<void> {
  await execute(s, 'globalThis.leak = 1\nObject.prototype.leak = 1\nreturn 1')
  const second = await execute(s, 'return [typeof globalThis.leak, typeof ({}).leak]')
  assert.deepEqual(returned(second.outcome), ['undefined', 'undefined'])
}

/** INV-EE19: every runaway ends inside its limit, and the host keeps turning meanwhile. */
async function checkRunaways(s: ProgramConformanceSubject, stallMs: number): Promise<void> {
  const loop = monitorEventLoopDelay({ resolution: 5 })
  loop.enable()
  const within = async (source: string, limit: string) => {
    const began = elapsed()
    const { outcome } = await execute(s, source)
    assert.equal(exceeded(outcome), limit, source)
    assert.ok(elapsed() - began < LIMITS.computeMs * 5, source)
  }
  await within('while (true) {}', 'compute-time')
  await within('await Echo.say({})\nwhile (true) {}', 'compute-time')
  await within('while (true) { await null }', 'compute-time')
  await within('return /(a+)+$/.test("a".repeat(40) + "b")', 'compute-time')
  await within(
    'const all = []\nwhile (true) all.push(new Array(100000).fill("x".repeat(100)))',
    'memory',
  )
  const deep = await execute(s, 'const f = n => f(n + 1) + 1\nreturn f(0)')
  assert.equal(deep.outcome.kind, 'threw')
  assert.equal(deep.outcome.kind === 'threw' && deep.outcome.name, 'RangeError')
  loop.disable()
  assert.ok(
    loop.max / 1e6 < stallMs,
    `the host stalled for ${String(Math.round(loop.max / 1e6))} ms`,
  )
}

async function checkWaitingIsNotCompute(s: ProgramConformanceSubject): Promise<void> {
  const late = (ms: number) => (call: ProgramCall, run: ProgramRun) => {
    setTimeout(() => run.answer(call.ordinal, echo(call)), ms)
    return undefined
  }
  const waited = await execute(s, 'return (await Echo.say({ text: "late" })).text', {
    limits: { computeMs: 1000 },
    answer: late(2000),
  })
  assert.equal(returned(waited.outcome), 'late')
  const pair = 'await Promise.all([Echo.say({}), Echo.say({})])\nreturn (await Twice({ n: 3 })).n'
  const afterPair = await execute(s, pair, {
    answer: (call, run) =>
      call.entry === 'Twice' ? late(LIMITS.computeMs * 2)(call, run) : echo(call),
  })
  assert.equal(returned(afterPair.outcome), 3)
  const spun = await execute(s, 'await Echo.say({})\nwhile (true) {}', { answer: late(50) })
  assert.equal(exceeded(spun.outcome), 'compute-time')
  const slices =
    'let x = 0\nfor (let k = 0; k < 60; k++) { for (let i = 0; i < 2e5; i++) x += i\nawait Echo.say({}) }'
  const sliced = await execute(s, slices, {
    limits: { computeMs: 150, calls: 100 },
    answer: late(5),
  })
  assert.equal(exceeded(sliced.outcome), 'compute-time')
  assert.ok(sliced.calls.length > 1, 'no single slice may use up the limit')
}

async function checkCallAndOutputLimits(s: ProgramConformanceSubject): Promise<void> {
  const many = await execute(
    s,
    'for (let i = 0; i < 9; i++) await Echo.say({ i })\nreturn "done"',
    { limits: { calls: 3 } },
  )
  assert.equal(exceeded(many.outcome), 'calls')
  assert.deepEqual(
    many.calls.map(call => call.ordinal),
    [1, 2, 3],
  )
  const large = await execute(s, 'return "x".repeat(5000)', { limits: { outputBytes: 4096 } })
  assert.equal(exceeded(large.outcome), 'output')
  const fits = 'console.log("x".repeat(1000))\nreturn "y".repeat(3093)'
  const exact = await execute(s, fits, { limits: { outputBytes: 4095 } })
  assert.equal(returned(exact.outcome), 'y'.repeat(3093))
  const over = await execute(s, fits, { limits: { outputBytes: 4094 } })
  assert.equal(exceeded(over.outcome), 'output')
  const noisy = await execute(s, 'for (let i = 0; i < 100; i++) console.log("x".repeat(100))', {
    limits: { outputBytes: 4096 },
  })
  assert.equal(exceeded(noisy.outcome), 'output')
}

async function checkInvalidOutput(s: ProgramConformanceSubject): Promise<void> {
  const path = async (source: string) => {
    const { outcome } = await execute(s, source)
    assert.equal(outcome.kind, 'invalid-output', source)
    return outcome.kind === 'invalid-output' ? outcome.path : ''
  }
  assert.match(await path('return { rows: [1, { f: () => 1 }] }'), /^\$\.rows\[1\]\.f\b/)
  assert.match(await path('return [new Map([[1, 2]])]'), /^\$\[0\]/)
  assert.match(await path('return { n: 0 / 0 }'), /^\$\.n\b/)
  assert.match(await path('return 10n'), /^\$/)
  assert.match(await path('const a = {}\na.self = a\nreturn a'), /^\$\.self\b/)
  const kept = await execute(s, 'return { at: new Date(0), absent: undefined, list: [null] }')
  assert.deepEqual(returned(kept.outcome), { at: '1970-01-01T00:00:00.000Z', list: [null] })
}

async function checkSyntax(s: ProgramConformanceSubject): Promise<void> {
  const line = async (source: string) => {
    const { result, started } = await start(s, source)
    assert.equal(result.kind, 'done')
    const outcome = await started.run.outcome
    assert.equal(outcome.kind, 'syntax', source)
    assert.equal(started.calls.length, 0)
    return outcome.kind === 'syntax' ? outcome.line : null
  }
  assert.equal(await line('const a = 1\nconst b = ;\nreturn a'), 2)
  assert.equal(await line('const a = 1\nenum Kind { A }\nreturn a'), 2)
  assert.equal(await line('import fs from "node:fs"\nreturn 1'), 1)
  assert.equal(await line('const a = 1\n\nnamespace N { export const b = 1 }'), 3)
  assert.equal(await line('const a = 1\nconst a = 2'), 2)
  const refused = await start(s, 'const b = ;')
  const run = refused.result.kind === 'done' ? refused.result.value : undefined
  assert.equal(run?.answer(1, denied), 'not-waiting')
}

async function checkTypesAreErased(s: ProgramConformanceSubject): Promise<void> {
  const source = `interface Row { name: string; size?: number }
type Rows = readonly Row[]
const rows: Rows = (input as { rows: Row[] }).rows
const names = rows.map((row: Row): string => row.name satisfies string)
return names.join(",") as string`
  const typed = await execute(s, source, { input: { rows: [{ name: 'a' }, { name: 'b' }] } })
  assert.equal(returned(typed.outcome), 'a,b')
  const thrown = await execute(
    s,
    'const a: number = 1\ninterface X { y: string }\n\nconst b: X | null = null\nreturn b!.y',
  )
  assert.equal(thrown.outcome.kind, 'threw')
  if (thrown.outcome.kind !== 'threw') return
  assert.equal(thrown.outcome.name, 'TypeError')
  assert.equal(thrown.outcome.line, 5)
}

async function checkFailures(s: ProgramConformanceSubject): Promise<void> {
  const source = `try {
  await Echo.fail({ path: "../x" })
} catch (error) {
  return [error instanceof ToolError, error instanceof Error, error.name, error.kind, error.message]
}`
  const caught = await execute(s, source, { answer: () => denied })
  assert.deepEqual(returned(caught.outcome), [true, true, 'ToolError', 'denied', denied.message])
  const loose = await execute(s, 'const a = 1\n\nawait Echo.fail({})\nreturn a', {
    answer: () => denied,
  })
  assert.deepEqual(
    loose.outcome.kind === 'threw' && [
      loose.outcome.name,
      loose.outcome.message,
      loose.outcome.line,
    ],
    ['ToolError', denied.message, 3],
  )
  const stranger = await execute(s, source.replace('error.name,', 'error.constructor.name,'), {
    answer: () => ({ ...denied, name: 'Stranger' }),
  })
  assert.deepEqual(returned(stranger.outcome), [false, true, 'Error', 'denied', denied.message])
}

async function checkThrownLines(s: ProgramConformanceSubject): Promise<void> {
  const thrown = await execute(
    s,
    'console.log("before")\nconsole.log("it")\nthrow new RangeError("no")',
  )
  assert.deepEqual(thrown.outcome, {
    kind: 'threw',
    name: 'RangeError',
    message: 'no',
    line: 3,
    console: 'before\nit',
  })
  const lineOf = async (source: string) => {
    const { outcome } = await execute(s, source)
    assert.equal(outcome.kind, 'threw', source)
    return outcome.kind === 'threw' ? outcome.line : undefined
  }
  assert.equal(await lineOf('throw new Error("first line")'), 1)
  assert.equal(await lineOf(`${'\n'.repeat(11)}throw new Error("line twelve")`), 12)
  assert.equal(await lineOf('throw "not an error"'), null)
}

async function checkAbort(s: ProgramConformanceSubject): Promise<void> {
  const waiting = await start(s, 'await Echo.say({})\nreturn 1', { answer: () => undefined })
  assert.equal(waiting.result.kind, 'done')
  await new Promise(resolve => setTimeout(resolve, 50))
  waiting.started.run.abort()
  assert.equal((await waiting.started.run.outcome).kind, 'aborted')
  assert.equal(waiting.started.run.answer(1, echo(waiting.started.calls[0]!)), 'not-waiting')
  const busy = await start(s, 'while (true) {}', { limits: { computeMs: 30_000 } })
  assert.equal(busy.result.kind, 'done')
  await new Promise(resolve => setTimeout(resolve, 50))
  busy.started.run.abort()
  assert.equal((await busy.started.run.outcome).kind, 'aborted')
  const spent = await start(s, 'while (true) {}', { limits: { computeMs: 50 } })
  assert.equal(spent.result.kind, 'done')
  await new Promise(resolve => setTimeout(resolve, 100))
  spent.started.run.abort()
  assert.equal(exceeded(await spent.started.run.outcome), 'compute-time')
}

async function checkAnswers(s: ProgramConformanceSubject): Promise<void> {
  const seen: string[] = []
  const { outcome, calls, run } = await execute(
    s,
    'Echo.say({ text: "loose" })\nreturn (await Twice({ n: 1 })).n',
    {
      answer(call, live) {
        if (call.entry !== 'Twice') return undefined
        seen.push(live.answer(99, echo(call)), live.answer(call.ordinal, echo(call)))
        seen.push(live.answer(call.ordinal, echo(call)))
        return undefined
      },
    },
  )
  assert.equal(returned(outcome), 1)
  assert.deepEqual(seen, ['not-waiting', 'delivered', 'not-waiting'])
  assert.deepEqual(
    calls.map(call => call.entry),
    ['Echo.say', 'Twice'],
  )
  assert.equal(run.answer(1, echo(calls[0]!)), 'not-waiting')
}

async function checkRefusals(s: ProgramConformanceSubject): Promise<void> {
  const reason = async (script: Script) => {
    const { result } = await start(s, 'return 1', script)
    assert.equal(result.kind, 'rejected')
    return result.kind === 'rejected' ? result.reason : ''
  }
  for (const limits of [
    { computeMs: 0 },
    { memoryBytes: Number.NaN },
    { calls: -1 },
    { outputBytes: 1.5 },
  ])
    assert.equal(await reason({ limits }), 'invalidInput')
  for (const entries of [
    ['a-b'],
    ['A.b.c'],
    ['tools'],
    ['Echo.say', 'Echo.say'],
    ['Echo', 'Echo.say'],
    ['Echo.say', 'Echo'],
    ['Twice', 'Twice'],
    ['ToolError.raise'],
  ])
    assert.equal(await reason({ entries }), 'invalidInput')
  for (const failures of [['ToolError', 'ToolError'], ['not-a-name'], ['Echo']])
    assert.equal(await reason({ failures }), 'invalidInput')
}

export const programConformanceNames = [
  'program.returns',
  'program.calls-in-order',
  'program.parallel-in-flight',
  'program.no-host-in-reach',
  'program.fresh-domain',
  'program.runaways-end',
  'program.waiting-is-not-compute',
  'program.call-and-output-limits',
  'program.invalid-output',
  'program.syntax',
  'program.types-are-erased',
  'program.failures',
  'program.thrown-lines',
  'program.abort',
  'program.answers',
  'program.refusals',
] as const

export function programFacilityConformance(
  options: ProgramConformanceOptions,
): readonly ConformanceCase[] {
  const stall = options.stallMs ?? 250
  const checks: readonly ((s: ProgramConformanceSubject) => Promise<void>)[] = [
    checkReturns,
    checkCalls,
    checkParallel,
    checkNoHost,
    checkFreshDomain,
    s => checkRunaways(s, stall),
    checkWaitingIsNotCompute,
    checkCallAndOutputLimits,
    checkInvalidOutput,
    checkSyntax,
    checkTypesAreErased,
    checkFailures,
    checkThrownLines,
    checkAbort,
    checkAnswers,
    checkRefusals,
  ]
  return checks.map((check, index) => ({
    name: programConformanceNames[index] ?? 'program',
    async run() {
      const subject = await options.subject()
      try {
        await bounded(check(subject), options.waitMs ?? 20_000)
      } finally {
        await subject.dispose?.()
      }
    },
  }))
}
