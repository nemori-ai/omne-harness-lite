// AD-05, Model log consumption: the plugin reads the Model results and accounts that the Agent host
// result receiver already wrote into the same session log, and commits what they mean for Session
// as one batch of the entries channel. It never injects or calls Model.
//
// One call reads the Run that owns the execution as `coordinator`, loads the execution from the
// same AgentJournal, and takes the `received` entries of producer `model` in commit order: that
// list is the `model-received` channel. From the saved progress of the channel on, every entry is
// checked and translated, in order: its call reference names the tenant of the call, Session holds
// the producer binding of the call with the same consumption and consumer, and the material that
// the entry names reads, through the same provider's AgentMaterials, as the facts material the
// receiver kept for exactly this delivery (Agent J02 item 11). A result becomes the `execution`
// fact of the call, and also its `account` fact when a dispatch reported an account; an account
// delivery becomes the `account` fact. No report stays no fact, never a zero.
//
// The translated items go to `commitEntries` in one observation: the consequences, the progress
// and the answer of the operation are one Session commit, after the Agent commit and apart from
// it. A failure of that commit takes nothing back from the Agent records. The operation identity
// is derived from the observation, so the same reading is the same operation: a lost reply is
// recognized by sending it again, and a later read starts after the saved progress and commits
// nothing new. An entry whose call Session has not bound yet stops the batch there: it waits,
// unknown, and is not committed as an empty item. Model release confirmation is not read here: the
// MODEL-ACK-ARRIVAL duty of Session JC-Release is open, so `saved` never becomes a release.
//
// The plugin keeps nothing but the current generation of its dependencies. A call made while the
// plugin is pending or stopped, or one that was waiting when it stopped, answers `unavailable`
// and commits nothing.
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
import {
  judgeModelDelivery,
  resolveModelInvocationRef,
  type ModelDelivery,
} from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type {
  DurableEvidence,
  Reply,
  RunId,
  SessionAccess,
  SessionEntriesItem,
  SessionEntriesObservation,
  SessionEntriesProgress,
  SessionEntriesStart,
  SessionFailure,
  SessionId,
  SessionOperationId,
  SessionTransactionPort,
  WorkSnapshot,
} from '@omne-harness/session-contract'
import { sessionKey, sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'

const OWNER = 'session-adapters/model-log'
const CHANNEL = 'model-received'
/** The reads after a `changed`: another commit moved the channel between the read and the commit. */
const ROUNDS = 3

/**
 * The adoption of the facts material in which the Agent result receiver keeps a Model delivery
 * (Agent J02 item 11; the exact adoption is published in the Agent implementation's public API).
 */
const MODEL_DELIVERY_SCHEMA = Object.freeze({
  owner: 'agent',
  name: 'received-model-delivery',
  revision: '1',
  digest: 'agent:received-model-delivery/1',
})

/** One call: the execution of one Session whose Model entries are read. */
export type ModelLogTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

/**
 * The answer of one call. `progress` is the saved progress of the execution's Model channel after
 * the call, null when no batch of it was ever saved. `committed` tells whether this call committed
 * a batch (or recognized its own commit whose reply was lost). `waiting` counts the Model entries
 * after the progress that wait for Session to bind their call.
 */
export type ModelLogConsumed = Readonly<{
  progress: Readonly<{ through: string; interpreted: DurableEvidence }> | null
  committed: boolean
  waiting: number
}>

/**
 * What the assembly hands to AD-05: the principal that it issues to the coordinator of one session,
 * as for AD-14. The assembly entry answers it with `forSession({ actor: 'coordinator', ... })`.
 */
export type SessionModelLogConsumptionInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
}>

/** The four dependencies of one generation of the plugin. */
type Ports<P> = Readonly<{
  readWork(access: SessionAccess<P>): Reply<WorkSnapshot>
  load: AgentJournal<P>['load']
  read: AgentMaterials<P, ContentBlock>['read']
  commitEntries: SessionTransactionPort<P>['commitEntries']
  /** True once the generation stopped; checked before the commit. */
  stopped(): boolean
}>

type Answer<T> = Outcome<T, SessionFailure>
type ModelEntry = ReceivedEntry &
  Readonly<{ delivery: Extract<ReceivedEntry['delivery'], { producer: 'model' }> }>
type Step = Readonly<{ kind: 'item'; item: SessionEntriesItem }> | Readonly<{ kind: 'unbound' }>

const unavailable = (diagnostic: string, owner = OWNER): Answer<never> =>
  fail({ kind: 'unavailable', owner, diagnostic })
const invalid = (field: string, reason: string): Answer<never> =>
  fail({ kind: 'invalid', field, reason })
const denied = (): Answer<never> => fail({ kind: 'denied', action: 'consume-model-log' })

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

function isModelReceived(entry: AgentJournalEntry): entry is ModelEntry {
  return entry.kind === 'received' && entry.delivery.producer === 'model'
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

type Json = Extract<Material<ContentBlock>, { kind: 'facts' }>['value']

/** The plain value of a facts tree; numbers stay their lexeme, a value that is no tree is null. */
function plain(value: Json): unknown {
  switch (value.kind) {
    case 'null':
      return null
    case 'string':
    case 'boolean':
      return value.value
    case 'number':
      return value.lexeme
    case 'array':
      return value.items.map(plain)
    case 'object': {
      const out: Record<string, unknown> = Object.create(null)
      for (const entry of value.entries) out[entry.key] = plain(entry.value)
      return out
    }
    default: {
      const _exhaustive: never = value
      return _exhaustive
    }
  }
}

/**
 * The Agent J02 read check of the material of one Model entry: the adopted schema, the tenant of
 * the call, the delivery key, the frozen consumer, the account snapshots or account of the entry,
 * and the version relation that Model's own judgment checks. Answers null when it holds.
 */
function materialRefusal(
  tenant: TenantId,
  tenantText: string,
  entry: ModelEntry,
  material: Material<ContentBlock>,
  field: string,
): Answer<never> | null {
  if (material.kind !== 'facts' || canonical(material.schema) !== canonical(MODEL_DELIVERY_SCHEMA))
    return invalid(field, 'not the facts material of a received Model delivery')
  let value: unknown
  try {
    value = plain(material.value)
  } catch {
    return invalid(field, 'the material is not a facts tree')
  }
  if (!object(value) || !object(value.delivery))
    return invalid(field, 'the material holds no Model delivery')
  if (value.tenant !== tenantText) return denied()
  const delivery = value.delivery
  const { key } = entry.delivery
  if (delivery.kind !== key.kind) return invalid(field, 'the material holds another delivery kind')
  if (canonical(delivery.key) !== canonical(key))
    return invalid(field, 'the material holds another delivery key')
  if (canonical(delivery.consumer) !== canonical(entry.consumer))
    return invalid(field, 'the material holds another consumer')
  const kept =
    'accounts' in entry.delivery
      ? canonical(delivery.accounts) === canonical(entry.delivery.accounts)
      : canonical(delivery.account) === canonical(entry.delivery.account)
  if (!kept) return invalid(field, 'the material holds other accounts than the entry')
  // Key, consumer and accounts equal the typed entry; Model's judgment reads the settlement, and a
  // settlement that is not there makes it throw, which is a material that does not decode.
  let judged
  try {
    judged = judgeModelDelivery({ tenant, delivery: delivery as unknown as ModelDelivery })
  } catch {
    return invalid(field, 'the material holds a delivery that does not decode')
  }
  if ('failure' in judged)
    return invalid(field, `the material fails the delivery check: ${judged.failure.reason}`)
  return null
}

/** The operation identity of one observation: the same reading is the same operation. */
function operationOf(
  tenantText: string,
  observation: Omit<SessionEntriesObservation, 'operation' | 'tenant'>,
) {
  const digest = createHash('sha256')
    .update(canonical(['ad05/1', tenantText, observation]))
    .digest('hex')
  return `ad05_${digest}` as SessionOperationId
}

/**
 * The consumption of one generation. It reads, translates and commits; it keeps nothing between
 * calls, so a new generation starts from the saved progress.
 */
function createModelLogConsumption<P>(
  given: SessionModelLogConsumptionInput<P>,
  ports: Ports<P>,
): (target: ModelLogTarget) => Reply<ModelLogConsumed> {
  async function translate(
    access: SessionAccess<P>,
    tenantText: string,
    work: WorkSnapshot,
    entry: ModelEntry,
    ordinal: bigint,
    at: number,
  ): Promise<Answer<Step>> {
    const field = `entries[${at}]`
    const { key } = entry.delivery
    const call = resolveModelInvocationRef(key.reference, access.tenant)
    if ('failure' in call)
      return call.failure.kind === 'malformed'
        ? invalid(`${field}.delivery.key.reference`, 'not a Model invocation reference')
        : denied()
    const bound = work.consumptions.find(
      item =>
        item.binding.producer.kind === 'model' && item.binding.producer.call === key.reference,
    )
    if (bound === undefined) return succeed({ kind: 'unbound' })
    if (!sameText(bound.id, entry.consumption))
      return invalid(`${field}.consumption`, 'not the consumption Session bound to the call')
    if (canonical(bound.binding.consumer) !== canonical(entry.consumer))
      return invalid(`${field}.consumer`, 'not the consumer Session bound to the call')
    const material = await ports.read({
      principal: access.principal,
      tenant: access.tenant,
      source: entry.material,
    })
    if ('failure' in material) return agentFailure('materials.read', material.failure)
    const refusal = materialRefusal(
      access.tenant,
      tenantText,
      entry,
      material.ok,
      `${field}.material`,
    )
    if (refusal !== null) return refusal
    const producer = { kind: 'model' as const, call: key.reference }
    const source = entry.material
    const reported =
      'accounts' in entry.delivery
        ? entry.delivery.accounts.some(item => item.account !== null)
        : true
    const interpretation =
      'accounts' in entry.delivery
        ? [
            { kind: 'execution' as const, producer, source },
            ...(reported ? [{ kind: 'account' as const, producer, source }] : []),
          ]
        : [{ kind: 'account' as const, producer, source }]
    return succeed({
      kind: 'item',
      item: { ordinal: String(ordinal), key: canonical(key), fact: source, interpretation },
    })
  }

  /** One read of the channel and, when it has items, one commit. `changed` goes back to the caller. */
  async function round(
    access: SessionAccess<P>,
    tenantText: string,
    target: ModelLogTarget,
  ): Promise<Answer<ModelLogConsumed>> {
    const work = await ports.readWork(access)
    if ('failure' in work) return work
    const run = runOf(work.ok, target.execution)
    if (run === null)
      return unavailable('Session recorded no Run of this execution', 'session-history')
    const loaded = await ports.load({
      principal: access.principal,
      tenant: access.tenant,
      execution: target.execution,
    })
    if ('failure' in loaded) return agentFailure('load', loaded.failure)
    const snapshot: ExecutionSnapshot = loaded.ok
    if (snapshot.entries === undefined)
      return unavailable('the Journal provider serves no entries; absent is not an empty list')
    const channel = snapshot.entries.filter(isModelReceived)
    const saved: SessionEntriesProgress | undefined = work.ok.entriesProgress?.find(
      item => item.run === run && item.execution === target.execution && item.channel === CHANNEL,
    )
    const after = BigInt(saved?.through ?? '0')
    const count = BigInt(channel.length)
    if (count < after)
      return unavailable('the saved progress passes the Model entries of the execution')
    const progress =
      saved === undefined ? null : { through: saved.through, interpreted: saved.interpreted }
    const items: SessionEntriesItem[] = []
    for (let at = Number(after); at < channel.length; at += 1) {
      const step = await translate(access, tenantText, work.ok, channel[at]!, BigInt(at) + 1n, at)
      if ('failure' in step) return step
      if (step.ok.kind === 'unbound') break
      items.push(step.ok.item)
    }
    const waiting = channel.length - Number(after) - items.length
    if (items.length === 0) return succeed({ progress, committed: false, waiting })
    const through = after + BigInt(items.length)
    const range = {
      session: target.session,
      run,
      execution: target.execution,
      channel: CHANNEL,
      after: after.toString(),
      through: through.toString(),
      boundary: {
        execution: target.execution,
        channel: CHANNEL,
        revision: snapshot.revision,
        executionEvidence: headEvidence(tenantText, target.execution, snapshot.revision, channel),
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
  ): Promise<Answer<ModelLogConsumed>> {
    for (let attempt = 0; ; attempt += 1) {
      if (ports.stopped()) return unavailable('the model log consumption has stopped')
      let answer
      try {
        answer = await ports.commitEntries({ observation, start })
      } catch {
        // The write may have happened: the outcome is unknown, never a plain failure.
        return fail({ kind: 'commit-unknown', operation: observation.operation })
      }
      if ('ok' in answer)
        return succeed({
          progress: { through: answer.ok.through, interpreted: answer.ok.interpreted },
          committed: true,
          waiting,
        })
      if (answer.failure.kind !== 'commit-unknown' || attempt > 0) return answer
    }
  }

  return async target => {
    const tenantText = tenantCodec.encode(target.tenant)
    if (!tenantText.ok) return denied()
    const principal = await given.coordinator({ tenant: target.tenant, session: target.session })
    if ('failure' in principal) return principal
    const access = { principal: principal.ok, tenant: target.tenant, session: target.session }
    for (let left = ROUNDS; ; left -= 1) {
      const answer = await round(access, tenantText.value, target)
      if ('ok' in answer || answer.failure.kind !== 'changed' || left <= 1) return answer
    }
  }
}

/**
 * The evidence of the execution head that the channel boundary records: the load revision and the
 * Model entries of the channel at that revision. The Agent snapshot carries no head evidence of its
 * own, so the plugin derives it, the same value for the same load.
 */
function headEvidence(
  tenantText: string,
  execution: string,
  revision: string,
  channel: readonly ModelEntry[],
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
 * The AD-05 plugin and the call that reaches it. The plugin provides no key: it needs `session`
 * with the `coordinator` caller class, `agentJournal`, `agentMaterials` and `sessionTransactions`,
 * and stays pending while any of them is absent. A new provider of any of them runs the plugin
 * again. `consume` reaches the current generation; while there is none it answers `unavailable`.
 */
export function createSessionModelLogConsumptionPlugin<P>(
  input: SessionModelLogConsumptionInput<P>,
) {
  let current: ((target: ModelLogTarget) => Reply<ModelLogConsumed>) | null = null
  return {
    plugin: {
      name: 'session-ad05',
      inject: {
        [agentJournalKey]: null,
        [agentMaterialsKey]: null,
        [sessionTransactionsKey]: null,
        [sessionKey]: { caller: 'coordinator' as const },
      },
      apply(ctx: Context) {
        let stopped = false
        const session = ctx[sessionKey]
        const journal = ctx[agentJournalKey]
        const materials = ctx[agentMaterialsKey]
        const transactions = ctx[sessionTransactionsKey]
        const logger = ctx.logger(OWNER)
        const consume = createModelLogConsumption<P>(input, {
          readWork: access => session.work.readWork(access),
          load: value => journal.load(value),
          read: value => materials.read(value),
          commitEntries: value => transactions.commitEntries(value),
          stopped: () => stopped,
        })
        const guarded = async (target: ModelLogTarget): Reply<ModelLogConsumed> => {
          try {
            return await consume(target)
          } catch (cause) {
            logger.error(`consume: a dependency threw: ${describe(cause)}`)
            return unavailable(`a dependency threw: ${describe(cause)}`)
          }
        }
        ctx.effect(() => {
          current = guarded
          return () => {
            stopped = true
            if (current === guarded) current = null
          }
        })
      },
    },
    consume(target: ModelLogTarget): Reply<ModelLogConsumed> {
      const generation = current
      return generation === null
        ? Promise.resolve(unavailable('the model log consumption is pending or stopped'))
        : generation(target)
    },
  }
}
