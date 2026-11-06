import type { TokenizerDefinition } from '@omne-harness/model-contract'
import type {
  TokenizationFailure,
  TokenizationSegment,
} from '@omne-harness/model-contract/provider'
import type { Outcome } from '@omne-harness/operation-result'
import type { ExecutorInput } from './executor-types.ts'
import type { CacheStats } from './piece-cache.ts'
import type { TiktokenResources } from './resources.ts'

export type CountResult = Outcome<Readonly<{ tokens: string }>, TokenizationFailure>
export type WorkerCommand =
  | Readonly<{ kind: 'initialize'; generation: number; input: ExecutorInput }>
  | Readonly<{
      kind: 'count'
      generation: number
      job: number
      lease: number
      resource: number
      segments: readonly TokenizationSegment[]
      cancellation: SharedArrayBuffer
    }>
  | Readonly<{ kind: 'clear'; generation: number; lease: number }>
export type WorkerReply =
  | Readonly<{ kind: 'ready'; generation: number }>
  | Readonly<{ kind: 'initialization-failed'; generation: number; diagnostic: string }>
  | Readonly<{
      kind: 'counted'
      generation: number
      job: number
      lease: number
      result: CountResult
      stats: CacheStats
    }>
  | Readonly<{ kind: 'cleared'; generation: number; lease: number; stats: CacheStats }>

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function identifier(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
function adoption(value: unknown): boolean {
  return (
    record(value) &&
    ['owner', 'name', 'revision', 'digest'].every(key => typeof value[key] === 'string')
  )
}
function definition(value: unknown): value is TokenizerDefinition {
  return (
    record(value) &&
    adoption(value.adoption) &&
    adoption(value.implementation) &&
    adoption(value.vocabulary) &&
    adoption(value.configuration)
  )
}
function numberTable(value: unknown): value is Readonly<Record<string, number>> {
  return record(value) && Object.values(value).every(item => typeof item === 'number')
}
function resource(value: unknown): value is TiktokenResources {
  return (
    record(value) &&
    definition(value.definition) &&
    record(value.ranks) &&
    typeof value.ranks.patStr === 'string' &&
    typeof value.ranks.bpeRanks === 'string' &&
    numberTable(value.ranks.specialTokens) &&
    numberTable(value.specialTokens)
  )
}
const limitKeys = [
  'workers',
  'maxLeases',
  'maxQueuedJobs',
  'maxQueuedBytes',
  'maxInputBytes',
  'maxLeaseQueuedJobs',
  'maxCacheBytes',
  'maxCacheEntries',
  'maxLeaseCacheBytes',
  'maxLeaseCacheEntries',
  'maxPieceBytes',
  'jobTimeoutMs',
  'cancellationGraceMs',
  'maxWorkerOldSpaceMb',
  'maxReplacementsPerMinute',
] as const
export function validInput(value: unknown): value is ExecutorInput {
  if (
    !record(value) ||
    !Array.isArray(value.resources) ||
    value.resources.length === 0 ||
    !value.resources.every(resource) ||
    !record(value.limits)
  )
    return false
  const limits = value.limits
  return (
    limitKeys.every(key => identifier(limits[key])) &&
    ['workers', 'maxLeases', 'maxInputBytes', 'jobTimeoutMs', 'maxWorkerOldSpaceMb'].every(
      key => typeof limits[key] === 'number' && limits[key] > 0,
    ) &&
    Number(limits.jobTimeoutMs) <= 2147483647 &&
    Number(limits.cancellationGraceMs) <= 2147483647
  )
}
function segment(value: unknown): value is TokenizationSegment {
  return (
    record(value) &&
    ((value.kind === 'text' && typeof value.text === 'string') ||
      (value.kind === 'special-token' && typeof value.name === 'string'))
  )
}
function parseCount(value: Record<string, unknown>, generation: number): WorkerCommand {
  if (!identifier(value.job) || !identifier(value.lease) || !identifier(value.resource))
    throw new TypeError('invalid tokenizer count identity')
  if (!Array.isArray(value.segments) || !value.segments.every(segment))
    throw new TypeError('invalid tokenizer segments')
  if (!(value.cancellation instanceof SharedArrayBuffer) || value.cancellation.byteLength !== 4)
    throw new TypeError('invalid tokenizer cancellation flag')
  return {
    kind: 'count',
    generation,
    job: value.job,
    lease: value.lease,
    resource: value.resource,
    segments: value.segments,
    cancellation: value.cancellation,
  }
}
export function parseCommand(value: unknown): WorkerCommand {
  if (!record(value) || !identifier(value.generation))
    throw new TypeError('invalid tokenizer worker command')
  switch (value.kind) {
    case 'initialize':
      if (validInput(value.input))
        return { kind: value.kind, generation: value.generation, input: value.input }
      break
    case 'clear':
      if (identifier(value.lease))
        return { kind: value.kind, generation: value.generation, lease: value.lease }
      break
    case 'count':
      return parseCount(value, value.generation)
  }
  throw new TypeError('invalid tokenizer worker command')
}
function failure(value: unknown): value is TokenizationFailure {
  return (
    record(value) &&
    ((value.kind === 'unavailable' && typeof value.diagnostic === 'string') ||
      (value.kind === 'invalid' && typeof value.reason === 'string') ||
      (value.kind === 'unsupported-token' && typeof value.name === 'string'))
  )
}
function result(value: unknown): value is CountResult {
  return (
    record(value) &&
    (('ok' in value &&
      record(value.ok) &&
      typeof value.ok.tokens === 'string' &&
      /^(?:0|[1-9]\d*)$/u.test(value.ok.tokens)) ||
      ('failure' in value && failure(value.failure)))
  )
}
function stats(value: unknown): value is CacheStats {
  return (
    record(value) &&
    ['cacheBytes', 'cacheEntries', 'pieceHits', 'pieceMisses'].every(key => identifier(value[key]))
  )
}
function parseCounted(value: Record<string, unknown>, generation: number): WorkerReply {
  if (
    !identifier(value.lease) ||
    !identifier(value.job) ||
    !result(value.result) ||
    !stats(value.stats)
  )
    throw new TypeError('invalid tokenizer count result')
  return {
    kind: 'counted',
    generation,
    lease: value.lease,
    job: value.job,
    result: value.result,
    stats: value.stats,
  }
}
function parseCleared(value: Record<string, unknown>, generation: number): WorkerReply {
  if (!identifier(value.lease) || !stats(value.stats))
    throw new TypeError('invalid tokenizer cache result')
  return { kind: 'cleared', generation, lease: value.lease, stats: value.stats }
}
export function parseReply(value: unknown): WorkerReply {
  if (!record(value) || !identifier(value.generation))
    throw new TypeError('invalid tokenizer worker reply')
  switch (value.kind) {
    case 'ready':
      return { kind: value.kind, generation: value.generation }
    case 'initialization-failed':
      if (typeof value.diagnostic === 'string')
        return { kind: value.kind, generation: value.generation, diagnostic: value.diagnostic }
      break
    case 'cleared':
      return parseCleared(value, value.generation)
    case 'counted':
      return parseCounted(value, value.generation)
  }
  throw new TypeError('invalid tokenizer worker reply')
}
