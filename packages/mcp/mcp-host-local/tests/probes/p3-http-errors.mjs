// P3: what the global fetch (undici) reports for each HTTP failure the transport must classify.
// Run from the package root: node tests/probes/p3-http-errors.mjs
import { createServer } from 'node:http'

const describe = error =>
  `${error?.name}: ${error?.message} | cause=${error?.cause?.code ?? error?.cause?.name ?? error?.cause?.message ?? '-'}`

function listen(handler) {
  return new Promise(resolve => {
    const server = createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

const body = JSON.stringify({ jsonrpc: '2.0', id: 'r1', method: 'server/discover', params: {} })
const post = (url, init = {}) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body, ...init })

// (a) nothing listens on the port.
{
  const { server, port } = await listen(() => {})
  await new Promise(resolve => server.close(resolve))
  try {
    await post(`http://127.0.0.1:${port}/mcp`)
    console.log('(a) refused: resolved?!')
  } catch (error) {
    console.log(`(a) refused: ${describe(error)}`)
  }
}

// (b) the server answered once with Connection: close, then closed; the next fetch must be refused.
{
  let n = 0
  const { server, port } = await listen((req, res) => {
    n += 1
    res.setHeader('connection', 'close')
    res.setHeader('content-type', 'application/json')
    res.end('{"jsonrpc":"2.0","id":"r1","result":{}}')
    server.close()
    server.closeAllConnections()
  })
  const first = await post(`http://127.0.0.1:${port}/mcp`)
  await first.text()
  try {
    await post(`http://127.0.0.1:${port}/mcp`)
    console.log('(b) after close: resolved?!')
  } catch (error) {
    console.log(`(b) after close: ${describe(error)}; requests seen by server=${n}`)
  }
}

// (c) the server reads the request, then destroys the socket before any response head.
{
  const { server, port } = await listen((req, res) => {
    req.on('end', () => res.socket.destroy())
    req.resume()
  })
  try {
    await post(`http://127.0.0.1:${port}/mcp`)
    console.log('(c) reset before head: resolved?!')
  } catch (error) {
    console.log(`(c) reset before head: ${describe(error)}`)
  }
  server.close()
  server.closeAllConnections()
}

// (d) 200 text/event-stream, one event, then the socket is destroyed: what does the body reader see?
{
  const { server, port } = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write(
      'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{}}\n\n',
    )
    setTimeout(() => res.socket.destroy(), 30)
  })
  const response = await post(`http://127.0.0.1:${port}/mcp`)
  const reader = response.body.getReader()
  let chunks = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      chunks += 1
    }
    console.log(`(d) SSE body destroyed: ended cleanly after ${chunks} chunks (no error)`)
  } catch (error) {
    console.log(`(d) SSE body destroyed: ${chunks} chunks then ${describe(error)}`)
  }
  server.close()
  server.closeAllConnections()
}

// (e) a silent server and an AbortSignal: the error shape of a caller abort.
{
  const { server, port } = await listen(() => {})
  const controller = new AbortController()
  setTimeout(() => controller.abort(new Error('closed by the transport')), 30)
  try {
    await post(`http://127.0.0.1:${port}/mcp`, { signal: controller.signal })
    console.log('(e) abort: resolved?!')
  } catch (error) {
    console.log(`(e) abort: ${describe(error)}`)
  }
  server.close()
  server.closeAllConnections()
}

// (f) 200 application/json whose content-length promises more than the body: body read fails.
{
  const { server, port } = await listen((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': '100' })
    res.write('{"jsonrpc":"2.0",')
    setTimeout(() => res.socket.destroy(), 30)
  })
  const response = await post(`http://127.0.0.1:${port}/mcp`)
  try {
    const text = await response.text()
    console.log(`(f) truncated JSON body: resolved with ${JSON.stringify(text)}`)
  } catch (error) {
    console.log(`(f) truncated JSON body: ${describe(error)}`)
  }
  server.close()
  server.closeAllConnections()
}

// (g) a redirect: fetch with redirect 'manual' exposes the 3xx; default follows.
{
  const { server, port } = await listen((req, res) => {
    res.writeHead(302, { location: `http://127.0.0.1:${port}/elsewhere` })
    res.end()
  })
  const manual = await post(`http://127.0.0.1:${port}/mcp`, { redirect: 'manual' })
  console.log(
    `(g) redirect manual: status ${manual.status} type=${manual.type} location=${manual.headers.get('location')}`,
  )
  server.close()
  server.closeAllConnections()
}

// (h) DNS failure shape.
try {
  await post('http://no-such-host.invalid/mcp')
} catch (error) {
  console.log(`(h) dns: ${describe(error)}`)
}
