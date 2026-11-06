// Legacy Streamable HTTP with a session. A listActions gets 404 (S07: session-ended, transport unusable).
// A call whose authorize is held until after that 404: is it still sent on the wire?
const W = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp'
const { Session } = await import(W + '/mcp-host-local/src/session.ts')
const { MemoryLine } = await import(W + '/mcp-host-local/tests/memory-line.ts')
const { generationOf, actionNameOf, jsonOf } = await import(W + '/mcp-contract/src/testing-values.ts')
const { LEGACY_PROTOCOL_VERSIONS } = await import(W + '/mcp-contract/src/revisions.ts')
const tick = () => new Promise<void>(r => setTimeout(r, 0))
let n = 0
let release = () => {}
const held = new Promise<void>(r => { release = r })
const credential: any = { purpose: 'http-authorization',
  async authorize(h: Headers) { n += 1; if (n === 5) await held; h.set('authorization', 'Bearer t'); return { ok: true } },
  async reportRejection() {}, async release() {} }
const line = new MemoryLine('streamable-http', {
  'server/discover': [{ kind: 'message', message: { error: { code: -32601, message: 'Method not found' } } }],
  initialize: [{ kind: 'message', message: { result: { protocolVersion: LEGACY_PROTOCOL_VERSIONS[0], capabilities: {} } }, headers: { 'mcp-session-id': 's1' } }],
  'tools/list': [{ kind: 'status', status: 404, body: 'gone' }],
  'tools/call': [{ kind: 'silent' }],
})
const s = new Session(line, { kind: 'streamable-http', target: 'https://peer.test/mcp', credential, generation: generationOf(1), instructionsByteLimit: 4096 },
  { clientInfo: { name: 'h', version: '1' }, versions: ['2026-07-28'], probeTimeoutMs: 50, fetchMetadata: async () => undefined, schedule: (ms: number, f: () => void) => { const t = setTimeout(f, ms); return () => clearTimeout(t) } })
console.log('discover', JSON.stringify(await s.discover()).slice(0, 60), 'authorizations', n)
const listing = s.listActions()   // authorization 4
const c = new AbortController()
const calling = s.call({ action: actionNameOf('echo'), args: jsonOf({}) }, c.signal) // authorization 5, held
console.log('listActions', JSON.stringify(await listing))
release()
for (let i = 0; i < 10; i++) await tick()
console.log('tools/call reached the line after session-ended:', line.requests('tools/call').length)
const r: any = await Promise.race([calling, new Promise(r => setTimeout(() => r('pending'), 300))])
console.log('call:', typeof r === 'string' ? r : JSON.stringify('ok' in r ? { ok: r.ok.requestId } : r))
console.log('a later listActions:', JSON.stringify(await s.listActions()))
await s.close()
process.exit(0)
