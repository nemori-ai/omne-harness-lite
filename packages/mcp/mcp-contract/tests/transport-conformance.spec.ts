// The transport conformance suite on the scripted transport: every case passes on both material
// kinds, and scripted transports that break a clause make the suite fail.
import { AssertionError } from 'node:assert'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isConnectionTarget,
  isGeneration,
  isProtocolVersion,
  type Generation,
} from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  McpTransport,
  McpTransportFactory,
  ProcessHandle,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import {
  actionNameOf,
  createScriptedTransportFactory,
  mcpTransportConformance,
  runConformanceCase,
  type ConformanceCase,
  type PeerNeeds,
  type PeerReceived,
  type PeerScript,
  type ScriptSource,
  type ScriptedPeer,
  type ScriptedTransportOptions,
  type TransportFixture,
  type TransportKind,
  TRANSPORT_TABLE,
  cellsOf,
  rowsOf,
  transportCells,
} from '@omne-harness/mcp-contract/testing'
import { json } from './json.ts'

const generation: Generation = (() => {
  const value = 3
  if (!isGeneration(value)) throw new Error('bad generation')
  return value
})()

const target = (() => {
  const text = 'https://peer.test/mcp'
  if (!isConnectionTarget(text)) throw new Error('bad target')
  return text
})()

/** A process whose streams carry nothing: the scripted transport answers in memory. */
function idleProcess(): ProcessHandle {
  return {
    stdin: new WritableStream<Uint8Array>(),
    stdout: new ReadableStream<Uint8Array>(),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => 'tree-confirmed',
  }
}

function materialOf(needs: PeerNeeds): TransportMaterial {
  const limit = needs.instructionsByteLimit ?? 4096
  if (needs.kind === 'stdio')
    return { kind: 'stdio', process: idleProcess(), generation, instructionsByteLimit: limit }
  return {
    kind: 'streamable-http',
    target,
    ...(needs.credential === undefined ? {} : { credential: needs.credential }),
    generation,
    instructionsByteLimit: limit,
  }
}

type Wrap = (factory: McpTransportFactory) => McpTransportFactory

/**
 * Two modern versions, so that a `-32022` retry negotiates a version other than the highest. The
 * first is a future revision that only the scripted transport speaks.
 */
const MODERN_VERSIONS = ['2027-01-01', '2026-07-28']

function fixtureOf(
  kinds: readonly TransportKind[],
  wrap: Wrap = factory => factory,
): TransportFixture {
  return {
    kinds,
    protocolVersions: MODERN_VERSIONS,
    async peer(source: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer> {
      const script = typeof source === 'function' ? source(target) : source
      const factory = createScriptedTransportFactory(script, { protocolVersions: MODERN_VERSIONS })
      return {
        factory: wrap(factory),
        material: materialOf(needs),
        received: async () => factory.received(),
        close: async () => undefined,
      }
    },
  }
}

/** Runs every case on a fresh fixture, as a consumer registers them; not applicable fails. */
function register(
  suite: readonly ConformanceCase<TransportFixture>[],
  fixture: () => TransportFixture,
) {
  for (const conformance of suite)
    it(`${conformance.clause} ${conformance.name}`, async () => {
      expect(await runConformanceCase(conformance, fixture())).toEqual({ kind: 'passed' })
    })
}

/** The names of the cases that fail on the fixture. */
async function failing(fixture: () => TransportFixture): Promise<readonly string[]> {
  const names: string[] = []
  for (const conformance of mcpTransportConformance())
    try {
      await conformance.run(fixture())
    } catch (error) {
      if (!(error instanceof AssertionError)) throw error
      names.push(conformance.name)
    }
  return names
}

describe('McpTransport conformance on the scripted transport', () => {
  describe('stdio material first', () => {
    register(mcpTransportConformance(), () => fixtureOf(['stdio', 'streamable-http']))
  })
  describe('streamable-http material first', () => {
    register(mcpTransportConformance(), () => fixtureOf(['streamable-http', 'stdio']))
  })
})

describe('the suite refuses a fixture that lists a legacy version', () => {
  it('fails each case before it opens a transport', async () => {
    const [first] = mcpTransportConformance()
    if (first === undefined) throw new Error('the suite is empty')
    const fixture: TransportFixture = {
      ...fixtureOf(['stdio', 'streamable-http']),
      protocolVersions: ['2026-07-28', '2025-11-25'],
    }
    await expect(runConformanceCase(first, fixture)).rejects.toThrow(
      /the fixture lists a legacy version/,
    )
  })
})

describe('the suite covers the transport clauses and the decided items', () => {
  it('names T1 to T6, the table T8, the port failures T9, and items 7 to 9, 11, 12 and 14', () => {
    const cases = mcpTransportConformance()
    const clauses = new Set(cases.flatMap(conformance => conformance.clause.split(', ')))
    for (const clause of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T8', 'T9'])
      expect(clauses.has(clause), clause).toBe(true)
    const names = cases.map(conformance => conformance.name).join('\n')
    for (const item of [7, 8, 9, 11, 12, 14]) expect(names).toContain(`(item ${item})`)
  })
})

describe('the decision table is a total function and the suite covers it', () => {
  it('matches every cell of the domain with exactly one row', () => {
    const cells = transportCells()
    expect(cells.length).toBeGreaterThan(0)
    const wrong = cells.flatMap(cell => {
      const rows = rowsOf(cell).map(row => row.id)
      return rows.length === 1
        ? []
        : [`${cell.kind} ${cell.request} ${cell.answer}: ${rows.join(',')}`]
    })
    expect(wrong).toEqual([])
  })

  it('gives every row at least one cell and a unique id', () => {
    const ids = TRANSPORT_TABLE.map(row => row.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(TRANSPORT_TABLE.filter(row => cellsOf(row).length === 0).map(row => row.id)).toEqual([])
  })

  it('has a case for every row', () => {
    const names = mcpTransportConformance().map(conformance => conformance.name)
    const uncovered = TRANSPORT_TABLE.filter(
      row => !names.some(name => name.includes(`[${row.id}]`)),
    ).map(row => row.id)
    expect(uncovered).toEqual([])
  })

  it('writes every row into SPEC T8, and no other row id', () => {
    const spec = readFileSync(new URL('../SPEC.md', import.meta.url), 'utf8')
    const table = spec.slice(spec.indexOf('<a id="t8"></a>'), spec.indexOf('<a id="t8-end"></a>'))
    const written = [...table.matchAll(/^\| ([A-Z]\d\d) /gmu)].map(match => match[1])
    expect(written).toEqual(TRANSPORT_TABLE.map(row => row.id))
  })
})

describe('the suite fails a transport that breaks the contract', () => {
  /** Re-sends a call whose answer stream broke: the deviation forbids it. */
  const resendingCalls: Wrap = factory => ({
    open: async (material, signal) => {
      const opened = await factory.open(material, signal)
      if ('failure' in opened) return opened
      const inner = opened.ok
      const transport: McpTransport = {
        generation: inner.generation,
        discover: () => inner.discover(),
        listActions: cursor => inner.listActions(cursor),
        cancelRequest: id => inner.cancelRequest(id),
        getTask: id => inner.getTask(id),
        updateTask: (id, responses) => inner.updateTask(id, responses),
        getTaskResult: id => inner.getTaskResult(id),
        cancelTask: id => inner.cancelTask(id),
        close: () => inner.close(),
        call: async (request, signal, observe) => {
          const first = await inner.call(request, signal, observe)
          if ('failure' in first) return first
          const answer = first.ok.answer.then(async peerAnswer => {
            if (peerAnswer.kind !== 'no-answer' || peerAnswer.cause !== 'stream-broken')
              return peerAnswer
            const again = await inner.call(request, signal, observe)
            return 'failure' in again ? peerAnswer : again.ok.answer
          })
          return { ok: { requestId: first.ok.requestId, answer } }
        },
      }
      return { ok: transport }
    },
  })

  /** Drops the credential handle, so that a refused request never reaches reportRejection. */
  const forgettingRejections: Wrap = factory => ({
    open: (material, signal) =>
      factory.open(
        material.kind === 'streamable-http'
          ? {
              kind: 'streamable-http',
              target: material.target,
              generation: material.generation,
              instructionsByteLimit: material.instructionsByteLimit,
            }
          : material,
        signal,
      ),
  })

  it('a transport that re-sends tools/call after a broken stream', async () => {
    expect(await failing(() => fixtureOf(['streamable-http', 'stdio'], resendingCalls))).toEqual([
      '[C04] tools/call × stream-broken, http:2xx, http:5xx+plain → sent, answer stream-broken',
    ])
  })

  it('a transport that does not report a refused authorization to the handle', async () => {
    expect(
      await failing(() => fixtureOf(['streamable-http', 'stdio'], forgettingRejections)),
    ).toEqual([
      '[S05] discover, discover-retry, initialize … (8) × http:401, http:403+scope → not-sent (authorization-required), reportRejection once',
      '401: not-sent authorization-required from WWW-Authenticate and the named metadata; reportRejection once (item 11)',
      '401 on listActions without resource_metadata: the well-known URL with the path is tried before the root; reportRejection once (item 11)',
      '401 with no metadata anywhere: metadata unavailable, issuers empty, scopes from the header; reportRejection once (item 11)',
      '401 on discover: authorization-required with no legacy fallback; reportRejection once (item 11)',
      '403 insufficient_scope: authorization-required with the scope of the header; reportRejection once (item 11)',
      'a call still being authorized when close() ran is not-sent and never reaches the peer; close() does not wait for the handle',
      'a call still being authorized when its signal fires is not-sent and never reaches the peer; call() does not wait for the handle',
      'a credential handle whose authorize rejects or throws: not-sent (connection-unavailable), nothing reaches the peer',
    ])
  })
})

describe('the suite on a transport that reads and writes the process pipes', () => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const line = (message: unknown) => encoder.encode(`${JSON.stringify(message)}\n`)

  /** A member of a parsed JSON-RPC message, or undefined. */
  function field(message: unknown, key: string): unknown {
    if (typeof message !== 'object' || message === null || !(key in message)) return undefined
    return new Map<string, unknown>(Object.entries(message)).get(key)
  }

  /**
   * A process whose stdin and stdout are pipes to an in-memory peer. The peer reads one JSON-RPC
   * message per line, records each request, and answers `server/discover` on stdout. At the end
   * of stdin it ends stdout, as a stdio server that exits does.
   */
  function pipedProcess(log: PeerReceived[]): ProcessHandle {
    let answers: ReadableStreamDefaultController<Uint8Array> | undefined
    return {
      stdin: new WritableStream<Uint8Array>({
        write(chunk) {
          for (const text of decoder.decode(chunk).split('\n')) {
            if (text === '') continue
            const message: unknown = JSON.parse(text)
            const id = field(message, 'id')
            const method = field(message, 'method')
            if (typeof id !== 'string' || typeof method !== 'string') continue
            log.push({ kind: 'request', id, method })
            if (method === 'server/discover')
              answers?.enqueue(
                line({
                  jsonrpc: '2.0',
                  id,
                  result: { supportedVersions: ['2026-07-28'], capabilities: {} },
                }),
              )
          }
        },
        close() {
          answers?.close()
        },
      }),
      stdout: new ReadableStream<Uint8Array>({
        start(controller) {
          answers = controller
        },
      }),
      stderr: new ReadableStream<string>(),
      exited: new Promise<void>(() => undefined),
      stop: async () => 'tree-confirmed',
    }
  }

  /** Speaks `server/discover` over the pipes and closes them; every other request is not sent. */
  class PipeTransport implements McpTransport {
    readonly generation: Generation
    private readonly writer: WritableStreamDefaultWriter<Uint8Array>
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>
    private sent = 0

    constructor(process: ProcessHandle, at: Generation) {
      this.generation = at
      this.writer = process.stdin.getWriter()
      this.reader = process.stdout.getReader()
    }

    async discover() {
      this.sent += 1
      const id = `r${this.sent}`
      await this.writer.write(line({ jsonrpc: '2.0', id, method: 'server/discover', params: {} }))
      const read = await this.reader.read()
      if (read.done) return { failure: { kind: 'no-answer', cause: 'stream-broken' } } as const
      const versions = field(
        field(JSON.parse(decoder.decode(read.value)), 'result'),
        'supportedVersions',
      )
      const version = Array.isArray(versions) ? versions[0] : undefined
      if (!isProtocolVersion(version))
        return { failure: { kind: 'answer-malformed', what: 'discover-shape' } } as const
      return { ok: { protocolVersion: version, capabilities: json({}) } }
    }

    async listActions() {
      return { failure: { kind: 'not-sent', cause: 'connection-unavailable' } } as const
    }
    async call() {
      return { failure: { kind: 'not-sent', cause: 'connection-unavailable' } } as const
    }
    async cancelRequest() {}
    async getTask() {
      return { failure: { kind: 'not-sent', cause: 'connection-unavailable' } } as const
    }
    async getTaskResult() {
      return { failure: { kind: 'not-sent', cause: 'connection-unavailable' } } as const
    }
    async updateTask() {
      return { failure: { kind: 'not-sent', cause: 'connection-unavailable' } } as const
    }
    async cancelTask() {
      return { failure: { kind: 'not-sent', cause: 'connection-unavailable' } } as const
    }

    async close() {
      await this.writer.close().catch(() => undefined)
      await this.reader.cancel().catch(() => undefined)
    }
  }

  const pipeFixture = (): TransportFixture => ({
    kinds: ['stdio'],
    protocolVersions: ['2026-07-28'],
    async peer(_source, needs) {
      const log: PeerReceived[] = []
      return {
        factory: {
          open: async material =>
            material.kind === 'stdio'
              ? { ok: new PipeTransport(material.process, material.generation) }
              : { failure: { kind: 'not-sent', cause: 'connection-unavailable' } },
        },
        material: {
          kind: 'stdio',
          process: pipedProcess(log),
          generation,
          instructionsByteLimit: needs.instructionsByteLimit ?? 4096,
        },
        received: async () => [...log],
        close: async () => undefined,
      }
    },
  })

  it('T5 stdio: close() closes stdin, then cancels stdout, and does not stop the process (item 9)', async () => {
    const [conformance] = mcpTransportConformance().filter(
      candidate => candidate.clause === 'T5' && candidate.name.startsWith('stdio: close()'),
    )
    if (conformance === undefined) throw new Error('the suite has no T5 close-order case')
    expect(await runConformanceCase(conformance, pipeFixture())).toEqual({ kind: 'passed' })
  })
})

describe('the scripted transport factory', () => {
  const open = async (
    script: PeerScript,
    kind: TransportKind,
    pace?: (received: PeerReceived) => Promise<void>,
    options: ScriptedTransportOptions = {},
  ) => {
    const factory = createScriptedTransportFactory(
      script,
      pace === undefined ? options : { ...options, pace },
    )
    const opened = await factory.open(materialOf({ kind }), new AbortController().signal)
    if ('failure' in opened) throw new Error('did not open')
    return { factory, transport: opened.ok }
  }

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts the stdio probe time from when the pace hook lets the peer answer', async () => {
    const { factory, transport } = await open(
      { initialize: { kind: 'error', error: { code: -32601, message: 'Method not found' } } },
      'stdio',
      () => new Promise<void>(resolve => setTimeout(resolve, 5)),
    )
    const identity = await transport.discover()
    expect('ok' in identity && identity.ok.protocolVersion).toBe('2026-07-28')
    expect(
      factory.received().flatMap(entry => (entry.kind === 'request' ? [entry.method] : [])),
    ).toEqual(['server/discover'])
    await transport.close()
  })

  it('clears the stdio probe timer when the modern answer comes first', async () => {
    vi.useFakeTimers()
    const { transport } = await open({}, 'stdio', undefined, { probeTimeoutMs: 60_000 })
    const identity = await transport.discover()
    expect('ok' in identity).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    await transport.close()
  })

  it('records the MCP request headers of a Streamable HTTP request, and none on stdio', async () => {
    const script: PeerScript = { calls: { echo: { kind: 'result', result: { content: [] } } } }
    for (const kind of ['streamable-http', 'stdio'] as const) {
      const { factory, transport } = await open(script, kind)
      const sent = await transport.call(
        { action: actionNameOf('echo'), args: json({}) },
        new AbortController().signal,
      )
      if ('failure' in sent) throw new Error('not sent')
      await sent.ok.answer
      const [call] = factory.received()
      expect(call?.kind === 'request' ? call.headers : 'not a request').toEqual(
        kind === 'stdio'
          ? undefined
          : {
              'mcp-protocol-version': '2026-07-28',
              'mcp-method': 'tools/call',
              'mcp-name': 'echo',
            },
      )
      await transport.close()
    }
  })

  it('records each request with its method, params, _meta and progress token, and the cancel', async () => {
    const { factory, transport } = await open({ calls: { echo: { kind: 'silent' } } }, 'stdio')
    const sent = await transport.call(
      { action: actionNameOf('echo'), args: json({ city: 'Paris' }) },
      new AbortController().signal,
    )
    if ('failure' in sent) throw new Error('not sent')
    await transport.cancelRequest(sent.ok.requestId)
    const received = factory.received()
    expect(received).toHaveLength(2)
    const [call, cancel] = received
    expect(call?.kind).toBe('request')
    if (call?.kind !== 'request') return
    expect(call.method).toBe('tools/call')
    expect(call.id).toBe(sent.ok.requestId)
    expect(call.params).toMatchObject({
      name: 'echo',
      arguments: { city: 'Paris' },
      _meta: {
        'io.modelcontextprotocol/protocolVersion': '2026-07-28',
        progressToken: sent.ok.requestId,
      },
    })
    expect(cancel).toEqual({
      kind: 'notification',
      method: 'notifications/cancelled',
      params: expect.objectContaining({ requestId: sent.ok.requestId }),
    })
    await transport.close()
  })

  it('delivers arguments of every JSON type to the peer as written, on both material kinds', async () => {
    const args = {
      text: 'Paris',
      count: 3,
      ratio: -0.5,
      yes: true,
      no: false,
      nothing: null,
      none: [],
      empty: {},
      mixed: [1, 'two', null, false, [], {}, { deep: [{ deeper: null }] }],
      nested: { a: { b: { c: [true] } } },
    }
    for (const kind of ['streamable-http', 'stdio'] as const) {
      const { factory, transport } = await open(
        { calls: { echo: { kind: 'result', result: { content: [] } } } },
        kind,
      )
      const sent = await transport.call(
        { action: actionNameOf('echo'), args: json(args) },
        new AbortController().signal,
      )
      if ('failure' in sent) throw new Error(`not sent on ${kind}`)
      await sent.ok.answer
      const [call] = factory.received()
      expect(call?.kind === 'request' ? call.params : undefined, kind).toMatchObject({
        arguments: args,
      })
      await transport.close()
    }
  })

  it('holds the answer until the pace hook lets the peer answer', async () => {
    let release = (): void => undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const { transport } = await open(
      { listing: { '': { kind: 'result', result: { tools: [] } } } },
      'streamable-http',
      () => gate,
    )
    let answered = false
    const listing = transport.listActions().then(page => {
      answered = true
      return page
    })
    await Promise.resolve()
    expect(answered).toBe(false)
    release()
    expect(await listing).toEqual({ ok: { tools: [] } })
    await transport.close()
  })

  it('refuses a legacy version among the versions it speaks on server/discover', () => {
    expect(() =>
      createScriptedTransportFactory({}, { protocolVersions: ['2026-07-28', '2025-11-25'] }),
    ).toThrow(RangeError)
  })

  it('refuses to open on an aborted signal', async () => {
    const factory = createScriptedTransportFactory({})
    const controller = new AbortController()
    controller.abort()
    expect(await factory.open(materialOf({ kind: 'stdio' }), controller.signal)).toEqual({
      failure: { kind: 'not-sent', cause: 'connection-unavailable' },
    })
  })

  it('throws for a script that gives an http reply on stdio material', async () => {
    const { transport } = await open({ calls: { echo: { kind: 'http', status: 401 } } }, 'stdio')
    await expect(
      transport.call(
        { action: actionNameOf('echo'), args: json({}) },
        new AbortController().signal,
      ),
    ).rejects.toThrow(TypeError)
  })
})

describe('the scripted transport stops a request by its phase on every stop (T5, stopAnswerOf)', () => {
  /** A handle that authorizes every request and never answers reportRejection: the refused request stays discovering. */
  const holdingDiscovery = (): HttpCredentialHandle & Readonly<{ reached: Promise<void> }> => {
    let reach = (): void => undefined
    const reached = new Promise<void>(resolve => {
      reach = resolve
    })
    return {
      purpose: 'http-authorization',
      async authorize(headers) {
        headers.set('authorization', 'Bearer test-token')
        return { ok: true }
      },
      reportRejection() {
        reach()
        return new Promise<void>(() => undefined)
      },
      async release() {},
      reached,
    }
  }

  /** A call refused with 401, held in the authorization discovery; the id from what the peer received. */
  const discovering = async () => {
    const credential = holdingDiscovery()
    const factory = createScriptedTransportFactory({
      calls: {
        echo: {
          kind: 'http',
          status: 401,
          headers: { 'www-authenticate': 'Bearer scope="files"' },
        },
      },
    })
    const opened = await factory.open(
      materialOf({ kind: 'streamable-http', credential }),
      new AbortController().signal,
    )
    if ('failure' in opened) throw new Error('did not open')
    const transport = opened.ok
    const call = transport.call(
      { action: actionNameOf('echo'), args: json({}) },
      new AbortController().signal,
    )
    await credential.reached
    const [request] = factory.received()
    if (request?.kind !== 'request') throw new Error('the call did not reach the peer')
    return { factory, transport, call, id: request.id }
  }

  /** The value `promise` settled with, or `pending` when it had not settled within a second. */
  const settledWithin = async <T>(promise: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<'pending'>(resolve => {
      timer = setTimeout(() => resolve('pending'), 1_000)
    })
    try {
      return await Promise.race([promise.then(settled => ({ settled })), late])
    } finally {
      clearTimeout(timer)
    }
  }

  it('cancelRequest on a modern Streamable HTTP request in the authorization discovery settles it as close() does: authorization-required with what was fetched, and no answer stream is ended', async () => {
    const closed = await discovering()
    void closed.transport.close()
    const byClose = await settledWithin(closed.call)

    const cancelled = await discovering()
    await cancelled.transport.cancelRequest(cancelled.id)
    const byCancel = await settledWithin(cancelled.call)

    expect(byClose).toMatchObject({
      settled: { failure: { kind: 'not-sent', cause: 'authorization-required' } },
    })
    expect(byCancel).toEqual(byClose)
    expect(cancelled.factory.received().filter(entry => entry.kind === 'stream-aborted')).toEqual(
      [],
    )
    await cancelled.transport.close()
  })
})
