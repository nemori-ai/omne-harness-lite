// @module-tag slow — every case starts a scripted peer on a local HTTP server.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import {
  mcpTransportConformance,
  runConformanceCase,
  type PeerNeeds,
  type ScriptSource,
  type ScriptedPeer,
  type TransportFixture,
} from '@omne-harness/mcp-contract/testing'
import { httpPeer, leftoverServers } from './fixtures/scripted/http.ts'

const VERSIONS = ['2026-07-28']

const CLIENT = {
  clientInfo: { name: 'omne-harness-test', version: '0' },
} as const

function fixtureOf(): TransportFixture {
  return {
    protocolVersions: VERSIONS,
    async peer(source: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer> {
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

const NOT_APPLICABLE: Readonly<{ [name: string]: string }> = {
  'T3 legacy: a ping of the peer gets an empty result and any other request -32601, before initialize is answered and after initialized (item 7)':
    'a channel for the requests of the peer after initialized',
}

type Counts = { passed: string[]; notApplicable: Map<string, string>; failed: string[] }

function suite(title: string, expected: readonly string[]): void {
  const counts: Counts = { passed: [], notApplicable: new Map(), failed: [] }
  describe(title, () => {
    afterEach(async () => {
      expect(await leftoverServers(), 'servers left listening').toEqual([])
    })

    for (const conformance of mcpTransportConformance()) {
      const name = `${conformance.clause} ${conformance.name}`
      it(name, async () => {
        let verdict
        try {
          verdict = await runConformanceCase(conformance, fixtureOf())
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
      process.stdout.write(
        `conformance ${title}: passed ${counts.passed.length}, not-applicable ${counts.notApplicable.size}, failed ${counts.failed.length}\n`,
      )
      expect([...counts.notApplicable.keys()].sort()).toEqual([...expected].sort())
    })
  })
}

suite('streamable-http', Object.keys(NOT_APPLICABLE))
