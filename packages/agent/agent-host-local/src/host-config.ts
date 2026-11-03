// The configuration of the `agent-host` plugin: the value items of the factory configuration
// (agent docs/public-api.md "工厂配置") and the host's own `instanceIdleMs`. The check is a Standard
// Schema, so Cordis refuses a wrong value before the plugin body runs and the fiber fails. The
// rules of each factory item are those of the factory table: this check judges the same values, and
// the factory judges them again when it creates an instance.
import type { AgentConfiguration } from '@omne-harness/agent'
import { judgeAdoption } from '@omne-harness/agent-contract'

/**
 * The reception items: the tenant capacity of the Model result receiver and the waits of its
 * maintenance (SPEC "结果接收"). Optional as a whole; absent, the host takes `RECEPTION_INITIAL` of
 * `reception.ts`, which are initial values of the configuration, not limits of the member.
 */
export type AgentHostReceptionConfig = Readonly<{
  records: number
  bytes: number
  attachments: number
  inFlight: number
  retryMs: number
  retryMaxMs: number
}>

/** The validated configuration: the factory configuration and the idle time of an instance. */
export type AgentHostConfig = AgentConfiguration &
  Readonly<{ instanceIdleMs: number; reception?: AgentHostReceptionConfig }>

type Issue = Readonly<{ message: string }>

const JOINT_COMMITS: readonly unknown[] = [
  'message',
  'context-transition',
  'custody',
  'processed',
] satisfies readonly AgentConfiguration['jointCommits'][number][]
const COORDINATION: readonly unknown[] = [
  'standalone',
  'coordinated',
] satisfies readonly AgentConfiguration['coordination'][]

const POSITIVE = [
  'observerBufferBytes',
  'reconciliationBatchLimit',
  'toolConcurrency',
  'instanceIdleMs',
] as const
const NON_NEGATIVE = ['reconciliationDelayMs', 'denialBackoffMs'] as const
const FIELDS: ReadonlySet<string> = new Set([
  ...POSITIVE,
  ...NON_NEGATIVE,
  'jointCommits',
  'coordination',
  'loopGuardPolicy',
  'maxRunSteps',
  'reception',
])

const RECEPTION_FIELDS = [
  'records',
  'bytes',
  'attachments',
  'inFlight',
  'retryMs',
  'retryMaxMs',
] as const

const isPositive = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const isNonNegative = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function jointCommitsIssue(value: unknown): string | undefined {
  if (!Array.isArray(value)) return 'jointCommits: not a list'
  const seen = new Set<unknown>()
  for (const kind of value) {
    if (!JOINT_COMMITS.includes(kind)) return 'jointCommits: unknown kind'
    if (seen.has(kind)) return 'jointCommits: duplicate kind'
    seen.add(kind)
  }
  return undefined
}

/** Optional: the factory takes its default step limit when the assembly gives none (R2-D221). */
function stepLimitIssues(value: unknown): readonly string[] {
  return value === undefined || isPositive(value)
    ? []
    : ['maxRunSteps: not a positive safe integer']
}

/** Optional: every item positive when given, and the longest wait not below the first. */
function receptionIssues(value: unknown): readonly string[] {
  if (value === undefined) return []
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return ['reception: not an object']
  const issues: string[] = []
  const allowed: ReadonlySet<string> = new Set(RECEPTION_FIELDS)
  for (const field of Object.keys(value))
    if (!allowed.has(field)) issues.push(`reception.${field}: unknown field`)
  for (const field of RECEPTION_FIELDS)
    if (!isPositive(Reflect.get(value, field)))
      issues.push(`reception.${field}: not a positive safe integer`)
  if (
    issues.length === 0 &&
    (Reflect.get(value, 'retryMaxMs') as number) < (Reflect.get(value, 'retryMs') as number)
  )
    issues.push('reception.retryMaxMs: below retryMs')
  return issues
}

/** The issues of one value, in the order of the fields. An empty list means a valid value. */
function issuesOf(value: unknown): readonly Issue[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return [{ message: 'the configuration is not an object' }]
  const read = (field: string): unknown => Reflect.get(value, field)
  const issues: string[] = []
  for (const field of Object.keys(value))
    if (!FIELDS.has(field)) issues.push(`${field}: unknown field`)
  for (const field of POSITIVE)
    if (!isPositive(read(field))) issues.push(`${field}: not a positive safe integer`)
  for (const field of NON_NEGATIVE)
    if (!isNonNegative(read(field))) issues.push(`${field}: not a non-negative safe integer`)
  issues.push(...stepLimitIssues(read('maxRunSteps')))
  issues.push(...receptionIssues(read('reception')))
  if (!COORDINATION.includes(read('coordination'))) issues.push('coordination: unknown mode')
  const joint = jointCommitsIssue(read('jointCommits'))
  if (joint !== undefined) issues.push(joint)
  const guard = judgeAdoption(read('loopGuardPolicy'))
  if ('failure' in guard) issues.push(`loopGuardPolicy: ${guard.failure.reason}`)
  return issues.map(message => ({ message }))
}

/**
 * The Standard Schema of the plugin configuration. It has no default: the assembly gives every
 * item except the optional `maxRunSteps`, whose default the factory owns, and the optional
 * `reception`, whose initial values the host owns.
 */
export const agentHostConfig = {
  '~standard': {
    version: 1 as const,
    vendor: 'agent-host-local',
    // The return type is written out so that the published declaration names both result shapes.
    validate(
      value: unknown,
    ): { issues?: never; value: AgentHostConfig } | { value?: never; issues: readonly Issue[] } {
      const issues = issuesOf(value)
      // After the check every field holds a value of its type, so the object is the configuration.
      return issues.length > 0 ? { issues } : { value: value as AgentHostConfig }
    },
  },
}
