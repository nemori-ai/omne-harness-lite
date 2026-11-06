// Probe: -32022 whose data.supported names '2027-01-01x' — scripted transport vs. real session.
const base = '/data/qiwei/repos/omne-harness-lite/.worktrees/w3-mcp-host/packages/mcp'
const { createLocalTransportFactory } = await import(`${base}/mcp-host-local/dist/index.js`)
const { createScriptedTransportFactory } = await import(`${base}/mcp-contract/dist/testing.js`)
const error = { code: -32022, message: 'Unsupported protocol version', data: { supported: ['2027-01-01x'] } }
const material = { kind: 'streamable-http', target: 'http://127.0.0.1:9/mcp', generation: 'g1', instructionsByteLimit: 1000 }
const scripted = createScriptedTransportFactory({ discover: { kind: 'error', error }, initialize: { kind: 'result', result: { protocolVersion: '2025-11-25', capabilities: {} } } })
const s = (await scripted.open(material, new AbortController().signal)).ok
console.log('scripted :', JSON.stringify(await s.discover()).slice(0, 110))
const methods = []
const fakeFetch = async (url, init) => {
  const method = new Headers(init.headers).get('mcp-method'); methods.push(method)
  const body = init.body ? JSON.parse(init.body) : undefined
  const json = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
  if (method === 'server/discover') return json({ jsonrpc: '2.0', id: body.id, error })
  if (method === 'initialize') return json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-11-25', capabilities: {} } })
  return new Response(null, { status: 202 })
}
const real = createLocalTransportFactory({ clientInfo: { name: 'p', version: '0' }, probeTimeoutMs: 300, fetch: fakeFetch })
const r = (await real.open(material, new AbortController().signal)).ok
console.log('session  :', JSON.stringify(await r.discover()).slice(0, 110), '| methods sent:', methods.join(', '))
await r.close(); await s.close()
