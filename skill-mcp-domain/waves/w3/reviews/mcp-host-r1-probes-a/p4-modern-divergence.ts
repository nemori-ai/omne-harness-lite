// P4: -32022 whose data.supported names only ["DRAFT-2026-v1"]: the contract's class vs the session's conclusion.
import { classifyWireEvent } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/index.ts'
import { isModernProtocolVersion } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/revisions.ts'
import { factory, server, material } from './common.ts'
const V = process.argv[2] ?? 'DRAFT-2026-v1'
const seen: string[] = []
const s = await server((req, body, res) => {
  seen.push(body?.method)
  const json = (o: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, ...o }))
  if (body?.method === 'server/discover') return json({ error: { code: -32022, message: 'unsupported', data: { supported: [V] } } })
  if (body?.method === 'initialize') return json({ result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 's', version: '1' } } })
  res.writeHead(202).end()
})
const msg = JSON.stringify({ jsonrpc: '2.0', id: 'r1', error: { code: -32022, message: 'unsupported', data: { supported: [V] } } })
console.log('P4 isModernProtocolVersion(', V, ') =', isModernProtocolVersion(V))
console.log('P4 contract class:', JSON.stringify(classifyWireEvent({ kind: 'http-stream', messages: [msg], ended: true }, { id: 'r1', request: 'discover', session: false, versions: ['2026-07-28'] })))
const f = await factory()
const t = (await f.open(material(s.url), new AbortController().signal)).ok
const d = await t.discover()
console.log('P4 session discover():', 'ok' in d ? 'ok (identity, protocolVersion ' + d.ok.protocolVersion + ')' : JSON.stringify(d.failure), 'methods sent:', seen.join(','))
await t.close(); s.close()
