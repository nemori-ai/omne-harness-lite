import {
  decodeAgentInstanceId,
  judgeAdoption,
  judgeEvidence,
  type Failure,
  type StructureFailure,
} from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
import { parseRetryPolicy } from '@omne-harness/retry'
import type { AgentConfiguration, AgentRuntimeOptions } from './construction.ts'

type JointCommitKind = AgentConfiguration['jointCommits'][number]

const JOINT_COMMIT_KINDS: readonly unknown[] = [
  'message',
  'context-transition',
  'custody',
  'processed',
] satisfies readonly JointCommitKind[]

const COORDINATION_MODES: readonly unknown[] = [
  'standalone',
  'coordinated',
] satisfies readonly AgentConfiguration['coordination'][]

const POSITIVE_SAFE = [
  'observerBufferBytes',
  'reconciliationBatchLimit',
  'toolConcurrency',
] as const
const NON_NEGATIVE = ['denialBackoffMs'] as const

const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })

export const DEFAULT_MAX_RUN_STEPS = 50

export function maxRunStepsOf(configuration: Pick<AgentConfiguration, 'maxRunSteps'>): number {
  return configuration.maxRunSteps ?? DEFAULT_MAX_RUN_STEPS
}

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isDelaySequence(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.length > 0 && value.every(isNonNegativeInteger)
}

function structure(
  path: string,
  judged: Outcome<unknown, StructureFailure>,
  name: 'Adoption' | 'Evidence',
): Failure | undefined {
  if (!('failure' in judged)) return undefined
  const { field, reason } = judged.failure
  return invalid(field === name ? path : `${path}.${field}`, reason)
}

function judgeJointCommits(value: unknown): Failure | undefined {
  const field = 'configuration.jointCommits'
  if (!Array.isArray(value)) return invalid(field, 'type')
  const seen = new Set<unknown>()
  for (const kind of value) {
    if (!JOINT_COMMIT_KINDS.includes(kind)) return invalid(field, 'unknown-kind')
    if (seen.has(kind)) return invalid(field, 'duplicate')
    seen.add(kind)
  }
  return undefined
}

function judgeConfiguration(configuration: AgentConfiguration): Failure | undefined {
  for (const key of POSITIVE_SAFE)
    if (!isPositiveSafeInteger(configuration[key])) return invalid(`configuration.${key}`, 'range')
  for (const key of NON_NEGATIVE)
    if (!isNonNegativeInteger(configuration[key])) return invalid(`configuration.${key}`, 'range')
  if (!isDelaySequence(configuration.reconciliationDelaysMs))
    return invalid('configuration.reconciliationDelaysMs', 'range')
  if (configuration.maxRunSteps !== undefined && !isPositiveSafeInteger(configuration.maxRunSteps))
    return invalid('configuration.maxRunSteps', 'range')
  if (!COORDINATION_MODES.includes(configuration.coordination))
    return invalid('configuration.coordination', 'unknown-mode')
  try {
    parseRetryPolicy(configuration.modelRetry)
  } catch {
    return invalid('configuration.modelRetry', 'range')
  }
  return (
    judgeJointCommits(configuration.jointCommits) ??
    structure(
      'configuration.loopGuardPolicy',
      judgeAdoption(configuration.loopGuardPolicy),
      'Adoption',
    )
  )
}

export function isTenantId(value: unknown): value is TenantId {
  return tenantCodec.encode(value as TenantId).ok
}

function judgeBinding(binding: AgentRuntimeOptions['binding']): Failure | undefined {
  const instance = decodeAgentInstanceId(binding.instance)
  if ('failure' in instance) return invalid('binding.instance', instance.failure.reason)
  if (!isTenantId(binding.tenant)) return invalid('binding.tenant', 'type')
  return (
    structure('binding.scope', judgeEvidence(binding.scope), 'Evidence') ??
    structure('binding.definition', judgeAdoption(binding.definition), 'Adoption')
  )
}

export function judgeOptions(options: AgentRuntimeOptions): Failure | undefined {
  if (typeof options.configuration !== 'object' || options.configuration === null)
    return invalid('configuration', 'type')
  if (typeof options.binding !== 'object' || options.binding === null)
    return invalid('binding', 'type')
  return judgeConfiguration(options.configuration) ?? judgeBinding(options.binding)
}
