import { judgeContentBlock } from '@omne-harness/content-block'
import { writeJsonText } from '@omne-harness/json-text'
import { returnSummary } from '@omne-harness/tool-contract'
import { returnGuide } from '@omne-harness/tool-contract/provider'
import type {
  SearchPage,
  ToolFailure,
  ToolResult,
  ToolsExecuteAnswer,
  ToolUsageView,
} from '@omne-harness/tool-contract'
import type { ToolMessageContentBlock } from '@omne-harness/tool-contract/provider'

export function toolsText(text: string): ToolResult<ToolMessageContentBlock> {
  const block = judgeContentBlock({
    kind: 'text',
    id: 'Tools.status',
    visibility: { toHuman: true, toModel: true },
    text,
  })
  if ('rejected' in block || block.ok.kind !== 'text') throw new TypeError('Invalid Tools text')
  return {
    content: [block.ok],
    data: { kind: 'none' },
    original: { kind: 'none' },
    attachments: [],
  }
}
export const toolsFailure = (failure: ToolFailure) =>
  toolsText(
    `ERROR: ${failure.kind}${failure.kind === 'invalid' ? ` (${failure.field}: ${failure.reason})` : ''}`,
  )

export function presentSearch(page: SearchPage): ToolResult<ToolMessageContentBlock> {
  return toolsText(
    JSON.stringify({
      tools: page.entries.map(entry => ({
        name: entry.definition.name,
        description: entry.definition.description,
        resident: entry.resident,
        directCall: entry.resident && entry.kind === 'available',
        programmable: entry.definition.programmable,
        availability: entry.kind,
        commands:
          entry.definition.kind === 'commands'
            ? entry.definition.commands.map(command => ({
                name: command.name,
                summary: command.summary,
                returns: returnSummary(command.returns),
              }))
            : [],
        ...(entry.definition.kind === 'function'
          ? { returns: returnSummary(entry.definition.returns) }
          : {}),
      })),
      next: page.next,
    }),
  )
}

export function presentInspection(view: ToolUsageView): ToolResult<ToolMessageContentBlock> {
  const definition = view.definition
  const overview = {
    name: definition.name,
    description: definition.description,
    programmable: definition.programmable,
    availability: view.kind,
  }
  if (view.usage !== null) {
    const parameters = view.usage.parameters
    return toolsText(
      `${JSON.stringify(overview)}\ncommand: ${view.usage.command ?? 'null'}\n${view.usage.description}\nparameters: ${'schema' in parameters ? writeJsonText(parameters.schema) : parameters.usage}\n${returnGuide(view.usage.returns)}`,
    )
  }
  return toolsText(
    JSON.stringify({
      ...overview,
      commands:
        definition.kind === 'commands'
          ? definition.commands.map(command => ({
              name: command.name,
              summary: command.summary,
              returns: returnSummary(command.returns),
            }))
          : [],
      next: 'Inspect one command for its parameter and return schemas.',
    }),
  )
}

export function presentExecution(answer: ToolsExecuteAnswer): ToolResult<ToolMessageContentBlock> {
  switch (answer.kind) {
    case 'completed':
      return answer.value
    case 'rejected':
      return toolsFailure(answer.failure)
    case 'association-unknown':
      return toolsText(
        JSON.stringify({
          state: answer.kind,
          parent: answer.parent,
          next: {
            command: 'read_result',
            params: { kind: 'forwarding', reference: answer.parent, after: null },
          },
          note: 'The original target association is not confirmed. Recover this slot; do not execute a replacement.',
        }),
      )
    case 'pending':
      return toolsText(
        JSON.stringify({
          state: 'pending',
          reason: answer.reason,
          reference: answer.reference,
          parent: answer.parent,
          next: {
            command: 'read_result',
            params: {
              kind: answer.reason === 'commit-unknown' ? 'forwarding' : 'invocation',
              reference: answer.reason === 'commit-unknown' ? answer.parent : answer.reference,
              after: null,
            },
          },
          note: 'This is not target completion. Ending observation does not stop the target.',
        }),
      )
  }
}
