import {
  bindPorts,
  type Port,
  type PortAnswer,
  type PortFactory,
} from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'

type Caller = Readonly<{ principal: string; tenant: string }>

const CALLER: Caller = { principal: 'p-alice', tenant: 'alice' }

/** A port whose domain answers with what it was given and whom it was given by. */
function echoes(seen: unknown[]): PortFactory<Caller> {
  return caller => ({
    send: async input => {
      seen.push([caller, input])
      return { outcome: 'done', value: { got: input, tenant: caller.tenant } }
    },
  })
}

describe('the ports of one call', () => {
  it('each method reaches the domain with the caller of the call, and answers what the domain answered', async () => {
    const seen: unknown[] = []
    const bound = bindPorts({ notifications: () => echoes(seen) }, CALLER)
    expect(await bound.ports['notifications']?.['send']?.({ title: 'hi' })).toEqual({
      outcome: 'done',
      value: { got: { title: 'hi' }, tenant: 'alice' },
    })
    expect(seen).toEqual([[CALLER, { title: 'hi' }]])
  })

  it('once closed, every method answers closed and the domain is not called', async () => {
    const seen: unknown[] = []
    const bound = bindPorts({ notifications: () => echoes(seen) }, CALLER)
    const kept = bound.ports['notifications']
    bound.close()
    expect(await kept?.['send']?.({ title: 'later' })).toEqual({ outcome: 'closed' })
    expect(seen).toEqual([])
  })

  it('a port whose owner is not there now answers unavailable, and the binding stays open', async () => {
    let there = false
    const seen: unknown[] = []
    const bound = bindPorts({ notifications: () => (there ? echoes(seen) : undefined) }, CALLER)
    expect(await bound.ports['notifications']?.['send']?.({})).toEqual({
      outcome: 'unavailable',
      reason: 'notifications is not there now',
    })
    there = true
    expect((await bound.ports['notifications']?.['send']?.({}))?.outcome).toBe('done')
  })

  it('only data crosses: a function or an object that is not plain is refused before the domain', async () => {
    const seen: unknown[] = []
    const send = bindPorts({ notifications: () => echoes(seen) }, CALLER).ports['notifications']?.[
      'send'
    ]
    const notData = [() => 1, { at: new Date(0) }, { deep: [Number.NaN] }, { big: 1n }]
    for (const input of notData)
      expect(await send?.(input as never)).toEqual({
        outcome: 'refused',
        reason: 'the input is not data',
      })
    expect(seen).toEqual([])
  })

  it('what the plugin is handed is a copy: it cannot change what the domain keeps, nor the domain what it holds', async () => {
    const kept: { tags: string[] }[] = []
    const bound = bindPorts<Caller>(
      {
        store: () => () => ({
          put: async input => {
            kept.push(input as { tags: string[] })
            return { outcome: 'done', value: kept[0] ?? null }
          },
        }),
      },
      CALLER,
    )
    const input = { tags: ['a'] }
    const answer = await bound.ports['store']?.['put']?.(input)
    input.tags.push('b')
    expect(kept[0]).toEqual({ tags: ['a'] })
    if (answer?.outcome !== 'done') throw new Error('not done')
    ;(answer.value as { tags: string[] }).tags.push('c')
    expect(kept[0]).toEqual({ tags: ['a'] })
  })

  it('a domain that throws answers unavailable with what it said; a method it does not have is refused', async () => {
    const bound = bindPorts<Caller>(
      {
        broken: () => () => ({
          go: async () => {
            throw new Error('down')
          },
        }),
      },
      CALLER,
    )
    expect(await bound.ports['broken']?.['go']?.(null)).toEqual({
      outcome: 'unavailable',
      reason: 'down',
    })
    expect(await bound.ports['broken']?.['missing']?.(null)).toEqual({
      outcome: 'refused',
      reason: 'broken has no method missing',
    })
  })

  it('a factory that throws answers unavailable; an answer that is not done reaches the plugin as a copy', async () => {
    const kept = { outcome: 'refused', reason: 'no' } as const
    const bound = bindPorts<Caller>(
      {
        throws: () => () => {
          throw new Error('cannot make')
        },
        refuses: () => () => ({ go: async () => kept }),
      },
      CALLER,
    )
    expect(await bound.ports['throws']?.['go']?.(null)).toEqual({
      outcome: 'unavailable',
      reason: 'cannot make',
    })
    const answer = await bound.ports['refuses']?.['go']?.(null)
    expect(answer).toEqual(kept)
    expect(answer).not.toBe(kept)
  })

  it('carries every kind of data: true, a number, null, nested lists, an object with no prototype', async () => {
    const seen: unknown[] = []
    const send = bindPorts({ notifications: () => echoes(seen) }, CALLER).ports['notifications']?.[
      'send'
    ]
    const bare = Object.assign(Object.create(null) as Record<string, unknown>, {
      at: [1, [false, null]],
    })
    for (const input of [true, 0, -2.5, null, [1, ['a']], bare]) await send?.(input as never)
    expect(seen.map(([, input]) => input)).toEqual([
      true,
      0,
      -2.5,
      null,
      [1, ['a']],
      { at: [1, [false, null]] },
    ])
    expect(await send?.(Number.POSITIVE_INFINITY)).toEqual({
      outcome: 'refused',
      reason: 'the input is not data',
    })
  })

  it('what a domain answers reaches the plugin as that answer: unavailable, unknown and closed as they are, done with what is not data as unavailable', async () => {
    const answering = (answer: PortAnswer) =>
      bindPorts<Caller>({ said: () => () => ({ go: async () => answer }) }, CALLER).ports['said']?.[
        'go'
      ]?.(null)
    expect(await answering({ outcome: 'unavailable', reason: 'down' })).toEqual({
      outcome: 'unavailable',
      reason: 'down',
    })
    expect(await answering({ outcome: 'unknown' })).toEqual({ outcome: 'unknown' })
    expect(await answering({ outcome: 'closed' })).toEqual({ outcome: 'closed' })
    expect(await answering({ outcome: 'done', value: new Date(0) as never })).toEqual({
      outcome: 'unavailable',
      reason: 'said answered what is not data',
    })
  })

  it('the ports and their methods are frozen; there is no port the call was not bound with', () => {
    const bound = bindPorts({ notifications: () => echoes([]) }, CALLER)
    expect(Object.isFrozen(bound.ports)).toBe(true)
    expect(bound.ports['storage']).toBeUndefined()
    expect(Object.keys(bound.ports)).toEqual(['notifications'])
  })

  it('a port takes one piece of data: a method written with a tenant beside it is not a port', () => {
    const answer: PortAnswer = { outcome: 'closed' }
    // @ts-expect-error a port method takes the input alone; there is no place for a tenant
    const withTenant: Port = { send: async (_tenant: string, _input: unknown) => answer }
    expect(withTenant).toBeDefined()
  })
})
