import { isAbsolute } from 'node:path'
import { array, choice, fields, integer, literal, same, string } from '../integration/parse.ts'
import { parseCollaborationRecord, parseRequestInput } from './collaboration-parse.ts'
import type { Evidence, ReleaseRecord } from './collaboration-records.ts'
import {
  fullSha,
  parseEvidence,
  parseWave,
  parseWorkflow,
  utcTime,
  uuid,
} from './collaboration-values.ts'
import { InputError } from './protocol.ts'
import type { ActiveReduceRun, ReduceSupervisionTargets } from './reduce-supervise-sources.ts'
import { reducePhases } from './reduce-supervise-values.ts'
import type { SuperviseInput } from './reduce-supervise.ts'

type RunTarget =
  | Exclude<ActiveReduceRun, { kind: 'gate' }>
  | {
      kind: 'gate'
      correlation: Omit<
        Extract<ActiveReduceRun, { kind: 'gate' }>['correlation'],
        'adoptedWorkflowHead'
      >
    }
export type ReduceSupervisionInput = {
  input: Omit<SuperviseInput, 'signal' | 'healthIntervalMs' | 'runIntervalMs'>
  targets: Omit<ReduceSupervisionTargets, 'runs' | 'release'> & { runs: RunTarget[] }
  release: { record: ReleaseRecord; readinessEvidence: Evidence } | null
}

function absolute(value: unknown, at: string): string {
  const path = string(value, at)
  if (!isAbsolute(path)) throw new InputError(`${at}: absolute path required`)
  return path
}

export function parseReduceSupervision(value: unknown): ReduceSupervisionInput {
  const v = fields(
    value,
    [
      'schemaVersion',
      'context',
      'owner',
      'epoch',
      'operationId',
      'journalRoot',
      'phase',
      'deadline',
      'timeoutMs',
      'file',
      'runs',
      'candidates',
      'local',
      'release',
    ],
    'supervision',
  )
  literal(v.schemaVersion, 1, 'schemaVersion')
  const context = parseWave(v.context)
  const input: ReduceSupervisionInput['input'] = {
    context,
    owner: string(v.owner, 'owner'),
    epoch: uuid(v.epoch, 'epoch'),
    operationId: uuid(v.operationId, 'operationId'),
    journalRoot: absolute(v.journalRoot, 'journalRoot'),
    phase: choice(v.phase, reducePhases, 'phase'),
    deadline: utcTime(v.deadline, 'deadline'),
    ...(v.timeoutMs === undefined ? {} : { timeoutMs: integer(v.timeoutMs, 'timeoutMs') }),
  }
  const runs = array(v.runs, 'runs').map((item): RunTarget => {
    const raw = fields(item, ['kind', 'input', 'workflow', 'correlation'], 'run target')
    if (raw.kind === 'request-run') {
      fields(raw, ['kind', 'input', 'workflow'], 'request run')
      const request = parseRequestInput(raw.input)
      same(request.context, context, 'supervision-request-context')
      return { kind: raw.kind, input: request, workflow: parseWorkflow(raw.workflow) }
    }
    literal(raw.kind, 'gate', 'run kind')
    fields(raw, ['kind', 'correlation'], 'gate run')
    const c = fields(
      raw.correlation,
      ['repo', 'pull', 'candidateHead', 'checkpoint', 'workflow'],
      'gate correlation',
    )
    same(c.repo, context.repo, 'supervision-gate-repository')
    if (typeof c.checkpoint !== 'string' || c.checkpoint.includes('\0'))
      throw new InputError('supervision-checkpoint-string-required')
    return {
      kind: 'gate',
      correlation: {
        repo: context.repo,
        pull: integer(c.pull, 'pull'),
        candidateHead: fullSha(c.candidateHead, 'candidateHead'),
        checkpoint: c.checkpoint,
        workflow: parseWorkflow(c.workflow),
      },
    }
  })
  const candidates = array(v.candidates, 'candidates').map(item => {
    const candidate = fields(item, ['request', 'record'], 'candidate')
    const request = parseRequestInput(candidate.request)
    const record = parseCollaborationRecord(candidate.record)
    if (record.kind !== 'state') throw new InputError('supervision-candidate-state-required')
    same(request.context, context, 'supervision-candidate-context')
    same(record.context, context, 'supervision-candidate-state-context')
    same(record.requestId, request.requestId, 'supervision-candidate-request')
    return { request, record }
  })
  const local = array(v.local, 'local').map(item => {
    const work = fields(
      item,
      ['id', 'pid', 'processStartedAt', 'resultFile', 'deadline'],
      'local work',
    )
    return {
      id: string(work.id, 'local id'),
      pid: integer(work.pid, 'local pid'),
      processStartedAt: string(work.processStartedAt, 'processStartedAt'),
      resultFile: absolute(work.resultFile, 'resultFile'),
      deadline: utcTime(work.deadline, 'local deadline'),
    }
  })
  let release: ReduceSupervisionInput['release'] = null
  if (v.release !== null) {
    const raw = fields(v.release, ['record', 'readinessEvidence'], 'release supervision')
    const record = parseCollaborationRecord(raw.record)
    if (record.kind !== 'release') throw new InputError('supervision-release-required')
    same(record.context, context, 'supervision-release-context')
    release = { record, readinessEvidence: parseEvidence(raw.readinessEvidence) }
  }
  if (['VERIFY_WAVE', 'RELEASE_WAVE', 'FINALIZE'].includes(input.phase) && release === null)
    throw new InputError('supervision-release-target-required')
  return { input, targets: { file: absolute(v.file, 'file'), runs, candidates, local }, release }
}
