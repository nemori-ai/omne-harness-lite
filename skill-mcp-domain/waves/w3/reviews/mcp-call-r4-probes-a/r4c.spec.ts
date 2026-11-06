import { expect, it } from 'vitest'
import { correlationKeyOf, endpointRefOf, actionNameOf, jsonOf, requestStateOf, type PeerReply } from '@omne-harness/mcp-contract/testing'
const T = '/tmp/r4a/src/packages/mcp/mcp/tests'
const { alice } = await import(`${T}/doubles/identities.ts`)
const { completed, listing, peer, services, text } = await import(`${T}/doubles/peer.ts`)
const { adoptStdio } = await import(`${T}/doubles/world.ts`)
const { reshapedTransports } = await import(`${T}/doubles/transports.ts`)
const files = endpointRefOf('files'); const READ = actionNameOf('read')
const ASKS: PeerReply = { kind: 'result', result: { resultType: 'input_required', requestState: 's1', inputRequests: { q: 1 } } }
it('R4-6 positive control: transport gets frozen judged copies, not the caller objects', async () => {
  const p = peer({ listing: { '': listing([{ name: 'read' }]) }, calls: { read: [ASKS, completed([text('d')])] } })
  adoptStdio(p, files)
  const seen: any[] = []
  const transports = reshapedTransports(p.ports.transports, t => ({ call: (r: any, s: any, o: any) => { seen.push(r); return t.call(r, s, o) } }))
  const { services: s } = services({ ...p, ports: { ...p.ports, transports } })
  await s.discovery.refresh(alice, { ref: files })
  const cur: any = await s.discovery.current(alice, files)
  const args = jsonOf({ a: 1 }); const resp = jsonOf({ q: 'yes' })
  const first: any = await s.invoker.invoke(alice, { ref: files, action: READ, args, expectedDefinition: cur.ok.actions[0].definitionDigest, correlationKey: correlationKeyOf('c0'), signal: new AbortController().signal })
  await s.invoker.continueWithInput(alice, { ref: files, action: READ, args, issuedAt: first.outcome.issuedAt, requestState: requestStateOf('s1'), inputResponses: resp, correlationKey: correlationKeyOf('c1'), signal: new AbortController().signal })
  console.log('R4-6 invoke args: same object =', seen[0].args === args, 'frozen =', Object.isFrozen(seen[0].args), '| continue args same =', seen[1].args === args, 'frozen =', Object.isFrozen(seen[1].args), '| inputResponses same =', seen[1].continuation.inputResponses === resp, 'frozen =', Object.isFrozen(seen[1].continuation.inputResponses))
})
