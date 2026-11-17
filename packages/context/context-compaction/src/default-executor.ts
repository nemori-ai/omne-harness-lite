import { randomUUID } from 'node:crypto'
import {
  compactionGeneration,
  decodeCompactionTaskRef,
  type Access,
  type CompactionReply,
  type CompactionRequest,
} from '@omne-harness/agent-contract'
import { tenantEquals } from '@omne-harness/legal-identity'
import type * as M from '@omne-harness/model-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from './evidence.ts'
import type { CompactionExecution, CompactionExecutor, CompactionStore } from './provider.ts'
import {
  prepareDefaultSummary,
  processDefaultSummary,
  type DefaultPreparation,
} from './default-preparation.ts'
import {
  readDefaultState,
  saveDefaultState,
  type ProcessedSummary,
  type SummaryOutcome,
} from './default-state.ts'
import {
  DEFAULT_COMPACTION_CONSUMER,
  summaryCompletion,
  summaryIdentities,
} from './default-identities.ts'
import {
  DEFAULT_COMPACTION_CONFIGURATION,
  isDefaultCompactionConfiguration,
  type DefaultCompactionConfiguration,
} from './default-configuration.ts'

export type SummaryCompletionInput<P> = Omit<M.AckInput<P>, 'operation'> &
  Readonly<{ consumer: M.ConsumerRef; reference: M.ModelInvocationRef }>
export type DefaultCompactionExecutor<P> = CompactionExecutor &
  Readonly<{
    initialState: string
    verifyCompletion(input: SummaryCompletionInput<P>): M.Reply<M.DurableEvidence>
  }>
export type DefaultCompactionOptions<P> = DefaultPreparation<P> &
  Readonly<{
    configuration?: DefaultCompactionConfiguration
    store: CompactionStore
    model: M.ModelRuntime<P>
    access(request: CompactionRequest): CompactionReply<Access<P>>
  }>
const pending = (): CompactionExecution => ({
  phase: 'pending',
  knowledge: 'uncertain',
  physical: 'unknown',
})
const terminal = (outcome: SummaryOutcome): CompactionExecution => ({
  phase: 'terminal',
  outcome,
  physical: 'settled',
})
const dependency = (diagnostic: unknown) =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'compaction-model',
    diagnostic: canonical(diagnostic),
  })

export function createDefaultCompactionExecutor<P>(
  options: DefaultCompactionOptions<P>,
): DefaultCompactionExecutor<P> {
  const configuration = options.configuration ?? DEFAULT_COMPACTION_CONFIGURATION
  if (!isDefaultCompactionConfiguration(configuration))
    throw new TypeError('invalid default compaction configuration')
  const initialState = canonical({ version: 1, phase: 'preparing', configuration })
  async function run(
    request: CompactionRequest,
    cancelling: boolean,
  ): CompactionReply<CompactionExecution> {
    const found = await options.store.read(request.ref)
    if ('failure' in found) return found
    if (found.ok === null) return fail({ kind: 'not-found' })
    const record = found.ok
    if (canonical(record.state.ref) !== canonical(request.ref))
      return fail({ kind: 'conflict', ref: request.ref })
    cancelling ||= record.cancellation !== null
    if (record.execution === null)
      return fail({
        kind: 'invalid',
        field: 'execution',
        reason: 'missing default compaction checkpoint',
      })
    const decoded = readDefaultState(record.execution)
    if ('failure' in decoded) return decoded
    const state = decoded.ok
    if (state.phase === 'preparing' && cancelling)
      return succeed(
        terminal({
          kind: 'failed',
          reason: 'execution-failed',
          diagnostic: 'cancelled before summary intent',
        }),
      )
    const acquired = await options.access(request)
    if ('failure' in acquired) return acquired
    const access = acquired.ok
    if (!tenantEquals(access.tenant, request.ref.tenant))
      return fail({ kind: 'denied', action: 'summary-tenant' })
    if (state.phase === 'preparing') {
      const prepared = await prepareDefaultSummary(options, access, request, state.configuration)
      if ('failure' in prepared) return prepared
      if ('kind' in prepared.ok) return succeed(terminal(prepared.ok))
      const saved = await saveDefaultState(
        options.store,
        request,
        record.execution,
        prepared.ok,
        true,
      )
      return 'failure' in saved ? saved : succeed(pending())
    }
    const ids = summaryIdentities(request, state.attempt)
    const completed = state.processed.find(item => item.attempt === state.attempt)
    if (completed !== undefined) {
      if (!completed.acknowledged) {
        const ack = await options.model.consumption.acknowledge({
          ...access,
          call: ids.call,
          operation: ids.operation('acknowledge'),
          result: completed.result,
          evidence: { kind: 'processed', completion: summaryCompletion(request, completed) },
        })
        if ('failure' in ack) return dependency(ack.failure)
        const saved = await saveDefaultState(
          options.store,
          request,
          record.execution,
          {
            ...state,
            processed: state.processed.map(item =>
              item.attempt === completed.attempt ? { ...item, acknowledged: true } : item,
            ),
          },
          false,
        )
        return 'failure' in saved ? saved : succeed(pending())
      }
      if (
        !cancelling &&
        completed.outcome.kind === 'cannot-fit' &&
        state.attempt < state.configuration.summaryAttempts
      ) {
        const saved = await saveDefaultState(
          options.store,
          request,
          record.execution,
          { ...state, attempt: state.attempt + 1 },
          true,
        )
        return 'failure' in saved ? saved : succeed(pending())
      }
      return succeed(terminal(completed.outcome))
    }
    const known = await options.model.calls.inspect({ ...access, reference: ids.reference })
    if ('failure' in known) return dependency(known.failure)
    if (known.ok.kind === 'not-accepted') {
      // This is the already-persisted intent, including when cancellation raced admission.
      const admitted = await options.model.calls.admit({
        ...access,
        call: ids.call,
        operation: ids.operation('admit'),
        request: state.fixed,
        consumer: ids.consumer,
      })
      if ('failure' in admitted) return dependency(admitted.failure)
      if (cancelling)
        await options.model.calls.cancel({
          ...access,
          call: ids.call,
          operation: ids.operation('cancel'),
        })
      return succeed(pending())
    }
    if (canonical(known.ok.state.consumer) !== canonical(ids.consumer))
      return dependency('summary consumer mismatch')
    if (known.ok.state.phase !== 'settled') {
      if (cancelling) {
        const cancelled = await options.model.calls.cancel({
          ...access,
          call: ids.call,
          operation: ids.operation('cancel'),
        })
        if ('failure' in cancelled) return dependency(cancelled.failure)
      }
      return succeed(pending())
    }
    const settlement = known.ok.state.settlement
    let outcome: Awaited<CompactionReply<SummaryOutcome>>
    if (cancelling)
      outcome = succeed({
        kind: 'failed',
        reason: 'execution-failed',
        diagnostic: 'summary excluded after cancellation',
      })
    else {
      const parts = await readResult(options.model, access, ids, settlement)
      if ('failure' in parts) return parts
      outcome = await processDefaultSummary(
        options.resources,
        access,
        request,
        compactionGeneration(request.ref),
        state,
        settlement,
        parts.ok,
      )
    }
    if ('failure' in outcome) return outcome
    const processed: ProcessedSummary = {
      attempt: state.attempt,
      result: settlement.version,
      outcome: outcome.ok,
      acknowledged: false,
    }
    const saved = await saveDefaultState(
      options.store,
      request,
      record.execution,
      { ...state, processed: [...state.processed, processed] },
      false,
    )
    return 'failure' in saved ? saved : succeed(pending())
  }

  return {
    initialState,
    advance: request => run(request, false),
    async cancel(request) {
      const result = await run(request, true)
      return 'failure' in result ? result : succeed(result.ok.physical)
    },
    async verifyCompletion(input) {
      const invalid = () =>
        fail<M.ModelFailure>({
          kind: 'handoff-invalid',
          reason: 'default compaction result not durably processed',
        })
      if (
        input.consumer.owner !== DEFAULT_COMPACTION_CONSUMER ||
        input.evidence.kind !== 'processed'
      )
        return invalid()
      const ref = decodeCompactionTaskRef(input.consumer.work)
      if ('failure' in ref || !tenantEquals(input.tenant, ref.ok.tenant)) return invalid()
      const found = await options.store.read(ref.ok)
      if ('failure' in found)
        return fail({
          kind: 'unavailable',
          dependency: 'compaction-store',
          diagnostic: canonical(found.failure),
        })
      if (
        found.ok?.request === null ||
        found.ok?.request === undefined ||
        found.ok.execution === null
      )
        return invalid()
      const decoded = readDefaultState(found.ok.execution)
      if ('failure' in decoded || decoded.ok.phase !== 'running') return invalid()
      const processed = decoded.ok.processed.find(
        item => String(item.attempt) === input.consumer.position,
      )
      if (processed === undefined || processed.result !== input.result) return invalid()
      const ids = summaryIdentities(found.ok.request, processed.attempt)
      const proof = summaryCompletion(found.ok.request, processed)
      return ids.call === input.call &&
        ids.reference === input.reference &&
        canonical(ids.consumer) === canonical(input.consumer) &&
        canonical(proof) === canonical(input.evidence.completion)
        ? succeed(proof)
        : invalid()
    },
  }
}

async function readResult<P>(
  model: M.ModelRuntime<P>,
  access: Access<P>,
  ids: ReturnType<typeof summaryIdentities>,
  settlement: M.Settlement,
): CompactionReply<readonly M.ResultPart[]> {
  // A read lease is disposable. A fresh lease after a crash reads the same settled result from page zero.
  const opened = await model.consumption.beginRead({
    ...access,
    reference: ids.reference,
    operation: ids.operation(`read_${randomUUID()}`),
    result: settlement.version,
  })
  if ('failure' in opened) return dependency(opened.failure)
  if (opened.ok.kind === 'acknowledged')
    return dependency('summary acknowledged without local processing proof')
  const read = opened.ok.read
  try {
    let state = opened.ok.value
    const parts: M.ResultPart[] = []
    const seen = new Set<string>()
    while (state.kind === 'reading') {
      if (canonical(state.page.settlement) !== canonical(settlement))
        return dependency('summary settlement changed while reading')
      parts.push(...state.page.parts)
      if (state.page.next === null) return succeed(parts)
      if (seen.has(state.page.next)) return dependency('summary result cursor repeated')
      seen.add(state.page.next)
      const next = await model.consumption.readNext({
        ...access,
        call: ids.call,
        read,
        after: state.page.next,
      })
      if ('failure' in next) return dependency(next.failure)
      state = next.ok
    }
    return dependency(`summary read ended: ${state.reason}`)
  } finally {
    await model.consumption.closeRead({ ...access, call: ids.call, read })
  }
}
