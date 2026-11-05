// The pure functions of T2, T3, T4 and T6 that every transport composes requests and reads
// answers with: the envelope, the MCP headers, the withheld tools, the authorization discovery
// and the readers. One implementation; these cases hold it to the clauses.
import { describe, expect, it } from 'vitest'
import {
  LEGACY_PROTOCOL_VERSIONS,
  authorizationChallengeOf,
  authorizationDiscoveryOf,
  clientEnvelopeOf,
  errorAnswerOf,
  isGeneration,
  mcpRequestHeadersOf,
  metadataCandidatesOf,
  peerIdentityOf,
  readDiscoverResult,
  readInitializeResult,
  readListingPage,
  readTaskAnswer,
  readTaskReport,
  withheldTools,
  boundInstructions,
  type Generation,
} from '@omne-harness/mcp-contract'
import { json, jsonText } from './json.ts'

const CLIENT = { name: 'host', version: '1' }
const generation: Generation = (() => {
  const value = 2
  if (!isGeneration(value)) throw new Error('bad generation')
  return value
})()

describe('clientEnvelopeOf (T3)', () => {
  it('declares the tasks extension and form elicitation on a modern revision, nothing on a legacy one', () => {
    expect(clientEnvelopeOf('2026-07-28', CLIENT)).toEqual({
      'io.modelcontextprotocol/protocolVersion': '2026-07-28',
      'io.modelcontextprotocol/clientCapabilities': {
        extensions: { 'io.modelcontextprotocol/tasks': {} },
        elicitation: { form: {} },
      },
      'io.modelcontextprotocol/clientInfo': { name: 'host', version: '1' },
    })
    expect(clientEnvelopeOf('2025-11-25', CLIENT)).toEqual({
      'io.modelcontextprotocol/protocolVersion': '2025-11-25',
      'io.modelcontextprotocol/clientCapabilities': {},
      'io.modelcontextprotocol/clientInfo': { name: 'host', version: '1' },
    })
  })
})

describe('mcpRequestHeadersOf (T3)', () => {
  it('mirrors the tool name and the task id into Mcp-Name, and nothing for other methods', () => {
    expect(mcpRequestHeadersOf('tools/call', { name: 'echo' }, '2026-07-28')).toEqual({
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/call',
      'mcp-name': 'echo',
    })
    for (const method of ['tasks/get', 'tasks/update', 'tasks/cancel'])
      expect(mcpRequestHeadersOf(method, { taskId: 't1' }, '2026-07-28')['mcp-name']).toBe('t1')
    expect(mcpRequestHeadersOf('tools/list', { name: 'x' }, '2026-07-28')).toEqual({
      'mcp-protocol-version': '2026-07-28',
      'mcp-method': 'tools/list',
    })
    expect(mcpRequestHeadersOf('tools/call', { name: 7 }, '2026-07-28')['mcp-name']).toBeUndefined()
  })

  it('carries the legacy session on every method but initialize', () => {
    expect(mcpRequestHeadersOf('tools/list', {}, '2025-11-25', 's1')['mcp-session-id']).toBe('s1')
    expect(
      mcpRequestHeadersOf('notifications/initialized', {}, '2025-11-25', 's1')['mcp-session-id'],
    ).toBe('s1')
    expect(
      mcpRequestHeadersOf('initialize', {}, '2025-11-25', 's1')['mcp-session-id'],
    ).toBeUndefined()
  })

  it('encodes a value that is not a safe HTTP field value as SEP-2243 writes it (Q7)', () => {
    expect(mcpRequestHeadersOf('tools/call', { name: '天气' }, '2026-07-28')['mcp-name']).toBe(
      '=?base64?5aSp5rCU?=',
    )
    expect(mcpRequestHeadersOf('tools/call', { name: 'a b' }, '2026-07-28')['mcp-name']).toBe('a b')
    expect(mcpRequestHeadersOf('tools/call', { name: ' lead' }, '2026-07-28')['mcp-name']).toBe(
      '=?base64?IGxlYWQ=?=',
    )
    expect(mcpRequestHeadersOf('tools/call', { name: '=?x' }, '2026-07-28')['mcp-name']).toBe(
      '=?base64?PT94?=',
    )
  })
})

describe('the Mcp-Name value encoding at the edges of a safe field value (SEP-2243)', () => {
  const nameHeader = (name: string) =>
    mcpRequestHeadersOf('tools/call', { name }, '2026-07-28')['mcp-name']

  it('writes visible ASCII from the space to the tilde as it is, and every other byte encoded', () => {
    expect(nameHeader('a~b')).toBe('a~b')
    expect(nameHeader('~')).toBe('~')
    expect(nameHeader('a b')).toBe('a b')
    expect(nameHeader('a\u007fb')).toBe('=?base64?YX9i?=')
    expect(nameHeader('a\u001fb')).toBe('=?base64?YR9i?=')
    expect(nameHeader('a\tb')).toBe('=?base64?YQli?=')
    expect(nameHeader('a\nb')).toBe('=?base64?YQpi?=')
  })

  it('encodes a value with a space at either end, and the empty value', () => {
    expect(nameHeader('trail ')).toBe('=?base64?dHJhaWwg?=')
    expect(nameHeader(' lead')).toBe('=?base64?IGxlYWQ=?=')
    expect(nameHeader(' ')).toBe('=?base64?IA==?=')
    expect(nameHeader('')).toBe('=?base64??=')
    expect(nameHeader('=')).toBe('=')
    expect(nameHeader('?=x')).toBe('?=x')
  })
})

describe('withheldTools (T2)', () => {
  const tool = (name: string, inputSchema: unknown) => json({ name, inputSchema })

  it('withholds a tool whose declaration is not a token, not on a primitive, or not unique', () => {
    const bad = tool('bad', {
      type: 'object',
      properties: { q: { type: 'string', 'x-mcp-header': 'no token' } },
    })
    const numeric = tool('numeric', {
      type: 'object',
      properties: { n: { type: 'number', 'x-mcp-header': 'X-N' } },
    })
    const twice = tool('twice', {
      type: 'object',
      properties: {
        a: { type: 'string', 'x-mcp-header': 'X-A' },
        b: { type: 'string', 'x-mcp-header': 'x-a' },
      },
    })
    const nested = tool('nested', {
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'string', 'x-mcp-header': 'X-L' } } },
    })
    const root = tool('root', { type: 'object', 'x-mcp-header': 'X-R' })
    const good = tool('good', {
      type: 'object',
      properties: { q: { type: 'integer', 'x-mcp-header': 'X-Q' } },
    })
    const plain = tool('plain', { type: 'object' })
    const page = withheldTools([bad, numeric, twice, nested, root, good, plain])
    expect(page.tools).toEqual([good, plain])
    expect(page.withheld?.map(entry => entry.name.untrusted)).toEqual([
      'bad',
      'numeric',
      'twice',
      'nested',
      'root',
    ])
  })

  const declared = { type: 'string', 'x-mcp-header': 'X-D' }
  const withheldNames = (...tools: ReturnType<typeof tool>[]) =>
    withheldTools(tools).withheld?.map(entry => entry.name.untrusted)

  it('withholds a declaration under each keyword that a properties chain does not pass through', () => {
    const single = [
      'items',
      'contains',
      'additionalProperties',
      'unevaluatedProperties',
      'unevaluatedItems',
      'propertyNames',
      'not',
      'if',
      'then',
      'else',
    ]
    const listed = ['prefixItems', 'oneOf', 'anyOf', 'allOf']
    const named = ['patternProperties', 'dependentSchemas', '$defs', 'definitions']
    for (const keyword of single)
      expect(
        withheldNames(tool(keyword, { type: 'object', [keyword]: declared })),
        `${keyword} with a schema`,
      ).toEqual([keyword])
    for (const keyword of listed)
      expect(
        withheldNames(tool(keyword, { type: 'object', [keyword]: [{ type: 'string' }, declared] })),
        `${keyword} with a list of schemas`,
      ).toEqual([keyword])
    for (const keyword of named)
      expect(
        withheldNames(tool(keyword, { type: 'object', [keyword]: { entry: declared } })),
        `${keyword} with named schemas`,
      ).toEqual([keyword])
  })

  it('withholds a declaration that sits in a schema off the properties chain, even one that is plain elsewhere', () => {
    const both = tool('both', {
      type: 'object',
      properties: {
        ok: { type: 'string', 'x-mcp-header': 'X-Ok' },
        deep: {
          type: 'object',
          properties: { more: { type: 'string', 'x-mcp-header': 'X-More' } },
        },
        any: { anyOf: [{ type: 'string', 'x-mcp-header': 'X-Any' }] },
      },
    })
    expect(withheldNames(both)).toEqual(['both'])
    const chain = tool('chain', {
      type: 'object',
      properties: {
        deep: {
          type: 'object',
          properties: { more: { type: 'boolean', 'x-mcp-header': 'X-More' } },
        },
      },
    })
    expect(withheldNames(chain)).toBeUndefined()
  })

  it('accepts the primitive types string, integer and boolean and no other', () => {
    const typed = (type: unknown) =>
      tool(String(type), { type: 'object', properties: { p: { type, 'x-mcp-header': 'X-P' } } })
    for (const type of ['string', 'integer', 'boolean'])
      expect(withheldNames(typed(type)), type).toBeUndefined()
    for (const type of ['number', 'array', 'object', 'null', 7, undefined])
      expect(withheldNames(typed(type)), String(type)).toEqual([String(type)])
  })

  it('withholds a declaration on the root of the input schema, whatever its type', () => {
    for (const type of ['string', 'integer', 'boolean', 'object'])
      expect(
        withheldNames(tool(type, { type, 'x-mcp-header': 'X-Root', properties: {} })),
        type,
      ).toEqual([type])
  })

  it('accepts every character of an RFC 9110 token and rejects the rest, the empty name and a name that is not text', () => {
    const named = (name: unknown) =>
      tool('t', {
        type: 'object',
        properties: { p: { type: 'string', 'x-mcp-header': name } },
      })
    for (const name of ["!#$%&'*+-.^_`|~", '0123456789', 'abcxyz', 'ABCXYZ', 'X-Mixed_1'])
      expect(withheldNames(named(name)), name).toBeUndefined()
    for (const name of [
      '',
      'a b',
      'a(b',
      'a)b',
      'a,b',
      'a/b',
      'a:b',
      'a;b',
      'a<b',
      'a=b',
      'a>b',
      'a?b',
      'a@b',
      'a[b',
      'a\\b',
      'a]b',
      'a{b',
      'a}b',
      'a"b',
      'été',
      7,
      null,
      true,
    ])
      expect(withheldNames(named(name)), JSON.stringify(name)).toEqual(['t'])
  })

  it('treats a declaration without a type as invalid, and the same name in two places, in any case, as a duplicate', () => {
    expect(
      withheldNames(
        tool('untyped', { type: 'object', properties: { p: { 'x-mcp-header': 'X-P' } } }),
      ),
    ).toEqual(['untyped'])
    const nestedTwice = tool('nested-twice', {
      type: 'object',
      properties: {
        a: { type: 'string', 'x-mcp-header': 'X-Same' },
        deep: { type: 'object', properties: { b: { type: 'string', 'x-mcp-header': 'x-SAME' } } },
      },
    })
    expect(withheldNames(nestedTwice)).toEqual(['nested-twice'])
    const apart = tool('apart', {
      type: 'object',
      properties: { a: declared, b: { type: 'string', 'x-mcp-header': 'X-Other' } },
    })
    expect(withheldNames(apart)).toBeUndefined()
  })

  it('leaves a tool with no object schema in the page, and withholds nothing from an empty page', () => {
    const page = withheldTools([
      json({ name: 'bare' }),
      json('not an object'),
      json({ inputSchema: 5 }),
    ])
    expect(page.tools).toHaveLength(3)
    expect('withheld' in page).toBe(false)
    expect(withheldTools([])).toStrictEqual({ tools: [] })
  })

  it('leaves out withheld when nothing is withheld, and names a nameless tool with the empty text', () => {
    expect(withheldTools([tool('ok', { type: 'object' })]).withheld).toBeUndefined()
    const nameless = json({ inputSchema: { type: 'object', 'x-mcp-header': 'X' } })
    expect(withheldTools([nameless]).withheld).toEqual([
      { name: { untrusted: '' }, reason: 'header-invalid' },
    ])
  })
})

describe('authorization discovery (R4, T4)', () => {
  it('reads the challenge parameters of any scheme, quoted or not', () => {
    const challenge = authorizationChallengeOf(
      'Bearer realm="mcp", resource_metadata="https://peer.test/.well-known/oauth-protected-resource/mcp", scope=files:read, error="insufficient_scope"',
    )
    expect([...challenge.entries()]).toEqual([
      ['realm', 'mcp'],
      ['resource_metadata', 'https://peer.test/.well-known/oauth-protected-resource/mcp'],
      ['scope', 'files:read'],
      ['error', 'insufficient_scope'],
    ])
    expect(authorizationChallengeOf(undefined).size).toBe(0)
    expect(authorizationChallengeOf('Basic realm="x"').get('realm')).toBe('x')
  })

  it('names a parameter in lower case whatever its case, and keeps the first of a name given twice', () => {
    const challenge = authorizationChallengeOf(
      'Bearer Resource_Metadata="https://m.test/a", SCOPE=x, scope=y, Resource_metadata="https://m.test/b", Mixed_Case=1',
    )
    expect([...challenge.entries()]).toEqual([
      ['resource_metadata', 'https://m.test/a'],
      ['scope', 'x'],
      ['mixed_case', '1'],
    ])
    expect(challenge.get('Scope')).toBeUndefined()
  })

  it('reads a quoted value with spaces and commas, an empty quoted value, and an unquoted value up to a space or comma', () => {
    const challenge = authorizationChallengeOf(
      'Bearer realm="a b, c", error="", scope=read write, error_description=plain,next=1',
    )
    expect([...challenge.entries()]).toEqual([
      ['realm', 'a b, c'],
      ['error', ''],
      ['scope', 'read'],
      ['error_description', 'plain'],
      ['next', '1'],
    ])
    expect(authorizationChallengeOf('').size).toBe(0)
    expect(authorizationChallengeOf('Bearer').size).toBe(0)
    expect(authorizationChallengeOf('Bearer 1abc=2').get('abc')).toBe('2')
  })

  it('tries the named metadata alone, else the path address before the root', () => {
    expect(
      metadataCandidatesOf(
        'https://peer.test/mcp/',
        new Map([['resource_metadata', 'https://m.test/x']]),
      ),
    ).toEqual(['https://m.test/x'])
    expect(metadataCandidatesOf('https://peer.test/mcp/', new Map())).toEqual([
      'https://peer.test/.well-known/oauth-protected-resource/mcp',
      'https://peer.test/.well-known/oauth-protected-resource',
    ])
    expect(metadataCandidatesOf('https://peer.test/', new Map())).toEqual([
      'https://peer.test/.well-known/oauth-protected-resource',
      'https://peer.test/.well-known/oauth-protected-resource',
    ])
  })

  it('assembles the discovery from the first object read, the header scopes before the metadata scopes', () => {
    const candidates = [
      'https://p/.well-known/oauth-protected-resource/mcp',
      'https://p/.well-known/oauth-protected-resource',
    ]
    const metadata = json({
      authorization_servers: ['https://issuer', 7],
      scopes_supported: ['a', 'b'],
    })
    expect(
      authorizationDiscoveryOf(new Map(), candidates, [json(['not', 'object']), metadata]),
    ).toEqual({
      resourceMetadataUrl: candidates[1],
      metadata: 'fetched',
      resourceMetadata: { untrusted: metadata },
      issuers: ['https://issuer'],
      scopes: ['a', 'b'],
    })
    expect(
      authorizationDiscoveryOf(new Map([['scope', ' x  y ']]), candidates, [metadata]),
    ).toEqual({
      resourceMetadataUrl: candidates[0],
      metadata: 'fetched',
      resourceMetadata: { untrusted: metadata },
      issuers: ['https://issuer'],
      scopes: ['x', 'y'],
    })
    expect(authorizationDiscoveryOf(new Map(), candidates, [undefined, undefined])).toStrictEqual({
      resourceMetadataUrl: candidates[1],
      metadata: 'unavailable',
      issuers: [],
      scopes: [],
    })
  })
})

describe('the scopes of a discovery (R4)', () => {
  const candidates = ['https://p/.well-known/oauth-protected-resource']
  const metadata = json({ scopes_supported: ['m1', 'm2'], authorization_servers: [] })
  const scopesOf = (header: string) =>
    authorizationDiscoveryOf(new Map([['scope', header]]), candidates, [metadata]).scopes

  it('splits the scope parameter at any white space and drops what is empty', () => {
    expect(scopesOf('a\tb\nc  d')).toEqual(['a', 'b', 'c', 'd'])
    expect(scopesOf('\ta ')).toEqual(['a'])
  })

  it('falls back to the scopes of the metadata when the parameter holds no scope', () => {
    expect(scopesOf('')).toEqual(['m1', 'm2'])
    expect(scopesOf('  \t ')).toEqual(['m1', 'm2'])
  })

  it('reads the address and scopes from the metadata only when the metadata is an object, and keeps the last candidate otherwise', () => {
    const only = authorizationDiscoveryOf(
      new Map(),
      ['https://a', 'https://b'],
      [json('text'), json({ authorization_servers: 'x', scopes_supported: [1, 'ok'] })],
    )
    expect(only).toMatchObject({
      resourceMetadataUrl: 'https://b',
      issuers: [],
      scopes: ['ok'],
    })
    const none = authorizationDiscoveryOf(
      new Map(),
      ['https://a', 'https://b'],
      [json(7), json([])],
    )
    expect(none).toStrictEqual({
      resourceMetadataUrl: 'https://b',
      metadata: 'unavailable',
      issuers: [],
      scopes: [],
    })
    expect(authorizationDiscoveryOf(new Map(), [], [])).toMatchObject({
      resourceMetadataUrl: '/.well-known/oauth-protected-resource',
    })
  })
})

describe('what a reader leaves out when the peer did not send it (T2, T3, T6)', () => {
  const bound = { generation, instructionsByteLimit: 4 }
  const modern = (extra: Record<string, unknown> = {}) =>
    readDiscoverResult(json({ supportedVersions: ['2026-07-28'], capabilities: {}, ...extra }), [
      '2026-07-28',
    ])

  it('puts no serverInfo and no instructions on a modern read the peer did not send, whatever _meta holds', () => {
    const expected = { ok: { protocolVersion: '2026-07-28', capabilities: json({}) } }
    expect(modern()).toStrictEqual(expected)
    expect(modern({ _meta: {} })).toStrictEqual(expected)
    expect(modern({ _meta: 'x' })).toStrictEqual(expected)
    expect(modern({ _meta: ['io.modelcontextprotocol/serverInfo'] })).toStrictEqual(expected)
    expect(modern({ instructions: 5 })).toStrictEqual(expected)
    expect(modern({ instructions: null })).toStrictEqual(expected)
  })

  it('keeps an empty instructions text and a serverInfo of any shape as the peer wrote them', () => {
    expect(
      modern({ instructions: '', _meta: { 'io.modelcontextprotocol/serverInfo': 7 } }),
    ).toStrictEqual({
      ok: {
        protocolVersion: '2026-07-28',
        capabilities: json({}),
        serverInfo: json(7),
        instructions: '',
      },
    })
  })

  it('puts no serverInfo and no instructions on a legacy read the peer did not send', () => {
    const [offered] = LEGACY_PROTOCOL_VERSIONS
    const legacy = (extra: Record<string, unknown> = {}) =>
      readInitializeResult(json({ protocolVersion: offered, capabilities: {}, ...extra }))
    expect(legacy()).toStrictEqual({ ok: { protocolVersion: offered, capabilities: json({}) } })
    expect(legacy({ instructions: 3 })).toStrictEqual({
      ok: { protocolVersion: offered, capabilities: json({}) },
    })
    expect(legacy({ serverInfo: 'x', instructions: '' })).toStrictEqual({
      ok: {
        protocolVersion: offered,
        capabilities: json({}),
        serverInfo: json('x'),
        instructions: '',
      },
    })
  })

  it('puts no serverInfo and no instructions on the identity of a read that has none', () => {
    const read = modern()
    if (!('ok' in read)) throw new Error('unreachable')
    expect(peerIdentityOf(read.ok, bound)).toStrictEqual({
      protocolVersion: '2026-07-28',
      capabilities: json({}),
    })
    expect(peerIdentityOf({ ...read.ok, instructions: '' }, bound)).toStrictEqual({
      protocolVersion: '2026-07-28',
      capabilities: json({}),
      instructions: { untrusted: { ...boundInstructions('', 4), generation } },
    })
  })

  it('puts no cursor and no ttl on a page without them, and only a non-negative safe integer as the ttl', () => {
    const page = (fields: Record<string, unknown>) =>
      readListingPage(json({ tools: [], ...fields }), false)
    expect(page({})).toStrictEqual({ ok: { tools: [] } })
    for (const ttlMs of [-1, 1.5, '3', null, true, {}, [], 1e400])
      expect(page({ ttlMs }), JSON.stringify(ttlMs)).toStrictEqual({ ok: { tools: [] } })
    expect(readListingPage(jsonText('{"tools":[],"ttlMs":9007199254740993}'), false)).toStrictEqual(
      {
        ok: { tools: [] },
      },
    )
    expect(readListingPage(jsonText('{"tools":[],"ttlMs":1e3}'), false)).toStrictEqual({
      ok: { tools: [] },
    })
    expect(page({ ttlMs: 0 })).toStrictEqual({ ok: { tools: [], ttlMs: 0 } })
    expect(page({ nextCursor: '' })).toStrictEqual({ ok: { tools: [], nextCursor: '' } })
    expect(page({ nextCursor: null })).toStrictEqual({ failure: 'cursor-invalid' })
    expect(page({ nextCursor: ['p'] })).toStrictEqual({ failure: 'cursor-invalid' })
  })

  it('puts no withheld on a page read with the header rule when nothing is withheld, and none on a page read without it', () => {
    const ok = { name: 'ok', inputSchema: { type: 'object' } }
    expect(readListingPage(json({ tools: [ok] }), true)).toStrictEqual({
      ok: { tools: [json(ok)] },
    })
    expect(readListingPage(json({ tools: [ok] }), false)).toStrictEqual({
      ok: { tools: [json(ok)] },
    })
  })

  it('puts only the hints the peer sent as non-negative safe integers or text on a task report', () => {
    const report = (fields: Record<string, unknown>) =>
      readTaskReport(json({ taskId: 't', status: 'working', ...fields }))
    expect(report({})).toStrictEqual({ ok: { status: 'working' } })
    expect(report({ pollIntervalMs: -5, ttlMs: null, statusMessage: 3 })).toStrictEqual({
      ok: { status: 'working' },
    })
    expect(report({ pollIntervalMs: 0, ttlMs: 0, statusMessage: '' })).toStrictEqual({
      ok: {
        status: 'working',
        pollIntervalMs: 0,
        ttlMs: 0,
        statusMessage: { untrusted: '' },
      },
    })
    expect(
      readTaskReport(json({ taskId: 't', status: 'working', inputRequests: { a: 1 } })),
    ).toStrictEqual({ ok: { status: 'working' } })
    expect(
      readTaskReport(json({ taskId: 't', status: 'input_required', inputRequests: 5 })),
    ).toStrictEqual({
      failure: 'input-requests-missing',
    })
  })

  it('reads an error object without data with no data key, and refuses a code whose lexeme is not a plain integer', () => {
    expect(errorAnswerOf(json({ code: 1, message: '' }))).toStrictEqual({
      kind: 'error-answer',
      code: 1,
      message: '',
    })
    expect(errorAnswerOf(jsonText('{"code":1e2,"message":"x"}'))).toBeUndefined()
    expect(errorAnswerOf(jsonText('{"code":1.0,"message":"x"}'))).toBeUndefined()
    expect(errorAnswerOf(jsonText('{"code":-32000,"message":"x","data":null}'))).toStrictEqual({
      kind: 'error-answer',
      code: -32000,
      message: 'x',
      data: json(null),
    })
  })
})

describe('readers (T2, T3, T6)', () => {
  const bound = { generation, instructionsByteLimit: 4 }

  it('reads the modern answer to the highest version in common, with serverInfo and instructions', () => {
    const result = json({
      supportedVersions: ['2026-07-28', '2027-01-01'],
      capabilities: { tools: {} },
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'peer' } },
      instructions: 'abcdef',
    })
    const read = readDiscoverResult(result, ['2027-01-01', '2026-07-28'])
    expect(read).toEqual({
      ok: {
        protocolVersion: '2027-01-01',
        capabilities: json({ tools: {} }),
        serverInfo: json({ name: 'peer' }),
        instructions: 'abcdef',
      },
    })
    if (!('ok' in read)) throw new Error('unreachable')
    expect(peerIdentityOf(read.ok, bound)).toEqual({
      protocolVersion: '2027-01-01',
      capabilities: json({ tools: {} }),
      serverInfo: { untrusted: json({ name: 'peer' }) },
      instructions: { untrusted: { ...boundInstructions('abcdef', 4), generation } },
    })
    expect(
      readDiscoverResult(json({ supportedVersions: ['2099-01-01'], capabilities: {} }), [
        '2026-07-28',
      ]),
    ).toEqual({
      failure: 'no-common-version',
    })
    expect(
      readDiscoverResult(json({ supportedVersions: ['2025-11-25'], capabilities: {} }), [
        '2025-11-25',
      ]),
    ).toEqual({
      failure: 'no-common-version',
    })
    for (const shape of [
      [1],
      { capabilities: {} },
      { supportedVersions: 'x', capabilities: {} },
      { supportedVersions: [] },
    ])
      expect(readDiscoverResult(json(shape), ['2026-07-28']), JSON.stringify(shape)).toEqual({
        failure: 'shape',
      })
  })

  it('reads the legacy answer only with a known legacy version and object capabilities', () => {
    const [offered] = LEGACY_PROTOCOL_VERSIONS
    expect(
      readInitializeResult(
        json({ protocolVersion: offered, capabilities: {}, serverInfo: { name: 'old' } }),
      ),
    ).toEqual({
      ok: { protocolVersion: offered, capabilities: json({}), serverInfo: json({ name: 'old' }) },
    })
    for (const shape of [
      [1],
      { capabilities: {} },
      { protocolVersion: '2026-07-28', capabilities: {} },
      { protocolVersion: offered, capabilities: 'x' },
    ])
      expect(readInitializeResult(json(shape)), JSON.stringify(shape)).toEqual({ failure: 'shape' })
  })

  it('reads a page with the cursor and a non-negative safe integer ttl, withholding only when asked', () => {
    const bad = {
      name: 'bad',
      inputSchema: {
        type: 'object',
        properties: { q: { type: 'string', 'x-mcp-header': 'no token' } },
      },
    }
    expect(readListingPage(json({ tools: [bad], nextCursor: 'p2', ttlMs: 30 }), false)).toEqual({
      ok: { tools: [json(bad)], nextCursor: 'p2', ttlMs: 30 },
    })
    expect(readListingPage(json({ tools: [bad], ttlMs: -1 }), true)).toEqual({
      ok: { tools: [], withheld: [{ name: { untrusted: 'bad' }, reason: 'header-invalid' }] },
    })
    expect(readListingPage(json({ tools: 'none' }), false)).toEqual({ failure: 'tools-missing' })
    expect(readListingPage(json([1]), false)).toEqual({ failure: 'tools-missing' })
    expect(readListingPage(json({ tools: [], nextCursor: 7 }), false)).toEqual({
      failure: 'cursor-invalid',
    })
  })

  it('reads a task report and a task answer with the defects of T7', () => {
    expect(
      readTaskReport(
        json({
          taskId: 't',
          status: 'working',
          pollIntervalMs: 5,
          ttlMs: null,
          statusMessage: 'q',
        }),
      ),
    ).toEqual({
      ok: { status: 'working', pollIntervalMs: 5, statusMessage: { untrusted: 'q' } },
    })
    expect(
      readTaskReport(json({ taskId: 't', status: 'input_required', inputRequests: { a: 1 } })),
    ).toEqual({
      ok: { status: 'input_required', inputRequests: { untrusted: json({ a: 1 }) } },
    })
    expect(readTaskReport(json({ taskId: 't', status: 'paused' }))).toEqual({
      failure: 'status-unknown',
    })
    expect(readTaskReport(json({ taskId: '', status: 'working' }))).toEqual({
      failure: 'status-unknown',
    })
    expect(readTaskReport(json({ taskId: 't', status: 'input_required' }))).toEqual({
      failure: 'input-requests-missing',
    })
    expect(readTaskReport(json({ taskId: 't', status: 'completed' }))).toEqual({
      failure: 'result-missing',
    })
    expect(readTaskReport(json({ taskId: 't', status: 'failed', error: 'x' }))).toEqual({
      failure: 'error-missing',
    })
    expect(readTaskAnswer(json({ taskId: 't', status: 'completed', result: { ok: 1 } }))).toEqual({
      ok: { kind: 'finished', answer: { kind: 'result', result: json({ ok: 1 }) } },
    })
    expect(
      readTaskAnswer(json({ taskId: 't', status: 'failed', error: { code: 1, message: 'x' } })),
    ).toEqual({
      ok: { kind: 'finished', answer: { kind: 'error', error: json({ code: 1, message: 'x' }) } },
    })
    expect(readTaskAnswer(json({ taskId: 't', status: 'cancelled' }))).toEqual({
      ok: { kind: 'cancelled' },
    })
    expect(readTaskAnswer(json({ taskId: 't', status: 'working' }))).toEqual({
      ok: { kind: 'not-finished' },
    })
    expect(readTaskAnswer(json({ taskId: 't', status: 'nope' }))).toEqual({
      failure: 'status-unknown',
    })
  })

  it('reads an error object only with an integer code and a text message', () => {
    expect(errorAnswerOf(json({ code: -32602, message: 'x', data: { f: 1 } }))).toEqual({
      kind: 'error-answer',
      code: -32602,
      message: 'x',
      data: json({ f: 1 }),
    })
    expect(errorAnswerOf(json({ code: -32602, message: 'x' }))).toEqual({
      kind: 'error-answer',
      code: -32602,
      message: 'x',
    })
    for (const shape of [
      { message: 'x' },
      { code: 1.5, message: 'x' },
      { code: 1 },
      { code: '1', message: 'x' },
      'x',
    ])
      expect(errorAnswerOf(json(shape)), JSON.stringify(shape)).toBeUndefined()
  })
})
