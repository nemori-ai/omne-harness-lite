import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { readJsonText } from '@omne-harness/json-text'
import {
  launchesLocalCommand,
  mcpEndpointBodyContract,
  parseEndpointBody,
  type EndpointDefinition,
} from '@omne-harness/mcp-contract'
import { json, readBody } from './json.ts'

const stdio = {
  name: 'files',
  transport: 'stdio',
  launch: {
    command: '/usr/bin/files-server',
    args: ['--root', '.'],
    cwd: 'work',
    env: [
      { name: 'FILES_MODE', source: 'setting' },
      { name: 'FILES_TOKEN', source: 'credential' },
    ],
    facilities: ['network'],
  },
  auth: 'static',
}

const http = { name: 'search', transport: 'streamable-http', auth: 'oauth' }

function definitionOf(body: unknown, capabilityName?: string): EndpointDefinition {
  const parsed = parseEndpointBody(json(body), capabilityName)
  if ('failure' in parsed) throw new Error(`expected a definition, got ${parsed.failure}`)
  return parsed.ok
}

describe('parseEndpointBody', () => {
  it('reads a stdio body with its launch declaration as written', () => {
    expect(definitionOf(stdio, 'files')).toEqual({
      name: 'files',
      transport: {
        kind: 'stdio',
        launch: {
          command: '/usr/bin/files-server',
          args: ['--root', '.'],
          cwd: 'work',
          env: [
            { name: 'FILES_MODE', source: 'setting' },
            { name: 'FILES_TOKEN', source: 'credential' },
          ],
          facilities: ['network'],
        },
      },
      auth: 'static',
    })
  })

  it('reads omitted launch lists as empty and leaves an omitted cwd absent', () => {
    const definition = definitionOf({
      name: 'files',
      transport: 'stdio',
      launch: { command: 'files-server' },
      auth: 'none',
    })
    expect(definition.transport).toEqual({
      kind: 'stdio',
      launch: { command: 'files-server', args: [], env: [], facilities: [] },
    })
  })

  it('reads a Streamable HTTP body without an address', () => {
    expect(definitionOf(http, 'search')).toEqual({
      name: 'search',
      transport: { kind: 'streamable-http' },
      auth: 'oauth',
    })
  })

  const rejections: readonly (readonly [string, unknown, string])[] = [
    ['malformed: the body is not an object', ['files'], 'malformed'],
    ['malformed: the name is missing', { transport: 'stdio', auth: 'none' }, 'malformed'],
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
    [
      'malformed: an empty command',
      { ...stdio, launch: { ...stdio.launch, command: '' } },
      'malformed',
    ],
    [
      'malformed: an argument is not text',
      { ...stdio, launch: { ...stdio.launch, args: [1] } },
      'malformed',
    ],
    ['malformed: an empty cwd', { ...stdio, launch: { ...stdio.launch, cwd: '' } }, 'malformed'],
    [
      'malformed: an environment item carries a value',
      {
        ...stdio,
        launch: { ...stdio.launch, env: [{ name: 'TOKEN', source: 'setting', value: 'x' }] },
      },
      'malformed',
    ],
    [
      'malformed: an environment source is not setting or credential',
      { ...stdio, launch: { ...stdio.launch, env: [{ name: 'TOKEN', source: 'literal' }] } },
      'malformed',
    ],
    [
      'malformed: an environment name is not a variable name',
      { ...stdio, launch: { ...stdio.launch, env: [{ name: '1TOKEN', source: 'setting' }] } },
      'malformed',
    ],
    [
      'malformed: an environment name repeats',
      {
        ...stdio,
        launch: {
          ...stdio.launch,
          env: [
            { name: 'TOKEN', source: 'setting' },
            { name: 'TOKEN', source: 'credential' },
          ],
        },
      },
      'malformed',
    ],
    [
      'malformed: a facility repeats',
      { ...stdio, launch: { ...stdio.launch, facilities: ['network', 'network'] } },
      'malformed',
    ],
    ['name-mismatch', { ...http, name: 'other' }, 'name-mismatch'],
    ['transport-unknown', { ...http, transport: 'sse' }, 'transport-unknown'],
    ['auth-unknown', { ...http, auth: 'bearer' }, 'auth-unknown'],
    ['launch-missing', { name: 'search', transport: 'stdio', auth: 'none' }, 'launch-missing'],
    ['launch-unexpected', { ...http, launch: stdio.launch }, 'launch-unexpected'],
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

describe('launchesLocalCommand', () => {
  it('answers true for a stdio endpoint', () => {
    expect(launchesLocalCommand(definitionOf(stdio))).toBe(true)
  })

  it('answers false for a Streamable HTTP endpoint', () => {
    expect(launchesLocalCommand(definitionOf(http))).toBe(false)
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
      'stdio without authentication',
      { ...stdio, auth: 'none' },
      ['setting:preference:connect-timeout'],
    ],
    [
      'stdio with a static credential',
      stdio,
      ['setting:placement-identity:credential', 'setting:preference:connect-timeout'],
    ],
    [
      'Streamable HTTP without authentication',
      { ...http, auth: 'none' },
      ['setting:placement-identity:target', 'setting:preference:connect-timeout'],
    ],
    [
      'Streamable HTTP with OAuth',
      http,
      [
        'setting:placement-identity:target',
        'setting:placement-identity:credential',
        'setting:preference:connect-timeout',
      ],
    ],
  ]

  for (const [name, body, entries] of declarations)
    it(`declares the fixed settings of ${name}`, () => {
      expect(contract.deriveDeclarations(readBody(body)).entries).toEqual(entries)
    })

  it('throws instead of declaring settings for a rejected body', () => {
    expect(() => contract.deriveDeclarations(readBody({ ...http, auth: 'bearer' }))).toThrow(
      /auth-unknown/,
    )
  })

  it('references no other capability', () => {
    expect(contract.references(readBody(stdio))).toEqual([])
  })

  it('throws instead of answering references for a rejected body', () => {
    expect(() => contract.references(readBody({ ...http, transport: 'sse' }))).toThrow(
      /transport-unknown/,
    )
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
    $defs: { environment: { properties: { source: { enum: string[] } } } }
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

  it('lists the transports, authentication kinds and environment sources that the parser accepts', () => {
    expect(file.properties.transport.enum).toEqual(['stdio', 'streamable-http'])
    expect(file.properties.auth.enum).toEqual(['none', 'static', 'oauth'])
    expect(file.$defs.environment.properties.source.enum).toEqual(['setting', 'credential'])
    for (const transport of file.properties.transport.enum)
      for (const auth of file.properties.auth.enum) {
        const body = transport === 'stdio' ? { ...stdio, auth } : { ...http, transport, auth }
        expect('ok' in parseEndpointBody(json(body))).toBe(true)
      }
  })

  it('states the name lexicon that the parser applies', () => {
    const pattern = new RegExp(file.properties.name.pattern, 'u')
    for (const name of ['a', 'files', 'files-2', 'a1-b2-c3', 'Files', 'files-', '-files', 'a--b'])
      expect(pattern.test(name)).toBe('ok' in parseEndpointBody(json({ ...http, name })))
    expect(file.properties.name.maxLength).toBe(64)
  })
})
