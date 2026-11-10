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
        const request = service.request
        const read = service.readCurrent
        const requestSpy = vi.spyOn(service, 'request').mockImplementation(async input => {
          const result = await request(input)
          trace.push({ stage: 'request', result: result === undefined ? 'unavailable' : 'mapped' })
          return result
        })
        const readSpy = vi
          .spyOn(service, 'readCurrent')
          .mockImplementation(async (input, request) => {
            const result = await read(input, request)
            trace.push({
              stage: 'current',
              result: {
                reading: result.kind,
                source: 'sourceRef' in result ? result.sourceRef : null,
                inquiry: input.inquiry ?? null,
              },
            })
            return result
          })
        ctx.effect(() => () => {
          requestSpy.mockRestore()
          readSpy.mockRestore()
        })
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
