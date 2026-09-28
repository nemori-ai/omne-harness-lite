import { Buffer } from 'node:buffer'
import { dirname, join } from 'node:path'
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
  const demo = await openDemo(data, credential, { developmentTransport: tls.developmentTransport })
  credential.fill(0)
  const result = await runInteractive(demo, process.stdin, process.stdout, true)
  complete = result.complete
} finally {
  credential.fill(0)
  await tls.close()
}
if (!complete) process.exitCode = 1
