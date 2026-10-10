import type { SessionPresentationStore } from './session-presentation.ts'
import type { ToolPoolInstance } from '@omne-harness-lite/tool-execution-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

export function observeSessionToolPool(
  pool: ToolPoolInstance,
  scope: SessionScope,
  run: string,
  presentation?: SessionPresentationStore,
): ToolPoolInstance {
  if (!presentation) return pool
  return {
    ...pool,
    operations: {
      ...pool.operations,
      submit: async request => {
        const result = await pool.operations.submit(request)
        if (
          request.call.visibility.toHuman &&
          (result.kind === 'recorded' || result.kind === 'recognized')
        ) {
          const access = request.access,
            execution = result.execution
          let terminal: string | undefined
          presentation.bindTool({
            scope,
            run,
            call: request.call.callId,
            name: request.call.tool,
            read: async () => {
              if (terminal) return terminal
              const acquired = await pool.operations.acquire(access, execution)
              if (acquired.kind === 'rejected') return 'unavailable'
              try {
                const reading = await acquired.observer.read()
                if (reading.kind === 'rejected') return 'unavailable'
                const state = reading.snapshot.state
                if (state.phase === 'ended') terminal = state.terminal.outcome
                return terminal ?? state.phase
              } finally {
                acquired.observer.release()
              }
            },
          })
        }
        return result
      },
    },
  }
}
