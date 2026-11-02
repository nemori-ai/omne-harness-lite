import type { GhText } from './events-gh.ts'
import { REST_HEADERS } from './github-read.ts'
import { array, record, text } from './protocol.ts'
import { ReceiverError } from './events-channel.ts'
import { positiveInteger, type ChannelConfig, writePrivateJson } from './events-channel-config.ts'

export type ChannelHook = {
  id: number
  name: string
  active: boolean
  url: string
  contentType: string
  events: string[]
}

class HookApiError extends ReceiverError {
  readonly status: number | null
  constructor(method: string, error: unknown) {
    super(`hook-${method.toLowerCase()}-failed`)
    const stderr =
      typeof error === 'object' && error !== null && 'stderr' in error ? error.stderr : undefined
    const output = Buffer.isBuffer(stderr)
      ? stderr.toString('utf8')
      : typeof stderr === 'string'
        ? stderr
        : ''
    const status = /\(HTTP (\d{3})\)/.exec(output)?.[1]
    this.status = status === undefined ? null : Number(status)
  }
}

export function parseChannelHook(value: unknown): ChannelHook {
  const hook = record(value, 'hook'),
    config = record(hook.config, 'hook config')
  if (typeof hook.active !== 'boolean') throw new ReceiverError('invalid-hook-response')
  return {
    id: positiveInteger(hook.id),
    name: text(hook.name, 'hook name'),
    active: hook.active,
    url: text(config.url, 'hook url'),
    contentType: text(config.content_type, 'content type'),
    events: array(hook.events, 'hook events').map(item => text(item, 'event')),
  }
}

export function hookMatches(config: ChannelConfig, hook: ChannelHook): boolean {
  return (
    hook.url === config.webhookUrl &&
    hook.name === 'web' &&
    hook.contentType === 'json' &&
    hook.active &&
    config.events.every(event => hook.events.includes(event) || hook.events.includes('*'))
  )
}

function api(
  config: ChannelConfig,
  gh: GhText,
  method: string,
  suffix = '',
  fields: string[] = [],
): unknown {
  try {
    const output = gh(
      [
        'api',
        '--method',
        method,
        ...REST_HEADERS,
        `repos/${config.repository}/hooks${suffix}`,
        ...fields,
      ],
      15_000,
    )
    return output === '' ? null : JSON.parse(output)
  } catch (error) {
    throw new HookApiError(method, error)
  }
}

export function readExactHook(config: ChannelConfig, gh: GhText): ChannelHook {
  if (!('hookId' in config.ownership)) throw new ReceiverError('hook-ownership-unknown')
  const hook = parseChannelHook(api(config, gh, 'GET', `/${config.ownership.hookId}`))
  if (hook.id !== config.ownership.hookId || !hookMatches(config, hook))
    throw new ReceiverError('hook-ownership-mismatch')
  return hook
}

function readHookList(config: ChannelConfig, gh: GhText): unknown[] {
  try {
    const pages: unknown = JSON.parse(
      gh(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          '--paginate',
          '--slurp',
          `repos/${config.repository}/hooks?per_page=100`,
        ],
        60_000,
      ),
    )
    return array(pages, 'hook pages').flatMap(page => array(page, 'hooks'))
  } catch {
    throw new ReceiverError('hook-recovery-read-failed')
  }
}

/** Only an exact instance-marked URL can recover a lost creation response. Never re-POST. */
export function recoverChannelHook(config: ChannelConfig, path: string, gh: GhText): ChannelConfig {
  if (config.ownership.kind === 'owned') {
    if (ownedHookExists(config, gh)) return config
    return markDeleted(config, path)
  }
  if (config.ownership.kind !== 'creating') throw new ReceiverError('hook-not-awaiting-recovery')
  const hooks = readHookList(config, gh).map(parseChannelHook)
  const matches = hooks.filter(hook => hookMatches(config, hook))
  const own = matches.length === 1 ? matches[0] : undefined
  if (own === undefined) throw new ReceiverError('hook-ownership-unknown')
  const recovered: ChannelConfig = { ...config, ownership: { kind: 'owned', hookId: own.id } }
  writePrivateJson(path, recovered)
  return recovered
}

export function prepareChannelHook(config: ChannelConfig, path: string, gh: GhText): ChannelConfig {
  switch (config.ownership.kind) {
    case 'borrowed':
      return config
    case 'owned':
      readExactHook(config, gh)
      return config
    case 'creating':
      return recoverChannelHook(config, path, gh)
    case 'uncreated':
    case 'deleted':
      // A deleted hook is proven gone on GitHub and the saved channel keeps its instance marker,
      // so a restart rebuilds the exact hook through the same creating path as a first start.
      break
  }
  const pending: ChannelConfig = {
    ...config,
    ownership: { kind: 'creating', requestedAt: new Date().toISOString() },
  }
  writePrivateJson(path, pending)
  const fields = [
    '-f',
    'name=web',
    '-F',
    'active=true',
    '-f',
    `config[url]=${config.webhookUrl}`,
    '-f',
    'config[content_type]=json',
    '-f',
    'config[insecure_ssl]=0',
    ...config.events.flatMap(event => ['-f', `events[]=${event}`]),
  ]
  let hook: ChannelHook
  try {
    hook = parseChannelHook(api(config, gh, 'POST', '', fields))
  } catch {
    throw new ReceiverError('hook-create-outcome-unknown')
  }
  if (!hookMatches(config, hook)) throw new ReceiverError('hook-create-outcome-unknown')
  const owned: ChannelConfig = { ...config, ownership: { kind: 'owned', hookId: hook.id } }
  writePrivateJson(path, owned)
  return owned
}

export function removeChannelHook(config: ChannelConfig, path: string, gh: GhText): ChannelConfig {
  if (config.ownership.kind === 'borrowed' || config.ownership.kind === 'deleted') return config
  if (config.ownership.kind !== 'owned') throw new ReceiverError('hook-ownership-unknown')
  if (ownedHookExists(config, gh)) api(config, gh, 'DELETE', `/${config.ownership.hookId}`)
  return markDeleted(config, path)
}

function ownedHookExists(config: ChannelConfig, gh: GhText): boolean {
  try {
    readExactHook(config, gh)
    return true
  } catch (error) {
    if (error instanceof HookApiError && error.status === 404) {
      const ids = readHookList(config, gh).map(hook => positiveInteger(record(hook, 'hook').id))
      if ('hookId' in config.ownership && !ids.includes(config.ownership.hookId)) return false
      throw new ReceiverError('hook-visibility-unknown')
    }
    throw error
  }
}

function markDeleted(config: ChannelConfig, path: string): ChannelConfig {
  if (config.ownership.kind !== 'owned') throw new ReceiverError('hook-ownership-unknown')
  const deleted: ChannelConfig = {
    ...config,
    ownership: { kind: 'deleted', hookId: config.ownership.hookId },
  }
  writePrivateJson(path, deleted)
  return deleted
}
