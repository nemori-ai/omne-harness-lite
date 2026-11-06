// Probe: a `cancel` that lands while the invoke waits on the build (MC-16 step 8) answers
// `signalled`, but does the invoke return before the build ends?
import { expect, it } from 'vitest'
import {
  actionNameOf,
  correlationKeyOf,
  endpointRefOf,
  jsonOf,
} from '@omne-harness/mcp-contract/testing'
import { settled } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/deferred.ts'
import { alice } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/identities.ts'
import {
  completed,
  listing,
  peer,
  services,
  text,
} from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/peer.ts'
import { stallingLanding } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/stalls.ts'
import {
  adoptStdio,
  storedRecord,
} from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests/doubles/world.ts'

const files = endpointRefOf('files')
const c1 = correlationKeyOf('c1')

it('cancel during the build vs caller abort during the build', async () => {
  for (const how of ['cancel', 'abort'] as const) {
    const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: completed([text('hi')]) } })
    adoptStdio(p, files)
    const stored = await storedRecord(
      p,
      { tenant: alice.tenant, account: { kind: 'anonymous' }, holding: files.holding },
      ['read'],
    )
    const digest = stored.actions[0]!.definitionDigest
    const stalled = stallingLanding(p.landing)
    const { services: s } = services({ ...p, ports: { ...p.ports, landing: stalled.port } })
    const controller = new AbortController()
    let done = false
    const call = s.invoker
      .invoke(alice, {
        ref: files,
        action: actionNameOf('read'),
        args: jsonOf({}),
        expectedDefinition: digest,
        correlationKey: c1,
        signal: controller.signal,
      })
      .then(result => {
        done = true
        return result
      })
    await settled()
    expect(stalled.calls()).toBe(1)
    if (how === 'cancel') expect(await s.invoker.cancel(alice, c1)).toBe('signalled')
    else controller.abort()
    await settled()
    await settled()
    console.log(how, 'invoke settled before the build ended:', done)
    stalled.gate.resolve()
    console.log(how, 'result:', JSON.stringify(await call), 'calls sent:', p.requests('tools/call').length)
  }
})
