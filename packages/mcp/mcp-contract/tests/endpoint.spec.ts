import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import {
  mcpEndpointBodyContract,
  mcpEndpointGates,
  parseEndpointBody,
  type EndpointDefinition,
} from '@omne-harness/mcp-contract'
import { json, readBody } from './json.ts'

const http = { name: 'search', transport: 'streamable-http', auth: 'oauth' }

function definitionOf(body: unknown, capabilityName?: string): EndpointDefinition {
  const parsed = parseEndpointBody(json(body), capabilityName)
  if ('failure' in parsed) throw new Error(`expected a definition, got ${parsed.failure}`)
  return parsed.ok
}

describe('parseEndpointBody', () => {
  it('reads a Streamable HTTP body without an address', () => {
    expect(definitionOf(http, 'search')).toEqual({
      name: 'search',
      transport: { kind: 'streamable-http' },
      auth: 'oauth',
    })
  })

  const rejections: readonly (readonly [string, unknown, string])[] = [
    ['malformed: the body is not an object', ['files'], 'malformed'],
    ['malformed: the name is missing', { transport: 'streamable-http', auth: 'none' }, 'malformed'],
    ['malformed: the name has an upper-case letter', { ...http, name: 'Search' }, 'malformed'],
    ['malformed: the name has 65 characters', { ...http, name: 'a'.repeat(65) }, 'malformed'],
    ['malformed: the name ends with a hyphen', { ...http, name: 'search-' }, 'malformed'],
    ['malformed: an unknown member', { ...http, url: 'https://example.test' }, 'malformed'],
    ['malformed: the transport is not text', { ...http, transport: 1 }, 'malformed'],
    [
      'malformed: the auth is missing',
      { name: 'search', transport: 'streamable-http' },
      'malformed',
    ],
    ['name-mismatch', { ...http, name: 'other' }, 'name-mismatch'],
    ['transport-unknown', { ...http, transport: 'sse' }, 'transport-unknown'],
    ['auth-unknown', { ...http, auth: 'bearer' }, 'auth-unknown'],
  ]

  for (const [name, body, rejection] of rejections)
    it(`rejects ${name}`, () => {
      expect(parseEndpointBody(json(body), 'search')).toEqual({ failure: rejection })
    })

  it('rejects a value that is not a JSON tree as malformed', () => {
    expect(parseEndpointBody(http, 'search')).toEqual({ failure: 'malformed' })
  })

  it('reports the name mismatch before the other rejections of a well-formed body', () => {
    expect(parseEndpointBody(json({ ...http, transport: 'sse' }), 'other')).toEqual({
      failure: 'name-mismatch',
    })
  })

  it('checks the name only against a given capability name', () => {
    expect(definitionOf({ ...http, name: 'other' }).name).toBe('other')
  })
})

describe('a body that declares a command-type endpoint', () => {
  const command = { command: 'files-server' }
  const cases: readonly (readonly [string, unknown, string])[] = [
    [
      'stdio without a launch',
      { name: 'search', transport: 'stdio', auth: 'none' },
      'transport-unknown',
    ],
    [
      'stdio with a launch',
      { name: 'search', transport: 'stdio', launch: command, auth: 'none' },
      'malformed',
    ],
    ['Streamable HTTP with a launch', { ...http, launch: command }, 'malformed'],
  ]

  for (const [name, body, rejection] of cases)
    it(`is rejected: ${name} is ${rejection}`, () => {
      expect(parseEndpointBody(json(body), 'search')).toEqual({ failure: rejection })
    })
})

describe('mcpEndpointBodyContract', () => {
  const contract = mcpEndpointBodyContract()

  it('registers the category mcp', () => {
    expect(contract.category).toBe('mcp')
  })

  it('judges a read body by the same rules as parseEndpointBody', () => {
    expect(contract.judge(readBody(http), { capabilityName: 'search' })).toEqual({ ok: true })
    expect(contract.judge(readBody(http), { capabilityName: 'files' })).toEqual({
      ok: false,
      rejected: 'name-mismatch',
    })
    expect(contract.judge(readBody({ ...http, auth: 'bearer' }))).toEqual({
      ok: false,
      rejected: 'auth-unknown',
    })
  })

  it('refuses a tree that did not come from the asset reader', () => {
    expect(contract.judge(json(http))).toEqual({ ok: false, rejected: 'incomplete-reference' })
  })

  const declarations: readonly (readonly [string, unknown, readonly string[]])[] = [
    [
      'Streamable HTTP without authentication',
      { ...http, auth: 'none' },
      [
        'setting:placement-identity:target',
        'setting:preference:connect-timeout',
        'setting:preference:program-calls',
      ],
    ],
    [
      'Streamable HTTP with OAuth',
      http,
      [
        'setting:placement-identity:target',
        'setting:placement-identity:credential',
        'setting:preference:connect-timeout',
        'setting:preference:program-calls',
      ],
    ],
  ]

  for (const [name, body, entries] of declarations)
    it(`declares the fixed settings of ${name}`, () => {
      expect(contract.deriveDeclarations(readBody(body)).entries).toEqual(entries)
    })

  it('the version of the settings follows their content, not the version of the asset: a new body keeps the set values (#1582, C105)', () => {
    const settings = (body: object, definition: string) =>
      contract.settings?.(readBody(body), { definition } as never)
    const first = settings({ ...http, auth: 'static' }, 'sha256:1111')
    const next = settings({ ...http, auth: 'oauth' }, 'sha256:2222')
    expect(next?.version).toBe(first?.version)
    expect(first?.version).toMatch(/^sha256:/u)
    const bare = settings({ ...http, auth: 'none' }, 'sha256:1111')
    expect(bare?.version).not.toBe(first?.version)
  })

  it('throws instead of declaring settings for a rejected body', () => {
    expect(() => contract.deriveDeclarations(readBody({ ...http, auth: 'bearer' }))).toThrow(
      /auth-unknown/,
    )
  })

  it('references no other capability', () => {
    expect(contract.references(readBody(http))).toEqual([])
  })

  it('throws instead of answering references for a rejected body', () => {
    expect(() => contract.references(readBody({ ...http, transport: 'sse' }))).toThrow(
      /transport-unknown/,
    )
  })

  const settingsOf = (body: unknown, definition?: string) => {
    const settings = contract.settings?.(readBody(body), {
      capabilityName: 'search',
      ...(definition === undefined ? {} : { definition }),
    })
    if (settings === null || settings === undefined) throw new Error('no settings')
    return settings
  }

  it('defines the target and the connect timeout of an endpoint without authentication', () => {
    const settings = settingsOf({ ...http, auth: 'none' })
    expect(settings.items.map(item => [item.id, item.category, item.sensitivity])).toEqual([
      ['target', 'placement-identity', 'ordinary'],
      ['connect-timeout', 'preference', 'ordinary'],
      ['program-calls', 'preference', 'ordinary'],
    ])
  })

  it.each(['static', 'oauth'])('adds the credential, a secret, when the endpoint uses %s', auth => {
    const settings = settingsOf({ ...http, auth })
    expect(settings.items.map(item => [item.id, item.category, item.sensitivity])).toEqual([
      ['target', 'placement-identity', 'ordinary'],
      ['credential', 'placement-identity', 'secret'],
      ['connect-timeout', 'preference', 'ordinary'],
      ['program-calls', 'preference', 'ordinary'],
    ])
  })

  it('gives no connection item a default, and puts each of them in the connection group', () => {
    const items = settingsOf(http).items.filter(item => item.id !== 'program-calls')
    expect(items.map(item => item.default)).toEqual(items.map(() => ({ kind: 'absent' })))
    expect(new Set(items.map(item => item.groupId))).toEqual(new Set(['connection']))
  })

  // MC-26: the holder opens the actions to programs; until then they are closed.
  it('defines program calls as a boolean that is off until it is set, in a group of its own', () => {
    const settings = settingsOf(http)
    const item = settings.items.find(candidate => candidate.id === 'program-calls')
    expect(item).toMatchObject({
      groupId: 'use',
      valueSchema: { type: 'boolean' },
      default: { kind: 'value', value: false },
      merge: 'override',
    })
    expect(item?.presentation.adoption).toBe('next-read')
    expect(settings.groups.map(group => [group.id, group.order])).toEqual([
      ['connection', 0],
      ['use', 1],
    ])
  })

  it('names the definition after the endpoint and the version after its own content, pinned or not', () => {
    expect(settingsOf(http, 'sha256-abc')).toMatchObject({ definitionId: 'search' })
    expect(settingsOf(http, 'sha256-abc').version).toBe(settingsOf(http).version)
    expect(settingsOf(http).version).toMatch(/^sha256:/u)
  })

  it('gives the same body the same definition, byte for byte', () => {
    expect(JSON.stringify(settingsOf(http, 'v'))).toBe(JSON.stringify(settingsOf(http, 'v')))
    expect(JSON.stringify(settingsOf(http, 'v'))).not.toBe(
      JSON.stringify(settingsOf({ ...http, auth: 'none' }, 'v')),
    )
  })

  it('throws instead of defining settings for a rejected body', () => {
    expect(() => contract.settings?.(readBody({ ...http, auth: 'bearer' }))).toThrow(/auth-unknown/)
  })
})

describe('mcpEndpointGates', () => {
  it('is one gate of the category mcp, asking by default', () => {
    expect(mcpEndpointGates).toEqual({
      category: 'mcp',
      ownerId: 'mcp.endpoint-gates',
      gates: [{ id: 'invoke', title: '调用这个接入点的动作', default: 'ask' }],
    })
    expect(Object.isFrozen(mcpEndpointGates) && Object.isFrozen(mcpEndpointGates.gates)).toBe(true)
  })
})

describe('schema/endpoint-body.schema.json', () => {
  const text = readFileSync(new URL('../schema/endpoint-body.schema.json', import.meta.url), 'utf8')
  const file = JSON.parse(text) as {
    properties: {
      name: { pattern: string; maxLength: number }
      transport: { enum: string[] }
      auth: { enum: string[] }
    }
  }

  it('is the schema that the category port gives', () => {
    const read = readJsonText(text, {
      maxBytes: 100_000,
      maxDepth: 32,
      maxItems: 10_000,
      maxMembers: 100,
      maxStringLength: 10_000,
      maxNumberLength: 20,
    })
    expect(read.kind).toBe('ok')
    if (read.kind === 'ok') expect(mcpEndpointBodyContract().schema).toEqual(read.value)
  })

  it('lists the transports and authentication kinds that the parser accepts', () => {
    expect(file.properties.transport.enum).toEqual(['streamable-http'])
    expect(file.properties.auth.enum).toEqual(['none', 'static', 'oauth'])
    for (const transport of file.properties.transport.enum)
      for (const auth of file.properties.auth.enum)
        expect('ok' in parseEndpointBody(json({ ...http, transport, auth }))).toBe(true)
  })

  it('carries format version 1 in its identifier', () => {
    expect(JSON.parse(text).$id).toBe('urn:omne-harness:mcp-contract:endpoint-body:1')
  })

  it('states the name lexicon that the parser applies', () => {
    const pattern = new RegExp(file.properties.name.pattern, 'u')
    for (const name of ['a', 'files', 'files-2', 'a1-b2-c3', 'Files', 'files-', '-files', 'a--b'])
      expect(pattern.test(name)).toBe('ok' in parseEndpointBody(json({ ...http, name })))
    expect(file.properties.name.maxLength).toBe(64)
  })
})
