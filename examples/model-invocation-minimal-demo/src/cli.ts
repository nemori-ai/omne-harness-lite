import { parseArgs } from 'node:util'
import { openDemo, readPrivateFile } from './demo.ts'
import { runInteractive } from './interactive.ts'
import { readTokenMargin } from './token-margin.ts'
import type { RetirementPolicy } from '@omne-harness-lite/pi-ai-transport'

const { values } = parseArgs({
  options: {
    data: { type: 'string' },
    'key-file': { type: 'string' },
    'max-output-tokens': { type: 'string' },
    'token-margin-multiplier': { type: 'string' },
    'token-margin-reserve': { type: 'string' },
    'transport-retirement-wait-ms': { type: 'string' },
    help: { type: 'boolean' },
  },
  allowPositionals: false,
})
const tokenMargin = readTokenMargin(
  values['token-margin-multiplier'],
  values['token-margin-reserve'],
)
const outputLimit = values['max-output-tokens'] ?? '16384'
const maxOutputTokens = /^[1-9][0-9]*$/u.test(outputLimit) ? Number(outputLimit) : NaN
const retirementWaitSource = values['transport-retirement-wait-ms'] ?? '10000'
const retirementWaitMilliseconds = /^[1-9][0-9]*$/u.test(retirementWaitSource)
  ? Number(retirementWaitSource)
  : NaN
const retirement: RetirementPolicy = {
  waitMilliseconds: retirementWaitMilliseconds,
  force: false,
  schedule(milliseconds, callback) {
    const timer = setTimeout(callback, milliseconds)
    return () => clearTimeout(timer)
  },
}
if (values.help) {
  process.stdout.write(
    'From repository root: node examples/model-invocation-minimal-demo/dist/cli.js --data /private/new-directory --token-margin-multiplier 1.1 --token-margin-reserve 256 [--key-file /private/openrouter-key] [--max-output-tokens 16384] [--transport-retirement-wait-ms 10000]\nFrom this example directory: node dist/cli.js with the same options.\n--max-output-tokens defaults to 16384; the selected model profile enforces its maximum. --transport-retirement-wait-ms defaults to 10000; force=false. It bounds each retirement wait, not actual cleanup. Both token margin options are required. Admission uses ceil(estimate * multiplier) + reserve; this is not a guaranteed upstream token bound.\nCredential: OPENROUTER_API_KEY, owner-only raw-key file (not .env), or existing encrypted replica. Keys are never command-line values.\n',
  )
} else if (!Number.isSafeInteger(maxOutputTokens)) {
  process.stderr.write('--max-output-tokens must be a positive safe integer. Use --help.\n')
  process.exitCode = 2
} else if (!Number.isSafeInteger(retirementWaitMilliseconds) || retirementWaitMilliseconds <= 0) {
  process.stderr.write(
    '--transport-retirement-wait-ms must be a positive safe integer. Use --help.\n',
  )
  process.exitCode = 2
} else if (!values.data) {
  process.stderr.write('An explicit --data directory is required. Use --help.\n')
  process.exitCode = 2
} else if (tokenMargin === undefined) {
  process.stderr.write(
    'Explicit --token-margin-multiplier >= 1 and --token-margin-reserve integer >= 0 are required. Use --help.\n',
  )
  process.exitCode = 2
} else {
  let credential: Buffer | undefined
  try {
    if (values['key-file'] && process.env.OPENROUTER_API_KEY)
      throw new Error('choose one credential source')
    if (values['key-file']) {
      credential = await readPrivateFile(values['key-file'])
      // A single final newline is a conventional file delimiter, not part of the API key.
      if (credential.at(-1) === 10) {
        const original = credential
        credential = Buffer.from(
          original.subarray(0, original.length - (original.at(-2) === 13 ? 2 : 1)),
        )
        original.fill(0)
      }
    } else if (process.env.OPENROUTER_API_KEY)
      credential = Buffer.from(process.env.OPENROUTER_API_KEY)
    const conversation = await openDemo(
      values.data,
      tokenMargin,
      retirement,
      maxOutputTokens,
      credential,
    )
    credential?.fill(0)
    const result = await runInteractive(
      conversation,
      process.stdin,
      process.stdout,
      !!process.stdin.isTTY,
    )
    if (!result.complete) process.exitCode = 1
  } catch {
    // Never render arbitrary upstream errors, credentials, source references or configuration.
    process.stderr.write(
      'Demo failed. Check the private data/key permissions and setup. No automatic reset or retry was attempted.\n',
    )
    process.exitCode = 1
  } finally {
    credential?.fill(0)
  }
}
