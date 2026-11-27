import { describe, expect, it } from 'vitest'
import { declaresEvents, readEventType } from '@omne-harness/mcp-contract'
import { json } from './json.ts'

const typeOf = (overrides: Record<string, unknown> = {}) =>
  json({
    name: 'incident.created',
    description: 'An incident was opened.',
    delivery: ['poll', 'push'],
    inputSchema: { type: 'object', properties: { service: { type: 'string' } } },
    payloadSchema: { type: 'object' },
    ...overrides,
  })

describe('reading an event type (C301)', () => {
  it('takes the name, the description as the peer wrote it, the delivery modes once each and both schemas', () => {
    const read = readEventType(typeOf({ delivery: ['push', 'poll', 'push'] }))
    expect(read).toEqual({
      ok: {
        name: 'incident.created',
        description: { untrusted: 'An incident was opened.' },
        delivery: ['push', 'poll'],
        inputSchema: json({ type: 'object', properties: { service: { type: 'string' } } }),
        payloadSchema: json({ type: 'object' }),
      },
    })
  })

  it.each([
    ['no name', { name: undefined }],
    ['an empty name', { name: '' }],
    ['no description', { description: undefined }],
    ['no delivery mode', { delivery: [] }],
    ['a delivery mode the protocol does not have', { delivery: ['poll', 'email'] }],
    ['an input schema that is not an object', { inputSchema: 'any' }],
    ['no payload schema', { payloadSchema: undefined }],
  ])('refuses a type with %s as malformed', (_what, overrides) => {
    expect(readEventType(typeOf(overrides))).toMatchObject({ refused: 'malformed' })
  })

  it('refuses a type whose arguments are marked as headers against the rules, by name', () => {
    const bad = { type: 'object', properties: { a: { type: 'object', 'x-mcp-header': 'A' } } }
    expect(readEventType(typeOf({ inputSchema: bad }))).toEqual({
      refused: 'header-invalid',
      name: 'incident.created',
    })
    const good = { type: 'object', properties: { a: { type: 'string', 'x-mcp-header': 'A' } } }
    expect(readEventType(typeOf({ inputSchema: good }))).toMatchObject({
      ok: { name: 'incident.created' },
    })
  })

  it('a peer offers events only with the extension on a connection of the 2026-07-28 revision', () => {
    const declared = json({ extensions: { 'io.modelcontextprotocol/events': {} } })
    const at = (protocolVersion: string, capabilities = declared) =>
      declaresEvents({ protocolVersion: protocolVersion as never, capabilities })
    expect(at('2026-07-28')).toBe(true)
    expect(at('2025-11-25')).toBe(false)
    expect(at('2026-07-28', json({ extensions: {} }))).toBe(false)
    expect(at('2026-07-28', json({ extensions: { 'io.modelcontextprotocol/events': true } }))).toBe(
      false,
    )
  })
})
