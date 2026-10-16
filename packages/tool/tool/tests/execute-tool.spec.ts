import { describe, expect, it } from 'vitest'
import type {
  ToolExecutionContext,
  ToolExecutionScope,
  ToolExecutor,
} from '@omne-harness/tool-contract'
import { executeTool } from '@omne-harness/tool'
import {
  append,
  ask,
  limits,
  manualReceiver,
  manualWaiter,
  scope,
  settled,
} from './scope-values.ts'

type Env = Readonly<{ greeting: string }>

function greeter(
  body: (context: ToolExecutionContext) => Promise<void> = async () => undefined,
): Readonly<{ executor: ToolExecutor<string, string, Env>; calls: ToolExecutionContext[] }> {
  const calls: ToolExecutionContext[] = []
  return {
    calls,
    executor: {
      execute: async (name, environment, execution) => {
        calls.push(execution)
        await body(execution)
        return `${environment.greeting}, ${name}`
      },
    },
  }
}

describe('2 executeTool checks the scope first', () => {
  it('2 executeTool: runs the author with the scope context and returns R after finish', async () => {
    const { scope: s } = scope()
    const { executor, calls } = greeter()
    expect(await executeTool('world', executor, { greeting: 'hello' }, s)).toEqual({
      ok: 'hello, world',
    })
    expect(calls).toEqual([s.context])
    const again = await s.finish('failed')
    expect('failure' in again && again.failure.kind).toBe('conflict')
  })

  it('2 executeTool: refuses a scope that is not independent or has bad limits without calling the author', async () => {
    const { scope: s } = scope()
    const { executor, calls } = greeter()
    const managed: ToolExecutionScope = {
      context: { ...s.context, mode: 'managed', emit: s.context.emit, wait: s.context.wait },
      limits: s.limits,
      finish: exit => s.finish(exit),
    }
    expect(await executeTool('world', executor, { greeting: 'hello' }, managed)).toEqual({
      failure: { reason: 'the scope context is not independent', effect: 'not-started' },
    })
    const zero: ToolExecutionScope = {
      context: s.context,
      limits: limits({ authorBufferItems: 0 }),
      finish: exit => s.finish(exit),
    }
    expect(await executeTool('world', executor, { greeting: 'hello' }, zero)).toEqual({
      failure: { reason: 'limits.authorBufferItems: range', effect: 'not-started' },
    })
    expect(calls).toEqual([])
    expect(await s.finish('returned')).toEqual({ ok: undefined })
  })
})

describe('8 executeTool settles the scope', () => {
  it('8 executeTool: a throwing author settles as failed with effect unknown', async () => {
    const { scope: s } = scope()
    const { executor } = greeter(() => Promise.reject(new TypeError('boom')))
    expect(await executeTool('world', executor, { greeting: 'hello' }, s)).toEqual({
      failure: { reason: 'TypeError: boom', effect: 'unknown' },
    })
    const other = await s.finish('returned')
    expect('failure' in other && other.failure.kind).toBe('conflict')
    expect(await s.finish('failed')).toEqual({ ok: undefined })
  })

  it('8 executeTool: a returned finish that fails is a failure with effect unknown, not a success', async () => {
    const waiter = manualWaiter()
    const { scope: s } = scope({ waits: waiter.waits })
    const { executor } = greeter(async context => {
      // A helper opens a wait and the author returns without awaiting it: an author protocol error.
      void context.wait(ask('confirm'))
      await settled()
    })
    expect(await executeTool('world', executor, { greeting: 'hello' }, s)).toEqual({
      failure: { reason: 'invalid: the author returned with wait confirm open', effect: 'unknown' },
    })
    const cancelled = scope()
    const { executor: aborting } = greeter(async () => {
      cancelled.controller.abort()
    })
    expect(await executeTool('world', aborting, { greeting: 'hello' }, cancelled.scope)).toEqual({
      failure: { reason: 'cancelled: the execution was cancelled', effect: 'unknown' },
    })
  })

  it('8 executeTool: R is returned only after the return barrier holds', async () => {
    const { receiver, release } = manualReceiver()
    const { scope: s } = scope({ process: receiver })
    const { executor } = greeter(async context => {
      void context.emit(append('log', 'working'))
    })
    let result: unknown = null
    const running = executeTool('world', executor, { greeting: 'hello' }, s).then(outcome => {
      result = outcome
      return outcome
    })
    await settled()
    expect(result).toBeNull()
    release('1')
    expect(await running).toEqual({ ok: 'hello, world' })
  })
})
