import { expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import { type ToolOffloadedBody, type ToolResult } from '@omne-harness/tool-contract'
import {
  decodeToolBodyId,
  decodeToolInstant,
  decodeToolRevision,
  type ToolMessageContentBlock,
} from '@omne-harness/tool-contract/provider'
import { adoption } from '../coordinator-values.ts'
import { fixture, ok } from './fixture.ts'

async function withOffloadedDeliveryPorts() {
  const f = await fixture()
  const description: ToolOffloadedBody = {
    source: {
      storage: 'fixture',
      key: 'body',
      mediaType: 'text/plain',
      bytes: '1000',
      digest: `sha256:${'a'.repeat(64)}`,
    },
    bodyId: ok(decodeToolBodyId('body-original')),
    representation: { kind: 'text', codec: adoption('text-codec') },
    bodyBytes: '1000',
    previewKind: 'mechanical',
    retention: {
      adoption: adoption('retention'),
      activatedAt: ok(decodeToolInstant('2026-11-08T00:00:00.000Z')),
      expiresAt: ok(decodeToolInstant('2026-11-09T00:00:00.000Z')),
    },
  }
  const rendered = {
    ...f.value,
    original: { kind: 'offloaded' as const, source: description.source, summary: f.value.content },
  }
  const value: ToolResult<ToolMessageContentBlock> = {
    ...rendered,
    original: { ...rendered.original, ...description },
  }
  const read = await f.store.read(f.domain)
  if (read.kind !== 'complete') throw new Error('missing fixture call')
  await f.store.commit({
    domain: f.domain,
    expected: read.revision,
    revision: ok(decodeToolRevision(String(BigInt(read.revision) + 1n))),
    writes: [
      {
        kind: 'put',
        record: {
          kind: 'result',
          result: {
            ...f.result,
            value: {
              ...f.result.value,
              original: { kind: 'offloaded', summary: f.result.value.content, ...description },
            },
          },
        },
      },
    ],
  })
  vi.mocked(f.input.resultDelivery.read).mockResolvedValue(succeed(value))
  return { ...f, value }
}

it.each([
  'bodyId',
  'representation',
  'bodyBytes',
  'previewKind',
  'activatedAt',
  'expiresAt',
] as const)(
  'rejects changed committed %s even when rendered channels are unchanged',
  async field => {
    const f = await withOffloadedDeliveryPorts()
    vi.mocked(f.receiver.push).mockResolvedValueOnce(fail({ kind: 'outcome-unknown' }))
    expect(await f.drive()).toEqual(succeed({ pending: 1 }))
    expect(f.receiver.push).toHaveBeenCalledTimes(1)
    const original = f.value.original
    if (original.kind !== 'offloaded') throw new Error('missing offloaded fixture')
    const changed = {
      ...original,
      ...(field === 'bodyId' ? { bodyId: ok(decodeToolBodyId('other-body')) } : {}),
      ...(field === 'representation'
        ? { representation: { kind: 'text' as const, codec: adoption('other-codec') } }
        : {}),
      ...(field === 'bodyBytes' ? { bodyBytes: '1001' } : {}),
      ...(field === 'previewKind' ? { previewKind: 'author-summary' as const } : {}),
      retention: {
        ...original.retention,
        ...(field === 'activatedAt'
          ? { activatedAt: ok(decodeToolInstant('2026-11-08T00:00:01.000Z')) }
          : {}),
        ...(field === 'expiresAt'
          ? { expiresAt: ok(decodeToolInstant('2026-11-10T00:00:00.000Z')) }
          : {}),
      },
    }
    vi.mocked(f.input.resultDelivery.read).mockResolvedValue(
      succeed({ ...f.value, original: changed }),
    )
    expect(await f.drive()).toEqual(succeed({ pending: 1 }))
    expect(f.receiver.push).toHaveBeenCalledTimes(1)
    expect(f.input.commands.releaseDelivery).not.toHaveBeenCalled()
  },
)
