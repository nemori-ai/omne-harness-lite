import { describe, expect, it } from 'vitest'
import { succeed, fail } from '@omne-harness/operation-result'
import { toolsCapabilityOf, type ToolsCapability } from '@omne-harness/tool-contract'
import {
  attachToolsCapability,
  type ToolExecutionScope,
} from '@omne-harness/tool-contract/provider'

const limits = {
  authorBufferBytes: 1024,
  authorBufferItems: 4,
  authorWaitHistoryBytes: 1024,
  authorWaitHistoryItems: 4,
}
const capability: ToolsCapability = {
  search: async () => succeed({ entries: [], next: null }),
  inspect: async () => fail({ kind: 'denied', action: 'inspect' }),
  execute: async () => ({ kind: 'rejected', failure: { kind: 'denied', action: 'admit' } }),
  readResult: async () => ({
    content: [],
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  }),
}
function scope(finish: ToolExecutionScope['finish']): ToolExecutionScope {
  return {
    limits,
    context: {
      mode: 'managed',
      signal: new AbortController().signal,
      body: {
        begin: async () => fail({ kind: 'closed', reason: 'fixture' }),
        append: async () => fail({ kind: 'closed', reason: 'fixture' }),
        seal: async () => fail({ kind: 'closed', reason: 'fixture' }),
        inspect: async () => fail({ kind: 'closed', reason: 'fixture' }),
      },
      emit: async () => fail({ kind: 'closed', reason: 'fixture' }),
      wait: async () => fail({ kind: 'closed', reason: 'fixture' }),
    },
    finish,
  }
}
describe('provider Tools capability attachment', () => {
  it('belongs only to the new context and is removed when finish starts', async () => {
    const order: string[] = []
    let release: (() => void) | undefined
    const closing = new Promise<void>(resolve => {
      release = resolve
    })
    const original = scope(async () => {
      order.push('finish')
      return succeed(undefined)
    })
    const attached = attachToolsCapability(original, {
      value: capability,
      close: async () => {
        order.push('close')
        await closing
      },
    })
    expect(attached.context).not.toBe(original.context)
    expect(toolsCapabilityOf(original.context)).toBeUndefined()
    expect(toolsCapabilityOf(attached.context)).toBe(capability)
    expect(attached.context.signal).toBe(original.context.signal)
    expect(attached.context.body).toBe(original.context.body)
    const first = attached.finish('returned')
    expect(toolsCapabilityOf(attached.context)).toBeUndefined()
    expect(attached.finish('failed')).toBe(first)
    expect(order).toEqual(['close'])
    release?.()
    await expect(first).resolves.toEqual(succeed(undefined))
    expect(order).toEqual(['close', 'finish'])
  })
  it('runs original cleanup and preserves both failures when capability close fails', async () => {
    const first = new Error('close failure'),
      second = new Error('finish failure')
    let finished = 0
    const attached = attachToolsCapability(
      scope(async () => {
        finished++
        throw second
      }),
      {
        value: capability,
        close: async () => {
          throw first
        },
      },
    )
    await expect(attached.finish('failed')).rejects.toMatchObject({ errors: [first, second] })
    expect(finished).toBe(1)
    expect(toolsCapabilityOf(attached.context)).toBeUndefined()
  })
})
