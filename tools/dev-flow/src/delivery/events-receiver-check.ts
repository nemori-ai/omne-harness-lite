import { readFileSync } from 'node:fs'
import { readChannelConfig } from './events-channel-config.ts'
import { hookMatches, parseChannelHook, readExactHook } from './events-channel-hooks.ts'
import { ReceiverError } from './events-channel.ts'
import { githubReconcile, type GhText } from './events-gh.ts'
import { waitForEvent } from './events-wait.ts'
import { readReceiverHealth } from './events-receiver-state.ts'
import { REST_HEADERS } from './github-read.ts'
import { array, record } from './protocol.ts'

/** A real delivery receipt and a satisfied issue-closed predicate are required; ping is insufficient. */
export async function checkChannelReceiver(args: {
  configPath: string
  file: string
  repository: string
  delivery: string
  issue: number
  gh: GhText
  hookEvidence?: string
}) {
  const config = readChannelConfig(args.configPath)
  const health = readReceiverHealth(args)
  if (
    !health.healthy ||
    config.instanceId !== health.instanceId ||
    config.eventFile !== args.file ||
    config.repository !== args.repository
  )
    throw new ReceiverError('receiver-not-healthy')
  let receipts: unknown[]
  if (config.ownership.kind === 'borrowed') {
    if (args.hookEvidence === undefined) throw new ReceiverError('owner-hook-evidence-required')
    const evidence = record(JSON.parse(readFileSync(args.hookEvidence, 'utf8')), 'owner evidence')
    const hook = parseChannelHook(evidence.hook)
    if (
      evidence.repository !== config.repository ||
      hook.id !== config.ownership.hookId ||
      !hookMatches(config, hook)
    )
      throw new ReceiverError('owner-hook-evidence-mismatch')
    receipts = [evidence.delivery]
  } else {
    const hook = readExactHook(config, args.gh)
    const pages: unknown = JSON.parse(
      args.gh(
        [
          'api',
          '--method',
          'GET',
          ...REST_HEADERS,
          '--paginate',
          '--slurp',
          `repos/${config.repository}/hooks/${hook.id}/deliveries?per_page=100`,
        ],
        60_000,
      ),
    )
    receipts = array(pages, 'delivery pages').flatMap(page => array(page, 'deliveries'))
  }
  const receipt = receipts
    .map(value => record(value, 'delivery'))
    .find(value => value.guid === args.delivery)
  if (
    receipt === undefined ||
    receipt.event !== 'issues' ||
    typeof receipt.status_code !== 'number' ||
    receipt.status_code < 200 ||
    receipt.status_code >= 300 ||
    typeof receipt.delivered_at !== 'string'
  )
    throw new ReceiverError('real-delivery-not-confirmed')
  const lines = readFileSync(args.file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => record(JSON.parse(line), 'event'))
  const event = lines.find(line => line.delivery === args.delivery)
  if (
    event === undefined ||
    event.event !== 'issues' ||
    event.action !== 'closed' ||
    event.number !== args.issue ||
    record(event.receiver, 'receiver').instanceId !== config.instanceId ||
    typeof event.receivedAt !== 'string' ||
    Date.parse(event.receivedAt) < Date.parse(health.processStartedAt)
  )
    throw new ReceiverError('real-event-not-received')
  const options = {
    file: args.file,
    repository: args.repository,
    predicate: { kind: 'issue-closed' as const, issue: args.issue },
    since: new Date().toISOString(),
    timeoutMs: 5000,
    reconcile: githubReconcile(args.repository, (argv, timeout) =>
      JSON.parse(args.gh(argv, timeout)),
    ),
  }
  const result = await waitForEvent(options)
  if (result.source !== 'reconcile') throw new ReceiverError('wait-reconcile-not-confirmed')
  return {
    kind: 'receiver-check' as const,
    instanceId: config.instanceId,
    repository: config.repository,
    hookId: health.hookId,
    delivery: args.delivery,
    receivedAt: event.receivedAt,
    deliveredAt: receipt.delivered_at,
    process: 'verified',
    connection: 'connected',
    hook: 'verified',
    event: 'verified',
    wait: 'reconcile',
    coverage: 'coverage-gap',
  }
}
