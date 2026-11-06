// N2: on a legacy session (SSE mode), a call is still authorizing when another request is told the
// session ended (S07: not-sent(session-ended); the transport is no longer usable). The handle then
// answers. Does the call go out on the wire anyway, and what does it settle with?
import { Session } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/session.ts'
import { MemoryLine } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/tests/memory-line.ts'
import { LEGACY_PROTOCOL_VERSIONS } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/index.ts'
import { generationOf, actionNameOf, jsonOf } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-values.ts'
let hold: (() => void) | undefined
let holdNext = false
const credential: any = {
  purpose: 'http-authorization',
  async authorize(headers: Headers) {
    if (holdNext) { holdNext = false; await new Promise<void>(r => { hold = r }) }
    headers.set('authorization', 'Bearer t'); return { ok: true }
  },
  async reportRejection() {}, async release() {},
}
const LEGACY = { kind: 'message', message: { result: { protocolVersion: LEGACY_PROTOCOL_VERSIONS[0], capabilities: {} } } }
const line = new MemoryLine('streamable-http', {
  'server/discover': [{ kind: 'message', message: { error: { code: -32601, message: 'Method not found' } } }],
  initialize: [{ kind: 'status', status: 404, headers: {}, body: '<html>nf</html>' }, LEGACY],
  'tools/list': [{ kind: 'status', status: 404, headers: {}, body: 'gone' }],
  'tools/call': [{ kind: 'silent' }],
} as any, { entry: { kind: 'entered' } } as any)
const s = new Session(line, { kind: 'streamable-http', target: 'https://peer.test/mcp', credential, generation: generationOf(1), instructionsByteLimit: 4096 } as any,
  { clientInfo: { name: 'h', version: '1' }, versions: ['2026-07-28'], probeTimeoutMs: 50, fetchMetadata: async () => undefined, schedule: (ms, f) => { const t = setTimeout(f, ms); return () => clearTimeout(t) } })
const timeout = (ms: number) => new Promise(r => setTimeout(() => r('pending after ' + ms + 'ms'), ms))
console.log('N2 discover:', JSON.stringify(await s.discover()))
holdNext = true
const calling = s.call({ action: actionNameOf('echo'), args: jsonOf({}) } as any, new AbortController().signal)
await new Promise(r => setTimeout(r, 10))
console.log('N2 listActions:', JSON.stringify(await s.listActions()))
console.log('N2 a request begun now:', JSON.stringify(await s.listActions()))
hold?.()
const r: any = await Promise.race([calling, timeout(500)])
console.log('N2 the call that was authorizing:', JSON.stringify(r))
await new Promise(r => setTimeout(r, 20))
console.log('N2 tools/call messages the line received after the session ended:', line.requests('tools/call').length)
await s.close()
process.exit(0)
