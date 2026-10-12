import { copyJsonValue } from '@omne-harness-lite/content-blocks'
import type { InvokeTool, InvokerOptions } from '@omne-harness-lite/tool-execution-runtime'

/** A caller-owned invocation closure. Persistence and authorization belong to its consumer. */
export function createToolInvoker(options: InvokerOptions): InvokeTool {
  return async (input, dependencies) => {
    const copied = copyJsonValue(input.args)
    if ('failed' in copied) return { kind: 'failed', code: 'arguments_invalid' }
    let argumentsResult: ReturnType<InvokerOptions['parameters']['judgeCallArguments']>
    try {
      argumentsResult = options.parameters.judgeCallArguments(input.definition, copied.ok)
    } catch {
      return { kind: 'failed', code: 'schema_unsupported' }
    }
    if ('unsupported' in argumentsResult) return { kind: 'failed', code: 'schema_unsupported' }
    if ('invalid' in argumentsResult) return { kind: 'failed', code: 'arguments_invalid' }
    if (dependencies.signal.aborted) return { kind: 'failed', code: 'start_failed' }
    let returned: unknown
    try {
      // Preserve the multi-command envelope; the argument judge validates its selected branch.
      returned = await input.executor(copied.ok, dependencies)
    } catch {
      return { kind: 'failed', code: 'implementation_error' }
    }
    try {
      const result = options.judgeResult(returned)
      return result.kind === 'valid'
        ? { kind: 'returned', result: result.result }
        : { kind: 'failed', code: 'result_rejected' }
    } catch {
      return { kind: 'failed', code: 'result_rejected' }
    }
  }
}
