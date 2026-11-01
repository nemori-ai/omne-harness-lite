// Provider configuration (SQL contract SPEC 12.1). Data only (IC-16). Every field is required.
// Apart from storageRoot, every field is a finite positive integer, and only groupCollectMs may
// be 0. The validation lists every problem, not only the first.
import { isAbsolute } from 'node:path'

export type SqliteStorageConfig = Readonly<{
  storageRoot: string
  admissionQueueLimit: number
  globalAdmissionLimit: number
  lockWaitMs: number
  maxCommandsPerCommit: number
  maxCommandBytes: number
  maxRequestBytes: number
  globalInFlightWriteBytes: number
  maxJsonDepth: number
  maxJsonMembers: number
  maxResponseBytes: number
  maxOperationResponseBytes: number
  globalWriteResponseBytes: number
  maxDiagnosticBytes: number
  maxWorkers: number
  reservedWriterSlots: number
  maxReadWorkersPerDomain: number
  readQueuePerDomain: number
  readQueueGlobal: number
  readQueueTimeoutMs: number
  maxReadInputBytes: number
  maxReadResultBytes: number
  globalReadResultBytes: number
  readObservationMs: number
  readerIdleMs: number
  queryQueuePerDomain: number
  queryQueueGlobal: number
  controlQueuePerDomain: number
  controlQueueGlobal: number
  writesPerControlTurn: number
  groupMaxOperations: number
  groupCollectMs: number
  groupMaxInputBytes: number
  groupMaxResponseReservationBytes: number
  groupMaxExecutionSliceMs: number
  walAutocheckpointPages: number
  journalSizeLimitBytes: number
  checkpointIntervalMs: number
  checkpointWalBytes: number
  walReadPauseBytes: number
  walWriteStopBytes: number
  closeDeadlineMs: number
}>

export type ConfigProblem = Readonly<{ field: string; rule: string }>

export type ConfigJudgement =
  | Readonly<{ kind: 'valid'; config: SqliteStorageConfig }>
  | Readonly<{ kind: 'invalid'; problems: readonly ConfigProblem[] }>

type NumericField = Exclude<keyof SqliteStorageConfig, 'storageRoot'>

const NUMERIC_FIELDS: readonly NumericField[] = [
  'admissionQueueLimit',
  'globalAdmissionLimit',
  'lockWaitMs',
  'maxCommandsPerCommit',
  'maxCommandBytes',
  'maxRequestBytes',
  'globalInFlightWriteBytes',
  'maxJsonDepth',
  'maxJsonMembers',
  'maxResponseBytes',
  'maxOperationResponseBytes',
  'globalWriteResponseBytes',
  'maxDiagnosticBytes',
  'maxWorkers',
  'reservedWriterSlots',
  'maxReadWorkersPerDomain',
  'readQueuePerDomain',
  'readQueueGlobal',
  'readQueueTimeoutMs',
  'maxReadInputBytes',
  'maxReadResultBytes',
  'globalReadResultBytes',
  'readObservationMs',
  'readerIdleMs',
  'queryQueuePerDomain',
  'queryQueueGlobal',
  'controlQueuePerDomain',
  'controlQueueGlobal',
  'writesPerControlTurn',
  'groupMaxOperations',
  'groupCollectMs',
  'groupMaxInputBytes',
  'groupMaxResponseReservationBytes',
  'groupMaxExecutionSliceMs',
  'walAutocheckpointPages',
  'journalSizeLimitBytes',
  'checkpointIntervalMs',
  'checkpointWalBytes',
  'walReadPauseBytes',
  'walWriteStopBytes',
  'closeDeadlineMs',
]

/** left <= right unless strict, then left < right. The problem is reported on the left field. */
type Relation = readonly [left: NumericField, right: NumericField, strict: boolean, rule: string]

const RELATIONS: readonly Relation[] = [
  ['maxCommandBytes', 'maxRequestBytes', false, 'maxCommandBytes <= maxRequestBytes'],
  ['maxRequestBytes', 'groupMaxInputBytes', false, 'maxRequestBytes <= groupMaxInputBytes'],
  [
    'maxRequestBytes',
    'globalInFlightWriteBytes',
    false,
    'maxRequestBytes <= globalInFlightWriteBytes',
  ],
  ['maxDiagnosticBytes', 'maxResponseBytes', false, 'maxDiagnosticBytes <= maxResponseBytes'],
  [
    'maxResponseBytes',
    'maxOperationResponseBytes',
    false,
    'maxResponseBytes <= maxOperationResponseBytes',
  ],
  [
    'maxOperationResponseBytes',
    'groupMaxResponseReservationBytes',
    false,
    'maxOperationResponseBytes <= groupMaxResponseReservationBytes',
  ],
  [
    'groupMaxResponseReservationBytes',
    'globalWriteResponseBytes',
    false,
    'groupMaxResponseReservationBytes <= globalWriteResponseBytes',
  ],
  ['groupMaxOperations', 'admissionQueueLimit', false, 'groupMaxOperations <= admissionQueueLimit'],
  [
    'admissionQueueLimit',
    'globalAdmissionLimit',
    false,
    'admissionQueueLimit <= globalAdmissionLimit',
  ],
  ['readQueuePerDomain', 'readQueueGlobal', false, 'readQueuePerDomain <= readQueueGlobal'],
  ['queryQueuePerDomain', 'queryQueueGlobal', false, 'queryQueuePerDomain <= queryQueueGlobal'],
  [
    'controlQueuePerDomain',
    'controlQueueGlobal',
    false,
    'controlQueuePerDomain <= controlQueueGlobal',
  ],
  ['reservedWriterSlots', 'maxWorkers', true, 'reservedWriterSlots < maxWorkers'],
  [
    'maxReadResultBytes',
    'globalReadResultBytes',
    false,
    'maxReadResultBytes <= globalReadResultBytes',
  ],
  [
    'journalSizeLimitBytes',
    'walReadPauseBytes',
    false,
    'journalSizeLimitBytes <= walReadPauseBytes',
  ],
  ['checkpointWalBytes', 'walReadPauseBytes', false, 'checkpointWalBytes <= walReadPauseBytes'],
  ['walReadPauseBytes', 'walWriteStopBytes', true, 'walReadPauseBytes < walWriteStopBytes'],
]

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integerOk(value: unknown, field: NumericField): value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return false
  return field === 'groupCollectMs' ? value >= 0 : value > 0
}

export function validateConfig(input: unknown): ConfigJudgement {
  if (!isRecord(input))
    return { kind: 'invalid', problems: [{ field: 'config', rule: 'must be an object' }] }
  const problems: ConfigProblem[] = []
  const root = input['storageRoot']
  if (typeof root !== 'string' || root === '' || !isAbsolute(root))
    problems.push({ field: 'storageRoot', rule: 'must be an absolute path' })
  const bad = new Set<string>()
  for (const field of NUMERIC_FIELDS) {
    if (integerOk(input[field], field)) continue
    bad.add(field)
    problems.push({
      field,
      rule:
        field === 'groupCollectMs'
          ? 'must be a finite integer, 0 or more'
          : 'must be a finite positive integer',
    })
  }
  for (const [left, right, strict, rule] of RELATIONS) {
    if (bad.has(left) || bad.has(right)) continue
    const a = input[left] as number
    const b = input[right] as number
    if (strict ? a >= b : a > b) problems.push({ field: left, rule })
  }
  const workers = input['maxWorkers']
  const reserved = input['reservedWriterSlots']
  const perDomain = input['maxReadWorkersPerDomain']
  if (
    !bad.has('maxWorkers') &&
    !bad.has('reservedWriterSlots') &&
    !bad.has('maxReadWorkersPerDomain')
  ) {
    if ((perDomain as number) > (workers as number) - (reserved as number))
      problems.push({
        field: 'maxReadWorkersPerDomain',
        rule: 'maxReadWorkersPerDomain <= maxWorkers - reservedWriterSlots',
      })
  }
  if (problems.length > 0) return { kind: 'invalid', problems }
  return { kind: 'valid', config: input as unknown as SqliteStorageConfig }
}
