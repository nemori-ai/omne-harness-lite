import { expect, it, vi } from 'vitest'
import { createShellTool } from '../src/index.ts'
import { fixture } from './fixture.ts'

const options = { shell: { executable: '/bin/bash', args: [] }, maxOutputBytes: 64 }
function payload(result: Awaited<ReturnType<ReturnType<typeof createShellTool>['executor']>>) {
  if (typeof result === 'string' || result.content[0]?.kind !== 'text')
    throw new Error('Structured result required')
  return JSON.parse(result.content[0].text)
}
it('enforces one retention budget across many chunks and flushes an incomplete UTF-8 character', async () => {
  const h = fixture([
    new TextEncoder().encode('abcd'),
    new TextEncoder().encode('efgh'),
    new TextEncoder().encode('ij'),
  ])
  const returned = await createShellTool({ ...options, maxOutputBytes: 5 }).executor(
    { command: 'execute', args: { command: 'many' } },
    h.deps,
  )
  expect(payload(returned).output).toMatchObject({
    retainedBytes: 5,
    toolDiscardedBytes: 5,
    streams: [{ stream: 'terminal', text: 'abcde' }],
  })
  const split = fixture([Uint8Array.of(0xe2, 0x82)])
  const incomplete = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'incomplete' } },
    split.deps,
  )
  expect(payload(incomplete).output.streams[0].text).toBe('\ufffd')
  expect(split.frames.at(-1)).toMatchObject({ t: 'close', block: { text: '\ufffd' } })
})
it('reports dropped fill and close frames without losing the visible final result', async () => {
  const h = fixture()
  vi.mocked(h.deps.frames.emit).mockImplementation(frame =>
    frame.t === 'open' ? { kind: 'accepted' } : { kind: 'dropped', why: 'capacity' },
  )
  const returned = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'work' } },
    h.deps,
  )
  expect(payload(returned).output.droppedFrames).toBe(2)
  expect(typeof returned !== 'string' && returned.content[0]?.visibility).toEqual({
    toHuman: true,
    toModel: true,
  })
  expect(payload(returned).output.streams[0].text).toBe('from-selected-provider')
  expect(h.process.stop).not.toHaveBeenCalled()
})
it('retains an unknown execution failure and removes the abort listener after normal completion', async () => {
  const h = fixture([], {
    kind: 'failed',
    reason: 'effectUnknown',
    observedDurationMs: 7,
    output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
  })
  const returned = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'work' } },
    h.deps,
  )
  expect(returned).toMatchObject({ isError: true })
  expect(payload(returned).outcome).toMatchObject({ kind: 'failed', reason: 'effectUnknown' })
  h.controller.abort()
  await Promise.resolve()
  expect(h.process.stop).not.toHaveBeenCalled()
})
it('decodes split UTF-8 and emits human-only frames without line assumptions', async () => {
  const bytes = new TextEncoder().encode('半行\r\u001b[31m红色\u001b[0m\n第二行\n')
  const h = fixture([
    new Uint8Array(),
    ...[...bytes].map(byte => Uint8Array.of(byte)),
    new Uint8Array(),
  ])
  const result = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'write' } },
    h.deps,
  )
  expect(h.frames[0]).toMatchObject({
    t: 'open',
    index: 0,
    kind: 'text',
    fill: 'append',
    visibility: { toHuman: true, toModel: false },
  })
  const end = h.frames.at(-1)
  expect(end).toMatchObject({
    t: 'close',
    index: 0,
    block: {
      kind: 'text',
      text: new TextDecoder().decode(bytes),
      visibility: { toHuman: true, toModel: false },
    },
  })
  const open = h.frames[0]
  if (open?.t !== 'open' || end?.t !== 'close') throw new Error('Balanced stream required')
  const block = end.block
  if (!block || block.kind !== 'text' || !('text' in block) || typeof block.text !== 'string')
    throw new Error('A final text block is required')
  expect(block.id).toBe(open.id)
  const fills = h.frames.slice(1, -1)
  expect(
    fills.every(
      frame =>
        frame.t === 'fill' &&
        frame.index === 0 &&
        typeof frame.payload === 'string' &&
        frame.payload.length > 0,
    ),
  ).toBe(true)
  expect(fills.map(frame => (frame.t === 'fill' ? frame.payload : '')).join('')).toBe(block.text)
  if (typeof result === 'string' || result.content[0]?.kind !== 'text')
    throw new Error('Structured result required')
  const body = JSON.parse(result.content[0].text)
  expect(body.output.retainedBytes).toBe(bytes.byteLength)
  expect(body.output.streams[0].text).toBe(new TextDecoder().decode(bytes))
})
it('continues collection and completion when display capacity is unavailable', async () => {
  const h = fixture(['first', 'second', 'third'].map(value => new TextEncoder().encode(value)))
  vi.mocked(h.deps.frames.emit).mockReturnValue({ kind: 'dropped', why: 'capacity' })
  const result = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'write' } },
    h.deps,
  )
  expect(result).not.toHaveProperty('isError')
  expect(h.process.stop).not.toHaveBeenCalled()
  expect(h.frames).toEqual([])
  expect(h.deps.frames.emit).toHaveBeenCalledTimes(1)
  expect(payload(result).output).toMatchObject({
    droppedFrames: 1,
    streams: [{ stream: 'terminal', text: 'firstsecondthird' }],
  })
})
it.each(['confirmed', 'unconfirmed'] as const)(
  'observes an in-flight abort and retains %s stop status',
  async status => {
    const h = fixture()
    const draining = Promise.withResolvers<void>(),
      finish = Promise.withResolvers<void>()
    const outcome = Promise.withResolvers<Awaited<typeof h.process.result>>()
    const process = {
      ...h.process,
      result: outcome.promise,
      output: (async function* () {
        draining.resolve()
        await finish.promise
        yield { stream: 'terminal' as const, data: new TextEncoder().encode('completed') }
      })(),
      stop: vi.fn(async () => status),
    }
    vi.mocked(h.command.start).mockResolvedValue({ kind: 'started', process })
    const waiting = createShellTool(options).executor(
      { command: 'execute', args: { command: 'work' } },
      h.deps,
    )
    try {
      await draining.promise
      h.controller.abort()
      await Promise.resolve()
      expect(process.stop).toHaveBeenCalledExactlyOnceWith('graceful')
    } finally {
      finish.resolve()
      outcome.resolve(await h.process.result)
    }
    expect(payload(await waiting).stopObservation).toBe(status)
  },
)
it('bounds combined retained bytes while preserving provider and tool discard counts', async () => {
  const h = fixture([new TextEncoder().encode('0123456789')], {
    kind: 'completed',
    exit: { code: 0 },
    durationMs: 7,
    output: { mode: 'terminal', terminal: { observedBytes: 20, discardedBytes: 10 } },
  })
  const result = await createShellTool({ ...options, maxOutputBytes: 5 }).executor(
    { command: 'execute', args: { command: 'write' } },
    h.deps,
  )
  if (typeof result === 'string' || result.content[0]?.kind !== 'text')
    throw new Error('Structured result required')
  const body = JSON.parse(result.content[0].text)
  expect(body.output).toMatchObject({
    retainedBytes: 5,
    toolDiscardedBytes: 5,
    streams: [{ stream: 'terminal', text: '01234' }],
  })
  expect(body.outcome.output.terminal.discardedBytes).toBe(10)
})
it.each([{ code: 3 }, { signal: 'SIGTERM' }, { unknown: true as const }])(
  'reports original non-success exit as a business error: %j',
  async exit => {
    const h = fixture([], {
      kind: 'completed',
      exit,
      durationMs: 7,
      output: { mode: 'terminal', terminal: { observedBytes: 0, discardedBytes: 0 } },
    })
    expect(
      await createShellTool(options).executor(
        { command: 'execute', args: { command: 'fail' } },
        h.deps,
      ),
    ).toMatchObject({ isError: true })
  },
)
it('explicit abort stops one original process and removes its listener on completion', async () => {
  const h = fixture()
  vi.mocked(h.command.start).mockImplementation(async () => {
    queueMicrotask(() => h.controller.abort())
    return { kind: 'started', process: h.process }
  })
  const result = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'work' } },
    h.deps,
  )
  expect(h.process.stop).toHaveBeenCalledExactlyOnceWith('graceful')
  expect(payload(result).stopObservation).toBe('confirmed')
})

it.each(['stopReject', 'stopThrow', 'resultReject'] as const)(
  'owns %s before output drain and propagates the original exception',
  async mode => {
    const h = fixture(),
      gate = Promise.withResolvers<void>()
    const failure = new Error(mode)
    const result = Promise.withResolvers<Awaited<typeof h.process.result>>()
    const process = {
      ...h.process,
      result: result.promise,
      output: (async function* () {
        await gate.promise
        yield { stream: 'terminal' as const, data: new Uint8Array() }
      })(),
      stop: vi.fn(() => {
        if (mode === 'stopThrow') throw failure
        return Promise.reject(failure)
      }),
    }
    vi.mocked(h.command.start).mockImplementation(async () => {
      queueMicrotask(() =>
        mode === 'resultReject' ? result.reject(failure) : h.controller.abort(),
      )
      return { kind: 'started', process }
    })
    const waiting = createShellTool(options).executor(
      { command: 'execute', args: { command: 'work' } },
      h.deps,
    )
    const timeout = new Error('exception must reach the executor before output completes')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const observed = await Promise.race([
        waiting.then(
          () => undefined,
          error => error,
        ),
        new Promise<Error>(resolve => {
          timer = setTimeout(() => resolve(timeout), 200)
        }),
      ])
      expect(observed).toBe(failure)
      expect(h.frames).toEqual([])
    } finally {
      clearTimeout(timer)
      gate.resolve()
      result.resolve(await h.process.result)
      await waiting.catch(() => undefined)
    }
  },
)

it('counts only rejected user frames when all output frames are accepted', async () => {
  const h = fixture([new TextEncoder().encode('one'), new TextEncoder().encode('two')])
  const result = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'work' } },
    h.deps,
  )
  expect(payload(result).output).toEqual({
    streams: [{ stream: 'terminal', text: 'onetwo' }],
    retainedBytes: 6,
    toolDiscardedBytes: 0,
    droppedFrames: 0,
  })
  expect(h.frames.map(frame => frame.t)).toEqual(['open', 'fill', 'fill', 'close'])
})

it('does not invent output streams or user frames for an empty provider chunk', async () => {
  const h = fixture([new Uint8Array()])
  const result = await createShellTool(options).executor(
    { command: 'execute', args: { command: 'empty' } },
    h.deps,
  )
  expect(payload(result).output).toEqual({
    streams: [],
    retainedBytes: 0,
    toolDiscardedBytes: 0,
    droppedFrames: 0,
  })
  expect(h.frames).toEqual([])
})
