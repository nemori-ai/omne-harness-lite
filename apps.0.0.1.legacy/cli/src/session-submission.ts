import type { SessionPresentation } from './session-presentation.ts'
import type { JsonNumber } from '@omne-harness-lite/content-blocks'
import {
  checkLogPayload,
  checkSourceToken,
  compareInteger,
  type LogEntry,
  type SourceToken,
} from '@omne-harness-lite/session-log'
import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import { StorageDefect } from '@omne-harness-lite/storage'
import type { LocalSessionIngress } from '@omne-harness-lite/session-runtime-local'
import {
  checkOperationRef,
  readSessionFact,
  type SessionFact,
  type OperationRef,
  type Receipt,
  type Terminal,
  type SessionDriverObservations,
  type SessionRunAdmissionBlock,
} from '@omne-harness-lite/session-runtime'

export type SessionSubmissionReading =
  | {
      readonly kind: 'submission'
      readonly receipt: Receipt
      readonly source: SourceToken
      readonly inputPosition: JsonNumber
      readonly messageId: string
      readonly run: null | { readonly id: string; readonly state: 'running' | Terminal }
      readonly admission?: SessionRunAdmissionBlock
      readonly presentation?: SessionPresentation
    }
  | { readonly kind: 'absent' }
  | { readonly failure: 'invalidInput' | 'denied' | 'notFound' | 'unavailable' }

/** Read the immutable original receipt and correlate only its input in an authorized full prefix. */
export async function readSessionSubmission(
  ingress: LocalSessionIngress,
  operation: OperationRef,
  observations?: SessionDriverObservations,
): Promise<SessionSubmissionReading> {
  const checked = checkOperationRef(operation)
  if (
    !('operation' in checked) ||
    checked.operation.operation !== 'submitInput' ||
    checked.operation.session === null
  )
    return { failure: 'invalidInput' }
  const requested = checked.operation
  const read = await ingress.operations.readReceipt(ingress.access, requested)
  if (!('kind' in read) || read.kind !== 'present') return read
  const prefix = await ingress.journal.readPrefix(ingress.access, requested.session!)
  if ('failure' in prefix) return prefix
  validatePrefix(read.receipt, requested, prefix.source, prefix.entries)
  const original = originalInput(read.receipt, prefix.entries)
  const run = consumingRun(original.position, prefix.entries)
  const admission =
    run === null ? matchingAdmission(observations, requested, original.position) : null
  return {
    kind: 'submission',
    receipt: read.receipt,
    source: prefix.source,
    inputPosition: original.position,
    messageId: original.id,
    run,
    ...(admission ? { admission } : {}),
  }
}
function matchingAdmission(
  observations: SessionDriverObservations | undefined,
  operation: OperationRef,
  inputPosition: JsonNumber,
): SessionRunAdmissionBlock | null {
  if (!observations || operation.session === null) return null
  const blocked = observations.readRunAdmission({
    tenant: operation.tenant,
    session: operation.session,
  })
  return blocked && compareInteger(blocked.inputPosition, inputPosition) === 0 ? blocked : null
}
function defect(): never {
  throw new StorageDefect('invalid original input correlation')
}
function sameOperation(left: OperationRef, right: OperationRef) {
  return (
    left.principal === right.principal &&
    left.operation === right.operation &&
    left.operationKey === right.operationKey &&
    left.session === right.session &&
    tenantIdEquals(left.tenant, right.tenant)
  )
}
function validatePrefix(
  receipt: Receipt,
  operation: OperationRef,
  source: SourceToken,
  entries: readonly LogEntry[],
) {
  const current = checkSourceToken(source),
    saved = checkSourceToken(receipt.source)
  if ('failure' in current || 'failure' in saved || !sameOperation(receipt.operation, operation))
    defect()
  if (!ownsSource(source, operation) || !ownsSource(receipt.source, operation)) defect()
  if (
    source.journalGeneration !== receipt.source.journalGeneration ||
    compareInteger(source.tail, receipt.source.tail) < 0 ||
    compareInteger(source.tail, entries.length) !== 0
  )
    defect()
}
function ownsSource(source: SourceToken, operation: OperationRef) {
  return source.session === operation.session && tenantIdEquals(source.tenant, operation.tenant)
}
function originalInput(receipt: Receipt, entries: readonly LogEntry[]) {
  const accepted = entries.find(entry => compareInteger(entry.position, receipt.position) === 0)
  if (!accepted) return defect()
  const parsed = readSessionFact(accepted)
  if (
    'failure' in parsed ||
    parsed.kind !== 'fact' ||
    parsed.fact.kind !== 'input_accepted' ||
    !sameOperation(parsed.fact.operation, receipt.operation)
  )
    return defect()
  const position = parsed.fact.messagePosition
  const input = entries.find(entry => compareInteger(entry.position, position) === 0)
  if (!input) return defect()
  const message = checkLogPayload(input.payload)
  if ('failure' in message || message.kind !== 'message' || message.payload.value.type !== 'user')
    return defect()
  return { position, id: message.payload.value.id }
}
type RunReading = NonNullable<Extract<SessionSubmissionReading, { kind: 'submission' }>['run']>
class Consumption {
  active: string | null = null
  selected: RunReading | null = null
  readonly seen = new Set<string>()
  constructor(readonly position: JsonNumber) {}
  select(run: string, position: JsonNumber) {
    if (compareInteger(position, this.position) !== 0) return
    if (this.selected) defect()
    this.selected = { id: run, state: 'running' }
  }
  read(fact: SessionFact) {
    switch (fact.kind) {
      case 'run_started':
        if (this.active !== null || this.seen.has(fact.run)) defect()
        this.seen.add(fact.run)
        this.active = fact.run
        this.select(fact.run, fact.inputPosition)
        break
      case 'input_adopted':
        if (this.active !== fact.run) defect()
        this.select(fact.run, fact.inputPosition)
        break
      case 'run_finished':
        if (this.active !== fact.run) defect()
        this.active = null
        if (this.selected?.id === fact.run) this.selected = { id: fact.run, state: fact.terminal }
        break
    }
  }
}
function consumingRun(position: JsonNumber, entries: readonly LogEntry[]): RunReading | null {
  const projected = new Consumption(position)
  for (const entry of entries) {
    const parsed = readSessionFact(entry)
    if ('failure' in parsed) defect()
    if (parsed.kind === 'fact') projected.read(parsed.fact)
  }
  return projected.selected
}
