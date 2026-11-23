import type { ClientOf } from '@omne-harness/sdk/core'
import { needProtocol, type PointSink } from '@omne-harness/shell-contract'
import { defineUiModule } from '@omne-harness/shell-contract/cordis'
import { toolProtocol, type ToolProtocol } from '@omne-harness/tool-protocol'
import { CallOutputStore } from './model/call-output.ts'
import { toolParts } from './parts.ts'
import { CallOutput } from './view/call-output.tsx'

export const CALL_OUTPUT_ID = 'tool-call-output'

/** Where the output of a call goes: the assembly hands in a point that names a call reference. */
export type ToolUiOptions = Readonly<{
  callDetail?: PointSink<{ readonly session: string; readonly call: string }>
}>

type UiModule = ReturnType<typeof defineUiModule>

export function createToolUiModule(options: ToolUiOptions = {}): UiModule {
  return defineUiModule({
    name: 'tool-ui',
    needs: { tool: needProtocol<ClientOf<ToolProtocol>>(toolProtocol) },
    apply(shell, { tool: client }) {
      for (const part of toolParts) part.declare(shell)
      const store = new CallOutputStore(client)
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
