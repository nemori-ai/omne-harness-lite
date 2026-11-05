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
import { json } from './json.ts'

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
    expect(authorizationDiscoveryOf(new Map(), candidates, [undefined, undefined])).toEqual({
      resourceMetadataUrl: candidates[1],
      metadata: 'unavailable',
      issuers: [],
      scopes: [],
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
