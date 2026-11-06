// P9: answers without "jsonrpc":"2.0" (bad envelope: T2 says unreadable error object; for call, the whole message).
import { classifyWireEvent } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/index.ts'
import { factory, server, material } from './common.ts'
const seen: string[] = []
const s = await server((req, body, res) => {
  seen.push(body?.method)
  const raw = (o: object) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id: body.id, ...o }))
  if (body?.method === 'server/discover') return seen.filter(m => m === 'server/discover').length === 1
    ? raw({ error: { code: -32022, message: 'x', data: { supported: ['2026-07-28'] } } })
    : res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { supportedVersions: ['2026-07-28'], capabilities: {} } }))
  if (body?.method === 'tools/list') return raw({ error: { code: -32000, message: 'boom' } })
  if (body?.method === 'tools/call') return raw({ error: { code: -32000, message: 'boom' } })
  res.writeHead(202).end()
})
const ctx = (request: any) => ({ id: 'r1', request, session: false, versions: ['2026-07-28'] })
const m = JSON.stringify({ id: 'r1', error: { code: -32000, message: 'boom' } })
console.log('P9 contract class (tools/list, no jsonrpc):', JSON.stringify(classifyWireEvent({ kind: 'http-stream', messages: [m], ended: true }, ctx('tools/list'))))
const f = await factory()
const t = (await f.open(material(s.url), new AbortController().signal)).ok
const d = await t.discover()
console.log('P9 discover with a -32022 lacking jsonrpc: methods sent', seen.join(','), '->', 'ok' in d ? 'ok' : JSON.stringify(d.failure))
const l = await t.listActions()
console.log('P9 listActions:', JSON.stringify(l))
const c = await t.call({ action: 'echo', args: { kind: 'object', entries: [] } }, new AbortController().signal)
console.log('P9 call answer:', JSON.stringify(await c.ok.answer))
await t.close(); s.close()
