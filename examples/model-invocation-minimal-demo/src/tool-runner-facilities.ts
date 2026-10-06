import { randomUUID } from 'node:crypto'
import { parseOpaqueIdentifier, isOk } from '@omne-harness-lite/identity-values'
import type { SessionLogOwnerOperations } from '@omne-harness-lite/session-log'
import type { ToolActionAuthority } from './tool-action-source.ts'
import type { DemoRunnerExternalExecution } from './runner-service-host.ts'
import type { RecoveryAccess } from '@omne-harness-lite/execution-environments'

/** Pure extension invocations borrow the actual session log and a call-owned, non-OS environment. */
export function createToolRunnerFacilities(owner: SessionLogOwnerOperations) {
  const environments = new Map<string, AbortController>()
  const releases = new Set<Promise<void>>()
  let open = true
  function external(
    authority: {
      readonly scope: ToolActionAuthority['scope']
      readonly coordinator: ToolActionAuthority['coordinator'] | RecoveryAccess
    },
    signal: AbortSignal,
  ): DemoRunnerExternalExecution {
    return {
      readAskState: async () => ({ kind: 'unavailable' }),
      async openHandles() {
        if (!open || signal.aborted) return { unavailable: true }
        const borrowed = await owner.borrow(authority.coordinator, authority.scope)
        if (borrowed.kind !== 'borrowed') return { unavailable: true }
        const log = parseOpaqueIdentifier(`extension-log-${randomUUID()}`, 'LogHandle')
        const environment = parseOpaqueIdentifier(
          `extension-environment-${randomUUID()}`,
          'EnvironmentHandle',
        )
        if (!isOk(log) || !isOk(environment)) {
          await borrowed.release()
          return { unavailable: true }
        }
        const execution = new AbortController()
        environments.set(environment.ok, execution)
        let held = true
        return {
          log: log.ok,
          environment: environment.ok,
          release() {
            if (!held) return
            held = false
            execution.abort()
            environments.delete(environment.ok)
            const release = borrowed.release()
            releases.add(release)
            void release.then(
              () => releases.delete(release),
              () => undefined,
            )
          },
        }
      },
      mintReminder: () => ({ unavailable: true }),
      fallbackNeedsProjection: async () => false,
      commandPresence: async () => 'absent',
      invokeCommand: async () => ({ kind: 'notStartedUnavailable' }),
    }
  }
  return Object.freeze({
    external,
    async close() {
      open = false
      if (environments.size) throw new Error('extension environment still held')
      await Promise.all([...releases])
    },
  })
}
