import {
  compactionGeneration,
  type CompactionInput,
  type CompactionInputStore,
  type Failure,
  type RequestPreparation,
} from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import { replaySourceCall } from '@omne-harness/model-contract'
import { judgeCompaction, type CompactionContext, type Message } from '@omne-harness/message'
import { fail, succeed } from '@omne-harness/operation-result'
import {
  chooseRepresentations,
  measureCandidate,
  projectMessageForModel,
  type AssemblyResult,
  type HistoryEvidence,
  type HistorySource,
  type RequestCandidate,
} from '@omne-harness/request-context-contract'
import { canonical, digest } from './records.ts'
import { failureOfAssembly, selectedModel, unavailable } from './translate.ts'

type Prepare<P> = Parameters<RequestPreparation<P>['prepare']>[0]
type Need = Extract<AssemblyResult, { kind: 'needs-compaction' }>

function representationOf(candidate: RequestCandidate) {
  const { assembled, preparation } = candidate
  const history = assembled.messages
  if (history.length !== preparation.view.messages.length) return null
  const represented = new Map(
    preparation.view.messages.map((entry, i) => [entry.entry, history[i]]),
  )
  return {
    represented,
    frame: {
      system: assembled.system,
      tools: assembled.tools,
    },
  }
}

export async function freezeCompaction<P>(
  input: Prepare<P>,
  history: HistoryEvidence,
  need: Need,
  source: HistorySource<P>,
  store: CompactionInputStore<P>,
) {
  const access = { principal: input.principal, tenant: input.tenant }
  const context = await source.compactionContext({ access, evidence: history, coverTo: null })
  if (context.kind !== 'context') {
    const failure: Failure =
      context.kind === 'epoch-changed'
        ? { kind: 'changed' }
        : context.kind === 'denied'
          ? { kind: 'denied', action: 'freeze-compaction' }
          : context.kind === 'invalid'
            ? { kind: 'invalid', field: context.field, reason: context.reason }
            : unavailable(
                context.kind === 'unknown' ? 'compaction-context-unknown' : context.diagnostic,
              )
    return fail(failure)
  }
  if (digest(context.evidence) !== digest(history))
    return fail({
      kind: 'invalid' as const,
      field: 'history.compactionContext.evidence',
      reason: 'source-evidence-conflict',
    })
  const representation = representationOf(need.candidate)
  const upper = context.value.covered.at(-1)?.ref
  if (representation === null || upper === undefined)
    return fail({
      kind: 'invalid' as const,
      field: 'history',
      reason: 'incomplete-compaction-input',
    })
  const { candidate } = need
  const entries = candidate.preparation.rows.flatMap(row => {
    const represented = representation.represented.get(row.entry)
    const message = projectMessageForModel(row.message)
    if (message === null) return []
    return [
      {
        ref: row.entry,
        sequence: String(row.seq),
        message,
        represented: represented === undefined ? [] : [represented],
        ...(row.sourceCall === undefined ? {} : { sourceCall: row.sourceCall.call }),
      },
    ]
  })
  const visible = new Set(entries.map(entry => entry.ref))
  const results = new Set(
    entries.filter(entry => entry.message.role === 'tool').map(entry => entry.ref),
  )
  const window = context.value
  return store.freeze({
    ...access,
    execution: input.advance.execution,
    preparation: input.action,
    value: {
      history: {
        source: input.history,
        origin: window.origin,
        upper,
        epoch: history.epoch,
        base: {
          ...window.base,
          pairings: window.base.pairings.filter(pair => results.has(pair.result)),
        },
        entries,
        logOrder: [...window.covered, ...window.after].map(e => e.ref),
        barriers: window.open.filter(ref => !visible.has(ref)),
        protected: window.open.filter(ref => visible.has(ref)),
      },
      frame: representation.frame,
      target: {
        profile: input.selection.resolution,
        parameters: input.selection.parameters,
        representation: candidate.continuation.projection,
        measurement: input.selection.resolution.profile.definition.meter,
        goals: need.goals,
      },
    },
  })
}

function windowFor(
  input: CompactionInput,
  to: Message & { role: 'compaction' },
): CompactionContext {
  const { history } = input
  const at = history.logOrder.indexOf(to.covers.to)
  const entries = new Map(history.entries.map(entry => [entry.ref, entry.message]))
  const ordered = history.logOrder.map(ref => ({ ref, message: entries.get(ref) ?? null }))
  return {
    origin: history.origin,
    base: history.base,
    covered: ordered.slice(0, at + 1),
    after: ordered.slice(at + 1),
    open: [...history.protected, ...history.barriers],
  }
}

function roundedAmount(check: M.BudgetCheck): bigint {
  const decimal = (text: string) => {
    const [whole = '0', fraction = ''] = text.split('.')
    return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) }
  }
  const a = decimal(check.measurement.amount)
  const m = decimal(check.measurement.kind === 'estimate' ? check.measurement.margin : '0')
  const d = a.d * m.d
  return (a.n * m.d + m.n * a.d + d - 1n) / d
}

export function createCompactionAssessment<P>(
  options: Readonly<{
    inputs: CompactionInputStore<P>
    preparation: M.ModelPreparationResources<P>
  }>,
): RequestPreparation<P>['assessCompaction'] {
  return async input => {
    const access = { principal: input.principal, tenant: input.tenant }
    const read = await options.inputs.read({ ...access, reference: input.original.input })
    if ('failure' in read) return read
    const frozen = read.ok
    const reject = (reason: string) =>
      fail({ kind: 'invalid' as const, field: 'compaction', reason })
    if (input.message.id !== frozen.outputMessageId) return reject('output-identity')
    if (canonical(input.message.derivation) !== canonical(compactionGeneration(input.task)))
      return reject('generation-evidence')
    const window = windowFor(frozen, input.message)
    const judgment = judgeCompaction(input.message, window)
    if ('rejected' in judgment) return reject(judgment.rejected)
    const visible = projectMessageForModel(input.message)
    if (visible === null) return reject('model-invisible')
    // A provider must return a representation supported by the frozen target. This check
    // does not rewrite the returned message or invent conversions on the provider's behalf.
    const summary = chooseRepresentations({
      messages: [visible],
      conversions: new Map(),
      modalities: frozen.target.profile.profile.definition.input,
      policy: {
        identity: frozen.target.representation,
        config: { preferences: { text: ['original'], image: ['original'], voice: ['original'] } },
        choose: () => 'original',
      },
    })
    if (summary.kind !== 'chosen') return reject('unsupported-representation')
    const byRef = new Map(frozen.history.entries.map(entry => [entry.ref, entry]))
    const retained = input.message.retained.flatMap(ref => byRef.get(ref)?.represented ?? [])
    const afterRefs = new Set(window.after.map(entry => entry.ref))
    const after = frozen.history.entries.filter(entry => afterRefs.has(entry.ref))
    const messages = [...retained, ...summary.messages, ...after.flatMap(e => e.represented)]
    const present = new Set(messages.map(message => message.id))
    const sources = frozen.history.entries.flatMap(entry => {
      const call = entry.sourceCall ?? replaySourceCall(entry.message)
      return call !== null && present.has(entry.message.id)
        ? [{ message: entry.message.id, call }]
        : []
    })
    const selection = selectedModel({
      resolution: frozen.target.profile,
      parameters: frozen.target.parameters,
      tools: input.original.input.source,
      evidence: input.original.input.source,
      recipient: { route: input.task.authority, profile: frozen.target.profile.profile.adoption },
    })
    const assembled: M.AssembledModelInput = {
      system: frozen.frame.system,
      tools: frozen.frame.tools,
      messages,
      toolChoice: 'auto',
      parameters: frozen.target.parameters,
      representation: frozen.target.profile.profile.definition.representation,
      source: frozen.target.representation,
    }
    const budget = await measureCandidate(
      { access, preparation: options.preparation },
      selection,
      { sources },
      assembled,
    )
    if (budget.kind !== 'complete' && budget.kind !== 'deferred-media')
      return fail(failureOfAssembly(budget))
    const coversGoals = frozen.target.profile.profile.definition.suppliers.every(supplier =>
      frozen.target.goals.every(goal =>
        budget.checks.some(
          check =>
            canonical(check.supplier) === canonical(supplier.adoption) &&
            check.subject === 'request' &&
            (check.metric === goal.metric ||
              (goal.metric === 'context-tokens' && check.metric === 'input-tokens')),
        ),
      ),
    )
    if (!coversGoals) return fail(unavailable('compaction-budget-unmeasured'))
    const tooLarge =
      budget.checks.some(check => roundedAmount(check) > BigInt(check.limit)) ||
      frozen.target.goals.some(goal =>
        budget.checks.some(check => {
          if (
            goal.metric !== check.metric &&
            !(goal.metric === 'context-tokens' && check.metric === 'input-tokens')
          )
            return false
          const amount =
            roundedAmount(check) +
            (goal.metric === 'context-tokens'
              ? BigInt(frozen.target.profile.profile.definition.context.output.provided)
              : 0n)
          return goal.relation === 'less-than'
            ? amount >= BigInt(goal.limit)
            : amount > BigInt(goal.limit)
        }),
      )
    if (tooLarge)
      return succeed({ kind: 'cannot-fit' as const, diagnostic: 'compacted-request-over-limit' })
    return succeed({
      kind: 'accepted' as const,
      value: {
        preparation: input.original.id,
        task: input.task,
        consumption: input.consumption,
        result: input.result,
        received: input.received,
        message: input.message,
        history: input.original.input.source,
        epoch: frozen.history.epoch,
        admission: {
          owner: 'agent-context',
          record: input.task.task,
          revision: '1',
          digest: digest({ input: input.original.input, result: input.result, budget }),
        },
      },
    })
  }
}
