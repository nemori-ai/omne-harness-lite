import { vi } from 'vitest'
import { agentActionAdmissionKey } from '@omne-harness/agent-cordis-contract/cordis'
import { toolRuntimeKey } from '@omne-harness/tool-cordis-contract/cordis'
import { currentToolPermissionKey } from '../../../src/rows/governance/current-permission-service.ts'
import type { EntryObjectModule } from '../../../src/types.ts'

export type PermissionObservation = Readonly<{ stage: string; result: unknown }>

/** Observes real public replies unchanged; it supplies no authority or decision. */
export function permissionObservation(trace: PermissionObservation[]): EntryObjectModule {
  return {
    name: 'permission-observation',
    implementation: 'real',
    install(scope, env) {
      scope.inject([toolRuntimeKey], ctx => {
        const service = ctx.toolRuntime
        const invoke = service.invoke
        const spy = vi.spyOn(service, 'invoke').mockImplementation(input => {
          trace.push({ stage: 'tool-invoke', result: 'called' })
          return invoke(input)
        })
        ctx.effect(() => () => spy.mockRestore())
      })
      env.readTrusted(currentToolPermissionKey).inject([currentToolPermissionKey], ctx => {
        const service = ctx.currentToolPermission
        const read = service.readCurrent
        const readSpy = vi.spyOn(service, 'readCurrent').mockImplementation(async input => {
          const result = await read(input)
          trace.push({
            stage: 'request',
            result: result.request === null ? 'unavailable' : 'mapped',
          })
          const reading = result.reading as { kind: string; sourceRef?: string }
          trace.push({
            stage: 'current',
            result: {
              reading: reading.kind,
              source: reading.sourceRef ?? null,
              inquiry: input.inquiry ?? null,
            },
          })
          return result
        })
        ctx.effect(() => () => readSpy.mockRestore())
      })
      scope.inject([agentActionAdmissionKey], ctx => {
        const service = ctx.agentActionAdmission
        const admit = service.admit
        const spy = vi.spyOn(service, 'admit').mockImplementation(async input => {
          const result = await admit(input)
          trace.push({
            stage: 'admission',
            result: 'ok' in result ? result.ok.kind : result.failure.kind,
          })
          return result
        })
        ctx.effect(() => () => spy.mockRestore())
      })
    },
  }
}
