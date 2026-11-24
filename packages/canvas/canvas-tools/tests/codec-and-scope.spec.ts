import { describe, expect, it } from 'vitest'
import {
  attachCanvas,
  canvasCommandNames,
  canvasContract,
  canvasOf,
  canvasParameterCodec,
  type BoundCanvas,
} from '@omne-harness/canvas-tools'
import { writeJsonText } from '@omne-harness/json-text'
import type { ToolExecutionScope } from '@omne-harness/tool-contract/provider'
import { caller, media } from './world.ts'

const whole = (text: string) => ({ original: text, effective: text, complete: true }) as never

describe('the parameters of a command', () => {
  it.each(canvasCommandNames)('of %s carry no field the model is told not to send', name => {
    expect(writeJsonText(canvasContract(name).schema)).not.toContain('readOnly')
  })

  it('names the field of each problem, and the problems of the whole command without one', () => {
    const parsed = canvasParameterCodec('place').parse(
      whole(JSON.stringify({ reference: { kind: 7, ref: 'a' }, zoom: 2 })),
    )
    if (!('failure' in parsed)) throw new Error('parsed')
    expect(parsed.failure.kind).toBe('invalid')
    const problems = parsed.failure.reason.split('; ')
    expect(problems).toHaveLength(2)
    expect(problems.find(problem => problem.startsWith('reference.kind: '))).toBeDefined()
    expect(problems.find(problem => /^Unrecognized key/u.test(problem))).toBeDefined()
  })

  it('answers params that are not bounded JSON as a failure, without throwing', () => {
    const deep = `${'['.repeat(40)}${']'.repeat(40)}`
    for (const input of [whole(deep), whole('{'), { complete: false } as never]) {
      const parsed = canvasParameterCodec('look').parse(input)
      expect('failure' in parsed).toBe(true)
    }
  })
})

describe('a canvas that is not there for the call', () => {
  it('says so in words, for a read and a write', async () => {
    const agent = caller(undefined)
    for (const [command, params] of [
      ['look', {}],
      ['place', { reference: media('a') }],
    ] as const)
      expect((await agent.failure(command, params)).reason).toBe(
        'basis-unavailable: the canvas is not available now; nothing was changed. Try again later.',
      )
  })
})

describe('the canvas attached to a call', () => {
  const bound = (): BoundCanvas => ({ reach: async () => ({ unreachable: 'unavailable' }) })

  function scope() {
    const finished: string[] = []
    const given: ToolExecutionScope = {
      context: { signal: new AbortController().signal } as never,
      limits: {} as never,
      finish: async exit => {
        finished.push(exit)
        return { ok: undefined } as never
      },
    }
    return { given, finished }
  }

  it('is found from the call while it runs, and gone once it finishes, which finishes the call once', async () => {
    const { given, finished } = scope()
    const canvas = bound()
    const attached = attachCanvas(given, canvas)
    expect(canvasOf(attached.context)).toBe(canvas)
    const first = attached.finish('returned')
    const second = attached.finish('failed')
    expect(second).toBe(first)
    await first
    expect(finished).toEqual(['returned'])
    expect(canvasOf(attached.context)).toBeUndefined()
  })

  it('a finish of an earlier attachment leaves a later one on the same call', async () => {
    const { given } = scope()
    const earlier = attachCanvas(given, bound())
    const later = bound()
    attachCanvas(given, later)
    await earlier.finish('returned')
    expect(canvasOf(given.context)).toBe(later)
  })
})
