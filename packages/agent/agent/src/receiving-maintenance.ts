import type { Reply } from '@omne-harness/agent-contract'
import { fail, succeed } from '@omne-harness/operation-result'
import type { AgentModelReceiver } from './receiving.ts'
import type { ModelReceiverDependencies, ModelReceptionTarget } from './receiving-types.ts'
import {
  bindingKey,
  diagnose,
  receptionReport,
  retainTask,
  type ModelReceiverState,
  type ModelReceiverReport,
} from './receiving-state.ts'
import {
  cancelledMaintenance,
  entryTarget,
  maintenanceDenied,
  maintenanceUnavailable,
  qualify,
  scopeOf,
  waitForMaintenance,
  type MaintenanceInput,
} from './receiving-scope.ts'
import { readModelDeliveryMaterial } from './receiving-material.ts'
import type { createReceptionOutlet } from './receiving-outlet.ts'

export function createReceptionMaintenance<P>(
  dependencies: ModelReceiverDependencies<P>,
  state: ModelReceiverState<P>,
  push: AgentModelReceiver<P>['push'],
  outlet: ReturnType<typeof createReceptionOutlet<P>>,
) {
  async function run(original: MaintenanceInput<P>, recover: boolean): Reply<ModelReceiverReport> {
    const input = { ...original, access: { ...original.access } }
    const work = (async (): Reply<ModelReceiverReport> => {
      if (input.signal.aborted) return cancelledMaintenance()
      let targets: readonly ModelReceptionTarget[]
      try {
        const found = await dependencies.targets.forExecution(input)
        if ('failure' in found)
          return found.failure.kind === 'denied'
            ? fail(maintenanceDenied())
            : fail(maintenanceUnavailable('targets'))
        targets = structuredClone(found.ok)
      } catch {
        return fail(maintenanceUnavailable('targets'))
      }
      if (targets.length === 0 || targets.some(target => target.execution !== input.execution))
        return fail(maintenanceDenied())
      if (input.signal.aborted) return cancelledMaintenance()
      const scope = scopeOf(input.access, targets)
      const check = async () => {
        try {
          return await qualify(dependencies, input.access, targets, input.signal)
        } catch {
          return fail(maintenanceUnavailable('access'))
        }
      }
      const allowed = await check()
      if ('failure' in allowed) return allowed
      if (input.signal.aborted) return cancelledMaintenance()
      if (recover) {
        const loaded = await load(input, targets)
        if ('failure' in loaded) return loaded
      }
      const receptions = [...state.receptions.values()]
      for (const reception of receptions) {
        if (input.signal.aborted) return cancelledMaintenance()
        if (reception.commit.kind === 'unknown' && scope.has(reception.binding)) {
          const result = await push({
            access: input.access,
            delivery: reception.delivery,
            signal: input.signal,
          })
          if ('failure' in result) {
            if (result.failure.kind === 'denied') return fail(maintenanceDenied())
            if (result.failure.kind === 'unavailable')
              return fail(maintenanceUnavailable(result.failure.dependency))
          }
        }
      }
      if (input.signal.aborted) return cancelledMaintenance()
      const driven = await outlet.drain(input.access, scope, input.signal)
      if ('failure' in driven) return driven
      if (input.signal.aborted) return cancelledMaintenance()
      const final = await check()
      if ('failure' in final) return final
      if (input.signal.aborted) return cancelledMaintenance()
      return succeed(receptionReport(state, scope))
    })().catch(() => fail(maintenanceUnavailable('maintenance')))
    return waitForMaintenance(retainTask(state, work), input.signal)
  }
  async function load(
    input: MaintenanceInput<P>,
    targets: readonly ModelReceptionTarget[],
  ): Reply<void> {
    let snapshot
    try {
      snapshot = await dependencies.provider.journal.load({
        ...input.access,
        execution: input.execution,
      })
    } catch {
      return fail(maintenanceUnavailable('journal'))
    }
    if ('failure' in snapshot)
      return snapshot.failure.kind === 'denied'
        ? fail(maintenanceDenied())
        : fail(maintenanceUnavailable('journal'))
    if (input.signal.aborted) return cancelledMaintenance()
    if (snapshot.ok.entries === undefined) return fail(maintenanceUnavailable('journal-entries'))
    for (const entry of snapshot.ok.entries) {
      if (input.signal.aborted) return cancelledMaintenance()
      if (entry.kind !== 'received') continue
      const target = entryTarget(entry, targets)
      if (!target) continue
      const { material: source, ...expected } = entry
      let material
      try {
        material = await dependencies.provider.materials.read({ ...input.access, source })
      } catch {
        return fail(maintenanceUnavailable('materials'))
      }
      if ('failure' in material)
        return material.failure.kind === 'denied'
          ? fail(maintenanceDenied())
          : fail(maintenanceUnavailable('materials'))
      if (input.signal.aborted) return cancelledMaintenance()
      const delivery = readModelDeliveryMaterial(input.access, material.ok, expected)
      if (!delivery) {
        diagnose(
          state,
          `material:${bindingKey(input.access, target)}`,
          'invalid received material',
          bindingKey(input.access, target),
        )
        return fail(maintenanceUnavailable('materials'))
      }
      const result = await push({ access: input.access, delivery, signal: input.signal })
      if ('failure' in result) {
        if (result.failure.kind === 'denied') return fail(maintenanceDenied())
        if (result.failure.kind === 'unavailable')
          return fail(maintenanceUnavailable(result.failure.dependency))
      }
    }
    return succeed(undefined)
  }
  return {
    retry: (input: MaintenanceInput<P>) => run(input, false),
    recover: (input: MaintenanceInput<P>) => run(input, true),
  }
}
