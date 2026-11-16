import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentJournalEntries,
  AgentJournalEntry,
  AgentMaterials,
  ExecutionSnapshot,
  Failure,
  Material,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import {
  agentJournalEntriesKey,
  agentJournalKey,
  agentMaterialsKey,
} from '@omne-harness/agent-cordis-contract/cordis'
import type { ContentBlock } from '@omne-harness/content-block'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  Reply,
  RunId,
  SessionAccess,
  SessionEntriesInterpretation,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesStart,
  SessionFailure,
  SessionId,
  SessionOperationId,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import {
  judgeToolDelivery,
  resolveToolInvocationRef,
  type ToolDelivery,
} from '@omne-harness/tool-contract'
import { canonical } from '../testing/canonical.ts'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'
import { subscribePublished } from './published-queue.ts'

const OWNER = 'session-adapters/tool-log'
const CHANNEL = 'tool-received'
const ROUNDS = 3
const TIMEOUT_MS = 30_000
const RETRY_BACKOFF_MS = 50

export type ToolDeliveryEnvelope = Readonly<{
  tenant: string
  delivery: ToolDelivery<ContentBlock>
}>

export type ToolDeliveryReader = (material: Material<ContentBlock>) => ToolDeliveryEnvelope | null

export type SessionToolLogConsumptionInput = Readonly<{
  toolDeliveries: ToolDeliveryReader | null
  coordinator?: (
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ) => Promise<Outcome<unknown, SessionCoordinatorPrincipalFailure>>
}>

export type SessionToolLogConsumptionConfig = Readonly<{
  timeoutMs?: number
  retryBackoffMs?: number
}>

export type ToolLogTarget = Readonly<{
  principal: unknown
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

export type ToolLogConsumed = Readonly<{
  progress: Readonly<{ through: string; interpreted: DurableEvidence }> | null
  committed: boolean
  waiting: number
}>

type Answer<T> = Outcome<T, SessionFailure>
const ENTRY_PAGE = 256

async function committedEntries<P>(
  read: AgentJournalEntries<P>['read'],
  input: Readonly<{ principal: P; tenant: TenantId; execution: AgentExecutionId }>,
): Promise<Outcome<readonly AgentJournalEntry[], Failure>> {
  const found: AgentJournalEntry[] = []
  let after: string | null = null
  for (;;) {
    const page = await read({ ...input, after, limit: ENTRY_PAGE })
    if ('failure' in page) return page
    found.push(...page.ok.items.map(item => item.entry))
    if (page.ok.caughtUp) return succeed(found)
    after = page.ok.next
  }
}

type ToolEntry = ReceivedEntry &
  Readonly<{ delivery: Extract<ReceivedEntry['delivery'], { producer: 'tool' }> }>
type Step = Readonly<{ kind: 'item'; item: SessionEntriesItem }> | Readonly<{ kind: 'unbound' }>

type Ports = Readonly<{
  readWork(access: SessionAccess<unknown>): Reply<WorkSnapshot>
  load: AgentJournal<unknown>['load']
  entries: AgentJournalEntries<unknown>['read']
  read: AgentMaterials<unknown, ContentBlock>['read']
  commitEntries: SessionTransactionPort<unknown>['commitEntries']
  stopped(): boolean
}>

type Settings = Readonly<{ timeoutMs: number; retryBackoffMs: number }>

const unavailable = (diagnostic: string, owner = OWNER): Answer<never> =>
  fail({ kind: 'unavailable', owner, diagnostic })
const invalid = (field: string, reason: string): Answer<never> =>
  fail({ kind: 'invalid', field, reason })
const denied = (): Answer<never> => fail({ kind: 'denied', action: 'consume-tool-log' })

function describe(cause: unknown): string {
  try {
    return cause instanceof Error ? cause.message : String(cause)
  } catch {
    return 'a thrown value that has no text'
  }
}

function agentFailure(read: string, failure: Failure): Answer<never> {
  switch (failure.kind) {
    case 'denied':
      return fail({ kind: 'denied', action: failure.action })
    case 'unavailable':
      return unavailable(failure.diagnostic, failure.owner)
    default:
      return unavailable(`${read} answered ${failure.kind}`, 'agent-journal')
  }
}

function isToolReceived(entry: AgentJournalEntry): entry is ToolEntry {
  return entry.kind === 'received' && entry.delivery.producer === 'tool'
}

function runOf(work: WorkSnapshot, execution: string): RunId | null {
  if (work.run.kind === 'active' && work.run.execution.execution === execution) return work.run.run
  return work.executions?.find(item => item.execution.execution === execution)?.run ?? null
}

const sameText = (left: string, right: string): boolean => left === right

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function settled(delivery: Record<string, unknown>): boolean {
  return (
    object(delivery.terminal) &&
    (delivery.actualTerminal === null || object(delivery.actualTerminal)) &&
    object(delivery.effect)
  )
}

async function within<T>(
  ms: number,
  work: () => Promise<T>,
): Promise<Readonly<{ kind: 'answered'; value: T }> | Readonly<{ kind: 'late' }>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<Readonly<{ kind: 'late' }>>(resolve => {
    timer = setTimeout(() => resolve({ kind: 'late' }), ms)
  })
  try {
    return await Promise.race([work().then(value => ({ kind: 'answered' as const, value })), late])
  } finally {
    clearTimeout(timer)
  }
}

const pause = (ms: number) =>
  ms === 0 ? Promise.resolve() : new Promise<void>(resolve => setTimeout(resolve, ms))

function operationOf(
  tenantText: string,
  observation: Omit<SessionEntriesObservation, 'operation' | 'tenant'>,
) {
  const digest = createHash('sha256')
    .update(canonical(['ad06/1', tenantText, observation]))
    .digest('hex')
  return `ad06_${digest}` as SessionOperationId
}

function headEvidence(
  tenantText: string,
  execution: string,
  revision: string,
  channel: readonly ToolEntry[],
): DurableEvidence {
  return {
    owner: OWNER,
    record: execution,
    revision,
    digest: createHash('sha256')
      .update(canonical([tenantText, execution, revision, channel]))
      .digest('hex'),
  }
}

function materialRefusal(
  read: ToolDeliveryReader,
  tenant: TenantId,
  tenantText: string,
  entry: ToolEntry,
  material: Material<ContentBlock>,
  field: string,
): Answer<never> | null {
  let envelope: ToolDeliveryEnvelope | null
  try {
    envelope = read(material)
  } catch {
    envelope = null
  }
  if (envelope === null)
    return unavailable(`${field} is not a Tool delivery of an adopted schema`, 'agent-contract')
  if (envelope.tenant !== tenantText) return denied()
  const delivery: unknown = envelope.delivery
  if (!object(delivery)) return invalid(field, 'the material holds no Tool delivery')
  const { key, account } = entry.delivery
  if (delivery.kind !== key.kind) return invalid(field, 'the material holds another delivery kind')
  if (canonical(delivery.key) !== canonical(key))
    return invalid(field, 'the material holds another delivery key')
  if (canonical(delivery.consumer) !== canonical(entry.consumer))
    return invalid(field, 'the material holds another consumer')
  if (canonical(delivery.account) !== canonical(account))
    return invalid(field, 'the material holds another account than the entry')
  if (delivery.kind === 'result' && !settled(delivery))
    return unavailable(`${field} holds no complete Tool settlement`, 'agent-contract')
  let judged
  try {
    judged = judgeToolDelivery({ tenant, delivery: envelope.delivery })
  } catch {
    return invalid(field, 'the material holds a delivery that does not decode')
  }
  if ('failure' in judged)
    return invalid(field, `the material fails the delivery check: ${judged.failure.reason}`)
  return null
}

function interpretationOf(entry: ToolEntry): SessionEntriesInterpretation[] {
  const producer = { kind: 'tool' as const, call: entry.delivery.key.reference }
  const source = entry.material
  const account = { kind: 'account' as const, producer, source }
  if (entry.delivery.key.kind === 'account') return [account]
  return [
    { kind: 'execution', producer, source },
    ...(entry.delivery.account === null ? [] : [account]),
  ]
}

function createToolLogConsumption(
  given: SessionToolLogConsumptionInput,
  ports: Ports,
  settings: Settings,
): (target: ToolLogTarget) => Reply<ToolLogConsumed> {
  async function bounded<T>(name: string, work: () => Promise<T>): Promise<Answer<T>> {
    const answer = await within(settings.timeoutMs, work)
    if (answer.kind === 'late')
      return unavailable(`${name} did not answer within ${settings.timeoutMs} ms`)
    return succeed(answer.value)
  }

  async function translate(
    access: SessionAccess<unknown>,
    tenantText: string,
    work: WorkSnapshot,
    entry: ToolEntry,
    ordinal: bigint,
    at: number,
  ): Promise<Answer<Step>> {
    const field = `entries[${at}]`
    const { key } = entry.delivery
    const call = resolveToolInvocationRef(key.reference, access.tenant)
    if ('failure' in call)
      return call.failure.kind === 'malformed'
        ? invalid(`${field}.delivery.key.reference`, 'not a Tool invocation reference')
        : denied()
    const bound = work.consumptions.find(
      item => item.binding.producer.kind === 'tool' && item.binding.producer.call === key.reference,
    )
    if (bound === undefined) return succeed({ kind: 'unbound' })
    if (!sameText(bound.id, entry.consumption))
      return invalid(`${field}.consumption`, 'not the consumption Session bound to the call')
    if (canonical(bound.binding.consumer) !== canonical(entry.consumer))
      return invalid(`${field}.consumer`, 'not the consumer Session bound to the call')
    const reader = given.toolDeliveries
    if (reader === null)
      return unavailable(
        'TOOL-SETTLEMENT-SCHEMA: no adopted schema of the complete Tool delivery material; the entry is kept',
        'agent-contract',
      )
    const read = await bounded('materials.read', () =>
      ports.read({ principal: access.principal, tenant: access.tenant, source: entry.material }),
    )
    if ('failure' in read) return read
    if ('failure' in read.ok) return agentFailure('materials.read', read.ok.failure)
    const refusal = materialRefusal(
      reader,
      access.tenant,
      tenantText,
      entry,
      read.ok.ok,
      `${field}.material`,
    )
    if (refusal !== null) return refusal
    return succeed({
      kind: 'item',
      item: {
        ordinal: String(ordinal),
        key: canonical(key),
        fact: entry.material,
        interpretation: interpretationOf(entry),
      },
    })
  }

  async function round(
    access: SessionAccess<unknown>,
    tenantText: string,
    target: ToolLogTarget,
  ): Promise<Answer<ToolLogConsumed>> {
    const work = await bounded('session.work.readWork', () => ports.readWork(access))
    if ('failure' in work) return work
    if ('failure' in work.ok) return work.ok
    const snapshot = work.ok.ok
    const run = runOf(snapshot, target.execution)
    if (run === null)
      return unavailable('Session recorded no Run of this execution', 'session-history')
    const loaded = await bounded('agentJournal.load', () =>
      ports.load({
        principal: access.principal,
        tenant: access.tenant,
        execution: target.execution,
      }),
    )
    if ('failure' in loaded) return loaded
    if ('failure' in loaded.ok) return agentFailure('load', loaded.ok.failure)
    const execution: ExecutionSnapshot = loaded.ok.ok
    const reading = {
      principal: access.principal,
      tenant: access.tenant,
      execution: target.execution,
    }
    const read = await bounded('agentJournalEntries.read', () =>
      committedEntries(ports.entries, reading),
    )
    if ('failure' in read) return read
    if ('failure' in read.ok) return agentFailure('load', read.ok.failure)
    const again = await bounded('agentJournal.load', () => ports.load(reading))
    if ('failure' in again) return again
    if ('failure' in again.ok) return agentFailure('load', again.ok.failure)
    if (again.ok.ok.revision !== execution.revision)
      return unavailable('the execution changed while its entries were read')
    const channel = read.ok.ok.filter(isToolReceived)
    const saved = snapshot.entriesProgress?.find(
      item => item.run === run && item.execution === target.execution && item.channel === CHANNEL,
    )
    const after = BigInt(saved?.through ?? '0')
    const count = BigInt(channel.length)
    if (count < after)
      return unavailable('the saved progress passes the Tool entries of the execution')
    const progress =
      saved === undefined ? null : { through: saved.through, interpreted: saved.interpreted }
    const items: SessionEntriesItem[] = []
    for (let at = Number(after); at < channel.length; at += 1) {
      const step = await translate(access, tenantText, snapshot, channel[at]!, BigInt(at) + 1n, at)
      if ('failure' in step) return step
      if (step.ok.kind === 'unbound') break
      items.push(step.ok.item)
    }
    const waiting = channel.length - Number(after) - items.length
    if (items.length === 0) return succeed({ progress, committed: false, waiting })
    const range = {
      session: target.session,
      run,
      execution: target.execution,
      channel: CHANNEL,
      after: after.toString(),
      through: (after + BigInt(items.length)).toString(),
      boundary: {
        execution: target.execution,
        channel: CHANNEL,
        revision: execution.revision,
        executionEvidence: headEvidence(tenantText, target.execution, execution.revision, channel),
        count: count.toString(),
      },
      items,
    } satisfies Omit<SessionEntriesObservation, 'operation' | 'tenant'>
    const observation: SessionEntriesObservation = {
      ...range,
      tenant: target.tenant,
      operation: operationOf(tenantText, range),
    }
    const start: SessionEntriesStart =
      saved === undefined ? { kind: 'initial' } : { kind: 'saved', progress: saved }
    return commit(observation, start, waiting)
  }

  async function commit(
    observation: SessionEntriesObservation,
    start: SessionEntriesStart,
    waiting: number,
  ): Promise<Answer<ToolLogConsumed>> {
    const unknown = fail({ kind: 'commit-unknown', operation: observation.operation } as const)
    for (let attempt = 0; ; attempt += 1) {
      if (ports.stopped())
        return attempt === 0 ? unavailable('the tool log consumption has stopped') : unknown
      let answer
      try {
        answer = await within(settings.timeoutMs, () => ports.commitEntries({ observation, start }))
      } catch {
        return unknown
      }
      if (answer.kind === 'late') return unknown
      const reply = answer.value
      if ('ok' in reply)
        return succeed({
          progress: { through: reply.ok.through, interpreted: reply.ok.interpreted },
          committed: true,
          waiting,
        })
      if (reply.failure.kind !== 'commit-unknown' || attempt > 0) return reply
      await pause(settings.retryBackoffMs)
    }
  }

  return async target => {
    const tenantText = tenantCodec.encode(target.tenant)
    if (!tenantText.ok) return denied()
    const access = { principal: target.principal, tenant: target.tenant, session: target.session }
    for (let left = ROUNDS; ; left -= 1) {
      const answer = await round(access, tenantText.value, target)
      if ('ok' in answer || answer.failure.kind !== 'changed' || left <= 1) return answer
      await pause(settings.retryBackoffMs)
    }
  }
}

type Issue = Readonly<{ message: string; path: readonly string[] }>

function parseConfig(
  value: unknown,
): Readonly<{ value: SessionToolLogConsumptionConfig }> | Readonly<{ issues: readonly Issue[] }> {
  if (value === undefined || value === null) return { value: {} }
  if (!object(value))
    return { issues: [{ message: 'the configuration must be an object', path: [] }] }
  const { timeoutMs, retryBackoffMs } = value
  const issues: Issue[] = []
  const integer = (field: unknown, least: number) =>
    typeof field === 'number' && Number.isSafeInteger(field) && field >= least
  if (timeoutMs !== undefined && !integer(timeoutMs, 1))
    issues.push({ message: 'a positive integer of milliseconds', path: ['timeoutMs'] })
  if (retryBackoffMs !== undefined && !integer(retryBackoffMs, 0))
    issues.push({ message: 'a non-negative integer of milliseconds', path: ['retryBackoffMs'] })
  if (issues.length > 0) return { issues }
  return {
    value: {
      ...(timeoutMs === undefined ? {} : { timeoutMs: timeoutMs as number }),
      ...(retryBackoffMs === undefined ? {} : { retryBackoffMs: retryBackoffMs as number }),
    },
  }
}

const configSchema = {
  '~standard': { version: 1 as const, vendor: 'session-adapters', validate: parseConfig },
}

export function createSessionToolLogConsumptionPlugin(input: SessionToolLogConsumptionInput) {
  let current: ((target: ToolLogTarget) => Reply<ToolLogConsumed>) | null = null
  return {
    plugin: {
      name: 'session-ad06',
      inject: {
        [sessionKey]: { caller: 'coordinator' as const },
        [agentJournalKey]: null,
        [agentJournalEntriesKey]: null,
        [agentMaterialsKey]: null,
        [sessionTransactionsKey]: null,
      },
      Config: configSchema,
      apply(ctx: Context, config: SessionToolLogConsumptionConfig | undefined) {
        let stopped = false
        const session = ctx.intercept(sessionKey, { caller: 'coordinator' })[sessionKey]
        const journal = ctx[agentJournalKey]
        const entries = ctx[agentJournalEntriesKey]
        const materials = ctx[agentMaterialsKey]
        const transactions = ctx[sessionTransactionsKey]
        const logger = ctx.logger(OWNER)
        const consume = createToolLogConsumption(
          input,
          {
            readWork: access => session.work.readWork(access),
            load: value => journal.load(value),
            entries: value => entries.read(value),
            read: value => materials.read(value),
            commitEntries: value => transactions.commitEntries(value),
            stopped: () => stopped,
          },
          {
            timeoutMs: config?.timeoutMs ?? TIMEOUT_MS,
            retryBackoffMs: config?.retryBackoffMs ?? RETRY_BACKOFF_MS,
          },
        )
        const guarded = async (target: ToolLogTarget): Reply<ToolLogConsumed> => {
          try {
            return await consume(target)
          } catch (cause) {
            logger.error(`consume: a dependency threw: ${describe(cause)}`)
            return unavailable(`a dependency threw: ${describe(cause)}`)
          }
        }
        const { coordinator } = input
        if (coordinator === undefined)
          logger.warn(
            'AD-06 consumes nothing by itself: no coordinator principal is given, so the plugin does not subscribe and only `consume` reads (SPEC AD-06 trigger, known limit)',
          )
        else
          subscribePublished(
            ctx,
            () => stopped,
            async ({ tenant, session: sessionId, execution }) => {
              try {
                const principal = await coordinator({ tenant, session: sessionId })
                if ('failure' in principal) {
                  logger.warn(
                    `no coordinator principal for ${execution}: ${principal.failure.kind}`,
                  )
                  return
                }
                const answer = await guarded({
                  principal: principal.ok,
                  tenant,
                  session: sessionId,
                  execution,
                })
                if ('failure' in answer)
                  logger.warn(`the consumption of ${execution} answered ${answer.failure.kind}`)
              } catch (cause) {
                logger.error(`trigger: the coordinator threw: ${describe(cause)}`)
              }
            },
          )
        ctx.effect(() => {
          current = guarded
          return () => {
            stopped = true
            if (current === guarded) current = null
          }
        })
      },
    },
    consume(target: ToolLogTarget): Reply<ToolLogConsumed> {
      const generation = current
      return generation === null
        ? Promise.resolve(unavailable('the tool log consumption is pending or stopped'))
        : generation(target)
    },
  }
}
