#!/usr/bin/env node
import { originRepository, runGhText, spawnGhForward } from './events-gh.ts'
import { serveReceiver } from './events-receiver.ts'
import { InputError } from './protocol.ts'
import { repositoryFile } from './repository-files.ts'

const usage =
  'Usage: events-receiver-cli.ts serve --port <port> [--file <event file>] [--repo <owner/name>] [--secret <secret>]'

function options(args: string[]): Map<string, string> {
  const [first, ...rest] = args
  if (first !== 'serve') throw new InputError(usage)
  const allowed = ['--port', '--file', '--repo', '--secret'],
    values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index] ?? '',
      value = rest[index + 1]
    if (
      !allowed.includes(flag) ||
      value === undefined ||
      value.startsWith('--') ||
      values.has(flag)
    )
      throw new InputError(usage)
    values.set(flag, value)
  }
  return values
}

try {
  const values = options(process.argv.slice(2))
  const port = Number(values.get('--port'))
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new InputError(usage)
  const repository = values.get('--repo') ?? originRepository(),
    secret = values.get('--secret')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new InputError(usage)
  const stopped = new Promise<void>(resolve => {
    process.once('SIGINT', () => resolve())
    process.once('SIGTERM', () => resolve())
  })
  process.exitCode = await serveReceiver({
    port,
    file: values.get('--file') ?? repositoryFile('tmp/github-events/events.jsonl'),
    repository,
    ...(secret === undefined ? {} : { secret }),
    gh: runGhText,
    spawnForward: spawnGhForward,
    stopped,
    log: message => process.stderr.write(`${message}\n`),
  })
} catch (error) {
  const message =
    error instanceof InputError
      ? error.message
      : 'Cannot start the receiver or read the forwarder hooks. API output omitted.'
  process.stderr.write(`${JSON.stringify({ kind: 'receiver-error', message })}\n`)
  process.exitCode = 2
}
