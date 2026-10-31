#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createChannel, ReceiverError } from './events-channel.ts'
import {
  makeChannelConfig,
  positiveInteger,
  readChannelConfig,
  receiverPaths,
  repositoryName,
  sharedMode,
  writePrivateJson,
} from './events-channel-config.ts'
import { recoverChannelHook, removeChannelHook } from './events-channel-hooks.ts'
import { originRepository, runGhText } from './events-gh.ts'
import { errorCode } from './events.ts'
import { serveChannelReceiver } from './events-receiver-channel.ts'
import { checkChannelReceiver } from './events-receiver-check.ts'
import { spawnLegacyForward } from './events-receiver-legacy.ts'
import {
  ensureReceiverStopped,
  readReceiverHealth,
  withReceiverGuard,
} from './events-receiver-state.ts'
import { serveReceiver } from './events-receiver.ts'
import { repositoryFile } from './repository-files.ts'

const usage = `Usage: events-receiver-cli.ts <init|serve|health|check|recover|clean> --repo <owner/name> --file <event file>
  init: [--channel-file <private URL file> --hook <borrowed hook id>]
  serve: [--mode channel|legacy] [--port <legacy loopback port, default 8788>] [--secret <legacy secret>]
  check: --delivery <GitHub delivery guid> --issue <closed issue> [--hook-evidence <owner JSON>]
  channel commands: [--config <private configuration path>]
  clean: removes only the persisted owned hook of a stopped channel receiver`

const flags: Record<string, readonly string[]> = {
  init: ['--channel-file', '--hook', '--config'],
  serve: ['--mode', '--port', '--secret', '--config'],
  health: [],
  check: ['--delivery', '--issue', '--hook-evidence', '--config'],
  recover: ['--config'],
  clean: ['--config'],
}

function parse(args: string[]) {
  const [command = '', ...rest] = args
  if (!Object.hasOwn(flags, command)) throw new ReceiverError('invalid-command')
  const allowed = [...(flags[command] ?? []), '--repo', '--file']
  const values = new Map<string, string>()
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index],
      value = rest[index + 1]
    if (
      flag === undefined ||
      value === undefined ||
      value.startsWith('--') ||
      !allowed.includes(flag) ||
      values.has(flag)
    )
      throw new ReceiverError('invalid-options')
    values.set(flag, value)
  }
  return { command, values }
}

function stopping(): Promise<void> {
  return new Promise(resolveStop => {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
      process.once(signal, () => resolveStop())
  })
}

async function main(): Promise<void> {
  if (process.argv[2] === '--help') {
    process.stdout.write(`${usage}\n`)
    return
  }
  const { command, values } = parse(process.argv.slice(2))
  const legacy = command === 'serve' && values.get('--mode') === 'legacy'
  const repository = repositoryName(values.get('--repo') ?? (legacy ? originRepository() : ''))
  const fileValue =
    values.get('--file') ?? (legacy ? repositoryFile('tmp/github-events/events.jsonl') : undefined)
  if (fileValue === undefined) throw new ReceiverError('explicit-event-file-required')
  const file = resolve(fileValue),
    configPath = resolve(values.get('--config') ?? receiverPaths(file).config)
  if (
    [file, receiverPaths(file).state, receiverPaths(file).pid, receiverPaths(file).guard].includes(
      configPath,
    )
  )
    throw new ReceiverError('receiver-file-collision')
  const log = (message: string) => process.stderr.write(`${message}\n`)
  const output = (value: unknown) => process.stdout.write(`${JSON.stringify(value)}\n`)
  if (command === 'init') {
    if (existsSync(configPath)) throw new ReceiverError('receiver-config-already-exists')
    const channelFile = values.get('--channel-file'),
      hook = values.get('--hook')
    if ((channelFile === undefined) !== (hook === undefined))
      throw new ReceiverError('borrowed-hook-and-channel-required')
    if (channelFile !== undefined && sharedMode(lstatSync(channelFile).mode))
      throw new ReceiverError('insecure-channel-file-permissions')
    const channel =
      channelFile === undefined ? await createChannel() : readFileSync(channelFile, 'utf8').trim()
    const config = makeChannelConfig({
      repository,
      file,
      channel,
      ...(hook === undefined ? {} : { hookId: positiveInteger(Number(hook)) }),
    })
    withReceiverGuard(file, () => {
      ensureReceiverStopped(file)
      if (existsSync(configPath)) throw new ReceiverError('receiver-config-already-exists')
      writePrivateJson(configPath, config)
    })
    output({
      kind: 'receiver-configured',
      instanceId: config.instanceId,
      repository,
      managed: config.ownership.kind !== 'borrowed',
    })
  } else if (command === 'health') {
    const health = readReceiverHealth({ file, repository })
    output(health)
    process.exitCode = health.healthy ? 0 : 2
  } else if (command === 'check') {
    const delivery = values.get('--delivery'),
      hookEvidence = values.get('--hook-evidence')
    if (delivery === undefined) throw new ReceiverError('delivery-required')
    output(
      await checkChannelReceiver({
        configPath,
        file,
        repository,
        delivery,
        issue: positiveInteger(Number(values.get('--issue'))),
        gh: runGhText,
        ...(hookEvidence === undefined ? {} : { hookEvidence }),
      }),
    )
  } else if (command === 'clean' || command === 'recover') {
    const result = withReceiverGuard(file, () => {
      ensureReceiverStopped(file)
      const config = readChannelConfig(configPath)
      if (config.repository !== repository || config.eventFile !== file)
        throw new ReceiverError('receiver-identity-mismatch')
      return command === 'clean'
        ? removeChannelHook(config, configPath, runGhText)
        : recoverChannelHook(config, configPath, runGhText)
    })
    output({
      kind: command === 'clean' ? 'receiver-cleaned' : 'receiver-recovered',
      instanceId: result.instanceId,
      ownership: result.ownership,
    })
  } else if (legacy) {
    const port = positiveInteger(Number(values.get('--port') ?? 8788)),
      secret = values.get('--secret')
    if (port > 65535) throw new ReceiverError('invalid-port')
    process.exitCode = await serveReceiver({
      port,
      file,
      repository,
      ...(secret === undefined ? {} : { secret }),
      spawnForward: spawnLegacyForward,
      stopped: stopping(),
      log,
    })
  } else {
    if (
      values.has('--port') ||
      values.has('--secret') ||
      (values.has('--mode') && values.get('--mode') !== 'channel')
    )
      throw new ReceiverError('invalid-channel-options')
    process.exitCode = await serveChannelReceiver({
      configPath,
      file,
      repository,
      gh: runGhText,
      stopped: stopping(),
      log,
    })
  }
}

try {
  await main()
} catch (error) {
  const code = errorCode(error)
  process.stderr.write(
    `${JSON.stringify({ kind: 'receiver-error', reasonCode: error instanceof ReceiverError ? error.reasonCode : 'receiver-operation-failed', ...(code === undefined ? {} : { code }) })}\n`,
  )
  process.exitCode = 2
}
