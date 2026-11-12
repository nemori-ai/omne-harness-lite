// The public root: the factory and its options, and what `open` does before any request (T9).
import { describe, expect, it } from 'vitest'
import { isConnectionTarget } from '@omne-harness/mcp-contract'
import type { HttpCredentialHandle, TransportMaterial } from '@omne-harness/mcp-contract/provider'
import { generationOf } from '@omne-harness/mcp-contract/testing'
import {
  createLocalTransportFactory,
  type LocalTransportOptions,
} from '@omne-harness/mcp-host-local'

const OPTIONS: LocalTransportOptions = {
  clientInfo: { name: 'host', version: '1' },
}

const target = (() => {
  const text = 'https://peer.test/mcp'
  if (!isConnectionTarget(text)) throw new Error('bad target')
  return text
})()

it('the root entry exports the factory only', async () => {
  const root = (await import('@omne-harness/mcp-host-local')) as Record<string, unknown>
  expect(Object.keys(root)).toEqual(['createLocalTransportFactory'])
})

describe('the options are checked at once (RangeError)', () => {
  it.each([
    ['an empty client name', { ...OPTIONS, clientInfo: { name: '', version: '1' } }],
    ['an empty client version', { ...OPTIONS, clientInfo: { name: 'host', version: '' } }],
  ])('%s', (_what, options) => {
    expect(() => createLocalTransportFactory(options)).toThrow(RangeError)
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
})

describe('the legacy baseline against SDK 2.4.0', () => {
  it('names the same legacy revisions as the SDK, so the legacy leg talks to its servers', async () => {
    const { SUPPORTED_PROTOCOL_VERSIONS } = await import('@modelcontextprotocol/client')
    const { LEGACY_PROTOCOL_VERSIONS } = await import('@omne-harness/mcp-contract')
    expect([...LEGACY_PROTOCOL_VERSIONS]).toEqual([...SUPPORTED_PROTOCOL_VERSIONS])
  })
})
