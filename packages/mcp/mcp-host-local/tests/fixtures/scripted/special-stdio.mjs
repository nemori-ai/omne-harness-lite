// stdio peers that do what no script can say: write what is not JSON, write a line above the
// byte bound, end stdout and stay alive, or exit at a chosen moment. The mode is argv[2]. Every
// request gets a modern `server/discover` answer or an empty result, after the mode's act.
import { createInterface } from 'node:readline'

const mode = process.argv[2] ?? 'noisy'
const MODERN = { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } }

function write(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`)
}

function answer(message) {
  const result = message.method === 'server/discover' ? MODERN : { content: [] }
  write({ id: message.id, result })
}

if (mode === 'exit-at-start') process.exit(0)

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY })
lines.on('line', line => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id === undefined) return
  switch (mode) {
    case 'noisy':
      // A log line, an empty line, a BOM, a truncated object, a duplicate key: all dropped (F4).
      process.stdout.write(
        'Listening on stdio\n\n﻿{"jsonrpc":"2.0","id":"x","result":{}}\n{"jsonrpc":"2.0","id":"x"\n{"jsonrpc":"2.0","id":"x","result":{},"result":{}}\n',
      )
      answer(message)
      return
    case 'huge-line':
      process.stdout.write(`${'x'.repeat(16_777_217)}\n`, () => answer(message))
      return
    case 'end-stdout':
      process.stdout.end()
      return
    case 'exit-before-answer':
      process.exit(3)
    case 'answer-then-exit':
      write({
        id: message.id,
        result: message.method === 'server/discover' ? MODERN : { content: [] },
      })
      process.exit(0)
    default:
      answer(message)
  }
})
lines.on('close', () => setTimeout(() => process.exit(0), 50))
