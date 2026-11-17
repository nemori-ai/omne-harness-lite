import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fail, succeed } from '@omne-harness/operation-result'
import type { ToolBodyWriter } from '@omne-harness/tool-contract'
import { OutputStage } from '../src/shell-staging.ts'
import { textBody } from '../src/returns.ts'

type Write = Readonly<{ kind: string; detail: unknown }>

function recordingWriter(failAt: string | null = null) {
  const writes: Write[] = []
  const custody = { owner: 'test', record: 'r', revision: '1', digest: 'd' }
  const writer: ToolBodyWriter = {
    begin: async (key, representation) => {
      writes.push({ kind: 'begin', detail: { key, representation } })
      return failAt === 'begin'
        ? fail({ kind: 'unavailable', dependency: 'body-store', diagnostic: 'down' } as never)
        : succeed({ key, nextSequence: '1', custody })
    },
    append: async (key, sequence, frame) => {
      writes.push({ kind: 'append', detail: { key, sequence, frame } })
      return failAt === `append-${sequence}`
        ? fail({ kind: 'unavailable', dependency: 'body-store', diagnostic: 'down' } as never)
        : succeed({ nextSequence: String(Number(sequence) + 1), custody })
    },
    seal: async (key, afterSequence) => {
      writes.push({ kind: 'seal', detail: { key, afterSequence } })
      return succeed({
        source: {} as never,
        bodyId: 'b' as never,
        representation: textBody,
        bodyBytes: '0',
        custody,
      })
    },
    inspect: async () => fail({ kind: 'unavailable' } as never),
  }
  return { writer, writes }
}

const stage = (writer: ToolBodyWriter, maxBytes = 1024) =>
  new OutputStage({ writer, representation: textBody, startAfterMs: 5000, batchMs: 1000, maxBytes })

const texts = (writes: readonly Write[]) =>
  writes.flatMap(write =>
    write.kind === 'append'
      ? [(write.detail as { frame: { text: string; end: boolean } }).frame]
      : [],
  )

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('staging the running output of one execution (C9)', () => {
  it('writes nothing for an execution shorter than the start', async () => {
    const { writer, writes } = recordingWriter()
    const s = stage(writer)
    s.observe('quick')
    await vi.advanceTimersByTimeAsync(4999)
    expect(await s.finish()).toBe('')
    expect(writes).toEqual([])
  })

  it('backfills at the start, appends in batches, and seals at the end', async () => {
    const { writer, writes } = recordingWriter()
    const s = stage(writer)
    s.observe('early ')
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes.map(write => write.kind)).toEqual(['begin', 'append'])
    s.observe('a')
    s.observe('b')
    await vi.advanceTimersByTimeAsync(1000)
    s.observe('c')
    expect(await s.finish()).toBe('output_body=sealed\n')
    expect(texts(writes)).toEqual([
      { kind: 'text', block: 'output', text: 'early ', end: false },
      { kind: 'text', block: 'output', text: 'ab', end: false },
      { kind: 'text', block: 'output', text: 'c', end: true },
    ])
    expect(writes.at(-1)).toEqual({ kind: 'seal', detail: { key: 'output', afterSequence: '3' } })
    expect(writes[0]).toEqual({
      kind: 'begin',
      detail: { key: 'output', representation: textBody },
    })
  })

  it('stops staging when a write fails, and the line says the body is incomplete', async () => {
    const { writer, writes } = recordingWriter('append-2')
    const s = stage(writer)
    s.observe('one')
    await vi.advanceTimersByTimeAsync(5000)
    s.observe('two')
    await vi.advanceTimersByTimeAsync(1000)
    s.observe('three')
    await vi.advanceTimersByTimeAsync(1000)
    expect(await s.finish()).toBe('output_body=incomplete reason=append_unavailable\n')
    expect(writes.map(write => write.kind)).toEqual(['begin', 'append', 'append'])
  })

  it('writes at most the bound and counts what it drops, without splitting a character', async () => {
    const { writer, writes } = recordingWriter()
    const s = stage(writer, 4)
    s.observe('ab日c')
    await vi.advanceTimersByTimeAsync(5000)
    s.observe('more')
    expect(await s.finish()).toBe('output_body=sealed dropped_bytes=8\n')
    expect(texts(writes).map(frame => frame.text)).toEqual(['ab', ''])
  })
})
