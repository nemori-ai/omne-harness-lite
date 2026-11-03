// AD-06, Tool log consumption: the plugin reads the Tool results and accounts that the Agent host
// result receiver already wrote into the same session log, and commits what they mean for Session
// as one batch of the entries channel `tool-received`. It never injects or calls Tool.
//
// One call reads the Run that owns the execution as `coordinator`, loads the execution from the same
// AgentJournal, and takes the `received` entries of producer `tool` in commit order. From the saved
// progress of the channel on, every entry is checked and translated, in order: its call reference
// names the tenant of the call; Session holds the producer binding of the call with the same
// consumption and consumer; the material that the entry names reads, through the same provider's
// AgentMaterials, as the complete Tool delivery that the receiver kept for exactly this delivery.
// A result becomes `receive(execution)` of the call, and also `receive(account)` when the runtime
// completed an account; an account delivery becomes `receive(account)`. No report stays no fact.
//
// The complete Tool settlement (`terminal`, `actualTerminal`, `effect`) has no adopted facts schema
// (TOOL-SETTLEMENT-SCHEMA of the assembly page, AGENT-M06 of Agent). The plugin does not define one:
// the assembly hands it the adopted reading of the material, `toolDeliveries`, and while there is
// none every Tool entry answers `unavailable` and the batch stays where it is. A result page, a
// release or the mere presence of `received` is never read as a settlement.
//
// The translated items go to `commitEntries` in one observation: consequences, progress and the
// answer of the operation are one Session commit, after the Agent commit and apart from it. The
// operation identity is derived from the observation, so a lost reply is recognized by sending the
// same observation again, and a later read starts after the saved progress and commits nothing new.
// The plugin does not write ProducerFact.release: the Tool original confirmation belongs to AD-05
// (JC-RELEASE-TOOL-PATH).
//
// The plugin keeps nothing but the current generation of its dependencies. A call made while it is
// pending or stopped, or one that was waiting when it stopped, answers `unavailable`; one that
// stopped after a commit answered `commit-unknown` stays `commit-unknown`, since that commit may
// have landed.
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentJournal,
  AgentJournalEntry,
  AgentMaterials,
  ExecutionSnapshot,
  Failure,
  Material,
  ReceivedEntry,
} from '@omne-harness/agent-contract'
import { agentJournalKey, agentMaterialsKey } from '@omne-harness/agent-cordis-contract/cordis'
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
/** The reads after a `changed`: another commit moved the channel between the read and the commit. */
const ROUNDS = 3
/** The initial values of the two configuration fields (IC-14: the assembly may set others). */
const TIMEOUT_MS = 30_000
const RETRY_BACKOFF_MS = 50

/**
 * A decoded Tool delivery material: the tenant text the receiver kept and the complete delivery.
 * The shape is that of the receiver's Model facts material; which schema carries it is the owner's.
 */
export type ToolDeliveryEnvelope = Readonly<{
  tenant: string
  delivery: ToolDelivery<ContentBlock>
}>

/**
 * The Agent owner's adopted reading of the material in which the result receiver keeps a Tool
 * delivery: the envelope, or null for a material of any other schema or one that does not decode.
 * It is pure: it reads no store and proves no qualification.
 */
export type ToolDeliveryReader = (material: Material<ContentBlock>) => ToolDeliveryEnvelope | null

/**
 * What the assembly hands to AD-06. `toolDeliveries` is null until the Agent owner adopts the Tool
 * delivery schema (TOOL-SETTLEMENT-SCHEMA); with null every Tool entry answers `unavailable`.
 * `coordinator` is the principal that the assembly issues to the coordinator of one session, as for
 * AD-05 (`forSession({ actor: 'coordinator', ... })`). The published-event trigger needs it, since
 * the event names no principal; without it the plugin subscribes to nothing and only `consume`
 * reads.
 */
export type SessionToolLogConsumptionInput = Readonly<{
  toolDeliveries: ToolDeliveryReader | null
  coordinator?: (
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ) => Promise<Outcome<unknown, SessionCoordinatorPrincipalFailure>>
}>

/**
 * The configuration of the row (data only): how long one dependency call may take, and the wait
 * before a resend after `commit-unknown` or a new read after `changed`.
 */
export type SessionToolLogConsumptionConfig = Readonly<{
  timeoutMs?: number
  retryBackoffMs?: number
}>

/**
 * One call: the execution of one Session whose Tool entries are read, and the principal that the
 * assembly issued to the coordinator of that session. The tenant and the principal come with every
 * call (IC-18); the plugin keeps neither.
 */
export type ToolLogTarget = Readonly<{
  principal: unknown
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

/**
 * The answer of one call. `progress` is the saved progress of the execution's Tool channel after the
 * call, null when no batch of it was ever saved. `committed` tells whether this call committed a
 * batch (or recognized its own commit whose reply was lost). `waiting` counts the Tool entries after
 * the progress that wait for Session to bind their call.
 */
export type ToolLogConsumed = Readonly<{
  progress: Readonly<{ through: string; interpreted: DurableEvidence }> | null
  committed: boolean
  waiting: number
}>

type Answer<T> = Outcome<T, SessionFailure>
type ToolEntry = ReceivedEntry &
  Readonly<{ delivery: Extract<ReceivedEntry['delivery'], { producer: 'tool' }> }>
type Step = Readonly<{ kind: 'item'; item: SessionEntriesItem }> | Readonly<{ kind: 'unbound' }>

/** The dependencies of one generation of the plugin. */
type Ports = Readonly<{
  readWork(access: SessionAccess<unknown>): Reply<WorkSnapshot>
  load: AgentJournal<unknown>['load']
  read: AgentMaterials<unknown, ContentBlock>['read']
  commitEntries: SessionTransactionPort<unknown>['commitEntries']
  /** True once the generation stopped; checked before every commit. */
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

/** An Agent read failure in Session's terms: refusals stay refusals, the rest is unavailable. */
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

/** The Run that owns `execution` in the snapshot: the active Run or an earlier one. */
function runOf(work: WorkSnapshot, execution: string): RunId | null {
  if (work.run.kind === 'active' && work.run.execution.execution === execution) return work.run.run
  return work.executions?.find(item => item.execution.execution === execution)?.run ?? null
}

/** Session and Agent brand the same consumption text differently. */
const sameText = (left: string, right: string): boolean => left === right

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A result delivery carries its whole settlement; an envelope without it is not complete. */
function settled(delivery: Record<string, unknown>): boolean {
  return (
    object(delivery.terminal) &&
    (delivery.actualTerminal === null || object(delivery.actualTerminal)) &&
    object(delivery.effect)
  )
}

/** The answer of `work`, or `late` when it took longer than `ms`. A rejection propagates. */
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

/** The operation identity of one observation: the same reading is the same operation. */
function operationOf(
  tenantText: string,
  observation: Omit<SessionEntriesObservation, 'operation' | 'tenant'>,
) {
  const digest = createHash('sha256')
    .update(canonical(['ad06/1', tenantText, observation]))
    .digest('hex')
  return `ad06_${digest}` as SessionOperationId
}

/**
 * The evidence of the execution head that the channel boundary records: the load revision and the
 * Tool entries of the channel at that revision. The Agent snapshot carries no head evidence of its
 * own, so the plugin derives it, the same value for the same load.
 */
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

/**
 * The Agent J02 read check of the material of one Tool entry under the adopted reading: the tenant
 * the receiver kept, the delivery kind and key, the frozen consumer, the account of the entry, the
 * complete settlement of a result, and the relation that Tool's own judgment checks. Answers null
 * when it holds.
 */
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
    return judged.failure.reason === 'foreign-tenant'
      ? denied()
      : invalid(field, `the material fails the delivery check: ${judged.failure.reason}`)
  return null
}

/** The producer facts of one checked Tool entry; an unreported account is no fact, never zero. */
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

/**
 * The consumption of one generation. It reads, translates and commits; it keeps nothing between
 * calls, so a new generation starts from the saved progress.
 */
function createToolLogConsumption(
  given: SessionToolLogConsumptionInput,
  ports: Ports,
  settings: Settings,
): (target: ToolLogTarget) => Reply<ToolLogConsumed> {
  /** One dependency read within the configured time; `late` is unavailable, never an answer. */
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

  /** One read of the channel and, when it has items, one commit. `changed` goes back to the caller. */
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
    if (execution.entries === undefined)
      return unavailable('the Journal provider serves no entries; absent is not an empty list')
    const channel = execution.entries.filter(isToolReceived)
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

  /** The Session commit; a lost reply is sent again once under the same operation. */
  async function commit(
    observation: SessionEntriesObservation,
    start: SessionEntriesStart,
    waiting: number,
  ): Promise<Answer<ToolLogConsumed>> {
    const unknown = fail({ kind: 'commit-unknown', operation: observation.operation } as const)
    for (let attempt = 0; ; attempt += 1) {
      // After a commit-unknown the earlier attempt may have landed: stopping keeps it unknown.
      if (ports.stopped())
        return attempt === 0 ? unavailable('the tool log consumption has stopped') : unknown
      let answer
      try {
        answer = await within(settings.timeoutMs, () => ports.commitEntries({ observation, start }))
      } catch {
        // The write may have happened: the outcome is unknown, never a plain failure.
        return unknown
      }
      // A commit that did not answer in time may still land; it is unknown, not resent blind.
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

/**
 * The AD-06 plugin and the call that reaches it. The plugin provides no key: it needs `session`
 * with the `coordinator` caller class, `agentJournal`, `agentMaterials` and `sessionTransactions`,
 * and stays pending while any of them is absent. A new provider of any of them runs the plugin
 * again. With `input.coordinator` it subscribes to `session-adapters/agent-published` and reads the
 * named execution after each event, one session at a time. `consume` reaches the current
 * generation; while there is none it answers `unavailable`.
 */
export function createSessionToolLogConsumptionPlugin(input: SessionToolLogConsumptionInput) {
  let current: ((target: ToolLogTarget) => Reply<ToolLogConsumed>) | null = null
  return {
    plugin: {
      name: 'session-ad06',
      inject: {
        [sessionKey]: { caller: 'coordinator' as const },
        [agentJournalKey]: null,
        [agentMaterialsKey]: null,
        [sessionTransactionsKey]: null,
      },
      Config: configSchema,
      apply(ctx: Context, config: SessionToolLogConsumptionConfig | undefined) {
        let stopped = false
        // A wrapper that declares the injects as a plain list (the assembly's row) drops the intercept
        // configuration; the plugin names its caller class again so `session` always sees it.
        const session = ctx.intercept(sessionKey, { caller: 'coordinator' })[sessionKey]
        const journal = ctx[agentJournalKey]
        const materials = ctx[agentMaterialsKey]
        const transactions = ctx[sessionTransactionsKey]
        const logger = ctx.logger(OWNER)
        const consume = createToolLogConsumption(
          input,
          {
            readWork: access => session.work.readWork(access),
            load: value => journal.load(value),
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
        // AD-06 trigger, as AD-05: each successful write of the Journal names its execution; a read
        // after it commits the Tool entries received since the saved progress, and nothing when
        // there are none. The event carries no principal, so the coordinator is asked for it.
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
