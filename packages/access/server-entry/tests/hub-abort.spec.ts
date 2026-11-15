import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FrameSource } from '@omne-harness/access-cordis-contract'
import { createObservationHub, type HubOpen } from '../src/observation-hub/hub.ts'
import type { Entered } from '../src/registry/registry.ts'
import { holdResponse, type HeldResponse } from './support/held-response.ts'
import { manualClock } from './support/manual-clock.ts'
import { pipelineNotesProtocol } from './support/test-contribution.ts'

const contract = pipelineNotesProtocol().observations['watch-note']
const NEVER_MS = 1_000_000_000
const LIMITS = {
  maxBytes: 65_536,
  maxDepth: 16,
  maxItems: 1_024,
  maxMembers: 64,
  maxStringLength: 1_024,
  maxNumberLength: 32,
}
const NOTE = { noteId: 'n-1', title: 'first note' }
const NOTE_TEXT = 'data: {"kind":"frame","frame":{"noteId":"n-1","title":"first note"}}\n\n'
const ENDED_UNAVAILABLE = 'data: {"kind":"ended","reason":"unavailable"}\n\n'

class FakeSignal extends EventTarget {
  aborted = false
}

type Feed = {
  readonly frames: AsyncGenerator<unknown, unknown>
  readonly push: (frame: unknown) => void
  readonly finish: (reason: string) => void
  readonly sourceSignal: () => AbortSignal | undefined
  readonly source: FrameSource<never>
}

function feed(beforeReturn: () => void = () => {}): Feed {
  const items: ({ frame: unknown } | { end: string })[] = []
  let wake: (() => void) | undefined
  let sourceSignal: AbortSignal | undefined
  const put = (item: (typeof items)[number]): void => {
    items.push(item)
    wake?.()
    wake = undefined
  }
  async function* frames(): AsyncGenerator<unknown, unknown> {
    for (;;) {
      while (items.length === 0) await new Promise<void>(resolve => (wake = resolve))
      const item = items.shift()!
      if ('end' in item) return item.end
      yield item.frame
    }
  }
  const generator = frames()
  return {
    frames: generator,
    push: frame => put({ frame }),
    finish: end => put({ end }),
    sourceSignal: () => sourceSignal,
    source: (async context => {
      sourceSignal = context.signal
      context.signal.addEventListener('abort', () => put({ end: 'unavailable' }))
      beforeReturn()
      return { outcome: 'succeeded', frames: generator }
    }) as FrameSource<never>,
  }
}

type Run = {
  readonly held: HeldResponse
  readonly done: Promise<void>
  readonly left: () => number
}

const responses: HeldResponse[] = []
afterEach(async () => {
  await Promise.all(responses.splice(0).map(held => held.dispose()))
})

async function run(signal: AbortSignal, source: FrameSource<never>): Promise<Run> {
  const held = await holdResponse()
  responses.push(held)
  let leaves = 0
  const hub = createObservationHub({
    limits: { perLogin: 8, perInstance: 8 },
    heartbeatMs: NEVER_MS,
    loginCheckIntervalMs: NEVER_MS,
    frameQueueBytes: 1 << 20,
    graceMs: 1000,
    clock: manualClock(),
    writeLimits: LIMITS,
  })
  const entered = {
    member: { kind: 'observation', contract, source },
    signal,
    leave: () => {
      leaves += 1
    },
  } as unknown as Entered
  const input: HubOpen = {
    entered,
    contract,
    source: source as never,
    principal: {},
    messageId: 'm-1',
    open: { noteId: 'n-1' },
    key: 'k',
    note: () => {},
    res: held.res,
  }
  return { held, done: hub.open(input), left: () => leaves }
}

const turn = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

describe('the abort of the entry reaches an observation at each moment', () => {
  it('ends with unavailable at once when the abort came after the frame source decided, before the stream attached', async () => {
    const signal = new FakeSignal()
    const { source, sourceSignal } = feed(() => {
      signal.aborted = true
    })
    const { held, done, left } = await run(signal as unknown as AbortSignal, source)
    await done
    await held.ended
    expect(held.received()).toBe(ENDED_UNAVAILABLE)
    expect(sourceSignal()?.aborted).toBe(true)
    expect(left()).toBe(1)
  })

  it('ends with unavailable when the abort comes while frames are flowing, after the frames already written', async () => {
    const controller = new AbortController()
    const { source, push, sourceSignal } = feed()
    const { held, done, left } = await run(controller.signal, source)
    push(NOTE)
    await turn()
    await turn()
    controller.abort()
    await done
    await held.ended
    expect(held.received()).toBe(NOTE_TEXT + ENDED_UNAVAILABLE)
    expect(sourceSignal()?.aborted).toBe(true)
    expect(left()).toBe(1)
  })

  it('stops listening to the abort once the observation is over, and writes nothing after it', async () => {
    const controller = new AbortController()
    const added: unknown[] = []
    const removed: unknown[] = []
    const addEventListener = controller.signal.addEventListener.bind(controller.signal)
    const removeEventListener = controller.signal.removeEventListener.bind(controller.signal)
    vi.spyOn(controller.signal, 'addEventListener').mockImplementation((type, handler, options) => {
      if (type === 'abort') added.push(handler)
      addEventListener(type, handler, options)
    })
    vi.spyOn(controller.signal, 'removeEventListener').mockImplementation(
      (type, handler, options) => {
        if (type === 'abort') removed.push(handler)
        removeEventListener(type, handler, options)
      },
    )
    const { source, push, finish } = feed()
    const { held, done, left } = await run(controller.signal, source)
    push(NOTE)
    finish('note-deleted')
    await done
    await held.ended
    expect(left()).toBe(1)
    expect(added.length).toBeGreaterThan(0)
    expect(new Set(removed)).toEqual(new Set(added))
    controller.abort()
    await turn()
    expect(held.received()).toBe(NOTE_TEXT + 'data: {"kind":"ended","reason":"note-deleted"}\n\n')
  })
})
