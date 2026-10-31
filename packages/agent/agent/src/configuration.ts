// The creation checks that read nothing but the options: the eight configuration items of
// docs/public-api.md "工厂配置" and the four binding fields. A value the type forbids can still come
// from an untyped caller, so each check judges the value itself. The first failure is returned as
// `invalid`, with `field` the path of the item, for example `configuration.toolConcurrency`.
// Limit: only the values of the options are judged for an untyped caller. The dependencies are
// assumed to satisfy their contract types: a Journal without `capabilities`, a `registration.instance`
// getter that throws, or options or dependencies that are not objects make the creation reject.
import {
  decodeAgentInstanceId,
  judgeAdoption,
  judgeEvidence,
  type Failure,
  type StructureFailure,
} from '@omne-harness/agent-contract'
import { tenantCodec, type TenantId } from '@omne-harness/legal-identity'
import type { Outcome } from '@omne-harness/operation-result'
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
const NON_NEGATIVE = ['reconciliationDelayMs', 'denialBackoffMs'] as const

const invalid = (field: string, reason: string): Failure => ({ kind: 'invalid', field, reason })

function isPositiveSafeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** A structure judgment failure under `path`; the structure's own name becomes the path itself. */
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
  if (!COORDINATION_MODES.includes(configuration.coordination))
    return invalid('configuration.coordination', 'unknown-mode')
  return (
    judgeJointCommits(configuration.jointCommits) ??
    structure(
      'configuration.loopGuardPolicy',
      judgeAdoption(configuration.loopGuardPolicy),
      'Adoption',
    )
  )
}

/** Whether legal-identity minted the value; `encode` checks registry membership of any value. */
export function isTenantId(value: unknown): value is TenantId {
  // `encode` types its parameter as `TenantId`, but its check takes any value; see judgeAccess.
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

/** The first `invalid` of the options: configuration first, then binding; undefined when both hold. */
export function judgeOptions(options: AgentRuntimeOptions): Failure | undefined {
  if (typeof options.configuration !== 'object' || options.configuration === null)
    return invalid('configuration', 'type')
  if (typeof options.binding !== 'object' || options.binding === null)
    return invalid('binding', 'type')
  return judgeConfiguration(options.configuration) ?? judgeBinding(options.binding)
}
