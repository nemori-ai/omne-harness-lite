import type {
  Access,
  AgentExecutionId,
  AgentInstanceId,
  ExecutionSnapshot,
  NestedActionAdmission,
  Reply,
} from '@omne-harness/agent-contract'
import type { TenantId } from '@omne-harness/legal-identity'

type Asked = Access<unknown> & Readonly<{ execution: AgentExecutionId }>

export type NestedEntryInput = Readonly<{
  /** Reads the execution after the access check of the host. */
  load(request: Asked): Reply<ExecutionSnapshot>
  /** The entry of the runtime that runs on this host now, when there is one. */
  runtimeOf(tenant: TenantId, instance: AgentInstanceId): NestedActionAdmission<unknown> | undefined
  record(level: 'error', message: string): void
}>

/** AG-32: a nested action is judged by the runtime that runs the execution, or not judged at all. */
export function nestedEntry(input: NestedEntryInput): NestedActionAdmission<unknown> {
  const away = (diagnostic: string) => ({ kind: 'unanswerable', diagnostic }) as const
  return {
    async admit(request) {
      const { principal, tenant, execution } = request
      const loaded = await input.load({ principal, tenant, execution })
      if ('failure' in loaded)
        return loaded.failure.kind === 'denied'
          ? { kind: 'denied', reason: 'the caller may not ask for this execution' }
          : away(`the execution could not be read: ${loaded.failure.kind}`)
      const attachment = loaded.ok.executionAttachment
      const runtime = attachment === null ? undefined : input.runtimeOf(tenant, attachment.instance)
      if (runtime === undefined) return away('no runtime here runs this execution')
      try {
        return await runtime.admit(request)
      } catch (error) {
        input.record('error', `a nested action could not be judged: ${String(error)}`)
        return away('the nested action could not be judged')
      }
    },
  }
}

/** Resolves once the signal aborts; `release` drops the listener when the wait ends first. */
export function deadlineOf(signal: AbortSignal) {
  let release = () => {}
  const reached = new Promise<'deadline'>(resolve => {
    if (signal.aborted) return resolve('deadline')
    const abort = () => resolve('deadline')
    signal.addEventListener('abort', abort, { once: true })
    release = () => signal.removeEventListener('abort', abort)
  })
  return { reached, release: () => release() }
}
