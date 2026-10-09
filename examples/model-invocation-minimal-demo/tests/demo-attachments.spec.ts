import { expect, it, vi } from 'vitest'
import { contentBlockFromRepresentation, type ImageBlock } from '@omne-harness-lite/content-blocks'
import { isOk, parseTenantId, parseOpaqueIdentifier } from '@omne-harness-lite/identity-values'
import { judgeMessage, type Message } from '@omne-harness-lite/messages'
import type {
  PlanInput,
  TransportAdapter,
  PlannedRequest,
  RawResponse,
} from '@omne-harness-lite/model-request-runtime'
import { createDemoAttachments } from '../src/demo-attachments.ts'
const tenant = parseTenantId({
  account: 'demo-image-owner',
  organization: 'demo-image-organization',
})
const session = parseOpaqueIdentifier('image-session', 'SessionRef')
if (!isOk(tenant) || !isOk(session)) throw new Error('Invalid fixture identity')
const scope = { tenant: tenant.ok, session: session.ok }
const image = contentBlockFromRepresentation({
  id: 'image',
  kind: 'image',
  visibility: { toHuman: true, toModel: true },
  mediaType: 'image/png',
  data: { storage: 'demo-results', key: 'confirmed-image', mediaType: 'image/png' },
}) as ImageBlock
const input = {
  messages: [
    {
      type: 'user',
      id: 'message',
      createdAt: '2026-10-08T00:00:00Z',
      blocks: [image],
    } as unknown as Message,
  ],
} as unknown as PlanInput
function provider() {
  const resolved: (Uint8Array | undefined)[] = []
  const plan = vi.fn<TransportAdapter<PlannedRequest, RawResponse>['plan']>(
    async (_request, execution) => {
      resolved.push(execution.imageBytes?.[0]?.bytes)
      return { rejected: 'unavailable' }
    },
  )
  const transport: TransportAdapter<PlannedRequest, RawResponse> = {
    plan,
    projectOutput: () => ({ unavailable: true }),
    send: async () => ({ failed: { source: 'local', localError: 'fixture' } }),
    read: async function* () {
      return { ended: 'end', readFacts: {} } as never
    },
  }
  return { plan, transport, resolved }
}
async function preparedPlan(
  support: ReturnType<typeof createDemoAttachments>,
  original: ReturnType<typeof provider>,
  actual = scope,
  request = input,
  signal = new AbortController().signal,
  read: import('../src/demo-result-reader.ts').DemoAttachmentRead,
) {
  try {
    const bytes = await support.snapshot(
      request.messages.flatMap<import('@omne-harness-lite/content-blocks').ContentBlock>(
        m => m.blocks,
      ),
      actual,
      read,
      signal,
    )
    return support.within(
      actual,
      () => support.transport(original.transport).plan(request, { signal }),
      read,
      bytes,
    )
  } catch {
    return { rejected: 'unavailable' } as const
  }
}
it('provides authorized fixed bytes before plan and keeps the original input', async () => {
  const read = vi.fn(async () => new Uint8Array([1, 2, 3])),
    support = createDemoAttachments(read),
    original = provider()
  await preparedPlan(support, original, scope, input, new AbortController().signal, read)
  expect(read).toHaveBeenCalledWith(scope, image.data)
  expect(original.plan.mock.calls[0]![0]).toBe(input)
  expect(original.resolved).toEqual([new Uint8Array([1, 2, 3])])
  expect(image.data).toEqual({
    storage: 'demo-results',
    key: 'confirmed-image',
    mediaType: 'image/png',
  })
})
it('public plan performs no persistent IO and refuses absent fixed bytes', async () => {
  const read = vi.fn(async () => new Uint8Array([1])),
    support = createDemoAttachments(read),
    original = provider()
  expect(
    await support.within(scope, () =>
      support.transport(original.transport).plan(input, { signal: new AbortController().signal }),
    ),
  ).toEqual({ rejected: 'unavailable' })
  expect(read).not.toHaveBeenCalled()
  expect(original.plan).not.toHaveBeenCalled()
})
it('denied snapshot reads cannot produce a model plan', async () => {
  const read = async () => undefined,
    support = createDemoAttachments(read),
    original = provider()
  expect(
    await preparedPlan(support, original, scope, input, new AbortController().signal, read),
  ).toEqual({ rejected: 'unavailable' })
  expect(original.plan).not.toHaveBeenCalled()
})
it('does not read children of a hidden tool result', async () => {
  const hidden = contentBlockFromRepresentation({
    id: 'hidden-result',
    kind: 'tool_result',
    callId: 'hidden-call',
    outcome: 'completed',
    visibility: { toHuman: true, toModel: false },
    blocks: [image],
  })
  const judged = judgeMessage({
    type: 'tool',
    id: 'hidden-message',
    callId: 'hidden-call',
    createdAt: input.messages[0]!.createdAt,
    blocks: [hidden],
  })
  if (!('ok' in judged)) throw new Error('Invalid fixture')
  const read = vi.fn(async () => new Uint8Array([1])),
    support = createDemoAttachments(read),
    original = provider()
  const request = { ...input, messages: [input.messages[0]!, judged.ok] }
  await preparedPlan(support, original, scope, request, new AbortController().signal, read)
  expect(read).toHaveBeenCalledTimes(1)
  expect(original.plan.mock.calls[0]![0]).toBe(request)
})
it('separate original readers remain separate across concurrent snapshots', async () => {
  const fallback = vi.fn(async () => new Uint8Array([9])),
    support = createDemoAttachments(fallback),
    original = provider()
  const first = vi.fn(async () => {
    await new Promise<void>(r => setTimeout(r, 5))
    return new Uint8Array([1])
  })
  const second = vi.fn(async () => new Uint8Array([2]))
  await Promise.all([
    preparedPlan(support, original, scope, input, new AbortController().signal, first),
    preparedPlan(
      support,
      original,
      { ...scope, session: 'other-session' as typeof scope.session },
      input,
      new AbortController().signal,
      second,
    ),
  ])
  expect(original.resolved).toEqual([new Uint8Array([2]), new Uint8Array([1])])
  expect(fallback).not.toHaveBeenCalled()
  expect(first).toHaveBeenCalledWith(scope, image.data)
})
it('cancellation waits for the started IO and does not start the next read', async () => {
  let release!: () => void
  const gate = new Promise<void>(r => {
    release = r
  })
  const read = vi.fn(async () => {
      await gate
      return new Uint8Array([1])
    }),
    support = createDemoAttachments(read)
  const control = new AbortController()
  let ended = false
  const job = support.snapshot([image, image], scope, read, control.signal).finally(() => {
    ended = true
  })
  const checked = expect(job).rejects.toThrow('unavailable')
  await Promise.resolve()
  control.abort()
  await Promise.resolve()
  expect(ended).toBe(false)
  expect(read).toHaveBeenCalledTimes(1)
  release()
  await checked
  expect(ended).toBe(true)
  expect(read).toHaveBeenCalledTimes(1)
})
it('outside a tool request preserves the original input and original adapter operations', async () => {
  const read = vi.fn(async () => new Uint8Array([1])),
    support = createDemoAttachments(read),
    original = provider(),
    transport = support.transport(original.transport)
  await transport.plan(input, { signal: new AbortController().signal })
  expect(original.plan).toHaveBeenCalledWith(input, expect.anything())
  expect(read).not.toHaveBeenCalled()
  expect(transport.send).toBe(original.transport.send)
  expect(transport.projectOutput).toBe(original.transport.projectOutput)
})

it('preserves the original planning input inside a tool request without external images', async () => {
  const read = vi.fn(async () => new Uint8Array([1]))
  const support = createDemoAttachments(read),
    original = provider()
  const message = judgeMessage({
    ...input.messages[0]!,
    blocks: [
      contentBlockFromRepresentation({
        kind: 'text',
        id: 'text',
        text: 'Original tool history',
        visibility: { toHuman: true, toModel: true },
      }),
    ],
  })
  if (!('ok' in message)) throw new Error('Invalid text fixture')
  const textInput = { ...input, messages: [message.ok] }
  await support.within(scope, () =>
    support.transport(original.transport).plan(textInput, { signal: new AbortController().signal }),
  )
  expect(original.plan.mock.calls[0]![0]).toBe(textInput)
  expect(read).not.toHaveBeenCalled()
})

function createdContent(blocks: readonly unknown[]) {
  return {
    kind: 'created',
    value: {
      status: 'accepted',
      input: { messages: [{ blocks }] },
      adopted: { messages: [{ blocks }] },
    },
  } as unknown as import('@omne-harness-lite/model-request-runtime-local').ModelCallContentValue
}
const binding =
  scope as unknown as import('@omne-harness-lite/model-request-runtime').SettlementLogBinding
it('custody confirms original image bytes under the original binding independently of request-local state', async () => {
  const read = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const support = createDemoAttachments(read)
  expect(await support.custody.confirm({ binding, content: createdContent([image]) })).toEqual({
    retained: true,
  })
  expect(read).toHaveBeenCalledWith(scope, image.data)
})
it('custody refuses a missing original image or a read failure', async () => {
  for (const read of [
    async () => undefined,
    async () => {
      throw new Error('read failed')
    },
  ])
    expect(
      await createDemoAttachments(read).custody.confirm({
        binding,
        content: createdContent([image]),
      }),
    ).toEqual({ unavailable: true })
})
for (const block of [
  { kind: 'file' },
  { kind: 'voice' },
  { kind: 'tool_result', offloaded: { storage: 'other' }, blocks: [] },
  { ...image, renderings: [{ blocks: [{ kind: 'image', data: image.data }] }] },
])
  it(`custody refuses unsupported external ${block.kind} content`, async () => {
    expect(
      await createDemoAttachments(async () => new Uint8Array([1])).custody.confirm({
        binding,
        content: createdContent([block]),
      }),
    ).toEqual({ unavailable: true })
  })
