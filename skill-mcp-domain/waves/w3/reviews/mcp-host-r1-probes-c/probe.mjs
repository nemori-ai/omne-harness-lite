// Probe: caller signal fires after call() starts but before the HTTP answer head arrives.
const root = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/dist/index.js'
const { createLocalTransportFactory } = await import(root)
const HEAD_DELAY_MS = 3000
let callFetchAborted = false
const fakeFetch = async (url, init) => {
  const headers = new Headers(init.headers)
  const method = headers.get('mcp-method')
  const body = init.body ? JSON.parse(init.body) : undefined
  const json = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
  if (method === 'server/discover')
    return json({ jsonrpc: '2.0', id: body.id, result: { supportedVersions: ['2026-07-28'], capabilities: {} } })
  if (method === 'tools/call')
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(json({ jsonrpc: '2.0', id: body.id, result: { content: [] } })), HEAD_DELAY_MS)
      init.signal?.addEventListener('abort', () => { callFetchAborted = Math.round(performance.now() - globalThis.t0); clearTimeout(t); reject(init.signal.reason) })
    })
  return new Response(null, { status: 202 })
}
const factory = createLocalTransportFactory({ clientInfo: { name: 'p', version: '0' }, probeTimeoutMs: 300, fetch: fakeFetch })
const opened = await factory.open({ kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', generation: 'g1', instructionsByteLimit: 1000 }, new AbortController().signal)
const transport = opened.ok
console.log('discover', JSON.stringify(await transport.discover()).slice(0, 80))
const controller = new AbortController()
const t0 = performance.now(); globalThis.t0 = t0
setTimeout(() => controller.abort(), 100)
const sent = await transport.call({ action: 'echo', args: { kind: 'object', entries: [] } }, controller.signal)
const t1 = performance.now()
console.log('call() returned after ms', Math.round(t1 - t0), 'signal aborted at 100 ms; fetch signal aborted at ms:', callFetchAborted)
console.log('answer', JSON.stringify(await sent.ok?.answer ?? sent))
await transport.close()
