// The public root: the factory and its options, and what `open` does before any request (T9).
import { describe, expect, it } from 'vitest'
import { isConnectionTarget } from '@omne-harness/mcp-contract'
import type {
  HttpCredentialHandle,
  ProcessHandle,
  TransportMaterial,
} from '@omne-harness/mcp-contract/provider'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import {
  createLocalTransportFactory,
  type LocalTransportOptions,
} from '@omne-harness/mcp-host-local'

const OPTIONS: LocalTransportOptions = {
  clientInfo: { name: 'host', version: '1' },
  probeTimeoutMs: 100,
}

const target = (() => {
  const text = 'https://peer.test/mcp'
  if (!isConnectionTarget(text)) throw new Error('bad target')
  return text
})()

function idleProcess(): ProcessHandle & Readonly<{ events: readonly string[] }> {
  const events: string[] = []
  return {
    events,
    stdin: new WritableStream<Uint8Array>({
      write: () => {
        events.push('write')
      },
      close: () => {
        events.push('stdin-closed')
      },
    }),
    stdout: new ReadableStream<Uint8Array>({
      cancel: () => {
        events.push('stdout-cancelled')
      },
    }),
    stderr: new ReadableStream<string>(),
    exited: new Promise<void>(() => undefined),
    stop: async () => {
      events.push('stop')
      return 'tree-confirmed'
    },
  }
}

it('the root entry exports the factory only', async () => {
  const root = (await import('@omne-harness/mcp-host-local')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createLocalTransportFactory'])
})

describe('the options are checked at once (RangeError)', () => {
  it.each([
    ['an empty client name', { ...OPTIONS, clientInfo: { name: '', version: '1' } }],
    ['an empty client version', { ...OPTIONS, clientInfo: { name: 'host', version: '' } }],
    ['a zero probe time', { ...OPTIONS, probeTimeoutMs: 0 }],
    ['a fractional probe time', { ...OPTIONS, probeTimeoutMs: 1.5 }],
    ['a negative probe time', { ...OPTIONS, probeTimeoutMs: -1 }],
  ])('%s', (_what, options) => {
    expect(() => createLocalTransportFactory(options)).toThrow(RangeError)
  })

  it('accepts the smallest valid options', () => {
    expect(() => createLocalTransportFactory({ ...OPTIONS, probeTimeoutMs: 1 })).not.toThrow()
  })
})

describe('open sends nothing and calls no credential handle (T9)', () => {
  const credential = (): HttpCredentialHandle & Readonly<{ calls(): number }> => {
    let calls = 0
    return {
      purpose: 'http-authorization',
      async authorize() {
        calls += 1
        return { ok: true }
      },
      async reportRejection() {},
      async release() {},
      calls: () => calls,
    }
  }

  it('a signal aborted before open answers not-sent, hands over no transport, authorizes nothing', async () => {
    const factory = createLocalTransportFactory(OPTIONS)
    const handle = credential()
    const aborted = AbortSignal.abort()
    const material: TransportMaterial = {
      kind: 'streamable-http',
      target,
      credential: handle,
      generation: generationOf(1),
      instructionsByteLimit: 4096,
    }
    expect(await factory.open(material, aborted)).toEqual({
      failure: { kind: 'not-sent', cause: 'connection-unavailable' },
    })
    expect(handle.calls()).toBe(0)
  })

  it('a signal that fires while a stdio line is being opened closes the line and answers not-sent', async () => {
    const factory = createLocalTransportFactory(OPTIONS)
    const process = idleProcess()
    const controller = new AbortController()
    setImmediate(() => controller.abort())
    const material: TransportMaterial = {
      kind: 'stdio',
      process,
      generation: generationOf(1),
      instructionsByteLimit: 4096,
    }
    expect(await factory.open(material, controller.signal)).toEqual({
      failure: { kind: 'not-sent', cause: 'connection-unavailable' },
    })
    expect(process.events).toEqual(['stdin-closed', 'stdout-cancelled'])
  })

  it('an open on an idle stdio process writes nothing until a request is made', async () => {
    const factory = createLocalTransportFactory(OPTIONS)
    const process = idleProcess()
    const material: TransportMaterial = {
      kind: 'stdio',
      process,
      generation: generationOf(1),
      instructionsByteLimit: 4096,
    }
    const opened = await factory.open(material, new AbortController().signal)
    expect('ok' in opened).toBe(true)
    expect(process.events).toEqual([])
    if ('ok' in opened) await opened.ok.close()
    expect(process.events).toEqual(['stdin-closed', 'stdout-cancelled'])
  })
})

describe('the legacy baseline against SDK 2.4.0', () => {
  it('names the same legacy revisions as the SDK, so the legacy leg talks to its servers', async () => {
    const { SUPPORTED_PROTOCOL_VERSIONS } = await import('@modelcontextprotocol/client')
    const { LEGACY_PROTOCOL_VERSIONS } = await import('@omne-harness/mcp-contract')
    expect([...LEGACY_PROTOCOL_VERSIONS]).toEqual([...SUPPORTED_PROTOCOL_VERSIONS])
  })
})
