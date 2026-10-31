import { expect, it } from 'vitest'
import { tenantCodec } from '@omne-harness/legal-identity'
import {
  originRef,
  type CommandFacility,
  type OutputChunk,
  type ProcessHandle,
} from '@omne-harness/execution-environment-contract'
import {
  createScriptedCommandFacility,
  type CommandScript,
} from '@omne-harness/execution-environment-contract/testing'

const tenant = (() => {
  const t = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_0123456789abcdefghjkmnpqrs',
    }),
  )
  if (!t.ok) throw new Error('tenant fixture')
  return t.value
})()
type StartRequest = Parameters<CommandFacility<unknown>['start']>[0]
let sequence = 0
function start(extra: Partial<StartRequest> = {}): StartRequest {
  return {
    requestId: `r${++sequence}`,
    access: { principal: 'test', tenant },
    origin: originRef('origin'),
    binding: { kind: 'host_machine' },
    executable: 'echo',
    args: ['ok'],
    cwd: 'work',
    env: { LANG: 'C' },
    outputMode: 'separate',
    ...extra,
  }
}
const text = new TextEncoder()
const bytes = (value: string) => text.encode(value)

async function started(script: CommandScript, request: StartRequest = start()) {
  const answer = await createScriptedCommandFacility(script).facility.start(request)
  if (answer.kind !== 'done') throw new Error(`start: ${answer.kind}`)
  return answer.value
}
const PENDING = Symbol('pending')
/**
 * Races a promise against the next macrotask. Every microtask runs first, so a promise that the
 * double has already settled wins; one that is still open gives `PENDING`. No await can hang.
 */
async function settledOrPending<T>(promise: Promise<T>): Promise<T | typeof PENDING> {
  return Promise.race([
    promise,
    new Promise<typeof PENDING>(resolve => setImmediate(resolve, PENDING)),
  ])
}
/** The value of a promise that must be settled by now; an open one fails the test. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  const value = await settledOrPending(promise)
  if (value === PENDING) throw new Error('expected the promise to be settled')
  return value
}
/** Gives up the read right through `return()`, which the one reader must have. */
function giveUp(reader: AsyncIterator<OutputChunk>) {
  if (!reader.return) throw new Error('the output reader has no return()')
  return reader.return()
}
/** Reads the whole output; output that stays open fails the test instead of hanging it. */
async function drain(handle: ProcessHandle): Promise<OutputChunk[]> {
  const reader = handle.output[Symbol.asyncIterator]()
  const chunks: OutputChunk[] = []
  for (let step = await settled(reader.next()); !step.done; step = await settled(reader.next()))
    chunks.push(step.value)
  return chunks
}

it('starts a process that gives its chunks with per-stream offsets and the default outcome', async () => {
  const request = start()
  const handle = await started(
    () => ({
      kind: 'started',
      output: [
        { stream: 'stdout', data: 'ok\n' },
        { stream: 'stderr', data: bytes('warn') },
        { stream: 'stdout', data: 'done' },
      ],
    }),
    request,
  )
  expect(handle.process).toEqual({ id: 'scripted-1', generation: '1' })
  expect(handle.outputMode).toBe('separate')
  expect(await drain(handle)).toEqual([
    { stream: 'stdout', data: bytes('ok\n'), observedOffset: 0 },
    { stream: 'stderr', data: bytes('warn'), observedOffset: 0 },
    { stream: 'stdout', data: bytes('done'), observedOffset: 3 },
  ])
  expect(await settled(handle.result)).toEqual({
    kind: 'completed',
    exit: { kind: 'code', code: 0 },
    durationMs: 0,
    output: {
      mode: 'separate',
      stdout: { observedBytes: 7, discardedBytes: 0 },
      stderr: { observedBytes: 4, discardedBytes: 0 },
    },
  })
})

it('answers rejected with the scripted reason, such as unavailable for a failed start', async () => {
  const command = createScriptedCommandFacility(() => ({ kind: 'rejected', reason: 'unavailable' }))
  const request = start()
  expect(await command.facility.start(request)).toEqual({
    kind: 'rejected',
    requestId: request.requestId,
    reason: 'unavailable',
  })
})

it('answers unknown when the script says the start cannot be confirmed', async () => {
  const command = createScriptedCommandFacility(() => ({ kind: 'unknown' }))
  const request = start()
  expect(await command.facility.start(request)).toEqual({
    kind: 'unknown',
    requestId: request.requestId,
  })
})

it('counts terminal output in terminal mode', async () => {
  const handle = await started(
    () => ({ kind: 'started', output: [{ stream: 'terminal', data: 'a\r\n' }] }),
    start({ outputMode: 'terminal' }),
  )
  expect(handle.outputMode).toBe('terminal')
  expect(await drain(handle)).toEqual([
    { stream: 'terminal', data: bytes('a\r\n'), observedOffset: 0 },
  ])
  expect(await settled(handle.result)).toMatchObject({
    output: { mode: 'terminal', terminal: { observedBytes: 3, discardedBytes: 0 } },
  })
})

it('throws a TypeError when a scripted chunk does not fit the output mode', async () => {
  const stdoutInTerminal = createScriptedCommandFacility(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data: 'x' }],
  }))
  await expect(
    stdoutInTerminal.facility.start(start({ outputMode: 'terminal' })),
  ).rejects.toBeInstanceOf(TypeError)
  const terminalInSeparate = createScriptedCommandFacility(() => ({
    kind: 'started',
    output: [{ stream: 'terminal', data: 'x' }],
  }))
  await expect(terminalInSeparate.facility.start(start())).rejects.toBeInstanceOf(TypeError)
})

it('keeps an untilStop process running until a confirmed stop, then ends output and result', async () => {
  const command = createScriptedCommandFacility(() => ({
    kind: 'started',
    runs: 'untilStop',
    output: [{ stream: 'stdout', data: 'tick' }],
  }))
  const answer = await command.facility.start(start())
  if (answer.kind !== 'done') throw new Error(answer.kind)
  const handle = answer.value
  const reader = handle.output[Symbol.asyncIterator]()
  expect(await settled(reader.next())).toEqual({
    done: false,
    value: { stream: 'stdout', data: bytes('tick'), observedOffset: 0 },
  })
  const nextChunk = reader.next()
  expect(await settledOrPending(nextChunk)).toBe(PENDING)
  expect(await settledOrPending(handle.result)).toBe(PENDING)
  expect(await settled(handle.stop('graceful'))).toBe('confirmed')
  expect(await settled(nextChunk)).toMatchObject({ done: true })
  expect(await settled(handle.result)).toEqual({
    kind: 'completed',
    exit: { kind: 'signal', signal: 'SIGTERM' },
    durationMs: 0,
    output: {
      mode: 'separate',
      stdout: { observedBytes: 4, discardedBytes: 0 },
      stderr: { observedBytes: 0, discardedBytes: 0 },
    },
  })
  expect(command.stops).toEqual([
    { process: handle.process, mode: 'graceful', answer: 'confirmed' },
  ])
})

it('ends an untilStop process with SIGKILL after a confirmed forced stop', async () => {
  const handle = await started(() => ({ kind: 'started', runs: 'untilStop' }))
  expect(await settled(handle.stop('forced'))).toBe('confirmed')
  expect(await settled(handle.result)).toMatchObject({
    exit: { kind: 'signal', signal: 'SIGKILL' },
  })
})

it('uses the scripted outcome after a confirmed stop when the script gives one', async () => {
  const outcome = {
    kind: 'failed',
    reason: 'effectUnknown',
    observedDurationMs: 5,
    output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
  } as const
  const handle = await started(
    () => ({ kind: 'started', runs: 'untilStop', outcome }),
    start({ outputMode: 'terminal' }),
  )
  await settled(handle.stop('graceful'))
  expect(await settled(handle.result)).toEqual(outcome)
})

it('keeps output and result open after an unconfirmed stop', async () => {
  const command = createScriptedCommandFacility(() => ({
    kind: 'started',
    runs: 'untilStop',
    stop: 'unconfirmed',
  }))
  const answer = await command.facility.start(start())
  if (answer.kind !== 'done') throw new Error(answer.kind)
  const handle = answer.value
  const reader = handle.output[Symbol.asyncIterator]()
  const next = reader.next()
  expect(await settled(handle.stop('forced'))).toBe('unconfirmed')
  expect(await settledOrPending(next)).toBe(PENDING)
  expect(await settledOrPending(handle.result)).toBe(PENDING)
  expect(command.stops).toEqual([
    { process: handle.process, mode: 'forced', answer: 'unconfirmed' },
  ])
  await settled(giveUp(reader))
})

it('records a stop of an exited process and answers what the script says', async () => {
  const command = createScriptedCommandFacility(() => ({ kind: 'started', stop: 'unconfirmed' }))
  const answer = await command.facility.start(start())
  if (answer.kind !== 'done') throw new Error(answer.kind)
  await settled(answer.value.result)
  expect(await settled(answer.value.stop('graceful'))).toBe('unconfirmed')
  expect(command.stops).toHaveLength(1)
})

it('allows one output reader only', async () => {
  const handle = await started(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data: 'x' }],
  }))
  handle.output[Symbol.asyncIterator]()
  expect(() => handle.output[Symbol.asyncIterator]()).toThrow(TypeError)
})

it('lets a reader give up the output without changing the result', async () => {
  const handle = await started(() => ({
    kind: 'started',
    runs: 'untilStop',
    output: [
      { stream: 'stdout', data: 'a' },
      { stream: 'stdout', data: 'b' },
    ],
  }))
  const reader = handle.output[Symbol.asyncIterator]()
  await settled(reader.next())
  expect(await settled(giveUp(reader))).toMatchObject({ done: true })
  expect(await settled(reader.next())).toMatchObject({ done: true })
  expect(await settledOrPending(handle.result)).toBe(PENDING)
  expect(await settled(handle.stop('graceful'))).toBe('confirmed')
  expect(await settled(handle.result)).toMatchObject({
    output: { stdout: { observedBytes: 2, discardedBytes: 0 } },
  })
})

it('answers closed after close() without calling the script, and running processes go on', async () => {
  let scripted = 0
  const command = createScriptedCommandFacility(() => {
    scripted++
    return { kind: 'started', runs: 'untilStop' }
  })
  const running = await command.facility.start(start())
  if (running.kind !== 'done') throw new Error(running.kind)
  command.close()
  const request = start()
  expect(await command.facility.start(request)).toEqual({
    kind: 'rejected',
    requestId: request.requestId,
    reason: 'closed',
  })
  expect(scripted).toBe(1)
  expect(command.calls).toHaveLength(1)
  expect(await settled(running.value.stop('graceful'))).toBe('confirmed')
  expect(await settled(running.value.result)).toMatchObject({ kind: 'completed' })
})

it('records each accepted request with its cwd and env, and numbers the processes', async () => {
  const command = createScriptedCommandFacility(() => ({ kind: 'started' }))
  const first = await command.facility.start(start({ cwd: 'a', env: { A: '1' } }))
  const second = await command.facility.start(start({ cwd: 'b', env: {} }))
  expect(command.calls.map(c => [c.cwd, c.env])).toEqual([
    ['a', { A: '1' }],
    ['b', {}],
  ])
  expect([first, second].map(a => (a.kind === 'done' ? a.value.process.id : a.kind))).toEqual([
    'scripted-1',
    'scripted-2',
  ])
})

it('throws a TypeError when the scripted outcome does not fit the output mode', async () => {
  const command = createScriptedCommandFacility(() => ({
    kind: 'started',
    outcome: {
      kind: 'completed',
      exit: { kind: 'code', code: 0 },
      durationMs: 0,
      output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
    },
  }))
  await expect(command.facility.start(start())).rejects.toBeInstanceOf(TypeError)
})

it('keeps its own copy of scripted output bytes', async () => {
  const data = bytes('out')
  const command = createScriptedCommandFacility(() => ({
    kind: 'started',
    output: [{ stream: 'stdout', data }],
  }))
  const answer = await command.facility.start(start())
  if (answer.kind !== 'done') throw new Error(answer.kind)
  data[0] = 0
  expect(await drain(answer.value)).toEqual([
    { stream: 'stdout', data: bytes('out'), observedOffset: 0 },
  ])
})
