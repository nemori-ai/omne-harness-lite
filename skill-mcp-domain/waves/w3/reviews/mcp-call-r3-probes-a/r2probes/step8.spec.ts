// Reviewer probe, round 2: MC-16 step 8 ("a stop signal that fired: cancelled, transport call
// count 0"). Sweeps the microtask at which `cancel` lands and records whether `transport.call` is
// entered with a stop signal that has already fired.
import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf } from '@omne-harness/mcp-contract/testing'
const T = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-call/packages/mcp/mcp/tests'
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)
const { reshapedTransports } = await import(`${T}/doubles/transports.ts`)
const files = endpointRefOf('files')
const READ = actionNameOf('read')

it('STEP8: cancel landing k microtasks after invoke', async () => {
  const rows: string[] = []
  for (let k = 0; k < 400; k++) {
    const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: completed([text('x')]) } })
    adoptStdio(p, files)
    const entered: boolean[] = []
    const transports = reshapedTransports(p.ports.transports, t => ({
      call: (r: any, stop: AbortSignal, o: any) => { entered.push(stop.aborted); return t.call(r, stop, o) },
    }))
    const { services: s } = services({ ...p, ports: { ...p.ports, transports } })
    await s.discovery.refresh(alice, { ref: files })
    const cur = await s.discovery.current(alice, files)
    if (!('ok' in cur) || cur.ok.kind !== 'acquired') throw new Error('not acquired')
    const call = s.invoker.invoke(alice, { ref: files, action: READ, args: jsonOf({}), expectedDefinition: cur.ok.actions[0]!.definitionDigest, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
    for (let i = 0; i < k; i++) await Promise.resolve()
    const answer = await s.invoker.cancel(alice, correlationKeyOf('c1'))
    const r = await call
    const row = `k=${k} cancel=${answer} callEntered=${JSON.stringify(entered)} result=${r.kind}/${r.kind === 'sent' ? r.outcome.kind : r.reason.kind} tools/call=${p.requests('tools/call').length}`
    if (entered.includes(true)) rows.push(row)
    if (k % 50 === 0 || entered.includes(true)) console.log(row)
    if (answer === 'no-call-in-flight') break
  }
  console.log('STEP8 rows with call entered on a fired stop:', rows.length)
})
