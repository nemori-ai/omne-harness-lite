// @module-tag slow — every case spawns a scripted peer in a child process on real pipes.
// The contract's transport conformance suite on the real lines (MC3-9): every case runs on a
// fresh scripted peer; passed, failed and not-applicable are counted apart, and the set of
// not-applicable cases is pinned with its reasons.
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { McpTransportFactory } from '@omne-harness/mcp-contract/provider'
import {
  mcpTransportConformance,
  runConformanceCase,
  type PeerNeeds,
  type ScriptSource,
  type ScriptedPeer,
  type TransportFixture,
} from '@omne-harness/mcp-contract/testing'
import { Session } from '../src/session.ts'
import { StdioLine } from '../src/stdio-line.ts'
import { leftover } from './fixtures/scripted/children.ts'
import { stdioPeer } from './fixtures/scripted/stdio.ts'

const VERSIONS = ['2026-07-28']
const NOT_SENT = { kind: 'not-sent', cause: 'connection-unavailable' } as const

/** The factory under test on stdio material; the public factory arrives with the HTTP line. */
const factory: McpTransportFactory = {
  async open(material, signal) {
    if (signal.aborted || material.kind !== 'stdio') return { failure: NOT_SENT }
    const line = new StdioLine(material.process)
    await line.ready()
    if (signal.aborted) {
      await line.close()
      return { failure: NOT_SENT }
    }
    return {
      ok: new Session(line, material, {
        clientInfo: { name: 'omne-harness-test', version: '0' },
        versions: VERSIONS,
        probeTimeoutMs: 200,
        fetchMetadata: async () => undefined,
      }),
    }
  },
}

function stdioFixture(): TransportFixture {
  return {
    kinds: ['stdio'],
    protocolVersions: VERSIONS,
    async peer(source: ScriptSource, needs: PeerNeeds): Promise<ScriptedPeer> {
      const script = typeof source === 'function' ? source('https://peer.test/mcp') : source
      const peer = await stdioPeer(script, needs, VERSIONS)
      return { factory, material: peer.material, received: peer.received, close: peer.close }
    },
  }
}

/**
 * The cases that are not applicable on stdio material, with the reason. A case that needs
 * Streamable HTTP material is not applicable on a stdio-only fixture by the suite's own rule;
 * X02 has two cells (`discover-retry` and `initialize` × `unsent`) that a real stdio process
 * cannot realize: a request fails before it leaves only when the process exited before the
 * transport opened, so only the first exchange of a connection can be `unsent` (design Q8).
 */
const NOT_APPLICABLE_STDIO: Readonly<{ [name: string]: string }> = {
  'T8 [X02] discover, discover-retry, initialize … (8) × unsent → not-sent (connection-unavailable), unusable':
    'a stdio process that fails a later request before it leaves',
}

type Counts = { passed: string[]; notApplicable: Map<string, string>; failed: string[] }
const counts: Counts = { passed: [], notApplicable: new Map(), failed: [] }

describe('mcpTransportConformance on the stdio line', () => {
  afterEach(async () => {
    expect(await leftover(), 'child processes left alive').toEqual([])
  })

  for (const conformance of mcpTransportConformance()) {
    const name = `${conformance.clause} ${conformance.name}`
    it(name, async () => {
      let verdict
      try {
        verdict = await runConformanceCase(conformance, stdioFixture())
      } catch (failure) {
        counts.failed.push(name)
        throw failure
      }
      if (verdict.kind === 'passed') {
        counts.passed.push(name)
        return
      }
      counts.notApplicable.set(name, verdict.handle)
      if (verdict.handle === 'streamable-http material') return
      expect(NOT_APPLICABLE_STDIO[name], `${name} is not applicable: ${verdict.handle}`).toBe(
        verdict.handle,
      )
    })
  }

  afterAll(() => {
    const http = [...counts.notApplicable.values()].filter(
      handle => handle === 'streamable-http material',
    ).length
    const other = [...counts.notApplicable.entries()].filter(
      ([, handle]) => handle !== 'streamable-http material',
    )
    // The counts of MC3-9, for the report: passed, not applicable (HTTP material, other), failed.
    process.stdout.write(
      `conformance stdio: passed ${counts.passed.length}, not-applicable ${counts.notApplicable.size} (streamable-http material ${http}, other ${other.length}), failed ${counts.failed.length}\n`,
    )
    expect(other.map(([name]) => name).sort()).toEqual(Object.keys(NOT_APPLICABLE_STDIO).sort())
  })
})
