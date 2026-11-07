// @module-tag slow — every case spawns a scripted peer in a child process or on a local HTTP server.
// The contract's transport conformance suite on the real lines (MC3-9): every case runs on a
// fresh scripted peer; passed, failed and not-applicable are counted apart, and the set of
// not-applicable cases is pinned with its reasons.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { createLocalTransportFactory } from '@omne-harness/mcp-host-local'
import {
  mcpTransportConformance,
  runConformanceCase,
  type PeerNeeds,
  type ScriptSource,
  type ScriptedPeer,
  type TransportFixture,
  type TransportKind,
} from '@omne-harness/mcp-contract/testing'
import { leftover } from './fixtures/scripted/children.ts'
import { httpPeer, leftoverServers } from './fixtures/scripted/http.ts'
import { stdioPeer } from './fixtures/scripted/stdio.ts'

const VERSIONS = ['2026-07-28']

const CLIENT = {
  clientInfo: { name: 'omne-harness-test', version: '0' },
  probeTimeoutMs: 200,
} as const

const factory = createLocalTransportFactory(CLIENT)

function fixtureOf(kinds: readonly TransportKind[]): TransportFixture {
  return {
    kinds,
    protocolVersions: VERSIONS,
    async peer(source: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer> {
      if (needs.kind === 'stdio') {
        const script = typeof source === 'function' ? source('https://peer.test/mcp') : source
        const peer = await stdioPeer(script, needs, VERSIONS)
        return { factory, material: peer.material, received: peer.received, close: peer.close }
      }
      const peer = await httpPeer(source, needs, VERSIONS, CLIENT)
      return {
        factory: peer.factory,
        material: peer.material,
        received: peer.received,
        close: peer.close,
      }
    },
  }
}

/**
 * The cases that are not applicable on the real lines, with the reason the fixture gives. A
 * fixture of both kinds runs every case; a case picks the first kind unless it names one.
 * - X02 on stdio: a request fails before it leaves only when the process exited before the
 *   transport opened, so only the first exchange of a connection can be `unsent`; the
 *   `discover-retry` and `initialize` cells are not realizable (design Q8).
 * - The peer's requests after `notifications/initialized` on Streamable HTTP: this transport
 *   opens no GET stream, so the peer has no channel for them (design §8.1).
 */
const NOT_APPLICABLE: Readonly<{ [name: string]: string }> = {
  'T8 [X02] discover, discover-retry, initialize … (8) × unsent → not-sent (connection-unavailable), unusable':
    'a stdio process that fails a later request before it leaves',
  'T3 legacy: a ping of the peer gets an empty result and any other request -32601, before initialize is answered and after initialized (item 7)':
    'a channel for the requests of the peer after initialized',
}

type Counts = { passed: string[]; notApplicable: Map<string, string>; failed: string[] }

function suite(title: string, kinds: readonly TransportKind[], expected: readonly string[]): void {
  const counts: Counts = { passed: [], notApplicable: new Map(), failed: [] }
  describe(title, () => {
    afterEach(async () => {
      expect(await leftover(), 'child processes left alive').toEqual([])
      expect(await leftoverServers(), 'servers left listening').toEqual([])
    })

    for (const conformance of mcpTransportConformance()) {
      const name = `${conformance.clause} ${conformance.name}`
      it(name, async () => {
        let verdict
        try {
          verdict = await runConformanceCase(conformance, fixtureOf(kinds))
        } catch (failure) {
          counts.failed.push(name)
          throw failure
        }
        if (verdict.kind === 'passed') {
          counts.passed.push(name)
          return
        }
        counts.notApplicable.set(name, verdict.handle)
        expect(NOT_APPLICABLE[name], `${name} is not applicable: ${verdict.handle}`).toBe(
          verdict.handle,
        )
      })
    }

    afterAll(() => {
      // The counts of MC3-9, for the report.
      process.stdout.write(
        `conformance ${title}: passed ${counts.passed.length}, not-applicable ${counts.notApplicable.size}, failed ${counts.failed.length}\n`,
      )
      expect([...counts.notApplicable.keys()].sort()).toEqual([...expected].sort())
    })
  })
}

const names = Object.keys(NOT_APPLICABLE)
suite(
  'stdio first',
  ['stdio', 'streamable-http'],
  names.filter(name => name.includes('[X02]')),
)
suite('streamable-http first', ['streamable-http', 'stdio'], names)
