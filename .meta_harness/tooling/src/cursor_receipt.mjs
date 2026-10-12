import { appendFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const destination = process.env.OMNE_CURSOR_PROBE_OUTPUT
try {
  if (!destination) throw new Error('OMNE_CURSOR_PROBE_OUTPUT is required')
  mkdirSync(destination, { recursive: true })
  const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  appendFileSync(
    resolve(destination, 'hook-receipts.jsonl'),
    `${JSON.stringify({
      event: process.argv[2],
      cwd: process.cwd(),
      plugin_root: process.env.CURSOR_PLUGIN_ROOT,
      payload,
    })}\n`,
  )
} catch (error) {
  process.stderr.write(`Cursor probe receipt failed: ${error.message}\n`)
}
process.stdout.write('{}\n')
