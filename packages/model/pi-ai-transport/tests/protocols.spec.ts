import { isProviderEndpoint, PROTOCOLS } from '@omne-harness/pi-ai-transport'
import { expect, it } from 'vitest'

it('an interface is of one model kind and frames its reply one way', () => {
  expect(PROTOCOLS).toEqual({
    'chat-completions': { kind: 'llm', framing: 'events' },
    messages: { kind: 'llm', framing: 'events' },
    responses: { kind: 'llm', framing: 'events' },
    decisions: { kind: 'decisions', framing: 'whole' },
    'decisions-v1': { kind: 'decisions', framing: 'whole' },
    'live-sessions': { kind: 'live', framing: 'socket' },
  })
})

it('a name is an interface exactly when the table has a row of its own for it', () => {
  for (const name of Object.keys(PROTOCOLS)) expect(isProviderEndpoint(name)).toBe(true)
  for (const name of ['', 'toString', 'constructor', '__proto__', 'Decisions', 'realtime'])
    expect(isProviderEndpoint(name)).toBe(false)
})
