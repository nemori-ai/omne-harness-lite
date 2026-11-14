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
import { succeed } from '@omne-harness/operation-result'
import {
  createEnvironmentStateStore,
  environmentFailure,
  type EnvironmentState,
} from './environment-state.ts'

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

function confirmedStops(state: EnvironmentState, keys: ReadonlySet<string>): EnvironmentState {
  const confirm = <T extends Readonly<{ resource: ManagedResource; stop: string }>>(item: T): T =>
    keys.has(item.resource.key) && STOPPABLE.has(item.stop) ? { ...item, stop: 'confirmed' } : item
  return {
    ...state,
    resources: state.resources.map(confirm),
    reservations: state.reservations.map(confirm),
  }
}

export function createLostExecutions(
  { settings, dependencies, maintenance }: LostExecutionsInput,
  later: (step: Step) => void,
) {
  const stopped = async (step: Step, recovery: ToolRecovery): Promise<boolean> => {
    const state = createEnvironmentStateStore({ store: settings.store })
    for (const preparation of recovery.preparations) {
      const address = { tenant: step.tenant, call: step.call, operation: preparation.operation }
      const read = await state.read(address)
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
      const keys = new Set(owned.map(resource => resource.key))
      const written = await state
        .update(address, current =>
          current === null
            ? environmentFailure('original acquisition is missing')
            : succeed(confirmedStops(current, keys)),
        )
        .catch(() => null)
      if (written === null || 'failure' in written) return false
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
      if (recovery.tasks.some(task => task.kind === 'settle')) return true
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
