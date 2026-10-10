import type { ModelCallCreatedPayload } from '@omne-harness-lite/messages'
import type { OpenCallInput } from './service-types.ts'

export function createModelCallCreationInput(
  request: Pick<
    OpenCallInput,
    'target' | 'parameters' | 'messages' | 'tools' | 'basis' | 'targetChangedBy'
  >,
  sourceVersions: ModelCallCreatedPayload['input']['sourceVersions'],
): ModelCallCreatedPayload['input'] {
  return {
    target: request.target,
    ...(request.parameters === undefined ? {} : { parameters: request.parameters }),
    messages: request.messages,
    tools: request.tools,
    basis: request.basis,
    sourceVersions,
    ...(request.targetChangedBy === undefined ? {} : { targetChangedBy: request.targetChangedBy }),
  }
}
