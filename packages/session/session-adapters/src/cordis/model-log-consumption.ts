import type { Context } from '@deepseek-ai/cordis'
import type {
  AgentExecutionId,
  AgentJournalEntries,
  AgentJournalEntry,
  AgentMaterials,
  JournalEntryItem,
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
  SessionEntriesStart,
  SessionFailure,
  SessionId,
  SessionTransactionPort,
  WorkSnapshot,
  ProducerRef,
  SessionCallBinding,
} from '@omne-harness/session-contract'
import { sessionKey, sessionTransactionsKey } from '@omne-harness/session-cordis-contract/cordis'
import { canonical } from '../testing/canonical.ts'
import type { SessionCoordinatorPrincipalFailure } from './agent-drive.ts'
import { entriesAfter, entriesBatch, progressOf, savedProgress } from './entries-window.ts'
import { announce, subscribePublished } from './published-queue.ts'
import { acknowledgeReceived, type ReceivedAllPorts } from './received-all.ts'

const OWNER = 'session-adapters/model-log'
const CHANNEL = 'model-received'
const ROUNDS = 3

const MODEL_DELIVERY_SCHEMA = Object.freeze({
  owner: 'agent',
  name: 'received-model-delivery',
  revision: '1',
  digest: 'agent:received-model-delivery/1',
})

export type ModelLogTarget = Readonly<{
  tenant: TenantId
  session: SessionId
  execution: AgentExecutionId
}>

export type ModelLogConsumed = Readonly<{
  progress: Readonly<{ through: string; interpreted: DurableEvidence }> | null
  committed: boolean
  waiting: number
}>

export type SessionModelLogConsumptionInput<P> = Readonly<{
  coordinator(
    input: Readonly<{ tenant: TenantId; session: SessionId }>,
  ): Promise<Outcome<P, SessionCoordinatorPrincipalFailure>>
}>

type Ports<P> = ReceivedAllPorts<P> &
  Readonly<{
    readCall(access: SessionAccess<P>, producer: ProducerRef): Reply<SessionCallBinding | null>
    entries: AgentJournalEntries<P>['read']
    read: AgentMaterials<P, ContentBlock>['read']
    commitEntries: SessionTransactionPort<P>['commitEntries']
    consumed(target: ModelLogTarget): void
    stopped(): boolean
  }>

type Answer<T> = Outcome<T, SessionFailure>
type ModelEntry = ReceivedEntry &
  Readonly<{ delivery: Extract<ReceivedEntry['delivery'], { producer: 'model' }> }>
type ModelItem = Readonly<{ sequence: string; entry: ModelEntry }>
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

const isModelItem = (item: JournalEntryItem): item is ModelItem => isModelReceived(item.entry)

function runOf(work: WorkSnapshot, execution: string): RunId | null {
  if (work.run.kind === 'active' && work.run.execution.execution === execution) return work.run.run
  return work.executions?.find(item => item.execution.execution === execution)?.run ?? null
}

const sameText = (left: string, right: string): boolean => left === right

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

type Json = Extract<Material<ContentBlock>, { kind: 'facts' }>['value']

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
  ): Promise<Answer<Step>> {
    const field = `entries[${ordinal - 1n}]`
    const { key } = entry.delivery
    const call = resolveModelInvocationRef(key.reference, access.tenant)
    if ('failure' in call)
      return call.failure.kind === 'malformed'
        ? invalid(`${field}.delivery.key.reference`, 'not a Model invocation reference')
        : denied()
    const asked = await ports.readCall(access, { kind: 'model', call: key.reference })
    if ('failure' in asked) return asked
    const bound = asked.ok
    if (bound === null) return succeed({ kind: 'unbound' })
    if (!sameText(bound.consumption, entry.consumption))
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
    const reading = {
      principal: access.principal,
      tenant: access.tenant,
      execution: target.execution,
    }
    const loaded = await ports.load(reading)
    if ('failure' in loaded) return agentFailure('load', loaded.failure)
    const { revision } = loaded.ok
    const saved = savedProgress(work.ok, run, target.execution, CHANNEL)
    const read = await entriesAfter(ports.entries, reading, saved?.position ?? null)
    if ('failure' in read) return agentFailure('load', read.failure)
    const again = await ports.load(reading)
    if ('failure' in again) return agentFailure('load', again.failure)
    if (again.ok.revision !== revision)
      return unavailable('the execution changed while its entries were read')
    const window = read.ok.filter(isModelItem)
    const after = BigInt(saved?.through ?? '0')
    const items: SessionEntriesItem[] = []
    for (const [at, { entry }] of window.entries()) {
      const step = await translate(access, tenantText, work.ok, entry, after + BigInt(at) + 1n)
      if ('failure' in step) return step
      if (step.ok.kind === 'unbound') break
      items.push(step.ok.item)
    }
    const waiting = window.length - items.length
    if (items.length === 0)
      return succeed({ progress: progressOf(saved), committed: false, waiting })
    const { tenant, session, execution } = target
    const batch = { owner: OWNER, tag: 'ad05', tenant, tenantText, session, run, execution }
    const { observation, start } = entriesBatch({
      ...batch,
      channel: CHANNEL,
      revision,
      saved,
      window,
      items,
    })
    return commit(observation, start, waiting)
  }

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
      if ('ok' in answer && answer.ok.committed) {
        ports.consumed(target)
        const received = { tenantText: tenantText.value, execution: target.execution }
        await acknowledgeReceived(ports, access, received)
      }
      if ('ok' in answer || answer.failure.kind !== 'changed' || left <= 1) return answer
    }
  }
}

function failureText(failure: Failure | SessionFailure): string {
  const detail =
    'diagnostic' in failure
      ? failure.diagnostic
      : 'field' in failure
        ? `${failure.field}: ${failure.reason}`
        : null
  return detail === null ? failure.kind : `${failure.kind}: ${detail}`
}

export function createSessionModelLogConsumptionPlugin<P>(
  input: SessionModelLogConsumptionInput<P>,
) {
  let current: ((target: ModelLogTarget) => Reply<ModelLogConsumed>) | null = null
  return {
    plugin: {
      name: 'session-ad05',
      inject: {
        [agentJournalKey]: null,
        [agentJournalEntriesKey]: null,
        [agentMaterialsKey]: null,
        [sessionTransactionsKey]: null,
        [sessionKey]: { caller: 'coordinator' as const },
      },
      apply(ctx: Context) {
        let stopped = false
        const session = ctx[sessionKey]
        const journal = ctx[agentJournalKey]
        const entries = ctx[agentJournalEntriesKey]
        const materials = ctx[agentMaterialsKey]
        const transactions = ctx[sessionTransactionsKey]
        const logger = ctx.logger(OWNER)
        const warn = (line: string) => logger.warn(line)
        const consume = createModelLogConsumption<P>(input, {
          readWork: access => session.work.readWork(access),
          readCall: (access, producer) => session.work.readCall({ ...access, producer }),
          load: value => journal.load(value),
          acknowledge: value => journal.acknowledge(value),
          warn,
          entries: value => entries.read(value),
          read: value => materials.read(value),
          commitEntries: value => transactions.commitEntries(value),
          consumed: target => announce(ctx, warn, 'consumed', target),
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
        const failing = new Map<string, string>()
        subscribePublished(
          ctx,
          () => stopped,
          async target => {
            const answer = await guarded(target)
            if ('failure' in answer) {
              const said = failureText(answer.failure)
              if (failing.get(target.execution) === said) return
              failing.set(target.execution, said)
              logger.warn(`the consumption of ${target.execution} answered ${said}`)
            } else failing.delete(target.execution)
          },
          ['interpreted'],
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
    consume(target: ModelLogTarget): Reply<ModelLogConsumed> {
      const generation = current
      return generation === null
        ? Promise.resolve(unavailable('the model log consumption is pending or stopped'))
        : generation(target)
    },
  }
}
