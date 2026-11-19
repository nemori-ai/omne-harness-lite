// Preload for the server a live matrix run starts: every request to the gateway and the bytes
// of its answer are appended to $LIVE_MATRIX_EXCHANGES as JSON lines. Headers are never written,
// and a line that still looks like it holds a key is replaced by a note that it was withheld.
import https from 'node:https'
import { appendFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'

const file = process.env['LIVE_MATRIX_EXCHANGES']
const SECRET = /sk-or-v1-[0-9a-z]{16,}|bearer\s+\S{16,}/iu
const original = https.request
let next = 0

function write(record) {
  const line = JSON.stringify(record)
  appendFileSync(
    file,
    `${SECRET.test(line) ? JSON.stringify({ ...record, body: null, withheld: 'secret-like' }) : line}\n`,
  )
}

https.request = function (url, ...rest) {
  const request = original.call(this, url, ...rest)
  const href = typeof url === 'string' ? url : String(url?.href ?? url?.hostname ?? '')
  if (file === undefined || !href.includes('openrouter.ai')) return request
  const exchange = (next += 1)
  const end = request.end
  request.end = function (chunk, ...more) {
    if (chunk !== undefined && typeof chunk !== 'function')
      write({
        exchange,
        at: new Date().toISOString(),
        url: href,
        part: 'request',
        body: Buffer.from(chunk).toString('utf8'),
      })
    return end.call(this, chunk, ...more)
  }
  request.on('response', response => {
    const chunks = []
    response.on('data', chunk => chunks.push(Buffer.from(chunk)))
    response.on('end', () =>
      write({
        exchange,
        at: new Date().toISOString(),
        part: 'response',
        status: response.statusCode,
        body: Buffer.concat(chunks).toString('utf8'),
      }),
    )
  })
  return request
}
syncBuiltinESMExports()
