import { choice, fields, integer, literal, string } from '../integration/parse.ts'
import { parseCollaborationRecord } from './collaboration-parse.ts'
import type {
  Evidence,
  ReleaseRecord,
  RequestStateRecord,
  WaveIdentity,
} from './collaboration-records.ts'
import { parseEvidence, parseWave } from './collaboration-values.ts'
import { InputError } from './protocol.ts'
import { nextReduceRequest } from './reduce-integration-read.ts'
import {
  checkReduceRelease,
  releaseReduceWave,
  type ReduceReleasePorts,
} from './reduce-integration-release.ts'
import {
  claimReduceRequest,
  prepareReduceCandidate,
  recordReduceRequest,
} from './reduce-integration.ts'

export const reduceOperations = [
  'next',
  'claim',
  'record',
  'prepare',
  'check-release',
  'release',
] as const
export type ReduceCommand =
  | { kind: 'next'; input: { context: WaveIdentity; owner: string; since?: number } }
  | {
      kind: 'claim' | 'record' | 'prepare'
      input: { record: RequestStateRecord; journalRoot: string; checkpoint: string }
    }
  | {
      kind: 'check-release'
      input: { record: ReleaseRecord; readinessEvidence: Evidence }
    }
  | {
      kind: 'release'
      input: { record: ReleaseRecord; readinessEvidence: Evidence; journalRoot: string }
    }

/** All identity and effect inputs are explicit. Unknown fields and mismatched record kinds fail before bootstrap. */
export function parseReduceCommand(operation: unknown, value: unknown): ReduceCommand {
  const kind = choice(operation, reduceOperations, 'reduce operation')
  if (kind === 'next') {
    const v = fields(value, ['schemaVersion', 'context', 'owner', 'since'], 'reduce next')
    literal(v.schemaVersion, 1, 'schemaVersion')
    return {
      kind,
      input: {
        context: parseWave(v.context),
        owner: string(v.owner, 'owner'),
        ...(v.since === undefined ? {} : { since: v.since === 0 ? 0 : integer(v.since, 'since') }),
      },
    }
  }
  if (kind === 'check-release' || kind === 'release') {
    const v = fields(
      value,
      [
        'schemaVersion',
        'record',
        'readinessEvidence',
        ...(kind === 'release' ? ['journalRoot'] : []),
      ],
      'reduce release',
    )
    literal(v.schemaVersion, 1, 'schemaVersion')
    const record = parseCollaborationRecord(v.record)
    if (record.kind !== 'release') throw new InputError('reduce-release-required')
    const input = { record, readinessEvidence: parseEvidence(v.readinessEvidence) }
    return kind === 'check-release'
      ? { kind, input }
      : { kind, input: { ...input, journalRoot: string(v.journalRoot, 'journalRoot') } }
  }
  const v = fields(value, ['schemaVersion', 'record', 'journalRoot', 'checkpoint'], 'reduce state')
  literal(v.schemaVersion, 1, 'schemaVersion')
  const record = parseCollaborationRecord(v.record)
  if (record.kind !== 'state') throw new InputError('reduce-state-required')
  if (kind === 'claim' && record.state !== 'claimed')
    throw new InputError('reduce-claim-state-required')
  if (kind === 'prepare' && record.state !== 'integrating')
    throw new InputError('reduce-prepare-state-required')
  if (typeof v.checkpoint !== 'string' || v.checkpoint.includes('\0'))
    throw new InputError('reduce-checkpoint-string-required')
  return {
    kind,
    input: {
      record,
      journalRoot: string(v.journalRoot, 'journalRoot'),
      checkpoint: v.checkpoint,
    },
  }
}

export function reduceCommandRepository(command: ReduceCommand): string {
  return command.kind === 'next' ? command.input.context.repo : command.input.record.context.repo
}

function unknownWrite(journalRoot: string) {
  return {
    errorCode: 'reduce-write-outcome-unknown',
    retryable: false,
    sideEffects: 'unknown',
    recovery: {
      journalRoot,
      action: 'Read back and resume the same operation; do not repost or replace its ID.',
    },
  }
}

export function executeReduceCommand(command: ReduceCommand, ports: ReduceReleasePorts) {
  const repo = reduceCommandRepository(command)
  const operationId = command.kind === 'next' ? null : command.input.record.operationId
  const envelope = {
    schemaVersion: 1,
    operation: command.kind,
    repo,
    operationId,
    evidence: [],
    diagnostics: [],
  }
  switch (command.kind) {
    case 'next': {
      const result = nextReduceRequest(ports, command.input)
      return {
        ...envelope,
        status: result.status,
        evidence: result.pending.map(item => item.receipt.url),
        result,
      }
    }
    case 'prepare':
      return {
        ...envelope,
        status: 'prepared',
        result: prepareReduceCandidate(ports, command.input),
      }
    case 'check-release':
      checkReduceRelease(ports, command.input.record, command.input.readinessEvidence)
      return {
        ...envelope,
        status: 'ready',
        evidence: [command.input.readinessEvidence],
        result: { accepted: false, published: false },
      }
    case 'claim':
    case 'record': {
      const result =
        command.kind === 'claim'
          ? claimReduceRequest(ports, command.input)
          : recordReduceRequest(ports, command.input)
      return {
        ...envelope,
        status: result.kind,
        evidence: result.kind === 'confirmed' ? [result.reference] : [],
        diagnostics: result.kind === 'unknown' ? [result.reason] : [],
        ...(result.kind === 'unknown' ? unknownWrite(command.input.journalRoot) : {}),
        result,
      }
    }
    case 'release': {
      const result = releaseReduceWave(ports, command.input)
      return {
        ...envelope,
        status: result.kind,
        evidence: result.kind === 'confirmed' ? [result.release] : [],
        diagnostics: result.kind === 'unknown' ? [result.reason] : [],
        ...(result.kind === 'unknown' ? unknownWrite(command.input.journalRoot) : {}),
        result,
      }
    }
    default: {
      const exhaustive: never = command
      return exhaustive
    }
  }
}
