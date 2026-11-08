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
  createScriptedRetentionStore,
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

const leftover: CommandScript = () => ({ kind: 'started', leaves: 2 })

it('adds no retention extension and no residue unless the retention option is given', async () => {
  const plain = createScriptedCommandFacility(leftover)
  expect(plain.facility.retention).toBeUndefined()
  const answer = await plain.facility.start(start())
  if (answer.kind !== 'done') throw new Error(`start: ${answer.kind}`)
  expect(await settled(answer.value.result)).not.toHaveProperty('residue')
})

it('reports none, retained with the count, and an unbound stop when the ledger view is missing', async () => {
  const store = createScriptedRetentionStore()
  const scope = (ledger?: boolean) =>
    createScriptedCommandFacility(leftover, {
      retention: { store, scope: 'scope', ...(ledger === undefined ? {} : { ledger }) },
    })
  const result = async (cmd: ReturnType<typeof scope>, request = start()) => {
    const answer = await cmd.facility.start(request)
    if (answer.kind !== 'done') throw new Error(`start: ${answer.kind}`)
    return settled(answer.value.result)
  }
  const retaining = scope()
  expect(await result(retaining)).toMatchObject({
    residue: { kind: 'retained', processes: 2, process: { id: expect.any(String) } },
  })
  const clean = createScriptedCommandFacility(() => ({ kind: 'started' }), {
    retention: { store, scope: 'scope' },
  })
  expect(await result(clean)).toMatchObject({ residue: { kind: 'none' } })
  const unbound = scope(false)
  expect(unbound.facility.retention).toBeUndefined()
  expect(await result(unbound)).toMatchObject({ residue: { kind: 'stopping', reason: 'unbound' } })
})

it('hands over: the handle stop answers unconfirmed, the list shows it, closing the scope stops it', async () => {
  const store = createScriptedRetentionStore()
  const cmd = createScriptedCommandFacility(leftover, { retention: { store, scope: 'scope' } })
  const answer = await cmd.facility.start(start())
  if (answer.kind !== 'done') throw new Error(`start: ${answer.kind}`)
  const outcome = await settled(answer.value.result)
  if (outcome.kind !== 'completed' || outcome.residue?.kind !== 'retained')
    throw new Error('expected a retained leftover')
  const ref = outcome.residue.process
  expect(await answer.value.stop('forced')).toBe('unconfirmed')
  expect(cmd.stops).toEqual([
    { process: answer.value.process, mode: 'forced', answer: 'unconfirmed' },
  ])
  const listed = await cmd.facility.retention?.list(start())
  expect(listed).toMatchObject({ kind: 'done', value: [{ process: ref, state: 'running' }] })
  expect(store.stopped(ref)).toBe(false)
  store.closeScope('scope')
  expect(store.stopped(ref)).toBe(true)
  expect(await cmd.facility.retention?.list(start())).toMatchObject({ kind: 'done', value: [] })
  const late = await cmd.facility.start(start())
  if (late.kind !== 'done') throw new Error(`start: ${late.kind}`)
  expect(await settled(late.value.result)).toMatchObject({
    residue: { kind: 'stopping', reason: 'closed' },
  })
})

it('rejects `leaves` on a process that runs until stopped', async () => {
  const cmd = createScriptedCommandFacility(
    () => ({ kind: 'started', runs: 'untilStop', leaves: 1 }),
    { retention: { store: createScriptedRetentionStore(), scope: 'scope' } },
  )
  await expect(cmd.facility.start(start())).rejects.toThrow(TypeError)
})

type Retention = NonNullable<CommandFacility<unknown>['retention']>
type RetentionScope = Readonly<{
  store: ReturnType<typeof createScriptedRetentionStore>
  scope?: string
  refuse?: readonly ('stop' | 'output')[]
}>
/** A retaining facility, one leftover handed over to its scope, and the extension's three operations. */
async function handedOver(at: RetentionScope, script: CommandScript = leftover, request = start()) {
  const cmd = createScriptedCommandFacility(script, {
    retention: {
      store: at.store,
      scope: at.scope ?? 'scope',
      ...(at.refuse === undefined ? {} : { refuse: at.refuse }),
    },
  })
  const answer = await cmd.facility.start(request)
  if (answer.kind !== 'done') throw new Error(`start: ${answer.kind}`)
  const outcome = await settled(answer.value.result)
  if (outcome.kind !== 'completed' || outcome.residue?.kind !== 'retained')
    throw new Error('expected a retained leftover')
  const retention: Retention | undefined = cmd.facility.retention
  if (!retention?.stop || !retention.output) throw new Error('expected stop and output')
  return {
    ref: outcome.residue.process,
    list: retention.list.bind(retention),
    stop: retention.stop.bind(retention),
    output: retention.output.bind(retention),
  }
}
/** A payload outside the operation's type, as a caller outside TypeScript can send it. */
const malformed = <T>(payload: unknown): T => payload as T
const invalidInput = (request: { requestId: string }) => ({
  kind: 'rejected',
  requestId: request.requestId,
  reason: 'invalidInput',
})

it('answers invalidInput to a stop or output whose process is not a reference', async () => {
  const store = createScriptedRetentionStore()
  const { ref, stop, output } = await handedOver({ store })
  for (const process of [
    undefined,
    null,
    ref.id,
    { id: '', generation: ref.generation },
    { id: ref.id, generation: '' },
    { id: 1, generation: ref.generation },
    { id: ref.id },
  ]) {
    const halt = start()
    expect(await stop(malformed({ ...halt, process, mode: 'forced' })), 'stop').toEqual(
      invalidInput(halt),
    )
    const read = start()
    expect(await output(malformed({ ...read, process })), 'output').toEqual(invalidInput(read))
  }
  expect(store.stopped(ref)).toBe(false)
})

it('answers invalidInput to a stop whose mode is neither graceful nor forced, and stops nothing', async () => {
  const store = createScriptedRetentionStore()
  const { ref, stop } = await handedOver({ store })
  for (const mode of [undefined, 'gentle', 'FORCED']) {
    const request = start()
    expect(await stop(malformed({ ...request, process: ref, mode }))).toEqual(invalidInput(request))
  }
  expect(store.stopped(ref)).toBe(false)
  expect(store.stopsIssued(ref)).toBe(0)
  expect(await stop({ ...start(), process: ref, mode: 'graceful' })).toMatchObject({
    kind: 'done',
    value: { status: 'confirmed' },
  })
})

it('answers invalidInput to an output whose from is not per-stream non-negative safe integers', async () => {
  const { ref, output } = await handedOver({ store: createScriptedRetentionStore() })
  for (const from of [
    null,
    1,
    [0],
    { stdout: 1.5 },
    { stdout: -1 },
    { stdout: Number.MAX_SAFE_INTEGER + 1 },
    { stdout: Number.NaN },
    { stdout: '0' },
    { stdout: undefined },
    { stdin: 0 },
  ]) {
    const request = start()
    expect(
      await output(malformed({ ...request, process: ref, from })),
      JSON.stringify(from),
    ).toEqual(invalidInput(request))
  }
  expect(
    await output({ ...start(), process: ref, from: { stdout: 0, stderr: 0, terminal: 0 } }),
  ).toMatchObject({ kind: 'done' })
  expect(
    await output({ ...start(), process: ref, from: { stdout: Number.MAX_SAFE_INTEGER } }),
  ).toMatchObject({ kind: 'done' })
})

it('checks the shape before it looks the process up and before its guard', async () => {
  const store = createScriptedRetentionStore()
  const { ref, stop, output } = await handedOver({ store })
  const absent = { id: `${ref.id}-absent`, generation: ref.generation }
  const halt = start()
  expect(await stop(malformed({ ...halt, process: absent, mode: 'gentle' }))).toEqual(
    invalidInput(halt),
  )
  const read = start()
  expect(await output({ ...read, process: absent, from: { stdout: -1 } })).toEqual(
    invalidInput(read),
  )
  const guarded = await handedOver({ store, refuse: ['stop', 'output'] })
  const refused = start()
  expect(await guarded.stop(malformed({ ...refused, process: ref, mode: 'gentle' }))).toEqual(
    invalidInput(refused),
  )
})

/** The stdout tail of a retained process whose script wrote `after` once the domain was handed over. */
async function tailOf(
  after: string | Uint8Array,
  options: Readonly<{ before?: string | Uint8Array; from?: number }> = {},
) {
  const { ref, output } = await handedOver({ store: createScriptedRetentionStore() }, () => ({
    kind: 'started',
    leaves: 1,
    ...(options.before === undefined
      ? {}
      : { output: [{ stream: 'stdout' as const, data: options.before }] }),
    afterHandover: [{ stream: 'stdout' as const, data: after }],
  }))
  const answer = await output({
    ...start(),
    process: ref,
    ...(options.from === undefined ? {} : { from: { stdout: options.from } }),
  })
  if (answer.kind !== 'done' || answer.value.kind !== 'tail') throw new Error('expected a tail')
  const [tail] = answer.value.streams
  if (tail === undefined) throw new Error('expected a stdout tail')
  return tail
}

it('reports replaced only when the bytes are not valid UTF-8, not for a U+FFFD the source wrote', async () => {
  expect((await tailOf('ok � done')).text).toMatchObject({
    value: 'ok � done',
    replaced: false,
  })
  expect((await tailOf(new Uint8Array([0x6f, 0xff, 0x6b]))).text).toMatchObject({
    value: 'o�k',
    replaced: true,
  })
})

it('closing one scope of a shared store stops only the retained processes of that scope', async () => {
  const store = createScriptedRetentionStore()
  const closing = await handedOver({ store, scope: 'closing' })
  const open = await handedOver({ store, scope: 'open' })
  store.closeScope('closing')
  expect(store.stopped(closing.ref)).toBe(true)
  expect(store.stopped(open.ref)).toBe(false)
  expect(await open.list(start())).toMatchObject({ kind: 'done', value: [{ process: open.ref }] })
})

it('answers a stop from its end fact only for the scope, tenant and reference that ended', async () => {
  const store = createScriptedRetentionStore()
  const own = await handedOver({ store })
  expect(await own.stop({ ...start(), process: own.ref, mode: 'forced' })).toMatchObject({
    kind: 'done',
    value: { status: 'confirmed' },
  })
  expect(await own.stop({ ...start(), process: own.ref, mode: 'forced' })).toMatchObject({
    kind: 'done',
    value: { status: 'confirmed' },
  })
  const notFound = { kind: 'rejected', reason: 'notFound' }
  const otherScope = await handedOver({ store, scope: 'other' })
  expect(await otherScope.stop({ ...start(), process: own.ref, mode: 'forced' })).toMatchObject(
    notFound,
  )
  const stranger = tenantCodec.parse(
    JSON.stringify({
      organization: 'org_0123456789abcdefghjkmnpqrs',
      account: 'acc_zzzzzzzzzzzzzzzzzzzzzzzzzz',
    }),
  )
  if (!stranger.ok) throw new Error('tenant fixture')
  const request = start()
  expect(
    await own.stop({
      ...request,
      access: { ...request.access, tenant: stranger.value },
      process: own.ref,
      mode: 'forced',
    }),
  ).toMatchObject(notFound)
  expect(
    await own.stop({
      ...start(),
      process: { ...own.ref, generation: `${own.ref.generation}-next` },
      mode: 'forced',
    }),
  ).toMatchObject(notFound)
})

it('counts scripted strings as UTF-8 bytes in the tail offsets and data', async () => {
  const tail = await tailOf('✓!', { before: 'éé' })
  expect(tail).toMatchObject({ savedFrom: 4, start: 4, end: 8, discardedBytes: 0 })
  expect([...tail.data]).toEqual([...bytes('✓!')])
  expect(tail.text).toEqual({ encoding: 'utf-8', value: '✓!', start: 4, replaced: false })
})

it('answers none for a retained process that wrote nothing after the handover', async () => {
  const { ref, output } = await handedOver({ store: createScriptedRetentionStore() })
  expect(await output({ ...start(), process: ref })).toMatchObject({
    kind: 'done',
    value: { kind: 'none' },
  })
})

it('starts the text after the continuation bytes when from cuts a character', async () => {
  const tail = await tailOf('✓✓', { before: 'ab', from: 3 })
  expect(tail).toMatchObject({ savedFrom: 2, start: 3, end: 8 })
  expect([...tail.data]).toEqual([0x9c, 0x93, 0xe2, 0x9c, 0x93])
  expect(tail.text).toEqual({ encoding: 'utf-8', value: '✓', start: 5, replaced: false })
})

it('skips at most three continuation bytes, the most one cut character leaves', async () => {
  const tail = await tailOf(new Uint8Array([0x80, 0x80, 0x80, 0x80, 0x41]))
  expect(tail.text).toEqual({ encoding: 'utf-8', value: '�A', start: 3, replaced: true })
})
