// The two usage sources: a model dispatch or a tool call as one usage fact, read through the
// producer's own range read, which qualifies the reader itself.
import { payableAmount, type CallAccount, type UsageItem } from '@omne-harness/call-account'
import type { ModelDispatchFact, ModelDispatchFacts } from '@omne-harness/model-contract'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import type { ToolAccounts, ToolUsageFact } from '@omne-harness/tool-contract/provider'
import type {
  UsageCost,
  UsageFact,
  UsagePortFailure,
  UsageSource,
  UsageSourcePage,
} from '@omne-harness/usage-contract'
import { msBetween, msOfDuration } from './time.ts'

const UNSENT_USAGE: readonly UsageItem[] = []
const UNKNOWN_USAGE: readonly UsageItem[] = [
  { name: 'input', state: 'unknown', unit: 'token' },
  { name: 'output', state: 'unknown', unit: 'token' },
]

function costOf(account: CallAccount): UsageCost | null {
  if (account.cost.length === 0) return null
  const payable = payableAmount(account)
  return 'ok' in payable && payable.ok.state === 'known' ? payable.ok : { state: 'unknown' }
}

export function modelUsageFact(fact: ModelDispatchFact): UsageFact {
  const sent = fact.send !== 'not-sent'
  const { prepared, sent: sentAt, responseStarted, firstContent, ended } = fact.instants
  return {
    source: 'model',
    subject: { kind: 'model_call', id: fact.call },
    unit: fact.dispatch,
    at: prepared,
    consumer: fact.consumer,
    labels: {
      model: fact.supplier.model,
      provider: fact.supplier.provider,
      profile: fact.profile.name,
      tool: null,
    },
    outcome: fact.outcome.kind,
    cause: fact.outcome.kind === 'failed' ? fact.outcome.cause : null,
    usage: fact.account?.usage ?? (sent ? UNKNOWN_USAGE : UNSENT_USAGE),
    cost: fact.account === null ? (sent ? { state: 'unknown' } : null) : costOf(fact.account),
    durations: {
      toResponse: msBetween(sentAt, responseStarted),
      toFirstContent: msBetween(sentAt, firstContent),
      total: msBetween(sentAt, ended),
      generation: msBetween(firstContent, ended),
    },
    connectRetries: fact.connectRetries,
    window:
      fact.contextWindow === null
        ? null
        : {
            tokens: fact.contextWindow.tokens,
            compactAtPercent: fact.contextWindow.compactionTriggerPercent,
          },
    accounted: fact.account !== null,
  }
}

function endingOf(outcome: ToolUsageFact['outcome']): Pick<UsageFact, 'outcome' | 'cause'> {
  switch (outcome.kind) {
    case 'completed':
      return { outcome: 'completed', cause: null }
    case 'failed':
      return { outcome: 'failed', cause: outcome.cause }
    case 'interrupted':
      return { outcome: 'interrupted', cause: outcome.cause.kind }
    default:
      return { outcome: 'failed', cause: outcome.kind }
  }
}

export function toolUsageFact(fact: ToolUsageFact): UsageFact {
  return {
    source: 'tool',
    subject: { kind: 'tool_execution', id: fact.call },
    unit: fact.call,
    at: fact.start,
    consumer: fact.consumer,
    labels: { model: null, provider: null, profile: null, tool: fact.tool },
    ...endingOf(fact.outcome),
    usage: fact.account.usage,
    cost: costOf(fact.account),
    durations: {
      toResponse: null,
      toFirstContent: null,
      total: msOfDuration(fact.account.duration),
      generation: null,
    },
    connectRetries: 0,
    window: null,
    accounted: true,
  }
}

type Page<E> = Outcome<
  Readonly<{ entries: readonly E[]; undated: number; next: string | null }>,
  Readonly<{ kind: string }>
>

async function paged<E>(
  read: () => Promise<Page<E>>,
  map: (entry: E) => UsageFact,
): Promise<Outcome<UsageSourcePage, UsagePortFailure>> {
  try {
    const answer = await read()
    if ('ok' in answer)
      return succeed({
        entries: answer.ok.entries.map(map),
        undated: answer.ok.undated,
        next: answer.ok.next,
      })
    return fail(
      answer.failure.kind === 'denied'
        ? { kind: 'denied' }
        : { kind: 'unavailable', diagnostic: `the producer answered ${answer.failure.kind}` },
    )
  } catch {
    return fail({ kind: 'unavailable', diagnostic: 'the producer read threw' })
  }
}

export type SourceLimits = UsageSource<unknown>['limits']
const absent = (what: string) =>
  Promise.resolve(
    fail<UsagePortFailure>({ kind: 'unavailable', diagnostic: `${what} is not here` }),
  )

/** The model source; the dispatch facts read is taken at each call. */
export function modelUsageSource<P>(
  read: () => ModelDispatchFacts<P> | undefined,
  limits: SourceLimits,
): UsageSource<P> {
  return {
    name: 'model',
    limits,
    list: input => {
      const facts = read()
      if (facts === undefined) return absent('the model dispatch facts read')
      return paged(() => facts.list({ ...input, order: 'ascending' }), modelUsageFact)
    },
  }
}

/** The tool source; the accounts read is taken at each call. */
export function toolUsageSource<P>(
  read: () => ToolAccounts<P> | undefined,
  limits: SourceLimits,
): UsageSource<P> {
  return {
    name: 'tool',
    limits,
    list: input => {
      const accounts = read()
      if (accounts === undefined) return absent('the tool accounts read')
      return paged(() => accounts.list({ ...input, order: 'ascending' }), toolUsageFact)
    },
  }
}
