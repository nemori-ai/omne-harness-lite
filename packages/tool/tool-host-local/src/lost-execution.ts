import type {
  ExecutionEnvironment,
  ManagedResource,
  RecoveryAccess,
} from '@omne-harness/execution-environment-contract'
import { settleLostExecution, type ToolLedgerStore } from '@omne-harness/tool'
import type { DurableEvidence } from '@omne-harness/tool-contract'
import type {
  ToolCommands,
  ToolDriver,
  ToolMessageContentBlock,
  ToolRecovery,
} from '@omne-harness/tool-contract/provider'
import { startedElsewhere, type LostContact } from './call-liveness.ts'
import { createEnvironmentStateStore } from './environment-state.ts'

export type Maintenance = Pick<ExecutionEnvironment<unknown>, 'recoverResources'>

export type LostExecutionsInput = Readonly<{
  settings: Readonly<{
    store: ToolLedgerStore
    lostContact?: LostContact
    recoveryAccess?: RecoveryAccess
  }>
  dependencies: Readonly<{
    commands: Pick<ToolCommands<unknown, ToolMessageContentBlock>, 'settleLost'>
  }>
  maintenance(): Maintenance | null
}>

type Step = Parameters<ToolDriver<unknown>['run']>[0]

const STOPPABLE: ReadonlySet<string> = new Set(['active', 'unconfirmed'])

export function createLostExecutions(
  { settings, dependencies, maintenance }: LostExecutionsInput,
  later: (step: Step) => void,
) {
  const stopped = async (step: Step, recovery: ToolRecovery): Promise<boolean> => {
    const state = createEnvironmentStateStore({ store: settings.store })
    for (const preparation of recovery.preparations) {
      const { tenant, call } = step
      const read = await state.read({ tenant, call, operation: preparation.operation })
      if ('failure' in read) return false
      if (read.ok === null) continue
      const owned: ManagedResource[] = [...read.ok.resources, ...read.ok.reservations]
        .filter(fact => STOPPABLE.has(fact.stop))
        .map(fact => fact.resource)
      if (owned.length === 0) continue
      const environment = maintenance()
      if (environment === null || settings.recoveryAccess === undefined) return false
      const { scope } = read.ok.original
      const answer = await environment.recoverResources(scope, settings.recoveryAccess, owned)
      if (answer.kind !== 'recovered' || answer.stopped.length !== owned.length) return false
    }
    return true
  }

  const settle = async (
    step: Step,
    recovery: ToolRecovery,
    continuity: DurableEvidence,
  ): Promise<boolean> => {
    if (recovery.start === null) return false
    try {
      if (!(await stopped(step, recovery))) return false
      const { commands } = dependencies
      return 'ok' in (await settleLostExecution(commands, step, recovery.start, continuity))
    } catch {
      return false
    }
  }

  return {
    async handled(
      step: Step,
      recovery: ToolRecovery,
      entry: { progress: string },
      forget: () => void,
    ): Promise<boolean> {
      const owner = startedElsewhere(recovery, step.instance)
      if (owner === null) return false
      const continuity = settings.lostContact?.(owner) ?? null
      if (continuity === null) {
        forget()
        return true
      }
      if (await settle(step, recovery, continuity)) return false
      entry.progress = 'failed/unavailable/lost-execution'
      later(step)
      return true
    },
  }
}
