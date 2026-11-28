import type { ContextLimits, ModelProfileDefinition, TokenLimit } from './profile.ts'

const POSITIVE = /^[1-9][0-9]*$/
const PERCENT = /^(100|[1-9][0-9]?)$/

function exceedsUpstream(limit: Pick<TokenLimit, 'provided' | 'upstream'>): boolean {
  return limit.upstream.some(
    entry =>
      entry.limit.kind === 'finite' &&
      POSITIVE.test(entry.limit.amount) &&
      BigInt(limit.provided) > BigInt(entry.limit.amount),
  )
}

function tokenProblems(context: ContextLimits): string[] {
  const { window, input, output } = context
  const named = [
    ['context.window', window],
    ['context.input', input],
    ['context.output', output],
  ] as const
  const problems: string[] = []
  for (const [field, limit] of named) {
    if (limit === null) continue
    if (!POSITIVE.test(limit.provided) || exceedsUpstream(limit)) problems.push(field)
    else if (POSITIVE.test(window.provided) && BigInt(limit.provided) > BigInt(window.provided))
      problems.push(field)
  }
  if (!PERCENT.test(context.compactionTriggerPercent))
    problems.push('context.compactionTriggerPercent')
  return problems
}

function decisionsProblems(definition: ModelProfileDefinition<'decisions'>): readonly string[] {
  const { maxQuestions } = definition
  return maxQuestions === null || POSITIVE.test(maxQuestions) ? [] : ['maxQuestions']
}

function liveProblems(definition: ModelProfileDefinition<'live'>): readonly string[] {
  const { maxSessionSeconds } = definition
  return maxSessionSeconds === null || POSITIVE.test(maxSessionSeconds) ? [] : ['maxSessionSeconds']
}

/** The fields of a profile that break the profile rules; empty when it may be adopted. */
export function profileProblems(definition: ModelProfileDefinition): readonly string[] {
  switch (definition.kind) {
    case 'llm':
      return llmProblems(definition)
    case 'decisions':
      return decisionsProblems(definition)
    case 'live':
      return liveProblems(definition)
    default: {
      const _exhaustive: never = definition
      return _exhaustive
    }
  }
}

function llmProblems(definition: ModelProfileDefinition<'llm'>): readonly string[] {
  const problems = tokenProblems(definition.context)
  const input: readonly string[] = definition.input
  if (!input.includes('text')) problems.push('input')
  const metrics = new Set(definition.limits.map(limit => limit.metric))
  const required = [
    ...(input.includes('image') ? (['image-bytes'] as const) : []),
    ...(input.includes('voice') ? (['voice-bytes', 'voice-duration-ms'] as const) : []),
    ...((definition.fileTypes?.length ?? 0) > 0 ? (['file-bytes'] as const) : []),
  ]
  for (const metric of required) if (!metrics.has(metric)) problems.push(`limits.${metric}`)
  return problems
}
