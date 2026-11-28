import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, type PointSink, type RenderPointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { toolProtocol, type ToolProtocol } from '@omne-harness/tool-protocol'
import { CallChildrenStore } from './model/call-children.ts'
import { CallOutputStore } from './model/call-output.ts'
import { toolParts } from './parts.ts'
import { CallChildren } from './view/call-children.tsx'
import { CallOutput } from './view/call-output.tsx'
import { CodeCard, type ToolCallSubject } from './view/code-card.tsx'

export const CALL_OUTPUT_ID = 'tool-call-output'
export const CALL_CHILDREN_ID = 'tool-call-children'
/** The tool whose calls in the conversation this module draws. */
export const CODE_TOOL = 'Code'

/** Where the module draws: under a call named by its reference, and on the calls of Code in the conversation. */
export type ToolUiOptions = Readonly<{
  callDetail?: PointSink<{ readonly session: string; readonly call: string }>
  toolCall?: RenderPointSink<ToolCallSubject>
}>

type UiModule = ReturnType<typeof defineUiModule>

export function createToolUiModule(options: ToolUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'tool-ui',
    needs: { tool: needProtocol<ClientOf<ToolProtocol>>(toolProtocol) },
    apply(shell, { tool: client }) {
      for (const part of toolParts) part.declare(shell)
      const store = new CallOutputStore(client)
      const children = new CallChildrenStore(client)
      options.callDetail?.contribute(shell, {
        id: CALL_CHILDREN_ID,
        order: -1,
        render: ({ scope, subject }) =>
          scope === undefined ? null : (
            <CallChildren store={children} tenant={scope} reference={subject.call} />
          ),
      })
      options.toolCall?.put(shell, CODE_TOOL, ({ scope, subject, generic }) =>
        scope === undefined ? (
          generic()
        ) : (
          <CodeCard store={children} tenant={scope} subject={subject} generic={generic} />
        ),
      )
      options.callDetail?.contribute(shell, {
        id: CALL_OUTPUT_ID,
        order: 0,
        render: ({ scope, subject }) =>
          scope === undefined ? null : (
            <CallOutput store={store} tenant={scope} reference={subject.call} />
          ),
      })
    },
  })
}
