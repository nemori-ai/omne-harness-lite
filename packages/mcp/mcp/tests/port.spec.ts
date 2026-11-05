// The port adapter and the bounded wait (SPEC MC-5, MC-15): `ask` reads a throw when the port is
// called the same as a rejection, as the port's breach answer; `within` stops waiting when its
// bound fires and leaves the work, and what the work hands over late, to the task scope.
import { describe, expect, it } from 'vitest'
import { ask, within } from '../src/internal/port.ts'
import { createTaskScope } from '../src/internal/scope.ts'
import { deferred, settled } from './doubles/deferred.ts'

describe('ask', () => {
  it('passes an answer through', async () => {
    expect(await ask(() => Promise.resolve('answered'), 'breach')).toBe('answered')
  })

  it('answers the breach when the port rejects', async () => {
    expect(await ask(() => Promise.reject(new Error('down')), 'breach')).toBe('breach')
  })

  it('answers the breach when the port throws when it is called', async () => {
    const port = (): Promise<string> => {
      throw new Error('bug')
    }
    expect(await ask(port, 'breach')).toBe('breach')
  })
})

describe('within', () => {
  it('waits for the work when there is no bound', async () => {
    const scope = createTaskScope()
    expect(await within(Promise.resolve(1), undefined, scope)).toEqual({
      kind: 'answered',
      value: 1,
    })
  })

  it('answers expired at once when the bound already fired, and the scope keeps the work', async () => {
    const scope = createTaskScope()
    const work = deferred<number>()
    const bound = AbortSignal.abort()
    expect(await within(work.promise, bound, scope)).toEqual({ kind: 'expired' })
    work.reject(new Error('late bug'))
    await settled()
    expect(scope.exit()).toEqual([new Error('late bug')])
  })

  it('answers expired when the bound fires first; a late value goes to the settle taken at expiry', async () => {
    const scope = createTaskScope()
    const work = deferred<number>()
    const controller = new AbortController()
    const settledLate: number[] = []
    const taken: string[] = []
    const waited = within(work.promise, controller.signal, scope, () => {
      taken.push('at expiry')
      return async late => {
        settledLate.push(late)
      }
    })
    controller.abort()
    expect(await waited).toEqual({ kind: 'expired' })
    expect(taken).toEqual(['at expiry'])
    work.resolve(7)
    await settled()
    expect(settledLate).toEqual([7])
    expect(scope.exit()).toEqual([])
  })

  it('answers the work when it ends before the bound', async () => {
    const scope = createTaskScope()
    const controller = new AbortController()
    expect(await within(Promise.resolve('done'), controller.signal, scope)).toEqual({
      kind: 'answered',
      value: 'done',
    })
  })
})

describe('the task scope (SPEC P7)', () => {
  it('hands the errors kept so far to its exit once; an error after the exit goes to afterExit', async () => {
    const afterExit: unknown[] = []
    const scope = createTaskScope(error => afterExit.push(error))
    scope.spawn(Promise.reject(new Error('before')))
    await settled()
    expect(scope.exit()).toEqual([new Error('before')])
    expect(scope.exit()).toEqual([])
    scope.spawn(Promise.reject(new Error('after')))
    await settled()
    expect(afterExit).toEqual([new Error('after')])
    expect(scope.exit()).toEqual([])
  })
})
