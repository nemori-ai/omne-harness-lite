import { Session } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/src/session.ts'
import { MemoryLine } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/tests/memory-line.ts'
import { generationOf, actionNameOf, jsonOf } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-values.ts'
const credential: any = { purpose: 'http-authorization', authorize: () => new Promise(() => {}), reportRejection: async () => {}, release: async () => {} }
const line = new MemoryLine('streamable-http', {})
const s = new Session(line, { kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', credential, generation: generationOf(1), instructionsByteLimit: 4096 } as any,
  { clientInfo: { name: 'h', version: '1' }, versions: ['2026-07-28'], probeTimeoutMs: 50, fetchMetadata: async () => undefined, schedule: (ms, f) => { const t = setTimeout(f, ms); return () => clearTimeout(t) } })
const c = new AbortController()
const calling = s.call({ action: actionNameOf('echo'), args: jsonOf({}) } as any, c.signal).then(r => JSON.stringify(r))
c.abort()
const timeout = (ms: number) => new Promise(r => setTimeout(() => r('pending after ' + ms + 'ms'), ms))
console.log('call after signal:', await Promise.race([calling, timeout(1000)]))
const listing = s.listActions().then(r => JSON.stringify(r))
await s.close()
console.log('close returned; listActions:', await Promise.race([listing, timeout(1000)]))
process.exit(0)
