import type { Access, CompactionInput, CompactionReply } from '@omne-harness/agent-contract'
import type * as M from '@omne-harness/model-contract'
import type { Message } from '@omne-harness/message'
import { fail, succeed } from '@omne-harness/operation-result'
import { canonical } from './evidence.ts'

export const measurementUnavailable = (diagnostic: string) =>
  fail({
    kind: 'unavailable' as const,
    dependency: 'compaction-model-preparation',
    diagnostic,
  })

export function roundedAmount(check: M.BudgetCheck): bigint {
  const decimal = (text: string) => {
    const [whole = '0', fraction = ''] = text.split('.')
    return { n: BigInt(whole + fraction), d: 10n ** BigInt(fraction.length) }
  }
  const amount = decimal(check.measurement.amount)
  const margin = decimal(check.measurement.kind === 'estimate' ? check.measurement.margin : '0')
  const d = amount.d * margin.d
  return (amount.n * margin.d + margin.n * amount.d + d - 1n) / d
}

export function assembledFor(
  input: CompactionInput,
  messages: readonly Message[],
  frame: boolean,
): M.AssembledModelInput {
  return {
    system: frame ? input.frame.system : [],
    tools: frame ? input.frame.tools : [],
    messages: [
      ...messages,
      ...(frame && input.frame.snapshotReminder !== null ? [input.frame.snapshotReminder] : []),
      ...(frame && input.frame.tailFacts !== null ? [input.frame.tailFacts] : []),
    ],
    toolChoice: 'auto',
    parameters: input.target.parameters,
    representation: input.target.profile.profile.definition.representation,
    source: input.target.representation,
  }
}

export async function measureDefaultInput<P>(
  resources: M.ModelPreparationResources<P>,
  access: Access<P>,
  input: CompactionInput,
  assembled: M.AssembledModelInput,
): CompactionReply<readonly M.BudgetCheck[]> {
  const profile = input.target.profile.profile
  const present = new Set(assembled.messages.map(message => message.id))
  const lineage = {
    sources: input.history.entries.flatMap(entry =>
      entry.sourceCall !== undefined && present.has(entry.message.id)
        ? [{ message: entry.message.id, call: entry.sourceCall }]
        : [],
    ),
  }
  const acquired = await resources.acquire({ ...access, profile, lineage })
  if ('failure' in acquired) return measurementUnavailable(canonical(acquired.failure))
  const lease = acquired.ok
  let outcome: Awaited<CompactionReply<readonly M.BudgetCheck[]>> = measurementUnavailable(
    'measurement did not finish',
  )
  try {
    outcome = await measureLease(lease, profile, assembled)
  } finally {
    const released = await lease.release()
    if (released.failure !== undefined && 'ok' in outcome)
      outcome = measurementUnavailable(canonical(released.failure))
  }
  return outcome
}

async function measureLease(
  lease: M.ModelPreparationLease,
  profile: M.ModelProfile,
  assembled: M.AssembledModelInput,
): CompactionReply<readonly M.BudgetCheck[]> {
  const suppliers = profile.definition.suppliers
  if (lease.bindings.length !== suppliers.length)
    return measurementUnavailable('incomplete supplier lease')
  const checked = new Set<string>()
  const checks: M.BudgetCheck[] = []
  for (const binding of lease.bindings) {
    const supplier = suppliers.find(
      candidate =>
        candidate.provider === binding.supplier.provider &&
        candidate.model === binding.supplier.model &&
        canonical(candidate.adoption) === canonical(binding.supplier.adoption),
    )
    if (supplier === undefined || checked.has(canonical(supplier.adoption)))
      return measurementUnavailable('unknown or duplicate supplier lease')
    checked.add(canonical(supplier.adoption))
    const planned = binding.rules.plan({ profile, supplier: binding.supplier, assembled })
    if ('failure' in planned) return measurementUnavailable(canonical(planned.failure))
    const measured = await binding.meter.measure({
      profile: profile.adoption,
      supplier,
      context: profile.definition.context,
      limits: profile.definition.limits,
      assembled,
      parameters: planned.ok.parameters,
      representation: planned.ok.representation,
    })
    if ('failure' in measured) return measurementUnavailable(canonical(measured.failure))
    if (measured.ok.kind !== 'complete')
      return measurementUnavailable('summary media measurement is incomplete')
    if (
      !measured.ok.checks.some(
        check =>
          check.metric === 'input-tokens' &&
          check.subject === 'request' &&
          canonical(check.supplier) === canonical(supplier.adoption),
      )
    )
      return measurementUnavailable('whole input token measurement missing')
    if (
      measured.ok.checks.some(check => canonical(check.supplier) !== canonical(supplier.adoption))
    )
      return measurementUnavailable('measurement names a different supplier')
    checks.push(...measured.ok.checks)
  }
  return succeed(checks)
}

export function inputTokens(checks: readonly M.BudgetCheck[]): bigint {
  return checks
    .filter(check => check.metric === 'input-tokens' && check.subject === 'request')
    .map(roundedAmount)
    .reduce((a, b) => (a > b ? a : b), 0n)
}

export function fits(
  input: CompactionInput,
  checks: readonly M.BudgetCheck[],
  target: boolean,
): boolean {
  if (checks.some(check => roundedAmount(check) > BigInt(check.limit))) return false
  const context = input.target.profile.profile.definition.context
  if (inputTokens(checks) + BigInt(context.output.provided) > BigInt(context.window.provided))
    return false
  return (
    !target ||
    input.target.goals.every(goal => {
      const matching = checks.filter(
        check =>
          check.subject === 'request' &&
          check.metric === (goal.metric === 'context-tokens' ? 'input-tokens' : goal.metric),
      )
      return (
        input.target.profile.profile.definition.suppliers.every(supplier =>
          matching.some(check => canonical(check.supplier) === canonical(supplier.adoption)),
        ) &&
        matching.every(check => {
          const amount =
            roundedAmount(check) +
            (goal.metric === 'context-tokens' ? BigInt(context.output.provided) : 0n)
          return goal.relation === 'less-than'
            ? amount < BigInt(goal.limit)
            : amount <= BigInt(goal.limit)
        })
      )
    })
  )
}
