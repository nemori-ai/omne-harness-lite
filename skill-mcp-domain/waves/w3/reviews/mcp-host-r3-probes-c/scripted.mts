import { createScriptedTransportFactory } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-scripted-transport.ts'
import { generationOf, actionNameOf, jsonOf } from '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-contract/src/testing-values.ts'
const timeout = (ms: number) => new Promise(r => setTimeout(() => r('pending after ' + ms + 'ms'), ms))
async function run(label: string, authorize: (h: Headers) => Promise<any>) {
  const factory = createScriptedTransportFactory({ calls: { echo: [{ kind: 'result', result: { content: [] } }] } } as any, { protocolVersions: ['2026-07-28'] })
  const credential: any = { purpose: 'http-authorization', authorize, reportRejection: async () => {}, release: async () => {} }
  const opened: any = await factory.open({ kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', credential, generation: generationOf(1), instructionsByteLimit: 4096 } as any, new AbortController().signal)
  const t = opened.ok
  const c = new AbortController()
  const calling = t.call({ action: actionNameOf('echo'), args: jsonOf({}) } as any, c.signal).then(async (r: any) => 'ok' in r ? 'SentCall answer=' + JSON.stringify(await r.ok.answer) : JSON.stringify(r))
  c.abort()
  console.log(label, 'call after signal:', await Promise.race([calling, timeout(500)]))
  console.log(label, 'peer received:', JSON.stringify(factory.received().map((m: any) => m.kind + ':' + (m.method ?? ''))))
}
await run('hanging-authorize', () => new Promise(() => {}))
await run('slow-authorize', () => new Promise(r => setTimeout(() => r({ ok: undefined }), 50)))
process.exit(0)
