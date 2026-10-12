// One-effect Qwen Max text-array bridge. The six-case sender retains ledger and receipt ownership.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { prepare, run } from './run.mjs'

const original = new URL('./08-qwen3.8-max-0902-english.json', import.meta.url)
const bridge = new URL('./08-qwen3.8-max-0902-english-text-array.json', import.meta.url)
export const bridgeSha256 = '14fa3e510ce17797079c751c818c1e3cfca3300cc10073a8ce98fec87f7f8d78'

export async function prepareBridge(snapshotPath) {
  const cases = await prepare(snapshotPath)
  const sourceBytes = await readFile(original)
  const wire = await readFile(bridge)
  if (createHash('sha256').update(wire).digest('hex') !== bridgeSha256)
    throw new Error('Frozen bridge wire SHA differs')
  const source = JSON.parse(sourceBytes.toString('utf8'))
  const changed = JSON.parse(wire.toString('utf8'))
  if (typeof source.messages?.[0]?.content !== 'string')
    throw new Error('Original Qwen 08 content is no longer plain text')
  const text = source.messages[0].content
  source.messages[0].content = [{ type: 'text', text }]
  if (JSON.stringify(source) !== JSON.stringify(changed))
    throw new Error('Bridge changes more than original 08 message content')
  const item = cases[0]
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'))
  const contextLength = snapshot.cards
    .find(card => card.id === item.model)
    ?.endpoints.find(endpoint => endpoint.tag === item.providerTag)?.contextLength
  if (!Number.isSafeInteger(contextLength) || wire.length > contextLength)
    throw new Error('Bridge exceeds the exact endpoint context used by reservation')
  return [
    {
      ...item,
      number: 1,
      file: '08-qwen3.8-max-0902-english-text-array.json',
      sha256: bridgeSha256,
      wire,
    },
  ]
}

function parse(args) {
  const [command, ...rest] = args
  if (!['dry', 'run'].includes(command) || rest.length % 2 !== 0)
    throw new Error('Choose dry or run with --option value pairs')
  const keys =
    command === 'dry'
      ? ['--snapshot']
      : [
          '--snapshot',
          '--credential-file',
          '--ledger',
          '--approved-ledger',
          '--output',
          '--limit-usd',
          '--research-limit-usd',
          '--timeout-ms',
          '--max-response-bytes',
        ]
  const values = new Map()
  for (let index = 0; index < rest.length; index += 2) {
    if (!keys.includes(rest[index]) || values.has(rest[index]) || !rest[index + 1])
      throw new Error('Invalid, duplicate, or empty bridge option')
    values.set(rest[index], rest[index + 1])
  }
  if (values.size !== keys.length) throw new Error(`Required options: ${keys.join(', ')}`)
  return { command, values }
}

async function main(args) {
  const { command, values } = parse(args)
  const cases = await prepareBridge(values.get('--snapshot'))
  if (command === 'dry') {
    process.stdout.write(
      `${JSON.stringify({ mode: 'dry', requestCount: 1, file: cases[0].file, sha256: bridgeSha256, estimateUsd: cases[0].estimateUsd }, null, 2)}\n`,
    )
    return
  }
  const observations = await run(cases, values)
  process.stdout.write(
    `${JSON.stringify({ mode: 'research-only', completed: observations.length, output: values.get('--output'), original08PromptTokens: 68, bridgePromptTokens: observations[0]?.promptTokens, delta: observations[0]?.promptTokens === undefined ? null : observations[0].promptTokens - 68 })}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
