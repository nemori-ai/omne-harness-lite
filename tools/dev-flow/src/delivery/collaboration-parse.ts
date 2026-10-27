import {
  array,
  branch,
  canonical,
  choice,
  digest,
  fields,
  integer,
  literal,
  object,
  string,
  strings,
} from '../integration/parse.ts'
import { InputError } from './protocol.ts'
import type {
  CollaborationRecord,
  LineConsumptionRecord,
  LineDeltaRecord,
  ReleaseRecord,
  ReleaseSubject,
  RequestInput,
  RequestRecord,
  RequestStateRecord,
} from './collaboration-records.ts'
import {
  evidenceList,
  fullSha,
  nonempty,
  parseAssignment,
  parseContinuation,
  parseEvidence,
  parseReference,
  parseTask,
  parseWave,
  parseWorkflow,
  parseWriter,
  utcTime,
  uuid,
} from './collaboration-values.ts'
import {
  checkContinuation,
  continuationNext,
  parseDisposition,
  sequence,
  successor,
} from './collaboration-state-values.ts'

const BASE = ['schemaVersion', 'kind']
const WRITTEN = [...BASE, 'context', 'operationId', 'writer', 'recordedAt']
const SEQUENCED = [...WRITTEN, 'lineParent', 'revision', 'previousRecordId']
const nullableSha = (value: unknown, at: string) => (value === null ? null : fullSha(value, at))
const nullableId = (value: unknown, at: string) => (value === null ? null : integer(value, at))

export function parseRequestInput(value: unknown): RequestInput {
  const v = fields(
    value,
    [
      'context',
      'lineParent',
      'requestId',
      'previousRequestId',
      'tasks',
      'targetRef',
      'report',
      'verification',
      'stopped',
      'outcome',
      'pull',
      'reason',
      'remaining',
    ],
    'request input',
  )
  const stopped = fields(v.stopped, ['writers', 'evidence', 'confirmed'], 'stopped')
  const common = {
    context: parseWave(v.context),
    lineParent: integer(v.lineParent, 'lineParent'),
    requestId: uuid(v.requestId, 'requestId'),
    previousRequestId:
      v.previousRequestId === null ? null : uuid(v.previousRequestId, 'previousRequestId'),
    tasks: nonempty(array(v.tasks, 'tasks').map(parseTask), 'tasks'),
    targetRef: branch(v.targetRef, 'targetRef'),
    report: parseEvidence(v.report),
    verification: evidenceList(v.verification),
    stopped: {
      writers: nonempty(strings(stopped.writers, 'stopped.writers'), 'stopped.writers'),
      evidence: parseEvidence(stopped.evidence),
      confirmed: literal(stopped.confirmed, true, 'stopped.confirmed'),
    },
  }
  if (common.previousRequestId === common.requestId)
    throw new InputError('request cannot replace itself')
  if (new Set(common.tasks.map(task => task.issue)).size !== common.tasks.length)
    throw new InputError('request: duplicate tasks')
  const pull = v.pull === null ? null : fields(v.pull, ['number', 'head'], 'pull')
  const snapshot =
    pull === null
      ? null
      : { number: integer(pull.number, 'pull.number'), head: fullSha(pull.head, 'pull.head') }
  const outcome = choice(v.outcome, ['ready', 'blocked', 'failed'], 'outcome')
  const remaining = strings(v.remaining, 'remaining')
  if (outcome === 'ready') {
    if (snapshot === null || v.reason !== null || remaining.length !== 0)
      throw new InputError('ready request requires a pull and no unresolved work')
    nonempty(common.verification, 'ready.verification')
    return { ...common, outcome, pull: snapshot, reason: null, remaining: [] }
  }
  return {
    ...common,
    outcome,
    pull: snapshot,
    reason: string(v.reason, 'reason'),
    remaining: nonempty(remaining, 'remaining'),
  }
}

function parseRequest(value: unknown): RequestRecord {
  const v = fields(value, [...BASE, 'input', 'workflow', 'registeredAt'], 'request')
  const input = parseRequestInput(v.input),
    workflow = parseWorkflow(v.workflow)
  if (workflow.inputDigest !== digest(canonical(input)))
    throw new InputError('request input digest mismatch')
  return {
    schemaVersion: 1,
    kind: 'request',
    input,
    workflow,
    registeredAt: utcTime(v.registeredAt, 'registeredAt'),
  }
}

function parseState(value: unknown): RequestStateRecord {
  const v = fields(
    value,
    [
      ...SEQUENCED,
      'requestId',
      'state',
      'requestHead',
      'candidateHead',
      'targetBase',
      'mergeCommit',
      'reason',
      'changes',
      'verification',
      'workflow',
      'disposition',
    ],
    'state',
  )
  const result: RequestStateRecord = {
    schemaVersion: 1,
    kind: 'state',
    context: parseWave(v.context),
    lineParent: integer(v.lineParent, 'lineParent'),
    requestId: uuid(v.requestId, 'requestId'),
    operationId: uuid(v.operationId, 'operationId'),
    revision: integer(v.revision, 'revision'),
    previousRecordId: nullableId(v.previousRecordId, 'previousRecordId'),
    writer: parseWriter(v.writer),
    state: choice(
      v.state,
      ['claimed', 'integrating', 'merged', 'blocked', 'superseded', 'reverted'],
      'state',
    ),
    requestHead: nullableSha(v.requestHead, 'requestHead'),
    candidateHead: nullableSha(v.candidateHead, 'candidateHead'),
    targetBase: nullableSha(v.targetBase, 'targetBase'),
    mergeCommit: nullableSha(v.mergeCommit, 'mergeCommit'),
    reason: string(v.reason, 'reason'),
    changes: evidenceList(v.changes),
    verification: evidenceList(v.verification),
    workflow: v.workflow === null ? null : parseWorkflow(v.workflow),
    disposition: v.disposition === null ? null : parseDisposition(v.disposition),
    recordedAt: utcTime(v.recordedAt, 'recordedAt'),
  }
  sequence(result.revision, result.previousRecordId)
  if (
    result.state === 'merged' &&
    (result.candidateHead === null ||
      result.targetBase === null ||
      result.mergeCommit === null ||
      result.workflow === null ||
      result.verification.length === 0)
  )
    throw new InputError('merged state requires candidate, base, merge and verification evidence')
  if (result.disposition?.action === 'redispatch') {
    const next = result.disposition.assignment
    if (
      result.disposition.newRequestId === result.requestId ||
      result.disposition.delta.issue !== result.lineParent ||
      next.lineParent !== result.lineParent ||
      next.context.repo !== result.context.repo ||
      next.context.milestone !== result.context.milestone ||
      next.context.wave !== result.context.wave ||
      next.context.reduceIssue !== result.context.reduceIssue ||
      next.context.planRevision < result.context.planRevision
    )
      throw new InputError('redispatch requires a new request in the same line and wave')
  }
  return result
}

function parseDelta(value: unknown): LineDeltaRecord {
  const v = fields(
    value,
    [
      ...SEQUENCED,
      'purpose',
      'newRequestId',
      'finalHead',
      'integrationResults',
      'changes',
      'externalChanges',
      'migrations',
      'toolRevision',
      'rolePolicyVersion',
      'continuation',
    ],
    'delta',
  )
  const result = {
    schemaVersion: 1 as const,
    kind: 'delta' as const,
    context: parseWave(v.context),
    lineParent: integer(v.lineParent, 'lineParent'),
    operationId: uuid(v.operationId, 'operationId'),
    revision: integer(v.revision, 'revision'),
    previousRecordId: nullableId(v.previousRecordId, 'previousRecordId'),
    writer: parseWriter(v.writer),
    finalHead: fullSha(v.finalHead, 'finalHead'),
    integrationResults: array(v.integrationResults, 'integrationResults').map(parseReference),
    changes: evidenceList(v.changes),
    externalChanges: evidenceList(v.externalChanges),
    migrations: evidenceList(v.migrations),
    toolRevision: fullSha(v.toolRevision, 'toolRevision'),
    rolePolicyVersion: string(v.rolePolicyVersion, 'rolePolicyVersion'),
    continuation: parseContinuation(v.continuation),
    recordedAt: utcTime(v.recordedAt, 'recordedAt'),
  }
  sequence(result.revision, result.previousRecordId)
  const purpose = choice(v.purpose, ['release', 'redispatch'], 'delta.purpose')
  if (purpose === 'redispatch') {
    if (result.continuation.kind !== 'active')
      throw new InputError('redispatch delta requires active assignment')
    const assignment = result.continuation.assignment,
      next = assignment.context
    if (
      assignment.lineParent !== result.lineParent ||
      assignment.finalHead !== result.finalHead ||
      next.repo !== result.context.repo ||
      next.milestone !== result.context.milestone ||
      next.wave !== result.context.wave ||
      next.reduceIssue !== result.context.reduceIssue ||
      next.planRevision < result.context.planRevision
    )
      throw new InputError('redispatch delta must stay in the same line and wave')
    return { ...result, purpose, newRequestId: uuid(v.newRequestId, 'newRequestId') }
  }
  if (v.newRequestId !== null) throw new InputError('release delta cannot redispatch a request')
  checkContinuation(result.context, result.lineParent, result.finalHead, result.continuation)
  return { ...result, purpose, newRequestId: null }
}

function parseConsumption(value: unknown): LineConsumptionRecord {
  const v = fields(value, [...SEQUENCED, 'consumedDelta', 'consumedRevision'], 'consumption')
  const result: LineConsumptionRecord = {
    schemaVersion: 1,
    kind: 'consumption',
    context: parseWave(v.context),
    lineParent: integer(v.lineParent, 'lineParent'),
    operationId: uuid(v.operationId, 'operationId'),
    revision: integer(v.revision, 'revision'),
    previousRecordId: nullableId(v.previousRecordId, 'previousRecordId'),
    writer: string(v.writer, 'writer'),
    consumedDelta: parseReference(v.consumedDelta),
    consumedRevision: integer(v.consumedRevision, 'consumedRevision'),
    recordedAt: utcTime(v.recordedAt, 'recordedAt'),
  }
  sequence(result.revision, result.previousRecordId)
  if (result.consumedDelta.issue !== result.lineParent)
    throw new InputError('consumed delta must belong to line parent')
  return result
}

export function parseReleaseSubject(value: unknown): ReleaseSubject {
  const v = fields(
    value,
    ['context', 'finalHead', 'expectedRequests', 'results', 'lines', 'next'],
    'release subject',
  )
  const context = parseWave(v.context),
    finalHead = fullSha(v.finalHead, 'finalHead')
  const next = v.next === null ? null : parseWave(v.next)
  if (next !== null) successor(context, next)
  const lines = nonempty(
    array(v.lines, 'lines').map(value => {
      const line = fields(value, ['lineParent', 'delta', 'continuation'], 'release.line')
      const lineParent = integer(line.lineParent, 'lineParent'),
        delta = parseReference(line.delta),
        continuation = parseContinuation(line.continuation)
      checkContinuation(context, lineParent, finalHead, continuation)
      if (delta.issue !== lineParent)
        throw new InputError('release delta must belong to line parent')
      const lineNext = continuationNext(continuation)
      if (lineNext !== null && canonical(lineNext) !== canonical(next))
        throw new InputError('release successor mismatch')
      return { lineParent, delta, continuation }
    }),
    'release.lines',
  )
  if (new Set(lines.map(line => line.lineParent)).size !== lines.length)
    throw new InputError('release: duplicate line')
  if ((next === null) !== lines.every(line => line.continuation.kind === 'terminal'))
    throw new InputError('release terminal and successor mismatch')
  const expectedRequests = array(v.expectedRequests, 'expectedRequests').map(value =>
    uuid(value, 'requestId'),
  )
  if (new Set(expectedRequests).size !== expectedRequests.length)
    throw new InputError('release: duplicate request')
  const results = array(v.results, 'results').map(parseReference)
  if (
    results.length !== expectedRequests.length ||
    new Set(results.map(result => result.commentId)).size !== results.length ||
    results.some(result => result.issue !== context.reduceIssue)
  )
    throw new InputError('release: incomplete result references')
  return { context, finalHead, expectedRequests, results, lines, next }
}

function parseRelease(value: unknown): ReleaseRecord {
  const v = fields(
    value,
    [...WRITTEN, 'finalHead', 'expectedRequests', 'results', 'acceptance', 'lines', 'next'],
    'release',
  )
  return {
    ...parseReleaseSubject({
      context: v.context,
      finalHead: v.finalHead,
      expectedRequests: v.expectedRequests,
      results: v.results,
      lines: v.lines,
      next: v.next,
    }),
    schemaVersion: 1,
    kind: 'release',
    operationId: uuid(v.operationId, 'operationId'),
    writer: parseWriter(v.writer),
    acceptance: parseEvidence(v.acceptance),
    recordedAt: utcTime(v.recordedAt, 'recordedAt'),
  }
}

export function parseCollaborationRecord(value: unknown): CollaborationRecord {
  const v = object(value, 'collaboration record')
  literal(v.schemaVersion, 1, 'schemaVersion')
  const kind = choice(
    v.kind,
    ['request', 'state', 'release', 'delta', 'consumption', 'assignment'],
    'kind',
  )
  switch (kind) {
    case 'request':
      return parseRequest(value)
    case 'state':
      return parseState(value)
    case 'release':
      return parseRelease(value)
    case 'delta':
      return parseDelta(value)
    case 'consumption':
      return parseConsumption(value)
    case 'assignment': {
      const a = fields(
        value,
        [...BASE, 'operationId', 'writer', 'assignment', 'recordedAt'],
        'assignment record',
      )
      return {
        schemaVersion: 1,
        kind,
        operationId: uuid(a.operationId, 'operationId'),
        writer: parseWriter(a.writer),
        assignment: parseAssignment(a.assignment),
        recordedAt: utcTime(a.recordedAt, 'recordedAt'),
      }
    }
  }
}
