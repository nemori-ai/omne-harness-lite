import type { Adoption, ResultCapacity } from '@omne-harness/model-contract'
import type { ModelConsumerOwnerDeclaration } from '@omne-harness/model-contract/provider'
import type { ModelObservationLimits } from '@omne-harness/model/commands'
import type { SqlModelCommandsOptions } from './commands.ts'

/** Data for one records plugin life. Every bound is explicit. */
export type SqlModelRecordsConfig = Readonly<
  Pick<
    SqlModelCommandsOptions<unknown>,
    'owners' | 'limits' | 'maxCallBytes' | 'maxCommandBytes'
  > & {
    observation?: ModelObservationLimits
    combinationVersion: string
    send: Readonly<{ mirrorBytes: number; maxClaims: number }>
  }
>

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError(`${name} must be an object`)
  return Object.fromEntries(Object.entries(value))
}

function text(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
  return value
}

function count(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new RangeError(`${name} must be a positive safe integer`)
  return value
}

function adoption(value: unknown): Adoption {
  const input = record(value, 'adoption')
  return {
    owner: text(input['owner'], 'adoption.owner'),
    name: text(input['name'], 'adoption.name'),
    revision: text(input['revision'], 'adoption.revision'),
    digest: text(input['digest'], 'adoption.digest'),
  }
}

function owner(value: unknown): ModelConsumerOwnerDeclaration {
  const input = record(value, 'owner')
  const work = record(input['work'], 'owner.work')
  if (work['kind'] !== 'exempt' && work['kind'] !== 'guarded')
    throw new TypeError('owner.work.kind must be exempt or guarded')
  return {
    consumerOwner: text(input['consumerOwner'], 'owner.consumerOwner'),
    evidence: adoption(input['evidence']),
    work:
      work['kind'] === 'exempt'
        ? { kind: 'exempt' }
        : { kind: 'guarded', participant: adoption(work['participant']) },
  }
}

function decimal(value: unknown, name: string): string {
  const parsed = text(value, name)
  if (!/^(0|[1-9][0-9]*)$/.test(parsed)) throw new TypeError(`${name} must be a decimal count`)
  return parsed
}

function capacity(value: unknown): ResultCapacity {
  const input = record(value, 'limits.capacity')
  return {
    bytes: decimal(input['bytes'], 'capacity.bytes'),
    blocks: decimal(input['blocks'], 'capacity.blocks'),
    attachmentBytes: decimal(input['attachmentBytes'], 'capacity.attachmentBytes'),
  }
}

function observation(value: unknown): ModelObservationLimits {
  const input = record(value, 'observation')
  return {
    maxSnapshotBytes: count(input['maxSnapshotBytes'], 'observation.maxSnapshotBytes'),
    maxDeltaBytes: count(input['maxDeltaBytes'], 'observation.maxDeltaBytes'),
    maxQueuedFrames: count(input['maxQueuedFrames'], 'observation.maxQueuedFrames'),
    maxQueuedBytes: count(input['maxQueuedBytes'], 'observation.maxQueuedBytes'),
    maxObserversPerTenant: count(
      input['maxObserversPerTenant'],
      'observation.maxObserversPerTenant',
    ),
    maxObservers: count(input['maxObservers'], 'observation.maxObservers'),
    maxPendingSourceOperations: count(
      input['maxPendingSourceOperations'],
      'observation.maxPendingSourceOperations',
    ),
    maxRetainedCalls: count(input['maxRetainedCalls'], 'observation.maxRetainedCalls'),
    maxRetainedBytes: count(input['maxRetainedBytes'], 'observation.maxRetainedBytes'),
    maxTotalBytes: count(input['maxTotalBytes'], 'observation.maxTotalBytes'),
    maxQueueResidenceMs: count(input['maxQueueResidenceMs'], 'observation.maxQueueResidenceMs'),
    checkIntervalMs: count(input['checkIntervalMs'], 'observation.checkIntervalMs'),
  }
}

function parse(value: unknown): SqlModelRecordsConfig {
  const input = record(value, 'records config')
  const owners: unknown = input['owners']
  if (!Array.isArray(owners)) throw new TypeError('owners must be an array')
  const limits = record(input['limits'], 'limits')
  const send = record(input['send'], 'send')
  return {
    ...(input['observation'] === undefined
      ? {}
      : { observation: observation(input['observation']) }),
    owners: owners.map(owner),
    limits: {
      scanPageCalls: count(limits['scanPageCalls'], 'limits.scanPageCalls'),
      resultPageParts: count(limits['resultPageParts'], 'limits.resultPageParts'),
      resultPageTargetBytes: count(limits['resultPageTargetBytes'], 'limits.resultPageTargetBytes'),
      readIdleMs: count(limits['readIdleMs'], 'limits.readIdleMs'),
      capacity: capacity(limits['capacity']),
    },
    maxCallBytes: count(input['maxCallBytes'], 'maxCallBytes'),
    maxCommandBytes: count(input['maxCommandBytes'], 'maxCommandBytes'),
    combinationVersion: text(input['combinationVersion'], 'combinationVersion'),
    send: {
      mirrorBytes: count(send['mirrorBytes'], 'send.mirrorBytes'),
      maxClaims: count(send['maxClaims'], 'send.maxClaims'),
    },
  }
}

export const sqlModelRecordsConfigSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'model-storage-sql',
    validate(value: unknown) {
      try {
        return { value: parse(value) }
      } catch (error) {
        if (!(error instanceof TypeError || error instanceof RangeError)) throw error
        return { issues: [{ message: error.message }] }
      }
    },
  },
}
