import type { Principal } from '@omne-harness/access-cordis-contract'
import { guestProtocol, type GuestProtocolMade } from '@omne-harness/plugin-access'
import { bindPorts, type Port } from '@omne-harness/plugin-protocol'
import { describe, expect, it } from 'vitest'

const TEXT = { kind: 'text' } as const
const made = (handlers: GuestProtocolMade['handlers']): GuestProtocolMade => ({
  contract: {
    name: 'tidy',
    major: 1,
    operations: {
      greet: {
        effect: 'commit',
        limit: 'small',
        body: { kind: 'object', fields: { who: { rule: TEXT } } },
        result: TEXT,
      },
    },
  },
  handlers,
})

/** The ports of one call as the loader opens them: what reached the domain, and as whom. */
function world() {
  const reached: unknown[] = []
  const opened: unknown[] = []
  const bind = (principal: unknown) => {
    opened.push(principal)
    return bindPorts<unknown>(
      {
        notifications: () => caller => ({
          send: async input => {
            reached.push([caller, input])
            return { outcome: 'done', value: 'sent' }
          },
        }),
      },
      principal,
    )
  }
  return { bind, reached, opened }
}

const PRINCIPAL = 'principal-alice' as unknown as Principal
const call = { principal: PRINCIPAL, messageId: 'm-1', signal: new AbortController().signal }

describe('a protocol written by the code of a plugin', () => {
  it('becomes a protocol whose every operation is for a caller acting for a tenant, with the rules the plugin wrote', () => {
    const w = world()
    const contribution = guestProtocol(
      made({ greet: async () => ({ outcome: 'succeeded', body: 'hi' }) }),
      {
        key: 'tidy/v1',
        bind: w.bind,
      },
    )
    const { protocol } = contribution
    expect([protocol.name, protocol.major]).toEqual(['tidy', 1])
    expect(protocol.operations['greet']?.identity).toBe('acting-tenant')
    expect(protocol.operations['greet']?.body.rule).toEqual({
      kind: 'object',
      fields: { who: { rule: TEXT } },
    })
    expect(Object.keys(protocol.observations)).toEqual([])
  })

  it('each call opens the ports as its caller, hands the handler the input and the ports alone, and closes them when it returns', async () => {
    const w = world()
    let kept: Port | undefined
    const seen: unknown[] = []
    const contribution = guestProtocol(
      made({
        greet: async (...given) => {
          seen.push(given.length, Object.keys(given[1] as object))
          kept = given[1].ports['notifications']
          const sent = await kept?.['send']?.({ to: 'me' })
          return { outcome: 'succeeded', body: JSON.stringify(sent) }
        },
      }),
      { key: 'tidy/v1', bind: w.bind },
    )
    const answer = await contribution.operations['greet']?.(call, { who: 'bob' })
    expect(answer).toEqual({
      outcome: 'succeeded',
      body: JSON.stringify({ outcome: 'done', value: 'sent' }),
    })
    expect(seen).toEqual([2, ['ports']])
    expect(w.opened).toEqual([PRINCIPAL])
    expect(w.reached).toEqual([[PRINCIPAL, { to: 'me' }]])
    expect(await kept?.['send']?.({ to: 'later' })).toEqual({ outcome: 'closed' })
    expect(w.reached).toHaveLength(1)
  })

  it('a handler that throws closes its ports too, and answers as an operation whose outcome is not known', async () => {
    const w = world()
    let kept: Port | undefined
    const contribution = guestProtocol(
      made({
        greet: async (_input, { ports }) => {
          kept = ports['notifications']
          throw new Error('boom')
        },
      }),
      { key: 'tidy/v1', bind: w.bind },
    )
    expect(await contribution.operations['greet']?.(call, { who: 'bob' })).toEqual({
      outcome: 'unknown',
    })
    expect(await kept?.['send']?.({})).toEqual({ outcome: 'closed' })
  })

  it('an answer the protocol cannot give is not passed on: a read answers basis-unavailable', async () => {
    const w = world()
    const read: GuestProtocolMade = {
      contract: {
        name: 'tidy',
        major: 1,
        operations: { look: { effect: 'read', limit: 'small', body: TEXT, result: TEXT } },
      },
      handlers: { look: async () => ({ outcome: 'teapot' }) as never },
    }
    const contribution = guestProtocol(read, { key: 'tidy/v1', bind: w.bind })
    expect(await contribution.operations['look']?.(call, 'x')).toEqual({
      outcome: 'basis-unavailable',
    })
  })

  it.each([
    [
      'a key that is not the protocol',
      made({ greet: async () => ({ outcome: 'denied' }) }),
      'tidy/v2',
      'the member is at tidy/v2; the protocol it gives is tidy/v1',
    ],
    ['an operation without a handler', made({}), 'tidy/v1', 'no handler for the operation greet'],
    [
      'a handler for no operation',
      made({
        greet: async () => ({ outcome: 'denied' }),
        other: async () => ({ outcome: 'denied' }),
      }),
      'tidy/v1',
      'a handler for no operation: other',
    ],
    [
      'what is not a protocol',
      { nothing: true } as unknown as GuestProtocolMade,
      'tidy/v1',
      'a protocol is { contract, handlers }',
    ],
  ] as const)('refuses %s, saying so', (_name, given, key, reason) => {
    expect(() => guestProtocol(given, { key, bind: world().bind })).toThrow(reason)
  })

  it('refuses a rule the access contract refuses, naming the operation', () => {
    const late = { kind: 'object', fields: { who: { rule: TEXT, since: 2 } } } as never
    const bad: GuestProtocolMade = {
      contract: {
        name: 'tidy',
        major: 1,
        operations: { greet: { effect: 'read', limit: 'small', body: late, result: TEXT } },
      },
      handlers: { greet: async () => ({ outcome: 'denied' }) },
    }
    expect(() => guestProtocol(bad, { key: 'tidy/v1', bind: world().bind })).toThrow(
      'greet: field who came at revision 2 and is not optional',
    )
  })
})
