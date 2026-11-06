// Probe: a tool argument whose number lexeme is beyond 2^53 — what goes on the wire?
const root = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp/mcp-host-local/dist/index.js'
const { createLocalTransportFactory } = await import(root)
let sentBody
const fakeFetch = async (url, init) => {
  const method = new Headers(init.headers).get('mcp-method')
  const body = init.body ? JSON.parse(init.body) : undefined
  const json = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
  if (method === 'server/discover')
    return json({ jsonrpc: '2.0', id: body.id, result: { supportedVersions: ['2026-07-28'], capabilities: {} } })
  if (method === 'tools/call') { sentBody = init.body; return json({ jsonrpc: '2.0', id: body.id, result: { content: [] } }) }
  return new Response(null, { status: 202 })
}
const factory = createLocalTransportFactory({ clientInfo: { name: 'p', version: '0' }, probeTimeoutMs: 300, fetch: fakeFetch })
const transport = (await factory.open({ kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', generation: 'g1', instructionsByteLimit: 1000 }, new AbortController().signal)).ok
await transport.discover()
const args = { kind: 'object', entries: [{ key: 'id', value: { kind: 'number', lexeme: '1234567890123456789' } }, { key: 'price', value: { kind: 'number', lexeme: '1.10' } }] }
const sent = (await transport.call({ action: 'echo', args }, new AbortController().signal)).ok
await sent.answer
console.log('args lexemes: id=1234567890123456789 price=1.10')
console.log('on the wire:', sentBody.match(/"arguments":\{[^}]*\}/)[0])
await transport.close()
