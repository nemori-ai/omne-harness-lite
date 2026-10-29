import { tenantEquals } from '@omne-harness/legal-identity'
import type { AttemptId, DurableEvidence, InputId, RunId } from './identity.ts'
import type { WorkSnapshot, InputBatch } from './values.ts'
import type {
  ExecutionHistoryBoundary,
  SessionHistoryIndex,
  SessionHistoryReads,
  SessionInputAdmission,
  SessionInputScope,
  SessionBatchRecord,
  SessionExecutionPrefix,
} from './history-values.ts'
import {
  SessionValidationFailure,
  decimal,
  evidenceFields,
  equalValue,
  inconsistent,
  invalidAt,
  nonempty,
  unavailableAt,
  unique,
} from './session-validation.ts'

export type HistoryContext = Readonly<{
  snapshot: WorkSnapshot
  index: SessionHistoryIndex
  reads: SessionHistoryReads | undefined
}>

export function historyContext(
  snapshot: WorkSnapshot,
  reads?: SessionHistoryReads,
): HistoryContext {
  const index = snapshot.historyIndex
  if (index === undefined) unavailableAt('historyIndex')
  const roots = [index.root, ...(reads === undefined ? [] : [reads.root])]
  for (const root of roots) {
    if (!tenantEquals(root.tenant, snapshot.tenant) || root.session !== snapshot.session)
      throw new SessionValidationFailure({ kind: 'denied', action: 'session-history' })
    decimal(root.position, 'history.root.position')
    evidenceFields(root.source, 'history.root.source')
  }
  if (reads !== undefined && !equalValue(index.root, reads.root))
    throw new SessionValidationFailure({ kind: 'changed', revision: snapshot.revision })
  unique(index.inputs, item => item.input, 'historyIndex.inputs')
  unique(index.executions, item => item.execution, 'historyIndex.executions')
  unique(index.attempts, item => item.attempt, 'historyIndex.attempts')
  unique(index.batches, item => `${item.execution}\0${item.sequence}`, 'historyIndex.batches')
  unique(index.taken, item => `${item.execution}\0${item.sequence}`, 'historyIndex.taken')
  if (reads !== undefined) {
    unique(reads.attempts, item => item.attempt, 'history.attempts')
    unique(reads.taken, item => `${item.execution}\0${item.sequence}`, 'history.taken')
    for (const item of reads.attempts)
      if (!index.attempts.some(original => equalValue(item, original)))
        invalidAt('history.attempts', 'not an original snapshot record')
    for (const item of reads.taken)
      if (!index.taken.some(original => equalValue(item, original)))
        invalidAt('history.taken', 'not an original snapshot record')
    unique(reads.prefixes, item => item.execution, 'history.prefixes')
    for (const prefix of reads.prefixes) validatePrefix({ snapshot, index, reads }, prefix)
  }
  return { snapshot, index, reads }
}

export function executionBoundary(
  context: HistoryContext,
  execution: string,
  run?: RunId,
): ExecutionHistoryBoundary {
  const found = context.index.executions.find(item => item.execution === execution)
  if (found === undefined) unavailableAt(`history.executions.${execution}`)
  if (run !== undefined && found.run !== run)
    invalidAt('history.execution.run', 'wrong original Run')
  const historical = context.snapshot.executions?.find(item => item.run === found.run)
  const current =
    context.snapshot.run.kind === 'active' && context.snapshot.run.run === found.run
      ? context.snapshot.run.execution
      : undefined
  const reference = current ?? historical?.execution
  if (reference === undefined) unavailableAt('history.execution.started')
  if (reference.execution !== execution)
    inconsistent('history.execution: conflicting SE13 relationship')
  evidenceFields(found.started, 'history.execution.started')
  evidenceFields(found.executionEvidence, 'history.execution.executionEvidence')
  const head = decimal(found.revision, 'history.execution.revision')
  const read = decimal(found.readThrough, 'history.execution.readThrough')
  const emitted = decimal(found.emittedThrough, 'history.execution.emittedThrough')
  if (read > emitted || found.readThrough !== reference.readThrough)
    invalidAt('history.execution.readThrough', 'does not match the confirmed snapshot progress')
  if (reference.revision !== null && decimal(reference.revision, 'execution.revision') > head)
    invalidAt('history.execution.revision', 'older than the confirmed execution head')
  if (read === 0n) {
    if (found.interpreted !== null)
      invalidAt('history.execution.interpreted', 'zero progress has no interpretation receipt')
  } else evidenceFields(found.interpreted, 'history.execution.interpreted')
  if (found.ended !== null) {
    const sequence = decimal(found.ended.sequence, 'history.execution.ended.sequence')
    if (sequence === 0n || sequence > emitted)
      invalidAt('history.execution.ended.sequence', 'outside emitted events')
    evidenceFields(found.ended.source, 'history.execution.ended.source')
  }
  unique(found.facts, item => item.sequence, 'history.execution.facts')
  return found
}

export function originalAttempt(snapshot: WorkSnapshot, attempt: AttemptId, run?: RunId): RunId {
  nonempty(attempt, 'initiatingAttempt')
  const original = snapshot.historyIndex?.attempts.find(item => item.attempt === attempt)
  if (original !== undefined) {
    if (run !== undefined && original.run !== run)
      invalidAt('initiatingAttempt', 'belongs to another Run')
    if (decimal(original.ordinal, 'history.attempt.ordinal') === 0n)
      invalidAt('history.attempt.ordinal', 'attempt ordinal must be positive')
    evidenceFields(original.started, 'history.attempt.started')
    const bound =
      snapshot.executions?.find(item => item.run === original.run)?.execution ??
      (snapshot.run.kind === 'active' && snapshot.run.run === original.run
        ? snapshot.run.execution
        : undefined)
    if (bound === undefined || bound.execution !== original.execution)
      invalidAt('history.attempt.execution', 'no original SE13')
    return original.run
  }
  if (
    snapshot.run.kind === 'active' &&
    snapshot.run.advance?.attempt === attempt &&
    (run === undefined || snapshot.run.run === run)
  )
    return snapshot.run.run
  unavailableAt('initiatingAttempt.originalSE15')
}

export function inputAdmissions(
  context: HistoryContext,
  input: InputId,
): readonly SessionInputAdmission[] {
  nonempty(input, 'input')
  const boundary = context.index.inputs.find(item => item.input === input)
  if (boundary === undefined) unavailableAt(`history.inputs.${input}`)
  nonempty(boundary.directory, 'history.input.directory')
  nonempty(boundary.version, 'history.input.version')
  evidenceFields(boundary.source, 'history.input.source')
  const count = decimal(boundary.count, 'history.input.count')
  if (BigInt(boundary.members.length) !== count)
    invalidAt('history.input.members', 'incomplete original member index')
  const pages = context.reads?.admissions.filter(page => page.input === input) ?? []
  unique(pages, page => page.offset, 'history.admissions.offset')
  if (count === 0n) {
    if (context.snapshot.handed.includes(input))
      unavailableAt('history.admissions.originalHandOver')
    if (pages.length > 0) invalidAt('history.admissions', 'empty directory has no pages')
    return []
  }
  if (pages.length === 0) unavailableAt('history.admissions')
  const records: SessionInputAdmission[] = []
  let offset = 0n
  for (const page of pages) {
    if (page.directory !== boundary.directory || page.version !== boundary.version)
      invalidAt('history.admissions.directory', 'wrong directory or version')
    if (decimal(page.offset, 'history.admissions.offset') !== offset)
      invalidAt('history.admissions.offset', 'page gap or wrong order')
    if (page.records.length === 0) invalidAt('history.admissions.records', 'empty page')
    for (const record of page.records) {
      const member = boundary.members[records.length]
      if (
        member === undefined ||
        decimal(record.ordinal, 'history.admissions.ordinal') !== offset ||
        member.ordinal !== record.ordinal ||
        member.run !== record.run ||
        member.execution !== record.execution ||
        member.operation !== record.operation ||
        member.attempt !== record.attempt ||
        !equalValue(member.accepted, record.accepted)
      )
        invalidAt('history.admissions.records', 'member differs from original directory')
      const execution = executionBoundary(context, record.execution, record.run)
      if (!equalValue(record.runStarted, execution.started))
        invalidAt('history.admissions.runStarted', 'wrong SE13')
      originalAttempt(context.snapshot, record.attempt, record.run)
      const attempt = context.index.attempts.find(item => item.attempt === record.attempt)
      if (attempt !== undefined && !equalValue(attempt.started, record.attemptStarted))
        invalidAt('history.admissions.attemptStarted', 'wrong SE15')
      nonempty(record.operation, 'history.admissions.operation')
      nonempty(record.attachment, 'history.admissions.attachment')
      evidenceFields(record.accepted, 'history.admissions.accepted')
      evidenceFields(record.attemptStarted, 'history.admissions.attemptStarted')
      evidenceFields(record.grant, 'history.admissions.grant')
      records.push(record)
      offset += 1n
    }
    if (offset > count || page.next !== (offset === count ? null : String(offset)))
      invalidAt('history.admissions.next', 'wrong page end')
  }
  if (offset !== count) unavailableAt('history.admissions.next')
  return records
}

export function validatePrefix(context: HistoryContext, prefix: SessionExecutionPrefix): void {
  const boundary = executionBoundary(context, prefix.execution, prefix.run)
  const after = decimal(prefix.after, 'history.prefix.after')
  const through = decimal(prefix.through, 'history.prefix.through')
  if (
    prefix.after !== boundary.readThrough ||
    through < after ||
    through > BigInt(boundary.emittedThrough)
  )
    invalidAt('history.prefix', 'range differs from original boundary')
  if (BigInt(prefix.facts.length) !== through - after)
    invalidAt('history.prefix.facts', 'incomplete continuous prefix')
  for (const [index, fact] of prefix.facts.entries()) {
    if (decimal(fact.sequence, 'history.prefix.sequence') !== after + BigInt(index) + 1n)
      invalidAt('history.prefix.sequence', 'event gap')
    const original = boundary.facts.find(item => item.sequence === fact.sequence)
    if (original === undefined) unavailableAt('history.execution.facts')
    evidenceFields(fact.source, 'history.prefix.source')
    if (
      !equalValue(fact.source, original.source) ||
      !equalValue(
        fact.consequences.map(item => item.kind),
        original.kinds,
      )
    )
      invalidAt('history.prefix.consequences', 'wrong source or omitted/reordered consequences')
    if (
      fact.consequences.some(item => item.kind === 'ended') &&
      (boundary.ended?.sequence !== fact.sequence ||
        !equalValue(boundary.ended.source, fact.source))
    )
      invalidAt('history.prefix.ended', 'not the original ended event')
  }
}

function requireObservedTail(
  context: HistoryContext,
  boundary: ExecutionHistoryBoundary,
  upper: bigint,
): void {
  const prefix = context.reads?.prefixes.find(item => item.execution === boundary.execution)
  if (
    prefix === undefined ||
    BigInt(prefix.through) < upper ||
    prefix.facts.some(
      fact =>
        BigInt(fact.sequence) <= upper &&
        (fact.consequences.length === 0 ||
          fact.consequences.some(consequence => consequence.kind !== 'observed')),
    )
  )
    unavailableAt(`history.prefix.${boundary.execution}.committedConsequences`)
}

/** Final decisions require committed effects; a validated observed-only tail needs no cursor write. */
export function requirePrepared(context: HistoryContext, scope: SessionInputScope): void {
  if (context.reads !== undefined && !equalValue(context.reads.scope, scope))
    invalidAt('history.scope', 'does not equal the command input range')
  unique(scope.inputs, item => item, 'history.scope.inputs')
  const relevant = new Set<string>()
  const inputs = new Set(scope.inputs)
  for (const input of inputs) {
    for (const admission of inputAdmissions(context, input)) {
      relevant.add(admission.execution)
      for (const batch of context.index.batches.filter(
        item => item.execution === admission.execution,
      ))
        if (batch.batch.ordered.some(member => inputs.has(member)))
          for (const member of batch.batch.ordered) inputs.add(member)
    }
  }
  for (const execution of relevant) {
    const boundary = executionBoundary(context, execution)
    const upper =
      boundary.ended === null
        ? BigInt(boundary.emittedThrough)
        : BigInt(boundary.ended.sequence) - 1n
    if (BigInt(boundary.readThrough) < upper) requireObservedTail(context, boundary, upper)
    for (const batch of context.index.batches.filter(
      item =>
        item.execution === execution &&
        decimal(item.sequence, 'batch.sequence') <= BigInt(boundary.readThrough),
    )) {
      if (!context.index.taken.some(taken => equalValue({ ...batch, commit: taken.commit }, taken)))
        inconsistent('history.prefix: confirmed cursor has no original taken effect')
    }
  }
  for (const taken of context.index.taken) {
    if (!taken.batch.ordered.some(input => inputs.has(input))) continue
    originalBatch(context, taken.run, taken.execution, taken.sequence, taken.source, taken.batch)
    evidenceFields(taken.commit, 'history.taken.commit')
    if (taken.batch.ordered.some(input => context.snapshot.pending.includes(input)))
      inconsistent('history.taken: interpreted input remains pending')
  }
}

export function originalBatch(
  context: HistoryContext,
  run: RunId,
  execution: string,
  sequence: string,
  source: DurableEvidence,
  batch: InputBatch,
): SessionBatchRecord {
  const original = context.index.batches.find(
    item => item.execution === execution && item.sequence === sequence,
  )
  if (original === undefined) unavailableAt('history.batches')
  if (
    original.run !== run ||
    !equalValue(original.source, source) ||
    !equalValue(original.batch, batch)
  )
    invalidAt('batch', 'differs from original complete batch')
  nonempty(batch.id, 'batch.id')
  evidenceFields(batch.watermark, 'batch.watermark')
  if (batch.ordered.length === 0) invalidAt('batch.ordered', 'empty batch')
  unique(batch.ordered, item => item, 'batch.ordered')
  for (const input of batch.ordered) {
    nonempty(input, 'batch.ordered')
    const admissions = inputAdmissions(context, input)
    const at = admissions.findIndex(item => item.run === run && item.execution === execution)
    if (at < 0) invalidAt('batch.ordered', 'member has no original admission')
    if (admissions.slice(at + 1).some(item => item.run !== run))
      inconsistent('history.batch: earlier taken conflicts with a successor admission')
    if (
      context.index.taken.some(item =>
        item.execution !== execution || item.sequence !== sequence
          ? item.batch.ordered.includes(input)
          : false,
      )
    )
      inconsistent('history.batch: input has two taken events')
  }
  return original
}
