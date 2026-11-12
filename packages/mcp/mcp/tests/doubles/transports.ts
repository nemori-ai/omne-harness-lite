// Test helper: a transport factory whose transports are reshaped as they open, one by one: a
// method that hangs, answers late, or breaches its contract. The scripted transport is a class
// instance, so its methods are delegated by name before the reshape replaces some of them.
import type { McpTransport, McpTransportFactory } from '@omne-harness/mcp-contract/provider'

/** The transport's methods, delegated by name, so a spread can replace some of them. */
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

/**
 * The factory whose `opened`-th transport (the first is 1) gets the methods `reshape` answers in
 * place of its own. A transport `reshape` leaves alone is delegated as it is.
 */
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

/** A promise that never settles: a port that never answers. */
export function never<T>(): Promise<T> {
  return new Promise<T>(() => undefined)
}
