import { tenantIdEquals } from '@omne-harness-lite/identity-values'
import type { SessionPresentationStore } from './session-presentation.ts'
import { humanBlocks, humanSnapshot, type ToolObservation } from './session-human-content.ts'
import type { ExecutionTerminal, ToolPoolInstance } from '@omne-harness-lite/tool-execution-runtime'
import type { SessionScope } from '@omne-harness-lite/session-tenancy'

function terminalObservation(value: ExecutionTerminal, call: string): ToolObservation {
  const result = 'result' in value ? value.result : undefined
  const blocks =
    typeof result === 'string'
      ? [{ id: `result:${call}`, kind: 'text' as const, text: result }]
      : result
        ? humanBlocks(result.content)
        : []
  const notice = 'reason' in value ? value.reason : value.outcome === 'failed' ? value.code : null
  return {
    state:
      result && typeof result !== 'string' && result.isError
        ? `${value.outcome} (tool error)`
        : value.outcome,
    blocks,
    notice,
    offloaded: typeof result === 'object' && result.offload !== undefined,
  }
}
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
          request.ref.session === scope.session &&
          tenantIdEquals(request.ref.tenant, scope.tenant) &&
          request.origin.run === run &&
          request.call.visibility.toHuman &&
          (result.kind === 'recorded' || result.kind === 'recognized')
        ) {
          const access = request.access,
            execution = result.execution
          const [block] = humanBlocks([request.call])
          if (!block || block.kind !== 'tool_call') return result
          const callId = request.call.callId
          presentation.bindTool({
            scope,
            run,
            call: request.call.callId,
            block,
            read: async () => {
              const acquired = await pool.operations.acquire(access, execution)
              if (acquired.kind === 'rejected')
                return { observation: unavailable(), terminal: false }
              try {
                const reading = await acquired.observer.read()
                if (reading.kind === 'rejected')
                  return { observation: unavailable(), terminal: false }
                const state = reading.snapshot.state
                if (state.phase === 'ended') {
                  return {
                    observation: terminalObservation(state.terminal, callId),
                    terminal: true,
                  }
                }
                const frames = await acquired.observer.frames()
                return {
                  terminal: false,
                  observation: {
                    state: state.phase,
                    blocks: frames.kind === 'snapshot' ? humanSnapshot(frames.value) : [],
                    notice: frames.kind === 'rejected' ? 'Live tool output unavailable' : null,
                    offloaded: false,
                  },
                }
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
function unavailable(): ToolObservation {
  return {
    state: 'unavailable',
    blocks: [],
    notice: 'Tool observation unavailable',
    offloaded: false,
  }
}
