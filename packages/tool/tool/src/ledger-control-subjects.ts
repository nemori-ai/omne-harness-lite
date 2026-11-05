import type { ContentBlock } from '@omne-harness/content-block'
import { fail, succeed, type Outcome } from '@omne-harness/operation-result'
import {
  decodeToolOperationId,
  type ControlRecord,
  type DurableEvidence,
  type Reply,
  type ToolFailure,
  type ToolOperationId,
} from '@omne-harness/tool-contract'
import {
  denied,
  invalid,
  judgeEvidenceField,
  type CallInput,
  type MutationInput,
} from './boundary.ts'
import { fixCleanupFields } from './cleanup-boundary.ts'
import type { ToolControlSubjects, ToolLedgerControls } from './construction.ts'
import { mintEvidence } from './evidence.ts'
import { rejectControl } from './ledger-control.ts'
import { reply, type Decision, type Mint, type Snapshot } from './ledger-decider.ts'
import { sameFactValue } from './ledger-facts.ts'
import type { CallRecord, LedgerDomain } from './ledger-store.ts'

const unavailable = (diagnostic: string): Outcome<never, ToolFailure> =>
  fail({ kind: 'unavailable', dependency: 'control-subjects', diagnostic })

/** Every CAS retry compares against that snapshot's winner before the intent is recalled. */
export async function controlSubject<P, B extends ContentBlock>(
  snapshot: Snapshot<B>,
  context: MutationInput<P>,
  subjects: ToolControlSubjects<P> | undefined,
): Reply<DurableEvidence> {
  if (snapshot.call === null) return invalid('call', 'unknown-call')
  if (subjects === undefined) return unavailable('original controller provider is missing')
  const known = snapshot.operations.get(context.operation)
  try {
    if (known === undefined) {
      const captured = await subjects.capture(context)
      if ('failure' in captured) return captured
      const checked = judgeEvidenceField(captured.ok, 'subject')
      return 'failure' in checked ? unavailable('captured subject reference is invalid') : checked
    }
    if (known.receipt.kind !== 'control')
      return fail({ kind: 'conflict', operation: context.operation })
    const checked = judgeEvidenceField(known.receipt.subject, 'subject')
    if ('failure' in checked)
      return unavailable('original controller reference is missing or invalid')
    const verdict = await subjects.matches({ ...context, subject: checked.ok })
    if (verdict.kind === 'allowed') return checked
    if (verdict.kind === 'denied') return denied('control')
    return unavailable(verdict.diagnostic)
  } catch {
    return unavailable('original controller provider failed')
  }
}

type ControlTransaction<B extends ContentBlock> = (
  domain: LedgerDomain,
  operation: ToolOperationId | null,
  decide: (snapshot: Snapshot<B>, mint: Mint) => Promise<Decision<ControlRecord, B>>,
  unknown: Outcome<ControlRecord, ToolFailure>,
) => Reply<ControlRecord>

/** Resolve only the durable binding here; current qualification belongs to the provider. */
function pendingController<B extends ContentBlock>(
  snapshot: Snapshot<B>,
  call: CallRecord,
  control: ControlRecord,
): Outcome<DurableEvidence, ToolFailure> {
  const operation = snapshot.operations.get(control.operation)
  if (operation?.receipt.kind !== 'control')
    return unavailable('original controller receipt is missing')
  const subject = judgeEvidenceField(operation.receipt.subject, 'subject')
  if ('failure' in subject)
    return unavailable('original controller reference is missing or invalid')
  const task = snapshot.tasks.find(
    item => item.kind === 'stop' && item.operation === control.operation,
  )
  if (task?.kind !== 'stop' || !sameFactValue(task.control.start, call.start))
    return invalid('control', 'not-original-execution')
  const expected = mintEvidence(
    'operation',
    {
      tenant: call.tenant,
      call: call.call,
      operation: control.operation,
    },
    operation.revision,
    { intent: control.intent, start: call.start, subject: subject.ok },
  )
  if (
    !sameFactValue(expected, control.source) ||
    !sameFactValue(task.control.source, control.source)
  )
    return invalid('control', 'controller-binding-mismatch')
  return subject
}

export function createLedgerControls<P, B extends ContentBlock>(
  dependencies: Readonly<{
    subjects: ToolControlSubjects<P> | undefined
    entry(input: unknown, action: 'write'): Reply<CallInput<P>>
    transact: ControlTransaction<B>
  }>,
): ToolLedgerControls<P> {
  const { subjects, entry, transact } = dependencies
  return {
    prepareDispatch: async input => {
      const fixed = fixCleanupFields(input, ['control', 'source'])
      if ('failure' in fixed) return fixed
      const control = decodeToolOperationId(fixed.ok.control)
      if ('failure' in control) return invalid('control', 'type')
      const source = judgeEvidenceField(fixed.ok.source, 'source')
      if ('failure' in source) return source
      const context = await entry(input, 'write')
      if ('failure' in context) return context
      return transact(
        { kind: 'call', tenant: context.ok.tenant, call: context.ok.call },
        null,
        async (snapshot, mint) => {
          const call = snapshot.call
          const original = call?.state.controls.find(item => item.operation === control.ok)
          if (call === null || original === undefined || !sameFactValue(original.source, source.ok))
            return reply(invalid('control', 'not-original-control'))
          if (original.progress.kind !== 'pending') return reply(succeed(original))
          const subject = pendingController(snapshot, call, original)
          if ('failure' in subject) return reply(subject)
          if (subjects === undefined)
            return reply(unavailable('original controller provider is missing'))
          try {
            const verdict = await subjects.qualify({
              tenant: context.ok.tenant,
              call: context.ok.call,
              subject: subject.ok,
            })
            if (verdict.kind === 'allowed') return reply(succeed(original))
            if (verdict.kind === 'denied') return rejectControl(call, original, mint)
            return reply(unavailable(verdict.diagnostic))
          } catch {
            return reply(unavailable('original controller provider failed'))
          }
        },
        unavailable('controller rejection commit is unconfirmed; inspect again before dispatch'),
      )
    },
  }
}
