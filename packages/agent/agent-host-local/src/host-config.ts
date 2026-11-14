import type { AgentConfiguration } from '@omne-harness/agent'
import { judgeAdoption } from '@omne-harness/agent-contract'
import { parseRetryPolicy } from '@omne-harness/retry'

export type AgentHostReceptionConfig = Readonly<{
  records: number
  bytes: number
  attachments: number
  inFlight: number
  retryMs: number
  retryMaxMs: number
}>

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
const NON_NEGATIVE = ['denialBackoffMs'] as const
const FIELDS: ReadonlySet<string> = new Set([
  ...POSITIVE,
  ...NON_NEGATIVE,
  'reconciliationDelaysMs',
  'jointCommits',
  'coordination',
  'loopGuardPolicy',
  'modelRetry',
  'maxRunSteps',
  'reception',
])

function modelRetryIssues(value: unknown): readonly string[] {
  try {
    parseRetryPolicy(value)
    return []
  } catch (error) {
    return [`modelRetry: ${error instanceof Error ? error.message : 'not a retry policy'}`]
  }
}

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

function stepLimitIssues(value: unknown): readonly string[] {
  return value === undefined || isPositive(value)
    ? []
    : ['maxRunSteps: not a positive safe integer']
}

function receptionIssues(value: unknown): readonly string[] {
  if (value === undefined) return []
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return ['reception: not an object']
  const issues = receptionFieldIssues(value)
  return issues.length > 0 ? issues : receptionOrderIssues(value)
}

function receptionFieldIssues(value: object): string[] {
  const allowed: ReadonlySet<string> = new Set(RECEPTION_FIELDS)
  return [
    ...Object.keys(value)
      .filter(field => !allowed.has(field))
      .map(field => `reception.${field}: unknown field`),
    ...RECEPTION_FIELDS.filter(field => !isPositive(Reflect.get(value, field))).map(
      field => `reception.${field}: not a positive safe integer`,
    ),
  ]
}

function receptionOrderIssues(value: object): string[] {
  const first = Reflect.get(value, 'retryMs') as number
  return (Reflect.get(value, 'retryMaxMs') as number) < first
    ? ['reception.retryMaxMs: below retryMs']
    : []
}

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
  const delays = read('reconciliationDelaysMs')
  if (!Array.isArray(delays) || delays.length === 0 || !delays.every(isNonNegative))
    issues.push('reconciliationDelaysMs: not a non-empty list of non-negative safe integers')
  issues.push(...modelRetryIssues(read('modelRetry')))
  issues.push(...stepLimitIssues(read('maxRunSteps')))
  issues.push(...receptionIssues(read('reception')))
  if (!COORDINATION.includes(read('coordination'))) issues.push('coordination: unknown mode')
  const joint = jointCommitsIssue(read('jointCommits'))
  if (joint !== undefined) issues.push(joint)
  const guard = judgeAdoption(read('loopGuardPolicy'))
  if ('failure' in guard) issues.push(`loopGuardPolicy: ${guard.failure.reason}`)
  return issues.map(message => ({ message }))
}

export const agentHostConfig = {
  '~standard': {
    version: 1 as const,
    vendor: 'agent-host-local',
    validate(
      value: unknown,
    ): { issues?: never; value: AgentHostConfig } | { value?: never; issues: readonly Issue[] } {
      const issues = issuesOf(value)
      return issues.length > 0 ? { issues } : { value: value as AgentHostConfig }
    },
  },
}
