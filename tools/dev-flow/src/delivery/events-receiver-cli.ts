#!/usr/bin/env node
import { errorCode } from './events.ts'
import { cleanForwarderHooks, originRepository, runGhText, spawnGhForward } from './events-gh.ts'
import { serveReceiver } from './events-receiver.ts'
import { InputError } from './protocol.ts'
import { repositoryFile } from './repository-files.ts'

const usage = [
  'Usage: events-receiver-cli.ts serve --port <port> [--file <event file>] [--repo <owner/name>] [--secret <secret>]',
  '       events-receiver-cli.ts clean [--repo <owner/name>]',
].join('\n')

const allowedFlags: Record<string, readonly string[]> = {
  serve: ['--port', '--file', '--repo', '--secret'],
  clean: ['--repo'],
}

function options(args: string[]): { command: string; values: Map<string, string> } {
  const [command = '', ...rest] = args
  const allowed = allowedFlags[command]
  if (allowed === undefined) throw new InputError(usage)
  const values = new Map<string, string>()
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
  return { command, values }
}

try {
  const { command, values } = options(process.argv.slice(2))
  const repository = values.get('--repo') ?? originRepository()
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new InputError(usage)
  if (command === 'clean') {
    const { deleted, failed } = cleanForwarderHooks(repository, runGhText)
    process.stdout.write(`${JSON.stringify({ kind: 'hooks-cleaned', deleted, failed })}\n`)
    process.exitCode = failed.length > 0 ? 1 : 0
  } else await serve(repository, values)
} catch (error) {
  const message =
      error instanceof InputError
        ? error.message
        : 'Cannot start the receiver or read the forwarder hooks. API output omitted.',
    code = error instanceof InputError ? undefined : errorCode(error)
  process.stderr.write(
    `${JSON.stringify({ kind: 'receiver-error', message, ...(code === undefined ? {} : { code }) })}\n`,
  )
  process.exitCode = 2
}

async function serve(repository: string, values: Map<string, string>): Promise<void> {
  const port = Number(values.get('--port')),
    secret = values.get('--secret')
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new InputError(usage)
  const stopped = new Promise<void>(resolve => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
      process.once(signal, () => resolve())
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
}
