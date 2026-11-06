import { createScriptedTransportFactory } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-scripted-transport.ts'
import { generationOf } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-values.ts'
const timeout = (ms: number) => new Promise(r => setTimeout(() => r('pending after ' + ms + 'ms'), ms))
const factory = createScriptedTransportFactory({ listing: { '': [{ kind: 'result', result: { tools: [] } }] } } as any, { protocolVersions: ['2026-07-28'] })
const credential: any = { purpose: 'http-authorization', authorize: () => new Promise(() => {}), reportRejection: async () => {}, release: async () => {} }
const t: any = (await factory.open({ kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', credential, generation: generationOf(1), instructionsByteLimit: 4096 } as any, new AbortController().signal) as any).ok
const listing = t.listActions().then((r: any) => JSON.stringify(r))
await t.close()
console.log('close returned; listActions:', await Promise.race([listing, timeout(500)]))
process.exit(0)
