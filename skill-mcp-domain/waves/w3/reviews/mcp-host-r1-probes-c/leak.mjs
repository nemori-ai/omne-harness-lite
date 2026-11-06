import './count.mjs'
// Probe: every write of a message nobody waits for (ping responses, notifications) adds an abort
// listener to the session's long-lived closing signal through HttpLine.controllerFor.
const root = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/dist/index.js'
const { createLocalTransportFactory } = await import(root)
const warnings = []
process.on('warning', w => warnings.push(`${w.name}: ${w.message}`))
const PINGS = 50
const fakeFetch = async (url, init) => {
  const headers = new Headers(init.headers)
  const method = headers.get('mcp-method')
  const body = init.body ? JSON.parse(init.body) : undefined
  const json = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
  if (method === 'server/discover')
    return json({ jsonrpc: '2.0', id: body.id, result: { supportedVersions: ['2026-07-28'], capabilities: {} } })
  if (method === 'tools/call') {
    let sse = ''
    for (let i = 0; i < PINGS; i++) sse += `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: `p${i}`, method: 'ping' })}\n\n`
    sse += `event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [] } })}\n\n`
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
  }
  return new Response(null, { status: 202 })
}
const factory = createLocalTransportFactory({ clientInfo: { name: 'p', version: '0' }, probeTimeoutMs: 300, fetch: fakeFetch })
const transport = (await factory.open({ kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', generation: 'g1', instructionsByteLimit: 1000 }, new AbortController().signal)).ok
await transport.discover()
const sent = (await transport.call({ action: 'echo', args: { kind: 'object', entries: [] } }, new AbortController().signal)).ok
console.log('answer', JSON.stringify(await sent.answer).slice(0, 60))
await new Promise(r => setTimeout(r, 200))
console.log('warnings:', warnings); console.log('largest net abort-listener count on one signal (add minus remove, ignoring once-fired):', Math.max(...globalThis.__abortNet.values()))
await transport.close()
