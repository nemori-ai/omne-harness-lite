// N3: SSE mode. A tools/list POST is refused (401): the request is in the authorization discovery,
// the metadata fetch still running. Then the shared stream carries an answer with that request's id.
// T5: the first event decides; later ones are dropped. What does listActions() settle with?
import { Session } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/session.ts'
import { MemoryLine } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/tests/memory-line.ts'
import { LEGACY_PROTOCOL_VERSIONS } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/index.ts'
import { generationOf } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-values.ts'
let rejections = 0
const credential: any = { purpose: 'http-authorization', async authorize(h: Headers) { h.set('authorization', 'Bearer t'); return { ok: true } }, async reportRejection() { rejections += 1 }, async release() {} }
const LEGACY = { kind: 'message', message: { result: { protocolVersion: LEGACY_PROTOCOL_VERSIONS[0], capabilities: {} } } }
const line = new MemoryLine('streamable-http', {
  'server/discover': [{ kind: 'message', message: { error: { code: -32601, message: 'Method not found' } } }],
  initialize: [{ kind: 'status', status: 404, headers: {}, body: '<html>nf</html>' }, LEGACY],
  'tools/list': [{ kind: 'status', status: 401, headers: { 'www-authenticate': 'Bearer' }, body: '' }],
} as any, { entry: { kind: 'entered' } } as any)
const s = new Session(line, { kind: 'streamable-http', target: 'https://peer.test/mcp', credential, generation: generationOf(1), instructionsByteLimit: 4096 } as any,
  { clientInfo: { name: 'h', version: '1' }, versions: ['2026-07-28'], probeTimeoutMs: 50, fetchMetadata: () => new Promise(() => {}), schedule: (ms, f) => { const t = setTimeout(f, ms); return () => clearTimeout(t) } })
console.log('N3 discover:', JSON.stringify(await s.discover()))
const listing = s.listActions()
await new Promise(r => setTimeout(r, 20))
const id = (line.requests('tools/list')[0] as any).message.id
console.log('N3 tools/list refused; reportRejection calls:', rejections, '| id', id)
line.push({ jsonrpc: '2.0', id, result: { tools: [] } })
const r = await Promise.race([listing, new Promise(r => setTimeout(() => r('pending'), 300))])
console.log('N3 listActions():', JSON.stringify(r))
await s.close()
process.exit(0)
