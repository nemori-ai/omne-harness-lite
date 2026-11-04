// The transport conformance suite on the scripted transport: every case passes on both material
// kinds, and scripted transports that break a clause make the suite fail.
import { AssertionError } from 'node:assert'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isConnectionTarget,
  isGeneration,
  isProtocolVersion,
  type Generation,
} from '@omne-harness/mcp-contract'
import type {
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

function fixtureOf(
  kinds: readonly TransportKind[],
  wrap: Wrap = factory => factory,
): TransportFixture {
  return {
    kinds,
    protocolVersions: ['2026-07-28', '2025-11-25'],
    async peer(source: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer> {
      const script = typeof source === 'function' ? source(target) : source
      const factory = createScriptedTransportFactory(script, {
        protocolVersions: ['2026-07-28', '2025-11-25'],
      })
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

describe('the suite covers the transport clauses and the decided items', () => {
  it('names T1 to T7, the deviation, and items 7 to 12 and 14', () => {
    const cases = mcpTransportConformance()
    const clauses = new Set(cases.flatMap(conformance => conformance.clause.split(', ')))
    for (const clause of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', '偏离'])
      expect(clauses.has(clause), clause).toBe(true)
    const names = cases.map(conformance => conformance.name).join('\n')
    for (const item of [7, 8, 9, 10, 11, 12, 14]) expect(names).toContain(`(item ${item})`)
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
      'streamable-http: a call, tasks/update and tasks/cancel are not re-sent: no-answer (stream-broken) (item 10)',
    ])
  })

  it('a transport that does not report a refused authorization to the handle', async () => {
    expect(
      await failing(() => fixtureOf(['streamable-http', 'stdio'], forgettingRejections)),
    ).toEqual([
      '401: not-sent authorization-required from WWW-Authenticate and the named metadata; reportRejection once (item 11)',
      '401 on listActions without resource_metadata: the well-known URL with the path is tried before the root; reportRejection once (item 11)',
      '401 with no metadata anywhere: metadata unavailable, issuers empty, scopes from the header; reportRejection once (item 11)',
      '401 on discover: authorization-required with no legacy fallback; reportRejection once (item 11)',
      '403 insufficient_scope: authorization-required with the scope of the header; reportRejection once (item 11)',
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
