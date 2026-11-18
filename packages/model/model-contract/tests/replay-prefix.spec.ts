import { describe, expect, it } from 'vitest'
import { judgeMessage, type Message, type MessageId } from '@omne-harness/message'
import { projectReplay, type ReplayProjectionInput } from '@omne-harness/model-contract/provider'

const seen = { toHuman: true, toModel: true }
const hidden = { toHuman: false, toModel: true }
const SECRET = 'PAYLOAD-THAT-MUST-NOT-LEAK'
const id = (letter: string) => `msg_${letter.repeat(22)}` as MessageId

function built(value: unknown): Message {
  const judged = judgeMessage(value)
  if (!('ok' in judged)) throw new Error(`fixture message: ${JSON.stringify(judged)}`)
  return judged.ok
}
const user = (letter: string, text = 'question') =>
  built({
    id: id(letter),
    role: 'user',
    blocks: [{ kind: 'text', id: `u-${letter}`, visibility: seen, text }],
  })
function reply(letter: string, prefix?: string): Message {
  return built({
    id: id(letter),
    role: 'assistant',
    blocks: [
      { kind: 'thinking', id: `k-${letter}`, visibility: seen, text: 'thought' },
      {
        kind: 'reasoning_state',
        id: `s-${letter}`,
        visibility: hidden,
        payload: SECRET,
        pairs: [`k-${letter}`],
      },
      { kind: 'text', id: `t-${letter}`, visibility: seen, text: 'answer' },
    ],
    replay: { scope: 'A', format: 'f1', at: [1], ...(prefix === undefined ? {} : { prefix }) },
  })
}

const SYSTEM = [{ kind: 'text', text: 'You are the coding agent.' }]
const TOOLS = [{ name: 'Shell', schema: { type: 'object' } }]
function project(messages: readonly Message[], overrides: Partial<ReplayProjectionInput> = {}) {
  return projectReplay({
    messages,
    declaration: { produces: 'A', accepts: ['A'], foreignThinking: 'omit' },
    formats: new Set(['f1']),
    off: false,
    resent: new Set(),
    system: SYSTEM,
    tools: TOOLS,
    binding: 'prefix',
    ...overrides,
  })
}

// The reply as it comes back: marked with the prefix of the request that produced it.
function produced(
  history: readonly Message[],
  letter: string,
  overrides: Partial<ReplayProjectionInput> = {},
) {
  return reply(letter, project(history, overrides).prefix)
}

describe('T1 rules 6 to 9: a receiver that binds the prefix', () => {
  it('rule 6: a receiver that does not bind the prefix carries a message without a prefix', () => {
    const result = project([user('a'), reply('b')], { binding: 'none' })
    expect(result.treatments[0]).toMatchObject({ continuable: true, carry: [1] })
    expect(result.diagnostics).toEqual([])
  })

  it('rule 7: a binding receiver omits a message that recorded no prefix, and says why', () => {
    const result = project([user('a'), reply('b')])
    expect(result.treatments[0]).toMatchObject({ continuable: false, omit: [1] })
    expect(result.diagnostics).toEqual([
      { message: id('b'), scope: 'A', format: 'f1', omittedParts: 1, reason: 'no-prefix' },
    ])
  })

  it('rule 9: the same prefix carries the reasoning state back', () => {
    const history = [user('a')]
    const result = project([...history, produced(history, 'b'), user('c')])
    expect(result.treatments[0]).toMatchObject({ continuable: true, carry: [1] })
    expect(result.diagnostics).toEqual([])
  })

  it('rule 8: a changed history, system prompt, tool set or projection omits it and names which', () => {
    const history = [user('a')]
    const marked = produced(history, 'b')
    const changed = (
      messages: readonly Message[],
      overrides: Partial<ReplayProjectionInput> = {},
    ) => project(messages, overrides).diagnostics.map(item => item.reason)
    expect(changed([user('a', 'edited'), marked])).toEqual(['prefix-history'])
    expect(
      changed([...history, marked], { system: [{ kind: 'text', text: 'Another prompt.' }] }),
    ).toEqual(['prefix-system'])
    expect(changed([...history, marked], { tools: [] })).toEqual(['prefix-tools'])
    const earlier = [user('a')]
    const first = produced(earlier, 'b')
    const second = produced([...earlier, first, user('c')], 'd')
    expect(changed([...earlier, first, user('c'), second], { resent: new Set([id('b')]) })).toEqual(
      ['resent', 'prefix-projection'],
    )
  })

  it('rule 1: replay off carries nothing and says nothing; rules 3 to 5 say why', () => {
    const history = [user('a')]
    const marked = produced(history, 'b')
    const off = project([...history, marked], { off: true })
    expect(off.treatments[0]).toMatchObject({ continuable: false })
    expect(off.diagnostics).toEqual([])
    const reasons = (overrides: Partial<ReplayProjectionInput>) =>
      project([...history, marked], overrides).diagnostics.map(item => item.reason)
    expect(
      reasons({ declaration: { produces: 'B', accepts: ['B'], foreignThinking: 'omit' } }),
    ).toEqual(['scope'])
    expect(reasons({ formats: new Set(['f2']) })).toEqual(['format'])
    expect(reasons({ resent: new Set([id('b')]) })).toEqual(['resent'])
  })

  it('names the prefix of the whole request, and never the payload in a diagnostic or a prefix', () => {
    const history = [user('a')]
    const result = project([...history, reply('b')])
    expect(result.prefix).toMatch(
      /^h:[0-9a-f]{32}\.s:[0-9a-f]{32}\.t:[0-9a-f]{32}\.p:[0-9a-f]{32}$/,
    )
    expect(JSON.stringify(result.diagnostics)).not.toContain(SECRET)
    expect(project([...history, reply('b')]).prefix).toBe(result.prefix)
    expect(project([...history, reply('c')]).prefix).not.toBe(result.prefix)
  })
})

// A reply keeps its prefix in the session log, and a later release compares against it: the
// string for the same request must not change between releases.
describe('the prefix string', () => {
  it('is the same in every release for the same request', () => {
    expect(project([user('a'), reply('b'), user('c')]).prefix).toBe(
      'h:e913533a661b0ce2b41c4bdbd01d78df.s:c274d35c8e9946e67f9866c2a197d7ab.t:2a7c20ebc43f473c4724d747326ecacd.p:7b4e41276f778d509234d9de4eb58bd9',
    )
  })

  it('does not depend on the order of keys', () => {
    const turned = (value: Readonly<Record<string, unknown>>) =>
      Object.fromEntries(Object.entries(value).toReversed())
    expect(
      project([user('a')], { system: SYSTEM.map(turned), tools: TOOLS.map(turned) }).prefix,
    ).toBe(project([user('a')]).prefix)
  })

  it('tells apart values that print alike without their structure', () => {
    const prefix = (tools: unknown) => project([user('a')], { tools }).prefix
    expect(prefix([12, 3])).not.toBe(prefix([1, 23]))
    expect(prefix(['x'])).not.toBe(prefix({ 0: 'x' }))
    expect(prefix(null)).not.toBe(prefix('null'))
    expect(prefix(undefined)).toBe(prefix(null))
  })

  it('writes every digest at its full width, leading zeros included', () => {
    for (let tools = 0; tools < 256; tools += 1)
      expect(project([user('a')], { tools }).prefix).toMatch(
        /^h:[0-9a-f]{32}\.s:[0-9a-f]{32}\.t:[0-9a-f]{32}\.p:[0-9a-f]{32}$/,
      )
  })
})
