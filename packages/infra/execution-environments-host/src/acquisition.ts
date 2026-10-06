import {
  captureEnvironmentCall,
  captureEnvironmentScope,
  captureEnvironmentRequirement,
  captureEnvironmentReference,
  type ExecutionEnvironmentOperations,
} from '@omne-harness-lite/execution-environments'

/** Capture data and original lifecycle callbacks before any authorization wait. */
export function captureAcquisition(
  request: Parameters<ExecutionEnvironmentOperations['acquire']>[0],
) {
  try {
    if (!request || typeof request !== 'object') return undefined
    const scope = captureEnvironmentScope(request.scope),
      requirement = captureEnvironmentRequirement(request.requirement),
      call = captureEnvironmentCall(request.call),
      reference =
        request.reference === undefined ? undefined : captureEnvironmentReference(request.reference)
    const lifecycle = request.resources
    if (
      !scope ||
      !requirement ||
      !call ||
      (request.reference !== undefined && !reference) ||
      !(lifecycle?.closed instanceof AbortSignal) ||
      ![lifecycle.plan, lifecycle.permit, lifecycle.stopped].every(
        value => typeof value === 'function',
      )
    )
      return undefined
    const resources = Object.freeze({
      closed: lifecycle.closed,
      plan: lifecycle.plan.bind(lifecycle),
      permit: lifecycle.permit.bind(lifecycle),
      stopped: lifecycle.stopped.bind(lifecycle),
    })
    return Object.freeze({
      scope,
      requirement,
      call,
      resources,
      authorization: request.authorization,
      ...(reference ? { reference } : {}),
    })
  } catch {
    return undefined
  }
}
