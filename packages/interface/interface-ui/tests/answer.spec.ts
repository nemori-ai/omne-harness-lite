import type { InspectionAsked, InspectionResult } from '@omne-harness/interface-protocol'
import { DEFAULT_MODE } from '@omne-harness/interface-protocol'
import { describe, expect, it } from 'vitest'
import { answerRequests, type DrawPage } from '../src/answer.ts'

const asked = (request: string): InspectionAsked => ({ request, page: 'notes', mode: DEFAULT_MODE })
const image = (width: number): InspectionResult => ({
  kind: 'image',
  bytes: new Uint8Array([width]),
  width,
  height: 1,
})

/** A stream of frames the test pushes, the way an observation hands them over. */
function frames() {
  const waiting: InspectionAsked[] = []
  let wake: (() => void) | undefined
  let ended = false
  const stream: AsyncIterator<InspectionAsked> = {
    async next() {
      while (waiting.length === 0 && !ended) await new Promise<void>(resolve => (wake = resolve))
      const value = waiting.shift()
      return value === undefined ? { done: true, value: undefined } : { done: false, value }
    },
  }
  const push = (...items: InspectionAsked[]) => {
    waiting.push(...items)
    wake?.()
  }
  const end = () => {
    ended = true
    wake?.()
  }
  return { stream, push, end }
}

const tick = () => new Promise(resolve => setTimeout(resolve, 0))

describe('answering the requests of one observation', () => {
  it('draws one page at a time, in the order the requests came, and delivers each', async () => {
    const { stream, push, end } = frames()
    const log: string[] = []
    const pending: (() => void)[] = []
    const draw: DrawPage = async ({ request }) => {
      log.push(`draw ${request}`)
      await new Promise<void>(resolve => pending.push(resolve))
      return image(request.length)
    }
    const delivered: [string, InspectionResult][] = []
    const done = answerRequests(
      stream,
      draw,
      async (request, result) => {
        delivered.push([request, result])
      },
      new AbortController().signal,
    )
    push(asked('a'), asked('bb'))
    await tick()
    expect(log).toEqual(['draw a'])
    pending.shift()?.()
    await tick()
    expect(log).toEqual(['draw a', 'draw bb'])
    pending.shift()?.()
    await tick()
    end()
    await done
    expect(delivered).toEqual([
      ['a', image(1)],
      ['bb', image(2)],
    ])
  })

  it('answers unsupported for every request when the application gives no way to draw', async () => {
    const { stream, push, end } = frames()
    const delivered: [string, InspectionResult][] = []
    const done = answerRequests(
      stream,
      undefined,
      async (request, result) => {
        delivered.push([request, result])
      },
      new AbortController().signal,
    )
    push(asked('a'), asked('b'))
    await tick()
    end()
    await done
    expect(delivered).toEqual([
      ['a', { kind: 'cannot', reason: 'unsupported' }],
      ['b', { kind: 'cannot', reason: 'unsupported' }],
    ])
  })

  it('delivers nothing for a drawing that failed, so the request runs out; the next one is still answered', async () => {
    const { stream, push, end } = frames()
    const delivered: string[] = []
    const draw: DrawPage = async ({ request }) => {
      if (request === 'a') throw new Error('the window crashed')
      return image(1)
    }
    const done = answerRequests(
      stream,
      draw,
      async request => {
        delivered.push(request)
      },
      new AbortController().signal,
    )
    push(asked('a'), asked('b'))
    await tick()
    end()
    await done
    expect(delivered).toEqual(['b'])
  })

  it('goes on after a delivery that failed', async () => {
    const { stream, push, end } = frames()
    const delivered: string[] = []
    const done = answerRequests(
      stream,
      async () => image(1),
      async request => {
        delivered.push(request)
        if (request === 'a') throw new Error('offline')
      },
      new AbortController().signal,
    )
    push(asked('a'), asked('b'))
    await tick()
    end()
    await done
    expect(delivered).toEqual(['a', 'b'])
  })

  it('once stopped, draws and delivers nothing more', async () => {
    const { stream, push } = frames()
    const stop = new AbortController()
    const drawn: string[] = []
    const delivered: string[] = []
    let release: (() => void) | undefined
    const draw: DrawPage = async ({ request }) => {
      drawn.push(request)
      await new Promise<void>(resolve => (release = resolve))
      return image(1)
    }
    const done = answerRequests(
      stream,
      draw,
      async request => {
        delivered.push(request)
      },
      stop.signal,
    )
    push(asked('a'), asked('b'))
    await tick()
    stop.abort()
    release?.()
    await done
    expect(drawn).toEqual(['a'])
    expect(delivered).toEqual([])
  })
})
