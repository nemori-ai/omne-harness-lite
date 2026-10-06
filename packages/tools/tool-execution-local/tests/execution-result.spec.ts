import { expect, test, vi } from 'vitest'
import { parseOpaqueIdentifier, parseTenantId, unwrap } from '@omne-harness-lite/identity-values'
import type { ToolResultWriter, ExecutionTerminal } from '@omne-harness-lite/tool-execution-runtime'
import { createResultPreparation } from '../src/execution-result.ts'

const ref = {
  tenant: unwrap(parseTenantId({ organization: 'result-org', account: 'result-user' })),
  session: unwrap(parseOpaqueIdentifier('result-session', 'SessionRef')),
  callId: unwrap(parseOpaqueIdentifier('result-call', 'CallId')),
}
const reference = {
  storage: 'declared-store',
  key: 'original-raw',
  mediaType: 'text/plain',
  bytes: 6,
}
const content = [
  {
    id: unwrap(parseOpaqueIdentifier('author-block', 'BlockId')),
    kind: 'text' as const,
    visibility: { toHuman: true, toModel: true },
    text: 'author-content',
  },
]
const summary = [
  {
    ...content[0]!,
    id: unwrap(parseOpaqueIdentifier('summary-block', 'BlockId')),
    text: 'author-summary',
  },
] as const
/** Controlled storage writer: these tests prove normalization and ordering, not filesystem durability or read authorization. */
function fixture() {
  const storeRaw = vi.fn<ToolResultWriter['storeRaw']>(async () => ({ kind: 'stored', reference }))
  const recordResult = vi.fn<ToolResultWriter['recordResult']>(async () => 'recorded')
  const writer: ToolResultWriter = {
    storeRaw,
    recordResult,
    putAttachment: async () => ({ kind: 'rejected', reason: 'storageUnavailable' }),
  }
  const chain = [{ name: 'actual-selected-piece' }]
  const prepare = createResultPreparation({
    ref,
    writer,
    pass: 'actual-pass',
    chain,
    interruptionCode: 'user_interrupted',
  })
  return { storeRaw, recordResult, writer, chain, prepare }
}

test('a JSON-looking string remains author text, with stable provider block identity and unchanged terminal', async () => {
  const f = fixture(),
    ending: ExecutionTerminal = { outcome: 'completed', result: '{"answer":42}' }
  const first = await f.prepare(ending),
    second = await f.prepare(ending)
  expect(first).toMatchObject({
    terminal: ending,
    delivery: { pass: 'actual-pass', result: { blocks: [{ text: '{"answer":42}' }] } },
  })
  expect(first).toEqual(second)
  expect(f.storeRaw).not.toHaveBeenCalled()
  expect(f.recordResult).toHaveBeenCalledWith(
    expect.objectContaining({
      ref,
      result: { content: [expect.objectContaining({ text: '{"answer":42}' })] },
    }),
  )
})

test('inline raw is received before result preparation, and only its confirmed reference enters terminal A', async () => {
  const f = fixture()
  let finish!: () => void
  const stored = new Promise<void>(resolve => {
    finish = resolve
  })
  f.storeRaw.mockImplementation(async () => {
    await stored
    return { kind: 'stored', reference }
  })
  const original: ExecutionTerminal = {
    outcome: 'completed',
    result: { content, offload: { raw: { inline: 'c2VjcmV0', mediaType: 'text/plain' }, summary } },
  }
  const pending = f.prepare(original)
  expect(f.storeRaw).toHaveBeenCalledWith(Buffer.from('secret'), 'text/plain')
  expect(f.recordResult).not.toHaveBeenCalled()
  finish()
  const prepared = await pending
  expect(prepared).toMatchObject({
    terminal: { outcome: 'completed', result: { offload: { raw: reference, summary } } },
    delivery: { raw: reference, result: { blocks: content, offloaded: reference } },
  })
  expect(f.recordResult).toHaveBeenCalledWith({
    ref,
    result: { content, offload: { raw: reference, summary } },
    raw: reference,
  })
  expect(original).toMatchObject({ result: { offload: { raw: { inline: 'c2VjcmV0' } } } })
})

test('unknown raw receipt prevents the result record and does not substitute an invented reference', async () => {
  const f = fixture()
  f.storeRaw.mockResolvedValue({ kind: 'rejected', reason: 'receiptUnknown' })
  expect(
    await f.prepare({
      outcome: 'completed',
      result: { content, offload: { raw: { inline: 'c2VjcmV0', mediaType: 'text/plain' } } },
    }),
  ).toBe('unavailable')
  expect(f.recordResult).not.toHaveBeenCalled()
})

test('unknown result preparation receipt prevents a terminal basis even after raw was stored', async () => {
  const f = fixture()
  f.recordResult.mockResolvedValue({ kind: 'rejected', reason: 'receiptUnknown' })
  expect(
    await f.prepare({
      outcome: 'completed',
      result: { content, offload: { raw: { inline: 'c2VjcmV0', mediaType: 'text/plain' } } },
    }),
  ).toBe('unavailable')
  expect(f.storeRaw).toHaveBeenCalledTimes(1)
  expect(f.recordResult).toHaveBeenCalledTimes(1)
})

test('an existing author raw reference is reused and business failure remains immutable', async () => {
  const f = fixture()
  expect(
    await f.prepare({
      outcome: 'failed',
      code: 'business_failure',
      result: { content, isError: true, offload: { raw: reference, summary } },
    }),
  ).toMatchObject({
    terminal: {
      outcome: 'failed',
      code: 'business_failure',
      result: { isError: true, offload: { raw: reference } },
    },
    delivery: {
      result: { outcome: 'failed', blocks: content, offloaded: reference },
      raw: reference,
    },
  })
  expect(f.storeRaw).not.toHaveBeenCalled()
  expect(f.recordResult).toHaveBeenCalledTimes(1)
})

test.each<ExecutionTerminal>([
  { outcome: 'failed', code: 'abnormal_interruption' },
  { outcome: 'failed', code: 'unparseable' },
  { outcome: 'unavailable', reason: 'missing-dependency' },
  { outcome: 'interrupted', reason: 'requested-stop' },
])('a placeholder terminal has no invented author result or raw', async ending => {
  const f = fixture(),
    prepared = await f.prepare(ending)
  expect(prepared).toMatchObject({
    terminal: ending,
    delivery: { result: { outcome: ending.outcome } },
  })
  if (prepared === 'unavailable') throw new Error('placeholder basis unavailable')
  expect(prepared.delivery.raw).toBeUndefined()
  expect(f.recordResult).not.toHaveBeenCalled()
  expect(f.storeRaw).not.toHaveBeenCalled()
})

test('chain and selected pass are captured, and a duplicate preparation receipt is accepted', async () => {
  const f = fixture()
  f.chain[0]!.name = 'replaced-piece'
  f.recordResult.mockResolvedValue('duplicate')
  expect(await f.prepare({ outcome: 'completed', result: 'answer' })).toMatchObject({
    delivery: {
      pass: 'actual-pass',
      selectedChain: [{ name: 'actual-selected-piece' }],
    },
  })
})
