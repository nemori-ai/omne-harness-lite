// The port answers the coordinator treats as a dependency wait (Agent SPEC 依赖不可用时的等待):
// only failures a port answered are noted. Production ports are frozen objects, so the noting
// wrapper must work over them too.
import { describe, expect, it } from 'vitest'
import type { Failure } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { answeredByPort, notingPorts } from '../src/loop/port-answers.ts'

const down: Failure = { kind: 'unavailable', owner: 'port', diagnostic: 'down' }

describe('notingPorts', () => {
  it('notes a failure a frozen port answers, through nested objects, and keeps its keys', async () => {
    const port = Object.freeze({
      calls: Object.freeze({ admit: () => Promise.resolve(fail(down)) }),
      read: () => succeed(1),
    })
    const noted = notingPorts(port)
    const answer = await noted.calls.admit()
    expect(answer).toEqual(fail(down))
    expect('failure' in answer && answeredByPort(answer.failure)).toBe(true)
    expect(noted.read()).toEqual(succeed(1))
    expect(Object.keys({ ...noted })).toEqual(['calls', 'read'])
  })

  it('passes through a method that answers nothing or a value without a failure, and wraps each port once', () => {
    const port = Object.freeze({
      report: () => undefined,
      read: () => succeed({ failure: 'not an outcome failure' }),
      nested: Object.freeze({ value: 1 }),
    })
    const noted = notingPorts(port)
    expect(noted.report()).toBe(undefined)
    expect(noted.read()).toEqual(succeed({ failure: 'not an outcome failure' }))
    expect(notingPorts(port)).toBe(noted)
    expect('nested' in noted && !('missing' in noted)).toBe(true)
    expect(Object.getPrototypeOf(noted)).toBe(Object.getPrototypeOf(port))
    expect(Object.getOwnPropertyDescriptor(noted, 'missing')).toBe(undefined)
  })

  it('reaches and notes a method under a callable namespace, as the stage port of the host gives it', async () => {
    // The host hands the loop a port whose every member is a callable proxy: it reads its provider
    // at each call and cannot tell a namespace from a method. `commands` is callable here too.
    const provider = {
      commands: {
        control: (reason: string) => Promise.resolve(fail({ ...down, diagnostic: reason })),
      },
    }
    const at = (path: readonly string[]): unknown =>
      new Proxy(function member() {}, {
        get: (_target, key) => (typeof key === 'string' ? at([...path, key]) : undefined),
        apply: (_target, _receiver, args: unknown[]) => {
          const member = path.reduce<unknown>(
            (owner, step) => Reflect.get(Object(owner), step),
            provider,
          )
          return Reflect.apply(member as (...given: unknown[]) => unknown, undefined, args)
        },
      })
    const noted = notingPorts(at([]) as typeof provider)
    const answer = await noted.commands.control('stopped')
    expect(answer).toEqual(fail({ ...down, diagnostic: 'stopped' }))
    expect('failure' in answer && answeredByPort(answer.failure)).toBe(true)
  })

  it('notes the answer of a method that the caller bound or applied', async () => {
    const port = Object.freeze({ admit: () => Promise.resolve(fail(down)) })
    const noted = notingPorts(port)
    for (const answer of [await noted.admit.bind(noted)(), await noted.admit.call(noted)])
      expect('failure' in answer && answeredByPort(answer.failure)).toBe(true)
  })

  it('does not note a failure that no port answered', () => {
    expect(answeredByPort({ kind: 'unavailable', owner: 'evaluator', diagnostic: 'stop' })).toBe(
      false,
    )
  })
})
