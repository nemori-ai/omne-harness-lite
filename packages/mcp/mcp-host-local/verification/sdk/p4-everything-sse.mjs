// P4: the reference server in `sse` and `streamableHttp` modes, driven with raw fetch: which
// answers the legacy signals are, and what the legacy HTTP+SSE exchange looks like on the wire.
// Run from the package root: node verification/sdk/p4-everything-sse.mjs
// The reference server is this package's devDependency @modelcontextprotocol/server-everything
// 2.1.0. Each mode listens on a free local port.
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

const BIN = fileURLToPath(new URL('../../node_modules/.bin/mcp-server-everything', import.meta.url))

/** A local port that nothing listens on now. */
function freePort() {
  return new Promise(resolve => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function start(mode, port) {
  const child = spawn(BIN, [mode], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  child.stdout.on('data', () => {})
  const up = new Promise(resolve => {
    child.stderr.on('data', chunk => {
      if (/listening|running|started|port/iu.test(String(chunk))) resolve()
    })
    setTimeout(resolve, 2500)
  })
  return { child, up }
}

const stop = child => {
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // The process group is gone already.
  }
}

const envelope = version => ({
  'io.modelcontextprotocol/protocolVersion': version,
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'probe', version: '0' },
})
const discover = JSON.stringify({
  jsonrpc: '2.0',
  id: 'r1',
  method: 'server/discover',
  params: { _meta: envelope('2026-07-28') },
})
const initialize = JSON.stringify({
  jsonrpc: '2.0',
  id: 'r2',
  method: 'initialize',
  params: {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'probe', version: '0' },
    _meta: envelope('2025-11-25'),
  },
})
const headers = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2026-07-28',
  'mcp-method': 'server/discover',
}

async function show(label, response) {
  const text = await response.text().catch(() => '<unreadable>')
  console.log(
    `${label}: ${response.status} ${response.headers.get('content-type') ?? '-'} ${JSON.stringify(text.slice(0, 160))}`,
  )
}

// ---- sse mode ----
{
  const port = await freePort()
  const { child, up } = start('sse', port)
  await up
  const base = `http://127.0.0.1:${port}`
  await show(
    'sse POST /sse discover',
    await fetch(`${base}/sse`, { method: 'POST', headers, body: discover }),
  )
  await show(
    'sse POST /sse initialize',
    await fetch(`${base}/sse`, { method: 'POST', headers, body: initialize }),
  )
  await show(
    'sse POST / discover',
    await fetch(`${base}/`, { method: 'POST', headers, body: discover }),
  )
  {
    const r = await fetch(`${base}/sse`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(800),
    }).catch(e => e)
    console.log(
      `sse GET /sse without Accept sse: ${r instanceof Response ? `${r.status} ${r.headers.get('content-type')} (stream stays open)` : r.name}`,
    )
  }
  // The legacy exchange: GET /sse, endpoint event, POST initialize to the endpoint.
  const controller = new AbortController()
  const stream = await fetch(`${base}/sse`, {
    headers: { accept: 'text/event-stream' },
    signal: controller.signal,
  })
  console.log(`sse GET /sse: ${stream.status} ${stream.headers.get('content-type')}`)
  const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  const readUntil = async predicate => {
    for (;;) {
      if (predicate(buffer)) return
      const next = await reader.read()
      if (next.done) return
      buffer += next.value
    }
  }
  await readUntil(text => text.includes('event: endpoint'))
  const endpointLine = buffer.split('\n').find(line => line.startsWith('data:')) ?? ''
  const endpoint = new URL(endpointLine.slice(5).trim(), base).href
  console.log(`sse endpoint event: ${JSON.stringify(endpointLine)} -> ${endpoint}`)
  buffer = ''
  const posted = await fetch(endpoint, { method: 'POST', headers, body: initialize })
  await show('sse POST endpoint initialize', posted)
  await readUntil(text => text.includes('"id":"r2"'))
  console.log(`sse stream carried: ${JSON.stringify(buffer.slice(0, 220))}`)
  // A modern discover POSTed to the endpoint of a legacy session.
  buffer = ''
  const posted2 = await fetch(endpoint, { method: 'POST', headers, body: discover })
  await show('sse POST endpoint discover', posted2)
  await Promise.race([
    readUntil(text => text.includes('"id":"r1"')),
    new Promise(r => setTimeout(r, 500)),
  ])
  console.log(`sse stream after discover: ${JSON.stringify(buffer.slice(0, 220))}`)
  // An unknown session.
  await show(
    'sse POST endpoint unknown session',
    await fetch(`${base}/message?sessionId=nope`, { method: 'POST', headers, body: initialize }),
  )
  controller.abort()
  stop(child)
}

// ---- streamableHttp mode ----
{
  const port = await freePort()
  const { child, up } = start('streamableHttp', port)
  await up
  const base = `http://127.0.0.1:${port}`
  await show(
    'http POST /mcp discover',
    await fetch(`${base}/mcp`, { method: 'POST', headers, body: discover }),
  )
  {
    const r = await fetch(`${base}/mcp`, {
      headers: { accept: 'text/event-stream' },
      signal: AbortSignal.timeout(800),
    }).catch(e => e)
    console.log(
      `http GET /mcp: ${r instanceof Response ? `${r.status} ${r.headers.get('content-type')}` : r.name}`,
    )
  }
  await show(
    'http POST /mcp initialize (legacy)',
    await fetch(`${base}/mcp`, { method: 'POST', headers, body: initialize }),
  )
  await show(
    'http POST /mcp with unknown session',
    await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { ...headers, 'mcp-session-id': 'nope' },
      body: initialize,
    }),
  )
  await show(
    'http POST /sse discover',
    await fetch(`${base}/sse`, { method: 'POST', headers, body: discover }),
  )
  stop(child)
}
