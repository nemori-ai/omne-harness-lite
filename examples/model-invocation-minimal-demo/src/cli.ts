import { parseArgs } from 'node:util'
import { createDemoSupervisor } from './demo-supervisor.ts'
import { runInteractive } from './interactive.ts'
import { readTokenMargin } from './token-margin.ts'

const { values } = parseArgs({
  options: {
    data: { type: 'string' },
    'key-file': { type: 'string' },
    'max-output-tokens': { type: 'string' },
    'token-margin-multiplier': { type: 'string' },
    'token-margin-reserve': { type: 'string' },
    'transport-retirement-wait-ms': { type: 'string' },
    'ipc-max-message-bytes': { type: 'string' },
    'ipc-max-commands': { type: 'string' },
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
const packetSource = values['ipc-max-message-bytes'] ?? '1048576'
const maxPacketBytes = /^[1-9][0-9]*$/u.test(packetSource) ? Number(packetSource) : NaN
const commandsSource = values['ipc-max-commands'] ?? '1'
const maxCommands = /^[1-9][0-9]*$/u.test(commandsSource) ? Number(commandsSource) : NaN
if (values.help) {
  process.stdout.write(
    'From repository root: node examples/model-invocation-minimal-demo/dist/cli.js --data /private/new-directory --token-margin-multiplier 1.1 --token-margin-reserve 256 [--key-file /private/openrouter-key] [--max-output-tokens 16384] [--transport-retirement-wait-ms 10000] [--ipc-max-message-bytes 1048576] [--ipc-max-commands 1]\nFrom this example directory: node dist/cli.js with the same options.\n--max-output-tokens defaults to 16384; the selected model profile enforces its maximum. --transport-retirement-wait-ms defaults to 10000; force=false. Both token margin options are required. Admission uses ceil(estimate * multiplier) + reserve; this is not a guaranteed upstream token bound.\nCredential: OPENROUTER_API_KEY, owner-only raw-key file (not .env), or existing encrypted replica. Keys are never command-line values.\n',
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
} else if (
  !Number.isSafeInteger(maxPacketBytes) ||
  maxPacketBytes <= 0 ||
  !Number.isSafeInteger(maxCommands) ||
  maxCommands <= 0
) {
  process.stderr.write('IPC bounds must be positive safe integers. Use --help.\n')
  process.exitCode = 2
} else {
  try {
    if (values['key-file'] && process.env.OPENROUTER_API_KEY)
      throw new Error('choose one credential source')
    const supervisor = createDemoSupervisor({
      dataDirectory: values.data,
      ...(values['key-file'] === undefined ? {} : { keyFile: values['key-file'] }),
      multiplier: values['token-margin-multiplier'] ?? '',
      reserveTokens: values['token-margin-reserve'] ?? '',
      maxOutputTokens,
      retirementWaitMilliseconds,
      maxPacketBytes,
      maxCommands,
      dedicatedRoot: true,
    })
    const conversation = await supervisor.open()
    const result = await runInteractive(
      conversation,
      process.stdin,
      process.stdout,
      !!process.stdin.isTTY,
    )
    const closed = await supervisor.close()
    if (!result.complete || !closed.complete) process.exitCode = 1
  } catch {
    // Never render arbitrary upstream errors, credentials, source references or configuration.
    process.stderr.write(
      'Demo failed. Check the private data/key permissions and setup. No automatic reset or retry was attempted.\n',
    )
    process.exitCode = 1
  }
}
