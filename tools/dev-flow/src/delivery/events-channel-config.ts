import { randomUUID } from 'node:crypto'
import {
  closeSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { hostname } from 'node:os'
import { channelUrl, CHANNEL_EVENTS, ReceiverError } from './events-channel.ts'
import { array, record, text } from './protocol.ts'

export type HookOwnership =
  | { kind: 'uncreated' }
  | { kind: 'creating'; requestedAt: string }
  | { kind: 'owned'; hookId: number }
  | { kind: 'borrowed'; hookId: number }
  | { kind: 'deleted'; hookId: number }

export type ChannelConfig = {
  schemaVersion: 1
  repository: string
  instanceId: string
  ownerHost: string
  mode: 'channel'
  channel: string
  webhookUrl: string
  eventFile: string
  events: string[]
  ownership: HookOwnership
}

export function receiverPaths(file: string) {
  const directory = dirname(resolve(file))
  return {
    config: join(directory, 'receiver-config.json'),
    state: join(directory, 'receiver-state.json'),
    pid: join(directory, 'receiver.pid'),
    guard: join(directory, 'receiver.guard'),
  }
}

export function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new ReceiverError('invalid-positive-integer')
  return value
}

export function repositoryName(value: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) throw new ReceiverError('invalid-repository')
  return value
}

export function makeChannelConfig(args: {
  repository: string
  file: string
  channel: string
  hookId?: number
  events?: string[]
}): ChannelConfig {
  const instanceId = randomUUID(),
    channel = channelUrl(args.channel)
  const url = new URL(channel)
  if (args.hookId === undefined && url.searchParams.has('omne_receiver'))
    throw new ReceiverError('reserved-channel-query')
  if (args.hookId === undefined) url.searchParams.set('omne_receiver', instanceId)
  return {
    schemaVersion: 1,
    repository: repositoryName(args.repository),
    instanceId,
    ownerHost: hostname(),
    mode: 'channel',
    channel,
    webhookUrl: url.href,
    eventFile: resolve(args.file),
    events: args.events ?? [...CHANNEL_EVENTS],
    ownership:
      args.hookId === undefined
        ? { kind: 'uncreated' }
        : { kind: 'borrowed', hookId: positiveInteger(args.hookId) },
  }
}

function parseOwnership(value: unknown): HookOwnership {
  const owner = record(value, 'ownership')
  switch (owner.kind) {
    case 'uncreated':
      return { kind: 'uncreated' }
    case 'creating':
      return { kind: 'creating', requestedAt: text(owner.requestedAt, 'requestedAt') }
    case 'owned':
    case 'borrowed':
    case 'deleted':
      return { kind: owner.kind, hookId: positiveInteger(owner.hookId) }
    default:
      throw new ReceiverError('invalid-hook-ownership')
  }
}

/**
 * Whether group or other users may access a file with this mode. On Windows the mode bits do not
 * reflect the file's access control list, so this check does not apply there and the answer is false.
 */
export function sharedMode(mode: number): boolean {
  return process.platform !== 'win32' && (mode & 0o077) !== 0
}

export function readChannelConfig(path: string): ChannelConfig {
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || sharedMode(stat.mode))
      throw new ReceiverError('insecure-config-permissions')
    const config = record(JSON.parse(readFileSync(path, 'utf8')), 'receiver config')
    if (config.schemaVersion !== 1 || config.mode !== 'channel')
      throw new ReceiverError('unsupported-receiver-config')
    const instanceId = text(config.instanceId, 'instanceId')
    if (!/^[\da-f-]{36}$/.test(instanceId)) throw new ReceiverError('invalid-instance-id')
    const eventFile = text(config.eventFile, 'eventFile')
    if (!isAbsolute(eventFile)) throw new ReceiverError('invalid-event-file')
    const channel = channelUrl(text(config.channel, 'channel'))
    const webhookUrl = channelUrl(text(config.webhookUrl, 'webhookUrl'))
    const ownership = parseOwnership(config.ownership)
    const ownerHost = text(config.ownerHost, 'ownerHost')
    if (ownership.kind !== 'borrowed' && ownerHost !== hostname())
      throw new ReceiverError('managed-config-belongs-to-another-host')
    const url = new URL(webhookUrl)
    if (ownership.kind !== 'borrowed') {
      if (url.searchParams.get('omne_receiver') !== instanceId)
        throw new ReceiverError('ownership-mismatch')
      url.searchParams.delete('omne_receiver')
    }
    if (url.href !== channel) throw new ReceiverError('ownership-mismatch')
    const events = array(config.events, 'events').map(value => text(value, 'event'))
    if (events.length === 0 || events.some(event => !/^[a-z_]+$/.test(event)))
      throw new ReceiverError('invalid-event-types')
    return {
      schemaVersion: 1,
      instanceId,
      ownerHost,
      repository: repositoryName(text(config.repository, 'repository')),
      mode: 'channel',
      channel,
      webhookUrl,
      eventFile,
      events,
      ownership,
    }
  } catch (error) {
    if (error instanceof ReceiverError) throw error
    throw new ReceiverError('invalid-receiver-config')
  }
}

/** Atomic replacement plus file fsync; physical power-loss durability is not claimed. */
export function writePrivateJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    try {
      writeFileSync(fd, `${JSON.stringify(value)}\n`)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}
