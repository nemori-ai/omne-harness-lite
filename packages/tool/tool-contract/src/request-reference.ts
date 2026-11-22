import type {
  FixedToolRequest,
  ToolAvailability,
  ToolAvailabilityReference,
  ToolCallFields,
  ToolDefinition,
  ToolInvocation,
  ToolInvokeRequest,
} from './definitions.ts'
import { sameAdoption } from './value-shapes.ts'

function callFieldsOf(request: ToolCallFields): ToolCallFields {
  return {
    command: request.command,
    arguments: request.arguments,
    label: request.label,
    settings: request.settings,
    context: request.context,
    workspace: request.workspace,
    ...(request.directory === undefined ? {} : { directory: request.directory }),
    requesterScope: request.requesterScope,
    resources: request.resources,
    scope: request.scope,
    consumer: request.consumer,
    batchDecision: request.batchDecision,
    mode: request.mode,
    limits: request.limits,
  }
}

export function toolAvailabilityReference(
  availability: ToolAvailability,
): ToolAvailabilityReference {
  const { definition } = availability
  return availability.kind === 'available'
    ? {
        kind: 'available',
        definition: definition.adoption,
        name: definition.name,
        executor: availability.executor,
        layer: availability.layer,
      }
    : {
        kind: 'known-unavailable',
        definition: definition.adoption,
        name: definition.name,
        reason: availability.reason,
      }
}

export function toolInvokeRequestOf(
  request: ToolCallFields & Readonly<{ availability: ToolAvailability }>,
): ToolInvokeRequest {
  return {
    ...callFieldsOf(request),
    availability: toolAvailabilityReference(request.availability),
  }
}

export function fixedRequestReference(
  request: FixedToolRequest,
): ToolInvokeRequest & Readonly<{ invocation: ToolInvocation }> {
  return { ...toolInvokeRequestOf(request), invocation: request.invocation }
}

export function namesDefinition(
  reference: ToolAvailabilityReference,
  definition: ToolDefinition,
): boolean {
  return (
    reference.name === definition.name && sameAdoption(reference.definition, definition.adoption)
  )
}

export function toolAvailabilityOf(
  reference: ToolAvailabilityReference,
  definition: ToolDefinition,
): ToolAvailability {
  return reference.kind === 'available'
    ? {
        kind: 'available',
        definition,
        executor: reference.executor,
        layer: reference.layer,
      }
    : { kind: 'known-unavailable', definition, reason: reference.reason }
}

export function fixToolRequest(
  request: ToolInvokeRequest,
  definition: ToolDefinition,
  invocation: ToolInvocation,
): FixedToolRequest {
  return {
    ...callFieldsOf(request),
    availability: toolAvailabilityOf(request.availability, definition),
    invocation,
  }
}
