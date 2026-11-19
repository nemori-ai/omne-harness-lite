import type {
  Access,
  CompactionReply,
  CompactionRequest,
  DurableEvidence,
} from '@omne-harness/agent-contract'
import { judgeCompaction, judgeMessage, type CompactionContext } from '@omne-harness/message'
import type * as M from '@omne-harness/model-contract'
import type { ModelRequestPreparation } from '@omne-harness/model-contract/provider'
import { succeed } from '@omne-harness/operation-result'
import { planDefaultCompaction } from './default-plan.ts'
import {
  assembledFor,
  fits,
  inputTokens,
  measureDefaultInput,
  measurementUnavailable,
} from './default-measurement.ts'
import type { DefaultExecutionState, SummaryOutcome } from './default-state.ts'
import { canonical } from './evidence.ts'
import type { DefaultCompactionConfiguration } from './default-configuration.ts'

export type DefaultPreparation<P> = Readonly<{
  resources: M.ModelPreparationResources<P>
  requests: ModelRequestPreparation<P>
}>
const instructionText =
  'Summarize the conversation so far for a later request. Keep the user goals, decisions, ' +
  'facts, file names and open questions. Do not invent anything that is not in the material.'

export async function prepareDefaultSummary<P>(
  options: DefaultPreparation<P>,
  access: Access<P>,
  request: CompactionRequest,
  configuration: DefaultCompactionConfiguration,
): CompactionReply<DefaultExecutionState | SummaryOutcome> {
  const input = request.input
  const planned = await planDefaultCompaction(
    input,
    async refs => {
      const selected = new Set(refs)
      const messages = input.history.entries
        .filter(entry => selected.has(entry.ref))
        .flatMap(entry => entry.represented)
      const measured = await measureDefaultInput(
        options.resources,
        access,
        input,
        assembledFor(input, messages, false),
      )
      return 'failure' in measured ? measured : succeed(String(inputTokens(measured.ok)))
    },
    configuration,
  )
  if ('failure' in planned) return planned
  if (planned.ok.kind !== 'planned') return succeed(planned.ok)
  const instruction = judgeMessage({
    id: input.outputMessageId,
    role: 'user',
    blocks: [
      {
        kind: 'text',
        id: 'compaction-summary-instruction',
        visibility: { toHuman: true, toModel: true },
        text: instructionText,
      },
    ],
  })
  if ('rejected' in instruction || instruction.ok.role !== 'user')
    throw new TypeError('invalid summary instruction')
  // The instruction is the last message, in the user role: some models refuse a request that
  // ends with their own turn, and the material it summarizes stays as it was in the history.
  const assembled: M.AssembledModelInput = {
    ...assembledFor(input, [...planned.ok.messages, instruction.ok], false),
    toolChoice: 'none',
    source: request.provider,
  }
  const measured = await measureDefaultInput(options.resources, access, input, assembled)
  if ('failure' in measured) return measured
  if (!fits(input, measured.ok, false))
    return succeed({
      kind: 'failed',
      reason: 'execution-limit',
      diagnostic:
        'the fixed summary material exceeds the summary model input limit; recursive compaction is disabled',
    })
  const fixed = await options.requests.prepare({
    ...access,
    profile: input.target.profile.profile,
    required: {
      modalities: input.target.profile.profile.definition.input,
      source: input.history.source,
    },
    assembled,
  })
  if ('failure' in fixed)
    return fixed.failure.kind === 'invalid'
      ? succeed({
          kind: 'failed',
          reason: 'execution-failed',
          diagnostic: canonical(fixed.failure),
        })
      : measurementUnavailable(canonical(fixed.failure))
  return succeed({
    version: 1,
    phase: 'running',
    configuration,
    fixed: fixed.ok,
    coverTo: planned.ok.coverTo,
    retained: planned.ok.retained,
    attempt: 1,
    processed: [],
  })
}

export async function processDefaultSummary<P>(
  resources: M.ModelPreparationResources<P>,
  access: Access<P>,
  request: CompactionRequest,
  generation: DurableEvidence,
  state: DefaultExecutionState,
  settlement: M.Settlement,
  parts: readonly M.ResultPart[],
): CompactionReply<SummaryOutcome> {
  if (settlement.termination.kind !== 'completed')
    return succeed({
      kind: 'failed',
      reason: 'execution-failed',
      diagnostic: canonical(settlement.termination),
    })
  if (settlement.termination.reason === 'tool-suggestions')
    return succeed({
      kind: 'failed',
      reason: 'invalid-output',
      diagnostic: 'the no-tools summary call returned tool suggestions',
    })
  const input = request.input
  const blocks = parts.flatMap(part =>
    part.kind === 'sealed' && part.block.kind === 'text' && part.block.visibility.toModel
      ? [part.block]
      : [],
  )
  const candidate = judgeMessage({
    role: 'compaction',
    id: input.outputMessageId,
    blocks,
    covers: { from: input.history.origin, to: state.coverTo },
    retained: state.retained,
    derivation: generation,
  })
  if ('rejected' in candidate || candidate.ok.role !== 'compaction')
    return succeed({
      kind: 'failed',
      reason: 'invalid-output',
      diagnostic: 'the summary call did not produce a legal model-visible text summary',
    })
  const byRef = new Map(input.history.entries.map(entry => [entry.ref, entry]))
  const ordered = input.history.logOrder.map(ref => ({
    ref,
    message: byRef.get(ref)?.message ?? null,
  }))
  const end = input.history.logOrder.indexOf(state.coverTo) + 1
  const context: CompactionContext = {
    origin: input.history.origin,
    base: input.history.base,
    covered: ordered.slice(0, end),
    after: ordered.slice(end),
    open: [...input.history.protected, ...input.history.barriers],
  }
  const judged = judgeCompaction(candidate.ok, context)
  if ('rejected' in judged)
    return succeed({ kind: 'failed', reason: 'invalid-output', diagnostic: judged.rejected })
  const retained = state.retained.flatMap(ref => byRef.get(ref)?.represented ?? [])
  const after = new Set(context.after.map(entry => entry.ref))
  const messages = [
    ...retained,
    candidate.ok,
    ...input.history.entries
      .filter(entry => after.has(entry.ref))
      .flatMap(entry => entry.represented),
  ]
  const measured = await measureDefaultInput(
    resources,
    access,
    input,
    assembledFor(input, messages, true),
  )
  if ('failure' in measured) return measured
  return fits(input, measured.ok, true)
    ? succeed({ kind: 'completed', message: candidate.ok })
    : succeed({
        kind: 'cannot-fit',
        reason: 'after-compaction',
        diagnostic: 'compacted whole request exceeds the frozen target',
      })
}
