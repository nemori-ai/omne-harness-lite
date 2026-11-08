import { fail, succeed } from '@omne-harness/operation-result'
import type { HistoricalTextInterpretation, ToolHistoryMigration } from '@omne-harness/tool'
import type { Reply, ToolOperationId } from '@omne-harness/tool-contract'
import type { CallAccess } from '@omne-harness/tool-contract/provider'
import type { createLocalHistoricalDeliveryMaintenance } from '@omne-harness/tool-host-local'

export type HistoryUpgrade = Readonly<{
  interpretations(access: CallAccess<unknown>): readonly HistoricalTextInterpretation[]
  operation(): ToolOperationId
  attempts: number
}>
const unavailable = (diagnostic: string) =>
  fail({ kind: 'unavailable' as const, dependency: 'tool-history-upgrade', diagnostic })

export async function upgradeHistoricalCall<P>(
  access: CallAccess<P>,
  migration: ToolHistoryMigration<P>,
  host: ReturnType<typeof createLocalHistoricalDeliveryMaintenance<P>>,
  upgrade: HistoryUpgrade,
): Reply<void> {
  const plans = await migration.plans(access)
  if ('failure' in plans) return plans
  const advance = async (request: Parameters<ToolHistoryMigration<P>['apply']>[0]): Reply<void> => {
    for (let attempt = 0; attempt < upgrade.attempts; attempt++) {
      const answer = await migration.apply(request)
      if ('failure' in answer) return answer
      if (answer.ok.kind === 'cleaned') {
        const compacted = await host.compact(request)
        return 'failure' in compacted ? compacted : succeed(undefined)
      }
      if (answer.ok.kind !== 'preparing' && answer.ok.kind !== 'published')
        return unavailable('the original migration cannot be continued')
    }
    return unavailable('historical migration remains pending; restart with its saved plan')
  }
  for (const plan of plans.ok) {
    const { progress } = plan
    const request = { ...access, operation: progress.operation }
    if (progress.kind === 'abandoned') continue
    if (progress.kind === 'abandoning') {
      const answer = await migration.abandon(request)
      return 'failure' in answer
        ? answer
        : unavailable('historical abandonment continued; inspect before restarting upgrade')
    }
    if (progress.kind === 'cleaned') {
      const compacted = await host.compact(request)
      if ('failure' in compacted) return compacted
    } else {
      const answer = await advance({
        ...request,
        source: progress.source,
        interpretations: plan.interpretations,
      })
      if ('failure' in answer) return answer
    }
  }
  const interpretations = upgrade.interpretations(access)
  const preview = await migration.preview({ ...access, interpretations })
  if ('failure' in preview) return preview
  if (preview.ok.kind === 'current') return succeed(undefined)
  if (preview.ok.kind === 'quarantined')
    return unavailable(`historical call is quarantined: ${preview.ok.reason}`)
  return advance({
    ...access,
    operation: upgrade.operation(),
    source: preview.ok.source,
    interpretations,
  })
}
