import { Buffer } from 'node:buffer'
import { dirname, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { openDemo } from '../../dist/index.js'
import { runInteractive } from '../../dist/index.js'
import { createLocalTls } from '../local-tls.ts'

const [data, mode] = process.argv.slice(2)
if (!data || !['complete', 'hold', 'http503'].includes(mode))
  throw new Error('explicit data path and controlled mode required')
const tls = await createLocalTls(join(dirname(data), `pty-tls-${process.pid}`))
if (mode === 'hold') tls.setMode('hold')
if (mode === 'http503') tls.setMode('http503')
const credential = Buffer.from('private-controlled-pty-key')
let complete = false
try {
  const retirement = {
    waitMilliseconds: 30,
    force: false,
    schedule(milliseconds, callback) {
      const timer = setTimeout(callback, milliseconds)
      return () => clearTimeout(timer)
    },
  }
  const demo = await openDemo(
    data,
    { multiplier: 1.1, reserveTokens: 256 },
    retirement,
    16384,
    credential,
    {
      developmentTransport: tls.developmentTransport,
    },
  )
  credential.fill(0)
  const result = await runInteractive(demo, process.stdin, process.stdout, true)
  complete = result.complete
  await writeFile(
    join(dirname(data), `pty-models-${process.pid}.json`),
    JSON.stringify({
      models: tls.requests.map(request => request.body.model),
      rawAfter: process.stdin.isRaw === true,
    }),
  )
} finally {
  credential.fill(0)
  await tls.close()
}
if (!complete) process.exitCode = 1
