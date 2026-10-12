import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { ExecutionTerminal, ToolResultWriter } from '@omne-harness-lite/tool-execution-runtime'
import { createResultPreparation } from '../src/execution-result.ts'

const ref = {
  tenant: unwrap(parseTenantId({ organization: 'boundary-org', account: 'boundary-user' })),
  session: unwrap(parseOpaqueIdentifier('boundary-session', 'SessionRef')),
  callId: unwrap(parseOpaqueIdentifier('boundary-call', 'CallId')),
}
const rawReference = {
  storage: 'boundary-store',
  key: 'original-raw',
  mediaType: 'text/plain',
  bytes: 6,
}
const content = [
  {
    id: unwrap(parseOpaqueIdentifier('original-content', 'BlockId')),
    kind: 'text' as const,
    visibility: { toHuman: true, toModel: true },
    text: 'original-content',
  },
]
const summary = [
  {
    id: unwrap(parseOpaqueIdentifier('summary-content', 'BlockId')),
    kind: 'text' as const,
    visibility: { toHuman: true, toModel: true },
    text: 'summary-only',
  },
] as const

function expectedId(purpose: string) {
  return `tool-${createHash('sha256')
    .update(
      JSON.stringify([
        'boundary-org',
        'boundary-user',
        'boundary-session',
        'boundary-call',
        purpose,
      ]),
    )
    .digest('hex')}`
}

function controlledWriter() {
  const storeRaw = vi.fn<ToolResultWriter['storeRaw']>(async () => ({
    kind: 'stored',
    reference: rawReference,
  }))
  const recordResult = vi.fn<ToolResultWriter['recordResult']>(async () => 'recorded')
  const writer: ToolResultWriter = {
    storeRaw,
    recordResult,
    putAttachment: async () => ({ kind: 'rejected', reason: 'storageUnavailable' }),
  }
  return { writer, storeRaw, recordResult }
}

test('result captures all original data and both original writer receivers before suspended raw storage', async () => {
  const receipt = Promise.withResolvers<void>(),
    events: string[] = []
  const storeRaw = vi.fn<ToolResultWriter['storeRaw']>(async function (
    this: ToolResultWriter,
    bytes,
    mediaType,
  ) {
    expect(this).toBe(writer)
    expect(bytes).toEqual(Buffer.from('secret'))
    expect(mediaType).toBe('text/plain')
    events.push('store')
    await receipt.promise
    return { kind: 'stored', reference: rawReference }
  })
  const recordResult = vi.fn<ToolResultWriter['recordResult']>(async function (
    this: ToolResultWriter,
    value,
  ) {
    expect(this).toBe(writer)
    expect(value).toEqual({
      ref,
      result: { content, offload: { raw: rawReference, summary } },
      raw: rawReference,
    })
    events.push('record')
    return 'recorded'
  })
  const replacementStore = vi.fn<ToolResultWriter['storeRaw']>(async () => ({
    kind: 'rejected',
    reason: 'storageUnavailable',
  }))
  const replacementRecord = vi.fn<ToolResultWriter['recordResult']>(async () => ({
    kind: 'rejected',
    reason: 'storageUnavailable',
  }))
  let currentStore = storeRaw,
    currentRecord = recordResult
  const writer: ToolResultWriter = {
    get storeRaw() {
      events.push('getRaw')
      return currentStore
    },
    get recordResult() {
      events.push('getRecord')
      return currentRecord
    },
    putAttachment: async () => ({ kind: 'rejected', reason: 'storageUnavailable' }),
  }
  const suppliedRef = { ...ref },
    chain = [{ piece: 'original-piece' }],
    authorContent = structuredClone(content)
  const ending = {
    outcome: 'completed',
    result: {
      content: authorContent,
      offload: { raw: { inline: 'c2VjcmV0', mediaType: 'text/plain' }, summary },
    },
  } satisfies ExecutionTerminal
  const input = { ref: suppliedRef, writer, pass: 'original-pass', chain }
  const prepare = createResultPreparation(input)
  expect(events).toEqual(['getRaw', 'getRecord'])
  const pending = prepare(ending)
  try {
    expect(events).toEqual(['getRaw', 'getRecord', 'store'])
    expect(recordResult).not.toHaveBeenCalled()
    suppliedRef.session = unwrap(parseOpaqueIdentifier('replacement-session', 'SessionRef'))
    suppliedRef.callId = unwrap(parseOpaqueIdentifier('replacement-call', 'CallId'))
    input.pass = 'replacement-pass'
    chain[0]!.piece = 'replacement-piece'
    authorContent[0]!.text = 'replacement-content'
    ending.result.offload.raw.inline = 'bmV3'
    currentStore = replacementStore
    currentRecord = replacementRecord
    receipt.resolve()
    expect(await pending).toEqual({
      terminal: {
        outcome: 'completed',
        result: { content, offload: { raw: rawReference, summary } },
      },
      delivery: {
        result: {
          id: expectedId('result'),
          kind: 'tool_result',
          callId: ref.callId,
          visibility: { toHuman: true, toModel: true },
          outcome: 'completed',
          blocks: content,
          offloaded: rawReference,
        },
        pass: 'original-pass',
        selectedChain: [{ piece: 'original-piece' }],
        raw: rawReference,
      },
    })
    expect(events).toEqual(['getRaw', 'getRecord', 'store', 'record'])
    expect(storeRaw).toHaveBeenCalledOnce()
    expect(recordResult).toHaveBeenCalledOnce()
    expect(replacementStore).not.toHaveBeenCalled()
    expect(replacementRecord).not.toHaveBeenCalled()
  } finally {
    receipt.resolve()
    await pending
  }
})

test.each(['storeRaw', 'recordResult'] as const)(
  'original %s rejection propagates the same error',
  async port => {
    const f = controlledWriter(),
      error = new Error(`original-${port}`)
    f[port].mockRejectedValueOnce(error)
    const prepare = createResultPreparation({
      ref,
      writer: f.writer,
      pass: 'original-pass',
      chain: [],
    })
    await expect(
      prepare({
        outcome: 'completed',
        result: { content, offload: { raw: { inline: 'c2VjcmV0', mediaType: 'text/plain' } } },
      }),
    ).rejects.toBe(error)
    expect(f.storeRaw).toHaveBeenCalledOnce()
    expect(f.recordResult).toHaveBeenCalledTimes(port === 'storeRaw' ? 0 : 1)
  },
)

test('terminal accessors are rejected without invoking them or writing any result', async () => {
  const f = controlledWriter(),
    getter = vi.fn(() => 'completed'),
    terminal: ExecutionTerminal = { outcome: 'completed', result: 'answer' }
  Object.defineProperty(terminal, 'outcome', { enumerable: true, get: getter })
  const prepare = createResultPreparation({
    ref,
    writer: f.writer,
    pass: 'original-pass',
    chain: [],
  })
  expect(await prepare(terminal)).toBe('unavailable')
  expect(getter).not.toHaveBeenCalled()
  expect(f.storeRaw).not.toHaveBeenCalled()
  expect(f.recordResult).not.toHaveBeenCalled()
})

test('a non-TypeError terminal capture trap propagates its original exception', async () => {
  const f = controlledWriter(),
    error = new Error('original-terminal-trap')
  const terminal = new Proxy<ExecutionTerminal>(
    { outcome: 'completed', result: 'answer' },
    {
      getPrototypeOf() {
        throw error
      },
    },
  )
  const prepare = createResultPreparation({
    ref,
    writer: f.writer,
    pass: 'original-pass',
    chain: [],
  })
  await expect(prepare(terminal)).rejects.toBe(error)
  expect(f.storeRaw).not.toHaveBeenCalled()
  expect(f.recordResult).not.toHaveBeenCalled()
})

const placeholders: {
  terminal: ExecutionTerminal
  text: string
  reason?: { code: 'abnormal_interruption' | 'user_interrupted'; text: string }
}[] = [
  {
    terminal: { outcome: 'failed', code: 'abnormal_interruption' },
    text: 'abnormal_interruption',
    reason: { code: 'abnormal_interruption', text: 'abnormal_interruption' },
  },
  { terminal: { outcome: 'failed', code: 'unparseable' }, text: 'unparseable' },
  {
    terminal: { outcome: 'unavailable', reason: 'missing-original-dependency' },
    text: 'missing-original-dependency',
  },
  {
    terminal: { outcome: 'interrupted', reason: 'user-request' },
    text: 'user-request',
    reason: { code: 'user_interrupted', text: 'user-request' },
  },
  { terminal: { outcome: 'no_answer', waitIndex: 7 }, text: 'no_answer' },
]
test.each(placeholders)(
  'placeholder $text preserves its complete terminal and trusted delivery',
  async ({ terminal, text, reason }) => {
    const f = controlledWriter()
    const prepare = createResultPreparation({
      ref,
      writer: f.writer,
      pass: 'original-pass',
      chain: [],
      interruptionCode: 'user_interrupted',
    })
    expect(await prepare(terminal)).toEqual({
      terminal,
      delivery: {
        result: {
          id: expectedId('result'),
          kind: 'tool_result',
          callId: ref.callId,
          visibility: { toHuman: true, toModel: true },
          outcome: terminal.outcome,
          blocks: [
            {
              id: expectedId('ending-text'),
              kind: 'text',
              visibility: { toHuman: true, toModel: true },
              text,
            },
          ],
          ...(reason ? { reason } : {}),
        },
        pass: 'original-pass',
        selectedChain: [],
      },
    })
    expect(f.storeRaw).not.toHaveBeenCalled()
    expect(f.recordResult).not.toHaveBeenCalled()
  },
)

test('interruption text cannot invent a trusted interruption code', async () => {
  const f = controlledWriter()
  const prepare = createResultPreparation({
    ref,
    writer: f.writer,
    pass: 'original-pass',
    chain: [],
  })
  expect(await prepare({ outcome: 'interrupted', reason: 'user_interrupted' })).toBe('unavailable')
  expect(f.storeRaw).not.toHaveBeenCalled()
  expect(f.recordResult).not.toHaveBeenCalled()
})
