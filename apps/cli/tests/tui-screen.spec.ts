import { expect, it } from 'vitest'
import { Input } from '@earendil-works/pi-tui'
import { FrameWriter, layout, safeText, type Layout } from '../src/tui/screen.ts'

const tick = () => new Promise<void>(resolve => setImmediate(resolve))
const screen = {
  identity: ['Center: local', 'Account: alice', 'Organization: org'],
  title: 'Name',
  body: ['Choose a name'],
  footer: 'Enter: continue',
  page: 0,
}
function frameSink() {
  const writes: string[] = []
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
    },
    () => {
      throw new Error('unexpected output failure')
    },
  )
  let revision = 0
  return {
    writer,
    writes,
    async render(frame: Layout) {
      writer.submit({ ...frame, revision: ++revision, delivered: () => {} })
      await tick()
    },
  }
}

it('never grants delivery to an old revision; backpressure retains only latest', async () => {
  const writes: string[] = [],
    delivered: number[] = []
  const fence = Promise.withResolvers<void>()
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
      await fence.promise
    },
    () => {},
  )
  const submit = (revision: number) =>
    writer.submit({
      revision,
      bytes: String(revision),
      delivered: () => {
        delivered.push(revision)
      },
    })
  submit(1)
  await Promise.resolve()
  for (let i = 2; i <= 1000; i++) submit(i)
  expect(writes).toEqual(['1'])
  expect(delivered).toEqual([])
  fence.resolve()
  await new Promise(resolve => setImmediate(resolve))
  expect(writes).toEqual(['1', '1000'])
  expect(delivered).toEqual([1000])
  await writer.close()
})
it('close drops unsent frames, waits actual write and suppresses late callbacks', async () => {
  const fence = Promise.withResolvers<void>(),
    writes: string[] = []
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
      await fence.promise
    },
    () => {},
  )
  writer.submit({
    revision: 1,
    bytes: 'first',
    delivered: () => {
      throw new Error('late callback')
    },
  })
  await Promise.resolve()
  writer.submit({ revision: 2, bytes: 'unsent', delivered: () => {} })
  let closed = false
  const close = writer.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  fence.resolve()
  await close
  writer.submit({ revision: 3, bytes: 'late', delivered: () => {} })
  expect(writes).toEqual(['first'])
})
it('output failure stops output and propagates a single observable failure', async () => {
  let failures = 0
  const writer = new FrameWriter(
    async () => {
      throw new Error('broken')
    },
    () => {
      failures++
    },
  )
  writer.submit({
    revision: 1,
    bytes: '',
    delivered: () => {
      throw new Error('not delivered')
    },
  })
  await new Promise(resolve => setImmediate(resolve))
  expect(writer.failed).toBe(true)
  expect(failures).toBe(1)
  await writer.close()
})
it('layout preserves full identities, paginates body and never changes private modes', () => {
  const input = new Input({ prompt: '> ' })
  input.focused = true
  input.setValue('中文🙂'.repeat(1000))
  const screen = {
    identity: ['Center: ' + 'c'.repeat(100), 'Account: alice', 'Organization: org'],
    title: 'Name',
    body: Array.from({ length: 100 }, (_, i) => `item ${i}`),
    footer: 'Enter: continue',
    input,
    page: 0,
  }
  const frame = layout(screen, 60, 16)
  expect(frame.fits).toBe(true)
  expect(frame.pages).toBeGreaterThan(1)
  expect(frame.bytes.replaceAll('\r\n', '')).toContain(screen.identity[0])
  expect(frame.bytes).not.toMatch(/\x1b\[\?\d+[hl]/)
  expect(input.getValue()).toBe('中文🙂'.repeat(1000))
  expect(layout(screen, 40, 10).fits).toBe(false)
  expect(layout(screen, Number.NaN, 30)).toEqual({ bytes: '', fits: false, page: 0, pages: 1 })
  expect(layout({ ...screen, identity: ['c'.repeat(3000)] }, 60, 16).fits).toBe(false)
  expect(safeText('\x1b[31m\u202e')).toBe('\\u001b[31m\\u202e')
})

it('clears a shortened input row and only moves the cursor for arrow keys', async () => {
  const sink = frameSink(),
    input = new Input({ prompt: '> ' })
  input.focused = true
  input.setValue('中文🙂tail')
  const first = layout({ ...screen, input }, 80, 24)
  await sink.render(first)
  input.setValue('中')
  input.handleInput('\x05')
  await sink.render(layout({ ...screen, input }, 80, 24))
  input.handleInput('\x1b[D')
  await sink.render(layout({ ...screen, input }, 80, 24))
  expect(sink.writes).toEqual([first.bytes, '\x1b[22;1H\x1b[2K> 中\x1b[22;5H', '\x1b[22;3H'])
  await sink.writer.close()
})

it('erases removed rows and restores the footer cursor when input disappears', async () => {
  const sink = frameSink(),
    input = new Input({ prompt: '> ' })
  input.focused = true
  input.setValue('private input')
  await sink.render(layout({ ...screen, input }, 80, 24))
  await sink.render(layout(screen, 80, 24))
  expect(sink.writes[1]).toBe('\x1b[22;1H\x1b[2K\x1b[23;16H')
  const hidden = layout({ ...screen, identity: ['a'.repeat(80 * 24)] }, 80, 24)
  await sink.render(hidden)
  expect(hidden.fits).toBe(false)
  expect(sink.writes[2]).toContain('\x1b[23;1H\x1b[2K')
  expect(sink.writes[2]).not.toContain('\x1b[2J')
  expect(sink.writes[2]).toMatch(/\x1b\[1;70H$/u)
  await sink.writer.close()
})

it('paints in full after dimension changes or an unstructured frame', async () => {
  const sink = frameSink()
  await sink.render(layout(screen, 80, 24))
  const narrow = layout(screen, 60, 24),
    short = layout(screen, 60, 16)
  await sink.render(narrow)
  await sink.render(short)
  await sink.render({ bytes: '\x1b[Hother output', fits: false, page: 0, pages: 1 })
  await sink.render(short)
  await sink.render(layout(screen, Number.NaN, 24))
  await sink.render(short)
  expect(sink.writes.slice(1)).toEqual([
    narrow.bytes,
    short.bytes,
    '\x1b[Hother output',
    short.bytes,
    '',
    short.bytes,
  ])
  await sink.writer.close()
})

it('compares coalesced frames against the actual completed write', async () => {
  const writes: string[] = [],
    delivered: number[] = [],
    gate = Promise.withResolvers<void>()
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
      await gate.promise
    },
    () => {},
  )
  const submit = (revision: number, body: string[]) =>
    writer.submit({
      ...layout({ ...screen, body }, 80, 24),
      revision,
      delivered: () => {
        delivered.push(revision)
      },
    })
  submit(1, ['first', 'remove me'])
  await Promise.resolve()
  submit(2, ['skipped'])
  submit(3, ['latest'])
  gate.resolve()
  await tick()
  expect(writes[1]).toBe('\x1b[6;1H\x1b[2Klatest\x1b[7;1H\x1b[2K\x1b[23;16H')
  expect(delivered).toEqual([3])
  await writer.close()
})

it('keeps the delivery fence for an unchanged screen', async () => {
  const gate = Promise.withResolvers<void>(),
    writes: string[] = [],
    delivered: number[] = []
  const writer = new FrameWriter(
    async bytes => {
      writes.push(bytes)
      if (writes.length === 2) await gate.promise
    },
    () => {},
  )
  const frame = layout(screen, 80, 24)
  const submit = (revision: number) =>
    writer.submit({
      ...frame,
      revision,
      delivered: () => {
        delivered.push(revision)
      },
    })
  submit(1)
  await tick()
  submit(2)
  await tick()
  expect(writes).toEqual([frame.bytes, ''])
  expect(delivered).toEqual([1])
  gate.resolve()
  await tick()
  expect(delivered).toEqual([1, 2])
  await writer.close()
})

it('does not grant delivery or send queued updates after a partial diff fails', async () => {
  let calls = 0,
    failures = 0
  const delivered: number[] = []
  const writer = new FrameWriter(
    async () => {
      if (++calls > 1) throw new Error('broken output')
    },
    () => {
      failures++
    },
  )
  const submit = (revision: number) =>
    writer.submit({
      ...layout({ ...screen, body: [String(revision)] }, 80, 24),
      revision,
      delivered: () => {
        delivered.push(revision)
      },
    })
  submit(1)
  await tick()
  submit(2)
  await tick()
  submit(3)
  await writer.close()
  expect(delivered).toEqual([1])
  expect(calls).toBe(2)
  expect(failures).toBe(1)
  expect(writer.failed).toBe(true)
})

it.each([false, true])(
  'repaints after a coalesced resize round trip, in flight=%s',
  async inFlight => {
    const gate = Promise.withResolvers<void>(),
      writes: string[] = []
    const writer = new FrameWriter(
      async bytes => {
        writes.push(bytes)
        if (inFlight && writes.length === 2) await gate.promise
      },
      () => {},
    )
    const initial = layout(screen, 80, 24)
    writer.submit({ ...initial, revision: 1, delivered: () => {} })
    await tick()
    if (inFlight) {
      writer.submit({
        ...layout({ ...screen, body: ['second'] }, 80, 24),
        revision: 2,
        delivered: () => {},
      })
      await tick()
    }
    writer.submit({ ...layout(screen, 60, 16), revision: 3, delivered: () => {} })
    writer.submit({ ...initial, revision: 4, delivered: () => {} })
    gate.resolve()
    await tick()
    expect(writes.at(-1)).toBe(initial.bytes)
    await writer.close()
  },
)
