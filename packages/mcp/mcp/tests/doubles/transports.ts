import type { McpTransport, McpTransportFactory } from '@omne-harness/mcp-contract/provider'

export function delegating(transport: McpTransport): McpTransport {
  return {
    generation: transport.generation,
    discover: () => transport.discover(),
    listActions: cursor => transport.listActions(cursor),
    call: (request, signal, observe) => transport.call(request, signal, observe),
    cancelRequest: requestId => transport.cancelRequest(requestId),
    getTask: taskId => transport.getTask(taskId),
    updateTask: (taskId, inputResponses) => transport.updateTask(taskId, inputResponses),
    getTaskResult: taskId => transport.getTaskResult(taskId),
    cancelTask: taskId => transport.cancelTask(taskId),
    close: () => transport.close(),
  }
}

export function reshapedTransports(
  factory: McpTransportFactory,
  reshape: (transport: McpTransport, opened: number) => Partial<McpTransport>,
): McpTransportFactory {
  let opened = 0
  return {
    async open(material, signal) {
      const result = await factory.open(material, signal)
      if ('failure' in result) return result
      opened += 1
      return { ok: { ...delegating(result.ok), ...reshape(result.ok, opened) } }
    },
  }
}

export function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined)
}
